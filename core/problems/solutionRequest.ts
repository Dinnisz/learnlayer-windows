// Port of the solve calls of LearnLayer/AI/OpenRouterClient.swift (`solution`, `streamedSolution`) and of
// LearnLayer/Settings/TutorLanguage.swift @ ref 2026-11-04. Which model, the escalation to the stronger one and
// the cache around these calls are the question session's (phase 3).

import { ModelError, type CompleteRequest, type ModelClient } from "../ai/modelClient";
import { decodeFromContent } from "../ai/replyDecoding";
import { ProblemPrompt } from "../prompts/problemPrompt";
import { decodeProblemSolution, type ProblemSolution } from "./problemSolution";

/** The tutor's language: Settings' choice, else European Portuguese unless the system's first language is English. */
export type TutorLanguage = "pt" | "en";

export const TutorLanguage = {
  settingKey: "appLanguage",
  /** `setting` is the stored Settings value ("", "en", "pt-PT"). */
  resolve(setting: string | null, preferred: readonly string[]): TutorLanguage {
    if (setting === "en") return "en";
    if (setting === "pt-PT") return "pt";
    const first = (preferred[0] ?? "pt-PT").toLowerCase();
    return first.startsWith("en") ? "en" : "pt";
  },
  /** Speech recognition and the voice. */
  locale(language: TutorLanguage): string {
    return language === "pt" ? "pt-PT" : "en-US";
  },
  /** How a prompt names it. */
  promptName(language: TutorLanguage): string {
    return language === "pt" ? "Portuguese (Portugal)" : "English";
  },
};

/**
 * How long a solution asked without streaming may take. Nothing arrives until the whole answer is written, and
 * Sonnet thinking over a page image took longer than the 90 s of other calls.
 */
export const plainSolutionTimeout = 180;

export interface SolveOptions {
  groupText: string;
  labels: readonly string[];
  figureNote: string | null;
  images: readonly Uint8Array[];
  /** `TutorLanguage.promptName`. */
  language: string;
  /** The solver must transcribe the question from its picture (`QuestionTranscription.isRequested`). */
  transcribing: boolean;
  signal?: AbortSignal;
}

function request(options: SolveOptions): CompleteRequest {
  return {
    system: ProblemPrompt.system(options.language),
    user: ProblemPrompt.user(options.groupText, options.labels, options.figureNote, options.transcribing),
    images: options.images,
    // Thinking (for models that require it), cards and checks all come out of this budget; a cut-off answer can't
    // be read at all.
    schemaName: "solution",
    schema: ProblemPrompt.schema,
    maxTokens: ProblemPrompt.maxTokens(options.labels),
    reasoningCap: ProblemPrompt.reasoningCap,
    signal: options.signal,
  };
}

/** A worked solution for a group of exam questions, asked whole. */
export async function solution(
  client: ModelClient,
  options: SolveOptions,
): Promise<{ solution: ProblemSolution; cost: number }> {
  const reply = await client.complete({ ...request(options), timeout: plainSolutionTimeout });
  return { solution: decodeFromContent(reply.content, decodeProblemSolution), cost: reply.cost };
}

/**
 * The same, streamed: `onContent` gets the reply so far as it arrives (see `PartialJSON`). A reply that ends
 * unreadable is a stream failure, so the caller can ask again without streaming.
 */
export async function streamedSolution(
  client: ModelClient,
  options: SolveOptions & { onContent: (content: string) => void; onThinking?: () => void },
): Promise<{ solution: ProblemSolution; cost: number }> {
  const reply = await client.complete({
    ...request(options),
    onContent: options.onContent,
    onThinking: options.onThinking,
  });
  try {
    return { solution: decodeFromContent(reply.content, decodeProblemSolution), cost: reply.cost };
  } catch {
    // Asking again is the second charge; a repaired card does not reach this catch.
    throw new ModelError({ kind: "stream", reason: "ended unreadable" });
  }
}
