// Port of LearnLayer/Illustrations/PremadeFigureAnimatedMultivariable.swift @ ref 2026-11-04: level curves (marching
// squares), the region of a double integral, cylindrical and spherical coordinates, a 2D vector field with its flow,
// and the characteristics of a first-order PDE. The Mac keeps `surface3D` and `gradientField` out of what it offers the
// model; only their numerics are here (the tests use them), and those types compile to nothing.

import { integral } from "./calculus";
import {
  Anim,
  FigureCanvas,
  Params,
  PlottedField,
  PlottedFunction,
  PremadeFrame,
  type AnimatedIllustration,
} from "./figureCanvas";
import { Premade } from "../premadeFigure";
import { pretty } from "./series";

export interface Point {
  x: number;
  y: number;
}
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface VectorSample {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** Swift's `.rounded()`: half away from zero. */
const swiftRound = (value: number) => Math.sign(value) * Math.round(Math.abs(value));

/** A view of space on the page: turn about the z axis, then tilt towards the viewer. */
export class Projection3D {
  constructor(
    readonly azimuth: number,
    readonly elevation: number,
  ) {}

  /** Page coordinates (right, up) of a point of space. */
  project(x: number, y: number, z: number): Point {
    const across = x * Math.cos(this.azimuth) - y * Math.sin(this.azimuth);
    const depth = x * Math.sin(this.azimuth) + y * Math.cos(this.azimuth);
    return { x: across, y: z * Math.cos(this.elevation) + depth * Math.sin(this.elevation) };
  }
}

/** Where something that walks the world-space `points` is at time t: it leaves the first at `start` and reaches the
 * last `duration` seconds later, at an even pace per leg. */
export function walk(points: Point[], start: number, duration: number): { x: string; y: string } {
  const first = points[0];
  if (!first) return { x: "0", y: "0" };
  let x = Anim.n(first.x);
  let y = Anim.n(first.y);
  const legs = Math.max(points.length - 1, 1);
  for (let index = 1; index < Math.max(points.length, 1); index++) {
    const begin = start + (duration * (index - 1)) / legs;
    const finish = start + (duration * index) / legs;
    const ramp = Anim.ramp(begin, finish);
    x += ` + (${Anim.n(points[index]!.x - points[index - 1]!.x)})*${ramp}`;
    y += ` + (${Anim.n(points[index]!.y - points[index - 1]!.y)})*${ramp}`;
  }
  return { x, y };
}

// MARK: Numerics

/** The line segments where f = level, by marching squares on a grid over the box. */
export function contourSegments(
  field: PlottedField,
  level: number,
  xLow: number,
  xHigh: number,
  yLow: number,
  yHigh: number,
  columns = 40,
  rows = 24,
): Segment[] {
  const dx = (xHigh - xLow) / columns;
  const dy = (yHigh - yLow) / rows;
  const values: number[][] = [];
  for (let i = 0; i <= columns; i++) {
    const column: number[] = [];
    for (let j = 0; j <= rows; j++) column.push(field.value(xLow + dx * i, yLow + dy * j));
    values.push(column);
  }
  const crossing = (x1: number, y1: number, v1: number, x2: number, y2: number, v2: number): Point => {
    const t = (level - v1) / (v2 - v1);
    return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
  };
  const segments: Segment[] = [];
  for (let i = 0; i < columns; i++)
    for (let j = 0; j < rows; j++) {
      const v00 = values[i]![j]!;
      const v10 = values[i + 1]![j]!;
      const v11 = values[i + 1]![j + 1]!;
      const v01 = values[i]![j + 1]!;
      if (![v00, v10, v11, v01].every(Number.isFinite)) continue;
      const x0 = xLow + dx * i;
      const y0 = yLow + dy * j;
      const x1 = x0 + dx;
      const y1 = y0 + dy;
      // Edges: 0 bottom, 1 right, 2 top, 3 left.
      const edge: (Point | null)[] = [null, null, null, null];
      if (v00 >= level !== v10 >= level) edge[0] = crossing(x0, y0, v00, x1, y0, v10);
      if (v10 >= level !== v11 >= level) edge[1] = crossing(x1, y0, v10, x1, y1, v11);
      if (v01 >= level !== v11 >= level) edge[2] = crossing(x0, y1, v01, x1, y1, v11);
      if (v00 >= level !== v01 >= level) edge[3] = crossing(x0, y0, v00, x0, y1, v01);
      const present = [0, 1, 2, 3].filter((index) => edge[index] !== null);
      const join = (a: number, b: number) => {
        const p = edge[a];
        const q = edge[b];
        if (p && q) segments.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y });
      };
      if (present.length === 2) join(present[0]!, present[1]!);
      else if (present.length === 4) {
        const centreHigh = (v00 + v10 + v11 + v01) / 4 >= level;
        if (centreHigh === v00 >= level) {
          join(0, 1);
          join(2, 3);
        } else {
          join(0, 3);
          join(1, 2);
        }
      }
    }
  return segments;
}

