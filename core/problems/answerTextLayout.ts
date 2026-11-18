// Port of LearnLayer/Math/AnswerLines.swift and LearnLayer/Problems/AnswerTextLayout.swift @ ref 2026-11-04. A long
// answer is one formula, and a narrow stage scales it until it is barely larger than the question: clauses on their own
// lines each fit at the size they were asked for. Each line is then words written out (a part answered in words, "(i)
// Não") or a LaTeX line typeset.

import { isProsePlain, latexToUnicode, undoubledCommands } from "../math/latexText";

const trimSpaces = (text: string) => text.replace(/^[ \t]+|[ \t]+$/gu, "");
const isLetter = (ch: string | undefined) => ch !== undefined && /^\p{L}$/u.test(ch);

export const AnswerLines = {
  /** The answer's clauses, one per line: split at a top-level `;`, at `\quad \text{(ii) …}`, and at a comma followed by
   * LaTeX spacing. The whole answer when it has one clause. */
  clauses(latex: string): string[] {
    const parts: string[] = [];
    let current = "";
    let depth = 0;
    let index = 0;
    const close = () => {
      const piece = trimSpaces(current);
      if (piece !== "") parts.push(piece);
      current = "";
    };
    while (index < latex.length) {
      const character = latex[index]!;
      if (character === "{") {
        depth += 1;
        current += character;
        index += 1;
        continue;
      }
      if (character === "}") {
        depth = Math.max(0, depth - 1);
        current += character;
        index += 1;
        continue;
      }
      if (depth === 0 && character === ";") {
        // A semicolon at the top level ends a clause ("[0,3]; \min").
        close();
        index = skipSpacing(latex, index + 1);
        continue;
      }
      if (depth === 0 && character === "\\") {
        const next = partBreak(latex, index);
        if (next !== null) {
          // `\quad \text{(ii) …}`: the next part starts on its own line.
          close();
          index = next;
          continue;
        }
      }
      if (depth === 0 && character === "," && isClauseBreak(latex, index)) {
        close();
        index = skipSpacing(latex, index + 1);
        continue;
      }
      current += character;
      index += 1;
    }
    close();
    return parts.length > 1 ? parts : [latex];
  },
};

/** A comma starts a new clause when LaTeX spacing follows it (`,\ \text`). A comma inside a number or an interval does
 * not. */
function isClauseBreak(latex: string, mark: number): boolean {
  let index = mark + 1;
  while (index < latex.length && latex[index] === " ") index += 1;
  if (index >= latex.length || latex[index] !== "\\") return false;
  const character = latex[index + 1];
  if (character === undefined) return true;
  return character === " " || character === "\\" || character === "," || character === ";";
}

/** A `\quad` or `\qquad` followed by a part label in words (`\quad \text{(iii) …`) ends a clause. Where the label
 * starts. */
