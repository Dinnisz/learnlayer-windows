// Port of the logic of LearnLayer/Explanation/EquationMorph.swift @ ref 2026-11-04 (all but EquationMorphView): one
// line of a written solution becoming the next. The pieces that stay the same stay put (or slide to their new place),
// the ones that go are struck out or lifted away, and only then does what replaces them come in (`Timing`). An aligned
// block is read row by row: each row of the new line is paired with the old row it grows out of (`pairRows`), the
// rows' pieces are matched by their longest common subsequence (`diff`), and the leftovers are read for what the step
// did (`refine`: a factor taken out, a letter given its value, terms worked out into one). When too little matches,
// or the pieces laid side by side would not look like the typeset line, the old line fades out and then the new one in.

/** A piece of a line, drawn on its own: a number, a letter with its scripts, an operator, a fraction. */
export interface MorphToken {
  /** What is typeset. */
  latex: string;
  /** What is compared: the same piece written two ways ("0{,}05" and "0,05", "x^{2}" and "x²") is one key. */
  key: string;
  /** Space written before it ("\quad", "\,"), in ems: the layout adds it as it is. */
  spaceBefore: number;
}

/** A piece of the old line by its row and place in the row. */
export interface MorphOrigin {
  row: number;
  index: number;
}

export type MorphChange =
  /** Matched in order: slides from its place in the old line to its place in the new. */
  | { kind: "keep"; from: number; to: number }
  /** The same piece, found out of order: travels over the others to its new place. */
  | { kind: "move"; from: number; to: number }
  /** Gone with nothing in its place: struck out, then fades. */
  | { kind: "cancel"; from: number }
  /** Replaced: the old pieces lift away, then the new one comes in where it belongs. */
  | { kind: "merge"; from: number[]; into: number }
  /** New, with nothing before it there: fades in. */
  | { kind: "appear"; to: number }
  /** Another copy of a piece that stays, now taken out in front of a bracket: it travels into that piece. */
  | { kind: "gather"; from: number; into: number }
  /** Terms worked out into one (a sum done): they close in on its place and fade, then it comes in. */
  | { kind: "combine"; from: number[]; into: number }
  /** A letter given its value: the letter lifts away, then the value drops into its place, or flies there. */
  | { kind: "substitute"; from: number[]; into: number; origin: MorphOrigin | null };

/** A row of the new line and the row of the old one it comes from. */
export interface RowMorph {
  from: number | null;
  to: number | null;
  changes: MorphChange[];
  /** The new line's row this one is worked out from (its changes index that row's pieces). */
  previous: number | null;
  /** When it plays: 0 with the old line becoming the new, then one row after another. */
  stage: number;
}

/** A row of a line: its pieces, and the piece its alignment mark `&` stands before. */
export interface MorphRow {
  latex: string;
  tokens: MorphToken[];
  column: number | null;
}

export type MorphFallback = "empty" | "multiline" | "tooLong" | "lowMatch" | "layout";

export type MorphPlan = { kind: "morph"; rows: RowMorph[] } | { kind: "crossfade"; fallback: MorphFallback };

const isWhitespace = (ch: string) => /^\s$/u.test(ch);
const isLetter = (ch: string) => /^\p{L}$/u.test(ch);
const isDigit = (ch: string) => ch >= "0" && ch <= "9";

/** Spacing commands and the space they add, in ems: the layout adds it itself. */
const spacing: Record<string, number> = {
  ",": 3 / 18,
  ":": 4 / 18,
  ";": 5 / 18,
  "!": -3 / 18,
  " ": 1 / 3,
  quad: 1,
  qquad: 2,
  left: 0,
  right: 0,
  displaystyle: 0,
  textstyle: 0,
};
/** Commands drawn with their arguments, as one piece. */
const commandArguments: Record<string, number> = {
  frac: 2,
  dfrac: 2,
  tfrac: 2,
  binom: 2,
  sqrt: 1,
  text: 1,
  mathrm: 1,
  mathbf: 1,
  mathit: 1,
  operatorname: 1,
  overline: 1,
  bar: 1,
  vec: 1,
  hat: 1,
  underline: 1,
};
/** Unicode superscripts, as the scripts they stand for: "x²" is "x^{2}". */
const superscripts: Record<string, string> = {
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
  "⁺": "+",
  "⁻": "-",
  ⁿ: "n",
  ⁱ: "i",
};
/** The same sign written different ways. */
const synonyms: Record<string, string> = {
  "\\cdot": "\\times",
  "·": "\\times",
  "×": "\\times",
  "*": "\\times",
  "\\ast": "\\times",
  "\\le": "\\leq",
  "\\ge": "\\geq",
  "\\leqslant": "\\leq",
  "\\geqslant": "\\geq",
  "\\ne": "\\neq",
  "\\lor": "\\vee",
  "\\land": "\\wedge",
  "\\Leftrightarrow": "\\iff",
  "\\Rightarrow": "\\implies",
  "\\rightarrow": "\\to",
  "\\longrightarrow": "\\to",
  "–": "-",
};
const relations = new Set([
  "=",
  "<",
  ">",
  "\\approx",
  "\\leq",
  "\\geq",
  "\\neq",
  "\\implies",
  "\\iff",
  "\\equiv",
  "\\to",
  "\\sim",
]);
const binary = new Set(["+", "-", "\\times", "\\pm", "\\mp", "\\div", "\\vee", "\\wedge"]);
const brackets = new Set(["(", ")", "[", "]", "\\{", "\\}", "|", ","]);
/** Blocks laid out as rows aligned on one column. */
const alignedEnvironments = new Set(["aligned", "align", "align*", "split", "alignedat", "eqnarray", "eqnarray*"]);

