// Port of LearnLayer/Illustrations/IllustrationPrompt.swift @ ref 2026-11-04 (v22, word for word).

import { swiftSchema, swiftText, type JSONSchema } from "../prompts/swiftText";
import type { Part } from "../problems/problemSolution";
import { batch3PromptText } from "./batch3PromptText";

/** Asks the model for one illustration of an exam question, as an `Illustration`: the app draws and animates it. */
export const IllustrationPrompt = {
  version: swiftText("IllustrationPrompt", "version#0"),

  system(language: string): string {
    return swiftText("IllustrationPrompt", "system#0", {
      "PremadeFigure.batch3PromptText": batch3PromptText,
      language,
    });
  },

  user(groupText: string, part: Part, figure: string | null): string {
    let text = swiftText("IllustrationPrompt", "text#0", {
      groupText,
      "part.label": part.label,
      "part.asks": part.asks,
      'part.steps.joined(separator: " → ")': part.steps.join(" → "),
      "part.answer.text": part.answer.text,
    });
    if (figure) text += swiftText("IllustrationPrompt", "figure#0") + figure;
    return text;
  },

  schema: swiftSchema("IllustrationPrompt.schema") as JSONSchema,
  maxTokens: 8000,
};
