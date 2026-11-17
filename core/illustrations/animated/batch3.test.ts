// Port of LearnLayerTests/PremadeFigureBatch3Tests.swift @ ref 2026-11-04: what every batch 3 figure must satisfy,
// measured the way the renderer reads a scene. The per-type semantic tests live in the mechanics, chemistry, analysis,
// probability and space suites.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration } from "../illustration";
import { IllustrationPrompt } from "../illustrationPrompt";
import { applyingPremadeFigure, PremadeFigures, type PremadeFigure } from "../premadeFigure";
import { animatedGallery, sample } from "./animated";
import { withinBounds, type LabelBox } from "./figureCanvas";
import {
  animates,
  boundsProblems,
  curvePoints,
  finalLabels,
  labelBox,
  overlapProblems,
  signature,
  times,
  values,
} from "./sceneCheck";
import type { Point } from "./optics";

const language = "Portuguese (Portugal)";
/** `PremadeFigure.Batch3Kind.allCases` on the Mac. */
const batch3Kinds = [
  "modulus",
  "bolzano",
  "sequenceTerms",
  "argandPlane",
  "space3D",
  "solids",
  "probabilityTree",
  "vennDiagram",
  "freeBody",
  "circularMotion",
  "energyBars",
  "collision",
  "springOscillator",
  "resistorNetwork",
  "atwood",
  "lewisStructure",
  "reactionProfile",
  "titrationCurve",
  "iceTable",
  "periodicTrends",
  "concentrationTime",
  "punnettSquare",
  "heatingCurve",
];
const gallery = animatedGallery.filter((figure) => batch3Kinds.includes(figure.type));
const compile = (premade: PremadeFigure, lang = language) => new PremadeFigures(premade).compile("t", lang);
const boundaries = (scene: Illustration) =>
  (scene as { stepPlayback?: { boundaries: number[] } | null }).stepPlayback?.boundaries ?? [];
const name = (figure: PremadeFigure) => `${figure.type} ${JSON.stringify(figure.params)}`;

/** The sample with every slider at its low end, at its high end, at its value, and each slider alone at both ends. */
function sliderSettings(scene: Illustration, withValues: boolean): Record<string, number>[] {
  const sliders = scene.parameters ?? [];
  if (sliders.length === 0) return [];
  const all = (pick: (s: (typeof sliders)[0]) => number) => Object.fromEntries(sliders.map((s) => [s.name, pick(s)]));
  const settings = [all((s) => s.min), all((s) => s.max)];
  if (withValues) settings.push(all((s) => s.value));
  for (const slider of sliders) {
    settings.push({ ...all((s) => s.value), [slider.name]: slider.min });
    settings.push({ ...all((s) => s.value), [slider.name]: slider.max });
  }
  return settings;
}

