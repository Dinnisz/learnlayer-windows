// Port of LearnLayer/Account/AccountModel.swift @ ref 2026-11-04

import { siteBase, sitePage, type Environment } from "../ai/aiGateway";
import {
  BackendFailure,
  nearestWindow,
  type AccountSnapshot,
  type AuthTokens,
  type BackendClient,
  type ConsentStatus,
  type ConsentVersions,
  type PlanOffer,
  type RemoteDevice,
} from "../ai/backendClient";
import { isAuthCallback, isBillingSuccess, loginURL, parseCallback, randomToken } from "./appLogin";
import { parse as parseHomeRoute, type HomeRoute } from "./homeRoute";

/** `ModelRouting.planKey`: the plan the routing reads, kept in step with `/v1/me`. */
export const planKey = "learnLayerPlan";

/**
 * The session as the interface sees it. The tokens live in the Credential Manager and are refreshed
 * on the native side, one refresh at a time (SessionStore.swift and its `SessionCoordinator`).
 */
export interface SessionGateway {
  status(): Promise<{ signedIn: boolean; email: string; userID: string }>;
  /** A valid access token, refreshed when it is inside its last minute. Null means signed out. */
  accessToken(force: boolean): Promise<string | null>;
  save(tokens: AuthTokens): Promise<boolean>;
  /** Tells the server, then forgets the session here. */
  signOut(): Promise<void>;
  /** Forgets the session here without calling the server. */
  clear(): Promise<void>;
  rememberUserID(id: string): Promise<void>;
  /** The PKCE verifier never goes to the website. It stays here until the callback. */
  saveHandoff(verifier: string, state: string): Promise<boolean>;
  loadHandoff(): Promise<{ verifier: string; state: string } | null>;
  clearHandoff(): Promise<void>;
}

/** The small key-value store the Mac keeps in UserDefaults. */
export interface Preferences {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface AccountDependencies {
  client: BackendClient;
  session: SessionGateway;
  preferences: Preferences;
  environment: Environment;
  /** Opens a link in the default browser. */
  open: (url: string) => void;
  /** The name of this computer in the device list (`deviceNameFor` in core/platform.ts). */
  deviceName: () => string;
  /** Called with the user id after the account is deleted, so the memory sync keys are forgotten too. */
  forgetSyncKeys?: (userID: string) => void;
}

export interface AccountState {
  snapshot: AccountSnapshot | null;
  plans: PlanOffer[];
  isSignedIn: boolean;
  /** The address to show: from `/v1/me`, or the one remembered at sign-in. */
  email: string;
  isPresentingSignIn: boolean;
  /** A locale key, or null. */
  banner: string | null;
  /** Set when the server has newer terms or privacy versions than this account accepted. */
  pendingConsent: ConsentVersions | null;
  devices: RemoteDevice[];
}

export type DeleteResult = "deleted" | "wrongEmail" | "billing" | "failed";

/** What a `learnlayer://` link asked for, once the account part has been dealt with. */
export type LinkOutcome = { kind: "signedIn" } | { kind: "route"; route: HomeRoute } | { kind: "ignored" };

const unreachable = "Couldn’t reach LearnLayer. Try again.";

export function consentToAsk(status: ConsentStatus): ConsentVersions | null {
  return status.upToDate ? null : status.current;
}

/** The signed-in student, the plans the server published, and the checkout on the site. */
export class AccountModel {
  private current: AccountState = {
    snapshot: null,
    plans: [],
    isSignedIn: false,
    email: "",
    isPresentingSignIn: false,
    banner: null,
    pendingConsent: null,
    devices: [],
  };
  private readonly listeners = new Set<() => void>();
  private readonly deps: AccountDependencies;

  constructor(deps: AccountDependencies) {
    this.deps = deps;
  }

  // MARK: Observation (what `@Observable` gives the Mac views)

  get state(): AccountState {
    return this.current;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): AccountState => this.current;

  private update(change: Partial<AccountState>) {
    this.current = { ...this.current, ...change };
    for (const listener of this.listeners) listener();
  }

  presentSignIn(presenting: boolean) {
    this.update({ isPresentingSignIn: presenting });
  }

  // MARK: Account