const symbolPattern =
  /^([A-Za-z]|\\(alpha|beta|gamma|delta|Delta|theta|lambda|mu|pi|rho|sigma|tau|phi|varphi|omega|Omega|epsilon|varepsilon|eta|kappa|nu|xi|chi|psi))'*(_(\{[^{}]*\}|[^{}]))?$/;

/** "number", "1{,}628\,894" or "3.5": digits, with decimal marks and thin spaces between digits. */
function readNumber(characters: string[], start: number): [string, number] {
  let index = start;
  let text = "";
  const digitAt = (position: number) => position < characters.length && isDigit(characters[position]!);
  while (index < characters.length) {
    const ch = characters[index]!;
    if (isDigit(ch)) {
      text += ch;
      index += 1;
    } else if (characters.slice(index, index + 3).join("") === "{,}" && digitAt(index + 3)) {
      text += "{,}";
      index += 3;
    } else if ((ch === "." || ch === ",") && digitAt(index + 1)) {
      text += ch;
      index += 1;
    } else if (ch === "\\" && characters[index + 1] === "," && digitAt(index + 2)) {
      text += "\\,";
      index += 2;
    } else break;
  }
  return [text, index];
}

/** The name after a backslash: its letters, or the one sign that follows it ("\," "\{"). */
function readCommand(characters: string[], start: number): [string, number] {
  let index = start + 1;
  if (index >= characters.length) return ["", index];
  if (!isLetter(characters[index]!)) return [characters[index]!, index + 1];
  let name = "";
  while (index < characters.length && isLetter(characters[index]!)) {
    name += characters[index]!;
    index += 1;
  }
  return [name, index];
}

/** A braced group, braces included, balanced. */
function readGroup(characters: string[], start: number): [string, number] {
  let depth = 0;
  let index = start;
  while (index < characters.length) {
    if (characters[index] === "{") depth += 1;
    if (characters[index] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
    index += 1;
  }
  const end = Math.min(index, characters.length - 1);
  return [characters.slice(start, end + 1).join(""), end + 1];
}

/** One argument: a braced group, a command, or one character. */
function readArgument(characters: string[], start: number): [string, number] {
  let index = start;
  while (index < characters.length && isWhitespace(characters[index]!)) index += 1;
  if (index >= characters.length) return ["", index];
  if (characters[index] === "{") return readGroup(characters, index);
  if (characters[index] === "\\") {
    const [name, end] = readCommand(characters, index);
    return ["\\" + name, end];
  }
  return [characters[index]!, index + 1];
}

function rowTexts(latex: string): string[] {
  const body = latex.replace(/\\(begin|end)\{[a-z*]+\}(\{\d+\})?/g, "");
  return (
    body
      .split("\\\\")
      // "\\[4pt]": the extra space after a row break is the block's own.
      .map((row) => row.replace(/^\s*\[[^\]]*\]/, "").trim())
      .filter((row) => row !== "")
  );
}

function commonLength(a: MorphToken[], b: MorphToken[]): number {
  let previous = new Array<number>(b.length + 1).fill(0);
  for (const x of a) {
    const current = [0];
    b.forEach((y, j) => current.push(x.key === y.key ? previous[j]! + 1 : Math.max(previous[j + 1]!, current[j]!)));
    previous = current;
  }
  return previous.at(-1) ?? 0;
}

