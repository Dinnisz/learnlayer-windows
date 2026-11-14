// Port of LearnLayer/AI/BackendClient.swift and LearnLayer/Account/AccountAPI.swift @ ref 2026-11-04

import { endpoint } from "./aiGateway";

export interface AccountUser {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  user: AccountUser;
}

export interface AccountPlan {
  id: string;
  status: string;
  interval: string | null;
  renewsAt: Date | null;
}

export interface AccountUsage {
  dailyRequests: number;
  dailyLimit: number;
  monthlyRequests: number;
  monthlyLimit: number;
  monthlyCostUsdMicros: number;
  monthlyCostLimitUsdMicros: number;
  resetsDailyAt: Date;
  resetsMonthlyAt: Date;
}

export interface AccountSnapshot {
  user: AccountUser;
  plan: AccountPlan;
  usage: AccountUsage;
}

export interface PlanOffer {
  id: string;
  name: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number | null;
  currency: string;
  dailyRequestLimit: number;
  monthlyRequestLimit: number;
  monthlyCostLimitUsdMicros: number;
}

export interface CheckoutLink {
  url: string | null;
  stub: boolean;
}

export interface RemoteDevice {
  id: string;
  name: string;
  createdAt: Date;
  lastSeenAt: Date | null;
  revoked: boolean;
  current: boolean;
}

export interface ConsentVersions {
  terms: string;
  privacy: string;
}

export interface ConsentStatus {
  current: ConsentVersions;
  upToDate: boolean;
}

export interface RemoteDeviceKey {
  deviceId: string;
  keyVersion: number;
  publicKey: string;
  wrappedKey?: string | null;
}

export interface RemoteBlob {
  id: string;
  version: number;
  keyVersion: number;
  nonce: string;
  ciphertext: string;
}

export type BlobPutResult = { kind: "stored"; version: number } | { kind: "conflict"; currentVersion: number };

export class BackendFailure extends Error {
  readonly status: number;
  readonly code: string;
  readonly serverMessage: string;

  constructor(status: number, code: string, message: string) {
    super(`${status} ${code}${message ? `: ${message}` : ""}`);
    this.name = "BackendFailure";
    this.status = status;
    this.code = code;
    this.serverMessage = message;
  }
}

/** A value the server sent in a shape this client does not read. */
export class DecodingFailure extends Error {
  constructor(what: string) {
    super(`Could not decode ${what}`);
    this.name = "DecodingFailure";
  }
}

/** ISO 8601 with or without fractional seconds, as `BackendClient.decoder` accepts. */
export function parseDate(text: unknown): Date {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(text)) {
    throw new DecodingFailure(`date ${JSON.stringify(text)}`);
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new DecodingFailure(`date ${JSON.stringify(text)}`);
  return date;
}

type Json = Record<string, unknown>;

function object(value: unknown, what: string): Json {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new DecodingFailure(what);
  return value as Json;
}

function string(value: unknown, what: string): string {
  if (typeof value !== "string") throw new DecodingFailure(what);
  return value;
}

function integer(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new DecodingFailure(what);
  return value;
}

function boolean(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") throw new DecodingFailure(what);
  return value;
}

const optional = <T>(value: unknown, read: (value: unknown) => T): T | null =>
  value === null || value === undefined ? null : read(value);

function decodeUser(value: unknown): AccountUser {
  const json = object(value, "user");
  return {
    id: string(json.id, "user.id"),
    email: string(json.email, "user.email"),
    name: optional(json.name, (name) => string(name, "user.name")),
  };
}

export function decodeTokens(value: unknown): AuthTokens {
  const json = object(value, "tokens");
  return {
    accessToken: string(json.accessToken, "accessToken"),
    refreshToken: string(json.refreshToken, "refreshToken"),
    accessExpiresAt: parseDate(json.accessExpiresAt),
    user: decodeUser(json.user),
  };
}

export function decodeSnapshot(value: unknown): AccountSnapshot {
  const json = object(value, "account");
  const plan = object(json.plan, "plan");
  const usage = object(json.usage, "usage");
  return {
    user: decodeUser(json.user),
    plan: {
      id: string(plan.id, "plan.id"),
      status: string(plan.status, "plan.status"),
      interval: optional(plan.interval, (interval) => string(interval, "plan.interval")),
      renewsAt: optional(plan.renewsAt, parseDate),
    },
    usage: {
      dailyRequests: integer(usage.dailyRequests, "usage.dailyRequests"),
      dailyLimit: integer(usage.dailyLimit, "usage.dailyLimit"),
      monthlyRequests: integer(usage.monthlyRequests, "usage.monthlyRequests"),
      monthlyLimit: integer(usage.monthlyLimit, "usage.monthlyLimit"),
      monthlyCostUsdMicros: integer(usage.monthlyCostUsdMicros, "usage.monthlyCostUsdMicros"),
      monthlyCostLimitUsdMicros: integer(usage.monthlyCostLimitUsdMicros, "usage.monthlyCostLimitUsdMicros"),
      resetsDailyAt: parseDate(usage.resetsDailyAt),
      resetsMonthlyAt: parseDate(usage.resetsMonthlyAt),
    },
  };
}

