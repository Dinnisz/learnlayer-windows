// Port of LearnLayerTests/FigurePacingTests.swift @ ref 2026-11-04: stepped premade figures give each step room. A
// recorded step is not finished the instant the next one is due, and the scene holds on its finished picture. The Mac
// runs it over its four galleries; this port's animatedGallery holds all of them.

import { describe, expect, it } from "vitest";
import { PremadeFigures } from "../premadeFigure";
import { animatedGallery } from "./animated";
import type { AnimatedIllustration } from "./figureCanvas";
import { Teach } from "./heating";

const minimumStepGap = 0.3;

const steppedScenes = animatedGallery.flatMap((figure) => {
  const scene = new PremadeFigures(figure).compile("t", "Portuguese") as AnimatedIllustration | null;
  const boundaries = scene?.stepPlayback?.boundaries ?? [];
  return scene && boundaries.length > 0 ? [{ name: figure.type, scene, boundaries }] : [];
});

describe("figure pacing", () => {
  it("there are stepped scenes to check", () => {
    expect(steppedScenes.length).toBeGreaterThan(3);
  });

  it("every recorded step is at least the minimum gap after the last", () => {
    for (const { name, boundaries } of steppedScenes) {
      // The first boundary is the empty page at t = 0.
      for (let index = 2; index < boundaries.length; index += 1) {
        const earlier = boundaries[index - 1]!;
        const later = boundaries[index]!;
        expect(later - earlier, `${name}: steps at ${earlier} and ${later}`).toBeGreaterThanOrEqual(
          minimumStepGap - 1e-9,
        );
      }
      expect(boundaries, `${name} steps out of order`).toEqual([...boundaries].sort((a, b) => a - b));
    }
  });

  it("the scene holds on its finished picture after the last step", () => {
    for (const { name, scene, boundaries } of steppedScenes) {
      const last = boundaries[boundaries.length - 1] ?? 0;
      expect((scene.duration ?? 0) - last, `${name} ends right after its last step`).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("teaching steps leave a hold after each reveal", () => {
    const steps = Teach.boundaries(4);
    for (let index = 0; index < 3; index += 1)
      expect(
        Teach.start(index + 1) - steps[index + 1]!,
        `step ${index} has no hold before the next starts`,
      ).toBeGreaterThanOrEqual(0.5);
  });
});
