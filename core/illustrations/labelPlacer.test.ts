// Port of LearnLayerTests/LabelPlacerTests.swift and ComplexPlaneLabelTests.swift @ ref 2026-11-04

import { describe, expect, test } from "vitest";
import { CompiledIllustration, type Illustration, type IllustrationElement } from "./illustration";
import {
  compileTemplate,
  continuityIllustration,
  decodeTemplate,
  parseDouble,
  TemplateBuilder,
} from "./illustrationTemplate";
import { bolzanoScene, continuityCase, fitJSON } from "./testFixtures";
import { applyFit, identityFit, LabelPlacer, Rect, type Pair } from "./labelPlacer";

const picture = new Rect(0, 0, 10, 6);
const beside = (x: number, y: number, width: number, height: number, towards: number | null, yUp: boolean) =>
  LabelPlacer.beside({ x, y }, width, height, 0.2, 0.2, 2, towards, yUp);

interface Placed {
  text: string;
  box: Rect;
  element: IllustrationElement;
}

function labels(elements: readonly IllustrationElement[]): Placed[] {
  return elements.flatMap((element) => {
    const box = TemplateBuilder.labelBoxOf(element);
    return element.text && box
      ? [{ text: element.text, box: new Rect(box.minX, box.minY, box.maxX, box.maxY), element }]
      : [];
  });
}

function dots(elements: readonly IllustrationElement[]): Pair[] {
  return elements.flatMap((element) => {
    if (element.kind !== "point" && element.kind !== "circle") return [];
    const x = parseDouble(element.x);
    const y = parseDouble(element.y);
    return x === null || y === null ? [] : [[x, y] as Pair];
  });
}

function ends(element: IllustrationElement): [Pair, Pair] | null {
  const [x, y, x2, y2] = [element.x, element.y, element.x2, element.y2].map(parseDouble);
  if (x == null || y == null || x2 == null || y2 == null) return null;
  return [
    [x, y],
    [x2, y2],
  ];
}

function strokes(scene: Illustration): [Pair, Pair][] {
  const compiled = new CompiledIllustration(scene);
  const values: Record<string, number> = { revealed: 1, step: 100, t: 0 };
  for (const parameter of scene.parameters ?? []) values[parameter.name] = parameter.value;
  const segments: [Pair, Pair][] = [];
  for (const element of scene.elements) {
    if (element.kind === "line" || element.kind === "arrow") {
      const found = ends(element);
      if (found) segments.push(found);
    } else if (element.kind === "curve") {
      const from = compiled.value(element.from, values);
      const to = compiled.value(element.to, values);
      if (from === null || to === null) continue;
      let previous: Pair | null = null;
      for (let index = 0; index <= 200; index++) {
        const local = { ...values, s: from + ((to - from) * index) / 200 };
        const x = compiled.value(element.curveX, local);
        const y = compiled.value(element.curveY, local);
        if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y) || y < -0.5 || y > 6.5) {
          previous = null;
          continue;
        }
        if (previous) segments.push([previous, [x, y]]);
        previous = [x, y];
      }
    }
  }
  return segments;
}

function expectClear(scene: Illustration, placed: Placed[]) {
  const all = labels(scene.elements);
  const segments = strokes(scene);
  const bounds = TemplateBuilder.labelBounds;
  for (const label of placed) {
    expect(
      label.box.minX >= bounds.minX - 1e-6 && label.box.maxX <= bounds.maxX + 1e-6,
      `${label.text} is cut at a side`,
    ).toBe(true);
    expect(
      label.box.minY >= bounds.minY - 1e-6 && label.box.maxY <= bounds.maxY + 1e-6,
      `${label.text} is cut at the top`,
    ).toBe(true);
    for (const other of all)
      if (other.text !== label.text)
        expect(label.box.intersects(other.box), `${label.text} overlaps ${other.text}`).toBe(false);
    for (const dot of dots(scene.elements))
      expect(label.box.intersects(Rect.centred(dot[0], dot[1], 0.2, 0.2)), `${label.text} covers a point`).toBe(false);
    const crossed = segments.filter(([a, b]) => label.box.crosses(a, b)).length;
    expect(crossed, `${label.text} is struck by ${crossed} strokes`).toBe(0);
  }
}

function distanceToSegment(box: Rect, a: Pair, b: Pair): number {
  let best = Infinity;
  for (let index = 0; index <= 100; index++) {
    const t = index / 100;
    best = Math.min(best, box.distance({ x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t }));
  }
  return best;
}

