import { describe, expect, it } from "vitest";
import { catalog, platformWording, supportedLanguages, translatorFor } from "./index";
import unused from "./windows/unused.json";

/** Words that only make sense on a Mac. A string shown on Windows must not carry any of them. */
const macOnly =
  /\bMacs?\b|macOS|⌥|⌘|Keychain|Porta-chaves|\bnotch\b|System Settings|Definições do Sistema|\bOption\b|\bControl\b|\bFn\b/;

const windowsWording = platformWording.windows;

const text = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));

describe("Windows wording", () => {
  it("only overrides keys that exist in the Mac catalog", () => {
    for (const language of supportedLanguages) {
      for (const key of Object.keys(windowsWording[language])) {
        expect(catalog.en[key], `“${key}” (${language}) is not in the String Catalog`).toBeDefined();
      }
    }
  });

  it("covers every string that names the Mac, or says it is not shown on Windows", () => {
    const notShown = new Set<string>(unused);
    for (const language of supportedLanguages) {
      for (const key of Object.keys(catalog[language])) {
        if (notShown.has(key)) continue;
        const shown = text(windowsWording[language][key] ?? catalog[language][key]);
        expect(macOnly.test(shown), `(${language}) “${key}” would show: ${shown}`).toBe(false);
      }
    }
  });

  it("the keys marked as not shown are real keys with no override", () => {
    for (const key of unused) {
      expect(catalog.en[key], key).toBeDefined();
      for (const language of supportedLanguages) expect(windowsWording[language][key], key).toBeUndefined();
    }
  });

  it("says computer and Alt where the Mac says Mac and ⌥", () => {
    const pt = translatorFor("pt-PT", "windows");
    const en = translatorFor("en", "windows");
    expect(en("That sign-in link didn’t match this Mac.")).toBe("That sign-in link didn’t match this computer.");
    expect(en("⌥-click in any app")).toBe("Alt-click in any app");
    expect(pt("This Mac")).toBe("Este computador");
    expect(pt("⌥-click in any app")).toBe("Alt-clique em qualquer app");
    expect(pt("Memory")).toBe("Memória");
    expect(pt("%lld of %lld explanations used", 3, 30)).not.toContain("%");
  });

  it("another platform keeps the catalog wording", () => {
    expect(translatorFor("en", "macos")("⌥-click in any app")).toBe("⌥-click in any app");
    expect(translatorFor("pt-PT", "macos")("This Mac")).toBe("Este Mac");
  });
});
