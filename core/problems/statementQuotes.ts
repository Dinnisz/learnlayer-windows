// Port of LearnLayer/Problems/StatementQuotes.swift @ ref 2026-11-04. Ranges are UTF-16 offsets, as NSRange's.
// (`QuoteColor` is not ported: every underline is the one accent, CLAUDE.md rule 8.)

import type { Part } from "./problemSolution";

/** A UTF-16 range: `start` included, `end` excluded. */
export interface TextRange {
  start: number;
  end: number;
}

/** A quote found in the statement, where it is and its place in the order the steps use the data. */
export interface Underline {
  /** The quote with its spaces evened out, which is what is looked up on the page. */
  quote: string;
  range: TextRange;
  color: number;
}

const isWhitespace = (character: string) => /\s/u.test(character);
const continuesWord = (character: string) => /[\p{L}\p{M}\p{N}]/u.test(character);

const superscripts = Array.from("⁰¹²³⁴⁵⁶⁷⁸⁹");
const subscripts = Array.from("₀₁₂₃₄₅₆₇₈₉");

/** The class of characters a sign may be printed as; null for anything that is not a sign. */
function sign(character: string): string | null {
  switch (character) {
    case "-":
    case "−":
    case "–":
    case "‐":
    case "‑":
      return "[-−–‐‑]";
    case "+":
      return "\\+";
    case "=":
      return "=";
    default:
      return null;
  }
}

const escapeRegExp = (text: string) => text.replace(/[\\^$.*+?()[\]{}|/]/g, (match) => "\\" + match);

/** The mathematical italic letter a PDF may print for a plain one (Cambria Math, STIX: "𝑅𝑇ℎ" for "RTh"). */
function mathItalic(character: string): number | null {
  const code = character.charCodeAt(0);
  if (character.length !== 1) return null;
  if (code >= 0x41 && code <= 0x5a) return 0x1d434 + code - 0x41;
  if (code >= 0x61 && code <= 0x7a) return code === 0x68 ? 0x210e : 0x1d44e + code - 0x61;
  return null;
}

/**
 * A character as a pattern. Circuit sheets set ohm and micro in the Symbol font ("1 kW" for "1 kΩ", "100 F" for
 * "100 µF"). A superscript or subscript digit matches the plain one a page gives out for it ("x3" for "x³"), also
 * after a caret or an underscore, and a plain digit matches the superscript.
 */
function symbolTolerant(character: string): string {
  if (character === "Ω" || character === "Ω") return "[ΩΩW]";
  if (character === "µ" || character === "μ") return "[µμ]?";
  const superscript = superscripts.indexOf(character);
  if (superscript >= 0) return `\\^?[${character}${superscript}]`;
  const subscript = subscripts.indexOf(character);
  if (subscript >= 0) return `_?[${character}${subscript}]`;
  if (/^[0-9]$/.test(character)) return `[${character}${superscripts[Number(character)]}]`;
  const italic = mathItalic(character);
  if (italic !== null) return `[${character}\\u{${italic.toString(16)}}]`;
  return escapeRegExp(character);
}

/**
 * The quote as a pattern, null when it has nothing but spaces. A run of spaces matches any run of them. A sign
 * matches a run of that sign, with or without spaces round it, and a minus any dash a PDF gives out for one.
 */
function pattern(quote: string): string | null {
  let result = "";
  let previous: string | null = null;
  let spaced = false;
  for (const character of quote.trim()) {
    if (isWhitespace(character)) {
      spaced = true;
      continue;
    }
    const own = sign(character);
    if (previous !== null) {
      const before = sign(previous);
      // "−−" or "− −": one sign, already matched as a run.
      if (own !== null && own === before) {
        spaced = false;
        continue;
      }
      if (own !== null || before !== null) result += "\\s*";
      else if (spaced) result += "\\s+";
    }
    result += own !== null ? `${own}+` : symbolTolerant(character);
    previous = character;
    spaced = false;
  }
  return result === "" ? null : result;
}

/** The whole character (code point) that ends at `offset`, and the one that starts there. */
function characterBefore(text: string, offset: number): string {
  const code = text.charCodeAt(offset - 1);
  if (offset >= 2 && code >= 0xdc00 && code <= 0xdfff) return text.slice(offset - 2, offset);
  return text.slice(offset - 1, offset);
}

