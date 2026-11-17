// Port of LearnLayerTests/PremadeFigureBatch3ChemistryTests.swift @ ref 2026-11-04: the numbers, geometry and words of
// the batch 3 chemistry and biology figures. Every gallery sample is also checked for bounds, overlaps and movement in
// animated.test.ts.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration, type IllustrationElement } from "../illustration";
import { PremadeFigures, type PremadeFigure } from "../premadeFigure";
import { sample } from "./animated";
import {
  equilibrium,
  finalPairIndices,
  gametes,
  kinetics,
  Kinetics,
  kineticsFrames,
  lewisMolecule,
  lewisMolecules,
  lonePairAngles,
  PeriodicData,
  periodicTrend,
  profileExpression,
  punnettSquare,
  ReactionProfile,
  Titration,
  type LewisMolecule,
} from "./chemistry";
import { boxesOverlap, Params, PlottedFunction, type LabelBox } from "./figureCanvas";
import { Teach } from "./heating";
import type { Point } from "./optics";
import { curvePoints, finalLabels, isShown, labelBox, labels, values } from "./sceneCheck";

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
const boundaries = (built: Illustration) =>
  (built as { stepPlayback?: { boundaries: number[] } | null }).stepPlayback?.boundaries ?? [];
const ending = (built: Illustration) => 0.95 * (built.duration ?? 0);
const at = (compiled: CompiledIllustration, text: string | null | undefined, time: number) => {
  const found = compiled.value(text ?? "", values(time));
  if (found === null) throw new Error(`no value for ${text}`);
  return found;
};
const shownAt = (built: Illustration, time: number) => {
  const compiled = new CompiledIllustration(built);
  return (e: IllustrationElement) => isShown(e, compiled, values(time));
};
const position = (compiled: CompiledIllustration, e: IllustrationElement, time: number): Point => ({
  x: at(compiled, e.x, time),
  y: at(compiled, e.y, time),
});
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const molecule = (name: string): LewisMolecule => {
  const found = lewisMolecule(name);
  if (!found) throw new Error(`no molecule ${name}`);
  return found;
};

describe("Lewis structures", () => {
  it("every structure counts its electrons and fills its octets", () => {
    for (const m of lewisMolecules) {
      const name = m.formula;
      // Every valence electron is drawn, as a bond or as a lone pair, whether the bonds are single or final.
      expect(m.drawnElectrons, name).toBe(m.valenceElectrons);
      expect(m.skeletonElectrons, `${name} skeleton`).toBe(m.valenceElectrons);
      // Each extra bond order uses up one lone pair.
      const extra = m.bonds.reduce((sum, b) => sum + b.order - 1, 0);
      const used = m.atoms.reduce((sum, a) => sum + a.skeletonPairs - a.finalPairs, 0);
      expect(extra, name).toBe(used);
      m.atoms.forEach((a, index) => {
        const wanted = a.symbol === "H" ? 2 : a.symbol === "B" ? 6 : 8;
        expect(m.electronsAround(index), `${name} ${a.symbol}`).toBe(wanted);
        expect(m.formalCharge(index), `${name} ${a.symbol} is not neutral`).toBe(0);
        // Before the bonds are completed no atom has more than an octet either.
        expect(m.electronsAround(index, false)).toBeLessThanOrEqual(8);
        expect(a.skeletonPairs).toBeGreaterThanOrEqual(a.finalPairs);
      });
      // The bonds join atoms that exist, and no two atoms stand on one another.
      for (const b of m.bonds)
        expect(b.a !== b.b && b.a >= 0 && b.a < m.atoms.length && b.b >= 0 && b.b < m.atoms.length).toBe(true);
      for (let first = 0; first < m.atoms.length; first++)
        for (let second = first + 1; second < m.atoms.length; second++) {
          const a = m.atoms[first]!;
          const b = m.atoms[second]!;
          expect(Math.hypot(a.x - b.x, a.y - b.y), `${name}: atoms ${first} and ${second} overlap`).toBeGreaterThan(
            0.9,
          );
        }
    }
  });

  it("bond orders and shared facts", () => {
    expect(molecule("H2O").valenceElectrons === 8 && molecule("CO2").valenceElectrons === 16).toBe(true);
    expect(molecule("N2").valenceElectrons).toBe(10);
    expect(
      molecule("HCN").valenceElectrons === 10 &&
        molecule("C2H4").valenceElectrons === 12 &&
        molecule("BF3").valenceElectrons === 24,
    ).toBe(true);
    const orders = (name: string) => molecule(name).bonds.map((b) => b.order);
    expect(orders("CO2")).toEqual([2, 2]);
    expect(orders("N2")).toEqual([3]);
    expect(orders("O2")).toEqual([2]);
    expect(orders("HCN")).toEqual([1, 3]);
    expect([...orders("C2H2")].sort()).toEqual([1, 1, 3]);
    expect([...orders("CH2O")].sort()).toEqual([1, 1, 2]);
    // Boron stays at six electrons: the exception to the octet rule.
    const boron = molecule("BF3");
    expect(boron.electronsAround(0) === 6 && boron.atoms[0]!.symbol === "B").toBe(true);
    // Formulas are accepted as written in the exam, subscripts or not, in any case.
    expect(molecule("h2o")).toBe(molecule("H₂O"));
    expect(molecule(" CO 2 ")).toBe(molecule("CO₂"));
    expect(lewisMolecule("XeF4")).toBeNull();
  });

  it("lone pairs spread in the widest gap and the final ones are among the skeleton's positions", () => {
    const water = molecule("H2O");
    const pairs = lonePairAngles(0, 2, water);
    const rad = (degrees: number) => (degrees * Math.PI) / 180;
    // Both pairs of the oxygen sit above it, mirror images about the vertical, clear of the bonds (below).
    expect(pairs.length === 2 && pairs.every((p) => Math.sin(rad(p)) > 0.5)).toBe(true);
    expect(Math.abs(Math.cos(rad(pairs[0]!)) + Math.cos(rad(pairs[1]!)))).toBeLessThan(1e-9);
    const oxygen = molecule("CO2");
    const skeleton = lonePairAngles(0, 3, oxygen);
    expect(skeleton).toHaveLength(3);
    // Of the three skeleton pairs on the left oxygen, the two that stay are above and below it; the one pointing away goes into the bond.
    const kept = finalPairIndices(0, oxygen);
    expect(kept).toHaveLength(2);
    const angles = kept.map((k) => skeleton[k]!);
    expect(
      angles.some((a) => Math.abs(Math.sin(rad(a))) > 0.99) &&
        Math.abs(Math.sin(rad(angles[0]!)) + Math.sin(rad(angles[1]!))) < 1e-9,
    ).toBe(true);
    // A molecule whose bonds stay single keeps every pair.
    expect(finalPairIndices(1, molecule("HF"))).toEqual([0, 1, 2]);
    // The pairs never point at a neighbour.
    for (const m of lewisMolecules)
      m.atoms.forEach((a, index) => {
        if (a.skeletonPairs <= 0) return;
        const around = lonePairAngles(index, a.skeletonPairs, m);
        for (const b of m.bonds) {
          if (b.a !== index && b.b !== index) continue;
          const other = m.atoms[b.a === index ? b.b : b.a]!;
          const towards = (Math.atan2(other.y - a.y, other.x - a.x) * 180) / Math.PI;
          for (const angle of around) {
            const gap = Math.abs((angle - towards) % 360);
            expect(Math.min(gap, 360 - gap), `${m.formula}: a pair points at a bond`).toBeGreaterThan(40);
          }
        }
      });
  });

  it("the figure builds up electron by electron", () => {
    const built = scene("lewisStructure", '{"molecule": "CO2"}');
    const step = (k: number) => Teach.start(k) + 0.7;
    // The words follow the steps: valence electrons, then single bonds, then lone pairs, then multiple bonds.
    expect(labels(built, step(0))).toContain("Eletrões de valência: 2×6 + 4 = 16 e⁻");
    expect(labels(built, step(1))).toContain("Esqueleto: 2 ligações simples (4 e⁻), restam 12 e⁻");
    expect(labels(built, step(2))).toContain("6 pares isolados (12 e⁻): restam 0 e⁻");
    const final = finalLabels(built);
    expect(final.some((l) => l.includes("ligações múltiplas")) && final.includes("CO₂: dióxido de carbono")).toBe(true);
    // Dots are lone pairs: 12 at step 3, 8 at the end (each O keeps two pairs, one goes into each double bond).
    const count = (b: Illustration, kind: string, time: number) =>
      b.elements.filter((e) => e.kind === kind && shownAt(b, time)(e)).length;
    expect(count(built, "point", step(1))).toBe(0);
    expect(count(built, "point", step(2))).toBe(12);
    expect(count(built, "point", ending(built))).toBe(8);
    // Lines: two single bonds at step 2; at the end each bond is two lines (the double bond), and the single ones are gone.
    expect(count(built, "line", step(1)) === 2 && count(built, "line", step(2)) === 2).toBe(true);
    expect(count(built, "line", ending(built))).toBe(4);
    // N₂ ends with a triple bond (three lines) and one pair on each atom.
    const nitrogen = scene("lewisStructure", '{"molecule": "N2"}');
    expect(count(nitrogen, "line", ending(nitrogen))).toBe(3);
    expect(count(nitrogen, "point", ending(nitrogen))).toBe(4);
    // Water: no multiple bonds, so the last step is the octet check.
    expect(finalLabels(scene("lewisStructure", '{"molecule": "H2O"}')).some((l) => l.includes("octeto"))).toBe(true);
    const boron = finalLabels(scene("lewisStructure", '{"molecule": "BF3"}'));
    expect(boron.some((l) => l.includes("6 e⁻") && l.includes("exceção"))).toBe(true);
  });

  it("rejects unknown molecules", () => {
    for (const json of ['{"molecule": "XeF4"}', "{}", '{"molecule": ""}'])
      expect(refused("lewisStructure", json), json).toBe(true);
    // The same figure in English.
    expect(finalLabels(compile(figure("lewisStructure", '{"molecule": "H2O"}'), "English")!)).toContain("H₂O: water");
  });

  it("the circles stand apart and the lone pairs keep clear", () => {
    for (const m of lewisMolecules) {
      const built = scene("lewisStructure", `{"molecule": "${m.formula}"}`);
      const compiled = new CompiledIllustration(built);
      const end = ending(built);
      const shown = shownAt(built, end);
      const circles = built.elements
        .filter((e) => e.kind === "circle" && shown(e))
        .map((e) => ({ ...position(compiled, e, end), r: at(compiled, e.r, end) }));
      expect(circles, `${m.formula}: one circle per atom`).toHaveLength(m.atoms.length);
      circles.forEach((a, first) => {
        for (const b of circles.slice(first + 1)) {
          const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
          expect(gap, `${m.formula}: circles overlap`).toBeGreaterThanOrEqual(-1e-6);
        }
        // Clear of the captions above and below.
        expect(a.y + a.r <= 5.2 && a.y - a.r >= 0.8, `${m.formula}: circle ${first} reaches a caption`).toBe(true);
      });
      // Every lone-pair dot lies well between its atom's symbol and its circle's outline.
      const dots = built.elements.filter((e) => e.kind === "point" && shown(e)).map((e) => position(compiled, e, end));
      for (const dot of dots) {
        const own = circles.reduce((best, c) => (distance(c, dot) < distance(best, dot) ? c : best));
        const gap = distance(own, dot);
        expect(gap, `${m.formula}: a lone pair touches its symbol`).toBeGreaterThanOrEqual(0.35);
        expect(own.r - gap, `${m.formula}: a lone pair touches the circle`).toBeGreaterThanOrEqual(0.15);
      }
    }
  });
});

