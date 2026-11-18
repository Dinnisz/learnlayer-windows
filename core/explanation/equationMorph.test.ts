// Port of LearnLayerTests/EquationMorphStructureTests.swift and the morph tests of LessonPitfallMorphTests.swift @ ref
// 2026-11-04. The tests that typeset the lines (`Laid`, `Ink`, `prepared`) belong to the drawing, in ui/explanation.

import { describe, expect, it } from "vitest";
import {
  EquationMorph,
  MorphPacing,
  MorphTiming,
  type MorphChange,
  type MorphRow,
  type RowMorph,
} from "./equationMorph";

const R = String.raw;

function refined(from: string, to: string, definitions: MorphRow[] = []): MorphChange[] {
  const before = EquationMorph.tokens(from);
  const after = EquationMorph.tokens(to);
  return EquationMorph.refine(EquationMorph.diff(before, after), before, after, (symbol, value) =>
    EquationMorph.origin(value, symbol, definitions),
  );
}

function rowMorphs(from: string, to: string): RowMorph[] {
  const plan = EquationMorph.plan(from, to);
  if (plan.kind !== "morph") throw new Error(`${from} → ${to} should morph, not ${plan.fallback}`);
  return plan.rows;
}

const indices = (count: number) => Array.from({ length: count }, (_, k) => k);
const ascending = (values: number[]) => [...values].sort((a, b) => a - b);
const keys = (latex: string) => EquationMorph.tokens(latex).map((t) => t.key);

