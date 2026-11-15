// What an Alt-click opens, from what was read (AnywhereController.optionClick): the PDF behind the window first, else
// UI Automation's text cut to the region found on the picture, else the region's own text; nothing when none reads.

import { describe, expect, it } from "vitest";
import { pageFromLines, type PageText } from "../pdf/page";
import { readClick, type ClickRead } from "./clickReading";
import type { GreyImage, LocatorLine } from "./questionRegion";
import { ScreenQuestions } from "./screenQuestion";

/** A white window 900 × 600 with three questions, each a statement and two options (glyphs as dark bars). */
function window(): { image: GreyImage; lines: LocatorLine[] } {
  const width = 900;
  const height = 600;
  const pixels = new Uint8Array(width * height).fill(255);
  const lines: LocatorLine[] = [];
  const write = (text: string, x: number, y: number) => {
    Array.from(text).forEach((character, index) => {
      if (character === " ") return;
      for (let row = y + 3; row < y + 13; row += 1) {
        for (let column = x + index * 7; column < x + index * 7 + 5; column += 1) pixels[row * width + column] = 0;
      }
    });
    lines.push({ text, rect: { x, y, width: Array.from(text).length * 7, height: 15 } });
  };
  const statements = [
    "Calcule a soma dos primeiros vinte termos da sucessão",
    "Determine a velocidade média do carro no percurso",
    "Indique o valor da energia cinética final do corpo",
  ];
  [60, 220, 380].forEach((top, index) => {
    write(`Questão ${index + 1} – ${statements[index]}`, 40, top);
    write("A. 2 kΩ", 50, top + 30);
    write("B. 4 kΩ", 50, top + 52);
  });
  return { image: { width, height, pixels }, lines };
}

const frame = { x: 100, y: 50, width: 900, height: 600 };
const click = (over: Partial<ClickRead> = {}): ClickRead => ({
  point: { x: frame.x + 200, y: frame.y + 255 },
  appName: "Chrome",
  found: null,
  window: { frame, ...window() },
  pdf: null,
  ...over,
});

describe("readClick", () => {
  it("reads the region's own text when UI Automation gives nothing, and sends its picture", () => {
    const outcome = readClick(click());
    expect(outcome.kind).toBe("screen");
    if (outcome.kind !== "screen") return;
    expect(outcome.found.method).toBe("region");
    expect(outcome.found.text).toContain("Questão 2");
    expect(outcome.found.text).not.toContain("Questão 1");
    expect(outcome.sendsPicture).toBe(true);
    expect(outcome.transcribes).toBe(true);
  });

  it("cuts UI Automation's whole page to the clicked question, and keeps clean text as text", () => {
    const page = window()
      .lines.map((line) => line.text)
      .join("\n");
    const found = ScreenQuestions.make({
      text: page,
      frame,
      appName: "Chrome",
      hasImage: false,
      method: "block",
      focus: page,
    });
    const outcome = readClick(click({ found }));
    expect(outcome.kind).toBe("screen");
    if (outcome.kind !== "screen") return;
    expect(outcome.found.text.startsWith("Questão 2")).toBe(true);
    expect(outcome.found.text).not.toContain("Questão 3");
    expect(outcome.sendsPicture).toBe(false);
  });

  it("opens nothing when nothing could be read", () => {
    expect(readClick(click({ window: null })).kind).toBe("nothing");
  });

  it("reads the question from the PDF behind the window when the page can be placed", () => {
    // The same three questions as a PDF page, one page point per screen point, page top at the window's top.
    const lines = window().lines;
    const pages: PageText[] = [];
    pages.push(
      pageFromLines(
        lines.map((line) => ({ text: line.text, x: line.rect.x, baseline: 600 - line.rect.y - 12, fontSize: 12 })),
        { mediaBox: { x: 0, y: 0, width: 900, height: 600 }, pages: () => pages },
      ),
    );
    const outcome = readClick(click({ pdf: { pages } }));
    expect(outcome.kind).toBe("pdf");
    if (outcome.kind !== "pdf") return;
    expect(outcome.read.exam.text).toContain("Questão 2");
    expect(outcome.read.exam.text).not.toContain("Questão 3");
  });
});
