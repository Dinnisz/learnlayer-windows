// Port of LearnLayerTests/SignTableTests.swift @ ref 2026-11-04

import { describe, expect, it } from "vitest";
import { isUndefinedCell, realigned, signOf, signTableProblems, testPoint, type SignTable } from "./signTable";

function table(cells: string[]): SignTable {
  return {
    variable: "x",
    points: [
      { text: "−∞", value: null },
      { text: "1", value: 1 },
      { text: "+∞", value: null },
    ],
    rows: [{ name: "x − 1", expression: "x-1", cells }],
    variation: {
      name: "f",
      expression: null,
      cells: cells.map((cell) => (cell === "−" || cell === "-" ? "↘" : cell === "+" ? "↗" : cell)),
    },
  };
}

describe("SignTable", () => {
  it("a correct table has no problems", () => {
    const correct = table(["", "−", "0", "+", ""]);
    correct.variation = { name: "f", expression: null, cells: ["", "↘", "", "↗", ""] };
    correct.rows[0]!.name = "f'(x)";
    expect(signTableProblems(correct)).toEqual([]);
    expect(realigned(correct)).toEqual(correct);
  });

  it("a swapped sign is detected", () => {
    expect(signTableProblems(table(["", "+", "0", "+", ""]))).not.toEqual([]);
  });

  it("cells that start one column early are realigned", () => {
    // The solver omitted the empty cell under −∞ and left a trailing blank.
    const shifted = table(["−", "0", "+", "", ""]);
    expect(signTableProblems(shifted)).not.toEqual([]);
    const aligned = realigned(shifted);
    expect(aligned.rows[0]!.cells).toEqual(["", "−", "0", "+", ""]);
    expect(signTableProblems(aligned)).toEqual([]);
  });

  it("a wrong column count is detected", () => {
    expect(signTableProblems(table(["", "−", "0", "+"])).some((problem) => problem.includes("cells"))).toBe(true);
  });

  it("an arrow that goes against the derivative is detected", () => {
    const wrong = table(["", "−", "0", "+", ""]);
    wrong.rows[0]!.name = "f′(x)";
    wrong.variation = { name: "f", expression: null, cells: ["", "↗", "", "↗", ""] };
    expect(signTableProblems(wrong).some((problem) => problem.startsWith("↗"))).toBe(true);
  });

  it("checks zeros, undefined points and the order of the points", () => {
    const quotient: SignTable = {
      variable: "x",
      points: [
        { text: "−∞", value: null },
        { text: "0", value: 0 },
        { text: "2", value: 2 },
        { text: "+∞", value: null },
      ],
      rows: [{ name: "(x−2)/x", expression: "(x-2)/x", cells: ["", "+", "n.d.", "−", "0", "+", ""] }],
    };
    expect(signTableProblems(quotient)).toEqual([]);
    const notZero = structuredClone(quotient);
    notZero.rows[0]!.cells[2] = "0";
    expect(signTableProblems(notZero).some((problem) => problem.includes("not 0"))).toBe(true);
    const defined = structuredClone(quotient);
    defined.rows[0]!.cells[4] = "n.d.";
    expect(signTableProblems(defined).some((problem) => problem.includes("not undefined"))).toBe(true);
    const unordered = structuredClone(quotient);
    unordered.points[1]!.value = 5;
    expect(signTableProblems(unordered).some((problem) => problem.includes("out of order"))).toBe(true);
    expect(signTableProblems({ variable: "x", points: [{ text: "0", value: 0 }], rows: [] })).toEqual([
      "fewer than two points",
    ]);
  });

  it("reads cells and picks a point inside each interval", () => {
    expect([signOf(" + "), signOf("−"), signOf("-"), signOf("–"), signOf("0"), signOf("↗"), signOf("")]).toEqual([
      1,
      -1,
      -1,
      -1,
      0,
      null,
      null,
    ]);
    expect(["n.d.", "N. D.", "nd", "s.s.", "∄"].every(isUndefinedCell)).toBe(true);
    expect(isUndefinedCell("0")).toBe(false);
    expect(testPoint(1, 3)).toBe(2);
    expect(testPoint(-Infinity, 5)).toBe(0);
    expect(testPoint(5, Infinity)).toBe(10);
    expect(testPoint(-Infinity, Infinity)).toBe(0);
  });
});
