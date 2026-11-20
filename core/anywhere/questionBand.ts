// Port of LearnLayer/Anywhere/QuestionBand.swift @ ref 2026-11-04.
//
// Which lines of a page are the question at a point, from the lines' text and position alone (read through UI
// Automation or from a picture). The question runs from its label ("Questão 2", "3.") to the next question's label or
// a new section; the exam's header above the first question, an answer table ("Questão 1 2 3 4"), and the page's
// footer are never in it. Coordinates are points with a top-left origin.

import { Rects, type Rect } from "../pdf/page";

export interface BandLine {
  text: string;
  rect: Rect;
}

export interface Band {
  /** Indices into the lines given, top to bottom. */
  lines: number[];
  /** The label it starts with. */
  label: string;
  /** The start label's top. */
  top: number;
  /** The next question's (or section's) top, when there is one below. */
  end: number | null;
  /** The page's footer top (page number, "Página 3/16"), when one is below. */
  footer: number | null;
  /** Left and right of the question's column. */
  columnLeft: number;
  columnRight: number | null;
  /** Its text, rows top to bottom. */
  text: string;
  /** The lines' union. */
  frame: Rect | null;
  /** The sub-item tapped ("2.1") when the question has numbered parts; then `lines`, `top`, `end`, `text` and
   * `frame` are that part's alone. */
  part: string | null;
  /** What the parts share: the question's lines above its first part. */
  stem: number[];
  stemText: string;
  stemFrame: Rect | null;
}

const { minX, maxX, minY, maxY, midY } = Rects;

/** "Pergunta 3", "Questão 2", "3.", "(2)", "I.2)", "Exercício 4". A table row "Questão 1 2 3 4" is not one, and
 * "2.5 m" or "1.1." are not either. */
const labelPattern =
  /^\s*(?:[*★✱•▪■]\s*)?((?:Questão|Questao|QUESTÃO|QUESTAO|Pergunta|PERGUNTA|Exercício|Exercicio|Problema|Question|Exercise|Problem)\s+(?:\d{1,2}\b|[Il]\b|\|)(?![ \t]+\d{1,2}(?:[ \t]|$))(?![.,]\d)|(?:[IVX]+|[Il1]{1,3})\.\s?\d+\)|\(?[1-9]\d?[.)](?=\s|$))/du;

/** A numbered part of question N: "2.1.", "★ 2.2)", or one of two alternative items, "5.(AE2018)". It needs the
 * closing dot or parenthesis, so a measure ("2.5 m") is not one. */
const partPattern = /^\s*(?:[*★✱•▪■]\s*)?(\d{1,2})\.(?:(\d{1,2})(?:\.|\))|\((AE\d{4})\))(?=\s|$)/du;

const sectionPattern =
  /^\s*(?:GRUPO|Grupo|Group|GROUP|PARTE|Parte|Part|PART|Section|SECTION|Secção|Seccao|SECÇÃO|SECCAO)\s+(?:[IVX]+|[A-D]|\d{1,2})\b/u;

/** A page's running footer: its number, "Página 3/16", "3 / 16", "– FIM –". Windows' OCR reads the slash of
 * "Página 4/ 13" as ",'" or as a 1 ("Página 71 15"): any of those between the two numbers will do. It also splits
 * an exam's footer in two, and "Prova 635/1.ª F." (the exam's code), or "Prova" alone, is a footer on its own. */
