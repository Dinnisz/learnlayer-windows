// The timing diagram: the boolean expressions, the circuit simulated interval by interval, and a printed diagram found
// on a made-up page (its labels in the text layer, its waveforms in the rendered picture).

import { describe, expect, test } from "vitest";
import type { PageText, Rect } from "../pdf/page";
import {
  BooleanExpression,
  decodeTimingAnswer,
  detectTimingDiagram,
  simulateTiming,
  timingPath,
  TimingDiagrams,
  type GreyBitmap,
  type TimingDiagram,
} from "./timing";

describe("BooleanExpression", () => {
  test("reads OR, AND, XOR and NOT in their exam spellings", () => {
    const values = { A: 1, B: 0, Q0: 1 };
    expect(new BooleanExpression("A + B").evaluate(values)).toBe(1);
    expect(new BooleanExpression("A B").evaluate(values)).toBe(0);
    expect(new BooleanExpression("A·B'").evaluate(values)).toBe(1);
    expect(new BooleanExpression("A ⊕ Q0").evaluate(values)).toBe(0);
    expect(new BooleanExpression("¬(A + B)").evaluate(values)).toBe(0);
    expect(new BooleanExpression("!B & 1").evaluate(values)).toBe(1);
    expect(new BooleanExpression("q0").evaluate(values)).toBe(1);
    expect(new BooleanExpression("C").evaluate(values)).toBeNull();
  });

  test("a broken expression is refused", () => {
    expect(() => new BooleanExpression("A +")).toThrow();
    expect(() => new BooleanExpression("(A")).toThrow();
    expect(() => new BooleanExpression("A )")).toThrow();
  });
});

/** Four intervals: CLK rises between each, X given, Q to fill. */
const diagram: TimingDiagram = {
  rows: [
    { name: "CLK", highY: 500, lowY: 490, given: [0, 1, 0, 1] },
    { name: "X", highY: 470, lowY: 460, given: [1, 1, 0, 0] },
    { name: "Q", highY: 440, lowY: 430, given: null },
    { name: "Z", highY: 410, lowY: 400, given: null },
  ],
  boundaries: [
    { x: 150, events: ["CLK rises"] },
    { x: 200, events: ["CLK falls", "X falls"] },
    { x: 250, events: ["CLK rises"] },
  ],
  xStart: 100,
  xEnd: 300,
};

describe("TimingSimulator", () => {
  test("a D flip-flop takes X on the rising edge, and a gate follows", () => {
    const answer = decodeTimingAnswer({
      signals: [
        { name: "Q", levels: [0, 1, 1, 0] },
        { name: "Z", levels: [0, 1, 0, 0] },
      ],
      circuit: [
        { signal: "Q", kind: "D", edge: "rising", clock: "CLK", inputs: [{ pin: "D", expression: "X" }] },
        { signal: "Z", kind: "comb", inputs: [{ pin: "out", expression: "Q * X" }] },
      ],
    })!;
    expect(simulateTiming(diagram, answer)).toEqual({ Q: [0, 1, 1, 0], Z: [0, 1, 0, 0] });
  });

  test("a JK flip-flop toggles with J = K = 1", () => {
    const answer = decodeTimingAnswer({
      signals: [{ name: "Q", levels: [0] }],
      circuit: [
        {
          signal: "Q",
          kind: "JK",
          inputs: [
            { pin: "J", expression: "1" },
            { pin: "K", expression: "1" },
          ],
        },
        { signal: "Z", kind: "comb", inputs: [{ pin: "out", expression: "Q'" }] },
      ],
    })!;
    expect(simulateTiming(diagram, answer)).toEqual({ Q: [0, 1, 1, 0], Z: [1, 0, 0, 1] });
  });

  test("a circuit that can't be read gives nothing to confirm", () => {
    const answer = decodeTimingAnswer({
      signals: [],
      circuit: [{ signal: "Q", kind: "D", inputs: [{ pin: "D", expression: "X +" }] }],
    })!;
    expect(simulateTiming(diagram, answer)).toBeNull();
  });

  test("the diagram is described to the model with its intervals, events and given rows", () => {
    expect(TimingDiagrams.description(diagram)).toBe(
      [
        "A timing diagram is printed with 4 time intervals (numbered 0 to 3).",
        "Between interval 0 and 1: CLK rises.",
        "Between interval 1 and 2: CLK falls, X falls.",
        "Between interval 2 and 3: CLK rises.",
        "CLK levels per interval: 0 1 0 1.",
        "X levels per interval: 1 1 0 0.",
        "Rows to fill in: Q, Z.",
      ].join("\n"),
    );
  });

  test("the answer is drawn level by level, vertical at each change", () => {
    const row = diagram.rows[2]!;
    expect(timingPath(diagram, row, [0, 1, 1, 0])).toEqual([
      { x: 100, y: 430 },
      { x: 150, y: 430 },
      { x: 150, y: 440 },
      { x: 200, y: 440 },
      { x: 250, y: 440 },
      { x: 250, y: 430 },
      { x: 300, y: 430 },
    ]);
  });
});

