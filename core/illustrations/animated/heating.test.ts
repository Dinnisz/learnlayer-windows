// Port of LearnLayerTests/HeatingCurveTests.swift @ ref 2026-11-04 (the prompt's mention of the type is checked with the
// prompt, which is ported word for word).

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration, type IllustrationElement } from "../illustration";
import { IllustrationPrompt } from "../illustrationPrompt";
import { PremadeFigures } from "../premadeFigure";
import { animatedGallery, sample } from "./animated";
import type { AnimatedIllustration } from "./figureCanvas";
import { Params } from "./figureCanvas";
import { heatingCurve } from "./heating";

const language = "Portuguese (Portugal)";
const heating = (json: string) => sample("heatingCurve", json);
const curveOf = (json: string) => {
  const curve = heatingCurve(new Params(heating(json)));
  if (!curve) throw new Error(`no curve for ${json}`);
  return curve;
};
const values = (time: number) => ({ t: time, revealed: 1, step: 1000 });
const isShown = (element: IllustrationElement, compiled: CompiledIllustration, at: Record<string, number>) =>
  !element.visible || (compiled.value(element.visible, at) ?? 0) > 0;
const shownLabels = (figure: Illustration, time: number) => {
  const compiled = new CompiledIllustration(figure);
  return figure.elements
    .filter((e) => e.kind === "label" && isShown(e, compiled, values(time)))
    .map((e) => e.text ?? "");
};

describe("heating curve", () => {
  it("has the stages and the energy of each", () => {
    const curve = curveOf('{"m": 100, "T0": -20, "T1": 120}');
    expect(curve.stages.map((stage) => stage.kind)).toEqual(["ice", "fusion", "liquid", "boiling", "vapour"]);
    // 0,1 kg: 2,10·20 = 4,2 · 334 = 33,4 · 4,18·100 = 41,8 · 2260 = 226 · 2,0·20 = 4,0 kJ.
    [4.2, 33.4, 41.8, 226.0, 4.0].forEach((energy, index) =>
      expect(Math.abs(curve.stages[index]!.energy - energy)).toBeLessThan(1e-9),
    );
    expect(Math.abs(curve.totalEnergy - 309.4)).toBeLessThan(1e-9);
    // Only the stages between the two temperatures.
    expect(curveOf('{"m": 200, "T0": -10, "T1": 60}').stages.map((s) => s.kind)).toEqual(["ice", "fusion", "liquid"]);
    expect(curveOf('{"m": 50, "T0": 20, "T1": 80}').stages.map((s) => s.kind)).toEqual(["liquid"]);
    expect(curveOf('{"m": 50, "T0": -5, "T1": -1}').stages.map((s) => s.kind)).toEqual(["ice"]);
    // The constants can be the exam's own.
    expect(Math.abs(curveOf('{"m": 100, "T0": -10, "T1": 0, "cIce": 2.0}').totalEnergy - 2.0)).toBeLessThan(1e-9);
  });

  it("rejects params that make no sense", () => {
    for (const json of [
      "{}",
      '{"m": 100}',
      '{"m": -5, "T0": -10, "T1": 50}',
      '{"m": 100, "T0": 50, "T1": 20}',
      '{"m": 100, "T0": -10, "T1": 50, "Lf": 0}',
      '{"m": 100, "T0": "frio", "T1": 50}',
    ])
      expect(new PremadeFigures(heating(json)).compile("t", language), json).toBeNull();
  });

  it("is drawn with plateaus at the melting and boiling points", () => {
    const figure = new PremadeFigures(heating('{"m": 100, "T0": -20, "T1": 120}')).compile(
      "Aquecimento do gelo e da água",
      language,
    ) as AnimatedIllustration;
    expect(figure.premade?.type).toBe("heatingCurve");
    const finished = 0.95 * (figure.duration ?? 0);
    const compiled = new CompiledIllustration(figure);
    const at = values(finished);
    const curves = figure.elements.filter((e) => e.kind === "curve" && isShown(e, compiled, at));
    expect(curves).toHaveLength(5);
    // The two state changes are flat: the same height at both ends.
    const flat = curves.filter((e) => e.color === "accent");
    expect(flat).toHaveLength(2);
    for (const curve of flat) {
      const from = compiled.value(curve.from, at)!;
      const to = compiled.value(curve.to, at)!;
      const start = {
        x: compiled.value(curve.curveX, { ...at, s: from })!,
        y: compiled.value(curve.curveY, { ...at, s: from })!,
      };
      const end = {
        x: compiled.value(curve.curveX, { ...at, s: to })!,
        y: compiled.value(curve.curveY, { ...at, s: to })!,
      };
      expect(Math.abs(start.y - end.y)).toBeLessThan(1e-6);
      expect(end.x).toBeGreaterThan(start.x);
    }
    // The temperatures and the energy of every stage are written in Portuguese, with the decimal comma.
    const words = shownLabels(figure, finished);
    expect(words.includes("fusão") && words.includes("ebulição") && words.includes("gelo")).toBe(true);
    expect(words).toContain("Q total = 309 kJ");
    const stepTexts = (figure.stepPlayback?.boundaries ?? []).flatMap((time) => shownLabels(figure, time));
    expect(stepTexts.some((text) => text.includes("Q = m·Lf = 33,4 kJ"))).toBe(true);
    expect(stepTexts.some((text) => text.includes("Q = m·Lv = 226 kJ"))).toBe(true);
  });

  it("has sliders that recompile it", () => {
    const figure = new PremadeFigures(heating('{"m": 100, "T0": -20, "T1": 120}'));
    expect(figure.compile("t", language)?.parameters?.map((p) => p.name)).toEqual(["m", "T0", "T1"]);
    expect(figure.needsParameterRecompile).toBe(true);
    const heavier = new PremadeFigures(figure.mergingParameters({ m: 200 })).compile("t", language)!;
    expect(shownLabels(heavier, 0.95 * (heavier.duration ?? 0))).toContain("Q total = 619 kJ");
  });

  it("the model is told to use the heating curve", () => {
    const prompt = IllustrationPrompt.system(language);
    expect(prompt).toContain("heatingCurve");
    expect(prompt).toContain('is the premade "heatingCurve"');
    expect(animatedGallery.some((figure) => figure.type === "heatingCurve")).toBe(true);
  });
});
