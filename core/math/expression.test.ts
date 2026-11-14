// Port of LearnLayerTests/ExpressionVerifierTests.swift @ ref 2026-11-04, plus the parser's
// documented behaviours (Expression.swift has no other test class on the Mac).

import { describe, expect, it } from "vitest";
import mockSolution from "../mocks/MockSolution.json";
import { asciiSubscripts, evaluate, parseExpression, tryParseExpression, variables } from "./expression";
import { Verifier, type Check } from "./verifier";

const value = (text: string, values: Record<string, number> = {}, singleLetterNames = false) =>
  evaluate(parseExpression(text, singleLetterNames), values);

describe("Expression", () => {
  it("evaluates the disc field expression", () => {
    const expression = parseExpression("sigma/(2*eps0)*(1-abs(z)/sqrt(z^2+R^2))");
    expect(Math.abs(evaluate(expression, { sigma: 2, eps0: 1, z: 0, R: 1 }) - 1)).toBeLessThan(1e-9);
    expect(Math.abs(evaluate(expression, { sigma: 1, eps0: 1, z: 3, R: 4 }) - 0.2)).toBeLessThan(1e-9);
  });

  it("mock solution expressions parse", () => {
    const parts = mockSolution.parts as { label: string; answer: { expression?: string | null } }[];
    expect(parts.map((part) => part.label)).toEqual(["I.1", "I.2", "I.3"]);
    for (const part of parts) {
      const text = part.answer.expression;
      if (text) expect(variables(parseExpression(text)).size).toBeGreaterThan(0);
    }
  });

  it("reads implicit multiplication, powers and signs", () => {
    expect(value("2x", { x: 3 })).toBe(6);
    expect(value("3(x + 1)", { x: 1 })).toBe(6);
    expect(value("x^-1", { x: 4 })).toBe(0.25);
    expect(value("2^3^2")).toBe(512);
    expect(value("-x^2", { x: 3 })).toBe(-9);
    expect(value("1e-3")).toBe(0.001);
    expect(value("2e", {})).toBeCloseTo(2 * Math.E, 12);
    expect(value("2 pi")).toBeCloseTo(2 * Math.PI, 12);
  });

  it("accepts the Unicode a PDF or the model may use", () => {
    expect(value("x² − 2·x × 3", { x: 5 })).toBe(25 - 30);
    expect(value("√(x)", { x: 9 })).toBe(3);
    expect(value("x**3", { x: 2 })).toBe(8);
    expect(asciiSubscripts("v₀ + x₁₂")).toBe("v0 + x12");
    expect(value("v₀*t", { v0: 2, t: 3 })).toBe(6);
  });

  it("whole words are names unless the line is written maths", () => {
    expect([...variables(parseExpression("eps0*sigma + phi"))].sort()).toEqual(["eps0", "phi", "sigma"]);
    expect([...variables(parseExpression("mgh", true))].sort()).toEqual(["g", "h", "m"]);
    expect(value("at²", { a: 2, t: 3 }, true)).toBe(18);
    // After a digit a letter starts a new name: v0t is v0·t.
    expect(value("v0t", { v0: 2, t: 5 })).toBe(10);
    // Function names are matched first, so "sinx" reads as sin(x).
    expect(value("sinx", { x: 0 })).toBe(0);
    expect(value("xsin(x)", { x: Math.PI / 2 })).toBeCloseTo(Math.PI / 2, 12);
  });

  it("knows the functions and the constants", () => {
    expect(value("ln(e)")).toBeCloseTo(1, 12);
    expect(value("log(1000)")).toBeCloseTo(3, 12);
    expect(value("sign(-2) + sgn(3) + sign(0)")).toBe(0);
    expect(value("floor(2.7) + floor(-2.2)")).toBe(-1);
    expect(variables(parseExpression("pi*e*π")).size).toBe(0);
    // A value named e wins over the constant.
    expect(value("e", { e: 5 })).toBe(5);
  });

  it("a missing variable or undefined maths is NaN, bad text is an error", () => {
    expect(value("x + 1")).toBeNaN();
    expect(value("sqrt(x)", { x: -1 })).toBeNaN();
    expect(value("1/x", { x: 0 })).toBe(Infinity);
    expect(tryParseExpression("2 +")).toBeNull();
    expect(tryParseExpression("(x")).toBeNull();
    expect(tryParseExpression("x $ y")).toBeNull();
    expect(tryParseExpression("1.2.3")).toBeNull();
    expect(tryParseExpression("")).toBeNull();
  });
});

