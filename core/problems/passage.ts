// Port of LearnLayer/Problems/Passage.swift @ ref 2026-11-04
// (`lines(of: PDFPage)` is `passageLinesOf` in core/pdf/passageLines.ts, against the pure page text, and
// produces the same `PassageLine`s.)

import type { AnswerParagraph, Evidence, Part } from "./problemSolution";

/** One printed line of a source text, with the exam's line number when the text is numbered in its margin. */
export interface PassageLine {
  number: number | null;
  text: string;
}

export interface Marker {
  offset: number;
  number: number;
}

/** A piece of the source shown: its lines flowed into one paragraph, with the exam's line numbers where its printed lines start. */
export interface PassageChunk {
  text: string;
  /** Character offsets where a numbered line (every fifth) starts, and its number. */
  markers: Marker[];
  /** Footnote references that were glued to a word, and where they belong. */
  footnotes: Marker[];
}

/** A quote the solver gave, found in the source: where it is in the passage shown. */
export interface LocatedEvidence {
  index: number;
  evidence: Evidence;
  /** Which piece of the passage, and the characters in its text. */
  chunk: number;
  range: { start: number; end: number };
}

/** What a text answer shows: the passage around its quotes, the quotes found in it, and the paragraphs of the answer. */
export interface EvidenceAnswer {
  chunks: PassageChunk[];
  located: LocatedEvidence[];
  paragraphs: AnswerParagraph[];
}

const isLetter = (character: string | undefined) => character !== undefined && /\p{L}/u.test(character);
const isNumber = (character: string | undefined) => character !== undefined && /\p{N}/u.test(character);
const isLowercase = (character: string | undefined) => character !== undefined && /\p{Ll}/u.test(character);
const count = (text: string) => Array.from(text).length;
/** Swift's `Character.isNewline`: LF, CR, VT, FF, NEL, LINE SEPARATOR, PARAGRAPH SEPARATOR. */
const newlineCodes = new Set([0x0a, 0x0b, 0x0c, 0x0d, 0x85, 0x2028, 0x2029]);
const isNewline = (character: string | undefined) =>
  character !== undefined && newlineCodes.has(character.codePointAt(0)!);

/**
 * A line without the footnote digits printed against a word ("obreiras5"), with where each belonged
 * (offsets in the returned text, counted in characters).
 */
export function splittingFootnotes(line: string): { text: string; notes: Marker[] } {
  const characters = Array.from(line);
  let text = "";
  let length = 0;
  let previous: string | undefined;
  const notes: Marker[] = [];
  let index = 0;
  while (index < characters.length) {
    const character = characters[index]!;
    if (isNumber(character) && isLetter(previous)) {
      let end = index;
      while (end < characters.length && isNumber(characters[end])) end += 1;
      const atEnd = end === characters.length || (!isLetter(characters[end]) && !isNumber(characters[end]));
      const number = Number(characters.slice(index, end).join(""));
      if (end - index <= 2 && atEnd && Number.isInteger(number)) {
        notes.push({ offset: length, number });
        index = end;
        continue;
      }
    }
    text += character;
    length += 1;
    previous = character;
    index += 1;
  }
  return { text, notes };
}

/** The lines as one paragraph: a word split at a line end joined again. */
export function passageChunk(lines: readonly PassageLine[]): PassageChunk {
  let text = "";
  const markers: Marker[] = [];
  const footnotes: Marker[] = [];
  for (const line of lines) {
    const { text: piece, notes } = splittingFootnotes(line.text.replace(/^[ \t]+|[ \t]+$/g, ""));
    if (piece === "") continue;
    if (text.endsWith("-") && isLowercase(Array.from(piece)[0])) {
      text = text.slice(0, -1);
    } else if (text !== "") {
      text += " ";
    }
    if (line.number !== null && line.number % 5 === 0) markers.push({ offset: count(text), number: line.number });
    const base = count(text);
    text += piece;
    footnotes.push(...notes.map((note) => ({ offset: base + note.offset, number: note.number })));
  }
  return { text, markers, footnotes };
}

