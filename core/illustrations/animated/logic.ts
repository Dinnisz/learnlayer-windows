// Port of the propositional logic and the truth table of LearnLayer/Illustrations/PremadeFigureLogic.swift @ ref
// 2026-11-04: formulas read from text (¬ ∧ ∨ ⊕ → ↔ ⊼ ⊽, with the usual precedence) and evaluated by the app, and a
// truth table built column by column from the inside out, with its verdict (tautology, contradiction, contingent), and
// the formula as a circuit of IEC gates, with the signal going through it level by level.

import type { IllustrationParameter } from "../illustration";
import { choiceIndex } from "./flowchart";
import { integerParam } from "./loops";
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

// MARK: - Logic gates

export type GateKind = "and" | "or" | "xor" | "not" | "nand" | "nor";

/** A gate drawn with the IEC rectangular symbol: & for and, ≥1 for or, =1 for xor, 1 for not, a bubble for the inverted ones. */
export const Gates = {
  symbol(kind: GateKind): string {
    switch (kind) {
      case "and":
      case "nand":
        return "&";
      case "or":
      case "nor":
        return "≥1";
      case "xor":
        return "=1";
      case "not":
        return "1";
    }
  },

  inverted: (kind: GateKind) => kind === "not" || kind === "nand" || kind === "nor",

  apply(kind: GateKind, inputs: boolean[]): boolean {
    switch (kind) {
      case "not":
        return !(inputs[0] ?? false);
      case "and":
        return inputs.every((v) => v);
      case "or":
        return inputs.includes(true);
      case "xor":
        return inputs.filter((v) => v).length % 2 === 1;
      case "nand":
        return !inputs.every((v) => v);
      case "nor":
        return !inputs.includes(true);
    }
  },

  /** The gate of an operator; null for → and ↔ (those are not gates). */
  of(op: PropOp): GateKind | null {
    return op === "implies" || op === "iff" ? null : op;
  },

  /** The formula a lone gate computes on p (and q). */
  formula(kind: GateKind): PropFormula {
    if (kind === "not") return { kind: "not", inner: Prop.variable("p") };
    return { kind: "binary", op: kind, left: Prop.variable("p"), right: Prop.variable("q") };
  },

  /** The order of the slider that picks a lone gate. */
  sliderOrder: ["and", "or", "xor", "not", "nand", "nor"] as GateKind[],
};

export type GateSource = { kind: "variable"; name: string } | { kind: "gate"; index: number };

export interface Gate {
  kind: GateKind;
  sources: GateSource[];
  depth: number;
}

/** A formula as gates and wires: one gate per operator, in the order they can be computed. */
export class GateCircuit {
  readonly gates: Gate[] = [];

  private constructor() {}

  /** Null when the formula uses → or ↔ (those are not gates). */
  static of(formula: PropFormula): GateCircuit | null {
    const circuit = new GateCircuit();
    return circuit.add(formula) === null ? null : circuit;
  }

  private add(formula: PropFormula): GateSource | null {
    switch (formula.kind) {
      case "variable":
        return { kind: "variable", name: formula.name };
      case "not": {
        const source = this.add(formula.inner);
        return source === null ? null : this.append("not", [source]);
      }
      case "binary": {
        const kind = Gates.of(formula.op);
        if (kind === null) return null;
        const a = this.add(formula.left);
        if (a === null) return null;
        const b = this.add(formula.right);
        if (b === null) return null;
        return this.append(kind, [a, b]);
      }
    }
  }

  private append(kind: GateKind, sources: GateSource[]): GateSource {
    let depth = 0;
    for (const source of sources) if (source.kind === "gate") depth = Math.max(depth, this.gates[source.index]!.depth);
    this.gates.push({ kind, sources, depth: depth + 1 });
    return { kind: "gate", index: this.gates.length - 1 };
  }

  get maxDepth(): number {
    return this.gates.reduce((most, gate) => Math.max(most, gate.depth), 0);
  }

  /** The output of every gate for the given inputs. */
  outputs(inputs: Readonly<Record<string, boolean>>): boolean[] {
    const values: boolean[] = [];
    for (const gate of this.gates) {
      const ins = gate.sources.map((source) =>
        source.kind === "variable" ? (inputs[source.name] ?? false) : values[source.index]!,
      );
      values.push(Gates.apply(gate.kind, ins));
    }
    return values;
  }
}

/** The input values of row `number` of the circuit's table: p is the leftmost binary digit. */
export function gateInputs(number: number, names: string[]): Record<string, boolean> {
  const values: Record<string, boolean> = {};
  names.forEach((name, index) => {
    values[name] = ((number >> (names.length - 1 - index)) & 1) === 1;
  });
  return values;
}

