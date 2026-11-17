// Port of the flowchart suite of LearnLayerTests/PremadeFigureBatch4ProgrammingTests.swift @ ref 2026-11-04. The
// figure's bounds and overlaps are checked with the gallery in animated.test.ts.

import { describe, expect, it } from "vitest";
import { PremadeFigures } from "../premadeFigure";
import { sample } from "./animated";
import { flowProgram, traceProgram } from "./flowchart";

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const steps = (name: string, n: number, a: number, b: number) => {
  const program = flowProgram(name, n, a, b);
  const trace = program ? traceProgram(program) : null;
  if (!trace) throw new Error(`no trace for ${name}`);
  return trace;
};

describe("flowchart", () => {
  it("summing runs the loop and adds one to n", () => {
    for (let n = 1; n <= 6; n++) {
      const run = steps("sum", n, 0, 0);
      expect(run[run.length - 1]!.values["s"], `n = ${n}`).toBe((n * (n + 1)) / 2);
      expect(run.find((s) => s.written !== null)?.written).toBe(String((n * (n + 1)) / 2));
      // Start, the set-up, n + 1 tests, n times two boxes, the output and the end.
      expect(run.length, `n = ${n}`).toBe(3 * n + 5);
      const tests = run.filter((s) => s.node === 2);
      expect(tests).toHaveLength(n + 1);
      expect(tests.map((s) => s.outcome)).toEqual([...Array.from({ length: n }, () => true), false]);
    }
  });

  it("factorial multiplies instead of adding", () => {
    for (const [n, factorial] of [
      [1, 1],
      [2, 2],
      [3, 6],
      [4, 24],
      [5, 120],
      [6, 720],
    ] as const) {
      const run = steps("factorial", n, 0, 0);
      expect(run[run.length - 1]!.values["f"], `${n}!`).toBe(factorial);
    }
  });

  it("Euclid finds the greatest common divisor", () => {
    for (const [a, b] of [
      [48, 18],
      [17, 5],
      [55, 34],
      [12, 12],
      [7, 1],
      [1, 7],
      [99, 66],
      [60, 45],
    ] as const) {
      const run = steps("gcd", 0, a, b);
      expect(run[run.length - 1]!.values["a"], `gcd(${a}, ${b})`).toBe(gcd(a, b));
      expect(run.find((s) => s.written !== null)?.written).toBe(String(gcd(a, b)));
      // Every remainder is smaller than the divisor it was taken with.
      run.forEach((step, index) => {
        if (step.node === 2) expect(step.values["r"] ?? 0).toBeLessThan(run[index - 1]!.values["b"] ?? 0);
      });
    }
    const run = steps("gcd", 0, 48, 18);
    expect(run.filter((s) => s.node === 2).map((s) => s.values["r"])).toEqual([12, 6, 0]);
    expect(run).toHaveLength(16);
  });

  it("parity takes the one branch or the other", () => {
    const odd = steps("parity", 7, 0, 0);
    expect(odd.map((s) => s.node)).toEqual([0, 1, 3, 4]);
    expect(odd[1]!.outcome).toBe(false);
    expect(odd[2]!.written).toBe("ímpar");
    const even = steps("parity", 8, 0, 0);
    expect(even.map((s) => s.node)).toEqual([0, 1, 2, 4]);
    expect(even[1]!.outcome).toBe(true);
    expect(even[2]!.written).toBe("par");
    expect(steps("parity", 0, 0, 0)[1]!.outcome).toBe(true);
  });

  it("every step follows an arrow of the flowchart", () => {
    for (const [name, n, a, b] of [
      ["sum", 5, 0, 0],
      ["factorial", 3, 0, 0],
      ["gcd", 0, 30, 12],
      ["parity", 9, 0, 0],
    ] as const) {
      const program = flowProgram(name, n, a, b)!;
      const run = traceProgram(program)!;
      for (let index = 1; index < run.length; index++) {
        const edge = program.edges[run[index - 1]!.edge!]!;
        expect(edge.from).toBe(run[index - 1]!.node);
        expect(edge.to).toBe(run[index]!.node);
      }
      expect(run[run.length - 1]!.edge).toBeNull();
    }
  });

  it("a program is picked by name or by number, and bad inputs fall back", () => {
    const byName = new PremadeFigures(sample("flowchart", '{"program": "gcd", "a": 48, "b": 18}')).compile(
      "t",
      "English",
    );
    const byNumber = new PremadeFigures(sample("flowchart", '{"program": 2, "a": 48, "b": 18}')).compile(
      "t",
      "English",
    );
    expect(byName).not.toBeNull();
    expect(JSON.stringify(byNumber?.elements)).toBe(JSON.stringify(byName?.elements));
    expect(new PremadeFigures(sample("flowchart", '{"program": "bogosort"}')).compile("t", "English")).toBeNull();
    expect(new PremadeFigures(sample("flowchart", '{"program": "sum", "n": 9}')).compile("t", "English")).toBeNull();
    expect(
      new PremadeFigures(sample("flowchart", '{"program": "gcd", "a": 0, "b": 5}')).compile("t", "English"),
    ).toBeNull();
  });
});
