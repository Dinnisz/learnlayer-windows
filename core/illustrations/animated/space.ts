// Port of the vectors and planes in space and the solids of LearnLayer/Illustrations/PremadeFigureBatch3Math.swift @
// ref 2026-11-04: two vectors in the cabinet projection Portuguese exams use, with their sum, cross or dot product; a
// plane ax + by + cz = d with its normal and its distance from the origin; and the solids an exam asks for (prism,
// pyramid, cylinder, cone, sphere) with their measures, volume and total area. Every number is worked out by the app.

import type { IllustrationParameter } from "../illustration";
import { Vector3 } from "../spaceFigure";
import { Anim, FigureCanvas, Params, slider, type AnimatedIllustration } from "./figureCanvas";
import { Teach } from "./heating";
import { growingArrow } from "./mechanics";
import { growingLine, type Point } from "./optics";

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

// MARK: Vectors and planes in space

/** Cabinet projection as Portuguese exams draw it: Ox towards the viewer (down and to the left, foreshortened), Oy to the right, Oz up. */
export const CabinetProjection = {
  depth: 0.35,
  project(v: Vector3): Point {
    return { x: v.y - CabinetProjection.depth * v.x, y: v.z - CabinetProjection.depth * v.x };
  },
};

/** Space points laid out in a box of the 10 × 6 world, with equal units on both screen axes. */
export class SpaceStage {
  readonly scale: number;
  private readonly offset: Point;

  constructor(points: Vector3[], minX = 0.9, maxX = 9.1, minY = 1.0, maxY = 5.0) {
    const projected = points.map(CabinetProjection.project);
    const xs = projected.map((p) => p.x);
    const ys = projected.map((p) => p.y);
    const low = { x: Math.min(...xs), y: Math.min(...ys) };
    const high = { x: Math.max(...xs), y: Math.max(...ys) };
    const spanX = Math.max(high.x - low.x, 1e-6);
    const spanY = Math.max(high.y - low.y, 1e-6);
    this.scale = Math.min((maxX - minX) / spanX, (maxY - minY) / spanY);
    this.offset = {
      x: (minX + maxX) / 2 - (this.scale * (low.x + high.x)) / 2,
      y: (minY + maxY) / 2 - (this.scale * (low.y + high.y)) / 2,
    };
  }

  map(v: Vector3): Point {
    const p = CabinetProjection.project(v);
    return { x: this.offset.x + this.scale * p.x, y: this.offset.y + this.scale * p.y };
  }

  /** A direction (no origin) as a screen vector. */
  direction(v: Vector3): Point {
    const p = CabinetProjection.project(v);
    return { x: this.scale * p.x, y: this.scale * p.y };
  }
}

/** A vector given as `u: [x, y, z]` or as `ux`, `uy`, `uz` (the sliders write the flat form). */
export function vector3Param(params: Params, name: string): Vector3 | null {
  const flat = ["x", "y", "z"].map((axis) => params.number(name + axis));
  if (flat.every((v) => v !== null)) return new Vector3(flat[0]!, flat[1]!, flat[2]!);
  const vector = Vector3.from(params.numbers(name));
  // A slider moves one component: the others stay as the array has them.
  if (vector) return new Vector3(flat[0] ?? vector.x, flat[1] ?? vector.y, flat[2] ?? vector.z);
  return null;
}

/** The equation ax + by + cz = d, written the way an exam does. */
export function planeEquation(a: number, b: number, c: number, d: number, number: (value: number) => string): string {
  let text = "";
  for (const [coefficient, name] of [
    [a, "x"],
    [b, "y"],
    [c, "z"],
  ] as const) {
    if (!(Math.abs(coefficient) > 1e-12)) continue;
    const size = Math.abs(Math.abs(coefficient) - 1) < 1e-12 ? "" : number(Math.abs(coefficient));
    if (text === "") text = (coefficient < 0 ? "−" : "") + size + name;
    else text += (coefficient < 0 ? " − " : " + ") + size + name;
  }
  return text + " = " + number(d);
}

