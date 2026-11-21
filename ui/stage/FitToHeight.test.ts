import { describe, expect, it } from "vitest";
import { fitFloor, fitScale, stageFitFloor } from "./FitToHeight";

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

  it("on the stage, never shrinks in a normal window and to 0.83 in a compact one", () => {
    expect(stageFitFloor(956)).toBe(1);
    expect(stageFitFloor(421)).toBe(1);
    expect(stageFitFloor(420)).toBe(0.83);
    expect(fitScale(2000, 600, stageFitFloor(800))).toBe(1);
  });

  it("does nothing before it is measured", () => {
    expect(fitScale(0, 600)).toBe(1);
    expect(fitScale(800, 0)).toBe(1);
  });
});
