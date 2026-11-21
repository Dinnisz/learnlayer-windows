// Live test 2026-11-21: an Alt-click a few points above the line of «2.2.» (in the leading between 2.1 and 2.2) opened
// 2.1. A click in the half line above a label is on that label's line.

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { questionsOn } from "../problems/questionDetector";
import { pdfPages } from "../testing/testPages";
import { PDFQuestionReading } from "./pdfQuestionRead";

const exam = "exames/EX-MatA635-F1-2026_net.pdf";

describe.skipIf(!existsSync(exam))("a click just above a label", () => {
  it("opens that label's question, not the one above it", async () => {
    const page = (await pdfPages(exam))[2]!;
    const labels = questionsOn(page);
    for (const label of ["2.2", "2.3"]) {
      const question = labels.find((found) => found.label === label)!;
      const top = question.labelBounds.y;
      const x = question.labelBounds.x + 80;
      expect(PDFQuestionReading.question({ x, y: top - 3 }, page)?.label, label).toBe(label);
      expect(PDFQuestionReading.question({ x, y: top + 2 }, page)?.label, label).toBe(label);
    }
    // Well inside the question above, it is still that one.
    const first = labels.find((found) => found.label === "2.1")!;
    expect(PDFQuestionReading.question({ x: first.labelBounds.x + 80, y: first.labelBounds.y + 4 }, page)?.label).toBe(
      "2.1",
    );
  });
});
