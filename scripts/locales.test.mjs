import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { convertCatalog, convertLocalization } from "./xcstrings.mjs";

const read = (path) => JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8"));
const en = read("../core/i18n/locales/en.json");
const pt = read("../core/i18n/locales/pt-PT.json");

describe("generated locale tables", () => {
  it("hold the 609 keys of the Mac String Catalog in both languages", () => {
    expect(Object.keys(en)).toHaveLength(609);
    expect(Object.keys(pt)).toHaveLength(609);
    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort());
  });

  it("have a Portuguese value for every key that has text", () => {
    const empty = Object.keys(pt).filter((key) => key !== "" && pt[key] === "");
    expect(empty).toEqual([]);
  });

  it("keep the rows the pill and the sidebar read", () => {
    for (const key of [
      "Memory",
      "Documents",
      "Account",
      "Plan & usage",
      "General",
      "Permissions",
      "AI",
      "Data & Privacy",
    ]) {
      expect(en[key], key).toBeDefined();
    }
    expect(pt["Memory"]).toBe("Memória");
    expect(pt["Listening…"]).toBeDefined();
    expect(pt["Speaking…"]).toBeDefined();
  });
});

describe("convertCatalog", () => {
  it("uses the key as the English text and reports what has no translation", () => {
    const catalog = {
      sourceLanguage: "en",
      strings: {
        Hint: { localizations: { "pt-PT": { stringUnit: { state: "translated", value: "Pista" } } } },
        Orphan: {},
        LearnLayer: { shouldTranslate: false },
      },
    };
    const { tables, untranslated } = convertCatalog(catalog, ["en", "pt-PT"]);
    expect(tables.en).toEqual({ Hint: "Hint", Orphan: "Orphan", LearnLayer: "LearnLayer" });
    expect(tables["pt-PT"]).toEqual({ Hint: "Pista", Orphan: "Orphan", LearnLayer: "LearnLayer" });
    expect(untranslated["pt-PT"]).toEqual(["Orphan"]);
  });

  it("keeps plural forms and refuses variations it does not know", () => {
    const plural = {
      variations: {
        plural: {
          one: { stringUnit: { state: "translated", value: "%lld review today" } },
          other: { stringUnit: { state: "translated", value: "%lld reviews today" } },
        },
      },
    };
    expect(convertLocalization(plural)).toEqual({
      plural: { one: "%lld review today", other: "%lld reviews today" },
    });
    expect(() => convertLocalization({ variations: { device: {} } })).toThrow(/unsupported variations/);
  });
});
