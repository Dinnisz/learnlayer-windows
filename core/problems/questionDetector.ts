// Port of LearnLayer/Problems/QuestionDetector.swift @ ref 2026-11-04, against `PageText` (core/pdf/page.ts) in
// place of PDFKit's page.

import { Columns, type ColumnLayout } from "../pdf/columns";
import { lineRange, linesOf, Rects, selectionBounds, selectionIn, type PageText, type Rect } from "../pdf/page";
import { ReadingOrder, type Glyph } from "../pdf/readingOrder";
import { QuestionLabels } from "./questionLabels";
import { mathLettersToPlain, normalizeText } from "./textNormalizer";

/** A numbered exam question (I.1, II.3…) found in a PDF's text: from its label up to the next label or group heading. */
export interface ExamQuestion {
  label: string;
  /** The group it belongs to: "I" for I.1, I.2, I.3. */
  group: string;
  pageIndex: number;
  /** The printed label "I.1)", where a click starts the question flow. */
  labelBounds: Rect;
  /** The whole question, in PDF points. */
  bounds: Rect;
  text: string;
  /** The group's statement and all its questions, so parts are solved together. */
  groupText: string;
  /** Every label in the group, in order ("2", "2(a)", "2(b)"). */
  groupLabels: string[];
  /** The page area the whole group covers, in PDF points. */
  groupBounds: Rect | null;
  /** The group's statement started on the page before (its picture is needed too). */
  startsOnPreviousPage: boolean;
  /** For a part, where its group's shared statement sits on this page, so it is shown with the part. */
  statementBounds: Rect | null;
  /** The page `statementBounds` is on, when not this one. */
  statementPageIndex: number | null;
}

type Kind = "roman" | "alternative" | "decimal" | "nested" | "top" | "named" | "sub";

/** A part of a group that has its own statement ("I.2", "2.1", "(b)"). */
const isPartKind = (kind: Kind) =>
  kind === "sub" || kind === "roman" || kind === "decimal" || kind === "nested" || kind === "alternative";

/** "2.1." / "2.3." at the start of a line. The trailing period may be glued to the next glyph. "2.3.1" is not a part. */
export const decimalPartExpression = /^[ \t]*((\d{1,2})\.\d{1,2}\.)(?!\d)/gm;

/** Lower-case roman part numbers, i to x; none of them is a letter a–h. */
export const romanSubPattern = "i{1,3}|iv|vi{0,3}|ix|x";
const romanValues = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

const patterns: [Kind, RegExp][] = [
  // I.1)  II.3)
  ["roman", /^[ \t]*(([IVX]+)\.(\d+))\)/gm],
  // 5.(AE2018): one of two items in alternative (national exams)
  ["alternative", /^[ \t]*((\d{1,2})\.\(AE\d{4}\))/gm],
  // 2.1.  8.4.  A glued glyph still counts ("2.3.@−1, 0,"), but not "2.3.1".
  ["decimal", decimalPartExpression],
  // 1.2.1   2.3.1.4   at every depth, a part of its own
  ["nested", QuestionLabels.nestedExpression],
  // Questão 1   Pergunta 2 … — not a marks table's header and first cells ("Problema 5 a) 5 b)").
  [
    "named",
    /^[ \t]*((?:Questão|Questao|Pergunta|Exercício|Exercicio|Problema|Question|Exercise|Problem)\s+(\d{1,2}))(?![\p{L}\p{N}_])(?![ \t]+\d)(?!\s+[a-h]\)\s+\d)/gmu,
  ],
  // (1)   1.   2)  …  1o)   2.º)
  ["top", QuestionLabels.topPattern],
  ["top", QuestionLabels.midLineOrdinalExpression],
  // (a)   a)   (i)   (ii)   (iv) as well, kept only when they run as a roman sequence.
  ["sub", new RegExp("^[ \\t]*(\\(?([a-h]|" + romanSubPattern + ")\\))\\s+", "gm")],
];

const headingPattern =
  /^[ \t]*(?:GRUPO|Grupo|GROUP|Group|PARTE|Parte|PART|Part|Secção|Seção|SECÇÃO|SEÇÃO|Section|SECTION)\s+([IVX]+|[A-D])(?![\p{L}\p{N}_])|^[ \t]*([IVX]+)\s+-\s/gmu;
