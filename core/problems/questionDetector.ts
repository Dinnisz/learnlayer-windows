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
  // j) … q): a letter past h is kept only after the letter before it (`inLetterSequence`).
  ["sub", new RegExp("^[ \\t]*(\\(?([a-z]|" + romanSubPattern + ")\\))\\s+", "gm")],
  // (f)x+cos x   (i)ex: a part in a grid of formulas, its formula set right against the label.
  ["sub", /^[ \t]*(\(([a-z])\))(?=[\p{L}\d(|√])/gmu],
  // g)3 √x−1   i)3 √x2: a TeX grid's label with a root's index glued on. Kept only inside a run of letters.
  ["sub", /^[ \t]*(([a-z])\))(?=[\d√(|])/gm],
];

const headingPattern =
  /^[ \t]*(?:GRUPO|Grupo|GROUP|Group|PARTE|Parte|PART|Part|Secção|Seção|SECÇÃO|SEÇÃO|Section|SECTION)\s+([IVX]+|[A-D])(?![\p{L}\p{N}_])|^[ \t]*([IVX]+)\s+-\s/gmu;
/** The marking scheme at the end of a paper ("COTAÇÕES"): a table of labels, not questions. */
const scoresPattern = /COTAÇÕES|Cotação \(em pontos\)|Cotações/;
/** Page footers ("Prova 715.V1/1.ª F. • Página 5/ 15"), left out of a question's text. */
const footerPattern = /^.*Prova \d{3}.*Página \d+ ?\/ ?\d+.*$/gm;
const subSiblingPattern = new RegExp("^[ \\t]*(\\(?(?:[a-z]|" + romanSubPattern + ")\\))(?:\\s+|(?=[\\d√(|]))", "gm");

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
    // "(i)" after "(h)" is the ninth letter, not the first roman number; "v)" after "u)", "x)" after "w)" too.
    const before = numbers.slice(0, index);
    if (value === 1 && before.includes("h")) return true;
    if (value === 5 && before.includes("u")) return true;
    if (value === 10 && before.includes("w")) return true;
    if (value === 1) return values.slice(index + 1).includes(2);
    return values.slice(0, index).includes(value - 1);
  });
}

/**
 * Whether each part letter belongs to a run "a)", "b)", …: a–h always (as before), a letter past h only when the
 * letter before it is on the page before it ("j)" after "i)"), and a label glued to its formula ("g)3 √x") only when
 * the letter before it is there too (or it is "a)" with "b)" after it). Roman numbers are left to `inRomanSequence`;
 * "i)" after "h)", "v)" after "u)", "x)" after "w)" are letters (`QuestionDetector.inLetterSequence` @ 5701363).
 */
export function inLetterSequence(numbers: readonly string[], glued: readonly boolean[]): boolean[] {
  return numbers.map((number, index) => {
    if (!/^[a-z]$/.test(number)) return true;
    const before = numbers.slice(0, index);
    const previous = number === "a" ? null : String.fromCharCode(number.charCodeAt(0) - 1);
    const follows = previous !== null ? before.includes(previous) : numbers.slice(index + 1).includes("b");
    const isGlued = index < glued.length && glued[index]!;
    // "i", "v", "x": roman numbers unless the letter before is there.
    if (romanSubValue(number) !== null) return isGlued ? follows : true;
    if (isGlued) return follows;
    return number <= "h" || follows;
  });
}

/**
 * A grid of parts set across both columns under one statement («1. Resolva…» over a)–h) and i)–q)): read column by
 * column, the right column's parts come after the next question («2.») in the left one and were taken for its parts.
 * A part level with a part of the left column, whose letter comes after it, is a part of that one's question
 * (`QuestionDetector.withGridOwners` @ 5701363).
 */
