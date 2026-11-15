// Port of LearnLayer/Problems/QuestionPages.swift @ ref 2026-11-04 (the `-fullPages` debug switch is not ported).
// The pictures themselves are drawn by the reader (pdf.js); this decides which pages and which part of each.

import { looksFlattened } from "./flattenedMath";
import { questionsOn, type ExamQuestion } from "./questionDetector";
import { fold, RouteDecision } from "./routeDecision";
import { PassagePages, QuestionText, TextLayerMath, transcriptionLooksGarbled } from "./textChecks";
import { Rects, selectionBounds, type PageText, type Rect } from "../pdf/page";

/** At most this many pages beyond the question's own. */
const maxExtra = 2;

/** A figure, document, text, table, chart or frame named by number. */
export interface Reference {
  /** "figure", "document", "text", "table", "chart" or "frame". */
  kind: string;
  number: number;
}

const sameReference = (a: Reference, b: Reference) => a.kind === b.kind && a.number === b.number;

function kindOf(word: string): string | null {
  const lower = word.toLowerCase();
  if (lower.startsWith("fig")) return "figure";
  if (lower.startsWith("doc")) return "document";
  if (lower.startsWith("text")) return "text";
  if (lower.startsWith("tab")) return "table";
  if (lower.startsWith("gráf") || lower.startsWith("graf")) return "chart";
  if (lower.startsWith("quadro")) return "frame";
  return null;
}

const words =
  "Figuras?|Fig\\.|Documentos?|Docs?\\.|Textos?|Tabelas?|Gr[áa]ficos?|Quadros?|Figures?|Documents?|Texts?|Tables?";

/**
 * A caption or heading: a line that starts with "Figura 1", "Figura 1A –", "Documento 2 (conjunto documental)" or
 * "Texto 1" alone, never a sentence that wraps onto a new line ("Figura 2, são, respetivamente").
 */
const captionPattern = new RegExp("^[ \\t]*(" + words + ")[ \\t]+(\\d{1,2})[A-Z]?[ \\t]*(?:$|[–—:(-])", "gm");

/** "Figura 1", "Figuras 1A e 1B", "documentos 1 e 2", "Doc. 3". */
const mentionPattern = new RegExp(
  "(?<![\\p{L}\\p{N}_])(" + words + ")\\s+(\\d{1,2}[A-Za-z]?(?:\\s*(?:,|e|and)\\s*\\d{1,2}[A-Za-z]?)*)",
  "giu",
);

const unnumberedPattern =
  /(?<![\p{L}\p{N}_])(?:o|no|do|ao|pelo|a|na|da|à|pela|the)\s+(documento|figura|texto|document|figure|text)(?![\p{L}\p{N}_])(?!\s+(?:\d|seguinte|abaixo|below))/giu;

const groupPattern =
  /^[ \t]*(?:GRUPO|Grupo|PARTE|Parte|GROUP|Group|PART|Part)[ \t]+(?:[IVX]+|[A-D])(?![\p{L}\p{N}_])/gmu;

/** The figure words that make a question depend on what's printed near it. */
function mentionsFigure(text: string): boolean {
  const lower = text.toLowerCase();
  return [
    "figura",
    "figure",
    "circuito",
    "circuit",
    "diagrama",
    "diagram",
    "esquema",
    "gráfico",
    "graph",
    "tabela",
    "table",
    "documento",
  ].some((word) => lower.includes(word));
}

const textOf = (question: ExamQuestion) => (question.groupText === "" ? question.text : question.groupText);

