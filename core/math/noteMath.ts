// Port of LearnLayer/Math/NoteMath.swift @ ref 2026-11-04. A step note is a sentence with maths inside it ("e³⁻ˣ > 1",
// "f' < 0 em ]−∞, 0["). The maths is split out so it can be typeset; the words stay text.
//
// The note is read as tokens and each formula as an expression: operands (numbers, letters, f(x), intervals, sen θ)
// joined by operators and relations. A stretch is maths only when it shows it: an operator, a relation, a script, a
// call, an interval or a lone letter. "3" or "(B)" alone stay words, and a word never ends up inside a formula.

import {
  accentedTextPieces,
  commandsForSymbols,
  isProse,
  latexToUnicode,
  lowered,
  mendedInline,
  raised,
  withAccents,
} from "./latexText";

export interface NotePiece {
  isMath: boolean;
  text: string;
  /** Already LaTeX (it was marked with "$"), so it is typeset as written. */
  isLatex?: boolean;
}

type Kind =
  | "space"
  | "word"
  | "letter"
  | "number"
  | "greek"
  | "constant"
  | "latex"
  | "script"
  | "prime"
  | "open"
  | "close"
  | "bracket"
  | "op"
  | "relation"
  | "prefix"
  | "punct"
  | "other";

interface Token {
  kind: Kind;
  text: string;
}

const isWhitespace = (ch: string) => /^\s$/u.test(ch);
const isLetter = (ch: string) => /^\p{L}$/u.test(ch);
const isDigit = (ch: string | undefined) => ch !== undefined && ch >= "0" && ch <= "9";
const isAscii = (text: string) => Array.from(text).every((ch) => ch.charCodeAt(0) < 128);
const trimSpaces = (text: string) => text.replace(/^[\p{Zs}\t]+|[\p{Zs}\t]+$/gu, "");

const functions = new Set([
  "sen",
  "sin",
  "cos",
  "tg",
  "tan",
  "cotg",
  "cot",
  "ln",
  "log",
  "exp",
  "lim",
  "max",
  "min",
  "arcsen",
  "arcsin",
  "arccos",
  "arctg",
  "arctan",
  "sgn",
]);
/** Letters that are also Portuguese words ("e", "o", "a"): alone they stay prose. */
const wordLetters = new Set(["a", "e", "o", "A", "E", "O", "I"]);
/** "e" and "o" are "and" and "the": never a factor across a space. */
const conjunctions = new Set(["e", "o", "E", "O"]);
const operators = new Set(Array.from("+−-–·×÷/*±∓∘∪∩"));
const relations = new Set(Array.from("=<>≤≥≠≈≃≡∼→←↔⇒⇐⇔⟺⟹∈∉⊂⊃⊆⊇∨∧"));
const prefixes = new Set(Array.from("√∃∀¬"));
const constants = new Set(Array.from("∞ℝℕℤℚℂ∅½⅓⅔¼¾⅕⅙⅛"));
const signs = new Set(["+", "−", "-", "–", "±"]);

const isFunction = (token: Token) => token.kind === "word" && functions.has(token.text);
const isSign = (token: Token) => token.kind === "op" && signs.has(token.text);
/** Ends an operand: the left side of two operands side by side. */
const endsOperand = (token: Token) =>
  ["number", "letter", "greek", "constant", "latex", "script", "prime"].includes(token.kind) || token.text === ")";
const startsOperand = (token: Token) =>
  ["number", "letter", "greek", "constant", "latex", "prefix"].includes(token.kind) ||
  isFunction(token) ||
  token.text === "(";

function isGreek(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (code >= 0x0391 && code <= 0x03c9) || code === 0x03d5 || code === 0x03f5;
}

function braceEnd(chars: string[], start: number): number {
  let level = 0;
  let end = start;
  while (end < chars.length) {
    if (chars[end] === "{") level += 1;
    if (chars[end] === "}") {
      level -= 1;
      if (level === 0) return end + 1;
    }
    end += 1;
  }
  return end;
}

/** A command and its brace groups: \frac{h}{1,50}, \sqrt{x}, \, */
function command(chars: string[], start: number): [string, number] {
  let end = start + 1;
  if (end < chars.length && isLetter(chars[end]!)) {
    while (end < chars.length && isLetter(chars[end]!)) end += 1;
  } else if (end < chars.length) end += 1;
  while (end < chars.length && chars[end] === "{") end = braceEnd(chars, end);
  return [chars.slice(start, end).join(""), end];
}

