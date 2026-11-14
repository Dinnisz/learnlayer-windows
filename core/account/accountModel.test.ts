// AccountModel.swift has no test class of its own on the Mac; `consentToAsk` and `PlanDefaults` are
// checked in BrainSyncTests.swift and SettingsTests.swift, ported here. The rest covers the sign-in
// and plan flows of phase 1 against a scripted API.

import { describe, expect, it } from "vitest";
import { BackendClient, type AuthTokens, type Fetch } from "../ai/backendClient";
import {
  AccountModel,
  consentToAsk,
  planKey,
  PlanDefaults,
  type Preferences,
  type SessionGateway,
} from "./accountModel";
import { deviceNameFor } from "../platform";
import { codeChallenge } from "./appLogin";

type Reply = [number, string];

const tokensJSON = (access = "access-1", refresh = "refresh-1") =>
  JSON.stringify({
    accessToken: access,
    refreshToken: refresh,
    accessExpiresAt: "2026-11-14T16:41:00.000Z",
    user: { id: "u1", email: "ana@escola.pt", name: null },
  });

const meJSON = (plan = "free", monthlyRequests = 2) =>
  JSON.stringify({
    user: { id: "u1", email: "ana@escola.pt" },
    plan: { id: plan, status: "active", interval: plan === "free" ? null : "month", renewsAt: null },
    usage: {
      dailyRequests: 1,
      dailyLimit: 8,
      monthlyRequests,
      monthlyLimit: 30,
      monthlyCostUsdMicros: 10,
      monthlyCostLimitUsdMicros: 400000,
      resetsDailyAt: "2026-11-15T00:00:00.000Z",
      resetsMonthlyAt: "2026-12-01T00:00:00Z",
    },
  });

const plansJSON = JSON.stringify({
  currency: "EUR",
  plans: [
    {
      id: "free",
      name: "Free",
      monthlyPriceCents: 0,
      yearlyPriceCents: null,
      currency: "EUR",
      dailyRequestLimit: 8,
      monthlyRequestLimit: 30,
      monthlyCostLimitUsdMicros: 400000,
    },
  ],
});

class FakeSession implements SessionGateway {
  tokens: AuthTokens | null = null;
  handoff: { verifier: string; state: string } | null = null;
  userID = "";
  signOuts = 0;

  async status() {
    return { signedIn: this.tokens !== null, email: this.tokens?.user.email ?? "", userID: this.userID };
  }
  async accessToken() {
    return this.tokens?.accessToken ?? null;
  }
  async save(tokens: AuthTokens) {
    this.tokens = tokens;
    this.userID = tokens.user.id;
    return true;
  }
  async signOut() {
    this.signOuts += 1;
    this.tokens = null;
  }
  async clear() {
    this.tokens = null;
  }
  async rememberUserID(id: string) {
    this.userID = id;
  }
  async saveHandoff(verifier: string, state: string) {
    this.handoff = { verifier, state };
    return true;
  }
  async loadHandoff() {
    return this.handoff;
  }
  async clearHandoff() {
    this.handoff = null;
  }
}

function memoryPreferences(): Preferences & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    get: (key) => values.get(key) ?? null,
    set: (key, value) => void values.set(key, value),
    remove: (key) => void values.delete(key),
  };
}

function setup(routes: Record<string, Reply | ((body: string) => Reply)>) {
  const requests: { path: string; method: string; body: string; authorization?: string }[] = [];
  const fetch: Fetch = async (url, init) => {
    const path = new URL(url).pathname;
    requests.push({ path, method: init.method, body: init.body ?? "", authorization: init.headers["Authorization"] });
    const route = routes[`${init.method} ${path}`];
    const [status, body] = route ? (typeof route === "function" ? route(init.body ?? "") : route) : [404, ""];
    return { status, text: async () => body };
  };
  const session = new FakeSession();
  const preferences = memoryPreferences();
  const opened: string[] = [];
  const forgotten: string[] = [];
  const model = new AccountModel({
    client: new BackendClient("https://api.test", fetch),
    session,
    preferences,
    environment: { LEARNLAYER_SITE_BASE: "https://site.test" },
    open: (url) => void opened.push(url),
    deviceName: () => "Windows · DESKTOP-TEST",
    forgetSyncKeys: (id) => void forgotten.push(id),
  });
  return { model, session, preferences, opened, forgotten, requests };
}

