// The few places where the shared code has to know which operating system it runs on. Everything
// that differs is listed here once, so a port to another system is one more entry in `platforms`
// (and one more `platform/<os>/` folder on the native side), not edits scattered through the app.

export const platformNames = ["windows", "macos"] as const;
export type PlatformName = (typeof platformNames)[number];

export interface PlatformTraits {
  /** How this computer is named in Account › Devices. */
  deviceName(computerName: string): string;
  /** Shown for a device the server has no name for. */
  unnamedDevice: string;
  /** What comes before the digit of a sidebar shortcut: "Ctrl+" or "⌘". */
  shortcutPrefix: string;
  /** The `KeyboardEvent` flag of that shortcut's modifier. */
  shortcutModifier: "ctrlKey" | "metaKey";
}

export const platforms: Record<PlatformName, PlatformTraits> = {
  windows: {
    // "Windows · DESKTOP-ABC" (CLAUDE.md §5.1).
    deviceName: (computerName) => (computerName.trim() === "" ? "Windows" : `Windows · ${computerName.trim()}`),
    unnamedDevice: "Windows",
    shortcutPrefix: "Ctrl+",
    shortcutModifier: "ctrlKey",
  },
  macos: {
    // The Mac app sends `ProcessInfo.hostName` as it is.
    deviceName: (computerName) => computerName.trim() || "Mac",
    unnamedDevice: "Mac",
    shortcutPrefix: "⌘",
    shortcutModifier: "metaKey",
  },
};

export function platformNamed(name: string | null | undefined): PlatformName {
  return (platformNames as readonly string[]).includes(name ?? "") ? (name as PlatformName) : "windows";
}

/** The device name sent at sign-in, cut to the 80 characters the API keeps. */
export function deviceNameFor(computerName: string, platform: PlatformName): string {
  return platforms[platform].deviceName(computerName).slice(0, 80);
}
