// Port of LearnLayer/Account/AppLogin.swift @ ref 2026-11-04

import { queryString } from "../ai/urls";
import { homeRouteScheme } from "./homeRoute";

/**
 * Browser sign-in: the app hands the website a PKCE challenge and takes back a one-time code on
 * `learnlayer://auth/callback`.
 */
export const redirectURI = "learnlayer://auth/callback";
export const billingSuccess = "learnlayer://billing/success";

export function base64URL(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** 32 random bytes, base64url, which is 43 characters and matches the API verifier. */
export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64URL(bytes);
}

export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64URL(new Uint8Array(digest));
}

export async function loginURL(site: string, verifier: string, state: string): Promise<string> {
  const url = new URL(site);
  let base = url.pathname;
  if (base.endsWith("/")) base = base.slice(0, -1);
  const query = queryString([
    ["code_challenge", await codeChallenge(verifier)],
    ["state", state],
    ["redirect_uri", redirectURI],
  ]);
  return `${url.origin}${base}/login?${query}`;
}

function parse(link: string): URL | null {
  try {
    return new URL(link);
  } catch {
    return null;
  }
}

const schemeOf = (url: URL) => url.protocol.replace(/:$/, "").toLowerCase();

export function isAuthCallback(link: string): boolean {
  const url = parse(link);
  if (!url || schemeOf(url) !== homeRouteScheme || url.hostname.toLowerCase() !== "auth") return false;
  return url.pathname === "/callback";
}

/** The one-time code and the state the website echoed. Null when either is missing. */
export function parseCallback(link: string): { code: string; state: string } | null {
  if (!isAuthCallback(link)) return null;
  const url = parse(link);
  const code = url?.searchParams.get("code");
  const state = url?.searchParams.get("state");
  if (!code || !state) return null;
  return { code, state };
}

export function isBillingSuccess(link: string): boolean {
  const url = parse(link);
  if (!url || schemeOf(url) !== homeRouteScheme || url.hostname.toLowerCase() !== "billing") return false;
  return url.pathname === "/success" || url.pathname === "";
}
