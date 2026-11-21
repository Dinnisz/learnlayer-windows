// Port of the detector cases of LearnLayerTests/AlineaGridTests.swift @ 5701363: a sheet of exercises whose parts
// a)–q) are set in two columns under one statement (CDI sheet 1, «Resolva as seguintes equações e inequações:»):
// every part is found, read alone with the statement, and an Alt-click anywhere on a part's row picks that part. The
// Mac draws the page with CoreText in Times 11 on a 520 × 500 page; here the same lines are laid at the same
// baselines. The reading checks (lost relations, root indices, plain TeX, the italic label) are ported with the
// readings that use them.

import { describe, expect, it } from "vitest";
import { drawnTestPage } from "../testing/testPages";
import { inLetterSequence, inRomanSequence, questionsOn } from "./questionDetector";
import { PDFQuestionReading } from "../anywhere/pdfQuestionRead";
import { Rects } from "../pdf/page";

const left = [
  "a) 4 < x2 ≤ 9",
  "b) x2 ≤ 2 − x4,",
  "c) x3 + x ≤ 2x2,",
  "d) x − 1 ≤ 1,",
  "e) x < 1/x,",
  "f) √1 − x = x − 1",
  "g)3 √x − 1 = √x − 1,",
  "h) x2(1 + x) > 0",
];
const right = [
  "i)3 √x2 + 2x > 2,",
  "j) ex3 < 1,",
  "k) e−2x − 2e−x ≤ −1,",
  "l) ln x ≥ 0,",
  "m) ln x + ln x2 < 4,",
  "n) x < |x|,",
  "o) |x| ≤ |x − 2|,",
  "p) 1 < |x − 2| < 3",
  "q) x4 − 16 ≤ 0,",
];

function sheet() {
  return drawnTestPage(
    [
      { text: "1. Resolva as seguintes equações e inequações:", x: 40, y: 460 },
      ...left.map((text, index) => ({ text, x: 55, y: 430 - index * 20 })),
      ...right.map((text, index) => ({ text, x: 270, y: 430 - index * 20 })),
      {
        text: "2. Escreva cada um dos seguintes conjuntos como intervalo ou reunião de intervalos:",
        x: 40,
        y: 220,
      },
      { text: "a) {x ∈ R : |3x − 4| ≥ x2},", x: 55, y: 195 },
    ],
    11,
  );
}

const letters = "abcdefghijklmnopq".split("");

describe("a grid of parts in two columns", () => {
  it("has every part of both columns found with the statement", () => {
    const questions = questionsOn(sheet());
    const labels = questions.map((question) => question.label);
    for (const letter of letters)
      expect(labels, `1(${letter}) missing from ${labels.join(", ")}`).toContain(`1(${letter})`);
    // The second question's own part is its own, not a part of 1.
    expect(labels).toContain("2(a)");
    expect(questions.find((question) => question.label === "1(i)")?.group).toBe("1");
  });

  it("takes a letter past h for a part only inside a run of letters", () => {
    // i) after h) is the ninth letter; j) … q) follow on; a lone k) is not a part.
    expect(
      inLetterSequence(
        letters,
        letters.map(() => false),
      ).every(Boolean),
    ).toBe(true);
    expect(inLetterSequence(["a", "k"], [false, false])).toEqual([true, false]);
    // A label glued to its formula («g)3 √x») counts only after the letter before it.
    expect(inLetterSequence(["f", "g"], [false, true])).toEqual([true, true]);
    expect(inLetterSequence(["g"], [true])).toEqual([false]);
    // Roman numbers stay roman: (i), (ii), (iii) with no h) before them.
    expect(inRomanSequence(["i", "ii", "iii"])).toEqual([true, true, true]);
    // v) after u) and x) after w) are letters.
    expect(inRomanSequence(["u", "v"])).toEqual([true, true]);
    expect(inRomanSequence(["w", "x"])).toEqual([true, true]);
  });
});

describe("an Alt-click on a grid of parts", () => {
  const page = sheet();
  const all = questionsOn(page);
  const find = (label: string) => {
    const found = all.find((question) => question.label === label);
    if (!found) throw new Error(`missing ${label}`);
    return found;
  };
  const lineOf = (label: ReturnType<typeof find>["labelBounds"]) => {
    const middle = { x: Rects.midX(label), y: Rects.midY(label) };
    const line = PDFQuestionReading.pageLines(page).find((box) => Rects.contains(box, middle));
    if (!line) throw new Error("no line");
    return line;
  };

  it("picks the part of the row it lands on, anywhere on that row", () => {
    for (const letter of letters) {
      const part = find(`1(${letter})`);
      const label = part.labelBounds;
      const line = lineOf(label);
      for (const x of [Rects.minX(label) + 1, (Rects.maxX(label) + Rects.maxX(line)) / 2, Rects.maxX(line) + 6]) {
        const point = { x, y: Rects.midY(label) };
        expect(PDFQuestionReading.question(point, page)?.label, `1(${letter}) at ${x}`).toBe(part.label);
      }
    }
  });

  it("gives the gap between the columns to the nearer part", () => {
    const a = find("1(a)");
    const i = find("1(i)");
    const aLine = lineOf(a.labelBounds);
    const gap = Rects.minX(i.labelBounds) - Rects.maxX(aLine);
    const y = Rects.midY(a.labelBounds);
    expect(PDFQuestionReading.question({ x: Rects.maxX(aLine) + gap / 4, y }, page)?.label).toBe("1(a)");
    expect(PDFQuestionReading.question({ x: Rects.minX(i.labelBounds) - gap / 4, y }, page)?.label).toBe("1(i)");
    // The statement's line is the whole question.
    const stem = find("1");
    const point = { x: Rects.maxX(stem.labelBounds) + 40, y: Rects.midY(stem.labelBounds) };
    expect(PDFQuestionReading.question(point, page)?.label).toBe("1");
  });

  it("reads a grid part's area as its own row", () => {
    "abcdefg".split("").forEach((letter, index) => {
      const part = find(`1(${letter})`);
      const next = find(`1(${"bcdefgh"[index]})`);
      const area = PDFQuestionReading.questionArea(part, all, [], page);
      // Its own label, and nothing of the next row's.
      expect(Rects.contains(area, { x: Rects.midX(part.labelBounds), y: Rects.midY(part.labelBounds) })).toBe(true);
      expect(Rects.minY(area)).toBeGreaterThanOrEqual(Rects.midY(next.labelBounds));
      // Not across into the other column.
      expect(Rects.maxX(area)).toBeLessThan(270);
    });
  });

  it("reads a grid part alone with its statement", () => {
    const placement = { page, pageUnitsPerPoint: 1, tx: 0, ty: 0, residual: 0, anchors: 9 };
    const made = PDFQuestionReading.make(find("1(g)"), page, placement)!;
    expect(made.exam.text).toContain("Resolva");
    expect(made.exam.text).toContain("g)");
    expect(made.exam.text).not.toContain("h)");
    expect(made.exam.text).not.toContain("p)");
  });
});