describe("reaction profile", () => {
  it("the curve has the given peak and ends", () => {
    for (const [deltaH, activation] of [
      [-60, 100],
      [40, 120],
      [0, 80],
      [-100, 90],
      [50, 70],
    ] as const) {
      const profile = new ReactionProfile(deltaH, activation);
      const samples = Array.from({ length: 1001 }, (_, i) => profile.energy(i / 1000));
      expect(Math.abs(Math.max(...samples) - activation), `peak of ${deltaH}, ${activation}`).toBeLessThan(1e-2);
      expect(Math.abs(samples[0]!), "starts at the reactants' level").toBeLessThan(1e-2);
      expect(Math.abs(samples[1000]! - deltaH), "ends at the products' level").toBeLessThan(1e-2);
      // One hill: it goes up to the peak and comes down, never dipping below both levels.
      const peakIndex = samples.indexOf(Math.max(...samples));
      for (let i = 0; i < peakIndex; i++)
        expect(samples[i]! <= samples[i + 1]! + 1e-9 || samples[i]! < 1e-6 + Math.max(0, Math.min(deltaH, 0))).toBe(
          true,
        );
      expect(Math.min(...samples)).toBeGreaterThanOrEqual(Math.min(0, deltaH) - 1e-2);
      expect(Math.abs(profile.reverseActivation - (activation - deltaH))).toBeLessThan(1e-12);
    }
    expect(new ReactionProfile(-60, 100).exothermic && !new ReactionProfile(40, 100).exothermic).toBe(true);
    // The expression the renderer draws agrees with the function.
    const profile = new ReactionProfile(-60, 100);
    const drawn = PlottedFunction.make(profileExpression(-60, profile.bumpHeight))!;
    for (let x = 0; x <= 1.0001; x += 0.05) expect(Math.abs(drawn.value(x) - profile.energy(x))).toBeLessThan(1e-3);
  });

  it("draws the levels, the barriers and the catalyst's effect", () => {
    const built = scene("reactionProfile", '{"Ea": 100, "deltaH": -60, "catalystEa": 60}');
    const time = ending(built);
    const curves = built.elements.filter((e) => e.kind === "curve");
    expect(curves).toHaveLength(2);
    const plainPoints = curvePoints(
      curves.find((e) => e.color === "white")!,
      built,
      time,
      400,
    );
    const loweredPoints = curvePoints(
      curves.find((e) => e.color === "accent")!,
      built,
      time,
      400,
    );
    const start = plainPoints[0]!;
    const finish = plainPoints.at(-1)!;
    // World heights above the reactants' level, in proportion to energies: peak 100, products −60, catalysed peak 60.
    const scale = (Math.max(...plainPoints.map((p) => p.y)) - start.y) / 100;
    expect(scale).toBeGreaterThan(0.01);
    expect(Math.abs((finish.y - start.y) / scale + 60), "the products lie 60 below the reactants").toBeLessThan(0.5);
    expect(
      Math.abs((Math.max(...loweredPoints.map((p) => p.y)) - start.y) / scale - 60),
      "the catalysed peak is 60 above",
    ).toBeLessThan(0.5);
    // A catalyst does not change where the reaction starts or ends (ΔH is the same).
    expect(Math.abs(loweredPoints[0]!.y - start.y) < 1e-2 && Math.abs(loweredPoints.at(-1)!.y - finish.y) < 1e-2).toBe(
      true,
    );
    // The arrows: Ea runs from the reactants' level to the peak, ΔH down to the products, the catalysed Ea to its lower peak.
    const compiled = new CompiledIllustration(built);
    const rises = built.elements
      .filter((e) => e.kind === "arrow" && e.color !== "muted")
      .map((e) => (at(compiled, e.y2, time) - at(compiled, e.y, time)) / scale);
    expect(rises).toHaveLength(3);
    expect(Math.abs(rises[0]! - 100) < 0.5 && Math.abs(rises[1]! + 60) < 0.5 && Math.abs(rises[2]! - 60) < 0.5).toBe(
      true,
    );
    const shown = finalLabels(built);
    for (const text of ["Ea = 100 kJ/mol", "ΔH = −60 kJ/mol", "Ea = 60", "reagentes", "produtos"])
      expect(shown, text).toContain(text);
    expect(shown.some((l) => l.includes("Com catalisador") && l.includes("ΔH não muda"))).toBe(true);
    // The explanations come with their steps.
    expect(labels(built, Teach.start(2) + 0.9)).toContain(
      "Ea (direta) = 100 kJ/mol  ·  Ea (inversa) = Ea − ΔH = 160 kJ/mol",
    );
    expect(labels(built, Teach.start(3) + 0.9).some((l) => l.includes("exotérmica"))).toBe(true);
    expect(
      finalLabels(scene("reactionProfile", '{"Ea": 120, "deltaH": 40}')).some((l) =>
        l.includes("ΔH = 40 kJ/mol > 0: endotérmica"),
      ),
    ).toBe(true);
  });

  it("the catalyst's arrow does not cross the uncatalysed curve", () => {
    for (const json of [
      '{"Ea": 100, "deltaH": -60, "catalystEa": 60}',
      '{"Ea": 120, "deltaH": 40, "catalystEa": 70}',
      '{"Ea": 100, "deltaH": 0, "catalystEa": 50}',
      '{"Ea": 90, "deltaH": -100, "catalystEa": 30}',
    ]) {
      const built = scene("reactionProfile", json);
      const time = ending(built);
      const compiled = new CompiledIllustration(built);
      const plain = built.elements.find((e) => e.kind === "curve" && e.color === "white")!;
      const points = curvePoints(plain, built, time, 400);
      // The catalyst's Ea arrow is the last coloured arrow drawn.
      const arrow = built.elements.filter((e) => e.kind === "arrow" && e.color === "accent").at(-1)!;
      const x = at(compiled, arrow.x, time);
      const y = at(compiled, arrow.y, time);
      const y2 = at(compiled, arrow.y2, time);
      for (const point of points) {
        const crosses = Math.abs(point.x - x) < 0.1 && point.y > Math.min(y, y2) && point.y < Math.max(y, y2);
        expect(crosses, `${json}: the arrow at x = ${x} crosses the solid curve`).toBe(false);
      }
    }
  });

  it("the sliders stay valid at every corner", () => {
    const base = figure("reactionProfile", '{"Ea": 100, "deltaH": -60}');
    const built = compile(base)!;
    const ea = built.parameters!.find((p) => p.name === "Ea")!;
    const dh = built.parameters!.find((p) => p.name === "deltaH")!;
    expect(ea.min - dh.max, "the lowest peak still stands above the highest products").toBeGreaterThanOrEqual(20);
    for (const activation of [ea.min, ea.max])
      for (const enthalpy of [dh.min, dh.max])
        expect(
          compile(new PremadeFigures(base).mergingParameters({ Ea: activation, deltaH: enthalpy }), "English"),
          `${activation}, ${enthalpy}`,
        ).not.toBeNull();
    // With a catalyst the one slider keeps its peak between the reactants' and the plain peak.
    const catalysed = compile(figure("reactionProfile", '{"Ea": 100, "deltaH": -60, "catalystEa": 60}'), "English")!;
    const slider = catalysed.parameters![0]!;
    expect(
      catalysed.parameters!.length === 1 && slider.name === "catalystEa" && slider.min >= 10 && slider.max <= 90,
    ).toBe(true);
    // Ea below ΔH + 20 offers no sliders (their corners would be impossible), but still draws.
    const tight = compile(figure("reactionProfile", '{"Ea": 40, "deltaH": -20}'), "English")!;
    expect(tight.parameters ?? []).toHaveLength(0);
    for (const json of [
      '{"Ea": 100}',
      '{"deltaH": -60}',
      '{"Ea": 30, "deltaH": 40}',
      '{"Ea": -5, "deltaH": -1}',
      '{"Ea": 50, "deltaH": 45}',
      '{"Ea": 100, "deltaH": -60, "catalystEa": 120}',
      '{"Ea": 100, "deltaH": 40, "catalystEa": 30}',
    ])
      expect(refused("reactionProfile", json), json).toBe(true);
  });
});