describe("a solution line becoming the next, read for its structure", () => {
  // MARK: Matching

  it("the same piece written two ways is one key", () => {
    expect(keys("x^{2} − 1")).toEqual(keys("x^2 - 1"));
    expect(keys("x²")).toEqual(keys("x^{2}"));
    expect(keys(R`3 \cdot 4`)).toEqual(keys(R`3 \times 4`));
    expect(keys("3·4")).toEqual(keys(R`3 \times 4`));
    expect(keys(R`a \le b \lor c`)).toEqual(keys(R`a \leq b \vee c`));
    expect(keys("0{,}05")).toEqual(keys("0,05"));
    // A superscript run is one script.
    expect(EquationMorph.key("x¹⁰")).toBe("x^{10}");
  });

  it("written space is kept for the layout", () => {
    const tokens = EquationMorph.tokens(R`x = -1 \quad \vee \quad x = 3`);
    expect(tokens.map((t) => t.latex)).toEqual(["x", "=", "-", "1", R`\vee`, "x", "=", "3"]);
    expect(tokens[4]!.spaceBefore === 1 && tokens[5]!.spaceBefore === 1 && tokens[1]!.spaceBefore === 0).toBe(true);
    // It shifts what follows by exactly that much.
    expect(EquationMorph.positions([10, 10], [0.5, 0.5], 26, [0, 6])).toEqual([0, 16]);
  });

  it("a bracket group written elsewhere moves whole", () => {
    const changes = EquationMorph.diff(EquationMorph.tokens("3(x-3)(x+1)"), EquationMorph.tokens("3(x+1)(x-3)"));
    expect(changes.some((c) => c.kind === "cancel" || c.kind === "appear" || c.kind === "merge")).toBe(false);
    expect(EquationMorph.matchRatio(changes, 11, 11)).toBe(1);
  });

  it("a multiplication sign written or left out is not struck", () => {
    const tokens = EquationMorph.tokens(R`2 \cdot x + 1`);
    expect(EquationMorph.strikes(tokens[1]!)).toBe(false);
    expect(EquationMorph.strikes(tokens[0]!) && EquationMorph.strikes(tokens[3]!)).toBe(true);
  });

  // MARK: Rows

  it("an aligned block is read as rows on its column", () => {
    const rows = EquationMorph.rows(
      R`\begin{aligned} 3x^2 - 6x - 9 &= 0 \\[2pt] &\iff 3(x - 3)(x + 1) = 0 \\ x = 3 \end{aligned}`,
    )!;
    expect(rows).toHaveLength(3);
    expect(rows[0]!.column).toBe(7);
    expect(rows[0]!.tokens[7]!.key).toBe("=");
    // An empty left cell: the column is the row's start.
    expect(rows[1]!.column).toBe(0);
    expect(rows[1]!.tokens[0]!.key).toBe(R`\iff`);
    // No mark: the row is all in the first column, so it ends at the column.
    expect(rows[2]!.column).toBe(3);
    expect(EquationMorph.rows("x = 1")?.[0]?.column).toBeNull();
    // A table or cases is not rows to morph.
    expect(EquationMorph.rows(R`\begin{array}{c|c} x & 1 \\ \hline y & 2 \end{array}`)).toBeNull();
    expect(EquationMorph.rows(R`\begin{cases} x & y \\ z & w \end{cases}`)).toBeNull();
  });

  it("rows are paired with the rows they grow out of", () => {
    const before = EquationMorph.rows(R`\begin{aligned} y &= 2x + 1 \\ 3x &= 6 \end{aligned}`)!;
    const after = EquationMorph.rows(R`\begin{aligned} 3x &= 6 \\ x &= 2 \\ y &= 2 \cdot 2 + 1 \end{aligned}`)!;
    // In order: "3x = 6" stays "3x = 6"; the first row has no later row to pair with in order.
    expect(EquationMorph.pairRows(before, after)).toEqual([[1, 0]]);
  });

  it("a line becoming a block morphs into its matching row and the others come in", () => {
    const rows = rowMorphs(
      "f'(x) = 3x^2 - 6x - 9",
      R`\begin{aligned} 3x^2 - 6x - 9 &= 0 \\ 3(x^2 - 2x - 3) &= 0 \\ 3(x - 3)(x + 1) &= 0 \end{aligned}`,
    );
    const paired = rows.find((r) => r.from !== null && r.to !== null)!;
    expect(paired.from === 0 && paired.to === 0).toBe(true);
    expect(ascending(rows.filter((r) => r.from === null).flatMap((r) => (r.to === null ? [] : [r.to])))).toEqual([
      1, 2,
    ]);
    // The polynomial is kept; f'(x) goes.
    expect(paired.changes.filter((c) => c.kind === "keep").length).toBeGreaterThanOrEqual(7);
  });

  it("two blocks keep their alignment column in place", () => {
    // Row 0 "x = 1" has its column at 10, row 1 "3x + 2 = 5" at 40: the first row shifts right so the two "=" line up.
    const layout = EquationMorph.blockLayout([30, 60], [10, 40], [10, 10], [4, 4], 34);
    expect(layout.lefts).toEqual([30, 0]);
    expect(layout.lefts[0]! + 10).toBe(layout.lefts[1]! + 40);
    expect(layout.baselines).toEqual([10, 30]);
    expect(layout.width).toBe(60);
    // Two blocks with the same rows morph with the "=" kept.
    const block = R`\begin{aligned} x + 1 &= 3 \\ x &= 2 \end{aligned}`;
    const next = R`\begin{aligned} x + 1 &= 3 \\ x &= 3 - 1 \\ x &= 2 \end{aligned}`;
    const rows = rowMorphs(block, next);
    expect(rows.some((r) => r.from === 0 && r.to === 0 && r.changes.every((c) => c.kind === "keep"))).toBe(true);
  });

  // MARK: Factor out

  it("a common factor gathers in front of the bracket", () => {
    const changes = refined("6x - 6 = 0", "6(x - 1) = 0");
    // The second 6 travels into the first, now in front of the bracket; nothing is struck out.
    expect(changes).toContainEqual({ kind: "gather", from: 3, into: 0 });
    expect(changes.some((c) => c.kind === "cancel")).toBe(false);
    expect(EquationMorph.plan("6x - 6 = 0", "6(x - 1) = 0").kind).toBe("morph");
  });

  it("factoring keeps the factor in front and regroups the rest", () => {
    const changes = refined("3x^2 - 6x - 9", "3(x^2 - 2x - 3)");
    expect(changes[0]).toEqual({ kind: "keep", from: 0, to: 0 });
    expect(changes).toContainEqual({ kind: "appear", to: 1 });
    // 6 becomes 2 and 9 becomes 3, each in its own place; the closing bracket comes in.
    expect(changes).toContainEqual({ kind: "merge", from: [3], into: 4 });
    expect(changes).toContainEqual({ kind: "merge", from: [6], into: 7 });
    expect(EquationMorph.plan("3x^2 - 6x - 9", "3(x^2 - 2x - 3)").kind).toBe("morph");
    expect(EquationMorph.plan("3(x^2 - 2x - 3)", "3(x - 3)(x + 1)").kind).toBe("morph");
  });

  it("a repeated letter that is not a term of a sum does not gather", () => {
    // "PP" and "Pp" are names, not terms: no sign between the copies.
    const changes = refined(R`PP: \frac{1}{4} \qquad Pp: \frac{1}{4}`, R`P(pp) = \frac{1}{4}`);
    expect(changes.some((c) => c.kind === "gather")).toBe(false);
  });

  // MARK: Substitution

  it("a letter given its value is a substitution", () => {
    const from = R`C_{n}=C_{0}\,(1+r)^{n}`;
    const to = R`C_{10}=1000\,(1+0{,}05)^{10}`;
    const changes = refined(from, to);
    expect(changes).toContainEqual({ kind: "substitute", from: [2], into: 2, origin: null });
    expect(changes).toContainEqual({ kind: "substitute", from: [6], into: 6, origin: null });
    // A letter becoming another letter is only replaced.
    expect(changes).toContainEqual({ kind: "merge", from: [0], into: 0 });
    // Half a match each: the shape held.
    const before = EquationMorph.tokens(from);
    const after = EquationMorph.tokens(to);
    expect(EquationMorph.confidence(changes, before, after)).toBeGreaterThan(
      EquationMorph.matchRatio(EquationMorph.diff(before, after), before.length, after.length),
    );
  });

  it("a value flies from where it was given", () => {
    const block = R`\begin{aligned} r &= 0{,}05 \\ C &= C_0(1 + r) \end{aligned}`;
    const rows = rowMorphs(block, R`C = C_0(1 + 0{,}05)`);
    const paired = rows.find((r) => r.from === 1 && r.to === 0)!;
    expect(paired.changes).toContainEqual({ kind: "substitute", from: [6], into: 6, origin: { row: 0, index: 2 } });
    // The definition row leaves whole.
    expect(rows.some((r) => r.from === 0 && r.to === null)).toBe(true);
  });

  it("a value with no definition drops in place", () => {
    expect(EquationMorph.origin("2", "x", EquationMorph.rows("y = 3") ?? [])).toBeNull();
    expect(EquationMorph.isSymbol("v_{0y}") && EquationMorph.isSymbol(R`\theta`) && EquationMorph.isSymbol("C_0")).toBe(
      true,
    );
    expect(EquationMorph.isSymbol(R`\frac{a}{b}`) || EquationMorph.isSymbol("12")).toBe(false);
    expect(EquationMorph.isValue("0,05") && EquationMorph.isValue(R`\frac{1}{2}`) && !EquationMorph.isValue("x")).toBe(
      true,
    );
  });

  // MARK: Simplification

  it("terms worked out into one combine", () => {
    const changes = refined("y = -1 - 3 + 9 + 5", "y = 10");
    expect(changes.some((c) => c.kind === "combine" && c.into === 2 && c.from.length >= 6)).toBe(true);
  });

  it("a term and its opposite are struck out", () => {
    const changes = refined("a = 5 + k - k + 2", "a = 7");
    // "+ k" and "− k" struck; 5 + 2 worked out into 7.
    for (let index = 3; index <= 6; index++) expect(changes).toContainEqual({ kind: "cancel", from: index });
    expect(changes).toContainEqual({ kind: "combine", from: [2, 7, 8], into: 2 });
  });

  it("every piece is accounted for once after refining", () => {
    const cases: [string, string][] = [
      ["6x - 6 = 0", "6(x - 1) = 0"],
      ["a = 5 + k - k + 2", "a = 7"],
      ["y = -1 - 3 + 9 + 5", "y = 10"],
      [R`C_{n}=C_{0}\,(1+r)^{n}`, R`C_{10}=1000\,(1+0{,}05)^{10}=1000\times 1{,}05^{10}`],
      ["3(x-3)(x+1) = 0", "3(x+1)(x-3) = 0"],
      ["2x + 2y", "2(x + y)"],
    ];
    for (const [from, to] of cases) {
      const before = EquationMorph.tokens(from);
      const after = EquationMorph.tokens(to);
      const used: number[] = [];
      const made: number[] = [];
      for (const change of refined(from, to)) {
        switch (change.kind) {
          case "keep":
          case "move":
            used.push(change.from);
            made.push(change.to);
            break;
          case "cancel":
          case "gather":
            used.push(change.from);
            break;
          case "merge":
          case "combine":
          case "substitute":
            used.push(...change.from);
            made.push(change.into);
            break;
          case "appear":
            made.push(change.to);
        }
      }
      expect(ascending(used), `${from} → ${to}`).toEqual(indices(before.length));
      expect(ascending(made), `${from} → ${to}`).toEqual(indices(after.length));
    }
  });

  it("unrelated lines still crossfade", () => {
    expect(EquationMorph.plan("a+b+c", R`\sqrt{y}\approx 7`)).toEqual({ kind: "crossfade", fallback: "lowMatch" });
    expect(EquationMorph.plan(R`\text{PP}`, R`\begin{aligned} m &= 3 \\ n &= 4 \end{aligned}`)).toEqual({
      kind: "crossfade",
      fallback: "lowMatch",
    });
  });

  // MARK: Rows worked out one after another

  const cubic = R`\begin{aligned} 3x^2 - 6x - 9 &= 0 \\ 3(x^2 - 2x - 3) &= 0 \\ 3(x - 3)(x + 1) &= 0 \end{aligned}`;
  const cubicBlock = R`\begin{aligned} 3x^2 - 6x - 9 &= 0 \\ 3(x^2 - 2x - 3) &= 0 \\ 3(x - 3)(x + 1) &= 0 \implies x = -1 \ \vee\ x = 3 \end{aligned}`;
  const found = (row: RowMorph) => row.changes.filter((c) => c.kind === "keep" || c.kind === "move").length;

  it("each new row grows out of the row above in turn", () => {
    const rows = rowMorphs("f'(x) = 3x^2 - 6x - 9", cubic);
    const second = rows.find((r) => r.to === 1)!;
    const third = rows.find((r) => r.to === 2)!;
    expect([second.from, second.previous, second.stage]).toEqual([null, 0, 1]);
    expect([third.from, third.previous, third.stage]).toEqual([null, 1, 2]);
    // The first row comes from the old line, first.
    expect(rows.find((r) => r.to === 0)?.stage).toBe(0);
    // Worked out, not faded in: the "3", the "x" and the "= 0" come down from the row above.
    expect(found(second)).toBeGreaterThanOrEqual(5);
    expect(found(third)).toBeGreaterThanOrEqual(5);
  });

  it("a chained row accounts for every piece of both rows", () => {
    const rows = rowMorphs("f'(x) = 3x^2 - 6x - 9", cubic);
    const block = EquationMorph.rows(cubic)!;
    for (const row of rows) {
      if (row.previous === null || row.to === null) continue;
      const made: number[] = [];
      for (const change of row.changes) {
        if (change.kind === "keep" || change.kind === "move") made.push(change.to);
        else if (change.kind === "appear") made.push(change.to);
        else if (change.kind === "merge" || change.kind === "combine" || change.kind === "substitute")
          made.push(change.into);
      }
      expect(ascending(made), `row ${row.to} from ${row.previous}`).toEqual(indices(block[row.to]!.tokens.length));
      // No value flies from the old line into a row worked out from the new one.
      expect(row.changes.some((c) => c.kind === "substitute" && c.origin !== null)).toBe(false);
    }
  });

  it("a formula is given its data then worked out row by row", () => {
    const rows = rowMorphs(
      "v = v_0 + a t",
      R`\begin{aligned} v &= v_0 + a t \\ v &= 5 + 2 \cdot 3 \\ v &= 11 \end{aligned}`,
    );
    const data = rows.find((r) => r.to === 1)!;
    const sum = rows.find((r) => r.to === 2)!;
    // The formula is kept as it is as the first row: the data come in at once, the sum after.
    expect([data.previous, data.stage, sum.previous, sum.stage]).toEqual([0, 0, 1, 1]);
    // Each letter drops its value in; the "·" now written comes in between them.
    const given = data.changes.flatMap((c) => (c.kind === "substitute" ? [[c.from[0], c.into]] : []));
    expect(given).toEqual([
      [2, 2],
      [4, 4],
      [5, 6],
    ]);
    expect(data.changes).toContainEqual({ kind: "appear", to: 5 });
    // 5 + 2·3 is worked out into 11.
    expect(sum.changes.some((c) => c.kind === "combine" && c.into === 2 && c.from.join() === "2,3,4,5,6")).toBe(true);
  });

  it("a row unlike the one above comes in whole in its turn", () => {
    const rows = rowMorphs("a + b = 0", R`\begin{aligned} a + b + c &= 0 \\ \sqrt{y} &\approx 7 \end{aligned}`);
    const last = rows.find((r) => r.to === 1)!;
    expect(last.previous).toBeNull();
    expect(last.stage).toBe(1);
    expect(last.changes.every((c) => c.kind === "appear")).toBe(true);
  });

  it("stages play one after another", () => {
    // One stage is the whole morph.
    expect(EquationMorph.stageTime(0.3, 0, 1)).toBe(0.3);
    expect(EquationMorph.length(1)).toBe(1);
    expect(EquationMorph.length(3)).toBeGreaterThan(2);
    for (let step = 0; step <= 400; step++) {
      const t = step / 400;
      const stages = [0, 1, 2].map((stage) => EquationMorph.stageTime(t, stage, 3));
      // A later row has not started until the one before it has finished.
      expect(stages[1] === 0 || stages[0] === 1, `t=${t}`).toBe(true);
      expect(stages[2] === 0 || stages[1] === 1, `t=${t}`).toBe(true);
    }
    expect(EquationMorph.stageTime(1, 2, 3)).toBe(1);
    expect(EquationMorph.stageTime(0, 0, 3)).toBe(0);
  });

  it("even pacing is the fixed rhythm", () => {
    const pacing = MorphPacing.even(2, 3);
    expect(pacing.starts).toEqual([0, 2, 3.6]);
    expect(pacing.lengths).toEqual([2, 1.6, 1.6]);
    expect(Math.abs(pacing.total - 2 * EquationMorph.length(3))).toBeLessThan(1e-9);
    for (let step = 0; step <= 200; step++) {
      const t = step / 200;
      expect(Math.abs(pacing.stageTime(t * pacing.total, 1) - EquationMorph.stageTime(t, 1, 3))).toBeLessThan(1e-9);
    }
    // Rows past the last given play with the last; before its start a row has not begun.
    expect(pacing.stageTime(5.2, 7)).toBe(1);
    expect(pacing.stageTime(1, 2)).toBe(0);
  });

  it("a block stages one per row worked out", () => {
    expect(EquationMorph.stages("6x - 6 = 0", "6(x - 1) = 0")).toBe(1);
    expect(EquationMorph.stages("f'(x) = 3x^2 - 6x - 9", cubicBlock)).toBe(3);
  });

  // MARK: Timing

  it("new motions keep what goes and what comes apart", () => {
    for (let step = 0; step <= 200; step++) {
      const t = step / 200;
      // A flown value shows only once the letter it replaces is gone.
      expect(MorphTiming.flying(t) === 0 || MorphTiming.outgoing(t) === 0, `both visible at t=${t}`).toBe(true);
      // Combined terms have closed in by the time they are gone.
      if (MorphTiming.outgoing(t) === 0) expect(MorphTiming.closeIn(t)).toBe(1);
    }
    // A gathered copy is there while it travels and gone once it lands on its twin.
    expect(MorphTiming.gathering(MorphTiming.travelStart)).toBe(1);
    expect(MorphTiming.gathering(MorphTiming.travelEnd)).toBe(0);
    expect(MorphTiming.fly(MorphTiming.inStart)).toBe(0);
    expect(MorphTiming.fly(1)).toBe(1);
  });
});