export const EquationMorph = {
  /** Share of the longer row's tokens that must be found in the other (kept or moved) to morph. */
  minimumMatch: 0.34,
  /** Rows of two blocks are paired only from this share of their pieces in common. */
  minimumRowMatch: 0.25,
  maximumTokens: 40,
  maximumRows: 6,
  /** Each row worked out after the first takes this share of the first's time. */
  stageShare: 0.8,

  /** What to do between two lines' LaTeX, one-row lines or aligned blocks. */
  plan(source: string, target: string): MorphPlan {
    const before = EquationMorph.rows(source);
    const after = EquationMorph.rows(target);
    if (!before || !after) return { kind: "crossfade", fallback: "multiline" };
    if (before.length === 0 || after.length === 0) return { kind: "crossfade", fallback: "empty" };
    if (
      ![...before, ...after].every((row) => row.tokens.length <= EquationMorph.maximumTokens) ||
      Math.max(before.length, after.length) > EquationMorph.maximumRows
    )
      return { kind: "crossfade", fallback: "tooLong" };
    const single = before.length === 1 && after.length === 1;
    const definitions = (symbol: string, value: string) => EquationMorph.origin(value, symbol, before);
    let morphs: RowMorph[] = [];
    for (const [i, j] of EquationMorph.pairRows(before, after)) {
      const changes = EquationMorph.refine(
        EquationMorph.diff(before[i]!.tokens, after[j]!.tokens),
        before[i]!.tokens,
        after[j]!.tokens,
        definitions,
      );
      if (EquationMorph.confidence(changes, before[i]!.tokens, after[j]!.tokens) < EquationMorph.minimumMatch) {
        if (single) return { kind: "crossfade", fallback: "lowMatch" };
        continue;
      }
      morphs.push({ from: i, to: j, changes, previous: null, stage: 0 });
    }
    if (morphs.length === 0) return { kind: "crossfade", fallback: "lowMatch" };
    const pairedBefore = new Set(morphs.map((m) => m.from));
    const pairedAfter = new Set(morphs.map((m) => m.to));
    before.forEach((row, i) => {
      if (!pairedBefore.has(i))
        morphs.push({
          from: i,
          to: null,
          changes: row.tokens.map((_, index) => ({ kind: "cancel", from: index })),
          previous: null,
          stage: 0,
        });
    });
    // A row the old line has no row for is worked out from the row above it, after it, one row at a time; one too
    // unlike that row comes in whole in its turn.
    let stage = 0;
    after.forEach((row, j) => {
      if (pairedAfter.has(j)) return;
      const appear = (): MorphChange[] => row.tokens.map((_, index) => ({ kind: "appear", to: index }));
      if (j === 0) {
        morphs.push({ from: null, to: j, changes: appear(), previous: null, stage: 0 });
        return;
      }
      stage += 1;
      const above = after[j - 1]!.tokens;
      const changes = EquationMorph.refine(EquationMorph.diff(above, row.tokens), above, row.tokens);
      if (EquationMorph.confidence(changes, above, row.tokens) >= EquationMorph.minimumMatch)
        morphs.push({ from: null, to: j, changes, previous: j - 1, stage });
      else morphs.push({ from: null, to: j, changes: appear(), previous: null, stage });
    });
    // The old line kept as it is as the block's first row: nothing to watch until the next row.
    const idle = morphs.every(
      (morph) =>
        morph.stage > 0 ||
        (morph.from !== null &&
          morph.to !== null &&
          morph.changes.every((c) => c.kind === "keep" && c.from === c.to) &&
          before[morph.from]!.tokens.length === after[morph.to]!.tokens.length),
    );
    if (idle && stage > 0) morphs = morphs.map((morph) => ({ ...morph, stage: Math.max(morph.stage - 1, 0) }));
    return { kind: "morph", rows: morphs };
  },

  matchRatio(changes: MorphChange[], before: number, after: number): number {
    const longest = Math.max(before, after);
    if (longest <= 0) return 0;
    return changes.filter((c) => c.kind === "keep" || c.kind === "move").length / longest;
  },

  /**
   * How sure the morph is: pieces found again count whole; a letter given its value, one piece replaced by one of its
   * kind between pieces that stay, or each term of a sum worked out into one, count half (the shape held).
   */
  confidence(changes: MorphChange[], before: MorphToken[], after: MorphToken[]): number {
    const longest = Math.max(before.length, after.length);
    if (longest <= 0) return 0;
    let found = 0;
    for (const change of changes) {
      if (change.kind === "keep" || change.kind === "move" || change.kind === "gather") found += 1;
      else if (change.kind === "substitute") found += 0.5;
      else if (change.kind === "combine")
        found += 0.5 * change.from.filter((index) => EquationMorph.isOperand(before[index]!.key)).length;
      else if (
        change.kind === "merge" &&
        change.from.length === 1 &&
        EquationMorph.isOperand(before[change.from[0]!]!.key) === EquationMorph.isOperand(after[change.into]!.key)
      )
        found += 0.5;
    }
    return found / longest;
  },

  // MARK: Rows

  isMultiline: (latex: string) => latex.includes("\\\\") || latex.includes("\\begin"),

  /** The last row of an aligned block, without its alignment marks; a one-row line as it is. */
  lastRow(latex: string): string {
    if (!EquationMorph.isMultiline(latex)) return latex;
    return (rowTexts(latex).at(-1) ?? "").replace(/&/g, "");
  },

  /**
   * A line's rows: an aligned block's rows with their alignment column; a one-row line as one row. Null for any other
   * block (a table, cases, a matrix), which can't be laid out as rows.
   */
  rows(latex: string): MorphRow[] | null {
    if (!EquationMorph.isMultiline(latex)) {
      const tokens = EquationMorph.tokens(latex);
      return tokens.length === 0 ? [] : [{ latex, tokens, column: null }];
    }
    const environments = [...latex.matchAll(/\\begin\{([a-z*]+)\}/g)].map((match) => match[1]!);
    if (!environments.every((name) => alignedEnvironments.has(name)) || latex.includes("\\hline")) return null;
    return rowTexts(latex).flatMap((text) => {
      const cells = text.split("&");
      const left = EquationMorph.tokens(cells[0]!);
      const right = EquationMorph.tokens(cells.slice(1).join(" "));
      if (left.length + right.length === 0) return [];
      // A row with no mark is all in the first column: it ends at the column.
      return [{ latex: cells.join(" "), tokens: [...left, ...right], column: left.length }];
    });
  },

  /** The old rows paired in order with the new ones that share most with them. Two one-row lines are always a pair. */
  pairRows(before: MorphRow[], after: MorphRow[]): [number, number][] {
    if (before.length === 1 && after.length === 1) return [[0, 0]];
    const n = before.length;
    const m = after.length;
    const similarity = before.map((b) =>
      after.map((a) => {
        const longest = Math.max(b.tokens.length, a.tokens.length);
        return longest === 0 ? 0 : commonLength(b.tokens, a.tokens) / longest;
      }),
    );
    const best = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--) {
        const s = similarity[i]![j]!;
        const paired = s >= EquationMorph.minimumRowMatch ? s + best[i + 1]![j + 1]! : 0;
        best[i]![j] = Math.max(best[i + 1]![j]!, best[i]![j + 1]!, paired);
      }
    const pairs: [number, number][] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      const s = similarity[i]![j]!;
      if (s >= EquationMorph.minimumRowMatch && best[i]![j] === s + best[i + 1]![j + 1]!) {
        pairs.push([i, j]);
        i += 1;
        j += 1;
      } else if (best[i + 1]![j]! >= best[i]![j + 1]!) i += 1;
      else j += 1;
    }
    return pairs;
  },

  // MARK: Tokens

  tokens(latex: string): MorphToken[] {
    const characters = Array.from(latex);
    const pieces: { latex: string; space: number }[] = [];
    let space = 0;
    const add = (piece: string) => {
      pieces.push({ latex: piece, space });
      space = 0;
    };
    let index = 0;
    while (index < characters.length) {
      const ch = characters[index]!;
      if (isWhitespace(ch) || ch === "&") index += 1;
      else if (ch === "~") {
        space += 1 / 3;
        index += 1;
      } else if (isDigit(ch)) {
        const [number, end] = readNumber(characters, index);
        add(number);
        index = end;
      } else if (ch === "\\") {
        const [name, end] = readCommand(characters, index);
        index = end;
        if (spacing[name] !== undefined) {
          space += spacing[name]!;
          continue;
        }
        let piece = "\\" + name;
        if (name === "sqrt" && characters[index] === "[") {
          let close = characters.indexOf("]", index);
          if (close < 0) close = characters.length - 1;
          piece += characters.slice(index, close + 1).join("");
          index = close + 1;
        }
        for (let k = 0; k < (commandArguments[name] ?? 0); k++) {
          const [argument, after] = readArgument(characters, index);
          piece += argument;
          index = after;
        }
        add(piece);
      } else if (ch === "^" || ch === "_" || ch === "'" || superscripts[ch] !== undefined) {
        let script = ch;
        index += 1;
        if (ch === "^" || ch === "_") {
          const [argument, after] = readArgument(characters, index);
          script += argument;
          index = after;
        }
        // A script belongs to what it is written on: "x^{2}" moves as one piece.
        if (pieces.length === 0) add(script);
        else pieces[pieces.length - 1]!.latex += script;
      } else if (ch === "{") {
        const [group, end] = readGroup(characters, index);
        index = end;
        const next = characters.slice(index).find((c) => !isWhitespace(c));
        // A group with a script on it stays whole; any other is only grouping: its pieces are the line's.
        if (next === "^" || next === "_") add(group);
        else {
          const inner = EquationMorph.tokens(Array.from(group).slice(1, -1).join(""));
          inner.forEach((token, offset) =>
            pieces.push({ latex: token.latex, space: token.spaceBefore + (offset === 0 ? space : 0) }),
          );
          if (inner.length > 0) space = 0;
        }
      } else {
        add(ch);
        index += 1;
      }
    }
    return pieces
      .filter((piece) => piece.latex !== "")
      .map((piece) => ({ latex: piece.latex, key: EquationMorph.key(piece.latex), spaceBefore: piece.space }));
  },

  key(latex: string): string {
    let text = "";
    let run = "";
    const flush = () => {
      if (run !== "") {
        text += "^{" + run + "}";
        run = "";
      }
    };
    for (const ch of Array.from(latex)) {
      const plain = superscripts[ch];
      if (plain !== undefined) run += plain;
      else {
        flush();
        text += ch;
      }
    }
    flush();
    text = text
      .split("{,}")
      .join(",")
      .split("\\,")
      .join("")
      .split("\\dfrac")
      .join("\\frac")
      .split("\\tfrac")
      .join("\\frac")
      .split("\\mathrm{")
      .join("\\text{")
      .split("−")
      .join("-")
      .replace(/\s/gu, "");
    // "x^{2}" and "x^2" are one piece.
    text = text.replace(/([\^_])\{([^{}\\])\}/g, "$1$2");
    return synonyms[text] ?? text;
  },

  // MARK: Kinds of piece

  relations,
  binary,

  /** A number, a letter, a fraction: anything but a sign or a bracket. */
  isOperand: (key: string) => !relations.has(key) && !binary.has(key) && !brackets.has(key),

  /** A letter for a quantity, with its primes and subscript: "r", "C_0", "v_{0y}", "\theta". */
  isSymbol: (key: string) => symbolPattern.test(key),

  /** A number, or a fraction of numbers. */
  isValue: (key: string) => /^-?[0-9][0-9.,]*$/.test(key) || /^\\frac\{-?[0-9.,]+\}\{[0-9.,]+\}$/.test(key),

  /** Whether a piece that goes is struck out: a multiplication sign written or left out is only notation. */
  strikes: (token: MorphToken) => token.key !== "\\times",

  /** "symbol = value" in the old line: where the value was given, to fly from. */
  origin(value: string, symbol: string, rows: MorphRow[]): MorphOrigin | null {
    for (let row = 0; row < rows.length; row++) {
      const keys = rows[row]!.tokens.map((t) => t.key);
      for (let index = 2; index < keys.length; index++)
        if (keys[index] === value && keys[index - 1] === "=" && keys[index - 2] === symbol) return { row, index };
    }
    return null;
  },

  // MARK: Diff

  /**
   * The old line's tokens matched to the new line's: the longest common subsequence stays, a bracket group found again
   * whole elsewhere moves as one, a piece found again out of order moves, and what is left between two kept pieces is
   * replaced (both sides have pieces there), struck out (only the old) or new (only the new).
   */
  diff(before: MorphToken[], after: MorphToken[]): MorphChange[] {
    const n = before.length;
    const m = after.length;
    const table = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        table[i]![j] =
          before[i]!.key === after[j]!.key ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    const pairs: [number, number][] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (before[i]!.key === after[j]!.key) {
        pairs.push([i, j]);
        i += 1;
        j += 1;
      } else if (table[i + 1]![j]! >= table[i]![j + 1]!) i += 1;
      else j += 1;
    }
    const looseBefore = new Set(Array.from({ length: n }, (_, k) => k).filter((k) => !pairs.some((p) => p[0] === k)));
    const looseAfter = new Set(Array.from({ length: m }, (_, k) => k).filter((k) => !pairs.some((p) => p[1] === k)));
    const moves: MorphChange[] = [];
    // A bracket group written again whole (factors swapped) travels as one, not piece by piece.
    for (const group of EquationMorph.bracketGroups(before)) {
      if (!group.every((index) => looseBefore.has(index))) continue;
      const keys = group.map((index) => before[index]!.key);
      let start: number | null = null;
      for (let s = 0; s <= Math.max(0, m - group.length); s++)
        if (
          s + group.length <= m &&
          group.every((_, offset) => looseAfter.has(s + offset) && after[s + offset]!.key === keys[offset])
        ) {
          start = s;
          break;
        }
      if (start === null) continue;
      group.forEach((from, offset) => {
        moves.push({ kind: "move", from, to: start + offset });
        looseBefore.delete(from);
        looseAfter.delete(start + offset);
      });
    }
    for (const from of [...looseBefore].sort((a, b) => a - b)) {
      const to = [...looseAfter].sort((a, b) => a - b).find((index) => after[index]!.key === before[from]!.key);
      if (to === undefined) continue;
      moves.push({ kind: "move", from, to });
      looseBefore.delete(from);
      looseAfter.delete(to);
    }
    const changes: MorphChange[] = [];
    let last: [number, number] = [-1, -1];
    for (const pair of [...pairs, [n, m] as [number, number]]) {
      const gone = [...looseBefore].filter((k) => k > last[0] && k < pair[0]).sort((a, b) => a - b);
      const fresh = [...looseAfter].filter((k) => k > last[1] && k < pair[1]).sort((a, b) => a - b);
      if (fresh.length > 0 && gone.length > 0) {
        changes.push({ kind: "merge", from: gone, into: fresh[0]! });
        for (const to of fresh.slice(1)) changes.push({ kind: "appear", to });
      } else {
        for (const from of gone) changes.push({ kind: "cancel", from });
        for (const to of fresh) changes.push({ kind: "appear", to });
      }
      if (pair[0] < n) changes.push({ kind: "keep", from: pair[0], to: pair[1] });
      last = pair;
    }
    return [...changes, ...moves];
  },

  /** Each "( … )" of a line (its closing bracket may carry a script), as the indices it spans. */
  bracketGroups(tokens: MorphToken[]): number[][] {
    const open: number[] = [];
    const groups: number[][] = [];
    tokens.forEach((token, index) => {
      if (token.key === "(") open.push(index);
      else if (token.key.startsWith(")")) {
        const start = open.pop();
        if (start !== undefined) groups.push(Array.from({ length: index - start + 1 }, (_, k) => start + k));
      }
    });
    return groups.filter((group) => group.length >= 3);
  },

  /**
   * The diff read for what the step did. In each stretch the two lines don't share: another copy of a factor now taken
   * out in front of a bracket gathers into it; a term and its opposite are struck out; several terms that become one
   * combine; otherwise the old pieces are paired in order with the new ones, a letter becoming a number being a
   * substitution (flown from its "letter = value" when `definitions` finds one).
   */
  refine(
    changes: MorphChange[],
    before: MorphToken[],
    after: MorphToken[],
    definitions: (symbol: string, value: string) => MorphOrigin | null = () => null,
  ): MorphChange[] {
    const stays = new Map<string, { from: number; to: number }[]>();
    for (const change of changes)
      if (change.kind === "keep" || change.kind === "move") {
        const key = after[change.to]!.key;
        stays.set(key, [...(stays.get(key) ?? []), { from: change.from, to: change.to }]);
      }
    const count = (key: string, tokens: MorphToken[]) => tokens.filter((t) => t.key === key).length;
    /** The piece in the new line a copy gathers into: the same factor, now in front of a bracket. */
    const gathersInto = (a: number): number | null => {
      const key = before[a]!.key;
      if (!EquationMorph.isOperand(key) || !(count(key, before) > count(key, after))) return null;
      const twin = (stays.get(key) ?? []).find((t) => {
        const between = before.slice(Math.min(t.from, a), Math.max(t.from, a) + 1).map((tk) => tk.key);
        return (
          t.to + 1 < after.length && after[t.to + 1]!.key === "(" && (between.includes("+") || between.includes("-"))
        );
      });
      return twin ? twin.to : null;
    };
    const gap = (goneIn: number[], fresh: number[]): MorphChange[] => {
      const out: MorphChange[] = [];
      let gone = goneIn.filter((a) => {
        const into = gathersInto(a);
        if (into === null) return true;
        out.push({ kind: "gather", from: a, into });
        return false;
      });
      // "+ k … − k": struck out together.
      const signed: { sign: string; at: number }[] = [];
      for (const a of gone) {
        if (!EquationMorph.isOperand(before[a]!.key)) continue;
        // A term of its own: a lone piece between signs.
        const previous = a > 0 ? before[a - 1]!.key : "=";
        const next = a + 1 < before.length ? before[a + 1]!.key : "=";
        if (!(binary.has(next) || relations.has(next) || next.startsWith(")"))) continue;
        if (previous === "-" && gone.includes(a - 1)) signed.push({ sign: "-", at: a });
        else if (previous === "+" ? gone.includes(a - 1) : relations.has(previous) || previous === "(")
          signed.push({ sign: "+", at: a });
      }
      const struck = new Set<number>();
      for (const plus of signed) {
        if (plus.sign !== "+" || struck.has(plus.at)) continue;
        const minus = signed.find(
          (s) => s.sign === "-" && !struck.has(s.at) && before[s.at]!.key === before[plus.at]!.key,
        );
        if (!minus) continue;
        for (const a of [plus.at, minus.at]) {
          struck.add(a);
          if (a > 0 && gone.includes(a - 1) && binary.has(before[a - 1]!.key)) struck.add(a - 1);
        }
      }
      if (struck.size > 0 && fresh.length > 0) {
        for (const from of [...struck].sort((x, y) => x - y)) out.push({ kind: "cancel", from });
        gone = gone.filter((a) => !struck.has(a));
      }
      if (gone.length === 0) return [...out, ...fresh.map((to): MorphChange => ({ kind: "appear", to }))];
      if (fresh.length === 0) return [...out, ...gone.map((from): MorphChange => ({ kind: "cancel", from }))];
      if (fresh.length === 1 && gone.length >= 3 && gone.some((a) => binary.has(before[a]!.key)))
        return [...out, { kind: "combine", from: gone, into: fresh[0]! }];
      // "a t" given its values "2 \cdot 3": each letter its value, the sign now written comes in.
      const values = fresh.filter((b) => EquationMorph.isValue(after[b]!.key));
      if (
        gone.length > 1 &&
        values.length === gone.length &&
        gone.every((a) => EquationMorph.isSymbol(before[a]!.key)) &&
        fresh.every((b) => EquationMorph.isValue(after[b]!.key) || after[b]!.key === "\\times")
      )
        return [
          ...out,
          ...gone.map((a, k): MorphChange => ({
            kind: "substitute",
            from: [a],
            into: values[k]!,
            origin: definitions(before[a]!.key, after[values[k]!]!.key),
          })),
          ...fresh.filter((b) => !values.includes(b)).map((to): MorphChange => ({ kind: "appear", to })),
        ];
      const paired = Math.min(gone.length, fresh.length);
      for (let k = 0; k < paired; k++) {
        const from = k === paired - 1 ? gone.slice(k) : [gone[k]!];
        const symbol = before[from[0]!]!.key;
        const value = after[fresh[k]!]!.key;
        if (from.length === 1 && EquationMorph.isSymbol(symbol) && EquationMorph.isValue(value))
          out.push({ kind: "substitute", from, into: fresh[k]!, origin: definitions(symbol, value) });
        else out.push({ kind: "merge", from, into: fresh[k]! });
      }
      return [...out, ...fresh.slice(paired).map((to): MorphChange => ({ kind: "appear", to }))];
    };
    const refined: MorphChange[] = [];
    let index = 0;
    while (index < changes.length) {
      const change = changes[index]!;
      if (change.kind === "merge") {
        // The merge stands for its stretch's first new piece; the appears right after it are the rest.
        const fresh = [change.into];
        index += 1;
        for (;;) {
          const next = changes[index];
          if (next?.kind !== "appear" || next.to !== fresh[fresh.length - 1]! + 1) break;
          fresh.push(next.to);
          index += 1;
        }
        refined.push(...gap(change.from, fresh));
      } else if (change.kind === "cancel") {
        const gone: number[] = [];
        for (;;) {
          const next = changes[index];
          if (next?.kind !== "cancel") break;
          gone.push(next.from);
          index += 1;
        }
        refined.push(...gap(gone, []));
      } else {
        refined.push(change);
        index += 1;
      }
    }
    return refined;
  },

  // MARK: Layout

  /** Pieces typeset one by one, side by side, must come to about the whole line's width. */
  layoutAgrees: (parts: number, whole: number) =>
    whole > 0 && parts > 0 && parts <= whole * 1.06 && parts >= whole * 0.7,

  /** How much of the line's spare width goes on each side of a piece. */
  spaceWeight(tokens: MorphToken[], index: number): number {
    const key = tokens[index]!.key;
    if (relations.has(key)) return 5;
    if (binary.has(key)) {
      // A sign at the start or after an opening bracket or a relation is the number's own.
      if (index === 0) return 0.5;
      const previous = tokens[index - 1]!.key;
      return previous === "(" || previous === "[" || relations.has(previous) || binary.has(previous) ? 0.5 : 4;
    }
    return 0.5;
  },

  /** The left edge of each piece: the space written before it as it is, and the rest of the spare width by weight. */
  positions(widths: number[], weights: number[], whole: number, fixed: number[] | null = null): number[] {
    const fixedSpace = fixed ?? widths.map(() => 0);
    const spare = Math.max(0, whole - widths.reduce((s, w) => s + w, 0) - fixedSpace.reduce((s, w) => s + w, 0));
    // Each weight counts on both sides of its piece, except the line's two ends.
    const sides = weights.map((w) => w * 2);
    if (sides.length > 0) {
      sides[0] = weights[0]!;
      sides[sides.length - 1] = weights[weights.length - 1]!;
    }
    if (sides.length === 1) sides[0] = 0;
    const total = sides.reduce((s, w) => s + w, 0);
    const unit = total > 0 ? spare / total : 0;
    let x = 0;
    const lefts: number[] = [];
    widths.forEach((width, index) => {
      const before = index === 0 ? 0 : weights[index]! * unit;
      x += before + fixedSpace[index]!;
      lefts.push(x);
      x += width + (index === widths.length - 1 ? 0 : weights[index]! * unit);
    });
    return lefts;
  },

  /** Where the rows of a block sit: each row's left edge so the columns line up, and each row's baseline. */
  blockLayout(
    widths: number[],
    columns: (number | null)[],
    ascents: number[],
    descents: number[],
    height: number,
  ): { lefts: number[]; baselines: number[]; width: number } {
    const given = columns.filter((c): c is number => c !== null);
    const column = given.length > 0 ? Math.max(...given) : null;
    const lefts = columns.map((own) => (column !== null && own !== null ? column - own : 0));
    const used = ascents.reduce((s, a, k) => s + a + descents[k]!, 0);
    const gap = ascents.length > 1 ? Math.max(0, (height - used) / (ascents.length - 1)) : 0;
    let y = 0;
    const baselines: number[] = [];
    ascents.forEach((ascent, row) => {
      baselines.push(y + ascent);
      y += ascent + descents[row]! + gap;
    });
    const width = lefts.length > 0 ? Math.max(...lefts.map((left, k) => left + widths[k]!)) : 0;
    return { lefts, baselines, width };
  },

  // MARK: Timing

  /** 0…1 eased in and out. */
  ease(t: number): number {
    const u = Math.min(Math.max(t, 0), 1);
    return u * u * (3 - 2 * u);
  },

  /** `t` mapped from `start…end` onto 0…1. */
  span: (t: number, start: number, end: number) =>
    Math.min(Math.max((t - start) / Math.max(end - start, 0.0001), 0), 1),

  /** The morph's length in units of a one-stage morph. */
  length: (stages: number) => 1 + EquationMorph.stageShare * Math.max(stages - 1, 0),

  /** The whole morph's 0…1 as stage `stage`'s own 0…1: the stages play one after another. */
  stageTime(t: number, stage: number, stages: number): number {
    if (stages <= 1) return t;
    const total = EquationMorph.length(stages);
    const start = stage === 0 ? 0 : (1 + EquationMorph.stageShare * (stage - 1)) / total;
    const end = (1 + EquationMorph.stageShare * stage) / total;
    return EquationMorph.span(t, start, end);
  },

  /** How many rows of a block are worked out one after another (1 for a line that morphs or crossfades in one go). */
  stages(source: string, target: string): number {
    const plan = EquationMorph.plan(source, target);
    if (plan.kind !== "morph") return 1;
    return Math.max(0, ...plan.rows.map((row) => row.stage)) + 1;
  },
};

