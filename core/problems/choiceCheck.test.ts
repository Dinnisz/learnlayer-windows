// Port of LearnLayerTests/ChoiceCheckTests.swift @ ref 2026-11-04

import { describe, expect, it } from "vitest";
import { ChoiceCheck } from "./choiceCheck";

const group = ["4.1. Choose the correct option.", "", "(A) first", "(B) second", "(C) third", "(D) fourth"].join("\n");
const options = ChoiceCheck.options("4.1", group, ["4.1"]);
const set = (text: string) => new Set(Array.from(text));

describe("ChoiceCheck", () => {
  it("lists the printed letters", () => {
    expect(options).toEqual(set("ABCD"));
  });

  it("a single offered letter is usable", () => {
    expect(ChoiceCheck.isUsable("C", options)).toBe(true);
    expect(ChoiceCheck.isUsable("(C)", options)).toBe(true);
  });

  it("hedged closest is rejected", () => {
    const answer = "nenhuma exatamente, a mais próxima é C";
    expect(ChoiceCheck.isHedged(answer)).toBe(true);
    expect(ChoiceCheck.isUsable(answer, options)).toBe(false);
  });

  it("two letters are rejected", () => {
    for (const answer of ["(B) e (C)", "B e C", "B, C", "B and C", "b e c"]) {
      expect(ChoiceCheck.isUsable(answer, options), answer).toBe(false);
    }
    expect(ChoiceCheck.letters("B e C")).toEqual(set("BC"));
    expect(ChoiceCheck.letters("B, C e D")).toEqual(set("BCD"));
    // The conjunction "e" is not option E; a real E still counts.
    expect(ChoiceCheck.letters("B e E")).toEqual(set("BE"));
  });

  it("one named option stays usable", () => {
    expect(ChoiceCheck.isUsable("Opção B", options)).toBe(true);
    expect(ChoiceCheck.isUsable("B, que está correta", options)).toBe(true);
    expect(ChoiceCheck.letters("B e")).toEqual(set("B"));
  });

  it("a letter outside the options is rejected", () => {
    expect(ChoiceCheck.isUsable("E", options)).toBe(false);
    expect(ChoiceCheck.isUsable("(E)", options)).toBe(false);
  });

  it("reads the options of one part only, and none when the part is not multiple choice", () => {
    const text = [
      "2.1. Na praia do Barril (B) há dunas. Explique.",
      "2.2. Selecione a opção correta.",
      "(A) um    (B) dois",
      "(C) três  (D) quatro",
      "2.3. Outra pergunta.",
    ].join("\n");
    const labels = ["2.1", "2.2", "2.3"];
    expect(ChoiceCheck.options("2.1", text, labels).size).toBe(0);
    expect(ChoiceCheck.options("2.2", text, labels)).toEqual(set("ABCD"));
    expect(ChoiceCheck.options("2.3", text, labels).size).toBe(0);
    expect(ChoiceCheck.options("9.9", text, labels).size).toBe(0);
    // Anything is usable when the part offers no options.
    expect(ChoiceCheck.isUsable("B e C", new Set())).toBe(true);
  });
});