function withGridOwners(labelled: readonly Labelled[], layout: ColumnLayout, page: PageText): Labelled[] {
  const boxes = labelled.map((item) =>
    selectionBounds(page, item.mark.labelStart, item.mark.labelEnd - item.mark.labelStart),
  );
  const out = [...labelled];
  const topOf = (label: string) => label.split("(")[0]!;
  // The question the last right-column part was given, and that part's letter: the next letter follows it.
  let previous: { top: string; group: string; number: string } | null = null;
  labelled.forEach((item, index) => {
    const box = boxes[index];
    if (item.mark.kind !== "sub" || !box || Columns.column(layout, Rects.midX(box)) !== 1) {
      if (item.mark.kind !== "sub") previous = null;
      return;
    }
    const level = labelled.findIndex((other, at) => {
      const rect = boxes[at];
      if (other.mark.kind !== "sub" || !rect || Columns.column(layout, Rects.midX(rect)) !== 0) return false;
      return (
        Math.abs(Rects.midY(rect) - Rects.midY(box)) < Math.max(4, Math.min(rect.height, box.height) * 0.6) &&
        other.mark.number < item.mark.number
      );
    });
    let owner: { top: string; group: string } | null = null;
    if (level >= 0) owner = { top: topOf(labelled[level]!.label), group: labelled[level]!.group };
    else if (
      previous !== null &&
      item.mark.number.length === 1 &&
      item.mark.number.charCodeAt(0) === previous.number.charCodeAt(0) + 1
    )
      // Under the left column's last row: the letter after the part above it.
      owner = { top: previous.top, group: previous.group };
    if (owner && owner.group !== item.group)
      out[index] = { mark: item.mark, label: `${owner.top}(${item.mark.number})`, group: owner.group };
    const kept = out[index]!;
    previous = { top: topOf(kept.label), group: kept.group, number: item.mark.number };
  });
  return out;
}

/** "2.", "1.2." or "(b)" after a space in the middle of a stored line, followed by a space. */
const midLineLabel = /(?<=\S[ \t ])(\d{1,2}(?:\.\d{1,2})?\.|\([a-h]\))(?=[ \t ])/g;

/** The label is printed below the glyph stored before it, or back at the left of the line: a line of its own. */
export function startsVisualLine(label: Rect, previous: Rect): boolean {
  const lineHeight = Math.max(Math.min(label.height, previous.height), 4);
  const below = Rects.midY(label) < Rects.midY(previous) - lineHeight * 0.6;
  const backLeft =
    Rects.minX(label) < Rects.minX(previous) - 40 &&
    Math.abs(Rects.midY(label) - Rects.midY(previous)) > lineHeight * 0.3;
  return below || backLeft;
}

/**
 * A label the text layer stores after other words on the same line ("…dx. 2. Let F", "1.1. 1.2. Determine") that the
 * page prints at the start of a line of its own: the space before it becomes a line break, so the label patterns,
 * which look at line starts, find it. The text keeps its length, so every range still holds. `breaks`: where a line
 * break was put in (`QuestionDetector.withVisualLineBreaks` @ 5701363).
 */
export function withVisualLineBreaks(raw: string, page: PageText): { text: string; breaks: Set<number> } {
  const breaks = new Set<number>();
  const units = raw.split("");
  for (const match of raw.matchAll(midLineLabel)) {
    const start = match.index;
    const space = start - 1;
    if (space <= 0) continue;
    let previous = space - 1;
    while (previous > 0 && /[ \t ]/.test(raw[previous]!)) previous -= 1;
    const labelBox = selectionBounds(page, start, match[1]!.length);
    const before = selectionBounds(page, previous, 1);
    if (!labelBox || !before || labelBox.width <= 0 || before.width <= 0) continue;
    if (startsVisualLine(labelBox, before)) {
      units[space] = "\n";
      breaks.add(space);
    }
  }
  return breaks.size === 0 ? { text: raw, breaks } : { text: units.join(""), breaks };
}

/** The text of the characters whose boxes touch `rect` (PDFKit's `selection(for:)` of a small rectangle). */
function textTouching(page: PageText, rect: Rect): string {
  let text = "";
  page.boxes.forEach((box, index) => {
    const overlaps =
      box !== null &&
      box.x < rect.x + rect.width &&
      rect.x < box.x + box.width &&
      box.y < rect.y + rect.height &&
      rect.y < box.y + box.height;
    if (overlaps) text += page.text[index]!;
  });
  return text;
}

/**
 * A number the text layer stores at the start of a line that the page prints after other words on its line: «3.» of
 * «x0 = 2/3.», a fraction's denominator and its full stop (CDI sheet 1, question 3). Not a question: kept, it hid the
 * real «3.» as a repeat, and question 3's parts were labelled 2(a)… (`withoutMidLineNumbers` @ 5701363).
 */
