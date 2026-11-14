// Port of LearnLayerTests/BackendClientTests.swift @ ref 2026-11-04
// (`sessionRefreshesInsideTheLastMinute` is in src-tauri/src/session.rs, where the session lives;
// `quotaAndRateLimitsAreNotRetried` comes with the model client in phase 2.)

import { describe, expect, it } from "vitest";
import {
  baseURL,
  endpoint,
  fastModelUsesLocalKey,
  isCheckoutURL,
  localTransport,
  prefersLocalKey,
  productionBase,
  productionSite,
  siteBase,
  sitePage,
} from "./aiGateway";
import { BackendClient, BackendFailure, type Fetch } from "./backendClient";

/** Scripted HTTP for `BackendClient`. */
function scripted(responder: (url: string, init: Parameters<Fetch>[1]) => [number, string]) {
  const calls: { url: string; init: Parameters<Fetch>[1] }[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, init });
    const [status, body] = responder(url, init);
    return { status, text: async () => body };
  };
  return { client: new BackendClient("https://api.test", fetch), calls, last: () => calls[calls.length - 1]! };
}

describe("BackendClient", () => {
  it("verify decodes tokens, plans decode, checkout decodes", async () => {
    const tokens =
      '{"accessToken":"access","refreshToken":"refresh","accessExpiresAt":"2026-10-26T12:00:00Z","user":{"id":"u1","email":"ana@escola.pt"}}';
    let script = scripted(() => [200, tokens]);
    const decoded = await script.client.verify("ana@escola.pt", "123456", "Mac");
    expect(new URL(script.last().url).pathname).toBe("/v1/auth/email/verify");
    expect(script.last().init.headers["Authorization"]).toBeUndefined();
    expect(decoded.accessToken).toBe("access");
    expect(decoded.refreshToken).toBe("refresh");
    expect(decoded.user.email).toBe("ana@escola.pt");
    expect(decoded.user.name).toBeNull();
    expect(Math.abs(decoded.accessExpiresAt.getTime() / 1000 - 1_793_016_000)).toBeLessThan(1);

    const plans =
      '{"plans":[{"id":"paid","name":"LearnLayer","monthlyPriceCents":2000,"yearlyPriceCents":null,"currency":"EUR","dailyRequestLimit":150,"monthlyRequestLimit":2000,"monthlyCostLimitUsdMicros":8000000}]}';
    script = scripted(() => [200, plans]);
    const offers = await script.client.plans();
    expect(offers).toHaveLength(1);
    expect(offers[0]?.monthlyPriceCents).toBe(2_000);
    expect(offers[0]?.yearlyPriceCents).toBeNull();

    script = scripted(() => [200, '{"url":"https://sandbox-buy.paddle.com/checkout/abc","stub":false}']);
    const link = await script.client.checkout("access", "month");
    expect(script.last().init.headers["Authorization"]).toBe("Bearer access");
    expect(link.stub).toBe(false);
    expect(isCheckoutURL(link.url ?? "")).toBe(true);
  });

  it("fractional dates, stub checkout and error body", async () => {
    const me =
      '{"user":{"id":"u1","email":"ana@escola.pt"},"plan":{"id":"free","status":"active","interval":null,"renewsAt":null},"usage":{"dailyRequests":1,"dailyLimit":8,"monthlyRequests":2,"monthlyLimit":40,"monthlyCostUsdMicros":10,"monthlyCostLimitUsdMicros":400000,"resetsDailyAt":"2026-10-27T00:00:00.000Z","resetsMonthlyAt":"2026-11-01T00:00:00Z"}}';
    let script = scripted(() => [200, me]);
    const snapshot = await script.client.me("access");
    expect(snapshot.usage.dailyRequests).toBe(1);
    expect(snapshot.plan.interval).toBeNull();
    expect(snapshot.usage.resetsDailyAt.toISOString()).toBe("2026-10-27T00:00:00.000Z");

    script = scripted(() => [200, '{"url":null,"stub":true}']);
    const stub = await script.client.checkout("access", "month");
    expect(stub.stub).toBe(true);
    expect(stub.url).toBeNull();

    script = scripted(() => [400, '{"error":{"code":"bad_code","message":"no"}}']);
    const failure = await script.client.verify("ana@escola.pt", "000000", "Mac").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(BackendFailure);
    expect((failure as BackendFailure).status).toBe(400);
    expect((failure as BackendFailure).code).toBe("bad_code");
    expect((failure as BackendFailure).serverMessage).toBe("no");
  });

  it("devices and consents decode", async () => {
    let script = scripted(() => [
      200,
      '{"devices":[{"id":"d1","name":"MacBook","createdAt":"2026-10-01T10:00:00.000Z","lastSeenAt":null,"revoked":false,"current":true}]}',
    ]);
    const devices = await script.client.devices("t");
    expect(devices[0]?.current).toBe(true);
    expect(devices[0]?.lastSeenAt).toBeNull();
    expect(script.last().init.headers["Authorization"]).toBe("Bearer t");

    script = scripted(() => [
      200,
      '{"current":{"terms":"2026-10","privacy":"2026-10"},"upToDate":false,"consents":[]}',
    ]);
    const status = await script.client.consents("t");
    expect(status.upToDate).toBe(false);

    script = scripted((_url, init) => {
      const sent = JSON.parse(init.body ?? "{}") as { terms?: string; privacy?: string };
      return sent.terms === "2026-10" && sent.privacy === "2026-10" ? [200, '{"ok":true}'] : [400, ""];
    });
    await script.client.acceptConsents({ terms: "2026-10", privacy: "2026-10" }, "t");
    expect(script.last().init.method).toBe("POST");
  });

  it("blob put reads a conflict", async () => {
    let script = scripted(() => [409, '{"error":{"code":"version_conflict","message":""},"currentVersion":4}']);
    const blob = { expectedVersion: 3, keyVersion: 1, nonce: "n", ciphertext: "c" };
    expect(await script.client.putMemoryBlob("memoria-00", blob, "t")).toEqual({ kind: "conflict", currentVersion: 4 });
    expect(new URL(script.last().url).pathname).toBe("/v1/memory/blobs/memoria-00");

    script = scripted(() => [200, '{"ok":true,"version":5}']);
    expect(await script.client.putMemoryBlob("memoria-00", { ...blob, expectedVersion: 4 }, "t")).toEqual({
      kind: "stored",
      version: 5,
    });
  });

  it("delete surfaces the confirm error", async () => {
    const script = scripted(() => [400, '{"error":{"code":"confirm_email","message":"Type your email to confirm."}}']);
    const failure = await script.client.deleteAccount("x@y.pt", "t").catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(BackendFailure);
    expect(failure).toMatchObject({ status: 400, code: "confirm_email", serverMessage: "Type your email to confirm." });
  });

  it("an empty 2xx body is accepted where the Mac expects only ok", async () => {
    const script = scripted(() => [204, ""]);
    await expect(script.client.startEmail("ana@escola.pt")).resolves.toBeUndefined();
  });
});

