// Port of LearnLayer/Problems/RouteDecision.swift @ ref 2026-11-04

import { ModelRouting } from "../ai/modelRouting";
import { ToolCallMarkup } from "../ai/partialJSON";

/**
 * Which model answers first. A cheap classifier decides. Fast is used when it says the item is reading.
 * `needs_strong` on a reading item still stays fast unless the reason cites a calculation or figure data. Anything
 * else, including a failed classification, is strong. An obvious equation or unit skips the classifier and is strong.
 * Math, physics and chemistry do the same. Garbled OCR and multiple-choice options that repeat each other's wording
 * do too. A comparison across two texts or excerpts does too. A subject never forces the fast model.
 */
export interface RouteOutcome {
  needsStrongModel: boolean;
  /** Shown in the evaluation: "equation", "unit", or the classifier's sentence. */
  reason: string;
  /** reading, calculation, figure_data, mixed, or unclassified. */
  kind: string;
  /** The classifier's reply, when that call ran. */
  classifierJSON: string;
}

export interface Classification {
  kind: string;
  needsStrong: boolean;
  reason: string;
  /** The JSON object the model returned. */
  raw: string;
}

const kinds = new Set(["reading", "calculation", "figure_data", "mixed"]);

const outcome = (needsStrongModel: boolean, reason: string, kind: string, classifierJSON = ""): RouteOutcome => ({
  needsStrongModel,
  reason,
  kind,
  classifierJSON,
});

/** Swift's fold: decomposed, combining marks dropped, case and diacritics folded, lower-cased. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Swift's `isNewline` separators: CRLF, LF, CR, U+2028, U+2029, NEL, VT and FF. */
const lineBreaks = new RegExp(
  "\r\n|[" + [10, 13, 0x2028, 0x2029, 0x85, 0x0b, 0x0c].map((code) => String.fromCharCode(code)).join("") + "]",
);

const isLetter = (character: string) => /\p{L}/u.test(character);
const isWhitespace = (character: string) => /\s/u.test(character);

/** Superscript, subscript and other digits whose Unicode numeric type is "digit" (not decimal). */
const typographicDigit = /[²³¹⁰⁴-⁹₀-₉①-⑨⑴-⑼⒈-⒐⓵-⓽❶-❾➀-➈➊-➒]/u;

