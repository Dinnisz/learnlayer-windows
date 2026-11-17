// Port of LearnLayerTests/PremadeFigureAnimatedSeriesTests.swift @ ref 2026-11-04.

import { describe, expect, it } from "vitest";
import { tryParseExpression } from "../../math/expression";
import { CompiledIllustration, type Illustration, type IllustrationElement } from "../illustration";
import { TemplateWords } from "../illustrationTemplate";
import { PremadeFigures, type PremadeFigure } from "../premadeFigure";
import { sample } from "./animated";
import { Params, PlottedField } from "./figureCanvas";
import { partialSums, polarExtent, seriesSpec, slopeFieldSolution, zeta } from "./series";

const language = "Portuguese (Portugal)";
const english = new TemplateWords("English");
const compile = (figure: PremadeFigure, lang = language) => new PremadeFigures(figure).compile("t", lang);
const values = (time: number) => ({ t: time, revealed: 1, step: 1000 });
const scene = (type: string, json: string) => {
  const compiled = compile(sample(type, json));
  if (!compiled) throw new Error(`${type} did not compile`);
  return compiled;
};
const spec = (json: string, count: number) => {
  const found = seriesSpec(new Params(sample("seriesPartialSums", json)), count, english);
  if (!found) throw new Error("no series");
  return found;
};
function finalLabels(figure: Illustration): string[] {
  const compiled = new CompiledIllustration(figure);
  const at = values(0.95 * (figure.duration ?? 0));
  return figure.elements
    .filter((element) => {
      if (element.kind !== "label") return false;
      if (!element.visible) return true;
      return (compiled.value(element.visible, at) ?? 0) > 0;
    })
    .map((element) => element.text ?? "");
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

describe("series and curves", () => {
  it("a geometric series sums to its limit", () => {
    const geometric = spec('{"kind": "geometric", "ratio": 0.5, "count": 10}', 10);
    expect(geometric.limit).toBe(2);
    expect(geometric.converges).toBe(true);
    const sums = partialSums(geometric.terms);
    expect(Math.abs(sums[9]! - (2 - Math.pow(2, -9)))).toBeLessThan(1e-12);
    expect(sums).toEqual([...sums].sort((a, b) => a - b));
    const figure = scene("seriesPartialSums", '{"kind": "geometric", "ratio": 0.5, "count": 10}');
    expect(finalLabels(figure)).toContain("L = 2");
    // One dot per partial sum, appearing in order, all below the limit.
    const dots = figure.elements.filter((element) => element.kind === "point");
    expect(dots).toHaveLength(10);
    const compiled = new CompiledIllustration(figure);
    const heights = dots.map((dot) => compiled.value(dot.y, {})!);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    const limitLine = figure.elements.find((element) => element.kind === "line" && element.color === "second")!;
    expect(heights.every((height) => height < (compiled.value(limitLine.y, {}) ?? 0))).toBe(true);
  });

  it("other series", () => {
    const harmonic = spec('{"kind": "harmonic", "count": 12}', 12);
    expect(harmonic.converges).toBe(false);
    expect(harmonic.limit).toBeNull();
    expect(Math.abs(partialSums(harmonic.terms)[3]! - (1 + 0.5 + 1 / 3 + 0.25))).toBeLessThan(1e-12);
    const alternating = spec('{"kind": "alternatingHarmonic", "count": 24}', 24);
    const lastSum = partialSums(alternating.terms).at(-1) ?? 0;
    expect(Math.abs(lastSum - Math.log(2))).toBeLessThan(0.0401);
    expect(Math.abs((alternating.limit ?? 0) - Math.log(2))).toBeLessThan(1e-12);
    expect(Math.abs(zeta(2) - (Math.PI * Math.PI) / 6)).toBeLessThan(1e-7);
    expect(Math.abs(zeta(4) - Math.pow(Math.PI, 4) / 90)).toBeLessThan(1e-9);
    expect(spec('{"terms": "1/n^2", "count": 6}', 6).terms).toEqual(spec('{"kind": "basel", "count": 6}', 6).terms);
    expect(compile(sample("seriesPartialSums", '{"terms": "1/(n-3)", "count": 6}'), "English")).toBeNull();
    const figure = scene("seriesPartialSums", '{"kind": "harmonic", "count": 12}');
    expect(finalLabels(figure).some((text) => text.includes("diverge"))).toBe(true);
  });

  it("slope field solutions follow the equation", () => {
    const growth = PlottedField.make("y")!;
    const path = slopeFieldSolution(growth, 0, 1, -4, 4, -20, 60);
    const atOne = path.find((point) => Math.abs(point.x - 1) < 1e-9)!;
    expect(Math.abs(atOne.y - Math.E)).toBeLessThan(1e-4);
    const parabola = slopeFieldSolution(PlottedField.make("x")!, 0, 1, -4, 4, -10, 10);
    const atTwo = parabola.find((point) => Math.abs(point.x - 2) < 1e-9)!;
    expect(Math.abs(atTwo.y - 3)).toBeLessThan(1e-9);
    // Blow-up: y′ = y² from 1 leaves the box and the path stops inside it.
    const blowUp = slopeFieldSolution(PlottedField.make("y^2")!, 0, 1, -4, 4, -2.5, 2.5);
    expect(blowUp.every((point) => point.y <= 2.5 && point.y >= -2.5 && point.x < 1)).toBe(true);
    expect(blowUp.length).toBeGreaterThan(3);
  });

  it("slope field strokes have the equation's slope", () => {
    const figure = scene("slopeField", '{"f": "x", "solutions": [{"x": 0, "y": 0}]}');
    const compiled = new CompiledIllustration(figure);
    const number = (text: string | null | undefined) => compiled.value(text, {}) ?? NaN;
    // Field strokes are the 0.34-long muted lines.
    const strokes = figure.elements.filter(
      (element) =>
        element.kind === "line" &&
        element.color === "muted" &&
        Math.abs(Math.hypot(number(element.x2) - number(element.x), number(element.y2) - number(element.y)) - 0.34) <
          1e-3,
    );
    expect(strokes).toHaveLength(13 * 7);
    for (const stroke of strokes) {
      const centre = (number(stroke.x) + number(stroke.x2)) / 2;
      const rise = number(stroke.y2) - number(stroke.y);
      if (Math.abs(centre - 5.3) < 0.05) expect(Math.abs(rise)).toBeLessThan(1e-4);
      else if (centre > 5.3) expect(rise).toBeGreaterThan(0);
      else expect(rise).toBeLessThan(0);
    }
    expect(finalLabels(figure)).toContain("y′ = x");
  });

  it("a polar curve reaches its largest radius on the axis", () => {
    expect(Math.abs(polarExtent(tryParseExpression("1+cos(theta)")!, 0, 2 * Math.PI) - 2)).toBeLessThan(1e-9);
    expect(Math.abs(polarExtent(tryParseExpression("2*cos(3*theta)")!, 0, Math.PI) - 2)).toBeLessThan(1e-6);
    const figure = scene("polarCurve", '{"kind": "cardioid"}');
    expect(finalLabels(figure)).toContain("r = 1+cos(θ)");
    // r(0) = 2 is the radius that fills the picture: the curve starts at (centre + 2.1, centre).
    const curve = figure.elements.find((element) => element.kind === "curve")!;
    const points = curvePoints(curve, figure, 0.95 * (figure.duration ?? 0));
    const start = points[0]!;
    expect(Math.abs(start.x - 7.4) < 1e-4 && Math.abs(start.y - 3.1) < 1e-4).toBe(true);
    expect(points.every((point) => Math.hypot(point.x - 5.3, point.y - 3.1) <= 2.1 + 1e-4)).toBe(true);
    const end = points[points.length - 1]!;
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeLessThan(1e-4);
    expect(compile(sample("polarCurve", '{"r": "theta+x"}'), "English")).toBeNull();
  });

  it("a parametric circle stays a circle", () => {
    const figure = scene("parametricCurve", '{"x": "cos(t)", "y": "sin(t)"}');
    const curve = figure.elements.find((element) => element.kind === "curve")!;
    const points = curvePoints(curve, figure, 0.95 * (figure.duration ?? 0), 120);
    const inner = points.slice(0, -1);
    const centreX = inner.reduce((sum, point) => sum + point.x, 0) / (points.length - 1);
    const centreY = inner.reduce((sum, point) => sum + point.y, 0) / (points.length - 1);
    const radii = points.map((point) => Math.hypot(point.x - centreX, point.y - centreY));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-4);
    expect(radii[0]!).toBeGreaterThan(1);
    // The moving dot rides on the curve.
    const dot = figure.elements.find((element) => element.kind === "point")!;
    const compiled = new CompiledIllustration(figure);
    const at = values(0.4 * (figure.duration ?? 0));
    const x = compiled.value(dot.x, at)!;
    const y = compiled.value(dot.y, at)!;
    expect(Math.abs(Math.hypot(x - centreX, y - centreY) - radii[0]!)).toBeLessThan(1e-4);
    expect(compile(sample("parametricCurve", '{"x": "cos(t)", "y": "1/t"}'), "English")).toBeNull();
  });
});