describe("titration curve", () => {
  it("the pH matches the classical values", () => {
    const strong = new Titration(null, 0.1, 25, 0.1);
    expect(Math.abs(strong.equivalenceVolume - 25)).toBeLessThan(1e-12);
    expect(Math.abs(strong.pH(0) - 1), "0.1 mol/L strong acid: pH 1").toBeLessThan(1e-6);
    expect(Math.abs(strong.pH(10) - 1.368), "excess H⁺ = (2.5 − 1.0)/35").toBeLessThan(2e-3);
    expect(Math.abs(strong.pH(25) - 7), "equivalence of a strong acid: pH 7").toBeLessThan(1e-6);
    expect(Math.abs(strong.pH(30) - 11.96), "excess OH⁻ = 0.5/55 mmol/mL").toBeLessThan(1e-2);
    const weak = new Titration(4.76, 0.1, 25, 0.1);
    expect(Math.abs(weak.pH(0) - 2.883), "x²/(0.1 − x) = Ka").toBeLessThan(5e-3);
    expect(Math.abs(weak.pH(12.5) - 4.76), "half-equivalence: pH = pKa").toBeLessThan(1e-2);
    expect(Math.abs(weak.pH(25) - 8.73), "acetate").toBeLessThan(1e-2);
    expect(Math.abs(weak.pH(30) - strong.pH(30)), "past equivalence both follow the excess base").toBeLessThan(2e-2);
    // pH only rises with the base added, and climbs fastest at equivalence.
    for (const t of [strong, weak]) {
      const volumes = Array.from({ length: 201 }, (_, i) => i * 0.25);
      const pHs = volumes.map((v) => t.pH(v));
      for (let i = 1; i < pHs.length; i++) expect(pHs[i]!).toBeGreaterThanOrEqual(pHs[i - 1]! - 1e-9);
      const slopes = pHs.slice(1).map((v, i) => v - pHs[i]!);
      const steepest = volumes[slopes.indexOf(Math.max(...slopes)) + 1]!;
      expect(Math.abs(steepest - 25), "the jump is at the equivalence volume").toBeLessThan(0.5);
    }
    // A more dilute acid needs less base: 0.05 mol/L gives 12.5 mL.
    expect(new Titration(null, 0.05, 25, 0.1).equivalenceVolume).toBe(12.5);
    // A weaker acid starts at a higher pH.
    expect(new Titration(6, 0.1, 25, 0.1).pH(0)).toBeGreaterThan(weak.pH(0));
  });

  it("the figure marks the equivalence and half-equivalence points on the curve", () => {
    const built = scene("titrationCurve", '{"acid": "weak", "Ca": 0.1, "Va": 25, "Cb": 0.1, "pKa": 4.76}');
    const compiled = new CompiledIllustration(built);
    const time = ending(built);
    const shown = shownAt(built, time);
    // The curve is a chain of short white lines, rising to the right.
    const segments = built.elements
      .filter((e) => e.kind === "line" && e.color === "white" && e.dashed !== true && shown(e))
      .map((e) => [position(compiled, e, time), { x: at(compiled, e.x2, time), y: at(compiled, e.y2, time) }] as const);
    expect(segments.length).toBeGreaterThan(50);
    for (const [a, b] of segments) expect(b.x >= a.x - 1e-9 && b.y >= a.y - 1e-9, "the pH never falls").toBe(true);
    const onTheCurve = (spot: Point) =>
      segments.some(([a, b]) => {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length2 = dx * dx + dy * dy;
        const t = length2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((spot.x - a.x) * dx + (spot.y - a.y) * dy) / length2));
        return Math.hypot(spot.x - (a.x + t * dx), spot.y - (a.y + t * dy)) < 0.05;
      });
    const dots = built.elements.filter((e) => e.kind === "point").map((e) => position(compiled, e, time));
    expect(dots, "start, equivalence, half-equivalence").toHaveLength(3);
    for (const dot of dots) expect(onTheCurve(dot), `(${dot.x}, ${dot.y}) is not on the curve`).toBe(true);
    // The half-equivalence point is at half the equivalence volume, and its pH is the pKa (4.76 on the pH axis).
    const equivalence = built.elements.find((e) => e.kind === "point" && e.color === "accent")!;
    const half = built.elements.find((e) => e.kind === "point" && e.color === "second")!;
    const start = built.elements.find((e) => e.kind === "point" && e.color === "white")!;
    const x0 = at(compiled, start.x, time);
    const xe = at(compiled, equivalence.x, time);
    const xh = at(compiled, half.x, time);
    expect(Math.abs((xh - x0) * 2 - (xe - x0)), "half of the equivalence volume").toBeLessThan(1e-3);
    const pHAxis = built.elements
      .filter((e) => e.kind === "label" && e.color === "muted" && e.anchor === "trailing")
      .flatMap((e) => {
        const value = Number((e.text ?? "").replace(",", "."));
        const y = compiled.value(e.y ?? "", values(time));
        return e.text && Number.isFinite(value) && y !== null ? [[value, y] as const] : [];
      });
    const five = pHAxis.find(([v]) => v === 5)!;
    const ten = pHAxis.find(([v]) => v === 10)!;
    const pHAt = (y: number) => 5 + ((y - five[1]) / (ten[1] - five[1])) * 5;
    expect(Math.abs(pHAt(at(compiled, half.y, time)) - 4.76)).toBeLessThan(0.02);
    expect(Math.abs(pHAt(at(compiled, equivalence.y, time)) - 8.73)).toBeLessThan(0.02);
    const final = finalLabels(built);
    expect(
      final.includes("pH = 8,73") && final.includes("pH = pKa") && final.some((l) => l.startsWith("pH₀ = 2,88")),
    ).toBe(true);
    expect(final).toContain("Meia-equivalência: [HA] = [A⁻], logo pH = pKa = 4,76");
    expect(
      labels(built, Teach.start(2) + 0.2).some((l) => l.includes("Ve = Ca·Va/Cb = 25 mL") && l.includes("pH = 8,73")),
    ).toBe(true);
    // A strong acid has no half-equivalence step and ends at pH 7.
    const strong = scene("titrationCurve", '{"acid": "strong", "Ca": 0.1, "Va": 25}');
    expect(boundaries(strong).length === 4 && boundaries(built).length === 5).toBe(true);
    expect(finalLabels(strong).some((l) => l.includes("pH = 7") && l.includes("sal neutro"))).toBe(true);
  });

  it("sliders and refusals", () => {
    const base = figure("titrationCurve", '{"acid": "weak", "Ca": 0.1, "Va": 25, "Cb": 0.1, "pKa": 4.76}');
    const moved = merged(base, { Ca: 0.2, pKa: 6 })!;
    expect(labels(moved, Teach.start(2) + 0.2).some((l) => l.includes("Ve = Ca·Va/Cb = 50 mL"))).toBe(true);
    expect(finalLabels(moved)).toContain("Meia-equivalência: [HA] = [A⁻], logo pH = pKa = 6");
    expect(moved.parameters?.map((p) => p.name)).toEqual(["Ca", "pKa"]);
    for (const json of [
      '{"acid": "medium"}',
      '{"acid": "weak", "pKa": 1}',
      '{"acid": "weak", "pKa": 14}',
      '{"acid": "strong", "Ca": -1}',
      '{"acid": "strong", "Va": 0}',
    ])
      expect(refused("titrationCurve", json), json).toBe(true);
  });
});

