// Port of the argument suite of LearnLayerTests/PremadeFigureBatch4PhilosophyTests.swift @ ref 2026-11-04. The
// figure's bounds and overlaps are checked with the gallery in animated.test.ts.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration } from "../illustration";
import { PremadeFigures } from "../premadeFigure";
import { sample } from "./animated";
import { ArgumentCheck, argumentForms } from "./argument";
import { Prop } from "./logic";

const check = (premises: string[], conclusion: string) =>
  new ArgumentCheck(
    premises.map((p) => Prop.parse(p)!),
    Prop.parse(conclusion)!,
  );
function finalLabels(figure: Illustration): string[] {
  const compiled = new CompiledIllustration(figure);
  const at = { t: 0.95 * (figure.duration ?? 0), revealed: 1, step: 1000 };
  return (
    figure.elements
      .filter((e) => e.kind === "label" && (!e.visible || (compiled.value(e.visible, at) ?? 0) > 0))
      // As Batch4Check.finalShown: every line, and the whole sentences drawn over several lines.
      .flatMap((e) => [e.text ?? "", ...(e.sentence ? [e.sentence] : [])])
  );
}
const argument = (json: string) => {
  const figure = new PremadeFigures(sample("argumentMap", json)).compile("t", "Portuguese (Portugal)");
  if (!figure) throw new Error(`no argument for ${json}`);
  return figure;
};

describe("arguments", () => {
  it("the classic forms are valid or not as the textbooks say", () => {
    const expected: Record<string, boolean> = {
      modusPonens: true,
      modusTollens: true,
      hypotheticalSyllogism: true,
      disjunctiveSyllogism: true,
      affirmingConsequent: false,
      denyingAntecedent: false,
      validButUnsound: true,
    };
    expect(Object.keys(expected)).toHaveLength(argumentForms.length);
    for (const form of argumentForms)
      expect(check(form.premises, form.conclusion).isValid, form.key).toBe(expected[form.key]);
    const affirming = check(["p -> q", "q"], "p");
    expect(affirming.rows[affirming.counterexample!]).toEqual({ p: false, q: true });
    const denying = check(["p -> q", "!p"], "!q");
    expect(denying.rows[denying.counterexample!]).toEqual({ p: false, q: true });
  });

  it("only rows with true premises decide validity", () => {
    expect(check(["p -> q", "p"], "q").criticalRows).toEqual([0]);
    const syllogism = check(["p -> q", "q -> r"], "p -> r");
    expect(syllogism.rows).toHaveLength(8);
    for (const row of syllogism.criticalRows)
      expect(Prop.evaluate(syllogism.conclusion, syllogism.rows[row]!)).toBe(true);
    const contradictory = check(["p", "!p"], "q");
    expect(contradictory.criticalRows.length === 0 && contradictory.isValid).toBe(true);
    expect(check(["p | q"], "p").isValid).toBe(false);
    expect(check(["p & q"], "p").isValid).toBe(true);
    expect(check(["p"], "p | q").isValid).toBe(true);
  });

  it("modus ponens is valid and sound", () => {
    const labels = finalLabels(argument('{"form": "modusPonens"}'));
    for (const text of [
      "Modus ponens",
      "Se chove, a rua fica molhada.",
      "Chove.",
      "Logo, a rua fica molhada.",
      "P1",
      "P2",
      "C",
      "Válido: premissas verdadeiras ⇒ conclusão verdadeira",
      "Sólido: válido e premissas verdadeiras",
    ])
      expect(labels, text).toContain(text);
  });

  it("affirming the consequent shows its counterexample", () => {
    const labels = finalLabels(argument('{"form": "affirmingConsequent"}'));
    expect(labels).toContain("Inválido: contraexemplo com p = F; q = V");
    expect(labels).toContain("Inválido: não pode ser sólido");
  });

  it("a valid argument with a false premise is not sound", () => {
    const labels = finalLabels(argument('{"form": "validButUnsound"}'));
    expect(labels).toContain("Válido: premissas verdadeiras ⇒ conclusão verdadeira");
    expect(labels).toContain("Válido, mas não sólido: P1 falsa");
    expect(labels).not.toContain("Sólido: válido e premissas verdadeiras");
  });

  it("your own premises and texts are checked", () => {
    const valid = finalLabels(
      argument(
        '{"premises": ["p & q"], "conclusion": "p", "premiseTexts": ["Chove e faz frio."], "conclusionText": "Logo, chove.", "premisesTrue": [true]}',
      ),
    );
    expect(valid.includes("Chove e faz frio.") && valid.includes("Logo, chove.")).toBe(true);
    expect(valid).toContain("Válido: premissas verdadeiras ⇒ conclusão verdadeira");
    expect(valid).toContain("Sólido: válido e premissas verdadeiras");
    const invalid = finalLabels(argument('{"premises": ["p | q"], "conclusion": "p"}'));
    // Without texts of its own the boxes show the formulas; p ∨ q, p fails when p is false and q true.
    expect(invalid.includes("p ∨ q") && invalid.includes("Logo, p")).toBe(true);
    expect(invalid).toContain("Inválido: contraexemplo com p = F; q = V");
    expect(finalLabels(argument('{"premises": ["p", "!p"], "conclusion": "q"}'))).toContain(
      "Válido, mas as premissas são incompatíveis",
    );
  });
});