describe("AIGateway", () => {
  it("site base stays configurable", () => {
    expect(siteBase({})).toBe(productionSite);
    expect(siteBase({ LEARNLAYER_SITE_BASE: "not a url" })).toBe(productionSite);
    const local = sitePage("/checkout", { interval: "month" }, { LEARNLAYER_SITE_BASE: "http://127.0.0.1:8787" });
    expect(local).toBe("http://127.0.0.1:8787/checkout?interval=month");
    const account = sitePage("/account", {}, { LEARNLAYER_SITE_BASE: "https://learnlayer.app/" });
    expect(account).toBe("https://learnlayer.app/account");
  });

  it("base URL and endpoint", () => {
    expect(baseURL({}, true)).toBe(productionBase);
    expect(baseURL({ LEARNLAYER_API_BASE: "not a url" }, true)).toBe(productionBase);
    expect(baseURL({ LEARNLAYER_API_BASE: "ftp://files.example" }, true)).toBe(productionBase);
    const local = baseURL({ LEARNLAYER_API_BASE: "http://127.0.0.1:8787" }, true);
    expect(local).toBe("http://127.0.0.1:8787");
    expect(endpoint("/v1/plans", local)).toBe("http://127.0.0.1:8787/v1/plans");
    expect(endpoint("/v1/me", "https://example.com/api/")).toBe("https://example.com/api/v1/me");
  });

  it("release builds refuse a plain HTTP base", () => {
    const local = { LEARNLAYER_API_BASE: "http://127.0.0.1:8787" };
    expect(baseURL(local, false)).toBe(productionBase);
    expect(baseURL(local, true)).toBe("http://127.0.0.1:8787");
    expect(baseURL({ LEARNLAYER_API_BASE: "https://staging.example.com" }, false)).toBe("https://staging.example.com");
  });

  it("local key flags win and debug keeps an unattended key", () => {
    for (const flag of ["-eval", "-evalPapers", "-solve", "-useLocalKey"]) {
      for (const debug of [true, false]) {
        expect(
          prefersLocalKey({
            arguments: ["LearnLayer", flag],
            environment: {},
            hasLocalKey: true,
            hasSession: true,
            debug,
          }),
        ).toBe(true);
      }
    }
    expect(
      prefersLocalKey({
        arguments: ["LearnLayer"],
        environment: { LEARNLAYER_USE_LOCAL_KEY: "1" },
        hasLocalKey: true,
        hasSession: true,
        debug: false,
      }),
    ).toBe(true);
    const base = { arguments: ["LearnLayer"], environment: {}, debug: true };
    expect(
      prefersLocalKey({ ...base, arguments: ["LearnLayer", "-eval"], hasLocalKey: false, hasSession: false }),
    ).toBe(false);
    expect(prefersLocalKey({ ...base, hasLocalKey: true, hasSession: true })).toBe(false);

    const pointed = { LEARNLAYER_API_BASE: "http://127.0.0.1:8787" };
    // Debug: an unattended key is used unless the build is pointed at an API.
    expect(prefersLocalKey({ ...base, hasLocalKey: true, hasSession: false })).toBe(true);
    expect(prefersLocalKey({ ...base, environment: pointed, hasLocalKey: true, hasSession: false })).toBe(false);
    // Release: never by default.
    expect(prefersLocalKey({ ...base, debug: false, hasLocalKey: true, hasSession: false })).toBe(false);
    expect(prefersLocalKey({ ...base, debug: false, environment: pointed, hasLocalKey: true, hasSession: false })).toBe(
      false,
    );
  });

  it("debug asks the fast model with its key even when pointed at the API", () => {
    const pointed = { LEARNLAYER_API_BASE: "https://learnlayer-api-test.example.workers.dev" };
    const plain = { arguments: ["LearnLayer"], environment: pointed };
    for (const debug of [true, false]) {
      expect(fastModelUsesLocalKey({ ...plain, hasLocalKey: false, hasSession: false, debug })).toBe(false);
      expect(
        fastModelUsesLocalKey({
          arguments: ["LearnLayer", "-eval"],
          environment: {},
          hasLocalKey: false,
          hasSession: true,
          debug,
        }),
      ).toBe(false);
      expect(
        fastModelUsesLocalKey({
          arguments: ["LearnLayer", "-useLocalKey"],
          environment: pointed,
          hasLocalKey: true,
          hasSession: true,
          debug,
        }),
      ).toBe(true);
      expect(fastModelUsesLocalKey({ ...plain, hasLocalKey: true, hasSession: false, debug })).toBe(debug);
      expect(fastModelUsesLocalKey({ ...plain, hasLocalKey: true, hasSession: true, debug })).toBe(debug);
    }
    const local = localTransport("sk-or-test");
    expect(local.kind).toBe("local");
    expect(local.bearer).toBe("sk-or-test");
    expect(new URL(local.url).hostname).toBe("openrouter.ai");
  });

  it("checkout URLs stay on Paddle", () => {
    expect(isCheckoutURL("https://buy.paddle.com/checkout/abc")).toBe(true);
    expect(isCheckoutURL("https://sandbox-buy.paddle.com/checkout/abc")).toBe(true);
    expect(isCheckoutURL("https://paddle.com/")).toBe(true);
    expect(isCheckoutURL("http://buy.paddle.com/checkout/abc")).toBe(false);
    expect(isCheckoutURL("https://paddle.com.evil.test/checkout")).toBe(false);
    expect(isCheckoutURL("https://notpaddle.com/buy.paddle.com")).toBe(false);
  });
});
