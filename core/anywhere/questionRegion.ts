// Port of LearnLayer/Anywhere/QuestionRegion.swift @ ref 2026-11-04.
//
// Where a question sits in its window, found from a picture of that window: free, local, nothing sent. Its numbering
// ("3.", "Questão 2") bounds it above and below; blank space bounds it when there is none; ink that isn't text (a
// circuit, a graph, a table's rules) is its figure.
//
// The Mac reads the picture's lines with Vision inside `locate`; here the caller passes them (Windows.Media.Ocr on the
// native side), and the picture comes as grey levels at the window's size in points. What the Mac returns as a JPEG
// is returned as the crops to stack (`stackedPicture` lays them out; the interface draws and encodes them).

import { Rects, type Rect } from "../pdf/page";
import { characterCount, QuestionBand, type BandLine } from "./questionBand";

/** A line of text read from the picture, in window points (top-left origin), or global points in a result. */
export interface LocatorLine {
  text: string;
  rect: Rect;
}

export interface QuestionRegion {
  /** Global points, top-left origin. */
  frame: Rect;
  /** The label it starts with ("3.", "Questão 2"), when it has one. */
  label: string | null;
  /** The numbered part tapped ("2.1") when the question has parts. */
  part: string | null;
  /** Where the picture is shown when it stacks a part under its statement (null when it is the region's). */
  displayFrame: Rect | null;
  /** A figure, a graph or a table is drawn in it. */
  hasFigure: boolean;
  /** Its text as read from the picture, line by line. */
  text: string;
  /** The pieces of the window (window points) the picture is made of, top to bottom: `stackedPicture` lays them out. */
  crops: Rect[];
  /** Where its figures are in the picture, as shares of its width and height (top-left origin). */
  figureBoxes: Rect[];
  /** The text lines inside the region, in global points: fixed points to find the same lines in the PDF. */
  lines: LocatorLine[];
}

const { minX, maxX, minY, maxY, midX, midY } = Rects;

/** `CGRect.intersects`: they share some area. */
export const intersects = (a: Rect, b: Rect) =>
  Math.min(maxX(a), maxX(b)) > Math.max(minX(a), minX(b)) && Math.min(maxY(a), maxY(b)) > Math.max(minY(a), minY(b));

const offset = (r: Rect, dx: number, dy: number): Rect => ({ ...r, x: r.x + dx, y: r.y + dy });
const union = (a: Rect, b: Rect): Rect => Rects.union(a, b)!;

/** A picture in grey, one value per point. */
export interface GreyImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

/**
 * A picture's pixels (RGBA or BGRA, 4 bytes each) in grey at `width` × `height` points, each point the average of the
 * pixels it covers: a picture taken at 150 % is read at the size the page is laid out in, as the Mac reads points.
 */
export function greyImage(
  data: Uint8Array | Uint8ClampedArray,
  pixelWidth: number,
  pixelHeight: number,
  width: number,
  height: number,
): GreyImage {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const pixels = new Uint8Array(w * h);
  const sx = pixelWidth / w;
  const sy = pixelHeight / h;
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.min(pixelHeight, Math.floor((y + 1) * sy)));
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.min(pixelWidth, Math.floor((x + 1) * sx)));
      let sum = 0;
      let count = 0;
      for (let py = y0; py < y1; py += 1) {
        for (let px = x0; px < x1; px += 1) {
          const at = (py * pixelWidth + px) * 4;
          // Luma; red and blue weigh alike enough that RGBA and BGRA read the same.
          sum += 0.299 * data[at]! + 0.587 * data[at + 1]! + 0.114 * data[at + 2]!;
          count += 1;
        }
      }
      pixels[y * w + x] = Math.round(sum / count);
    }
  }
  return { width: w, height: h, pixels };
}

/** Which points of the picture are ink: anything clearly unlike the page's background, dark or light mode. */
export class InkMap {
  readonly width: number;
  readonly height: number;
  private readonly pixels: Uint8Array;
  private readonly background: number;

