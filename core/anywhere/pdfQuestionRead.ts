// Port of LearnLayer/Problems/PDFFigureSource.swift (placing a page from lines read on screen) and
// LearnLayer/Anywhere/PDFQuestionRead.swift (the question under the click, from the PDF's own text) @ ref 2026-11-04.
//
// A question read from the PDF a window shows (Edge, Acrobat, SumatraPDF… when the file can be found), found from
// where the student clicked: the page is placed on the screen from the lines read on a picture of the window, the
// click becomes a point on the page, and the question there comes from the PDF's text layer. The Mac then redraws its
// figures from the page's paths (`VectorPage`); on Windows that comes with the figures (phase 6), and until then the
// stage crops the figure from the PDF's own rendering, as the reader does — never from the screen.

import { linesOf, Rects, selectionBounds, selectionIn, type PageText, type Rect } from "../pdf/page";
import { headingBounds, questionsOn, type ExamQuestion } from "../problems/questionDetector";
import { normalizeText } from "../problems/textNormalizer";
import type { PassageLine } from "../problems/passage";
import { passageLinesOf } from "../pdf/passageLines";
import { characterCount } from "./questionBand";
import type { LocatorLine } from "./questionRegion";

/** Lower case and without accents, as `.diacriticInsensitive` with `lowercased()` (spaces and marks kept). */
const folded = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Where two rectangles overlap; null when they don't (`CGRect.intersection` is null then). */
function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.min(a.y + a.height, b.y + b.height);
  return right < x || top < y ? null : { x, y, width: right - x, height: top - y };
}

/** The text of the characters whose boxes touch `rect` (PDFKit's `selection(for:)` of a small rectangle). */
function charactersTouching(page: PageText, rect: Rect): string {
  let text = "";
  page.boxes.forEach((box, index) => {
    if (
      box &&
      box.x < rect.x + rect.width &&
      rect.x < box.x + box.width &&
      box.y < rect.y + rect.height &&
      rect.y < box.y + box.height
    )
      text += page.text[index]!;
  });
  return text;
}

/** Per page: its part labels and its lines' boxes, read once (`pageLines`, `partLabelBoxes`). */
const partLabelCache = new WeakMap<PageText, Rect[]>();
const lineCache = new WeakMap<PageText, Rect[]>();

const { minX, maxX, minY, maxY, midY } = Rects;

/** Where a page sits on screen: page = scale · (x, −y) + (tx, ty), screen points global with a top-left origin. */
export interface Placement {
  page: PageText;
  /** Page points per screen point. */
  pageUnitsPerPoint: number;
  tx: number;
  ty: number;
  /** RMS distance between where the lines are and where the fit puts them, in page points. */
  residual: number;
  anchors: number;
}

export const Placements = {
  /** Screen (global, top-left) → page (y up). */
  toPage(placement: Placement, point: { x: number; y: number }) {
    const s = placement.pageUnitsPerPoint;
    return { x: s * point.x + placement.tx, y: -s * point.y + placement.ty };
  },
  /** Page (y up) → screen. */
  toScreen(placement: Placement, rect: Rect): Rect {
    const s = placement.pageUnitsPerPoint;
    return {
      x: (rect.x - placement.tx) / s,
      y: (placement.ty - maxY(rect)) / s,
      width: rect.width / s,
      height: rect.height / s,
    };
  },
};

/** Letters and digits only, accents and case gone: what a rough reading and the page's text have in common. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "");
}

/** 1 for equal strings, 0 for nothing alike: one minus the edit distance over the longer length. */
export function similarity(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  // A line far shorter or longer than the other is not it.
  if (Math.min(a.length, b.length) / Math.max(a.length, b.length) < 0.6) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i, ...new Array<number>(b.length).fill(0)];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return 1 - previous[b.length]! / Math.max(a.length, b.length);
}

const pageLineCache = new WeakMap<PageText, { key: string; rect: Rect }[]>();

/** The text lines of a page, each with its box and its letters and digits alone. */
function pageLines(page: PageText): { key: string; rect: Rect }[] {
  const cached = pageLineCache.get(page);
  if (cached) return cached;
  const found = linesOf(page, 0, page.text.length)
    .map((line) => ({ key: fold(line.text), rect: line.bounds }))
    .filter((line) => line.key.length >= 10 && line.rect.width > 8);
  pageLineCache.set(page, found);
  return found;
}

type Anchor = { screen: { x: number; y: number }; page: { x: number; y: number } };