export const RouteDecision = {
  kinds,

  /** Reading stays fast. A reading item flagged `needs_strong` stays fast too, unless its reason says the student must calculate or read a figure. */
  isReading(classification: Classification): boolean {
    if (classification.kind !== "reading") return false;
    if (!classification.needsStrong) return true;
    return !RouteDecision.citesCalculationOrFigure(classification.reason);
  },

  /** The JSON object, or null when `kind` is missing or not one of the four. */
  parsed(content: string): Classification | null {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end < start) return null;
    const raw = content.slice(start, end + 1);
    let object: unknown;
    try {
      object = JSON.parse(raw);
    } catch {
      return null;
    }
    if (typeof object !== "object" || object === null || Array.isArray(object)) return null;
    const record = object as Record<string, unknown>;
    const kind = record["kind"];
    if (typeof kind !== "string" || !kinds.has(kind)) return null;
    const needsStrong =
      typeof record["needs_strong"] === "boolean"
        ? record["needs_strong"]
        : typeof record["needsStrong"] === "boolean"
          ? record["needsStrong"]
          : null;
    if (needsStrong === null) return null;
    const reason = typeof record["reason"] === "string" ? record["reason"] : "";
    return { kind, needsStrong, reason, raw };
  },

  /** `QuestionClassifier.parse`: the classifier's reply, tool-call markup unwrapped. */
  parseClassifier(content: string): Classification | null {
    return RouteDecision.parsed(ToolCallMarkup.jsonObject(content) ?? content);
  },

  /**
   * LaTeX, an equation, a unit, garbled OCR, options that repeat each other, or a comparison of two texts. Null for
   * a year, a decree, a line number, or a manuscript. Those go to the classifier.
   */
  hardOverride(groupText: string): RouteOutcome | null {
    if (RouteDecision.comparesTwoTexts(groupText)) return outcome(true, "two texts", "reading");
    const text = westernDigits(groupText);
    if (hasEquation(text)) return outcome(true, "equation", "calculation");
    if (hasUnit(text)) return outcome(true, "unit", "calculation");
    if (isCalculation(text)) return outcome(true, "calculation", "calculation");
    if (isGarbled(groupText)) return outcome(true, "garbled text", "unclassified");
    if (hasNearIdenticalOptions(groupText)) return outcome(true, "similar options", "reading");
    return null;
  },

  /**
   * A subject the app already knows. Maths, physics and chemistry are strong. Biology, geology and the reading
   * subjects start fast. Null for an empty or unfamiliar subject: those still go to the classifier.
   */
  knownSubject(subject: string | null | undefined): RouteOutcome | null {
    switch (ModelRouting.area(subject)) {
      case "math":
      case "physicsChemistry":
        return outcome(true, "known subject", "calculation");
      case "biologyGeology":
        return outcome(false, "known subject", "unclassified");
      case "reading":
        return outcome(false, "known subject", "reading");
      case "other":
        return null;
    }
  },

  /** A null classification (failure, bad JSON, timeout) is strong. A quantitative subject is strong even when the classifier said reading. */
  decide(classification: Classification | null, subject: string | null = null): RouteOutcome {
    const named = subject?.trim();
    const paper = named ? named : null;
    if (paper && RouteDecision.subjectPushesStrong(paper)) {
      return outcome(true, "quantitative subject", classification?.kind ?? "unclassified", classification?.raw ?? "");
    }
    if (!classification || !kinds.has(classification.kind)) {
      return outcome(true, "classifier failed", "unclassified", classification?.raw ?? "");
    }
    const reason = classification.reason.trim();
    if (RouteDecision.isReading(classification)) {
      return outcome(false, reason === "" ? "reading" : reason, "reading", classification.raw);
    }
    return outcome(true, reason === "" ? classification.kind : reason, classification.kind, classification.raw);
  },

  /** The classifier's reason says the work is a calculation or data read from a figure. */
  citesCalculationOrFigure(reason: string): boolean {
    const name = fold(reason);
    const stems = [
      "calcul",
      "comput",
      "equation",
      "equacao",
      "numeric",
      "figure",
      "figura",
      "graph",
      "grafico",
      "diagram",
      "diagrama",
      "table",
      "tabela",
      "chart",
    ];
    return stems.some((stem) => name.includes(stem));
  },

  /** "Compare the two excerpts", "Texto A" with "Texto B", or line ranges cited from two different works. */
  comparesTwoTexts(text: string): boolean {
    const folded = fold(text);
    const compare = /\b(?:compar\w*|contrast\w*|confront\w*|vergleich\w*|cotej\w*)\b/.test(folded);
    if (hasPluralSource(folded) && (compare || lineRangeCount(folded) >= 2)) return true;
    if (compare && hasDistinctTextLabels(folded)) return true;
    if (compare && lineRangesInDifferentSources(folded)) return true;
    return false;
  },

  /** "Math" / "Física" / "Química" / "数学" lean toward the strong model. "História" does not. */
  subjectPushesStrong(subject: string): boolean {
    const name = fold(subject);
    if (name.includes("macs")) return true;
    const stems = ["math", "matem", "phys", "fisic", "chem", "quim", "calc", "algebr", "geometr", "statist"];
    if (stems.some((stem) => name.includes(stem))) return true;
    const native = ["数学", "物理", "化学", "幾何", "几何", "统计", "統計", "رياضيات", "فيزياء", "كيمياء"];
    return native.some((word) => subject.includes(word));
  },
};

/** "dois excertos", "two passages", "both excerpts", "deux extraits". */
function hasPluralSource(folded: string): boolean {
  return /\b(?:dois|duas|two|deux|zwei|both|beiden|ambos|ambas|dos)\s+(?:\w+\s+){0,3}(?:textos|excertos|excerpts|texts|passages|extraits|documents|poemas|poems|fragmentos|pasajes)\b/.test(
    folded,
  );
}

/** "Texto A" and "Texto B", or "Text 1" and "Text 2". */
function hasDistinctTextLabels(folded: string): boolean {
  const labels = new Set<string>();
  for (const match of folded.matchAll(
    /\b(?:texto|text|texte|excerpt|excerto|document|documento|passage|poema|poem)\s+([a-d1-4])\b/g,
  )) {
    labels.add(match[1]!);
  }
  return labels.size >= 2;
}

const lineRangePattern = /\b(?:linhas|lines|lignes|versos|verses|lineas)\s+\d+\s*(?:a|to|–|-|—)\s*\d+\b/g;

