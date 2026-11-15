// Port of LearnLayerTests/QuestionPagesTests.swift @ ref 2026-11-04, plus PageImage's geometry.

import { describe, expect, it } from "vitest";
import { PageImage } from "../pdf/pageImage";
import { documentTestPages } from "../testing/testPages";
import { questionsOn } from "./questionDetector";
import { QuestionPages } from "./questionPages";

describe("QuestionPages", () => {
  it("does not send the previous page again for a decimal group", () => {
    const pages = documentTestPages([
      "2.1. Determine o valor de a.\n2.2. Estude o sinal de f.",
      "2.3. Mostre que h tem um zero no intervalo.",
    ]);
    const page = pages[1]!;
    const question = questionsOn(page).find((q) => q.label === "2.3")!;
    expect(question.startsOnPreviousPage).toBe(true);
    const sent = QuestionPages.pages(question, page);
    expect(sent.map((p) => p.index)).toEqual([1]);
  });

  it("still sends the page of a named figure", () => {
    const pages = documentTestPages([
      "Figura 1 – o esquema\nUm circuito simples.",
      "2.1. Observe a Figura 1 e calcule a corrente.",
    ]);
    const page = pages[1]!;
    const question = questionsOn(page).find((q) => q.label === "2.1")!;
    const sent = QuestionPages.pages(question, page);
    expect(sent.length).toBe(2);
    expect(sent.some((p) => p.index === 0)).toBe(true);
  });

  it("keeps the previous page for a reading part", () => {
    const pages = documentTestPages([
      "I.1) Primeira pergunta sobre o texto.",
      "I.2) Segunda pergunta sobre o mesmo texto.",
    ]);
    const page = pages[1]!;
    const question = questionsOn(page).find((q) => q.label === "I.2")!;
    expect(question.startsOnPreviousPage).toBe(true);
    expect(QuestionPages.pages(question, page).length).toBe(2);
  });

  it("finds the figures, documents and texts a question names", () => {
    expect(QuestionPages.references("Observe as Figuras 1A e 1B e o documento 3.")).toEqual([
      { kind: "figure", number: 1 },
      { kind: "document", number: 3 },
    ]);
    expect(QuestionPages.references("Doc. 2, Texto 4")).toEqual([
      { kind: "document", number: 2 },
      { kind: "text", number: 4 },
    ]);
  });
});

describe("PageImage", () => {
  it("widens the crop to the page and keeps it under the pixel limit", () => {
    const crop = PageImage.crop(
      { x: 100, y: 400, width: 200, height: 100 },
      { x: 0, y: 0, width: 595, height: 842 },
      1100,
    )!;
    expect(crop.region).toEqual({ x: 0, y: 388, width: 595, height: 124 });
    expect(crop.scale).toBe(Math.min(2, 1100 / 595));
    expect(Math.max(crop.width, crop.height)).toBeLessThanOrEqual(1100);
    expect(PageImage.crop({ x: 0, y: 900, width: 10, height: 10 }, { x: 0, y: 0, width: 595, height: 842 })).toBeNull();
  });

  it("fits a picture only when it is too large", () => {
    expect(PageImage.fitted(800, 600, 1100)).toBeNull();
    expect(PageImage.fitted(2200, 1100, 1100)).toEqual({ width: 1100, height: 550 });
  });
});
