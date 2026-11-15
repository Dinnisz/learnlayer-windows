// A `PageText` from pdf.js's text content (`page.getTextContent()`), the Windows stand-in for PDFKit's
// `PDFPage.string` and character bounds. Typed by shape, so `core/` does not depend on pdf.js itself.

import { sansAdvance, type PageText, type Rect } from "./page";

/** pdf.js `TextItem`: a run of text in one font, `transform` in PDF user space (y up). */
export interface TextRun {
  str: string;
  transform: readonly number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

/** Items of `getTextContent().items`; marked-content entries (no `str`) are skipped. */
export type TextContentItem = TextRun | { type: string };

const isRun = (item: TextContentItem): item is TextRun => typeof (item as TextRun).str === "string";

/**
 * The page's text as PDFKit would read it: runs in stream order, a line break where a run ends its line or the
 * baseline moves, a space where a gap opens on the same line. Each character's box shares its run's width by an
 * estimate of its advance; the box spans 1.2 font sizes from a little under the baseline, as PDFKit's do.
 */
export function pageTextFromRuns(
  items: readonly TextContentItem[],
  view: { index: number; mediaBox: Rect; page: (index: number) => PageText | null },
): PageText {
  let text = "";
  const boxes: (Rect | null)[] = [];
  let last: { baseline: number; end: number; size: number } | null = null;
  let brokeLine = true;
  const lineBreak = () => {
    if (text === "" || brokeLine) return;
    text += "\n";
    boxes.push(null);
    brokeLine = true;
  };
  for (const item of items) {
    if (!isRun(item)) continue;
    const [a = 1, b = 0, , d = 1, x = 0, baseline = 0] = item.transform;
    const size = Math.hypot(a, b) || Math.abs(d) || item.height || 10;
    const characters = Array.from(item.str);
    if (characters.length > 0 && item.str.trim() !== "") {
      if (last && Math.abs(baseline - last.baseline) > size * 0.5) lineBreak();
      else if (last && !brokeLine && x - last.end > size * 0.15 && !text.endsWith(" ") && !item.str.startsWith(" ")) {
        text += " ";
        boxes.push({ x: last.end, y: baseline - size * 0.24, width: x - last.end, height: size * 1.2 });
      }
      const estimates = characters.map(sansAdvance);
      const total = estimates.reduce((sum, value) => sum + value, 0) || 1;
      const width = item.width > 0 ? item.width : total * size;
      let cursor = x;
      characters.forEach((character, offset) => {
        const advance = (estimates[offset]! / total) * width;
        text += character;
        boxes.push({ x: cursor, y: baseline - size * 0.24, width: advance, height: size * 1.2 });
        if (character.length === 2) boxes.push(null);
        cursor += advance;
      });
      brokeLine = false;
      last = { baseline, end: x + width, size };
    }
    if (item.hasEOL) lineBreak();
  }
  if (text.endsWith("\n")) {
    text = text.slice(0, -1);
    boxes.pop();
  }
  return { index: view.index, mediaBox: view.mediaBox, text, boxes, page: view.page };
}
