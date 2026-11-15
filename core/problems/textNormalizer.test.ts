// TextNormalizer.swift has no test class of its own on the Mac. These are its cases from
// FigureTopicTests, FlattenedMathTests and QuestionDetectorTests @ ref 2026-11-04, plus the
// accent repair the file exists for.

import { describe, expect, it } from "vitest";
import { mathLettersToPlain, normalizeText, symbolFontOhms, unsafeCharacters } from "./textNormalizer";

describe("TextNormalizer", () => {
  it("joins spacing accents to their letters, across a line break", () => {
    expect(normalizeText("Dura¸c˜ao")).toBe("Duração");
    expect(normalizeText("el´ectrica")).toBe("eléctrica");
    expect(normalizeText("´\nE")).toBe("É");
    expect(normalizeText("a ´\nE")).toBe("a É");
    // A stray accent with nowhere valid to sit is dropped.
    expect(normalizeText("´P x")).toBe("P x");
    expect(normalizeText("fim ´")).toBe("fim ");
    expect(normalizeText("´ı")).toBe("í");
  });

  it("reads mathematical italic letters as plain letters and keeps other maths", () => {
    expect(mathLettersToPlain("𝑓(𝐴, 𝐵) = 𝑅𝑎𝑏")).toBe("f(A, B) = Rab");
    expect(mathLettersToPlain("x² ½ x₁")).toBe("x² ½ x₁");
  });

  it("symbol-font ohms are read back only about resistance (FigureTopicTests)", () => {
    expect(symbolFontOhms("visto dos terminais a e b\n1 kW\n1,5 kW")).toBe("visto dos terminais a e b\n1 kΩ\n1,5 kΩ");
    expect(symbolFontOhms("A resistência de 10 Ω dissipa 5 W.")).toBe("A resistência de 10 Ω dissipa 5 W.");
    expect(symbolFontOhms("Uma lâmpada de 60 W.")).toBe("Uma lâmpada de 60 W.");
  });

  it("one gate catches characters plain text can't carry (FlattenedMathTests)", () => {
    // A phasor's combining overline, a Symbol-font Private Use µ as stored: unsafe.
    expect(unsafeCharacters("V\u0305a")).not.toEqual([]);
    expect(unsafeCharacters("\uF06D")).not.toEqual([]);
    // Normalized, the Symbol code is its letter and the T1 ligature code is spelled: safe.
    expect(normalizeText("\uF06D")).toBe("μ");
    expect(unsafeCharacters(normalizeText("\uF06D"))).toEqual([]);
    expect(normalizeText("Justi\u001Cque")).toBe("Justifique");
    expect(unsafeCharacters(normalizeText("\u001C"))).toEqual([]);
    // Portuguese accents and ordinary maths signs are safe, before and after normalizing.
    expect(unsafeCharacters("Duração ±2 µF −3 kΩ")).toEqual([]);
    expect(unsafeCharacters(normalizeText("Duração ±2 µF −3 kΩ"))).toEqual([]);
    // Invisible characters go.
    expect(normalizeText("a\u200Bb\uFEFFc\u00ADd")).toBe("abcd");
  });

  it("ligature codes are spelled out (QuestionDetectorTests)", () => {
    expect(normalizeText("Justi\u001Cque todas as respostas")).toBe("Justifique todas as respostas");
    expect(normalizeText("um \u001Co condutor \u001Cno")).toBe("um fio condutor fino");
    expect(normalizeText("Grupo IV \u0015 Lei de Gauss")).toBe("Grupo IV – Lei de Gauss");
    expect(normalizeText("e\uFB03ciente")).toBe("eficiente".replace("fi", "ffi"));
  });
});
