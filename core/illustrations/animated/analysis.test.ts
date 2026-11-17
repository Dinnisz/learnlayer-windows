// Port of the modulus, Bolzano and sequence suites of LearnLayerTests/PremadeFigureBatch3MathTests.swift @ ref
// 2026-11-04. Every gallery sample is also checked for bounds, overlaps and movement in animated.test.ts.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration, type IllustrationElement } from "../illustration";
import { PremadeFigures, type PremadeFigure } from "../premadeFigure";
import { bisection, modulusSolutions, sequenceSpec, type SequenceBehaviour } from "./analysis";
import { sample } from "./animated";
import { Params, PlottedFunction } from "./figureCanvas";
import { curvePoints, finalLabels, values } from "./sceneCheck";

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
const fn = (text: string) => PlottedFunction.make(text)!;
const ending = (built: Illustration) => 0.95 * (built.duration ?? 0);
const axisY = (built: Illustration) => Number(built.elements.find((e) => e.kind === "arrow")!.y);
const at = (compiled: CompiledIllustration, text: string | null | undefined, time: number) =>
  compiled.value(text ?? "", values(time));
const rounded4 = (xs: number[]) => xs.map((x) => Math.round(x * 1e4) / 1e4 + 0);

describe("modulus", () => {
  it("the solutions are exact", () => {
    const linear = fn("x-1");
    const two = modulusSolutions(linear, 2, -4, 6);
    expect(two.length === 2 && Math.abs(two[0]! + 1) < 1e-6 && Math.abs(two[1]! - 3) < 1e-6).toBe(true);
    const quadratic = fn("x^2-4");
    expect(rounded4(modulusSolutions(quadratic, 0, -4, 4))).toEqual([-2, 2]);
    expect(rounded4(modulusSolutions(quadratic, 5, -4, 4))).toEqual([-3, 3]);
    const four = modulusSolutions(quadratic, 3, -4, 4);
    expect(four).toHaveLength(4);
    for (const x of four) expect(Math.abs(Math.abs(x * x - 4) - 3)).toBeLessThan(1e-6);
    // |x² − 4| = 4 also holds at x = 0, where the graph only touches the line.
    const touching = modulusSolutions(quadratic, 4, -4, 4);
    expect(touching.length === 3 && Math.abs(touching[1]!) < 1e-3).toBe(true);
    expect(modulusSolutions(quadratic, -1, -4, 4)).toEqual([]);
    // Above every value of |f| there is nothing to solve.
    expect(modulusSolutions(linear, 50, -4, 6)).toEqual([]);
  });

  it("reflects the negative part above the axis", () => {
    const built = scene("modulus", '{"f": "x-1", "xMin": -4, "xMax": 6, "k": 2}');
    const time = ending(built);
    const axis = axisY(built);
    const curves = built.elements.filter((e) => e.kind === "curve");
    const reflected = curves.filter((e) => e.color === "accent");
    const kept = curves.filter((e) => e.color === "white");
    const original = curves.filter((e) => e.color === "muted");
    expect(reflected.length === 1 && kept.length === 1 && original.length === 1).toBe(true);
    for (const curve of [...reflected, ...kept]) {
      const points = curvePoints(curve, built, time);
      expect(points.length).toBeGreaterThan(10);
      for (const point of points) expect(point.y, "|f| must not go below the axis").toBeGreaterThanOrEqual(axis - 1e-3);
    }
    // The dashed f really does go below the axis, and the reflected piece is its mirror image: the slope changes sign.
    const below = curvePoints(original[0]!, built, time);
    expect(below.some((p) => p.y < axis - 0.1)).toBe(true);
    const mirrored = curvePoints(reflected[0]!, built, time);
    const first = mirrored[0]!;
    const last = mirrored.at(-1)!;
    const slopeOfF = (below.at(-1)!.y - below[0]!.y) / (below.at(-1)!.x - below[0]!.x);
    const slopeOfReflection = (last.y - first.y) / (last.x - first.x);
    expect(Math.abs(slopeOfReflection + slopeOfF), "the reflected piece must have the opposite slope").toBeLessThan(
      1e-3,
    );
    // It ends on the axis, at the zero of f (x = 1).
    expect(Math.abs(last.y - axis)).toBeLessThan(1e-3);
    expect(Math.abs(first.y - axis)).toBeGreaterThan(1);
  });

  it("says where the line meets the graph", () => {
    const shown = finalLabels(scene("modulus", '{"f": "x-1", "xMin": -4, "xMax": 6, "k": 2}'));
    expect(shown.some((l) => l.includes("x = −1") && l.includes("x = 3"))).toBe(true);
    const none = finalLabels(scene("modulus", '{"f": "x-1", "xMin": -4, "xMax": 6, "k": -1}'));
    expect(none.some((l) => l.includes("não tem soluções"))).toBe(true);
    // Moving the slider recompiles with the new k and the new number of solutions.
    const base = figure("modulus", '{"f": "x^2-4", "xMin": -4, "xMax": 4, "k": 3}');
    const wide = merged(base, { k: 5 })!;
    const text = finalLabels(wide).join("|");
    expect(text.includes("x = −3") && text.includes("x = 3") && !text.includes("x = −1")).toBe(true);
    expect(wide.parameters?.find((p) => p.name === "k")?.value).toBe(5);
  });

  it("rejects what it cannot draw", () => {
    for (const json of [
      '{"f": "1/x", "xMin": -1, "xMax": 1}',
      '{"f": "x", "xMin": 2, "xMax": 1}',
      '{"f": "y+1"}',
      '{"f": "0"}',
      "{}",
    ])
      expect(refused("modulus", json), json).toBe(true);
  });
});

