import { describe, expect, it } from "vitest";
import { evaluate, parseExpression, variables } from "../math/expression";
import { typedNumber } from "./problemVariant";
import { normalizedAnswer, splitUnit, typedExpression } from "./typedAnswer";

const value = (typed: string, allowed: string[] = []) => {
  const expression = typedExpression(typed, new Set(allowed));
  return expression ? evaluate(expression, {}) : null;
};

describe("typed answers", () => {
  it("drops a unit the expected answer doesn't name", () => {
    expect(value("25 m")).toBe(25);
    expect(value("25m")).toBe(25);
    expect(value("25")).toBe(25);
    expect(value("2,5 m/s²")).toBe(2.5);
    expect(value("9 J")).toBe(9);
    expect(value("3 kΩ")).toBe(3);
    expect(value("20 °C")).toBe(20);
    expect(value("1,2 × 10^3 kg·m/s")).toBeCloseTo(1200);
    expect(value("4x10^-2 N")).toBeCloseTo(0.04);
    expect(value("a = 4 m/s^2")).toBe(4);
    expect(value("-3,5 mol/L")).toBe(-3.5);
  });

  it("keeps a name the expected answer uses", () => {
    const expression = typedExpression("2 m", new Set(["m"]));
    expect(expression && [...variables(expression)]).toEqual(["m"]);
    expect(typedExpression("x^2 + 1", new Set(["x"]))).toEqual(parseExpression("x^2 + 1"));
  });

  it("doesn't take a formula's letters for a unit", () => {
    expect(splitUnit("2x")).toBeNull();
    expect(splitUnit("3 sin")).toBeNull();
    expect(splitUnit("25 m")).toEqual(["25", "m"]);
  });

  it("reads exam notation", () => {
    expect(normalizedAnswer("2,5 × 3")).toBe("2.5 * 3");
    expect(normalizedAnswer("x² − 1")).toBe("x^(2) - 1");
    expect(normalizedAnswer("22.")).toBe("22");
  });

  it("lets the similar question's number carry a unit", () => {
    expect(typedNumber("25 m")).toBe(25);
    expect(typedNumber("3,5")).toBe(3.5);
    expect(typedNumber("1.5×10^3")).toBeCloseTo(1500);
  });
});
