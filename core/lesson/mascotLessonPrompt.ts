// Port of LearnLayer/Lesson/MascotLessonPrompt.swift @ ref 2026-11-04 (prompt v14): the mascot teaches from the
// written solution on screen, line by line, in its own words, pointing at the solution's lines and at the question.
// The texts come word for word from the Swift (core/prompts/swift/MascotLessonPrompt.json).

import { swiftSchema, swiftText, type JSONSchema } from "../prompts/swiftText";
import type { TutorLanguage } from "../problems/solutionRequest";

const text = (key: string, values?: Record<string, string>) => swiftText("MascotLessonPrompt", key, values);
const prefix = (value: string, count: number) => Array.from(value).slice(0, count).join("");

const englishSwaps: [string, string][] = Array.from({ length: 5 }, (_, pair) => [
  text(`englishSwaps#${pair * 2}`),
  text(`englishSwaps#${pair * 2 + 1}`),
]);

export const MascotLessonPrompt = {
  version: text("version#0"),
  maxTokens: 5000,

  system(language: TutorLanguage): string {
    const portuguese = text("portuguese#0");
    if (language !== "en") return portuguese;
    return englishSwaps.reduce((prompt, [from, to]) => prompt.replaceAll(from, to), portuguese);
  },

  user(options: {
    doubt: string | null;
    question: string;
    /** Each option's text by its letter, when the options are written out. */
    options: Readonly<Record<string, string>>;
    optionLetters: readonly string[];
    subject: string | null;
    work: string | null;
    hasPicture: boolean;
    hasStatementPicture?: boolean;
    figureLabels?: readonly string[];
    figure3D?: string | null;
  }): string {
    let message = "";
    if (options.subject) message += text("subject#0", { subject: options.subject });
    const asked = (options.doubt ?? "").trim();
    message += text("asked#1");
    message += asked === "" ? text("asked#2") : prefix(asked, 1_000);
    message += text("asked#3") + prefix(options.question, 6_000);
    if (options.optionLetters.length > 0) {
      message += text("asked#4") + options.optionLetters.join(text("asked#5")) + text("asked#6");
      const written = options.optionLetters.flatMap((letter) =>
        options.options[letter] === undefined ? [] : [text("written#0", { letter, $0: options.options[letter]! })],
      );
      message += written.length > 0 ? text("written#1") + written.join(text("written#2")) : text("written#3");
    }
    const labels = options.figureLabels ?? [];
    if (labels.length > 0) message += text("written#4") + labels.join(text("written#5"));
    message += options.hasPicture ? text("written#6") : text("written#7");
    if (options.hasPicture && options.hasStatementPicture) message += text("written#8");
    const figure3D = options.figure3D ?? "";
    if (figure3D !== "") {
      message += text("figure3D#0") + figure3D;
      for (let piece = 1; piece <= 9; piece += 1) message += text(`figure3D#${piece}`);
    }
    const shown = (options.work ?? "").trim();
    message += shown === "" ? text("shown#1") : text("shown#2") + prefix(shown, 8_000);
    return message;
  },

  schema: swiftSchema("MascotLessonPrompt.schema") as JSONSchema,
};