/** Letters, joined across "-" and "'" inside a word ("Define-se", "d'água"). One plain letter is a letter; more is a word. */
function word(chars: string[], start: number): [Token, number] {
  const isWordLetter = (ch: string | undefined) =>
    ch !== undefined &&
    isLetter(ch) &&
    raised[ch] === undefined &&
    lowered[ch] === undefined &&
    !isGreek(ch) &&
    !constants.has(ch);
  let end = start;
  while (end < chars.length) {
    if (isWordLetter(chars[end])) {
      end += 1;
      continue;
    }
    const joins = isWordLetter(chars[end + 1]);
    if (joins && (chars[end] === "'" || chars[end] === "’")) {
      end += 1;
      continue;
    }
    if (joins && chars[end] === "-" && end - start >= 2) {
      end += 1;
      continue;
    }
    break;
  }
  const text = chars.slice(start, end).join("");
  const plain = end - start === 1 && isAscii(text);
  return [{ kind: plain ? "letter" : "word", text }, end];
}

function scan(text: string): Token[] {
  const chars = Array.from(text);
  const tokens: Token[] = [];
  let index = 0;
  const take = (kind: Kind, condition: (ch: string) => boolean) => {
    let end = index + 1;
    while (end < chars.length && condition(chars[end]!)) end += 1;
    tokens.push({ kind, text: chars.slice(index, end).join("") });
    index = end;
  };
  const never = () => false;
  while (index < chars.length) {
    const ch = chars[index]!;
    if (isWhitespace(ch)) take("space", isWhitespace);
    else if (ch === "\\") {
      const [latex, end] = command(chars, index);
      tokens.push({ kind: "latex", text: latex });
      index = end;
    } else if ((ch === "^" || ch === "_") && index + 1 < chars.length) {
      let end = index + 1;
      end = chars[end] === "{" ? braceEnd(chars, end) : end + 1;
      tokens.push({ kind: "script", text: chars.slice(index, end).join("") });
      index = end;
    } else if (raised[ch] !== undefined) take("script", (c) => raised[c] !== undefined);
    else if (lowered[ch] !== undefined) take("script", (c) => lowered[c] !== undefined);
    else if ("'′″".includes(ch)) take("prime", (c) => "'′″".includes(c));
    else if (isDigit(ch)) {
      // 20,09 and 1.5 are one number; "3, 3" is two.
      let end = index + 1;
      while (end < chars.length) {
        if (isDigit(chars[end])) {
          end += 1;
          continue;
        }
        if (",.".includes(chars[end]!) && isDigit(chars[end + 1])) {
          end += 2;
          continue;
        }
        break;
      }
      tokens.push({ kind: "number", text: chars.slice(index, end).join("") });
      index = end;
    } else if (isGreek(ch)) take("greek", never);
    else if (constants.has(ch)) take("constant", never);
    else if (isLetter(ch)) {
      const [token, end] = word(chars, index);
      tokens.push(token);
      index = end;
    } else if ("({".includes(ch)) take("open", never);
    else if (")}".includes(ch)) take("close", never);
    // Either one opens or closes an interval: "]−1, 0[", "[0, 3[".
    else if ("[]".includes(ch)) take("bracket", never);
    else if (operators.has(ch)) take("op", never);
    else if (relations.has(ch)) take("relation", never);
    else if (prefixes.has(ch)) take("prefix", never);
    else if (",;:.!?".includes(ch)) take("punct", never);
    else take("other", never);
  }
  return tokens;
}

/** One stretch read as an expression, and what in it shows it is maths. */
interface Run {
  end: number;
  evidence: boolean;
  /** Can be multiplied by what follows a space ("½ a", "P sen θ"). */
  multiplies: boolean;
  /** Clearly a formula on its own: scripted, a function, a Greek letter. */
  strong: boolean;
  hasRelation: boolean;
  isGroup: boolean;
}

/** Maths when something in it says so, or a lone letter that is no word ("g", "x"). */
function runIsMath(run: Run, tokens: Token[], start: number): boolean {
  if (run.evidence) return true;
  const token = tokens[start]!;
  return (
    run.end === start + 1 &&
    token.kind === "letter" &&
    !wordLetters.has(token.text) &&
    !(tokens[start + 1]?.text === "." && tokens[start + 2]?.kind === "letter")
  );
}

