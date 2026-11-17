// Port of the propositional logic and the truth table of LearnLayer/Illustrations/PremadeFigureLogic.swift @ ref
// 2026-11-04: formulas read from text (¬ ∧ ∨ ⊕ → ↔ ⊼ ⊽, with the usual precedence) and evaluated by the app, and a
// truth table built column by column from the inside out, with its verdict (tautology, contradiction, contingent).

import type { IllustrationParameter } from "../illustration";
import { choiceIndex } from "./flowchart";
import { Anim, FigureCanvas, Params, slider, type AnimatedIllustration } from "./figureCanvas";

export type PropOp = "and" | "or" | "xor" | "implies" | "iff" | "nand" | "nor";

export const opSymbol: Record<PropOp, string> = {
  and: "∧",
  or: "∨",
  xor: "⊕",
  implies: "→",
  iff: "↔",
  nand: "⊼",
  nor: "⊽",
};

export function applyOp(op: PropOp, a: boolean, b: boolean): boolean {
  switch (op) {
    case "and":
      return a && b;
    case "or":
      return a || b;
    case "xor":
      return a !== b;
    case "implies":
      return !a || b;
    case "iff":
      return a === b;
    case "nand":
      return !(a && b);
    case "nor":
      return !(a || b);
  }
}

/** A formula of propositional logic over single-letter variables. */
export type PropFormula =
  | { kind: "variable"; name: string }
  | { kind: "not"; inner: PropFormula }
  | { kind: "binary"; op: PropOp; left: PropFormula; right: PropFormula };

export const Prop = {
  variable: (name: string): PropFormula => ({ kind: "variable", name }),

  /** The variables in alphabetical order. */
  variables(formula: PropFormula): string[] {
    const found = new Set<string>();
    const collect = (f: PropFormula) => {
      if (f.kind === "variable") found.add(f.name);
      else if (f.kind === "not") collect(f.inner);
      else {
        collect(f.left);
        collect(f.right);
      }
    };
    collect(formula);
    return [...found].sort();
  },

  evaluate(formula: PropFormula, values: Readonly<Record<string, boolean>>): boolean {
    switch (formula.kind) {
      case "variable":
        return values[formula.name] ?? false;
      case "not":
        return !Prop.evaluate(formula.inner, values);
      case "binary":
        return applyOp(formula.op, Prop.evaluate(formula.left, values), Prop.evaluate(formula.right, values));
    }
  },

  /** The formula as written in the figures: every compound part inside a compound one in brackets. */
  text(formula: PropFormula): string {
    const bracketed = (f: PropFormula) => (f.kind === "binary" ? "(" + Prop.text(f) + ")" : Prop.text(f));
    switch (formula.kind) {
      case "variable":
        return formula.name;
      case "not":
        return formula.inner.kind === "binary" ? "¬(" + Prop.text(formula.inner) + ")" : "¬" + Prop.text(formula.inner);
      case "binary":
        return bracketed(formula.left) + " " + opSymbol[formula.op] + " " + bracketed(formula.right);
    }
  },

  equal(a: PropFormula, b: PropFormula): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  },

  /** Every part that is not a bare variable, innermost first, each once: the columns of a truth table. */
  subformulas(formula: PropFormula): PropFormula[] {
    const result: PropFormula[] = [];
    const append = (f: PropFormula) => {
      if (f.kind === "variable") return;
      if (f.kind === "not") append(f.inner);
      else {
        append(f.left);
        append(f.right);
      }
      if (!result.some((existing) => Prop.equal(existing, f))) result.push(f);
    };
    append(formula);
    return result;
  },

  /** Every row of the truth table: the first is all true, the last all false. */
  assignments(names: string[]): Record<string, boolean>[] {
    const count = names.length;
    return Array.from({ length: 1 << count }, (_, row) => {
      const values: Record<string, boolean> = {};
      names.forEach((name, index) => (values[name] = ((row >> (count - 1 - index)) & 1) === 0));
      return values;
    });
  },

  /** Tautology, contradiction or contingent, from the rows. */
  verdict(values: boolean[]): "tautology" | "contradiction" | "contingent" {
    if (values.every((v) => v)) return "tautology";
    if (values.every((v) => !v)) return "contradiction";
    return "contingent";
  },

  /** Reads a formula from text: ¬ ! ~ not, ∧ & and, ∨ | or, ⊕ xor, → -> =>, ↔ <-> <=>, ⊼ nand, ⊽ nor. Precedence:
   * not, and, or, implies (to the right), iff. Null when it cannot be read. */
  parse(text: string): PropFormula | null {
    if (Array.from(text).length > 80) return null;
    const tokens = tokenize(text);
    if (!tokens || tokens.length === 0) return null;
    return new PropReader(tokens).parseAll();
  },
};