export const QuestionPages = {
  /**
   * What of `sent` goes in the picture. The question's page: the question, its group and statement, and the figures
   * on it that the group names. A page of material: the band around each caption the group names (or the caption
   * that opens it). The whole page when a figure is mentioned without a caption to find, the bounds are missing, or
   * the crop is under a quarter of the page (likely mis-detected).
   */
  region(sent: PageText, question: ExamQuestion, questionPage: PageText): Rect {
    const media = sent.mediaBox;
    const text = textOf(question);
    // A comparison prints one excerpt above the item and the other on the page before.
    if (RouteDecision.comparesTwoTexts(text)) return media;
    const named = QuestionPages.references(text);
    const isNamed = (reference: Reference) => named.some((other) => sameReference(other, reference));
    const bands = captionBands(sent);
    let region: Rect | null = null;
    if (sent.index === questionPage.index) {
      // "a figura", "o documento" with no number: it could be anywhere on the page.
      if (unnumberedKinds(text).size > 0 || Rects.isEmpty(question.bounds)) return media;
      let rect = question.groupBounds ? Rects.union(question.groupBounds, question.bounds)! : question.bounds;
      if (question.statementBounds && question.statementPageIndex === null)
        rect = Rects.union(rect, question.statementBounds)!;
      for (const band of bands) if (isNamed(band.reference)) rect = Rects.union(rect, band.rect)!;
      if (named.length === 0 && mentionsFigure(text)) return media;
      region = rect;
    } else if (question.startsOnPreviousPage && sent.index + 1 === questionPage.index) {
      // The page the group's statement starts on: all of it.
      return media;
    } else {
      const wanted = bands.filter((band) => isNamed(band.reference));
      if (wanted.length > 0) region = wanted.reduce<Rect | null>((all, band) => Rects.union(all, band.rect), null);
      else if (opensMaterial(sent) && bands[0]) region = bands[0].rect;
    }
    if (!region || region.height < 0.25 * media.height) return media;
    return Rects.intersection(region, media) ?? media;
  },

  /**
   * The text layer already says all of it: one page, no figure, table or document named, and maths that kept its
   * layout. Such a question goes to the model without its picture.
   */
  textSuffices(question: ExamQuestion, pages: readonly PageText[]): boolean {
    const text = textOf(question);
    if (pages.length !== 1 || question.startsOnPreviousPage || text === "") return false;
    if (QuestionPages.references(text).length > 0 || unnumberedKinds(text).size > 0 || mentionsFigure(text))
      return false;
    return (
      !looksFlattened(text) &&
      !TextLayerMath.looksGarbled(text) &&
      !QuestionText.isGarbledMath(text) &&
      !transcriptionLooksGarbled(text)
    );
  },

  /** Pages beyond the question's own (and the one its statement starts on) go with it: a figure, document or text it relies on. */
  sendsMaterial(pages: readonly PageText[], question: ExamQuestion): boolean {
    const baseline = 1 + (question.startsOnPreviousPage && wantsPreviousPageImage(question) ? 1 : 0);
    return pages.length > baseline;
  },

  pages(question: ExamQuestion, page: PageText): PageText[] {
    const count = page.pageCount();
    const index = page.index;
    const sent = [index];
    // A decimal group already carries the previous page's statement in its text. Another picture of that page is
    // sent only when the item names a figure, a document, a text, or a page, or compares two excerpts.
    if (question.startsOnPreviousPage && index > 0 && wantsPreviousPageImage(question)) sent.push(index - 1);
    const extra: number[] = [];
    const add = (found: number | null | undefined) => {
      if (found == null || sent.includes(found) || extra.includes(found) || extra.length >= maxExtra) return;
      extra.push(found);
    };

    const text = textOf(question);
    for (const found of PassagePages.extraIndexes(index, count, text)) add(found);
    const pageAt = (at: number) => (at === index ? page : page.page(at));
    const captioned = Array.from({ length: count }, (_, at) => captions(pageAt(at)));
    const has = (at: number, reference: Reference) => captioned[at]!.some((other) => sameReference(other, reference));
    for (const reference of QuestionPages.references(text)) {
      // Already on a page being sent.
      if (sent.some((at) => has(at, reference))) continue;
      // The nearest page before the question, else one of the next two.
      let before: number | null = null;
      for (let at = index - 1; at >= 0; at -= 1) {
        if (has(at, reference)) {
          before = at;
          break;
        }
      }
      let after: number | null = null;
      for (let at = index + 1; at < Math.min(count, index + 3); at += 1) {
        if (has(at, reference)) {
          after = at;
          break;
        }
      }
      add(before ?? after);
    }
    // "o documento", "a figura" with no number: the material printed on the page before, when that page has no
    // questions of its own and this page has no such caption.
    const kinds = unnumberedKinds(text);
    if (
      index > 0 &&
      kinds.size > 0 &&
      ![...kinds].some((kind) => captioned[index]!.some((reference) => reference.kind === kind))
    ) {
      const previous = pageAt(index - 1);
      if (previous && questionsOn(previous).length === 0) add(index - 1);
    }
    // The material that opens this part of the paper ("Texto 2" at the top of a page, or a page of texts under
    // "GRUPO I"), which every item after it relies on.
    if (!opensMaterial(page) && !startsGroup(page)) {
      for (let previous = index - 1; previous >= 0; previous -= 1) {
        const candidate = pageAt(previous);
        if (!candidate) break;
        if (opensMaterial(candidate)) {
          add(previous);
          break;
        }
        // A part that opens with its heading and then its texts, no questions.
        if (startsGroup(candidate)) {
          if (questionsOn(candidate).length === 0) add(previous);
          break;
        }
      }
    }
    return [...sent, ...extra]
      .sort((a, b) => a - b)
      .map(pageAt)
      .filter((value): value is PageText => value !== null);
  },

  references(text: string): Reference[] {
    const found: Reference[] = [];
    for (const match of text.matchAll(mentionPattern)) {
      const kind = kindOf(match[1]!);
      if (!kind) continue;
      const numbers = match[2]!
        .split(/\D+/)
        .filter((piece) => piece !== "")
        .map(Number);
      for (const number of numbers) {
        const reference = { kind, number };
        if (!found.some((other) => sameReference(other, reference))) found.push(reference);
      }
    }
    return found;
  },
};

