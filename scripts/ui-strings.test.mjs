// Every visible string is a key of the String Catalog (CLAUDE.md, rule 10): a `t("…")` in the
// interface whose key is missing would show English text in the Portuguese app.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const catalog = JSON.parse(readFileSync(join(root, "core/i18n/locales/en.json"), "utf8"));
const extra = JSON.parse(readFileSync(join(root, "core/i18n/windows/added.en.json"), "utf8"));

function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("interface strings", () => {
  it("are all keys of the catalog (or of the Windows additions)", () => {
    const missing = [];
    for (const file of sources(join(root, "ui"))) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) {
        const key = JSON.parse(`"${match[1]}"`);
        if (!(key in catalog) && !(key in extra)) missing.push(`${file.slice(root.length)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("the Windows additions have a Portuguese text each and never shadow a catalog key", () => {
    const pt = JSON.parse(readFileSync(join(root, "core/i18n/windows/added.pt-PT.json"), "utf8"));
    expect(Object.keys(pt).sort()).toEqual(Object.keys(extra).sort());
    for (const key of Object.keys(extra)) expect(key in catalog, key).toBe(false);
  });
});