type PropToken =
  | { kind: "variable"; name: string }
  | { kind: "not" }
  | { kind: "op"; op: PropOp }
  | { kind: "open" }
  | { kind: "close" };

const symbols: [string, PropToken][] = [
  ["<->", { kind: "op", op: "iff" }],
  ["<=>", { kind: "op", op: "iff" }],
  ["↔", { kind: "op", op: "iff" }],
  ["⇔", { kind: "op", op: "iff" }],
  ["->", { kind: "op", op: "implies" }],
  ["=>", { kind: "op", op: "implies" }],
  ["→", { kind: "op", op: "implies" }],
  ["⇒", { kind: "op", op: "implies" }],
  ["&&", { kind: "op", op: "and" }],
  ["&", { kind: "op", op: "and" }],
  ["∧", { kind: "op", op: "and" }],
  ["||", { kind: "op", op: "or" }],
  ["|", { kind: "op", op: "or" }],
  ["∨", { kind: "op", op: "or" }],
  ["⊕", { kind: "op", op: "xor" }],
  ["⊻", { kind: "op", op: "xor" }],
  ["⊼", { kind: "op", op: "nand" }],
  ["⊽", { kind: "op", op: "nor" }],
  ["¬", { kind: "not" }],
  ["~", { kind: "not" }],
  ["!", { kind: "not" }],
  ["(", { kind: "open" }],
  ["[", { kind: "open" }],
  [")", { kind: "close" }],
  ["]", { kind: "close" }],
];

const words: Record<string, PropToken> = {
  and: { kind: "op", op: "and" },
  or: { kind: "op", op: "or" },
  not: { kind: "not" },
  xor: { kind: "op", op: "xor" },
  nand: { kind: "op", op: "nand" },
  nor: { kind: "op", op: "nor" },
  iff: { kind: "op", op: "iff" },
  implies: { kind: "op", op: "implies" },
};

const isLetter = (character: string) => /^\p{L}$/u.test(character);

function tokenize(text: string): PropToken[] | null {
  const characters = Array.from(text);
  const tokens: PropToken[] = [];
  let index = 0;
  while (index < characters.length) {
    const character = characters[index]!;
    if (character === " " || character === "\t") {
      index += 1;
      continue;
    }
    const rest = characters.slice(index).join("");
    const symbol = symbols.find(([pattern]) => rest.startsWith(pattern));
    if (symbol) {
      tokens.push(symbol[1]);
      index += Array.from(symbol[0]).length;
      continue;
    }
    if (!isLetter(character)) return null;
    let end = index;
    while (end < characters.length && isLetter(characters[end]!)) end += 1;
    const word = characters.slice(index, end).join("").toLowerCase();
    const token = words[word];
    if (token) tokens.push(token);
    else if (Array.from(word).length === 1) tokens.push({ kind: "variable", name: word });
    else return null;
    index = end;
  }
  return tokens;
}

class PropReader {
  private index = 0;
  constructor(private readonly tokens: PropToken[]) {}

  parseAll(): PropFormula | null {
    const formula = this.parseIff();
    return formula && this.index === this.tokens.length ? formula : null;
  }

  private peekOp(ops: PropOp[]): PropOp | null {
    const token = this.tokens[this.index];
    return token && token.kind === "op" && ops.includes(token.op) ? token.op : null;
  }