describe("Bolzano", () => {
  it("the bisection keeps the sign change and halves the interval", () => {
    const cubic = fn("x^3-x-2");
    const steps = bisection(cubic, 1, 2, 4)!;
    expect(steps).toHaveLength(4);
    // Hand-worked: 1.5 → [1.5, 2]; 1.75 → [1.5, 1.75]; 1.625 → [1.5, 1.625]; 1.5625 → [1.5, 1.5625].
    expect(steps.map((s) => s.mid)).toEqual([1.5, 1.75, 1.625, 1.5625]);
    expect(steps.map((s) => s.low)).toEqual([1.5, 1.5, 1.5, 1.5]);
    expect(steps.map((s) => s.high)).toEqual([2, 1.75, 1.625, 1.5625]);
    const root = 1.5213797068045676; // x³ − x − 2 = 0
    for (const step of steps) {
      expect(step.low <= root && root <= step.high).toBe(true);
      expect(cubic.value(step.low) * cubic.value(step.high)).toBeLessThanOrEqual(0);
    }
    steps.forEach((step, index) =>
      expect(Math.abs(step.high - step.low - 1 / Math.pow(2, index + 1))).toBeLessThan(1e-12),
    );
    // The theorem needs opposite signs: x² + 1 never changes sign, so there is nothing to bisect.
    expect(bisection(fn("x^2+1"), -1, 2, 3)).toBeNull();
    // A zero found exactly stops the halving.
    const exact = bisection(fn("x-1.5"), 1, 2, 5)!;
    expect(exact.length === 1 && exact[0]!.mid === 1.5 && exact[0]!.low === exact[0]!.high).toBe(true);
  });

  it("states the theorem and the enclosure", () => {
    const built = scene("bolzano", '{"f": "x^3-x-2", "a": 1, "b": 2, "n": 4}');
    const shown = finalLabels(built);
    expect(shown).toContain("f(a) = −2");
    expect(shown).toContain("f(b) = 4");
    expect(shown.some((l) => l.includes("f(a)·f(b) < 0") && l.includes("∃ c"))).toBe(true);
    expect(shown.some((l) => l.includes("4 bisseções") && l.includes("[1,5; 1,5625]"))).toBe(true);
    // One bracket row for [a, b] and one per halving, each half as wide as the one before.
    const compiled = new CompiledIllustration(built);
    const time = ending(built);
    const widths: number[] = [];
    for (const e of built.elements) {
      if (e.kind !== "line" || e.color === "muted" || e.dashed === true) continue;
      const [y1, y2, x1, x2] = [e.y, e.y2, e.x, e.x2].map((t) => at(compiled, t, time));
      if (y1 === null || y2 === null || x1 === null || x2 === null) continue;
      if (Math.abs(y1! - y2!) < 1e-9 && y1! < 2.0) widths.push(Math.abs(x2! - x1!));
    }
    expect(widths).toHaveLength(5);
    for (let index = 1; index < widths.length; index++)
      expect(Math.abs(widths[index]! * 2 - widths[index - 1]!), `row ${index}`).toBeLessThan(1e-3);
    // More halvings narrow the enclosure: the slider recompiles with n.
    const finer = merged(figure("bolzano", '{"f": "x^3-x-2", "a": 1, "b": 2, "n": 2}'), { n: 5.4 })!;
    expect(finer.parameters?.find((p) => p.name === "n")?.value).toBe(5);
    expect(finalLabels(finer).some((l) => l.includes("5 bisseções"))).toBe(true);
  });

  it("refuses what the theorem does not cover", () => {
    for (const json of [
      '{"f": "x^2+1", "a": -1, "b": 2}', // no sign change
      '{"f": "1/x", "a": -1, "b": 1}', // a pole between the ends: not continuous
      '{"f": "x", "a": 2, "b": 1}',
      '{"f": "x", "a": -1, "b": 1, "n": 9}',
      '{"f": "x"}',
    ])
      expect(refused("bolzano", json), json).toBe(true);
  });
});

