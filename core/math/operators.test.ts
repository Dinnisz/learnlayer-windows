import { describe, expect, it } from "vitest";
import { latexOperators, readableOperators } from "./operators";

describe("LaTeX with ASCII signs", () => {
  it("is set with the maths signs", () => {
    expect(latexOperators("x <= 3")).toBe(String.raw`x \le  3`);
    expect(latexOperators("g(-1) * g(0) < 0")).toBe(String.raw`g(-1) \cdot  g(0) < 0`);
    expect(latexOperators("a != b, c >= d")).toBe(String.raw`a \ne  b, c \ge  d`);
  });

  it("keeps a raised or lowered star", () => {
    for (const latex of ["z^*", "x_*", "z^{*}"]) expect(latexOperators(latex)).toBe(latex);
  });
});

describe("labels with ASCII signs", () => {
  it("read as maths", () => {
    expect(readableOperators("ramo para x <= 3")).toBe("ramo para x ≤ 3");
    expect(readableOperators("x>=0 e y != 1")).toBe("x≥0 e y ≠ 1");
    expect(readableOperators("v -> 0")).toBe("v → 0");
  });

  it("leave other text alone", () => {
    for (const text of ["p->next", "a < b", "condição pedida"]) expect(readableOperators(text)).toBe(text);
  });
});
