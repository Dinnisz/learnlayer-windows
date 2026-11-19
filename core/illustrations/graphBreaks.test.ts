import { describe, expect, it } from "vitest";
import { Graphs } from "./graph";

describe("Graphs.breaksBetween", () => {
  it("lifts the pen across a jump", () => {
    const field = (z: number) => (z === 0 ? NaN : Math.sign(z) * (1 - Math.abs(z) / Math.sqrt(1 + z * z)));
    expect(Graphs.breaksBetween(field, -0.013, 0.024, 0.5)).toBe(true);
  });

  it("lifts the pen through a pole", () => {
    expect(Graphs.breaksBetween((x) => 1 / (x - 1), 0.97, 1.02, 5)).toBe(true);
    expect(Graphs.breaksBetween(Math.tan, 1.5, 1.65, 5)).toBe(true);
  });

  it("keeps a steep continuous curve in one stroke", () => {
    expect(Graphs.breaksBetween((x) => 40 * x, 0, 0.1, 1)).toBe(false);
    expect(Graphs.breaksBetween((x) => Math.exp(x), 4, 4.2, 10)).toBe(false);
  });

  it("keeps small steps", () => {
    expect(Graphs.breaksBetween(Math.sin, 0, 0.1, 0.5)).toBe(false);
  });
});
