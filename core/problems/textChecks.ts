// Port of LearnLayer/Problems/PassagePages.swift, QuestionText.swift, TextLayerMath.swift and
// QuestionTranscription.looksGarbled @ ref 2026-11-04: what the text of a question says about how to read it.

import { fold, RouteDecision } from "./routeDecision";

/** Which PDF pages a question needs, besides the rules that look at captions. Page numbers in the text are 1-based. */
export const PassagePages = {
  /** Indexes to send, including the question's own page. */
  indexesToSend(questionIndex: number, pageCount: number, text: string): number[] {
    if (pageCount <= 0 || questionIndex < 0 || questionIndex >= pageCount) return [];
    return [...PassagePages.extraIndexes(questionIndex, pageCount, text), questionIndex].sort((a, b) => a - b);
  },

  /** 0-based indexes of pages other than the question's own. */
  extraIndexes(questionIndex: number, pageCount: number, text: string): number[] {
    const extra: number[] = [];
    const add = (found: number) => {
      if (found < 0 || found >= pageCount || found === questionIndex || extra.includes(found) || extra.length >= 2)
        return;
      extra.push(found);
    };
    for (const number of PassagePages.referencedPageNumbers(text)) add(number - 1);
    // Port 639 item 2 is printed on page 3; Memorial do Convento is on page 2.
    if (RouteDecision.comparesTwoTexts(text)) add(questionIndex - 1);
    return extra;
  },

  /** "páginas 2 e 3", "pages 2-3", "page 2". "14 Páginas" and "linhas 11 a 16" are not. */
  referencedPageNumbers(text: string): number[] {
    const folded = fold(text);
    const numbers: number[] = [];
    const pattern = /\b(?:paginas?|pages?|pp\.)\s+(\d{1,3})(?:\s*(?:e|and|y|et|und|,|a|to|-|–|—)\s*(\d{1,3}))?/g;
    for (const match of folded.matchAll(pattern)) {
      const start = Number(match[1]);
      if (!(start >= 1 && start <= 200)) continue;
      let end = start;
      if (match[2] !== undefined) {
        const value = Number(match[2]);
        if (value >= start && value - start <= 3) end = value;
      }
      for (let number = start; number <= end; number += 1) if (!numbers.includes(number)) numbers.push(number);
    }
    return numbers;
  },
};

/**
 * The question line shown on the stage. PDF text is kept when it reads cleanly. A broken interval (`[-1, 0]`
 * extracted as `, 1 0- 6@ ,` or `@- 6 10, ,`) is replaced by the solver's own sentence, read from the page image.
 */
export const QuestionText = {
  /** Decimal item labels in reading order, without the trailing period ("2.3"). */
  decimalPartLabels(text: string): string[] {
    return [...text.matchAll(/^[ \t]*((\d{1,2})\.\d{1,2}\.)(?!\d)/gm)].map((match) => match[1]!.slice(0, -1));
  },

  displayed(extracted: string, asks: string | null | undefined): string {
    if (!QuestionText.isGarbledMath(extracted) || asks == null) return extracted;
    const clean = asks.trim();
    if (clean === "" || QuestionText.isGarbledMath(clean)) return extracted;
    const label = QuestionText.leadingLabel(extracted);
    if (label !== null && !fold(clean).trim().startsWith(fold(label).trim())) return `${label} ${clean}`;
    return clean;
  },

  /** `@` standing in for a bracket, next to digits: the text layer's maths did not survive extraction. */
  isGarbledMath(text: string): boolean {
    for (const match of text.matchAll(/(?<![A-Za-z])@(?![A-Za-z])/g)) {
      const characters = Array.from(text);
      // Six characters either side, counted as Swift counts characters.
      const position = Array.from(text.slice(0, match.index)).length;
      const around = characters.slice(Math.max(0, position - 6), position + 1 + 6).join("");
      if (/\p{N}/u.test(around)) return true;
    }
    return false;
  },

  /** "2.3." or "I.1" at the start of the extracted line, kept in front of the ask. */
  leadingLabel(text: string): string | null {
    const match = /^\s*((?:\d{1,2}\.\d{1,2}\.?)|(?:[IVX]+\.\d+\)?)|(?:\d{1,2}[.)]))/.exec(text);
    return match ? match[1]! : null;
  },
};

