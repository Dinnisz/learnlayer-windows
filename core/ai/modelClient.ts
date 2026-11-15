// Port of LearnLayer/AI/OpenRouterClient.swift (the request, the stream, the failures), ReportedUsage.swift,
// OpenRouterMessages.swift and NetworkFailure.swift @ ref 2026-11-04. The evaluation cost cap (`-costCap`) is a
// Mac debug mode and is not ported (CLAUDE.md, section 8); every reply's cost still goes to `record`.

import { foundationJSON, swiftText, type JSONSchema } from "../prompts/swiftText";
import { ModelPrice } from "./modelRouting";
import { streamedReplyEvent } from "./partialJSON";
import { contentOfResponse, EmptyReply, finishReasonOfResponse } from "./replyDecoding";

// MARK: Failures

export type ModelFailure =
  | { kind: "http"; status: number; message: string }
  | { kind: "emptyReply"; raw: string }
  | { kind: "unreadableReply"; raw: string }
  /** `finish_reason: length`. `partial` is whatever content came back before the limit; often empty. */
  | { kind: "cutOff"; tokens: number; partial: string }
  /** A streamed reply that broke off or ended unreadable. */
  | { kind: "stream"; reason: string }
  /** The LearnLayer API refused the call: `quota_daily`, `quota_monthly`, `quota_cost`, `spend_kill`, `rate_limited`… */
  | { kind: "gateway"; status: number; code: string; message: string }
  /** No local key and no signed-in session. */
  | { kind: "signedOut" }
  /** No answer from the network: offline, a timeout, a dropped connection (URLError on the Mac). */
  | { kind: "network"; reason: "timedOut" | "offline" | "dropped" };

export class ModelError extends Error {
  readonly failure: ModelFailure;
  constructor(failure: ModelFailure) {
    super(describe(failure));
    this.name = "ModelError";
    this.failure = failure;
  }
}

function describe(failure: ModelFailure): string {
  switch (failure.kind) {
    case "http":
      return failure.message;
    case "emptyReply":
    case "unreadableReply":
      return failure.raw;
    case "cutOff":
      return (
        `finish_reason=length: cut off at ${failure.tokens} tokens, ` +
        (failure.partial === "" ? "content empty" : `content: ${failure.partial}`)
      );
    case "stream":
      return `stream: ${failure.reason}`;
    case "gateway":
      return `gateway ${failure.status} ${failure.code}: ${failure.message}`;
    case "signedOut":
      return "signed out";
    case "network":
      return `network: ${failure.reason}`;
  }
}

const failureOf = (error: unknown): ModelFailure | null => (error instanceof ModelError ? error.failure : null);

/** What the student is told, as a locale key and its arguments (`errorDescription` on the Mac). */
export function failureMessage(error: unknown): { key: string; args: (string | number)[] } {
  const failure = failureOf(error);
  if (!failure) return { key: "Couldn’t reach LearnLayer. Try again.", args: [] };
  switch (failure.kind) {
    case "http":
      return { key: "OpenRouter answered with error %lld: %@", args: [failure.status, failure.message] };
    case "emptyReply":
      return { key: "OpenRouter sent an empty answer.", args: [] };
    case "unreadableReply":
    case "stream":
      return { key: "The explanation came back in a form LearnLayer can’t read.", args: [] };
    case "cutOff":
      return { key: "The explanation was too long and got cut off. Try again.", args: [] };
    case "gateway":
      switch (failure.code) {
        case "quota_daily":
          return { key: "You’ve reached today’s limit. It resets at midnight UTC.", args: [] };
        case "quota_monthly":
        case "quota_cost":
          return { key: "You’ve used this month’s allowance. Upgrade to keep going.", args: [] };
        case "spend_kill":
          return { key: "LearnLayer is paused right now. Try again later.", args: [] };
        case "rate_limited":
          return { key: "Too many attempts. Wait a minute and try again.", args: [] };
        default:
          return { key: "LearnLayer couldn’t complete that request.", args: [] };
      }
    case "signedOut":
      return { key: "Sign in to LearnLayer in Settings to get explanations.", args: [] };
    case "network":
      return { key: "Couldn’t reach LearnLayer. Try again.", args: [] };
  }
}

