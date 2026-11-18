// Port of LearnLayerTests/PremadeFigureBatch2Tests.swift @ ref 2026-11-04: what every batch 2 figure (electromagnetism
// and optics) must satisfy. The bounds, overlaps and movement of each gallery sample are checked in animated.test.ts;
// the per-type tests live in the electromagnetism and optics suites.

import { describe, expect, it } from "vitest";
import type { Illustration } from "../illustration";
import { IllustrationPrompt } from "../illustrationPrompt";
import { applyingPremadeFigure, PremadeFigures } from "../premadeFigure";
import { animatedGallery, sample } from "./animated";

/** `PremadeFigure.Batch2Kind.allCases` on the Mac. */
const batch2Kinds = [
  "electricFieldLines",
  "equipotentials",
  "parallelPlates",
  "magneticField",
  "lorentzForce",
  "faradayLenz",
  "rcCircuitCurve",
  "acSignal",
  "mirrorRays",
  "lensRays",
  "refraction",
  "prismDispersion",
  "doubleSlit",
  "emSpectrum",
];
const gallery = animatedGallery.filter((figure) => batch2Kinds.includes(figure.type));

describe("batch 2 figures", () => {
  it("the gallery has every batch 2 type, and the model is told about each", () => {
    expect(new Set(gallery.map((f) => f.type))).toEqual(new Set(batch2Kinds));
    const prompt = IllustrationPrompt.system("English");
    for (const kind of batch2Kinds) expect(prompt.includes(kind), `${kind} missing from the prompt`).toBe(true);
  });

  it("every batch 2 figure is also reachable through the model's illustration", () => {
    for (const figure of gallery) {
      const free: Illustration = { title: "t", width: 10, height: 6, parameters: [], elements: [], premade: figure };
      expect(applyingPremadeFigure(free, "English").elements.length, figure.type).toBeGreaterThan(0);
    }
  });

  it("unknown or invalid params fall back", () => {
    for (const [type, json] of [
      ["electricFieldLines", '{"kind": "triangle"}'],
      ["electricFieldLines", '{"kind": "dipole", "q": 0}'],
      ["electricFieldLines", '{"kind": "dipole", "q": 50}'],
      ["equipotentials", '{"kind": "quadrupole"}'],
      ["parallelPlates", '{"voltage": -5}'],
      ["parallelPlates", '{"distance": 0}'],
      ["parallelPlates", '{"charge": "neutral"}'],
      ["parallelPlates", '{"positivePlate": "left"}'],
      ["magneticField", '{"kind": "toroid"}'],
      ["magneticField", '{"kind": "wire", "current": "sideways"}'],
      ["magneticField", '{"kind": "solenoid", "turns": 40}'],
      ["lorentzForce", '{"charge": "neutral"}'],
      ["lorentzForce", '{"field": "up"}'],
      ["faradayLenz", '{"pole": "X"}'],
      ["faradayLenz", '{"motion": "spin"}'],
      ["rcCircuitCurve", '{"mode": "sideways"}'],
      ["rcCircuitCurve", '{"tau": -1}'],
      ["acSignal", '{"peak": 0}'],
      ["acSignal", '{"frequency": -50}'],
      ["mirrorRays", '{"kind": "spherical"}'],
      ["mirrorRays", '{"kind": "concave", "focal": -2}'],
      ["mirrorRays", '{"kind": "concave", "objectDistance": 0}'],
      ["lensRays", '{"kind": "converging"}'],
      ["lensRays", '{"kind": "converging", "focal": 2, "objectDistance": -1}'],
      ["lensRays", '{"kind": "thick", "focal": 2}'],
      ["refraction", '{"n1": 1, "n2": 1.5, "angle": 95}'],
      ["refraction", '{"n1": 0.5, "n2": 1.5, "angle": 30}'],
      ["prismDispersion", '{"incidence": 20}'],
      ["doubleSlit", '{"wavelength": 0}'],
      ["doubleSlit", '{"separation": -1}'],
      ["hypercube", "{}"],
    ] as const)
      expect(new PremadeFigures(sample(type, json)).compile("t", "English"), `${type} ${json} was accepted`).toBeNull();
  });

  it("an invalid batch 2 figure falls back to the model's own drawing", () => {
    const free: Illustration = {
      title: "t",
      width: 10,
      height: 6,
      parameters: [],
      elements: [{ kind: "point", x: "1", y: "1" }],
      premade: sample("lensRays", '{"kind": "converging"}'),
    };
    expect(applyingPremadeFigure(free, "English").elements).toHaveLength(1);
  });

  it("the static lens figure is still there next to lensRays", () => {
    expect(
      new PremadeFigures({ type: "lens", params: { converging: true, focal: 2 } }).compile("t", "English"),
    ).not.toBeNull();
  });
});
