// OptionClickFixesTests.swift (the locator cases) and VectorFigureTests.swift (figures made whole). The Mac draws a
// Preview-like window with AppKit and reads it with Vision; here the same window is painted point by point (each
// glyph a dark bar) and the lines Vision would read are given, as the OCR on Windows gives them to the locator.

import { describe, expect, it } from "vitest";
import { QuestionBand } from "./questionBand";
import { QuestionLocator, stackedPicture, type GreyImage, type LocatorLine } from "./questionRegion";

const windowSize = { width: 1400, height: 700 };
const pageX: [number, number] = [450, 950];
const windowFrame = { x: 14, y: 67, width: 1400, height: 700 };

function previewWindow(): { image: GreyImage; lines: LocatorLine[] } {
  const { width, height } = windowSize;
  // A dark canvas around a white page.
  const pixels = new Uint8Array(width * height).fill(31);
  const fill = (x: number, y: number, w: number, h: number, grey: number) => {
    for (let row = Math.max(0, y); row < Math.min(height, y + h); row += 1) {
      for (let column = Math.max(0, x); column < Math.min(width, x + w); column += 1)
        pixels[row * width + column] = grey;
    }
  };
  fill(pageX[0], 0, pageX[1] - pageX[0], height, 255);
  const lines: LocatorLine[] = [];
  const write = (text: string, x: number, y: number, advance: number) => {
    // A 15-point line: glyphs 11 points high, one advance apart, nothing for a space.
    Array.from(text).forEach((character, index) => {
      if (character !== " ") fill(Math.round(x + index * advance), y + 4, Math.max(2, Math.round(advance) - 2), 11, 0);
    });
    lines.push({ text, rect: { x, y: y + 2, width: Array.from(text).length * advance, height: 14 } });
  };
  const stroke = (x0: number, y0: number, x1: number, y1: number) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let step = 0; step <= steps; step += 1) {
      const x = Math.round(x0 + ((x1 - x0) * step) / steps);
      const y = Math.round(y0 + ((y1 - y0) * step) / steps);
      fill(x - 1, y - 1, 2, 2, 0);
    }
  };
  [120, 300, 480].forEach((top, index) => {
    write(`Questão ${index + 1} – Considere o circuito da figura e escolha`, 490, top, 7.5);
    write("os parâmetros que caracterizam o equivalente.", 490, top + 20, 7.5);
    ["A. R = 1,2 kΩ", "B. R = 2 kΩ", "C. R = 3 kΩ", "D. Nenhuma das respostas"].forEach((option, row) =>
      write(option, 496, top + 46 + row * 22, 7),
    );
    // The circuit: a box with a resistor zig-zag, to the right of the options.
    stroke(700, top + 50, 860, top + 50);
    stroke(860, top + 50, 860, top + 140);
    stroke(860, top + 140, 700, top + 140);
    stroke(700, top + 140, 700, top + 50);
    let x = 730;
    let y = top + 95;
    for (let step = 0; step < 6; step += 1) {
      const nextX = 730 + (step + 1) * 12;
      const nextY = top + 95 + (step % 2 === 0 ? -14 : 14);
      stroke(x, y, nextX, nextY);
      x = nextX;
      y = nextY;
    }
  });
  return { image: { width, height, pixels }, lines };
}

const locate = (windowY: number) => {
  const { image, lines } = previewWindow();
  // The click, in global points, as the hook reports it.
  const point = { x: windowFrame.x + 580, y: windowFrame.y + windowY };
  return QuestionLocator.locate({ image, window: windowFrame, point, lines });
};

describe("QuestionLocator", () => {
  it("opens question two with its circuit for a click inside it", () => {
    // On Questão 2's options (y 346…412) and on its statement.
    for (const y of [330, 380, 410]) {
      const region = locate(y)!;
      expect(QuestionBand.number(region.label), `y ${y}`).toBe(2);
      // Inside Q2's own span: not Q1's, not Q3's.
      expect(region.frame.y).toBeGreaterThanOrEqual(windowFrame.y + 280);
      expect(region.frame.y + region.frame.height).toBeLessThanOrEqual(windowFrame.y + 470);
      expect(region.hasFigure).toBe(true);
    }
  });

  it("stops the crop at the page, and its figure is the circuit", () => {
    const region = locate(380)!;
    // The dark canvas around the page is not part of the question.
    expect(region.frame.x).toBeGreaterThanOrEqual(windowFrame.x + pageX[0]);
    expect(region.frame.x + region.frame.width).toBeLessThanOrEqual(windowFrame.x + pageX[1]);
    // One figure, hugging the circuit: not the whole crop.
    expect(region.figureBoxes.length).toBeGreaterThan(0);
    for (const box of region.figureBoxes) {
      expect(box.width).toBeLessThan(0.7);
      expect(box.x).toBeGreaterThan(0.3);
    }
    expect(region.text).toContain("Questão 2");
    expect(region.text).not.toContain("Questão 3");
  });

  it("stacks the crops at most 1400 pixels across", () => {
    const layout = stackedPicture(
      [
        { x: 0, y: 0, width: 1000, height: 100 },
        { x: 0, y: 200, width: 600, height: 300 },
      ],
      2,
    )!;
    expect(layout.width).toBe(1400);
    expect(layout.pieces).toHaveLength(2);
    expect(layout.pieces[1]!.target.y).toBeCloseTo((200 + 16) * 0.7);
  });

  it("makes overlapping boxes one figure that grows to its labels", () => {
    const lines = [
      { text: "CLK", rect: { x: 10, y: 100, width: 30, height: 12 } },
      { text: "Q1", rect: { x: 10, y: 150, width: 16, height: 12 } },
      { text: "a) Preencha o seguinte diagrama temporal", rect: { x: 10, y: 60, width: 250, height: 14 } },
    ];
    // Two boxes that overlap are one; a waveform's name left of it and one under it are held.
    const merged = QuestionLocator.consolidated(
      [
        { x: 60, y: 100, width: 100, height: 20 },
        { x: 100, y: 105, width: 100, height: 25 },
      ],
      lines,
      12,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.x).toBeLessThanOrEqual(10);
    expect(merged[0]!.x + merged[0]!.width).toBeGreaterThanOrEqual(200);
    expect(merged[0]!.y + merged[0]!.height).toBeGreaterThanOrEqual(162);
    // A statement line between two figures keeps them apart.
    const apart = QuestionLocator.consolidated(
      [
        { x: 60, y: 10, width: 100, height: 40 },
        { x: 60, y: 80, width: 100, height: 40 },
      ],
      lines,
      12,
    );
    expect(apart).toHaveLength(2);
  });
});
