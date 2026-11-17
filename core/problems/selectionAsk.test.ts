// Port of LearnLayerTests/SelectionAskTests.swift @ ref 2026-11-04 (the first suite: cleaning and capping). The
// request suite comes with asking about a selection inside an exercise.

import { describe, expect, it } from "vitest";
import { SelectionAsk } from "./selectionAsk";

describe("SelectionAsk", () => {
  it("blank or punctuation is not asked", () => {
    expect(SelectionAsk.make("", "question")).toBeNull();
    expect(SelectionAsk.make("  \n\t ", "question")).toBeNull();
    expect(SelectionAsk.make(" . , ; ", "explanation")).toBeNull();
    expect(SelectionAsk.make("​­", "statement")).toBeNull();
  });

  it("one letter or symbol is asked", () => {
    expect(SelectionAsk.make(" a ", "question")?.text).toBe("a");
    expect(SelectionAsk.make("∫", "question")?.text).toBe("∫");
    expect(SelectionAsk.make("2", "statement")?.text).toBe("2");
  });

  it("spaces collapse and blank lines go", () => {
    const ask = SelectionAsk.make("  Determine   a\tderivada \r\n\n\n  da função f.  ", "question");
    expect(ask?.text).toBe("Determine a derivada\nda função f.");
    expect(ask?.isShortened).toBe(false);
  });

  it("invisible characters and line hyphens go", () => {
    expect(SelectionAsk.cleaned("deri­vada​")).toBe("derivada");
    expect(SelectionAsk.cleaned("a deriva-\nda de f")).toBe("a derivada de f");
    // A minus that ends a line of maths is kept.
    expect(SelectionAsk.cleaned("x = 3 -\n2")).toBe("x = 3 -\n2");
    expect(SelectionAsk.cleaned("f(x) = x -\nF")).toBe("f(x) = x -\nF");
  });

  it("a short selection is kept whole", () => {
    const text = "a".repeat(SelectionAsk.maximumCharacters);
    const ask = SelectionAsk.make(text, "explanation");
    expect(ask?.text).toBe(text);
    expect(ask?.isShortened).toBe(false);
  });

  it("a long selection is cut at a word", () => {
    const words = Array.from({ length: 300 }, () => "palavra").join(" ");
    const ask = SelectionAsk.make(words, "statement");
    expect(ask?.isShortened).toBe(true);
    const text = ask?.text ?? "";
    expect(Array.from(text).length).toBeLessThanOrEqual(SelectionAsk.maximumCharacters + 1);
    expect(text.endsWith("palavra…")).toBe(true);
    expect(text.includes("palavr…")).toBe(false);
  });

  it("a long word is cut hard", () => {
    const capped = SelectionAsk.capped("x".repeat(50), 10);
    expect(capped.text).toBe("x".repeat(10) + "…");
    expect(capped.shortened).toBe(true);
    const short = SelectionAsk.capped("abc", 10);
    expect(short.text).toBe("abc");
    expect(short.shortened).toBe(false);
  });

  it("the preview is one short line", () => {
    const ask = SelectionAsk.make("primeira linha\nsegunda linha " + "z ".repeat(100), "question");
    const preview = ask?.preview ?? "";
    expect(preview.includes("\n")).toBe(false);
    expect(preview.startsWith("primeira linha segunda linha")).toBe(true);
    expect(Array.from(preview).length).toBeLessThanOrEqual(SelectionAsk.previewCharacters + 1);
  });

  it("the student question quotes the selection on one line", () => {
    const ask = SelectionAsk.make("Considere a\nfunção f", "statement")!;
    expect(ask.studentQuestion).toContain("from the statement");
    expect(ask.studentQuestion).toContain('"Considere a função f"');
  });
});
