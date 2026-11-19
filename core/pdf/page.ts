// What the question reading needs of a PDF page, without PDFKit or pdf.js: its text as one string (lines joined by
// "\n", as `PDFPage.string`), where each character is printed, and the page's size. The reader (pdf.js) fills it in
// the app and in tests; tests that the Mac wrote with CoreText pages build it from lines (`pageFromLines`).
//
// Coordinates are PDF points with y up, as PDFKit's.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageText {
  /** The page's index in its document. */
  index: number;
  mediaBox: Rect;
  /** The text layer, lines joined by "\n". */
  text: string;
  /** Where each UTF-16 unit of `text` is printed; null for a line break (and the second half of a pair). */
  boxes: readonly (Rect | null)[];
  /** The other pages of the document, by index (for a group whose statement is on the page before). */
  page(index: number): PageText | null;
  /** How many pages the document has. */
  pageCount(): number;
}

export const Rects = {
  minX: (r: Rect) => r.x,
  maxX: (r: Rect) => r.x + r.width,
  minY: (r: Rect) => r.y,
  maxY: (r: Rect) => r.y + r.height,
  midX: (r: Rect) => r.x + r.width / 2,
  midY: (r: Rect) => r.y + r.height / 2,

  union(a: Rect | null, b: Rect | null): Rect | null {
    if (!a) return b;
    if (!b) return a;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return {
      x,
      y,
      width: Math.max(a.x + a.width, b.x + b.width) - x,
      height: Math.max(a.y + a.height, b.y + b.height) - y,
    };
  },

  /** `insetBy(dx:dy:)`: negative values grow the rectangle. */
  inset(r: Rect, dx: number, dy: number): Rect {
    return { x: r.x + dx, y: r.y + dy, width: r.width - 2 * dx, height: r.height - 2 * dy };
  },

  intersection(a: Rect, b: Rect): Rect | null {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const maxX = Math.min(a.x + a.width, b.x + b.width);
    const maxY = Math.min(a.y + a.height, b.y + b.height);
    if (maxX < x || maxY < y) return null;
    return { x, y, width: maxX - x, height: maxY - y };
  },

  contains(r: Rect, point: { x: number; y: number }): boolean {
    return point.x >= r.x && point.x < r.x + r.width && point.y >= r.y && point.y < r.y + r.height;
  },

  isEmpty(r: Rect): boolean {
    return r.width <= 0 || r.height <= 0;
  },
};

const isLineBreak = (unit: string) => unit === "\n" || unit === "\r";

/** `page.selection(for: range)?.bounds(for: page)`: the printed characters of `text[start, start + length)`, or null. */
export function selectionBounds(page: PageText, start: number, length: number): Rect | null {
  let bounds: Rect | null = null;
  const end = Math.min(page.text.length, start + length);
  for (let index = Math.max(0, start); index < end; index += 1) bounds = Rects.union(bounds, page.boxes[index] ?? null);
  return bounds;
}

/** Each printed character's middle, sorted by y, so a rectangle finds its characters without reading the page. */
interface CentreIndex {
  ys: Float64Array;
  xs: Float64Array;
  indices: Int32Array;
}

const centreIndexes = new WeakMap<PageText, CentreIndex>();

function centreIndex(page: PageText): CentreIndex {
  const cached = centreIndexes.get(page);
  if (cached) return cached;
  const entries: { x: number; y: number; index: number }[] = [];
  for (let index = 0; index < page.text.length; index += 1) {
    const box = page.boxes[index];
    if (box && !isLineBreak(page.text[index]!)) entries.push({ x: Rects.midX(box), y: Rects.midY(box), index });
  }
  entries.sort((a, b) => a.y - b.y);
  const built = {
    ys: Float64Array.from(entries, (entry) => entry.y),
    xs: Float64Array.from(entries, (entry) => entry.x),
    indices: Int32Array.from(entries, (entry) => entry.index),
  };
  centreIndexes.set(page, built);
  return built;
}

/** The characters printed inside `rect` (their middle in it), in text order, with the line breaks between them. */
export function selectionIn(
  page: PageText,
  rect: Rect,
): { text: string; bounds: Rect; start: number; end: number } | null {
  const { ys, xs, indices } = centreIndex(page);
  let low = 0;
  let high = ys.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (ys[middle]! < rect.y) low = middle + 1;
    else high = middle;
  }
  const inside: number[] = [];
  const top = rect.y + rect.height;
  for (let position = low; position < ys.length && ys[position]! < top; position += 1) {
    const x = xs[position]!;
    if (x >= rect.x && x < rect.x + rect.width) inside.push(indices[position]!);
  }
  if (inside.length === 0) return null;
  inside.sort((a, b) => a - b);
  let text = "";
  let bounds: Rect | null = null;
  let previous = -1;
  for (const index of inside) {
    // A line break in the text between two chosen characters is kept, as PDFKit's selection string does.
    if (
      previous >= 0 &&
      page.text
        .slice(previous + 1, index)
        .split("")
        .some(isLineBreak)
    )
      text += "\n";
    text += page.text[index]!;
    bounds = Rects.union(bounds, page.boxes[index] ?? null);
    previous = index;
  }
  return { text, bounds: bounds!, start: inside[0]!, end: inside[inside.length - 1]! + 1 };
}

