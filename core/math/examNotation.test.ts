// Port of trigNotationFollowsTheLanguage (LearnLayerTests/LayoutFixTests.swift @ ref 2026-11-04).

import { describe, expect, it } from "vitest";
import { ExamNotation } from "./examNotation";

const R = String.raw;

describe("the exam's own name for a function", () => {
  it("trig notation follows the language", () => {
    const portuguese = ExamNotation.trigInLatex(R`a=g\sin\theta=g\,\frac{h}{1{,}50}`, "Portuguese (Portugal)");
    expect(portuguese).toContain(R`\sen`);
    expect(portuguese).not.toContain(R`\sin`);
    expect(ExamNotation.trigInLatex(R`a=g\sen\theta`, "English")).toContain(R`\sin`);
    expect(ExamNotation.trigInProse("P sen θ, e sen θ = h/1,50.", "English")).toBe("P sin θ, e sin θ = h/1,50.");
    expect(ExamNotation.trigInProse("o sinal de f' e sin θ", "Portuguese (Portugal)")).toBe("o sinal de f' e sen θ");
  });

  it("a longer command or word is left alone", () => {
    expect(ExamNotation.trigInLatex(R`\sinh x + \mathrm{sin}\,x`, "Portuguese (Portugal)")).toBe(
      R`\sinh x + \mathrm{sen}\,x`,
    );
    expect(ExamNotation.trigInProse("sinal e seno", "English")).toBe("sinal e seno");
  });
});
