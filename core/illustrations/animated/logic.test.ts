// Port of the formula and truth-table suites of LearnLayerTests/PremadeFigureBatch4LogicTests.swift @ ref 2026-11-04.
// The figures' bounds and overlaps are checked with the gallery in animated.test.ts.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration } from "../illustration";
import { PremadeFigures } from "../premadeFigure";
import { sample } from "./animated";
import { LabelBoard } from "./figureCanvas";
import { applyOp, GateCircuit, Prop, truthTableLaws, type PropFormula, type PropOp } from "./logic";

const parsed = (text: string): PropFormula => {
  const formula = Prop.parse(text);
  if (!formula) throw new Error(`not read: ${text}`);
  return formula;
};
const text = (source: string) => Prop.text(parsed(source));
function finalLabels(figure: Illustration): string[] {
  const compiled = new CompiledIllustration(figure);
  const at = { t: 0.95 * (figure.duration ?? 0), revealed: 1, step: 1000 };
  return figure.elements
    .filter((e) => e.kind === "label" && (!e.visible || (compiled.value(e.visible, at) ?? 0) > 0))
    .map((e) => e.text ?? "");
}
const table = (json: string, language = "Portuguese (Portugal)") => {
  const figure = new PremadeFigures(sample("truthTable", json)).compile("t", language);
  if (!figure) throw new Error(`no table for ${json}`);
  return figure;
};

describe("propositional formulas", () => {
  it("reads and prints formulas", () => {
    expect(text("(p -> q) <-> (!q -> !p)")).toBe("(p → q) ↔ (¬q → ¬p)");
    expect(text("¬(p ∧ q) ↔ (¬p ∨ ¬q)")).toBe("¬(p ∧ q) ↔ (¬p ∨ ¬q)");
    // Precedence: and binds tighter than or, which binds tighter than implies and iff.
    expect(text("p | q & r")).toBe("p ∨ (q ∧ r)");
    expect(text("p -> q -> r")).toBe("p → (q → r)");
    expect(text("p <-> q <-> r")).toBe("(p ↔ q) ↔ r");
    expect(text("p -> q | r <-> s")).toBe("(p → (q ∨ r)) ↔ s");
    expect(text("not p and q")).toBe("¬p ∧ q");
    expect(text("!!p | q")).toBe("¬¬p ∨ q");
    expect(text("p xor q")).toBe("p ⊕ q");
    expect(text("[p & q] | r")).toBe("(p ∧ q) ∨ r");
    for (const bad of ["", "p q", "p &", "pp", "((p)", "p ^ q", "p ->", "-> p", "p & & q", "p $ q", "1 & p"])
      expect(Prop.parse(bad), `${bad} was read`).toBeNull();
  });

  it("rows start all true and count down like a textbook", () => {
    const rows = Prop.assignments(["p", "q"]);
    expect(rows.map((r) => [r["p"], r["q"]])).toEqual([
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ]);
    const three = Prop.assignments(["p", "q", "r"]);
    expect(three).toHaveLength(8);
    expect(Object.values(three[0]!).every((v) => v)).toBe(true);
    expect(Object.values(three[7]!).every((v) => !v)).toBe(true);
    expect(new Set(three.map((r) => `${r["p"]}${r["q"]}${r["r"]}`)).size).toBe(8);
  });

  it("connectives have their textbook tables", () => {
    const cases: [PropOp, boolean[]][] = [
      ["and", [true, false, false, false]],
      ["or", [true, true, true, false]],
      ["implies", [true, false, true, true]],
      ["iff", [true, false, false, true]],
      ["xor", [false, true, true, false]],
      ["nand", [false, true, true, true]],
      ["nor", [false, false, false, true]],
    ];
    const rows = Prop.assignments(["p", "q"]);
    for (const [op, expected] of cases)
      expect(
        rows.map((r) => applyOp(op, r["p"]!, r["q"]!)),
        op,
      ).toEqual(expected);
  });

  it("subformulas come innermost first and only once", () => {
    const formula = parsed("¬(p ∧ q) ↔ (¬p ∨ ¬q)");
    expect(Prop.subformulas(formula).map(Prop.text)).toEqual([
      "p ∧ q",
      "¬(p ∧ q)",
      "¬p",
      "¬q",
      "¬p ∨ ¬q",
      "¬(p ∧ q) ↔ (¬p ∨ ¬q)",
    ]);
    expect(Prop.subformulas(parsed("(p ∧ q) ∨ (p ∧ q)")).map(Prop.text)).toEqual(["p ∧ q", "(p ∧ q) ∨ (p ∧ q)"]);
    expect(Prop.variables(formula)).toEqual(["p", "q"]);
  });

  it("tautologies and contradictions are classified from all rows", () => {
    const verdict = (source: string) => {
      const formula = parsed(source);
      return Prop.verdict(Prop.assignments(Prop.variables(formula)).map((row) => Prop.evaluate(formula, row)));
    };
    for (const law of truthTableLaws)
      expect(verdict(law.text), law.key).toBe(
        law.key === "contradiction" ? "contradiction" : law.key === "converse" ? "contingent" : "tautology",
      );
    expect(verdict("p -> q")).toBe("contingent");
    expect(verdict("(p -> q) & p & !q")).toBe("contradiction");
    expect(verdict("p | q | !p")).toBe("tautology");
  });
});

