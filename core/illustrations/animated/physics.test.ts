// Port of LearnLayerTests/PremadeFigureAnimatedPhysicsTests.swift @ ref 2026-11-04.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration, type IllustrationElement } from "../illustration";
import { PremadeFigures, type PremadeFigure } from "../premadeFigure";
import { sample } from "./animated";
import type { AnimatedIllustration } from "./figureCanvas";
import { CarArt } from "./mascot";
import {
  easedSimTime,
  inclineAcceleration,
  inclineLayout,
  kinematicPosition,
  kinematicVelocity,
  motionRange,
  MotionLayout,
  ThrowLayout,
  verticalThrowApexTime,
  verticalThrowFlightTime,
  verticalThrowHeight,
  verticalThrowVelocity,
} from "./physics";

const language = "Portuguese (Portugal)";
const compile = (figure: PremadeFigure, lang = language) =>
  new PremadeFigures(figure).compile("t", lang) as AnimatedIllustration | null;
const values = (time: number) => ({ t: time, revealed: 1, step: 1000 });
const scene = (type: string, json: string) => {
  const compiled = compile(sample(type, json));
  if (!compiled) throw new Error(`${type} did not compile`);
  return compiled;
};
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
  if (element.kind === "shape") return compiled.shapePoints(element, at);
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
/** x of the dashed time cursors at 41 moments of one loop. */
function cursorXs(figure: Illustration): number[] {
  const compiled = new CompiledIllustration(figure);
  const duration = figure.duration ?? 0;
  const cursors = figure.elements.filter((e) => e.kind === "line" && e.color === "muted" && e.dashed === true);
  const xs: number[] = [];
  for (let step = 0; step <= 40; step++)
    for (const cursor of cursors) {
      const x = compiled.value(cursor.x, values((duration * step) / 40));
      if (x !== null) xs.push(x);
    }
  return xs;
}

