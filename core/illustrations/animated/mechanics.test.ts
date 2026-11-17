// Port of LearnLayerTests/PremadeFigureBatch3PhysicsTests.swift @ ref 2026-11-04: the numbers, geometry and words of
// the batch 3 physics figures. Every gallery sample is also checked for bounds, overlaps and movement in animated.test.ts.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration, type IllustrationElement } from "../illustration";
import { PremadeFigures, type PremadeFigure } from "../premadeFigure";
import { sample } from "./animated";
import { Params } from "./figureCanvas";
import { Teach } from "./heating";
import {
  blockForces,
  circularMotion,
  Collision,
  energyState,
  oscillator,
  PulleySystem,
  ResistorNetwork,
  screenPeriod,
  timeToGround,
} from "./mechanics";
import type { Point } from "./optics";
import { boundsProblems, curvePoints, finalLabels, labels, overlapProblems, values } from "./sceneCheck";

const language = "Portuguese (Portugal)";
const figure = (type: string, json: string) => sample(type, json);
const compile = (premade: PremadeFigure, lang = language) => new PremadeFigures(premade).compile("t", lang);
const scene = (type: string, json: string) => {
  const built = compile(figure(type, json));
  if (!built) throw new Error(`${type} did not compile`);
  return built;
};
const merged = (premade: PremadeFigure, sliders: Record<string, number>) =>
  compile(new PremadeFigures(premade).mergingParameters(sliders));
const refused = (type: string, json: string) => compile(figure(type, json), "English") === null;
const boundaries = (built: Illustration) =>
  (built as { stepPlayback?: { boundaries: number[] } | null }).stepPlayback?.boundaries ?? [];
const value = (compiled: CompiledIllustration, text: string | null | undefined, time: number) => {
  const found = compiled.value(text ?? "", values(time));
  if (found === null) throw new Error(`no value for ${text}`);
  return found;
};
const element = (built: Illustration, test: (e: IllustrationElement) => boolean) => {
  const found = built.elements.find(test);
  if (!found) throw new Error("element not found");
  return found;
};

/** The arrows drawn at `time` (default: the end): colour, tail, tip. */
function arrows(built: Illustration, time?: number): { color: string; from: Point; to: Point }[] {
  const compiled = new CompiledIllustration(built);
  const at = values(time ?? 0.95 * (built.duration ?? 0));
  return built.elements.flatMap((e) => {
    if (e.visible && (compiled.value(e.visible, at) ?? 0) <= 0) return [];
    if (e.kind !== "arrow") return [];
    const [x, y, x2, y2] = [e.x, e.y, e.x2, e.y2].map((t) => compiled.value(t ?? "", at));
    if ([x, y, x2, y2].some((v) => v === null)) return [];
    return [{ color: e.color ?? "white", from: { x: x!, y: y! }, to: { x: x2!, y: y2! } }];
  });
}

describe("free-body diagram", () => {
  it("block forces follow Newton", () => {
    const flat = blockForces(5, 20, 0, 0.2)!;
    expect(Math.abs(flat.weight - 49) < 1e-12 && Math.abs(flat.normal - 49) < 1e-12).toBe(true);
    expect(
      flat.sliding && Math.abs(flat.friction - 9.8) < 1e-12 && Math.abs(flat.acceleration - (20 - 9.8) / 5) < 1e-12,
    ).toBe(true);
    // Pulled upwards at 30°: the floor pushes less, so friction is smaller, but F cos α is smaller too:
    // a = (17.32 − 0.2·39)/5 = 1.904 m/s², a little less than the flat pull's 2.04.
    const tilted = blockForces(5, 20, 30, 0.2)!;
    expect(Math.abs(tilted.pullY - 10) < 1e-12 && Math.abs(tilted.normal - 39) < 1e-12).toBe(true);
    expect(Math.abs(tilted.pullX - 20 * Math.cos(Math.PI / 6))).toBeLessThan(1e-12);
    expect(
      tilted.friction < flat.friction &&
        Math.abs(tilted.acceleration - 1.9043) < 1e-3 &&
        tilted.acceleration < flat.acceleration,
    ).toBe(true);
    expect(Math.abs(tilted.acceleration * 5 - (tilted.pullX - tilted.friction)), "ΣFx = ma").toBeLessThan(1e-12);
    // Too weak a pull: friction matches it exactly and nothing moves.
    const held = blockForces(5, 5, 0, 0.2)!;
    expect(!held.sliding && held.acceleration === 0 && Math.abs(held.friction - 5) < 1e-12).toBe(true);
    const none = blockForces(5, 0, 0, 0.2)!;
    expect(!none.sliding && none.friction === 0).toBe(true);
    // A pull that would lift the block is not this diagram.
    expect(blockForces(5, 100, 60, 0.2)).toBeNull();
    expect(blockForces(-1, 1, 0, 0.2)).toBeNull();
  });

  it("arrows are drawn to scale and in the right directions", () => {
    const built = scene("freeBody", '{"m": 5, "F": 20, "angle": 30, "mu": 0.2}');
    const all = arrows(built);
    const find = (test: (a: { color: string; from: Point; to: Point }) => boolean) => {
      const found = all.find(test);
      if (!found) throw new Error("arrow not found");
      return found;
    };
    const weight = find((a) => a.color === "white" && a.to.y < a.from.y);
    const normal = find((a) => a.color === "accent" && a.to.y > a.from.y);
    const pull = find((a) => a.color === "white" && a.to.x > a.from.x);
    const friction = find((a) => a.color === "second");
    const length = (a: { from: Point; to: Point }) => Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y);
    // Everything starts at the centre of the block; weight down, normal up, friction against the pull.
    for (const arrow of [weight, normal, pull, friction]) expect(arrow.from).toEqual(weight.from);
    expect(Math.abs(weight.to.x - weight.from.x) < 1e-3 && Math.abs(normal.to.x - normal.from.x) < 1e-3).toBe(true);
    expect(friction.to.x < friction.from.x && Math.abs(friction.to.y - friction.from.y) < 1e-3).toBe(true);
    // One scale: the lengths are in the proportion of the forces (P = 49, N = 39, F = 20, Fa = 7.8).
    expect(Math.abs(length(normal) / length(weight) - 39 / 49)).toBeLessThan(1e-3);
    expect(Math.abs(length(pull) / length(weight) - 20 / 49)).toBeLessThan(1e-3);
    expect(Math.abs(length(friction) / length(weight) - 7.8 / 49)).toBeLessThan(1e-3);
    // F is drawn at 30° above the horizontal.
    expect(Math.abs((Math.atan2(pull.to.y - pull.from.y, pull.to.x - pull.from.x) * 180) / Math.PI - 30)).toBeLessThan(
      0.1,
    );
    const shown = finalLabels(built);
    for (const text of ["P = 49 N", "N = 39 N", "F = 20 N", "Fₐ = 7,8 N"]) expect(shown, text).toContain(text);
    expect(shown).toContain("N = mg − F·sin α = 49 − 10 = 39 N");
    expect(shown.some((l) => l.includes("a = 1,9 m/s²"))).toBe(true);
    expect(shown.some((l) => l.startsWith("ΣF = m·a = 9,52"))).toBe(true);
  });

  it("the steps follow the teaching order", () => {
    const sliding = scene("freeBody", '{"m": 5, "F": 20, "angle": 0, "mu": 0.2}');
    expect(boundaries(sliding)).toHaveLength(6);
    // Step 1 shows the weight alone; the normal force comes second; friction only after the pull.
    expect(labels(sliding, boundaries(sliding)[1]!)).toEqual(["P = 49 N"]);
    const second = labels(sliding, boundaries(sliding)[2]!);
    expect(
      second.includes("N = 49 N") &&
        !second.some((l) => l.startsWith("F =")) &&
        !second.some((l) => l.startsWith("Fₐ")),
    ).toBe(true);
    // At rest the figure says so and draws no resultant; with no pull it has two steps fewer.
    const held = finalLabels(scene("freeBody", '{"m": 4, "F": 10, "angle": 0, "mu": 0.4}'));
    expect(held.includes("ΣF = 0") && held.some((l) => l.includes("não desliza"))).toBe(true);
    const idle = scene("freeBody", '{"m": 3, "F": 0, "angle": 0, "mu": 0.3}');
    expect(boundaries(idle)).toHaveLength(4);
    expect(finalLabels(idle).some((l) => l.includes("repouso"))).toBe(true);
  });

  it("the sliders change the forces", () => {
    const base = figure("freeBody", '{"m": 5, "F": 20, "angle": 0, "mu": 0.2}');
    const moved = merged(base, { F: 30, angle: 20, mu: 0.5, m: 8 })!;
    // N = 8·9.8 − 30·sin 20° = 78.4 − 10.26 = 68.1 N.
    expect(finalLabels(moved)).toContain("N = 68,1 N");
    expect(moved.parameters?.map((p) => p.name)).toEqual(["m", "F", "angle", "mu"]);
    for (const json of ['{"m": 5, "F": 100, "angle": 60}', '{"m": 0}', '{"mu": -0.1}', '{"angle": 95}'])
      expect(refused("freeBody", json), json).toBe(true);
  });
});

