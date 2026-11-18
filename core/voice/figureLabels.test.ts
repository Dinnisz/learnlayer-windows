// Port of the text cases of LearnLayerTests/FigureMarksTests.swift @ ref 2026-11-04 (labelsAreTriedInTheWaysAPageWritesThem,
// cueWordsBeforeAMarkMeanTheFigure, aLoneLabelWinsOverTheSameLetterInTheText, anOptionIsFoundWithItsBrackets,
// aLabelOutsideTheQuestionIsNotFound), on the page's text instead of a PDFKit page.

import { describe, expect, it } from "vitest";
import { FigureLabels } from "./figureLabels";

describe("a label on the question's figure", () => {
  it("labels are tried in the ways a page writes them", () => {
    const ion = FigureLabels.variants("H +");
    expect(ion.includes("H+") && ion.includes("H⁺") && ion.includes("H")).toBe(true);
    expect(ion.indexOf("H⁺")).toBeLessThan(ion.indexOf("H"));
    const sulfate = FigureLabels.variants("SO4");
    expect(sulfate.includes("SO₄") && sulfate.includes("SO")).toBe(true);
    expect(FigureLabels.variants("SO42-")).toContain("SO₄²⁻");
    const option = FigureLabels.variants("(B)");
    expect(option[0]).toBe("(B)");
    expect(option.includes("B)") && option.includes("B")).toBe(true);
    expect(FigureLabels.variants("alfa")).toContain("α");
    expect(FigureLabels.variants("\\alpha")).toContain("α");
    expect(FigureLabels.variants("  ")).toEqual([]);
  });

  it("cue words before a mark mean the figure", () => {
    const spoken = "Olhamos para o ponto B e para o ângulo alfa, e para a fórmula a.";
    expect(FigureLabels.saidAboutTheFigure(spoken, spoken.indexOf("B e"))).toBe(true);
    expect(FigureLabels.saidAboutTheFigure(spoken, spoken.indexOf("alfa"))).toBe(true);
    expect(FigureLabels.saidAboutTheFigure(spoken, spoken.indexOf("a."))).toBe(false);
    expect(FigureLabels.saidAboutTheFigure(spoken, null)).toBe(false);
  });

  const page = [
    "3. Na figura, o triângulo [ABC] é retângulo em C e a opção certa é",
    "(A) 2   (B) 3",
    "A",
    "C   B",
    "4. Outra pergunta sobre D.",
  ].join("\n");
  const inQuestion = (start: number) => start < page.indexOf("4.");

  it("a lone label wins over the same letter in the text", () => {
    const c = FigureLabels.range("C", page, inQuestion)!;
    expect(page.slice(0, c[0]).split("\n")).toHaveLength(4);
    const b = FigureLabels.range("B", page, inQuestion)!;
    expect(page.slice(0, b[0]).split("\n")).toHaveLength(4);
  });

  it("an option is found with its brackets", () => {
    const option = FigureLabels.range("(B)", page, inQuestion)!;
    expect(page.slice(option[0], option[1])).toBe("(B)");
  });

  it("a label outside the question is not found", () => {
    expect(FigureLabels.range("D", page, inQuestion)).toBeNull();
    expect(FigureLabels.range("Z", page, () => true)).toBeNull();
  });
});
