// Port of LearnLayer/Problems/PDFFigureSource.swift (placing a page from lines read on screen) and
// LearnLayer/Anywhere/PDFQuestionRead.swift (the question under the click, from the PDF's own text) @ ref 2026-11-04.
//
// A question read from the PDF a window shows (Edge, Acrobat, SumatraPDF… when the file can be found), found from
// where the student clicked: the page is placed on the screen from the lines read on a picture of the window, the
// click becomes a point on the page, and the question there comes from the PDF's text layer. The Mac then redraws its
// figures from the page's paths (`VectorPage`); on Windows that comes with the figures (phase 6), and until then the
// stage crops the figure from the PDF's own rendering, as the reader does — never from the screen.

import { linesOf, Rects, selectionIn, type PageText, type Rect } from "../pdf/page";
import { headingBounds, questionsOn, type ExamQuestion } from "../problems/questionDetector";
import { normalizeText } from "../problems/textNormalizer";
import { characterCount } from "./questionBand";
import type { LocatorLine } from "./questionRegion";

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

  /** The question the page point is in: the nearest label above it whose area (down to the next label of its column)
   * holds the point. */
  question(click: { x: number; y: number }, page: PageText): ExamQuestion | null {
    const all = questionsOn(page);
    const headings = headingBounds(page);
    return (
      all
        .filter((question) => maxY(question.labelBounds) >= click.y - 2)
        .sort((a, b) => maxY(a.labelBounds) - click.y - (maxY(b.labelBounds) - click.y))
        .find((question) =>
          Rects.contains(Rects.inset(PDFQuestionReading.questionArea(question, all, headings), -20, 0), click),
        ) ?? null
    );
  },

  /**
   * Where a question is on the page: from just under its label to just above the next label of its column (or where
   * its own text ends), across the column. A group heading printed below the label in its column ends the area too.
   */
  questionArea(question: ExamQuestion, all: readonly ExamQuestion[], headings: readonly Rect[] = []): Rect {
    const label = question.labelBounds;
    const top = maxY(label) + 3;
    const column = all.filter(
      (other) => Math.abs(minX(other.labelBounds) - minX(label)) < 60 && midY(other.labelBounds) < midY(label) - 2,
    );
    let bottom = column.length
      ? Math.max(...column.map((other) => maxY(other.labelBounds) + 2))
      : minY(question.bounds);
    const sameColumn = all.filter((other) => Math.abs(minX(other.labelBounds) - minX(label)) < 60);
    const right = Math.max(
      maxX(question.bounds),
      sameColumn.length ? Math.max(...sameColumn.map((o) => maxX(o.bounds))) : 0,
    );
    const left = minX(label) - 6;
    for (const heading of headings) {
      if (maxY(heading) < minY(label) && maxY(heading) > bottom && maxX(heading) > left && minX(heading) < right) {
        bottom = maxY(heading) + 1;
      }
    }
    const floor = Math.min(bottom, top - 10);
    return { x: left, y: floor, width: Math.max(right - left, 20), height: Math.max(top - floor, 10) };
  },

  make(question: ExamQuestion, page: PageText, placement: Placement): PDFQuestionRead | null {
    const area = PDFQuestionReading.questionArea(question, questionsOn(page), headingBounds(page));
    if (area.width <= 20 || area.height <= 8) return null;
    const stem = PDFQuestionReading.stemArea(question, area);
    const own = PDFQuestionReading.statement(area, question.text, page, []);
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
  stemArea(question: ExamQuestion, area: Rect): Rect | null {
    const bounds = question.statementBounds;
    if (question.label === question.group || question.statementPageIndex !== null || !bounds) return null;
    if (minY(bounds) <= minY(area)) return null;
    const left = Math.min(minX(bounds), minX(area));
    const right = Math.max(maxX(bounds), maxX(area));
    const bottom = Math.max(minY(bounds), maxY(area));
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

  /** The page's text before the question; when that is short (the passage starts on the page before), the previous
   * page's text in front of it. */
  supportText(question: ExamQuestion, page: PageText): string | null {
    const own = PDFQuestionReading.textBefore(question.label, question.text, page.text) ?? "";
    let support = own;
    if (characterCount(own) < 400 && page.index > 0) {
      const previous = page.page(page.index - 1);
      if (previous) support = previous.text + "\n" + own;
    }
    const trimmed = normalizeText(support).trim();
    return trimmed === "" ? null : trimmed;
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
    // A page number at the foot of the page is not the question's.
    const last = out[out.length - 1];
    if (last !== undefined && characterCount(last) <= 3 && /^\d+$/u.test(last)) out.pop();
    const text = normalizeText(out.join("\n").replaceAll("ℎ", "h"))
      // A subscript the page sets apart ("V 5") is the symbol's own ("V5").
      .replace(/\b([VIRCLPQU]) (\d)\b/gu, "$1$2")
      .trim();
    // A page whose text can't be read by area: the question's own text, labels and all, is better than none.
    return characterCount(text) >= Math.max(8, characterCount(fallback) / 4) ? text : fallback;
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