describe("circular motion", () => {
  const motionOf = (json: string) => circularMotion(new Params(figure("circularMotion", json)));

  it("the quantities are consistent", () => {
    const motion = motionOf('{"r": 2, "v": 4}')!;
    expect(motion.angularSpeed === 2 && Math.abs(motion.period - Math.PI) < 1e-12).toBe(true);
    expect(
      motion.centripetal === 8 &&
        Math.abs(motion.centripetal - motion.angularSpeed * motion.angularSpeed * motion.radius) < 1e-12,
    ).toBe(true);
    expect(Math.abs(motion.frequency * motion.period - 1)).toBeLessThan(1e-12);
    // The same motion given by its period, or by ω.
    expect(Math.abs(motionOf('{"r": 2, "T": 3.141592653589793}')!.speed - 4)).toBeLessThan(1e-12);
    expect(Math.abs(motionOf('{"r": 2, "omega": 2}')!.speed - 4)).toBeLessThan(1e-12);
    expect(motionOf('{"r": 2}')).toBeNull();
    expect(motionOf('{"r": -2, "v": 1}')).toBeNull();
  });

  it("keeps the radius and the directions at every moment", () => {
    const built = scene("circularMotion", '{"r": 2, "v": 4, "m": 1.5}');
    const compiled = new CompiledIllustration(built);
    const ring = element(built, (e) => e.kind === "circle");
    const centreX = value(compiled, ring.x, 0);
    const centreY = value(compiled, ring.y, 0);
    const radius = value(compiled, ring.r, 0);
    const velocity = element(built, (e) => e.kind === "arrow" && e.color === "second");
    const acceleration = element(built, (e) => e.kind === "arrow" && e.color === "accent");
    const duration = built.duration ?? 0;
    let previousAngle: number | null = null;
    let step: number | null = null;
    for (let index = 0; index <= 120; index++) {
      const time = Teach.start(2) + 0.6 + ((duration - Teach.start(2) - 0.6) * index) / 120;
      const ends = (e: IllustrationElement) => ({
        tail: { x: value(compiled, e.x, time), y: value(compiled, e.y, time) },
        tip: { x: value(compiled, e.x2, time), y: value(compiled, e.y2, time) },
      });
      const v = ends(velocity);
      const a = ends(acceleration);
      // The particle stays on the circle.
      const rx = v.tail.x - centreX;
      const ry = v.tail.y - centreY;
      expect(Math.abs(Math.hypot(rx, ry) - radius), `t = ${time}`).toBeLessThan(1e-3);
      // v is tangent (perpendicular to the radius), aₙ points at the centre (opposite the radius).
      const vx = v.tip.x - v.tail.x;
      const vy = v.tip.y - v.tail.y;
      expect(Math.abs(vx * rx + vy * ry), `v ⟂ r at t = ${time}`).toBeLessThan(1e-3);
      const ax = a.tip.x - a.tail.x;
      const ay = a.tip.y - a.tail.y;
      expect(Math.abs(ax * ry - ay * rx) < 1e-3 && ax * rx + ay * ry < 0, `aₙ towards the centre at t = ${time}`).toBe(
        true,
      );
      // v is counter-clockwise: r × v > 0, and the particle turns by the same angle every instant.
      expect(rx * vy - ry * vx).toBeGreaterThan(0);
      const angle = Math.atan2(ry, rx);
      if (previousAngle !== null) {
        let turned = angle - previousAngle;
        if (turned < -Math.PI) turned += 2 * Math.PI;
        if (step !== null) expect(Math.abs(turned - step), `uniform angular speed at t = ${time}`).toBeLessThan(1e-3);
        else step = turned;
      }
      previousAngle = angle;
      // The labels v and aₙ travel with their arrows and never cover each other or the words.
      expect(overlapProblems(built, time).slice(0, 2)).toEqual([]);
      expect(boundsProblems(built, time).slice(0, 2)).toEqual([]);
    }
    const shown = finalLabels(built);
    expect(shown).toContain("v = ωr  ·  ω = v/r = 2 rad/s  ·  T = 2πr/v = 3,14 s");
    expect(shown).toContain("aₙ = v²/r = 8 m/s², para o centro  ·  F = m·aₙ = 12 N");
  });

  it("sliders and refusals", () => {
    const byPeriod = figure("circularMotion", '{"r": 0.8, "T": 2}');
    // The speed slider replaces the period that was given.
    const faster = merged(byPeriod, { r: 0.8, v: 5 })!;
    expect(finalLabels(faster).some((l) => l.includes("ω = v/r = 6,25 rad/s"))).toBe(true);
    expect(new PremadeFigures(byPeriod).mergingParameters({ v: 5 }).params["T"]).toBeUndefined();
    // The picture grows with r: a bigger circle for a bigger radius.
    const ringRadius = (built: Illustration) =>
      new CompiledIllustration(built).value(built.elements.find((e) => e.kind === "circle")?.r ?? "", {}) ?? 0;
    expect(ringRadius(scene("circularMotion", '{"r": 4, "v": 3}'))).toBeGreaterThan(
      ringRadius(scene("circularMotion", '{"r": 1, "v": 3}')),
    );
    for (const json of [
      '{"r": 2}',
      '{"v": 3}',
      '{"r": 0, "v": 3}',
      '{"r": 2, "v": -1}',
      '{"r": 2, "v": 3, "m": -1}',
      '{"r": 2, "T": 0}',
    ])
      expect(refused("circularMotion", json), json).toBe(true);
  });
});