/** The month's allowance is spent: the message comes with an Upgrade button. */
export function offersUpgrade(error: unknown): boolean {
  const failure = failureOf(error);
  return failure?.kind === "gateway" && (failure.code === "quota_monthly" || failure.code === "quota_cost");
}

export function isQuota(error: unknown): boolean {
  const failure = failureOf(error);
  return (
    failure?.kind === "gateway" && ["quota_daily", "quota_monthly", "quota_cost", "spend_kill"].includes(failure.code)
  );
}

export function isRateLimited(error: unknown): boolean {
  const failure = failureOf(error);
  return failure?.kind === "gateway" && failure.code === "rate_limited";
}

/** A limit, not a wrong answer. Callers stop instead of asking a stronger model. */
export function isBlocked(error: unknown): boolean {
  return isQuota(error) || isRateLimited(error);
}

export function isSignedOut(error: unknown): boolean {
  return failureOf(error)?.kind === "signedOut";
}

const retryableStatuses = [408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524];

/** A dropped connection or a gateway error, not a bad answer. */
export function isTransient(error: unknown): boolean {
  if (isQuota(error) || isRateLimited(error) || isSignedOut(error)) return false;
  const failure = failureOf(error);
  if (!failure) return false;
  if (failure.kind === "network") return true;
  if (failure.kind === "http" || failure.kind === "gateway") return retryableStatuses.includes(failure.status);
  return false;
}

/** Rate limited, a provider's own error, or no answer in time: another provider may well answer. */
export function isProviderHiccup(error: unknown): boolean {
  const failure = failureOf(error);
  if (!failure) return false;
  if (failure.kind === "network") return failure.reason === "timedOut";
  if (failure.kind === "http" || failure.kind === "gateway") {
    return failure.status === 429 || (failure.status >= 500 && failure.status < 600);
  }
  return false;
}

function parsedError(body: string): { code: string | null; message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { code: null, message: body.slice(0, 200) };
  }
  const detail = (parsed as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  const message = typeof detail?.message === "string" ? detail.message : "";
  const code = typeof detail?.code === "string" ? detail.code : null;
  return { code, message: message === "" ? body.slice(0, 200) : message };
}

/** Reads a LearnLayer or OpenRouter error body. Gateway codes become `gateway`. */
export function classifiedFailure(status: number, body: string, fromGateway: boolean): ModelFailure {
  const parsed = parsedError(body);
  if (!fromGateway) return { kind: "http", status, message: parsed.message };
  const code = parsed.code ?? "";
  if (status === 401 || code === "unauthorized") return { kind: "signedOut" };
  return { kind: "gateway", status, code, message: parsed.message };
}

// MARK: Usage

/** Token counts and, when OpenRouter sends one, the dollar cost of one reply. A missing cost is priced from the tokens. */
export class ReportedUsage {
  cost: number | null = null;
  promptTokens = 0;
  completionTokens = 0;
  cachedTokens = 0;
  totalTokens = 0;

  get billedTokens(): number {
    return this.totalTokens > 0 ? this.totalTokens : this.promptTokens + this.completionTokens;
  }

  billed(model: string): number {
    if (this.cost !== null) return this.cost;
    return ModelPrice.estimate(model, this.promptTokens, this.completionTokens, this.cachedTokens, this.billedTokens);
  }

  /** Later chunks fill in whatever this one carries. A cost-only chunk does not wipe the counts. */
  merge(next: ReportedUsage) {
    if (next.cost !== null) this.cost = next.cost;
    if (next.promptTokens > 0) this.promptTokens = next.promptTokens;
    if (next.completionTokens > 0) this.completionTokens = next.completionTokens;
    if (next.cachedTokens > 0) this.cachedTokens = next.cachedTokens;
    if (next.totalTokens > 0) this.totalTokens = next.totalTokens;
  }