class Parser {
  constructor(readonly tokens: Token[]) {}

  private kind(index: number): Kind | undefined {
    return this.tokens[index]?.kind;
  }

  private text(index: number): string | undefined {
    return this.tokens[index]?.text;
  }

  private skipSpace(index: number): number {
    return this.kind(index) === "space" ? index + 1 : index;
  }

  /** operand ((operator | relation) operand)*. Commas end it: "x < 3, 3 − x > 0" is two. */
  expression(start: number): Run | null {
    let run = this.term(start);
    if (!run) return null;
    for (;;) {
      const next = this.skipSpace(run.end);
      const joining = this.kind(next);
      if (joining !== "op" && joining !== "relation") break;
      const right = this.term(this.skipSpace(next + 1));
      if (!right) break;
      run = {
        end: right.end,
        evidence: true,
        multiplies: right.multiplies,
        strong: true,
        hasRelation: run.hasRelation || right.hasRelation || joining === "relation",
        isGroup: false,
      };
    }
    return run;
  }

  /** An operand with its prefix signs, scripts, primes and calls, and the operands written beside it: 3x, ½ a t². */
  term(start: number): Run | null {
    const tokens = this.tokens;
    let index = start;
    let evidence = false;
    // A sign glued to its operand (−x); ∃, ∀ and ¬ may be followed by a space.
    for (;;) {
      const token = tokens[index];
      if (!token || !(isSign(token) || token.kind === "prefix")) break;
      const next = token.kind === "prefix" && token.text !== "√" ? this.skipSpace(index + 1) : index + 1;
      const after = this.kind(next);
      if (after === undefined || after === "space") return null;
      evidence = true;
      index = next;
    }
    const atomStart = index;
    let run = this.atom(index);
    if (!run) return null;
    run = this.postfix({ ...run, evidence: run.evidence || evidence });
    // Side by side across a space: only into a clear formula, never "3 a função", "x = 3 e f" or "]−1, 0[ e f'". A
    // bare "e" or "o" is a word, so it multiplies nothing.
    const bareConjunction = run.end === atomStart + 1 && conjunctions.has(tokens[atomStart]!.text);
    while (run.multiplies && !bareConjunction && this.kind(run.end) === "space") {
      const next = run.end + 1;
      const right = this.factor(next);
      if (right?.strong) {
        run = this.joined(run, right);
        continue;
      }
      const letter = tokens[next];
      if (!letter || letter.kind !== "letter" || conjunctions.has(letter.text)) break;
      // "½ a t²": a letter between two factors.
      if (this.kind(next + 1) === "space") {
        const after = this.factor(next + 2);
        if (after?.strong) {
          run = this.joined(run, after);
          continue;
        }
      }
      // "9,8 m/s²": a unit after a number.
      if (
        run.end === atomStart + 1 &&
        tokens[atomStart]!.kind === "number" &&
        (this.text(next + 1) === "/" || this.text(next + 1) === "·")
      ) {
        const unit = this.term(next + 2);
        if (unit) {
          run = { ...this.joined(run, unit), multiplies: false };
          continue;
        }
      }
      // "1,0 s": a unit letter after a number belongs to it, and is no more maths than the number.
      const after = this.kind(next + 1);
      if (
        run.end === atomStart + 1 &&
        tokens[atomStart]!.kind === "number" &&
        !wordLetters.has(letter.text) &&
        (after === undefined || after === "space" || after === "punct" || after === "close")
      ) {
        run = { ...run, end: next + 1, multiplies: false };
      }
      break;
    }
    return run;
  }

  private joined(left: Run, right: Run): Run {
    return {
      end: right.end,
      evidence: true,
      multiplies: right.multiplies,
      strong: true,
      hasRelation: left.hasRelation || right.hasRelation,
      isGroup: false,
    };
  }

  /** One operand with its glued scripts and calls, nothing across a space. */
  private factor(start: number): Run | null {
    if (this.kind(start) === "space") return null;
    const run = this.atom(start);
    if (!run) return null;
    if (conjunctions.has(this.tokens[start]!.text)) return null;
    return this.postfix(run);
  }

