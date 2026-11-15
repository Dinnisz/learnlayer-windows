// Ports @ ref 2026-11-04 of LearnLayerTests: AIGatewayTests `quotaAndRateLimitsAreNotRetried` (BackendClientTests.swift),
// SolveScopeTests `aPartSolveHasASmallerBudgetAndCappedThinking` (the reasoning field), ModelRoutingTests
// `noTextInTimeIsReported`, `textInTimeKeepsTheAnswer`, `thinkingBeforeTheFirstWordsIsNotGivenUpOn`; plus the request
// body, the stream and the refusals, against a scripted API (nothing reaches the network).

import { afterEach, describe, expect, it } from "vitest";
import catalog from "../i18n/locales/en.json";
import { ProblemPrompt } from "../prompts/problemPrompt";
import {
  classifiedFailure,
  failureMessage,
  isBlocked,
  isQuota,
  isRateLimited,
  isSignedOut,
  isTransient,
  ModelClient,
  ModelError,
  NoTextInTime,
  offersUpgrade,
  reasoningField,
  ReportedUsage,
  resetModelClientState,
  withFirstTextDeadline,
  type ModelEnvironment,
  type ModelTransport,
  type StreamingFetch,
} from "./modelClient";

const encoder = new TextEncoder();

type Reply = { status: number; chunks: string[] } | { status: number; body: string };

/** A scripted API: each request takes the next reply. Streamed replies arrive in the given pieces. */
function scriptedAPI(
  replies: Reply[],
  transport: ModelTransport = { url: "https://api.test/v1/chat/completions", bearer: "t1", kind: "backend" },
) {
  const requests: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const recorded: ReportedUsage[] = [];
  let refreshes = 0;
  const fetch: StreamingFetch = async (url, init) => {
    requests.push({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });
    const reply = replies.shift();
    if (!reply) throw new Error("no scripted reply left");
    if ("body" in reply) return { status: reply.status, body: null, text: async () => reply.body };
    const pieces = [...reply.chunks];
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = pieces.shift();
        if (next === undefined) controller.close();
        else controller.enqueue(encoder.encode(next));
      },
    });
    return { status: reply.status, body, text: async () => reply.chunks.join("") };
  };
  const environment: ModelEnvironment = {
    transport: async () => transport,
    forceRefresh: async () => {
      refreshes += 1;
      return "t2";
    },
    fetch,
    record: (usage) => void recorded.push(usage),
  };
  return { environment, requests, recorded, refreshes: () => refreshes };
}

const sse = (...events: unknown[]) =>
  events.map((event) => `data: ${typeof event === "string" ? event : JSON.stringify(event)}\n\n`);
const delta = (content: string) => ({ choices: [{ delta: { content } }] });
const completion = (content: string, finish = "stop") =>
  JSON.stringify({
    choices: [{ message: { content }, finish_reason: finish }],
    usage: { cost: 0.001, total_tokens: 10 },
  });

const request = {
  system: "Solve.",
  user: "1. Q",
  schemaName: "classify",
  schema: { type: "object" },
  maxTokens: 500,
};

afterEach(() => resetModelClientState());

