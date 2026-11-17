// The fallacies of LearnLayer/Illustrations/PremadeFigureFallacies.swift @ ref 2026-11-04: every one compiles in both
// languages, a formal one shows the counterexample the truth table finds, and an unknown one falls back. Bounds and
// overlaps are checked with the gallery in animated.test.ts.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration } from "../illustration";
import { PremadeFigures } from "../premadeFigure";
import { sample } from "./animated";
import { fallacies } from "./fallacies";

function finalLabels(figure: Illustration): string[] {
  const compiled = new CompiledIllustration(figure);
  const at = { t: 0.95 * (figure.duration ?? 0), revealed: 1, step: 1000 };
  return figure.elements
    .filter((e) => e.kind === "label" && (!e.visible || (compiled.value(e.visible, at) ?? 0) > 0))
    .map((e) => e.text ?? "");
}
const compile = (json: string, language = "Portuguese (Portugal)") =>
  new PremadeFigures(sample("fallacies", json)).compile("t", language);

describe("fallacies", () => {
  it("every fallacy compiles in both languages, by name or by number", () => {
    fallacies.forEach((fallacy, index) => {
      for (const language of ["Portuguese (Portugal)", "English"]) {
        const figure = compile(JSON.stringify({ fallacy: fallacy.key }), language);
        expect(figure, `${fallacy.key} in ${language}`).not.toBeNull();
      }
      const byNumber = compile(JSON.stringify({ fallacy: index }));
      expect(finalLabels(byNumber!)).toContain(`Falácia: ${fallacy.name[0]}`);
    });
    expect(compile('{"fallacy": "redHerring"}')).toBeNull();
  });

  it("a formal fallacy shows the counterexample and an informal one does not", () => {
    const formal = finalLabels(compile('{"fallacy": "affirmingConsequent"}')!);
    expect(formal).toContain("✗ não se segue");
    expect(formal.some((text) => text.includes("Contraexemplo") && text.includes("p = F"))).toBe(true);
    const informal = finalLabels(compile('{"fallacy": "adHominem"}')!);
    expect(informal.some((text) => text.includes("Contraexemplo"))).toBe(false);
    expect(informal).toContain("Porque falha");
  });
});
