import { describe, expect, it } from "vitest";
import { formatPattern, formatValue, makeTranslator, resolveLanguage, type LocaleTable } from "./format";

describe("formatPattern", () => {
  it("fills sequential and positional arguments", () => {
    expect(formatPattern("%lld of %lld", [2, 40], "en")).toBe("2 of 40");
    expect(formatPattern("%1$@ · precisou de ajuda em %2$lld de %3$lld", ["Física", 3, 9], "pt-PT")).toBe(
      "Física · precisou de ajuda em 3 de 9",
    );
    expect(formatPattern("Subject: %@", ["Matemática A"], "en")).toBe("Subject: Matemática A");
    expect(formatPattern("100%% of %@", ["it"], "en")).toBe("100% of it");
  });

  it("leaves a missing argument empty instead of printing the specifier", () => {
    expect(formatPattern("About “%@”", [], "en")).toBe("About “”");
  });
});

describe("formatValue", () => {
  it("picks the plural form from the count", () => {
    const value = { plural: { one: "%lld revisão hoje", other: "%lld revisões hoje" } };
    expect(formatValue(value, [1], "pt-PT")).toBe("1 revisão hoje");
    expect(formatValue(value, [4], "pt-PT")).toBe("4 revisões hoje");
  });

  it("fills named substitutions, each with its own argument", () => {
    const value = {
      value: "%#@exams@ · %#@exercises@",
      substitutions: {
        exams: { argNum: 1, plural: { one: "%arg exame", other: "%arg exames" } },
        exercises: { argNum: 2, plural: { one: "%arg exercício", other: "%arg exercícios" } },
      },
    };
    expect(formatValue(value, [1, 12], "pt-PT")).toBe("1 exame · 12 exercícios");
    expect(formatValue(value, [3, 1], "pt-PT")).toBe("3 exames · 1 exercício");
  });
});

describe("makeTranslator", () => {
  const pt: LocaleTable = { Memory: "Memória", "This Mac": "Este Mac" };
  const windows: LocaleTable = { "This Mac": "Este computador" };

  it("reads the first table that has the key and falls back to the key itself", () => {
    const t = makeTranslator("pt-PT", windows, pt);
    expect(t("Memory")).toBe("Memória");
    expect(t("This Mac")).toBe("Este computador");
    expect(t("Not in the catalog %lld", 3)).toBe("Not in the catalog 3");
  });
});

describe("resolveLanguage", () => {
  it("is never Brazilian Portuguese", () => {
    expect(resolveLanguage(["pt-BR", "en-US"])).toBe("pt-PT");
    expect(resolveLanguage(["pt"])).toBe("pt-PT");
    expect(resolveLanguage(["pt-PT"])).toBe("pt-PT");
  });

  it("falls back to English and lets a stored choice win", () => {
    expect(resolveLanguage(["fr-FR", "de"])).toBe("en");
    expect(resolveLanguage([])).toBe("en");
    expect(resolveLanguage(["pt-PT"], "en")).toBe("en");
    expect(resolveLanguage(["en-GB"], "pt-PT")).toBe("pt-PT");
  });
});
