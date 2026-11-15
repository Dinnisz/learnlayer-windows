// Port of OpenRouterClient.voiceTurn (LearnLayer/AI/OpenRouterClient.swift) and VoiceTutorReply.merged @ ref
// 2026-11-04: one spoken turn — the first call, one retry for a reply that cannot be spoken, and up to two
// continuations for a reply cut off at the token limit. Separate from the network so a recorded reply can be replayed.

import { ModelError, type ModelClient } from "../ai/modelClient";
import type { TutorLanguage } from "../problems/solutionRequest";
import { VoiceTutorPrompt } from "./voiceTutorPrompt";
import { VoiceTutorReplies, type VoiceTutorReply } from "./voiceTutorReply";

/** A continuation's words and marks after the reply so far. */
export function merged(reply: VoiceTutorReply, next: VoiceTutorReply): VoiceTutorReply {
  let spoken = reply.spoken;
  let modelSpoken = reply.modelSpoken;
  if (next.spoken !== "") {
    spoken += (spoken === "" || spoken.endsWith(" ") ? "" : " ") + next.spoken;
    modelSpoken += (modelSpoken === "" || modelSpoken.endsWith(" ") ? "" : " ") + next.modelSpoken;
  }
  return { ...reply, spoken, modelSpoken, drawing: [...reply.drawing, ...next.drawing] };
}

/** `send` returns the model's content, or throws a `cutOff` failure carrying what arrived. */
export type VoiceSend = (user: string, maxTokens: number) => Promise<string>;

const decodeQuietly = (content: string): VoiceTutorReply | null => {
  try {
    return VoiceTutorReplies.decode(content);
  } catch {
    return null;
  }
};

export async function voiceTurn(
  user: string,
  send: VoiceSend,
  language: TutorLanguage = "pt",
): Promise<VoiceTutorReply> {
  let lastContent = "";
  let cut = false;
  let accumulated: VoiceTutorReply | null = null;
  const call = async (text: string, maxTokens: number) => {
    cut = false;
    try {
      lastContent = await send(text, maxTokens);
    } catch (error) {
      if (error instanceof ModelError && error.failure.kind === "cutOff") {
        cut = true;
        lastContent = error.failure.partial;
      } else if (error instanceof ModelError && error.failure.kind === "emptyReply") {
        lastContent = "";
      } else {
        throw error;
      }
    }
    return lastContent;
  };

  let note: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const content = await call(note ? user + "\n\n" + note : user, VoiceTutorPrompt.initialMaxTokens);
    if (cut) {
      // Cut off with nothing to speak (the budget went before the answer): ask again, shorter.
      const partial = decodeQuietly(lastContent);
      if (partial && partial.spoken !== "") {
        accumulated = partial;
        break;
      }
      note = VoiceTutorPrompt.shortNote;
      continue;
    }
    const reply = decodeQuietly(content);
    if (reply && !VoiceTutorReplies.isDegenerate(reply.spoken)) return reply;
    note = VoiceTutorPrompt.retryNote;
  }
  if (!accumulated) {
    const partial = decodeQuietly(lastContent);
    if (!cut && partial && partial.spoken !== "") return partial;
    throw new ModelError(
      cut
        ? { kind: "cutOff", tokens: VoiceTutorPrompt.initialMaxTokens, partial: lastContent }
        : lastContent === ""
          ? { kind: "emptyReply", raw: "" }
          : { kind: "unreadableReply", raw: lastContent },
    );
  }
  for (let round = 0; round < VoiceTutorPrompt.maxContinuations; round += 1) {
    const content = await call(
      user + "\n\n" + VoiceTutorPrompt.continuationUser(lastContent, language),
      VoiceTutorPrompt.continuationMaxTokens,
    );
    const next = decodeQuietly(content);
    if (!cut) return next && !VoiceTutorReplies.isDegenerate(next.spoken) ? merged(accumulated, next) : accumulated;
    if (next && next.spoken !== "") accumulated = merged(accumulated, next);
  }
  return accumulated;
}

/** The send of a real turn: the voice tutor's prompt and schema on `client`. */
export function voiceSend(client: ModelClient, system: string, signal?: AbortSignal): VoiceSend {
  return async (user, maxTokens) =>
    (
      await client.complete({
        system,
        user,
        schemaName: "voiceTutor",
        schema: VoiceTutorPrompt.schema,
        maxTokens,
        ...(signal ? { signal } : {}),
      })
    ).content;
}