  private parseIff(): PropFormula | null {
    let left = this.parseImplies();
    if (!left) return null;
    for (let op = this.peekOp(["iff"]); op; op = this.peekOp(["iff"])) {
      this.index += 1;
      const right = this.parseImplies();
      if (!right) return null;
      left = { kind: "binary", op, left, right };
    }
    return left;
  }

  private parseImplies(): PropFormula | null {
    const left = this.parseOr();
    if (!left) return null;
    const op = this.peekOp(["implies"]);
    if (!op) return left;
    this.index += 1;
    const right = this.parseImplies();
    return right ? { kind: "binary", op, left, right } : null;
  }

  private parseOr(): PropFormula | null {
    let left = this.parseAnd();
    if (!left) return null;
    for (let op = this.peekOp(["or", "xor", "nor"]); op; op = this.peekOp(["or", "xor", "nor"])) {
      this.index += 1;
      const right = this.parseAnd();
      if (!right) return null;
      left = { kind: "binary", op, left, right };
    }
    return left;
  }

  private parseAnd(): PropFormula | null {
    let left = this.parseUnary();
    if (!left) return null;
    for (let op = this.peekOp(["and", "nand"]); op; op = this.peekOp(["and", "nand"])) {
      this.index += 1;
      const right = this.parseUnary();
      if (!right) return null;
      left = { kind: "binary", op, left, right };
    }
    return left;
  }

  private parseUnary(): PropFormula | null {
    const token = this.tokens[this.index];
    if (!token) return null;
    if (token.kind === "not") {
      this.index += 1;
      const inner = this.parseUnary();
      return inner ? { kind: "not", inner } : null;
    }
    return this.parseAtom();
  }

  private parseAtom(): PropFormula | null {
    const token = this.tokens[this.index];
    if (!token) return null;
    if (token.kind === "variable") {
      this.index += 1;
      return { kind: "variable", name: token.name };
    }
    if (token.kind === "open") {
      this.index += 1;
      const inner = this.parseIff();
      if (!inner || this.tokens[this.index]?.kind !== "close") return null;
      this.index += 1;
      return inner;
    }
    return null;
  }
}

// MARK: Truth tables

export const truthTableConnectives: PropOp[] = ["and", "or", "implies", "iff", "xor", "nand", "nor"];

const connectiveNames: Record<PropOp, [string, string]> = {
  and: ["Conjunção", "Conjunction"],
  or: ["Disjunção", "Disjunction"],
  implies: ["Condicional (implicação)", "Conditional (implication)"],
  iff: ["Bicondicional (equivalência)", "Biconditional (equivalence)"],
  xor: ["Disjunção exclusiva", "Exclusive disjunction (XOR)"],
  nand: ["NAND: negação da conjunção", "NAND: negated conjunction"],
  nor: ["NOR: negação da disjunção", "NOR: negated disjunction"],
};

/** Well-known laws, for the slider that walks through them. */
export const truthTableLaws: { key: string; pt: string; en: string; text: string }[] = [
  { key: "deMorgan1", pt: "Lei de De Morgan (1)", en: "De Morgan's law (1)", text: "¬(p ∧ q) ↔ (¬p ∨ ¬q)" },
  { key: "deMorgan2", pt: "Lei de De Morgan (2)", en: "De Morgan's law (2)", text: "¬(p ∨ q) ↔ (¬p ∧ ¬q)" },
  { key: "contrapositive", pt: "Lei da contraposição", en: "Contraposition law", text: "(p → q) ↔ (¬q → ¬p)" },
  {
    key: "implication",
    pt: "Condicional como disjunção",
    en: "Conditional as a disjunction",
    text: "(p → q) ↔ (¬p ∨ q)",
  },
  { key: "excludedMiddle", pt: "Terceiro excluído", en: "Excluded middle", text: "p ∨ ¬p" },
  { key: "contradiction", pt: "Contradição: p e não p", en: "Contradiction: p and not p", text: "p ∧ ¬p" },
  { key: "modusPonens", pt: "Modus ponens", en: "Modus ponens", text: "((p → q) ∧ p) → q" },
  {
    key: "converse",
    pt: "A recíproca não é equivalente",
    en: "The converse is not equivalent",
    text: "(p → q) ↔ (q → p)",
  },
];