describe("LabelPlacer", () => {
  test("the nearest clear spot is above right", () => {
    const placer = new LabelPlacer(picture);
    const box = placer.place(beside(5, 3, 1, 0.5, null, true));
    const corner = 0.2 * Math.cos(Math.PI / 4);
    expect(Math.abs(box.minX - (5 + corner))).toBeLessThan(1e-9);
    expect(Math.abs(box.minY - (3 + corner))).toBeLessThan(1e-9);
    expect(placer.labels).toEqual([box]);
  });

  test("above is up in view points", () => {
    const placer = new LabelPlacer(picture);
    const box = placer.place(beside(5, 3, 1, 0.5, null, false));
    expect(box.maxY).toBeLessThan(3);
    expect(box.minX).toBeGreaterThan(5);
  });

  test("a label or a dot pushes the next label to another side", () => {
    const placer = new LabelPlacer(picture, 0.04);
    const candidates = beside(5, 3, 1, 0.5, null, true);
    const first = placer.place(candidates);
    placer.dots = [Rect.centred(4.4, 3.4, 0.2, 0.2)];
    const second = placer.place(candidates);
    expect(second.intersects(first.padded(0.04))).toBe(false);
    expect(second.intersects(placer.dots[0]!)).toBe(false);
    expect(second.maxY, "above left holds a dot, so it goes below").toBeLessThanOrEqual(3);
  });

  test("a label sides with a stroke when there is room", () => {
    const placer = new LabelPlacer(picture, 0.04);
    placer.addStroke([
      { x: 0, y: 3.4 },
      { x: 10, y: 3.4 },
    ]);
    const before = placer.copy();
    const box = placer.place(beside(5, 3, 1, 0.5, null, true));
    expect(before.cost(box)).toBe(0);
    expect(box.maxY).toBeLessThan(3.4);
  });

  test("with no clear spot the least covered wins", () => {
    const placer = new LabelPlacer(picture);
    placer.labels = [new Rect(0, 0, 1, 1)];
    placer.addStroke([
      { x: 4.5, y: 0 },
      { x: 4.5, y: 6 },
    ]);
    const onLabel = new Rect(0.5, 0.5, 1.5, 1);
    const onStroke = new Rect(4, 2, 5, 2.5);
    const alsoOnStroke = new Rect(4.2, 3, 5.2, 3.5);
    expect(placer.place([onLabel, onStroke, alsoOnStroke])).toEqual(onStroke);
  });

  test("a label stays inside the picture", () => {
    const placer = new LabelPlacer(picture);
    const box = placer.place(beside(9.9, 5.9, 2, 0.5, null, true));
    expect(box.minX >= picture.minX && box.maxX <= picture.maxX).toBe(true);
    expect(box.minY >= picture.minY && box.maxY <= picture.maxY).toBe(true);
    const wide = new Rect(-3, 1, 13, 2).kept(picture);
    expect(wide.minX, "wider than the picture, it starts at its left edge").toBe(picture.minX);
  });

  test("a preferred side comes first", () => {
    const left = beside(5, 3, 1, 0.5, 180, true);
    expect(Math.abs(left[0]!.maxX - 4.8)).toBeLessThan(1e-9);
    expect(Math.abs(left[0]!.midY - 3)).toBeLessThan(1e-9);
    const right = beside(5, 3, 1, 0.5, 0, true);
    expect(Math.abs(right[0]!.minX - 5.2)).toBeLessThan(1e-9);
  });

  test("a point's name stays nearer its own dot than any other", () => {
    const placer = new LabelPlacer(picture);
    const own = { x: 5, y: 3 };
    placer.dots = [Rect.centred(5.9, 3.7, 0.2, 0.2)];
    const candidates = LabelPlacer.beside(own, 1.2, 0.4, 0.2, 0.2, 2, null, true);
    const box = placer.place(candidates, own);
    expect(box.maxX, "it goes to the free side").toBeLessThan(5);
    expect(box.distance({ x: 5.9, y: 3.7 })).toBeGreaterThan(box.distance(own));
  });

  test("a name crosses a faint line rather than stray, but never a stroke", () => {
    const own = { x: 5, y: 3 };
    const near = new Rect(5.2, 2.8, 5.6, 3.2);
    const far = new Rect(7, 2.8, 7.4, 3.2);
    const faint = new LabelPlacer(picture);
    faint.faintStrokes = [
      [
        { x: 5.4, y: 0 },
        { x: 5.4, y: 6 },
      ],
    ];
    expect(faint.place([near, far], own)).toEqual(near);
    const solid = new LabelPlacer(picture);
    solid.strokes = [
      [
        { x: 5.4, y: 0 },
        { x: 5.4, y: 6 },
      ],
    ];
    expect(solid.place([near, far], own)).toEqual(far);
  });

  test("a segment crosses a box only where it passes through", () => {
    const box = new Rect(1, 1, 2, 2);
    expect(Math.abs((box.entry([0, 1.5], [3, 1.5]) ?? 0) - 1 / 3)).toBeLessThan(1e-9);
    expect(box.crosses([0, 0], [3, 3])).toBe(true);
    expect(box.crosses([1.5, 1.5], [5, 5]), "an end inside").toBe(true);
    expect(box.crosses([0, 2.5], [3, 2.5])).toBe(false);
    expect(box.crosses([0, 1.2], [0.9, 5]), "near a corner, outside").toBe(false);
  });

  test("a pinned label stays where written unless that spot touches something", () => {
    const written = new Rect(2, 2, 3, 2.5);
    const clear = new LabelPlacer(picture);
    expect(clear.nudge(written, 0.1, 0.5)).toEqual(written);
    expect(clear.labels).toEqual([written]);
    const struck = new LabelPlacer(picture);
    struck.strokes = [
      [
        { x: 2.95, y: 0 },
        { x: 2.95, y: 6 },
      ],
    ];
    const before = struck.copy();
    const moved = struck.nudge(written, 0.1, 0.5);
    expect(before.cost(moved)).toBe(0);
    expect(moved.maxX, "it steps off the line, to the near side").toBeLessThan(2.95);
    expect(Math.hypot(moved.midX - written.midX, moved.midY - written.midY)).toBeLessThanOrEqual(0.1 + 1e-9);
    const blocked = new LabelPlacer(picture);
    blocked.strokes = [
      [
        { x: 2.5, y: 0 },
        { x: 2.5, y: 6 },
      ],
    ];
    expect(blocked.nudge(written, 0.1, 0.3), "too far to clear: it stays where written").toEqual(written);
  });

  test("a long label breaks before its coordinates or near its middle", () => {
    expect(LabelPlacer.twoLines("g(0) = 4−e³ < 0 (0; −16,1)")).toEqual(["g(0) = 4−e³ < 0", "(0; −16,1)"]);
    expect(LabelPlacer.twoLines("g(−1) = 5/2 > 0 (−1; 2,5)")).toEqual(["g(−1) = 5/2 > 0", "(−1; 2,5)"]);
    expect(LabelPlacer.twoLines("lim x→3⁺ = 1/6")).toEqual(["lim x→3⁺", "= 1/6"]);
    expect(LabelPlacer.twoLines("mínimo")).toBeNull();
  });

  test("a picture fits its labels untouched when they fit", () => {
    const canvas = new Rect(0, 0, 100, 60);
    const inside = [{ point: { x: 30, y: 30 }, box: new Rect(20, 25, 28, 35) }];
    expect(LabelPlacer.fit(inside, canvas, canvas, canvas.padded(-4))).toEqual(identityFit);
  });

  test("a picture shrinks just enough for a label that spills over its edge", () => {
    const canvas = new Rect(0, 0, 100, 60);
    const bounds = canvas.padded(-4);
    const tick = { point: { x: 10, y: 30 }, box: new Rect(-2, 26, 8, 34) };
    const fit = LabelPlacer.fit([tick], canvas, canvas, bounds);
    expect(Math.abs(fit.scale - 14 / 15)).toBeLessThan(1e-6);
    const centre = { x: canvas.midX, y: canvas.midY };
    const moved = applyFit(fit, tick.point, centre);
    expect(Math.abs(moved.x - 12 - bounds.minX)).toBeLessThan(1e-6);
    const left = applyFit(fit, { x: 0, y: 0 }, centre);
    const right = applyFit(fit, { x: 100, y: 60 }, centre);
    expect(left.x >= -1e-6 && right.x <= 100 + 1e-6 && left.y >= -1e-6 && right.y <= 60 + 1e-6).toBe(true);
  });

  // The template scenes of the stage check.

  test("revealed marks never overlap tick number rects", () => {
    const scene = bolzanoScene();
    const ticks = scene.elements.filter((e) => e.kind === "label" && e.color === "muted" && e.anchor);
    const marks = scene.elements.filter((e) => e.kind === "label" && e.visible === "revealed");
    for (const mark of marks) {
      const markBox = TemplateBuilder.labelBoxOf(mark);
      if (!markBox) continue;
      const rect = new Rect(markBox.minX, markBox.minY, markBox.maxX, markBox.maxY);
      for (const tick of ticks) {
        const tickBox = TemplateBuilder.labelBoxOf(tick);
        if (!tickBox) continue;
        const other = new Rect(tickBox.minX, tickBox.minY, tickBox.maxX, tickBox.maxY);
        expect(rect.intersects(other.padded(0.02)), `${mark.text} overlaps tick ${tick.text}`).toBe(false);
      }
    }
  });

  test("each Bolzano mark sits beside its point, clear of everything", () => {
    const scene = bolzanoScene();
    const marks = labels(scene.elements).filter((label) => label.element.visible === "revealed");
    expect(marks.length).toBe(2);
    expect(marks.some((mark) => mark.text.includes("5/2"))).toBe(true);
    expect(marks.some((mark) => mark.text.includes("4−e³"))).toBe(true);
    for (const mark of marks) {
      expect(mark.text.includes("^"), `${mark.text} shows TeX`).toBe(false);
      const nearest = Math.min(...dots(scene.elements).map((dot) => mark.box.distance({ x: dot[0], y: dot[1] })));
      expect(nearest, `${mark.text} is ${nearest} from its point`).toBeLessThanOrEqual(0.6);
    }
    expectClear(scene, marks);
  });

  test("the fit equation sits beside its line, clear of the axis names", () => {
    const template = decodeTemplate(JSON.parse(fitJSON))!;
    const built = compileTemplate(template, "Portuguese (Portugal)");
    const scene: Illustration = {
      title: "d",
      width: 10,
      height: 6,
      parameters: built.parameters,
      elements: built.elements,
    };
    const equation = labels(scene.elements).find((label) => label.text.startsWith("d = "))!;
    expect(equation).toBeDefined();
    expect(equation.text).toContain("4,53 · h/1,50");
    const fit = scene.elements.find((e) => e.kind === "line" && e.color === "accent" && e.dashed === true)!;
    const line = ends(fit)!;
    expect(distanceToSegment(equation.box, line[0], line[1]), "the equation is far from its line").toBeLessThanOrEqual(
      0.6,
    );
    expectClear(scene, [equation]);
  });

  test("each limit sits beside its end, clear of everything", () => {
    const scene = continuityIllustration(continuityCase, "f", "Portuguese (Portugal)")!;
    expect(scene).not.toBeNull();
    const limits = labels(scene.elements).filter((label) => label.text.includes("lim"));
    expect(limits.length).toBe(2);
    const endDots = scene.elements.filter((e) => e.kind === "point" || e.kind === "circle");
    for (const limit of limits) {
      const own = endDots
        .filter((end) => end.color === limit.element.color)
        .flatMap((end) => {
          const x = parseDouble(end.x);
          const y = parseDouble(end.y);
          return x === null || y === null ? [] : [{ x, y }];
        });
      const nearest = Math.min(...own.map((point) => limit.box.distance(point)));
      expect(nearest, `${limit.text} is ${nearest} from its end`).toBeLessThanOrEqual(0.6);
    }
    expectClear(scene, limits);
  });
});