/** The three axes with their names, from a short stub behind the origin to `extent`. */
function drawSpaceAxes(canvas: FigureCanvas, stage: SpaceStage, extent: number): void {
  const origin = stage.map(new Vector3(0, 0, 0));
  for (const [direction, name] of [
    [new Vector3(1, 0, 0), "x"],
    [new Vector3(0, 1, 0), "y"],
    [new Vector3(0, 0, 1), "z"],
  ] as const) {
    const tail = stage.map(direction.times(-0.25 * extent));
    const tip = stage.map(direction.times(extent));
    canvas.line(tail.x, tail.y, origin.x, origin.y, { color: "muted" });
    canvas.arrow(origin.x, origin.y, tip.x, tip.y, { color: "muted" });
    canvas.label(name, tip.x + 0.18, tip.y + 0.08, { anchor: "leading", color: "white" });
  }
}

const vectorText = (v: Vector3, canvas: FigureCanvas) =>
  "(" + canvas.list([v.x, v.y, v.z].map((c) => canvas.number(c))) + ")";
const largest = (v: Vector3) => Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z));
const axisPoints = (extent: number) => [
  new Vector3(extent, 0, 0),
  new Vector3(0, extent, 0),
  new Vector3(0, 0, extent),
  new Vector3(-0.25 * extent, 0, 0),
  new Vector3(0, -0.25 * extent, 0),
  new Vector3(0, 0, -0.25 * extent),
];

