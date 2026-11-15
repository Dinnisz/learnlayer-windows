// PDFQuestionReadTests.swift, the cases that don't need the page's paths (redrawn figures come in phase 6): a click
// in a viewer showing a PDF resolves the question from the file's own text.

import { describe, expect, it } from "vitest";
import { pageFromLines, type PageText } from "../pdf/page";
import { PDFQuestionReading, fit, fold, placeLines, similarity } from "./pdfQuestionRead";
import type { LocatorLine } from "./questionRegion";

/** Where each line of the synthetic page sits (page points, y up). */
const items: { text: string; x: number; y: number }[] = [
  { text: "MAP45 Introducao aos circuitos eletronicos", x: 60, y: 560 },
  { text: "Questao 1 - O circuito da figura, visto dos terminais a e b, equivale a", x: 40, y: 480 },
  { text: "uma resistencia de valor:", x: 40, y: 466 },
  { text: "A. Rab = 6,5 kOhm", x: 50, y: 448 },
  { text: "B. Rab = 21/13 kOhm", x: 50, y: 432 },
  { text: "C. Rab = 3 kOhm", x: 50, y: 416 },
  { text: "D. Nenhuma das respostas anteriores", x: 50, y: 400 },
  { text: "Questao 2 - Considere o circuito da figura e escolha a resposta certa", x: 40, y: 300 },
  { text: "sabendo que a fonte esta ligada ha muito tempo.", x: 40, y: 286 },
  { text: "A. V = 0 V e I = 0 A", x: 50, y: 268 },
  { text: "B. V = 20 V e I = 0 A", x: 50, y: 252 },
  { text: "C. V = 5 V e I = 1 A", x: 50, y: 236 },
  { text: "D. Nenhuma das respostas anteriores", x: 50, y: 220 },
];

function document(): PageText[] {
  const lines = items.map((item) => ({ text: item.text, x: item.x, baseline: item.y, fontSize: 11 }));
  // The values of each circuit's parts, in a column to the right.
  for (const top of [450, 270]) {
    lines.push({ text: "R1", x: 305, baseline: top - 36, fontSize: 11 });
    ["V1 = 20 V", "R2 = 75 k", "R3 = 50 k", "R4 = 50 k"].forEach((value, row) =>
      lines.push({ text: value, x: 400, baseline: top - 4 - row * 13, fontSize: 11 }),
    );
  }
  const pages: PageText[] = [];
  pages.push(pageFromLines(lines, { mediaBox: { x: 0, y: 0, width: 470, height: 600 }, pages: () => pages }));
  return pages;
}

/** The lines read from a picture of the page shown at `zoom`, `offset` into the screen. */
const screenLines = (zoom: number, offset: { x: number; y: number }): LocatorLine[] =>
  items.map((item) => ({
    text: item.text,
    rect: {
      x: offset.x + item.x * zoom,
      y: offset.y + (600 - item.y - 11) * zoom,
      width: Array.from(item.text).length * 5 * zoom,
      height: 11 * zoom,
    },
  }));

const screenPoint = (page: { x: number; y: number }, zoom: number, offset: { x: number; y: number }) => ({
  x: offset.x + page.x * zoom,
  y: offset.y + (600 - page.y) * zoom,
});