/** ∇f at (x, y) by central differences. */
export function gradient(field: PlottedField, x: number, y: number): Point | null {
  const hx = 1e-5 * Math.max(1, Math.abs(x));
  const hy = 1e-5 * Math.max(1, Math.abs(y));
  const gx = (field.value(x + hx, y) - field.value(x - hx, y)) / (2 * hx);
  const gy = (field.value(x, y + hy) - field.value(x, y - hy)) / (2 * hy);
  if (!Number.isFinite(gx) || !Number.isFinite(gy)) return null;
  return { x: swiftRound(gx * 1e6) / 1e6, y: swiftRound(gy * 1e6) / 1e6 };
}

/** Steps of fixed length uphill, from `start`, while inside the box and still climbing. */
export function gradientAscent(
  field: PlottedField,
  start: Point,
  length: number,
  steps: number,
  xLow: number,
  xHigh: number,
  yLow: number,
  yHigh: number,
): Point[] {
  const path = [start];
  for (let i = 0; i < steps; i++) {
    const last = path[path.length - 1]!;
    const slope = gradient(field, last.x, last.y);
    if (!slope) break;
    const size = Math.hypot(slope.x, slope.y);
    if (!(size > 1e-6)) break;
    const next = { x: last.x + (slope.x / size) * length, y: last.y + (slope.y / size) * length };
    if (next.x < xLow || next.x > xHigh || next.y < yLow || next.y > yHigh) break;
    if (!(field.value(next.x, next.y) > field.value(last.x, last.y))) break;
    path.push(next);
  }
  return path;
}

/** The vector (P, Q) at the centres of a columns × rows grid of the box. */
export function vectorSamples(
  p: PlottedField,
  q: PlottedField,
  xLow: number,
  xHigh: number,
  yLow: number,
  yHigh: number,
  columns: number,
  rows: number,
): VectorSample[] {
  const samples: VectorSample[] = [];
  for (let column = 0; column < columns; column++)
    for (let row = 0; row < rows; row++) {
      const x = xLow + ((xHigh - xLow) * (column + 0.5)) / columns;
      const y = yLow + ((yHigh - yLow) * (row + 0.5)) / rows;
      const dx = p.value(x, y);
      const dy = q.value(x, y);
      if (Number.isFinite(dx) && Number.isFinite(dy)) samples.push({ x, y, dx, dy });
    }
  return samples;
}

