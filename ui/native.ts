// The one door to the native side. Outside Tauri (a plain browser during interface work, or a test)
// every call answers with a harmless stand-in, so the interface still renders.

import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type { Preferences, SessionGateway } from "@core/account/accountModel";
import { productionBase, productionSite, type Environment } from "@core/ai/aiGateway";
import type { AuthTokens, Fetch } from "@core/ai/backendClient";
import type { DataFiles } from "@core/ai/diskCache";
import type { StreamingFetch } from "@core/ai/modelClient";
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

/**
 * The app's files in its data folder (src-tauri/src/data_files.rs). In a browser they live in this page's storage,
 * under a prefix, so interface work never touches the student's real files.
 */
export const dataFiles: DataFiles = isTauri
  ? {
      read: (name) => invoke<string | null>("data_file_read", { name }),
      write: (name, contents) => invoke<void>("data_file_write", { name, contents }),
    }
  : {
      read: async (name) => localStorage.getItem("learnlayer-file:" + name),
      write: async (name, contents) => localStorage.setItem("learnlayer-file:" + name, contents),
    };

/** The streaming `fetch` the model client uses: the native one in the app (no CORS), the page's own in a browser. */
export const streamingFetch: StreamingFetch = async (url, init) => {
  if (isTauri) {
    const { fetch } = await import("@tauri-apps/plugin-http");
    return fetch(url, init);
  }
  return window.fetch(url, init);
};

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

let readerCount = 0;

/** Opens a reader window (one per PDF, as the Mac's). Outside Tauri, a browser tab. */
export async function openReader(): Promise<void> {
  if (!isTauri) {
    window.open("/reader.html", "_blank");
    return;
  }
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  readerCount += 1;
  // The page takes dropped files itself (HTML drag and drop), so the native drop handler stays off.
  new WebviewWindow(`reader-${Date.now()}-${readerCount}`, {
    url: "reader.html",
    title: "LearnLayer",
    width: 980,
    height: 860,
    minWidth: 520,
    minHeight: 420,
    dragDropEnabled: false,
  });
}

// MARK: Alt-click in any app (src-tauri/src/platform/windows/anywhere.rs)

/** A rectangle as the native side sends it: physical pixels, global (the virtual screen's top-left). */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the native side read at an Alt-click, in physical pixels; the interface divides by `scale`. */
export interface NativeClickRead {
  /** Grows with each click: only the latest one's reading is opened. */
  id: number;
  point: { x: number; y: number };
  /** The monitor of the click and its scale (1.5 at 150 %). */
  monitor: PixelRect;
  scale: number;
  appName: string;
  /** "protected": an exam browser or a password manager, where nothing is read. */
  refused: "protected" | null;
  /** What UI Automation exposes under the point (a document's text, or the block around it), when anything. */
  found: {
    longText: { text: string; index: number; frame: PixelRect } | null;
    block: {
      index: number;
      nodes: {
        text: string;
        frame: PixelRect;
        kind: "text" | "image" | "link" | "button" | "group";
        hasImage: boolean;
      }[];
    } | null;
    focus: string;
  } | null;
  /** The text selected in the app, when the click fell on it. */
  selection: { text: string; frame: PixelRect } | null;
  /** The window under the point, when a picture of it was taken (`anywhere_picture` gives its pixels). */
  window: (PixelRect & { pixelWidth: number; pixelHeight: number }) | null;
  /** The text the OCR read on that picture, in pixels from the picture's top-left. */
  lines: { text: string; rect: PixelRect }[];
  /** The PDF the window shows, when its file could be found (`anywhere_pdf` gives its bytes). */
  pdfPath: string | null;
  /** A word to show instead of a question (a locale key), e.g. "Select some text first.". */
  notice?: string | null;
}

/** "Capture an area": the monitor under the pointer, frozen (`anywhere_picture` gives its pixels). */
export interface NativeCapture {
  id: number;
  monitor: PixelRect;
  scale: number;
  pixelWidth: number;
  pixelHeight: number;
}

export interface AnywhereHandlers {
  /** The click, at once: the stage may say «Reading…» if reading takes a while. */
  click(point: { x: number; y: number }, scale: number, monitor: PixelRect): void;
  read(read: NativeClickRead): void;
  /** Esc, even when the app below has the keyboard. */
  escape(): void;
  /** "Capture an area": the frozen monitor is ready for the student to drag a rectangle on. */
  capture?(capture: NativeCapture): void;
}

export async function onAnywhere(handlers: AnywhereHandlers): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const stops = await Promise.all([
    listen<{ point: { x: number; y: number }; scale: number; monitor: PixelRect }>("anywhere-click", (event) =>
      handlers.click(event.payload.point, event.payload.scale, event.payload.monitor),
    ),
    listen<NativeClickRead>("anywhere-read", (event) => handlers.read(event.payload)),
    listen("anywhere-escape", () => handlers.escape()),
    listen<NativeCapture>("anywhere-capture", (event) => handlers.capture?.(event.payload)),
  ]);
  return () => stops.forEach((stop) => stop());
}

