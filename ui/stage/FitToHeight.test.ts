import { describe, expect, it } from "vitest";
import { fitFloor, fitScale } from "./FitToHeight";

describe("fitScale (FitToHeight)", () => {
  it("keeps content that fits at its own size", () => {
    expect(fitScale(500, 600)).toBe(1);
    expect(fitScale(600, 600)).toBe(1);
  });

  it("shrinks content a little too tall to the room", () => {
    expect(fitScale(1000, 900)).toBeCloseTo(0.9);
  });

  it("never shrinks past the floor: the stage scrolls instead", () => {
    expect(fitScale(2000, 600)).toBe(fitFloor);
    expect(fitScale(2000, 600, 0.4)).toBeCloseTo(0.4);
  });

  it("does nothing before it is measured", () => {
    expect(fitScale(0, 600)).toBe(1);
    expect(fitScale(800, 0)).toBe(1);
  });
});
