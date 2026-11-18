// Port of SpeechMarkLayout.namesSomethingElse and isPointInsideAName (LearnLayer/Voice/FormulaTerms.swift @ ref
// 2026-11-04): a circle or highlight the voice tutor lights on a figure label (H⁺, (B), the point D) that is not a
// symbol of the formula on screen belongs on the figure, not on the formula. The formula then rings nothing rather
// than a look-alike letter (the C and B of "CB", the α of a formula about something else).

import type { DrawingCommand } from "./voiceTutorReply";
import { FigureLabels } from "./figureLabels";
import { holdsSymbol } from "./voiceFormula";

const greekNames = [
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "zeta",
  "eta",
  "theta",
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
  "chi",
  "psi",
  "omega",
];
const greekGlyphs: Record<string, string> = Object.fromEntries(
  Array.from("αβγδεζηθικλμνξπρστυφχψω").map((glyph, index) => [glyph, greekNames[index]!]),
);
const isUpper = (ch: string) => /^\p{Lu}$/u.test(ch);
const isLetter = (ch: string | undefined) => ch !== undefined && /^\p{L}$/u.test(ch);

interface Atom {
  base: string;
  scripted: boolean;
}

/** The formula's atoms as they are drawn: a letter, a digit, a command (`\alpha` is "alpha") or an operator, with
 * whether a subscript follows. Spacing and braces are not atoms. */
function atoms(latex: string): Atom[] {
  const out: Atom[] = [];
  const chars = Array.from(latex);
  let index = 0;
  while (index < chars.length) {
    const ch = chars[index]!;
    if (ch === "\\") {
      let end = index + 1;
      while (end < chars.length && /^[A-Za-z]$/.test(chars[end]!)) end += 1;
      if (end === index + 1) {
        // `\,`, `\ `: spacing.
        index += 2;
        continue;
      }
      const name = chars.slice(index + 1, end).join("");
      out.push({ base: name.startsWith("var") ? name.slice(3) : name, scripted: false });
      index = end;
      continue;
    }
    if (ch === "_") {
      const last = out[out.length - 1];
      if (last) last.scripted = true;
      index += 1;
      continue;
    }
    if (/^\s$/u.test(ch) || ch === "{" || ch === "}") {
      index += 1;
      continue;
    }
    out.push({ base: greekGlyphs[ch] ?? ch, scripted: false });
    index += 1;
  }
  return out;
}

/** A name of several letters written one after the other in the formula, none scripted (`ma` in `F = m a`). */
function holdsRun(name: string, latex: string): boolean {
  const letters: string[] = [];
  let rest = name;
  while (rest !== "") {
    const greek = [...greekNames].sort((a, b) => b.length - a.length).find((word) => rest.startsWith(word));
    if (greek) {
      letters.push(greek);
      rest = rest.slice(greek.length);
    } else {
      const first = Array.from(rest)[0]!;
      letters.push(greekGlyphs[first] ?? first);
      rest = rest.slice(first.length);
    }
  }
  const found = atoms(latex);
  if (letters.length < 2 || letters.length > found.length) return false;
  for (let start = 0; start + letters.length <= found.length; start += 1) {
    const slice = found.slice(start, start + letters.length);
    if (slice.every((atom, offset) => !atom.scripted && atom.base === letters[offset])) return true;
  }
  return false;
}

export const SpeechMarkLayout = {
  /**
   * True for a circle or highlight that belongs on the figure, not on `latex`: its term is no symbol of the formula
   * ("H +", "(B)", "SO4"); it is said right after a figure word ("o ponto [[2]]B", "o ângulo [[7]]alfa"); or it is one
   * capital letter that the formula only holds inside a longer name (the C of `CB`), which is the point itself.
   */
  namesSomethingElse(command: DrawingCommand, latex: string, spoken = ""): boolean {
    const kind = command.kind;
    if (kind.op !== "highlight" && kind.op !== "circle") return false;
    const term = kind.term;
    const name = Array.from(term)
      .filter((ch) => !/^\s$/u.test(ch) && ch !== "(" && ch !== ")")
      .join("");
    if (name === "") return false;
    if (FigureLabels.saidAboutTheFigure(spoken, command.mentionUTF16)) return true;
    const formula = latex.trim();
    if (formula === "") return false;
    const hasSymbol = holdsSymbol(name, formula) || holdsRun(name, formula);
    // Only a label-like term (a letter, an ion, an option) is looked for on the figure; a spoken phrase the formula
    // does not hold still underlines the formula.
    const count = Array.from(name).length;
    const labelLike =
      !term.trim().includes(" ") &&
      count <= 6 &&
      (count <= 2 || Array.from(name).some((ch) => isUpper(ch) || /^\p{N}$/u.test(ch) || "+-⁺⁻".includes(ch)));
    if (!hasSymbol) return labelLike;
    return SpeechMarkLayout.isPointInsideAName(name, formula);
  },

  /** One capital letter written in `latex` only next to another capital (`CB`, `[BCD]`): a segment's or a triangle's
   * name, so the letter alone is the point. */
  isPointInsideAName(name: string, latex: string): boolean {
    const letters = Array.from(name);
    const letter = letters[0];
    if (letters.length !== 1 || letter === undefined || !isLetter(letter) || !isUpper(letter)) return false;
    const chars = Array.from(latex);
    let alone = false;
    let inName = false;
    chars.forEach((ch, index) => {
      if (ch !== letter) return;
      const prev = chars[index - 1];
      const next = chars[index + 1];
      // A command such as \Delta is not a name.
      if (prev === "\\") return;
      const neighbour = [prev, next].some((other) => other !== undefined && isLetter(other) && isUpper(other));
      if (neighbour) inName = true;
      else alone = true;
    });
    return inName && !alone;
  },
};
