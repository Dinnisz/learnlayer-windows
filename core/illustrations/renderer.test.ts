// Port of LearnLayerTests/IllustrationRendererTests.swift @ ref 2026-11-04
//
// The Mac renders into a bitmap and checks pixels for the open end; here the renderer's display list is checked: the
// open end is a hole with a ring drawn over it.

import { describe, expect, test } from "vitest";
import { CompiledIllustration, type Illustration } from "./illustration";
import { compileTemplate, continuityIllustration, decodeTemplate, parseDouble } from "./illustrationTemplate";
import { approximateMeasurer, IllustrationRenderer, type Size } from "./renderer";
import { bolzanoScene, continuityCase, fitJSON } from "./testFixtures";

const sizes: Size[] = [
  { width: 170, height: 102 },
  { width: 400, height: 240 },
];

function renderer(scene: Illustration, size: Size): IllustrationRenderer {
  const values: Record<string, number> = { t: 0, revealed: 1, step: 1000 };
  for (const parameter of scene.parameters ?? []) values[parameter.name] = parameter.value;
  const drawing = new IllustrationRenderer(new CompiledIllustration(scene), values, size, 0, approximateMeasurer);
  drawing.draw();
  return drawing;
}

function expectClear(scene: Illustration, name: string) {
  for (const size of sizes) {
    const placer = renderer(scene, size).room.placer;
    expect(placer.labels.length, `${name} at ${size.width}: nothing drawn`).toBeGreaterThan(0);
    placer.labels.forEach((box, index) => {
      const context = `${name} at ${size.width}: label ${index}`;
      expect(
        box.minX >= placer.bounds.minX - 1e-6 && box.maxX <= placer.bounds.maxX + 1e-6,
        `${context} is cut at a side`,
      ).toBe(true);
      expect(
        box.minY >= placer.bounds.minY - 1e-6 && box.maxY <= placer.bounds.maxY + 1e-6,
        `${context} is cut at the top`,
      ).toBe(true);
      const others = placer.copy();
      others.labels.splice(index, 1);
      others.padding = 0;
      expect(others.cost(box), `${context} covers something`).toBe(0);
    });
  }
}

function expectMarksBesideTheirPoints(scene: Illustration, name: string) {
  for (const size of sizes) {
    const placer = renderer(scene, size).room.placer;
    const distance = (mark: (typeof placer.labels)[number], dot: number) =>
      mark.distance({ x: placer.dots[dot]!.midX, y: placer.dots[dot]!.midY });
    const marks = [...placer.labels].sort((a, b) => b.width - a.width).slice(0, 2);
    const owners = marks.map((mark) =>
      placer.dots.reduce(
        (best, _, index) => (best < 0 || distance(mark, index) < distance(mark, best) ? index : best),
        -1,
      ),
    );
    expect(
      owners.length === 2 && new Set(owners).size === 2,
      `${name} at ${size.width}: both marks sit by one point`,
    ).toBe(true);
    marks.forEach((mark, index) =>
      expect(
        distance(mark, owners[index]!),
        `${name} at ${size.width}: a mark is far from its point`,
      ).toBeLessThanOrEqual(16),
    );
  }
}

function fittedSeries(): Illustration {
  const built = compileTemplate(decodeTemplate(JSON.parse(fitJSON))!, "Portuguese (Portugal)");
  return { title: "d", width: 10, height: 6, parameters: built.parameters, elements: built.elements };
}

describe("IllustrationRenderer", () => {
  test("the Bolzano graph is drawn clear", () => {
    const scene = bolzanoScene();
    expectClear(scene, "2.3");
    expectMarksBesideTheirPoints(scene, "2.3");
  });

  test("the fitted series is drawn clear", () => {
    expectClear(fittedSeries(), "8.1");
  });

  test("the fit equation stays beside its line", () => {
    const scene = fittedSeries();
    const line = scene.elements.find((element) => element.kind === "line" && element.dashed === true)!;
    const [fromX, fromY, toX, toY] = [line.x, line.y, line.x2, line.y2].map(parseDouble) as number[];
    for (const size of sizes) {
      const drawing = renderer(scene, size);
      const a = drawing.point(fromX!, fromY!);
      const b = drawing.point(toX!, toY!);
      const equation = drawing.room.placer.labels.reduce((widest, box) => (box.width > widest.width ? box : widest));
      let gap = Infinity;
      for (let step = 0; step <= 100; step++) {
        const t = step / 100;
        gap = Math.min(gap, equation.distance({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }));
      }
      expect(gap, `8.1 at ${size.width}: the equation is ${gap} from its line`).toBeLessThanOrEqual(
        equation.height * 1.5,
      );
    }
  });

  test("the continuity graph is drawn clear", () => {
    const scene = continuityIllustration(continuityCase, "f", "Portuguese (Portugal)")!;
    expectClear(scene, "2.1");
    expectMarksBesideTheirPoints(scene, "2.1");
  });

  test("an open end is hollow at every size", () => {
    const scene = continuityIllustration(continuityCase, "f", "Portuguese (Portugal)")!;
    const endIndex = scene.elements.findIndex((element) => element.kind === "circle");
    for (const size of sizes) {
      const ops = renderer(scene, size).ops.filter((op) => op.element === endIndex);
      const hole = ops.find((op) => op.op === "hole");
      expect(hole, `2.1 at ${size.width}: the open end is filled`).toBeDefined();
      const ring = ops.find((op) => op.op === "path" && op.stroke !== null && op.fill === null);
      expect(ring, `2.1 at ${size.width}: the open end has no outline`).toBeDefined();
      if (hole?.op === "hole") expect(hole.r).toBeGreaterThanOrEqual(3.2);
    }
  });
});
