// Port of LearnLayer/AI/AIGateway.swift @ ref 2026-11-04
//
// The pure half: where the API and the site are, and whether a call uses the local key. Picking the
// transport for a live call needs the session, which lives in the native side (src-tauri/src/session.rs).

import { absoluteHTTP, queryString } from "./urls";

export type AIPurpose = "chat" | "speech";

export interface AITransport {
  url: string;
  bearer: string;
  kind: "local" | "backend" | "none";
}

export type Environment = Readonly<Record<string, string | undefined>>;

export const productionBase = "https://api.learnlayer.app";
export const productionSite = "https://learnlayer.app";
export const chatPath = "/v1/chat/completions";
export const speechPath = "/v1/audio/speech";
export const localKeyFlags: ReadonlySet<string> = new Set([
  "-useLocalKey",
  "-eval",
  "-evalExam",
  "-evalPapers",
  "-evalFigures",
  "-evalTry",
  "-evalVariants",
  "-solve",
  "-illustrationCheck",
  "-voiceCheck",
  "-liveExplanation",
  "-evalFastTranscription",
  "-timeRead",
]);

export const openRouterChat = "https://openrouter.ai/api/v1/chat/completions";
export const openRouterSpeech = "https://openrouter.ai/api/v1/audio/speech";

const schemeOf = (url: string) => new URL(url).protocol.replace(/:$/, "").toLowerCase();

/**
 * Plain http is only for a local `wrangler dev`. Release builds refuse it, so a
 * stray LEARNLAYER_API_BASE can't send tokens and questions unencrypted.
 */
export function baseURL(environment: Environment, allowInsecure: boolean): string {
  const url = absoluteHTTP(environment["LEARNLAYER_API_BASE"]) ?? productionBase;
  if (!allowInsecure && schemeOf(url) !== "https") return productionBase;
  return url;
}

/** The marketing site. Login, account and checkout live here, not in the app. */
export function siteBase(environment: Environment): string {
  return absoluteHTTP(environment["LEARNLAYER_SITE_BASE"]) ?? productionSite;
}

function originAndPath(base: string): string {
  const url = new URL(base);
  const path = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
  return url.origin + path;
}

export function sitePage(path: string, query: Readonly<Record<string, string>>, environment: Environment): string {
  const page = originAndPath(siteBase(environment)) + (path.startsWith("/") ? path : "/" + path);
  const names = Object.keys(query).sort();
  if (names.length === 0) return page;
  return page + "?" + queryString(names.map((name) => [name, query[name] ?? ""] as const));
}

export function endpoint(path: string, base: string): string {
  return originAndPath(base) + path;
}

export interface LocalKeyQuestion {
  arguments: readonly string[];
  environment: Environment;
  hasLocalKey: boolean;
  hasSession: boolean;
  /** `#if DEBUG` on the Mac. A release build never uses the local key by default. */
  debug: boolean;
}

/**
 * Explicit flags win, so an evaluation uses the local key even if a session is saved.
 * Debug builds without a session also keep the key, so local runs still work.
 */
export function prefersLocalKey(question: LocalKeyQuestion): boolean {
  if (!question.hasLocalKey) return false;
  const explicit =
    question.environment["LEARNLAYER_USE_LOCAL_KEY"] === "1" ||
    question.arguments.some((argument) => localKeyFlags.has(argument));
  if (explicit) return true;
  if (question.debug && !question.hasSession && question.environment["LEARNLAYER_API_BASE"] === undefined) return true;
  return false;
}

/**
 * The fast transcription model is on OpenRouter only (the LearnLayer API does not list it). A debug
 * build with a stored key asks it with that key even when LEARNLAYER_API_BASE is set or a session is
 * saved, so a click on a flattened formula is typeset at once; release keeps `prefersLocalKey`.
 */
export function fastModelUsesLocalKey(question: LocalKeyQuestion): boolean {
  if (prefersLocalKey(question)) return true;
  return question.debug ? question.hasLocalKey : false;
}

/** Straight to OpenRouter with the stored key. */
export function localTransport(key: string): AITransport {
  return { url: openRouterChat, bearer: key, kind: "local" };
}

/** Checkout links are opened only when they are HTTPS on a Paddle host. */
export function isCheckoutURL(link: string): boolean {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return host === "paddle.com" || host.endsWith(".paddle.com");
}