const signedInRoutes = {
  "GET /v1/plans": [200, plansJSON] as Reply,
  "GET /v1/me": [200, meJSON()] as Reply,
  "GET /v1/account/consents": [
    200,
    '{"current":{"terms":"2026-10","privacy":"2026-10"},"upToDate":true,"consents":[]}',
  ] as Reply,
};

describe("AccountModel sign-in", () => {
  it("opens the site with a PKCE challenge and keeps the verifier here", async () => {
    const { model, session, opened } = setup({});
    await model.beginBrowserSignIn();
    expect(opened).toHaveLength(1);
    const url = new URL(opened[0]!);
    expect(url.origin + url.pathname).toBe("https://site.test/login");
    expect(url.searchParams.get("redirect_uri")).toBe("learnlayer://auth/callback");
    expect(url.searchParams.get("state")).toBe(session.handoff?.state);
    expect(url.searchParams.get("code_challenge")).toBe(await codeChallenge(session.handoff!.verifier));
    expect(opened[0]).not.toContain(session.handoff!.verifier);
  });

  it("trades the one-time code for a session and reads the plan", async () => {
    const { model, session, preferences, requests } = setup({
      ...signedInRoutes,
      "POST /v1/auth/app/token": [200, tokensJSON()],
    });
    await model.beginBrowserSignIn();
    const { state, verifier } = session.handoff!;
    const outcome = await model.handleLink(`learnlayer://auth/callback?code=one-time&state=${state}`);
    expect(outcome).toEqual({ kind: "signedIn" });
    const exchange = requests.find((request) => request.path === "/v1/auth/app/token")!;
    expect(JSON.parse(exchange.body)).toEqual({
      code: "one-time",
      codeVerifier: verifier,
      deviceName: "Windows · DESKTOP-TEST",
    });
    expect(session.handoff).toBeNull();
    expect(model.state.isSignedIn).toBe(true);
    expect(model.state.email).toBe("ana@escola.pt");
    expect(model.state.snapshot?.plan.id).toBe("free");
    expect(model.state.banner).toBeNull();
    expect(preferences.get(planKey)).toBe("free");
    expect(requests.find((request) => request.path === "/v1/me")?.authorization).toBe("Bearer access-1");
  });

  it("refuses a callback whose state is not the one this computer sent", async () => {
    const { model, session, requests } = setup({ "POST /v1/auth/app/token": [200, tokensJSON()] });
    await model.beginBrowserSignIn();
    const outcome = await model.handleLink("learnlayer://auth/callback?code=one-time&state=someone-elses");
    expect(outcome).toEqual({ kind: "route", route: "account" });
    expect(model.state.banner).toBe("That sign-in link didn’t match this Mac.");
    expect(session.handoff).toBeNull();
    expect(session.tokens).toBeNull();
    expect(requests.some((request) => request.path === "/v1/auth/app/token")).toBe(false);
  });

  it("a second click on the same link does not sign in twice", async () => {
    const { model, session, requests } = setup({ ...signedInRoutes, "POST /v1/auth/app/token": [200, tokensJSON()] });
    await model.beginBrowserSignIn();
    const link = `learnlayer://auth/callback?code=one-time&state=${session.handoff!.state}`;
    await model.handleLink(link);
    await model.handleLink(link);
    expect(requests.filter((request) => request.path === "/v1/auth/app/token")).toHaveLength(1);
    expect(model.state.isSignedIn).toBe(true);
  });

  it("signs in with an email code and names the errors", async () => {
    const { model } = setup({
      ...signedInRoutes,
      "POST /v1/auth/email/start": [200, '{"ok":true}'],
      "POST /v1/auth/email/verify": (body) =>
        (JSON.parse(body) as { code: string }).code === "123456"
          ? [200, tokensJSON()]
          : [400, '{"error":{"code":"bad_code","message":"no"}}'],
    });
    expect(await model.startEmailCode(" ana@escola.pt ")).toBeNull();
    expect(await model.verifyEmailCode("ana@escola.pt", "000000")).toBe("That code didn’t work. Try again.");
    expect(model.state.isSignedIn).toBe(false);
    expect(await model.verifyEmailCode("ana@escola.pt", "123456")).toBeNull();
    expect(model.state.isSignedIn).toBe(true);

    const limited = setup({ "POST /v1/auth/email/start": [429, '{"error":{"code":"rate_limited","message":""}}'] });
    expect(await limited.model.startEmailCode("ana@escola.pt")).toBe("Too many attempts. Wait a minute and try again.");
  });
});