/** The marking scheme at the end of a paper ("COTAÇÕES"): a table of labels, not questions. */
const scoresPattern = /COTAÇÕES|Cotação \(em pontos\)|Cotações/;
/** Page footers ("Prova 715.V1/1.ª F. • Página 5/ 15"), left out of a question's text. */
const footerPattern = /^.*Prova \d{3}.*Página \d+ ?\/ ?\d+.*$/gm;
const subSiblingPattern = new RegExp("^[ \\t]*(\\(?(?:[a-h]|" + romanSubPattern + ")\\))\\s+", "gm");

interface Mark {
  kind: Kind;
  location: number;
  labelStart: number;
  labelEnd: number;
  number: string;
}

interface Labelled {
  mark: Mark;
  label: string;
  group: string;
}

const labelOf = (text: string, mark: Mark) => text.slice(mark.labelStart, mark.labelEnd);

/** Every match of a global pattern from `from` on: where it starts, and its first and second groups. */
function matchesOf(
  pattern: RegExp,
  text: string,
  from = 0,
): { index: number; end: number; group1: [number, number] | null; group2: string }[] {
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags + "d" : pattern.flags + "gd");
  global.lastIndex = from;
  const found: { index: number; end: number; group1: [number, number] | null; group2: string }[] = [];
  for (let match = global.exec(text); match; match = global.exec(text)) {
    const indices = (match as RegExpExecArray & { indices?: ([number, number] | undefined)[] }).indices;
    found.push({
      index: match.index,
      end: match.index + match[0].length,
      group1: indices?.[1] ?? null,
      group2: match[2] ?? "",
    });
    if (match[0] === "") global.lastIndex += 1;
  }
  return found;
}

/** 1 for "i", 4 for "iv"…; null for a letter part. */
export function romanSubValue(number: string): number | null {
  const index = romanValues.indexOf(number);
  return index < 0 ? null : index + 1;
}

/** Whether each part number belongs: a letter always, a roman one only inside a run "(i)", "(ii)"… */
export function inRomanSequence(numbers: readonly string[]): boolean[] {
  const values = numbers.map(romanSubValue);
  return values.map((value, index) => {
    if (value === null) return true;
    if (value === 1) return values.slice(index + 1).includes(2);
    return values.slice(0, index).includes(value - 1);
  });
}

/**
 * Whether the items under the headings are numbered from 1 in each group: a number comes back under another
 * heading, or a group other than the first starts at 1. "GRUPO I 1. 2. 3. GRUPO II 4. 5." numbers on.
 */
export function numberingRestarts(items: readonly { number: string; section: string | null }[]): boolean {
  const seen = new Map<string, string>();
  const firsts = new Map<string, string>();
  for (const item of items) {
    if (item.section === null) continue;
    const other = seen.get(item.number);
    if (other !== undefined && other !== item.section) return true;
    if (other === undefined) seen.set(item.number, item.section);
    if (!firsts.has(item.section)) firsts.set(item.section, item.number);
  }
  const firstGroups = new Set(["I", "A", "1"]);
  return [...firsts].some(([section, number]) => number === "1" && !firstGroups.has(section));
}

/** "1.2.1." or "1.2.1)" → "1.2.1". */
export function withoutTrailingMark(label: string): string {
  return label.endsWith(".") || label.endsWith(")") ? label.slice(0, -1) : label;
}

/**
 * The 4 pt of padding under a question reaches into the next line when the lines are tight: keep the padding off the
 * next label's top (never the question's own text or a figure's edge).
 */
export function withoutNextLineSliver(bounds: Rect, text: Rect, nextLabel: Rect): Rect {
  const padded = bounds.y < text.y && text.y - bounds.y <= 4.5;
  if (!padded || !(Rects.maxY(nextLabel) < text.y + 4.5) || !(Rects.maxY(nextLabel) > bounds.y)) return bounds;
  const bottom = Math.max(Rects.maxY(nextLabel), text.y - 1);
  return { x: bounds.x, y: bottom, width: bounds.width, height: bounds.height - (bottom - bounds.y) };
}

/** A part ends above the next part's label, when the next label is on a line below this one (not beside it). */
export function endingAbove(bounds: Rect, label: Rect, nextLabel: Rect): Rect {
  if (!(nextLabel.height > 0) || !(Rects.maxY(nextLabel) < label.y + 1) || !(Rects.maxY(nextLabel) > bounds.y))
    return bounds;
  return {
    x: bounds.x,
    y: Rects.maxY(nextLabel),
    width: bounds.width,
    height: bounds.height - (Rects.maxY(nextLabel) - bounds.y),
  };
}

/**
 * Parts at the top of a page whose group's statement is on the page before show that statement too: the last
 * question there is the statement itself ("3") or a part that already carries it ("2.2").
 */