describe("energy bars", () => {
  it("mechanical energy is conserved along the flight", () => {
    for (const [mass, height, launch] of [
      [2, 10, 0],
      [1, 5, 8],
      [3.5, 20, 12],
    ] as const) {
      const flight = timeToGround(height, launch, 9.8);
      // It lands: height zero at the end, and all the energy is kinetic.
      const landing = energyState(mass, height, launch, 9.8, flight);
      expect(Math.abs(landing.height) < 1e-9 && Math.abs(landing.potential) < 1e-6).toBe(true);
      expect(Math.abs(landing.kinetic - landing.total), "Ec = Em at the ground").toBeLessThan(1e-6);
      for (let step = 0; step <= 10; step++) {
        const state = energyState(mass, height, launch, 9.8, (flight * step) / 10);
        expect(Math.abs(state.kinetic + state.potential - state.total), "Ec + Ep = Em").toBeLessThan(1e-9);
        expect(state.height).toBeGreaterThan(-1e-9);
      }
    }
    // Dropped: v = √(2gh) at the ground, Em = mgh = 196 J for 2 kg from 10 m.
    const dropped = energyState(2, 10, 0, 9.8, timeToGround(10, 0, 9.8));
    expect(
      Math.abs(Math.abs(dropped.speed) - Math.sqrt(2 * 9.8 * 10)) < 1e-9 && Math.abs(dropped.total - 196) < 1e-9,
    ).toBe(true);
    // Thrown up: at the top (t = v₀/g) it is momentarily at rest, all energy potential.
    const apex = energyState(1, 5, 8, 9.8, 8 / 9.8);
    expect(
      Math.abs(apex.speed) < 1e-9 && Math.abs(apex.kinetic) < 1e-9 && Math.abs(apex.potential - apex.total) < 1e-9,
    ).toBe(true);
    expect(Math.abs(apex.height - (5 + 64 / (2 * 9.8)))).toBeLessThan(1e-9);
  });

  it("the bars add up to the total at every moment", () => {
    const built = scene("energyBars", '{"m": 1, "h": 5, "v0": 8}');
    const compiled = new CompiledIllustration(built);
    const rects = built.elements.filter((e) => e.kind === "rect");
    expect(rects).toHaveLength(3);
    const kinetic = rects.find((e) => e.color === "accent")!;
    const potential = rects.find((e) => e.color === "second")!;
    const total = rects.find((e) => e.color === "white")!;
    const duration = built.duration ?? 0;
    let sawKineticRise = false;
    let last: number | null = null;
    for (let index = 0; index <= 100; index++) {
      const time = (duration * index) / 100;
      const hk = value(compiled, kinetic.h, time);
      const hp = value(compiled, potential.h, time);
      const ht = value(compiled, total.h, time);
      expect(Math.abs(hk + hp - ht), `Ec + Ep = Em at index ${index}`).toBeLessThan(1e-3);
      expect(hk > -1e-3 && hp > -1e-3).toBe(true);
      if (last !== null && hk > last + 1e-6) sawKineticRise = true;
      last = hk;
    }
    expect(sawKineticRise).toBe(true);
    // Em is the same height all the time; at the end Ec has all of it and Ep none.
    const end = 0.95 * duration;
    const heightOfTotal = value(compiled, total.h, end);
    expect(Math.abs(value(compiled, kinetic.h, end) - heightOfTotal)).toBeLessThan(1e-3);
    expect(Math.abs(value(compiled, potential.h, end))).toBeLessThan(1e-3);
    // At the start Ep and Ec follow mgh = 49 J and ½mv₀² = 32 J out of 81 J.
    const start = Teach.start(1) + 0.2;
    expect(Math.abs(value(compiled, potential.h, start) / heightOfTotal - 49 / 81)).toBeLessThan(1e-3);
    expect(Math.abs(value(compiled, kinetic.h, start) / heightOfTotal - 32 / 81)).toBeLessThan(1e-3);
    const shown = finalLabels(built);
    expect(shown).toContain("Em = mgh + ½mv₀² = 1·9,8·5 + ½·1·8² = 81 J");
    for (const name of ["Ec", "Ep", "Em", "h = 5 m"]) expect(shown, name).toContain(name);
    expect(shown.some((l) => l.includes("no solo: Ec = Em = 81 J, Ep = 0"))).toBe(true);
    expect(finalLabels(scene("energyBars", '{"m": 2, "h": 10}'))).toContain("Em = mgh = 2·9,8·10 = 196 J");
  });

  it("sliders and refusals", () => {
    const base = figure("energyBars", '{"m": 2, "h": 10}');
    expect(finalLabels(merged(base, { h: 20, m: 1, v0: 0 })!)).toContain("Em = mgh = 1·9,8·20 = 196 J");
    const english = finalLabels(compile(base, "English")!);
    expect(english.includes("KE") && english.includes("PE")).toBe(true);
    for (const json of ['{"h": 0}', '{"m": -1, "h": 5}', '{"h": 5, "v0": -3}', '{"h": 5, "g": 0}'])
      expect(refused("energyBars", json), json).toBe(true);
  });
});

