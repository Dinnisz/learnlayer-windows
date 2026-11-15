// Port of the platform-free parts of LearnLayer/Anywhere/AccessibilityReader.swift and AnywhereController.swift
// @ ref 2026-11-04: a question read from another app, cut to the one the student clicked, and the exam question it
// becomes. On Windows the text comes from UI Automation instead of the Accessibility API.

import type { Rect } from "../pdf/page";
import { inRomanSequence, romanSubPattern, type ExamQuestion } from "../problems/questionDetector";
import { normalizeText } from "../problems/textNormalizer";
import { characterCount } from "./questionBand";

/** A question read from another app at the point the student Alt-clicked. */
export interface ScreenQuestion {
  /** The question's text, as the app exposes it. */
  text: string;
  /** Where it is on screen: global coordinates, top-left origin. */
  frame: Rect;
  appName: string;
  /** The app's identity (its executable on Windows, its bundle on the Mac), when known. */
  bundleID: string | null;
  /** It contains a picture (a circuit, a graph): its text alone isn't enough. */
  hasImage: boolean;
  /** How it was read, for the hit-rate log. */
  method: string;
  /** The text right under the pointer, to tell which part ("b)") was clicked. */
  focus: string;
}

/** What `trimmed` needs of the region found on the picture. */
export interface RegionLabel {
  label: string | null;
  part: string | null;
  hasFigure: boolean;
  text: string;
}

/** The start of a whole question: "Pergunta 3", "Questão 2", "3.", "(2)", "I.2)". */
export const topLabel =
  /^[ \t]*(?:(?:Questão|Questao|Pergunta|Exercício|Exercicio|Problema|Question|Exercise|Problem)\s+\d{1,2}\b|[IVX]+\.\d+\)|\(?\d{1,2}[.)])/gmu;

const matchesOf = (pattern: RegExp, text: string) => [...text.matchAll(new RegExp(pattern.source, pattern.flags))];

const paragraphSeparator = String.fromCharCode(0x2029);

const isBreak = (unit: string) => unit === "\n" || unit === "\r" || unit === paragraphSeparator;

/** `NSString.paragraphRange(for:)` of an empty range at `index`: the paragraph with its line break. */
export function paragraphRange(text: string, index: number): { start: number; end: number } {
  let start = Math.max(0, Math.min(index, text.length));
  while (start > 0 && !isBreak(text[start - 1]!)) start -= 1;
  let end = Math.max(start, Math.min(index, text.length));
  while (end < text.length && !isBreak(text[end]!)) end += 1;
  if (end < text.length) end += text[end] === "\r" && text[end + 1] === "\n" ? 2 : 1;
  return { start, end };
}

/** The question's number in a label ("Questão 4" → 4). */
const numberIn = (label: string): number | null => {
  const groups = label.split(/\D+/u).filter((piece) => piece !== "");
  const last = groups[groups.length - 1];
  return last === undefined ? null : Number(last);
};

