// Port of LearnLayerTests/QuestionSupportTextTests.swift @ ref 2026-11-04: a reading question gets the text printed
// above it; a self-contained one is sent as it was.

import { describe, expect, it } from "vitest";
import { PDFQuestionReading } from "../anywhere/pdfQuestionRead";
import type { SolutionProvider } from "./solutionProvider";
import type { ExamQuestion } from "./questionDetector";
import { QuestionSession, QuestionSessionRules } from "./questionSession";

const page = [
  "GRUPO I",
  "Leia o poema de Cesário Verde.",
  "Nas nossas ruas, ao anoitecer,",
  "Há tal soturnidade, há tal melancolia,",
  "E as varinas, hercúleas, galhofeiras,",
  "Descalças! Nas descargas de carvão,",
  "1. Explique o sentido da primeira estrofe.",
  "4. Identifique o recurso expressivo no verso 3.",
  "5. Caracterize a forma como o sujeito poético descreve as varinas.",
].join("\n");

function question(label: string, text: string): ExamQuestion {
  const zero = { x: 0, y: 0, width: 0, height: 0 };
  return {
    label,
    group: label,
    pageIndex: 0,
    labelBounds: zero,
    bounds: zero,
    text,
    groupText: text,
    groupLabels: [label],
    groupBounds: null,
    startsOnPreviousPage: false,
    statementBounds: null,
    statementPageIndex: null,
  };
}

const opened = (asked: ExamQuestion, supportText: string | null) =>
  new QuestionSession(
    { question: asked, supportText },
    { provider: {} as SolutionProvider, config: () => "cheapFirst", subject: "" },
  );

describe("the text printed above a reading question", () => {
  it("a question about the poem is sent with the poem", () => {
    const text = "5. Caracterize a forma como o sujeito poético descreve as varinas.";
    const support = PDFQuestionReading.textBefore("5", text, page)!;
    expect(support).toContain("E as varinas, hercúleas, galhofeiras,");
    expect(support).not.toContain("sujeito poético");
    const session = opened(question("5", text), support);
    expect(session.requestText.startsWith(text)).toBe(true);
    expect(session.requestText).toContain("Texto de apoio");
    expect(session.requestText).toContain("Nas nossas ruas, ao anoitecer,");
    expect(session.requestText).toContain("Descalças! Nas descargas de carvão,");
    // What the question shows is its own text.
    expect(session.question.text).toBe(text);
  });

  it("the label finds the question when its first line is short", () => {
    const support = PDFQuestionReading.textBefore("4", "4.", page)!;
    expect(support).toContain("Descalças!");
    expect(support).not.toContain("recurso expressivo");
  });

  it("a maths question is sent unchanged", () => {
    const text = "2. Resolva a equação x^2 - 5x + 6 = 0 e indique as soluções.";
    expect(opened(question("2", text), page).requestText).toBe(text);
  });

  it("a passage already in the group is not sent twice", () => {
    expect(QuestionSessionRules.supportPassage(page.slice(0, 120), page)).toBeNull();
  });

  it("text references are recognised", () => {
    expect(QuestionSessionRules.refersToText("Explique o sentido dos versos 3 e 4.")).toBe(true);
    expect(QuestionSessionRules.refersToText("Segundo o texto, qual é a intenção do autor?")).toBe(true);
    expect(QuestionSessionRules.refersToText("Transcreva da linha 12 a expressão.")).toBe(true);
    expect(QuestionSessionRules.refersToText("What does the speaker feel in lines 3-5?")).toBe(true);
    expect(QuestionSessionRules.refersToText("Calcule a resistência equivalente do circuito.")).toBe(false);
    expect(QuestionSessionRules.refersToText("Determine o limite de f(x) quando x tende para 2.")).toBe(false);
  });
});