  /** The `usage` object of a chat-completion body or chunk; empty counts for anything else. */
  static from(value: unknown): ReportedUsage {
    const usage = new ReportedUsage();
    if (typeof value !== "object" || value === null) return usage;
    const json = value as Record<string, unknown>;
    const number = (field: unknown): number | null => {
      if (typeof field === "number" && Number.isFinite(field)) return field;
      if (typeof field === "string" && field.trim() !== "" && Number.isFinite(Number(field))) return Number(field);
      return null;
    };
    const integer = (field: unknown) => Math.trunc(number(field) ?? 0);
    usage.cost = number(json.cost);
    usage.promptTokens = integer(json.prompt_tokens);
    usage.completionTokens = integer(json.completion_tokens);
    usage.totalTokens = integer(json.total_tokens);
    let cached = integer(json.cache_read_input_tokens);
    const details = json.prompt_tokens_details;
    if (typeof details === "object" && details !== null) {
      cached = Math.max(cached, integer((details as Record<string, unknown>).cached_tokens));
    }
    usage.cachedTokens = cached;
    return usage;
  }
}

// MARK: Messages (OpenRouterMessages.swift)

/** Anthropic models on OpenRouter: cache the long static system prompt. */
export function cachesSystemPrompt(model: string): boolean {
  const name = model.toLowerCase();
  return name.includes("anthropic/") || name.includes("claude");
}

/**
 * Some providers drop `response_format` on a stream and the model then writes a tool call instead of JSON.
 * Say so in the request, and read that markup back when it happens anyway.
 */
export const jsonOnlyRule = swiftText("OpenRouterClient", "jsonOnlyRule#0");

export function systemContent(system: string, model: string): unknown {
  if (!cachesSystemPrompt(model)) return system + "\n\n" + jsonOnlyRule;
  return [
    { type: "text", text: system, cache_control: { type: "ephemeral" } },
    { type: "text", text: "\n\n" + jsonOnlyRule },
  ];
}

/** JPEG bytes as base64, in pieces so a large page doesn't overflow the call stack. */
export function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

export function userContent(text: string, images: readonly Uint8Array[]): unknown {
  if (images.length === 0) return text;
  return [
    { type: "text", text },
    ...images.map((image) => ({ type: "image_url", image_url: { url: "data:image/jpeg;base64," + base64(image) } })),
  ];
}

/** The request's "reasoning" field. `cap` (a solve's) bounds the thinking whichever way it is on. */
export function reasoningField(
  budget: number | null,
  required: boolean,
  maxTokens: number,
  cap: number | null = null,
): Record<string, unknown> {
  const capped = cap ?? Number.MAX_SAFE_INTEGER;
  // Chosen for this model: the answer still keeps most of the budget.
  if (budget !== null && budget > 0) return { max_tokens: Math.min(budget, Math.floor(maxTokens / 2), capped) };
  // This model must think first: cap that, so the answer itself keeps most of the token budget. 1 024 is the least a
  // provider accepts.
  if (required) return { max_tokens: Math.max(1024, Math.min(4000, Math.floor(maxTokens / 4), capped)) };
  // The answer is short and structured; thinking first only adds delay and eats the token budget.
  return { enabled: false };
}

export const fastQuestionSchema = swiftText("OpenRouterClient", "fastQuestionSchema#0");

/**
 * The on-click question reading waits on nothing it can skip: the provider that answers first (`quickest`; the
 * others still stand behind it), and no thinking (none sent back either), unless the model insists on it.
 */
export function tuneForLatency(body: Record<string, unknown>, quickest = true) {
  if (quickest) body.provider = { sort: "latency", allow_fallbacks: true };
  const reasoning = body.reasoning as Record<string, unknown> | undefined;
  if (reasoning && reasoning.enabled === false) body.reasoning = { ...reasoning, exclude: true };
}

// MARK: Transport

export type AIPurpose = "chat" | "speech";

export interface ModelTransport {
  url: string;
  bearer: string;
  kind: "local" | "backend" | "none";
}

/** A `fetch` that can stream the body: the platform's (Tauri's HTTP plugin in the app, a script in tests). */
export type StreamingFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ status: number; body: ReadableStream<Uint8Array> | null; text(): Promise<string> }>;