describe("ComplexPlaneLabel", () => {
  test("the complex plane labels the number with its coordinates and draws guides to the axes", () => {
    const template = decodeTemplate(
      JSON.parse(
        `{"kind": "complexPlane", "points": [{"x": 1, "y": 2, "text": "z", "answer": false}, {"x": -3, "y": 4, "text": "z²", "answer": true}], "radius": null}`,
      ),
    )!;
    const built = compileTemplate(template, "Portuguese (Portugal)");
    const points = built.elements.filter((e) => e.kind === "point");
    expect(points.length).toBe(2);
    const texts = points.map((point) => point.text);
    expect(texts).toContain("z (1; 2)");
    expect(texts).toContain("z² (−3; 4)");
    const guides = built.elements.filter((e) => e.kind === "line" && e.dashed === true);
    expect(guides.length).toBe(4);
    expect(guides.filter((guide) => guide.visible === "revealed").length).toBe(2);
    expect(points.find((point) => point.text === "z² (−3; 4)")?.visible).toBe("revealed");
  });

  test("a number on an axis has only one guide, and nameless points get coordinates", () => {
    const template = decodeTemplate(
      JSON.parse(
        `{"kind": "complexPlane", "points": [{"x": 0, "y": 3, "text": null, "answer": false}], "radius": null}`,
      ),
    )!;
    const built = compileTemplate(template, "English");
    expect(built.elements.filter((e) => e.kind === "line" && e.dashed === true).length).toBe(1);
    expect(built.elements.find((e) => e.kind === "point")?.text).toBe("(0, 3)");
  });
});