describe("failures", () => {
  it("quota and rate limits are not retried", () => {
    const quota = new ModelError(classifiedFailure(402, '{"error":{"code":"quota_daily","message":"stop"}}', true));
    expect(isQuota(quota)).toBe(true);
    expect(isBlocked(quota)).toBe(true);
    expect(isTransient(quota)).toBe(false);
    expect(quota.failure).toEqual({ kind: "gateway", status: 402, code: "quota_daily", message: "stop" });

    const monthly = new ModelError(classifiedFailure(402, '{"error":{"code":"quota_monthly","message":"stop"}}', true));
    expect(isQuota(monthly)).toBe(true);
    expect(isTransient(monthly)).toBe(false);

    const rate = new ModelError(classifiedFailure(429, '{"error":{"code":"rate_limited","message":"slow"}}', true));
    expect(isRateLimited(rate)).toBe(true);
    expect(isBlocked(rate)).toBe(true);
    expect(isTransient(rate)).toBe(false);

    const paused = new ModelError(classifiedFailure(503, '{"error":{"code":"spend_kill","message":"paused"}}', true));
    expect(isQuota(paused)).toBe(true);
    expect(isTransient(paused)).toBe(false);

    const upstream = new ModelError(classifiedFailure(503, '{"error":{"code":"upstream","message":"later"}}', true));
    expect(isQuota(upstream)).toBe(false);
    expect(isTransient(upstream)).toBe(true);

    const signedOut = new ModelError(
      classifiedFailure(401, '{"error":{"code":"unauthorized","message":"again"}}', true),
    );
    expect(isSignedOut(signedOut)).toBe(true);
    expect(isTransient(signedOut)).toBe(false);

    const direct = new ModelError(classifiedFailure(402, '{"error":{"code":"quota_daily","message":"stop"}}', false));
    expect(isQuota(direct)).toBe(false);
    expect(isTransient(direct)).toBe(false);
  });

  it("402 and 503 show the right messages, all of them in the String Catalog", () => {
    const message = (status: number, code: string) =>
      failureMessage(new ModelError(classifiedFailure(status, JSON.stringify({ error: { code, message: "x" } }), true)))
        .key;
    expect(message(402, "quota_daily")).toBe("You’ve reached today’s limit. It resets at midnight UTC.");
    expect(message(402, "quota_monthly")).toBe("You’ve used this month’s allowance. Upgrade to keep going.");
    expect(message(402, "quota_cost")).toBe("You’ve used this month’s allowance. Upgrade to keep going.");
    expect(message(503, "spend_kill")).toBe("LearnLayer is paused right now. Try again later.");
    expect(message(429, "rate_limited")).toBe("Too many attempts. Wait a minute and try again.");
    expect(message(413, "too_large")).toBe("LearnLayer couldn’t complete that request.");
    expect(offersUpgrade(new ModelError(classifiedFailure(402, '{"error":{"code":"quota_monthly"}}', true)))).toBe(
      true,
    );
    expect(offersUpgrade(new ModelError(classifiedFailure(402, '{"error":{"code":"quota_daily"}}', true)))).toBe(false);
    const strings: Record<string, unknown> = catalog;
    const kinds = [
      { kind: "http", status: 500, message: "x" },
      { kind: "emptyReply", raw: "" },
      { kind: "unreadableReply", raw: "" },
      { kind: "cutOff", tokens: 1, partial: "" },
      { kind: "stream", reason: "" },
      { kind: "signedOut" },
      { kind: "network", reason: "offline" },
    ] as const;
    for (const failure of kinds) {
      const key = failureMessage(new ModelError(failure)).key;
      expect(strings[key], key).toBeDefined();
    }
  });
});

describe("the reasoning field", () => {
  it("a part solve has capped thinking", () => {
    const cap = ProblemPrompt.reasoningCap;
    expect(reasoningField(null, true, 16000, cap).max_tokens).toBe(cap);
    expect(reasoningField(null, true, 16000).max_tokens).toBe(4000);
    expect(reasoningField(null, true, 2000, cap).max_tokens).toBe(1024);
    expect(reasoningField(8000, false, 7000, cap).max_tokens).toBe(cap);
    expect(reasoningField(1500, false, 7000, cap).max_tokens).toBe(1500);
    expect(reasoningField(null, false, 7000, cap).enabled).toBe(false);
  });
});