/** Text with its letters' original positions: lowercase, line-end hyphens joined, quotation marks and brackets gone. */
function normalized(text: string): { chars: string[]; positions: number[] } {
  const characters = Array.from(text);
  const chars: string[] = [];
  const positions: number[] = [];
  let index = 0;
  while (index < characters.length) {
    const character = characters[index]!;
    // "desbo-\ncadamente" → "desbocadamente"
    if ((character === "-" || character === "‐") && isNewline(characters[index + 1])) {
      index += 2;
      continue;
    }
    if ("«»“”„\"'’‘[]…".includes(character)) {
      index += 1;
      continue;
    }
    let mapped = character.toLowerCase();
    if (/\s/u.test(character)) mapped = " ";
    if ("—–‐".includes(character)) mapped = "-";
    if (mapped === " " && (chars.length === 0 || chars[chars.length - 1] === " ")) {
      index += 1;
      continue;
    }
    chars.push(mapped);
    positions.push(index);
    index += 1;
  }
  return { chars, positions };
}

/**
 * Where `quote` is in `text` (character offsets), tolerant of line breaks, hyphenation, quotation marks and
 * spacing; null when it isn't there.
 */
export function locate(quote: string, text: string): { start: number; end: number } | null {
  const haystack = normalized(text);
  const needle = normalized(quote).chars;
  while (needle[needle.length - 1] === " ") needle.pop();
  while (needle[0] === " ") needle.shift();
  if (needle.length < 8 || haystack.chars.length < needle.length) return null;
  outer: for (let start = 0; start <= haystack.chars.length - needle.length; start += 1) {
    if (haystack.chars[start] !== needle[0]) continue;
    for (let offset = 1; offset < needle.length; offset += 1) {
      if (haystack.chars[start + offset] !== needle[offset]) continue outer;
    }
    return { start: haystack.positions[start]!, end: haystack.positions[start + needle.length - 1]! + 1 };
  }
  return null;
}

/** The characters of `text` in `range`, as `locate` counts them. */
export function charactersIn(text: string, range: { start: number; end: number }): string {
  return Array.from(text).slice(range.start, range.end).join("");
}

/**
 * The answer's quotes found in the source and the lines around them (a line of context either side, never the
 * whole page); null when no quote is found, so the plain answer is shown instead.
 */
export function evidenceAnswer(part: Part, source: readonly PassageLine[]): EvidenceAnswer | null {
  const evidence = part.evidence;
  if (!evidence || evidence.length === 0 || source.length === 0) return null;
  const joined = source.map((line) => line.text).join("\n");
  // Each line's first character in the joined text.
  const starts: number[] = [];
  let offset = 0;
  for (const line of source) {
    starts.push(offset);
    offset += count(line.text) + 1;
  }
  const lineAt = (character: number) => {
    let found = 0;
    starts.forEach((start, position) => {
      if (start <= character) found = position;
    });
    return found;
  };
  const found: [number, { start: number; end: number }][] = [];
  evidence.forEach((item, index) => {
    const range = locate(item.quote, joined);
    if (range) found.push([index, range]);
  });
  if (found.length === 0) return null;
  // Each quote's lines and one either side; nearby pieces merge, and a gap between distant ones is marked "…".
  const spans = found
    .map(([, range]): [number, number] => [
      Math.max(0, lineAt(range.start) - 1),
      Math.min(source.length - 1, lineAt(range.end - 1) + 1),
    ])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1] + 3) last[1] = Math.max(last[1], span[1]);
    else merged.push([span[0], span[1]]);
  }
  // Lines the exam numbers belong to the text; unnumbered ones next to them (a heading, the context above) don't.
  const chunks = merged.map(([from, to]) => {
    let lines = source.slice(from, to + 1);
    if (lines.some((line) => line.number !== null)) lines = lines.filter((line) => line.number !== null);
    return passageChunk(lines);
  });
  const located = found
    .flatMap(([index]): LocatedEvidence[] => {
      for (let number = 0; number < chunks.length; number += 1) {
        const range = locate(evidence[index]!.quote, chunks[number]!.text);
        if (range) return [{ index, evidence: evidence[index]!, chunk: number, range }];
      }
      return [];
    })
    .sort((a, b) => a.chunk - b.chunk || a.range.start - b.range.start);
  if (located.length === 0) return null;
  const paragraphs = part.paragraphs
    ? part.paragraphs.filter((paragraph) => paragraph.text !== "")
    : [{ text: part.answer.text, uses: located.map((item) => item.index) }];
  return { chunks, located, paragraphs };
}