describe("collision", () => {
  it("conserves momentum and follows the restitution", () => {
    // 2 kg at 3 m/s hits 1 kg at rest.
    const elastic = new Collision(2, 1, 3, 0, 1);
    expect(Math.abs(elastic.v1After - 1) < 1e-12 && Math.abs(elastic.v2After - 4) < 1e-12).toBe(true);
    expect(
      Math.abs(elastic.momentumAfter - elastic.momentumBefore) < 1e-12 &&
        Math.abs(elastic.kineticAfter - elastic.kineticBefore) < 1e-12,
    ).toBe(true);
    const inelastic = new Collision(2, 1, 3, 0, 0);
    expect(
      Math.abs(inelastic.v1After - 2) < 1e-12 && Math.abs(inelastic.v2After - 2) < 1e-12,
      "they move together",
    ).toBe(true);
    expect(
      Math.abs(inelastic.momentumAfter - 6) < 1e-12 &&
        Math.abs(inelastic.kineticAfter - 6) < 1e-12 &&
        inelastic.kineticBefore === 9,
    ).toBe(true);
    // Kinetic energy lost is ½·μ·(1 − e²)·(v₁ − v₂)², with μ the reduced mass.
    for (const e of [0, 0.25, 0.5, 0.9, 1]) {
      const hit = new Collision(3, 5, 4, -2, e);
      expect(Math.abs(hit.momentumAfter - hit.momentumBefore), `e = ${e}`).toBeLessThan(1e-12);
      expect(Math.abs(hit.v2After - hit.v1After + e * (hit.v2 - hit.v1)), "Newton's law of restitution").toBeLessThan(
        1e-12,
      );
      const reduced = (hit.m1 * hit.m2) / (hit.m1 + hit.m2);
      expect(Math.abs(hit.kineticBefore - hit.kineticAfter - 0.5 * reduced * (1 - e * e) * 36)).toBeLessThan(1e-9);
    }
    // Equal masses, elastic: the velocities are exchanged.
    const swap = new Collision(1, 1, 3, 1, 1);
    expect(Math.abs(swap.v1After - 1) < 1e-12 && Math.abs(swap.v2After - 3) < 1e-12).toBe(true);
  });

  it("the blocks touch at contact and separate by the restitution", () => {
    const built = scene("collision", '{"m1": 1, "m2": 1, "v1": 3, "v2": 1, "e": 0.5}');
    const compiled = new CompiledIllustration(built);
    const blocks = built.elements.filter((e) => e.kind === "rect");
    const first = blocks.find((e) => e.color === "accent")!;
    const second = blocks.find((e) => e.color === "second")!;
    const gap = (t: number) =>
      value(compiled, second.x, t) - (value(compiled, first.x, t) + value(compiled, first.w, t));
    const wait = 0.9;
    const contact = 0.9 + 2.2;
    // Closing at v₁ − v₂ = 2: the gap shrinks until the contact time, where it is zero.
    expect(gap(0) > 0.5 && Math.abs(gap(contact)) < 1e-6).toBe(true);
    const closing = gap(wait + 0.5) - gap(wait + 1.5);
    expect(closing).toBeGreaterThan(0);
    // After contact the separation speed is e times the closing speed (restitution 0.5).
    const separating = gap(contact + 1.5) - gap(contact + 0.5);
    expect(Math.abs(separating / closing - 0.5)).toBeLessThan(1e-6);
    // Momentum, read off the picture (speed scale k cancels): m₁·ẋ₁ + m₂·ẋ₂ is the same before and after.
    const speed = (block: IllustrationElement, t: number) =>
      (value(compiled, block.x, t + 0.5) - value(compiled, block.x, t)) / 0.5;
    const pBefore = speed(first, wait + 0.2) + speed(second, wait + 0.2);
    const pAfter = speed(first, contact + 0.4) + speed(second, contact + 0.4);
    expect(Math.abs(pBefore - pAfter), "equal masses: the sum of the velocities is conserved").toBeLessThan(1e-6);
    // The ratio of the speeds is the ratio of the velocities: v₁ : v₂ = 3 : 1 before.
    expect(Math.abs(speed(first, wait + 0.2) / speed(second, wait + 0.2) - 3)).toBeLessThan(1e-6);
    // Nothing leaves the picture at any time.
    for (let index = 0; index <= 80; index++)
      expect(boundsProblems(built, ((built.duration ?? 0) * index) / 80).slice(0, 2)).toEqual([]);
  });

  it("writes before and after", () => {
    const built = scene("collision", '{"m1": 2, "m2": 1, "v1": 3, "v2": 0, "kind": "elastic"}');
    const before = labels(built, 1.5);
    expect(before).toContain("Antes: p = m₁v₁ + m₂v₂ = 2·3 + 1·0 = 6 kg·m/s");
    expect(before).toContain("Ec = ½m₁v₁² + ½m₂v₂² = 9 J");
    expect(before.includes("v₁") && !before.includes("v₂"), "a block at rest has no velocity arrow").toBe(true);
    const after = finalLabels(built);
    expect(after).toContain("Depois: p′ = 2·1 + 1·4 = 6 kg·m/s (conservada)");
    expect(after).toContain("Ec′ = 9 J: conserva-se (elástica)");
    expect(after.includes("v₁′") && after.includes("v₂′")).toBe(true);
    const sticky = finalLabels(scene("collision", '{"m1": 2, "m2": 3, "v1": 4, "v2": -1, "kind": "inelastic"}'));
    expect(sticky).toContain("Depois: p′ = 2·1 + 3·1 = 5 kg·m/s (conservada)");
    expect(sticky).toContain("Ec′ = 2,5 J: perdem-se 15 J (inelástica)");
    // Arrow lengths follow the speeds: v₂′ = 4 is 4/1 of v₁′ = 1.
    const lengths = arrows(built)
      .map((a) => Math.abs(a.to.x - a.from.x))
      .sort((a, b) => a - b);
    expect(lengths.length === 2 && Math.abs(lengths[1]! / lengths[0]! - 4) < 1e-6).toBe(true);
  });

  it("sliders and refusals", () => {
    const base = figure("collision", '{"m1": 2, "m2": 1, "v1": 3, "v2": 0, "kind": "elastic"}');
    const moved = merged(base, { e: 0, m1: 1, m2: 1, v1: 2 })!;
    expect(finalLabels(moved)).toContain("Ec′ = 1 J: perdem-se 1 J (inelástica)");
    expect(moved.parameters?.map((p) => p.name)).toEqual(["m1", "m2", "e", "v1"]);
    for (const json of [
      '{"m1": 2, "m2": 1, "v1": 0, "v2": 1}',
      '{"m1": -1, "m2": 1, "v1": 3}',
      '{"m1": 2, "m2": 1, "v1": 3, "e": 1.5}',
      '{"m1": 2, "m2": 1, "v1": 3, "kind": "sticky"}',
      '{"m1": 2, "m2": 1}',
    ])
      expect(refused("collision", json), json).toBe(true);
  });
});

