// Port of LearnLayer/Voice/VoiceTutorPrompt.swift @ ref 2026-11-04 (prompt v24, its user message, the focus note and
// the routing). The texts come word for word from the Swift (core/prompts/swift/VoiceTutorPrompt.json).

import { AISettings } from "../ai/modelRouting";
import { swiftSchema, swiftText, type JSONSchema } from "../prompts/swiftText";
import type { TutorLanguage } from "../problems/solutionRequest";

const text = (key: string, values?: Record<string, string>) => swiftText("VoiceTutorPrompt", key, values);

/** The pt-PT phrases of the prompt and what the English prompt says instead (`englishSwaps`). */
const englishSwaps: [string, string][] = Array.from({ length: 16 }, (_, pair) => [
  text(`englishSwaps#${pair * 2}`),
  text(`englishSwaps#${pair * 2 + 1}`),
]);

/** What a voice turn is about: the open question wins over a selection, and a selection over the page. */
export type VoiceTutorFocus =
  | { kind: "unspecified" }
  /** A question or formula is open: explain it, whatever else is on the page. */
  | { kind: "openItem" }
  /** Text selected in the reader. */
  | { kind: "selection" }
  /** Only a page is visible; `exerciseLabels` are the exercises detected on it. */
  | { kind: "page"; exerciseLabels: string[] };

/** One line for the user message, or null when nothing needs saying. */
export function focusNote(focus: VoiceTutorFocus): string | null {
  switch (focus.kind) {
    case "unspecified":
      return null;
    case "openItem":
      return text("note#1") + text("note#2");
    case "selection":
      return text("note#3") + text("note#4");
    case "page": {
      const labels = focus.exerciseLabels;
      if (labels.length > 1) {
        return (
          text("labels#0", { "labels.count": String(labels.length) }) +
          text("labels#1", { 'labels.joined(separator: ", ")': labels.join(", ") }) +
          text("labels#2")
        );
      }
      return text("labels#3");
    }
  }
}

const prefix = (value: string, count: number) => Array.from(value).slice(0, count).join("");
const suffix = (value: string, count: number) => Array.from(value).slice(-count).join("");

export const VoiceTutorPrompt = {
  version: text("version#0"),
  /** Added to the user message when the first reply was empty, unreadable, or a word or two. */
  retryNote: text("retryNote#0"),
  /** Added when the first reply used the whole token budget without an answer. */
  shortNote: text("shortNote#0"),
  continuationNote: text("continuationNote#0"),
  /** A whole step-by-step solution in pt-PT with up to eight marks is about 1 500 tokens. */
  initialMaxTokens: 4000,
  continuationMaxTokens: 1500,
  maxContinuations: 2,
  /** The Portuguese locale the tutor speaks. */
  tutorLocale: text("tutorLocale#0"),

  /** User text appended when resuming after a truncated reply. */
  continuationUser(partialJSON: string, language: TutorLanguage = "pt"): string {
    const note =
      language === "en"
        ? VoiceTutorPrompt.continuationNote.replace("Continue in pt-PT", "Continue in English")
        : VoiceTutorPrompt.continuationNote;
    return text("continuationUser#0", {
      'language == .en ? continuationNote.replacingOccurrences(of: "Continue in pt-PT", with: "Continue in English") : continuationNote':
        note,
      "String(partialJSON.suffix(4_000))": suffix(partialJSON, 4_000),
    });
  },

  /** Spoken aloud, in the student's language: English when `language` starts with "English", else pt-PT. */
  system(language: string): string {
    const portuguese = text("portugueseSystem#0");
    if (!language.toLowerCase().startsWith(text("pt#0"))) return portuguese;
    return englishSwaps.reduce((prompt, [from, to]) => prompt.replaceAll(from, to), portuguese);
  },

  user(options: {
    transcript: string;
    question: string;
    page: string;
    subject: string | null;
    questionLabel?: string | null;
    workContext?: string | null;
    focus?: VoiceTutorFocus;
    directive?: string | null;
  }): string {
    let message = text("message#0");
    if (options.subject) message += text("subject#0", { subject: options.subject });
    message += text("subject#1") + prefix(options.transcript, 2_000);
    const label = (options.questionLabel ?? "").trim();
    if (label !== "") message += text("label#1", { label });
    const question = options.question.trim();
    if (question !== "") message += text("question#0") + prefix(question, 8_000);
    const page = options.page.trim();
    message += page === "" ? text("page#0") : text("page#1") + prefix(page, 6_000);
    const note = focusNote(options.focus ?? { kind: "unspecified" });
    if (note) message += text("note#0") + note;
    const work = (options.workContext ?? "").trim();
    if (work !== "") message += text("work#1") + prefix(work, 10_000);
    if (options.directive) message += text("directive#0") + options.directive;
    return message;
  },

  schema: swiftSchema("VoiceTutorPrompt.schema") as JSONSchema,
};

/** Which model speaks: an open question keeps the route it was given; otherwise the written-solution rules. */
export const VoiceTutorRouting = {
  modelID: (needsStrongModel: boolean) => (needsStrongModel ? AISettings.strongModel : AISettings.defaultModel),
};