/** The pixels of the window picture taken at click `id`: 4 bytes a pixel, blue first. */
export async function anywherePicture(id: number): Promise<Uint8Array> {
  const bytes = await invoke<ArrayBuffer>("anywhere_picture", { id });
  return new Uint8Array(bytes);
}

/** The bytes of the PDF found behind the window at click `id`; it never leaves the computer. */
export async function anywherePDF(id: number): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("anywhere_pdf", { id });
}

/** "Explain selected text" in the pill: the text selected in the app in front opens in the stage. */
export async function explainSelectionInFront(): Promise<void> {
  if (isTauri) await invoke<void>("anywhere_explain_selection");
}

/** "Capture an area" in the pill: the monitor under the pointer is frozen for a rectangle to be dragged on it. */
export async function captureArea(): Promise<void> {
  if (isTauri) await invoke<void>("anywhere_capture_area");
}

/** What the OCR reads in a part of capture `id` (pixels of its picture); rects from that part's top-left. */
export async function captureText(id: number, rect: PixelRect): Promise<{ text: string; rect: PixelRect }[]> {
  if (!isTauri) return [];
  return invoke<{ text: string; rect: PixelRect }[]>("anywhere_capture_text", {
    id,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }).catch(() => []);
}

/** Hides the stage over the other app and gives the keyboard back to it. */
export async function closeOverlay(): Promise<void> {
  if (isTauri) await invoke<void>("anywhere_close");
}

/** The stage takes mouse clicks (a question is open) or lets them through (only a word near the cursor). */
export async function setOverlayInteractive(interactive: boolean): Promise<void> {
  if (isTauri) await invoke<void>("anywhere_interactive", { interactive });
}

/** The Settings switch «Alt-click in any app», kept for the next launch. On by default, as on the Mac. */
export const anywherePreferenceKey = "anywhereEnabled";

export function anywhereEnabled(): boolean {
  try {
    return localStorage.getItem(anywherePreferenceKey) !== "0";
  } catch {
    return true;
  }
}

export async function setAnywhereEnabled(enabled: boolean): Promise<void> {
  try {
    localStorage.setItem(anywherePreferenceKey, enabled ? "1" : "0");
  } catch {
    // Kept for this launch only.
  }
  if (isTauri) await invoke<void>("anywhere_set_enabled", { enabled });
}

/** Windows took the click hook away and it could not be put back: the pill offers to turn Alt-click on again. */
export async function onAnywhereHookRemoved(handler: () => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen("anywhere-hook-removed", () => handler());
}

/** The talk key (Ctrl + Win by default) held (true) or let go (false), whichever app is in front. */
export async function onTalkKey(handler: (held: boolean) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<boolean>("talk", (event) => handler(event.payload));
}

/** The talk key chosen in Settings › General: "controlWindows" (default), "copilot", "rightControl" or "none". */
export type TalkKeyChoice = "controlWindows" | "copilot" | "rightControl" | "none";
export const talkKeyPreferenceKey = "talkKey";

export function talkKeyChoice(): TalkKeyChoice {
  try {
    const stored = localStorage.getItem(talkKeyPreferenceKey);
    return stored === "copilot" || stored === "rightControl" || stored === "none" ? stored : "controlWindows";
  } catch {
    return "controlWindows";
  }
}

/** Saves the talk key and tells the keyboard hook (the native side knows the same names). */
export async function setTalkKey(choice: TalkKeyChoice): Promise<void> {
  try {
    localStorage.setItem(talkKeyPreferenceKey, choice);
  } catch {
    // Kept for this launch only.
  }
  if (isTauri) await invoke<void>("talk_key_set", { key: choice });
}

/** Opens Windows Settings at the microphone's privacy page (the only system page the app opens). */
export async function openMicrophoneSettings(): Promise<void> {
  if (!isTauri) return;
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl("ms-settings:privacy-microphone");
}

// MARK: Start with Windows and updates (src-tauri/src/updates.rs)

/** Whether Windows starts LearnLayer at sign-in (the Run key the autostart plugin writes). Off by default. */
export async function startsWithSystem(): Promise<boolean> {
  if (!isTauri) return false;
  const { isEnabled } = await import("@tauri-apps/plugin-autostart");
  return isEnabled().catch(() => false);
}

export async function setStartsWithSystem(on: boolean): Promise<void> {
  if (!isTauri) return;
  const { enable, disable } = await import("@tauri-apps/plugin-autostart");
  await (on ? enable() : disable());
}

/** The version downloaded and waiting for "Restart to update", or null. */
export async function readyUpdate(): Promise<string | null> {
  if (!isTauri) return null;
  return invoke<string | null>("update_ready").catch(() => null);
}

export async function onUpdateReady(handler: (version: string) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<string>("update-ready", (event) => handler(event.payload));
}

/** Installs the downloaded version; the app closes and starts again. */
export async function installUpdate(): Promise<void> {
  if (isTauri) await invoke<void>("update_install");
}