describe("spring oscillator", () => {
  const oscillatorOf = (json: string) => oscillator(new Params(figure("springOscillator", json)))!;

  it("follows simple harmonic motion", () => {
    const motion = oscillatorOf('{"m": 0.5, "k": 20, "A": 0.2}');
    expect(Math.abs(motion.omega - Math.sqrt(40))).toBeLessThan(1e-12);
    expect(
      Math.abs(motion.period - (2 * Math.PI) / Math.sqrt(40)) < 1e-12 &&
        Math.abs(motion.period - 2 * Math.PI * Math.sqrt(0.5 / 20)) < 1e-12,
    ).toBe(true);
    expect(Math.abs(motion.frequency * motion.period - 1)).toBeLessThan(1e-12);
    expect(
      Math.abs(motion.maxSpeed - 0.2 * Math.sqrt(40)) < 1e-12 && Math.abs(motion.maxAcceleration - 0.2 * 40) < 1e-12,
    ).toBe(true);
    // Released from rest at x = A: back at A after one period, at −A after half, passing 0 at a quarter.
    expect(Math.abs(motion.position(0) - 0.2) < 1e-12 && Math.abs(motion.position(motion.period) - 0.2) < 1e-12).toBe(
      true,
    );
    expect(
      Math.abs(motion.position(motion.period / 2) + 0.2) < 1e-12 &&
        Math.abs(motion.position(motion.period / 4)) < 1e-12,
    ).toBe(true);
    expect(
      Math.abs(Math.abs(motion.velocity(motion.period / 4)) - motion.maxSpeed),
      "fastest through the centre",
    ).toBeLessThan(1e-12);
    // Energy: ½kA² = ½mv²max, and ½mv² + ½kx² is constant.
    expect(Math.abs(motion.energy - 0.5 * 0.5 * motion.maxSpeed * motion.maxSpeed)).toBeLessThan(1e-12);
    for (let fraction = 0; fraction <= 2.0; fraction += 0.13) {
      const t = motion.period * fraction;
      const total = 0.5 * 0.5 * Math.pow(motion.velocity(t), 2) + 0.5 * 20 * Math.pow(motion.position(t), 2);
      expect(Math.abs(total - motion.energy)).toBeLessThan(1e-12);
      // a = −ω²x
      const acceleration = -motion.maxAcceleration * Math.cos(motion.omega * t);
      expect(Math.abs(acceleration + motion.omega * motion.omega * motion.position(t))).toBeLessThan(1e-9);
    }
    // A stiffer spring makes the period shorter; a heavier mass longer; the amplitude does not matter.
    const stiff = oscillatorOf('{"m": 0.5, "k": 80, "A": 0.2}');
    const heavy = oscillatorOf('{"m": 2, "k": 20, "A": 0.2}');
    const wide = oscillatorOf('{"m": 0.5, "k": 20, "A": 0.4}');
    expect(
      Math.abs(stiff.period - motion.period / 2) < 1e-12 &&
        Math.abs(heavy.period - 2 * motion.period) < 1e-12 &&
        wide.period === motion.period,
    ).toBe(true);
  });

  it("the block and the graph keep the same period", () => {
    const built = scene("springOscillator", '{"m": 0.5, "k": 20, "A": 0.2}');
    const compiled = new CompiledIllustration(built);
    const motion = oscillatorOf('{"m": 0.5, "k": 20, "A": 0.2}');
    const period = screenPeriod(motion.period);
    const release = Teach.start(2);
    const block = element(built, (e) => e.kind === "rect" && e.color === "accent");
    const centre = (t: number) => value(compiled, block.x, t) + 0.4;
    // The block moves as a cosine in the period it is given: the extremes and the centre are where they should be.
    const right = centre(release);
    const left = centre(release + period / 2);
    const mid = centre(release + period / 4);
    expect(Math.abs(centre(release + period) - right), "back at +A after one screen period").toBeLessThan(1e-6);
    expect(Math.abs(mid - (right + left) / 2), "through the equilibrium after a quarter").toBeLessThan(1e-6);
    expect(right).toBeGreaterThan(left);
    const equilibrium = element(built, (e) => e.kind === "line" && e.dashed === true && e.color === "muted");
    expect(Math.abs((compiled.value(equilibrium.x, {}) ?? -1) - mid), "the dashed line marks x = 0").toBeLessThan(1e-6);
    // The spring runs from the wall to the face of the block, always.
    const spring = element(built, (e) => e.kind === "spring");
    for (const time of [release, release + 0.7, release + 1.9, release + 3.3]) {
      expect(Math.abs(value(compiled, spring.x2, time) - (centre(time) - 0.4))).toBeLessThan(1e-6);
      expect(value(compiled, spring.x2, time), "the spring never has to vanish").toBeGreaterThan(
        value(compiled, spring.x, time) + 0.3,
      );
    }
    // The graph: two periods, a cosine starting at its peak, symmetric about the t axis.
    const wave = element(built, (e) => e.kind === "curve");
    const points = curvePoints(wave, built, 0.95 * (built.duration ?? 0), 400);
    const axis = Number(element(built, (e) => e.kind === "arrow").y);
    const highest = Math.max(...points.map((p) => p.y));
    const lowest = Math.min(...points.map((p) => p.y));
    expect(Math.abs(highest - axis + (lowest - axis)), "peaks and troughs are equally far from the axis").toBeLessThan(
      1e-2,
    );
    const peaks = points.flatMap((point, index) => {
      const y = point.y;
      const isPeak =
        y > highest - 1e-2 * (highest - lowest) &&
        (index === 0 || y >= points[index - 1]!.y) &&
        (index === points.length - 1 || y > points[index + 1]!.y - 1e-9);
      return isPeak ? [point.x] : [];
    });
    const distinct: number[] = [];
    for (const x of peaks) if (distinct.length === 0 || Math.abs(distinct.at(-1)! - x) > 0.3) distinct.push(x);
    expect(distinct, "peaks at t = 0, T and 2T").toHaveLength(3);
    expect(Math.abs(distinct[1]! - distinct[0]! - (distinct[2]! - distinct[1]!))).toBeLessThan(0.05);
    const shown = finalLabels(built);
    expect(shown).toContain("ω = √(k/m) = 6,32 rad/s  ·  T = 2π/ω = 0,993 s  ·  f = 1/T = 1,01 Hz");
    expect(shown.some((l) => l.includes("vmáx = Aω = 1,26 m/s") && l.includes("aₘₐₓ = Aω² = 8 m/s²"))).toBe(true);
    expect(shown.includes("T = 0,993 s") && shown.includes("+A") && shown.includes("−A")).toBe(true);
  });

  it("sliders and refusals", () => {
    const base = figure("springOscillator", '{"m": 0.5, "k": 20, "A": 0.2}');
    expect(finalLabels(merged(base, { m: 2, k: 20, A: 0.2 })!).some((l) => l.includes("T = 2π/ω = 1,99 s"))).toBe(true);
    // A slower oscillator also looks slower on the screen.
    expect(screenPeriod(3)).toBeGreaterThan(screenPeriod(0.3));
    expect(screenPeriod(100) === 4 && screenPeriod(0.01) === 1.5).toBe(true);
    for (const json of ['{"m": 0}', '{"k": -5}', '{"A": 0}', '{"m": 0.5, "k": 20, "A": 500}'])
      expect(refused("springOscillator", json), json).toBe(true);
  });
});

