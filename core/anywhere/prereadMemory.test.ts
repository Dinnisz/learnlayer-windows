// Port of the "Only after a click" cases of LearnLayerTests/PrereadTests.swift @ 5701363: opening a PDF reads nothing
// ahead until a question in it is clicked; one clicked before is read when it opens again.
import { describe, expect, it } from "vitest";
import { PrereadMemory, PrereadPlan, type PrereadStore } from "./preread";

function memory(): PrereadStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return { values, get: (key) => values.get(key) ?? null, set: (key, value) => void values.set(key, value) };
}

describe("reading ahead only after a click", () => {
  it("leaves a PDF never clicked alone", () => {
    expect(PrereadMemory.wasClicked(memory(), "C:/Users/a/notes.pdf")).toBe(false);
  });

  it("marks the PDF on the first click and reads the following questions first", () => {
    const store = memory();
    PrereadMemory.markClicked(store, "C:/Users/a/exam.pdf");
    expect(PrereadMemory.wasClicked(store, "C:/Users/a/exam.pdf")).toBe(true);
    // Clicked on page 4 of a 6-page test: 4, then 5 and 6, then 3, 2, 1.
    expect(PrereadPlan.order(6, [3], "document")).toEqual([3, 4, 5, 2, 1, 0]);
  });

  it("reads a PDF clicked before when it opens again", () => {
    const store = memory();
    PrereadMemory.markClicked(store, "C:/Users/a/exam.pdf");
    PrereadMemory.markClicked(store, "C:/Users/a/other.pdf");
    PrereadMemory.markClicked(store, "C:/Users/a/exam.pdf");
    // The same file written another way (as another launch may give it).
    expect(PrereadMemory.wasClicked(store, String.raw`c:\Users\a\.\EXAM.pdf`)).toBe(true);
    expect(PrereadMemory.paths(store)).toHaveLength(2);
  });

  it("remembers only the most recent PDFs", () => {
    const store = memory();
    const paths = Array.from({ length: PrereadMemory.limit + 1 }, (_, index) => `C:/p${index}.pdf`);
    for (const path of paths) PrereadMemory.markClicked(store, path);
    expect(PrereadMemory.wasClicked(store, paths[0]!)).toBe(false);
    expect(PrereadMemory.wasClicked(store, paths[paths.length - 1]!)).toBe(true);
  });
});