/** Each caption on the page with the band it sits in: from the nearest caption, question label or heading above it to the nearest below. */
function captionBands(page: PageText): { reference: Reference; rect: Rect }[] {
  const raw = page.text;
  const media = page.mediaBox;
  const found: { reference: Reference; bounds: Rect }[] = [];
  for (const match of raw.matchAll(captionPattern)) {
    const word = match[1]!;
    const kind = kindOf(word);
    const number = Number(match[2]);
    const start = match.index + match[0].indexOf(word);
    const bounds = selectionBounds(page, start, word.length);
    if (!kind || !Number.isFinite(number) || !bounds) continue;
    found.push({ reference: { kind, number }, bounds });
  }
  const headings = [...raw.matchAll(groupPattern)]
    .map((match) => selectionBounds(page, match.index, match[0].length))
    .filter((bounds): bounds is Rect => bounds !== null);
  const others = [
    ...found.map((caption) => caption.bounds),
    ...questionsOn(page).map((question) => question.labelBounds),
    ...headings,
  ];
  return found.map(({ reference, bounds }) => {
    const aboveEdges = others.filter((other) => other.y > Rects.maxY(bounds) + 1).map((other) => other.y);
    const belowEdges = others.filter((other) => Rects.maxY(other) < bounds.y - 1).map(Rects.maxY);
    const above = aboveEdges.length > 0 ? Math.min(...aboveEdges) : Rects.maxY(media);
    const below = belowEdges.length > 0 ? Math.max(...belowEdges) : media.y;
    return { reference, rect: { x: media.x, y: below, width: media.width, height: above - below } };
  });
}

/** "2.1" / "8.4": the items of one group, solved from one statement. */
function isDecimalGroup(question: ExamQuestion): boolean {
  return [...question.groupLabels, question.label].some((label) => /^\d{1,2}\.\d{1,2}$/.test(label));
}

/** The previous page's picture. Reading items keep it. A decimal group keeps it only when something printed there is not already in the text. */
function wantsPreviousPageImage(question: ExamQuestion): boolean {
  if (!isDecimalGroup(question)) return true;
  return namesOutsideMaterial(question);
}

/** A named figure, document, text, or page, or a comparison of two excerpts. "gráfico" is the curve the solution draws, not a page to attach. */
function namesOutsideMaterial(question: ExamQuestion): boolean {
  const text = textOf(question);
  if (RouteDecision.comparesTwoTexts(text)) return true;
  if (QuestionPages.references(text).length > 0) return true;
  if (unnumberedKinds(text).size > 0) return true;
  if (PassagePages.referencedPageNumbers(text).length > 0) return true;
  const folded = fold(text);
  return ["figura", "figure", "circuito", "circuit", "diagrama", "diagram", "esquema", "documento", "document"].some(
    (word) => folded.includes(word),
  );
}

function top(page: PageText | null): string {
  return (page?.text ?? "")
    .split("\n")
    .filter((line) => line !== "")
    .slice(0, 3)
    .join("\n");
}

/** The page's first lines hold a caption: the start of a text, figure or document. */
function opensMaterial(page: PageText | null): boolean {
  return new RegExp(captionPattern.source, "m").test(top(page));
}

/** A heading ("GRUPO II", "Part B –") at the top of the page. */
function startsGroup(page: PageText | null): boolean {
  return new RegExp(groupPattern.source, "mu").test(top(page));
}

function captions(page: PageText | null): Reference[] {
  if (!page) return [];
  const found: Reference[] = [];
  for (const match of page.text.matchAll(captionPattern)) {
    const kind = kindOf(match[1]!);
    const number = Number(match[2]);
    if (kind && Number.isFinite(number) && !found.some((other) => sameReference(other, { kind, number })))
      found.push({ kind, number });
  }
  return found;
}

function unnumberedKinds(text: string): Set<string> {
  const kinds = new Set<string>();
  for (const match of text.matchAll(unnumberedPattern)) {
    const kind = kindOf(match[1]!);
    if (kind) kinds.add(kind);
  }
  return kinds;
}