  async refresh(): Promise<void> {
    const { client, session, preferences } = this.deps;
    const fetched = await client.plans().catch(() => null);
    if (fetched && fetched.length > 0) this.update({ plans: fetched });

    const status = await session.status();
    if (!status.signedIn) {
      this.update({ snapshot: null, isSignedIn: false, email: "" });
      return;
    }
    this.update({ isSignedIn: true, email: this.current.snapshot?.user.email || status.email });
    const token = await session.accessToken(false);
    if (!token) {
      this.update({ snapshot: null, isSignedIn: (await session.status()).signedIn });
      return;
    }
    try {
      const me = await client.me(token);
      this.update({ snapshot: me, email: me.user.email || status.email });
      await session.rememberUserID(me.user.id);
      const consent = await client.consents(token).catch(() => null);
      if (consent) this.update({ pendingConsent: consentToAsk(consent) });
      preferences.set(planKey, me.plan.id === "free" ? "free" : "paid");
      this.update({ banner: usageBanner(me.usage) });
    } catch {
      this.update({ banner: unreachable });
    }
  }

  async signOut(): Promise<void> {
    await this.deps.session.signOut().catch(() => this.deps.session.clear());
    this.forgetAccount();
  }

  private forgetAccount() {
    this.update({ snapshot: null, devices: [], pendingConsent: null, isSignedIn: false, email: "" });
    this.deps.preferences.remove(planKey);
  }

  // MARK: Consents, devices, export, delete

  /** Records the versions shown in the sheet. A 409 means they changed meanwhile; ask again. */
  async acceptConsent(): Promise<boolean> {
    const versions = this.current.pendingConsent;
    const token = versions ? await this.deps.session.accessToken(false) : null;
    if (!versions || !token) return false;
    try {
      await this.deps.client.acceptConsents(versions, token);
      this.update({ pendingConsent: null });
      return true;
    } catch (error) {
      if (error instanceof BackendFailure && error.code === "stale_version") {
        const status = await this.deps.client.consents(token).catch(() => null);
        if (status) this.update({ pendingConsent: consentToAsk(status) });
        return false;
      }
      this.update({ banner: unreachable });
      return false;
    }
  }

  /** Without the current terms the account can't be used, so declining signs out. */
  async declineConsent(): Promise<void> {
    this.update({ pendingConsent: null });
    await this.signOut();
  }