function spaceVectors(params: Params, title: string, language: string): AnimatedIllustration | null {
  const operation = params.text("operation") ?? "cross";
  const u = vector3Param(params, "u");
  const v = vector3Param(params, "v");
  if (!["sum", "cross", "dot"].includes(operation) || !u || !v) return null;
  if (![u, v].every((w) => w.length > 1e-9 && largest(w) <= 1e3)) return null;
  const cross = u.cross(v);
  const sum = u.plus(v);
  const parallel = cross.length < 1e-9 * Math.max(1, u.length * v.length);
  let points = [u, v, sum, new Vector3(0, 0, 0)];
  if (operation === "cross" && !parallel) points.push(cross);
  const extent = Math.max(Math.max(...points.map(largest)), 1) * 1.15;
  points = [...points, ...axisPoints(extent)];
  const stage = new SpaceStage(points);
  const canvas = new FigureCanvas(language);
  const origin = stage.map(new Vector3(0, 0, 0));
  const n = (value: number) => canvas.number(value);

  // Words first, so that nothing else takes their place.
  const steps = 4;
  const last = Anim.after(Teach.start(3));
  if (operation === "sum") {
    canvas.caption(`u + v = ${vectorText(u, canvas)} + ${vectorText(v, canvas)} = ${vectorText(sum, canvas)}`, {
      row: 0,
      color: "white",
      visible: last,
    });
    canvas.caption(
      canvas.say(
        "Soma de vetores: regra do paralelogramo, componente a componente",
        "Vector sum: parallelogram rule, component by component",
      ),
      { row: 1, color: "white", visible: last },
    );
  } else if (operation === "cross") {
    canvas.caption(`u × v = ${vectorText(cross, canvas)}`, { row: 0, color: "white", visible: last });
    const area = n(cross.length);
    const note = parallel
      ? canvas.say("u ∥ v: o produto vetorial é o vetor nulo", "u ∥ v: the cross product is the zero vector")
      : canvas.say(
          `u × v ⊥ u e v · |u × v| = |u||v| sin θ = área do paralelogramo = ${area}`,
          `u × v ⊥ u and v · |u × v| = |u||v| sin θ = parallelogram area = ${area}`,
        );
    canvas.caption(note, { row: 1, color: "white", visible: last });
  } else {
    const product = u.dot(v);
    canvas.caption(`u · v = ${n(u.x)}·${n(v.x)} + ${n(u.y)}·${n(v.y)} + ${n(u.z)}·${n(v.z)} = ${n(product)}`, {
      row: 0,
      color: "white",
      visible: last,
    });
    const cosine = product / (u.length * v.length);
    const angle = (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
    canvas.caption(`cos θ = u·v / (|u||v|) = ${canvas.number(cosine, 3)}  ⇒  θ = ${canvas.number(angle, 4)}°`, {
      row: 1,
      color: "accent",
      visible: last,
    });
  }
  drawSpaceAxes(canvas, stage, extent);

  // Steps 1 and 2: the two vectors, each with the shadow it casts on the xy plane.
  for (const [index, vector, name, color] of [
    [0, u, "u", "accent"],
    [1, v, "v", "second"],
  ] as const) {
    const start = Teach.start(index);
    const tip = stage.map(vector);
    const foot = stage.map(new Vector3(vector.x, vector.y, 0));
    growingArrow(canvas, origin, tip, start, color);
    if (Math.abs(vector.z) > 1e-9 || Math.abs(vector.x) + Math.abs(vector.y) > 1e-9) {
      const shown = Anim.after(start + 0.8);
      canvas.line(tip.x, tip.y, foot.x, foot.y, { color: "muted", dashed: true, visible: shown });
      canvas.line(foot.x, foot.y, origin.x, origin.y, { color: "muted", dashed: true, visible: shown });
    }
    canvas.labelBeside(name, tip.x, tip.y, { color, visible: Anim.after(start + 0.8) });
  }

  // Step 3: the result.
  const start = Teach.start(2);
  const uTip = stage.map(u);
  const vTip = stage.map(v);
  const sumTip = stage.map(sum);
  if (operation === "sum") {
    growingLine(canvas, vTip, sumTip, start, start + 0.8, { color: "accent", dashed: true });
    growingLine(canvas, uTip, sumTip, start, start + 0.8, { color: "second", dashed: true });
    growingArrow(canvas, origin, sumTip, Teach.start(3), "white");
    canvas.labelBeside("u + v", sumTip.x, sumTip.y, { color: "white", visible: Anim.after(Teach.start(3) + 0.8) });
  } else if (operation === "cross") {
    growingLine(canvas, vTip, sumTip, start, start + 0.8, { color: "muted", dashed: true });
    growingLine(canvas, uTip, sumTip, start, start + 0.8, { color: "muted", dashed: true });
    if (!parallel) {
      const tip = stage.map(cross);
      growingArrow(canvas, origin, tip, Teach.start(3), "white");
      canvas.labelBeside("u × v", tip.x, tip.y, { color: "white", visible: Anim.after(Teach.start(3) + 0.8) });
    }
  } else {
    // The angle between u and v is drawn in the plane they span.
    const uHat = u.times(1 / u.length);
    const across = v.minus(uHat.times(v.dot(uHat)));
    const radius = 0.35 * Math.min(u.length, v.length);
    const theta = Math.acos(Math.max(-1, Math.min(1, u.dot(v) / (u.length * v.length))));
    if (across.length > 1e-9) {
      const wHat = across.times(1 / across.length);
      const a = stage.direction(uHat.times(radius));
      const b = stage.direction(wHat.times(radius));
      canvas.curve(
        `${Anim.n(origin.x)} + ${Anim.lit(a.x)}*cos(s) + ${Anim.lit(b.x)}*sin(s)`,
        `${Anim.n(origin.y)} + ${Anim.lit(a.y)}*cos(s) + ${Anim.lit(b.y)}*sin(s)`,
        "0",
        `${Anim.n(theta)}*${Anim.ramp(Teach.start(3), Teach.start(3) + 0.8)}`,
        { color: "white" },
      );
      canvas.reserveStrokes(
        Array.from({ length: 41 }, (_, step) => {
          const angle = (theta * step) / 40;
          return {
            x: origin.x + a.x * Math.cos(angle) + b.x * Math.sin(angle),
            y: origin.y + a.y * Math.cos(angle) + b.y * Math.sin(angle),
          };
        }),
      );
      // Out along the bisector, as far as it takes to clear the arc.
      for (const reach of [1.5, 2.0, 2.6, 3.3, 4.2]) {
        const half = stage.direction(
          uHat
            .times(Math.cos(theta / 2))
            .plus(wHat.times(Math.sin(theta / 2)))
            .times(radius * reach),
        );
        if (
          canvas.label("θ", origin.x + half.x, origin.y + half.y, {
            anchor: "center",
            color: "white",
            visible: Anim.after(Teach.start(3) + 0.5),
            avoidStrokes: true,
          })
        )
          break;
      }
    }
    growingLine(canvas, uTip, vTip, start, start + 0.8, { color: "muted", dashed: true });
  }
  canvas.recordSteps(Teach.boundaries(steps));
  const names = ["ux", "uy", "uz", "vx", "vy", "vz"];
  const values = [u.x, u.y, u.z, v.x, v.y, v.z];
  const labels = ["uₓ", "u_y", "u_z", "vₓ", "v_y", "v_z"];
  const parameters = names.map((name, index) =>
    slider(name, labels[index]!, values[index]!, Math.min(-4, values[index]!), Math.max(4, values[index]!)),
  );
  return canvas.illustration(title, Anim.duration(Teach.finish(steps) + 0.6), parameters);
}

function spacePlane(params: Params, title: string, language: string): AnimatedIllustration | null {
  const a = params.number("a");
  const b = params.number("b");
  const c = params.number("c");
  const d = params.number("d");
  if (a === null || b === null || c === null || d === null) return null;
  const normal = new Vector3(a, b, c);
  if (!(normal.length > 1e-9) || !(Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d)) <= 1e3)) return null;
  const unit = normal.times(1 / normal.length);
  const foot = unit.times(d / normal.length); // the point of the plane nearest the origin
  const distance = Math.abs(d) / normal.length;
  // Two perpendicular directions inside the plane.
  const helper = Math.abs(unit.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const e1 = unit.cross(helper).times(1 / unit.cross(helper).length);
  const e2 = unit.cross(e1);
  const extent = Math.max(3, 1.5 * distance + 1.5);
  const half = 0.5 * extent;
  const corners = [
    foot.plus(e1.times(half)).plus(e2.times(half)),
    foot.plus(e1.times(half)).minus(e2.times(half)),
    foot.minus(e1.times(half)).minus(e2.times(half)),
    foot.minus(e1.times(half)).plus(e2.times(half)),
  ];
  const arrowTip = foot.plus(unit.times(1.3));
  const stage = new SpaceStage([...corners, foot, arrowTip, new Vector3(0, 0, 0), ...axisPoints(extent)]);
  const canvas = new FigureCanvas(language);
  const origin = stage.map(new Vector3(0, 0, 0));
  // Where the plane cuts the axes inside the picture (a plane through the origin cuts them only there).
  const cuts: Vector3[] = [];
  for (const [coefficient, direction] of [
    [a, new Vector3(1, 0, 0)],
    [b, new Vector3(0, 1, 0)],
    [c, new Vector3(0, 0, 1)],
  ] as const) {
    if (!(Math.abs(coefficient) > 1e-9)) continue;
    const cut = d / coefficient;
    if (Math.abs(cut) <= extent && Math.abs(cut) > 1e-9) cuts.push(direction.times(cut));
  }
  const steps = cuts.length === 0 ? 3 : 4;
  const n = (value: number) => canvas.number(value);

  // Words first.
  const equation = planeEquation(a, b, c, d, n);
  const normalText = "n = (" + canvas.list([a, b, c].map(n)) + ")";
  canvas.caption(`π: ${equation}  ·  ${normalText} ⊥ π`, {
    row: 0,
    color: "white",
    visible: Anim.after(Teach.start(0)),
  });
  const distanceText =
    distance < 1e-9
      ? canvas.say(
          "O ∈ π: o plano passa pela origem, d(O, π) = 0",
          "O ∈ π: the plane passes through the origin, d(O, π) = 0",
        )
      : `d(O, π) = |d|/|n| = ${n(Math.abs(d))}/${n(normal.length)} = ${n(distance)}`;
  canvas.caption(distanceText, { row: 1, color: "accent", visible: Anim.after(Teach.start(2)) });
  drawSpaceAxes(canvas, stage, extent);

  // Step 1: the plane, as a patch round the point nearest the origin, with a grid.
  const patch = Teach.start(0);
  const mapped = corners.map((corner) => stage.map(corner));
  for (let index = 0; index < 4; index++)
    growingLine(canvas, mapped[index]!, mapped[(index + 1) % 4]!, patch, patch + 0.8, { color: "white" });
  for (const fraction of [-0.5, 0.0, 0.5]) {
    growingLine(
      canvas,
      stage.map(foot.plus(e1.times(half * fraction)).plus(e2.times(half))),
      stage.map(foot.plus(e1.times(half * fraction)).minus(e2.times(half))),
      patch + 0.3,
      patch + 0.9,
      { color: "muted", dashed: true },
    );
    growingLine(
      canvas,
      stage.map(foot.plus(e2.times(half * fraction)).plus(e1.times(half))),
      stage.map(foot.plus(e2.times(half * fraction)).minus(e1.times(half))),
      patch + 0.3,
      patch + 0.9,
      { color: "muted", dashed: true },
    );
  }
  // Step 2: the normal vector, perpendicular to every direction in the plane.
  const footPoint = stage.map(foot);
  const tip = stage.map(arrowTip);
  growingArrow(canvas, footPoint, tip, Teach.start(1), "second");
  canvas.labelBeside("n", tip.x, tip.y, { color: "second", visible: Anim.after(Teach.start(1) + 0.8) });
  // Step 3: the distance from the origin, along the normal.
  if (distance > 1e-9) {
    growingLine(canvas, origin, footPoint, Teach.start(2), Teach.start(2) + 0.8, { color: "accent", dashed: true });
    canvas.dot(footPoint.x, footPoint.y, { color: "accent", visible: Anim.after(Teach.start(2) + 0.8) });
  } else canvas.ring(origin.x, origin.y, 0.12, { color: "accent", visible: Anim.after(Teach.start(2)) });
  // Step 4: where the plane cuts the axes.
  for (const cut of cuts) {
    const spot = stage.map(cut);
    canvas.dot(spot.x, spot.y, { color: "white", visible: Anim.after(Teach.start(3)) });
  }
  canvas.recordSteps(Teach.boundaries(steps));
  const range = (value: number): [number, number] => {
    if (value > 0) return [Math.min(0.5, value), Math.max(3, value)];
    if (value < 0) return [Math.min(-3, value), Math.max(-0.5, value)];
    return [-3, 3];
  };
  const parameters: IllustrationParameter[] = [
    ["a", a],
    ["b", b],
    ["c", c],
  ].map(([name, value]) => {
    const [low, high] = range(value as number);
    return slider(name as string, name as string, value as number, low, high);
  });
  parameters.push(slider("d", "d", d, Math.min(-6, d), Math.max(6, d)));
  return canvas.illustration(title, Anim.duration(Teach.finish(steps) + 0.6), parameters);
}