export function withCarriedStatement(
  questions: readonly ExamQuestion[],
  last: ExamQuestion,
  previousPageIndex: number,
): ExamQuestion[] {
  let stem: { pageIndex: number; bounds: Rect } | null = null;
  if (last.statementBounds)
    stem = { pageIndex: last.statementPageIndex ?? last.pageIndex, bounds: last.statementBounds };
  else if (last.label === last.group && !Rects.isEmpty(last.bounds))
    stem = { pageIndex: previousPageIndex, bounds: last.bounds };
  if (!stem) return [...questions];
  return questions.map((question) =>
    question.group !== last.group || question.label === question.group || question.statementBounds
      ? question
      : { ...question, statementBounds: stem.bounds, statementPageIndex: stem.pageIndex },
  );
}

const cache = new WeakMap<PageText, ExamQuestion[]>();

/** The question whose printed label is under `point`, if any. */
export function questionWithLabelAt(point: { x: number; y: number }, page: PageText): ExamQuestion | null {
  return questionsOn(page).find((question) => Rects.contains(Rects.inset(question.labelBounds, -4, -4), point)) ?? null;
}

export function questionsOn(page: PageText): ExamQuestion[] {
  const cached = cache.get(page);
  if (cached) return cached;
  const previous = page.index > 0 ? page.page(page.index - 1) : null;
  // Parts at the top of a page ("b)", "c)") continue the last question of the page before; carry its label and statement.
  let carried: { label: string; text: string } | null = null;
  if (previous) {
    const before = questionsOn(previous);
    const last =
      [...before].reverse().find((question) => !question.label.includes("(") && /^\d/.test(question.label)) ??
      before[before.length - 1];
    if (last) carried = { label: last.group, text: last.groupText };
  }
  // A group heading at the foot of the page before whose items are all on this page: they are that group's.
  let trailing: { name: string; bounds: Rect; text: string } | null = null;
  let lastSection: string | null = null;
  if (previous) {
    lastSection = lastHeadingName(previous);
    trailing = trailingHeading(previous);
    if (trailing) carried = { label: trailing.name, text: trailing.text };
  }
  let found = detect(page, carried, trailing?.name ?? lastSection);
  if (previous) {
    if (trailing) {
      const heading = trailing;
      found = found.map((question) =>
        question.group !== heading.name || question.label === question.group || question.statementBounds
          ? question
          : { ...question, statementBounds: heading.bounds, statementPageIndex: previous.index },
      );
    } else {
      const last = [...questionsOn(previous)]
        .reverse()
        .find((question) => question.group === carried?.label && !question.label.includes("("));
      if (last) found = withCarriedStatement(found, last, previous.index);
    }
  }
  cache.set(page, found);
  return found;
}

function withoutFooters(text: string): string {
  return text.replace(footerPattern, "");
}

