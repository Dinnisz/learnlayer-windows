// The one door to the native side. Outside Tauri (a plain browser during interface work, or a test)
// every call answers with a harmless stand-in, so the interface still renders.

import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type { Preferences, SessionGateway } from "@core/account/accountModel";
import { productionBase, productionSite, type Environment } from "@core/ai/aiGateway";
import type { AuthTokens, Fetch } from "@core/ai/backendClient";
import { platformNamed, type PlatformName } from "@core/platform";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface AppConfig {
  apiBase: string;
  siteBase: string;
  debug: boolean;
  version: string;
  /** Which operating system the native side is built for (src-tauri/src/platform). */
  platform: PlatformName;
  computerName: string;
  environment: Environment;
}

const browserConfig: AppConfig = {
  apiBase: productionBase,
  siteBase: productionSite,
  debug: true,
  version: "0.0.0",
  // `?platform=macos` shows the other wording while working on the interface in a browser.
  platform: platformNamed(
    typeof location === "undefined" ? null : new URLSearchParams(location.search).get("platform"),
  ),
  computerName: "BROWSER",
  environment: {},
};

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return tauriInvoke<T>(command, args);
}

let cachedConfig: Promise<AppConfig> | null = null;

export function appConfig(): Promise<AppConfig> {
  cachedConfig ??= isTauri
    ? invoke<AppConfig>("app_config").then((config) => ({ ...config, platform: platformNamed(config.platform) }))
    : Promise.resolve(browserConfig);
  return cachedConfig;
}

/** Opens a link in the default browser. Only http(s) links leave the app. */
export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  if (isTauri) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}

/** HTTP from the native side, so the API's CORS rules (site origin only) don't apply to the app. */
export const nativeFetch: Fetch = async (url, init) => {
  if (isTauri) {
    const { fetch } = await import("@tauri-apps/plugin-http");
    return fetch(url, init);
  }
  return window.fetch(url, init);
};

/** `learnlayer://` links: the one that launched the app, then every later one (single instance). */
export async function onDeepLink(handler: (url: string) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const { getCurrent, onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
  const launched = await getCurrent().catch(() => null);
  for (const url of launched ?? []) handler(url);
  return onOpenUrl((urls) => urls.forEach(handler));
}

// MARK: Session (src-tauri/src/session.rs)

interface SessionStatus {
  signedIn: boolean;
  email: string;
  userID: string;
}

const tauriSession: SessionGateway = {
  status: () => invoke<SessionStatus>("session_status"),
  accessToken: (force) => invoke<string | null>("session_access_token", { force }),
  save: (tokens: AuthTokens) =>
    invoke<boolean>("session_save", {
      tokens: { ...tokens, accessExpiresAt: tokens.accessExpiresAt.toISOString() },
    }),
  signOut: () => invoke<void>("session_sign_out"),
  clear: () => invoke<void>("session_clear"),
  rememberUserID: (id) => invoke<void>("session_remember_user_id", { id }),
  saveHandoff: (verifier, state) => invoke<boolean>("session_save_handoff", { verifier, state }),
  loadHandoff: () => invoke<{ verifier: string; state: string } | null>("session_load_handoff"),
  clearHandoff: () => invoke<void>("session_clear_handoff"),
};

/** In a browser there is no Credential Manager: the session lasts as long as the page. */
function browserSession(): SessionGateway {
  let tokens: AuthTokens | null = null;
  let handoff: { verifier: string; state: string } | null = null;
  let userID = "";
  return {
    status: async () => ({ signedIn: tokens !== null, email: tokens?.user.email ?? "", userID }),
    accessToken: async () => tokens?.accessToken ?? null,
    save: async (next) => {
      tokens = next;
      userID = next.user.id;
      return true;
    },
    signOut: async () => void (tokens = null),
    clear: async () => void (tokens = null),
    rememberUserID: async (id) => void (userID = id),
    saveHandoff: async (verifier, state) => {
      handoff = { verifier, state };
      return true;
    },
    loadHandoff: async () => handoff,
    clearHandoff: async () => void (handoff = null),
  };
}

export const session: SessionGateway = isTauri ? tauriSession : browserSession();

/** The Windows counterpart of UserDefaults. WebView2 shares it between the app's windows. */
export const preferences: Preferences = {
  get: (key) => localStorage.getItem(key),
  set: (key, value) => localStorage.setItem(key, value),
  remove: (key) => localStorage.removeItem(key),
};

// MARK: Windows (src-tauri/src/lib.rs, pill.rs, tray.rs)

/** Shows the LearnLayer window, on a section when one is named. */
export async function showMain(route: string | null): Promise<void> {
  if (isTauri) await invoke<void>("show_main", { route });
  else window.open(route ? `/?route=${route}` : "/", "learnlayer-main");
}

/** The main window is told which section to show (the tray menu, the pill, a second launch). */
export async function onNavigate(handler: (route: string) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<string>("navigate", (event) => handler(event.payload));
}

export async function resizePill(width: number, height: number): Promise<void> {
  if (isTauri) await invoke<void>("pill_resize", { width, height });
}

export async function setTrayLabels(labels: { open: string; settings: string; quit: string }): Promise<void> {
  if (isTauri) await invoke<void>("set_tray_labels", { labels });
}

/** Asks where to save, then writes the text there. False when the student cancelled or it failed. */
export async function saveTextFile(defaultName: string, contents: string): Promise<boolean> {
  if (isTauri) return invoke<boolean>("save_text_file", { defaultName, contents });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  link.download = defaultName;
  link.click();
  URL.revokeObjectURL(link.href);
  return true;
}
