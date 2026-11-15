// Port of LearnLayerTests/SpaceFigureDrawingTests.swift and Space3DTests.swift (`aSolidsEdgesComeFromItsName`)
// @ ref 2026-11-04

import { describe, expect, test } from "vitest";
import { Rect, type Point } from "./labelPlacer";
import {
  decodeSpaceFigure,
  SpaceFigures,
  spaceDrawing,
  stillPitch,
  stillYaw,
  viewFrame,
  type NameRole,
  type SpaceDrawing,
  type SpaceFigure,
  type SpaceFrame,
  type StrokeRole,
} from "./spaceFigure";

/** The 4.1 figure as the live reply sent it: D, H and G of the box [ABCDEFGH], the line DH and the plane through G. */
const figure: SpaceFigure = {
  points: [
    { name: "D", x: 3, y: 0, z: 4 },
    { name: "H", x: 6, y: 9, z: 4 },
    { name: "G", x: 6, y: 9, z: 0 },
  ],
  edges: null,
  line: { name: null, point: [2, -3, 4], direction: [1, 3, 0], through: ["D", "H"], step: null },
  plane: { name: null, normal: [1, 3, 0], point: [6, 9, 0], through: ["G"], step: null },
};

const frames = [viewFrame(420, 365), viewFrame(190, 165), viewFrame(175, 152)];

/** A name's size as SF Pro sets it, near enough: 0.62 em a letter, 1.2 em a line. */
const measure = (frame: SpaceFrame) => (text: string, role: NameRole) => {
  const size = frame.textSize * (role === "origin" ? 0.86 : 1);
  return { width: [...text].length * 0.62 * size + 1, height: 1.2 * size };
};

const draw = (checked: SpaceFigure, frame: SpaceFrame, yaw = stillYaw, pitch = stillPitch) =>
  spaceDrawing(checked, yaw, pitch, frame, measure(frame));

const nameOf = (drawing: SpaceDrawing, text: string) => drawing.names.find((name) => name.text === text) ?? null;
const dotOf = (drawing: SpaceDrawing, text: string) => drawing.dots.find((dot) => dot.name === text)?.at ?? null;
const length = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function distance(p: Point, stroke: { from: Point; to: Point }): number {
  const dx = stroke.to.x - stroke.from.x;
  const dy = stroke.to.y - stroke.from.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - stroke.from.x) * dx + (p.y - stroke.from.y) * dy) / Math.max(dx * dx + dy * dy, 1e-12)),
  );
  return length(p, { x: stroke.from.x + dx * t, y: stroke.from.y + dy * t });
}

function expectClear(drawing: SpaceDrawing, frame: SpaceFrame, turn: string, crossing: StrokeRole[] = []) {
  const dotSize = 0.5 * frame.textSize;
  drawing.names.forEach((name, index) => {
    expect(
      name.box.minX >= 0 && name.box.maxX <= frame.width && name.box.minY >= 0 && name.box.maxY <= frame.height,
      `${name.text} is cut off at ${turn}`,
    ).toBe(true);
    for (const other of drawing.names.slice(index + 1))
      expect(name.box.intersects(other.box), `${name.text} overlaps ${other.text} at ${turn}`).toBe(false);
    for (const dot of drawing.dots) {
      if (dot.name === name.text) continue;
      expect(
        name.box.intersects(Rect.centred(dot.at.x, dot.at.y, dotSize, dotSize)),
        `${name.text} covers ${dot.name} at ${turn}`,
      ).toBe(false);
    }
    const struck = drawing.strokes.filter(
      (s) => !crossing.includes(s.role) && name.box.crosses([s.from.x, s.from.y], [s.to.x, s.to.y]),
    );
    expect(
      struck.map((s) => s.role),
      `${name.text} is struck at ${turn}`,
    ).toEqual([]);
  });
}