describe("AccountModel plan and usage", () => {
  it("shows the server's plans even when signed out", async () => {
    const { model } = setup({ "GET /v1/plans": [200, plansJSON] });
    await model.refresh();
    expect(model.state.plans.map((plan) => plan.id)).toEqual(["free"]);
    expect(model.state.isSignedIn).toBe(false);
    expect(model.state.snapshot).toBeNull();
  });

  it("says when the allowance is used and stores a paid plan as paid", async () => {
    const { model, session, preferences } = setup({ ...signedInRoutes, "GET /v1/me": [200, meJSON("plus", 30)] });
    await session.save({ ...JSON.parse(tokensJSON()), accessExpiresAt: new Date() });
    await model.refresh();
    expect(model.state.banner).toBe("You’ve used this month’s allowance.");
    expect(preferences.get(planKey)).toBe("paid");
  });

  it("says when LearnLayer can't be reached", async () => {
    const { model, session } = setup({ "GET /v1/me": [500, ""] });
    await session.save({ ...JSON.parse(tokensJSON()), accessExpiresAt: new Date() });
    await model.refresh();
    expect(model.state.banner).toBe("Couldn’t reach LearnLayer. Try again.");
    expect(model.state.isSignedIn).toBe(true);
  });

  it("upgrade opens the site checkout, never Paddle", async () => {
    const { model, opened } = setup({});
    model.upgradeMonthly();
    model.upgrade("pro");
    model.openAccountSite();
    expect(opened).toEqual([
      "https://site.test/checkout?interval=month&plan=plus",
      "https://site.test/checkout?interval=month&plan=pro",
      "https://site.test/account",
    ]);
  });

  it("billing success refreshes the plan and opens Plan & usage", async () => {
    const { model, session, requests } = setup({ ...signedInRoutes, "GET /v1/me": [200, meJSON("plus")] });
    await session.save({ ...JSON.parse(tokensJSON()), accessExpiresAt: new Date() });
    expect(await model.handleLink("learnlayer://billing/success")).toEqual({ kind: "route", route: "plan" });
    expect(model.state.snapshot?.plan.id).toBe("plus");
    expect(requests.some((request) => request.path === "/v1/me")).toBe(true);
  });

  it("other links name a section or are ignored", async () => {
    const { model } = setup({});
    expect(await model.handleLink("learnlayer://settings/permissions")).toEqual({
      kind: "route",
      route: "permissions",
    });
    expect(await model.handleLink("learnlayer://nowhere")).toEqual({ kind: "ignored" });
  });
});