describe("batch 3 figures", () => {
  it("the gallery has every batch 3 type", () => {
    expect(new Set(gallery.map((f) => f.type))).toEqual(new Set(batch3Kinds));
  });

  it("the model is told about every batch 3 type", () => {
    const prompt = IllustrationPrompt.system("English");
    for (const kind of batch3Kinds) expect(prompt.includes(kind), `${kind} missing from the prompt`).toBe(true);
  });

  it.each(gallery.map((figure) => [name(figure), figure] as const))(
    "%s fits, draws, moves and teaches",
    (label, figure) => {
      const scene = compile(figure);
      expect(scene, `${label} did not compile`).not.toBeNull();
      if (!scene) return;
      expect(scene.duration ?? 0).toBeGreaterThan(0);
      expect(new CompiledIllustration(scene).isDrawable).toBe(true);
      expect(animates(scene), "does not change over its duration").toBe(true);
      expect(withinBounds(scene), "leaves the picture").toBe(true);
      const steps = boundaries(scene);
      expect(steps.length, "has no teaching steps").toBeGreaterThanOrEqual(3);
      expect(steps, "steps out of order").toEqual([...steps].sort((a, b) => a - b));
      expect(steps[0]).toBe(0);
      expect(steps.at(-1)!, "is not finished when it rests").toBeLessThanOrEqual((scene.duration ?? 0) * 0.8 + 1e-9);
      for (const time of times(scene)) {
        expect(boundsProblems(scene, time).slice(0, 3)).toEqual([]);
        expect(overlapProblems(scene, time).slice(0, 3)).toEqual([]);
      }
      // Every teaching step changes the picture.
      for (let index = 1; index < steps.length; index++)
        expect(
          JSON.stringify(signature(scene, steps[index - 1]!)) !== JSON.stringify(signature(scene, steps[index]!)),
          `step ${index} at ${steps[index]} adds nothing`,
        ).toBe(true);
    },
  );

  it.each(gallery.map((figure) => [name(figure), figure] as const))(
    "%s stays drawable and clear at its slider extremes",
    (label, figure) => {
      const base = compile(figure);
      if (!base || (base.parameters ?? []).length === 0) return;
      expect(new PremadeFigures(figure).needsParameterRecompile, `${label} has sliders but does not recompile`).toBe(
        true,
      );
      expect(base.premade?.type).toBe(figure.type);
      for (const setting of sliderSettings(base, true)) {
        const where = `${label} ${JSON.stringify(setting)}`;
        const scene = compile(new PremadeFigures(figure).mergingParameters(setting));
        expect(scene, `${where} did not compile`).not.toBeNull();
        if (!scene) continue;
        expect(new CompiledIllustration(scene).isDrawable, where).toBe(true);
        expect(withinBounds(scene), `${where} leaves the picture`).toBe(true);
        for (const time of times(scene)) {
          expect(boundsProblems(scene, time).slice(0, 2), `${where} t=${time}`).toEqual([]);
          expect(overlapProblems(scene, time).slice(0, 2), `${where} t=${time}`).toEqual([]);
        }
      }
    },
  );

  it("every batch 3 figure is also reachable through the model's illustration", () => {
    for (const figure of gallery) {
      const free: Illustration = { title: "t", width: 10, height: 6, parameters: [], elements: [], premade: figure };
      expect(applyingPremadeFigure(free, "English").elements.length, figure.type).toBeGreaterThan(0);
    }
  });

  it("English and Portuguese both compile, and the English text fits too", () => {
    for (const figure of gallery) {
      const english = compile(figure, "English");
      const portuguese = compile(figure);
      expect(english !== null && portuguese !== null, figure.type).toBe(true);
      if (!english || !portuguese) continue;
      // Words are written in the exam's language: some text differs between the two.
      expect(finalLabels(english).join("|"), `${figure.type} is not translated`).not.toBe(
        finalLabels(portuguese).join("|"),
      );
      for (const time of times(english)) {
        expect(boundsProblems(english, time).slice(0, 2), `${figure.type} in English`).toEqual([]);
        expect(overlapProblems(english, time).slice(0, 2), `${figure.type} in English`).toEqual([]);
      }
    }
  });

  /** What the figure plots at `time`: its curves, and the short coloured segments a polyline is made of (not ticks or dashed guides). */
  function plottedPaths(scene: Illustration, time: number): Point[][] {
    const compiled = new CompiledIllustration(scene);
    const at = values(time);
    const paths: Point[][] = [];
    for (const e of scene.elements) {
      if (e.visible) {
        const v = compiled.value(e.visible, at);
        if (v === null || !Number.isFinite(v) || !(v > 0)) continue;
      }
      if (e.kind === "curve") {
        const points = curvePoints(e, scene, time, 240);
        if (points.length > 1) paths.push(points);
      } else if (e.kind === "line") {
        if (e.color === "muted" || e.dashed === true) continue;
        const [x, y, x2, y2] = [e.x, e.y, e.x2, e.y2].map((t) => compiled.value(t ?? "", at));
        if ([x, y, x2, y2].some((v) => v === null) || Math.hypot(x2! - x!, y2! - y!) > 0.2) continue;
        paths.push([
          { x: x!, y: y! },
          { x: x2!, y: y2! },
        ]);
      }
    }
    return paths;
  }

  /** True when the path passes through the box. A jump between two far apart samples (an asymptote) is not a stroke. */
  function touches(points: Point[], box: LabelBox): boolean {
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1]!;
      const b = points[index]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length > 0.5) continue;
      const steps = Math.max(1, Math.ceil(length / 0.02));
      for (let step = 0; step <= steps; step++) {
        const x = a.x + ((b.x - a.x) * step) / steps;
        const y = a.y + ((b.y - a.y) * step) / steps;
        if (x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY) return true;
      }
    }
    return false;
  }

  it.each(gallery.map((figure) => [name(figure), figure] as const))(
    "%s keeps its labels off the plotted curves, at the end and at the slider extremes",
    (label, figure) => {
      const base = compile(figure);
      if (!base) return;
      const scenes: [string, Illustration][] = [[label, base]];
      for (const setting of sliderSettings(base, false)) {
        const scene = compile(new PremadeFigures(figure).mergingParameters(setting));
        if (scene) scenes.push([`${label} ${JSON.stringify(setting)}`, scene]);
      }
      for (const [where, scene] of scenes) {
        const time = 0.95 * (scene.duration ?? 0);
        const paths = plottedPaths(scene, time);
        if (paths.length === 0) continue;
        const compiled = new CompiledIllustration(scene);
        const at = values(time);
        for (const e of scene.elements) {
          if (e.kind !== "label") continue;
          if (e.visible && (compiled.value(e.visible, at) ?? 0) <= 0) continue;
          const box = labelBox(e, compiled, at);
          if (!box) continue;
          // The text itself is about 0.3 tall; the box the labels reserve for each other is taller.
          const middle = (box.minY + box.maxY) / 2;
          const text = { minX: box.minX, maxX: box.maxX, minY: middle - 0.15, maxY: middle + 0.15 };
          for (const points of paths)
            expect(touches(points, text), `${where}: “${e.text}” touches a plotted curve`).toBe(false);
        }
      }
    },
  );

  it("an invalid batch 3 figure falls back to the model's own drawing", () => {
    const free: Illustration = {
      title: "t",
      width: 10,
      height: 6,
      parameters: [],
      elements: [{ kind: "point", x: "1", y: "1" }],
      premade: sample("modulus", '{"f": "1/x", "xMin": -1, "xMax": 1}'),
    };
    expect(applyingPremadeFigure(free, "English").elements).toHaveLength(1);
  });
});