describe("physics scenes", () => {
  it("kinematic formulas", () => {
    expect(kinematicPosition(2, 3, -1, 4)).toBe(2 + 12 - 8);
    expect(kinematicVelocity(3, -1, 4)).toBe(-1);
  });

  it("vertical throw apex and flight", () => {
    const v0 = 12;
    const g = 9.8;
    const apex = verticalThrowApexTime(v0, g);
    expect(Math.abs(apex - v0 / g)).toBeLessThan(1e-12);
    expect(Math.abs(verticalThrowHeight(v0, g, apex) - (v0 * v0) / (2 * g))).toBeLessThan(1e-9);
    expect(Math.abs(verticalThrowVelocity(v0, g, apex))).toBeLessThan(1e-9);
    expect(Math.abs(verticalThrowFlightTime(v0, g) - 2 * apex)).toBeLessThan(1e-12);
  });

  it("incline acceleration and the static case", () => {
    const moving = inclineAcceleration(30, 0.2);
    const expected = 9.8 * (Math.sin((30 * Math.PI) / 180) - 0.2 * Math.cos((30 * Math.PI) / 180));
    expect(Math.abs(moving - expected)).toBeLessThan(1e-9);
    expect(moving).toBeGreaterThan(0);
    expect(inclineAcceleration(18, 0.75)).toBeLessThanOrEqual(0);
  });

  it("the motion scene's car matches the kinematics", () => {
    const figure = scene("motionScene", '{"x0": 0, "v0": 3, "a": 1.2, "tMax": 4}');
    expect(figure.stepPlayback?.boundaries.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(finalLabels(figure)).toContain("MRUA");
    const compiled = new CompiledIllustration(figure);
    const [x0, v0, a, tMax] = [0, 3, 1.2, 4];
    const { low: xLow, high: xHigh } = motionRange(x0, v0, a, tMax);
    const t = 8.0;
    const tau = easedSimTime(t, tMax, MotionLayout.playStart, MotionLayout.playEnd);
    const xPhys = kinematicPosition(x0, v0, a, tau);
    const expectedCar = MotionLayout.carLeft + ((xPhys - xLow) / (xHigh - xLow)) * MotionLayout.carSpan;
    // The rear wheel is the first white circle (the mascot's ring is muted).
    const wheel = figure.elements.find((e) => e.kind === "circle" && e.color === "white")!;
    const wheelX = compiled.value(wheel.x, values(t))!;
    expect(Math.abs(wheelX - (expectedCar + CarArt.wheelXs[0]))).toBeLessThan(1e-3);
    // The first spoke turns by the distance driven over the wheel radius, clockwise.
    const spoke = figure.elements.find((e) => e.kind === "line" && e.x === wheel.x)!;
    const at = values(t);
    const hub = { x: compiled.value(spoke.x, at)!, y: compiled.value(spoke.y, at)! };
    const tip = { x: compiled.value(spoke.x2, at)!, y: compiled.value(spoke.y2, at)! };
    const driven = ((xPhys - x0) / (xHigh - xLow)) * MotionLayout.carSpan;
    const expectedTurn = -driven / CarArt.wheelRadius;
    const turn = Math.atan2(tip.y - hub.y, tip.x - hub.x);
    expect(Math.abs(Math.cos(turn) - Math.cos(expectedTurn))).toBeLessThan(1e-3);
    expect(Math.abs(Math.sin(turn) - Math.sin(expectedTurn))).toBeLessThan(1e-3);
    expect(figure.elements.filter((e) => e.kind === "circle" && e.color === "white")).toHaveLength(2);
    // The time cursors never leave the graphs, even after the clock stops at tMax.
    for (const x of cursorXs(figure)) expect(x >= 5.25 - 1e-3 && x <= 9.35 + 1e-3).toBe(true);
  });

  it("the motion range holds the turning point", () => {
    // Braking from 4 m/s at -2 m/s²: x peaks at 4 m before coming back to 0 at t = 4.
    const range = motionRange(0, 4, -2, 4);
    expect(range.high).toBeGreaterThanOrEqual(4 + 0.39);
    expect(range.low).toBeLessThanOrEqual(-0.39);
  });

  it("the throw's graphs are drawn whole and the ball stays above the ground", () => {
    const figure = scene("verticalThrow", '{"v0": 12, "g": 9.8}');
    const late = 0.95 * (figure.duration ?? 0);
    const plots = figure.elements.filter(
      (e) =>
        e.kind === "curve" && e.color === "white" && Math.min(...curvePoints(e, figure, late).map((p) => p.x)) > 5.1,
    );
    expect(plots).toHaveLength(2);
    for (const plot of plots) expect(Math.max(...curvePoints(plot, figure, late).map((p) => p.x))).toBeGreaterThan(9.3);
    for (const x of cursorXs(figure)) expect(x >= 5.25 - 1e-3 && x <= 9.35 + 1e-3).toBe(true);
    const compiled = new CompiledIllustration(figure);
    const ball = figure.elements.find((e) => e.kind === "circle" && e.color === "accent")!;
    const duration = figure.duration ?? 0;
    for (let step = 0; step <= 40; step++) {
      const y = compiled.value(ball.y, values((duration * step) / 40))!;
      expect(y).toBeGreaterThanOrEqual(ThrowLayout.ground + ThrowLayout.radius - 1e-3);
      expect(y).toBeLessThanOrEqual(5.1);
    }
  });

  it("the block sits on the incline with its base flush", () => {
    for (const [angle, mu] of [
      [30.0, 0.2],
      [18.0, 0.75],
    ] as const) {
      const figure = scene("inclinedBlock", JSON.stringify({ angle, mu }));
      const body = figure.elements.find((e) => e.kind === "shape" && e.color === "accent")!;
      const { ax, ay, length } = inclineLayout(angle);
      const rad = (angle * Math.PI) / 180;
      const duration = figure.duration ?? 0;
      for (const time of [0.5 * duration, 0.95 * duration]) {
        const points = curvePoints(body, figure, time, 120);
        const above = points.map((p) => -(p.x - ax) * Math.sin(rad) + (p.y - ay) * Math.cos(rad));
        const along = points.map((p) => (p.x - ax) * Math.cos(rad) + (p.y - ay) * Math.sin(rad));
        expect(Math.min(...above), `block sinks into the slope at t = ${time}`).toBeGreaterThan(-0.01);
        expect(Math.min(...above), `block floats above the slope at t = ${time}`).toBeLessThan(0.02);
        expect(Math.min(...along) > -0.01 && Math.max(...along) < length + 0.01).toBe(true);
      }
    }
  });

  it("physics scenes compile with Portuguese labels", () => {
    for (const [type, json, snippet] of [
      ["motionScene", '{"x0": 0, "v0": 2, "a": 0, "tMax": 3}', "Movimento"],
      ["verticalThrow", '{"v0": 10}', "Lançamento"],
      ["inclinedBlock", '{"angle": 25, "mu": 0.15}', "Plano inclinado"],
    ] as const) {
      const figure = scene(type, json);
      expect(new CompiledIllustration(figure).isDrawable).toBe(true);
      expect(
        finalLabels(figure).some((text) => text.includes(snippet)),
        type,
      ).toBe(true);
      expect(figure.duration ?? 0).toBeGreaterThan(0);
    }
    expect(compile(sample("motionScene", '{"v0": 200, "a": 0}'), "English")).toBeNull();
    expect(compile(sample("verticalThrow", '{"v0": -1}'), "English")).toBeNull();
    expect(compile(sample("inclinedBlock", '{"angle": 95, "mu": 0.2}'), "English")).toBeNull();
  });
});
