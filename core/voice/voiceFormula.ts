// Port of the formula finding of LearnLayer/Voice/VoiceCheckPlan.swift (presentedFormula, writtenFormula,
// contextFormula, writtenEquations, equation, equationLine, inlineEquation) and of VoiceTutorReply.holdingTheSymbol
// @ ref 2026-11-04: the formula a spoken answer is drawn on. The reply's own formula wins; then an equation in the
// question; then the equation on the page or in the question that holds the symbol the answer explains ("o que
// significa a letra a" draws x(t) = x₀ + v₀t + ½at²); then one in the answer. Whether a formula holds a symbol is read
// from its LaTeX (`holdsSymbol`); the Mac lays the formula out for it (`FormulaTerms.atomIndex`).

import { latexToUnicode } from "../math/latexText";
import { SpeechWords, type DrawingCommand, type VoiceTutorReply } from "./voiceTutorReply";

const greekLetters: Record<string, string> = {
  α: "alpha",
  β: "beta",
  γ: "gamma",
  Γ: "Gamma",
  δ: "delta",
  Δ: "Delta",
  ε: "epsilon",
  ζ: "zeta",
  η: "eta",
  θ: "theta",
  Θ: "Theta",
  ι: "iota",
  κ: "kappa",
  λ: "lambda",
  Λ: "Lambda",
  μ: "mu",
  ν: "nu",
  ξ: "xi",
  π: "pi",
  Π: "Pi",
  ρ: "rho",
  σ: "sigma",
  Σ: "Sigma",
  τ: "tau",
  φ: "phi",
  Φ: "Phi",
  χ: "chi",
  ψ: "psi",
  Ψ: "Psi",
  ω: "omega",
  Ω: "Omega",
};
/** Greek letters as Portuguese, Spanish and English speech spells them. */
const saidGreek: Record<string, string> = {
  alfa: "alpha",
  gama: "gamma",
  teta: "theta",
  tita: "theta",
  capa: "kappa",
  lamda: "lambda",
  mi: "mu",
  miu: "mu",
  ni: "nu",
  niu: "nu",
  csi: "xi",
  ksi: "xi",
  ro: "rho",
  fi: "phi",
  qui: "chi",
  ji: "chi",
  ipsilon: "upsilon",
};
const mathWords = new Set(["sin", "cos", "tan", "exp", "log", "sqrt", "abs"]);
const formulaWords = new Set([
  "formula",
  "formulas",
  "formulae",
  "equacao",
  "equacoes",
  "equation",
  "equations",
  "ecuacion",
  "ecuaciones",
]);
const subscripts: Record<string, string> = Object.fromEntries(
  Array.from("₀₁₂₃₄₅₆₇₈₉").map((ch, index) => [ch, String(index)]),
);
const superscripts: Record<string, string> = Object.fromEntries(
  Array.from("⁰¹²³⁴⁵⁶⁷⁸⁹").map((ch, index) => [ch, String(index)]),
);

const isLetter = (ch: string | undefined) => ch !== undefined && /^\p{L}$/u.test(ch);
const isNumber = (ch: string | undefined) => ch !== undefined && /^\p{N}$/u.test(ch);
const isAsciiLetter = (ch: string | undefined) => ch !== undefined && /^[A-Za-z]$/.test(ch);
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const allLetters = (text: string) => Array.from(text).every((ch) => isLetter(ch));

function rendered(line: string): string {
  return line.replace(/\*/g, " ").replace(/x0/g, "x_{0}").replace(/v0/g, "v_{0}");
}

/** What `√` at `index` covers: the inside of the brackets after it, or the run of letters and digits after it. */
function radicand(chars: string[], index: number): [string, number] | null {
  const start = index + 1;
  if (start >= chars.length) return null;
  if (chars[start] === "(") {
    let depth = 0;
    for (let end = start; end < chars.length; end++) {
      if (chars[end] === "(") depth += 1;
      if (chars[end] === ")") depth -= 1;
      if (depth === 0) return [chars.slice(start + 1, end).join(""), end + 1];
    }
    return null;
  }
  let end = start;
  while (
    end < chars.length &&
    (isLetter(chars[end]) || isNumber(chars[end]) || superscripts[chars[end]!] !== undefined)
  )
    end += 1;
  return end > start ? [chars.slice(start, end).join(""), end] : null;
}