describe("ICE table", () => {
  const system = (json: string) => {
    const found = equilibrium(new Params(figure("iceTable", json)));
    if (!found) throw new Error(`no equilibrium: ${json}`);
    return found;
  };

  it("the extent solves the equilibrium constant", () => {
    // H₂ + I₂ ⇌ 2HI, K = 50, starting from 1 mol/L of each: 2x/(1 − x) = √50, x = 0.7796.
    const hi = system(
      '{"reactants": [{"name": "H", "coeff": 1, "c0": 1}, {"name": "I", "coeff": 1, "c0": 1}], "products": [{"name": "HI", "coeff": 2}], "K": 50}',
    );
    const x = hi.extent!;
    expect(Math.abs(x - Math.sqrt(50) / (2 + Math.sqrt(50)))).toBeLessThan(1e-9);
    expect(Math.abs(hi.concentration(hi.products[0]!, false, x) - 1.5592)).toBeLessThan(1e-3);
    expect(Math.abs(hi.concentration(hi.reactants[0]!, true, x) - 0.2204)).toBeLessThan(1e-3);
    expect(Math.abs(hi.quotient(x) - 50)).toBeLessThan(1e-6);
    // A weak acid: x²/(0.1 − x) = Ka, the quadratic's root.
    const acid = system(
      '{"reactants": [{"name": "HA", "c0": 0.1}], "products": [{"name": "H", "coeff": 1}, {"name": "A", "coeff": 1}], "K": 0.000018}',
    );
    const ka = 1.8e-5;
    expect(Math.abs(acid.extent! - (-ka + Math.sqrt(ka * ka + 4 * ka * 0.1)) / 2)).toBeLessThan(1e-9);
    // Ammonia: Q rises with x, so the answer is unique and every concentration is positive.
    const ammonia = system(
      '{"reactants": [{"name": "N", "coeff": 1, "c0": 1}, {"name": "H", "coeff": 3, "c0": 3}], "products": [{"name": "NH", "coeff": 2}], "K": 0.5}',
    );
    const extent = ammonia.extent!;
    expect(Math.abs(ammonia.quotient(extent) - 0.5) < 1e-6 && extent > 0 && extent < 1).toBe(true);
    // Starting from the products alone, the reaction runs backwards: x < 0. A ⇌ B, K = 4, B = 1 → A = 0.2, B = 0.8.
    const backwards = system(
      '{"reactants": [{"name": "A", "coeff": 1, "c0": 0}], "products": [{"name": "B", "coeff": 1, "c0": 1}], "K": 4}',
    );
    const back = backwards.extent!;
    expect(Math.abs(back + 0.2)).toBeLessThan(1e-9);
    expect(Math.abs(backwards.concentration(backwards.reactants[0]!, true, back) - 0.2)).toBeLessThan(1e-9);
    expect(Math.abs(backwards.concentration(backwards.products[0]!, false, back) - 0.8)).toBeLessThan(1e-9);
    // A larger K pushes the equilibrium towards the products.
    const weak = system('{"reactants": [{"name": "A", "c0": 1}], "products": [{"name": "B"}], "K": 0.1}');
    const strong = system('{"reactants": [{"name": "A", "c0": 1}], "products": [{"name": "B"}], "K": 10}');
    expect(weak.extent! < 0.2 && strong.extent! > 0.8).toBe(true);
    // Nothing to react: no solution.
    expect(system('{"reactants": [{"name": "A"}], "products": [{"name": "B"}], "K": 1}').extent).toBeNull();
  });

  it("the table is built row by row and the values match the solution", () => {
    const json =
      '{"reactants": [{"name": "N₂", "coeff": 1, "c0": 1}, {"name": "H₂", "coeff": 3, "c0": 3}], "products": [{"name": "NH₃", "coeff": 2, "c0": 0}], "K": 0.5}';
    const built = scene("iceTable", json);
    const compiled = new CompiledIllustration(built);
    const step = (k: number) => labels(built, Teach.start(k) + 0.2);
    expect(
      step(0).includes("N₂ + 3H₂ ⇌ 2NH₃") && step(0).includes("1") && step(0).includes("3") && step(0).includes("0"),
    ).toBe(true);
    expect(step(1).includes("−x") && step(1).includes("−3x") && step(1).includes("+2x")).toBe(true);
    expect(step(2).includes("1 − x") && step(2).includes("3 − 3x") && step(2).includes("2x")).toBe(true);
    expect(step(3)).toContain("Kc = [NH₃]²/([N₂][H₂]³) = 0,5");
    const final = finalLabels(built);
    // x = 0.486: N₂ 0.514, H₂ 1.54, NH₃ 0.972, and the check Kc comes back as 0.5.
    for (const text of ["0,514", "1,54", "0,972"]) expect(final, text).toContain(text);
    expect(final).toContain("x = 0,486 mol/L  ·  Kc = 0,5");
    // Layout: each species is a column (every cell of one species shares its x), each stage a row.
    const time = ending(built);
    const wanted = ["1", "3", "0", "−x", "−3x", "+2x", "1 − x", "3 − 3x", "2x", "0,514", "1,54", "0,972"];
    const cells = built.elements.filter(
      (e) => e.kind === "label" && e.anchor === "center" && wanted.includes(e.text ?? ""),
    );
    expect(cells).toHaveLength(12);
    const place = (text: string) =>
      position(
        compiled,
        cells.find((e) => e.text === text)!,
        time,
      );
    for (const column of [
      ["1", "−x", "1 − x", "0,514"],
      ["3", "−3x", "3 − 3x", "1,54"],
      ["0", "+2x", "2x", "0,972"],
    ]) {
      const xs = column.map((text) => place(text).x);
      expect(
        xs.every((x) => Math.abs(x - xs[0]!) < 1e-9),
        `${column} are not in one column`,
      ).toBe(true);
      const ys = column.map((text) => place(text).y);
      expect(ys, "each stage is under the one before").toEqual([...ys].sort((a, b) => b - a));
    }
    // The values are what the equilibrium gives: ratio of the extents is 1 : 3 : 2 in the changes.
    const extent = system(
      '{"reactants": [{"name": "N₂", "coeff": 1, "c0": 1}, {"name": "H₂", "coeff": 3, "c0": 3}], "products": [{"name": "NH₃", "coeff": 2}], "K": 0.5}',
    ).extent!;
    expect(
      Math.abs(1 - 0.514 - extent) < 1e-3 &&
        Math.abs(3 - 1.54 - 3 * extent) < 5e-3 &&
        Math.abs(0.972 - 2 * extent) < 1e-3,
    ).toBe(true);
  });

  it("says when the reaction runs backwards and takes a slider", () => {
    const back = finalLabels(
      scene(
        "iceTable",
        '{"reactants": [{"name": "A", "coeff": 1, "c0": 0}], "products": [{"name": "B", "coeff": 1, "c0": 1}], "K": 4}',
      ),
    );
    expect(back.some((l) => l.includes("x = −0,2 mol/L") && l.includes("sentido inverso"))).toBe(true);
    expect(back.includes("0,2") && back.includes("0,8")).toBe(true);
    const base = figure(
      "iceTable",
      '{"reactants": [{"name": "HA", "c0": 0.1}], "products": [{"name": "H", "coeff": 1}, {"name": "A", "coeff": 1}], "K": 0.0001}',
    );
    const moved = merged(base, { K: 0.0004 })!;
    // x²/(0.1 − x) = 4·10⁻⁴: x = (−4·10⁻⁴ + √(1.6·10⁻⁷ + 1.6·10⁻⁴))/2 = 0.006128.
    expect(finalLabels(moved).some((l) => l.startsWith("x = 0,00613"))).toBe(true);
    const slider = moved.parameters![0]!;
    expect(
      slider.name === "K" &&
        Math.abs(slider.value - 0.0004) < 1e-12 &&
        slider.min < slider.value &&
        slider.value < slider.max,
    ).toBe(true);
    const a = '"reactants": [{"name": "A", "c0": 1}]';
    for (const json of [
      '{"products": [{"name": "B"}], "K": 1}',
      `{${a}, "products": [{"name": "B"}]}`,
      `{${a}, "products": [{"name": "B"}], "K": -2}`,
      `{${a}, "products": [{"name": "A"}], "K": 1}`,
      `{${a}, "products": [{"name": "B", "coeff": 0.5}], "K": 1}`,
      `{${a}, "products": [{"name": "B", "c0": -1}], "K": 1}`,
      '{"reactants": [], "products": [{"name": "B"}], "K": 1}',
      `{${a}, "products": [{"name": "VeryLongName"}], "K": 1}`,
    ])
      expect(refused("iceTable", json), json).toBe(true);
  });
});

