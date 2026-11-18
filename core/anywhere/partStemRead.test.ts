// Port of LearnLayerTests/PartStemReadTests.swift @ ref 2026-11-04, the cases on the page's text: an Alt-click on a
// part ("(ii)") of a question whose statement and display formula sit above its first part shows, reads and solves
// the part with that statement, never its siblings. The cases on the model's pictures (bitmaps of the page's regions)
// are covered where Windows makes them: the stage crops the area from the PDF's own rendering.

import { describe, expect, it } from "vitest";
import { pageFromLines, Rects, type PageText } from "../pdf/page";
import { questionsOn } from "../problems/questionDetector";
import { PDFQuestionReading } from "./pdfQuestionRead";
import type { LocatorLine } from "./questionRegion";

/** teste1a CDI-I, question 3: a stem, a piecewise formula on lines of its own, then (i)…(iii). */
const items: { text: string; x: number; y: number }[] = [
  { text: "2. Usando o principio de inducao matematica, demonstre a seguinte afirmacao:", x: 40, y: 560 },
  { text: "n(n + 1) / 4 , n e N.", x: 160, y: 540 },
  { text: String.raw`3. Considere a funcao f : R \ {0} -> R definida por`, x: 40, y: 500 },
  { text: "arcsen x", x: 150, y: 478 },
  { text: "1+x2 , se x < 0,", x: 175, y: 470 },
  { text: "f (x) =", x: 90, y: 462 },
  { text: "1", x: 200, y: 452 },
  { text: "(cosh x)", x: 150, y: 446 },
  { text: "x , se x > 0.", x: 200, y: 440 },
  { text: "(i) A funcao f e prolongavel por continuidade a x = 0? Justifique.", x: 50, y: 410 },
  {
    text: String.raw`(ii) A funcao f e diferenciavel em R \ {0}? Justifique. Determine a funcao derivada`,
    x: 50,
    y: 390,
  },
  { text: "f' de f em x < 0.", x: 70, y: 376 },
  { text: "(iii) Averigue a existencia de extremos locais de f em x < 0. Justifique.", x: 50, y: 356 },
  { text: "4. Sejam a, b em R, a < b e g uma funcao diferenciavel em ]a, b[.", x: 40, y: 320 },
];

function document(): PageText[] {
  const pages: PageText[] = [];
  const lines = items.map((item) => ({ text: item.text, x: item.x, baseline: item.y, fontSize: 11 }));
  pages.push(pageFromLines(lines, { mediaBox: { x: 0, y: 0, width: 520, height: 600 }, pages: () => pages }));
  return pages;
}

const zoom = 1.2;
const offset = { x: 200, y: 60 };
const screenLines: LocatorLine[] = items.map((item) => ({
  text: item.text,
  rect: {
    x: offset.x + item.x * zoom,
    y: offset.y + (600 - item.y - 11) * zoom,
    width: Array.from(item.text).length * 5 * zoom,
    height: 11 * zoom,
  },
}));

function read(page: { x: number; y: number }, pages = document()) {
  const point = { x: offset.x + page.x * zoom, y: offset.y + (600 - page.y) * zoom };
  const found = PDFQuestionReading.read(screenLines, point, pages);
  expect(found).not.toBeNull();
  return found!;
}