export interface ModelEnvironment {
  /** Where a call goes: the LearnLayer API with the session's token, or OpenRouter with the local key (debug). */
  transport(purpose: AIPurpose, usesLocalKey: boolean): Promise<ModelTransport>;
  /** One forced refresh after a 401 from the API; null when the session is gone. */
  forceRefresh(): Promise<string | null>;
  fetch: StreamingFetch;
  /** Every reply's usage, billed or not, for the cost ledger. */
  record?(usage: ReportedUsage, model: string): void;
  /** Called once per request, with what is about to be sent (for the request log). */
  note?(schemaName: string, model: string, streamed: boolean): void;
}

/** Models that refuse to answer without thinking first; for them the request leaves reasoning to the model. */
const reasoningRequired = new Set<string>();
/** Schemas a provider found too large to enforce strictly; for them the schema is described in the prompt. */
const looseSchemas = new Set<string>(["solution", "illustration"]);

export function resetModelClientState() {
  reasoningRequired.clear();
  looseSchemas.clear();
  looseSchemas.add("solution");
  looseSchemas.add("illustration");
}

export interface ModelOptions {
  model: string;
  /** Thinking tokens before the answer (`ModelRouting`); null turns thinking off. */
  reasoningBudget?: number | null;
  /** Sent only when the call goes through the LearnLayer API, so the server can enforce the plan. */
  routeArea?: string | null;
  routeName?: string | null;
  routeHasFigure?: boolean | null;
  /** Goes to OpenRouter with the local key whatever the gateway would pick (the fast transcription model). */
  usesLocalKey?: boolean;
  /** The fast transcription asks the quickest provider first; its retry, any. */
  sortsByLatency?: boolean;
  /** Optional `X-Request-Id`. */
  requestId?: string | null;
}

export interface CompleteRequest {
  system: string;
  user: string;
  images?: readonly Uint8Array[];
  schemaName: string;
  schema: JSONSchema;
  maxTokens?: number;
  reasoningCap?: number | null;
  /** Seconds without a byte before the request is given up. */
  timeout?: number;
  /** With it, the reply streams: called with the content so far as it arrives (see `PartialJSON`). */
  onContent?: (content: string) => void;
  /** Hears that the model is thinking (reasoning arriving before any text): it is at work, not stalled. */
  onThinking?: () => void;
  /** Cancels the call (the stage closed). */
  signal?: AbortSignal;
}

export interface Completion {
  content: string;
  /** What the reply cost, in US dollars: OpenRouter's figure, else priced from the tokens. */
  cost: number;
}

const includesFolded = (text: string, piece: string) => text.toLowerCase().includes(piece.toLowerCase());

/** Asks a model on OpenRouter (directly, or through the LearnLayer API) for one JSON reply. */
export class ModelClient {
  readonly options: Required<ModelOptions>;
  private readonly environment: ModelEnvironment;

  constructor(environment: ModelEnvironment, options: ModelOptions) {
    this.environment = environment;
    this.options = {
      reasoningBudget: null,
      routeArea: null,
      routeName: null,
      routeHasFigure: null,
      usesLocalKey: false,
      sortsByLatency: true,
      requestId: null,
      ...options,
    };
  }