describe("periodic trends", () => {
  it("the values are the measured ones", () => {
    expect(PeriodicData.ionization["Li"] === 520.2 && PeriodicData.ionization["Ne"] === 2080.7).toBe(true);
    expect(PeriodicData.electronegativity["F"] === 3.98 && PeriodicData.electronegativity["Cs"] === 0.79).toBe(true);
    expect(PeriodicData.radius["Cs"] === 298 && PeriodicData.radius["F"] === 42).toBe(true);
    // Every element of every series has a radius and an ionization energy; the noble gases have no electronegativity.
    for (const [name, symbols] of Object.entries(PeriodicData.series))
      for (const symbol of symbols)
        expect(
          PeriodicData.radius[symbol] !== undefined && PeriodicData.ionization[symbol] !== undefined,
          `${name} ${symbol}`,
        ).toBe(true);
    expect(PeriodicData.electronegativity["Ne"]).toBeUndefined();
    expect(PeriodicData.electronegativity["Ar"]).toBeUndefined();
    // Fluorine is the most electronegative, caesium the largest atom, Ne the hardest to ionize in period 2.
    const largest = (table: Record<string, number>, keys = Object.keys(table)) =>
      keys.reduce((best, key) => (table[key]! > table[best]! ? key : best));
    expect(largest(PeriodicData.electronegativity)).toBe("F");
    expect(largest(PeriodicData.radius)).toBe("Cs");
    expect(largest(PeriodicData.ionization, PeriodicData.series["period2"])).toBe("Ne");
  });

  it("the trends have the textbook directions and exceptions", () => {
    const trend = (series: string, property: string) => periodicTrend(series, property)!;
    // Across a period: radius falls, ionization energy and electronegativity rise.
    for (const series of ["period2", "period3"]) {
      expect(
        !trend(series, "radius").rises && trend(series, "ionization").rises && trend(series, "electronegativity").rises,
      ).toBe(true);
      expect(trend(series, "radius").exceptions).toEqual([]);
      expect(trend(series, "electronegativity").exceptions).toEqual([]);
    }
    // Down a group: radius grows (alkali metals and halogens), ionization energy and electronegativity fall.
    for (const series of ["group1", "group17"]) {
      expect(
        trend(series, "radius").rises &&
          !trend(series, "ionization").rises &&
          !trend(series, "electronegativity").rises,
      ).toBe(true);
      for (const property of ["radius", "ionization", "electronegativity"])
        expect(trend(series, property).exceptions, `${series} ${property}`).toEqual([]);
    }
    // The two famous dips of the first ionization energy: B and O in period 2, Al and S in period 3.
    const period2 = trend("period2", "ionization");
    const period3 = trend("period3", "ionization");
    expect(period2.exceptions.map((i) => period2.symbols[i])).toEqual(["B", "O"]);
    expect(period3.exceptions.map((i) => period3.symbols[i])).toEqual(["Al", "S"]);
    expect(period2.values[2]! < period2.values[1]! && period2.values[5]! < period2.values[4]!).toBe(true);
    // Noble gases are left out of the electronegativity charts.
    expect(trend("period2", "electronegativity").symbols).toEqual(["Li", "Be", "B", "C", "N", "O", "F"]);
    expect(trend("period3", "electronegativity").symbols.at(-1)).toBe("Cl");
    expect(periodicTrend("period9", "radius")).toBeNull();
    expect(periodicTrend("period2", "mass")).toBeNull();
  });

  it("the chart draws heights in proportion and circles the dips", () => {
    const built = scene("periodicTrends", '{"series": "period2", "property": "ionization"}');
    const compiled = new CompiledIllustration(built);
    const time = ending(built);
    const axis = Number(built.elements.find((e) => e.kind === "arrow")!.y);
    const dots = built.elements.filter((e) => e.kind === "point").map((e) => position(compiled, e, time));
    const wanted = periodicTrend("period2", "ionization")!.values;
    expect(dots.length === 8 && wanted.length === 8).toBe(true);
    // Heights above the axis are proportional to the energies, and the elements are evenly spaced left to right.
    const scale = (dots[0]!.y - axis) / wanted[0]!;
    dots.forEach((dot, index) => expect(Math.abs((dot.y - axis) / wanted[index]! - scale)).toBeLessThan(1e-3));
    for (let index = 1; index < dots.length; index++)
      expect(Math.abs(dots[index]!.x - dots[index - 1]!.x - (dots[1]!.x - dots[0]!.x))).toBeLessThan(1e-6);
    // Circles are on B and O, nowhere else.
    const rings = built.elements.filter((e) => e.kind === "circle").map((e) => position(compiled, e, time));
    expect(rings).toHaveLength(2);
    for (const ring of rings) expect(dots.some((d) => distance(d, ring) < 1e-6)).toBe(true);
    expect(rings.some((r) => distance(r, dots[2]!) < 1e-6) && rings.some((r) => distance(r, dots[5]!) < 1e-6)).toBe(
      true,
    );
    const final = finalLabels(built);
    for (const text of [
      "Li",
      "Be",
      "B",
      "C",
      "N",
      "O",
      "F",
      "Ne",
      "520,2",
      "899,5",
      "800,6",
      "1086",
      "1402",
      "1314",
      "2081",
    ])
      expect(final, text).toContain(text);
    expect(final).toContain("1.ª energia de ionização ao longo do período");
    expect(final).toContain("1.ª energia de ionização (kJ/mol)");
    expect(final.some((l) => l.startsWith("Quedas (círculos)"))).toBe(true);
    // The order of the steps: the points come one at a time.
    const early = labels(built, Teach.start(1) + 0.45 * 2 + 0.1);
    expect(
      early.includes("520,2") && early.includes("899,5") && early.includes("800,6") && !early.includes("1086"),
    ).toBe(true);
    // A chart without dips has one step fewer, and says why the value goes the way it does.
    const radius = scene("periodicTrends", '{"series": "group1", "property": "radius"}');
    expect(boundaries(radius).length === 4 && boundaries(built).length === 5).toBe(true);
    expect(finalLabels(radius).some((l) => l.includes("aumenta") && l.includes("níveis de energia"))).toBe(true);
    expect(finalLabels(radius).includes("Cs") && finalLabels(radius).includes("298")).toBe(true);
    const english = compile(figure("periodicTrends", '{"series": "period3", "property": "radius"}'), "English")!;
    expect(finalLabels(english).some((l) => l.includes("decreases") && l.includes("effective nuclear charge"))).toBe(
      true,
    );
  });

  it("refuses what it has no data for", () => {
    for (const json of [
      '{"series": "period4", "property": "radius"}',
      '{"series": "period2", "property": "density"}',
      '{"series": "halogens"}',
    ])
      expect(refused("periodicTrends", json), json).toBe(true);
    // Defaults: period 2 and the first ionization energy.
    expect(refused("periodicTrends", "{}")).toBe(false);
  });
});

