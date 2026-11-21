// Port of AlineaGridTests.aPartsLetterIsSetInItalicSoLIsNotReadAsOne @ 5701363 (the range; the italic face is the
// stage's `stage-part-letter`).
import { describe, expect, it } from "vitest";
import { partLabelLetters } from "./markup";

describe("a part's letter", () => {
  it("is found at the start of a paragraph, a digit's label is not", () => {
    expect(partLabelLetters(`l) ${String.fromCharCode(0xfffc)}`)).toEqual([0, 1]);
    expect(partLabelLetters("(iv) x")).toEqual([1, 3]);
    expect(partLabelLetters("1) x")).toBeNull();
    expect(partLabelLetters("1. Resolva")).toBeNull();
  });
});
