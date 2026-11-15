// Port of `OpenRouterClient.decode(_:fromContent:)` and `content(ofResponse:)` in
// LearnLayer/AI/OpenRouterClient.swift @ ref 2026-11-04

import { PartialJSON, SolutionJSON, ToolCallMarkup } from "./partialJSON";

/** The reply could not be read as the JSON that was asked for. `raw` is the whole reply, never a prefix. */
export class UnreadableReply extends Error {
  readonly raw: string;
  constructor(raw: string, reason: string) {
    super(`Unreadable reply (${reason})`);
    this.name = "UnreadableReply";
    this.raw = raw;
  }
}

/** The completion came back with no text. */
export class EmptyReply extends Error {
  readonly raw: string;
  constructor(raw: string) {
    super("Empty reply");
    this.name = "EmptyReply";
    this.raw = raw;
  }
}

/**
 * Decodes the model's JSON: a tool call read back as JSON, a Markdown fence or prose around the object
 * dropped, then the reply as written, the reply with its bracket slips mended (`SolutionJSON`), and the reply
 * closed after its last complete value (`PartialJSON`), in that order. `read` turns parsed JSON into the value
 * and throws when it isn't one.
 */
export function decodeFromContent<T>(content: string, read: (json: unknown) => T): T {
  const text = ToolCallMarkup.jsonObject(content) ?? content;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new UnreadableReply(text, "no JSON object");
  const slice = text.slice(start, end + 1);
  const attempts = [slice];
  const repaired = SolutionJSON.repaired(slice);
  if (repaired !== slice) attempts.push(repaired);
  const closed = PartialJSON.repaired(slice);
  if (closed !== null && !attempts.includes(closed)) attempts.push(closed);
  let lastError: unknown = null;
  for (const candidate of attempts) {
    try {
      return read(JSON.parse(candidate));
    } catch (error) {
      lastError = error;
    }
  }
  throw new UnreadableReply(text, String(lastError));
}

/** The text of the first choice in a chat completion response body. */
export function contentOfResponse(body: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new EmptyReply(body.slice(0, 1500));
  }
  const choices = (parsed as { choices?: { message?: { content?: unknown } }[] } | null)?.choices;
  const content = Array.isArray(choices) ? choices[0]?.message?.content : undefined;
  if (typeof content !== "string" || content === "") throw new EmptyReply(body.slice(0, 1500));
  return content;
}

/** `finish_reason` of the first choice, when the body has one. */
export function finishReasonOfResponse(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { choices?: { finish_reason?: unknown }[] };
    const reason = parsed.choices?.[0]?.finish_reason;
    return typeof reason === "string" ? reason : null;
  } catch {
    return null;
  }
}
