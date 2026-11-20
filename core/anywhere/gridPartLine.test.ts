// Port of PartStemReadTests.aGridPartKeepsItsWholeLineWhenTheLabelUnderItIsStretchedUp @ 5701363: FichaCDI-I Cap3,
// 6(e)/(f)/(g). «(g) ln(arccos(1/√x))» has a tall bracket, so the PDF's box for «(g)» reaches up to 678.9, into the
// line of «(f) (e^{2x} + arcsen(2x))^8» whose own box starts at 676.9.
import { describe, expect, it } from "vitest";
import type { Rect } from "../pdf/page";
import type { ExamQuestion } from "../problems/questionDetector";
import { PDFQuestionReading } from "./pdfQuestionRead";

function part(label: string, labelBounds: Rect): ExamQuestion {
  return {
    label: `6(${label})`,
    group: "6",
    pageIndex: 1,
    labelBounds,
    bounds: { x: labelBounds.x - 6, y: labelBounds.y - 2, width: 120, height: labelBounds.height + 4 },
    text: `(${label})`,
    groupText: "",
    groupLabels: [],
    groupBounds: null,
    startsOnPreviousPage: false,
    statementBounds: null,
    statementPageIndex: null,
  };
}

describe("a grid part", () => {
  it("keeps its whole line when the label under it is stretched up", () => {
    const all = [
      part("e", { x: 254.7, y: 694.4, width: 13.3, height: 11.6 }),
      part("f", { x: 255.4, y: 676.9, width: 23.1, height: 13.8 }),
      part("g", { x: 254.1, y: 660.7, width: 13.9, height: 18.2 }),
    ];
    const area = PDFQuestionReading.questionArea(all[1]!, all);
    // The whole line of (f), down to the bottom of its own label…
    expect(area.y).toBeLessThanOrEqual(676.9);
    expect(area.y + area.height).toBeGreaterThanOrEqual(690.7);
    // …and not the line of (g), whose glyphs end near 672.
    expect(area.y).toBeGreaterThan(672);
  });
});