/** A path along the field, in steps of fixed length, kept inside the box (Runge–Kutta on the unit direction). */
export function flowPath(
  p: PlottedField,
  q: PlottedField,
  start: Point,
  length: number,
  steps: number,
  xLow: number,
  xHigh: number,
  yLow: number,
  yHigh: number,
): Point[] {
  const direction = (x: number, y: number): Point | null => {
    const dx = p.value(x, y);
    const dy = q.value(x, y);
    const size = Math.hypot(dx, dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !(size > 1e-9)) return null;
    return { x: dx / size, y: dy / size };
  };
  const path = [start];
  for (let i = 0; i < steps; i++) {
    const last = path[path.length - 1]!;
    const k1 = direction(last.x, last.y);
    const k2 = k1 && direction(last.x + (length / 2) * k1.x, last.y + (length / 2) * k1.y);
    const k3 = k2 && direction(last.x + (length / 2) * k2.x, last.y + (length / 2) * k2.y);
    const k4 = k3 && direction(last.x + length * k3.x, last.y + length * k3.y);
    if (!k1 || !k2 || !k3 || !k4) break;
    const next = {
      x: last.x + (length / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
      y: last.y + (length / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
    };
    if (next.x < xLow || next.x > xHigh || next.y < yLow || next.y > yHigh) break;
    path.push(next);
  }
  return path;
}

/** ∬ f dA over {a ≤ x ≤ b, lower(x) ≤ y ≤ upper(x)} by Simpson's rule in each direction. */
export function doubleIntegral(
  integrand: PlottedField,
  lower: PlottedFunction,
  upper: PlottedFunction,
  a: number,
  b: number,
  intervals = 80,
): number | null {
  const simpson = (f: (v: number) => number, from: number, to: number) => {
    const h = (to - from) / intervals;
    let total = f(from) + f(to);
    for (let index = 1; index < intervals; index++) total += f(from + h * index) * (index % 2 === 0 ? 2 : 4);
    return (total * h) / 3;
  };
  const result = simpson((x) => simpson((y) => integrand.value(x, y), lower.value(x), upper.value(x)), a, b);
  return Number.isFinite(result) ? result : null;
}

/** Heights z = f(x, y) on the (n + 1) × (n + 1) grid of the box. */
export function surfaceGrid(field: PlottedField, xLow: number, xHigh: number, yLow: number, yHigh: number, n: number) {
  return Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) =>
      field.value(xLow + ((xHigh - xLow) * i) / n, yLow + ((yHigh - yLow) * j) / n),
    ),
  );
}

export const cylindricalToCartesian = (rho: number, phi: number, z: number) => ({
  x: rho * Math.cos(phi),
  y: rho * Math.sin(phi),
  z,
});

/** ISO convention: θ is measured from the +z axis, φ round the z axis from +x. */
export const sphericalToCartesian = (r: number, theta: number, phi: number) => ({
  x: r * Math.sin(theta) * Math.cos(phi),
  y: r * Math.sin(theta) * Math.sin(phi),
  z: r * Math.cos(theta),
});

/** The segments of the characteristic lines of a·uₓ + b·u_y = 0 from (x, 0) up to y = yMax, cut at the box's sides. */
export function characteristicSegments(
  a: number,
  b: number,
  starts: number[],
  yMax: number,
  xLow: number,
  xHigh: number,
): Segment[] {
  if (!(Math.abs(b) > 1e-9)) return [];
  const slope = a / b;
  return starts.flatMap((start) => {
    let top = yMax;
    if (Math.abs(slope) > 1e-9) top = Math.min(yMax, ((slope > 0 ? xHigh : xLow) - start) / slope);
    return top > 1e-9 ? [{ x1: start, y1: 0, x2: start + slope * top, y2: top }] : [];
  });
}

/** The lowest and highest value of f over the frame's box, null when it is flat or undefined. */
export function fieldRange(field: PlottedField, frame: PremadeFrame): { low: number; high: number } | null {
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i <= 30; i++)
    for (let j = 0; j <= 20; j++) {
      const value = field.value(
        frame.xLow + ((frame.xHigh - frame.xLow) * i) / 30,
        frame.yLow + ((frame.yHigh - frame.yLow) * j) / 20,
      );
      if (Number.isFinite(value)) {
        low = Math.min(low, value);
        high = Math.max(high, value);
      }
    }
  return high - low > 1e-9 ? { low, high } : null;
}

/** Evenly picked points of a world path, at most `most` legs. */
function sampledPath(world: Point[], most: number): Point[] {
  const legs = Math.min(most, world.length - 1);
  return Array.from({ length: legs + 1 }, (_, index) => world[swiftRound((index / legs) * (world.length - 1))]!);
}

// MARK: The figures

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