function lineRangeCount(folded: string): number {
  return [...folded.matchAll(lineRangePattern)].length;
}

/** Words that name a line or a text in general, not which text it is. */
const genericSourceWords = new Set([
  "compare",
  "compara",
  "comparar",
  "comparez",
  "comparer",
  "comparison",
  "comparacao",
  "contrast",
  "contraste",
  "excerto",
  "excertos",
  "excerpt",
  "excerpts",
  "texto",
  "textos",
  "texte",
  "textes",
  "passage",
  "passages",
  "linhas",
  "lignes",
  "versos",
  "lineas",
  "mesmo",
  "mesma",
  "same",
  "autre",
  "other",
]);

/** "(linhas 11 a 16)" after one title and "(linhas 23 a 27)" after another. */
function lineRangesInDifferentSources(folded: string): boolean {
  const matches = [...folded.matchAll(lineRangePattern)];
  if (matches.length < 2) return false;
  const bags = matches.slice(0, 4).map((match) => wordsBefore(match.index, folded));
  for (let index = 0; index < bags.length; index += 1) {
    for (let other = index + 1; other < bags.length; other += 1) {
      const left = [...bags[index]!].filter((word) => !bags[other]!.has(word) && !genericSourceWords.has(word));
      const right = [...bags[other]!].filter((word) => !bags[index]!.has(word) && !genericSourceWords.has(word));
      if (left.some((word) => word.length >= 6) && right.some((word) => word.length >= 6)) return true;
    }
  }
  return false;
}

function wordsBefore(location: number, text: string): Set<string> {
  const slice = text.slice(Math.max(0, location - 140), location);
  const words = slice.split(/\P{L}+/u).filter((word) => Array.from(word).length >= 6);
  return new Set(words.slice(-14));
}

/** OCR of logic symbols: `P, P Q R R" /`. A year or "(A) (B) (C) (D)" is not this. */
function isGarbled(text: string): boolean {
  if (containsSymbolSoup(text)) return true;
  return text.split(lineBreaks).some(isLowLetterRatio);
}