/** Least squares for page = scale · (x, −y) + offset, dropping the worst line while it sits far off. */
export function fit(
  anchors: readonly Anchor[],
): { scale: number; tx: number; ty: number; residual: number; used: number } | null {
  const set = [...anchors];
  while (set.length >= 2) {
    const n = set.length;
    const sx = set.reduce((sum, a) => sum + a.screen.x, 0) / n;
    const sy = set.reduce((sum, a) => sum + a.screen.y, 0) / n;
    const px = set.reduce((sum, a) => sum + a.page.x, 0) / n;
    const py = set.reduce((sum, a) => sum + a.page.y, 0) / n;
    let numerator = 0;
    let denominator = 0;
    for (const a of set) {
      const dx = a.screen.x - sx;
      const dy = a.screen.y - sy;
      numerator += dx * (a.page.x - px) - dy * (a.page.y - py);
      denominator += dx * dx + dy * dy;
    }
    if (denominator <= 1) return null;
    const scale = numerator / denominator;
    if (!(scale > 0.2 && scale < 5)) return null;
    const tx = px - scale * sx;
    const ty = py + scale * sy;
    const errors = set.map((a) => Math.hypot(scale * a.screen.x + tx - a.page.x, -scale * a.screen.y + ty - a.page.y));
    const rms = Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / n);
    if (rms <= 4) return { scale, tx, ty, residual: rms, used: n };
    if (set.length <= 2) return null;
    let worst = 0;
    errors.forEach((error, index) => {
      if (error > errors[worst]!) worst = index;
    });
    set.splice(worst, 1);
  }
  return null;
}

/**
 * The page of the document that holds most of `lines`, and the straight scaling that puts them where they are in it.
 * A reading of a screen is rough (accents dropped, a letter wrong, a line cut short), so a line is matched to the
 * page's line it most resembles, and the pairs that don't agree on one scaling are dropped.
 */
export function placeLines(lines: readonly LocatorLine[], pages: readonly PageText[]): Placement | null {
  const seen = lines.map((line) => ({ line, key: fold(line.text) })).filter((item) => item.key.length >= 10);
  if (seen.length < 3) return null;
  let best: { page: PageText; anchors: Anchor[] } | null = null;
  for (const page of pages) {
    const candidates = pageLines(page);
    if (candidates.length < 3) continue;
    const anchors: Anchor[] = [];
    for (const { line, key } of seen) {
      let top: { score: number; rect: Rect } | null = null;
      let second = 0;
      for (const candidate of candidates) {
        const score = similarity(key, candidate.key);
        if (score > (top?.score ?? 0)) {
          second = top?.score ?? 0;
          top = { score, rect: candidate.rect };
        } else if (score > second) {
          second = score;
        }
      }
      // Alike enough, and clearly more than the next one (a repeated line is no anchor).
      if (!top || top.score < 0.72 || top.score - second < 0.08) continue;
      anchors.push({
        screen: { x: minX(line.rect), y: midY(line.rect) },
        page: { x: minX(top.rect), y: midY(top.rect) },
      });
    }
    if (anchors.length > (best?.anchors.length ?? 2)) best = { page, anchors };
  }
  if (!best || best.anchors.length < 3) return null;
  const found = fit(best.anchors);
  if (!found || found.used < 3) return null;
  return {
    page: best.page,
    pageUnitsPerPoint: found.scale,
    tx: found.tx,
    ty: found.ty,
    residual: found.residual,
    anchors: found.used,
  };
}

export interface PDFQuestionRead {
  /** The question as the PDF's text layer has it, its area as `bounds`. */
  exam: ExamQuestion;
  page: PageText;
  placement: Placement;
  /** The question's area on the page (PDF points). */
  area: Rect;
  /** What the question is shown and read from, top to bottom: the part's statement above it, then the part. */
  regions: Rect[];
  /** Where the question is on screen (global, top-left). */
  screenFrame: Rect;
  /** What the page prints before the question: the excerpt a reading question is about. */
  supportText: string | null;
}