  /** Sends one request with a JSON schema and returns the reply's text, retrying the two refusals that a changed request fixes. */
  async complete(request: CompleteRequest): Promise<Completion> {
    const model = this.options.model;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.send(request);
      } catch (error) {
        const failure = failureOf(error);
        const message = failure && "message" in failure ? failure.message : "";
        const isBadRequest = (failure?.kind === "http" || failure?.kind === "gateway") && failure.status === 400;
        if (isBadRequest && includesFolded(message, "reasoning is mandatory")) {
          // Asked again only when the request changes; the same one gets the same refusal.
          if (reasoningRequired.has(model)) throw error;
          reasoningRequired.add(model);
          continue;
        }
        if (
          failure?.kind === "http" &&
          failure.status === 400 &&
          (includesFolded(message, "grammar is too large") ||
            (includesFolded(message, "schema") && includesFolded(message, "too")))
        ) {
          if (looseSchemas.has(request.schemaName)) throw error;
          looseSchemas.add(request.schemaName);
          continue;
        }
        throw error;
      }
    }
    return this.send(request);
  }

  /** The request body, as the Mac builds it. */
  body(request: CompleteRequest): Record<string, unknown> {
    const { model, reasoningBudget } = this.options;
    const maxTokens = request.maxTokens ?? 4000;
    const images = request.images ?? [];
    const body: Record<string, unknown> = {
      model,
      temperature: 0.3,
      usage: { include: true },
      // Room for the whole JSON; a cut-off reply can't be read at all.
      max_tokens: maxTokens,
    };
    if (looseSchemas.has(request.schemaName)) {
      // Too big to enforce: describe it instead, and ask for JSON.
      const described = foundationJSON(request.schema);
      body.response_format = { type: "json_object" };
      body.messages = [
        { role: "system", content: systemContent(request.system + "\n\nMatch this JSON schema:\n" + described, model) },
        { role: "user", content: userContent(request.user, images) },
      ];
    } else {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: request.schemaName, strict: true, schema: request.schema },
      };
      body.messages = [
        { role: "system", content: systemContent(request.system, model) },
        { role: "user", content: userContent(request.user, images) },
      ];
    }
    body.reasoning = reasoningField(
      reasoningBudget,
      reasoningRequired.has(model),
      maxTokens,
      request.reasoningCap ?? null,
    );
    if (request.schemaName === fastQuestionSchema) tuneForLatency(body, this.options.sortsByLatency);
    if (request.onContent) body.stream = true;
    return body;
  }

  private async send(request: CompleteRequest): Promise<Completion> {
    const { model, usesLocalKey, routeArea, routeName, routeHasFigure, requestId } = this.options;
    const transport = await this.environment.transport("chat", usesLocalKey);
    if (transport.bearer === "") throw new ModelError({ kind: "signedOut" });
    this.environment.note?.(request.schemaName, model, request.onContent !== undefined);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Title": "LearnLayer",
      Authorization: `Bearer ${transport.bearer}`,
    };
    if (transport.kind === "backend") {
      if (routeArea) headers["X-LearnLayer-Area"] = routeArea;
      if (routeName) headers["X-LearnLayer-Route"] = routeName;
      if (routeHasFigure !== null) headers["X-LearnLayer-Figure"] = routeHasFigure ? "1" : "0";
      headers["X-LearnLayer-Purpose"] = "chat";
    }
    if (requestId) headers["X-Request-Id"] = requestId;
    const fromGateway = transport.kind === "backend";
    const body = foundationJSON(this.body(request));
    const maxTokens = request.maxTokens ?? 4000;
    const timeout = request.timeout ?? 90;
    return request.onContent
      ? this.stream(transport.url, headers, body, maxTokens, timeout, fromGateway, request)
      : this.plain(transport.url, headers, body, maxTokens, timeout, fromGateway, request.signal);
  }

  /** One attempt, then a single refresh if the LearnLayer API says the access token expired. */
  private async perform(
    url: string,
    headers: Record<string, string>,
    body: string,
    fromGateway: boolean,
    watch: IdleWatch,
  ): Promise<Awaited<ReturnType<StreamingFetch>>> {
    let current = headers;
    let refreshed = false;
    for (;;) {
      const response = await watch.guard(
        this.environment.fetch(url, { method: "POST", headers: current, body, signal: watch.signal }),
      );
      if (response.status === 401 && fromGateway && !refreshed) {
        const token = await this.environment.forceRefresh();
        if (token) {
          refreshed = true;
          current = { ...current, Authorization: `Bearer ${token}` };
          continue;
        }
      }
      return response;
    }
  }

  private async plain(
    url: string,
    headers: Record<string, string>,
    body: string,
    maxTokens: number,
    timeout: number,
    fromGateway: boolean,
    signal: AbortSignal | undefined,
  ): Promise<Completion> {
    const watch = new IdleWatch(timeout, signal);
    try {
      const response = await this.perform(url, headers, body, fromGateway, watch);
      const data = await watch.guard(response.text());
      if (response.status < 200 || response.status >= 300) {
        throw new ModelError(classifiedFailure(response.status, data, fromGateway));
      }
      let usage = new ReportedUsage();
      try {
        usage = ReportedUsage.from((JSON.parse(data) as { usage?: unknown }).usage);
      } catch {
        // No usage in an unreadable body.
      }
      // A cut-off reply was still billed, so it counts before the throw.
      this.environment.record?.(usage, this.options.model);
      if (finishReasonOfResponse(data) === "length") {
        let partial = "";
        try {
          partial = contentOfResponse(data);
        } catch {
          partial = "";
        }
        throw new ModelError({ kind: "cutOff", tokens: maxTokens, partial });
      }
      try {
        return { content: contentOfResponse(data), cost: usage.billed(this.options.model) };
      } catch (error) {
        if (error instanceof EmptyReply) throw new ModelError({ kind: "emptyReply", raw: error.raw });
        throw error;
      }
    } finally {
      watch.stop();
    }
  }

  /**
   * Reads a streamed reply (server-sent events): each `data:` line carries a piece of the content; comments
   * (": OPENROUTER PROCESSING") keep the connection alive; the last chunk carries the usage.
   */
  private async stream(
    url: string,
    headers: Record<string, string>,
    body: string,
    maxTokens: number,
    timeout: number,
    fromGateway: boolean,
    request: CompleteRequest,
  ): Promise<Completion> {
    const watch = new IdleWatch(timeout, request.signal);
    const running = new ReportedUsage();
    let started = false;
    try {
      const response = await this.perform(url, headers, body, fromGateway, watch);
      if (response.status < 200 || response.status >= 300) {
        const data = await watch.guard(response.text());
        throw new ModelError(classifiedFailure(response.status, data, fromGateway));
      }
      started = true;
      let content = "";
      let finish: string | null = null;
      let done = false;
      let toolCallSettled = false;
      try {
        for await (const line of sseLines(response, watch)) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") {
            done = true;
            break;
          }
          let chunk: SSEChunk;
          try {
            chunk = JSON.parse(payload) as SSEChunk;
          } catch {
            continue;
          }
          if (chunk.error) {
            throw new ModelError({ kind: "stream", reason: `error mid-stream: ${String(chunk.error.message ?? "")}` });
          }
          const choice = chunk.choices?.[0];
          if (typeof choice?.finish_reason === "string") finish = choice.finish_reason;
          if (chunk.usage) running.merge(ReportedUsage.from(chunk.usage));
          const thought = choice?.delta?.reasoning;
          if (content === "" && typeof thought === "string" && thought !== "") request.onThinking?.();
          const piece = choice?.delta?.content;
          if (typeof piece === "string" && piece !== "" && !toolCallSettled) {
            content += piece;
            const event = streamedReplyEvent(content);
            if (event.kind === "forward") request.onContent!(content);
            else if (event.kind === "json") {
              // The whole answer is in. Keep reading so the usage chunk still arrives.
              content = event.json;
              toolCallSettled = true;
              request.onContent!(content);
            } else if (event.kind === "reject") {
              // Stop the body here. Waiting it out, then asking again, is the double charge.
              throw new ModelError({ kind: "stream", reason: "tool-call markup instead of JSON" });
            }
          }
        }
      } catch (error) {
        // The student closed the stage: that is not a broken stream to ask again for.
        if (error instanceof Error && error.name === "AbortError") throw error;
        if (error instanceof ModelError && error.failure.kind !== "network") throw error;
        if (error instanceof ModelError)
          throw new ModelError({ kind: "stream", reason: `broke off: ${error.message}` });
        throw new ModelError({ kind: "stream", reason: `broke off: ${String(error)}` });
      }
      if (!toolCallSettled) {
        const event = streamedReplyEvent(content);
        if (event.kind === "json") {
          content = event.json;
          toolCallSettled = true;
        } else if (event.kind === "hold") {
          // A tool call cut off by the token limit is the usual cut-off, not a second request for the same format.
          if (finish === "length") throw new ModelError({ kind: "cutOff", tokens: maxTokens, partial: content });
          throw new ModelError({ kind: "stream", reason: "tool-call markup instead of JSON" });
        }
      }
      if (finish === "length" && !toolCallSettled) {
        throw new ModelError({ kind: "cutOff", tokens: maxTokens, partial: content });
      }
      if (!(done || finish !== null || toolCallSettled)) {
        throw new ModelError({ kind: "stream", reason: "ended before the reply was finished" });
      }
      if (content === "") throw new ModelError({ kind: "stream", reason: "empty" });
      return { content, cost: running.billed(this.options.model) };
    } finally {
      watch.stop();
      // A stream that breaks or is rejected was still billed. Count it on the way out.
      if (started) this.environment.record?.(running, this.options.model);
    }
  }
}

