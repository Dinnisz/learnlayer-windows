// Port of LearnLayer/Problems/TextHelp.swift @ ref 2026-11-04 (the prompt, its context, the mock and the provider),
// and of VoiceTutorWorkContext.describe(part:), the written solution a follow-up answers from.

import { cacheKey, type DiskCache } from "../ai/diskCache";
import type { ModelClient } from "../ai/modelClient";
import { decodeFromContent } from "../ai/replyDecoding";
import { swiftSchema, swiftText } from "../prompts/swiftText";
import type { Part } from "./problemSolution";

/** Help with a selected passage: what it asks, a hint, and an explanation, from one request. */
export interface TextHelp {
  subject: string;
  asks: string;
  hint: string;
  explanation: string[];
  /** A curve, when one helps (drawn in phase 6). */
  graph: unknown;
  followUps: string[] | null;
}

export const TextHelpPrompt = {
  version: swiftText("TextHelp", "version#0"),
  system: (language: string) => swiftText("TextHelp", "system#0", { language }),
  user: (passage: string, context: string) => swiftText("TextHelp", "user#0", { passage, context }),
  schema: swiftSchema("TextHelpPrompt.schema"),
};

/** The context a follow-up sends, so the reply is about the question just asked and the part that is open. */
export const TextHelpContext = {
  followUp(options: {
    studentQuestion: string;
    exercise: string;
    partLabel: string;
    partAsks: string;
    partAnswer: string;
    solution?: string;
    /** The one step the question names ("explica o ponto 1"), from 1. */
    step?: { number: number; total: number; text: string } | null;
  }): string {
    let context = swiftText("TextHelp", "context#0", {
      studentQuestion: options.studentQuestion,
      exercise: options.exercise,
      partLabel: options.partLabel,
      partAsks: options.partAsks,
      partAnswer: options.partAnswer,
    });
    const solution = (options.solution ?? "").trim();
    if (solution !== "") {
      context += swiftText("TextHelp", "solution#0");
      context += Array.from(solution).slice(0, 8_000).join("");
    }
    const step = options.step;
    if (step) {
      context += swiftText("TextHelp", "step#0", {
        "step.number": String(step.number),
        "step.total": String(step.total),
        "step.text": step.text,
      });
    }
    return context;
  },
};

/** `VoiceTutorWorkContext.describe(part:)`: the part's solution as the student sees it, steps numbered from 1. */
export function describePart(part: Part): string[] {
  const lines = [`--- Part ${part.label} ---`, `Asks: ${part.asks}`];
  if (part.topic) lines.push(`Topic: ${part.topic}`);
  if (part.cards && part.cards.length > 0) {
    part.cards.forEach((card, index) => {
      lines.push(`Step ${index + 1}: ${card.title}`);
      if (card.note) lines.push(`  Why: ${card.note}`);
      if (card.latex !== "") lines.push(`  Formula: ${card.latex}`);
    });
  } else {
    part.steps.forEach((step, index) => lines.push(`Step ${index + 1}: ${step}`));
  }
  if (part.hint !== "") lines.push(`Hint: ${part.hint}`);
  lines.push(`Answer: ${part.answer.text}`);
  if (part.answerLatex) lines.push(`Answer (LaTeX): ${part.answerLatex}`);
  if (part.evidence && part.evidence.length > 0) {
    lines.push("Evidence quotes:");
    for (const item of part.evidence.slice(0, 6)) {
      const source = item.source ? ` (${item.source})` : "";
      lines.push(`  "${item.quote}"${source} — ${item.point}`);
    }
  }
  return lines;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** Tolerant decoding: missing strings are empty, a missing list is empty. */
export function decodeTextHelp(value: unknown): TextHelp {
  if (typeof value !== "object" || value === null) throw new Error("text help is not an object");
  const record = value as Record<string, unknown>;
  const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : "");
  const explanation = strings(record["explanation"]);
  if (explanation.length === 0 && text("asks") === "") throw new Error("text help is empty");
  return {
    subject: text("subject"),
    asks: text("asks"),
    hint: text("hint"),
    explanation,
    graph: record["graph"] ?? null,
    followUps: Array.isArray(record["followUps"]) ? strings(record["followUps"]) : null,
  };
}