const levelCurves: Compiler = (params, title, language) => {
  const field = PlottedField.make(params.text("f"));
  if (!field) return null;
  const xLow = params.number("xMin") ?? -3;
  const xHigh = params.number("xMax") ?? 3;
  const yLow = params.number("yMin") ?? -3;
  const yHigh = params.number("yMax") ?? 3;
  if (!(xLow < xHigh) || !(yLow < yHigh)) return null;
  const frame = PremadeFrame.equalScale(xLow, xHigh, yLow, yHigh);
  const range = fieldRange(field, frame);
  if (!range) return null;
  const defaults = [1, 2, 3, 4, 5].map((k) => range.low + ((range.high - range.low) * k) / 6);
  const levels = [...(params.numbers("levels") ?? defaults)];
  if (levels.length < 1 || levels.length > 6) return null;
  levels.sort((a, b) => a - b);
  const canvas = new FigureCanvas(language);
  canvas.axes(frame);
  let time = 0.6;
  const drawn: number[] = [];
  for (const level of levels) {
    const segments = contourSegments(field, level, frame.xLow, frame.xHigh, frame.yLow, frame.yHigh);
    if (segments.length === 0) continue;
    drawn.push(level);
    for (const segment of segments)
      canvas.line(frame.x(segment.x1), frame.y(segment.y1), frame.x(segment.x2), frame.y(segment.y2), {
        color: "accent",
        visible: Anim.after(time),
      });
    time += 0.8;
  }
  if (drawn.length === 0) return null;
  const separator = canvas.words.decimalComma ? "; " : ", ";
  canvas.caption("f(x, y) = " + drawn.map((level) => canvas.number(level)).join(separator), {
    row: 0,
    color: "accent",
    visible: Anim.after(0.6),
  });
  canvas.caption(
    canvas.say(`Curvas de nível de f(x, y) = ${pretty(field.text)}`, `Level curves of f(x, y) = ${pretty(field.text)}`),
    { row: 1, color: "white", visible: Anim.after(0.4) },
  );
  return canvas.illustration(title, Anim.duration(time + 0.4));
};

const doubleIntegralRegion: Compiler = (params, title, language) => {
  const lower = PlottedFunction.make(params.text("lower"));
  const upper = PlottedFunction.make(params.text("upper"));
  const a = params.number("a");
  const b = params.number("b");
  if (!lower || !upper || a === null || b === null || !(b > a)) return null;
  const values: number[] = [];
  for (let index = 0; index <= 60; index++) {
    const x = a + ((b - a) * index) / 60;
    const low = lower.value(x);
    const high = upper.value(x);
    if (!Number.isFinite(low) || !Number.isFinite(high) || !(high >= low - 1e-9)) return null;
    values.push(low, high);
  }
  const integrandText = params.text("integrand");
  const integrand = integrandText !== null ? PlottedField.make(integrandText) : null;
  if (integrandText !== null && !integrand) return null;
  const difference = PlottedFunction.make(`(${upper.replacing("x")})-(${lower.replacing("x")})`);
  const area = difference ? integral(difference, a, b) : null;
  if (area === null) return null;
  let total = area;
  if (integrand) {
    const value = doubleIntegral(integrand, lower, upper, a, b);
    if (value === null) return null;
    total = value;
  }
  const pad = (b - a) * 0.1;
  const frame = PremadeFrame.fittingValues(values, a - pad, b + pad, [...values, 0]);
  const canvas = new FigureCanvas(language);
  canvas.axes(frame);
  canvas.plot(lower, frame, a, b, { color: "white", start: 0.4, end: 1.4 });
  canvas.plot(upper, frame, a, b, { color: "white", start: 0.4, end: 1.4 });
  const strips = 40;
  const width = (b - a) / strips;
  for (let index = 0; index < strips; index++) {
    const x = a + width * (index + 0.5);
    const low = lower.value(x);
    const high = upper.value(x);
    if (!(high - low > 1e-9)) continue;
    canvas.box(frame.x(x - width / 2), frame.y(low), width * frame.kx, (high - low) * frame.ky, {
      color: "accent",
      visible: Anim.after(1.6 + (3.0 * index) / strips),
    });
  }
  const end = 4.8;
  const named = a + (b - a) * 0.7;
  canvas.labelBeside(`y = ${pretty(upper.text)}`, frame.x(named), frame.y(upper.value(named)), {
    color: "white",
    visible: Anim.after(1.4),
  });
  canvas.labelBeside(`y = ${pretty(lower.text)}`, frame.x(named), frame.y(lower.value(named)), {
    color: "white",
    visible: Anim.after(1.4),
  });
  const shown = Anim.after(end);
  if (integrand) canvas.caption(`∬ f dA = ${canvas.number(total)}`, { row: 0, color: "accent", visible: shown });
  else
    canvas.caption(`${canvas.say("Área", "Area")} = ${canvas.number(total)}`, {
      row: 0,
      color: "accent",
      visible: shown,
    });
  canvas.caption(`${canvas.number(a)} ≤ x ≤ ${canvas.number(b)},  g₁(x) ≤ y ≤ g₂(x)`, {
    row: 1,
    color: "white",
    visible: Anim.after(0.4),
  });
  return canvas.illustration(title, Anim.duration(end + 0.6));
};