  /**
   * `around`: the page's background is read from the columns near that x, not the whole window: a dark canvas
   * around a white page would otherwise be the background, and the whole page "ink".
   */
  constructor(image: GreyImage, around: number | null = null) {
    this.width = image.width;
    this.height = image.height;
    this.pixels = image.pixels;
    // The background is the commonest grey.
    const counts = new Array<number>(256).fill(0);
    const from = around === null ? 0 : Math.max(0, Math.floor(around) - 120);
    const to = around === null ? this.width - 1 : Math.min(this.width - 1, Math.floor(around) + 120);
    for (let row = 0; row < this.height; row += 1) {
      for (let column = from; column <= to; column += 3) counts[this.pixels[row * this.width + column]!] += 1;
    }
    let background = 255;
    let best = -1;
    counts.forEach((count, grey) => {
      if (count > best) {
        best = count;
        background = grey;
      }
    });
    this.background = background;
  }

  static of(image: GreyImage, around: number | null = null): InkMap | null {
    return image.width > 0 && image.height > 0 ? new InkMap(image, around) : null;
  }

  isInk(x: number, y: number): boolean {
    return Math.abs(this.pixels[y * this.width + x]! - this.background) > 40;
  }

  private rowHasInk(y: number, x: [number, number]): boolean {
    const from = Math.max(0, Math.floor(x[0]));
    const to = Math.min(this.width - 1, Math.floor(x[1]));
    if (from >= to) return false;
    for (let column = from; column <= to; column += 1) if (this.isInk(column, y)) return true;
    return false;
  }

  /** The page's left and right edges around `x`: the nearest column on each side that is ink over nearly the whole
   * window's height (the canvas around a page, a scroll bar, a rule). */
  pageEdges(x: number): { left: number | null; right: number | null } {
    const start = Math.min(this.width - 1, Math.max(0, Math.floor(x)));
    const isEdge = (column: number) => {
      let inked = 0;
      let total = 0;
      for (let row = 0; row < this.height; row += 3) {
        total += 1;
        if (this.isInk(column, row)) inked += 1;
      }
      return total > 0 && inked / total >= 0.9;
    };
    let right: number | null = null;
    for (let column = start; column < this.width; column += 1) {
      if (isEdge(column)) {
        right = column - 1;
        break;
      }
    }
    let left: number | null = null;
    for (let column = start; column >= 0; column -= 1) {
      if (isEdge(column)) {
        left = column + 1;
        break;
      }
    }
    return { left, right };
  }

  /** Walks up from `y` through ink until a blank strip `gap` high. */
  blockTop(y: number, gap: number, x: [number, number]): number {
    let row = Math.min(this.height - 1, Math.max(0, Math.floor(y)));
    let blank = 0;
    while (row > 0) {
      if (this.rowHasInk(row, x)) blank = 0;
      else blank += 1;
      if (blank >= gap) return row + blank;
      row -= 1;
    }
    return 0;
  }

  /** Walks down from `y` through ink until a blank strip `gap` high. */
  blockBottom(y: number, gap: number, x: [number, number]): number {
    let row = Math.min(this.height - 1, Math.max(0, Math.floor(y)));
    let blank = 0;
    while (row < this.height - 1) {
      if (this.rowHasInk(row, x)) blank = 0;
      else blank += 1;
      if (blank >= gap) return row - blank + 1;
      row += 1;
    }
    return this.height;
  }

  private clip(rect: Rect): Rect | null {
    if (rect.width <= 0 || rect.height <= 0) return null;
    return Rects.intersection(rect, { x: 0, y: 0, width: this.width, height: this.height });
  }

  /** The smallest rectangle around the ink in `rect`. */
  inkBounds(rect: Rect): Rect | null {
    const area = this.clip(rect);
    if (!area || area.width < 1 || area.height < 1) return null;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let y = Math.floor(minY(area)); y < Math.floor(maxY(area)); y += 2) {
      for (let x = Math.floor(minX(area)); x < Math.floor(maxX(area)); x += 1) {
        if (!this.isInk(x, y)) continue;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
    if (x0 > x1) return null;
    return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 2 };
  }