describe("truth tables", () => {
  it("the contrapositive table has a column per part and says the two are equivalent", () => {
    const figure = table('{"expression": "(p -> q) <-> (!q -> !p)"}');
    const headers = ["p", "q", "p → q", "¬q", "¬p", "¬q → ¬p", "(p → q) ↔ (¬q → ¬p)"];
    for (const header of headers)
      expect(figure.elements.some((e) => e.kind === "label" && e.text === header)).toBe(true);
    expect(finalLabels(figure)).toContain("Tautologia: as duas fórmulas são equivalentes");
  });

  it("every law gives its known verdict and its name", () => {
    const expected: Record<string, string> = {
      deMorgan1: "Tautologia: as duas fórmulas são equivalentes",
      deMorgan2: "Tautologia: as duas fórmulas são equivalentes",
      contrapositive: "Tautologia: as duas fórmulas são equivalentes",
      implication: "Tautologia: as duas fórmulas são equivalentes",
      excludedMiddle: "Tautologia: verdadeira em todas as linhas",
      contradiction: "Contradição: falsa em todas as linhas",
      modusPonens: "Tautologia: verdadeira em todas as linhas",
      converse: "Não equivalentes: valores diferentes em 2 de 4 linhas",
    };
    expect(Object.keys(expected)).toHaveLength(truthTableLaws.length);
    for (const law of truthTableLaws) {
      const labels = finalLabels(table(JSON.stringify({ law: law.key })));
      expect(labels, law.key).toContain(expected[law.key]);
      expect(labels, `${law.key} lacks its name`).toContain(law.pt);
    }
  });

  it("the connective slider walks through the seven tables", () => {
    const figure = table('{"connective": "and"}');
    const slider = figure.parameters?.[0];
    expect(slider?.name).toBe("connective");
    expect(slider?.min === 0 && slider?.max === 6).toBe(true);
    ["∧", "∨", "→", "↔", "⊕", "⊼", "⊽"].forEach((symbol, index) => {
      const built = table(JSON.stringify({ connective: index + 0.2 }));
      expect(
        built.elements.some((e) => e.kind === "label" && e.text === `p ${symbol} q`),
        `connective ${index}`,
      ).toBe(true);
    });
  });

  it("English uses T and F and its own words", () => {
    const labels = finalLabels(table('{"law": "deMorgan1"}', "English"));
    expect(labels).toContain("Tautology: the two formulas are equivalent");
    expect(labels).toContain("De Morgan's law (1)");
    expect(labels.filter((l) => l === "T").length).toBeGreaterThan(0);
    expect(labels).not.toContain("V");
  });
});

// Port of PremadeLogicGateTests (PremadeFigureBatch4LogicTests.swift) and LogicGatesLayoutTests.swift @ ref 2026-11-04.
// Their bounds and overlap checks run with the gallery and the stops in animated.test.ts.

type Shown = { text: string; x: number; y: number };
const valuesAt = (time: number) => ({ t: time, revealed: 1, step: 1000 });
function shownLabels(figure: Illustration, time: number): Shown[] {
  const compiled = new CompiledIllustration(figure);
  return figure.elements
    .filter((e) => e.kind === "label" && (!e.visible || (compiled.value(e.visible, valuesAt(time)) ?? 0) > 0))
    .map((e) => ({
      text: e.text ?? "",
      x: compiled.value(e.x ?? "0", valuesAt(time)) ?? NaN,
      y: compiled.value(e.y ?? "0", valuesAt(time)) ?? NaN,
    }));
}
function shownRects(figure: Illustration, time: number) {
  const compiled = new CompiledIllustration(figure);
  const value = (text: string | null | undefined) => compiled.value(text ?? "", valuesAt(time));
  return figure.elements
    .filter((e) => e.kind === "rect" && (!e.visible || (value(e.visible) ?? 0) > 0))
    .map((e) => ({ color: e.color ?? null, x: value(e.x), y: value(e.y), w: value(e.w), h: value(e.h) }));
}
const gates = (json: string, language = "Portuguese (Portugal)") => {
  const figure = new PremadeFigures(sample("logicGates", json)).compile("t", language);
  if (!figure) throw new Error(`no circuit for ${json}`);
  return figure;
};
const ending = (figure: Illustration) => 0.95 * (figure.duration ?? 0);
const boundariesOf = (figure: Illustration) =>
  (figure as { stepPlayback?: { boundaries: number[] } | null }).stepPlayback?.boundaries ?? [];