/** Four or more isolated letters with a quote or a slash in the same run. */
function containsSymbolSoup(text: string): boolean {
  for (const match of text.matchAll(/(?:(?<![A-Za-z])[A-Za-z](?![A-Za-z])[\s,;:."“”«»'/\\]*){4,}/g)) {
    if (Array.from(match[0]).some((character) => '"“”«»/\\'.includes(character))) return true;
  }
  return false;
}

/** A line of punctuation with almost no words, and not a decree or a year. */
function isLowLetterRatio(segment: string): boolean {
  const compact = Array.from(segment).filter((character) => !isWhitespace(character));
  if (compact.length < 8) return false;
  if (segment.split(/\P{L}+/u).some((word) => Array.from(word).length >= 5)) return false;
  const letters = compact.filter(isLetter).length;
  const digits = compact.filter((character) => /\p{N}/u.test(character)).length;
  if (letters < 2 || !(digits / compact.length < 0.4)) return false;
  if (!(letters / compact.length < 0.45)) return false;
  return compact.some((character) => "\"“”'«»/\\|*_=^~`".includes(character));
}

/** "(A) determinada pelo dever" and "(B) conforme ao dever" share most of their words. */
function hasNearIdenticalOptions(text: string): boolean {
  const options = optionTexts(text);
  if (options.length < 2) return false;
  const bags = options.map((option) => new Set(contentWords(option)));
  for (let index = 0; index < bags.length; index += 1) {
    for (let other = index + 1; other < bags.length; other += 1) {
      const left = bags[index]!;
      const right = bags[other]!;
      if (left.size < 2 || right.size < 2) continue;
      const shared = [...left].filter((word) => right.has(word));
      if (!shared.some((word) => word.length >= 4)) continue;
      if (shared.length / Math.min(left.size, right.size) >= 0.5) return true;
    }
  }
  return false;
}

/** Bodies of options that start a line: "(A) …" or "A) …". */
function optionTexts(text: string): string[] {
  const bodies: string[] = [];
  for (const line of text.split(lineBreaks)) {
    const trimmed = line.replace(/^[ \t]+|[ \t]+$/g, "");
    if (trimmed === "" || !/^\(?[A-H]\)/.test(trimmed)) continue;
    bodies.push(...splitOptionLine(trimmed));
  }
  return bodies;
}

function splitOptionLine(line: string): string[] {
  const matches = [...line.matchAll(/(?:^|\s)\(?([A-H])\)\s*/g)];
  const bodies: string[] = [];
  matches.forEach((match, index) => {
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1]!.index : line.length;
    if (end < start) return;
    const body = line.slice(start, end).trim();
    if (body !== "") bodies.push(body);
  });
  return bodies;
}

function contentWords(text: string): string[] {
  return fold(text)
    .split(/\P{L}+/u)
    .filter((word) => Array.from(word).length >= 4);
}

function hasEquation(text: string): boolean {
  if (/\\(?:frac|dfrac|tfrac|int|sum|lim|sqrt|binom|cdot|times|leq|geq|neq|infty)/.test(text)) return true;
  if (/[∫√π∞≤≥≠≈∈∑∏∂∇=^]/u.test(text)) return true;
  if (hasAttachedFormulaDigit(text)) return true;
  if (hasFunctionCall(text)) return true;
  if (hasGluedCoefficient(text)) return true;
  return false;
}

/**
 * f(x): a letter, then '(' with no space before it, then one lowercase variable. "ação (A)", "Estado(A)" have a space
 * or an option letter. "o(s)", "gráfico(s)", "função(ões)" are plural suffixes, not calls.
 */
function hasFunctionCall(text: string): boolean {
  const plurals = new Set(["s", "es", "as", "os", "oes", "ões"]);
  for (const match of text.matchAll(/[A-Za-z]['′]?\(\s*([a-zA-ZÀ-ÿ]{1,3})\s*\)/g)) {
    const inside = match[1]!;
    if (plurals.has(inside) || plurals.has(fold(inside))) continue;
    if (inside.length !== 1 || !/^[a-z]$/.test(inside)) continue;
    return true;
  }
  return false;
}

/** A pH or pOH the student has to calculate. */
function isCalculation(text: string): boolean {
  const folded = fold(text);
  if (!/\b(?:ph|poh)\b/.test(folded)) return false;
  return /\b(?:calcul\w*|determin\w*|compute\w*|valor|concentrac\w*)\b/.test(folded);
}

/** 2x, x2. Not 20o / 20º / 1ª, and not "1820 a". Not a figure label "2A". */
function hasGluedCoefficient(text: string): boolean {
  for (const match of text.matchAll(/\d([a-z])(?![\p{L}\p{N}_])/gu)) {
    if (match[1] === "o") continue;
    return true;
  }
  return /(?<![\p{L}\p{N}_])[A-Za-z]\d/u.test(text);
}

function hasUnit(text: string): boolean {
  if (/(?<![\p{L}\p{N}_])(?:kJ|MJ|kWh|m\/s|km\/h|kg|mol|kPa|MPa|Hz)(?![\p{L}\p{N}_])/u.test(text)) return true;
  if (/\d+(?:[.,]\d+)?\s*(?:km|cm|mm|kg|°C)(?![\p{L}\p{N}_])/u.test(text)) return true;
  return false;
}

/** x² or CO₂. A footnote on a long word is not a formula. */
function hasAttachedFormulaDigit(text: string): boolean {
  const characters = Array.from(text);
  for (let index = 0; index < characters.length; index += 1) {
    if (!typographicDigit.test(characters[index]!)) continue;
    let letters = 0;
    for (let cursor = index - 1; cursor >= 0 && isLetter(characters[cursor]!); cursor -= 1) letters += 1;
    if (letters >= 1 && letters <= 2) return true;
  }
  return false;
}

const fullWidth: Record<string, string> = { "＋": "+", "＊": "*", "／": "/", "＝": "=", "＾": "^" };

/** Digits of any script as 0–9, and full-width operators as ASCII. */
function westernDigits(text: string): string {
  let result = "";
  for (const character of text) {
    if (/\p{Nd}/u.test(character)) {
      result += character >= "0" && character <= "9" ? character : String(digitValue(character.codePointAt(0)!));
      continue;
    }
    result += fullWidth[character] ?? character;
  }
  return result;
}

/** A decimal digit's value: decimal digits come in runs of ten from zero, so it is its place from its run's start. */
function digitValue(code: number): number {
  let start = code;
  while (/\p{Nd}/u.test(String.fromCodePoint(start - 1))) start -= 1;
  return (code - start) % 10;
}