describe("PDFQuestionReading", () => {
  it("resolves question one from a click on it", () => {
    const zoom = 1.4;
    const offset = { x: 310, y: 90 };
    // On the first option of question 1, and on the very label.
    for (const page of [
      { x: 120, y: 452 },
      { x: 55, y: 484 },
    ]) {
      const read = PDFQuestionReading.read(screenLines(zoom, offset), screenPoint(page, zoom, offset), document())!;
      expect(read.exam.label).toBe("1");
      expect(read.exam.text).toContain("Questao 1");
      expect(read.exam.text).not.toContain("Questao 2");
    }
  });

  it("resolves question two from a click on it", () => {
    const zoom = 0.9;
    const offset = { x: 150, y: 40 };
    const read = PDFQuestionReading.read(
      screenLines(zoom, offset),
      screenPoint({ x: 100, y: 240 }, zoom, offset),
      document(),
    )!;
    expect(read.exam.label).toBe("2");
    expect(read.exam.text).toContain("fonte esta ligada");
    // Where it sits on screen: around the click.
    const click = screenPoint({ x: 100, y: 240 }, zoom, offset);
    expect(read.screenFrame.y).toBeLessThan(click.y);
    expect(read.screenFrame.y + read.screenFrame.height).toBeGreaterThan(click.y);
  });

  it("still places the page from a rough reading", () => {
    // Accents dropped, letters misread, a line cut short: the way a fast reading of a screen comes out.
    const zoom = 1.2;
    const offset = { x: 200, y: 70 };
    const lines = screenLines(zoom, offset).map((line, index) => {
      let text = line.text.replaceAll("c", index % 2 === 0 ? "e" : "c");
      if (index % 3 === 0) text = Array.from(text).slice(0, -3).join("");
      return { text, rect: line.rect };
    });
    // Chrome of the window the page is not in.
    lines.push({
      text: "AutoFill can assist with filling in this form",
      rect: { x: 40, y: 20, width: 300, height: 10 },
    });
    const read = PDFQuestionReading.read(lines, screenPoint({ x: 100, y: 240 }, zoom, offset), document())!;
    expect(read.exam.label).toBe("2");
  });

  it("doesn't place a page that isn't in the document", () => {
    const other = [
      { text: "Completely different words on another page", rect: { x: 10, y: 10, width: 200, height: 12 } },
      { text: "And a second unrelated sentence here", rect: { x: 10, y: 40, width: 200, height: 12 } },
    ];
    expect(PDFQuestionReading.read(other, { x: 50, y: 20 }, document())).toBeNull();
  });

  it("finds no question above every question", () => {
    const offset = { x: 100, y: 100 };
    expect(
      PDFQuestionReading.read(screenLines(1, offset), screenPoint({ x: 100, y: 560 }, 1, offset), document()),
    ).toBeNull();
  });

  it("leaves the strips around a hole", () => {
    const strips = PDFQuestionReading.subtract(
      { x: 40, y: 40, width: 20, height: 20 },
      { x: 0, y: 0, width: 100, height: 100 },
    );
    expect(strips).toHaveLength(4);
    for (const strip of strips) {
      const overlaps = strip.x < 59 && strip.x + strip.width > 41 && strip.y < 59 && strip.y + strip.height > 41;
      expect(overlaps).toBe(false);
    }
    expect(
      PDFQuestionReading.subtract({ x: 200, y: 200, width: 5, height: 5 }, { x: 0, y: 0, width: 100, height: 100 }),
    ).toHaveLength(1);
  });

  it("recognises options", () => {
    expect(PDFQuestionReading.isOption("A. Rab = 3 kΩ")).toBe(true);
    expect(PDFQuestionReading.isOption("(c) 12")).toBe(true);
    expect(PDFQuestionReading.isOption("B) yes")).toBe(true);
    expect(PDFQuestionReading.isOption("Questão 1 – O circuito")).toBe(false);
  });

  it("folds, compares and fits as the Mac does", () => {
    expect(fold("Questão 1 – Ação")).toBe("questao1acao");
    expect(similarity("abcdefghij", "abcdefghij")).toBe(1);
    expect(similarity("abcdefghij", "abc")).toBe(0);
    const anchors = [
      { screen: { x: 10, y: 10 }, page: { x: 20, y: 580 } },
      { screen: { x: 10, y: 110 }, page: { x: 20, y: 380 } },
      { screen: { x: 60, y: 60 }, page: { x: 120, y: 480 } },
      { screen: { x: 500, y: 500 }, page: { x: 0, y: 0 } },
    ];
    const found = fit(anchors)!;
    expect(found.used).toBe(3);
    expect(found.scale).toBeCloseTo(2);
    expect(placeLines([], document())).toBeNull();
  });
});