  /** Blocks of ink in `rect` that aren't text: on a grid of 4-point cells, the connected ink outside `excluding`,
   * kept when it is figure-sized. */
  figures(rect: Rect, excluding: readonly Rect[]): Rect[] {
    const area = this.clip(rect);
    if (!area || area.width < 8 || area.height < 8) return [];
    const cell = 4;
    const columns = Math.floor(area.width / cell);
    const rows = Math.floor(area.height / cell);
    if (columns <= 0 || rows <= 0) return [];
    const originX = Math.floor(minX(area));
    const originY = Math.floor(minY(area));
    const nearbyText = excluding.filter((text) => intersects(text, area));
    const inked = new Array<boolean>(columns * rows).fill(false);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x0 = originX + column * cell;
        const y0 = originY + row * cell;
        const box = { x: x0, y: y0, width: cell, height: cell };
        if (nearbyText.some((text) => intersects(text, box))) continue;
        search: for (let y = y0; y < y0 + cell; y += 1) {
          for (let x = x0; x < x0 + cell; x += 1) {
            if (x < this.width && y < this.height && this.isInk(x, y)) {
              inked[row * columns + column] = true;
              break search;
            }
          }
        }
      }
    }
    // Connected cells (with diagonals), kept when at least ~40 × 28 points and not a lone rule.
    const seen = new Array<boolean>(inked.length).fill(false);
    const found: Rect[] = [];
    for (let startIndex = 0; startIndex < inked.length; startIndex += 1) {
      if (!inked[startIndex] || seen[startIndex]) continue;
      const stack = [startIndex];
      let count = 0;
      let c0 = Infinity;
      let c1 = -Infinity;
      let r0 = Infinity;
      let r1 = -Infinity;
      seen[startIndex] = true;
      while (stack.length > 0) {
        const index = stack.pop()!;
        count += 1;
        const r = Math.floor(index / columns);
        const c = index % columns;
        c0 = Math.min(c0, c);
        c1 = Math.max(c1, c);
        r0 = Math.min(r0, r);
        r1 = Math.max(r1, r);
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= columns) continue;
            const next = nr * columns + nc;
            if (inked[next] && !seen[next]) {
              seen[next] = true;
              stack.push(next);
            }
          }
        }
      }
      const w = (c1 - c0 + 1) * cell;
      const h = (r1 - r0 + 1) * cell;
      if (w >= 40 && h >= 28 && count >= 12) {
        found.push({ x: originX + c0 * cell, y: originY + r0 * cell, width: w, height: h });
      }
    }
    return found;
  }
}

/** Lines on the same row joined, rows top to bottom. */
const readingOrder = (lines: readonly LocatorLine[], lineHeight: number) =>
  QuestionBand.readingOrder(lines as readonly BandLine[], lineHeight);

