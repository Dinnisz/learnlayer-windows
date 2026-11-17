// Port of the vectors and planes in space and the solids suites of LearnLayerTests/PremadeFigureBatch3MathTests.swift
// @ ref 2026-11-04. Every gallery sample is also checked for bounds, overlaps and movement in animated.test.ts.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration } from "../illustration";
import { PremadeFigures, type PremadeFigure } from "../premadeFigure";
import { Vector3 } from "../spaceFigure";
import { sample } from "./animated";
import type { Point } from "./optics";
import { curvePoints, finalLabels, values } from "./sceneCheck";
import { CabinetProjection, solidMeasures } from "./space";

const language = "Portuguese (Portugal)";
const figure = (type: string, json: string) => sample(type, json);
const compile = (premade: PremadeFigure, lang = language) => new PremadeFigures(premade).compile("t", lang);
const scene = (type: string, json: string) => {
  const built = compile(figure(type, json));
  if (!built) throw new Error(`${type} did not compile: ${json}`);
  return built;
};
const merged = (premade: PremadeFigure, sliders: Record<string, number>) =>
  compile(new PremadeFigures(premade).mergingParameters(sliders));
const refused = (type: string, json: string) => compile(figure(type, json), "English") === null;
const ending = (built: Illustration) => 0.95 * (built.duration ?? 0);
const project = (v: Vector3) => CabinetProjection.project(v);
const boundariesOf = (built: Illustration) =>
  (built as { stepPlayback?: { boundaries: number[] } | null }).stepPlayback?.boundaries ?? [];
const find = <T>(list: T[], test: (item: T) => boolean): T => {
  const found = list.find(test);
  if (found === undefined) throw new Error("not found");
  return found;
};

/** The arrows at the end of the animation, in world coordinates. */
function arrows(built: Illustration): { color: string; from: Point; to: Point }[] {
  const compiled = new CompiledIllustration(built);
  const at = values(ending(built));
  return built.elements.flatMap((e) => {
    if (e.kind !== "arrow") return [];
    const [x, y, x2, y2] = [e.x, e.y, e.x2, e.y2].map((t) => compiled.value(t ?? "", at));
    if ([x, y, x2, y2].some((v) => v === null)) return [];
    return [{ color: e.color ?? "white", from: { x: x!, y: y! }, to: { x: x2!, y: y2! } }];
  });
}

/** The lines at the end of the animation: colour, dashed, and length in world units. */
function lines(built: Illustration): { color: string; dashed: boolean; length: number }[] {
  const compiled = new CompiledIllustration(built);
  const at = values(ending(built));
  return built.elements.flatMap((e) => {
    if (e.kind !== "line") return [];
    const [x, y, x2, y2] = [e.x, e.y, e.x2, e.y2].map((t) => compiled.value(t ?? "", at));
    if ([x, y, x2, y2].some((v) => v === null)) return [];
    return [{ color: e.color ?? "white", dashed: e.dashed === true, length: Math.hypot(x2! - x!, y2! - y!) }];
  });
}

const same = (a: Vector3, b: Vector3) => a.x === b.x && a.y === b.y && a.z === b.z;

