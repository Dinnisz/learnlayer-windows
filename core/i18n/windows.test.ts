import { describe, expect, it } from "vitest";
import { additions, catalog, platformWording, supportedLanguages, translatorFor } from "./index";
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

/** Words that only make sense on Windows. A string shown on a Mac must not carry any of them. */
const windowsOnly = /\bWindows\b|\bAlt\b|\bCtrl\b|\bWin\b|UI Automation|Credential Manager|Gestor de Credenciais/;

describe("Mac wording (Mac report M4)", () => {
  it("only rewords strings the app adds", () => {
    for (const language of supportedLanguages)
      for (const key of Object.keys(platformWording.macos[language]))
        expect(additions[language][key], `“${key}” (${language}) is not an added string`).toBeDefined();
  });

  it("never shows Windows words on a Mac, except the Windows-only talk keys never offered there", () => {
    const windowsKeys = new Set([
      "Copilot key",
      "Right Ctrl",
      "Ctrl + Shift + Space reads the question under the pointer, too.",
    ]);
    for (const language of supportedLanguages) {
      const t = translatorFor(language, "macos");
      for (const key of Object.keys(additions[language])) {
        if (windowsKeys.has(key)) continue;
        const shown = text(t(key));
        expect(windowsOnly.test(shown), `(${language}) “${key}” would show: ${shown}`).toBe(false);
      }
    }
  });

  it("reads the added strings and the plural forms on a Mac too", () => {
    const pt = translatorFor("pt-PT", "macos");
    expect(pt("Mathematics A")).toBe("Matemática A");
    expect(pt("Start with Windows")).toBe("Abrir ao iniciar sessão");
    expect(translatorFor("en", "macos")("%lld documents", 1)).toBe("1 document");
    expect(translatorFor("en", "windows")("%lld documents", 2)).toBe("2 documents");
    expect(pt("%lld questions asked", 1)).toBe("1 pergunta feita");
  });
});