/** Unicode math as LaTeX, each single-letter factor apart so its glyph can be marked. */
function mathLatex(text: string): string {
  let out = "";
  const chars = Array.from(text);
  let index = 0;
  const spaced = () => {
    const last = Array.from(out).at(-1);
    if (last !== undefined && (isLetter(last) || isNumber(last) || last === "}")) out += " ";
  };
  while (index < chars.length) {
    const ch = chars[index]!;
    if (isAsciiLetter(ch)) {
      let end = index;
      while (end < chars.length && isAsciiLetter(chars[end])) end += 1;
      const run = chars.slice(index, end).join("");
      spaced();
      out += mathWords.has(run.toLowerCase()) ? "\\" + run + " " : Array.from(run).join(" ");
      index = end;
      continue;
    }
    if (subscripts[ch] !== undefined || superscripts[ch] !== undefined) {
      const map = subscripts[ch] !== undefined ? subscripts : superscripts;
      let digits = "";
      while (index < chars.length && map[chars[index]!] !== undefined) {
        digits += map[chars[index]!];
        index += 1;
      }
      out += (map === subscripts ? "_{" : "^{") + digits + "}";
      continue;
    }
    // Δ and √ are written as commands.
    const greek = greekLetters[ch];
    if (greek) {
      spaced();
      out += "\\" + greek + " ";
      index += 1;
      continue;
    }
    if (ch === "√") {
      const covered = radicand(chars, index);
      if (covered) {
        spaced();
        out += "\\sqrt{" + mathLatex(covered[0]) + "} ";
        index = covered[1];
        continue;
      }
    }
    const fraction: Record<string, string> = {
      "½": "\\frac{1}{2} ",
      "¼": "\\frac{1}{4} ",
      "¾": "\\frac{3}{4} ",
      "⅓": "\\frac{1}{3} ",
    };
    if (fraction[ch]) {
      spaced();
      out += fraction[ch];
    } else if (ch === "−" || ch === "–") out += "-";
    else if (ch === "·" || ch === "×") out += " \\cdot ";
    else out += ch;
    index += 1;
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Whether `latex` holds the symbol `term`: `a`, `v0`, `v_0` and `v₀`, `ω` and `\omega` and "ómega". A bare letter is
 * not the same letter inside a command (`\alpha`) or with a subscript (`v_0`).
 */
export function holdsSymbol(term: string, latex: string): boolean {
  const symbol = term.trim();
  if (symbol === "") return false;
  const chars = Array.from(symbol);
  const folded = symbol.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const plain = folded.startsWith("var") ? folded.slice(3) : folded;
  const greek =
    (chars.length === 1 ? greekLetters[symbol] : undefined) ??
    (symbol.startsWith("\\") ? symbol.slice(1) : undefined) ??
    saidGreek[plain] ??
    (Object.values(greekLetters).includes(plain) ? plain : undefined);
  if (greek && Object.values(greekLetters).some((name) => name.toLowerCase() === greek.toLowerCase())) {
    const name = Object.values(greekLetters).find((value) => value === greek) ?? greek;
    return new RegExp(`\\\\(?:var)?${escaped(name)}(?![A-Za-z])`).test(latex);
  }
  const scripted = /^([A-Za-z])(?:_?\{?([0-9A-Za-z]+)\}?|([₀-₉]+))?$/u.exec(symbol);
  if (!scripted) return false;
  const base = scripted[1]!;
  const sub =
    scripted[2] ??
    (scripted[3]
      ? Array.from(scripted[3])
          .map((ch) => subscripts[ch])
          .join("")
      : undefined);
  if (sub)
    return new RegExp(`(?<![A-Za-z\\\\])${base}_(?:\\{${escaped(sub)}\\}|${escaped(sub)}(?![0-9A-Za-z]))`).test(latex);
  return new RegExp(`(?<![A-Za-z\\\\])${base}(?![A-Za-z_])`).test(latex);
}

const screenFolds: Record<string, string> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "₊": "+",
  "₋": "-",
  "⁺": "+",
  "⁻": "-",
  ₓ: "x",
  ᵢ: "i",
  ⁿ: "n",
  "−": "-",
  "–": "-",
  "⋅": "·",
  "∙": "·",
  "×": "·",
  "*": "·",
  "∗": "·",
  "÷": "/",
  "⁄": "/",
};

const screenRules: [RegExp, string][] = [
  [/\\(left|right|big|Big|bigg|Bigg)(?![A-Za-z])/g, ""],
  [/\\(text|mathrm|mathit|mathbf|operatorname|mbox)\s*\{([^{}]*)\}/g, "$2"],
  [/\\[,;:! ]/g, ""],
  [/\\(quad|qquad)(?![A-Za-z])/g, ""],
  [/\\(cdot|times|ast)(?![A-Za-z])/g, "·"],
  [/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)"],
  [/\\[dt]?frac\s*(\w)\s*(\w)/g, "$1/$2"],
  [/(\d),(\d)/g, "$1.$2"],
];

/**
 * LaTeX or plain text reduced to what a reader compares (`VoiceCanvasPlan.screenKey`), so the same formula in two
 * notations gives the same key. Lower case; no spaces, braces, brackets, `_` or `^`.
 */
export function screenKey(text: string): string {
  let t = text;
  // Nested fractions: repeat until nothing changes.
  for (let round = 0; round < 4; round++) {
    const before = t;
    for (const [pattern, template] of screenRules) t = t.replace(pattern, template);
    if (t === before) break;
  }
  if (t.includes("\\")) t = latexToUnicode(t);
  let key = "";
  for (const ch of Array.from(t.toLowerCase())) {
    if (/^\s$/u.test(ch) || "{}()[]\\_^".includes(ch)) continue;
    key += screenFolds[ch] ?? ch;
  }
  // A decimal comma left after folding (e.g. "2,5" from "2{,}5").
  return key.replace(/(\d),(\d)/g, "$1.$2");
}

/** The runs of letters, digits and points in a key. */
function screenTokens(key: string): Set<string> {
  const out = new Set<string>();
  let run = "";
  for (const ch of Array.from(key)) {
    if (/^[\p{L}\p{N}.]$/u.test(ch)) run += ch;
    else {
      if (run !== "") out.add(run);
      run = "";
    }
  }
  if (run !== "") out.add(run);
  return out;
}

export const VoiceFormula = {
  /**
   * True when `latex` already reads on screen, in any of `onScreen` (plain text or formulas), whatever the notation
   * (`VoiceCanvasPlan.isOnScreen`). A formula of one or two characters counts only as a whole token on screen.
   */
  isOnScreen(latex: string, onScreen: readonly string[]): boolean {
    const key = screenKey(latex);
    if (key === "") return false;
    if (Array.from(key).length < 3)
      // Words keep their spaces here, so "t" in "durante t = 5" stays its own token.
      return onScreen.some((text) =>
        text
          .split(/\s+/u)
          .filter((word) => word !== "")
          .some((word) => screenTokens(screenKey(word)).has(key)),
      );
    const keys = [key];
    const sides = key.split("=");
    if (sides.length === 2 && sides[0] !== "" && sides[1] !== "") keys.push(`${sides[1]}=${sides[0]}`);
    const screens = onScreen.flatMap((text) => [screenKey(text), screenKey(latexToUnicode(text))]);
    return screens.some((screen) => keys.some((candidate) => screen.includes(candidate)));
  },

  /**
   * The formulas the answer writes once its marks have started: the presented one and the formula marks' own, less
   * those already on screen (`VoiceCanvasPlan.formulas`).
   */
  formulas(
    drawing: readonly DrawingCommand[],
    presented: string | null,
    started: ReadonlySet<number>,
    onScreen: readonly string[] = [],
  ): string[] {
    if (started.size === 0) return [];
    const shown: string[] = [];
    const clean = (latex: string | null) => (latex && latex.trim() !== "" ? latex.trim() : null);
    const own = clean(presented);
    if (own) shown.push(own);
    drawing.forEach((command, index) => {
      if (!started.has(index) || command.kind.op !== "formula") return;
      const written = clean(rendered(command.kind.latex));
      if (written && !shown.includes(written)) shown.push(written);
    });
    return shown.filter((latex) => !VoiceFormula.isOnScreen(latex, onScreen));
  },

  /** `F = ma` and `x = x0 + v0*t`. A sentence around the equals sign is not an equation. */
  equationLine(text: string): string | null {
    const line = text.trim().replace(/^\.+|\.+$/g, "");
    const length = Array.from(line).length;
    if (length < 3 || length >= 120 || !line.includes("=")) return null;
    if (!/^[A-Za-z\\][A-Za-z0-9_^{}\\]*\s*=\s*[A-Za-z0-9_^{}\\.+\-*/()= ]+$/.test(line)) return null;
    for (const token of line.split(/\s+/)) {
      const word = Array.from(token).filter(isLetter).join("");
      if (Array.from(word).length >= 5 && !/\p{N}/u.test(token) && !token.includes("\\")) return null;
    }
    return line;
  },

  /** A short equation, including one line inside a longer question. */
  equation(text: string): string | null {
    const trimmed = text.trim();
    if (trimmed === "") return null;
    for (const piece of trimmed.split(/[\n\r,;]/)) {
      const line = VoiceFormula.equationLine(piece);
      if (line) return rendered(line);
    }
    return null;
  },

  /** An equation inside a sentence ("explica a fórmula F = ma"), without the words around it. */
  inlineEquation(text: string): string | null {
    for (const match of text.matchAll(/[A-Za-z\\][A-Za-z0-9_^{}\\]*\s*=\s*[A-Za-z0-9_^{}\\.+\-*/()= ]+/g)) {
      const tokens = match[0].split(/\s+/).filter((token) => token !== "");
      for (;;) {
        const last = tokens.at(-1);
        if (!last || Array.from(last).length < 3 || !allLetters(last) || mathWords.has(last.toLowerCase())) break;
        tokens.pop();
      }
      while (tokens.length > 0) {
        const line = VoiceFormula.equationLine(tokens.join(" "));
        if (line) return rendered(line);
        tokens.pop();
      }
    }
    return null;
  },

  /** The formula the reply itself writes, as a formula mark or an equation term. */
  writtenFormula(drawing: readonly DrawingCommand[]): string | null {
    for (const command of drawing) {
      const kind = command.kind;
      const written =
        kind.op === "formula"
          ? kind.latex
          : kind.op === "circle" || kind.op === "highlight"
            ? VoiceFormula.equationLine(kind.term)
            : null;
      if (written && written.trim() !== "") return rendered(written);
    }
    return null;
  },

  /** The formula an answer is drawn on: its own, an equation in the question, the one holding its symbol, then one it says. */
  presentedFormula(
    drawing: readonly DrawingCommand[],
    question: string,
    spoken: string,
    context: string | null = null,
  ): string | null {
    return (
      VoiceFormula.writtenFormula(drawing) ??
      VoiceFormula.equation(question) ??
      (context && context.trim() !== "" ? context.trim() : null) ??
      VoiceFormula.equation(spoken)
    );
  },

  /** Equations in page or question text, as LaTeX, in order: "x(t) = x₀ + v₀t + ½at²" is `x(t) = x_{0} + …`. */
  writtenEquations(text: string): string[] {
    const found: string[] = [];
    for (const line of text.split(/\r\n|\r|\n/)) {
      const equals = line.indexOf("=");
      if (equals < 0) continue;
      const before = line.slice(0, equals);
      const name = /(?<![\p{L}\p{N}])[A-Za-zα-ωΑ-Ω][0-9₀-₉]*(\([A-Za-z]\))?\s*$/u.exec(before);
      if (!name) continue;
      const left = name[0].trim();
      let right = line.slice(equals + 1);
      const end = /[,;:?!]|\.(\s|$)/.exec(right);
      if (end) right = right.slice(0, end.index);
      const tokens: string[] = [];
      for (const token of right.split(/\s+/).filter((piece) => piece !== "")) {
        if (Array.from(token).length >= 3 && allLetters(token) && !mathWords.has(token.toLowerCase())) break;
        tokens.push(token);
      }
      if (tokens.length === 0) continue;
      found.push(mathLatex(left + " = " + tokens.join(" ")));
    }
    return found;
  },

  /** The first equation in the question, then on the page, that holds one of `symbols`. */
  contextFormula(symbols: readonly string[], question: string, page: string): string | null {
    const names = symbols.map((symbol) => symbol.trim()).filter((symbol) => symbol !== "");
    if (names.length === 0) return null;
    for (const text of [question, page])
      for (const latex of VoiceFormula.writtenEquations(text))
        if (names.some((symbol) => holdsSymbol(symbol, latex))) return latex;
    return null;
  },

  /** The symbols a reply explains: each mark's term and the word it lights on (not an article other than "a"). */
  explainedSymbols(reply: VoiceTutorReply): string[] {
    const symbols: string[] = [];
    for (const command of reply.drawing) {
      const mentioned =
        command.mentioned && SpeechWords.isArticle(command.mentioned) && command.mentioned.toLowerCase() !== "a"
          ? null
          : command.mentioned;
      const kind = command.kind;
      const names = [kind.op === "circle" || kind.op === "highlight" ? kind.term : null, mentioned];
      if (kind.op === "arrow") names.push(kind.from, kind.to);
      for (const name of names) if (name && !symbols.includes(name)) symbols.push(name);
    }
    return symbols;
  },

  /** Where a word for "formula" first starts (UTF-16), in any of the tutor's languages. */
  formulaWord(text: string): number | null {
    for (const match of text.matchAll(/\p{L}+/gu)) {
      const word = match[0].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
      if (formulaWords.has(word)) return match.index;
    }
    return null;
  },

  /**
   * When the student asked about a formula, the first time the answer says "fórmula" ("formula", "equação",
   * "equation") underlines that formula, even if the model put no marker there (`VoiceTutorReply.namingTheFormula`).
   * A formula mark without a marker is moved to that word; otherwise one is added. Unchanged when a lit mark already
   * underlines the formula: a formula mark, or one on a whole equation (the Mac reads this from the strokes it lays).
   */
  namingTheFormula(reply: VoiceTutorReply, asked: string, context: string | null = null): VoiceTutorReply {
    const inline = VoiceFormula.inlineEquation(asked);
    const latex = VoiceFormula.presentedFormula(reply.drawing, asked, reply.spoken, context) ?? inline;
    const at = VoiceFormula.formulaWord(reply.spoken);
    if (!latex || (VoiceFormula.formulaWord(asked) === null && inline === null) || at === null) return reply;
    const underlined = reply.drawing.some(
      (command) =>
        command.mentionUTF16 !== null &&
        (command.kind.op === "formula" ||
          ((command.kind.op === "highlight" || command.kind.op === "circle") &&
            VoiceFormula.equationLine(command.kind.term) !== null)),
    );
    if (underlined) return reply;
    const drawing = [...reply.drawing];
    let index = drawing.findIndex((command) => command.kind.op === "formula" && command.mentionUTF16 === null);
    if (index < 0) {
      drawing.push({
        kind: { op: "formula", latex },
        segment: null,
        anchor: null,
        point: null,
        label: null,
        mentionUTF16: null,
        mentioned: null,
        mentionsUTF16: [],
      });
      index = drawing.length - 1;
    }
    drawing[index] = {
      ...drawing[index]!,
      mentionUTF16: at,
      mentioned: SpeechWords.word(at, reply.spoken),
      mentionsUTF16: [at],
    };
    return { ...reply, drawing };
  },

  /**
   * The formula that holds the explained symbol when the reply writes none (`VoiceTutorReply.holdingTheSymbol`);
   * null when the reply writes one, or nothing on the page holds it.
   */
  holdingTheSymbol(reply: VoiceTutorReply, question: string, page: string): string | null {
    if (VoiceFormula.writtenFormula(reply.drawing) !== null) return null;
    return VoiceFormula.contextFormula(VoiceFormula.explainedSymbols(reply), question, page);
  },
};