/** The morph in three beats that never overlap on screen: what goes leaves, what stays slides, what is new comes in. */
export const MorphTiming = {
  /** What goes is fully gone by here. */
  outEnd: 0.45,
  /** What stays travels between these. */
  travelStart: 0.4,
  travelEnd: 0.65,
  /** What is new starts appearing here. */
  inStart: 0.6,

  /** Opacity of a piece that goes. */
  outgoing: (t: number) => 1 - EquationMorph.ease(EquationMorph.span(t, 0, MorphTiming.outEnd)),
  /** Opacity of a piece that is new. */
  incoming: (t: number) => EquationMorph.ease(EquationMorph.span(t, MorphTiming.inStart, 1)),
  /** How far a piece that stays (or moves) has travelled, 0…1. */
  travel: (t: number) => EquationMorph.ease(EquationMorph.span(t, MorphTiming.travelStart, MorphTiming.travelEnd)),
  /** The strike through a cancelled piece, drawn before it fades. */
  strike: (t: number) => EquationMorph.span(t, 0, MorphTiming.outEnd * 0.5),
  /** Upward lift of a piece that goes, as a share of the font size. */
  lift: (t: number) => -0.35 * EquationMorph.ease(EquationMorph.span(t, 0, MorphTiming.outEnd)),
  /** Drop a new piece rises from, as a share of the font size (0 when in place). */
  rise: (t: number) => 0.3 * (1 - MorphTiming.incoming(t)),
  /** How far terms worked out into one have closed in on its place, 0…1. */
  closeIn: (t: number) => EquationMorph.ease(EquationMorph.span(t, 0, MorphTiming.outEnd)),
  /** Opacity of a factor's copy gathering into it: there until it arrives on its twin. */
  gathering: (t: number) => 1 - EquationMorph.span(t, MorphTiming.travelEnd - 0.04, MorphTiming.travelEnd),
  /** How far a value flown from where it was given has gone, 0…1. */
  fly: (t: number) => EquationMorph.ease(EquationMorph.span(t, MorphTiming.inStart, 1)),
  /** Opacity of that value: it lifts off its "letter = value" as the new pieces start. */
  flying: (t: number) => EquationMorph.span(t, MorphTiming.inStart, MorphTiming.inStart + 0.08),
};