describe("resistor networks", () => {
  it("series and parallel resistors obey Kirchhoff", () => {
    const series = new ResistorNetwork(false, 12, [10, 20, 30]);
    expect(series.equivalent === 60 && Math.abs(series.current - 0.2) < 1e-12).toBe(true);
    expect(series.branchCurrents, "the same current everywhere in series").toEqual([
      series.current,
      series.current,
      series.current,
    ]);
    expect(Math.abs(series.voltages.reduce((s, v) => s + v, 0) - 12), "KVL").toBeLessThan(1e-12);
    series.voltages.forEach((voltage, index) =>
      expect(Math.abs(voltage - series.current * series.resistances[index]!)).toBeLessThan(1e-12),
    );
    const parallel = new ResistorNetwork(true, 12, [10, 20, 30]);
    expect(Math.abs(parallel.equivalent - 60 / 11), "1/Req = 1/10 + 1/20 + 1/30 = 11/60").toBeLessThan(1e-12);
    expect(parallel.voltages, "the same voltage across every branch").toEqual([12, 12, 12]);
    expect(Math.abs(parallel.branchCurrents.reduce((s, v) => s + v, 0) - parallel.current), "KCL").toBeLessThan(1e-12);
    expect(
      Math.abs(parallel.branchCurrents[0]! - 1.2) < 1e-12 && Math.abs(parallel.branchCurrents[2]! - 0.4) < 1e-12,
    ).toBe(true);
    // Two equal resistors: R/2 in parallel, 2R in series. In parallel Req is below the smallest R.
    expect(new ResistorNetwork(true, 1, [8, 8]).equivalent).toBe(4);
    expect(new ResistorNetwork(false, 1, [8, 8]).equivalent).toBe(16);
    expect(new ResistorNetwork(true, 1, [6, 3]).equivalent).toBe(2);
    expect(parallel.equivalent < 10 && series.equivalent > 30).toBe(true);
  });

  it("the series circuit draws its parts and writes the numbers", () => {
    const built = scene("resistorNetwork", '{"kind": "series", "V": 12, "R": [10, 20, 30]}');
    const parts = built.elements.filter((e) => e.kind === "component");
    expect(
      parts.filter((e) => e.component === "resistor").length === 3 &&
        parts.filter((e) => e.component === "battery").length === 1,
    ).toBe(true);
    const shown = finalLabels(built);
    for (const text of [
      "R₁ = 10 Ω",
      "R₂ = 20 Ω",
      "R₃ = 30 Ω",
      "U₁ = 2 V",
      "U₂ = 4 V",
      "U₃ = 6 V",
      "I = 0,2 A",
      "ε = 12 V",
    ])
      expect(shown, text).toContain(text);
    expect(shown).toContain("Req = R₁ + R₂ + R₃ = 10 + 20 + 30 = 60 Ω");
    expect(shown).toContain("I = ε/Req = 12/60 = 0,2 A  ·  ΣU = 12 V = ε");
    // The resistors sit on the top wire in the order R₁, R₂, R₃; the loop is closed (no gap along the top).
    const compiled = new CompiledIllustration(built);
    const end = 0.95 * (built.duration ?? 0);
    const starts = parts.filter((e) => e.component === "resistor").map((e) => value(compiled, e.x, end));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    const top = built.elements
      .filter((e) => e.kind === "line" || e.kind === "component")
      .flatMap((e) => {
        if ((compiled.value(e.visible ?? "", values(end)) ?? 1) <= 0 && e.visible) return [];
        const y = compiled.value(e.y ?? "", values(end));
        const y2 = compiled.value(e.y2 ?? "", values(end));
        const x = compiled.value(e.x ?? "", values(end));
        const x2 = compiled.value(e.x2 ?? "", values(end));
        if (y === null || y2 === null || x === null || x2 === null) return [];
        if (Math.abs(y - 4.2) >= 1e-6 || Math.abs(y2 - 4.2) >= 1e-6) return [];
        return [[Math.min(x, x2), Math.max(x, x2)] as const];
      })
      .sort((a, b) => a[0] - b[0]);
    for (let index = 1; index < top.length; index++)
      expect(Math.abs(top[index]![0] - top[index - 1]![1]), "the wire is continuous").toBeLessThan(1e-6);
    // The current is the same in every wire; before the resistors are drawn there is a plain wire in their place.
    const early = values(Teach.start(0) + 0.3);
    expect(
      built.elements.filter((e) => e.kind === "line" && (compiled.value(e.visible ?? "", early) ?? 0) > 0).length,
    ).toBeGreaterThanOrEqual(5);
    expect(
      built.elements
        .filter((e) => e.component === "resistor")
        .every((e) => (compiled.value(e.visible ?? "", early) ?? 0) <= 0),
    ).toBe(true);
  });

  it("the parallel circuit shows what each rail carries", () => {
    const built = scene("resistorNetwork", '{"kind": "parallel", "V": 12, "R": [10, 20, 30]}');
    const shown = finalLabels(built);
    for (const text of ["R₁ = 10 Ω", "I₁ = 1,2 A", "I₂ = 0,6 A", "I₃ = 0,4 A", "ε = 12 V"])
      expect(shown, text).toContain(text);
    expect(shown).toContain("1/Req = 1/R₁ + 1/R₂ + 1/R₃ = 1/10 + 1/20 + 1/30  ⇒  Req = 5,45 Ω");
    expect(shown).toContain("I = ε/Req = 2,2 A = I₁ + I₂ + I₃ = 1,2 + 0,6 + 0,4 A");
    const compiled = new CompiledIllustration(built);
    const end = 0.95 * (built.duration ?? 0);
    // The three resistors are branches between the two rails, side by side.
    const resistors = built.elements.filter((e) => e.component === "resistor");
    expect(resistors).toHaveLength(3);
    for (const resistor of resistors) {
      expect(Math.abs(value(compiled, resistor.x, end) - value(compiled, resistor.x2, end)), "vertical").toBeLessThan(
        1e-9,
      );
      expect(
        Math.abs(value(compiled, resistor.y, end) - 4.2) < 1e-9 &&
          Math.abs(value(compiled, resistor.y2, end) - 1.8) < 1e-9,
      ).toBe(true);
    }
    // The current in the top rail falls by each branch's share: I, then I − I₁, then I − I₁ − I₂.
    const rails = built.elements
      .filter(
        (e) =>
          e.kind === "line" &&
          Math.abs((compiled.value(e.y ?? "", values(end)) ?? 0) - 4.2) < 1e-6 &&
          Math.abs((compiled.value(e.y2 ?? "", values(end)) ?? 0) - 4.2) < 1e-6,
      )
      .sort((a, b) => value(compiled, a.x, end) - value(compiled, b.x, end));
    const carried = rails.flatMap((e) => {
      const current = compiled.value(e.current ?? "", values(end));
      return current === null ? [] : [current];
    });
    expect(carried).toHaveLength(3);
    carried.forEach((current, index) => expect(Math.abs(current - [2.2, 1.0, 0.4][index]!)).toBeLessThan(1e-6));
    // Two branches also work.
    expect(
      finalLabels(scene("resistorNetwork", '{"kind": "parallel", "V": 9, "R": [6, 3]}')).some((l) =>
        l.includes("Req = 2 Ω"),
      ),
    ).toBe(true);
  });

  it("the sliders rewrite the numbers", () => {
    const base = figure("resistorNetwork", '{"kind": "series", "V": 12, "R": [10, 20, 30]}');
    const moved = merged(base, { V: 24, R1: 20, R2: 20, R3: 20 })!;
    expect(finalLabels(moved)).toContain("Req = R₁ + R₂ + R₃ = 20 + 20 + 20 = 60 Ω");
    expect(finalLabels(moved)).toContain("I = 0,4 A");
    expect(moved.parameters?.map((p) => p.name)).toEqual(["V", "R1", "R2", "R3"]);
    expect(scene("resistorNetwork", '{"kind": "series", "V": 6, "R": [4, 8]}').parameters?.map((p) => p.name)).toEqual([
      "V",
      "R1",
      "R2",
    ]);
    for (const json of [
      '{"kind": "series", "R": [10]}',
      '{"kind": "mixed", "R": [10, 20]}',
      '{"kind": "series", "R": [10, 0]}',
      '{"kind": "series", "R": [10, 20, 30, 40]}',
      '{"kind": "series", "V": -5, "R": [10, 20]}',
      '{"kind": "parallel"}',
    ])
      expect(refused("resistorNetwork", json), json).toBe(true);
  });
});