function partBreak(latex: string, mark: number): number | null {
  const match = /^\\q?quad(?![A-Za-z])\s*(?=\\text\{\s*\([a-z]{1,4}\))/iu.exec(latex.slice(mark));
  return match ? mark + match[0].length : null;
}

function skipSpacing(latex: string, start: number): number {
  let index = start;
  while (index < latex.length) {
    if (latex[index] === " ") {
      index += 1;
      continue;
    }
    if (latex[index] === "\\") {
      const next = index + 1;
      if (next < latex.length && isLetter(latex[next])) break;
      index = next < latex.length ? next + 1 : next;
      continue;
    }
    break;
  }
  return index;
}

/** A line of the answer: words written out, or a LaTeX line typeset. */
export type AnswerPiece = { kind: "prose"; line: string } | { kind: "latex"; line: string };

const prose = (line: string): AnswerPiece => ({ kind: "prose", line });
const latexPiece = (line: string): AnswerPiece => ({ kind: "latex", line });

export const AnswerTextLayout = {
  /** Breaks one answer string into display pieces. Splits on `;`, on part labels such as `(a)`, and before
   * implication arrows (`⇒`, `=>`, `→`). */
  pieces(text: string): AnswerPiece[] {
    const trimmed = text.trim();
    if (trimmed === "") return [];
    if (trimmed.includes("\\") || trimmed.includes("^{") || trimmed.includes("_")) {
      // Each `\\` row on its own line; a row of words with only plain maths between them is written out, the rest
      // stays typeset.
      return latexRows(undoubledCommands(trimmed)).flatMap((row) => {
        if (AnswerTextLayout.isWordsRow(row)) {
          const words = tidiedWords(latexToUnicode(row));
          return words === "" ? [] : [prose(words)];
        }
        return splitLatex(row).map(latexPiece);
      });
    }
    return splitProse(trimmed).map(prose);
  },

  /** Words in \text{…} and nothing outside them that Unicode can't write faithfully: no scripts, fractions, roots or
   * limits ("0 \text{ e } +\infty"). */
  isWordsRow(latex: string): boolean {
    const textGroup = /\\(?:text|textbf|textit|mathrm)\{[^{}]*\}/gu;
    if (!textGroup.test(latex)) return false;
    const rest = latex
      .replace(textGroup, "")
      .replace(
        /\\(?:infty|pi|to|cdot|times|le|leq|ge|geq|neq|ne|approx|pm|in|notin|quad|qquad|alpha|beta|theta|lambda|mu|sigma|Rightarrow|Leftrightarrow)(?![A-Za-z])|\\[ ,;:!]/gu,
        "",
      );
    return !/[\\^_{}]/u.test(rest);
  },

  /** Lines set in the body font rather than the maths italic: long prose, or a part answered in words ("(i) Não",
   * "(iv) 0 e e"). */
  isProseLine(line: string): boolean {
    return isProsePlain(line) || /^\([a-z]{1,4}\)\s/iu.test(line);
  },
};

/** Rows split at top-level `\\`, except inside an environment (a table or cases keep their rows together). */
function latexRows(latex: string): string[] {
  if (latex.includes("\\begin")) return [latex];
  return latex
    .split("\\\\")
    .map((row) => row.trim())
    .filter((row) => row !== "");
}

/** A written-out row reads as a sentence: "x = −1", and no clause mark left at the end ("(i) Não;"). */
function tidiedWords(words: string): string {
  return trimSpaces(words.replace(/\s*(?<![<>!=])=(?!=)\s*/gu, " = ").replace(/[;,]\s*$/u, ""));
}

function splitProse(text: string): string[] {
  let chunks = [text];
  for (const separator of [";", " ⇒ ", " => ", " → ", " -> "])
    chunks = chunks.flatMap((chunk) => chunk.split(separator));
  chunks = chunks.flatMap(splitPartLabels);
  return chunks.map((chunk) => chunk.trim()).filter((chunk) => chunk !== "");
}

function splitPartLabels(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (const match of text.matchAll(/(?<=\)|\])\s*(?=\([a-z]\))/giu)) {
    if (match.index > start) parts.push(text.slice(start, match.index));
    start = match.index;
  }
  if (start < text.length) parts.push(text.slice(start));
  return parts.length === 0 ? [text] : parts;
}

function splitLatex(text: string): string[] {
  let lines = [text];
  for (const separator of [";", " \\Rightarrow ", " \\Rightarrow", " \\implies ", " \\to "]) {
    lines = lines.flatMap((line) => topLevelComponents(line, separator));
  }
  return lines.map((line) => line.trim()).filter((line) => line !== "");
}

/** Splits only outside braces, so `\text{(i) Não;}` stays one group. */
function topLevelComponents(text: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let index = 0;
  while (index < text.length) {
    if (depth === 0 && text.startsWith(separator, index)) {
      parts.push(current);
      current = "";
      index += separator.length;
      continue;
    }
    const character = text[index]!;
    if (character === "{") depth += 1;
    if (character === "}") depth = Math.max(0, depth - 1);
    current += character;
    index += 1;
  }
  parts.push(current);
  return parts.filter((part) => part !== "");
}