describe("Verifier", () => {
  const check = (extra: Partial<Check> & Pick<Check, "kind" | "left" | "right">): Check => ({
    domain: "any",
    ...extra,
  });

  it("accepts an identity and rejects a wrong one", () => {
    expect(Verifier.outcome(check({ kind: "equal", left: "2*x", right: "x+x" }))).toBe("passed");
    expect(Verifier.outcome(check({ kind: "equal", left: "2*x", right: "x" }))).toBe("failed");
  });

  it("an equality between different names is neither right nor wrong", () => {
    expect(Verifier.outcome(check({ kind: "equal", left: "F", right: "m*a" }))).toBe("unreadable");
    expect(Verifier.outcome(check({ kind: "equal", left: "2 +", right: "x" }))).toBe("unreadable");
  });

  it("checks derivatives, integrals, limits and jumps", () => {
    expect(Verifier.outcome({ kind: "derivative", left: "x^3", right: "3*x^2", variable: "x" })).toBe("passed");
    expect(Verifier.outcome({ kind: "derivative", left: "x^3", right: "2*x^2", variable: "x" })).toBe("failed");
    expect(Verifier.outcome({ kind: "derivative", left: "x^3", right: "3*x^2" })).toBe("unreadable");
    expect(
      Verifier.outcome({ kind: "integral", left: "2*x", right: "b^2 - a^2", variable: "x", from: "a", to: "b" }),
    ).toBe("passed");
    expect(
      Verifier.outcome({ kind: "integral", left: "2*x", right: "b^2 + a^2", variable: "x", from: "a", to: "b" }),
    ).toBe("failed");
    // A bound whose name appears on neither side has no value to try, so nothing is compared (as on the Mac).
    expect(Verifier.outcome({ kind: "integral", left: "2*x", right: "b^2", variable: "x", from: "a", to: "b" })).toBe(
      "unreadable",
    );
    // A definite integral's value can't depend on its own variable.
    expect(Verifier.outcome({ kind: "integral", left: "2*x", right: "x^2", variable: "x", from: "0", to: "1" })).toBe(
      "unreadable",
    );
    expect(Verifier.outcome({ kind: "limit", left: "(2*x+1)/x", right: "2", variable: "x" })).toBe("passed");
    expect(Verifier.outcome({ kind: "limit", left: "(2*x+1)/x", right: "3", variable: "x" })).toBe("failed");
    expect(Verifier.outcome({ kind: "jump", left: "sign(z)*s", right: "2*s", variable: "z" })).toBe("passed");
  });

  it("puts the solution back into the first line", () => {
    const solved = [
      { line: "2x + 3 = 7", move: "" },
      { line: "2x = 4", move: "Subtract 3 from both sides" },
      { line: "x = 2", move: "Divide by 2" },
    ];
    expect(Verifier.solvingOutcome(solved)).toBe("passed");
    expect(Verifier.solvingOutcome([...solved.slice(0, 2), { line: "x = 3", move: "" }])).toBe("failed");
    expect(Verifier.solvingOutcome(solved.slice(0, 1))).toBe("unreadable");
    expect(
      Verifier.solvingOutcome([
        { line: "x(t) = ½at²", move: "" },
        { line: "a = 2x/t²", move: "" },
      ]),
    ).toBe("passed");
    expect(Verifier.passes({ checks: [{ kind: "equal", left: "x", right: "x" }], solving: solved })).toBe(true);
    expect(Verifier.passes({ checks: [{ kind: "equal", left: "x", right: "2*x" }] })).toBe(false);
  });
});