/** Step times where the step has finished just before whatever starts the next one (Batch4 `recordSettledSteps`). */
export function recordSettledSteps(canvas: FigureCanvas, times: number[]): void {
  canvas.recordSteps(times.map((t) => (t > 0.05 ? t - 0.02 : t)));
}

type Source = {
  formula: PropFormula;
  mode: { kind: "expression" } | { kind: "connective"; index: number } | { kind: "law"; index: number };
  name: [string, string] | null;
};

/** The formula to tabulate and how it was asked for: an `expression`, a `law` or a `connective`. */
function truthTableSource(params: Params): Source | null {
  const text = params.text("expression");
  if (text !== null) {
    const formula = Prop.parse(text);
    return formula ? { formula, mode: { kind: "expression" }, name: null } : null;
  }
  if (params.has("law")) {
    const index = choiceIndex(
      params,
      "law",
      truthTableLaws.map((law) => law.key),
    );
    const formula = index === null ? null : Prop.parse(truthTableLaws[index]!.text);
    if (index === null || !formula) return null;
    return { formula, mode: { kind: "law", index }, name: [truthTableLaws[index]!.pt, truthTableLaws[index]!.en] };
  }
  if (params.has("connective")) {
    const index = choiceIndex(params, "connective", truthTableConnectives);
    if (index === null) return null;
    const op = truthTableConnectives[index]!;
    return {
      formula: { kind: "binary", op, left: Prop.variable("p"), right: Prop.variable("q") },
      mode: { kind: "connective", index },
      name: connectiveNames[op],
    };
  }
  return null;
}

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