export const PDFQuestionReading = {
  /** The question at `point` (global, top-left) of a window showing `pages`, from the lines read on a picture of it.
   * Null when the page can't be placed or the point is not in a question. */
  read(
    lines: readonly LocatorLine[],
    point: { x: number; y: number },
    pages: readonly PageText[],
  ): PDFQuestionRead | null {
    const placement = placeLines(lines, pages);
    if (!placement || placement.residual > 4) return null;
    const page = placement.page;
    const click = Placements.toPage(placement, point);
    if (!Rects.contains(page.mediaBox, click)) return null;
    const question = PDFQuestionReading.question(click, page);
    return question ? PDFQuestionReading.make(question, page, placement) : null;
  },

  /**
   * The question the page point is in: the nearest label above it whose area (down to the next label of its column)
   * holds the point. In a grid of parts (CDI sheet 1(a)–(q), two columns), the part whose own row holds the point and
   * whose words are under it or nearest it on that row: the gap between the columns goes to the nearer column, a
   * point past the end of a line to that line's part, never the part above, under or across
   * (`PDFQuestionRead.question(at:on:)` @ 5701363).
   */
  question(click: { x: number; y: number }, page: PageText): ExamQuestion | null {
    const all = questionsOn(page);
    const typical = PDFQuestionReading.typicalLabelHeight(all);
    const headings = headingBounds(page);
    const partLabels = PDFQuestionReading.partLabelBoxes(page).map((box) => PDFQuestionReading.lineBox(box, typical));
    const areas = all.map((question) => ({
      question,
      area: PDFQuestionReading.questionArea(question, all, headings, page),
      grid:
        question.label !== question.group &&
        !PDFQuestionReading.isGroupStem(question, all) &&
        PDFQuestionReading.isInGrid(PDFQuestionReading.lineBox(question.labelBounds, typical), typical, partLabels),
    }));
    const nearby = areas.filter((item) => Rects.contains(Rects.inset(item.area, -60, -4), click));
    if (nearby.some((item) => item.grid)) {
      const parts = nearby.filter(
        (item) => item.grid && click.y >= minY(item.area) - 4 && click.y <= maxY(item.area) + 4,
      );
      const lines = PDFQuestionReading.pageLines(page);
      // A part whose box holds the point first; among those (or, with none, among the rows beside it), the one whose
      // words are nearest. Its box, for a click, ends halfway between its words and the next part beside it.
      const scored = parts.map((item) => {
        const label = PDFQuestionReading.lineBox(item.question.labelBounds, typical);
        const joined = lines
          .filter((line) => Rects.contains(item.area, { x: Rects.midX(line), y: midY(line) }))
          .reduce<Rect>((all, line) => Rects.union(all, line)!, label);
        const words = intersection(joined, item.area);
        const box = { ...item.area };
        const beside = partLabels.filter(
          (other) => minX(other) > maxX(label) + 40 && Math.abs(midY(other) - midY(label)) < typical * 2.5,
        );
        const next = beside.length > 0 ? Math.min(...beside.map(minX)) : null;
        if (words && next !== null && maxX(words) < next)
          box.width = Math.min(box.width, Math.max(maxX(words) + 4, (maxX(words) + next) / 2) - minX(box));
        return {
          question: item.question,
          inside: Rects.contains(box, click),
          distance: words ? PDFQuestionReading.distance(click, words) : Infinity,
        };
      });
      const best = scored.reduce<(typeof scored)[number] | null>((found, item) => {
        if (!found) return item;
        if (item.inside !== found.inside) return item.inside ? item : found;
        return item.distance < found.distance ? item : found;
      }, null);
      if (best) return best.question;
    }
    // The smallest area holding the point (a part rather than the statement over it); else the nearest one beside it.
    const holding = areas.filter((item) => Rects.contains(item.area, click));
    if (holding.length > 0)
      return holding.reduce((a, b) => (b.area.width * b.area.height < a.area.width * a.area.height ? b : a)).question;
    const beside = areas.filter(
      (item) => Rects.contains(Rects.inset(item.area, -20, 0), click) && maxY(item.question.labelBounds) >= click.y - 2,
    );
    if (beside.length === 0) return null;
    return beside.reduce((a, b) =>
      PDFQuestionReading.distance(click, b.area) < PDFQuestionReading.distance(click, a.area) ? b : a,
    ).question;
  },

  /** How far `point` is from `rect` (0 inside it). */
  distance(point: { x: number; y: number }, rect: Rect): number {
    const dx = Math.max(minX(rect) - point.x, 0, point.x - maxX(rect));
    const dy = Math.max(minY(rect) - point.y, 0, point.y - maxY(rect));
    return Math.hypot(dx, dy);
  },

  /**
   * Where a question is on the page: from just under its label to just above the next label of its column (or where
   * its own text ends), across the column. A group heading printed below the label in its column ends the area too.
   * With the page: a group's statement clicked with its parts under it is the whole group; the last question ends
   * where the paper does; a part of a grid is its own row (`PDFQuestionRead.questionArea` @ 5701363).
   */
  questionArea(
    question: ExamQuestion,
    all: readonly ExamQuestion[],
    headings: readonly Rect[] = [],
    page: PageText | null = null,
  ): Rect {
    const typical = PDFQuestionReading.typicalLabelHeight(all);
    const lineBox = (box: Rect) => PDFQuestionReading.lineBox(box, typical);
    const label = lineBox(question.labelBounds);
    let top = maxY(label) + 3;
    // A group's statement clicked with its parts under it: the whole group, down to the next question.
    const wholeGroup = PDFQuestionReading.isGroupStem(question, all);
    const column = all.filter(
      (other) =>
        Math.abs(minX(other.labelBounds) - minX(label)) < 60 &&
        midY(lineBox(other.labelBounds)) < midY(label) - 2 &&
        !(wholeGroup && other.group === question.group),
    );
    const groupTops = all.filter((other) => other.group === question.group).map((other) => minY(other.bounds));
    const ownEnd = wholeGroup && groupTops.length > 0 ? Math.min(...groupTops) : minY(question.bounds);
    let bottom = column.length > 0 ? Math.max(...column.map((other) => maxY(lineBox(other.labelBounds)) + 2)) : ownEnd;
    // The last question ends where the paper does ("FIM", "COTAÇÕES"), not at the marking table under it.
    const end = page ? PDFQuestionReading.endMarkTop(page, top) : null;
    if (end !== null && end > bottom) bottom = end + 2;
    const sameColumn = all.filter((other) => Math.abs(minX(other.labelBounds) - minX(label)) < 60);
    let right = Math.max(
      maxX(question.bounds),
      sameColumn.length ? Math.max(...sameColumn.map((o) => maxX(o.bounds))) : 0,
    );
    for (const heading of headings) {
      if (
        maxY(heading) < minY(label) &&
        maxY(heading) > bottom &&
        maxX(heading) > minX(label) - 6 &&
        minX(heading) < right
      ) {
        bottom = maxY(heading) + 1;
      }
    }
    const floor = Math.min(bottom, top - 10);
    if (wholeGroup) {
      const groupRights = all.filter((other) => other.group === question.group).map((other) => maxX(other.bounds));
      right = Math.max(right, ...groupRights);
    } else {
      // Parts set in a grid ("(a) … (d) … (g)"): the part ends where the next one on its rows begins.
      const besideIt = all.filter((other) => {
        const box = lineBox(other.labelBounds);
        return minX(box) > maxX(label) + 20 && midY(box) < top && midY(box) > floor;
      });
      if (besideIt.length > 0)
        right = Math.min(right, Math.min(...besideIt.map((other) => minX(other.labelBounds))) - 4);
    }
    const left = minX(label) - 6;
    // Never above the bottom of the question's own line: the next label of the column can have its box stretched up
    // into this line by a tall bracket beside it («(g) ln(arccos(1/√x))» under «(f) (e^{2x} + …)^8»).
    let bottomEdge = Math.min(floor, minY(label) - 1);
    const band =
      !wholeGroup && question.label !== question.group && page
        ? PDFQuestionReading.gridRowBand(label, typical, left, right, all, page)
        : null;
    if (band) {
      // A part in a grid of formulas (CDI sheet 1(a)–(q)): its own row, from the lines nearer its label than its
      // neighbours' (a fraction's numerator and denominator too).
      top = band.top;
      bottomEdge = band.bottom;
    } else if (!wholeGroup && question.label !== question.group && page) {
      // Part labels the detector did not keep (a TeX grid «a) … i)» in two columns, a «g)» it lost) still end the
      // part: the next one under it in its column, and the first one beside it on its rows.
      const others = PDFQuestionReading.partLabelBoxes(page).filter(
        (box) => Math.abs(midY(box) - midY(label)) > 2 || Math.abs(minX(box) - minX(label)) > 2,
      );
      const under = others
        .filter((box) => Math.abs(minX(box) - minX(label)) < 15 && midY(box) < minY(label) && midY(box) > bottomEdge)
        .map((box) => maxY(lineBox(box)) + 1);
      // A label stretched by a tall sign on its line («g) ∛x−1») reaches up into this one: never above this label's
      // own bottom, so the part's own line is never cut.
      if (under.length > 0)
        bottomEdge = Math.max(bottomEdge, Math.min(Math.max(...under), minY(question.labelBounds) - 1));
      const next = others
        .filter((box) => minX(box) > maxX(label) + 40 && minX(box) < right && midY(box) < top && midY(box) > bottomEdge)
        .map(minX);
      if (next.length > 0) right = Math.min(right, Math.min(...next) - 4);
    }
    return { x: left, y: bottomEdge, width: Math.max(right - left, 20), height: Math.max(top - bottomEdge, 10) };
  },

  /** A group's statement ("5.") whose parts ("5.1.", "5.2.") are printed under it on this page. */
  isGroupStem(question: ExamQuestion, all: readonly ExamQuestion[]): boolean {
    return (
      question.label === question.group &&
      all.some((other) => other.group === question.group && other.label !== question.label)
    );
  },

  /**
   * The usual height of a label on the page: a label stretched by a tall bracket next to it ("(f)  (e^{2x} …)^8") is
   * brought back to it.
   */
  typicalLabelHeight(all: readonly ExamQuestion[]): number {
    const heights = all
      .map((question) => question.labelBounds.height)
      .filter((height) => height > 1)
      .sort((a, b) => a - b);
    return heights.length === 0 ? 12 : heights[Math.floor(heights.length / 2)]!;
  },

  /** `box` as tall as one line of text, around its middle, when a tall glyph stretched it. */
  lineBox(box: Rect, typical: number): Rect {
    if (box.height <= typical * 1.6) return box;
    return { x: box.x, y: midY(box) - typical / 2, width: box.width, height: typical };
  },

  /** The top of the line that ends the paper ("FIM", "COTAÇÕES", "END OF TEST") under `top` on `page`. */
  endMarkTop(page: PageText, top: number): number | null {
    let found: number | null = null;
    for (const match of page.text.matchAll(
      /^[ \t]*(FIM|Fim|FIM DA PROVA|COTAÇÕES|Cotações|END OF TEST|END OF EXAM|THE END)[ \t]*$/gmu,
    )) {
      const start = match.index + match[0].indexOf(match[1]!);
      const box = selectionBounds(page, start, match[1]!.length);
      if (box && maxY(box) < top) found = Math.max(found ?? -Infinity, maxY(box));
    }
    return found;
  },

  /**
   * Every part label of the page's text («f)», «(b)», «iv)») that starts something: blank page before it on its
   * line, so not a bracket closing a formula («(1 + x)»). Page points.
   */
  partLabelBoxes(page: PageText): Rect[] {
    const cached = partLabelCache.get(page);
    if (cached) return cached;
    const boxes: Rect[] = [];
    for (const match of page.text.matchAll(/(?<![^\s])\(?(?:[a-z]|[ivx]{2,4})\)/gu)) {
      const box = selectionBounds(page, match.index, match[0].length);
      if (!box || box.width <= 0 || box.height <= 0) continue;
      const before = { x: minX(box) - 14, y: midY(box) - 1, width: 13, height: 2 };
      if (charactersTouching(page, before).trim() === "") boxes.push(box);
    }
    partLabelCache.set(page, boxes);
    return boxes;
  },

  /** A part of a grid has another part label beside it, on its row, in another column. */
  isInGrid(label: Rect, typical: number, labels: readonly Rect[]): boolean {
    return labels.some(
      (other) => Math.abs(midY(other) - midY(label)) < typical * 2.5 && Math.abs(minX(other) - minX(label)) > 60,
    );
  },

  /**
   * The top and bottom of a grid part's row (page points): the column's lines (between `left` and `right`) that are
   * nearer this label than the labels above and under it in its column, a fraction's lines included. Where those
   * lines' boxes and the next row's overlap, the Mac cuts at the line of pixels with the least ink between them; the
   * core has no picture of the page, so the cut is halfway, the Mac's own fallback. Null when not in a grid.
   */
  gridRowBand(
    label: Rect,
    typical: number,
    left: number,
    right: number,
    all: readonly ExamQuestion[],
    page: PageText,
  ): { top: number; bottom: number } | null {
    const lineBox = (box: Rect) => PDFQuestionReading.lineBox(box, typical);
    const parts = PDFQuestionReading.partLabelBoxes(page).map(lineBox);
    if (!PDFQuestionReading.isInGrid(label, typical, parts)) return null;
    // The labels of its column: parts under one another, and the question's number set out to their left.
    const column = [...parts, ...all.map((question) => lineBox(question.labelBounds))].filter(
      (box) => minX(box) > minX(label) - 40 && minX(box) < minX(label) + 15 && Math.abs(midY(box) - midY(label)) > 2,
    );
    const aboveMids = column.filter((box) => midY(box) > midY(label)).map(midY);
    const belowMids = column.filter((box) => midY(box) < midY(label)).map(midY);
    const above = aboveMids.length > 0 ? Math.min(...aboveMids) : null;
    const below = belowMids.length > 0 ? Math.max(...belowMids) : null;
    const upper = above !== null ? (midY(label) + above) / 2 : midY(label) + typical * 2.5;
    const lower = below !== null ? (midY(label) + below) / 2 : midY(label) - typical * 2.5;
    const lines = PDFQuestionReading.pageLines(page).filter(
      (line) => Rects.midX(line) > left && Rects.midX(line) < right,
    );
    const own = lines
      .filter((line) => midY(line) <= upper && midY(line) >= lower)
      .reduce<Rect>((all, line) => Rects.union(all, line)!, label);
    // The lines of the rows above and under, down to (up to) their labels' middle.
    const upperRow = above !== null ? lines.filter((line) => midY(line) > upper && midY(line) <= above + typical) : [];
    const lowerRow = below !== null ? lines.filter((line) => midY(line) < lower && midY(line) >= below - typical) : [];
    let top = maxY(own) + 3;
    let bottom = minY(own) - 3;
    if (upperRow.length > 0) {
      const next = Math.min(...upperRow.map(minY));
      top = next >= maxY(own) ? maxY(own) + Math.min(3, (next - maxY(own)) / 2) : (next + maxY(own)) / 2;
    }
    if (lowerRow.length > 0) {
      const next = Math.max(...lowerRow.map(maxY));
      bottom = next <= minY(own) ? minY(own) - Math.min(3, (minY(own) - next) / 2) : (next + minY(own)) / 2;
    }
    // A label's box stretched by a tall sign on its line («f) √(1−x)») is taller than its row: one line will do.
    if (top - bottom < Math.min(label.height, typical)) return null;
    return { top, bottom };
  },

  /** The page's lines of text (their boxes). */
  pageLines(page: PageText): Rect[] {
    const cached = lineCache.get(page);
    if (cached) return cached;
    const lines = linesOf(page, 0, page.text.length)
      .map((line) => line.bounds)
      .filter((box) => box.width > 0 && box.height > 0);
    lineCache.set(page, lines);
    return lines;
  },

  make(question: ExamQuestion, page: PageText, placement: Placement): PDFQuestionRead | null {
    const all = questionsOn(page);
    const area = PDFQuestionReading.questionArea(question, all, headingBounds(page), page);
    if (area.width <= 20 || area.height <= 8) return null;
    const stem = PDFQuestionReading.stemArea(question, area, all);
    const own = PDFQuestionReading.isGroupStem(question, all)
      ? PDFQuestionReading.groupStatement(question, area, page)
      : PDFQuestionReading.statement(area, question.text, page, []);
    const stemText = stem
      ? PDFQuestionReading.statement(stem, "", page, [])
      : (PDFQuestionReading.carriedStem(question, page) ?? "");
    const text = stemText === "" ? own : stemText + "\n" + own;
    const exam: ExamQuestion = {
      ...question,
      bounds: area,
      text,
      groupText: question.groupLabels.length > 1 ? question.groupText : text,
    };
    const regions = PDFQuestionReading.modelRegions(stem && stemText !== "" ? stem : null, area, []);
    return {
      exam,
      page,
      placement,
      area,
      regions,
      screenFrame: Placements.toScreen(placement, PDFQuestionReading.stackedArea(regions)!),
      supportText: PDFQuestionReading.supportText(question, page),
    };
  },

  /**
   * The page regions the question is read from: the statement above the part (when it has one), then the part with its
   * figures. Less than a line between them (the first part, right under it): the part starts where the statement ends,
   * so a label whose box is short (bold "a)" of a Type 1 font) doesn't have the top of its line cut off under
   * "Considere o circuito da figura." (Eletrotecnia, problem 5).
   */
  modelRegions(stem: Rect | null, area: Rect, figures: readonly Rect[]): Rect[] {
    let own = figures.reduce((all, figure) => Rects.union(all, figure)!, area);
    if (stem && minY(stem) > maxY(own) && minY(stem) - maxY(own) <= 14) {
      own = { x: own.x, y: own.y, width: own.width, height: minY(stem) - minY(own) };
    }
    return stem ? [stem, own] : [own];
  },

  /** Where a part's shared statement is printed above it on the same page, across the part's width; null for a
   * question that is not a part. */
  stemArea(question: ExamQuestion, area: Rect, all: readonly ExamQuestion[] = []): Rect | null {
    const bounds = question.statementBounds;
    if (question.label === question.group || question.statementPageIndex !== null || !bounds) return null;
    if (minY(bounds) <= minY(area)) return null;
    const left = Math.min(minX(bounds), minX(area));
    const right = Math.max(maxX(bounds), maxX(area));
    // The statement ends above the group's first part, even when the text layer stores the parts' labels inside it
    // ("5.1. 5.2. Mostre …").
    const typical = PDFQuestionReading.typicalLabelHeight(all);
    const firstParts = all
      .filter(
        (other) =>
          other.group === question.group && other.label !== question.group && other.pageIndex === question.pageIndex,
      )
      .map((other) => maxY(PDFQuestionReading.lineBox(other.labelBounds, typical)) + 2);
    const bottom = Math.max(minY(bounds), maxY(area), ...firstParts);
    if (maxY(bounds) - bottom <= 4) return null;
    return { x: left, y: bottom, width: right - left, height: maxY(bounds) - bottom };
  },

  /** The words of a part's shared statement when it is printed on the page before. */
  carriedStem(question: ExamQuestion, page: PageText): string | null {
    if (question.label === question.group || question.statementPageIndex === null || !question.statementBounds)
      return null;
    const previous = page.page(question.statementPageIndex);
    if (!previous) return null;
    const text = PDFQuestionReading.statement(question.statementBounds, "", previous, []);
    return text === "" ? null : text;
  },

  /**
   * The source text a reading question is about (a poem, an excerpt, «Texto A»): what the page prints before the
   * question, with the page before in front when this page introduces no text before it (the passage on the left
   * page of a spread), from the last «Leia…»/«Texto B»/«Read…» line on (the first one for a question about both
   * texts), with the exam's line numbers («5\tNum trem de praça…») and without page footers. At most `supportLimit`
   * characters (`PDFQuestionRead.supportText(before:on:)` @ 5701363).
   */
  supportText(question: ExamQuestion, page: PageText): string | null {
    const ownLines = PDFQuestionReading.linesBefore(question, passageLinesOf(page));
    let lines = ownLines;
    // The passage is on the page before (the left page of a spread) when this page introduces none before the
    // question and has little text above it: only the group's earlier questions.
    const ownLength = characterCount(ownLines.map((line) => line.text).join("\n"));
    if (!ownLines.some((line) => PDFQuestionReading.isSourceStart(line.text)) && ownLength < 1_500 && page.index > 0) {
      const previous = page.page(page.index - 1);
      if (previous) lines = [...passageLinesOf(previous), ...ownLines];
    }
    return PDFQuestionReading.supportTextFrom(lines, question.groupText);
  },

  /**
   * The most a support text holds: the Cesário Verde stanzas with their notes are ~1 500 characters, a long prose
   * excerpt ~4 000. About 1 500 input tokens at most.
   */
  supportLimit: 6_000,

  /** `lines` (what the page prints before a question) as the support text sent with `question`. */
  supportTextFrom(lines: readonly PassageLine[], question: string): string | null {
    const kept = lines.filter((line) => !PDFQuestionReading.isPageFooter(line.text) && line.text.trim() !== "");
    const starts = kept.flatMap((line, index) => (PDFQuestionReading.isSourceStart(line.text) ? [index] : []));
    const first = (PDFQuestionReading.refersToSeveralTexts(question) ? starts[0] : starts[starts.length - 1]) ?? 0;
    let numbering = true;
    let text = "";
    for (const line of kept.slice(first)) {
      const trimmed = line.text.trim();
      // The exam numbers the passage's lines; its source and notes after it are not lines of it.
      if (PDFQuestionReading.isSourceEnd(trimmed)) numbering = false;
      const row = numbering && line.number !== null ? `${line.number}\t${trimmed}` : trimmed;
      text += (text === "" ? "" : "\n") + row;
    }
    const normalized = normalizeText(text).trim();
    if (normalized === "") return null;
    // No «Leia…» line: the nearest text to the question. With one: the passage from its start.
    const characters = Array.from(normalized);
    if (characters.length <= PDFQuestionReading.supportLimit) return normalized;
    return starts.length === 0
      ? characters.slice(-PDFQuestionReading.supportLimit).join("")
      : characters.slice(0, PDFQuestionReading.supportLimit).join("");
  },

  /** The page's lines before `question`: up to its first line (or its label at the start of a line). */
  linesBefore(question: ExamQuestion, lines: readonly PassageLine[]): PassageLine[] {
    const firstLine = (question.text.split(/\r\n|\n|\r/u)[0] ?? "").trim();
    const escaped = question.label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const label = new RegExp("^" + escaped + "[.)]\\s", "u");
    const head = Array.from(firstLine).slice(0, 20).join("");
    const starts = lines.findIndex((line) => {
      const text = line.text.trim();
      if (characterCount(firstLine) >= 20 && text.startsWith(head)) return true;
      return label.test(text);
    });
    return lines.slice(0, starts < 0 ? lines.length : starts);
  },

  /**
   * «Leia o texto…», «Leia as cinco estrofes seguintes», «Texto B», «Read the text below», «Lê o excerto»: where a
   * source text is introduced.
   */
  isSourceStart(line: string): boolean {
    const lowered = folded(line.trim());
    return (
      /^(leia|le|leiam|read|lisez|lee|atente|observe|considere) (o|a|os|as|com|atentamente|the|this|these|carefully|le|la|les|el)\b/.test(
        lowered,
      ) ||
      /^(texto|text|documento|document|excerto|extract|passage|poema|poem) ?([a-d1-4]|i{1,3}|iv)?\.?$/.test(lowered)
    );
  },

  /** The source under a passage («Cesário Verde, Cânticos do Realismo, …, p. 123.») or its notes: no line numbers. */
  isSourceEnd(line: string): boolean {
    return (
      /^(NOTAS?|Notas?|Notes?|Vocabul[aá]rio|Glossary)(?![\p{L}\p{N}_])/u.test(line) || /,\s*(p|pp)\.\s*\d/.test(line)
    );
  },

  /** «Prova 639.V1/1.ª F. • Página 6/ 14», «Page 3 of 12», «– 4 –»: not part of the text. */
  isPageFooter(line: string): boolean {
    return /^Prova \d|P[aá]gina \d+\s*\/\s*\d+|^Page \d+ of \d+|^[–-]?\s*\d{1,2}\s*[–-]?$|^\d+\s*\/\s*\d+$/.test(
      line.trim(),
    );
  },

  /** «os textos A e B», «Texto A», «both texts»: the question is about more than the last passage. */
  refersToSeveralTexts(question: string): boolean {
    return /\btextos\b|\btexto a\b|\btext a\b|\bboth (texts|passages|poems)\b|\btwo (texts|passages|poems)\b|\bdois (textos|poemas)\b/.test(
      folded(question),
    );
  },

  /** What the page prints before the question: up to its first line, or else up to its label. */
  textBefore(label: string, text: string, page: string): string | null {
    const first = (text.split(/\r\n|\n|\r/u).find((line) => line !== "") ?? "").trim();
    for (const length of [40, 20]) {
      if (characterCount(first) < length) continue;
      const at = page.indexOf(Array.from(first).slice(0, length).join(""));
      if (at >= 0) return page.slice(0, at);
    }
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const match = new RegExp("^\\s*" + escaped + "[.)]\\s", "mu").exec(page);
    return match ? page.slice(0, match.index) : null;
  },

  /** The words of the question without those inside its figures: the area minus each figure's box. */
  statement(region: Rect, fallback: string, page: PageText, figures: readonly Rect[]): string {
    let pieces = [Rects.inset(region, 2, 1)];
    for (const figure of figures) {
      pieces = pieces.flatMap((piece) => PDFQuestionReading.subtract(Rects.inset(figure, -1, -1), piece));
    }
    // Reading order: top to bottom, and left to right on one level.
    pieces.sort((a, b) => (Math.abs(maxY(a) - maxY(b)) > 2 ? maxY(b) - maxY(a) : minX(a) - minX(b)));
    const out: string[] = [];
    for (const piece of pieces) {
      if (piece.width <= 3 || piece.height <= 3) continue;
      const selection = selectionIn(page, piece);
      if (!selection) continue;
      for (const line of selection.text.split(/\r\n|\n|\r/u)) {
        const trimmed = line.trim();
        if (trimmed !== "" && out[out.length - 1] !== trimmed) out.push(trimmed);
      }
    }
    // A page number at the foot of the page is not the question's ("4", "Página 1", "Page 2 of 3").
    const last = out[out.length - 1];
    if (last !== undefined && characterCount(last) <= 3 && /^\d+$/u.test(last)) out.pop();
    const footer = out[out.length - 1];
    if (footer !== undefined && /^(?:Página|Pagina|Page|Pág\.)\s*\d+(?:\s*(?:\/|de|of)\s*\d+)?$/iu.test(footer))
      out.pop();
    const text = normalizeText(out.join("\n").replaceAll("ℎ", "h"))
      // A subscript the page sets apart ("V 5") is the symbol's own ("V5").
      .replace(/\b([VIRCLPQU]) (\d)\b/gu, "$1$2")
      .trim();
    // A page whose text can't be read by area: the question's own text, labels and all, is better than none. The
    // detector's own text can run long over a grid's other column (CDI 1(h): 200 characters of i)–q)), so a short
    // part read by area whole is never measured against all of it.
    return characterCount(text) >= Math.max(8, Math.min(characterCount(fallback) / 4, 24)) ? text : fallback;
  },

  /**
   * A group's statement and each of its parts, read one area at a time and in the order they are printed: the text
   * layer may store the parts' labels before their words ("1.1. 1.2. Determine … Indique …")
   * (`PDFQuestionRead.groupStatement` @ 5701363).
   */
  groupStatement(question: ExamQuestion, area: Rect, page: PageText): string {
    const all = questionsOn(page);
    const parts = all.filter((other) => other.group === question.group && other.label !== question.label);
    const typical = PDFQuestionReading.typicalLabelHeight(all);
    const tops = parts.map((part) => maxY(PDFQuestionReading.lineBox(part.labelBounds, typical)) + 2);
    const firstPartTop = tops.length > 0 ? Math.max(...tops) : minY(area);
    const stem = { x: area.x, y: firstPartTop, width: area.width, height: Math.max(maxY(area) - firstPartTop, 1) };
    const pieces = [PDFQuestionReading.statement(stem, question.text, page, [])];
    // Top to bottom, left to right on one row (a grid of parts).
    const ordered = [...parts].sort((a, b) =>
      Math.abs(midY(a.labelBounds) - midY(b.labelBounds)) > typical / 2
        ? midY(b.labelBounds) - midY(a.labelBounds)
        : minX(a.labelBounds) - minX(b.labelBounds),
    );
    for (const part of ordered) {
      const partArea = intersection(PDFQuestionReading.questionArea(part, all, [], page), area);
      if (!partArea) continue;
      const text = PDFQuestionReading.statement(partArea, part.text, page, []);
      if (text !== "") pieces.push(text);
    }
    return pieces.join("\n");
  },

  /** What is left of `rect` when `hole` is taken out: the strips above, below and beside it. */
  subtract(hole: Rect, rect: Rect): Rect[] {
    const overlaps =
      Math.min(maxX(rect), maxX(hole)) > Math.max(minX(rect), minX(hole)) &&
      Math.min(maxY(rect), maxY(hole)) > Math.max(minY(rect), minY(hole));
    if (!overlaps) return [rect];
    const out: Rect[] = [];
    if (maxY(hole) < maxY(rect))
      out.push({ x: rect.x, y: maxY(hole), width: rect.width, height: maxY(rect) - maxY(hole) });
    if (minY(hole) > minY(rect)) out.push({ x: rect.x, y: rect.y, width: rect.width, height: minY(hole) - minY(rect) });
    const bandMinY = Math.max(minY(rect), minY(hole));
    const bandMaxY = Math.min(maxY(rect), maxY(hole));
    if (minX(hole) > minX(rect)) {
      out.push({ x: rect.x, y: bandMinY, width: minX(hole) - minX(rect), height: bandMaxY - bandMinY });
    }
    if (maxX(hole) < maxX(rect)) {
      out.push({ x: maxX(hole), y: bandMinY, width: maxX(rect) - maxX(hole), height: bandMaxY - bandMinY });
    }
    return out;
  },

  /** "A. …", "B) …", "(c) …": a line that starts an option. */
  isOption: (line: string) => /^\s*\(?[A-Ha-h][.)]\s/u.test(line),

  /** Where `regions` stacked one under the other stand on the page: from the first one's top, across all their
   * widths, as tall as their heights together. */
  stackedArea(regions: readonly Rect[]): Rect | null {
    const first = regions[0];
    if (!first) return null;
    const left = Math.min(...regions.map(minX));
    const right = Math.max(...regions.map(maxX));
    const height = regions.reduce((sum, region) => sum + region.height, 0);
    return { x: left, y: maxY(first) - height, width: right - left, height };
  },
};