  async loadDevices(): Promise<void> {
    const token = this.current.isSignedIn ? await this.deps.session.accessToken(false) : null;
    if (!token) {
      this.update({ devices: [] });
      return;
    }
    const list = await this.deps.client.devices(token).catch(() => null);
    if (!list) return;
    const rank = (device: RemoteDevice) => (device.current ? 0 : 1);
    const devices = list
      .filter((device) => !device.revoked)
      .sort((a, b) => rank(a) - rank(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    this.update({ devices });
  }

  async revoke(device: RemoteDevice): Promise<void> {
    const token = await this.deps.session.accessToken(false);
    if (!token) return;
    try {
      await this.deps.client.revokeDevice(device.id, token);
      await this.loadDevices();
    } catch {
      this.update({ banner: "Couldn’t remove that device. Try again." });
    }
  }

  async exportData(): Promise<string | null> {
    const token = await this.deps.session.accessToken(false);
    if (!token) return null;
    return this.deps.client.exportAccount(token).catch(() => null);
  }

  /** Deletes the account on the server, then forgets the session and the sync keys here. */
  async deleteAccount(confirmEmail: string): Promise<DeleteResult> {
    const { client, session } = this.deps;
    const token = await session.accessToken(false);
    if (!token) return "failed";
    const userID = (await session.status()).userID;
    try {
      await client.deleteAccount(confirmEmail.trim(), token);
    } catch (error) {
      if (error instanceof BackendFailure && error.code === "confirm_email") return "wrongEmail";
      if (error instanceof BackendFailure && error.code === "cancel_failed") return "billing";
      return "failed";
    }
    if (userID !== "") this.deps.forgetSyncKeys?.(userID);
    await session.clear();
    this.forgetAccount();
    return "deleted";
  }

  // MARK: Sign-in

  /** Opens the website, which is where the account is created. The callback comes back as a link. */
  async beginBrowserSignIn(): Promise<void> {
    const verifier = randomToken();
    const state = randomToken();
    if (!(await this.deps.session.saveHandoff(verifier, state))) {
      this.update({ banner: "Couldn’t finish signing in." });
      return;
    }
    this.deps.open(await loginURL(siteBase(this.deps.environment), verifier, state));
  }

  async completeBrowserSignIn(link: string): Promise<boolean> {
    const callback = parseCallback(link);
    if (!callback) return false;
    const { session, client } = this.deps;
    const pending = await session.loadHandoff();
    if (!pending || pending.state !== callback.state) {
      await session.clearHandoff();
      this.update({ banner: "That sign-in link didn’t match this Mac." });
      return false;
    }
    await session.clearHandoff();
    try {
      const tokens = await client.exchangeAppCode(callback.code, pending.verifier, this.deps.deviceName());
      if (!(await session.save(tokens))) throw new Error("session not saved");
      this.update({ banner: null, isPresentingSignIn: false });
      await this.refresh();
      return true;
    } catch {
      this.update({ banner: "Couldn’t finish signing in." });
      return false;
    }
  }

  /** The email-code alternative (SignInView.swift): step one. Returns a locale key on failure. */
  async startEmailCode(email: string): Promise<string | null> {
    try {
      await this.deps.client.startEmail(email.trim());
      return null;
    } catch (error) {
      if (error instanceof BackendFailure && error.code === "rate_limited") {
        return "Too many attempts. Wait a minute and try again.";
      }
      return unreachable;
    }
  }

  /** Step two. Returns a locale key on failure, null once signed in. */
  async verifyEmailCode(email: string, code: string): Promise<string | null> {
    try {
      const tokens = await this.deps.client.verify(email.trim(), code.trim(), this.deps.deviceName());
      if (!(await this.deps.session.save(tokens))) return "Couldn’t finish signing in.";
      this.update({ banner: null, isPresentingSignIn: false });
      await this.refresh();
      return null;
    } catch (error) {
      if (error instanceof BackendFailure && error.code === "bad_code") return "That code didn’t work. Try again.";
      return unreachable;
    }
  }

  // MARK: Site

  openAccountSite() {
    this.deps.open(sitePage("/account", {}, this.deps.environment));
  }

  /** Checkout happens on the site, after the browser session exists. The app does not open Paddle itself. */
  upgradeMonthly() {
    this.upgrade("plus");
  }

  /** `plan` is "plus" or "pro". Moving from Plus to Pro goes through the Paddle portal on the account page. */
  upgrade(plan: "plus" | "pro") {
    this.deps.open(sitePage("/checkout", { plan, interval: "month" }, this.deps.environment));
  }

  // MARK: Links (WindowRouter.handle on the Mac)

  /** A `learnlayer://` link reached the app: finish the sign-in, refresh after a payment, or name a section. */
  async handleLink(link: string): Promise<LinkOutcome> {
    if (isAuthCallback(link)) {
      const signedIn = await this.completeBrowserSignIn(link);
      return signedIn ? { kind: "signedIn" } : { kind: "route", route: "account" };
    }
    if (isBillingSuccess(link)) {
      await this.refresh();
      return { kind: "route", route: "plan" };
    }
    const route = parseHomeRoute(link);
    return route ? { kind: "route", route } : { kind: "ignored" };
  }
}

/** Defaults kept in step with `loadConfig` in the API. The live numbers come from `/v1/plans`. */
export const PlanDefaults = {
  /** "paid" is Plus. Pro has its own numbers. 1 credit = $0.01 of API cost. */
  paidMonthlyCents: 2_000,
  yearlyPriceCents: 19_200 as number | null,
  freeDailyCredits: 10,
  freeMonthlyCredits: 30,
  paidDailyCredits: 70,
  paidWeeklyCredits: 250,
  paidMonthlyCredits: 700,
  proMonthlyCents: 5_000,
  proYearlyCents: 48_000,
  proDailyCredits: 160,
  proWeeklyCredits: 560,
  proMonthlyCredits: 1_600,
} as const;

/** The banner when a credit window is spent (AccountModel.swift `refresh`), else null. */
export function usageBanner(usage: AccountSnapshot["usage"]): string | null {
  const nearest = nearestWindow(usage);
  if (nearest) {
    if (nearest.used < nearest.limit) return null;
    if (nearest.name === "day") return "You’ve used today’s credits. They reset at midnight UTC.";
    if (nearest.name === "week") return "You’ve used this week’s credits. They reset on Monday at 00:00 UTC.";
    return "You’ve used this month’s credits. Upgrade to keep going.";
  }
  // An older server without credit windows.
  const spent = usage.monthlyRequests >= usage.monthlyLimit || usage.dailyRequests >= usage.dailyLimit;
  return spent ? "You’ve used this month’s credits. Upgrade to keep going." : null;
}