/** Labels, and which group, of every mark: the result of walking the page in reading order. */
function detect(
  page: PageText,
  carried: { label: string; text: string } | null,
  carriedSection: string | null,
): ExamQuestion[] {
  let raw = page.text;
  // The marking scheme ("COTAÇÕES") ends the questions; a last item above it stays.
  const scores = scoresPattern.exec(raw);
  if (scores) raw = raw.slice(0, scores.index);
  const text = raw;
  let marks: Mark[] = [];
  for (const [kind, pattern] of patterns) {
    for (const match of matchesOf(pattern, text)) {
      if (!match.group1) continue;
      marks.push({
        kind,
        location: match.index,
        labelStart: match.group1[0],
        labelEnd: match.group1[1],
        number: match.group2,
      });
    }
  }
  // A line can match more than one pattern ("1." inside "I.1)"); keep the first kind listed.
  marks.sort((a, b) => a.location - b.location);
  marks = marks.reduce<Mark[]>((kept, mark) => {
    const last = kept[kept.length - 1];
    if (last && (Math.abs(last.location - mark.location) < 2 || last.labelStart === mark.labelStart)) return kept;
    kept.push(mark);
    return kept;
  }, []);
  const subs = marks.map((mark, index) => (mark.kind === "sub" ? index : -1)).filter((index) => index >= 0);
  const romanKept = inRomanSequence(subs.map((index) => marks[index]!.number));
  const strayRoman = new Set(subs.filter((_, position) => !romanKept[position]));
  marks = marks.filter((_, index) => !strayRoman.has(index));
  marks = withoutOptions(marks, text);
  const headings = matchesOf(headingPattern, text).map((match) => {
    const exec = new RegExp(headingPattern.source, "u").exec(text.slice(match.index, match.end));
    return { location: match.index, name: exec?.[1] ?? exec?.[2] ?? null };
  });
  // Papers that number the items of each group from 1 again: an item is its group's ("VII.2").
  const sections = headings.filter((heading) => heading.name !== null).sort((a, b) => a.location - b.location);
  const sectionOf = (location: number): string | null =>
    [...sections].reverse().find((section) => section.location < location)?.name ?? carriedSection;
  const restarting = numberingRestarts(
    marks
      .filter((mark) => mark.kind === "top")
      .map((mark) => ({ number: mark.number, section: sectionOf(mark.location) })),
  );
  // "13." over items in alternative isn't a question, but it still ends the one before.
  const alternativeHeadings = marks
    .filter(
      (mark, index) =>
        mark.kind === "top" &&
        index + 1 < marks.length &&
        marks[index + 1]!.kind === "alternative" &&
        marks[index + 1]!.number === mark.number,
    )
    .map((mark) => mark.location);
  marks = withoutRepeatedLabels(marks, text, restarting ? sectionOf : () => null);
  marks = marks.map((mark) => placed(mark, text, page));
  if (marks.length === 0) return [];
  const pageIndex = page.index;
  // Two columns: the questions are read down the left one, then down the right one.
  const columns = columnLayout(page);
  if (columns) {
    marks = Columns.readingOrder(marks, columns, (mark) => {
      const bounds = selectionBounds(page, mark.labelStart, mark.labelEnd - mark.labelStart);
      return bounds ? { x: Rects.midX(bounds), y: Rects.maxY(bounds) } : null;
    });
  }

  // Roman groups start at their heading ("Grupo II"), if any.
  const groupStarts = new Map<string, number>();
  for (const heading of headings) {
    if (heading.name !== null && !groupStarts.has(heading.name)) groupStarts.set(heading.name, heading.location);
  }

  // Label and group of every mark, walking in reading order.
  const labelled: Labelled[] = [];
  // Items labelled by their group's heading: parts of it, like "I.2)".
  const scoped = new Set<number>();
  let currentTop: string | null = carried?.label ?? null;
  for (const mark of marks) {
    switch (mark.kind) {
      case "roman": {
        const full = labelOf(text, mark);
        labelled.push({ mark, label: full, group: full.split(".")[0]! });
        currentTop = null;
        break;
      }
      case "alternative":
        labelled.push({ mark, label: labelOf(text, mark), group: mark.number });
        currentTop = labelOf(text, mark);
        break;
      case "decimal": {
        // "2.1." → "2.1", in group 2 with its statement.
        const full = labelOf(text, mark).slice(0, -1);
        labelled.push({ mark, label: full, group: mark.number });
        currentTop = full;
        break;
      }
      case "nested": {
        const full = withoutTrailingMark(labelOf(text, mark));
        labelled.push({ mark, label: full, group: mark.number });
        currentTop = full;
        break;
      }
      case "top":
      case "named": {
        const section = mark.kind === "top" && restarting ? sectionOf(mark.location) : null;
        if (section !== null) {
          const label = `${section}.${mark.number}`;
          currentTop = label;
          scoped.add(labelled.length);
          labelled.push({ mark, label, group: section });
        } else {
          currentTop = mark.number;
          labelled.push({ mark, label: mark.number, group: mark.number });
        }
        break;
      }
      case "sub": {
        // "(a)" belongs to the numbered question above it.
        const top = currentTop ?? owningTop(mark.location, marks, text) ?? "";
        const group = top.split(".")[0]!;
        const label = top === "" ? `(${mark.number})` : `${top}(${mark.number})`;
        labelled.push({ mark, label, group: top === "" ? mark.number : group });
        break;
      }
    }
  }

  if (columns) return withGroups(columnQuestions(labelled, columns, page, pageIndex, carried), carried);

  const questions: ExamQuestion[] = [];
  labelled.forEach((item, index) => {
    const start = item.mark.location;
    const nextBoundary = partEnd(
      index,
      labelled,
      text,
      headings.map((heading) => heading.location),
      alternativeHeadings,
    );
    const blockBounds = selectionBounds(page, start, nextBoundary - start);
    const labelBounds = selectionBounds(page, item.mark.labelStart, item.mark.labelEnd - item.mark.labelStart);
    if (!blockBounds || !labelBounds) return;

    // The group runs from its first mark (or heading) to the first mark of another group.
    const firstOfGroup = labelled.find((other) => other.group === item.group)?.mark.location ?? start;
    const groupStart = Math.min(groupStarts.get(item.group) ?? firstOfGroup, firstOfGroup);
    const groupEnd = Math.min(
      ...labelled
        .filter((other) => other.group !== item.group && other.mark.location > groupStart)
        .map((other) => other.mark.location),
      ...alternativeHeadings.filter((location) => location > groupStart),
      text.length,
    );
    let groupText = readingOrder(text, groupStart, Math.max(0, groupEnd - groupStart), page);
    // The statement is on the page before.
    if (carried && item.group === carried.label) groupText = carried.text + "\n" + groupText;

    // A part's group statement: from the group's start to its first part.
    let statementBounds: Rect | null = null;
    const isPart = (position: number) => isPartKind(labelled[position]!.mark.kind) || scoped.has(position);
    if (isPart(index)) {
      const firstPartIndex = labelled.findIndex((other, position) => other.group === item.group && isPart(position));
      const firstPart = firstPartIndex >= 0 ? labelled[firstPartIndex]!.mark.location : -1;
      if (firstPart > groupStart) {
        const statement = selectionBounds(page, groupStart, firstPart - groupStart);
        if (statement && text.slice(groupStart, firstPart).trim() !== "") {
          statementBounds = withFigureEdge(Rects.inset(statement, -6, -4), page);
        }
      }
    }

    let bounds = withFigureEdge(Rects.inset(blockBounds, -6, -4), page);
    const next = labelled[index + 1];
    if (next && next.mark.location === nextBoundary) {
      const nextLabel = selectionBounds(page, next.mark.labelStart, next.mark.labelEnd - next.mark.labelStart);
      if (nextLabel) bounds = withoutNextLineSliver(bounds, blockBounds, nextLabel);
    }
    let body = normalizeText(withoutFooters(readingOrder(text, start, nextBoundary - start, page))).trim();
    // A figure straddling two questions stores its labels after the next question's mark: lines above this label,
    // inside the previous question's height, are that figure's.
    const previous = questions[questions.length - 1];
    if (previous && previous.pageIndex === pageIndex) {
      const own = withoutStrayLines(page, start, nextBoundary - start, labelBounds, previous.bounds);
      if (own) {
        bounds = own.bounds;
        body = normalizeText(withoutFooters(own.text)).trim();
      }
    }
    if (next) {
      const nextLabel = selectionBounds(page, next.mark.labelStart, next.mark.labelEnd - next.mark.labelStart);
      if (nextLabel) bounds = endingAbove(bounds, labelBounds, nextLabel);
    }
    questions.push({
      label: item.label,
      group: item.group,
      pageIndex,
      labelBounds,
      bounds,
      text: body,
      groupText: normalizeText(withoutFooters(groupText)).trim(),
      groupLabels: [],
      groupBounds: null,
      startsOnPreviousPage: false,
      statementBounds,
      statementPageIndex: null,
    });
  });
  return withGroups(questions, carried);
}