const cylindricalSpherical: Compiler = (params, title, language) => {
  const system = params.text("system") ?? "cylindrical";
  if (system !== "cylindrical" && system !== "spherical") return null;
  const degrees = Math.PI / 180;
  const spherical = system === "spherical";
  let point: { x: number; y: number; z: number };
  let azimuth: number;
  if (spherical) {
    const r = params.number("r");
    const theta = params.number("theta");
    const phi = params.number("phi");
    if (r === null || !(r > 0) || theta === null || theta < 0 || theta > 180 || phi === null) return null;
    point = sphericalToCartesian(r, theta * degrees, phi * degrees);
    azimuth = phi * degrees;
  } else {
    const rho = params.number("rho");
    const phi = params.number("phi");
    const z = params.number("z");
    if (rho === null || !(rho > 0) || phi === null || z === null) return null;
    point = cylindricalToCartesian(rho, phi * degrees, z);
    azimuth = phi * degrees;
  }
  const view = new Projection3D(-0.5, 0.35);
  const reach = Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z), Math.hypot(point.x, point.y)) * 1.35;
  const k = 2.3 / Math.max(reach, 1e-9);
  const origin = { x: 4.6, y: 2.5 };
  const world = (x: number, y: number, z: number): Point => {
    const page = view.project(x, y, z);
    return { x: origin.x + page.x * k, y: origin.y + page.y * k };
  };
  const worldText = (x: string, y: string, z: string) => {
    const across = `(${x})*${Anim.n(Math.cos(view.azimuth))} - (${y})*${Anim.n(Math.sin(view.azimuth))}`;
    const depth = `(${x})*${Anim.n(Math.sin(view.azimuth))} + (${y})*${Anim.n(Math.cos(view.azimuth))}`;
    return {
      x: `${Anim.n(origin.x)} + ${Anim.n(k)}*(${across})`,
      y: `${Anim.n(origin.y)} + ${Anim.n(k)}*((${z})*${Anim.n(Math.cos(view.elevation))} + (${depth})*${Anim.n(Math.sin(view.elevation))})`,
    };
  };
  const canvas = new FigureCanvas(language);
  for (const [name, x, y, z] of [
    ["x", reach, 0, 0],
    ["y", 0, reach, 0],
    ["z", 0, 0, reach],
  ] as const) {
    const tip = world(x, y, z);
    canvas.arrow(origin.x, origin.y, tip.x, tip.y, { color: "muted" });
    canvas.label(name, tip.x + (name === "z" ? 0.2 : 0.18), tip.y + (name === "z" ? 0.1 : -0.12), {
      anchor: "leading",
      color: "white",
    });
  }
  const p = world(point.x, point.y, point.z);
  const foot = world(point.x, point.y, 0);
  const angle = azimuth;
  const planar = Math.hypot(point.x, point.y);
  // The arc of φ in the xy plane, at about 40 % of the way out.
  const arcRadius = Math.max(planar, reach * 0.25) * 0.45;
  let time = 0.6;
  const arc = (x: string, y: string, z: string, to: number, color: string, begin: number) => {
    const position = worldText(x, y, z);
    const sweep = `${Anim.n(0)} + (${Anim.n(to)})*${Anim.ramp(begin, begin + 0.8)}`;
    canvas.curve(position.x, position.y, Anim.n(0), sweep, { color });
  };
  const drawn = Anim.after(time);
  // φ: round the z axis, in the plane.
  if (Math.abs(angle) > 1e-6) {
    arc(`${Anim.n(arcRadius)}*cos(s)`, `${Anim.n(arcRadius)}*sin(s)`, "0", angle, "second", time);
    const middle = world(arcRadius * Math.cos(angle / 2), arcRadius * Math.sin(angle / 2), 0);
    canvas.labelBeside("φ", middle.x, middle.y, { color: "second", visible: Anim.after(time + 0.8) });
  }
  time += 1.0;
  const growing = (from: Point, to: Point, reachNow: string, color: string, dashed = false) =>
    canvas.line(
      from.x,
      from.y,
      `${Anim.n(from.x)} + ${Anim.n(to.x - from.x)}*${reachNow}`,
      `${Anim.n(from.y)} + ${Anim.n(to.y - from.y)}*${reachNow}`,
      { color, dashed },
    );
  if (spherical) {
    // OP, then θ between the z axis and OP.
    growing(origin, p, Anim.ramp(time, time + 0.8), "accent");
    const r = Math.hypot(planar, point.z);
    canvas.labelBeside("r", (origin.x + p.x) / 2, (origin.y + p.y) / 2, {
      color: "accent",
      visible: Anim.after(time + 0.8),
    });
    time += 1.0;
    const theta = Math.atan2(planar, point.z);
    const radiusT = r * 0.4;
    arc(
      `${Anim.n(radiusT)}*sin(s)*${Anim.n(Math.cos(angle))}`,
      `${Anim.n(radiusT)}*sin(s)*${Anim.n(Math.sin(angle))}`,
      `${Anim.n(radiusT)}*cos(s)`,
      theta,
      "second",
      time,
    );
    const mark = world(
      radiusT * Math.sin(theta / 2) * Math.cos(angle),
      radiusT * Math.sin(theta / 2) * Math.sin(angle),
      radiusT * Math.cos(theta / 2),
    );
    canvas.labelBeside("θ", mark.x, mark.y, { color: "second", visible: Anim.after(time + 0.8) });
    time += 1.0;
    const footReach = Anim.ramp(time, time + 0.8);
    growing(p, foot, footReach, "muted", true);
    growing(origin, foot, footReach, "muted", true);
    time += 1.0;
  } else {
    // ρ along the plane, then z up to P.
    growing(origin, foot, Anim.ramp(time, time + 0.8), "accent");
    canvas.labelBeside("ρ", (origin.x + foot.x) / 2, (origin.y + foot.y) / 2, {
      color: "accent",
      visible: Anim.after(time + 0.8),
    });
    time += 1.0;
    growing(foot, p, Anim.ramp(time, time + 0.8), "accent", true);
    canvas.labelBeside("z", (foot.x + p.x) / 2, (foot.y + p.y) / 2, {
      color: "accent",
      visible: Anim.after(time + 0.8),
    });
    time += 1.0;
  }
  canvas.dot(p.x, p.y, { color: "accent", visible: drawn });
  const numbers = spherical
    ? "(" +
      canvas.list([
        canvas.number(params.number("r") ?? 0),
        canvas.number(params.number("theta") ?? 0) + "°",
        canvas.number(params.number("phi") ?? 0) + "°",
      ]) +
      ")"
    : "(" +
      canvas.list([
        canvas.number(params.number("rho") ?? 0),
        canvas.number(params.number("phi") ?? 0) + "°",
        canvas.number(params.number("z") ?? 0),
      ]) +
      ")";
  canvas.labelBeside("P", p.x, p.y + 0.1, { color: "white", visible: drawn });
  canvas.caption(
    `P = ${numbers}  =  (` +
      canvas.list([canvas.number(point.x), canvas.number(point.y), canvas.number(point.z)]) +
      ")",
    { row: 0, color: "accent", visible: Anim.after(time) },
  );
  canvas.caption(spherical ? "(r, θ, φ)" : "(ρ, φ, z)", { row: 1, color: "white", visible: Anim.after(0.4) });
  return canvas.illustration(title, Anim.duration(time + 0.4));
};