interface SSEChunk {
  choices?: { delta?: { content?: unknown; reasoning?: unknown }; finish_reason?: unknown }[];
  usage?: unknown;
  error?: { message?: unknown };
}

/**
 * The request's timeout as on the Mac: seconds without any byte, reset whenever one arrives, so a long answer
 * that keeps streaming is never cut, and a stalled one is. Also follows the caller's own cancellation.
 */
class IdleWatch {
  private readonly controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private timedOut = false;
  private readonly seconds: number;
  private readonly onCancel = () => this.controller.abort();
  private readonly outer: AbortSignal | undefined;

  constructor(seconds: number, outer?: AbortSignal) {
    this.seconds = seconds;
    this.outer = outer;
    outer?.addEventListener("abort", this.onCancel);
    if (outer?.aborted) this.controller.abort();
    this.touch();
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  touch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timedOut = true;
      this.controller.abort();
    }, this.seconds * 1000);
  }

  stop() {
    clearTimeout(this.timer);
    this.outer?.removeEventListener("abort", this.onCancel);
  }

  /** Awaits `work`, turning a network failure or an abort into the failure the Mac would report. */
  async guard<T>(work: Promise<T>): Promise<T> {
    let onAbort = () => {};
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(this.abortError());
      if (this.controller.signal.aborted) onAbort();
      this.controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    // Only the race below listens; a late abort must not surface as an unhandled rejection.
    aborted.catch(() => {});
    try {
      const result = await Promise.race([work, aborted]);
      this.touch();
      return result;
    } catch (error) {
      if (error instanceof ModelError) throw error;
      if (this.controller.signal.aborted) throw this.abortError();
      throw new ModelError({ kind: "network", reason: "dropped" });
    } finally {
      this.controller.signal.removeEventListener("abort", onAbort);
    }
  }

  private abortError(): Error {
    if (this.timedOut) return new ModelError({ kind: "network", reason: "timedOut" });
    const error = new Error("The call was cancelled.");
    error.name = "AbortError";
    return error;
  }
}

