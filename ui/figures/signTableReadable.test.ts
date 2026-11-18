// Port of signTableCellsWritePi (LearnLayerTests/AnswerTextLayoutTests.swift @ ref 2026-11-04): a sign table's cells
// write π and ∞, whether the command came with one backslash, two, or none.

import { describe, expect, it } from "vitest";
import { readable } from "./SignTableView";

describe("a sign table's cells", () => {
  it("write pi and infinity", () => {
    expect(readable("-pi/6")).toBe("−π/6");
    expect(readable(String.raw`-\pi/6`)).toBe("−π/6");
    expect(readable(String.raw`-\pi/6`)).toBe("−π/6");
    expect(readable("-infty")).toBe("−∞");
  });
});
