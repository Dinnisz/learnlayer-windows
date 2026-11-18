// Port of the "One mascot" cases of LearnLayerTests/FinalUXFixTests.swift @ ref 2026-11-04 (MascotStart).

import { describe, expect, it } from "vitest";
import { MascotStart } from "./mascotStart";

describe("one mascot", () => {
  it("the figure's sphere starts where the corner body rests", () => {
    // A 400 × 200 picture of a 10 × 5 scene drawn at (100, 50) in the window: 40 points per unit.
    const canvas = { x: 100, y: 50, width: 400, height: 200 };
    const point = MascotStart.world({ x: 140, y: 230 }, canvas, 10, 5);
    expect(point).not.toBeNull();
    expect(Math.abs(point!.x - 1)).toBeLessThan(1e-9);
    // 230 is 180 below the canvas top: 20 points above its bottom, half a unit up.
    expect(Math.abs(point!.y - 0.5)).toBeLessThan(1e-9);
  });

  it("a body outside the picture starts at its nearest edge", () => {
    const canvas = { x: 100, y: 50, width: 400, height: 200 };
    const far = MascotStart.world({ x: 900, y: -40 }, canvas, 10, 5);
    expect(far).not.toBeNull();
    expect(Math.abs(far!.x - 9.7)).toBeLessThan(1e-9);
    expect(Math.abs(far!.y - 4.7)).toBeLessThan(1e-9);
    expect(MascotStart.world(null, canvas, 10, 5)).toBeNull();
    expect(MascotStart.world({ x: 0, y: 0 }, { x: 0, y: 0, width: 0, height: 0 }, 10, 5)).toBeNull();
  });
});
