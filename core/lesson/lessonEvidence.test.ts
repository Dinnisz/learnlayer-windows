// Port of onALegibleQuestionQuotedWordsAreColouredAndOnlyValuesOrFiguresRinged and
// aSingleValueIsANumberWithItsUnitOrAShortSymbolNotWords (LearnLayerTests/MascotLessonTests.swift @ ref 2026-11-04).

import { describe, expect, it } from "vitest";
import { LessonEvidence } from "./lessonEvidence";

const mark = (op: string, quote: string | null, note: string | null = null, onFigure = false) => ({
  op,
  quote,
  note,
  onFigure,
});

describe("how a part of the question is marked where it stands", () => {
  it("on a legible question quoted words are coloured, and only values or figures ringed", () => {
    const run = "1000 € a 5% ao ano";
    // Words: tinted whichever verb the lesson used; never ringed or underlined.
    for (const op of ["zoom", "underline", "circle"]) {
      expect(LessonEvidence.inPlaceOp(mark(op, run), true)).toBe("tint");
      expect(LessonEvidence.inPlaceOp(mark(op, "local maxima and minima"), true)).toBe("tint");
    }
    // A lone value, or a part of a figure: ringed.
    for (const value of ["5%", "1000 €", "3 mA", "x", "R2", "f(x)", "x³"])
      expect(LessonEvidence.inPlaceOp(mark("zoom", value), true), value).toBe("circle");
    expect(LessonEvidence.inPlaceOp(mark("zoom", null, null, true), true)).toBe("circle");
    // A box the model ringed stays ringed; one it enlarged on words is coloured.
    expect(LessonEvidence.inPlaceOp(mark("circle", null), true)).toBe("circle");
    expect(LessonEvidence.inPlaceOp(mark("zoom", null), true)).toBe("tint");
    // Too small to read: words are underlined in place, a run of them is never ringed.
    expect(LessonEvidence.inPlaceOp(mark("circle", run), false)).toBe("underline");
    expect(LessonEvidence.inPlaceOp(mark("zoom", "5%"), false)).toBe("circle");
    // Other verbs are kept.
    for (const op of ["highlight", "crossOut", "arrow", "point"])
      expect(LessonEvidence.inPlaceOp(mark(op, run), true)).toBe(op);
  });

  it("a single value is a number with its unit or a short symbol, not words", () => {
    for (const value of ["5%", "1000 €", "3 mA", "12 V", "x", "R2", "f(x)", "x³", "Δt"])
      expect(LessonEvidence.isSingleValue(value), value).toBe(true);
    for (const words of ["1000 € a 5% ao ano", "local", "second derivative", "x³ −− 3x² −− 9x ++", "", "   "])
      expect(LessonEvidence.isSingleValue(words), words).toBe(false);
  });
});