const logicGates: Compiler = (params, title, language) => {
  const canvas = new FigureCanvas(language);
  let formula: PropFormula;
  let gateChoice: number | null = null;
  const text = params.text("expression");
  if (text !== null) {
    const parsed = Prop.parse(text);
    if (!parsed) return null;
    formula = parsed;
  } else if (params.has("gate")) {
    const index = choiceIndex(params, "gate", Gates.sliderOrder);
    if (index === null) return null;
    gateChoice = index;
    formula = Gates.formula(Gates.sliderOrder[index]!);
  } else {
    return null;
  }
  const names = Prop.variables(formula);
  const circuit = GateCircuit.of(formula);
  if (names.length < 1 || names.length > 3 || !circuit) return null;
  if (circuit.gates.length < 1 || circuit.gates.length > 5 || circuit.maxDepth > 4) return null;
  const rows = 1 << names.length;
  // A lone gate follows its slider, so an input row from a gate with more inputs is brought back into range.
  const asked = params.has("inputs") ? integerParam(params, "inputs") : rows - 1;
  if (asked === null || (gateChoice === null && (asked < 0 || asked >= rows))) return null;
  const number = Math.min(Math.max(asked, 0), rows - 1);
  const inputs = gateInputs(number, names);
  const outputs = circuit.outputs(inputs);
  const result = outputs[outputs.length - 1]!;
  const gates = circuit.gates;

  // Geometry: a vertical rail per variable, one gate per row, columns by depth.
  // A small circuit is drawn larger, to use the picture.
  const roomy = gates.length <= 2;
  const railX = names.map((_, index) => 0.75 + 0.7 * index);
  const firstX = roomy ? 3.0 : 2.55;
  const pitchX = roomy ? 1.65 : 1.25;
  const boxW = roomy ? 0.95 : 0.7;
  const boxH = roomy ? 0.8 : 0.6;
  const bubble = roomy ? 0.26 : 0.2;
  const pinGap = boxH / 4;
  const count = gates.length;
  const rowPitch = count <= 1 ? 0 : Math.min(roomy ? 1.3 : 0.85, 3.0 / (count - 1));
  const topY = 3.0 + (rowPitch * (count - 1)) / 2;
  const centreY = (gate: number) => topY - rowPitch * gate;
  const boxLeft = (gate: number) => firstX + pitchX * (gates[gate]!.depth - 1);
  const outPin = (gate: number) => boxLeft(gate) + boxW + (Gates.inverted(gates[gate]!.kind) ? bubble : 0);
  const pinY = (gate: number, slot: number) =>
    gates[gate]!.sources.length === 1 ? centreY(gate) : centreY(gate) + (slot === 0 ? pinGap : -pinGap);
  // The input labels stand on two rows when there are several, so "p=1 q=0" never run together.
  const labelY = (rail: number) => (names.length === 1 ? 5.0 : rail % 2 === 0 ? 4.92 : 5.24);

  const inputsAt = 0.9;
  const levelTime = (depth: number) => inputsAt + 1.0 * depth;

  canvas.caption(canvas.say("Circuito lógico: S = ", "Logic circuit: S = ") + Prop.text(formula), {
    row: 0,
    color: "white",
    visible: Anim.after(0.1),
  });

  // Rails and their values.
  const lowestTap = new Map<string, number>();
  gates.forEach((gate, index) =>
    gate.sources.forEach((source, slot) => {
      if (source.kind === "variable")
        lowestTap.set(source.name, Math.min(lowestTap.get(source.name) ?? Infinity, pinY(index, slot)));
    }),
  );
  names.forEach((name, index) => {
    const on = inputs[name] ?? false;
    const top = labelY(index);
    canvas.label(`${name}=${on ? 1 : 0}`, railX[index]!, top, {
      anchor: "center",
      color: on ? "accent" : "muted",
      visible: Anim.after(0.3),
    });
    const bottom = lowestTap.get(name);
    if (bottom !== undefined) {
      canvas.line(railX[index]!, top - 0.2, railX[index]!, bottom, { color: "muted" });
      if (on)
        canvas.line(railX[index]!, top - 0.2, railX[index]!, bottom, {
          color: "accent",
          visible: Anim.after(inputsAt),
        });
    }
  });

  // Gates, then the wires into them.
  let wireCount = 0;
  for (let index = 0; index < gates.length; index++) {
    const gate = gates[index]!;
    const cy = centreY(index);
    const left = boxLeft(index);
    canvas.box(left, cy - boxH / 2, boxW, boxH, { color: "white" });
    canvas.label(Gates.symbol(gate.kind), left + boxW / 2, cy, { anchor: "center", color: "white" });
    if (Gates.inverted(gate.kind)) canvas.ring(left + boxW + bubble / 2, cy, bubble / 2, { color: "white" });
    for (let slot = 0; slot < gate.sources.length; slot++) {
      const source = gate.sources[slot]!;
      const py = pinY(index, slot);
      if (source.kind === "variable") {
        const railIndex = names.indexOf(source.name);
        if (railIndex < 0) return null;
        const on = inputs[source.name] ?? false;
        canvas.line(railX[railIndex]!, py, left, py, { color: "muted" });
        canvas.dot(railX[railIndex]!, py, { color: "muted" });
        if (on) canvas.line(railX[railIndex]!, py, left, py, { color: "accent", visible: Anim.after(inputsAt) });
      } else {
        const child = source.index;
        const startX = outPin(child);
        const cy0 = centreY(child);
        const midX = left - 0.08 - 0.07 * wireCount;
        wireCount += 1;
        const on = outputs[child]!;
        canvas.line(startX, cy0, midX, cy0, { color: "muted" });
        canvas.line(midX, cy0, midX, py, { color: "muted" });
        canvas.line(midX, py, left, py, { color: "muted" });
        const shown = Anim.after(levelTime(gates[child]!.depth));
        if (on) {
          canvas.line(startX, cy0, midX, cy0, { color: "accent", visible: shown });
          canvas.line(midX, cy0, midX, py, { color: "accent", visible: shown });
          canvas.line(midX, py, left, py, { color: "accent", visible: shown });
        }
        canvas.label(on ? "1" : "0", startX + 0.17, cy0 + 0.24, {
          anchor: "center",
          color: on ? "accent" : "muted",
          visible: shown,
        });
      }
    }
  }

  // The output.
  const root = count - 1;
  const rootDepthTime = levelTime(gates[root]!.depth);
  const stubStart = outPin(root);
  canvas.line(stubStart, centreY(root), stubStart + 0.4, centreY(root), { color: "muted" });
  if (result)
    canvas.line(stubStart, centreY(root), stubStart + 0.4, centreY(root), {
      color: "accent",
      visible: Anim.after(rootDepthTime),
    });
  // The output is named at the gate from the start; its value replaces the question mark when the signal arrives.
  canvas.label("S=?", stubStart + 0.48, centreY(root), {
    anchor: "leading",
    color: "white",
    visible: Anim.window(-1, rootDepthTime),
  });
  canvas.label(`S=${result ? 1 : 0}`, stubStart + 0.48, centreY(root), {
    anchor: "leading",
    color: result ? "accent" : "white",
    visible: Anim.after(rootDepthTime),
    claim: false,
  });

  // The table of the circuit, with the row being shown.
  const tableLeft = 8.4;
  const columnWidth = 0.36;
  const columns = names.length + 1;
  canvas.line(tableLeft, 4.68, tableLeft + columnWidth * columns, 4.68, { color: "muted" });
  names.forEach((name, index) =>
    canvas.label(name, tableLeft + columnWidth * (index + 0.5), 4.95, { anchor: "center", color: "white" }),
  );
  canvas.label("S", tableLeft + columnWidth * (names.length + 0.5), 4.95, { anchor: "center", color: "accent" });
  const rowHeight = 0.48;
  for (let row = 0; row < rows; row++) {
    const rowInputs = gateInputs(row, names);
    const rowResult = circuit.outputs(rowInputs).at(-1) ?? false;
    const bottom = 4.68 - rowHeight * (row + 1);
    if (row === number)
      canvas.box(tableLeft, bottom, columnWidth * columns, rowHeight, { color: "accent", visible: Anim.after(0.3) });
    names.forEach((name, index) =>
      canvas.label(rowInputs[name] ? "1" : "0", tableLeft + columnWidth * (index + 0.5), bottom + rowHeight / 2, {
        anchor: "center",
        color: "white",
      }),
    );
    canvas.label(rowResult ? "1" : "0", tableLeft + columnWidth * (names.length + 0.5), bottom + rowHeight / 2, {
      anchor: "center",
      color: "accent",
    });
  }

  const given = names.map((name) => `${name} = ${inputs[name] ? 1 : 0}`);
  const givenText =
    given.length === 1 ? given[0]! : given.slice(0, -1).join(", ") + canvas.say(" e ", " and ") + given.at(-1)!;
  canvas.caption(canvas.say(`Com ${givenText}, S = ${result ? 1 : 0}`, `With ${givenText}, S = ${result ? 1 : 0}`), {
    row: 1,
    color: result ? "accent" : "white",
    visible: Anim.after(rootDepthTime),
  });

  const parameters: IllustrationParameter[] = [];
  if (gateChoice !== null)
    parameters.push(
      slider(
        "gate",
        canvas.say("porta: 0& 1≥1 2=1 3¬ 4NAND 5NOR", "gate: 0& 1≥1 2=1 3¬ 4NAND 5NOR"),
        gateChoice,
        0,
        Gates.sliderOrder.length - 1,
      ),
    );
  parameters.push(slider("inputs", canvas.say("entradas (binário)", "inputs (binary)"), number, 0, rows - 1));
  const boundaries = [0, inputsAt + 0.3];
  for (let depth = 1; depth <= circuit.maxDepth; depth++) boundaries.push(levelTime(depth) + 0.3);
  recordSettledSteps(canvas, boundaries);
  return canvas.illustration(title, Anim.duration(levelTime(circuit.maxDepth) + 0.8), parameters);
};

/** The truth table and the logic gates, by premade type. */
export const logicFigures: Record<string, Compiler> = { truthTable, logicGates };