describe("SpaceFigure drawing", () => {
  const checked = SpaceFigures.validated(figure)!;

  test("every vertex is named beside its dot, once", () => {
    for (const frame of frames) {
      const drawing = draw(checked, frame);
      expect(drawing.dots.map((dot) => dot.name).sort()).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
      for (const name of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
        const named = drawing.names.filter((entry) => entry.text === name);
        expect(named.length, `${name} is named ${named.length} times`).toBe(1);
        expect(named[0]!.box.distance(dotOf(drawing, name)!)).toBeLessThanOrEqual(frame.textSize);
      }
      expect(drawing.names.filter((entry) => entry.text === "O").length).toBe(1);
      expect(nameOf(drawing, "DH")).not.toBeNull();
    }
  });

  test("no name covers another, a dot or a line", () => {
    for (const frame of frames) expectClear(draw(checked, frame), frame, "the still turn");
  });

  test("every name stays by its dot and clear at any turn", () => {
    for (const frame of frames) {
      for (let yaw = 0.05; yaw <= 0.95 + 1e-9; yaw += 0.1) {
        for (let pitch = 0.12; pitch <= 0.75 + 1e-9; pitch += 0.09) {
          const drawing = draw(checked, frame, yaw, pitch);
          const turn = `yaw ${yaw.toFixed(2)}, pitch ${pitch.toFixed(2)}, width ${frame.width}`;
          expectClear(drawing, frame, turn, ["axis", "plane", "frame"]);
          for (const dot of drawing.dots) {
            const box = nameOf(drawing, dot.name)?.box;
            if (box)
              expect(box.distance(dot.at), `${dot.name} strays from its dot at ${turn}`).toBeLessThanOrEqual(
                2 * frame.textSize,
              );
          }
        }
      }
    }
  });

  test("the origin is named beside A", () => {
    for (const frame of frames) {
      const drawing = draw(checked, frame);
      const origin = nameOf(drawing, "O")!;
      const a = dotOf(drawing, "A")!;
      expect(origin.box.distance(a)).toBeLessThanOrEqual(frame.textSize * 1.5);
      for (const dot of drawing.dots)
        if (dot.name !== "A")
          expect(origin.box.distance(dot.at), `O is nearer ${dot.name} than A`).toBeGreaterThan(origin.box.distance(a));
    }
  });

  test("the line stops short of a corner it misses", () => {
    for (const frame of frames) {
      const drawing = draw(checked, frame);
      const line = drawing.strokes.find((s) => s.role === "line")!;
      const d = dotOf(drawing, "D")!;
      const h = dotOf(drawing, "H")!;
      expect(distance(d, line)).toBeLessThan(0.5);
      expect(distance(h, line)).toBeLessThan(0.5);
      for (const dot of drawing.dots)
        if (!["D", "H"].includes(dot.name))
          expect(distance(dot.at, line), `the line runs into ${dot.name}`).toBeGreaterThanOrEqual(frame.textSize);
      expect(length(line.from, line.to)).toBeGreaterThan(length(d, h) + 4);
    }
  });

  test("every labelled vertex lies on three edges", () => {
    const frame: SpaceFrame = { width: 10, height: 6, yUp: true, textSize: 14 / 46, axes: true };
    const drawing = draw(checked, frame);
    const edges = drawing.strokes.filter((s) => s.role === "edge" || s.role === "frame");
    for (const name of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
      const dot = dotOf(drawing, name)!;
      expect(
        edges.filter((edge) => distance(dot, edge) < 0.28).length,
        `${name} lies on too few edges`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("SpaceFigure checks", () => {
  const pyramid = `{"points": [{"name": "A", "x": 2, "y": 0, "z": 0}, {"name": "B", "x": 2, "y": 2, "z": 0}, {"name": "C", "x": 0, "y": 2, "z": 0},
              {"name": "D", "x": 0, "y": 0, "z": 0}, {"name": "V", "x": 1, "y": 1, "z": 3}],
   "edges": ["AB", "BC", "CD", "DA", "VA", "VB", "VC", "VD"],
   "line": {"name": "r", "point": [0, 2, 0], "direction": [3, 0, 1], "through": ["C"], "step": null},
   "plane": {"name": "α", "normal": [3, 0, 1], "point": [2, 0, 0], "through": ["A", "B", "V"], "step": null}}`;

  test("a solid's edges come from its name", () => {
    const decoded = { ...decodeSpaceFigure(JSON.parse(pyramid))!, edges: null };
    expect(
      SpaceFigures.inferringEdges(decoded, "Considere a pirâmide quadrangular [ABCDV], com A(2, 0, 0)").edges,
    ).toEqual(["AB", "BC", "CD", "DA", "VA", "VB", "VC", "VD"]);
    const corners: [string, number, number, number][] = [
      ["A", 2, 0, 0],
      ["B", 2, 2, 0],
      ["C", 0, 2, 0],
      ["D", 0, 0, 0],
      ["E", 2, 0, 2],
      ["F", 2, 2, 2],
      ["G", 0, 2, 2],
      ["H", 0, 0, 2],
    ];
    const cube: SpaceFigure = {
      points: corners.map(([name, x, y, z]) => ({ name, x, y, z })),
      edges: null,
      line: null,
      plane: null,
    };
    expect(SpaceFigures.inferringEdges(cube, "Considere o cubo [ABCDEFGH]").edges?.length).toBe(12);
    expect(SpaceFigures.inferringEdges(decoded, "Os pontos A, B e V").edges).toBeNull();
  });

  test("a plane that misses a point it names, or a line that misses its points, is not drawn", () => {
    const decoded = decodeSpaceFigure(JSON.parse(pyramid))!;
    const kept = SpaceFigures.validated(decoded)!;
    expect(kept.plane).not.toBeNull();
    expect(kept.line).not.toBeNull();
    const wrongPlane = SpaceFigures.validated({ ...decoded, plane: { ...decoded.plane!, normal: [1, 0, 0] } })!;
    expect(wrongPlane.plane).toBeNull();
    const wrongLine = SpaceFigures.validated({ ...decoded, line: { ...decoded.line!, point: [5, 5, 5] } })!;
    expect(wrongLine.line).toBeNull();
  });

  test("the box is completed from three corners and the line through D and H", () => {
    const checked = SpaceFigures.validated(figure)!;
    const corner = (name: string) => checked.points.find((point) => point.name === name)!;
    // B on Oy, A on Ox; the box's three edges at right angles.
    expect(corner("B").x).toBeCloseTo(0, 6);
    expect(corner("B").z).toBeCloseTo(0, 6);
    expect(corner("A").y).toBeCloseTo(0, 6);
    expect(corner("A").z).toBeCloseTo(0, 6);
    expect(checked.edges?.length).toBe(12);
  });
});