export const QuestionLocator = {
  /**
   * The question around `point` in `image`, a picture of the window at `window` (global points).
   * - lines: the text the picture shows, in window points (read on the computer).
   * - known: where UI Automation found the question, if it did.
   * - wantsFigure: its text talks about a figure: look above it too.
   */
  locate(options: {
    image: GreyImage;
    window: Rect;
    point: { x: number; y: number };
    lines: readonly LocatorLine[];
    known?: Rect | null;
    wantsFigure?: boolean;
  }): QuestionRegion | null {
    const { image, window, lines } = options;
    const size = { width: window.width, height: window.height };
    const p = { x: options.point.x - window.x, y: options.point.y - window.y };
    if (size.width <= 40 || size.height <= 40) return null;
    const ink = InkMap.of(image, p.x);
    if (!ink) return null;
    const bounds = { x: 0, y: 0, width: size.width, height: size.height };
    const knownClipped = options.known ? Rects.intersection(offset(options.known, -window.x, -window.y), bounds) : null;
    const knownLocal = knownClipped && !Rects.isEmpty(knownClipped) ? knownClipped : null;

    const heights = lines.map((line) => line.rect.height).sort((a, b) => a - b);
    const lineHeight = heights.length === 0 ? 16 : Math.max(8, heights[Math.floor(heights.length / 2)]!);

    // The question's lines: from its label to the next question's or a new section, in its column; never the
    // exam's header or the footer.
    const band = QuestionBand.select(lines, p);
    // Above the first of several numbered questions is the exam's header: not a question.
    if (band === null) {
      const labelled = lines.filter((line) => QuestionBand.label(line.text) !== null);
      if (labelled.length >= 2 && labelled.every((line) => minY(line.rect) > p.y)) return null;
    }

    // The column's left edge: where the lines near the point start.
    const near = lines.filter((line) => minX(line.rect) <= p.x && Math.abs(midY(line.rect) - p.y) < 500);
    // The page's own edges: the window around it is ink to the map, and a crop that reaches it would make the
    // whole crop one "figure".
    const edges = ink.pageEdges(p.x);
    const nearLeftEdge = near.length ? Math.min(...near.map((line) => minX(line.rect))) : null;
    const left = Math.max(
      edges.left ?? 0,
      band ? Math.max(0, band.columnLeft) : Math.max(0, nearLeftEdge ?? (knownLocal ? minX(knownLocal) : p.x - 200)),
    );
    // Past the scroll bar, or the next column; never left of the column's own start.
    const pageRight = Math.max(
      left + 40,
      Math.min(size.width - 14, band?.columnRight ?? Infinity, edges.right ?? Infinity),
    );
    const span: [number, number] = [left, pageRight];

    // A footer (page number) is never part of it. Only a line with no text under it is one: a number alone higher up
    // is a fraction's denominator ("π/6" read as "6") or a table's cell (a Windows reading; see DECISOES).
    const footerLines = lines.filter(
      (line) =>
        QuestionBand.isFooter(line.text) &&
        minY(line.rect) > p.y &&
        !lines.some((other) => !QuestionBand.isFooter(other.text) && minY(other.rect) > maxY(line.rect) + lineHeight),
    );
    const footerTop =
      band?.footer ?? (footerLines.length ? Math.min(...footerLines.map((line) => minY(line.rect))) : null);

    const start = band ? lines.find((line) => minY(line.rect) === band.top) : undefined;
    let top = band
      ? band.top - lineHeight * 0.4
      : ink.blockTop(Math.min(p.y, knownLocal ? minY(knownLocal) : p.y), 2.5 * lineHeight, span);

    let bottom: number;
    if (band?.end !== null && band?.end !== undefined) {
      bottom = band.end - lineHeight * 0.3;
    } else {
      const from = Math.max(p.y, knownLocal ? maxY(knownLocal) : p.y);
      // The last question of a page runs to its last ink: a wide gap (a figure's rows) does not end it.
      bottom = ink.blockBottom(from, (band === null ? 2.5 : 6) * lineHeight, span);
    }
    if (footerTop !== null && footerTop > p.y) bottom = Math.min(bottom, footerTop - lineHeight * 0.3);
    bottom = Math.max(bottom, Math.min(size.height, p.y + lineHeight));
    top = Math.max(0, Math.min(top, p.y - lineHeight));

    const textRects = lines.map((line) => Rects.inset(line.rect, -2, -lineHeight * 0.25));

    // A span that is most of the page or a sliver: look at the text's own blocks around the click instead, bridging
    // the figures in between.
    // Between its own label and the next one, read both, a span is the question's however much of the window it
    // takes (a group's statement with its figure, in a window that shows less than a page): only too thin is doubted
    // (a Windows reading; see DECISOES).
    const labelledBothEnds = band !== null && (band.end !== null || band.footer !== null);
    const tooThin = bottom - top < lineHeight * 1.6;
    if (labelledBothEnds ? tooThin : QuestionBand.isSuspect(top, bottom, size.height, lineHeight)) {
      const columnBox = { x: left - lineHeight, y: 0, width: pageRight - left + lineHeight, height: size.height };
      const wide = ink.figures(columnBox, textRects);
      const block = QuestionBand.segment(lines, p, size.height, wide);
      if (block) {
        const tooBig = bottom - top > size.height * QuestionBand.maxPageShare;
        const blockHeight = block.bottom - block.top;
        if (tooBig ? blockHeight < bottom - top : blockHeight > bottom - top) {
          top = Math.max(0, block.top - lineHeight * 0.4);
          bottom = Math.max(
            Math.min(size.height, block.bottom + lineHeight * 0.3),
            Math.min(size.height, p.y + lineHeight),
          );
          if (footerTop !== null && footerTop > p.y) bottom = Math.min(bottom, footerTop - lineHeight * 0.3);
          top = Math.max(0, Math.min(top, p.y - lineHeight));
        }
      }
    }

    // The column's right edge: where its text ends. Lines starting far to the right are a sidebar or an ad; a line
    // far to the right on the row of one in the column (the last option of "(A) … (D) …") is still the question's.
    const reach = left + 0.6 * (size.width - left);
    const nearLeft = lines.filter((line) => minX(line.rect) <= reach);
    const column = lines.filter(
      (line) =>
        midY(line.rect) >= top &&
        midY(line.rect) <= bottom &&
        (minX(line.rect) <= reach ||
          QuestionBand.isOption(line.text) ||
          nearLeft.some(
            (other) =>
              Math.abs(midY(other.rect) - midY(line.rect)) < lineHeight * 0.6 && maxX(other.rect) < minX(line.rect),
          )),
    );
    const textRight = column.length ? Math.max(...column.map((line) => maxX(line.rect))) : pageRight;
    const right = Math.min(pageRight, textRight + 2 * lineHeight);

    // Figures: ink in the band that no text line explains. A filled button or a highlighted row around text is not one.
    const notButtons = (found: Rect[]) =>
      found.filter(
        (figure) => !(figure.height <= 3 * lineHeight && lines.some((line) => intersects(line.rect, figure))),
      );
    // Searched to the column's edge: a figure often reaches past the text.
    let figures = notButtons(
      ink.figures(
        { x: left - lineHeight, y: top, width: pageRight - left + lineHeight, height: bottom - top },
        textRects,
      ),
    );
    // "Considere a figura…" with no figure in it: the figure is shared, above (a group's statement).
    if (figures.length === 0 && options.wantsFigure) {
      const startTop = start ? minY(start.rect) : top;
      const previous = lines
        .filter((line) => QuestionBand.label(line.text) !== null && minX(line.rect) <= left + 3 * lineHeight)
        .filter((line) => minY(line.rect) < startTop - 1)
        .pop();
      const ceiling = Math.max(previous ? maxY(previous.rect) : 0, top - size.height * 0.8);
      const above = notButtons(
        ink.figures(
          { x: left - lineHeight, y: ceiling, width: right - left + lineHeight, height: top - ceiling },
          textRects,
        ),
      );
      const nearest = above.reduce<Rect | null>(
        (best, figure) => (!best || maxY(figure) > maxY(best) ? figure : best),
        null,
      );
      if (nearest) {
        top = minY(nearest) - 6;
        figures = [nearest];
      }
    }

    figures = QuestionLocator.consolidated(figures, lines, lineHeight);

    // Its width: the ink in the band.
    const inkLeft = Math.max(0, left - lineHeight);
    let region = ink.inkBounds({ x: inkLeft, y: top, width: right - inkLeft, height: bottom - top }) ?? {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
    const figureRight = figures.length ? Math.max(...figures.map(maxX)) : null;
    if (figureRight !== null && figureRight > maxX(region)) region = { ...region, width: figureRight - minX(region) };
    // Labels drawn beside a figure ("a", "1 kΩ") sit just past it.
    const besideFigures = lines.filter((line) =>
      figures.some((figure) => intersects(Rects.inset(figure, -2 * lineHeight, -4), line.rect)),
    );
    const labelRight = besideFigures.length ? Math.max(...besideFigures.map((line) => maxX(line.rect))) : null;
    if (labelRight !== null && labelRight > maxX(region) && labelRight <= pageRight) {
      region = { ...region, width: labelRight - minX(region) };
    }
    // Down to its last ink, not the blank space under it.
    const inkBottom = Math.min(bottom, maxY(region) + 8);
    const grown = {
      x: minX(region) - 8,
      y: top,
      width: region.width + 16,
      height: Math.max(inkBottom, Math.min(bottom, p.y + lineHeight)) - top,
    };
    const clipped = grown.height > 0 ? Rects.intersection(grown, bounds) : null;
    if (!clipped || clipped.width <= 20 || clipped.height <= 10) return null;
    region = clipped;

    const inside = lines.filter(
      (line) =>
        Rects.contains(region, { x: midX(line.rect), y: midY(line.rect) }) &&
        !(footerTop !== null && minY(line.rect) >= footerTop - 1),
    );
    // Words inside the figure itself (a circuit's "1 kΩ", "a", "b") are part of the drawing, not of the statement:
    // keep options and labels.
    const drawn = figures.map((figure) => Rects.inset(figure, -4, -4));
    const prose = inside.filter(
      (line) =>
        QuestionBand.label(line.text) !== null ||
        QuestionBand.isOption(line.text) ||
        !drawn.some((figure) => intersects(figure, line.rect) && characterCount(line.text) <= 14),
    );
    const crops = [region];
    const figuresPerCrop = [figures];
    let text = readingOrder(prose, lineHeight);
    let hasFigure = figures.length > 0;
    // A numbered part (2.1) is cropped alone; what its siblings share (the statement, a definition, a figure) goes
    // above it.
    if (band?.part && band.stemFrame) {
      const stemBox = band.stemFrame;
      const boxTop = Math.max(0, minY(stemBox) - lineHeight * 0.4);
      const box = {
        x: inkLeft,
        y: boxTop,
        width: pageRight - inkLeft,
        height: Math.min(maxY(stemBox) - lineHeight * 0.7, minY(region) - 1) - boxTop,
      };
      const found = box.height > lineHeight ? ink.inkBounds(box) : null;
      if (found) {
        const x0 = Math.min(minX(found), minX(region)) - 8;
        const stemGrown = {
          x: x0,
          y: box.y,
          width: Math.max(maxX(found), maxX(region)) - Math.min(minX(found), minX(region)) + 16,
          height: Math.min(maxY(found) + 6, maxY(box)) - box.y,
        };
        const stem = Rects.intersection(stemGrown, bounds);
        if (stem) {
          crops.unshift(stem);
          const stemLines = lines.filter((line) => Rects.contains(stem, { x: midX(line.rect), y: midY(line.rect) }));
          text = readingOrder(stemLines, lineHeight) + "\n" + text;
          const stemFigures = QuestionLocator.consolidated(notButtons(ink.figures(stem, textRects)), lines, lineHeight);
          figuresPerCrop.unshift(stemFigures);
          hasFigure = hasFigure || stemFigures.length > 0;
        }
      }
    }
    return {
      frame: offset(region, window.x, window.y),
      label: band?.label ?? null,
      part: band?.part ?? null,
      displayFrame:
        crops.length > 1
          ? {
              x: minX(crops[0]!) + window.x,
              y: minY(crops[0]!) + window.y,
              width: Math.max(...crops.map((crop) => crop.width)),
              height: crops.reduce((sum, crop) => sum + crop.height, 0) + 8,
            }
          : null,
      hasFigure,
      text,
      crops,
      figureBoxes: shares(figuresPerCrop, crops),
      lines: inside.map((line) => ({ text: line.text, rect: offset(line.rect, window.x, window.y) })),
    };
  },

  /**
   * The ink found as figures, made whole: a box grows to hold the short labels beside it ("CLK", "Q1", "X" sit just
   * left of a waveform), and boxes that overlap, or stack with only a label between them, are one figure. Statement
   * text and option letters keep separate figures apart.
   */
  consolidated(found: readonly Rect[], lines: readonly LocatorLine[], lineHeight: number): Rect[] {
    if (found.length === 0) return [...found];
    const isLabel = (text: string) =>
      characterCount(text) <= 14 && QuestionBand.label(text) === null && !QuestionBand.isOption(text);
    const blocked = (a: Rect, b: Rect) => {
      const strip = {
        x: Math.min(minX(a), minX(b)),
        y: Math.min(maxY(a), maxY(b)),
        width: Math.max(maxX(a), maxX(b)) - Math.min(minX(a), minX(b)),
        height: Math.max(0, Math.max(minY(a), minY(b)) - Math.min(maxY(a), maxY(b))),
      };
      return lines.some((line) => !isLabel(line.text) && intersects(line.rect, strip));
    };
    const boxes = [...found];
    for (let index = 0; index < boxes.length; index += 1) {
      for (let round = 0; round < 5; round += 1) {
        const box = boxes[index]!;
        for (const line of lines) {
          if (!isLabel(line.text)) continue;
          const rowOverlap =
            maxY(line.rect) > minY(box) - 0.3 * lineHeight && minY(line.rect) < maxY(box) + 0.3 * lineHeight;
          const gap = Math.max(minX(box) - maxX(line.rect), minX(line.rect) - maxX(box));
          if (rowOverlap && gap < 3 * lineHeight) boxes[index] = union(boxes[index]!, line.rect);
          // A name under or over a waveform whose own line was too faint to count ("Q1", "Q0").
          const columnOverlap = maxX(line.rect) > minX(box) && minX(line.rect) < maxX(box);
          const rise = Math.max(minY(box) - maxY(line.rect), minY(line.rect) - maxY(box));
          if (
            columnOverlap &&
            rise > 0 &&
            rise < 4 * lineHeight &&
            !rowOverlap &&
            characterCount(line.text) <= 8 &&
            minX(line.rect) < minX(box) + 0.3 * box.width &&
            !blocked(box, line.rect)
          ) {
            boxes[index] = union(boxes[index]!, line.rect);
          }
        }
      }
    }
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          const overlapping = intersects(Rects.inset(a, -2, -2), b);
          const shared = Math.min(maxX(a), maxX(b)) - Math.max(minX(a), minX(b));
          const stacked =
            shared > 0.3 * Math.min(a.width, b.width) &&
            Math.max(minY(a), minY(b)) - Math.min(maxY(a), maxY(b)) <= 2.5 * lineHeight &&
            !blocked(a, b);
          if (overlapping || stacked) {
            boxes[i] = union(a, b);
            boxes.splice(j, 1);
            merged = true;
            break outer;
          }
        }
      }
    }
    return boxes;
  },
};

