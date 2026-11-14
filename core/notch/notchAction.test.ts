// Port of LearnLayerTests/NotchActionTests.swift @ ref 2026-11-04
// (`SpeechVoiceLocaleTests` from the same file is ported with the voice code in phase 5.)

import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import { notchCatalog, type NotchActionID } from "./notchAction";
import { resolveNotchMode, type NotchMode, type NotchModeInputs } from "./notchMode";

describe("NotchAction catalog", () => {
  it("the usual rows are six glyphs in order", () => {
    expect(notchCatalog().map((row) => row.id)).toEqual([
      "captureScreen",
      "openWindow",
      "captureArea",
      "explainSelection",
      "documents",
      "memory",
    ]);
  });

  it("capture screen names the screen when Anywhere is already on", () => {
    const off = notchCatalog({ offersAnywhere: false });
    expect(off.map((row) => row.id)).toEqual([
      "captureScreen",
      "openWindow",
      "captureArea",
      "explainSelection",
      "documents",
      "memory",
    ]);
    expect(off.find((row) => row.id === "captureScreen")?.labelKey).toBe("Capture the screen");
    expect(off.find((row) => row.id === "captureScreen")?.symbol).toBe("camera.viewfinder");
    expect(notchCatalog().find((row) => row.id === "captureScreen")?.labelKey).toBe("Turn on ⌥-click in any app");
  });

  it("no glyph carries a badge or a count", () => {
    const rows = [
      ...notchCatalog(),
      ...notchCatalog({ offersAnywhere: false }),
      ...notchCatalog({ exerciseOpen: true }),
    ];
    for (const row of rows) {
      expect(Object.keys(row).some((field) => /badge|count/i.test(field))).toBe(false);
      expect(row.isPrimary).toBe(row.id === "askAboutExercise");
    }
  });

  it("explain selection needs a selection unless Anywhere is on", () => {
    const enabled = (inputs: Parameters<typeof notchCatalog>[0]) =>
      notchCatalog(inputs).find((row) => row.id === "explainSelection")?.isEnabled;
    expect(enabled({ offersAnywhere: true })).toBe(false);
    expect(enabled({ offersAnywhere: true, hasReaderSelection: true })).toBe(true);
    expect(enabled({ offersAnywhere: false })).toBe(true);
  });

  it("an open exercise replaces the list with one primary row", () => {
    const rows = notchCatalog({ exerciseOpen: true });
    expect(rows.map((row) => row.id)).toEqual(["askAboutExercise"]);
    expect(rows[0]?.isPrimary).toBe(true);
    expect(rows[0]?.symbol).toBe("questionmark.bubble");
  });

  it("perform calls the matching handler", () => {
    const called: NotchActionID[] = [];
    const rows = notchCatalog(
      {},
      {
        captureScreen: () => called.push("captureScreen"),
        openDocuments: () => called.push("documents"),
        openMemory: () => called.push("memory"),
        openWindow: () => called.push("openWindow"),
      },
    );
    for (const id of ["captureScreen", "documents", "memory", "openWindow"] as const) {
      rows.find((row) => row.id === id)?.perform();
    }
    expect(called).toEqual(["captureScreen", "documents", "memory", "openWindow"]);
  });

  it("every row has a symbol and a key in the catalog", () => {
    const strings: Record<string, unknown> = en;
    const all = [
      ...notchCatalog(),
      ...notchCatalog({ offersAnywhere: false }),
      ...notchCatalog({ exerciseOpen: true }),
    ];
    for (const row of all) {
      expect(row.symbol).not.toBe("");
      expect(strings[row.labelKey], `“${row.labelKey}” is not in the String Catalog`).toBeDefined();
    }
  });

  it("documents and memory use their names", () => {
    expect(notchCatalog().find((row) => row.id === "documents")?.labelKey).toBe("Documents");
    expect(notchCatalog().find((row) => row.id === "memory")?.labelKey).toBe("Memory");
  });
});

describe("NotchMode", () => {
  it("nothing happening is idle", () => {
    expect(resolveNotchMode({})).toBe("idle");
  });

  it("hover shows the options unless an exercise is open", () => {
    expect(resolveNotchMode({ hovering: true })).toBe("hover");
    expect(resolveNotchMode({ exerciseOpen: true, hovering: true })).toBe("exercise");
  });

  it("priority is prompt, listening, speaking, toast, exercise, hover, idle", () => {
    const all: NotchModeInputs = {
      permissionPrompt: true,
      listening: true,
      speaking: true,
      toast: true,
      exerciseOpen: true,
      hovering: true,
    };
    const order: NotchMode[] = [];
    for (const field of ["permissionPrompt", "listening", "speaking", "toast", "exerciseOpen", "hovering"] as const) {
      order.push(resolveNotchMode(all));
      all[field] = false;
    }
    order.push(resolveNotchMode(all));
    expect(order).toEqual(["prompt", "listening", "speaking", "toast", "exercise", "hover", "idle"]);
  });

  it("listening beats speaking and speaking beats an open exercise", () => {
    expect(resolveNotchMode({ listening: true, speaking: true })).toBe("listening");
    expect(resolveNotchMode({ speaking: true, exerciseOpen: true, hovering: true })).toBe("speaking");
  });
});
