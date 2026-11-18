// Port of LearnLayerTests/MascotFigureFocusTests.swift @ ref 2026-11-04: the one tutor body goes to the part of the
// figure the step it explains is about, waits just above it as the sphere, and the figure magnifies that part in place,
// never past its own edges. The last Mac case (MascotController's figure focus) belongs to the Mac's controller; the
// Windows mascot goes to a spot through GuideSpots, tested with the guide.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, decodeIllustration } from "../illustrations/illustration";
import { SolutionReveal } from "../problems/solutionReveal";
import { FigureFocusGeometry, FigureFocusRegion, type FocusRect } from "./mascotFigureFocus";

const canvas = { width: 400, height: 240 };
const bodySize = 56;
const contains = (rect: FocusRect, x: number, y: number) =>
  x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
const intersects = (a: FocusRect, b: FocusRect) =>
  Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
  Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
const scene = (json: string) => new CompiledIllustration(decodeIllustration(JSON.parse(json))!);

describe("where it is drawn", () => {
  it("a world box lands where the renderer draws it", () => {
    // A 10 × 6 scene fills a 400 × 240 canvas exactly: 40 points a unit, y flipped.
    const rect = FigureFocusGeometry.canvasRect({ x: 1, y: 4, width: 2, height: 1 }, canvas, 10, 6)!;
    expect(rect.x).toBeCloseTo(40, 9);
    expect(rect.y).toBeCloseTo(40, 9);
    expect(rect.width).toBeCloseTo(80, 9);
    expect(rect.height).toBeCloseTo(40, 9);
  });

  it("a scene of another shape is centred like the renderer", () => {
    // A square scene in a wide canvas: 240 points tall, centred with 80 on each side.
    const rect = FigureFocusGeometry.canvasRect({ x: 0, y: 0, width: 10, height: 10 }, canvas, 10, 10)!;
    expect(rect.x).toBeCloseTo(80, 9);
    expect(rect.width).toBeCloseTo(240, 9);
  });

  it("a box outside the figure or an empty canvas has no place", () => {
    expect(FigureFocusGeometry.canvasRect({ x: 20, y: 20, width: 1, height: 1 }, canvas, 10, 6)).toBeNull();
    expect(
      FigureFocusGeometry.canvasRect({ x: 1, y: 1, width: 1, height: 1 }, { width: 0, height: 0 }, 10, 6),
    ).toBeNull();
  });
});

describe("magnifying", () => {
  it("a small detail is magnified but never past the maximum", () => {
    const zoom = FigureFocusGeometry.zoom({ x: 180, y: 100, width: 20, height: 20 }, canvas);
    expect(zoom.scale).toBeGreaterThan(1);
    expect(zoom.scale).toBeLessThanOrEqual(FigureFocusGeometry.maximumZoom + 1e-9);
  });

  it("a large detail is shown as it is", () => {
    expect(
      FigureFocusGeometry.isIdentity(FigureFocusGeometry.zoom({ x: 0, y: 0, width: 300, height: 200 }, canvas)),
    ).toBe(true);
    expect(FigureFocusGeometry.isIdentity(FigureFocusGeometry.zoom({ x: 0, y: 0, width: 0, height: 0 }, canvas))).toBe(
      true,
    );
  });

  it("the magnified detail stays inside the figure", () => {
    const details: FocusRect[] = [
      { x: 0, y: 0, width: 30, height: 20 },
      { x: 370, y: 220, width: 30, height: 20 },
      { x: 180, y: 100, width: 40, height: 30 },
      { x: 0, y: 110, width: 60, height: 20 },
      { x: 390, y: 0, width: 10, height: 240 },
    ];
    for (const detail of details) {
      const zoom = FigureFocusGeometry.zoom(detail, canvas);
      const shown = FigureFocusGeometry.zoomed(detail, zoom, canvas);
      const label = `${JSON.stringify(detail)} → ${JSON.stringify(shown)}`;
      expect(shown.x >= -1e-6 && shown.x + shown.width <= canvas.width + 1e-6, label).toBe(true);
      expect(shown.y >= -1e-6 && shown.y + shown.height <= canvas.height + 1e-6, label).toBe(true);
      expect(shown.width).toBeGreaterThanOrEqual(detail.width - 1e-6);
    }
  });

  it("a centred detail is magnified about its own centre", () => {
    const detail = { x: 180, y: 100, width: 40, height: 40 };
    const shown = FigureFocusGeometry.zoomed(detail, FigureFocusGeometry.zoom(detail, canvas), canvas);
    expect(shown.x + shown.width / 2).toBeCloseTo(detail.x + detail.width / 2, 6);
    expect(shown.y + shown.height / 2).toBeCloseTo(detail.y + detail.height / 2, 6);
  });

  it("no magnification leaves the detail where it is", () => {
    const detail = { x: 10, y: 20, width: 30, height: 40 };
    expect(FigureFocusGeometry.zoomed(detail, FigureFocusGeometry.identity, canvas)).toEqual(detail);
  });

  it("the magnifying waits for the body to set off", () => {
    expect(FigureFocusGeometry.zoomDelay).toBeGreaterThan(0);
    expect(FigureFocusGeometry.zoomDelay).toBeLessThan(SolutionReveal.minimumGap);
  });
});