const vectorField2D: Compiler = (params, title, language) => {
  const p = PlottedField.make(params.text("P"));
  const q = PlottedField.make(params.text("Q"));
  if (!p || !q) return null;
  const xLow = params.number("xMin") ?? -3;
  const xHigh = params.number("xMax") ?? 3;
  const yLow = params.number("yMin") ?? -3;
  const yHigh = params.number("yMax") ?? 3;
  if (!(xLow < xHigh) || !(yLow < yHigh)) return null;
  const frame = PremadeFrame.equalScale(xLow, xHigh, yLow, yHigh);
  const columns = 11;
  const rows = 5;
  const samples = vectorSamples(p, q, frame.xLow, frame.xHigh, frame.yLow, frame.yHigh, columns, rows);
  const strongest = Math.max(0, ...samples.map((sample) => Math.hypot(sample.dx, sample.dy)));
  if (!(strongest > 1e-9)) return null;
  const canvas = new FigureCanvas(language);
  canvas.axes(frame);
  for (const sample of samples) {
    const size = Math.hypot(sample.dx, sample.dy);
    if (!(size > 1e-9)) continue;
    const length = Math.max(0.12, (0.62 * size) / strongest);
    const ux = sample.dx * frame.kx;
    const uy = sample.dy * frame.ky;
    const norm = Math.hypot(ux, uy);
    const column = Math.floor(((sample.x - frame.xLow) / (frame.xHigh - frame.xLow)) * columns);
    canvas.arrow(
      frame.x(sample.x) - ((ux / norm) * length) / 2,
      frame.y(sample.y) - ((uy / norm) * length) / 2,
      frame.x(sample.x) + ((ux / norm) * length) / 2,
      frame.y(sample.y) + ((uy / norm) * length) / 2,
      { color: "white", visible: Anim.after(0.4 + 0.12 * column) },
    );
  }
  const end = 0.4 + 0.12 * columns;
  let seeds: Point[] = [{ x: 1, y: 0 }];
  const objects = params.objects("seeds");
  if (objects) {
    seeds = [];
    for (const object of objects) {
      const x = Premade.number(object["x"]);
      const y = Premade.number(object["y"]);
      if (x === null || y === null) return null;
      seeds.push({ x, y });
    }
  }
  if (seeds.length < 1 || seeds.length > 2) return null;
  let finish = end;
  seeds.forEach((seed, index) => {
    const path = flowPath(
      p,
      q,
      seed,
      (frame.xHigh - frame.xLow) * 0.012,
      50,
      frame.xLow,
      frame.xHigh,
      frame.yLow,
      frame.yHigh,
    );
    if (path.length <= 3) return;
    const sampled = sampledPath(
      path.map((point) => ({ x: frame.x(point.x), y: frame.y(point.y) })),
      40,
    );
    const legs = sampled.length - 1;
    const duration = 3.6;
    const color = index === 0 ? "accent" : "second";
    for (let step = 0; step < legs; step++)
      canvas.line(sampled[step]!.x, sampled[step]!.y, sampled[step + 1]!.x, sampled[step + 1]!.y, {
        color,
        visible: Anim.after(end + (duration * step) / legs),
      });
    const moving = walk(sampled, end, duration);
    canvas.dot(moving.x, moving.y, { color, visible: Anim.after(end) });
    finish = end + duration;
  });
  canvas.caption(`F = (${pretty(p.text)},  ${pretty(q.text)})`, { row: 0, color: "accent", visible: Anim.after(0.3) });
  return canvas.illustration(title, Anim.duration(finish + 0.4));
};