const footerPattern =
  /^\s*(?:prova(?:\s+\d{3}\b.*)?|[-–—]?\s*\d{1,3}\s*[-–—]?|\d{1,3}\s*\/\s*\d{1,3}|p[áa]g(?:ina)?\.?\s*\d+.*|.*\bp[áa]gina\s+\d+\s*(?:[/,'’|]+|de|of)?\s*\d+.*|page\s+\d+.*|[-–—]?\s*fim\s*[-–—]?)\s*$/iu;

const optionPattern = /^\s*\(?[A-Ea-e][.)](?:\s*\S|$)/u;

/** Swift's `String.count`, near enough: code points, not UTF-16 units. */
export const characterCount = (text: string) => Array.from(text).length;

const lastBy = <T>(items: readonly T[], test: (item: T) => boolean): T | undefined => {
  for (let index = items.length - 1; index >= 0; index -= 1) if (test(items[index]!)) return items[index];
  return undefined;
};

const minByKey = <T>(items: readonly T[], key: (item: T) => number): T | undefined =>
  items.reduce<T | undefined>((best, item) => (best === undefined || key(item) < key(best) ? item : best), undefined);

export const QuestionBand = {
  /** "2.1" for a line starting "2.1. Averigue…", when it belongs to question `number`. */
  partLabel(text: string, number: number): string | null {
    const match = partPattern.exec(text);
    if (!match || Number(match[1]) !== number) return null;
    const tail = match[2] !== undefined ? match[2] : `(${match[3]})`;
    return `${match[1]}.${tail}`;
  },

  /** "8.5" for any line starting "8.5." / "5.(AE2018)": a part whose own question label sits on another page. */
  anyPart(text: string): string | null {
    const match = partPattern.exec(text);
    if (!match) return null;
    return QuestionBand.partLabel(text, Number(match[1]));
  },

  label(text: string): string | null {
    const match = labelPattern.exec(text);
    // Windows' OCR reads a "1" after the word as "I", "l" or "|" in some fonts ("Pergunta I"): it is 1 (the Mac's
    // Vision reads it right).
    return match ? match[1]!.trim().replace(/^(\p{L}+)\s+[Il|]$/u, "$1 1") : null;
  },

  /** Where the label itself starts on its line: past a mark drawn before it ("★ 3."), estimated from the
   * characters' share of the line's width. */
  labelX(line: BandLine): number {
    const match = labelPattern.exec(line.text) ?? partPattern.exec(line.text);
    const start = match?.indices?.[1]?.[0];
    if (start === undefined || line.text.length === 0 || start <= 0) return minX(line.rect);
    return minX(line.rect) + (line.rect.width * start) / line.text.length;
  },

  /** An answer option ("A. 3 kΩ", "(B) 3e", "c) x = 2"). */
  isOption: (text: string) => optionPattern.test(text),
  isSection: (text: string) => sectionPattern.test(text),
  isFooter: (text: string) => footerPattern.test(text),

  /** The question's number in its label ("Questão 4" → 4, "I.2)" → 2). */
  number(label: string | null | undefined): number | null {
    if (!label) return null;
    const groups = label.split(/\D+/u).filter((piece) => piece !== "");
    const last = groups[groups.length - 1];
    return last === undefined ? null : Number(last);
  },

  /** The typical height of one line of text. */
  lineHeight(lines: readonly BandLine[]): number {
    const heights = lines
      .map((line) => line.rect.height)
      .filter((height) => height > 2)
      .sort((a, b) => a - b);
    return heights.length === 0 ? 16 : Math.max(8, Math.min(40, heights[Math.floor(heights.length / 2)]!));
  },

  /** The question at `point`, or null when no question label is above it in its column (the header, or a page with
   * no numbered questions). */
  select(lines: readonly BandLine[], point: { x: number; y: number }): Band | null {
    // A page that continues a question (its own label is on the page before) has only numbered parts: those are
    // then the labels. Where a page numbers its parts (1.4.), a "(1)" inside a table or a list is an item of the
    // question, not a question.
    const numbersParts = lines.some((line) => QuestionBand.anyPart(line.text) !== null);
    const plain = (text: string) => {
      const found = QuestionBand.label(text);
      return numbersParts && found?.startsWith("(") ? null : found;
    };
    return (
      selectWith(lines, point, plain) ?? selectWith(lines, point, (text) => plain(text) ?? QuestionBand.anyPart(text))
    );
  },

  /** The largest share of the page one question may take before the span is distrusted. */
  maxPageShare: 0.7,

  /** Whether a vertical span looks wrong for one question: most of the page, or less than a line and a half. */
  isSuspect(top: number, bottom: number, pageHeight: number, lineHeight: number): boolean {
    const height = bottom - top;
    return height > pageHeight * QuestionBand.maxPageShare || height < lineHeight * 1.6;
  },

  /**
   * The vertical span of the block of lines around `point`, from the text alone: the fallback when the numbering
   * gave no (or a doubtful) span. It grows up and down through lines that follow each other closely (or are bridged
   * by a `figure`), stops at another question's label, a new section, and never takes the footer. If the block is
   * still most of the page it is retried with tighter spacing.
   */
  segment(
    lines: readonly BandLine[],
    point: { x: number; y: number },
    pageHeight: number,
    figures: readonly Rect[] = [],
  ): { top: number; bottom: number } | null {
    const h = QuestionBand.lineHeight(lines);
    const under = lines.filter((line) => minX(line.rect) - h <= point.x && maxX(line.rect) + h >= point.x);
    if (under.length === 0) return null;
    const spanLeft = Math.min(...under.map((line) => minX(line.rect)));
    const spanRight = Math.max(...under.map((line) => maxX(line.rect)));
    const column = lines
      .filter((line) => {
        const overlap = Math.min(maxX(line.rect), spanRight) - Math.max(minX(line.rect), spanLeft);
        return overlap >= Math.min(line.rect.width, spanRight - spanLeft) * 0.5 && !QuestionBand.isFooter(line.text);
      })
      .sort((a, b) => minY(a.rect) - minY(b.rect));
    if (column.length === 0) return null;
    let anchor = 0;
    column.forEach((line, index) => {
      if (Math.abs(midY(line.rect) - point.y) < Math.abs(midY(column[anchor]!.rect) - point.y)) anchor = index;
    });

    const bridged = (from: number, to: number) => figures.some((figure) => minY(figure) <= to && maxY(figure) >= from);
    const span = (gap: number) => {
      let first = anchor;
      let last = anchor;
      // Up, to the question's own label when it is reached.
      if (QuestionBand.label(column[first]!.text) === null) {
        while (first > 0) {
          const above = column[first - 1]!.rect;
          const here = column[first]!.rect;
          if (minY(here) - maxY(above) > gap && !bridged(maxY(above), minY(here))) break;
          if (QuestionBand.isSection(column[first - 1]!.text)) break;
          first -= 1;
          if (QuestionBand.label(column[first]!.text) !== null) break;
        }
      }
      // Down, to the next label or section.
      while (last < column.length - 1) {
        const here = column[last]!.rect;
        const below = column[last + 1]!.rect;
        if (minY(below) - maxY(here) > gap && !bridged(maxY(here), minY(below))) break;
        const next = column[last + 1]!.text;
        if (QuestionBand.label(next) !== null || QuestionBand.isSection(next)) break;
        last += 1;
      }
      let bottom = maxY(column[last]!.rect);
      // A figure hanging under the last line belongs to it.
      for (const figure of figures) if (minY(figure) <= bottom + gap && maxY(figure) > bottom) bottom = maxY(figure);
      return { top: minY(column[first]!.rect), bottom };
    };
    let result = span(1.8 * h);
    for (const factor of [1.4, 1.1]) {
      if (result.bottom - result.top > pageHeight * QuestionBand.maxPageShare) result = span(factor * h);
    }
    return result;
  },

  /** Lines on the same row joined, rows top to bottom. */
  readingOrder(lines: readonly BandLine[], lineHeight: number): string {
    const rows: BandLine[][] = [];
    for (const line of [...lines].sort((a, b) => midY(a.rect) - midY(b.rect))) {
      const last = rows[rows.length - 1]?.[0];
      if (last && Math.abs(midY(last.rect) - midY(line.rect)) < lineHeight * 0.5) rows[rows.length - 1]!.push(line);
      else rows.push([line]);
    }
    return rows
      .map((row) =>
        [...row]
          .sort((a, b) => minX(a.rect) - minX(b.rect))
          .map((line) => line.text)
          .join(" "),
      )
      .join("\n");
  },
};

function selectWith(
  lines: readonly BandLine[],
  point: { x: number; y: number },
  label: (text: string) => string | null,
): Band | null {
  const h = QuestionBand.lineHeight(lines);
  const labelX = (index: number) => QuestionBand.labelX(lines[index]!);
  const rect = (index: number) => lines[index]!.rect;
  const all = lines.map((_, index) => index);
  // Labels, and the columns their left edges make (an indented "1." inside a question is a list item: only the
  // leftmost labels of a column count). Two labels on one row are a table's cells, or an answer grid, not questions.
  const candidates = all.filter((index) => label(lines[index]!.text) !== null);
  const labelled = candidates.filter(
    (i) => !candidates.some((j) => j !== i && Math.abs(midY(rect(j)) - midY(rect(i))) < h * 0.5),
  );
  if (labelled.length === 0) return null;
  let columns: number[] = [];
  for (const x of labelled.map(labelX).sort((a, b) => a - b)) {
    const last = columns[columns.length - 1];
    if (last !== undefined && x - last < 6 * h) continue;
    columns.push(x);
  }
  // Columns side by side, not a list item's indent or a table's cells: a third of the page apart, with a gutter no
  // line of text crosses.
  const pageWidth =
    (lines.length ? Math.max(...lines.map((line) => maxX(line.rect))) : 0) -
    (lines.length ? Math.min(...lines.map((line) => minX(line.rect))) : 0);
  columns = columns.reduce<number[]>((kept, x) => {
    const last = kept[kept.length - 1];
    if (last === undefined) return [x];
    const crossing = lines.filter((line) => minX(line.rect) < x - h && maxX(line.rect) > x + h).length;
    if (x - last >= Math.max(6 * h, pageWidth * 0.33) && crossing <= 1) kept.push(x);
    return kept;
  }, []);
  const columnLeft = lastBy(columns, (x) => x <= point.x + h) ?? columns[0];
  if (columnLeft === undefined) return null;
  const nextColumn = columns.find((x) => x > columnLeft + h);
  const columnRight = nextColumn === undefined ? null : nextColumn - h;
  const inColumn = (r: Rect) => maxX(r) > columnLeft - 2 * h && (columnRight === null || minX(r) < columnRight);

  const labels = labelled
    .filter((index) => {
      const x = labelX(index);
      const reach = QuestionBand.anyPart(lines[index]!.text) !== null ? 4 : 1.2;
      return x >= columnLeft - h && x <= columnLeft + reach * h && inColumn(rect(index));
    })
    .sort((a, b) => minY(rect(a)) - minY(rect(b)));
  const start = lastBy(labels, (index) => minY(rect(index)) <= point.y + h * 0.5);
  if (start === undefined) return null;
  const startRect = rect(start);
  const startLabel = label(lines[start]!.text) ?? "";

  const after = labels.filter((index) => minY(rect(index)) > minY(startRect) + h * 0.5);
  // The next question: the next number when the numbering can be followed; otherwise the next label at the same
  // indent. (A label further left, a question after a part, ends it too.)
  const startX = labelX(start);
  const sameIndent = after.filter((index) => labelX(index) <= startX + h);
  let endIndex: number | undefined = sameIndent[0] ?? after[0];
  const n = QuestionBand.number(startLabel);
  if (n !== null) {
    const next = after.find((index) => QuestionBand.number(label(lines[index]!.text)) === n + 1);
    if (next !== undefined) {
      endIndex = minByKey(
        [next, endIndex].filter((index): index is number => index !== undefined),
        (index) => minY(rect(index)),
      );
    }
  }
  const section = minByKey(
    all.filter(
      (index) =>
        QuestionBand.isSection(lines[index]!.text) && inColumn(rect(index)) && minY(rect(index)) > maxY(startRect) - 1,
    ),
    (index) => minY(rect(index)),
  );
  const ends = [endIndex, section].filter((index): index is number => index !== undefined).map((i) => minY(rect(i)));
  const end = ends.length ? Math.min(...ends) : null;

  // The footer: a footer-like line below everything else in the band.
  const below = all.filter((index) => {
    const r = rect(index);
    return midY(r) > maxY(startRect) && (end === null || midY(r) < end);
  });
  const contentBottoms = below.filter((i) => !QuestionBand.isFooter(lines[i]!.text)).map((i) => maxY(rect(i)));
  const contentBottom = contentBottoms.length ? Math.max(...contentBottoms) : maxY(startRect);
  const footers = below.filter(
    (index) => QuestionBand.isFooter(lines[index]!.text) && minY(rect(index)) >= contentBottom - h * 0.2,
  );
  const footer = footers.length ? Math.min(...footers.map((index) => minY(rect(index)))) : null;

  const inside = all.filter((index) => {
    const r = rect(index);
    if (midY(r) < minY(startRect) - h * 0.3) return false;
    if (end !== null && midY(r) >= end - h * 0.1) return false;
    if (footer !== null && minY(r) >= footer - 1) return false;
    return inColumn(r);
  });
  const ordered = [...inside].sort((a, b) => minY(rect(a)) - minY(rect(b)));
  const union = (indices: readonly number[]) =>
    indices.reduce<Rect | null>((sum, index) => Rects.union(sum, rect(index)), null);
  const text = (indices: readonly number[]) =>
    QuestionBand.readingOrder(
      indices.map((index) => lines[index]!),
      h,
    );
  const band: Band = {
    lines: ordered,
    label: startLabel,
    top: minY(startRect),
    end,
    footer,
    columnLeft,
    columnRight,
    text: text(ordered),
    frame: union(ordered),
    part: null,
    stem: [],
    stemText: "",
    stemFrame: null,
  };

  // A question with numbered parts (2.1, 2.2): a tap inside a part gives that part alone, with the statement above
  // as its context; a tap on the statement gives the statement alone.
  if (n === null || /^\d+\.\d+$/u.test(startLabel)) return band;
  const parts = ordered.filter(
    (index) => QuestionBand.partLabel(lines[index]!.text, n) !== null && labelX(index) <= columnLeft + 6 * h,
  );
  const firstPart = parts[0];
  if (firstPart === undefined) return band;
  const firstTop = minY(rect(firstPart));
  const stem = ordered.filter((index) => midY(rect(index)) < firstTop - h * 0.1);
  if (point.y < firstTop - h * 0.5) {
    return { ...band, lines: stem, end: firstTop, text: text(stem), frame: union(stem) };
  }
  const tapped = lastBy(parts, (index) => minY(rect(index)) <= point.y + h * 0.5) ?? firstPart;
  const tappedTop = minY(rect(tapped));
  const nextPart = parts.find((index) => minY(rect(index)) > tappedTop + h * 0.5);
  const nextTop = nextPart === undefined ? null : minY(rect(nextPart));
  const mine = ordered.filter(
    (index) => midY(rect(index)) >= tappedTop - h * 0.3 && (nextTop === null || midY(rect(index)) < nextTop - h * 0.1),
  );
  const stemUnion = union(stem);
  return {
    ...band,
    part: QuestionBand.partLabel(lines[tapped]!.text, n),
    lines: mine,
    top: tappedTop,
    end: nextTop ?? end,
    text: text(mine),
    frame: union(mine),
    stem,
    stemText: text(stem),
    stemFrame:
      stem.length && stemUnion ? { ...stemUnion, height: Math.max(stemUnion.height, firstTop - stemUnion.y) } : null,
  };
}