/** The figures as shares of the stacked picture: the crops one under another, 8 points apart. */
function shares(figures: readonly Rect[][], crops: readonly Rect[]): Rect[] {
  if (crops.length === 0 || figures.length !== crops.length) return [];
  const gap = crops.length > 1 ? 8 : 0;
  const width = Math.max(...crops.map((crop) => crop.width));
  const height = crops.reduce((sum, crop) => sum + crop.height, 0) + gap * (crops.length - 1);
  if (width <= 0 || height <= 0) return [];
  const found: Rect[] = [];
  let top = 0;
  crops.forEach((crop, index) => {
    for (const figure of figures[index]!) {
      const part = Rects.intersection(figure, crop);
      if (!part || part.width <= 4 || part.height <= 4) continue;
      found.push({
        x: (minX(part) - minX(crop)) / width,
        y: (top + minY(part) - minY(crop)) / height,
        width: part.width / width,
        height: part.height / height,
      });
    }
    top += crop.height + gap;
  });
  return found;
}

/** Where each crop goes in the stacked picture, in pixels: at most 1400 wide or high, 8 points apart, on white. */
export function stackedPicture(
  crops: readonly Rect[],
  pixelsPerPoint: number,
): { width: number; height: number; pieces: { source: Rect; target: Rect }[] } | null {
  const pieces = crops
    .map((crop) => {
      const x = Math.floor(minX(crop) * pixelsPerPoint);
      const y = Math.floor(minY(crop) * pixelsPerPoint);
      return {
        x,
        y,
        width: Math.ceil(maxX(crop) * pixelsPerPoint) - x,
        height: Math.ceil(maxY(crop) * pixelsPerPoint) - y,
      };
    })
    .filter((piece) => piece.width > 0 && piece.height > 0);
  if (pieces.length === 0) return null;
  const gap = pieces.length > 1 ? Math.floor(8 * pixelsPerPoint) : 0;
  const width = Math.max(...pieces.map((piece) => piece.width));
  const height = pieces.reduce((sum, piece) => sum + piece.height, 0) + gap * (pieces.length - 1);
  const shrink = Math.min(1, 1400 / Math.max(width, height));
  let y = 0;
  return {
    width: Math.max(1, Math.floor(width * shrink)),
    height: Math.max(1, Math.floor(height * shrink)),
    pieces: pieces.map((source) => {
      const target = { x: 0, y, width: source.width * shrink, height: source.height * shrink };
      y += target.height + gap * shrink;
      return { source, target };
    }),
  };
}