const space3D: Compiler = (params, title, language) => {
  const mode = params.text("mode") ?? "vectors";
  if (mode === "vectors") return spaceVectors(params, title, language);
  if (mode === "plane") return spacePlane(params, title, language);
  return null;
};

// MARK: Solids

export interface SolidMeasures {
  volume: number;
  total: number;
  lateral: number | null;
  /** The slant height of a pyramid or the generatrix of a cone. */
  slant: number | null;
}

/** Volume and surface areas of the solids an exam asks for. Null when a measure is missing or not positive. */
export function solidMeasures(
  kind: string,
  a: number | null,
  b: number | null,
  h: number | null,
  r: number | null,
): SolidMeasures | null {
  const ok = (value: number | null) =>
    value !== null && Number.isFinite(value) && value > 0 && value <= 1e3 ? value : null;
  const pi = Math.PI;
  switch (kind) {
    case "prism": {
      const [x, y, z] = [ok(a), ok(b), ok(h)];
      if (x === null || y === null || z === null) return null;
      return { volume: x * y * z, total: 2 * (x * y + x * z + y * z), lateral: 2 * z * (x + y), slant: null };
    }
    case "pyramid": {
      const [x, z] = [ok(a), ok(h)];
      if (x === null || z === null) return null;
      const slant = Math.sqrt(z * z + (x * x) / 4);
      return { volume: (x * x * z) / 3, total: x * x + 2 * x * slant, lateral: 2 * x * slant, slant };
    }
    case "cylinder": {
      const [radius, z] = [ok(r), ok(h)];
      if (radius === null || z === null) return null;
      return {
        volume: pi * radius * radius * z,
        total: 2 * pi * radius * (radius + z),
        lateral: 2 * pi * radius * z,
        slant: null,
      };
    }
    case "cone": {
      const [radius, z] = [ok(r), ok(h)];
      if (radius === null || z === null) return null;
      const slant = Math.sqrt(radius * radius + z * z);
      return {
        volume: (pi * radius * radius * z) / 3,
        total: pi * radius * (radius + slant),
        lateral: pi * radius * slant,
        slant,
      };
    }
    case "sphere": {
      const radius = ok(r);
      if (radius === null) return null;
      return {
        volume: (4 * pi * radius * radius * radius) / 3,
        total: 4 * pi * radius * radius,
        lateral: null,
        slant: null,
      };
    }
    default:
      return null;
  }
}