/** A figure's frame runs a little below its lowest label: take that edge in when the strip under the text holds no text. */
function withFigureEdge(bounds: Rect, page: PageText): Rect {
  for (const reach of [20, 10]) {
    const strip = Rects.intersection(
      { x: bounds.x, y: bounds.y - reach, width: bounds.width, height: reach },
      page.mediaBox,
    );
    if (!strip || !(strip.height > 4)) continue;
    const inside = selectionIn(page, strip)?.text.trim() ?? "";
    if (inside !== "") continue;
    return { x: bounds.x, y: strip.y, width: bounds.width, height: bounds.height + (bounds.y - strip.y) };
  }
  return bounds;
}

/** The question's own lines, when some are stray: above its label and inside the span of the question before. */
function withoutStrayLines(
  page: PageText,
  start: number,
  length: number,
  label: Rect,
  previous: Rect,
): { bounds: Rect; text: string } | null {
  const lines = linesOf(page, start, length);
  const stray = (line: { bounds: Rect }) => {
    const middle = Rects.midY(line.bounds);
    return middle > Rects.maxY(label) + 2 && middle >= previous.y && middle <= Rects.maxY(previous);
  };
  if (!lines.some(stray) || !lines.some((line) => !stray(line))) return null;
  const kept = lines.filter((line) => !stray(line));
  const union = kept.reduce<Rect | null>((all, line) => Rects.union(all, line.bounds), null);
  return { bounds: Rects.inset(Rects.union(union, label)!, -6, -4), text: kept.map((line) => line.text).join("\n") };
}

