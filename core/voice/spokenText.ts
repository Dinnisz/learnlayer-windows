// Port of LearnLayer/Voice/SpokenText.swift, SpeechMarkers.extract (LearnLayer/Voice/SpeechSync.swift) and
// NarrationSentences (LearnLayer/Voice/VoiceTutorStream.swift) @ ref 2026-11-04.
//
// Words that can be spoken. A model sometimes leaves Markdown or LaTeX in what it says; the speaker would read the
// marks. This removes them (formulas stay in the drawing). A second pass changes nothing.

import { SpeechPrice } from "./speechPlan";

const greekNames = [
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "varepsilon",
  "zeta",
  "eta",
  "theta",
  "vartheta",
  "iota",
  "kappa",
  "lambda",
  "mu",
  "nu",
  "xi",
  "pi",
  "rho",
  "sigma",
  "tau",
  "upsilon",
  "phi",
  "varphi",
  "chi",
  "psi",
  "omega",
  "Gamma",
  "Delta",
  "Theta",
  "Lambda",
  "Xi",
  "Pi",
  "Sigma",
  "Upsilon",
  "Phi",
  "Psi",
  "Omega",
]
  .sort((a, b) => b.length - a.length)
  .join("|");

/** NSRegularExpression replacement with `$1` templates. */
const replace = (text: string, pattern: RegExp, template: string) => text.replace(pattern, template);

/** `\text{O } \Delta t \text{ é o intervalo}` is prose wrapped in LaTeX: the words are kept. */
function unwrapTextCommands(input: string): string {
  let text = input;
  const pattern =
    /\\(?:text|textrm|textbf|textit|textsf|texttt|textnormal|mathrm|mathbf|mathit|mathsf|emph|mbox|operatorname)\*?\s*\{([^{}]*)\}/gu;
  for (let round = 0; round < 4; round += 1) {
    const next = replace(text, pattern, "$1");
    if (next === text) break;
    text = next;
  }
  return text;
}

/** `\frac{1}{2}` and `\sqrt{\frac{1}{2}}`, innermost braces first. */
function stripLatexCommands(input: string): string {
  let text = input;
  for (let round = 0; round < 8; round += 1) {
    const next = replace(text, /\\[A-Za-z]+(?:\s*\{[^{}]*\})*/gu, " ");
    if (next === text) break;
    text = next;
  }
  return text;
}

const isRule = (trimmed: string) =>
  (trimmed.includes("-") || trimmed.includes("|")) && [...trimmed].every((character) => "|-: \t".includes(character));

/** Headings, quotes, lists, and table rules. A table cell keeps its words. */
function stripLines(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (isRule(line.trim())) return "";
      let next = replace(line, /^[ \t]{0,3}#{1,6}[ \t]+/u, "");
      next = replace(next, /^[ \t]*>[ \t]?/u, "");
      next = replace(next, /^[ \t]*(?:[-*+•]|\d{1,3}[.)])[ \t]+/u, "");
      return next.replaceAll("|", " ");
    })
    .join("\n");
}

function stripEmphasis(input: string): string {
  let text = input;
  const patterns = [
    /\*\*([^*]+)\*\*/gu,
    /__([^_]+)__/gu,
    /(?<![A-Za-z0-9])\*([^*\n]+)\*(?![A-Za-z0-9])/gu,
    /(?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])/gu,
  ];
  for (let round = 0; round < 6; round += 1) {
    const before = text;
    for (const pattern of patterns) text = replace(text, pattern, "$1");
    if (text === before) break;
  }
  return text;
}

export const SpokenText = {
  sanitize(input: string): string {
    let value = input.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
    value = replace(value, /```[\s\S]*?```/gu, " ");
    value = unwrapTextCommands(value);
    value = replace(value, /\$\$[\s\S]*?\$\$/gu, " ");
    value = replace(value, /\\\[[\s\S]*?\\\]/gu, " ");
    value = replace(value, /\\\([\s\S]*?\\\)/gu, " ");
    value = replace(value, /\$[^$\n]*\$/gu, " ");
    value = replace(value, new RegExp(`\\\\(${greekNames})(?![A-Za-z])`, "gu"), " $1 ");
    value = stripLatexCommands(value);
    value = replace(value, /!\[[^\]]*\]\([^)]*\)/gu, " ");
    value = replace(value, /\[([^\]]*)\]\([^)]*\)/gu, "$1");
    value = stripLines(value);
    value = stripEmphasis(value);
    value = replace(value, /[_*#`~|${}\\^]/gu, " ");
    value = replace(value, /\s+/gu, " ");
    value = replace(value, /\s+([.,!?;:…])/gu, "$1");
    return value.trim();
  },

  /** Plain speech, capped at what the chosen speech model will accept. */
  forSpeech(text: string, model: string = SpeechPrice.defaultModel): string {
    return SpeechPrice.billedText(SpeechMarkers.extract(SpokenText.sanitize(text)).spoken, model);
  },
};

/** `[[n]]` in the spoken text, right before the word drawing item n means: cut out before the audio is made. */
export const SpeechMarkers = {
  /** `offsets` is the first token for each item; `mentions` is every token, in order (UTF-16 offsets). */
  extract(spoken: string): {
    spoken: string;
    offsets: Map<number, number>;
    count: number;
    mentions: Map<number, number[]>;
  } {
    const matches = [...spoken.matchAll(/\[\[\s*(\d+)\s*\]\]\s*/gu)];
    const offsets = new Map<number, number>();
    const mentions = new Map<number, number[]>();
    if (matches.length === 0) return { spoken, offsets, count: 0, mentions };
    let result = "";
    let cursor = 0;
    for (const match of matches) {
      if (match.index > cursor) result += spoken.slice(cursor, match.index);
      const item = Number(match[1]);
      if (!offsets.has(item)) offsets.set(item, result.length);
      const said = mentions.get(item) ?? [];
      if (said[said.length - 1] !== result.length) said.push(result.length);
      mentions.set(item, said);
      cursor = match.index + match[0].length;
    }
    if (cursor < spoken.length) result += spoken.slice(cursor);
    return { spoken: result, offsets, count: matches.length, mentions };
  },
};

/** A text said sentence by sentence: each clip is asked for at once, so the first plays while the next is made. */
export const NarrationSentences = {
  shortest: 12,

  split(text: string): string[] {
    const pieces: string[] = [];
    let current = "";
    const characters = Array.from(text);
    characters.forEach((character, index) => {
      current += character;
      const ends = ".!?…".includes(character) && (index + 1 === characters.length || characters[index + 1] === " ");
      if (!ends) return;
      const piece = current.trim();
      if (Array.from(piece).length >= NarrationSentences.shortest) {
        pieces.push(piece);
        current = "";
      }
    });
    const rest = current.trim();
    if (rest !== "") {
      const last = pieces.pop();
      if (Array.from(rest).length < NarrationSentences.shortest && last !== undefined) pieces.push(last + " " + rest);
      else {
        if (last !== undefined) pieces.push(last);
        pieces.push(rest);
      }
    }
    return pieces;
  },
};