describe("a solution line turning into the next (LessonPitfallMorphTests)", () => {
  // MARK: Tokens

  it("a line is cut into pieces with their scripts", () => {
    expect(EquationMorph.tokens(R`C_{n}=C_{0}\,(1+r)^{n}`).map((t) => t.latex)).toEqual([
      "C_{n}",
      "=",
      "C_{0}",
      "(",
      "1",
      "+",
      "r",
      ")^{n}",
    ]);
  });

  it("a number with decimal comma and thin spaces is one piece", () => {
    const pieces = EquationMorph.tokens(R`1{,}05^{10}\approx 1{,}628\,894\,6`);
    expect(pieces.map((t) => t.latex)).toEqual(["1{,}05^{10}", R`\approx`, R`1{,}628\,894\,6`]);
    expect(pieces.at(-1)?.key).toBe("1,6288946");
  });

  it("a fraction is one piece and spacing commands are dropped", () => {
    expect(EquationMorph.tokens(R`\dfrac{a}{b} \quad + \left( x \right)`).map((t) => t.latex)).toEqual([
      R`\dfrac{a}{b}`,
      "+",
      "(",
      "x",
      ")",
    ]);
    expect(EquationMorph.key(R`\dfrac{a}{b}`)).toBe(EquationMorph.key(R`\frac{a}{b}`));
  });

  it("the last row of an aligned block is the line it ends on", () => {
    const block = R`\begin{aligned} 3x^2 - 6x - 9 &= 0 \\ 3(x - 3)(x + 1) &= 0 \end{aligned}`;
    expect(EquationMorph.isMultiline(block)).toBe(true);
    expect(EquationMorph.lastRow(block)).toBe("3(x - 3)(x + 1) = 0");
    expect(EquationMorph.lastRow("x = 1")).toBe("x = 1");
  });

  // MARK: Diff

  it("substituting data keeps the formula's shape and merges the letters", () => {
    const before = EquationMorph.tokens(R`C_{n}=C_{0}\,(1+r)^{n}`);
    const after = EquationMorph.tokens(R`C_{10}=1000\,(1+0{,}05)^{10}`);
    const changes = EquationMorph.diff(before, after);
    expect(changes).toEqual([
      { kind: "merge", from: [0], into: 0 },
      { kind: "keep", from: 1, to: 1 },
      { kind: "merge", from: [2], into: 2 },
      { kind: "keep", from: 3, to: 3 },
      { kind: "keep", from: 4, to: 4 },
      { kind: "keep", from: 5, to: 5 },
      { kind: "merge", from: [6, 7], into: 6 },
      { kind: "appear", to: 7 },
    ]);
    expect(EquationMorph.matchRatio(changes, before.length, after.length)).toBe(0.5);
    expect(EquationMorph.plan(R`C_{n}=C_{0}\,(1+r)^{n}`, R`C_{10}=1000\,(1+0{,}05)^{10}`).kind).toBe("morph");
  });

  it("a term that goes is cancelled and a new one appears", () => {
    expect(EquationMorph.diff(EquationMorph.tokens("x+0"), EquationMorph.tokens("x"))).toEqual([
      { kind: "keep", from: 0, to: 0 },
      { kind: "cancel", from: 1 },
      { kind: "cancel", from: 2 },
    ]);
    expect(EquationMorph.diff(EquationMorph.tokens("3x"), EquationMorph.tokens("3x+1"))).toEqual([
      { kind: "keep", from: 0, to: 0 },
      { kind: "keep", from: 1, to: 1 },
      { kind: "appear", to: 2 },
      { kind: "appear", to: 3 },
    ]);
  });

  it("a piece found out of order moves", () => {
    const changes = EquationMorph.diff(EquationMorph.tokens("a+b"), EquationMorph.tokens("b+a"));
    // One piece stays in order; the two others are found again elsewhere: nothing is struck out or new.
    expect(changes.filter((c) => c.kind === "keep")).toHaveLength(1);
    expect(changes.filter((c) => c.kind === "move")).toHaveLength(2);
    expect(EquationMorph.matchRatio(changes, 3, 3)).toBe(1);
  });

  it("every piece of both lines is accounted for once", () => {
    const before = EquationMorph.tokens("f(-1) = (-1)^3 - 3(-1)^2 - 9(-1) + 5");
    const after = EquationMorph.tokens("f(-1) = -1 - 3 + 9 + 5");
    const from: number[] = [];
    const to: number[] = [];
    for (const change of EquationMorph.diff(before, after)) {
      switch (change.kind) {
        case "keep":
        case "move":
          from.push(change.from);
          to.push(change.to);
          break;
        case "cancel":
          from.push(change.from);
          break;
        case "merge":
          from.push(...change.from);
          to.push(change.into);
          break;
        case "appear":
          to.push(change.to);
          break;
        default:
          throw new Error("the raw diff only keeps, moves, cancels, merges and appears");
      }
    }
    expect(ascending(from)).toEqual(indices(before.length));
    // A merge stands for the first new piece of its gap; the others appear: every new piece once.
    expect(ascending(to)).toEqual(indices(after.length));
  });

  // MARK: Fallback

  it("unreliable alignments crossfade", () => {
    // A block that is not an aligned one (a table) can't be laid out as rows; an aligned block with nothing in common
    // with the old line has no row to grow out of it.
    expect(EquationMorph.plan("a+b", R`\begin{array}{c|c} x & 1 \\ y & 2 \end{array}`)).toEqual({
      kind: "crossfade",
      fallback: "multiline",
    });
    expect(EquationMorph.plan("a+b", R`\begin{aligned} x &= 1 \\ y &= 2 \end{aligned}`)).toEqual({
      kind: "crossfade",
      fallback: "lowMatch",
    });
    expect(EquationMorph.plan("", "x = 1")).toEqual({ kind: "crossfade", fallback: "empty" });
    expect(EquationMorph.plan("a+b+c", R`\sqrt{y}\approx 7`)).toEqual({ kind: "crossfade", fallback: "lowMatch" });
    const long = Array.from({ length: 45 }, (_, k) => `x_{${k + 1}}`).join("+");
    expect(EquationMorph.plan(long, long)).toEqual({ kind: "crossfade", fallback: "tooLong" });
    // An aligned block as the old line is read by its last row.
    expect(EquationMorph.plan(R`\begin{aligned} y &= 2 \\ x &= 1 \end{aligned}`, "x = 1 + 0").kind).toBe("morph");
  });

  it("pieces that would not look like the typeset line crossfade", () => {
    expect(EquationMorph.layoutAgrees(90, 100)).toBe(true);
    expect(EquationMorph.layoutAgrees(100, 100)).toBe(true);
    expect(EquationMorph.layoutAgrees(120, 100)).toBe(false);
    expect(EquationMorph.layoutAgrees(50, 100)).toBe(false);
    expect(EquationMorph.layoutAgrees(0, 0)).toBe(false);
  });

  it("the spare width goes mostly around relations", () => {
    expect(EquationMorph.positions([10, 10], [0.5, 0.5], 30)).toEqual([0, 20]);
    const tokens = EquationMorph.tokens("a=b");
    const weights = tokens.map((_, index) => EquationMorph.spaceWeight(tokens, index));
    expect(weights).toEqual([0.5, 5, 0.5]);
    expect(EquationMorph.positions([10, 10, 10], weights, 52)).toEqual([0, 21, 42]);
    // A leading minus is the number's own sign, not a gap between terms.
    const signed = EquationMorph.tokens("-1+2");
    expect(EquationMorph.spaceWeight(signed, 0)).toBe(0.5);
    expect(EquationMorph.spaceWeight(signed, 2)).toBe(4);
  });

  // MARK: Timing

  it("what goes is gone before what replaces it shows", () => {
    expect(MorphTiming.outgoing(0)).toBe(1);
    expect(MorphTiming.incoming(0)).toBe(0);
    expect(MorphTiming.outgoing(1)).toBe(0);
    expect(MorphTiming.incoming(1)).toBe(1);
    // Never both on screen: no overprinting of an old piece and the one in its place.
    for (let step = 0; step <= 200; step++) {
      const t = step / 200;
      expect(MorphTiming.outgoing(t) === 0 || MorphTiming.incoming(t) === 0, `both visible at t=${t}`).toBe(true);
    }
    expect(MorphTiming.outgoing(MorphTiming.outEnd)).toBe(0);
    expect(MorphTiming.outEnd).toBeLessThan(MorphTiming.inStart);
    // The strike is drawn while the piece is still there.
    expect(MorphTiming.strike(MorphTiming.outEnd * 0.5)).toBe(1);
    expect(MorphTiming.outgoing(MorphTiming.outEnd * 0.5)).toBeGreaterThan(0.4);
  });

  it("what stays waits for the others to go, then slides before the new come in", () => {
    expect(MorphTiming.travel(0.2)).toBe(0);
    expect(MorphTiming.travel(1)).toBe(1);
    // While anything new is half there, what stays has nearly arrived.
    expect(MorphTiming.travel((MorphTiming.inStart + 1) / 2)).toBe(1);
    // Leaving lifts up, arriving rises into place.
    expect(MorphTiming.lift(MorphTiming.outEnd)).toBeLessThan(0);
    expect(MorphTiming.rise(1)).toBe(0);
    expect(MorphTiming.rise(MorphTiming.inStart)).toBeGreaterThan(0);
  });
});