/** Pieces of a bracket, brace or integral drawn in parts (U+239B…U+23B3), and the integral's two halves. */
const bracketPieces = /[⌠⌡⎛-⎳]/u;

/** Short words of prose that are not maths, in Portuguese and English. */
const shortWords = new Set([
  "a",
  "o",
  "e",
  "é",
  "à",
  "ao",
  "as",
  "os",
  "de",
  "da",
  "do",
  "em",
  "um",
  "se",
  "no",
  "na",
  "ou",
  "que",
  "an",
  "of",
  "to",
  "in",
  "is",
  "if",
  "or",
  "on",
  "at",
  "be",
  "by",
  "it",
]);

/**
 * A PDF text layer whose maths or figure came out as debris, which `FlattenedMath` does not catch: the pieces of a
 * tall bracket, a matrix read row by row, an exponent glued to its base («eAt», «= x2»), a set or root the line
 * cannot hold, a circuit's labels in the sentence. Such text is read from its picture instead.
 */
export const TextLayerMath = {
  looksGarbled(text: string): boolean {
    if (bracketPieces.test(text)) return true;
    if (TextLayerMath.lostTeXSymbols(text)) return true;
    // A backslash before a digit, a space or a bracket is a matrix's bracket, not LaTeX («\{0}» is a set).
    if (/\\(?=[\s\d)]|$)/.test(text)) return true;
    // An exponent set on the line: «eAt», «= x2», «(2−x2)», «(−1)n», «(x+1)2».
    if (
      /\be[A-Z][a-z]\b/.test(text) ||
      /(?:=\s*|[−\-+*/·(])[a-z][23](?![\p{L}\p{N}_(])/u.test(text) ||
      /\)(?:[a-z]|[23])(?![\p{L}\p{N}_(])/u.test(text)
    ) {
      return true;
    }
    // Primes read as zeros by the PDF's font: «y00 + 2y0 + 10y = tet + 1» is y'' + 2y' + 10y = teᵗ + 1. «y00» or
    // «y000» is never a word or a number (lower case only: «S00», «Q00» are states of a circuit).
    if (/(?<![\p{L}\p{N}_])[a-z]0{2,3}(?![\p{L}\p{N}_])/u.test(text)) return true;
    // A set or a root the line cannot hold: set-builder «{x∈R : …}», a union «[∪{2}», a root «√2».
    if (/\{[^{}]*∈[^{}]*[:|]/u.test(text) || /[[\]{}()]\s*∪|∪\s*[[\]{(]/u.test(text) || text.includes("√")) return true;
    // A fraction set on the line: «(4 5 ,g(4 5 ))» is (4/5, g(4/5)), its bar lost and its digits apart.
    if (/[([,;]\s*[−-]?\d+\s+\d+\s*[,;)\]]/u.test(text)) return true;
    const tokens = text.split(/\s+/u).filter((token) => token !== "");
    // Bars that stand alone are the middle of a tall bracket.
    if (tokens.filter((token) => token === "|").length >= 2) return true;
    // A lone letter right after a closing brace or bracket is an exponent or index fallen off its line («} n»).
    for (let index = 1; index < tokens.length; index += 1) {
      const token = tokens[index]!;
      const previous = tokens[index - 1]!;
      if (
        Array.from(token).length === 1 &&
        /\p{L}/u.test(token) &&
        !shortWords.has(token.toLowerCase()) &&
        (previous.endsWith("}") || previous.endsWith("]"))
      ) {
        return true;
      }
    }
    // A matrix row: three or more lone digits in a row.
    if (run(tokens, 3, (token) => /^[−-]?\d$/.test(token))) return true;
    // A figure's labels: «CLK», «1J», «C1», «Q0», «Z», at least two with a letter and a digit.
    if (labelRun(tokens)) return true;
    // Maths with no word of prose for a long stretch; an option's letter («B)») starts a new one.
    return run(tokens, 8, (token) => {
      const bare = token.replace(/^\p{P}+|\p{P}+$/gu, "");
      const isOption = /^\(?[A-Ha-h][.)]$/.test(token);
      return Array.from(token).length <= 2 && !isOption && !shortWords.has(bare.toLowerCase());
    });
  },

  /**
   * A TeX paper whose fonts carry no Unicode map: its symbols come out as other characters — a prime as «f 0(x)», an
   * arrow as «R ! R», «≠» as «6=», «∈» as «x 2 R», a root as «px2», «∀» as «8n» — an exponent sits on the line
   * («x3/2ex»), a symbol is lost («pA () = (2 )», «tg x  x»), and accents are read through the wrong code page
   * («combinaÁ„o», «polinÛmio»), a matrix space loses its «×» («M3 3(R)») (`TextLayerMath.lostTeXSymbols` @ 5701363).
   */
  lostTeXSymbols(text: string): boolean {
    return [
      /(?<![\p{L}\p{N}_])[a-zA-Z] 0\(/u,
      /[\p{L}\p{N}_)] ! [\p{L}\p{N}_(]/u,
      /(?<![\p{N}.])6= ?[\p{L}\p{N}_(−-]/u,
      /(?<![\p{L}\p{N}_])[A-Za-z] 2 [A-Z]/u,
      /(?<![\p{L}\p{N}_])p[xyz]\p{N}*(?![\p{L}\p{N}_])/u,
      /(?<![\p{L}\p{N}_])8[a-z](?![\p{L}\p{N}_])/u,
      /(?<![\p{L}\p{N}_])[a-z]\p{N}\/\p{N}/u,
      /\p{Ll}[ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÛ„]/u,
      /[A-Za-z] \(\s*\)/u,
      /\(\p{N}+ \)/u,
      /(?<![\p{L}\p{N}_])[A-Za-z] {2,}[A-Za-z](?![\p{L}\p{N}_])/u,
      // A space of matrices whose «×» is lost, with «∈» read as «2» before it, words glued: «A2M3 3(R)», «Mn n(R)».
      /(?<![a-z])M[0-9a-z]{1,2} [0-9a-z]{1,2} ?\([RCKQ]\)/u,
    ].some((pattern) => pattern.test(text));
  },
};

function run(tokens: readonly string[], length: number, matches: (token: string) => boolean): boolean {
  let count = 0;
  for (const token of tokens) {
    count = matches(token) ? count + 1 : 0;
    if (count >= length) return true;
  }
  return false;
}

function labelRun(tokens: readonly string[]): boolean {
  let count = 0;
  let mixed = 0;
  for (const token of tokens) {
    if (!/^(?:CLK|[A-Z]{1,2}\d{1,2}|\d{1,2}[A-Z]{1,2}|[A-Z]|\d)$/.test(token)) {
      count = 0;
      mixed = 0;
      continue;
    }
    count += 1;
    if (/\p{N}/u.test(token) && /\p{L}/u.test(token)) mixed += 1;
    if (count >= 4 && mixed >= 2) return true;
  }
  return false;
}

/** Plain characters of prose: letters, digits and the punctuation a question uses. */
const plainCharacter = /[\p{L}\p{M}\p{Nd}.,;:!?()'"\-–—%/°+=<>[\]{}ºª€$]/u;

/**
 * `QuestionTranscription.looksGarbled`: text read through Accessibility that is clearly not prose: formulas that
 * came out as strings of stray symbols and one-letter lines.
 */
export function transcriptionLooksGarbled(text: string): boolean {
  const scalars = Array.from(text).filter((character) => !/\s/u.test(character));
  if (scalars.length < 12) return false;
  const odd = scalars.filter((character) => !plainCharacter.test(character)).length;
  const shortLines = text
    .split("\n")
    .filter((line) => line !== "")
    .filter((line) => Array.from(line.replace(/^[ \t]+|[ \t]+$/g, "")).length <= 2).length;
  return odd / scalars.length > 0.06 || shortLines >= 4;
}
