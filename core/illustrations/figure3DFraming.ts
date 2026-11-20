// Port of Figure3DFraming in LearnLayer/Explanation/Figure3D.swift @ 5701363: how far the camera stands from a solid
// or space figure. At its base distance, or further when part of it (an axis, a wide end) would leave the frame at
// some turn the student or the spin gives it; never closer.

export type FramingPoint = readonly [number, number, number];

/** The Mac's camera distance with nothing to back off for. */
const baseDistance = 10;

export const Figure3DFraming = {
  baseDistance,

  /** The corners of an axis-aligned box around `points` (finite ones only); empty when there are none. */
  corners(points: readonly FramingPoint[]): FramingPoint[] {
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    for (const p of points) {
      if (!p.every(Number.isFinite)) continue;
      for (let axis = 0; axis < 3; axis++) {
        low[axis] = Math.min(low[axis]!, p[axis]!);
        high[axis] = Math.max(high[axis]!, p[axis]!);
      }
    }
    if (!Number.isFinite(low[0])) return [];
    return Array.from({ length: 8 }, (_, i) => [
      i & 1 ? high[0]! : low[0]!,
      i & 2 ? high[1]! : low[1]!,
      i & 4 ? high[2]! : low[2]!,
    ]);
  },

  /**
   * The distance at which every point, turned to any yaw (about the vertical, in 15° steps) and tilted by `pitch`
   * (about the horizontal, the top toward the viewer), stays inside a view of `fieldOfView` degrees (vertical) of this
   * width / height, with 8 % to spare; at least `base`.
   */
  distance(
    points: readonly FramingPoint[],
    pitch: number,
    aspect: number,
    fieldOfView = 35,
    base = baseDistance,
  ): number {
    const tanV = Math.tan((fieldOfView * Math.PI) / 360) * 0.92;
    const tanH = tanV * aspect;
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    let distance = base;
    for (let step = 0; step < 24; step++) {
      const yaw = (step * Math.PI) / 12;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      for (const [x0, y0, z0] of points) {
        // About the vertical, then about the horizontal.
        const x = cosY * x0 + sinY * z0;
        const z1 = -sinY * x0 + cosY * z0;
        const y = cosP * y0 - sinP * z1;
        const z = sinP * y0 + cosP * z1;
        distance = Math.max(distance, z + Math.abs(x) / tanH, z + Math.abs(y) / tanV);
      }
    }
    return distance;
  },
};