/** Where a point of a sketch lands in the picture: one scale for both directions. */
class SketchFrame {
  readonly scale: number;
  readonly offset: Point;

  constructor(points: Point[], minX = 1.3, maxX = 8.7, minY = 1.55, maxY = 4.85) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const low = { x: Math.min(...xs), y: Math.min(...ys) };
    const high = { x: Math.max(...xs), y: Math.max(...ys) };
    this.scale = Math.min(
      (maxX - minX) / Math.max(high.x - low.x, 1e-6),
      (maxY - minY) / Math.max(high.y - low.y, 1e-6),
    );
    this.offset = {
      x: (minX + maxX) / 2 - (this.scale * (low.x + high.x)) / 2,
      y: (minY + maxY) / 2 - (this.scale * (low.y + high.y)) / 2,
    };
  }

  at(p: Point): Point {
    return { x: this.offset.x + this.scale * p.x, y: this.offset.y + this.scale * p.y };
  }
}

/** The oblique view of a box: width to the right, height up, depth going up and to the right. */
const oblique = (x: number, y: number, z: number): Point => ({ x: x + 0.45 * y, y: z + 0.3 * y });

const solids: Compiler = (params, title, language) => {
  const kind = params.text("kind") ?? "prism";
  const a = params.number("a");
  const b = params.number("b") ?? (kind === "prism" ? params.number("a") : null);
  const h = params.number("h");
  const r = params.number("r");
  const measures = solidMeasures(kind, a, b, h, r);
  if (!measures) return null;
  const canvas = new FigureCanvas(language);
  const steps = 4;
  const number = (value: number) => canvas.number(value, 4);

  // Words first.
  let volumeText: string;
  let areaText: string;
  const areaName = canvas.say("Área total: ", "Total area: ");
  switch (kind) {
    case "prism":
      volumeText = `Volume V = a·b·h = ${number(a ?? 0)}·${number(b ?? 0)}·${number(h ?? 0)} = ${number(measures.volume)}`;
      areaText = areaName + `Aₜ = 2(ab + ah + bh) = ${number(measures.total)}`;
      break;
    case "pyramid":
      volumeText = `Volume V = a²·h/3 = ${number(a ?? 0)}²·${number(h ?? 0)}/3 = ${number(measures.volume)}`;
      areaText =
        `s = √(h² + (a/2)²) = ${number(measures.slant ?? 0)} ⇒ ` + areaName + `a² + 2as = ${number(measures.total)}`;
      break;
    case "cylinder":
      volumeText = `Volume V = π·r²·h = π·${number(r ?? 0)}²·${number(h ?? 0)} = ${number(measures.volume)}`;
      areaText = areaName + `Aₜ = 2πr(r + h) = ${number(measures.total)}`;
      break;
    case "cone":
      volumeText = `Volume V = π·r²·h/3 = ${number(measures.volume)}`;
      areaText =
        `g = √(r² + h²) = ${number(measures.slant ?? 0)} ⇒ ` + areaName + `πr(r + g) = ${number(measures.total)}`;
      break;
    default:
      volumeText = `Volume V = 4πr³/3 = 4π·${number(r ?? 0)}³/3 = ${number(measures.volume)}`;
      areaText = canvas.say("Área da superfície: ", "Surface area: ") + `A = 4πr² = ${number(measures.total)}`;
  }
  canvas.caption(volumeText, { row: 0, color: "white", visible: Anim.after(Teach.start(2)) });
  canvas.caption(areaText, { row: 1, color: "accent", visible: Anim.after(Teach.start(3)) });

  const shape = Teach.start(0);
  const shapeEnd = shape + 0.9;
  const measured = Anim.after(Teach.start(1));
  const edge = (p: Point, q: Point, hidden = false) =>
    growingLine(canvas, p, q, shape, shapeEnd, { color: hidden ? "muted" : "white", dashed: hidden });
  const helper = (p: Point, q: Point, color = "second") =>
    canvas.line(p.x, p.y, q.x, q.y, { color, dashed: true, visible: measured });
  const arcCurve = (
    centre: Point,
    rx: number,
    ry: number,
    from: number,
    to: number,
    hidden: boolean,
    start: number,
  ) => {
    const sweep = Anim.ramp(start, start + 0.9);
    canvas.reserveStrokes(
      Array.from({ length: 61 }, (_, step) => {
        const angle = from + ((to - from) * step) / 60;
        return { x: centre.x + rx * Math.cos(angle), y: centre.y + ry * Math.sin(angle) };
      }),
    );
    canvas.curve(
      `${Anim.n(centre.x)} + ${Anim.n(rx)}*cos(s)`,
      `${Anim.n(centre.y)} + ${Anim.n(ry)}*sin(s)`,
      Anim.n(from),
      `${Anim.n(from)} + ${Anim.lit(to - from)}*${sweep}`,
      { color: hidden ? "muted" : "white", dashed: hidden },
    );
  };
  // At the chosen spot when no drawn stroke is there, else beside it.
  const name = (text: string, p: Point, color = "second", instead: Point[] = []) => {
    for (const spot of [p, ...instead])
      if (canvas.label(text, spot.x, spot.y, { anchor: "center", color, visible: measured, avoidStrokes: true }))
        return;
    canvas.labelBeside(text, p.x, p.y, { color, visible: measured });
  };
  const pi = Math.PI;

  if (kind === "prism" || kind === "pyramid") {
    const width = a ?? 1;
    const depth = kind === "prism" ? (b ?? 1) : (a ?? 1);
    const height = h ?? 1;
    const corners = [
      oblique(0, 0, 0),
      oblique(width, 0, 0),
      oblique(width, 0, height),
      oblique(0, 0, height),
      oblique(0, depth, 0),
      oblique(width, depth, 0),
      oblique(width, depth, height),
      oblique(0, depth, height),
    ];
    const apex = oblique(width / 2, depth / 2, height);
    if (kind === "pyramid") corners.push(apex);
    const frame = new SketchFrame(corners);
    const v = corners.map((corner) => frame.at(corner));
    if (kind === "prism") {
      for (const [from, to] of [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [3, 7],
        [2, 6],
        [7, 6],
        [1, 5],
        [5, 6],
      ] as const)
        edge(v[from]!, v[to]!);
      for (const [from, to] of [
        [0, 4],
        [4, 5],
        [4, 7],
      ] as const)
        edge(v[from]!, v[to]!, true);
      name("a", { x: (v[0]!.x + v[1]!.x) / 2, y: v[0]!.y - 0.3 }, "accent");
      name("h", { x: v[0]!.x - 0.25, y: (v[0]!.y + v[3]!.y) / 2 }, "accent");
      name("b", { x: (v[1]!.x + v[5]!.x) / 2 + 0.25, y: (v[1]!.y + v[5]!.y) / 2 - 0.12 }, "accent");
    } else {
      const top = frame.at(apex);
      for (const [from, to] of [
        [0, 1],
        [1, 5],
      ] as const)
        edge(v[from]!, v[to]!);
      for (const [from, to] of [
        [0, 4],
        [4, 5],
      ] as const)
        edge(v[from]!, v[to]!, true);
      for (const index of [0, 1, 5]) edge(v[index]!, top);
      edge(v[4]!, top, true);
      // The height drops from the apex to the centre of the base; the slant height to the middle of a base edge.
      const centre = frame.at(oblique(width / 2, depth / 2, 0));
      const middle = frame.at(oblique(width / 2, 0, 0));
      helper(top, centre);
      helper(top, middle, "accent");
      canvas.dot(centre.x, centre.y, { color: "second", visible: measured });
      name("h", { x: top.x + 0.2, y: (top.y + centre.y) / 2 + 0.15 });
      name("s", { x: (top.x + middle.x) / 2 - 0.22, y: (top.y + middle.y) / 2 - 0.05 }, "accent");
      name("a", { x: (v[0]!.x + v[1]!.x) / 2, y: v[0]!.y - 0.3 }, "accent");
    }
  } else if (kind === "cylinder" || kind === "cone") {
    const radius = r ?? 1;
    const height = h ?? 1;
    const squash = 0.3;
    const apex = { x: 0, y: height };
    const lid = kind === "cylinder" ? height : 0;
    const key = [
      { x: -radius, y: -squash * radius },
      { x: radius, y: squash * radius + lid },
      { x: radius, y: -squash * radius },
      { x: -radius, y: lid + squash * radius },
      apex,
    ];
    const frame = new SketchFrame(key);
    const bottom = frame.at({ x: 0, y: 0 });
    const up = frame.at(apex);
    const rx = frame.scale * radius;
    const ry = frame.scale * squash * radius;
    // Base: its front half is seen, its back half is hidden.
    arcCurve(bottom, rx, ry, pi, 2 * pi, false, shape);
    arcCurve(bottom, rx, ry, 0, pi, true, shape);
    if (kind === "cylinder") {
      arcCurve(up, rx, ry, 0, 2 * pi, false, shape);
      edge({ x: bottom.x - rx, y: bottom.y }, { x: up.x - rx, y: up.y });
      edge({ x: bottom.x + rx, y: bottom.y }, { x: up.x + rx, y: up.y });
      helper(up, { x: up.x + rx, y: up.y });
      helper(up, bottom, "accent");
      name("r", { x: up.x + rx / 2, y: up.y + 0.32 }, "second", [{ x: up.x + rx + 0.25, y: up.y }]);
      name("h", { x: bottom.x - 0.25, y: (bottom.y + up.y) / 2 }, "accent");
      canvas.dot(up.x, up.y, { color: "second", visible: measured });
    } else {
      edge({ x: bottom.x - rx, y: bottom.y }, up);
      edge({ x: bottom.x + rx, y: bottom.y }, up);
      helper(up, bottom, "accent");
      helper(bottom, { x: bottom.x + rx, y: bottom.y });
      canvas.dot(bottom.x, bottom.y, { color: "second", visible: measured });
      name("h", { x: bottom.x - 0.25, y: (bottom.y + up.y) / 2 }, "accent");
      name("r", { x: bottom.x + rx / 2, y: bottom.y - 0.32 }, "second", [{ x: bottom.x + rx + 0.25, y: bottom.y }]);
      name("g", { x: (bottom.x + rx + up.x) / 2 + 0.25, y: (bottom.y + up.y) / 2 + 0.05 }, "white");
    }
  } else {
    const radius = r ?? 1;
    const frame = new SketchFrame(
      [
        { x: -radius, y: -radius },
        { x: radius, y: radius },
      ],
      3.2,
      6.8,
    );
    const centre = frame.at({ x: 0, y: 0 });
    const size = frame.scale * radius;
    arcCurve(centre, size, size, 0, 2 * pi, false, shape);
    arcCurve(centre, size, 0.3 * size, pi, 2 * pi, false, shape);
    arcCurve(centre, size, 0.3 * size, 0, pi, true, shape);
    helper(centre, { x: centre.x + size, y: centre.y });
    canvas.dot(centre.x, centre.y, { color: "second", visible: measured });
    name("r", { x: centre.x + size / 2, y: centre.y + 0.32 });
  }
  canvas.recordSteps(Teach.boundaries(steps));
  const parameters: IllustrationParameter[] = [];
  const add = (key: string, value: number | null) => {
    if (value !== null) parameters.push(slider(key, key, value, Math.min(1, value), Math.max(6, value)));
  };
  if (kind === "prism") {
    add("a", a);
    add("b", b);
    add("h", h);
  } else if (kind === "pyramid") {
    add("a", a);
    add("h", h);
  } else if (kind === "cylinder" || kind === "cone") {
    add("r", r);
    add("h", h);
  } else add("r", r);
  return canvas.illustration(title, Anim.duration(Teach.finish(steps) + 0.6), parameters);
};

/** Vectors, planes and solids of batch 3, by premade type. */
export const spaceFigures: Record<string, Compiler> = { space3D, solids };