const truthTable: Compiler = (params, title, language) => {
  const canvas = new FigureCanvas(language);
  const source = truthTableSource(params);
  if (!source) return null;
  const formula = source.formula;
  const names = Prop.variables(formula);
  const subs = Prop.subformulas(formula);
  if (names.length < 1 || names.length > 3 || subs.length === 0) return null;
  const headers = [...names, ...subs.map(Prop.text)];
  const widths = headers.map((header) => Math.max(0.62, Array.from(header).length * 0.13 + 0.36));
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (total > 9.5) return null;

  const assignments = Prop.assignments(names);
  const rowCount = assignments.length;
  const columnCount = headers.length;
  const cell = (row: number, column: number) =>
    column < names.length
      ? (assignments[row]![names[column]!] ?? false)
      : Prop.evaluate(subs[column - names.length]!, assignments[row]!);
  const results = assignments.map((_, row) => cell(row, columnCount - 1));
  const verdict = Prop.verdict(results);
  const trueRows = results.filter((v) => v).length;

  const left = (10 - total) / 2;
  const lefts: number[] = [];
  let cursor = left;
  for (const width of widths) {
    lefts.push(cursor);
    cursor += width;
  }
  const centre = (column: number) => lefts[column]! + widths[column]! / 2;
  const headerY = 4.95;
  const ruleY = 4.68;
  const pitch = rowCount > 4 ? 0.48 : 0.56;
  const rowBottom = (row: number) => ruleY - pitch * (row + 1);
  const rowCentre = (row: number) => rowBottom(row) + pitch / 2;
  const trueText = canvas.say("V", "T");
  const falseText = canvas.say("F", "F");

  // Timing: the headers one after the other (the variables, then each part from the inside out), then a row at a time.
  const headersDone = 0.2 + 0.25 * subs.length + 0.4;
  const rowStep = 0.45 + 0.1 * subs.length;
  const tableEnd = headersDone + rowStep * rowCount;

  canvas.caption(
    source.name ? canvas.say(source.name[0], source.name[1]) : canvas.say("Tabela de verdade", "Truth table"),
    {
      row: 0,
      color: "white",
      visible: Anim.after(0.1),
    },
  );

  // Frame: the rule under the headers and the divide between the variables and the parts built from them.
  canvas.line(left, ruleY, left + total, ruleY, { color: "muted" });
  const divideX = left + widths.slice(0, names.length).reduce((sum, w) => sum + w, 0);
  canvas.line(divideX, headerY + 0.25, divideX, rowBottom(rowCount - 1), { color: "muted" });
  for (let column = 0; column < columnCount; column++) {
    const appears = column < names.length ? 0.2 : 0.2 + 0.25 * (column - names.length + 1);
    canvas.label(headers[column]!, centre(column), headerY, {
      anchor: "center",
      color: column === columnCount - 1 ? "accent" : "white",
      visible: Anim.after(appears),
    });
  }
  for (let row = 0; row < rowCount; row++) {
    const start = headersDone + rowStep * row;
    canvas.box(left, rowBottom(row), total, pitch, { color: "muted", visible: Anim.window(start, start + rowStep) });
    for (let column = 0; column < columnCount; column++) {
      const delay = column < names.length ? 0 : 0.25 + 0.1 * (column - names.length);
      canvas.label(cell(row, column) ? trueText : falseText, centre(column), rowCentre(row), {
        anchor: "center",
        color: "white",
        visible: Anim.after(start + delay),
      });
    }
  }

  // The result column, marked once every row is in.
  const last = columnCount - 1;
  for (let row = 0; row < rowCount; row++)
    if (verdict !== "contingent" || results[row])
      canvas.box(lefts[last]! + 0.04, rowBottom(row) + 0.04, widths[last]! - 0.08, pitch - 0.08, {
        color: verdict === "contradiction" ? "second" : "accent",
        visible: Anim.after(tableEnd),
      });

  const isEquivalence = formula.kind === "binary" && formula.op === "iff";
  const verdictText =
    verdict === "tautology"
      ? isEquivalence
        ? canvas.say("Tautologia: as duas fórmulas são equivalentes", "Tautology: the two formulas are equivalent")
        : canvas.say("Tautologia: verdadeira em todas as linhas", "Tautology: true in every row")
      : verdict === "contradiction"
        ? canvas.say("Contradição: falsa em todas as linhas", "Contradiction: false in every row")
        : isEquivalence
          ? canvas.say(
              `Não equivalentes: valores diferentes em ${rowCount - trueRows} de ${rowCount} linhas`,
              `Not equivalent: different values in ${rowCount - trueRows} of ${rowCount} rows`,
            )
          : canvas.say(
              `Contingência: verdadeira em ${trueRows} de ${rowCount} linhas`,
              `Contingent: true in ${trueRows} of ${rowCount} rows`,
            );
  canvas.caption(verdictText, {
    row: 1,
    color: verdict === "tautology" ? "accent" : verdict === "contradiction" ? "second" : "white",
    visible: Anim.after(tableEnd),
  });

  const parameters: IllustrationParameter[] = [];
  if (source.mode.kind === "law")
    parameters.push(
      slider("law", canvas.say("lei (0 a 7)", "law (0 to 7)"), source.mode.index, 0, truthTableLaws.length - 1),
    );
  else if (source.mode.kind === "connective")
    parameters.push(
      slider(
        "connective",
        canvas.say("conetivo: 0∧ 1∨ 2→ 3↔ 4⊕ 5⊼ 6⊽", "connective: 0∧ 1∨ 2→ 3↔ 4⊕ 5⊼ 6⊽"),
        source.mode.index,
        0,
        truthTableConnectives.length - 1,
      ),
    );
  const boundaries = [
    0,
    headersDone,
    ...assignments.map((_, row) => headersDone + rowStep * (row + 1)),
    tableEnd + 0.8,
  ];
  recordSettledSteps(canvas, boundaries);
  return canvas.illustration(title, Anim.duration(tableEnd + 1.0), parameters);
};

/** The truth table, by premade type. */
export const logicFigures: Record<string, Compiler> = { truthTable };