describe("vectors and planes in space", () => {
  it("the cross product is perpendicular and its length is the parallelogram's area", () => {
    const u = new Vector3(1, 2, 3);
    const v = new Vector3(4, 5, 6);
    expect(same(u.cross(v), new Vector3(-3, 6, -3))).toBe(true);
    const w = new Vector3(2, 0, 0).cross(new Vector3(0, 3, 1));
    expect(same(w, new Vector3(0, -2, 6))).toBe(true);
    expect(Math.abs(w.dot(new Vector3(2, 0, 0))) < 1e-12 && Math.abs(w.dot(new Vector3(0, 3, 1))) < 1e-12).toBe(true);
    const lengths = u.length * v.length;
    expect(Math.abs(u.cross(v).length ** 2 - (lengths * lengths - u.dot(v) ** 2))).toBeLessThan(1e-9);
    // Right-handed: x × y = z, and swapping the factors flips the sign.
    expect(same(new Vector3(1, 0, 0).cross(new Vector3(0, 1, 0)), new Vector3(0, 0, 1))).toBe(true);
    expect(same(v.cross(u), u.cross(v).times(-1))).toBe(true);
  });

  it("the vectors are drawn by the cabinet projection", () => {
    const built = scene("space3D", '{"mode": "vectors", "operation": "cross", "u": [2, 0, 0], "v": [0, 3, 1]}');
    const all = arrows(built);
    const origin = find(all, (a) => a.color === "muted").from;
    const u = find(all, (a) => a.color === "accent");
    const v = find(all, (a) => a.color === "second");
    const product = find(all, (a) => a.color === "white");
    // Every arrow starts at the origin of the axes.
    for (const arrow of [u, v, product])
      expect(Math.abs(arrow.from.x - origin.x) < 1e-3 && Math.abs(arrow.from.y - origin.y) < 1e-3).toBe(true);
    // On screen, each vector is the same multiple of its projection (one scale, equal units).
    const pv = project(new Vector3(0, 3, 1));
    const k = Math.hypot(v.to.x - origin.x, v.to.y - origin.y) / Math.hypot(pv.x, pv.y);
    for (const [arrow, vector] of [
      [u, new Vector3(2, 0, 0)],
      [product, new Vector3(0, -2, 6)],
    ] as const) {
      const p = project(vector);
      expect(Math.abs(arrow.to.x - origin.x - k * p.x) < 1e-3 && Math.abs(arrow.to.y - origin.y - k * p.y) < 1e-3).toBe(
        true,
      );
    }
    // Ox is foreshortened and points down and to the left; Oy to the right; Oz up.
    const axes = all.filter((a) => a.color === "muted");
    expect(axes).toHaveLength(3);
    const [x, y, z] = axes as [(typeof axes)[0], (typeof axes)[0], (typeof axes)[0]];
    expect(x.to.x < origin.x && x.to.y < origin.y).toBe(true);
    expect(y.to.x > origin.x && Math.abs(y.to.y - origin.y) < 1e-6).toBe(true);
    expect(Math.abs(z.to.x - origin.x) < 1e-6 && z.to.y > origin.y).toBe(true);
    const shown = finalLabels(built);
    expect(shown).toContain("u × v = (0; −2; 6)");
    expect(shown.some((l) => l.includes("área do paralelogramo = 6,32"))).toBe(true);
  });

  it("the sum and the dot product read their results", () => {
    const sum = scene("space3D", '{"mode": "vectors", "operation": "sum", "u": [2, 1, 0], "v": [-1, 2, 2]}');
    expect(finalLabels(sum)).toContain("u + v = (2; 1; 0) + (−1; 2; 2) = (1; 3; 2)");
    const all = arrows(sum);
    const origin = find(all, (a) => a.color === "muted").from;
    const u = find(all, (a) => a.color === "accent");
    const v = find(all, (a) => a.color === "second");
    const total = find(all, (a) => a.color === "white");
    expect(Math.abs(total.to.x - origin.x - (u.to.x - origin.x + (v.to.x - origin.x)))).toBeLessThan(1e-3);
    expect(Math.abs(total.to.y - origin.y - (u.to.y - origin.y + (v.to.y - origin.y)))).toBeLessThan(1e-3);
    const dot = scene("space3D", '{"mode": "vectors", "operation": "dot", "u": [2, 2, 0], "v": [0, 2, 2]}');
    const shown = finalLabels(dot);
    expect(shown).toContain("u · v = 2·0 + 2·2 + 0·2 = 4");
    expect(shown.some((l) => l.includes("cos θ") && l.includes("0,5") && l.includes("θ = 60°"))).toBe(true);
    // The arc of θ ends on the direction of v.
    const arc = find(dot.elements, (e) => e.kind === "curve");
    const points = curvePoints(arc, dot, ending(dot));
    const first = points[0]!;
    const last = points.at(-1)!;
    const vArrow = find(arrows(dot), (a) => a.color === "second");
    const origin2 = find(arrows(dot), (a) => a.color === "muted").from;
    const wanted = Math.atan2(vArrow.to.y - origin2.y, vArrow.to.x - origin2.x);
    const reached = Math.atan2(last.y - origin2.y, last.x - origin2.x);
    expect(Math.abs(wanted - reached), "the arc must end on v").toBeLessThan(0.05);
    expect(Math.abs(first.x - origin2.x) + Math.abs(first.y - origin2.y)).toBeGreaterThan(0.1);
    // Parallel vectors: the cross product is the zero vector, and nothing is drawn for it.
    const parallel = scene("space3D", '{"mode": "vectors", "operation": "cross", "u": [1, 2, 3], "v": [2, 4, 6]}');
    expect(finalLabels(parallel).some((l) => l.includes("vetor nulo"))).toBe(true);
    expect(arrows(parallel).some((a) => a.color === "white")).toBe(false);
  });

  it("the plane has its normal and its distance from the origin", () => {
    const built = scene("space3D", '{"mode": "plane", "a": 2, "b": 1, "c": -1, "d": 6}');
    const shown = finalLabels(built);
    expect(shown.some((l) => l.startsWith("π: 2x + y − z = 6") && l.includes("n = (2; 1; −1)"))).toBe(true);
    expect(shown).toContain("d(O, π) = |d|/|n| = 6/2,45 = 2,45");
    // The foot of the perpendicular d·n/|n|² = (2, 1, −1) satisfies the equation, and |foot| = d/|n|.
    const n = new Vector3(2, 1, -1);
    const foot = n.times(6 / (n.length * n.length));
    expect(foot.minus(new Vector3(2, 1, -1)).length < 1e-12 && Math.abs(n.dot(foot) - 6) < 1e-12).toBe(true);
    expect(Math.abs(foot.length - 6 / n.length)).toBeLessThan(1e-12);
    // On screen the normal arrow runs along the projection of n, starting at the foot of the perpendicular.
    const all = arrows(built);
    const origin = find(all, (a) => a.color === "muted").from;
    const normal = find(all, (a) => a.color === "second");
    const tip = foot.plus(n.times(1 / n.length).times(1.3));
    const step = project(tip.minus(foot));
    const k = Math.hypot(normal.to.x - normal.from.x, normal.to.y - normal.from.y) / Math.hypot(step.x, step.y);
    expect(
      Math.abs(normal.from.x - origin.x - k * project(foot).x) < 1e-3 &&
        Math.abs(normal.from.y - origin.y - k * project(foot).y) < 1e-3,
    ).toBe(true);
    expect(
      Math.abs(normal.to.x - origin.x - k * project(tip).x) < 1e-3 &&
        Math.abs(normal.to.y - origin.y - k * project(tip).y) < 1e-3,
    ).toBe(true);
    // The plane cuts Ox at d/a = 3: a dot on the axis at the projection of (3, 0, 0).
    const compiled = new CompiledIllustration(built);
    const spot = find(built.elements, (e) => e.kind === "point" && e.color === "white");
    const at = values(ending(built));
    const dotX = compiled.value(spot.x ?? "", at)!;
    const dotY = compiled.value(spot.y ?? "", at)!;
    const cut = project(new Vector3(3, 0, 0));
    expect(Math.abs(dotX - origin.x - k * cut.x) < 1e-3 && Math.abs(dotY - origin.y - k * cut.y) < 1e-3).toBe(true);
    // Through the origin: no foot to mark, no cuts, one step fewer.
    const through = scene("space3D", '{"mode": "plane", "a": 1, "b": 1, "c": 1, "d": 0}');
    expect(finalLabels(through).some((l) => l.includes("d(O, π) = 0"))).toBe(true);
    expect(boundariesOf(through).length === 4 && boundariesOf(built).length === 5).toBe(true);
  });

  it("sliders and refusals", () => {
    const plane = figure("space3D", '{"mode": "plane", "a": 2, "b": 1, "c": -1, "d": 6}');
    expect(finalLabels(merged(plane, { d: 0, a: 1 })!).some((l) => l.startsWith("π: x + y − z = 0"))).toBe(true);
    const vectors = figure("space3D", '{"mode": "vectors", "operation": "sum", "u": [2, 1, 0], "v": [-1, 2, 2]}');
    expect(finalLabels(merged(vectors, { vz: 0 })!)).toContain("u + v = (2; 1; 0) + (−1; 2; 0) = (1; 3; 0)");
    for (const json of [
      '{"mode": "plane", "a": 0, "b": 0, "c": 0, "d": 1}',
      '{"mode": "plane", "a": 1}',
      '{"mode": "vectors", "u": [1, 2], "v": [1, 2, 3]}',
      '{"mode": "vectors", "u": [0, 0, 0], "v": [1, 2, 3]}',
      '{"mode": "vectors", "operation": "triple", "u": [1, 0, 0], "v": [0, 1, 0]}',
      '{"mode": "sphere"}',
    ])
      expect(refused("space3D", json), json).toBe(true);
  });
});