export const ScreenQuestions = {
  make(fields: Omit<ScreenQuestion, "focus" | "bundleID"> & Partial<Pick<ScreenQuestion, "focus" | "bundleID">>) {
    return { bundleID: null, focus: "", ...fields } satisfies ScreenQuestion;
  },

  /**
   * From the question label before `index` ("3.", "(a)", "Questão 2", "I.2)") to the next one, or the paragraphs
   * around it when there is none; at most ~2500 characters. Only whole questions start a new one: a sub-part ("b)")
   * stays with its statement, which it needs.
   */
  questionRange(text: string, index: number): { start: number; length: number } {
    const starts = matchesOf(topLabel, text).map((match) => match.index);
    let start: number | undefined;
    for (const location of starts) if (location <= index) start = location;
    if (start !== undefined && index - start < 2500) {
      const from = start;
      const end = starts.find((location) => location > from) ?? Math.min(text.length, from + 2500);
      return { start: from, length: Math.min(end, from + 2500) - from };
    }
    // No label: the paragraph at the point, with the one before it.
    const paragraph = paragraphRange(text, index);
    const before = paragraph.start > 0 ? paragraphRange(text, paragraph.start - 1) : paragraph;
    return { start: before.start, length: Math.min(paragraph.end - before.start, 2500) };
  },

  /**
   * Only the region's question, when the text read through UI Automation runs on into the next one (or starts at the
   * one before); a figure found in the region counts as the question's.
   */
  trimmed(read: ScreenQuestion, region: RegionLabel): ScreenQuestion {
    let kept = read.text;
    const whole = read.text;
    const starts = matchesOf(topLabel, whole);
    const wanted = region.label === null ? null : numberIn(region.label);
    if (starts.length >= 2 && wanted !== null) {
      let index = -1;
      starts.forEach((match, position) => {
        if (numberIn(match[0]) === wanted) index = position;
      });
      if (index >= 0) {
        const from = starts[index]!.index;
        const to = index + 1 < starts.length ? starts[index + 1]!.index : whole.length;
        const part = whole.slice(from, to).trim();
        // Only when the clicked line is in it, otherwise the two readings disagree. A focus longer than the part is
        // the whole page (one block for it), so it says nothing about where the click was.
        const clicked = Array.from(read.focus.trim()).slice(0, 40).join("");
        const focusIsWholeText = characterCount(read.focus) > characterCount(part);
        if (characterCount(part) >= 12 && (clicked === "" || focusIsWholeText || part.includes(clicked))) kept = part;
      }
    }
    // Text that still runs past the question, or starts at another one: the question as it was read from the
    // picture, never the page.
    const regionNumber = numberIn(region.label ?? "");
    if (regionNumber !== null && characterCount(region.text) >= 12) {
      const first = matchesOf(topLabel, kept)[0];
      const leading = first ? numberIn(first[0]) : null;
      const pageSized = characterCount(kept) > Math.max(600, characterCount(region.text) * 2);
      if (pageSized || (leading !== null && leading !== regionNumber)) kept = region.text;
    }
    if (region.part !== null) kept = ScreenQuestions.keepingPart(region.part, kept);
    return {
      text: kept,
      frame: read.frame,
      appName: read.appName,
      bundleID: read.bundleID,
      hasImage: read.hasImage || region.hasFigure,
      method: read.method + "+region",
      focus: read.focus,
    };
  },

  /** A question's text cut to one numbered part ("2.1"): the statement above the first part, then that part alone. */
  keepingPart(part: string, text: string): string {
    const marker = "^[ \\t]*(?:[*★✱•▪■]\\s*)?";
    const all = [...text.matchAll(new RegExp(marker + "\\d{1,2}\\.(?:\\d{1,2}[.)]|\\(AE\\d{4}\\))", "gmu"))];
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const mine = new RegExp(marker + escaped + "(?![0-9])", "mu").exec(text);
    const first = all[0];
    if (!mine || !first) return text;
    const next = all.find((match) => match.index > mine.index);
    const stem = text.slice(0, first.index).trim();
    const body = text.slice(mine.index, next?.index ?? text.length).trim();
    return stem === "" ? body : stem + "\n" + body;
  },

  /** Words that say the question is about a figure: look for one in the picture. */
  mentionsFigure(text: string): boolean {
    const lower = text.toLowerCase();
    return [
      "figura",
      "figure",
      "gráfico",
      "grafico",
      "graph",
      "circuito",
      "circuit",
      "diagrama",
      "diagram",
      "esquema",
      "tabela",
      "table",
      "imagem",
      "image",
    ].some((word) => lower.includes(word));
  },
};

const subPartPattern = new RegExp("^[ \\t]*(\\(?([a-h]|" + romanSubPattern + ")\\))[ \\t]", "gmu");
const leadingLabelPattern =
  /^\s*(?:(?:Questão|Pergunta|Exercício|Question|Exercise|Problem)\s+(\d{1,2})|([IVX]+\.\d+)\)|\(?(\d{1,2}(?:\.\d{1,2})*)[.)]|\(?([a-h])\))/u;

/** "a)", "(b)", "(iii)" at the start of a line, where each part begins. */
function partLabels(text: string): { label: string; location: number }[] {
  const matches = [...text.matchAll(subPartPattern)];
  const kept = inRomanSequence(matches.map((match) => match[2]!));
  return matches.flatMap((match, index) => (kept[index] ? [{ label: match[1]!, location: match.index }] : []));
}

function leadingLabel(text: string): string | null {
  const match = leadingLabelPattern.exec(text);
  if (!match) return null;
  for (const group of [1, 2, 3, 4]) if (match[group] !== undefined) return match[group]!;
  return null;
}

/** `ExamQuestion(screen:)`: its label (if it starts with one) and its text, which is also the whole group. */
export function examQuestionFromScreen(screen: ScreenQuestion): ExamQuestion {
  const text = normalizeText(screen.text);
  const top = leadingLabel(text) ?? "Q";
  // Its parts ("a)", "b)"…), and the one under the pointer: that is the part to work on, with the rest as context.
  const parts = partLabels(text);
  let label = top;
  if (parts.length > 0) {
    const focus = normalizeText(screen.focus).trim();
    const at = focus === "" ? -1 : text.indexOf(Array.from(focus).slice(0, 60).join(""));
    if (at >= 0) {
      let found: { label: string } | undefined;
      for (const part of parts) if (part.location <= at) found = part;
      if (found) label = found.label;
    }
  }
  return {
    label,
    group: top,
    pageIndex: 0,
    labelBounds: { x: 0, y: 0, width: 0, height: 0 },
    bounds: screen.frame,
    text,
    groupText: text,
    groupLabels: parts.length === 0 ? [top] : parts.map((part) => part.label),
    groupBounds: null,
    startsOnPreviousPage: false,
    statementBounds: null,
    statementPageIndex: null,
  };
}

/** One line of `anywhere-log.jsonl`: which apps Alt-click could read. Only counts and app names; never the text. */
export function anywhereLogEntry(found: ScreenQuestion | null, frontApp: string, date: Date = new Date()): string {
  return (
    JSON.stringify({
      date: date.toISOString().replace(/\.\d{3}Z$/u, "Z"),
      app: found?.appName ?? frontApp,
      read: found !== null,
      method: found?.method ?? "",
      characters: found ? characterCount(found.text) : 0,
      hasImage: found?.hasImage ?? false,
    }) + "\n"
  );
}