describe("a clicked part with its stem", () => {
  it("a clicked part carries the stem and its display formula", () => {
    const found = read({ x: 120, y: 393 });
    expect(found.exam.label).toBe("3(ii)");
    const text = found.exam.text;
    // The statement and the formula above the first part, then the part; never its siblings.
    expect(text.startsWith("3. Considere a funcao f")).toBe(true);
    expect(text).toContain("(cosh x)");
    expect(text).toContain("arcsen x");
    expect(text).toContain("(ii) A funcao f e diferenciavel");
    expect(text).not.toContain("(i) A funcao");
    expect(text).not.toContain("(iii)");
    expect(text).not.toContain("4. Sejam");
    expect(text.indexOf("Considere")).toBeLessThan(text.indexOf("(ii)"));
    // The solver gets the whole group, stem included.
    expect(found.exam.groupText).toContain("Considere a funcao");
    expect(found.exam.groupText).toContain("(cosh x)");
  });

  it("the part's regions hold the stem and the part only", () => {
    const found = read({ x: 120, y: 393 });
    const stem = PDFQuestionReading.stemArea(
      questionsOn(found.page).find((question) => question.label === "3(ii)")!,
      found.area,
    );
    expect(stem).not.toBeNull();
    const seen = [stem!, found.area].map((region) => PDFQuestionReading.statement(region, "", found.page, []));
    expect(seen[0]).toContain("3. Considere");
    expect(seen[0]).toContain("(cosh x)");
    expect(seen[1]).toContain("(ii) A funcao");
    expect(seen[1]).toContain("f' de f em x < 0.");
    const all = seen.join("\n");
    expect(all).not.toContain("(i) A funcao");
    expect(all).not.toContain("(iii)");
    expect(all).not.toContain("4. Sejam");
  });

  it("a question's area stops before the next question", () => {
    const page = document()[0]!;
    const all = questionsOn(page);
    const two = all.find((question) => question.label === "2")!;
    expect(two).toBeDefined();
    const seen = PDFQuestionReading.statement(PDFQuestionReading.questionArea(two, all), "", page, []);
    expect(seen).toContain("2. Usando");
    expect(seen).toContain("n(n + 1)");
    expect(seen).not.toContain("Considere");
  });

  it("the shown area is the stem with the part under it, not the siblings between", () => {
    const found = read({ x: 120, y: 393 });
    const stem = PDFQuestionReading.stemArea(
      questionsOn(found.page).find((question) => question.label === "3(ii)")!,
      found.area,
    )!;
    const regions = [stem, found.area];
    const stacked = PDFQuestionReading.stackedArea(regions)!;
    expect(Math.abs(stacked.height - (regions[0]!.height + regions[1]!.height))).toBeLessThan(0.01);
    expect(Rects.union(regions[0]!, regions[1]!)!.height).toBeGreaterThan(stacked.height + 10);
    expect(Math.abs(found.screenFrame.height - stacked.height * zoom)).toBeLessThan(1);
    expect(Math.abs(found.screenFrame.width - stacked.width * zoom)).toBeLessThan(1);
  });

  it("the lifted question covers the stem", () => {
    const found = read({ x: 120, y: 393 });
    const partOnly = found.area;
    expect(found.screenFrame.height).toBeGreaterThan(partOnly.height * zoom * 2);
  });

  it("a later part is read with the same stem", () => {
    const three = read({ x: 120, y: 359 });
    expect(three.exam.label).toBe("3(iii)");
    expect(three.exam.text.startsWith("3. Considere")).toBe(true);
    expect(three.exam.text).not.toContain("(ii) A funcao");
  });

  it("a question without parts has no stem", () => {
    const found = read({ x: 160, y: 543 });
    expect(found.exam.label).toBe("2");
    expect(found.exam.text.startsWith("2. Usando")).toBe(true);
    expect(found.exam.text).not.toContain("Considere");
  });
});

// Port of theFirstPartStartsWhereItsStatementEnds (LearnLayerTests/QuestionDetectorTests.swift @ ref 2026-11-04), in
// page points (y up), as the Mac's CGRect.
describe("the regions a part is read from", () => {
  it("the first part starts where its statement ends", () => {
    const stem = { x: 40, y: 700, width: 400, height: 30 };
    const area = { x: 40, y: 600, width: 400, height: 92 };
    const regions = PDFQuestionReading.modelRegions(stem, area, []);
    const last = regions[regions.length - 1]!;
    expect(last.y + last.height).toBe(stem.y);
    // A sibling part between them (a whole line or more) stays out.
    const far = { x: 40, y: 600, width: 400, height: 60 };
    expect(PDFQuestionReading.modelRegions(stem, far, []).at(-1)).toEqual(far);
  });
});