function characterAt(text: string, offset: number): string {
  return String.fromCodePoint(text.codePointAt(offset)!);
}

/** Nothing that continues a word or a number sits just outside the match on that side. */
function isBoundary(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) return true;
  return !(continuesWord(characterBefore(text, offset)) && continuesWord(characterAt(text, offset)));
}

export const StatementQuotes = {
  /**
   * Every place `quote` stands in `statement`, word for word. Runs of spaces and line breaks count as one space. A
   * quote never starts or ends in the middle of a word or number ("12" is not in "120").
   */
  ranges(quote: string, statement: string): TextRange[] {
    const source = pattern(quote);
    if (statement === "" || source === null) return [];
    let regex: RegExp;
    try {
      regex = new RegExp(source, "gu");
    } catch {
      return [];
    }
    const found: TextRange[] = [];
    for (const match of statement.matchAll(regex)) {
      if (match[0] === "") continue;
      const range = { start: match.index, end: match.index + match[0].length };
      if (isBoundary(statement, range.start) && isBoundary(statement, range.end)) found.push(range);
    }
    return found;
  },

  /**
   * The range near `range` whose text, read back through `read`, is exactly the quote: the page's string and its
   * characters can disagree by a character or two. `range` itself when none within `reach` is.
   */
  aligned(range: TextRange, quote: string, read: (range: TextRange) => string | null, reach = 3): TextRange {
    const shifts = [0];
    for (let step = 1; step <= Math.max(1, reach); step += 1) shifts.push(-step, step);
    for (const shift of shifts) {
      for (const stretch of [0, -1, 1, -2, 2]) {
        const start = range.start + shift;
        const length = range.end - range.start + stretch;
        if (start < 0 || length <= 0) continue;
        const moved = { start, end: start + length };
        const text = read(moved);
        if (!text) continue;
        const characters = Array.from(text);
        if (isWhitespace(characters[0]!) || isWhitespace(characters[characters.length - 1]!)) continue;
        if (StatementQuotes.ranges(quote, text).some((found) => found.start === 0 && found.end === text.length))
          return moved;
      }
    }
    return range;
  },

  /** `text` with each run of one sign written once ("x³ −− 3x² ++ 5" → "x³ − 3x² + 5"). */
  readable(text: string): string {
    let result = "";
    let lastSign: string | null = null;
    let spaced = false;
    for (const character of text) {
      if (isWhitespace(character)) {
        spaced = true;
        continue;
      }
      const own = sign(character);
      if (own !== null && own === lastSign) continue;
      if (spaced && result !== "") result += " ";
      result += character;
      lastSign = own;
      spaced = false;
    }
    return result;
  },

  /** One key per piece of data, so "v0 = 12 m/s" and "v0  =  12 m/s" are the same. */
  key(quote: string): string {
    return quote
      .split(/\s+/u)
      .filter((piece) => piece !== "")
      .join(" ");
  },

  /** A number for each piece of data found in the statement, in the order the steps first use it. */
  palette(steps: readonly (readonly string[])[], statement: string): Map<string, number> {
    const colors = new Map<string, number>();
    let next = 0;
    for (const quotes of steps) {
      for (const quote of quotes) {
        const key = StatementQuotes.key(quote);
        if (key === "" || colors.has(key) || StatementQuotes.ranges(key, statement).length === 0) continue;
        colors.set(key, next);
        next += 1;
      }
    }
    return colors;
  },

  /** The step open on the stage, from 0: the one clicked in the whole solution, the one reached after a hint. */
  openStep(
    isSolution: boolean,
    isHint: boolean,
    selected: number | null,
    current: number,
    count: number,
  ): number | null {
    if (isSolution) return selected !== null && selected >= 0 && selected < count ? selected : null;
    if (isHint && current >= 1 && current <= count) return current - 1;
    return null;
  },

  /** The step whose data is underlined: the one under the pointer, else the open one. */
  shownStep(active: number | null, hovered: number | null): number | null {
    return hovered ?? active;
  },

  /**
   * What is underlined in `statement`: the data of step `step` and any quote of the solution being said now, each
   * at its first place in the statement. A quote the statement doesn't hold, or that has no colour, is skipped.
   */
  underlines(
    steps: readonly (readonly string[])[],
    step: number | null,
    statement: string,
    options: { spoken?: string | null; colors?: Map<string, number> } = {},
  ): Underline[] {
    const colors = options.colors ?? StatementQuotes.palette(steps, statement);
    const quotes: string[] = [];
    if (step !== null && step >= 0 && step < steps.length) quotes.push(...steps[step]!);
    const spoken = options.spoken;
    if (spoken) quotes.push(...steps.flat().filter((quote) => StatementQuotes.ranges(quote, spoken).length > 0));
    const seen = new Set<string>();
    const result: Underline[] = [];
    for (const quote of quotes) {
      const key = StatementQuotes.key(quote);
      if (seen.has(key)) continue;
      seen.add(key);
      const color = colors.get(key);
      const range = StatementQuotes.ranges(key, statement)[0];
      if (color === undefined || !range) continue;
      result.push({ quote: key, range, color });
    }
    return result;
  },

  /** Once `magnified` is shown in a lens, its quote and any underline that runs into the same words are dropped. */
  excluding(magnified: Underline | null, underlines: readonly Underline[]): Underline[] {
    if (!magnified) return [...underlines];
    return underlines.filter(
      (line) =>
        line.quote !== magnified.quote &&
        !(line.range.start < magnified.range.end && magnified.range.start < line.range.end),
    );
  },

  /** True when `quote` is, or shares its words with, one of the quotes ringed or enlarged now (as keys). */
  isEvidence(quote: string, evidence: ReadonlySet<string>): boolean {
    const key = StatementQuotes.key(quote);
    if (key === "") return false;
    return [...evidence].some((shown) => shown !== "" && (shown === key || shown.includes(key) || key.includes(shown)));
  },

  /**
   * Of a step's quotes, those that share words of `statement` with a quote shown on the question, each given in the
   * question's own words, once, in the question's order.
   */
  matching(
    quotes: readonly { quote: string; color: number }[],
    shown: readonly string[],
    statement: string,
  ): { quote: string; color: number }[] {
    const seen = new Set<string>();
    const result: { quote: string; color: number }[] = [];
    for (const quote of shown) {
      let match: { quote: string; color: number } | undefined;
      let words: string;
      const range = StatementQuotes.ranges(quote, statement)[0];
      if (range) {
        words = StatementQuotes.readable(StatementQuotes.key(statement.slice(range.start, range.end)));
        match = quotes.find((step) =>
          StatementQuotes.ranges(step.quote, statement).some(
            (other) => other.start < range.end && range.start < other.end,
          ),
        );
      } else {
        match = quotes.find((step) => StatementQuotes.isEvidence(step.quote, new Set([StatementQuotes.key(quote)])));
        words = StatementQuotes.readable(StatementQuotes.key(quote));
      }
      if (!match || words === "" || seen.has(words)) continue;
      seen.add(words);
      result.push({ quote: words, color: match.color });
    }
    return result;
  },

  /** The sentence of `text` the character at `offset` (UTF-16) is in, or null past the end. */
  sentence(offset: number, text: string): string | null {
    if (offset < 0 || offset >= text.length) return null;
    const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
    for (const segment of segmenter.segment(text)) {
      if (offset >= segment.index && offset < segment.index + segment.segment.length) return segment.segment.trimEnd();
    }
    return null;
  },
};

/** Each step's quotes, in the order the steps are shown (cards, else plain steps, which have none). */
export function stepQuotes(part: Part): string[][] {
  if (part.cards && part.cards.length > 0) return part.cards.map((card) => [...(card.quotes ?? [])]);
  return part.steps.map(() => []);
}

/** What is underlined for each step: its data, then the key words it turns on (`highlight`), once each. */
export function stepMarks(part: Part): string[][] {
  if (!part.cards || part.cards.length === 0) return stepQuotes(part);
  return part.cards.map((card) => {
    const seen = new Set<string>();
    return [...(card.quotes ?? []), ...(card.highlight ?? [])].filter((quote) => {
      const key = StatementQuotes.key(quote);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
}
