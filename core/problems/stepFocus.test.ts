// Port of the StepFocus tests of LearnLayerTests/StepExplanationTests.swift @ ref 2026-11-04 (the box, the zoom, the
// lens and its anchor, and the chip kept off the lens).

import { describe, expect, it } from "vitest";
import type { Focus } from "./problemSolution";
import { StepFocusGeometry, StepFocusMarks, type Box } from "./stepFocus";

const focus = (x: number, y: number, w: number, h: number): Focus => ({ x, y, w, h, mark: null, note: null, on: null });
const contains = (outer: Box, inner: Box) =>
  inner.x >= outer.x - 1e-9 &&
  inner.y >= outer.y - 1e-9 &&
  inner.x + inner.width <= outer.x + outer.width + 1e-9 &&
  inner.y + inner.height <= outer.y + outer.height + 1e-9;
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("where in the crop a step is about", () => {
  it("the focus box is kept inside the crop and never too small", () => {
    const size = { width: 400, height: 200 };
    const tiny = StepFocusGeometry.rect(focus(0.5, 0.5, 0, 0), size)!;
    expect(tiny.width).toBeGreaterThanOrEqual(400 * StepFocusGeometry.minimumShare - 0.001);
    expect(tiny.height).toBeGreaterThanOrEqual(200 * StepFocusGeometry.minimumShare - 0.001);
    const edge = StepFocusGeometry.rect(focus(0.9, 0.95, 0.5, 0.5), size)!;
    expect(contains({ x: 0, y: 0, ...size }, edge)).toBe(true);
    expect(StepFocusGeometry.rect(focus(1.4, 0.2, 0.1, 0.1), size)).toBeNull();
    expect(StepFocusGeometry.rect(focus(Number.NaN, 0.2, 0.1, 0.1), size)).toBeNull();
  });

  it("the zoom grows a small spot but stays inside the crop", () => {
    const size = { width: 400, height: 200 };
    const small = { x: 100, y: 50, width: 60, height: 30 };
    const zoom = StepFocusGeometry.zoom(small, size);
    expect(zoom > 1.5 && zoom <= StepFocusGeometry.maximumZoom).toBe(true);
    const whole = { x: 0, y: 0, ...size };
    expect(StepFocusGeometry.scaled(whole, StepFocusGeometry.zoom(whole, size)).width).toBeLessThanOrEqual(size.width);
    const scaled = StepFocusGeometry.scaled(small, 2);
    expect([scaled.x + scaled.width / 2, scaled.y + scaled.height / 2, scaled.width]).toEqual([130, 65, 120]);
  });

  it("the lens is centred on its target and covers it whole", () => {
    const target = { x: 200, y: 100, width: 120, height: 20 };
    const lens = StepFocusGeometry.lens(target, 1.7, { x: 0, y: 0, width: 1000, height: 600 });
    expect(Math.abs(lens.x + lens.width / 2 - 260)).toBeLessThan(0.001);
    expect(Math.abs(lens.y + lens.height / 2 - 110)).toBeLessThan(0.001);
    expect(contains(lens, target)).toBe(true);
    const pad = StepFocusGeometry.lensPadding;
    expect(Math.abs(lens.width - (target.width + 2 * pad.width) * 1.7)).toBeLessThan(0.001);
    expect(Math.abs(lens.height - (target.height + 2 * pad.height) * 1.7)).toBeLessThan(0.001);
    // With no stage it is simply centred.
    const free = StepFocusGeometry.lens(target, 2, null);
    expect(Math.abs(free.x + free.width / 2 - 260)).toBeLessThan(0.001);
  });

  it("a lens near an edge is moved inside the stage, not cut", () => {
    const stage = { x: 12, y: 12, width: 800, height: 500 };
    for (const target of [
      { x: 0, y: 20, width: 260, height: 18 },
      { x: 760, y: 480, width: 60, height: 30 },
    ]) {
      const lens = StepFocusGeometry.lens(target, 2.4, stage);
      expect(contains(stage, lens)).toBe(true);
      expect(lens.width > target.width && lens.height > target.height).toBe(true);
    }
    // Larger than the stage: shrunk to it, still inside.
    expect(contains(stage, StepFocusGeometry.lens({ x: 100, y: 100, width: 600, height: 300 }, 2.4, stage))).toBe(true);
  });

  it("the zoom anchor carries the target to the lens centre", () => {
    const target = { x: 10, y: 30, width: 200, height: 20 };
    for (const scale of [1.7, 2.4]) {
      const lens = StepFocusGeometry.lens(target, scale, { x: 40, y: 0, width: 700, height: 400 });
      const p = StepFocusGeometry.zoomAnchor(target, lens, scale);
      // Scaling about p moves a point x to p + scale * (x - p).
      expect(Math.abs(p.x + scale * (110 - p.x) - (lens.x + lens.width / 2))).toBeLessThan(0.001);
      expect(Math.abs(p.y + scale * (40 - p.y) - (lens.y + lens.height / 2))).toBeLessThan(0.001);
    }
    // An unmoved lens magnifies about the target's own centre.
    const centred = StepFocusGeometry.lens(target, 2, null);
    const p = StepFocusGeometry.zoomAnchor(target, centred, 2);
    expect(Math.abs(p.x - 110) < 0.001 && Math.abs(p.y - 40) < 0.001).toBe(true);
  });

  it("a focus chip never lands on the lens", () => {
    const crop = { x: 110, y: 110, width: 345, height: 250 };
    const spot = { x: 260, y: 270, width: 70, height: 50 };
    const lens = StepFocusGeometry.lens(spot, 2.4, { x: 0, y: 0, width: 1400, height: 900 });
    const note = "minimum near x = 3";
    for (const region of [lens, spot]) {
      const place = StepFocusMarks.placement(note, false, region, crop, 0, lens);
      expect(place.box).not.toBeNull();
      expect(intersects(place.box!, lens)).toBe(false);
    }
    // Without a lens the old choice stands: under the spot when the room is free.
    expect(StepFocusMarks.placement(note, false, spot, { x: 0, y: 0, width: 800, height: 600 }).side).toBe("below");
  });

  it("an arrow ends at the spot's edge and is drawn as a curve with two wings", () => {
    const region = { x: 100, y: 100, width: 40, height: 20 };
    const tip = StepFocusMarks.arrowTip({ x: 120, y: 200 }, region);
    expect(tip.x).toBeCloseTo(120);
    expect(tip.y).toBeCloseTo(120);
    const path = StepFocusMarks.arrowPath({ x: 120, y: 200 }, tip);
    expect(path.startsWith("M 120 200 Q ")).toBe(true);
    expect(path.match(/M /g)).toHaveLength(3);
  });
});