describe("concentration against time", () => {
  it("the integrated rate laws give the right half-lives", () => {
    const zero = new Kinetics(0, 0.05, 1);
    const first = new Kinetics(1, 0.1, 1);
    const second = new Kinetics(2, 0.1, 1);
    // [A] has halved at the first half-life, whatever the order: t½ = [A]₀/2k, ln 2/k, 1/(k[A]₀).
    expect(Math.abs(zero.timeWhenHalved(1) - 10) < 1e-12 && Math.abs(zero.concentration(10) - 0.5) < 1e-12).toBe(true);
    expect(
      Math.abs(first.timeWhenHalved(1) - Math.log(2) / 0.1) < 1e-12 &&
        Math.abs(first.concentration(Math.log(2) / 0.1) - 0.5) < 1e-12,
    ).toBe(true);
    expect(Math.abs(second.timeWhenHalved(1) - 10) < 1e-12 && Math.abs(second.concentration(10) - 0.5) < 1e-12).toBe(
      true,
    );
    // Successive half-lives: first order constant; second order doubles each time; zero order halves each time.
    for (let n = 1; n <= 3; n++) {
      expect(Math.abs(first.halfLife(n) - Math.log(2) / 0.1), "first order: t½ is constant").toBeLessThan(1e-9);
      for (const k of [first, second, zero])
        expect(Math.abs(k.concentration(k.timeWhenHalved(n)) - 1 / Math.pow(2, n))).toBeLessThan(1e-9);
    }
    expect(
      Math.abs(second.halfLife(2) - 2 * second.halfLife(1)) < 1e-9 &&
        Math.abs(second.halfLife(3) - 2 * second.halfLife(2)) < 1e-9,
    ).toBe(true);
    expect(
      Math.abs(zero.halfLife(2) - zero.halfLife(1) / 2) < 1e-9 &&
        Math.abs(zero.halfLife(3) - zero.halfLife(2) / 2) < 1e-9,
    ).toBe(true);
    // The straight-line forms have slope −k (orders 0 and 1) and +k (order 2).
    for (const k of [zero, first, second]) {
      expect(Math.abs((k.linearized(10) - k.linearized(0)) / 10 - k.slope)).toBeLessThan(1e-12);
      expect(Math.abs((k.linearized(20) - k.linearized(10)) / 10 - k.slope), "a line has one slope").toBeLessThan(
        1e-12,
      );
    }
    expect(zero.slope === -0.05 && first.slope === -0.1 && second.slope === 0.1).toBe(true);
    // Zero order runs out at [A]₀/k; the others are shown for four half-lives.
    expect(
      zero.duration === 20 &&
        Math.abs(first.duration - (4 * Math.log(2)) / 0.1) < 1e-9 &&
        Math.abs(second.duration - 150) < 1e-9,
    ).toBe(true);
    expect(zero.concentration(25), "never below zero").toBe(0);
  });

  it("the graphs follow the laws and the line is straight", () => {
    for (const [order, json] of [
      [0, '{"order": 0, "k": 0.05, "A0": 1}'],
      [1, '{"order": 1, "k": 0.1, "A0": 1}'],
      [2, '{"order": 2, "k": 0.1, "A0": 1}'],
    ] as const) {
      const built = scene("concentrationTime", json);
      const k = kinetics(new Params(figure("concentrationTime", json)))!;
      const frames = kineticsFrames(k);
      const time = ending(built);
      const curves = built.elements.filter((e) => e.kind === "curve");
      expect(curves, `order ${order}: the curve and the line`).toHaveLength(2);
      const concentration = curvePoints(curves[0]!, built, time, 120);
      const line = curvePoints(curves[1]!, built, time, 120);
      // Each point is where the law says: back from world to chemistry through the frames.
      for (const point of concentration) {
        const t = (point.x - frames.concentration.left) / frames.concentration.kx;
        const value = frames.concentration.yLow + (point.y - frames.concentration.bottom) / frames.concentration.ky;
        expect(Math.abs(value - k.concentration(t)), `order ${order} at t = ${t}`).toBeLessThan(
          2e-3 * Math.max(1, k.initial),
        );
      }
      for (const point of line) {
        const t = (point.x - frames.line.left) / frames.line.kx;
        const value = frames.line.yLow + (point.y - frames.line.bottom) / frames.line.ky;
        expect(Math.abs(value - k.linearized(t)), `order ${order} line at t = ${t}`).toBeLessThan(
          2e-3 * Math.max(1, Math.abs(value)),
        );
      }
      // The right-hand graph is straight: all its segments have the same slope.
      const slopes = line.slice(1).map((p, i) => (p.y - line[i]!.y) / (p.x - line[i]!.x));
      expect(
        slopes.every((s) => Math.abs(s - slopes[0]!) < 1e-3),
        `order ${order}`,
      ).toBe(true);
      expect(slopes[0]! < 0).toBe(k.slope < 0);
      // Three half-life marks, each dot at [A]₀/2, /4, /8 above its time.
      const compiled = new CompiledIllustration(built);
      const dots = built.elements.filter((e) => e.kind === "point").map((e) => position(compiled, e, time));
      expect(dots).toHaveLength(3);
      dots.forEach((dot, index) => {
        const t = (dot.x - frames.concentration.left) / frames.concentration.kx;
        const value = frames.concentration.yLow + (dot.y - frames.concentration.bottom) / frames.concentration.ky;
        expect(
          Math.abs(t - k.timeWhenHalved(index + 1)) < 1e-2 * k.duration &&
            Math.abs(value - 1 / Math.pow(2, index + 1)) < 5e-3,
        ).toBe(true);
      });
    }
  });

  it("the figure writes the law and the half-lives", () => {
    const first = scene("concentrationTime", '{"order": 1, "k": 0.1, "A0": 1}');
    const final = finalLabels(first);
    expect(final).toContain("Ordem 1: v = k[A]  ·  [A] = [A]₀·e⁻ᵏᵗ");
    expect(final.some((l) => l.includes("ln [A] em função de t é uma reta de declive −k = −0,1 s⁻¹"))).toBe(true);
    expect(labels(first, Teach.start(2) + 1.0)).toContain("Meias-vidas: 6,93; 6,93; 6,93 s (meias-vidas iguais)");
    const second = scene("concentrationTime", '{"order": 2, "k": 0.1, "A0": 1}');
    expect(labels(second, Teach.start(2) + 1.0)).toContain(
      "Meias-vidas: 10; 20; 40 s (cada meia-vida é o dobro da anterior)",
    );
    expect(
      finalLabels(second).some((l) => l.includes("1/[A] em função de t é uma reta de declive +k = 0,1 L·mol⁻¹·s⁻¹")),
    ).toBe(true);
    const zero = scene("concentrationTime", '{"order": 0}');
    expect(labels(zero, Teach.start(2) + 1.0)).toContain(
      "Meias-vidas: 10; 5; 2,5 s (cada meia-vida é metade da anterior)",
    );
    expect(finalLabels(zero)).toContain("Ordem 0: v = k  ·  [A] = [A]₀ − kt");
    // Three steps, one for each thing the figure shows: the curve, the half-lives, the line.
    expect(boundaries(first)).toHaveLength(4);
  });

  it("sliders and refusals", () => {
    const base = figure("concentrationTime", '{"order": 1, "k": 0.1, "A0": 1}');
    const faster = merged(base, { k: 0.2, A0: 1 })!;
    expect(labels(faster, Teach.start(2) + 1.0)).toContain("Meias-vidas: 3,47; 3,47; 3,47 s (meias-vidas iguais)");
    // For a second-order reaction a bigger [A]₀ makes the half-life shorter: t½ = 1/(k[A]₀).
    const of = (json: string) => kinetics(new Params(figure("concentrationTime", json)))!;
    expect(of('{"order": 2, "k": 0.1, "A0": 2}').halfLife(1)).toBeLessThan(
      of('{"order": 2, "k": 0.1, "A0": 0.5}').halfLife(1),
    );
    for (const json of ["{}", '{"order": 3}', '{"order": 1, "k": -1}', '{"order": 1, "A0": 0}', '{"order": 1.5}'])
      expect(refused("concentrationTime", json), json).toBe(true);
  });
});

