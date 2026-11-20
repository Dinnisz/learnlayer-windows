// Item 4 of the 2026 Geografia A exam (EX-GeoA719, page 8, at 1.5×) in a browser window 1000 pixels high, as Windows'
// OCR reads it: the group's statement and its Figure 4 run from "4." to "4.1.", more than 70 % of the window. With a
// label read at each end the span is the statement's: a click on it takes the figure too, not the first paragraph.

import { describe, expect, it } from "vitest";
import { InkMap, QuestionLocator, type GreyImage, type LocatorLine } from "./questionRegion";

const width = 1600;
const height = 1000;

const lines: LocatorLine[] = (
  [
    ["4.", 439, 116, 12, 15],
    [
      "A energia hidroelétrica tem sido um pilar essencial na produção de eletricidade em Portugal, tendo",
      460,
      116,
      701,
      15,
    ],
    [
      "contribuído com, aproximadamente, 42% para a quota de energia renovável na produção de energia",
      461,
      135,
      701,
      15,
    ],
    ["elétrica, em 2024.", 461, 155, 118, 15],
    [
      "A Figura 4 representa a produção mensal de energia elétrica em algumas bacias hidrográficas, de 2022",
      460,
      184,
      699,
      15,
    ],
    ["a 2024, bem como a produção total de energia elétrica e a potência instalada.", 461, 204, 629, 15],
    ["JFMAMJJASOND", 516, 378, 160, 12],
    ["JFMAMJJASOND", 970, 389, 161, 12],
    ["J F MA MJJASOND", 519, 703, 158, 12],
    ["Figura 4 — Produção mensal de energia elétrica em algumas bacias hidrográficas", 517, 832, 588, 13],
    ["Fonte: DGEG — Direção-Geral de Energia e Geologia.", 508, 881, 654, 13],
    ["4.1.", 460, 928, 25, 15],
    ["As duas bacias hidrográficas que apresentam maior produção total de energia elétrica, de", 494, 928, 667, 15],
  ] as const
).map(([text, x, y, w, h]) => ({ text, rect: { x, y, width: w, height: h } }));

/** A browser window: a light toolbar, a dark canvas, the white page with the lines inked and Figure 4's charts. */
function window(): GreyImage {
  const pixels = new Uint8Array(width * height).fill(86);
  const fill = (x: number, y: number, w: number, h: number, grey: number) => {
    for (let row = Math.max(0, y); row < Math.min(height, y + h); row += 1)
      for (let column = Math.max(0, x); column < Math.min(width, x + w); column += 1)
        pixels[row * width + column] = grey;
  };
  fill(0, 0, width, 40, 243);
  fill(354, 40, 893, height - 40, 255);
  for (const line of lines) fill(line.rect.x, line.rect.y + 3, line.rect.width, line.rect.height - 6, 20);
  // The charts: boxes of bars.
  for (const [x, y] of [
    [510, 240],
    [960, 250],
    [510, 560],
    [960, 590],
  ] as const) {
    fill(x, y, 180, 2, 20);
    fill(x, y + 130, 180, 2, 20);
    for (let bar = 0; bar < 12; bar += 1) fill(x + 6 + bar * 14, y + 40 + (bar % 4) * 20, 8, 90 - (bar % 4) * 20, 60);
  }
  return { width, height, pixels };
}

describe("a group's statement taller than most of the window", () => {
  it("is taken whole when its label and the next are both read", () => {
    const region = QuestionLocator.locate({
      image: window(),
      window: { x: 0, y: 0, width, height },
      point: { x: 600, y: 124 },
      lines,
    })!;
    expect(region.label).toBe("4.");
    expect(region.frame.y).toBeLessThanOrEqual(116);
    // Down past the figure's source, short of item 4.1.
    expect(region.frame.y + region.frame.height).toBeGreaterThan(890);
    expect(region.frame.y + region.frame.height).toBeLessThan(928);
    expect(region.hasFigure).toBe(true);
  });
});

describe("a page that runs on past the window's bottom edge", () => {
  const picture = (bottomRow: (column: number) => number): GreyImage => {
    const pixels = new Uint8Array(200 * 100).fill(255);
    for (let column = 0; column < 200; column += 1) pixels[99 * 200 + column] = bottomRow(column);
    return { width: 200, height: 100, pixels };
  };

  it("is told by text cut by the edge, not by a canvas or a bar across the whole row", () => {
    // Words cut by the edge: some of the row is ink.
    expect(new InkMap(picture((column) => (column % 7 < 3 ? 20 : 255))).reachesBottom([0, 199], 4)).toBe(true);
    // The canvas under a page that ends in the window, or a scroll bar's track: the whole row.
    expect(new InkMap(picture(() => 60)).reachesBottom([0, 199], 4)).toBe(false);
    // Blank paper.
    expect(new InkMap(picture(() => 255)).reachesBottom([0, 199], 4)).toBe(false);
  });
});
