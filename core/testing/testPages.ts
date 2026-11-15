// Test pages: the CoreText pages the Mac's tests draw, and real PDFs read with pdf.js under Node.

import { readFileSync } from "node:fs";
import { framedPage, pageFromLines, sansAdvance, type PageText } from "../pdf/page";
import { pageTextFromRuns, type TextContentItem } from "../pdf/pdfjsText";

/** `QuestionDetectorTests.page(_:)`: text in a frame at x 72, 72…792, 451 wide, system font 14, line spacing 6. */
export function framedTestPage(text: string): PageText {
  return pageFromLines(framedPage(text.trim(), { x: 72, top: 792, width: 451 }, 14, 6));
}

/** `QuestionDetectorTests.twoColumnPage`: two frames at x 40 and 320, 235 wide, font 11, line spacing 8. */
export function twoColumnTestPage(left: string, right: string): PageText {
  return pageFromLines([
    ...framedPage(left, { x: 40, top: 772, width: 235 }, 11, 8),
    ...framedPage(right, { x: 320, top: 772, width: 235 }, 11, 8),
  ]);
}

/** Single lines drawn at a baseline, in the order given (as `CTLineDraw` calls). */
export function drawnTestPage(lines: readonly { text: string; x: number; y: number }[], fontSize = 14): PageText {
  return pageFromLines(
    lines.map((line) => ({ text: line.text, x: line.x, baseline: line.y, fontSize, advance: sansAdvance })),
  );
}

/** Every page of a PDF on disk, read with pdf.js's Node build. */
export async function pdfPages(path: string): Promise<PageText[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(path));
  const task = pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  const document = await task.promise;
  const pages: PageText[] = [];
  for (let index = 0; index < document.numPages; index += 1) {
    const page = await document.getPage(index + 1);
    const [x0 = 0, y0 = 0, x1 = 595, y1 = 842] = page.view;
    const content = await page.getTextContent();
    pages.push(
      pageTextFromRuns(content.items as TextContentItem[], {
        index,
        mediaBox: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
        page: (other) => pages[other] ?? null,
      }),
    );
  }
  await task.destroy();
  return pages;
}