function decodePlanOffer(value: unknown): PlanOffer {
  const json = object(value, "plan offer");
  return {
    id: string(json.id, "plan.id"),
    name: string(json.name, "plan.name"),
    monthlyPriceCents: integer(json.monthlyPriceCents, "plan.monthlyPriceCents"),
    yearlyPriceCents: optional(json.yearlyPriceCents, (cents) => integer(cents, "plan.yearlyPriceCents")),
    currency: string(json.currency, "plan.currency"),
    dailyRequestLimit: integer(json.dailyRequestLimit, "plan.dailyRequestLimit"),
    monthlyRequestLimit: integer(json.monthlyRequestLimit, "plan.monthlyRequestLimit"),
    monthlyCostLimitUsdMicros: integer(json.monthlyCostLimitUsdMicros, "plan.monthlyCostLimitUsdMicros"),
  };
}

function decodeDevice(value: unknown): RemoteDevice {
  const json = object(value, "device");
  return {
    id: string(json.id, "device.id"),
    name: string(json.name, "device.name"),
    createdAt: parseDate(json.createdAt),
    lastSeenAt: optional(json.lastSeenAt, parseDate),
    revoked: boolean(json.revoked, "device.revoked"),
    current: boolean(json.current, "device.current"),
  };
}

function decodeConsentVersions(value: unknown): ConsentVersions {
  const json = object(value, "consent versions");
  return { terms: string(json.terms, "terms"), privacy: string(json.privacy, "privacy") };
}

function list<T>(value: unknown, what: string, read: (value: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new DecodingFailure(what);
  return value.map(read);
}

/** The slice of `fetch` this client needs, so tests can script the answers. */
export type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ status: number; text(): Promise<string> }>;

export interface RawResponse {
  status: number;
  body: string;
}

/** The app’s calls to the LearnLayer API. The OpenRouter key never leaves the server. */
export class BackendClient {
  readonly baseURL: string;
  private readonly fetch: Fetch;
  /** Seconds, as the Mac's `URLRequest(timeoutInterval: 30)`. */
  timeoutSeconds = 30;

  constructor(baseURL: string, fetch: Fetch) {
    this.baseURL = baseURL;
    this.fetch = fetch;
  }

  async startEmail(email: string): Promise<void> {
    await this.send("/v1/auth/email/start", "POST", { email }, null);
  }

  async verify(email: string, code: string, deviceName: string): Promise<AuthTokens> {
    return decodeTokens(await this.send("/v1/auth/email/verify", "POST", { email, code, deviceName }, null));
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    return decodeTokens(await this.send("/v1/auth/refresh", "POST", { refreshToken }, null));
  }

  async logout(accessToken: string, refreshToken: string): Promise<void> {
    await this.send("/v1/auth/logout", "POST", { refreshToken }, accessToken);
  }

  async me(accessToken: string): Promise<AccountSnapshot> {
    return decodeSnapshot(await this.send("/v1/me", "GET", null, accessToken));
  }

  async plans(): Promise<PlanOffer[]> {
    const body = object(await this.send("/v1/plans", "GET", null, null), "plans");
    return list(body.plans, "plans", decodePlanOffer);
  }

  async exchangeAppCode(code: string, codeVerifier: string, deviceName: string): Promise<AuthTokens> {
    return decodeTokens(await this.send("/v1/auth/app/token", "POST", { code, codeVerifier, deviceName }, null));
  }

  async checkout(accessToken: string, interval: string): Promise<CheckoutLink> {
    const body = object(await this.send("/v1/billing/checkout", "POST", { interval }, accessToken), "checkout");
    return { url: optional(body.url, (url) => string(url, "checkout.url")), stub: boolean(body.stub, "checkout.stub") };
  }

  // MARK: Devices, consents, export, delete and the encrypted memory endpoints (AccountAPI.swift)

  async devices(accessToken: string): Promise<RemoteDevice[]> {
    const body = object(await this.send("/v1/devices", "GET", null, accessToken), "devices");
    return list(body.devices, "devices", decodeDevice);
  }

