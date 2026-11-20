// Port of LearnLayerTests/QuestionPickExamplesTests.swift @ 5701363: the questions a click picks on real worksheets
// Dinis tried (Tools/TestPDFs): labels the text layer stores on another question's line, parts in a grid, a group's
// statement clicked with its parts under it. Not ported: the Mac Roman degree sign (`GlyphFont`; pdf.js decodes the
// fonts itself), `textIsFlattened` (Windows decides the picture in `clickReading`), and the window picture's margin
// numbers (`QuestionLocator` reads a screenshot with Vision).

import { describe, expect, it } from "vitest";
import type { PageText } from "../pdf/page";
import { questionsOn } from "../problems/questionDetector";
import { QuestionSessionRules } from "../problems/questionSession";
import { pdfPages } from "../testing/testPages";
import { PDFQuestionReading, type PDFQuestionRead } from "./pdfQuestionRead";

const page = async (name: string): Promise<PageText> =>
  (await pdfPages(`referencia-mac/Tools/TestPDFs/${name}.pdf`))[0]!;

function read(label: string, on: PageText): PDFQuestionRead {
  const question = questionsOn(on).find((found) => found.label === label);
  if (!question)
    throw new Error(
      `missing ${label} in ${questionsOn(on)
        .map((found) => found.label)
        .join(", ")}`,
    );
  const made = PDFQuestionReading.make(question, on, {
    page: on,
    pageUnitsPerPoint: 1,
    tx: 0,
    ty: 0,
    residual: 0,
    anchors: 9,
  });
  if (!made) throw new Error(`no reading of ${label}`);
  return made;
}

const labelsOn = (on: PageText) => new Set(questionsOn(on).map((question) => question.label));

describe("the question a click picks", () => {
  it("takes four questions stored on one line for four questions", async () => {
    const sameLine = await page("same-line-labels");
    const labels = labelsOn(sameLine);
    for (const label of ["1", "2", "3", "4", "5", "6"]) expect(labels, [...labels].join(", ")).toContain(label);
    const first = read("1", sameLine);
    expect(first.exam.text).toContain("Evaluate");
    expect(first.exam.text).not.toContain("Let F");
  });

  it("keeps each part's own words when their labels are stored together", async () => {
    const dotted = await page("subparts-dotted");
    const labels = labelsOn(dotted);
    for (const label of ["1.1", "1.2", "5.1", "5.2"]) expect(labels, [...labels].join(", ")).toContain(label);
    const part = read("1.1", dotted);
    expect(part.exam.text).toContain("Determine as coordenadas");
    expect(part.exam.text).not.toContain("Indique");
    expect(read("5.2", dotted).exam.text).not.toContain("Página");
  });

  it("brings a group's statement with its parts, in order", async () => {
    const trig = read("5", await page("subparts-trig"));
    expect(trig.exam.text).toContain("período positivo mínimo");
    expect(trig.exam.text).toContain("contradomínio");
    const text = read("1", await page("subparts-dotted")).exam.text;
    const determine = text.indexOf("Determine as coordenadas");
    const indique = text.indexOf("Indique uma equação");
    expect(determine).toBeGreaterThanOrEqual(0);
    expect(indique).toBeGreaterThan(determine);
  });

  it("takes each part of a grid for its own", async () => {
    const gridA = await page("parts-grid-a");
    const labels = labelsOn(gridA);
    for (const label of ["3(a)", "3(b)", "3(d)", "3(f)", "3(i)"])
      expect(labels, [...labels].join(", ")).toContain(label);
    const b = read("3(b)", gridA);
    expect(b.exam.text).not.toContain("(e)");
    expect(b.exam.text).not.toContain("(h)");
    const grid = await page("parts-grid-b");
    expect(labelsOn(grid)).toContain("6(i)");
    const f = read("6(f)", grid);
    expect(f.exam.text).toContain("arcsen");
    expect(f.exam.text).not.toContain("arctg(x4)");
  });

  it("keeps the words of parts stored before them", async () => {
    // "(a) (b) Figure 1 … Find the maximum height … Find the range".
    const projectile = await page("projectile-parts");
    const labels = labelsOn(projectile);
    for (const label of ["3(a)", "3(b)", "4"]) expect(labels, [...labels].join(", ")).toContain(label);
    const a = read("3(a)", projectile);
    expect(a.exam.text).toContain("maximum height");
    expect(a.exam.text).not.toContain("horizontal range");
    const group = read("3", projectile).exam.text;
    expect(group.includes("maximum height") && group.includes("horizontal range")).toBe(true);
    expect(group).not.toContain("projectile is launched straight up");
  });

  it("sends the stanzas printed above a reading question with it", async () => {
    const made = read("1", await page("poem-reading"));
    expect(QuestionSessionRules.supportPassage(made.supportText, made.exam.groupText)).toContain(
      "Cessem do sábio Grego",
    );
  });
});
