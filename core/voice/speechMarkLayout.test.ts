// Port of the figure-or-formula cases of LearnLayerTests/FigureMarksTests.swift @ ref 2026-11-04
// (aPointLetterInsideASegmentNameIsThePoint, aTermTheFormulaDoesNotHoldGoesOnTheFigure), plus the cue word before a mark.

import { describe, expect, it } from "vitest";
import { SpeechMarkLayout } from "./speechMarkLayout";
import type { DrawingCommand, DrawingKind } from "./voiceTutorReply";

const command = (kind: DrawingKind, mentionUTF16: number | null = null): DrawingCommand => ({
  kind,
  segment: null,
  anchor: null,
  point: null,
  label: null,
  mentionUTF16,
  mentioned: null,
  mentionsUTF16: [],
});
const circle = (term: string) => command({ op: "circle", term } as DrawingKind);
const highlight = (term: string) => command({ op: "highlight", term } as DrawingKind);

describe("a mark on the figure or on the formula", () => {
  it("a point letter inside a segment's name is the point", () => {
    expect(SpeechMarkLayout.isPointInsideAName("C", String.raw`CB = \frac{\cos\alpha}{\sin\alpha}`)).toBe(true);
    expect(SpeechMarkLayout.isPointInsideAName("B", String.raw`A_{[BCD]} = \frac{CB \cdot h}{2}`)).toBe(true);
    // On its own somewhere in the formula, the letter is the formula's symbol.
    expect(SpeechMarkLayout.isPointInsideAName("C", String.raw`C = 2\pi r`)).toBe(false);
    expect(SpeechMarkLayout.isPointInsideAName("C", "CB + C = 3")).toBe(false);
    // Lower case and commands are never point names.
    expect(SpeechMarkLayout.isPointInsideAName("a", "ab = 2")).toBe(false);
    expect(SpeechMarkLayout.isPointInsideAName("D", String.raw`\Delta x = 3`)).toBe(false);
    expect(SpeechMarkLayout.isPointInsideAName("CB", "CB = 1")).toBe(false);
  });

  it("a term the formula does not hold goes on the figure", () => {
    const latex = String.raw`|q_{SO_4^{2-}}| = 2\,|q_{H^+}|`;
    expect(SpeechMarkLayout.namesSomethingElse(circle("(B)"), latex)).toBe(true);
    expect(SpeechMarkLayout.namesSomethingElse(circle("D"), "CB = 1")).toBe(true);
    expect(SpeechMarkLayout.namesSomethingElse(highlight("força é igual"), "F = ma")).toBe(false);
    expect(SpeechMarkLayout.namesSomethingElse(highlight("força"), "F = ma")).toBe(false);
    // A symbol of the formula stays there.
    expect(SpeechMarkLayout.namesSomethingElse(circle("a"), "F = m a")).toBe(false);
    expect(SpeechMarkLayout.namesSomethingElse(circle("C"), String.raw`C = 2\pi r`)).toBe(false);
    // No formula: nothing to keep it off.
    expect(SpeechMarkLayout.namesSomethingElse(circle("B"), "")).toBe(false);
    // Formulas and plots are never figure marks.
    expect(SpeechMarkLayout.namesSomethingElse(command({ op: "formula", latex: "x" } as DrawingKind), "x = 1")).toBe(
      false,
    );
  });

  it("a letter said after a figure word is the figure's, even when the formula holds it", () => {
    const spoken = "Olhamos para o ponto B da figura.";
    expect(
      SpeechMarkLayout.namesSomethingElse(
        command({ op: "circle", term: "B" } as DrawingKind, spoken.indexOf("B")),
        "B = 2",
        spoken,
      ),
    ).toBe(true);
    expect(SpeechMarkLayout.namesSomethingElse(circle("B"), "B = 2", spoken)).toBe(false);
  });

  it("a name of several letters written in a row is the formula's", () => {
    expect(SpeechMarkLayout.namesSomethingElse(circle("CB"), "CB = 1")).toBe(false);
    expect(SpeechMarkLayout.namesSomethingElse(circle("ma"), "F = m a")).toBe(false);
  });
});

describe("a mark that underlines the whole formula", () => {
  const said = (kind: DrawingKind, mentioned: string | null) => ({ ...command(kind, 0), mentioned });
  it("a phrase or a word the formula does not hold underlines it", () => {
    expect(
      SpeechMarkLayout.underlinesTheFormula(
        said({ op: "highlight", term: "força é igual" } as DrawingKind, "força"),
        "F = ma",
      ),
    ).toBe(true);
    expect(
      SpeechMarkLayout.underlinesTheFormula(said({ op: "highlight", term: "força" } as DrawingKind, "força"), "F = ma"),
    ).toBe(true);
    // A marker on an article means the formula.
    expect(
      SpeechMarkLayout.underlinesTheFormula(said({ op: "highlight", term: "lei" } as DrawingKind, "o"), "F = ma"),
    ).toBe(true);
  });

  it("a symbol it holds is ringed, and a figure label goes on the page", () => {
    expect(
      SpeechMarkLayout.underlinesTheFormula(said({ op: "circle", term: "a" } as DrawingKind, "a"), "F = m a"),
    ).toBe(false);
    expect(SpeechMarkLayout.underlinesTheFormula(said({ op: "circle", term: "D" } as DrawingKind, "D"), "CB = 1")).toBe(
      false,
    );
    // An unsaid mark on a word draws nothing; no formula, nothing to underline.
    expect(SpeechMarkLayout.underlinesTheFormula(circle("força"), "F = ma")).toBe(false);
    expect(
      SpeechMarkLayout.underlinesTheFormula(said({ op: "highlight", term: "força" } as DrawingKind, "força"), ""),
    ).toBe(false);
  });
});