  async revokeDevice(id: string, accessToken: string): Promise<void> {
    const escaped = Array.from(id, (character) =>
      /[A-Za-z0-9]/.test(character) ? character : encodeURIComponent(character),
    ).join("");
    await this.send(`/v1/devices/${escaped}/revoke`, "POST", {}, accessToken);
  }

  async consents(accessToken: string): Promise<ConsentStatus> {
    const body = object(await this.send("/v1/account/consents", "GET", null, accessToken), "consents");
    return { current: decodeConsentVersions(body.current), upToDate: boolean(body.upToDate, "upToDate") };
  }

  async acceptConsents(versions: ConsentVersions, accessToken: string): Promise<void> {
    await this.send("/v1/account/consents", "POST", { terms: versions.terms, privacy: versions.privacy }, accessToken);
  }

  /** The export as the server wrote it, so the file keeps every field. */
  async exportAccount(accessToken: string): Promise<string> {
    const { status, body } = await this.raw("/v1/account/export", "GET", null, accessToken);
    if (status < 200 || status >= 300) throw new BackendFailure(status, "http", "");
    return body;
  }

  async deleteAccount(confirmEmail: string, accessToken: string): Promise<void> {
    await this.send("/v1/account/delete", "POST", { confirm: confirmEmail }, accessToken);
  }

  async memoryKeys(accessToken: string): Promise<RemoteDeviceKey[]> {
    const body = object(await this.send("/v1/memory/keys", "GET", null, accessToken), "memory keys");
    return list(body.keys, "memory keys", (value) => {
      const json = object(value, "memory key");
      return {
        deviceId: string(json.deviceId, "deviceId"),
        keyVersion: integer(json.keyVersion, "keyVersion"),
        publicKey: string(json.publicKey, "publicKey"),
        wrappedKey: optional(json.wrappedKey, (key) => string(key, "wrappedKey")),
      };
    });
  }

  async putMemoryKey(key: RemoteDeviceKey, accessToken: string): Promise<void> {
    await this.send("/v1/memory/keys", "PUT", { ...key }, accessToken);
  }

  async memoryBlobs(accessToken: string): Promise<RemoteBlob[]> {
    const body = object(await this.send("/v1/memory/blobs", "GET", null, accessToken), "memory blobs");
    return list(body.blobs, "memory blobs", (value) => {
      const json = object(value, "memory blob");
      return {
        id: string(json.id, "blob.id"),
        version: integer(json.version, "blob.version"),
        keyVersion: integer(json.keyVersion, "blob.keyVersion"),
        nonce: string(json.nonce, "blob.nonce"),
        ciphertext: string(json.ciphertext, "blob.ciphertext"),
      };
    });
  }

  async putMemoryBlob(
    id: string,
    blob: { expectedVersion: number; keyVersion: number; nonce: string; ciphertext: string },
    accessToken: string,
  ): Promise<BlobPutResult> {
    const { status, body } = await this.raw("/v1/memory/blobs/" + id, "PUT", { ...blob }, accessToken);
    if (status === 409) {
      const conflict = safeParse(body);
      if (conflict !== undefined) {
        const current = (conflict as Json | null)?.currentVersion;
        return { kind: "conflict", currentVersion: typeof current === "number" ? current : 0 };
      }
    }
    if (status < 200 || status >= 300) throw new BackendFailure(status, status === 401 ? "unauthorized" : "http", "");
    const stored = object(safeParse(body), "stored blob");
    return { kind: "stored", version: integer(stored.version, "version") };
  }

  // MARK: Transport

  /** Any JSON body. Throws `BackendFailure` for a non-2xx answer. An empty 2xx body is `{}`. */
  async send(path: string, method: string, json: Json | null, token: string | null): Promise<unknown> {
    const { status, body } = await this.raw(path, method, json, token);
    if (status < 200 || status >= 300) {
      const parsed = safeParse(body) as { error?: { code?: unknown; message?: unknown } } | null | undefined;
      const code = typeof parsed?.error?.code === "string" ? parsed.error.code : "http";
      const message = typeof parsed?.error?.message === "string" ? parsed.error.message : "";
      throw new BackendFailure(status, code, message);
    }
    if (body === "") return {};
    const value = safeParse(body);
    if (value === undefined) throw new DecodingFailure(`the answer of ${path}`);
    return value;
  }

  /** The status and body as they came, for callers that read an error body themselves. */
  async raw(path: string, method: string, json: Json | null, token: string | null): Promise<RawResponse> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    let body: string | undefined;
    if (json) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(json);
    }
    const response = await this.fetch(endpoint(path, this.baseURL), {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(this.timeoutSeconds * 1000),
    });
    return { status: response.status, body: await response.text() };
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