/** Each question knows the labels of its whole group, for the model. */
function withGroups(
  questions: readonly ExamQuestion[],
  carried: { label: string; text: string } | null,
): ExamQuestion[] {
  return questions.map((question) => {
    const group = questions.filter((other) => other.group === question.group);
    return {
      ...question,
      groupLabels: group.map((other) => other.label),
      groupBounds: group.reduce<Rect | null>((all, other) => Rects.union(all, other.bounds), null),
      startsOnPreviousPage: carried ? carried.label === question.group : false,
    };
  });
}

/** The columns of a page, or null for one column. */
function columnLayout(page: PageText): ColumnLayout | null {
  const lines = linesOf(page, 0, page.text.length).map((line) => line.bounds);
  return Columns.layout(lines, page.mediaBox.width);
}

/** Questions of a two-column page. Each runs from its label down to the next label in the same column. */
function columnQuestions(
  labelled: readonly Labelled[],
  layout: ColumnLayout,
  page: PageText,
  pageIndex: number,
  carried: { label: string; text: string } | null,
): ExamQuestion[] {
  const anchors = labelled.map((item) =>
    selectionBounds(page, item.mark.labelStart, item.mark.labelEnd - item.mark.labelStart),
  );
  const blocks = anchors.map((anchor, index): { bounds: Rect; text: string } | null => {
    if (!anchor) return null;
    const column = Columns.column(layout, Rects.midX(anchor));
    const next = anchors.find(
      (rect, other) =>
        other > index &&
        rect !== null &&
        Columns.column(layout, Rects.midX(rect)) === column &&
        Rects.midY(rect) < Rects.midY(anchor) - 1,
    );
    const top = Rects.maxY(anchor) + 2;
    const floor = next ? Rects.maxY(next) + 1 : Columns.bottom(layout, column) - 2;
    const sides = Columns.range(layout, column);
    if (!(floor < top)) return null;
    const area = { x: sides[0] - 2, y: floor, width: sides[1] - sides[0] + 4, height: top - floor };
    const selection = selectionIn(page, area);
    if (!selection) return null;
    const text = normalizeText(withoutFooters(selection.text)).trim();
    return { bounds: Rects.inset(Rects.union(selection.bounds, anchor)!, -6, -4), text };
  });
  const questions: ExamQuestion[] = [];
  labelled.forEach((item, index) => {
    const anchor = anchors[index];
    const block = blocks[index];
    if (!anchor || !block) return;
    const members = labelled
      .map((other, position) => (other.group === item.group ? position : -1))
      .filter((position) => position >= 0);
    let groupText = members
      .map((position) => blocks[position]?.text)
      .filter((value): value is string => value !== undefined)
      .join("\n");
    if (carried && item.group === carried.label) groupText = carried.text + "\n" + groupText;
    let statementBounds: Rect | null = null;
    if (item.mark.kind === "sub") {
      const parent = [...members]
        .reverse()
        .find((position) => position < index && labelled[position]!.mark.kind !== "sub");
      const statement = parent !== undefined ? blocks[parent] : null;
      if (statement && statement.text !== "") statementBounds = statement.bounds;
    }
    questions.push({
      label: item.label,
      group: item.group,
      pageIndex,
      labelBounds: anchor,
      bounds: block.bounds,
      text: block.text,
      groupText: groupText.trim(),
      groupLabels: [],
      groupBounds: null,
      startsOnPreviousPage: false,
      statementBounds,
      statementPageIndex: null,
    });
  });
  return questions;
}

/** Where this part's own text ends: the next sibling label or question number in the raw text. */
function partEnd(
  index: number,
  labelled: readonly Labelled[],
  text: string,
  headings: readonly number[],
  alternativeHeadings: readonly number[],
): number {
  const item = labelled[index]!;
  const start = item.mark.location;
  const ends = [
    ...labelled.slice(index + 1).map((other) => other.mark.location),
    ...headings,
    ...alternativeHeadings,
    ...scannedPartBoundaries(item.mark.labelEnd, item.mark.kind, text),
  ].filter((location) => location > start);
  return ends.length > 0 ? Math.min(...ends) : text.length;
}

function scannedPartBoundaries(location: number, kind: Kind, text: string): number[] {
  if (location >= text.length) return [];
  const found: number[] = [];
  const add = (pattern: RegExp) => found.push(...matchesOf(pattern, text, location).map((match) => match.index));
  if (kind === "sub") add(subSiblingPattern);
  if (kind === "sub" || kind === "decimal" || kind === "nested") {
    add(decimalPartExpression);
    add(QuestionLabels.nestedExpression);
  }
  if (kind === "sub" || kind === "decimal" || kind === "nested" || kind === "top") {
    add(QuestionLabels.topPattern);
    for (const [patternKind, pattern] of patterns) {
      if (patternKind === "roman" || patternKind === "named" || patternKind === "alternative") add(pattern);
    }
  }
  return found;
}