function withoutMidLineNumbers(marks: readonly Mark[], page: PageText): Mark[] {
  return marks.filter((mark) => {
    if (mark.kind !== "top") return true;
    const box = selectionBounds(page, mark.labelStart, mark.labelEnd - mark.labelStart);
    if (!box || box.width <= 0) return true;
    const before = { x: box.x - 14, y: box.y + box.height * 0.2, width: 13, height: box.height * 0.6 };
    return textTouching(page, before).trim() === "";
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
    lastSection = sectionBefore(page);
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
  // Labels the page prints on lines of their own though the text layer stores them after other words.
  const visual = withVisualLineBreaks(questionText(page), page);
  const text = visual.text;
  let marks = candidateMarks(text, visual.breaks);
  const headings = matchesOf(headingPattern, text).map((match) => {
    const exec = new RegExp(headingPattern.source, "u").exec(text.slice(match.index, match.end));
    return { location: match.index, name: exec?.[1] ?? exec?.[2] ?? null };
  });
  // Papers that number the items of each group from 1 again: an item is its group's ("VII.2").
  const sections = headings.filter((heading) => heading.name !== null).sort((a, b) => a.location - b.location);
  const sectionOf = (location: number): string | null =>
    [...sections].reverse().find((section) => section.location < location)?.name ?? carriedSection;
  // Decided on the whole paper, not page by page: a group whose items are all on one page numbers like the others.
  const numbering = documentNumbering(page);
  const restarting =
    numbering.restarts ||
    numberingRestarts(
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
  marks = withoutNumberedLists(marks, restarting ? sectionOf : () => null);
  marks = withoutMidLineNumbers(marks, page);
  marks = withoutRepeatedLabels(marks, text, restarting ? sectionOf : () => null);
  // A group that numbers on from the one before keeps plain numbers.
  const prefixOf = (location: number) => {
    const section = sectionOf(location);
    return section !== null && numbering.continuing.has(section) ? null : section;
  };
  return labelledQuestions(page, text, marks, headings, alternativeHeadings, restarting, prefixOf, carried);
}

/**
 * The group a page starts in: the last heading printed on any page before it ("GRUPO II" alone on a page, its documents
 * on the next, its items on the one after), or null.
 */
function sectionBefore(page: PageText): string | null {
  for (let index = page.index - 1; index >= 0; index--) {
    const before = page.page(index);
    const name = before ? lastHeadingName(before) : null;
    if (name !== null) return name;
  }
  return null;
}

interface Numbering {
  restarts: boolean;
  /** Groups whose items number on from the group before ("Parte A" 1–3, "Parte B" 4–6): their items keep their own
   * number, with no group prefix. */
  continuing: ReadonlySet<string>;
}

const numberingCache = new WeakMap<PageText, Numbering>();

/**
 * Whether the paper numbers each group's items from 1 again (`numberingRestarts`), over all its pages: a page holding
 * only "2." and "3." of group II still labels them "II.2" and "II.3", like the page with "II.1".
 */
function documentNumbering(page: PageText): Numbering {
  const first = page.index === 0 ? page : page.page(0);
  if (!first) return { restarts: false, continuing: new Set() };
  const cached = numberingCache.get(first);
  if (cached !== undefined) return cached;
  const items: { number: string; section: string | null }[] = [];
  let section: string | null = null;
  for (let index = 0; index < first.pageCount(); index++) {
    const each = index === 0 ? first : first.page(index);
    if (!each) continue;
    const text = questionText(each);
    const headings = headingSections(text);
    const carried = section;
    const sectionOf = (location: number) =>
      [...headings].reverse().find((heading) => heading.location < location)?.name ?? carried;
    const marks = candidateMarks(text).filter((mark) => mark.kind === "top");
    for (const mark of withoutNumberedLists(marks, sectionOf)) {
      items.push({ number: mark.number, section: sectionOf(mark.location) });
    }
    section = headings[headings.length - 1]?.name ?? section;
    // The marking scheme ends the paper's questions.
    if (scoresPattern.test(each.text)) break;
  }
  const numbering = { restarts: numberingRestarts(items), continuing: continuingSections(items) };
  numberingCache.set(first, numbering);
  return numbering;
}

/** The groups chained by their numbering: one whose first item is the item after the last of the group before. */
function continuingSections(items: readonly { number: string; section: string | null }[]): Set<string> {
  const runs: { section: string; first: number; last: number }[] = [];
  for (const item of items) {
    if (item.section === null) continue;
    const value = Number(item.number);
    const run = runs[runs.length - 1];
    if (run && run.section === item.section) run.last = value;
    else runs.push({ section: item.section, first: value, last: value });
  }
  const continuing = new Set<string>();
  runs.forEach((run, index) => {
    const before = runs[index - 1];
    if (before && before.section !== run.section && run.first === before.last + 1) {
      continuing.add(before.section);
      continuing.add(run.section);
    }
  });
  return continuing;
}

/**
 * A numbered list in a group's statement (the steps of a procedure: "1. Marcaram-se… 6. Observou-se…") followed by the
 * group's first item, "1." again: the list's marks are not questions. Only a run 1, 2, … n right before that "1."
 * within the same group.
 */
function withoutNumberedLists(marks: readonly Mark[], section: (location: number) => string | null): Mark[] {
  const tops = marks.filter((mark) => mark.kind === "top");
  const dropped = new Set<Mark>();
  for (const [index, mark] of tops.entries()) {
    if (mark.number !== "1" || index === 0) continue;
    const own = section(mark.location);
    let start = index - 1;
    let expected = Number(tops[start]!.number);
    if (section(tops[start]!.location) !== own || !(expected >= 2)) continue;
    while (start >= 0 && section(tops[start]!.location) === own && Number(tops[start]!.number) === expected) {
      if (expected === 1) break;
      start--;
      expected--;
    }
    if (start < 0 || expected !== 1 || Number(tops[start]!.number) !== 1 || section(tops[start]!.location) !== own) {
      continue;
    }
    for (let at = start; at < index; at++) dropped.add(tops[at]!);
  }
  return marks.filter((mark) => !dropped.has(mark));
}

/** The page's text down to its marking scheme ("COTAÇÕES"), which ends the questions; a last item above it stays. */
function questionText(page: PageText): string {
  const scores = scoresPattern.exec(page.text);
  return scores ? page.text.slice(0, scores.index) : page.text;
}

/**
 * Every printed label that may start a question, in text order, without the options and stray roman numerals.
 * `separated`: where `withVisualLineBreaks` put a line break in before a label.
 */
function candidateMarks(text: string, separated: ReadonlySet<number> = new Set()): Mark[] {
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
  // A label glued to what follows it ("g)3 √x"): not bracketed on the left, and no space after it.
  const glued = subs.map((index) => {
    const mark = marks[index]!;
    return !labelOf(text, mark).startsWith("(") && mark.labelEnd < text.length && !/\s/u.test(text[mark.labelEnd]!);
  });
  const letterKept = inLetterSequence(
    subs.map((index) => marks[index]!.number),
    glued,
  );
  const strayRoman = new Set(subs.filter((_, position) => !romanKept[position] || !letterKept[position]));
  marks = marks.filter((_, index) => !strayRoman.has(index));
  return withoutOptions(marks, text, separated);
}

/** Labels, and which group, of the questions marked on the page. */
function labelledQuestions(
  page: PageText,
  text: string,
  found: Mark[],
  headings: readonly { location: number; name: string | null }[],
  alternativeHeadings: readonly number[],
  restarting: boolean,
  sectionOf: (location: number) => string | null,
  carried: { label: string; text: string } | null,
): ExamQuestion[] {
  let marks = found.map((mark) => placed(mark, text, page));
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

  if (columns)
    return withGroups(
      columnQuestions(withGridOwners(labelled, columns, page), columns, page, pageIndex, carried),
      carried,
    );

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
function withoutOptions(marks: readonly Mark[], text: string, separated: ReadonlySet<number> = new Set()): Mark[] {
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
    // A part label right before a label the page prints on a line of its own ("(a)⏎(b)⏎Figure 1 … Find the maximum
    // height …") has its words stored further on: still a part.
    const beforeSeparated =
      separated.has(mark.labelEnd + (body.startsWith(" ") ? 1 : 0)) || separated.has(mark.labelEnd);
    if (mark.kind === "sub" && !beforeSeparated && !QuestionLabels.isSubItem(body, instructions, numbered)) return;
    kept.push(mark);
  });
  return kept;
}
