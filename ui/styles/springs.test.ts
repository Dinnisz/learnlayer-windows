import { describe, expect, it } from "vitest";
import { springDuration, springEasing, springValue, Springs } from "./springs";

describe("the Mac's springs as CSS easings", () => {
  it("starts at rest and settles on the target", () => {
    for (const spring of Object.values(Springs)) {
      expect(springValue(spring, 0)).toBeCloseTo(0, 6);
      expect(springValue(spring, springDuration(spring))).toBeCloseTo(1, 2);
    }
  });

  it("overshoots a little, as an underdamped spring does", () => {
    const spring = Springs.arrive;
    const duration = springDuration(spring);
    const peak = Math.max(...Array.from({ length: 200 }, (_, i) => springValue(spring, (duration * i) / 199)));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.03);
  });

  it("lasts about as long as SwiftUI lets it ring", () => {
    expect(springDuration(Springs.arrive)).toBeGreaterThan(0.5);
    expect(springDuration(Springs.arrive)).toBeLessThan(0.9);
    // A softer, slower spring takes longer than a quick one.
    expect(springDuration(Springs.arrive)).toBeGreaterThan(springDuration(Springs.select));
  });

  it("writes a linear() easing from 0 to 1", () => {
    const easing = springEasing(Springs.phase, 10);
    expect(easing).toMatch(/^linear\(0, .*, 1\)$/);
    expect(easing.split(",")).toHaveLength(11);
  });
});