describe("the request", () => {
  it("is the Mac's body: strict schema, cached system prompt, routing headers through the API", async () => {
    const api = scriptedAPI([{ status: 200, body: completion('{"kind":"reading"}') }]);
    const client = new ModelClient(api.environment, {
      model: "anthropic/claude-haiku-5.5",
      reasoningBudget: 2000,
      routeArea: "math",
      routeName: "fast",
      routeHasFigure: false,
    });
    const reply = await client.complete({ ...request, images: [new Uint8Array([1, 2, 3])] });
    expect(reply.content).toBe('{"kind":"reading"}');
    expect(reply.cost).toBe(0.001);
    const sent = api.requests[0]!;
    expect(sent.headers).toMatchObject({
      Authorization: "Bearer t1",
      "X-LearnLayer-Area": "math",
      "X-LearnLayer-Route": "fast",
      "X-LearnLayer-Figure": "0",
      "X-LearnLayer-Purpose": "chat",
      "X-Title": "LearnLayer",
    });
    expect(sent.body).toMatchObject({
      model: "anthropic/claude-haiku-5.5",
      temperature: 0.3,
      max_tokens: 500,
      usage: { include: true },
      reasoning: { max_tokens: 250 },
      response_format: {
        type: "json_schema",
        json_schema: { name: "classify", strict: true, schema: { type: "object" } },
      },
    });
    const messages = sent.body.messages as { role: string; content: unknown }[];
    expect(messages[0]?.content).toEqual([
      { type: "text", text: "Solve.", cache_control: { type: "ephemeral" } },
      { type: "text", text: expect.stringContaining("Reply with one JSON object only.") },
    ]);
    expect(messages[1]?.content).toEqual([
      { type: "text", text: "1. Q" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AQID" } },
    ]);
    expect(api.recorded).toHaveLength(1);
  });

  it("a large schema is described in the prompt, and a direct call carries no routing headers", async () => {
    const api = scriptedAPI([{ status: 200, body: completion("{}") }], {
      url: "https://openrouter.ai/api/v1/chat/completions",
      bearer: "sk-or-local",
      kind: "local",
    });
    const client = new ModelClient(api.environment, { model: "google/gemini-3.8-flash", routeArea: "math" });
    await client.complete({ ...request, schemaName: "solution", schema: { b: 1, a: "x/y" } });
    const sent = api.requests[0]!;
    expect(sent.headers["X-LearnLayer-Area"]).toBeUndefined();
    expect(sent.body.response_format).toEqual({ type: "json_object" });
    const system = (sent.body.messages as { content: string }[])[0]!.content;
    expect(system).toContain(
      'Solve.\n\nMatch this JSON schema:\n{"a":"x\\/y","b":1}\n\nReply with one JSON object only.',
    );
  });

  it("no session and no key is signed out, before anything is sent", async () => {
    const api = scriptedAPI([], { url: "x", bearer: "", kind: "none" });
    const failure = await new ModelClient(api.environment, { model: "m" })
      .complete(request)
      .catch((error: unknown) => error);
    expect(isSignedOut(failure)).toBe(true);
    expect(api.requests).toHaveLength(0);
  });

  it("a 401 from the API is refreshed once and the call repeated", async () => {
    const api = scriptedAPI([
      { status: 401, body: '{"error":{"code":"unauthorized","message":"expired"}}' },
      { status: 200, body: completion("{}") },
    ]);
    await new ModelClient(api.environment, { model: "m" }).complete(request);
    expect(api.refreshes()).toBe(1);
    expect(api.requests.map((sent) => sent.headers.Authorization)).toEqual(["Bearer t1", "Bearer t2"]);
  });

  it("a second 401 after the refresh is signed out", async () => {
    const api = scriptedAPI([
      { status: 401, body: '{"error":{"code":"unauthorized"}}' },
      { status: 401, body: '{"error":{"code":"unauthorized"}}' },
    ]);
    const failure = await new ModelClient(api.environment, { model: "m" })
      .complete(request)
      .catch((error: unknown) => error);
    expect(isSignedOut(failure)).toBe(true);
    expect(api.refreshes()).toBe(1);
  });

  it("a model that must think is asked again once, thinking", async () => {
    const api = scriptedAPI([
      { status: 400, body: '{"error":{"code":"upstream","message":"Reasoning is mandatory for this endpoint"}}' },
      { status: 200, body: completion("{}") },
    ]);
    await new ModelClient(api.environment, { model: "thinker" }).complete({ ...request, maxTokens: 16000 });
    expect(api.requests.map((sent) => sent.body.reasoning)).toEqual([{ enabled: false }, { max_tokens: 4000 }]);
  });

  it("a schema too large to enforce is described next time", async () => {
    const api = scriptedAPI(
      [
        { status: 400, body: '{"error":{"message":"The JSON schema is too large"}}' },
        { status: 200, body: completion("{}") },
      ],
      { url: "https://openrouter.ai/x", bearer: "k", kind: "local" },
    );
    await new ModelClient(api.environment, { model: "m" }).complete(request);
    expect(api.requests.map((sent) => (sent.body.response_format as { type: string }).type)).toEqual([
      "json_schema",
      "json_object",
    ]);
  });

  it("a cut-off reply is reported with what came, and still counted", async () => {
    const api = scriptedAPI([{ status: 200, body: completion('{"a":', "length") }]);
    const failure = await new ModelClient(api.environment, { model: "m" })
      .complete(request)
      .catch((error: unknown) => error);
    expect((failure as ModelError).failure).toEqual({ kind: "cutOff", tokens: 500, partial: '{"a":' });
    expect(api.recorded).toHaveLength(1);
  });
});

describe("the stream", () => {
  it("arrives in pieces, with keep-alive comments, and the usage at the end", async () => {
    const api = scriptedAPI([
      {
        status: 200,
        chunks: [
          ": OPENROUTER PROCESSING\n\n",
          ...sse(delta('{"subj'), delta('ect":"F"'), { choices: [{ delta: { content: "}" }, finish_reason: "stop" }] }),
          'data: {"choices":[],"usage":{"cost":"0.002","prompt_tokens":5}}\r\n\r\n',
          "data: [DONE]\n\n",
        ],
      },
    ]);
    const seen: string[] = [];
    const reply = await new ModelClient(api.environment, { model: "m" }).complete({
      ...request,
      onContent: (content) => void seen.push(content),
    });
    expect(seen).toEqual(['{"subj', '{"subject":"F"', '{"subject":"F"}']);
    expect(reply).toEqual({ content: '{"subject":"F"}', cost: 0.002 });
    expect(api.requests[0]!.body.stream).toBe(true);
    expect(api.recorded[0]?.promptTokens).toBe(5);
  });

  it("a line split across chunks is read whole", async () => {
    const line = `data: ${JSON.stringify(delta('{"a":1}'))}\n\n`;
    const api = scriptedAPI([{ status: 200, chunks: [line.slice(0, 9), line.slice(9), "data: [DONE]\n\n"] }]);
    const reply = await new ModelClient(api.environment, { model: "m" }).complete({ ...request, onContent: () => {} });
    expect(reply.content).toBe('{"a":1}');
  });

  it("thinking before the first words is heard, never shown", async () => {
    const api = scriptedAPI([
      {
        status: 200,
        chunks: [...sse({ choices: [{ delta: { reasoning: "hmm" } }] }, delta("{}")), "data: [DONE]\n\n"],
      },
    ]);
    let thoughts = 0;
    const seen: string[] = [];
    await new ModelClient(api.environment, { model: "m" }).complete({
      ...request,
      onContent: (content) => void seen.push(content),
      onThinking: () => void (thoughts += 1),
    });
    expect(thoughts).toBe(1);
    expect(seen).toEqual(["{}"]);
  });

  it("a tool call is read back as JSON; one that can't be is rejected at once", async () => {
    const call = '<invoke name="respond"><parameter name="subject">M</parameter></invoke>';
    const api = scriptedAPI([
      { status: 200, chunks: [...sse(delta(call.slice(0, 20)), delta(call.slice(20))), "data: [DONE]\n\n"] },
      { status: 200, chunks: sse(delta('<invoke name="respond"></invoke>'), delta("never read")) },
    ]);
    const client = new ModelClient(api.environment, { model: "m" });
    const seen: string[] = [];
    const reply = await client.complete({ ...request, onContent: (content) => void seen.push(content) });
    expect(reply.content).toBe('{"subject":"M"}');
    expect(seen).toEqual(['{"subject":"M"}']);
    const failure = await client.complete({ ...request, onContent: () => {} }).catch((error: unknown) => error);
    expect((failure as ModelError).failure).toEqual({ kind: "stream", reason: "tool-call markup instead of JSON" });
    expect(api.recorded).toHaveLength(2);
  });

  it("a stream that ends before the reply is finished is a stream failure, an error mid-stream too", async () => {
    const api = scriptedAPI([
      { status: 200, chunks: sse(delta('{"a":')) },
      { status: 200, chunks: sse(delta("{"), { error: { message: "provider fell over" } }) },
    ]);
    const client = new ModelClient(api.environment, { model: "m" });
    const first = await client.complete({ ...request, onContent: () => {} }).catch((error: unknown) => error);
    expect((first as ModelError).failure).toEqual({ kind: "stream", reason: "ended before the reply was finished" });
    const second = await client.complete({ ...request, onContent: () => {} }).catch((error: unknown) => error);
    expect((second as ModelError).failure).toEqual({ kind: "stream", reason: "error mid-stream: provider fell over" });
  });

  it("a refusal before the stream starts is the gateway's", async () => {
    const api = scriptedAPI([{ status: 402, body: '{"error":{"code":"quota_daily","message":"stop"}}' }]);
    const failure = await new ModelClient(api.environment, { model: "m" })
      .complete({ ...request, onContent: () => {} })
      .catch((error: unknown) => error);
    expect(isQuota(failure)).toBe(true);
    expect(api.recorded).toHaveLength(0);
  });

  it("a stream with no byte for the timeout is given up", async () => {
    const stalled: StreamingFetch = async () => ({
      status: 200,
      body: new ReadableStream<Uint8Array>({ pull: () => new Promise(() => {}) }),
      text: async () => "",
    });
    const environment: ModelEnvironment = {
      transport: async () => ({ url: "u", bearer: "b", kind: "backend" }),
      forceRefresh: async () => null,
      fetch: stalled,
    };
    const failure = await new ModelClient(environment, { model: "m" })
      .complete({ ...request, timeout: 0.05, onContent: () => {} })
      .catch((error: unknown) => error);
    expect((failure as ModelError).failure.kind).toBe("stream");
    expect(isTransient(failure)).toBe(false);
  });
});

describe("the first words", () => {
  it("no text in time is reported", async () => {
    const failure = await withFirstTextDeadline(
      0.05,
      () => {},
      () => new Promise<number>(() => {}),
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(NoTextInTime);
  });

  it("text in time keeps the answer", async () => {
    const seen: string[] = [];
    const value = await withFirstTextDeadline(
      0.2,
      (content) => seen.push(content),
      async (pass) => {
        pass("{");
        await new Promise((resolve) => setTimeout(resolve, 400));
        return 7;
      },
    );
    expect(value).toBe(7);
    expect(seen).toEqual(["{"]);
  });

  it("thinking before the first words is not given up on", async () => {
    const seen: string[] = [];
    const value = await withFirstTextDeadline(
      0.1,
      (content) => seen.push(content),
      async (pass, thinking) => {
        thinking();
        await new Promise((resolve) => setTimeout(resolve, 300));
        pass("{");
        return 3;
      },
    );
    expect(value).toBe(3);
    expect(seen).toEqual(["{"]);
  });
});
