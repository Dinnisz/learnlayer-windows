// A PDF open in the reader: pdf.js for drawing, and each page's text as the pure `PageText` the question detector
// reads (the Windows stand-in for PDFKit's PDFDocument). The file never leaves the computer (CLAUDE.md, rule 12).

import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import type { PageText, Rect } from "@core/pdf/page";
import { pageTextFromRuns, type TextContentItem } from "@core/pdf/pdfjsText";
import { PageImage } from "@core/pdf/pageImage";
import { questionsOn, type ExamQuestion } from "@core/problems/questionDetector";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PageSize {
  /** The page's media box in PDF points. */
  mediaBox: Rect;
}

export class ReaderDocument {
  readonly pageCount: number;
  /** Each page's media box, known before any page is drawn so the layout never jumps. */
  readonly sizes: PageSize[];
  private readonly texts: (PageText | undefined)[];
  private readonly pending = new Map<number, Promise<PageText>>();
  private readonly proxies = new Map<number, Promise<PDFPageProxy>>();
  private destroyed = false;

  private constructor(
    private readonly task: PDFDocumentLoadingTask,
    private readonly document: PDFDocumentProxy,
    readonly name: string,
    sizes: PageSize[],
  ) {
    this.pageCount = document.numPages;
    this.sizes = sizes;
    this.texts = new Array<PageText | undefined>(this.pageCount);
  }

  /** Opens `data` (the bytes of a PDF). Throws when it isn't one. */
  static async open(data: ArrayBuffer, name: string): Promise<ReaderDocument> {
    const task = pdfjs.getDocument({ data: new Uint8Array(data) });
    const document = await task.promise;
    const sizes: PageSize[] = [];
    for (let index = 0; index < document.numPages; index += 1) {
      const page = await document.getPage(index + 1);
      const [x0 = 0, y0 = 0, x1 = 595, y1 = 842] = page.view;
      sizes.push({ mediaBox: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } });
    }
    const opened = new ReaderDocument(task, document, name, sizes);
    // Read every page's text in the background, in order: a question at the top of a page needs the page before.
    void opened.readAll();
    return opened;
  }

  private page(index: number): Promise<PDFPageProxy> {
    let proxy = this.proxies.get(index);
    if (!proxy) {
      proxy = this.document.getPage(index + 1);
      this.proxies.set(index, proxy);
    }
    return proxy;
  }

  private async readAll(): Promise<void> {
    for (let index = 0; index < this.pageCount && !this.destroyed; index += 1) {
      try {
        await this.text(index);
      } catch {
        return;
      }
    }
  }

  /** The page's text, once read; null while it is still being read. */
  textIfRead(index: number): PageText | null {
    return this.texts[index] ?? null;
  }

  /** The page's text (and so that of every page before it, which a question at its top may continue). */
  text(index: number): Promise<PageText> {
    const read = this.texts[index];
    if (read) return Promise.resolve(read);
    let pending = this.pending.get(index);
    if (!pending) {
      pending = (async () => {
        if (index > 0) await this.text(index - 1);
        const page = await this.page(index);
        const content = await page.getTextContent();
        const text = pageTextFromRuns(content.items as TextContentItem[], {
          index,
          mediaBox: this.sizes[index]!.mediaBox,
          page: (other) => this.texts[other] ?? null,
          pageCount: () => this.pageCount,
        });
        this.texts[index] = text;
        return text;
      })();
      this.pending.set(index, pending);
    }
    return pending;
  }

  /** The questions printed on a page, once its text (and the text before it) is read. */
  async questions(index: number): Promise<ExamQuestion[]> {
    return questionsOn(await this.text(index));
  }

  /** Draws the page into `canvas` at `scale` CSS pixels per point and `pixelRatio` device pixels per CSS pixel. */
  async render(index: number, canvas: HTMLCanvasElement, scale: number, pixelRatio: number): Promise<RenderTask> {
    const page = await this.page(index);
    const viewport = page.getViewport({ scale: scale * pixelRatio });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    // A hidden window gets no animation frames, which pdf.js waits for between steps; the print intent does not.
    return page.render({ canvas, viewport, intent: hiddenIntent() });
  }

  /** A JPEG (base64, no prefix) of part of a page, as `PageImage.jpeg` makes it: page-wide, at most `maxPixels` on a side. */
  async jpeg(index: number, rect: Rect, maxPixels = 1600): Promise<string | null> {
    const crop = PageImage.crop(rect, this.sizes[index]!.mediaBox, maxPixels);
    if (!crop || crop.width < 1 || crop.height < 1) return null;
    const page = await this.page(index);
    const media = this.sizes[index]!.mediaBox;
    const viewport = page.getViewport({ scale: crop.scale });
    const canvas = document.createElement("canvas");
    canvas.width = crop.width;
    canvas.height = crop.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Shift the page so the crop's top-left corner is the canvas's: the page's top is y = media.maxY.
    const offsetX = (crop.region.x - media.x) * crop.scale;
    const offsetY = (media.y + media.height - (crop.region.y + crop.region.height)) * crop.scale;
    await page.render({
      canvas,
      canvasContext: context,
      viewport,
      intent: "print",
      transform: [1, 0, 0, 1, -offsetX, -offsetY],
    }).promise;
    return canvas.toDataURL("image/jpeg", PageImage.quality).replace(/^data:image\/jpeg;base64,/, "");
  }

  destroy(): void {
    this.destroyed = true;
    void this.task.destroy();
  }
}

const hiddenIntent = () => (window.document.visibilityState === "hidden" ? "print" : "display");

/** Where a PDF point is on the drawn page (CSS pixels from the page's top-left), and back. */
export const PageGeometry = {
  toScreen(point: { x: number; y: number }, mediaBox: Rect, scale: number): { x: number; y: number } {
    return { x: (point.x - mediaBox.x) * scale, y: (mediaBox.y + mediaBox.height - point.y) * scale };
  },

  toPage(point: { x: number; y: number }, mediaBox: Rect, scale: number): { x: number; y: number } {
    return { x: mediaBox.x + point.x / scale, y: mediaBox.y + mediaBox.height - point.y / scale };
  },

  /** A PDF rectangle (y up) as a CSS box on the drawn page. */
  rectToScreen(
    rect: Rect,
    mediaBox: Rect,
    scale: number,
  ): { left: number; top: number; width: number; height: number } {
    return {
      left: (rect.x - mediaBox.x) * scale,
      top: (mediaBox.y + mediaBox.height - (rect.y + rect.height)) * scale,
      width: rect.width * scale,
      height: rect.height * scale,
    };
  },
};