  private postfix(base: Run): Run {
    const run = { ...base };
    for (;;) {
      const token = this.tokens[run.end];
      if (!token) return run;
      switch (token.kind) {
        case "script":
        case "prime":
          run.end += 1;
          run.evidence = true;
          run.strong = true;
          continue;
        case "open": {
          // f(x), g(−1), e^{3−x}(x + 1), (x − 3)(x + 3)
          if (token.text !== "(") return run;
          const call = this.group(run.end);
          if (!call) return run;
          run.end = call.end;
          run.evidence = true;
          run.strong = true;
          continue;
        }
        case "punct":
          if (token.text !== "!" || !run.multiplies) return run;
          run.end += 1;
          run.evidence = true;
          continue;
        case "letter":
        case "greek":
        case "latex":
        case "word":
        case "constant": {
          // 3x, 2π, 4,53x: a number with the factor glued to it.
          if (this.tokens[run.end - 1]!.kind !== "number" || (token.kind === "word" && !isFunction(token))) return run;
          const glued = this.atom(run.end);
          if (!glued) return run;
          run.end = glued.end;
          run.evidence = true;
          run.strong = true;
          continue;
        }
        default:
          return run;
      }
    }
  }

  private atom(index: number): Run | null {
    const token = this.tokens[index];
    if (!token) return null;
    const plain: Run = {
      end: index + 1,
      evidence: false,
      multiplies: true,
      strong: false,
      hasRelation: false,
      isGroup: false,
    };
    switch (token.kind) {
      case "number":
      case "letter":
        return plain;
      case "greek":
      case "constant":
      case "latex":
        return { ...plain, evidence: true, strong: true };
      case "word": {
        if (!isFunction(token)) return null;
        // sen θ, sen²x, cos(2x), ln x: the function and what it applies to.
        let next = index + 1;
        while (this.kind(next) === "script") next += 1;
        const argument = this.kind(next) === "space" ? this.factor(next + 1) : this.factor(next);
        if (!argument) return null;
        return { ...plain, end: argument.end, evidence: true, strong: true };
      }
      case "open":
      case "bracket":
        return this.group(index);
      default:
        return null;
    }
  }

  /**
   * (x + 1), (1, 3, 0), ]−1, 0[, [0, 3]. Brackets either way make an interval of two ends; parentheses hold one
   * expression or a tuple. Words inside ("(soma de funções)") make it no group at all.
   */
  group(start: number): Run | null {
    const open = this.tokens[start];
    if (!open || (open.kind !== "open" && open.kind !== "bracket")) return null;
    const bracket = open.kind === "bracket";
    let elements = 0;
    let separated = false;
    let evidence = false;
    let hasRelation = false;
    let elementStart = this.skipSpace(start + 1);
    for (;;) {
      const element = this.expression(elementStart);
      if (!element) return null;
      elements += 1;
      evidence = evidence || element.evidence;
      hasRelation = hasRelation || element.hasRelation;
      const next = this.skipSpace(element.end);
      const token = this.tokens[next];
      if (!token) return null;
      if (token.text === "," || token.text === ";") {
        separated = true;
        elementStart = this.skipSpace(next + 1);
        continue;
      }
      const closes = bracket ? token.kind === "bracket" : token.text === (open.text === "(" ? ")" : "}");
      if (!closes) return null;
      // "[−1,0]" holds one number, and its comma is the interval's.
      const ends = elements + (!separated && this.intervalComma(start + 1, next) !== null ? 1 : 0);
      if (bracket && ends !== 2) return null;
      const single = !bracket && elements === 1;
      const shows = bracket || elements > 1 || evidence;
      return {
        end: next + 1,
        evidence: shows,
        multiplies: single,
        strong: single && shows && !hasRelation,
        hasRelation,
        isGroup: true,
      };
    }
  }

  /** The one number between `start` and `end` whose comma joins two ends. */
  private intervalComma(start: number, end: number): number | null {
    const numbers: number[] = [];
    for (let index = start; index < end; index++) {
      const token = this.tokens[index]!;
      if (token.kind === "number" && token.text.includes(",")) numbers.push(index);
    }
    return numbers.length === 1 ? numbers[0]! : null;
  }

