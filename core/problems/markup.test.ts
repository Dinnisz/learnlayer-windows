// Port of boldMarksAreSetBoldNotShown and aPipeTableIsRowsOfCellsWithNoPipesOrRules (the markup half;
// LearnLayerTests/QuestionTranscriptionTests.swift @ ref 2026-11-04).

import { describe, expect, it } from "vitest";
import { markup } from "./markup";

describe("the model's Markdown is never shown as marks", () => {
  it("bold marks are set bold, not shown", () => {
    const found = markup("Recorrendo **ao método dos nós**, com **três** equações e $x**2$ ____.");
    expect(found.text).toBe("Recorrendo ao método dos nós, com três equações e $x**2$ ____.");
    expect(found.bold.map(([start, end]) => found.text.slice(start, end))).toEqual(["ao método dos nós", "três"]);
    expect(found.hasTable).toBe(false);
    expect(markup("Use **os sentidos das correntes definidos na figura.**").text).not.toContain("*");
  });

  it("a pipe table is rows of cells with no pipes or rules", () => {
    const found = markup("Cotações:\n| Problema | 5 a) | 6 |\n| --- | :---: | --- |\n| Cotação | 1,5 | 3 |");
    expect(found.hasTable).toBe(true);
    expect(found.text).toBe("Cotações:\nProblema\t5 a)\t6\nCotação\t1,5\t3");
    const bare = markup("| Problema | 5 a) |\n|---|---|\n| Cotação | 1,5 |");
    expect(bare.text).not.toContain("|");
    expect(bare.text).not.toContain("---");
  });
});
