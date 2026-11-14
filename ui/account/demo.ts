// `?demo=free|plus|pro|signedout` in a debug page: the account screens against scripted answers, with no
// network and no paid calls. For interface work and screenshots only; a release build ignores it.

import type { SessionGateway } from "@core/account/accountModel";
import type { AuthTokens, Fetch } from "@core/ai/backendClient";

const requested = import.meta.env.DEV ? new URLSearchParams(location.search).get("demo") : null;
export const isDemo = requested !== null;
const plan = requested === "plus" || requested === "pro" ? requested : "free";
const startsSignedIn = isDemo && requested !== "signedout";

const user = { id: "demo-user", email: "ana@escola.pt", name: null };

const offer = (id: string, name: string, monthly: number, yearly: number | null, daily: number, month: number) => ({
  id,
  name,
  monthlyPriceCents: monthly,
  yearlyPriceCents: yearly,
  currency: "EUR",
  dailyRequestLimit: daily,
  monthlyRequestLimit: month,
  monthlyCostLimitUsdMicros: 400_000,
});

const limits = { free: 30, plus: 350, pro: 1000 }[plan];

const answers: Record<string, unknown> = {
  "GET /v1/plans": {
    currency: "EUR",
    plans: [
      offer("free", "Free", 0, null, 8, 30),
      offer("plus", "Plus", 2000, 19000, 35, 350),
      offer("pro", "Pro", 5000, 48000, 100, 1000),
    ],
  },
  "GET /v1/me": {
    user,
    plan: { id: plan, status: "active", interval: plan === "free" ? null : "month", renewsAt: null },
    usage: {
      dailyRequests: 3,
      dailyLimit: 8,
      monthlyRequests: 12,
      monthlyLimit: limits,
      monthlyCostUsdMicros: 61_000,
      monthlyCostLimitUsdMicros: 400_000,
      resetsDailyAt: "2026-11-15T00:00:00.000Z",
      resetsMonthlyAt: "2026-12-01T00:00:00.000Z",
    },
  },
  "GET /v1/account/consents": { current: { terms: "2026-10", privacy: "2026-10" }, upToDate: true },
  "GET /v1/devices": {
    devices: [
      {
        id: "d1",
        name: "Windows · DESKTOP-ANA",
        createdAt: "2026-11-02T10:00:00.000Z",
        lastSeenAt: "2026-11-14T09:00:00.000Z",
        revoked: false,
        current: true,
      },
      {
        id: "d2",
        name: "MacBook Air da Ana",
        createdAt: "2026-09-20T10:00:00.000Z",
        lastSeenAt: "2026-11-10T18:30:00.000Z",
        revoked: false,
        current: false,
      },
    ],
  },
  "POST /v1/auth/email/start": { ok: true },
  "POST /v1/auth/email/verify": {
    accessToken: "demo-access",
    refreshToken: "demo-refresh",
    accessExpiresAt: "2099-01-01T00:00:00.000Z",
    user,
  },
  "GET /v1/account/export": { user, note: "demo" },
};

export const demoFetch: Fetch = async (url, init) => {
  const body = answers[`${init.method} ${new URL(url).pathname}`];
  const status = body === undefined ? 404 : 200;
  return { status, text: async () => (body === undefined ? "" : JSON.stringify(body)) };
};

export function demoSession(): SessionGateway {
  let signedIn = startsSignedIn;
  let handoff: { verifier: string; state: string } | null = null;
  return {
    status: async () => ({ signedIn, email: signedIn ? user.email : "", userID: signedIn ? user.id : "" }),
    accessToken: async () => (signedIn ? "demo-access" : null),
    save: async (_tokens: AuthTokens) => (signedIn = true),
    signOut: async () => void (signedIn = false),
    clear: async () => void (signedIn = false),
    rememberUserID: async () => {},
    saveHandoff: async (verifier, state) => {
      handoff = { verifier, state };
      return true;
    },
    loadHandoff: async () => handoff,
    clearHandoff: async () => void (handoff = null),
  };
}