/** When each stage (row) of a morph plays, in seconds from its start. */
export class MorphPacing {
  constructor(
    readonly starts: number[],
    readonly lengths: number[],
  ) {}

  /** The fixed rhythm with no voice to follow: each row after the first takes `stageShare` of the first's seconds. */
  static even(stage: number, stages: number): MorphPacing {
    const count = Math.max(stages, 1);
    const lengths = Array.from({ length: count }, (_, k) => (k === 0 ? stage : stage * EquationMorph.stageShare));
    const starts: number[] = [];
    let at = 0;
    for (const length of lengths) {
      starts.push(at);
      at += length;
    }
    return new MorphPacing(starts, lengths);
  }

  /** Seconds until the last stage has played. */
  get total(): number {
    return this.starts.length === 0 ? 0 : Math.max(...this.starts.map((start, k) => start + this.lengths[k]!));
  }

  /** Stage `stage`'s own 0…1 at `seconds` into the morph. */
  stageTime(seconds: number, stage: number): number {
    if (this.starts.length === 0 || this.lengths.length === 0) return 1;
    const start = this.starts[Math.min(stage, this.starts.length - 1)]!;
    const length = this.lengths[Math.min(stage, this.lengths.length - 1)]!;
    if (!(length > 0)) return seconds >= start ? 1 : 0;
    return Math.min(Math.max((seconds - start) / length, 0), 1);
  }
}
