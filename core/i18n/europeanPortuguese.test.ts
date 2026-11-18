// Port of noCatalogStringReadsBrazilian, upgradeSaysChangePlan and stepCounterHasBothNumbersInPortuguese
// (LearnLayerTests/PolishAccessibilityTests.swift @ ref 2026-11-04), over every Portuguese catalog the app ships: the
// Mac's and the Windows' own. Voice and text in pt-PT, never Brazilian (CLAUDE.md, rule 11).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const folders = [join(__dirname, "locales"), join(__dirname, "windows")];
const catalogs = folders.flatMap((folder) =>
  readdirSync(folder)
    .filter((name) => name.endsWith("pt-PT.json"))
    .map((name) => ({ name, entries: JSON.parse(readFileSync(join(folder, name), "utf8")) as Record<string, string> })),
);
const brazilian = ["tela", "mouse", "você", "baixar", "arquivo", "celular", "equipe", "usuário", "salvar", "deletar"];

describe("European Portuguese, never Brazilian", () => {
  it("no catalog string reads Brazilian", () => {
    expect(catalogs.length).toBeGreaterThan(1);
    for (const { name, entries } of catalogs)
      for (const [key, text] of Object.entries(entries))
        for (const word of brazilian)
          expect(
            new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, "iu").test(text),
            `${name} “${key}” reads Brazilian: ${word}`,
          ).toBe(false);
  });

  it("Upgrade says change plan, and the step counter has both numbers", () => {
    const all = Object.assign({}, ...catalogs.map((catalog) => catalog.entries)) as Record<string, string>;
    expect(all["Upgrade"]).toBe("Mudar de plano");
    expect(all["Step %lld of %lld"]).toBe("Passo %lld de %lld");
  });
});