describe("logic gates", () => {
  const expressions = ["!(p & q) | r", "p ⊕ q", "!p", "(p & q) ⊼ r", "p | !p", "(p ⊽ q) & (q | r)", "!(!p & !q)"];

  it("the circuit computes what the formula says", () => {
    for (const source of expressions) {
      const formula = parsed(source);
      const circuit = GateCircuit.of(formula);
      expect(circuit, source).not.toBeNull();
      for (const assignment of Prop.assignments(Prop.variables(formula)))
        expect(circuit!.outputs(assignment).at(-1), `${source} ${JSON.stringify(assignment)}`).toBe(
          Prop.evaluate(formula, assignment),
        );
    }
  });

  it("one gate per operator and depth follows the tree", () => {
    const circuit = GateCircuit.of(parsed("!(p & q) | r"))!;
    expect(circuit.gates.map((gate) => gate.kind)).toEqual(["and", "not", "or"]);
    expect(circuit.gates.map((gate) => gate.depth)).toEqual([1, 2, 3]);
    expect(circuit.maxDepth).toBe(3);
    expect(GateCircuit.of(parsed("p -> q"))).toBeNull();
    expect(GateCircuit.of(parsed("p <-> q"))).toBeNull();
  });

  it("IEC symbols and bubbles", () => {
    const figure = gates('{"expression": "(p & q) ⊼ r | !p ⊽ q", "inputs": 0}');
    const labels = finalLabels(figure);
    // The gates of the formula: and, nand, not, nor, or (five), each with its IEC symbol.
    expect(labels.filter((l) => l === "&")).toHaveLength(2);
    expect(labels.filter((l) => l === "≥1")).toHaveLength(2);
    expect(labels.filter((l) => l === "1").length).toBeGreaterThanOrEqual(1);
    expect(figure.elements.filter((e) => e.kind === "circle")).toHaveLength(3);
  });

  it("the signal reaches the output level by level", () => {
    const figure = gates('{"expression": "!(p & q) | r", "inputs": 5}');
    const boundaries = boundariesOf(figure);
    expect(boundaries).toHaveLength(5);
    // p = 1, q = 0, r = 1.
    const first = shownLabels(figure, boundaries[1]!).map((l) => l.text);
    expect(first.includes("p=1") && first.includes("q=0") && first.includes("r=1")).toBe(true);
    expect(first).not.toContain("S=1");
    const afterOne = shownLabels(figure, boundaries[2]!).map((l) => l.text);
    expect(afterOne).toContain("0"); // p ∧ q = 0
    expect(afterOne).not.toContain("S=1");
    const afterTwo = shownLabels(figure, boundaries[3]!).map((l) => l.text);
    expect(afterTwo).toContain("1"); // ¬(p ∧ q) = 1
    expect(afterTwo).not.toContain("S=1");
    const last = shownLabels(figure, boundaries[4]!).map((l) => l.text);
    expect(last).toContain("S=1");
    expect(last).toContain("Com p = 1, q = 0 e r = 1, S = 1");
  });

  it("the table of the circuit matches and marks the chosen row", () => {
    const figure = gates('{"gate": "xor", "inputs": 2}');
    const labels = shownLabels(figure, ending(figure));
    // Rows in binary order 00, 01, 10, 11 with S = p ⊕ q: 0, 1, 1, 0.
    const table = labels.filter((l) => l.x > 8.3 && l.y < 4.7);
    const ys = [...new Set(table.map((l) => l.y.toFixed(3)))].map(Number).sort((a, b) => b - a);
    expect(ys).toHaveLength(4);
    const rows = ys.map((y) =>
      table
        .filter((l) => Math.abs(l.y - y) < 0.002)
        .sort((a, b) => a.x - b.x)
        .map((l) => l.text)
        .join(""),
    );
    expect(rows).toEqual(["000", "011", "101", "110"]);
    // The highlighted row is the one asked for (p = 1, q = 0).
    const highlight = shownRects(figure, ending(figure)).find((r) => r.color === "accent")!;
    expect(Math.abs(highlight.y! + highlight.h! / 2 - ys[2]!)).toBeLessThan(0.01);
    expect(labels.map((l) => l.text)).toContain("Com p = 1 e q = 0, S = 1");
  });

  it("the gate slider and the input slider recompile", () => {
    const figure = sample("logicGates", '{"gate": "and", "inputs": 3}');
    expect(gates('{"gate": "and", "inputs": 3}').parameters?.map((p) => p.name)).toEqual(["gate", "inputs"]);
    const symbols = ["&", "≥1", "=1", "1", "&", "≥1"];
    const outputs = [true, true, false, false, false, false]; // for p = q = 1 (inputs 3); the lone not takes p only
    const moved = (gate: number) =>
      new PremadeFigures(new PremadeFigures(figure).mergingParameters({ gate })).compile("t", "Portuguese (Portugal)");
    for (let index = 0; index < 6; index++) {
      const built = moved(index);
      expect(built, `gate ${index}`).not.toBeNull();
      const labels = finalLabels(built!);
      expect(labels, `gate ${index}`).toContain(symbols[index]);
      if (index !== 3) expect(labels, `gate ${index}`).toContain(outputs[index] ? "S=1" : "S=0");
    }
    // Moving to the lone not gate leaves one variable: inputs 3 is out of range there and is brought back to 1.
    const single = moved(3)!;
    expect(single.parameters?.at(-1)?.max).toBe(1);
    expect(single.parameters?.at(-1)?.value).toBe(1);
  });

  it("the input labels of a gate circuit are apart and the output is named at the gate", () => {
    for (const json of [
      '{"expression": "(p & q) | r", "inputs": 5}',
      '{"expression": "a & b", "inputs": 3}',
      '{"gate": "xor", "inputs": 2}',
    ]) {
      const figure = gates(json);
      // Once the inputs are shown: each "p=1" box keeps clear of the others, with a gap between.
      const inputs = shownLabels(figure, boundariesOf(figure)[1]!).filter(
        (l) => Array.from(l.text).length === 3 && l.text.includes("=") && l.x < 4,
      );
      expect(inputs.length, json).toBeGreaterThanOrEqual(2);
      const placed = inputs.map((l) => [l.text, LabelBoard.box(l.text, l.x, l.y, "center")] as const);
      placed.forEach(([firstText, a], index) => {
        for (const [secondText, b] of placed.slice(index + 1)) {
          const apartX = a.minX >= b.maxX + 0.1 || b.minX >= a.maxX + 0.1;
          const apartY = a.minY >= b.maxY + 0.05 || b.minY >= a.maxY + 0.05;
          expect(apartX || apartY, `${json}: ${firstText} and ${secondText} run together`).toBe(true);
        }
      });
      // The output is named at the gate before the signal reaches it, so a still of the start shows it.
      const output = shownLabels(figure, 0.5).find((l) => l.text === "S=?");
      expect(output, json).toBeDefined();
      const lastGate = Math.max(
        ...shownRects(figure, 0.5)
          .filter((r) => r.x !== null && r.w !== null && r.x < 7)
          .map((r) => r.x! + r.w!),
      );
      const gap = output!.x - lastGate;
      expect(gap > 0 && gap < 1.2, `${json}: S sits ${gap} from the gate`).toBe(true);
      // And its value replaces the question mark at the end.
      const final = finalLabels(figure);
      expect(!final.includes("S=?") && (final.includes("S=1") || final.includes("S=0")), json).toBe(true);
    }
  });

  it("a small circuit is drawn larger to use the picture", () => {
    const gateWidth = (figure: Illustration) =>
      Math.max(
        0,
        ...shownRects(figure, ending(figure))
          .filter((r) => r.color === "white" && r.w !== null && r.w < 2)
          .map((r) => r.w!),
      );
    const small = gates('{"expression": "a & b", "inputs": 3}');
    const large = gates('{"expression": "((p & q) | r) & !(p ⊕ r)", "inputs": 6}');
    expect(gateWidth(small)).toBeGreaterThan(gateWidth(large));
  });

  // The logic rows of invalidParamsFallBack (PremadeFigureBatch4Tests.swift).
  it("invalid params fall back", () => {
    for (const [type, json] of [
      ["truthTable", "{}"],
      ["truthTable", '{"expression": "p"}'],
      ["truthTable", '{"expression": "p ^^ q"}'],
      ["truthTable", '{"expression": "p & q & r & s"}'],
      ["truthTable", '{"law": "nonsense"}'],
      ["truthTable", '{"law": 99}'],
      ["truthTable", '{"connective": "maybe"}'],
      ["logicGates", "{}"],
      ["logicGates", '{"expression": "p -> q"}'],
      ["logicGates", '{"expression": "p & q", "inputs": 4}'],
      ["logicGates", '{"expression": "!!!!!p"}'],
    ] as const)
      expect(new PremadeFigures(sample(type, json)).compile("t", "English"), `${type} ${json}`).toBeNull();
  });
});