describe("solids", () => {
  it("the measures are right", () => {
    const box = solidMeasures("prism", 2, 3, 4, null)!;
    expect(box.volume === 24 && box.total === 52 && box.lateral === 40).toBe(true);
    const pyramid = solidMeasures("pyramid", 4, null, 3, null)!;
    expect(Math.abs((pyramid.slant ?? 0) - Math.sqrt(13))).toBeLessThan(1e-12);
    expect(Math.abs(pyramid.volume - 16)).toBeLessThan(1e-12);
    expect(Math.abs((pyramid.lateral ?? 0) - 4 * ((4 * Math.sqrt(13)) / 2)), "four triangles").toBeLessThan(1e-12);
    expect(Math.abs(pyramid.total - (16 + 8 * Math.sqrt(13)))).toBeLessThan(1e-12);
    const cylinder = solidMeasures("cylinder", null, null, 5, 2)!;
    expect(Math.abs(cylinder.volume - 20 * Math.PI) < 1e-9 && Math.abs(cylinder.total - 28 * Math.PI) < 1e-9).toBe(
      true,
    );
    expect(Math.abs((cylinder.lateral ?? 0) - 20 * Math.PI)).toBeLessThan(1e-9);
    const cone = solidMeasures("cone", null, null, 4, 3)!;
    expect(
      cone.slant === 5 && Math.abs(cone.volume - 12 * Math.PI) < 1e-9 && Math.abs(cone.total - 24 * Math.PI) < 1e-9,
    ).toBe(true);
    expect(Math.abs((cone.lateral ?? 0) - 15 * Math.PI)).toBeLessThan(1e-9);
    const sphere = solidMeasures("sphere", null, null, null, 3)!;
    expect(Math.abs(sphere.volume - 36 * Math.PI) < 1e-9 && Math.abs(sphere.total - 36 * Math.PI) < 1e-9).toBe(true);
    // A cone is a third of the cylinder on the same base and height.
    expect(Math.abs(solidMeasures("cylinder", null, null, 4, 3)!.volume - 3 * cone.volume)).toBeLessThan(1e-9);
    expect(solidMeasures("cone", null, null, 0, 3)).toBeNull();
    expect(solidMeasures("torus", 1, 1, 1, 1)).toBeNull();
  });

  it("the prism is drawn with its hidden edges dashed", () => {
    const built = scene("solids", '{"kind": "prism", "a": 3, "b": 2, "h": 4}');
    const drawn = lines(built);
    const solid = drawn.filter((l) => l.color === "white" && !l.dashed);
    const hidden = drawn.filter((l) => l.color === "muted" && l.dashed);
    expect(solid.length === 9 && hidden.length === 3, "a box shows 9 edges and hides 3").toBe(true);
    // Width : height of the front face is a : h, and the receding edge is b·√(0.45² + 0.3²) long.
    expect(Math.abs(solid[0]!.length / solid[1]!.length - 3 / 4)).toBeLessThan(1e-3);
    expect(Math.abs(hidden[0]!.length / solid[0]!.length - (2 * Math.sqrt(0.45 * 0.45 + 0.3 * 0.3)) / 3)).toBeLessThan(
      1e-3,
    );
    const shown = finalLabels(built);
    expect(shown).toContain("Volume V = a·b·h = 3·2·4 = 24");
    expect(shown).toContain("Área total: Aₜ = 2(ab + ah + bh) = 52");
    for (const name of ["a", "b", "h"]) expect(shown, name).toContain(name);
    // A square-based prism may give only a.
    expect(finalLabels(scene("solids", '{"kind": "prism", "a": 2, "h": 5}'))).toContain(
      "Volume V = a·b·h = 2·2·5 = 20",
    );
  });

  it("the pyramid shows its height and slant height", () => {
    const built = scene("solids", '{"kind": "pyramid", "a": 4, "h": 3}');
    const shown = finalLabels(built);
    expect(shown).toContain("Volume V = a²·h/3 = 4²·3/3 = 16");
    expect(
      shown.some((l) => l.includes("s = √(h² + (a/2)²) = 3,606") && l.includes("Área total: a² + 2as = 44,84")),
    ).toBe(true);
    for (const name of ["a", "h", "s"]) expect(shown, name).toContain(name);
    // Four edges to the apex are drawn (three seen, one hidden), and the height and slant height are dashed.
    const drawn = lines(built);
    expect(drawn.filter((l) => l.color === "white" && !l.dashed)).toHaveLength(2 + 3);
    expect(
      drawn.filter((l) => l.dashed && l.color === "muted"),
      "two hidden base edges and the hidden edge",
    ).toHaveLength(3);
    expect(drawn.filter((l) => l.dashed && (l.color === "second" || l.color === "accent"))).toHaveLength(2);
  });

  it("the cylinder and the cone keep their proportions", () => {
    const cylinder = scene("solids", '{"kind": "cylinder", "r": 2, "h": 5}');
    const time = ending(cylinder);
    const ellipses = cylinder.elements.filter((e) => e.kind === "curve");
    expect(ellipses, "top, front of the base, hidden back of the base").toHaveLength(3);
    // The top ellipse is the one that reaches highest.
    const highest = (e: (typeof ellipses)[0]) => Math.max(...curvePoints(e, cylinder, time).map((p) => p.y));
    const top = ellipses.reduce((best, e) => (highest(e) > highest(best) ? e : best));
    const points = curvePoints(top, cylinder, time);
    const width = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
    const heightOfEllipse = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
    expect(Math.abs(heightOfEllipse / width - 0.3), "a circle seen from the side is a flattened ellipse").toBeLessThan(
      1e-2,
    );
    // Side lines: h = 5 against a diameter of 4.
    const sides = lines(cylinder).filter((l) => l.color === "white" && !l.dashed);
    expect(sides.length === 2 && Math.abs(sides[0]!.length / width - 5 / 4) < 1e-2).toBe(true);
    const shown = finalLabels(cylinder);
    expect(shown.some((l) => l.includes("V = π·r²·h = π·2²·5 = 62,83"))).toBe(true);
    expect(shown).toContain("Área total: Aₜ = 2πr(r + h) = 87,96");
    const cone = scene("solids", '{"kind": "cone", "r": 3, "h": 4}');
    const coneLabels = finalLabels(cone);
    expect(coneLabels.some((l) => l.includes("g = √(r² + h²) = 5") && l.includes("πr(r + g) = 75,4"))).toBe(true);
    expect(coneLabels).toContain("Volume V = π·r²·h/3 = 37,7");
    for (const name of ["r", "h", "g"]) expect(coneLabels, name).toContain(name);
    // The slant sides meet at the apex above the centre of the base.
    const solidSides = lines(cone).filter((l) => l.color === "white" && !l.dashed);
    expect(solidSides.length === 2 && Math.abs(solidSides[0]!.length - solidSides[1]!.length) < 1e-6).toBe(true);
  });

  it("the sphere has its radius and equator", () => {
    const built = scene("solids", '{"kind": "sphere", "r": 3}');
    const curves = built.elements.filter((e) => e.kind === "curve");
    expect(curves).toHaveLength(3);
    const circle = curvePoints(curves[0]!, built, ending(built), 120);
    const xs = circle.map((p) => p.x);
    const ys = circle.map((p) => p.y);
    const centre = { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 };
    const radius = (Math.max(...xs) - Math.min(...xs)) / 2;
    for (const p of circle)
      expect(Math.abs(Math.hypot(p.x - centre.x, p.y - centre.y) - radius), "a sphere is round").toBeLessThan(1e-3);
    const shown = finalLabels(built);
    expect(shown.some((l) => l.includes("V = 4πr³/3 = 4π·3³/3 = 113,1"))).toBe(true);
    expect(shown.some((l) => l.includes("A = 4πr² = 113,1"))).toBe(true);
    expect(shown).toContain("r");
  });

  it("sliders and refusals", () => {
    const cone = figure("solids", '{"kind": "cone", "r": 3, "h": 4}');
    const moved = merged(cone, { r: 1, h: 6 })!;
    expect(finalLabels(moved).some((l) => l.includes("g = √(r² + h²) = 6,083"))).toBe(true);
    expect(moved.parameters?.map((p) => p.name)).toEqual(["r", "h"]);
    for (const json of [
      '{"kind": "prism", "a": 3, "b": 2}',
      '{"kind": "cone", "r": -1, "h": 2}',
      '{"kind": "sphere"}',
      '{"kind": "torus", "r": 1}',
      '{"kind": "pyramid", "a": 0, "h": 2}',
    ])
      expect(refused("solids", json), json).toBe(true);
  });
});
