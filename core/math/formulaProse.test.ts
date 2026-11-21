import { describe, expect, it } from "vitest";
import { trailingProse } from "./formulaProse";

describe("a formula with a sentence at its end", () => {
  it("splits the sentence off", () => {
    expect(trailingProse(String.raw`f(c) = d \quad \text{pelo Teorema de Bolzano-Cauchy}`)).toEqual({
      math: "f(c) = d",
      prose: "pelo Teorema de Bolzano-Cauchy",
    });
    expect(trailingProse(String.raw`v = at,\ \text{com } v_0 = 0`).prose).toBeNull();
  });

  it("keeps units and single words in the formula", () => {
    for (const latex of [String.raw`d = 25\,\text{m}`, String.raw`x > 3 \text{ se }`, "a^2 + b^2 = c^2"])
      expect(trailingProse(latex)).toEqual({ math: latex, prose: null });
  });
});
