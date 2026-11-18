// Port of `aBoxMustBeBelievable` (LearnLayerTests/MascotLessonTests.swift @ ref 2026-11-04).

import { describe, expect, it } from "vitest";
import { LessonGeometry } from "./lessonGeometry";

describe("LessonGeometry.box", () => {
  it("a box must be believable", () => {
    const good = LessonGeometry.box({ x: 0.5, y: 0.2, w: 0.1, h: 0.1 });
    expect(good !== null && Math.abs(good.x - 0.5) < 1e-9 && Math.abs(good.width - 0.1) < 1e-9).toBe(true);
    expect(LessonGeometry.box({ x: 0, y: 0, w: 1, h: 1 })).toBeNull();
    expect(LessonGeometry.box({ x: 0.2, y: 0.2, w: 0.001, h: 0.2 })).toBeNull();
    expect(LessonGeometry.box({ x: NaN, y: 0.2, w: 0.1, h: 0.2 })).toBeNull();
    expect(LessonGeometry.box({ x: 1.2, y: 0.2, w: 0.1, h: 0.2 })).toBeNull();
    // A box running off an edge is cut at it.
    expect(LessonGeometry.box({ x: 0.95, y: 0.5, w: 0.1, h: 0.1 })?.width).toBeCloseTo(0.05);
  });
});
