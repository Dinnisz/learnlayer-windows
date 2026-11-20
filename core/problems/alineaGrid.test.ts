// Port of the detector cases of LearnLayerTests/AlineaGridTests.swift @ 5701363: a sheet of exercises whose parts
// a)–q) are set in two columns under one statement (CDI sheet 1, «Resolva as seguintes equações e inequações:»):
// every part is found with the statement. The Mac draws the page with CoreText in Times 11 on a 520 × 500 page;
// here the same lines are laid at the same baselines. The click and area cases (PDFQuestionRead.question(at:),
// questionArea, gridRowBand) are ported with the PDF reading.

import { describe, expect, it } from "vitest";
import { drawnTestPage } from "../testing/testPages";
import { inLetterSequence, inRomanSequence, questionsOn } from "./questionDetector";

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