describe("pointing", () => {
  it("the sphere waits just above the top of the detail", () => {
    const detail = { x: 100, y: 80, width: 60, height: 40 };
    const tip = FigureFocusGeometry.pointerTip(detail, canvas);
    expect(tip.x).toBe(detail.x + detail.width / 2);
    expect(tip.y > detail.y && tip.y <= detail.y + FigureFocusGeometry.tipInset).toBe(true);
    // The whole sphere is above the detail, not on it, and straight above what it shows.
    const centre = FigureFocusGeometry.hoverCenter(tip, bodySize);
    expect(centre.x).toBe(tip.x);
    expect(centre.y + bodySize / 2).toBeLessThan(tip.y);
  });

  it("a point on a scaled figure is placed in the window", () => {
    const frame = { x: 500, y: 300, width: 200, height: 120 };
    expect(FigureFocusGeometry.window({ x: 200, y: 120 }, frame, canvas)).toEqual({ x: 600, y: 360 });
  });
});

describe("what a step adds", () => {
  it("the region is what the step adds to the figure", () => {
    const compiled = scene(`{"title":"t","width":10,"height":6,"elements":[
      {"kind":"line","x":"0","y":"0","x2":"10","y2":"0"},
      {"kind":"point","x":"2","y":"5","visible":"step - 1 + 0.5"},
      {"kind":"rect","x":"6","y":"1","w":"2","h":"2","visible":"step - 2 + 0.5"}
    ]}`);
    const first = FigureFocusRegion.region(compiled, 0)!;
    expect(contains(first, 2, 5)).toBe(true);
    expect(intersects(first, { x: 6, y: 1, width: 2, height: 2 })).toBe(false);
    const second = FigureFocusRegion.region(compiled, 1)!;
    expect(contains(second, 7, 2)).toBe(true);
    expect(contains(second, 2, 5)).toBe(false);
    // A step that adds nothing has nowhere to go.
    expect(FigureFocusRegion.region(compiled, 2)).toBeNull();
    // Unless the plan points at figures: then the figure as a whole.
    expect(FigureFocusRegion.region(compiled, 2, null, true)).toEqual({ x: 0, y: 0, width: 10, height: 6 });
  });

  it("a dot is given room to point at", () => {
    const compiled = scene(
      `{"title":"t","width":10,"height":6,"elements":[{"kind":"point","x":"5","y":"3","visible":"step - 1 + 0.5"}]}`,
    );
    const region = FigureFocusRegion.region(compiled, 0)!;
    expect(region.width).toBeGreaterThanOrEqual(10 * FigureFocusRegion.minimumShare - 1e-9);
    expect(region.height).toBeGreaterThanOrEqual(6 * FigureFocusRegion.minimumShare - 1e-9);
  });

  it("without steps the label holding the step's value is the region", () => {
    const compiled = scene(`{"title":"t","width":10,"height":6,"elements":[
      {"kind":"label","x":"1","y":"5","text":"v0 = 12 m/s"},
      {"kind":"label","x":"6","y":"1","text":"v = 22 m/s"}
    ]}`);
    const region = FigureFocusRegion.region(compiled, 2, "So v = 22 m/s.")!;
    expect(contains(region, 6.2, 1)).toBe(true);
    expect(contains(region, 1.2, 5)).toBe(false);
    expect(FigureFocusRegion.region(compiled, 2, "nothing to see")).toBeNull();
    expect(FigureFocusRegion.region(compiled, 2)).toBeNull();
  });

  it("numbers are read whole, not digit by digit", () => {
    expect(FigureFocusRegion.numbers("v = 12 + 2 · 5 = 22")).toEqual(new Set(["12", "2", "5", "22"]));
    expect(FigureFocusRegion.numbers("x = 9/2 or 0,5")).toEqual(new Set(["9/2", "0,5"]));
    expect(FigureFocusRegion.numbers("no numbers").size).toBe(0);
  });
});
