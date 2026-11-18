// Port of the "same formula, other notation" and "nothing re-written" tests of LearnLayerTests/MascotClickGuideTests.swift
// @ ref 2026-11-04 (VoiceCanvasPlan.isOnScreen and formulas).

import { describe, expect, it } from "vitest";
import { VoiceFormula } from "./voiceFormula";
import type { DrawingCommand } from "./voiceTutorReply";

const R = String.raw;
const on = (latex: string, screen: string) => VoiceFormula.isOnScreen(latex, [screen]);

describe("the same formula in another notation is on screen", () => {
  it("fractions match a slash", () => {
    expect(on(R`\frac{d}{t}`, "v = d/t")).toBe(true);
    expect(on("v = d/t", R`v = \frac{d}{t}`)).toBe(true);
    expect(on(R`\dfrac{a+b}{2}`, "m = (a+b)/2")).toBe(true);
  });

  it("multiplication signs match", () => {
    for (const screen of ["F = m · a", "F = m × a", "F = m*a", R`F=m\cdot a`, R`F = m \times a`])
      expect(on(R`F = m \cdot a`, screen), screen).toBe(true);
  });

  it("subscripts and superscripts match", () => {
    expect(on("v_0 = 12", "v₀ = 12")).toBe(true);
    expect(on("x^2 + 1", "y = x² + 1")).toBe(true);
    expect(on("x^{2}+1", "x^2 + 1")).toBe(true);
  });

  it("left, right and braces are ignored", () => {
    expect(on(R`\left( a + b \right)^2`, "(a+b)²")).toBe(true);
  });

  it("a decimal comma matches a point", () => {
    expect(on("t = 2.5", "t = 2,5 s")).toBe(true);
    expect(on("t = 2{,}5", "t = 2.5 s")).toBe(true);
  });

  it("unit spacing is ignored", () => {
    expect(on(R`a = 2\,\text{m/s}^2`, "a = 2 m/s²")).toBe(true);
    expect(on(R`v = 12 \mathrm{m/s}`, "v=12m/s")).toBe(true);
  });

  it("the sides of an equals match either way", () => {
    expect(on("22 = v", "v = 22")).toBe(true);
    expect(on("m a = F", "F = m a")).toBe(true);
    expect(on("v = 23", "v = 22")).toBe(false);
  });

  it("short formulas match only whole tokens", () => {
    expect(on("t", "durante t = 5 s")).toBe(true);
    expect(on("12", "v0 = 12 m/s")).toBe(true);
    expect(on("1", "v0 = 12 m/s")).toBe(false);
    expect(on("x", "max = 3")).toBe(false);
  });
});

describe("nothing re-written", () => {
  it("a formula already on screen is not written again", () => {
    const statement = "Um carro parte com v0 = 12 m/s e acelera com a = 2 m/s².";
    expect(on("v_0 = 12", statement)).toBe(true);
    expect(on("v_{0}=12", statement)).toBe(true);
    expect(on(R`v = 12 + 2 \cdot 5`, "Velocidade v = 12 + 2 · 5 = 22")).toBe(true);
    expect(on("v = v_0 + a t", statement)).toBe(false);
    // A lone symbol counts only as a whole token on screen.
    expect(on("a", statement)).toBe(true);
    expect(on("x", statement)).toBe(false);
    expect(on("v", statement)).toBe(false);

    const drawing: DrawingCommand[] = [
      {
        kind: { op: "formula", latex: "v = v_0 + a t" },
        segment: null,
        anchor: null,
        point: null,
        label: null,
        mentionUTF16: null,
        mentioned: null,
        mentionsUTF16: [],
      },
    ];
    // The formula the marks land on is in the statement: only the new one is written.
    const written = VoiceFormula.formulas(drawing, "v_0 = 12", new Set([0]), [statement]);
    expect(written).toHaveLength(1);
    expect(written.every((latex) => !on(latex, statement))).toBe(true);
    expect(VoiceFormula.formulas(drawing, "v_0 = 12", new Set([0]))).toHaveLength(2);
  });
});