describe("sequence terms", () => {
  const spec = (json: string) => {
    const found = sequenceSpec(new Params(figure("sequenceTerms", json)));
    if (!found) throw new Error(`no sequence: ${json}`);
    return found;
  };

  it("the terms follow their formulas", () => {
    const arithmetic = spec('{"kind": "arithmetic", "u1": 2, "d": 3}');
    expect(arithmetic.terms(5)).toEqual([2, 5, 8, 11, 14]);
    const geometric = spec('{"kind": "geometric", "u1": 8, "r": 0.5}');
    expect(geometric.terms(5)).toEqual([8, 4, 2, 1, 0.5]);
    const general = spec('{"kind": "general", "u": "(2*n+1)/(n+1)"}');
    expect(Math.abs(general.term(1) - 1.5) < 1e-12 && Math.abs(general.term(3) - 7 / 4) < 1e-12).toBe(true);
    // uₙ₊₁ − uₙ is constant for the arithmetic one, uₙ₊₁/uₙ for the geometric one.
    const a = arithmetic.terms(8);
    const g = geometric.terms(8);
    for (let index = 1; index < 8; index++) {
      expect(Math.abs(a[index]! - a[index - 1]! - 3)).toBeLessThan(1e-12);
      expect(Math.abs(g[index]! / g[index - 1]! - 0.5)).toBeLessThan(1e-12);
    }
  });

  it("the behaviour is classified correctly", () => {
    const behaviour = (json: string): SequenceBehaviour => spec(json).behaviour;
    const diverges = (direction: number): SequenceBehaviour => ({ kind: "diverges", direction });
    const converges = (limit: number): SequenceBehaviour => ({ kind: "converges", limit });
    const oscillates: SequenceBehaviour = { kind: "oscillates" };
    expect(behaviour('{"kind": "arithmetic", "u1": 2, "d": 3}')).toEqual(diverges(1));
    expect(behaviour('{"kind": "arithmetic", "u1": 2, "d": -3}')).toEqual(diverges(-1));
    expect(behaviour('{"kind": "arithmetic", "u1": 2, "d": 0}')).toEqual(converges(2));
    expect(behaviour('{"kind": "geometric", "u1": 8, "r": 0.5}')).toEqual(converges(0));
    expect(behaviour('{"kind": "geometric", "u1": 8, "r": -0.5}')).toEqual(converges(0));
    expect(behaviour('{"kind": "geometric", "u1": 8, "r": 2}')).toEqual(diverges(1));
    expect(behaviour('{"kind": "geometric", "u1": -8, "r": 2}')).toEqual(diverges(-1));
    expect(behaviour('{"kind": "geometric", "u1": 8, "r": -1}')).toEqual(oscillates);
    expect(behaviour('{"kind": "geometric", "u1": 8, "r": -2}')).toEqual(oscillates);
    expect(behaviour('{"kind": "geometric", "u1": 8, "r": 1}')).toEqual(converges(8));
    // Formulas in n: limits found numerically far out.
    for (const [formula, limit] of [
      ["1/n", 0],
      ["(2*n+1)/(n+1)", 2],
      ["n/(3*n+1)", 1 / 3],
      ["1/sqrt(n)", 0],
      ["(-1)^n/n", 0],
      ["(1+1/n)^n", Math.E],
    ] as const) {
      const found = behaviour(`{"kind": "general", "u": "${formula}"}`);
      expect(found.kind, `${formula} should converge`).toBe("converges");
      if (found.kind === "converges")
        expect(Math.abs(found.limit - limit), `${formula} → ${found.limit}`).toBeLessThan(1e-3);
    }
    expect(behaviour('{"kind": "general", "u": "n^2"}')).toEqual(diverges(1));
    expect(behaviour('{"kind": "general", "u": "-n"}')).toEqual(diverges(-1));
    expect(behaviour('{"kind": "general", "u": "ln(n)"}')).toEqual(diverges(1));
    expect(behaviour('{"kind": "general", "u": "(-1)^n"}')).toEqual(oscillates);
    expect(behaviour('{"kind": "general", "u": "(-1)^n*n"}')).toEqual(oscillates);
    expect(behaviour('{"kind": "general", "u": "sin(n)"}')).toEqual(oscillates);
  });

  it("the figure draws each term and the limit", () => {
    const built = scene("sequenceTerms", '{"kind": "geometric", "u1": 8, "r": 0.5, "count": 10}');
    const compiled = new CompiledIllustration(built);
    const end = ending(built);
    const dots = built.elements.filter((e) => e.kind === "point" && e.color === "white");
    expect(dots).toHaveLength(10);
    // The terms appear one after the other: after 3 steps of the clock only three are shown.
    const shownEarly = dots.filter((e: IllustrationElement) => (at(compiled, e.visible, 1.4 + 0.28 * 2.5) ?? -1) > 0);
    expect(shownEarly).toHaveLength(3);
    // Each dot sits above its n, and a term is half the one before: its height above the axis halves.
    const axis = axisY(built);
    const xs = dots.map((e) => at(compiled, e.x, end)!);
    const ys = dots.map((e) => at(compiled, e.y, end)!);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    for (let index = 1; index < ys.length; index++)
      expect(Math.abs((ys[index]! - axis) * 2 - (ys[index - 1]! - axis)), `term ${index + 1}`).toBeLessThan(2e-3);
    const shown = finalLabels(built);
    expect(shown).toContain("L = 0");
    expect(shown.some((l) => l.includes("converge para 0") && l.includes("0,5"))).toBe(true);
    expect(shown.some((l) => l.includes("uₙ = 8·0,5ⁿ⁻¹"))).toBe(true);
    // The dashed line of the limit is at the height of 0, the x axis.
    const limitLine = built.elements.find((e) => e.kind === "line" && e.color === "second")!;
    expect(Math.abs((at(compiled, limitLine.y, end) ?? -9) - axis)).toBeLessThan(1e-3);
    // A divergent one has none.
    const rising = finalLabels(scene("sequenceTerms", '{"kind": "arithmetic", "u1": 2, "d": 3, "count": 8}'));
    expect(rising.some((l) => l.startsWith("L ="))).toBe(false);
    expect(rising.some((l) => l.includes("crescente") && l.includes("+∞"))).toBe(true);
    expect(rising.some((l) => l.includes("uₙ = 2 + (n − 1)·3"))).toBe(true);
    // The slider moves the ratio: with r = 1.5 the sequence now diverges.
    const sliding = figure("sequenceTerms", '{"kind": "geometric", "u1": 8, "r": 0.5, "count": 10}');
    const grown = merged(sliding, { r: 1.5, count: 7.2 })!;
    expect(finalLabels(grown).some((l) => l.includes("diverge"))).toBe(true);
    expect(grown.elements.filter((e) => e.kind === "point" && e.color === "white")).toHaveLength(7);
  });

  it("refuses what it cannot say anything about", () => {
    for (const json of [
      '{"kind": "arithmetic", "u1": 2}',
      '{"kind": "geometric", "u1": 8}',
      '{"kind": "general", "u": "x+1"}',
      '{"kind": "general"}',
      '{"kind": "harmonic"}',
      '{"kind": "arithmetic", "u1": 1, "d": 1, "count": 2}',
      '{"kind": "geometric", "u1": 1e8, "r": 1000, "count": 16}',
    ])
      expect(refused("sequenceTerms", json), json).toBe(true);
  });
});
