import { describe, expect, it } from "vitest";
import { StageScale } from "./stageScale";

describe("StageScale", () => {
  it("is exactly 1 on the laptop's screen and below", () => {
    expect(StageScale.factor(956)).toBe(1);
    expect(StageScale.factor(768)).toBe(1);
  });

  it("grows with a taller screen", () => {
    expect(StageScale.factor(1080)).toBeCloseTo(1080 / 956);
    expect(StageScale.factor(1440)).toBeCloseTo(1440 / 956);
  });

  it("stops at its maximum", () => {
    expect(StageScale.factor(2160)).toBe(1.6);
  });

  it("is 1 for a height it can't use", () => {
    expect(StageScale.factor(0)).toBe(1);
    expect(StageScale.factor(Number.NaN)).toBe(1);
  });
});
