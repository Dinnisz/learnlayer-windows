// Port of optionsInAGridShareRowsLeftToRight and aWideGapInOneLineOfTextIsNotAGrid (LearnLayerTests/
// LocalTranscriberTests.swift @ ref 2026-11-04), on lines as the Windows recogniser gives them.

import { describe, expect, it } from "vitest";
import { transcribeLines, type LayoutLine } from "./localTranscriber";

const line = (text: string, x: number, y: number, width: number, height = 0.05): LayoutLine => ({
  text,
  rect: { x, y, width, height },
});

describe("a question read on the computer alone, laid out from where its lines are", () => {
  it("options in a grid share rows, left to right", () => {
    const blocks = transcribeLines([
      line("Qual ponto?", 0.05, 0.05, 0.2),
      // The recogniser reads each column of a grid as its own line.
      line("(A) Ponto", 0.05, 0.4, 0.15),
      line("(B) Ponto", 0.5, 0.4, 0.15),
      line("(C) Ponto", 0.05, 0.6, 0.15),
      line("(D) Ponto", 0.5, 0.6, 0.15),
    ]);
    expect(blocks.slice(1).map((block) => block.text)).toEqual(["(A) Ponto", "(B) Ponto", "(C) Ponto", "(D) Ponto"]);
  });

  it("a wide gap in one line of text is not a grid", () => {
    expect(transcribeLines([line("Calcule a corrente", 0.05, 0.1, 0.62)])).toHaveLength(1);
    // Two pieces of one line far apart, neither an option: still one line.
    expect(transcribeLines([line("Calcule", 0.05, 0.1, 0.1), line("a corrente", 0.5, 0.1, 0.15)])).toHaveLength(1);
  });

  it("a wrapped sentence is one paragraph, a new item starts another", () => {
    const blocks = transcribeLines([
      line("Considere a função f definida", 0.05, 0.1, 0.6),
      line("em R por f(x) = 2x.", 0.05, 0.16, 0.4),
      line("1. Determine f(3).", 0.05, 0.3, 0.4),
    ]);
    expect(blocks.map((block) => block.text)).toEqual([
      "Considere a função f definida em R por f(x) = 2x.",
      "1. Determine f(3).",
    ]);
  });

  it("a misread option letter continues the sequence, and circuit units are repaired", () => {
    const blocks = transcribeLines([
      line("No circuito, R1 = 4 kQ", 0.05, 0.05, 0.4),
      line("(A) 2 kQ", 0.05, 0.4, 0.15),
      line("(0) 3 kQ", 0.35, 0.4, 0.15),
      line("(C) 4 kQ", 0.65, 0.4, 0.15),
    ]);
    expect(blocks.map((block) => block.text)).toEqual([
      String.raw`No circuito, $R_{1} = 4\,\mathrm{k}\Omega$`,
      "(A) 2 kΩ",
      "(B) 3 kΩ",
      "(C) 4 kΩ",
    ]);
    // With one option read, the row is one line with wide gaps, as on the Mac.
    expect(transcribeLines([line("(A) 2", 0.05, 0.4, 0.1), line("(0) 3", 0.5, 0.4, 0.1)])).toHaveLength(1);
  });
});
