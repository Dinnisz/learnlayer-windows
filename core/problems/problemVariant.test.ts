// ProblemVariant.swift's rules, case by case: the app fills the numbers it checks against, works out the answer
// from the verified formula, and accepts any function that solves the equation.

import { describe, expect, it } from "vitest";
import { parseExpression } from "../math/expression";
import {
  decodeVariant,
  DifferentialEquation,
  typedFunction,
  typedNumber,
  Variant,
  VariantPrompt,
  type ProblemVariant,
} from "./problemVariant";

const numberVariant = (statement: string, values: [string, number, string][]): ProblemVariant =>
  decodeVariant({
    kind: "number",
    statement,
    values: values.map(([name, value, unit]) => ({ name, value, unit })),
    unit: "m/s",
    hint: "Use v = v0 + a t.",
    variable: null,
    left: null,
    right: null,
    nonZero: null,
    example: null,
  });

describe("ProblemVariant", () => {
  const formula = parseExpression("v0 + a*t");

  it("fills the numbers it checks against into the statement", () => {
    const variant = numberVariant("Um carro parte a {v0} e acelera a {a} durante {t}.", [
      ["v0", 10, "m/s"],
      ["a", 3, "m/s²"],
      ["t", 4, "s"],
    ]);
    expect(Variant.text(variant, formula)).toBe("Um carro parte a 10 m/s e acelera a 3 m/s² durante 4 s.");
    expect(Variant.answer(variant, formula)).toBe(22);
  });

  it("refuses a statement that leaves out a value the formula needs", () => {
    const missing = numberVariant("Um carro parte a {v0} e acelera durante {t}.", [
      ["v0", 10, "m/s"],
      ["a", 3, "m/s²"],
      ["t", 4, "s"],
    ]);
    expect(Variant.text(missing, formula)).toBeNull();
    const leftover = numberVariant("Parte a {v0}, acelera a {a} durante {t} sobre {d}.", [
      ["v0", 10, "m/s"],
      ["a", 3, "m/s²"],
      ["t", 4, "s"],
    ]);
    expect(Variant.text(leftover, formula)).toBeNull();
    expect(Variant.answer(numberVariant("{v0}", [["v0", 1, ""]]), formula)).toBeNull();
  });

  it("writes constants and Greek names as the exam does", () => {
    const field = parseExpression("sigma/(2*eps0)");
    const variant = numberVariant("Um disco com densidade sigma = {sigma}; use eps0.", [
      ["sigma", 2e-6, "C/m²"],
      ["eps0", 8.85e-12, "F/m"],
    ]);
    expect(Variant.text(variant, field)).toBe("Um disco com densidade σ = 2 × 10⁻⁶ C/m²; use ε₀.");
  });

  it("formats numbers as %g does, with powers of ten for the very small and large", () => {
    expect(Variant.format(22)).toBe("22");
    expect(Variant.format(0.5)).toBe("0.5");
    expect(Variant.format(3.14159)).toBe("3.142");
    expect(Variant.format(3.5e-6)).toBe("3.5 × 10⁻⁶");
    expect(Variant.format(120000)).toBe("1.2 × 10⁵");
    expect(Variant.format(0)).toBe("0");
  });

  it("agrees within 2 %", () => {
    expect(Variant.agrees(9.8, 9.81)).toBe(true);
    expect(Variant.agrees(9.4, 9.81)).toBe(false);
    expect(Variant.agrees(0, 0)).toBe(true);
    expect(typedNumber("2,2x10^3")).toBe(2200);
    expect(typedNumber("abc(")).toBeNull();
  });

  it("writes an equation the way a student does", () => {
    expect(Variant.pretty("y2 + 4*y1 + 13*y")).toBe("y″ + 4y′ + 13y");
    expect(Variant.pretty("t*exp(-t) + 2")).toBe("t·e^(−t) + 2");
  });

  it("accepts any function that solves the equation, and only those", () => {
    const equation = { variable: "t", left: "y2 + 4*y", right: "0", nonZero: null };
    expect(DifferentialEquation.solves(equation, parseExpression("C1*cos(2*t) + C2*sin(2*t)"))).toBe(true);
    expect(DifferentialEquation.solves(equation, parseExpression("sin(2*t)"))).toBe(true);
    expect(DifferentialEquation.solves(equation, parseExpression("exp(2*t)"))).toBe(false);
    // y = 0 solves it, unless the question excludes it.
    expect(DifferentialEquation.solves(equation, parseExpression("0*t"))).toBe(true);
    expect(DifferentialEquation.solves({ ...equation, nonZero: true }, parseExpression("0*t"))).toBe(false);
    const variant = decodeVariant({
      kind: "function",
      statement: "Resolva {equation}.",
      values: [],
      unit: "",
      hint: "",
      variable: "t",
      left: "y2 + 4*y",
      right: "0",
      nonZero: null,
      example: "cos(2*t)",
    });
    expect(Variant.text(variant, null)).toBe("Resolva y″ + 4y = 0.");
    expect(Variant.solves(variant, typedFunction("y = 3*cos(2*t)")!)).toBe(true);
  });

  it("asks with the Mac's prompt, word for word", () => {
    expect(VariantPrompt.system("Portuguese (Portugal)")).toContain(
      "You write practice variants of exam questions, in Portuguese (Portugal)",
    );
    expect(VariantPrompt.user("G", "1.1", "v?", "v0 + a*t", [])).toBe(
      "The exam's text:\nG\n\nThe part to vary: 1.1, which asks: v?\nFormula of its answer (ASCII): v0 + a*t",
    );
    expect(VariantPrompt.user("G", "1.1", "v?", "f", ["A", "B"])).toContain(
      "\n\nUse different numbers from these earlier variants:\n- A\n- B",
    );
  });
});