/** The mock file is one kinematics reply: a follow-up is answered from its own question unless the file covers it. */
export const TextHelpMock = {
  studentQuestion(context: string): string | null {
    const index = context.indexOf("Student's question:");
    if (index < 0) return null;
    const line = context
      .slice(index + "Student's question:".length)
      .trim()
      .split(/\r\n|\n|\r/)[0]!
      .trim();
    return line === "" ? null : line;
  },

  keyed(canned: TextHelp, context: string): TextHelp {
    const question = TextHelpMock.studentQuestion(context);
    if (question === null || answers(canned, question)) return canned;
    return {
      subject: canned.subject,
      asks: question,
      hint: `Stay with this question: ${question}`,
      explanation: TextHelpMock.explanation(question),
      graph: null,
      followUps: [],
    };
  },

  explanation(question: string): string[] {
    const focus = TextHelpMock.distinctiveTerms(question).join(", ");
    return [
      `The question to answer is: ${question}`,
      focus === ""
        ? "Stay with this question; do not switch to another exercise."
        : `What matters here is ${focus}, from this part of the exercise.`,
      "Nothing else on the page answers it.",
    ];
  },

  /** Words that name what the question is about ("E_z", "axis"), not the question words themselves. */
  distinctiveTerms(question: string): string[] {
    const stop = new Set([
      "why",
      "does",
      "only",
      "the",
      "on",
      "a",
      "an",
      "of",
      "to",
      "and",
      "what",
      "how",
      "is",
      "in",
      "for",
      "this",
      "that",
      "with",
      "from",
      "do",
      "where",
      "when",
      "which",
      "survive",
      "por",
      "que",
      "como",
      "para",
      "uma",
      "uns",
      "das",
      "dos",
      "com",
      "não",
      "nao",
    ]);
    const terms: string[] = [];
    for (const token of question.split(/[^\p{L}\p{N}_]+/u)) {
      if (Array.from(token).length < 2 || stop.has(token.toLowerCase())) continue;
      if (!terms.some((term) => term.toLowerCase() === token.toLowerCase())) terms.push(token);
    }
    return terms;
  },
};

function answers(help: TextHelp, question: string): boolean {
  const terms = TextHelpMock.distinctiveTerms(question);
  if (terms.length === 0) return false;
  const body = [...help.explanation, help.asks, help.hint].join(" ").toLowerCase();
  const hits = terms.filter((term) => body.includes(term.toLowerCase()));
  return hits.length >= Math.min(2, terms.length);
}

/** Asks the default model for help with a passage (or a question about the exercise), saved in `passages.json`. */
export class TextHelpProvider {
  constructor(
    private readonly services: {
      passages: DiskCache<TextHelp>;
      client: () => ModelClient;
      /** `TutorLanguage.promptName`. */
      language: (question?: string) => string;
      /** Development: the Mac's MockTextHelp.json. */
      mock?: () => TextHelp;
      sleep?: (seconds: number) => Promise<void>;
    },
  ) {}

  /** The passage and its context are both in the key. */
  static cacheKey(passage: string, context: string, mock: boolean): Promise<string> {
    return cacheKey((mock ? "mock-" : "") + TextHelpPrompt.version, passage, context);
  }

  async help(passage: string, context: string, image: Uint8Array | null = null): Promise<TextHelp> {
    const mock = this.services.mock;
    const key = await TextHelpProvider.cacheKey(passage, context, mock !== undefined);
    return this.services.passages.script(key, async () => {
      if (mock) {
        await (
          this.services.sleep ?? ((seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1000)))
        )(0.4);
        return TextHelpMock.keyed(mock(), context);
      }
      const reply = await this.services.client().complete({
        system: TextHelpPrompt.system(this.services.language(`${context} ${passage}`)),
        user: TextHelpPrompt.user(passage, context),
        images: image ? [image] : [],
        schemaName: "passage",
        schema: TextHelpPrompt.schema,
      });
      return decodeFromContent(reply.content, decodeTextHelp);
    });
  }
}