  /** The numbers whose comma separates an interval's ends ("[−1,0]"). */
  intervalCommas(): Set<number> {
    const found = new Set<number>();
    let index = 0;
    while (index < this.tokens.length) {
      if (this.kind(index) === "bracket") {
        const run = this.group(index);
        if (run) {
          const inside = this.tokens.slice(index + 1, run.end - 1);
          const comma = this.intervalComma(index + 1, run.end - 1);
          if (!inside.some((token) => token.text === "," || token.text === ";") && comma !== null) {
            found.add(comma);
            index = run.end;
            continue;
          }
        }
      }
      index += 1;
    }
    return found;
  }
}

function append(pieces: NotePiece[], text: string, isMath: boolean, isLatex = false): void {
  if (text === "") return;
  if (isMath) {
    const chars = Array.from(text);
    // The spaces around a formula belong to the words beside it.
    if (isWhitespace(chars[0]!)) append(pieces, " ", false);
    pieces.push({ isMath: true, text: trimSpaces(text), isLatex });
    if (isWhitespace(chars[chars.length - 1]!)) append(pieces, " ", false);
  } else {
    const last = pieces[pieces.length - 1];
    if (last && !last.isMath) last.text += text;
    else pieces.push({ isMath: false, text });
  }
}

/**
 * A comma or a period is not its own line. ", pois…" stays with the formula it follows, and a sentence's final "."
 * does not wrap alone. A colon stays a word: in a formula it is spaced as a ratio.
 */
function absorbPunctuation(pieces: NotePiece[]): NotePiece[] {
  const marks = ".,;";
  const result: NotePiece[] = [];
  for (const piece of pieces) {
    const last = result[result.length - 1];
    if (piece.isMath || !last || !last.isMath || !marks.includes(piece.text[0] ?? "x")) {
      result.push({ ...piece });
      continue;
    }
    let lead = 0;
    while (lead < piece.text.length && marks.includes(piece.text[lead]!)) lead += 1;
    last.text += piece.text.slice(0, lead);
    const rest = piece.text.slice(lead);
    if (rest !== "") result.push({ isMath: false, text: rest });
  }
  return result;
}

/** The renderer drops what it can't draw; such a formula stays words. */
const typesets = (text: string) => isAscii(NoteMath.latex(text));

function scannedPieces(note: string): NotePiece[] {
  const tokens = scan(note);
  if (tokens.length === 0) return [];
  const parser = new Parser(tokens);
  const pieces: NotePiece[] = [];
  const add = (start: number, end: number, isMath: boolean) => {
    const text = tokens
      .slice(start, end)
      .map((token) => token.text)
      .join("");
    append(pieces, text, isMath && typesets(text));
  };
  let index = 0;
  while (index < tokens.length) {
    const run = parser.expression(index);
    if (!run) {
      add(index, index + 1, false);
      index += 1;
      continue;
    }
    add(index, run.end, runIsMath(run, tokens, index));
    index = run.end;
  }
  return absorbPunctuation(pieces);
}

/** Whitespace and words of one or two letters dropped, so "g é contínua em" and "g contínua em" compare the same. */
function reduced(text: string): string {
  return text.replace(/(?<![\p{L}\p{N}_])\p{L}{1,2}(?![\p{L}\p{N}_])/gu, "").replace(/\s/gu, "");
}