/** The body's lines, as the server sent them, each arriving resetting the idle timeout. */
async function* sseLines(
  response: { body: ReadableStream<Uint8Array> | null; text(): Promise<string> },
  watch: IdleWatch,
): AsyncGenerator<string> {
  if (!response.body) {
    for (const line of (await watch.guard(response.text())).split(/\r?\n/)) yield line;
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await watch.guard(reader.read());
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        yield buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    if (buffer !== "") yield buffer.replace(/\r$/, "");
  } finally {
    reader.releaseLock();
  }
}

// MARK: The first words (SolutionProvider.withFirstTextDeadline)

export class NoTextInTime extends Error {
  constructor() {
    super("The model took too long to start answering.");
    this.name = "NoTextInTime";
  }
}

/**
 * Runs `run`, cancelling it when nothing has arrived after `seconds`; that throws `NoTextInTime`, which the caller
 * answers with Sonnet. Thinking counts as arriving: the LearnLayer API may answer with a thinking model (Haiku)
 * where the app asked for one that writes at once, and its first words then come after 20–30 s of thought.
 */
export async function withFirstTextDeadline<T>(
  seconds: number,
  onPartial: (content: string) => void,
  run: (pass: (content: string) => void, thinking: () => void, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let arrived = false;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (arrived) return;
      expired = true;
      controller.abort();
      reject(new NoTextInTime());
    }, seconds * 1000);
  });
  try {
    return await Promise.race([
      run(
        (content) => {
          arrived = true;
          onPartial(content);
        },
        () => {
          arrived = true;
        },
        controller.signal,
      ),
      watchdog,
    ]);
  } catch (error) {
    if (expired && !arrived) throw new NoTextInTime();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
