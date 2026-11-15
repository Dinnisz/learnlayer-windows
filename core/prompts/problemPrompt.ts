// Port of LearnLayer/Problems/ProblemPrompt.swift, the prompt rules of LearnLayer/Problems/QuestionTranscription.swift
// and LearnLayer/Problems/OptionFigures.swift, LearnLayer/Problems/QuestionClassifier.swift (its prompt and
// schema), LearnLayer/Problems/FigureTranscription.swift and the prompt of LearnLayer/Problems/FastTranscription.swift
// @ ref 2026-11-04. The texts are the Mac's own (core/prompts/swift); only the code that joins them is here.

import { looksFlattened } from "../problems/flattenedMath";
import { swiftSchema, swiftText, type JSONSchema } from "./swiftText";

// MARK: OptionFigures, QuestionTranscription

export const OptionFigures = {
  /** The prompt rule both the solver and the figure reader follow. */
  transcriptionRule: swiftText("OptionFigures", "transcriptionRule#0"),
};

const structureRule = swiftText("QuestionTranscription", "structureRule#0");

/** Hex of the SHA-256 of each image, joined by "|": which picture sets asked for a transcription. */
const requestedTranscriptions = new Set<string>();

export const QuestionTranscription = {
  /** Said in both prompts that read a question from a picture: the printed layout of a formula is its meaning. */
  structureRule,
  /** Added to the solve request when the question is read from its picture. */
  instruction: swiftText("QuestionTranscription", "instruction#0", { structureRule }),
  /** The JSON schema of one block of a transcribed question. */
  blockSchema: (swiftSchema("ProblemPrompt.schema") as { properties: { question: { anyOf: [{ items: JSONSchema }] } } })
    .properties.question.anyOf[0].items,

  /** Marks a set of page images as one whose question the solver must transcribe. `digest` is `imagesDigest(images)`. */
  request(digest: string) {
    requestedTranscriptions.add(digest);
  },

  isRequested(digest: string | null): boolean {
    return digest !== null && digest !== "" && requestedTranscriptions.has(digest);
  },
};

// MARK: The solve

/**
 * What the model is told when solving a group of exam questions, and the JSON schema its answer must follow.
 * The version is part of every saved answer's key, so Mac and Windows share answers to the same question.
 */
export const ProblemPrompt = {
  version: swiftText("ProblemPrompt", "version#0"),

  /**
   * Portuguese means the Portuguese of Portugal (the exams are IAVE's): cheaper models drift into Brazilian forms,
   * so they are named here.
   */
  languageRule(language: string): string {
    if (!language.toLowerCase().includes(swiftText("ProblemPrompt", "languageRule#0"))) {
      return swiftText("ProblemPrompt", "languageRule#1");
    }
    return swiftText("ProblemPrompt", "languageRule#2");
  },

  system(language: string): string {
    return swiftText("ProblemPrompt", "system#0", {
      language,
      "languageRule(language)": ProblemPrompt.languageRule(language),
      "OptionFigures.transcriptionRule": OptionFigures.transcriptionRule,
    });
  },

  user(groupText: string, labels: readonly string[], figureNote: string | null, transcribing = false): string {
    let message = swiftText("ProblemPrompt", "message#0") + groupText;
    if (labels.length > 0) {
      message += swiftText("ProblemPrompt", "message#1") + labels.join(swiftText("ProblemPrompt", "message#2"));
      message += swiftText("ProblemPrompt", "message#3");
    }
    if (figureNote) message += swiftText("ProblemPrompt", "figureNote#0") + figureNote;
    if (looksFlattened(groupText)) message += ProblemPrompt.flattenedFractionRule;
    if (transcribing) message += QuestionTranscription.instruction;
    return message;
  },

  /**
   * The text layer read «arcsen x 1+x2» for a fraction: the solver weighed both groupings at length (8 600 tokens
   * for one call). It takes the picture's grouping once and goes on.
   */
  flattenedFractionRule: swiftText("ProblemPrompt", "flattenedFractionRule#0"),

  /** The reply's budget: one part (the clicked one) needs far less room than a whole group. */
  maxTokens(labels: readonly string[]): number {
    return labels.length === 1 ? 7000 : 16000;
  },

  /** Thinking a solve may spend before its answer, for a model that thinks at all. */
  reasoningCap: 2000,

  schema: swiftSchema("ProblemPrompt.schema"),
};

// MARK: The question classifier

export const QuestionClassifier = {
  timeout: 20,
  maxTokens: 180,
  system: swiftText("QuestionClassifier", "systemPrompt#0"),
  schema: swiftSchema("QuestionClassifier.schema"),
  /** The group's text is cut to this many characters before it is sent. */
  maxTextCharacters: 3500,
};

// MARK: Reading a figure

/**
 * Reading a figure is the one thing that needs a strong model's eyes; it is cheap on its own. The transcription
 * then lets the fast model solve.
 */
export const FigureTranscription = {
  version: swiftText("FigureTranscription", "version#0"),
  system(language: string): string {
    return swiftText("FigureTranscription", "system#0", {
      language,
      "OptionFigures.transcriptionRule": OptionFigures.transcriptionRule,
    });
  },
  schema: swiftSchema("FigureTranscription.schema"),
  maxTokens: 5000,
};

// MARK: The fast transcription (the clicked question, typeset from its picture)

export const FastTranscription = {
  model: swiftText("FastTranscription", "model#0"),
  promptVersion: swiftText("FastTranscription", "promptVersion#0"),
  maxTokens: 1200,
  /** Seconds before the quickest provider is given up for any other, when no word has come. */
  timeout: 6,
  /** Seconds the placeholder waits for the fast reading at most. */
  placeholderLimit: 12,
  maxImagePixels: 1000,
  imageQuality: 0.7,
  prefetchWidth: 2,
  minimumRetry: 3,
  system: swiftText("FastTranscription", "system#0", { "QuestionTranscription.structureRule": structureRule }),
  schema: swiftSchema("FastTranscription.schema"),
  /** The user message that goes with the picture. */
  user: swiftText("OpenRouterClient", "ask#0"),
};