/** Case and accents ignored, as `.caseInsensitive, .diacriticInsensitive`. */
const folded = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export const NoteMath = {
  pieces(note: string): NotePiece[] {
    const segments = NoteMath.delimited(note);
    if (!segments) return scannedPieces(NoteMath.setDifferences(note));
    // The marked stretches are the formulas; the words between them are read as usual.
    const pieces: NotePiece[] = [];
    for (const segment of segments) {
      if (segment.isMath) {
        const latex = mendedInline(segment.text);
        if (trimSpaces(latex) === "") append(pieces, latex, false);
        else if (isAscii(commandsForSymbols(latex))) append(pieces, latex, true, true);
        else append(pieces, latexToUnicode(latex), false);
      } else {
        for (const piece of scannedPieces(NoteMath.setDifferences(segment.text)))
          append(pieces, piece.text, piece.isMath);
      }
    }
    return absorbPunctuation(pieces);
  },

  /** The note as plain text, its "$…$" maths as Unicode: "$x_1 \in V_\delta(c)$" → "x₁ ∈ V_δ(c)". */
  plainText(note: string): string {
    const segments = NoteMath.delimited(note);
    if (!segments) return NoteMath.setDifferences(note);
    return segments
      .map((segment) =>
        segment.isMath ? latexToUnicode(mendedInline(segment.text)) : NoteMath.setDifferences(segment.text),
      )
      .join("");
  },

  /**
   * A set minus a set written in plain words, where the model's backslash is the difference and not LaTeX's escaped
   * brace: "R\{0}" and "R \setminus {0}" → "R∖{0}", never "R{0}" (`NoteMath.setDifferences` @ 5701363).
   */
  setDifferences(text: string): string {
    return text
      .replace(/\\setminus\s*/g, "∖")
      .replace(/(?<=[A-Za-zℝℕℤℚℂ)\]])\s*\\\s*(?=\\?\{)/g, "∖")
      .replace(/∖\\\{([^{}]*?)\\?\}/g, "∖{$1}");
  },

  /** The note cut at its "$…$", "$$…$$" and "\(…\)" marks, or null when it has none. An escaped "\$" is a dollar sign. */
  delimited(note: string): { isMath: boolean; text: string }[] | null {
    const pattern = /(?<!\\)\$\$?([^$]+?)\$\$?|\\\((.+?)\\\)/g;
    const matches = [...note.matchAll(pattern)];
    if (matches.length === 0) return null;
    const segments: { isMath: boolean; text: string }[] = [];
    let last = 0;
    for (const match of matches) {
      if (match.index > last) segments.push({ isMath: false, text: note.slice(last, match.index) });
      segments.push({ isMath: true, text: match[1] ?? match[2] ?? "" });
      last = match.index + match[0].length;
    }
    if (last < note.length) segments.push({ isMath: false, text: note.slice(last) });
    return segments;
  },

  /** The math piece as LaTeX: superscripts become `^{}`, ∞ becomes `\infty`, 20,09 becomes 20{,}09, sen θ \sen\theta. */
  latex(math: string): string {
    const tokens = scan(math);
    const separators = new Parser(tokens).intervalCommas();
    let output = "";
    let index = 0;
    while (index < tokens.length) {
      const token = tokens[index]!;
      if (token.kind === "number" && token.text.includes(",")) {
        output += separators.has(index) ? token.text : token.text.replace(/,/g, "{,}");
      } else if (token.kind === "word" && functions.has(token.text)) {
        output += "\\" + token.text + " ";
      } else if (token.kind === "prefix" && token.text === "√") {
        // √x, √(x + 1): the radicand is the operand after the sign.
        const end = new Parser(tokens).term(index + 1)?.end ?? index + 1;
        let inner = tokens.slice(index + 1, end);
        if (inner[0]?.text === "(" && inner[inner.length - 1]?.text === ")") inner = inner.slice(1, -1);
        output += "\\sqrt{" + NoteMath.latex(inner.map((t) => t.text).join("")) + "}";
        index = end;
        continue;
      } else if (token.kind === "space") {
        // Two operands side by side keep a thin space (½ a t², 9,1 m s⁻²); anywhere else TeX spaces the formula itself.
        const before = tokens[index - 1];
        const after = tokens[index + 1];
        output += before && endsOperand(before) && after && startsOperand(after) ? "\\," : " ";
      } else output += token.text;
      index += 1;
    }
    return commandsForSymbols(output);
  },

  /**
   * A step's formula that says nothing the note does not (`SolutionSteps.formulaRepeats` and the option-letter check):
   * the same sentence as the note (accented words, an interval) would pile one on the other; a formula that only
   * repeats an option's letter ("(C)") says nothing. A real equation stays.
   */
  formulaRepeats(formula: string, note: string): boolean {
    const plain = latexToUnicode(formula);
    if (/^\(?[A-Ea-e]\)?\.?$/u.test(plain.trim())) return true;
    if (note === "") return false;
    const words =
      isProse(formula) ||
      accentedTextPieces(withAccents(formula)) !== null ||
      (/\p{L}{4,}/u.test(plain) && /[[\]]/.test(plain) && !plain.includes("="));
    return words && NoteMath.sameSentence(plain, latexToUnicode(note));
  },

  /** The formula says the same thing as the note once short glue words ("é", "em") are ignored. */
  sameSentence(formula: string, note: string): boolean {
    const left = reduced(formula);
    const right = reduced(note);
    if (Array.from(left).length < 8) return false;
    return folded(right).includes(folded(left));
  },
};