describe("pulleys", () => {
  it("the acceleration and the tension satisfy Newton's laws", () => {
    // Atwood: 2 kg and 3 kg.
    const atwood = new PulleySystem(false, 2, 3, 9.8);
    expect(
      Math.abs(atwood.acceleration - 1.96) < 1e-12 &&
        Math.abs(atwood.tension - 23.52) < 1e-12 &&
        atwood.direction === 1,
    ).toBe(true);
    // The heavier mass: m₂g − T = m₂a. The lighter: T − m₁g = m₁a.
    expect(Math.abs(3 * 9.8 - atwood.tension - 3 * atwood.acceleration)).toBeLessThan(1e-12);
    expect(Math.abs(atwood.tension - 2 * 9.8 - 2 * atwood.acceleration)).toBeLessThan(1e-12);
    expect(atwood.tension > 2 * 9.8 && atwood.tension < 3 * 9.8, "T lies between the two weights").toBe(true);
    // Swapped, the other mass goes down; equal masses stay put with T = mg.
    const swapped = new PulleySystem(false, 3, 2, 9.8);
    expect(
      swapped.direction === -1 &&
        Math.abs(swapped.acceleration - atwood.acceleration) < 1e-12 &&
        Math.abs(swapped.tension - atwood.tension) < 1e-12,
    ).toBe(true);
    const balanced = new PulleySystem(false, 4, 4, 9.8);
    expect(
      balanced.direction === 0 && balanced.acceleration === 0 && Math.abs(balanced.tension - 4 * 9.8) < 1e-12,
    ).toBe(true);
    // A block on a smooth table pulled by a hanging mass: a = m₂g/(m₁ + m₂), T = m₁a.
    const table = new PulleySystem(true, 2, 3, 9.8);
    expect(Math.abs(table.acceleration - 5.88) < 1e-12 && Math.abs(table.tension - 11.76) < 1e-12).toBe(true);
    expect(
      Math.abs(table.tension - 2 * table.acceleration) < 1e-12 &&
        Math.abs(3 * 9.8 - table.tension - 3 * table.acceleration) < 1e-12,
    ).toBe(true);
    expect(table.acceleration, "never faster than free fall").toBeLessThan(9.8);
  });

  it("the Atwood ropes keep their total length and the heavier mass goes down", () => {
    const built = scene("atwood", '{"kind": "atwood", "m1": 2, "m2": 3}');
    const compiled = new CompiledIllustration(built);
    const ropes = built.elements
      .filter((e) => e.kind === "line" && e.color === "white" && e.x === e.x2 && e.y2 !== e.y)
      .sort((a, b) => (compiled.value(a.x ?? "", {}) ?? 0) - (compiled.value(b.x ?? "", {}) ?? 0));
    expect(ropes).toHaveLength(2);
    const length = (rope: IllustrationElement, t: number) =>
      Math.abs(value(compiled, rope.y, t) - value(compiled, rope.y2, t));
    const start = Teach.start(2);
    const totals: number[] = [];
    const tops: [number, number][] = [];
    for (let index = 0; index <= 40; index++) {
      const t = start + (3.5 * index) / 40;
      totals.push(length(ropes[0]!, t) + length(ropes[1]!, t));
      tops.push([value(compiled, ropes[0]!.y2, t), value(compiled, ropes[1]!.y2, t)]);
    }
    for (const total of totals) expect(Math.abs(total - totals[0]!), "the rope does not stretch").toBeLessThan(1e-3);
    // m₂ (right, 3 kg) goes down and m₁ (left, 2 kg) goes up, by the same distance each instant.
    expect(tops.at(-1)![1] < tops[0]![1] - 0.5 && tops.at(-1)![0] > tops[0]![0] + 0.5).toBe(true);
    for (const [left, right] of tops) expect(Math.abs(left - tops[0]![0] + (right - tops[0]![1]))).toBeLessThan(1e-3);
    // The distance grows as t²: after half of the time a quarter of the way (constant acceleration from rest).
    const quarter = tops[0]![1] - (tops[0]![1] - tops[40]![1]) / 4;
    expect(Math.abs(tops[20]![1] - quarter)).toBeLessThan(1e-3);
    // Forces and labels never collide, at any moment.
    for (let index = 0; index <= 100; index++) {
      const t = ((built.duration ?? 0) * index) / 100;
      expect(overlapProblems(built, t).slice(0, 2), `t = ${t}`).toEqual([]);
      expect(boundsProblems(built, t).slice(0, 2), `t = ${t}`).toEqual([]);
    }
    const shown = finalLabels(built);
    expect(shown).toContain("a = (m₂ − m₁)g/(m₁ + m₂) = 1,96 m/s²");
    expect(shown).toContain("T = 2m₁m₂g/(m₁ + m₂) = 23,5 N");
    expect(
      shown.includes("m₁ = 2 kg  ·  m₂ = 3 kg") && shown.includes("P₁") && shown.includes("P₂") && shown.includes("T"),
    ).toBe(true);
    // The weight arrows are in proportion to the weights, and T is between them.
    const weights = built.elements.filter((e) => e.kind === "arrow" && e.color !== "white");
    const tensions = built.elements.filter((e) => e.kind === "arrow" && e.color === "white");
    const end = 0.95 * (built.duration ?? 0);
    const size = (arrow: IllustrationElement) =>
      Math.abs(value(compiled, arrow.y2, end) - value(compiled, arrow.y, end));
    expect(weights.length === 2 && tensions.length === 2).toBe(true);
    const small = size(weights[0]!);
    const big = size(weights[1]!);
    expect(Math.abs(big / small - 1.5), "3 kg weighs 1.5 times 2 kg").toBeLessThan(1e-2);
    expect(Math.abs(size(tensions[0]!) / small - 23.52 / 19.6)).toBeLessThan(1e-2);
    // Equal masses: nothing moves, so one step fewer and no motion at all.
    const balanced = scene("atwood", '{"kind": "atwood", "m1": 4, "m2": 4}');
    expect(boundaries(balanced)).toHaveLength(4);
    expect(finalLabels(balanced).some((l) => l.includes("a = 0"))).toBe(true);
  });

  it("the block on the table is pulled by the hanging mass", () => {
    const built = scene("atwood", '{"kind": "table", "m1": 2, "m2": 3}');
    const compiled = new CompiledIllustration(built);
    const blocks = built.elements.filter((e) => e.kind === "rect");
    const block = blocks.find((e) => e.color === "accent")!;
    const hanging = blocks.find((e) => e.color === "second")!;
    const start = Teach.start(2);
    const before = start - 0.1;
    const after = start + 3.5;
    // The block moves right along the table as far as the hanging mass drops.
    const slid = value(compiled, block.x, after) - value(compiled, block.x, before);
    const dropped = value(compiled, hanging.y, before) - value(compiled, hanging.y, after);
    expect(slid > 0.5 && Math.abs(slid - dropped) < 1e-3, `the string is taut: ${slid} vs ${dropped}`).toBe(true);
    // The block stays on the table top.
    expect(Math.abs(value(compiled, block.y, before) - value(compiled, block.y, after))).toBeLessThan(1e-9);
    const shown = finalLabels(built);
    expect(shown.some((l) => l.includes("a = m₂g/(m₁ + m₂) = 5,88 m/s²"))).toBe(true);
    expect(shown).toContain("T = m₁m₂g/(m₁ + m₂) = 11,8 N");
    for (let index = 0; index <= 100; index++) {
      const t = ((built.duration ?? 0) * index) / 100;
      expect(overlapProblems(built, t).slice(0, 2), `t = ${t}`).toEqual([]);
      expect(boundsProblems(built, t).slice(0, 2), `t = ${t}`).toEqual([]);
    }
  });

  it("sliders and refusals", () => {
    const base = figure("atwood", '{"kind": "atwood", "m1": 2, "m2": 3}');
    expect(finalLabels(merged(base, { m1: 5, m2: 1 })!)).toContain("a = (m₂ − m₁)g/(m₁ + m₂) = 6,53 m/s²");
    for (const json of [
      '{"kind": "atwood", "m1": 2}',
      '{"kind": "spiral", "m1": 2, "m2": 3}',
      '{"kind": "atwood", "m1": 0, "m2": 3}',
      '{"kind": "table", "m1": 2, "m2": -3}',
      '{"kind": "atwood", "m1": 2, "m2": 3, "g": 0}',
    ])
      expect(refused("atwood", json), json).toBe(true);
  });
});