/** The numbered or decimal item this alínea continues, when marks are in order. */
function owningTop(location: number, marks: readonly Mark[], text: string): string | null {
  for (const mark of [...marks].reverse()) {
    if (mark.location >= location) continue;
    switch (mark.kind) {
      case "top":
      case "named":
        return mark.number;
      case "decimal":
        return labelOf(text, mark).slice(0, -1);
      case "nested":
        return withoutTrailingMark(labelOf(text, mark));
      case "alternative":
        return labelOf(text, mark);
      case "roman":
        return labelOf(text, mark).split(".")[0]!;
      case "sub":
        continue;
    }
  }
  return null;
}

/**
 * A numbered list inside a statement reuses the labels of the questions after it: when a label comes back later on
 * the page, the earlier one is not a question. Likewise "5." over its two items in alternative.
 */
function withoutRepeatedLabels(
  marks: readonly Mark[],
  text: string,
  section: (location: number) => string | null,
): Mark[] {
  return marks.filter((mark, index) => {
    if (mark.kind !== "top") return true;
    const label = labelOf(text, mark);
    const following = marks[index + 1];
    if (following && following.kind === "alternative" && following.number === mark.number) return false;
    const own = section(mark.location);
    return !marks
      .slice(index + 1)
      .some((other) => other.kind === "top" && labelOf(text, other) === label && section(other.location) === own);
  });
}

/** Where each group heading ("Grupo II", "Secção II") is printed on `page`. */
export function headingBounds(page: PageText): Rect[] {
  return matchesOf(headingPattern, page.text)
    .map((match) => selectionBounds(page, match.index, match.end - match.index))
    .filter((bounds): bounds is Rect => bounds !== null && !Rects.isEmpty(bounds));
}

function headingSections(text: string): { name: string; location: number }[] {
  return matchesOf(headingPattern, text)
    .map((match) => {
      const exec = new RegExp(headingPattern.source, "u").exec(text.slice(match.index, match.end));
      const name = exec?.[1] ?? exec?.[2];
      return name ? { name, location: match.index } : null;
    })
    .filter((entry): entry is { name: string; location: number } => entry !== null)
    .sort((a, b) => a.location - b.location);
}

/** The name of the last group heading printed on `page`, if any. */
export function lastHeadingName(page: PageText): string | null {
  const sections = headingSections(page.text);
  return sections[sections.length - 1]?.name ?? null;
}

/**
 * The last heading of `page` when no item of it is on that page: its statement (from the heading to the end of the
 * page's text, page number left out) belongs to the items at the top of the next page.
 */
export function trailingHeading(page: PageText): { name: string; bounds: Rect; text: string } | null {
  const sections = headingSections(page.text);
  const last = sections[sections.length - 1];
  if (!last) return null;
  const questions = questionsOn(page);
  const heading = selectionBounds(page, last.location, 1);
  // No item of its own on this page, and no item printed under it.
  if (
    !heading ||
    questions.some((question) => question.group === last.name || Rects.maxY(question.labelBounds) < heading.y)
  )
    return null;
  let tail = page.text.slice(last.location);
  // The page number under the text is not the statement's.
  tail = tail.replace(/\s*\n\s*\d{1,3}\s*$/, "").trim();
  if (Array.from(tail).length <= 12) return null;
  const bounds = selectionBounds(page, last.location, tail.length);
  if (!bounds) return null;
  return { name: last.name, bounds: Rects.inset(bounds, -6, -4), text: normalizeText(withoutFooters(tail)) };
}

/**
 * Some PDFs put a label in the text beside the wrong line ("7.3. 2019," where "2019," ends the line of 7.2). Then the
 * question starts at the line printed level with the label, a little further on.
 */
