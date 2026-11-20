// The camera backs off only as far as needed for the whole figure to stay in frame at any turn (Figure3DFraming @
// 5701363; the Mac has no test of its own, these state what it does).
import { describe, expect, it } from "vitest";
import { Figure3DFraming, type FramingPoint } from "./figure3DFraming";

const cube = (half: number) => Figure3DFraming.corners([[-half, -half, -half] as FramingPoint, [half, half, half]]);

describe("Figure3DFraming", () => {
  it("keeps the base distance for a figure that fits", () => {
    expect(Figure3DFraming.distance(cube(1), 0.35, 1.25)).toBe(10);
  });

  it("backs off for a figure that would leave the frame at some turn", () => {
    const near = Figure3DFraming.distance(cube(3), 0.35, 1.25);
    const far = Figure3DFraming.distance(cube(4), 0.35, 1.25);
    expect(near).toBeGreaterThan(10);
    expect(far).toBeGreaterThan(near);
    // At that distance every corner, at every 15° turn, projects inside the view.
    const tanV = Math.tan((35 * Math.PI) / 360);
    const pitch = 0.35;
    for (let step = 0; step < 24; step++) {
      const yaw = (step * Math.PI) / 12;
      for (const [x0, y0, z0] of cube(4)) {
        const x = Math.cos(yaw) * x0 + Math.sin(yaw) * z0;
        const z1 = -Math.sin(yaw) * x0 + Math.cos(yaw) * z0;
        const y = Math.cos(pitch) * y0 - Math.sin(pitch) * z1;
        const z = Math.sin(pitch) * y0 + Math.cos(pitch) * z1;
        expect(Math.abs(y) / (far - z)).toBeLessThanOrEqual(tanV);
        expect(Math.abs(x) / (far - z)).toBeLessThanOrEqual(tanV * 1.25);
      }
    }
  });

  it("needs more room in a narrow view than in a wide one", () => {
    const wide = Figure3DFraming.distance(cube(3), 0, 2);
    const narrow = Figure3DFraming.distance(cube(3), 0, 0.8);
    expect(narrow).toBeGreaterThan(wide);
  });

  it("boxes only finite points", () => {
    expect(Figure3DFraming.corners([[Number.NaN, 0, 0]])).toEqual([]);
    expect(
      Figure3DFraming.corners([
        [0, 0, 0],
        [1, 2, 3],
        [Number.NaN, 9, 9],
      ]),
    ).toContainEqual([1, 2, 3]);
  });
});