describe("TimingDetector", () => {
  /** A page with the labels CLK, X and Q stacked at x = 50, and the given waveforms drawn to their right. */
  function page(): { page: PageText; render: (region: Rect, scale: number) => Promise<GreyBitmap> } {
    const labels = [
      { text: "CLK", y: 600 },
      { text: "X", y: 570 },
      { text: "Q", y: 540 },
    ];
    let text = "4. Complete o diagrama temporal.";
    const boxes: (Rect | null)[] = Array.from(text, (_, index) => ({
      x: 50 + index * 5,
      y: 650,
      width: 5,
      height: 10,
    }));
    for (const label of labels) {
      text += "\n";
      boxes.push(null);
      for (const [index] of [...label.text].entries())
        boxes.push({ x: 50 + index * 6, y: label.y - 5, width: 6, height: 10 });
      text += label.text;
    }
    const mediaBox = { x: 0, y: 0, width: 595, height: 842 };
    const pageText: PageText = { index: 0, mediaBox, text, boxes, page: () => null, pageCount: () => 1 };
    // Square waves in PDF points: CLK changes every 40 pt from x = 100, X once at x = 180.
    const level = (name: string, x: number) => (name === "CLK" ? Math.floor((x - 100) / 40) % 2 : x < 180 ? 1 : 0);
    const render = async (region: Rect, scale: number): Promise<GreyBitmap> => {
      const width = Math.round(region.width * scale);
      const height = Math.round(region.height * scale);
      const pixels = new Uint8Array(width * height).fill(255);
      const ink = (px: number, py: number) => {
        const column = Math.round((px - region.x) * scale);
        const row = Math.round((region.y + region.height - py) * scale);
        for (let dy = 0; dy < 2; dy++)
          if (column >= 0 && column < width && row + dy >= 0 && row + dy < height)
            pixels[(row + dy) * width + column] = 0;
      };
      for (const [name, centre] of [
        ["CLK", 600],
        ["X", 570],
      ] as const) {
        const high = centre + 6;
        const low = centre - 6;
        let previous = level(name, 100);
        for (let x = 100; x <= 260; x += 1 / scale) {
          const now = level(name, x);
          if (now !== previous) for (let y = low; y <= high; y += 1 / scale) ink(x, y);
          ink(x, now === 1 ? high : low);
          previous = now;
        }
      }
      return { width, height, pixels };
    };
    return { page: pageText, render };
  }

  test("finds the rows, the edges and the row to fill", async () => {
    const { page: pageText, render } = page();
    const found = await detectTimingDiagram(pageText, { x: 40, y: 640, width: 500, height: 30 }, render);
    expect(found).not.toBeNull();
    expect(found!.rows.map((row) => row.name)).toEqual(["CLK", "X", "Q"]);
    expect(TimingDiagrams.rowsToFill(found!).map((row) => row.name)).toEqual(["Q"]);
    const clock = found!.rows[0]!.given!;
    expect(clock.length).toBe(TimingDiagrams.intervalCount(found!));
    // The clock alternates; X falls once, at a clock edge's neighbourhood or on its own.
    expect(clock.slice(0, 4)).toEqual([0, 1, 0, 1]);
    expect(found!.boundaries.some((boundary) => boundary.events.includes("X falls"))).toBe(true);
    expect(found!.boundaries.filter((boundary) => boundary.events.includes("CLK rises")).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(Math.abs(found!.xStart - 100)).toBeLessThan(1);
  });

  test("no clock near the question, no diagram", async () => {
    const { page: pageText, render } = page();
    expect(await detectTimingDiagram(pageText, { x: 40, y: 100, width: 500, height: 30 }, render)).toBeNull();
  });
});
