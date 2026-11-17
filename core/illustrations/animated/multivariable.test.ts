// Port of LearnLayerTests/PremadeFigureAnimatedMultivariableTests.swift @ ref 2026-11-04.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration, type IllustrationElement } from "../illustration";
import { PremadeFigures, type PremadeFigure } from "../premadeFigure";
import { sample } from "./animated";
import { PlottedField, PlottedFunction } from "./figureCanvas";
import {
  characteristicSegments,
  contourSegments,
  cylindricalToCartesian,
  doubleIntegral,
  flowPath,
  gradient,
  gradientAscent,
  Projection3D,
  sphericalToCartesian,
  surfaceGrid,
  vectorSamples,
} from "./multivariable";

const language = "Portuguese (Portugal)";
const compile = (figure: PremadeFigure, lang = language) => new PremadeFigures(figure).compile("t", lang);
const values = (time: number) => ({ t: time, revealed: 1, step: 1000 });
const scene = (type: string, json: string) => {
  const compiled = compile(sample(type, json));
  if (!compiled) throw new Error(`${type} did not compile`);
  return compiled;
};
const field = (text: string) => PlottedField.make(text)!;
const fn = (text: string) => PlottedFunction.make(text)!;
function finalLabels(figure: Illustration): string[] {
  const compiled = new CompiledIllustration(figure);
  const at = values(0.95 * (figure.duration ?? 0));
  return figure.elements
    .filter((e) => e.kind === "label" && (!e.visible || (compiled.value(e.visible, at) ?? 0) > 0))
    .map((e) => e.text ?? "");
}
function curvePoints(element: IllustrationElement, figure: Illustration, time: number, samples = 60) {
  const compiled = new CompiledIllustration(figure);
  const at = values(time);
  const from = compiled.value(element.from, at);
  const to = compiled.value(element.to, at);
  if (from === null || to === null) return [];
  const points: { x: number; y: number }[] = [];
  for (let step = 0; step <= samples; step++) {
    const local = { ...at, s: from + ((to - from) * step) / samples };
    const x = compiled.value(element.curveX, local);
    const y = compiled.value(element.curveY, local);
    if (x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
  }
  return points;
}
const centre = { x: 5.3, y: 3.175 };

describe("multivariable figures", () => {
  it("the contour of a circle lies on the circle", () => {
    const circle = field("x^2+y^2");
    const segments = contourSegments(circle, 4, -3, 3, -3, 3);
    expect(segments.length).toBeGreaterThan(40);
    for (const segment of segments) {
      expect(Math.abs(Math.hypot(segment.x1, segment.y1) - 2)).toBeLessThan(0.02);
      expect(Math.abs(Math.hypot(segment.x2, segment.y2) - 2)).toBeLessThan(0.02);
    }
    expect(contourSegments(circle, 100, -3, 3, -3, 3)).toEqual([]);
    for (const segment of contourSegments(field("x*y"), 0.5, -3, 3, -3, 3))
      expect(Math.abs(segment.x1 * segment.y1 - 0.5)).toBeLessThan(0.03);
  });

  it("level curves are revealed one level at a time", () => {
    const figure = scene("levelCurves", '{"f": "x^2-y^2", "levels": [-4, -1, 0, 1, 4]}');
    expect(finalLabels(figure)).toContain("f(x, y) = −4; −1; 0; 1; 4");
    const compiled = new CompiledIllustration(figure);
    const duration = figure.duration ?? 0;
    const visible = (fraction: number) =>
      figure.elements.filter(
        (e) =>
          e.kind === "line" &&
          e.color === "accent" &&
          (compiled.value(e.visible, values(fraction * duration)) ?? 0) > 0,
      ).length;
    expect(visible(0.1)).toBeLessThan(visible(0.4));
    expect(visible(0.4)).toBeLessThan(visible(0.8));
    expect(compile(sample("levelCurves", '{"f": "5"}'), "English")).toBeNull();
  });

  it("the gradient points uphill and across the level curves", () => {
    expect(gradient(field("x^2+y^2"), 1, 2)).toEqual({ x: 2, y: 4 });
    expect(gradient(field("x*y"), 3, 4)).toEqual({ x: 4, y: 3 });
    const bowl = field("-(x^2+y^2)/4");
    const path = gradientAscent(bowl, { x: 2.5, y: -2 }, 0.2, 40, -3, 3, -3, 3);
    expect(path.length).toBeGreaterThan(10);
    const heights = path.map((point) => bowl.value(point.x, point.y));
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(compile(sample("gradientField", '{"f": "x^2+y^2"}'), "English")).toBeNull();
  });

  it("a rotation field is tangent and its flow circles", () => {
    const p = field("-y");
    const q = field("x");
    const samples = vectorSamples(p, q, -3, 3, -3, 3, 11, 5);
    expect(samples).toHaveLength(55);
    for (const sample of samples) {
      expect(Math.abs(sample.x * sample.dx + sample.y * sample.dy)).toBeLessThan(1e-12);
      expect(Math.abs(Math.hypot(sample.dx, sample.dy) - Math.hypot(sample.x, sample.y))).toBeLessThan(1e-12);
    }
    expect(samples.some((s) => s.x === 0 && s.y === 0 && s.dx === 0 && s.dy === 0)).toBe(true);
    const path = flowPath(p, q, { x: 1, y: 0 }, 0.1, 70, -3, 3, -3, 3);
    expect(path).toHaveLength(71);
    expect(path.every((point) => Math.abs(Math.hypot(point.x, point.y) - 1) < 1e-3)).toBe(true);
    const figure = scene("vectorField2D", '{"P": "-y", "Q": "x"}');
    expect(figure.elements.filter((e) => e.kind === "arrow" && e.color === "white")).toHaveLength(54);
    // The moving dot keeps its distance from the centre, to within the polygon's sagitta.
    const compiled = new CompiledIllustration(figure);
    const dot = figure.elements.find((e) => e.kind === "point")!;
    const radii: number[] = [];
    for (const fraction of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const at = values(fraction * (figure.duration ?? 0));
      const x = compiled.value(dot.x, at);
      const y = compiled.value(dot.y, at);
      if (x !== null && y !== null) radii.push(Math.hypot(x - centre.x, y - centre.y));
    }
    expect(radii).toHaveLength(5);
    expect(Math.min(...radii)).toBeGreaterThan(Math.max(...radii) * 0.98);
  });

  it("double integrals of simple regions", () => {
    expect(Math.abs(doubleIntegral(field("1"), fn("x^2"), fn("x"), 0, 1)! - 1 / 6)).toBeLessThan(1e-9);
    expect(Math.abs(doubleIntegral(field("x+y"), fn("0"), fn("1"), 0, 1)! - 1)).toBeLessThan(1e-9);
    expect(Math.abs(doubleIntegral(field("x*y"), fn("0"), fn("x"), 0, 1)! - 0.125)).toBeLessThan(1e-9);
    const region = scene("doubleIntegralRegion", '{"lower": "x^2", "upper": "x", "a": 0, "b": 1}');
    expect(finalLabels(region)).toContain("Área = 0,167");
    const weighted = scene(
      "doubleIntegralRegion",
      '{"lower": "x^2", "upper": "x", "a": 0, "b": 1, "integrand": "x+y"}',
    );
    expect(finalLabels(weighted)).toContain("∬ f dA = 0,15");
    expect(
      compile(sample("doubleIntegralRegion", '{"lower": "x", "upper": "x^2", "a": 0, "b": 1}'), "English"),
    ).toBeNull();
    // The strips sweep from left to right.
    const strips = region.elements.filter((e) => e.kind === "rect");
    const compiled = new CompiledIllustration(region);
    const shown = [0.3, 0.5, 0.8].map(
      (fraction) =>
        strips.filter((e) => (compiled.value(e.visible, values(fraction * (region.duration ?? 0))) ?? 0) > 0).length,
    );
    expect(shown[0]! < shown[1]! && shown[1]! < shown[2]!).toBe(true);
  });

  it("surface heights and projection", () => {
    const grid = surfaceGrid(field("x^2-y^2"), -2, 2, -2, 2, 4);
    expect(grid.length === 5 && grid.every((row) => row.length === 5)).toBe(true);
    expect([grid[0]![0], grid[4]![2], grid[2]![4], grid[2]![2]]).toEqual([0, 4, -4, 0]);
    expect(new Projection3D(0, 0).project(1, 2, 3)).toEqual({ x: 1, y: 3 });
    const seen = new Projection3D(0, Math.PI / 2).project(1, 2, 3);
    expect(Math.abs(seen.x - 1) < 1e-12 && Math.abs(seen.y - 2) < 1e-12).toBe(true);
    expect(compile(sample("surface3D", '{"f": "x^2-y^2"}'), "English")).toBeNull();
    expect(compile(sample("surface3D", '{"f": "1/(x-x)"}'), "English")).toBeNull();
  });

  it("coordinate conversions", () => {
    const onX = sphericalToCartesian(2, Math.PI / 2, 0);
    expect(Math.abs(onX.x - 2) < 1e-12 && Math.abs(onX.y) < 1e-12 && Math.abs(onX.z) < 1e-12).toBe(true);
    const up = sphericalToCartesian(2, 0, 1);
    expect(Math.abs(up.x) < 1e-12 && Math.abs(up.y) < 1e-12 && Math.abs(up.z - 2) < 1e-12).toBe(true);
    const onY = cylindricalToCartesian(1, Math.PI / 2, 1);
    expect(Math.abs(onY.x) < 1e-12 && Math.abs(onY.y - 1) < 1e-12 && onY.z === 1).toBe(true);
    const diagonal = sphericalToCartesian(1, Math.PI / 2, Math.PI / 4);
    expect(Math.abs(diagonal.x - diagonal.y)).toBeLessThan(1e-12);
  });

  it("coordinate figures place the point where the maths puts it", () => {
    // θ = 90°, φ = 0: on the x axis. ρ = 2, φ = 90°, z = 0: on the y axis.
    for (const [json, axis] of [
      ['{"system": "spherical", "r": 2, "theta": 90, "phi": 0}', 0],
      ['{"system": "cylindrical", "rho": 2, "phi": 90, "z": 0}', 1],
    ] as const) {
      const figure = scene("cylindricalSpherical", json);
      const compiled = new CompiledIllustration(figure);
      const at = values(0.95 * (figure.duration ?? 0));
      const tip = figure.elements.filter((e) => e.kind === "arrow")[axis]!;
      const dot = figure.elements.find((e) => e.kind === "point")!;
      const ox = compiled.value(tip.x, at)!;
      const oy = compiled.value(tip.y, at)!;
      const ax = compiled.value(tip.x2, at)! - ox;
      const ay = compiled.value(tip.y2, at)! - oy;
      const px = compiled.value(dot.x, at)! - ox;
      const py = compiled.value(dot.y, at)! - oy;
      expect(Math.abs(ax * py - ay * px)).toBeLessThan(1e-3 * Math.hypot(ax, ay) * Math.hypot(px, py));
      expect(ax * px + ay * py).toBeGreaterThan(0);
    }
    const spherical = finalLabels(
      scene("cylindricalSpherical", '{"system": "spherical", "r": 3, "theta": 50, "phi": 40}'),
    );
    for (const name of ["r", "θ", "φ", "P", "x", "y", "z"]) expect(spherical, `missing ${name}`).toContain(name);
    expect(spherical).toContain("P = (3; 50°; 40°)  =  (1,76; 1,48; 1,93)");
    const cylindrical = finalLabels(
      scene("cylindricalSpherical", '{"system": "cylindrical", "rho": 2, "phi": 30, "z": 1.5}'),
    );
    for (const name of ["ρ", "φ", "z", "P"]) expect(cylindrical, `missing ${name}`).toContain(name);
    expect(
      compile(sample("cylindricalSpherical", '{"system": "spherical", "r": 3, "theta": 200, "phi": 0}'), "English"),
    ).toBeNull();
    expect(compile(sample("cylindricalSpherical", '{"system": "polar", "r": 3}'), "English")).toBeNull();
  });

  it("characteristics carry the profile", () => {
    const segments = characteristicSegments(2, 1, [-3, -2, -1, 0, 1, 2, 3], 3, -3, 3);
    // The line from x = 3 leaves the box at once.
    expect(segments).toHaveLength(6);
    for (const segment of segments) {
      expect(Math.abs(segment.x2 - segment.x1 - 2 * (segment.y2 - segment.y1))).toBeLessThan(1e-9);
      expect(segment.x2 <= 3 + 1e-9 && segment.y2 <= 3 + 1e-9).toBe(true);
      // u is constant along it: φ(x − (a/b) y) is the same at both ends.
      const atStart = Math.exp(-Math.pow(segment.x1 - 2 * segment.y1, 2));
      const atEnd = Math.exp(-Math.pow(segment.x2 - 2 * segment.y2, 2));
      expect(Math.abs(atStart - atEnd)).toBeLessThan(1e-9);
    }
    expect(characteristicSegments(1, 0, [0], 1, -1, 1)).toEqual([]);
    const figure = scene("characteristicsPDE", '{"a": 2, "b": 1, "phi": "exp(-x^2)"}');
    const shown = finalLabels(figure);
    expect(shown).toContain("2 ∂u/∂x + 1 ∂u/∂y = 0");
    expect(shown).toContain("u(x, y₁) = u(x − 2·y₁, 0)");
    // The carried profile's peak is the original's, moved right by (a/b)·y₁ = 2.1, in the plot's scale (3.5 for 6 units).
    const time = 0.95 * (figure.duration ?? 0);
    const peak = (colour: string) => {
      const points = figure.elements
        .filter((e) => e.kind === "curve" && e.color === colour)
        .flatMap((e) => curvePoints(e, figure, time, 160));
      return points.reduce((best, point) => (point.y > best.y ? point : best)).x;
    };
    expect(Math.abs(peak("second") - peak("white") - (2.1 * 3.5) / 6)).toBeLessThan(0.03);
    expect(compile(sample("characteristicsPDE", '{"a": 1, "b": 0}'), "English")).toBeNull();
  });
});