describe("AccountModel sign-out, devices and delete", () => {
  it("sign-out tells the server and forgets the plan", async () => {
    const { model, session, preferences } = setup(signedInRoutes);
    await session.save({ ...JSON.parse(tokensJSON()), accessExpiresAt: new Date() });
    await model.refresh();
    await model.signOut();
    expect(session.signOuts).toBe(1);
    expect(model.state.isSignedIn).toBe(false);
    expect(model.state.snapshot).toBeNull();
    expect(preferences.get(planKey)).toBeNull();
  });

  it("lists devices with this one first and hides revoked ones", async () => {
    const device = (id: string, name: string, current: boolean, revoked = false) => ({
      id,
      name,
      createdAt: "2026-10-01T10:00:00.000Z",
      lastSeenAt: null,
      revoked,
      current,
    });
    const { model, session } = setup({
      ...signedInRoutes,
      "GET /v1/devices": [
        200,
        JSON.stringify({
          devices: [
            device("d2", "MacBook", false),
            device("d3", "Old", false, true),
            device("d1", "Windows · PC", true),
          ],
        }),
      ],
    });
    await session.save({ ...JSON.parse(tokensJSON()), accessExpiresAt: new Date() });
    await model.refresh();
    await model.loadDevices();
    expect(model.state.devices.map((entry) => entry.id)).toEqual(["d1", "d2"]);
  });

  it("delete needs the right email and forgets the sync keys", async () => {
    const { model, session, forgotten } = setup({
      ...signedInRoutes,
      "POST /v1/account/delete": (body) =>
        (JSON.parse(body) as { confirm: string }).confirm === "ana@escola.pt"
          ? [200, '{"ok":true}']
          : [400, '{"error":{"code":"confirm_email","message":"Type your email to confirm."}}'],
    });
    await session.save({ ...JSON.parse(tokensJSON()), accessExpiresAt: new Date() });
    await model.refresh();
    expect(await model.deleteAccount("x@y.pt")).toBe("wrongEmail");
    expect(model.state.isSignedIn).toBe(true);
    expect(await model.deleteAccount("  ana@escola.pt ")).toBe("deleted");
    expect(forgotten).toEqual(["u1"]);
    expect(model.state.isSignedIn).toBe(false);
    expect(session.tokens).toBeNull();
  });

  it("asks for consent only when the versions changed (BrainSyncTests)", () => {
    const current = { terms: "2026-10", privacy: "2026-10" };
    expect(consentToAsk({ current, upToDate: true })).toBeNull();
    expect(consentToAsk({ current, upToDate: false })).toEqual(current);
  });

  it("accepting stale terms asks again with the new versions", async () => {
    let stale = true;
    const { model, session } = setup({
      ...signedInRoutes,
      "GET /v1/account/consents": () => [
        200,
        JSON.stringify({ current: { terms: stale ? "2026-10" : "2026-11", privacy: "2026-10" }, upToDate: false }),
      ],
      "POST /v1/account/consents": () =>
        stale ? ((stale = false), [409, '{"error":{"code":"stale_version","message":""}}']) : [200, '{"ok":true}'],
    });
    await session.save({ ...JSON.parse(tokensJSON()), accessExpiresAt: new Date() });
    await model.refresh();
    expect(model.state.pendingConsent?.terms).toBe("2026-10");
    expect(await model.acceptConsent()).toBe(false);
    expect(model.state.pendingConsent?.terms).toBe("2026-11");
    expect(await model.acceptConsent()).toBe(true);
    expect(model.state.pendingConsent).toBeNull();
  });
});

describe("PlanDefaults (SettingsTests)", () => {
  it("match the production plans", () => {
    expect(PlanDefaults.freeDailyRequests).toBeGreaterThan(0);
    expect(PlanDefaults.freeDailyRequests).toBeLessThanOrEqual(PlanDefaults.freeMonthlyRequests);
    expect(PlanDefaults.paidDailyRequests).toBeLessThanOrEqual(PlanDefaults.paidMonthlyRequests);
    expect(PlanDefaults.freeMonthlyRequests).toBeLessThan(PlanDefaults.paidMonthlyRequests);
    expect(PlanDefaults.paidMonthlyCents).toBe(2_000);
    expect(PlanDefaults.yearlyPriceCents).toBe(19_000);
    expect(PlanDefaults.freeMonthlyRequests).toBe(30);
    expect(PlanDefaults.paidMonthlyRequests).toBe(350);
    expect(PlanDefaults.proMonthlyCents).toBe(5_000);
    expect(PlanDefaults.freeDailyRequests).toBe(8);
    expect(PlanDefaults.paidDailyRequests).toBe(35);
    expect(PlanDefaults.proDailyRequests).toBe(100);
    expect(PlanDefaults.proYearlyCents).toBe(48_000);
    expect(PlanDefaults.proDailyRequests).toBeLessThanOrEqual(PlanDefaults.proMonthlyRequests);
    expect(PlanDefaults.paidMonthlyRequests).toBeLessThan(PlanDefaults.proMonthlyRequests);
  });
});

describe("deviceNameFor", () => {
  it("names the computer and stays within 80 characters", () => {
    expect(deviceNameFor("DESKTOP-ABC", "windows")).toBe("Windows · DESKTOP-ABC");
    expect(deviceNameFor("  ", "windows")).toBe("Windows");
    expect(deviceNameFor("X".repeat(200), "windows")).toHaveLength(80);
    expect(deviceNameFor("MacBook-Air-da-Ana.local", "macos")).toBe("MacBook-Air-da-Ana.local");
  });
});
