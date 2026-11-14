// Port of LearnLayerTests/AppLoginTests.swift @ ref 2026-11-04

import { describe, expect, it } from "vitest";
import { codeChallenge, isAuthCallback, isBillingSuccess, loginURL, parseCallback, randomToken } from "./appLogin";

describe("AppLogin", () => {
  it("challenge matches the RFC 7636 vector", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(await codeChallenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("login URL carries the challenge and the app callback", async () => {
    const link = await loginURL(
      "https://learnlayer.app",
      "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      "app-state-value-1",
    );
    const url = new URL(link);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("code_challenge")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    expect(url.searchParams.get("state")).toBe("app-state-value-1");
    expect(url.searchParams.get("redirect_uri")).toBe("learnlayer://auth/callback");
  });

  it("writes the link exactly as the Mac app does", async () => {
    const link = await loginURL("https://learnlayer.app/", "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", "s1");
    expect(link).toBe(
      "https://learnlayer.app/login?code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&state=s1&redirect_uri=learnlayer://auth/callback",
    );
  });

  it("callback keeps the one-time code", () => {
    const link = "learnlayer://auth/callback?code=one-time&state=app-state-value-1";
    expect(isAuthCallback(link)).toBe(true);
    const parsed = parseCallback(link);
    expect(parsed?.code).toBe("one-time");
    expect(parsed?.state).toBe("app-state-value-1");
    expect(parseCallback("learnlayer://auth/callback?state=only")).toBeNull();
    expect(isAuthCallback("learnlayer://account")).toBe(false);
  });

  it("billing success opens the plan page", () => {
    expect(isBillingSuccess("learnlayer://billing/success")).toBe(true);
    expect(isBillingSuccess("learnlayer://billing/other")).toBe(false);
    expect(isBillingSuccess("https://learnlayer.app/checkout/success")).toBe(false);
  });

  it("random tokens are 43 base64url characters and differ", () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
});