function placed(mark: Mark, text: string, page: PageText): Mark {
  if (mark.kind !== "decimal" && mark.kind !== "nested" && mark.kind !== "top") return mark;
  const label = selectionBounds(page, mark.labelStart, mark.labelEnd - mark.labelStart);
  if (!label || !(label.height > 0)) return mark;
  const tolerance = label.height * 0.6;
  const firstCharacter = (from: number): { index: number; bounds: Rect } | null => {
    let index = from;
    while (index < text.length && /\s/u.test(text[index]!)) index += 1;
    if (index >= text.length) return null;
    const bounds = selectionBounds(page, index, 1);
    return bounds ? { index, bounds } : null;
  };
  const next = firstCharacter(mark.labelEnd);
  if (!next || !(Math.abs(Rects.midY(next.bounds) - Rects.midY(label)) > tolerance)) return mark;
  // Look a few lines on for the line level with the label, right of it.
  let lineStart = lineRange(text, next.index).end;
  for (let step = 0; step < 20 && lineStart < text.length; step += 1) {
    const first = firstCharacter(lineStart);
    if (
      first &&
      Math.abs(Rects.midY(first.bounds) - Rects.midY(label)) <= tolerance &&
      first.bounds.x >= Rects.maxX(label) - 2
    ) {
      return { ...mark, location: first.index };
    }
    lineStart = lineRange(text, lineStart).end;
  }
  return mark;
}

/**
 * Glyphs in x-order, with operators that sat on their own baseline or in a gap put back into the equation, and a
 * stem clause that was stored after the options put back in front of them.
 */
function readingOrder(text: string, start: number, length: number, page: PageText): string {
  if (start < 0 || length < 0 || start + length > text.length) return "";
  const glyphs: Glyph[] = [];
  let index = start;
  while (index < start + length) {
    // A whole character: maths letters (𝑘, 𝑅) are two UTF-16 units, and half of one is dropped.
    const code = text.codePointAt(index)!;
    const unitLength = code > 0xffff ? 2 : 1;
    const character = mathLettersToPlain(text.slice(index, index + unitLength));
    if (character === "\n" || character === "\r") {
      glyphs.push({ x: 0, y: 0, character: "\n" });
      index += unitLength;
      continue;
    }
    const bounds = selectionBounds(page, index, unitLength);
    const isPlaced = (bounds?.width ?? 0) > 0 || (bounds?.height ?? 0) > 0;
    glyphs.push({ x: isPlaced ? bounds!.x : index, y: isPlaced ? Rects.midY(bounds!) : 0, character });
    index += unitLength;
  }
  return ReadingOrder.stemBeforeOptions(ReadingOrder.assemble(ReadingOrder.inserting(operators(glyphs, page), glyphs)));
}

/** Operators whose glyph is missing from the string but still selectable in the gap. */
function operators(glyphs: readonly Glyph[], page: PageText): { x: number; y: number; text: string }[] {
  const ordered = glyphs
    .filter((glyph) => glyph.character !== "\n" && glyph.character !== "\r")
    .sort((a, b) => a.x - b.x);
  const found: { x: number; y: number; text: string }[] = [];
  for (let index = 0; index + 1 < ordered.length; index += 1) {
    const left = ordered[index]!;
    const right = ordered[index + 1]!;
    if (!(Math.abs(left.y - right.y) < 4)) continue;
    if (!(right.x - left.x > 7)) continue;
    const x = (left.x + right.x) / 2;
    const y = (left.y + right.y) / 2;
    const raw = selectionIn(page, { x: x - 3, y: y - 5, width: 6, height: 10 })?.text;
    const sign = raw ? ReadingOrder.operatorText(raw) : null;
    if (sign) found.push({ x, y, text: sign });
  }
  return found;
}

/**
 * Option lists aren't questions. On a page numbered "1.", "2.1." or "I.1)", a "(1)" is an option, and a short "(a)"
 * is a row to match or a gap to fill; a header row "(a) (b) (c) (d)" is never a part.
 */
function withoutOptions(marks: readonly Mark[], text: string): Mark[] {
  const numbered = marks.some((mark) => {
    switch (mark.kind) {
      case "roman":
      case "alternative":
      case "decimal":
      case "nested":
      case "named":
        return true;
      case "top":
        return !labelOf(text, mark).startsWith("(");
      case "sub":
        return false;
    }
  });
  const kept: Mark[] = [];
  marks.forEach((mark, index) => {
    const end = index + 1 < marks.length ? marks[index + 1]!.location : text.length;
    const body = text.slice(mark.labelEnd, Math.max(mark.labelEnd, end));
    // The question this mark would be a part of, and its instructions.
    const owner = [...kept].reverse().find((other) => other.kind !== "sub");
    const instructions = owner ? text.slice(owner.location, mark.location) : "";
    if (mark.kind === "top" && numbered && labelOf(text, mark).startsWith("(")) return;
    if (mark.kind === "sub" && !QuestionLabels.isSubItem(body, instructions, numbered)) return;
    kept.push(mark);
  });
  return kept;
}