const characteristicsPDE: Compiler = (params, title, language) => {
  const a = params.number("a");
  const b = params.number("b");
  if (a === null || b === null || !(Math.abs(b) > 1e-9)) return null;
  const profile = PlottedFunction.make(params.text("phi") ?? "exp(-x^2)");
  if (!profile) return null;
  const xLow = params.number("xMin") ?? -3;
  const xHigh = params.number("xMax") ?? 3;
  const yMax = params.number("yMax") ?? 3;
  const count = Math.trunc(params.number("lines") ?? 7);
  if (!(xLow < xHigh) || !(yMax > 0) || count < 2 || count > 12) return null;
  const slope = a / b;
  // Left: the (x, y) plane with the characteristics. Right: u along x at y = 0 and at y₁.
  const plane = new PremadeFrame(xLow, xHigh, 0, yMax, 1.1, 4.9, 1.35, 5.0);
  const canvas = new FigureCanvas(language);
  canvas.axes(plane, { ticks: true });
  const starts = Array.from({ length: count }, (_, i) => xLow + ((xHigh - xLow) * i) / (count - 1));
  const segments = characteristicSegments(a, b, starts, yMax, xLow, xHigh);
  if (segments.length === 0) return null;
  segments.forEach((segment, index) => {
    const reach = Anim.ramp(0.5 + 0.15 * index, 2.2 + 0.15 * index);
    const x = plane.x(segment.x1);
    const y = plane.y(segment.y1);
    canvas.line(
      x,
      y,
      `${Anim.n(x)} + ${Anim.n(plane.x(segment.x2) - x)}*${reach}`,
      `${Anim.n(y)} + ${Anim.n(plane.y(segment.y2) - y)}*${reach}`,
      { color: "accent" },
    );
  });
  // The profile and where it has been carried to at y₁.
  const values: number[] = [];
  for (let index = 0; index <= 100; index++) values.push(profile.value(xLow + ((xHigh - xLow) * index) / 100));
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;
  const peak = Math.max(...finite);
  const valley = Math.min(...finite);
  // y₁ is chosen so the carried profile stays inside the box.
  const y1 = Math.abs(slope) < 1e-9 ? yMax * 0.75 : Math.min(yMax * 0.75, (0.35 * (xHigh - xLow)) / Math.abs(slope));
  const shift = slope * y1;
  const low = Math.min(valley, 0);
  const high = Math.max(peak, low + 1e-6);
  const carried = PlottedFunction.make(profile.replacing(`x - ${Anim.lit(shift)}`));
  if (!carried) return null;
  const curves = new PremadeFrame(
    xLow,
    xHigh,
    low - (high - low) * 0.1,
    high + (high - low) * 0.2,
    5.9,
    9.4,
    1.35,
    5.0,
  );
  canvas.arrow(curves.left, curves.y(0), curves.right + 0.2, curves.y(0), { color: "muted" });
  canvas.label("x", curves.right + 0.05, curves.y(0) + 0.3, { anchor: "trailing", color: "white" });
  canvas.label("u", curves.left + 0.15, curves.top - 0.1, { anchor: "leading", color: "white" });
  canvas.plot(profile, curves, xLow, xHigh, { color: "white", start: 0.5, end: 1.6 });
  canvas.plot(carried, curves, xLow, xHigh, { color: "second", start: 3.2, end: 4.6 });
  canvas.label("u(x, 0)", 6.6, 0.5, { anchor: "center", color: "white", visible: Anim.after(1.6) });
  canvas.label("u(x, y₁)", 8.5, 0.5, { anchor: "center", color: "second", visible: Anim.after(3.2) });
  canvas.caption(`u(x, y₁) = u(x − ${canvas.number(slope)}·y₁, 0)`, {
    row: 0,
    color: "second",
    visible: Anim.after(4.6),
  });
  // The carried profile's peak has moved by the same amount.
  let peakX = xLow;
  let best = -Infinity;
  for (let index = 0; index <= 200; index++) {
    const x = xLow + ((xHigh - xLow) * index) / 200;
    const value = profile.value(x);
    if (Number.isFinite(value) && value > best) {
      best = value;
      peakX = x;
    }
  }
  if (peakX + shift >= xLow && peakX + shift <= xHigh && Math.abs(shift) > 1e-6) {
    const level = curves.y(best) + 0.2;
    const reach = Anim.ramp(4.6, 5.2);
    canvas.arrow(
      curves.x(peakX),
      level,
      `${Anim.n(curves.x(peakX))} + ${Anim.n(curves.x(peakX + shift) - curves.x(peakX))}*${reach}`,
      level,
      { color: "second" },
    );
  }
  // The plane's own level y₁.
  const level = plane.y(y1);
  canvas.line(
    plane.left,
    level,
    `${Anim.n(plane.left)} + ${Anim.n(plane.right - plane.left)}*${Anim.ramp(2.6, 3.2)}`,
    level,
    {
      color: "second",
      dashed: true,
    },
  );
  canvas.label("y₁", plane.left + 0.12, level + 0.28, { anchor: "leading", color: "second", visible: Anim.after(3.2) });
  canvas.label(`${canvas.number(a)} ∂u/∂x + ${canvas.number(b)} ∂u/∂y = 0`, 3.0, 0.5, {
    anchor: "center",
    color: "accent",
    visible: Anim.after(0.4),
  });
  return canvas.illustration(title, Anim.duration(5.8));
};

/** The multivariable figures the Mac offers the model, by premade type. */
export const multivariableFigures: Record<string, Compiler> = {
  levelCurves,
  doubleIntegralRegion,
  cylindricalSpherical,
  vectorField2D,
  characteristicsPDE,
};
