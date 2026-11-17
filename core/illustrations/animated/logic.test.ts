// Port of the formula and truth-table suites of LearnLayerTests/PremadeFigureBatch4LogicTests.swift @ ref 2026-11-04.
// The figures' bounds and overlaps are checked with the gallery in animated.test.ts.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration } from "../illustration";
import { PremadeFigures } from "../premadeFigure";
import { sample } from "./animated";
import { applyOp, Prop, truthTableLaws, type PropFormula, type PropOp } from "./logic";

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