/** `selectionsByLine()` of a range: each line's text and bounds (lines with no printed character are left out). */
export function linesOf(page: PageText, start: number, length: number): { text: string; bounds: Rect }[] {
  const lines: { text: string; bounds: Rect }[] = [];
  let text = "";
  let bounds: Rect | null = null;
  const flush = () => {
    if (bounds) lines.push({ text, bounds });
    text = "";
    bounds = null;
  };
  const end = Math.min(page.text.length, start + length);
  for (let index = Math.max(0, start); index < end; index += 1) {
    const unit = page.text[index]!;
    if (isLineBreak(unit)) {
      flush();
      continue;
    }
    text += unit;
    bounds = Rects.union(bounds, page.boxes[index] ?? null);
  }
  flush();
  return lines;
}

/** `NSString.lineRange(for:)`: the line around `location`, its line break included. */
export function lineRange(text: string, location: number): { start: number; end: number } {
  let start = location;
  while (start > 0 && !isLineBreak(text[start - 1]!)) start -= 1;
  let end = location;
  while (end < text.length && !isLineBreak(text[end]!)) end += 1;
  if (end < text.length) end += text[end] === "\r" && text[end + 1] === "\n" ? 2 : 1;
  return { start, end };
}

/** A line of text as printed: where its baseline starts, its size, and each character's advance. */
export interface PrintedLine {
  text: string;
  x: number;
  /** The baseline, in points from the page's bottom. */
  baseline: number;
  fontSize: number;
  /** Advance of each character in em; a fixed share (0.5 em) when not given. */
  advance?: (character: string) => number;
}

/** Character widths of a proportional sans-serif in em: close enough for layout, as the Mac's system font. */
export function sansAdvance(character: string): number {
  if (character === " ") return 0.28;
  if ("iljtf.,;:!'|".includes(character)) return 0.3;
  if ("mwMW".includes(character)) return 0.85;
  if (/[A-Z0-9]/.test(character)) return 0.64;
  return 0.54;
}

/**
 * A page from printed lines, in the order the text layer stores them. Each character gets a box from its advance;
 * the box spans the font's ascent and descent around the baseline.
 */
export function pageFromLines(
  lines: readonly PrintedLine[],
  options: { index?: number; mediaBox?: Rect; pages?: () => PageText[] } = {},
): PageText {
  let text = "";
  const boxes: (Rect | null)[] = [];
  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) {
      text += "\n";
      boxes.push(null);
    }
    const advance = line.advance ?? (() => 0.5);
    let x = line.x;
    for (const character of line.text) {
      const width = advance(character) * line.fontSize;
      const box = { x, y: line.baseline - line.fontSize * 0.24, width, height: line.fontSize * 1.2 };
      text += character;
      boxes.push(box);
      if (character.length === 2) boxes.push(null);
      x += width;
    }
  });
  const index = options.index ?? 0;
  const page: PageText = {
    index,
    mediaBox: options.mediaBox ?? { x: 0, y: 0, width: 595, height: 842 },
    text,
    boxes,
    page: (other) => (other === index ? page : (options.pages?.()[other] ?? null)),
    pageCount: () => options.pages?.().length ?? 1,
  };
  return page;
}

/**
 * A page as the Mac's tests draw one with CoreText: `text` set in a frame (x, top, width) at `fontSize` with
 * `lineSpacing` points between lines, words wrapped to the frame's width.
 */
export function framedPage(
  text: string,
  frame: { x: number; top: number; width: number },
  fontSize: number,
  lineSpacing: number,
): PrintedLine[] {
  const lines: PrintedLine[] = [];
  const lineHeight = fontSize * 1.2 + lineSpacing;
  let baseline = frame.top - fontSize;
  const widthOf = (piece: string) =>
    Array.from(piece).reduce((sum, character) => sum + sansAdvance(character) * fontSize, 0);
  for (const paragraph of text.split("\n")) {
    let current = "";
    for (const word of paragraph.split(" ")) {
      const candidate = current === "" ? word : current + " " + word;
      if (current !== "" && widthOf(candidate) > frame.width) {
        lines.push({ text: current, x: frame.x, baseline, fontSize, advance: sansAdvance });
        baseline -= lineHeight;
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push({ text: current, x: frame.x, baseline, fontSize, advance: sansAdvance });
    baseline -= lineHeight;
  }
  return lines;
}

/**
 * Port of `Equation.bodyFontSize(of:in:)`: the font size most letters in `bounds` are printed at, to the half point
 * (sizes outside 5–40 pt are ignored); 11 when nothing is printed there. A box is `size × 1.2` tall
 * (`pdfjsText`), so its size is its height over 1.2.
 */
export function bodyFontSize(page: Pick<PageText, "text" | "boxes">, bounds: Rect): number {
  const letters = new Map<number, number>();
  for (let index = 0; index < page.boxes.length; index += 1) {
    const box = page.boxes[index];
    if (!box || /\s/.test(page.text[index] ?? " ")) continue;
    if (!Rects.contains(bounds, { x: Rects.midX(box), y: Rects.midY(box) })) continue;
    const size = box.height / 1.2;
    if (size < 5 || size > 40) continue;
    const key = Math.round(size * 2);
    letters.set(key, (letters.get(key) ?? 0) + 1);
  }
  let best: number | null = null;
  let most = 0;
  for (const [key, count] of letters) {
    if (count > most) {
      best = key;
      most = count;
    }
  }
  return best === null ? 11 : best / 2;
}
