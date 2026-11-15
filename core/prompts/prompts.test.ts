// Ports @ ref 2026-11-04 of the prompt cases in LearnLayerTests: ModelRoutingTests
// (`portuguesePromptRulesOutBrazilianForms`), SolveScopeTests (the request and budget cases),
// FlattenedMathTests (`theTranscribingPromptsAskForLatexLayout`), plus checks that every interpolation of the
// Mac's prompts is filled.

import { describe, expect, it } from "vitest";
import {
  FastTranscription,
  FigureTranscription,
  OptionFigures,
  ProblemPrompt,
  QuestionClassifier,
  QuestionTranscription,
} from "./problemPrompt";
import { foundationJSON, interpolations } from "./swiftText";

describe("ProblemPrompt", () => {
  it("keeps the Mac's version, so Mac and Windows share saved answers", () => {
    expect(ProblemPrompt.version).toBe("33");
    expect(FigureTranscription.version).toBe("2");
    expect(FastTranscription.promptVersion).toBe("fq5");
  });

  it("the Portuguese prompt rules out Brazilian forms", () => {
    const system = ProblemPrompt.system("Portuguese (Portugal)");
    expect(system).toContain("European Portuguese");
    expect(system).toContain("você");
    expect(system).toContain("facto");
    expect(system).toContain("registra");
    expect(ProblemPrompt.system("English")).not.toContain("European Portuguese");
  });

  it("fills every interpolation of the system prompt", () => {
    expect(interpolations("ProblemPrompt", "system#0")).toEqual([
      "language",
      "languageRule(language)",
      "language",
      "language",
      "OptionFigures.transcriptionRule",
      "language",
    ]);
    const system = ProblemPrompt.system("English");
    expect(system).toContain("Write every text in English, keeping the exam's own notation");
    expect(system).toContain(OptionFigures.transcriptionRule);
    expect(system.startsWith("You are LearnLayer, a careful physics and maths tutor.")).toBe(true);
  });

  it("the request names only the asked labels and tells the model to ignore the rest", () => {
    const message = ProblemPrompt.user("1. Pergunta um.", ["1"], null);
    expect(message).toContain("Use exactly these labels for the parts, one part each: 1");
    expect(message).toContain("Answer only these");
    expect(ProblemPrompt.user("2. Q", ["2.1", "2.2"], null)).toContain("one part each: 2.1, 2.2.");
    expect(ProblemPrompt.user("2. Q", [], "Um circuito com R1.")).toContain(
      "\n\nWhat the figure shows, as described by the student:\nUm circuito com R1.",
    );
  });

  it("a part solve has a smaller budget and capped thinking", () => {
    expect(ProblemPrompt.maxTokens(["3(i)"])).toBe(7000);
    expect(ProblemPrompt.maxTokens(["3(i)", "3(ii)"])).toBe(16000);
    expect(ProblemPrompt.reasoningCap).toBe(2000);
  });

  it("a flattened fraction is read once from the picture", () => {
    const flattened = ProblemPrompt.user("3. Seja f(x) =\narcsen x 1+x2", ["3(i)"], null);
    expect(flattened).toContain(ProblemPrompt.flattenedFractionRule);
    expect(flattened).toContain("\\frac{\\arcsin x}{1+x^2}");
    expect(flattened).toContain("\\arcsin\\frac{x}{1+x^2}");
    const clean = ProblemPrompt.user("2.1. Calcule o limite da função no ponto a.", ["2.1"], null);
    expect(clean).not.toContain(ProblemPrompt.flattenedFractionRule);
    expect(QuestionTranscription.structureRule).toContain("explicit braces");
  });

  it("the transcribing prompts ask for LaTeX layout", () => {
    for (const prompt of [QuestionTranscription.instruction, FastTranscription.system]) {
      expect(prompt).toContain("\\sum_{k=1}^{n}");
      expect(prompt).toContain("\\begin{cases}");
      expect(prompt).toContain("\\frac");
    }
    expect(ProblemPrompt.user("Q", [], null, true).endsWith(QuestionTranscription.instruction)).toBe(true);
  });

  it("a transcription is asked only for the picture set that requested it", () => {
    expect(QuestionTranscription.isRequested("abc")).toBe(false);
    QuestionTranscription.request("abc");
    expect(QuestionTranscription.isRequested("abc")).toBe(true);
    expect(QuestionTranscription.isRequested(null)).toBe(false);
  });
});

describe("the schemas", () => {
  it("are the Mac's, with the shape strict mode needs", () => {
    const schema = ProblemPrompt.schema as {
      required: string[];
      properties: { parts: { items: { required: string[] } }; question: unknown; graph: unknown };
    };
    expect(schema.required).toEqual([
      "question",
      "subject",
      "figure",
      "parts",
      "checks",
      "graph",
      "needsFigure",
      "timing",
      "formulas",
      "drawing",
    ]);
    expect(schema.properties.parts.items.required).toContain("evidence");
    expect(QuestionTranscription.blockSchema).toMatchObject({ required: ["type", "text", "box", "caption"] });
    expect(QuestionClassifier.schema).toMatchObject({ required: ["kind", "needs_strong", "reason"] });
    expect(FigureTranscription.schema).toMatchObject({ required: ["figure"] });
  });

  it("are written as Foundation writes them: sorted keys, compact, slashes escaped", () => {
    expect(foundationJSON({ b: [1, { d: null, c: "a/b" }], a: true })).toBe(
      '{"a":true,"b":[1,{"c":"a\\/b","d":null}]}',
    );
  });
});