describe("Punnett square", () => {
  it("gametes and crosses follow Mendel", () => {
    expect(gametes("Aa")).toEqual(["A", "a"]);
    expect(gametes("AA")).toEqual(["A", "A"]);
    expect(gametes("AaBb")).toEqual(["AB", "Ab", "aB", "ab"]);
    expect(gametes("aabb")).toEqual(["ab", "ab", "ab", "ab"]);
    for (const bad of ["Ab", "A", "AaBbCc", "A1"]) expect(gametes(bad), bad).toBeNull();
    // Aa × Aa: 1 AA : 2 Aa : 1 aa, three dominant for one recessive.
    const monohybrid = punnettSquare("Aa", "Aa")!;
    expect(monohybrid.cells).toEqual([
      ["AA", "Aa"],
      ["Aa", "aa"],
    ]);
    expect(monohybrid.genotypeCounts.map((g) => g.genotype)).toEqual(["AA", "Aa", "aa"]);
    expect(monohybrid.genotypeCounts.map((g) => g.count)).toEqual([1, 2, 1]);
    expect(monohybrid.phenotypeCounts.map((p) => p.phenotype)).toEqual(["A_", "aa"]);
    expect(monohybrid.phenotypeCounts.map((p) => p.count)).toEqual([3, 1]);
    // Test cross Aa × aa: 1 : 1. AA × aa: all heterozygous.
    const testCross = punnettSquare("Aa", "aa")!;
    expect(testCross.genotypeCounts.map((g) => g.count)).toEqual([2, 2]);
    expect(testCross.phenotypeCounts.map((p) => p.count)).toEqual([2, 2]);
    const uniform = punnettSquare("AA", "aa")!;
    expect(uniform.genotypeCounts).toEqual([{ genotype: "Aa", count: 4 }]);
    expect(uniform.phenotypeCounts.map((p) => p.phenotype)).toEqual(["A_"]);
    // Dihybrid AaBb × AaBb: nine genotypes 1 : 2 : 1 : 2 : 4 : 2 : 1 : 2 : 1 and the classical 9 : 3 : 3 : 1.
    const dihybrid = punnettSquare("AaBb", "AaBb")!;
    expect(dihybrid.cells.length === 4 && dihybrid.cells.every((row) => row.length === 4)).toBe(true);
    expect(dihybrid.genotypeCounts.map((g) => g.genotype)).toEqual([
      "AABB",
      "AABb",
      "AAbb",
      "AaBB",
      "AaBb",
      "Aabb",
      "aaBB",
      "aaBb",
      "aabb",
    ]);
    expect(dihybrid.genotypeCounts.map((g) => g.count)).toEqual([1, 2, 1, 2, 4, 2, 1, 2, 1]);
    expect(dihybrid.phenotypeCounts.map((p) => p.phenotype)).toEqual(["A_B_", "A_bb", "aaB_", "aabb"]);
    expect(dihybrid.phenotypeCounts.map((p) => p.count)).toEqual([9, 3, 3, 1]);
    // Every genotype has its alleles written dominant first, and each parent supplies one allele of each gene.
    dihybrid.cells.forEach((row, r) =>
      row.forEach((cell, c) => {
        const letters = Array.from(cell);
        expect(letters.length === 4 && letters[0]!.toLowerCase() === "a" && letters[2]!.toLowerCase() === "b").toBe(
          true,
        );
        for (let gene = 0; gene < 2; gene++) {
          const alleles = [dihybrid.gametes1[r]![gene]!, dihybrid.gametes2[c]![gene]!];
          expect(new Set(alleles)).toEqual(new Set([letters[2 * gene]!, letters[2 * gene + 1]!]));
        }
      }),
    );
    // Different genes in the two parents cannot be crossed.
    expect(punnettSquare("Aa", "Bb")).toBeNull();
    expect(punnettSquare("Aa", "AaBb")).toBeNull();
    // A recessive-by-recessive cross breeds true.
    expect(punnettSquare("aabb", "aabb")!.phenotypeCounts).toEqual([{ phenotype: "aabb", count: 16 }]);
  });

  it("the figure fills the grid cell by cell and counts the classes", () => {
    const built = scene("punnettSquare", '{"parent1": "AaBb", "parent2": "AaBb"}');
    const compiled = new CompiledIllustration(built);
    const time = ending(built);
    const final = finalLabels(built);
    expect(final).toContain("Cruzamento AaBb × AaBb  ·  gâmetas AB Ab aB ab × AB Ab aB ab");
    // The 16 genotypes in the grid are in the right cells: positions follow the gametes (row = first parent, column = second).
    const square = punnettSquare("AaBb", "AaBb")!;
    const gridLines = built.elements.filter((e) => e.kind === "line");
    expect(gridLines, "five horizontal and five vertical lines").toHaveLength(10);
    const verticals = gridLines
      .filter((e) => e.x === e.x2)
      .map((e) => at(compiled, e.x, time))
      .sort((a, b) => a - b);
    const horizontals = gridLines
      .filter((e) => e.y === e.y2)
      .map((e) => at(compiled, e.y, time))
      .sort((a, b) => b - a);
    expect(verticals.length === 5 && horizontals.length === 5).toBe(true);
    for (let row = 0; row < 4; row++)
      for (let column = 0; column < 4; column++) {
        const x = (verticals[column]! + verticals[column + 1]!) / 2;
        const y = (horizontals[row]! + horizontals[row + 1]!) / 2;
        const found = built.elements.some((e) => {
          if (e.kind !== "label" || e.text !== square.cells[row]![column]) return false;
          const p = position(compiled, e, time);
          return Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6;
        });
        expect(found, `${square.cells[row]![column]} is not in cell (${row}, ${column})`).toBe(true);
      }
    // The cells come one after another, in reading order.
    const genotypesInGrid = new Set(square.cells.flat());
    const shownCells = (t: number) =>
      built.elements.filter(
        (e) =>
          e.kind === "label" &&
          genotypesInGrid.has(e.text ?? "#") &&
          !["AB", "Ab", "aB", "ab"].includes(e.text ?? "") &&
          shownAt(built, t)(e),
      ).length;
    expect(shownCells(Teach.start(1) - 0.1)).toBe(0);
    expect(shownCells(Teach.start(1) + 0.19 + 1.5 * 0.15)).toBe(3);
    expect(shownCells(time)).toBe(16);
    // The lists: every genotype and class with its fraction of the 16 cells.
    for (const text of [
      "1/16 AABB",
      "1/8 AABb",
      "1/16 AAbb",
      "1/8 AaBB",
      "1/4 AaBb",
      "1/8 Aabb",
      "1/16 aaBB",
      "1/8 aaBb",
      "1/16 aabb",
      "9/16 A_B_",
      "3/16 A_bb",
      "3/16 aaB_",
    ])
      expect(final, text).toContain(text);
    expect(final.includes("Genótipos") && final.includes("Fenótipos")).toBe(true);
    // Cells are coloured by class: blue where every gene shows the dominant trait (9), orange for aabb (1), grey for the rest.
    const boxes = built.elements.filter((e) => e.kind === "rect");
    expect(boxes).toHaveLength(16);
    expect(boxes.filter((e) => e.color === "accent")).toHaveLength(9);
    expect(boxes.filter((e) => e.color === "second")).toHaveLength(1);
    expect(boxes.filter((e) => e.color === "muted")).toHaveLength(6);
    // Monohybrid: a bigger 2 × 2 grid.
    const single = scene("punnettSquare", '{"parent1": "Aa", "parent2": "Aa"}');
    const singleLabels = finalLabels(single);
    for (const text of ["1/4 AA", "1/2 Aa", "1/4 aa", "3/4 A_", "1/4 aa"]) expect(singleLabels, text).toContain(text);
    expect(single.elements.filter((e) => e.kind === "line")).toHaveLength(6);
    // Order of the steps: grid and gametes first, then the cells, then the genotypes, finally the phenotypes.
    const early = labels(single, Teach.start(0) + 0.2);
    expect(early.includes("A") && early.includes("a") && !early.includes("AA") && !early.includes("Genótipos")).toBe(
      true,
    );
    expect(boundaries(single)).toHaveLength(5);
    const english = finalLabels(compile(figure("punnettSquare", '{"parent1": "Aa", "parent2": "aa"}'), "English")!);
    expect(english.includes("Cross Aa × aa  ·  gametes A a × a a") && english.includes("Genotypes")).toBe(true);
  });

  it("refuses genotypes it cannot cross", () => {
    for (const json of [
      '{"parent1": "Aa"}',
      '{"parent1": "Aa", "parent2": "Bb"}',
      '{"parent1": "Ab", "parent2": "Aa"}',
      '{"parent1": "A", "parent2": "a"}',
      '{"parent1": "AaBbCc", "parent2": "AaBbCc"}',
      '{"parent1": "Aa", "parent2": "AaBb"}',
      "{}",
    ])
      expect(refused("punnettSquare", json), json).toBe(true);
  });

  it("the lists stand one per line, clear of the grid", () => {
    for (const json of [
      '{"parent1": "AaBb", "parent2": "AaBb"}',
      '{"parent1": "Aa", "parent2": "Aa"}',
      '{"parent1": "Aa", "parent2": "aa"}',
      '{"parent1": "AaBb", "parent2": "aabb"}',
    ]) {
      const built = scene("punnettSquare", json);
      const compiled = new CompiledIllustration(built);
      const time = ending(built);
      const right = Math.max(...built.elements.filter((e) => e.kind === "line").map((e) => at(compiled, e.x, time)));
      // Everything of the lists: the entries (a fraction and a genotype or class) and their titles.
      const lists: { text: string; box: LabelBox }[] = [];
      for (const e of built.elements) {
        if (e.kind !== "label" || !e.text || !shownAt(built, time)(e)) continue;
        const box = labelBox(e, compiled, values(time));
        if (!box) continue;
        if (/^\d+(\/\d+)? /.test(e.text) || ["Genótipos", "Fenótipos"].includes(e.text))
          lists.push({ text: e.text, box });
      }
      expect(lists.length, json).toBeGreaterThan(0);
      lists.forEach((a, first) => {
        expect(a.box.minX, `${json}: “${a.text}” is too close to the grid`).toBeGreaterThan(right + 0.2);
        for (const b of lists.slice(first + 1)) {
          const shrunk = {
            minX: b.box.minX + 0.02,
            maxX: b.box.maxX - 0.02,
            minY: b.box.minY + 0.02,
            maxY: b.box.maxY - 0.02,
          };
          expect(boxesOverlap(a.box, shrunk), `${json}: “${a.text}” and “${b.text}” overlap`).toBe(false);
        }
      });
    }
    // The dihybrid cross: one genotype and one phenotype a line, each list in order from the top.
    const built = scene("punnettSquare", '{"parent1": "AaBb", "parent2": "AaBb"}');
    const compiled = new CompiledIllustration(built);
    const time = ending(built);
    // "1/16 aabb" is both a genotype and a class, so each list is read from its own side of the picture.
    const column = (texts: string[], low: number, high: number) =>
      texts.map((text) => {
        const found = built.elements.find((e) => {
          if (e.kind !== "label" || e.text !== text) return false;
          const x = at(compiled, e.x, time);
          return x >= low && x < high;
        });
        if (!found) throw new Error(`${text} missing`);
        return position(compiled, found, time);
      });
    for (const [texts, low, high] of [
      [
        [
          "1/16 AABB",
          "1/8 AABb",
          "1/16 AAbb",
          "1/8 AaBB",
          "1/4 AaBb",
          "1/8 Aabb",
          "1/16 aaBB",
          "1/8 aaBb",
          "1/16 aabb",
        ],
        6,
        8,
      ],
      [["9/16 A_B_", "3/16 A_bb", "3/16 aaB_", "1/16 aabb"], 8, 10],
    ] as const) {
      const spots = column([...texts], low, high);
      expect(new Set(spots.map((s) => s.x)).size, "one column").toBe(1);
      for (let index = 1; index < spots.length; index++)
        expect(
          spots[index - 1]!.y - spots[index]!.y,
          `one result a line, in order: ${texts[index]}`,
        ).toBeGreaterThanOrEqual(0.46);
    }
  });
});
