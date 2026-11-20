// Port of LearnLayerTests/NoteSetDifferenceTests.swift @ 5701363: a step's note says "f is defined on R\{0}": the
// backslash is the set difference, never dropped.
import { describe, expect, it } from "vitest";
import { NoteMath } from "./noteMath";

describe("a backslash in a note", () => {
  it("before a brace is the set difference", () => {
    expect(NoteMath.setDifferences("f is defined on R\\{0}, so")).toBe("f is defined on R∖{0}, so");
    expect(NoteMath.setDifferences("on R \\setminus \\{0\\}")).toBe("on R ∖{0}");
    expect(NoteMath.plainText("f is defined on R\\{0}")).toBe("f is defined on R∖{0}");
    expect(
      NoteMath.pieces("f is defined on R\\{0}, so it extends")
        .map((piece) => piece.text)
        .join(""),
    ).not.toContain("R{0}");
  });

  it("leaves other backslashes alone", () => {
    expect(NoteMath.setDifferences("use $\\{x\\}$ here")).toBe("use $\\{x\\}$ here");
    expect(NoteMath.setDifferences("a path C:\\temp")).toBe("a path C:\\temp");
  });
});
