// Port of LearnLayer/Illustrations/PremadeFigureElectromagnetism.swift and the fields of PremadeFigurePhysicsCore.swift
// (PlaneGeometry, FieldTracer, ElectricField, MagneticField, Lenz, CircuitSignals) @ ref 2026-11-04: field lines and
// equipotentials of point charges traced by the app, a uniform field between plates, the magnetic field of a wire, a
// loop and a solenoid, the Lorentz force, Faraday and Lenz, the RC curves and an alternating voltage.

import {
  Anim,
  FigureCanvas,
  Params,
  PlottedFunction,
  PremadeFrame,
  slider,
  type AnimatedIllustration,
} from "./figureCanvas";
import { clip, namedArrow, type Point } from "./optics";

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;
type Vector = { x: number; y: number };

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Swift's `.rounded()`: half away from zero. */
const swiftRound = (value: number) => Math.sign(value) * Math.round(Math.abs(value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const segmentLength = (s: Segment) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

// MARK: Plane geometry

const orientation = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

export const PlaneGeometry = {
  /**
   * True when the two segments cross at a point inside both. Touching ends and collinear overlaps are not crossings.
   */
  properlyCross(a: Segment, b: Segment, tolerance = 1e-9): boolean {
    const a1 = { x: a.x1, y: a.y1 };
    const a2 = { x: a.x2, y: a.y2 };
    const b1 = { x: b.x1, y: b.y1 };
    const b2 = { x: b.x2, y: b.y2 };
    const o1 = orientation(a1, a2, b1);
    const o2 = orientation(a1, a2, b2);
    const o3 = orientation(b1, b2, a1);
    const o4 = orientation(b1, b2, a2);
    if (!(Math.min(Math.abs(o1), Math.abs(o2), Math.abs(o3), Math.abs(o4)) > tolerance)) return false;
    return o1 * o2 < 0 && o3 * o4 < 0;
  },

  /** Points along the polyline at equal arc length (the last point is kept). */
  resample(points: Point[], spacing: number): Point[] {
    let last = points[0];
    if (!last) return [];
    const result: Point[] = [last];
    let carried = 0;
    for (const point of points.slice(1)) {
      let remaining = distance(last, point);
      if (!(remaining > 1e-12)) continue;
      const ux = (point.x - last.x) / remaining;
      const uy = (point.y - last.y) / remaining;
      let from = last;
      while (carried + remaining >= spacing) {
        const step = spacing - carried;
        from = { x: from.x + ux * step, y: from.y + uy * step };
        result.push(from);
        remaining -= step;
        carried = 0;
      }
      carried += remaining;
      last = point;
    }
    const end = points[points.length - 1]!;
    const tail = result[result.length - 1]!;
    if (distance(tail, end) > 1e-6) result.push(end);
    return result;
  },

  /** The point at `fraction` (0…1) of the polyline's length, with the unit direction there. */
  along(points: Point[], fraction: number): { point: Point; ux: number; uy: number } | null {
    if (points.length < 2) return null;
    let total = 0;
    for (let index = 1; index < points.length; index++) total += distance(points[index - 1]!, points[index]!);
    if (!(total > 1e-9)) return null;
    let target = total * Math.min(Math.max(fraction, 0), 1);
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1]!;
      const b = points[index]!;
      const length = distance(a, b);
      if (length > 1e-12 && (target <= length || index === points.length - 1)) {
        const t = Math.min(target / length, 1);
        return {
          point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
          ux: (b.x - a.x) / length,
          uy: (b.y - a.y) / length,
        };
      }
      target -= length;
    }
    return null;
  },
};

// MARK: Field line tracer

export interface TraceResult {
  points: Point[];
  /** The anchor the line ended on, if it stopped on one. */
  stop: number | null;
  /** The line came back to where it started. */
  closed: boolean;
}

/** Follows a vector field with a midpoint step that shrinks near the anchors (charges, wires), so lines meet a point source cleanly. */
export class FieldTracer {
  stopRadius = 0.18;
  centre: Point = { x: 5, y: 3 };
  /** The trace ends when it leaves this half-size box round `centre`. */
  half = 30;
  maxSteps = 6000;
  /** Step length as a fraction of the distance to the nearest anchor, and its floor. */
  stepScale = 0.05;
  minStep = 0.02;

  constructor(
    readonly field: (point: Point) => Vector,
    readonly anchors: Point[],
    options: { stopRadius?: number; centre?: Point; half?: number } = {},
  ) {
    if (options.stopRadius !== undefined) this.stopRadius = options.stopRadius;
    if (options.centre) this.centre = options.centre;
    if (options.half !== undefined) this.half = options.half;
  }

  private unit(vector: Vector): Vector | null {
    const size = Math.hypot(vector.x, vector.y);
    if (!Number.isFinite(size) || !(size > 1e-12)) return null;
    return { x: vector.x / size, y: vector.y / size };
  }

  trace(start: Point, forward = true, stops: number[] = []): TraceResult {
    const sign = forward ? 1 : -1;
    const points: Point[] = [start];
    let current = start;
    for (let step = 0; step < this.maxSteps; step++) {
      for (const index of stops)
        if (distance(current, this.anchors[index]!) < this.stopRadius) return { points, stop: index, closed: false };
      if (Math.abs(current.x - this.centre.x) > this.half || Math.abs(current.y - this.centre.y) > this.half)
        return { points, stop: null, closed: false };
      let near = 1;
      if (this.anchors.length > 0) near = Math.min(...this.anchors.map((anchor) => distance(current, anchor)));
      const h = Math.min(Math.max(this.stepScale * near, this.minStep), 0.4);
      const first = this.unit(this.field(current));
      if (!first) break;
      const middle = { x: current.x + (sign * first.x * h) / 2, y: current.y + (sign * first.y * h) / 2 };
      const second = this.unit(this.field(middle));
      if (!second) break;
      current = { x: current.x + sign * second.x * h, y: current.y + sign * second.y * h };
      points.push(current);
      if (step > 40 && distance(current, start) < h * 1.5) {
        points.push(start);
        return { points, stop: null, closed: true };
      }
    }
    return { points, stop: null, closed: false };
  }
}

// MARK: Electric field of point charges

export interface FieldCharge {
  x: number;
  y: number;
  q: number;
}

export interface FieldLine {
  /** In the direction of the field. */
  points: Point[];
  /** The charge the line starts on; null when it comes from far away. */
  source: number | null;
  /** The charge the line ends on; null when it leaves. */
  sink: number | null;
}

export interface EquipotentialContour {
  level: number;
  segments: Segment[];
}

const position = (charge: FieldCharge): Point => ({ x: charge.x, y: charge.y });

export const ElectricField = {
  chargeRadius: 0.18,
  /** Lines drawn for the largest charge; the others get as many as their size says. */
  linesForLargest: 8,

  /** E at `point` with k = 1. */
  vector(point: Point, charges: FieldCharge[]): Vector {
    let ex = 0;
    let ey = 0;
    for (const charge of charges) {
      const dx = point.x - charge.x;
      const dy = point.y - charge.y;
      const r2 = Math.max(dx * dx + dy * dy, 1e-6);
      const r3 = r2 * Math.sqrt(r2);
      ex += (charge.q * dx) / r3;
      ey += (charge.q * dy) / r3;
    }
    return { x: ex, y: ey };
  },

  /** V at `point` with k = 1. */
  potential(point: Point, charges: FieldCharge[]): number {
    let total = 0;
    for (const charge of charges) {
      const r = Math.max(Math.hypot(point.x - charge.x, point.y - charge.y), 1e-3);
      total += charge.q / r;
    }
    return total;
  },

  /** Lines per charge, in proportion to |q|, at least one. */
  lineCounts(charges: FieldCharge[]): number[] {
    const largest = charges.length > 0 ? Math.max(...charges.map((c) => Math.abs(c.q))) : 1;
    return charges.map((c) => Math.max(1, swiftRound((ElectricField.linesForLargest * Math.abs(c.q)) / largest)));
  },

  /**
   * The lines start on positive charges and end on negative ones; where no positive charge feeds a negative one, lines
   * come in from far away.
   */
  lines(charges: FieldCharge[], half = 30): FieldLine[] {
    const counts = ElectricField.lineCounts(charges);
    const positives = charges.flatMap((c, index) => (c.q > 0 ? [index] : []));
    const negatives = charges.flatMap((c, index) => (c.q < 0 ? [index] : []));
    const tracer = new FieldTracer((point) => ElectricField.vector(point, charges), charges.map(position), {
      stopRadius: ElectricField.chargeRadius,
      centre: { x: 5, y: 3 },
      half,
    });
    const seed = (index: number, k: number): Point => {
      const count = counts[index]!;
      const angle = Math.PI / count + (2 * Math.PI * k) / count;
      return {
        x: charges[index]!.x + ElectricField.chargeRadius * Math.cos(angle),
        y: charges[index]!.y + ElectricField.chargeRadius * Math.sin(angle),
      };
    };
    const result: FieldLine[] = [];
    for (const index of positives)
      for (let k = 0; k < counts[index]!; k++) {
        const run = tracer.trace(seed(index, k), true, negatives);
        result.push({ points: run.points, source: index, sink: run.stop });
      }
    for (const index of negatives)
      for (let k = 0; k < counts[index]!; k++) {
        const run = tracer.trace(seed(index, k), false, positives);
        // A line that reached a positive charge is already drawn from there.
        if (run.stop === null) result.push({ points: [...run.points].reverse(), source: null, sink: index });
      }
    return result;
  },

  /**
   * Level curves of V by marching squares over the box. The grid is offset a little so no node lies on an axis of
   * symmetry of the charges.
   */
  contours(
    charges: FieldCharge[],
    levels: number[],
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    cell = 0.12,
  ): EquipotentialContour[] {
    const nx = Math.ceil((maxX - minX) / cell);
    const ny = Math.ceil((maxY - minY) / cell);
    if (nx <= 1 || ny <= 1) return [];
    const nodeX = (i: number) => minX + 0.0437 + cell * i;
    const nodeY = (j: number) => minY + 0.0291 + cell * j;
    const values: number[][] = [];
    for (let i = 0; i <= nx; i++) {
      const column: number[] = [];
      for (let j = 0; j <= ny; j++) column.push(ElectricField.potential({ x: nodeX(i), y: nodeY(j) }, charges));
      values.push(column);
    }
    const result: EquipotentialContour[] = [];
    for (const level of levels) {
      const segments: Segment[] = [];
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++) {
          const v00 = values[i]![j]!;
          const v10 = values[i + 1]![j]!;
          const v11 = values[i + 1]![j + 1]!;
          const v01 = values[i]![j + 1]!;
          let code = 0;
          if (v00 >= level) code |= 1;
          if (v10 >= level) code |= 2;
          if (v11 >= level) code |= 4;
          if (v01 >= level) code |= 8;
          if (code === 0 || code === 15) continue;
          const p00 = { x: nodeX(i), y: nodeY(j) };
          const p10 = { x: nodeX(i + 1), y: nodeY(j) };
          const p11 = { x: nodeX(i + 1), y: nodeY(j + 1) };
          const p01 = { x: nodeX(i), y: nodeY(j + 1) };
          const cross = (va: number, vb: number, pa: Point, pb: Point): Point => {
            const t = (level - va) / (vb - va);
            return { x: pa.x + t * (pb.x - pa.x), y: pa.y + t * (pb.y - pa.y) };
          };
          // Edges: 0 bottom, 1 right, 2 top, 3 left.
          const edges = [
            cross(v00, v10, p00, p10),
            cross(v10, v11, p10, p11),
            cross(v01, v11, p01, p11),
            cross(v00, v01, p00, p01),
          ];
          let pairs: [number, number][];
          switch (code) {
            case 1:
            case 14:
              pairs = [[3, 0]];
              break;
            case 2:
            case 13:
              pairs = [[0, 1]];
              break;
            case 3:
            case 12:
              pairs = [[3, 1]];
              break;
            case 4:
            case 11:
              pairs = [[1, 2]];
              break;
            case 6:
            case 9:
              pairs = [[0, 2]];
              break;
            case 7:
            case 8:
              pairs = [[3, 2]];
              break;
            case 5: {
              const centre = (v00 + v10 + v11 + v01) / 4 >= level;
              pairs = centre
                ? [
                    [0, 1],
                    [2, 3],
                  ]
                : [
                    [3, 0],
                    [1, 2],
                  ];
              break;
            }
            default: {
              const centre = (v00 + v10 + v11 + v01) / 4 >= level;
              pairs = centre
                ? [
                    [3, 0],
                    [1, 2],
                  ]
                : [
                    [0, 1],
                    [2, 3],
                  ];
            }
          }
          for (const [a, b] of pairs)
            segments.push({ x1: edges[a]!.x, y1: edges[a]!.y, x2: edges[b]!.x, y2: edges[b]!.y });
        }
      result.push({ level, segments });
    }
    return result;
  },
};

// MARK: Magnetic field

export const MagneticField = {
  /**
   * B (μ₀I/4π = 1) in the plane through the axis of coaxial rings. The axis is the x axis; `positions` are the x
   * positions of rings of radius `radius` whose current runs from +y to +z (out of the page at the top), so B on the
   * axis points to +x.
   */
  rings(point: Point, positions: number[], radius: number, samples = 48): Vector {
    let bx = 0;
    let by = 0;
    const step = (2 * Math.PI) / samples;
    for (const x0 of positions) {
      const dx = point.x - x0;
      for (let k = 0; k < samples; k++) {
        const phi = step * (k + 0.5);
        const c = Math.cos(phi);
        const distanceSquared = dx * dx + point.y * point.y + radius * radius - 2 * radius * point.y * c;
        const cube = distanceSquared * Math.sqrt(distanceSquared);
        if (!(cube > 1e-9)) continue;
        bx += (radius * radius - radius * point.y * c) / cube;
        by += (radius * c * dx) / cube;
      }
    }
    return { x: bx * step, y: by * step };
  },

  /** B round a straight wire (μ₀I/2π = 1) at `point` relative to the wire, for a current out of the page (counter-clockwise) or into it. */
  wire(point: Point, out: boolean): Vector {
    const r2 = Math.max(point.x * point.x + point.y * point.y, 1e-9);
    const sign = out ? 1 : -1;
    return { x: (-sign * point.y) / r2, y: (sign * point.x) / r2 };
  },
};

// MARK: Lenz's law

export const Lenz = {
  /**
   * The side of the coil the induced field points to, +1 for +x and −1 for −x, for a magnet moving along x with `pole`
   * ("N" or "S") facing the coil from the left.
   */
  inducedAxialDirection(pole: string, approaching: boolean): number {
    // The magnet's field at the coil points away from an N pole and into an S pole.
    const external = pole === "N" ? 1 : -1;
    // The induced field opposes the change: against a growing field, along a shrinking one.
    return approaching ? -external : external;
  },
};

// MARK: Circuit signals

export const CircuitSignals = {
  /** Voltage on a capacitor charging through a resistor, as a fraction of the supply. */
  charging: (time: number, tau: number) => 1 - Math.exp(-time / tau),
  discharging: (time: number, tau: number) => Math.exp(-time / tau),
  alternating: (peak: number, period: number, time: number) => peak * Math.sin((2 * Math.PI * time) / period),
  rms: (peak: number) => peak / Math.sqrt(2),
};

// MARK: Drawing helpers

interface PictureBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** A circle with a dot (a current out of the page) or a cross (into it). */
export function pageSymbol(
  canvas: FigureCanvas,
  x: number,
  y: number,
  out: boolean,
  options: { radius?: number; color?: string | null; visible?: string | null } = {},
): void {
  const radius = options.radius ?? 0.18;
  const style = { color: options.color ?? null, visible: options.visible ?? null };
  canvas.ring(x, y, radius, style);
  if (out) canvas.dot(x, y, style);
  else {
    const k = radius * 0.7071;
    canvas.line(x - k, y - k, x + k, y + k, style);
    canvas.line(x - k, y + k, x + k, y - k, style);
  }
}

export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index++) total += distance(points[index - 1]!, points[index]!);
  return total;
}

/** A polyline that grows at `speed` world units per second from its first point. */
export function growingPolyline(
  canvas: FigureCanvas,
  points: Point[],
  start: number,
  speed: number,
  options: { color?: string | null; dashed?: boolean } = {},
): void {
  if (points.length < 2) return;
  let travelled = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!;
    const b = points[index]!;
    canvas.line(a.x, a.y, b.x, b.y, { ...options, visible: Anim.after(start + travelled / speed) });
    travelled += distance(a, b);
  }
}

/** A small arrow along a polyline at `fraction` of its length, shown once the line has grown that far. */
function flowArrow(
  canvas: FigureCanvas,
  points: Point[],
  fraction: number,
  start: number,
  speed: number,
  color: string,
) {
  const spot = PlaneGeometry.along(points, fraction);
  if (!spot) return;
  const total = polylineLength(points);
  const half = 0.14;
  canvas.arrow(
    spot.point.x - spot.ux * half,
    spot.point.y - spot.uy * half,
    spot.point.x + spot.ux * half,
    spot.point.y + spot.uy * half,
    { color, visible: Anim.after(start + (total * fraction) / speed) },
  );
}

/** The charge drawn as a ring with a plus or a minus. */
function chargeSymbol(canvas: FigureCanvas, x: number, y: number, positive: boolean): void {
  const color = positive ? "accent" : "second";
  canvas.ring(x, y, ElectricField.chargeRadius, { color });
  canvas.line(x - 0.09, y, x + 0.09, y, { color });
  if (positive) canvas.line(x, y - 0.09, x, y + 0.09, { color });
}

/** The first stretch of the polyline inside the box, cut exactly at its edge. */
export function visibleRun(points: Point[], box: PictureBox): Point[] {
  if (points.length < 2) return [];
  const run: Point[] = [];
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!;
    const b = points[index]!;
    const piece = clip({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }, box.minX, box.maxX, box.minY, box.maxY);
    if (!piece) {
      if (run.length > 0) break;
      continue;
    }
    if (run.length === 0) run.push({ x: piece.x1, y: piece.y1 });
    const end = { x: piece.x2, y: piece.y2 };
    run.push(end);
    if (distance(end, b) > 1e-9) break;
  }
  return run;
}

/** A point with a name, at expressions in time. */
function movingPoint(canvas: FigureCanvas, x: string, y: string, text: string): void {
  canvas.elements.push({ kind: "point", x, y, text, color: "white", visible: null });
}

// MARK: Charges

/** The charges of a named arrangement. `first` and `second` are the sizes of the first and second charge. */
export function fieldCharges(kind: string, first: number | null, second: number | null): FieldCharge[] | null {
  const a = Math.abs(first ?? 1);
  const b = Math.abs(second ?? a);
  if (!(a > 0 && b > 0 && a <= 10 && b <= 10)) return null;
  switch (kind) {
    case "positive":
      return [{ x: 5, y: 3, q: a }];
    case "negative":
      return [{ x: 5, y: 3, q: -a }];
    case "dipole":
      return [
        { x: 3.9, y: 3, q: a },
        { x: 6.1, y: 3, q: -b },
      ];
    case "like":
    case "likePositive":
      return [
        { x: 3.9, y: 3, q: a },
        { x: 6.1, y: 3, q: b },
      ];
    case "likeNegative":
      return [
        { x: 3.9, y: 3, q: -a },
        { x: 6.1, y: 3, q: -b },
      ];
    default:
      return null;
  }
}

function chargeLabel(q: number, canvas: FigureCanvas): string {
  const size = Math.abs(q);
  const body = Math.abs(size - 1) < 1e-9 ? "q" : `${canvas.number(size)}q`;
  return (q > 0 ? "+" : "−") + body;
}

const chargesFromParams = (params: Params) =>
  fieldCharges(params.text("kind") ?? "dipole", params.number("q"), params.number("q2"));

// MARK: Electric field lines

const electricFieldLines: Compiler = (params, title, language) => {
  const charges = chargesFromParams(params);
  if (!charges) return null;
  const canvas = new FigureCanvas(language);
  const box = { minX: 0.45, maxX: 9.55, minY: 0.95, maxY: 5.05 };
  const speed = 3;
  const begin = 0.4;
  let end = 1;
  for (const line of ElectricField.lines(charges)) {
    const shown = visibleRun(PlaneGeometry.resample(line.points, 0.25), box);
    if (shown.length < 2) continue;
    growingPolyline(canvas, shown, begin, speed, { color: "white" });
    flowArrow(canvas, shown, 0.5, begin, speed, "white");
    end = Math.max(end, begin + polylineLength(shown) / speed);
  }
  for (const charge of charges) {
    chargeSymbol(canvas, charge.x, charge.y, charge.q > 0);
    canvas.label(chargeLabel(charge.q, canvas), charge.x, charge.y - 0.55, {
      anchor: "center",
      color: charge.q > 0 ? "accent" : "second",
    });
  }
  const kind = params.text("kind") ?? "dipole";
  const unequal = new Set(charges.map((c) => Math.abs(c.q))).size > 1;
  let note: string;
  switch (kind) {
    case "positive":
      note = canvas.say("Carga positiva: as linhas saem da carga", "Positive charge: lines leave the charge");
      break;
    case "negative":
      note = canvas.say("Carga negativa: as linhas entram na carga", "Negative charge: lines enter the charge");
      break;
    case "dipole":
      note = unequal
        ? canvas.say("Nº de linhas proporcional a |q|; nunca se cruzam", "Line count follows |q|; lines never cross")
        : canvas.say(
            "As linhas saem de + e entram em −; nunca se cruzam",
            "Lines leave + and enter −; they never cross",
          );
      break;
    default:
      note = canvas.say("Cargas do mesmo sinal: as linhas repelem-se", "Like charges: the lines repel each other");
  }
  canvas.caption(note, { row: 1, color: "white", visible: Anim.after(0.3) });
  return canvas.illustration(title, Anim.duration(end + 0.8));
};

// MARK: Equipotentials

/** Radii of the circles round a single charge: equal steps of V, so they crowd near the charge. */
export function equipotentialRadii(first = 2.0, count = 4): number[] {
  return Array.from({ length: count }, (_, index) => first / (index + 1));
}

const equipotentials: Compiler = (params, title, language) => {
  const charges = chargesFromParams(params);
  if (!charges) return null;
  const canvas = new FigureCanvas(language);
  const box = { minX: 0.6, maxX: 9.4, minY: 1.0, maxY: 5.0 };
  for (const line of ElectricField.lines(charges)) {
    const shown = visibleRun(PlaneGeometry.resample(line.points, 0.3), box);
    growingPolyline(canvas, shown, 0.2, 8, { color: "muted", dashed: true });
  }
  let end = 1.5;
  const only = charges[0];
  if (charges.length === 1 && only) {
    const colour = only.q > 0 ? "accent" : "second";
    const sign = only.q > 0 ? "" : "−";
    equipotentialRadii().forEach((radius, index) => {
      const n = index + 1;
      const shown = Anim.after(0.8 + 0.5 * index);
      canvas.ring(only.x, only.y, radius, { color: colour, visible: shown });
      const angle = ((20 + 32 * index) * Math.PI) / 180;
      const name = n === 1 ? "V₁" : `${n}V₁`;
      const x = only.x + (radius + 0.14) * Math.cos(angle);
      const y = only.y + (radius + 0.14) * Math.sin(angle);
      canvas.label(sign + name, x, y, { anchor: "leading", color: colour, visible: shown });
      end = 0.8 + 0.5 * index + 0.5;
    });
  } else {
    const largest = Math.max(...charges.map((c) => Math.abs(c.q)));
    const step = 0.42 * largest;
    const levels = Array.from({ length: 9 }, (_, i) => step * (i - 4));
    const contours = ElectricField.contours(charges, levels, box.minX, box.maxX, box.minY, box.maxY);
    let rank = 0;
    // A stable sort by |level|, as Swift's sorted(by:) keeps equal levels in order.
    for (const contour of [...contours].sort((a, b) => Math.abs(a.level) - Math.abs(b.level))) {
      if (contour.segments.length === 0) continue;
      const colour = contour.level > 1e-9 ? "accent" : contour.level < -1e-9 ? "second" : "muted";
      const shown = Anim.after(0.8 + 0.3 * rank);
      for (const segment of contour.segments)
        canvas.line(segment.x1, segment.y1, segment.x2, segment.y2, { color: colour, visible: shown });
      end = 0.8 + 0.3 * rank + 0.3;
      rank += 1;
    }
  }
  for (const charge of charges) chargeSymbol(canvas, charge.x, charge.y, charge.q > 0);
  canvas.caption(
    canvas.say("Equipotenciais (V constante) ⟂ linhas de campo", "Equipotentials (constant V) ⟂ field lines"),
    { row: 1, color: "white", visible: Anim.after(0.3) },
  );
  return canvas.illustration(title, Anim.duration(end + 0.8));
};

// MARK: Parallel plates

export const plateColumns = [2.8, 3.8, 4.8, 5.8, 6.8, 7.8];

const parallelPlates: Compiler = (params, title, language) => {
  const voltage = params.number("voltage") ?? 100;
  const gap = params.number("distance") ?? 0.02;
  const chargeKind = params.text("charge") ?? "positive";
  const plusOnTop = (params.text("positivePlate") ?? "top") !== "bottom";
  if (
    !(voltage > 0) ||
    !(gap > 0) ||
    !["positive", "negative"].includes(chargeKind) ||
    !["top", "bottom"].includes(params.text("positivePlate") ?? "top")
  )
    return null;
  const canvas = new FigureCanvas(language);
  const topY = 4.15; // inner faces of the plates
  const bottomY = 1.85;
  const plusInner = plusOnTop ? topY : bottomY;
  const minusInner = plusOnTop ? bottomY : topY;
  const toward = minusInner > plusInner ? 1 : -1; // direction of E, from + to −
  const field = voltage / gap;

  canvas.box(2.2, topY, 6.0, 0.2, { color: plusOnTop ? "accent" : "second", visible: Anim.after(0.1) });
  canvas.box(2.2, bottomY - 0.2, 6.0, 0.2, { color: plusOnTop ? "second" : "accent", visible: Anim.after(0.1) });
  const plusLabelY = plusOnTop ? topY + 0.6 : bottomY - 0.6;
  const minusLabelY = plusOnTop ? bottomY - 0.6 : topY + 0.6;
  for (const x of plateColumns) {
    canvas.label("+", x, plusLabelY, { anchor: "center", color: "accent", visible: Anim.after(0.2) });
    canvas.label("−", x, minusLabelY, { anchor: "center", color: "second", visible: Anim.after(0.2) });
  }
  // E: from the positive plate to the negative one, the same everywhere between them.
  plateColumns.forEach((x, index) =>
    namedArrow(canvas, x, plusInner + toward * 0.05, x, minusInner - toward * 0.05, index === 0 ? "E" : null, {
      color: "white",
      visible: Anim.after(0.5 + 0.12 * index),
    }),
  );
  // Equipotentials: V grows linearly from the negative plate to the positive one.
  for (const fraction of [0.25, 0.5, 0.75]) {
    const y = minusInner + (plusInner - minusInner) * fraction;
    canvas.line(2.2, y, 8.2, y, { color: "muted", dashed: true, visible: Anim.after(1.4) });
    canvas.label(`${canvas.number(voltage * fraction)} V`, 8.4, y, {
      anchor: "leading",
      color: "muted",
      visible: Anim.after(1.4),
    });
  }
  canvas.label("0 V", 8.4, minusInner, { anchor: "leading", color: "muted", visible: Anim.after(1.4) });
  canvas.label(`${canvas.number(voltage)} V`, 8.4, plusInner, {
    anchor: "leading",
    color: "muted",
    visible: Anim.after(1.4),
  });
  // The gap d.
  const mid = (topY + bottomY) / 2;
  canvas.arrow(1.6, mid, 1.6, topY, { color: "muted" });
  canvas.arrow(1.6, mid, 1.6, bottomY, { color: "muted" });
  canvas.label("d", 1.3, mid, { anchor: "center", color: "muted" });
  // A test charge: F = qE, so the force is along E for + and against it for −; it starts from rest.
  const positive = chargeKind === "positive";
  const push = positive ? toward : -toward;
  const startY = positive ? plusInner + toward * 0.3 : minusInner - toward * 0.3;
  const endY = positive ? minusInner - toward * 0.3 : plusInner + toward * 0.3;
  const progress = Anim.ramp(1.6, 4.4);
  const column = 5.3;
  const where = `${Anim.n(startY)} + ${Anim.lit(endY - startY)}*(${progress})^2`;
  movingPoint(canvas, Anim.n(column), where, positive ? "+q" : "−q");
  namedArrow(canvas, column, where, column, `${where} + ${Anim.lit(push * 0.7)}`, "F", { color: "accent" });
  namedArrow(canvas, column, where, column, `${where} + ${Anim.lit(push * 0.9)}*(${progress})`, "v", {
    color: "second",
    visible: Anim.after(1.8),
  });
  canvas.caption(`E = V/d = ${canvas.number(voltage)}/${canvas.number(gap)} = ${canvas.number(field)} V/m`, {
    row: 0,
    color: "white",
    visible: Anim.after(0.3),
  });
  canvas.caption(
    canvas.say(
      "Campo uniforme: F = qE constante, movimento uniformemente acelerado",
      "Uniform field: F = qE is constant, so the motion is uniformly accelerated",
    ),
    { row: 1, color: "white", visible: Anim.after(0.3) },
  );
  return canvas.illustration(title, Anim.duration(5.4), [
    slider("voltage", "V", voltage, 20, 300),
    slider("distance", "d", gap, 0.01, 0.05),
  ]);
};

// MARK: Magnetic field

/** Field lines of a loop or a solenoid, in world coordinates, along B. */
export function magneticLines(kind: string, turns: number, towardRight: boolean): Point[][] {
  const axisY = 3;
  const centreX = 5;
  const radius = kind === "loop" ? 1.1 : 0.75;
  const length = 3.6;
  const positions =
    kind === "loop"
      ? [0]
      : Array.from({ length: turns }, (_, i) => -length / 2 + (length * i) / Math.max(turns - 1, 1));
  const sign = towardRight ? 1 : -1;
  const anchors: Point[] = [];
  for (const x of positions) anchors.push({ x, y: radius }, { x, y: -radius });
  const tracer = new FieldTracer(
    (point) => {
      const b = MagneticField.rings(point, positions, radius, 32);
      return { x: b.x * sign, y: b.y * sign };
    },
    anchors,
    { stopRadius: 0, centre: { x: 0, y: 0 }, half: 8 },
  );
  tracer.stepScale = 0.1;
  tracer.minStep = 0.03;
  const seeds = kind === "loop" ? [0, 0.55, -0.55, 1.8, -1.8] : [0, 0.28, -0.28, 0.5, -0.5];
  return seeds.map((height) => {
    const start = { x: 0, y: height };
    const forward = tracer.trace(start, true);
    const points = forward.closed
      ? forward.points
      : [...tracer.trace(start, false).points].reverse().concat(forward.points.slice(1));
    return points.map((p) => ({ x: p.x + centreX, y: p.y + axisY }));
  });
}

export const wireRadii = [0.9, 1.5, 2.1];
/** Arrow length × radius is the same for every circle. */
const wireArrowScale = 0.9;

const magneticField: Compiler = (params, title, language) => {
  const kind = params.text("kind") ?? "wire";
  const canvas = new FigureCanvas(language);
  switch (kind) {
    case "wire": {
      const out = (params.text("current") ?? "out") !== "in";
      if (!["out", "in"].includes(params.text("current") ?? "out")) return null;
      const centre = { x: 5, y: 3 };
      pageSymbol(canvas, centre.x, centre.y, out, { color: "accent" });
      canvas.label("I", 5.5, 2.7, { anchor: "center", color: "accent" });
      const sense = out ? 1 : -1;
      wireRadii.forEach((radius, index) => {
        const start = 0.4 + 0.5 * index;
        const sweep = Anim.n(2 * Math.PI) + "*" + Anim.ramp(start, start + 0.8);
        canvas.curve(`5 + ${Anim.n(radius)}*cos(s)`, `3 + ${Anim.n(radius)}*sin(s)`, "0", sweep, {
          color: "muted",
          dashed: true,
        });
        // B is tangent to the circle, shorter the farther the circle: |B| ∝ 1/r.
        const arrowScale = Anim.lit(wireArrowScale / radius);
        for (const angle of [Math.PI / 3, Math.PI / 3 + Math.PI]) {
          const px = centre.x + radius * Math.cos(angle);
          const py = centre.y + radius * Math.sin(angle);
          const tx = -Math.sin(angle) * sense;
          const ty = Math.cos(angle) * sense;
          const named = index === wireRadii.length - 1 && angle < Math.PI;
          const mx = Anim.n(px);
          const my = Anim.n(py);
          namedArrow(
            canvas,
            `${mx}-${arrowScale}*(${Anim.n(tx)})/2`,
            `${my}-${arrowScale}*(${Anim.n(ty)})/2`,
            `${mx}+${arrowScale}*(${Anim.n(tx)})/2`,
            `${my}+${arrowScale}*(${Anim.n(ty)})/2`,
            named ? "B" : null,
            { color: "white", visible: Anim.after(start + 0.8) },
          );
        }
      });
      canvas.caption(
        canvas.say("B = μ₀I/(2πr), tangente às circunferências", "B = μ₀I/(2πr), tangent to the circles"),
        {
          row: 0,
          color: "white",
          visible: Anim.after(0.3),
        },
      );
      canvas.caption(
        canvas.say(
          "Regra da mão direita: polegar na corrente, dedos no sentido de B",
          "Right-hand rule: thumb along the current, fingers along B",
        ),
        { row: 1, color: "white", visible: Anim.after(0.3) },
      );
      return canvas.illustration(title, Anim.duration(0.4 + 0.5 * wireRadii.length + 1.2));
    }
    case "loop":
    case "solenoid": {
      const axis = params.text("axis") ?? "right";
      if (!["right", "left"].includes(axis)) return null;
      const right = axis === "right";
      const turnsValue = params.number("turns") ?? 9;
      if (!Number.isFinite(turnsValue) || Math.abs(turnsValue) > 1e9) return null;
      const turns = Math.trunc(turnsValue);
      if (turns < 4 || turns > 14) return null;
      const isLoop = kind === "loop";
      const radius = isLoop ? 1.1 : 0.75;
      const positions = isLoop ? [0] : Array.from({ length: turns }, (_, i) => -1.8 + (3.6 * i) / (turns - 1));
      const box = { minX: 0.45, maxX: 9.55, minY: 0.95, maxY: 5.05 };
      const speed = 3;
      const begin = 0.4;
      let end = 1;
      for (const points of magneticLines(kind, turns, right)) {
        const shown = visibleRun(PlaneGeometry.resample(points, 0.25), box);
        if (shown.length < 2) continue;
        growingPolyline(canvas, shown, begin, speed, { color: "white" });
        flowArrow(canvas, shown, 0.5, begin, speed, "white");
        end = Math.max(end, begin + polylineLength(shown) / speed);
      }
      // Top wires: out of the page when B on the axis points right; bottom wires the opposite.
      const symbolRadius = isLoop ? 0.18 : 0.11;
      for (const x of positions) {
        pageSymbol(canvas, 5 + x, 3 + radius, right, { radius: symbolRadius, color: "accent" });
        pageSymbol(canvas, 5 + x, 3 - radius, !right, { radius: symbolRadius, color: "accent" });
      }
      if (isLoop) {
        canvas.line(5, 3 - radius, 5, 3 + radius, { color: "muted", dashed: true });
        canvas.label("I", 5.5, 3 + radius, { anchor: "center", color: "accent" });
        canvas.label("I", 5.5, 3 - radius, { anchor: "center", color: "accent" });
        canvas.caption(
          canvas.say(
            "Espira: B no eixo aponta pela regra da mão direita",
            "Loop: B on the axis follows the right-hand rule",
          ),
          { row: 1, color: "white", visible: Anim.after(0.3) },
        );
      } else {
        canvas.box(3.1, 3 - radius, 3.8, 2 * radius, { color: "muted", dashed: true });
        const northX = right ? 6.9 : 3.1;
        const southX = right ? 3.1 : 6.9;
        canvas.label("N", northX, 3 - radius - 0.5, { anchor: "center", color: "accent" });
        canvas.label("S", southX, 3 - radius - 0.5, { anchor: "center", color: "second" });
        canvas.caption(
          canvas.say("Solenoide: no interior B é uniforme, B = μ₀nI", "Solenoid: B is uniform inside, B = μ₀nI"),
          { row: 1, color: "white", visible: Anim.after(0.3) },
        );
      }
      return canvas.illustration(title, Anim.duration(end + 0.8));
    }
    default:
      return null;
  }
};

// MARK: Lorentz force

/** +1 for counter-clockwise, −1 for clockwise. */
export function lorentzSpin(positive: boolean, into: boolean): number {
  return (positive ? 1 : -1) * (into ? 1 : -1);
}

const lorentzForce: Compiler = (params, title, language) => {
  const chargeKind = params.text("charge") ?? "positive";
  const fieldKind = params.text("field") ?? "into";
  if (!["positive", "negative"].includes(chargeKind) || !["into", "out"].includes(fieldKind)) return null;
  const tuned = params.has("v") || params.has("B");
  const speed = params.number("v") ?? 1.5;
  const fieldStrength = params.number("B") ?? 1;
  if (!(speed > 0 && speed <= 4 && fieldStrength > 0.2 && fieldStrength <= 3)) return null;
  const into = fieldKind === "into";
  // F = q v × B: a positive charge in a field into the page turns counter-clockwise.
  const spin = lorentzSpin(chargeKind === "positive", into);
  const canvas = new FigureCanvas(language);
  const cx = 5;
  const cy = 3;
  const radius = tuned ? Math.min(2.2, Math.max(0.75, (1.5 * speed) / fieldStrength)) : 1.5;
  for (let column = 0; column < 8; column++)
    for (let row = 0; row < 4; row++) {
      const x = 1 + 1.1 * column;
      const y = 1.35 + 1.1 * row;
      if (Math.abs(Math.hypot(x - cx, y - cy) - radius) < 0.45) continue;
      pageSymbol(canvas, x, y, !into, { radius: 0.13, color: "muted" });
    }
  canvas.ring(cx, cy, radius, { color: "muted", dashed: true });
  const theta0 = Math.PI;
  const progress = Anim.ramp(0.9, 5.4);
  const angle = `${Anim.n(theta0)} + ${Anim.lit(spin * 1.5 * Math.PI)}*${progress}`;
  const px = `${Anim.n(cx)} + ${Anim.n(radius)}*cos(${angle})`;
  const py = `${Anim.n(cy)} + ${Anim.n(radius)}*sin(${angle})`;
  canvas.curve(
    `${Anim.n(cx)} + ${Anim.n(radius)}*cos(s)`,
    `${Anim.n(cy)} + ${Anim.n(radius)}*sin(s)`,
    Anim.n(theta0),
    angle,
    {
      color: "accent",
      visible: Anim.after(0.9),
    },
  );
  // v is tangent to the path and F points to its centre, whatever the sense of the turn.
  const vLength = 0.9;
  const fLength = 0.8;
  namedArrow(
    canvas,
    px,
    py,
    `${px} + ${Anim.lit(-vLength * spin)}*sin(${angle})`,
    `${py} + ${Anim.lit(vLength * spin)}*cos(${angle})`,
    "v",
    { color: "second" },
  );
  namedArrow(
    canvas,
    px,
    py,
    `${px} + ${Anim.lit(-fLength)}*cos(${angle})`,
    `${py} + ${Anim.lit(-fLength)}*sin(${angle})`,
    "F",
    {
      color: "accent",
    },
  );
  movingPoint(canvas, px, py, chargeKind === "positive" ? "+q" : "−q");
  canvas.caption(
    into
      ? canvas.say("B para dentro da página (×)", "B into the page (×)")
      : canvas.say("B para fora da página (•)", "B out of the page (•)"),
    { row: 0, color: "white", visible: Anim.after(0.3) },
  );
  canvas.caption(
    canvas.say(
      "F = q v × B é ⟂ a v: trajetória circular, r = mv/(|q|B)",
      "F = q v × B is ⟂ v: a circular path, r = mv/(|q|B)",
    ),
    { row: 1, color: "white", visible: Anim.after(0.3) },
  );
  return canvas.illustration(title, Anim.duration(6.0), [
    slider("v", "v", speed, 0.5, 3),
    slider("B", "B", fieldStrength, 0.3, 2.5),
  ]);
};

// MARK: Faraday and Lenz

const faradayLenz: Compiler = (params, title, language) => {
  const pole = params.text("pole") ?? "N";
  const motion = params.text("motion") ?? "approach";
  if (!["N", "S"].includes(pole) || !["approach", "recede"].includes(motion)) return null;
  const approaching = motion === "approach";
  const canvas = new FigureCanvas(language);
  const coilX = 6.6;
  const external = pole === "N" ? 1 : -1; // B of the magnet at the coil, along x
  const induced = Lenz.inducedAxialDirection(pole, approaching);
  const move = Anim.ramp(0.8, 4.8);
  const near = 3.9;
  const far = 1.2;
  const leftEdge = approaching
    ? `${Anim.n(far)} + ${Anim.lit(near - far)}*${move}`
    : `${Anim.n(near)} + ${Anim.lit(far - near)}*${move}`;
  const rightHalf = `${leftEdge} + 0.8`;
  const farPole = pole === "N" ? "S" : "N";
  canvas.box(leftEdge, 2.6, 0.8, 0.8, { text: farPole, color: farPole === "N" ? "accent" : "second" });
  canvas.box(rightHalf, 2.6, 0.8, 0.8, { text: pole, color: pole === "N" ? "accent" : "second" });
  const sweep = approaching ? 1 : -1;
  namedArrow(canvas, `${leftEdge} + 0.2`, 4.0, `${leftEdge} + ${Anim.lit(0.2 + 1.2 * sweep)}`, 4.0, "v", {
    color: "white",
    visible: Anim.window(0.8, 4.8),
  });
  // The coil seen from the side: the wires cross the page at its top and bottom.
  canvas.box(coilX - 0.1, 1.75, 0.2, 2.5, { color: "muted" });
  canvas.label(canvas.say("bobina", "coil"), coilX, 1.3, { anchor: "center", color: "muted" });
  // B of the magnet at the coil: it grows as the magnet comes closer and shrinks as it leaves.
  const closeness = approaching ? move : `(1-${move})`;
  const length = `(0.3 + 0.9*${closeness})`;
  const bx = 5.7;
  namedArrow(
    canvas,
    `${Anim.n(bx)} - ${Anim.lit(external * 0.5)}*${length}`,
    3.55,
    `${Anim.n(bx)} + ${Anim.lit(external * 0.5)}*${length}`,
    3.55,
    "B",
    { color: "accent" },
  );
  // The induced current exists only while the flux changes, that is, while the magnet moves.
  const moving = Anim.window(1.0, 4.8);
  const topOut = induced > 0;
  pageSymbol(canvas, coilX, 4.25, topOut, { radius: 0.2, color: "second", visible: moving });
  pageSymbol(canvas, coilX, 1.75, !topOut, { radius: 0.2, color: "second", visible: moving });
  namedArrow(canvas, coilX - induced * 0.5, 2.55, coilX + induced * 0.5, 2.55, canvas.say("B induzido", "induced B"), {
    color: "second",
    visible: moving,
  });
  canvas.label(canvas.say("corrente induzida", "induced current"), 7.0, 4.25, {
    anchor: "leading",
    color: "second",
    visible: moving,
  });
  canvas.caption(
    canvas.say(
      "Lei de Lenz: o campo induzido opõe-se à variação do fluxo",
      "Lenz's law: the induced field opposes the change in flux",
    ),
    { row: 0, color: "white", visible: Anim.after(0.3) },
  );
  const reading = approaching
    ? canvas.say("Fluxo a aumentar: B induzido opõe-se a B", "Flux growing: induced B opposes B")
    : canvas.say("Fluxo a diminuir: B induzido reforça B", "Flux shrinking: induced B supports B");
  canvas.caption(reading, { row: 1, color: "second", visible: Anim.after(1.0) });
  return canvas.illustration(title, 6.0);
};

// MARK: RC curves

export function rcFrame(tau: number | null, v0: number | null): PremadeFrame {
  const unit = tau ?? 1;
  const top = v0 ?? 1;
  return new PremadeFrame(-0.35 * unit, 5.2 * unit, -0.12 * top, 1.18 * top);
}

const rcCircuitCurve: Compiler = (params, title, language) => {
  const mode = params.text("mode") ?? "both";
  if (!["charge", "discharge", "both"].includes(mode)) return null;
  const v0 = params.number("V0");
  if (v0 !== null && v0 <= 0) return null;
  const resistance = params.number("R") ?? 10; // kΩ
  let capacitance: number;
  const explicit = params.number("C");
  const fixedTau = params.number("tau");
  if (explicit !== null) capacitance = explicit;
  else if (fixedTau !== null && !params.has("R") && !params.has("C")) capacitance = fixedTau / (resistance * 1e-3);
  else capacitance = 100;
  if (!(resistance > 0 && capacitance > 0)) return null;
  const tau = fixedTau ?? resistance * capacitance * 1e-3;
  if (tau <= 0) return null;
  const unit = tau;
  const top = v0 ?? 1;
  const frame = rcFrame(tau, v0);
  const canvas = new FigureCanvas(language);
  canvas.axes(frame, { xName: "t", yName: "u" });
  canvas.line(frame.left, frame.y(top), frame.right, frame.y(top), { color: "muted", dashed: true });
  const supply = v0 === null ? "V₀" : `V₀ = ${canvas.number(top)} V`;
  canvas.labelBeside(supply, frame.right - 0.05, frame.y(top), { color: "muted" });
  const charging = PlottedFunction.make(`${Anim.n(top)}*(1-exp(-x/${Anim.n(unit)}))`);
  const discharging = PlottedFunction.make(`${Anim.n(top)}*exp(-x/${Anim.n(unit)})`);
  let end = 1;
  const mark = (fraction: number, color: string, labelSide: number) => {
    const x = frame.x(unit);
    const y = frame.y(fraction * top);
    canvas.line(x, frame.axisY, x, y, { color, dashed: true, visible: Anim.after(end) });
    canvas.elements.push({ kind: "point", x: Anim.n(x), y: Anim.n(y), color, visible: Anim.after(end) });
    const text = v0 === null ? `${canvas.number(fraction, 2)} V₀` : `${canvas.number(fraction * top, 3)} V`;
    canvas.labelBeside(text, x + labelSide, y, { color, visible: Anim.after(end) });
  };
  if (mode !== "discharge" && charging) {
    canvas.plot(charging, frame, 0, frame.xHigh, { color: "white", start: 0.5, end: 2.5 });
    end = 2.6;
    mark(1 - Math.exp(-1), "accent", -0.55);
  }
  if (mode !== "charge" && discharging) {
    const begin = mode === "both" ? 2.6 : 0.5;
    canvas.plot(discharging, frame, 0, frame.xHigh, { color: "white", start: begin, end: begin + 2.0 });
    end = begin + 2.1;
    mark(Math.exp(-1), "second", 0.55);
  }
  canvas.labelBeside("τ = RC", frame.x(unit), frame.axisY - 0.85, { color: "white", visible: Anim.after(2.6) });
  const tauText = `τ = RC = ${canvas.number(resistance)} kΩ × ${canvas.number(capacitance)} μF = ${canvas.number(tau)} s`;
  canvas.caption(tauText, { row: 0, color: "white", visible: Anim.after(0.3) });
  canvas.caption(
    canvas.say("Em t = τ: carga a 63 %, descarga a 37 % de V₀", "At t = τ: 63 % charged, 37 % left when discharging"),
    { row: 1, color: "white", visible: Anim.after(end) },
  );
  return canvas.illustration(title, Anim.duration(end + 0.6), [
    slider("R", "R (kΩ)", resistance, 1, 50),
    slider("C", "C (μF)", capacitance, 10, 500),
  ]);
};

// MARK: AC signal

export function acFrame(peak: number, period: number): PremadeFrame {
  const scale = period < 1 ? 1000 : 1;
  return new PremadeFrame(-0.15 * period * scale, 2.15 * period * scale, -1.45 * peak, 1.45 * peak);
}

const acSignal: Compiler = (params, title, language) => {
  const peak = params.number("peak") ?? 325;
  let period = 0.02;
  const given = params.number("period");
  const frequencyGiven = params.number("frequency");
  if (given !== null) period = given;
  else if (frequencyGiven !== null) {
    if (!(frequencyGiven > 0)) return null;
    period = 1 / frequencyGiven;
  }
  if (!(peak > 0 && period > 0 && Number.isFinite(period))) return null;
  const scale = period < 1 ? 1000 : 1;
  const unit = period < 1 ? "ms" : "s";
  const shownPeriod = period * scale;
  const frame = acFrame(peak, period);
  const canvas = new FigureCanvas(language);
  canvas.caption(canvas.say("Tensão alternada (CA)", "Alternating voltage (AC)"), {
    row: 0,
    color: "white",
    visible: Anim.after(0.2),
  });
  canvas.axes(frame, { xName: `t (${unit})`, yName: "u (V)" });
  const rms = CircuitSignals.rms(peak);
  const wave = PlottedFunction.make(`${Anim.n(peak)}*sin(2*pi*x/${Anim.n(shownPeriod)})`);
  if (!wave) return null;
  canvas.plot(wave, frame, 0, 2 * shownPeriod, { color: "white", start: 0.5, end: 3.0 });
  const right = frame.right;
  for (const sign of [1, -1]) {
    canvas.line(frame.left, frame.y(sign * peak), right, frame.y(sign * peak), {
      color: "accent",
      dashed: true,
      visible: Anim.after(3.0),
    });
    canvas.line(frame.left, frame.y(sign * rms), right, frame.y(sign * rms), {
      color: "second",
      dashed: true,
      visible: Anim.after(3.4),
    });
  }
  canvas.labelBeside(`Vp = ${canvas.number(peak)} V`, frame.right - 0.05, frame.y(peak), {
    color: "accent",
    visible: Anim.after(3.0),
  });
  const rmsName = canvas.say("Vef", "Vrms");
  canvas.labelBeside(`${rmsName} = Vp/√2 = ${canvas.integer(rms)} V`, frame.left + 0.05, frame.y(rms), {
    color: "second",
    visible: Anim.after(3.4),
  });
  // One period, between two successive peaks.
  const bracketY = frame.y(1.22 * peak);
  const firstPeak = 0.25 * shownPeriod;
  canvas.arrow(frame.x(firstPeak), bracketY, frame.x(firstPeak + shownPeriod), bracketY, {
    color: "white",
    visible: Anim.after(3.8),
  });
  canvas.label(`T = ${canvas.number(shownPeriod)} ${unit}`, frame.x(firstPeak + shownPeriod / 2), bracketY + 0.3, {
    anchor: "center",
    color: "white",
    visible: Anim.after(3.8),
  });
  canvas.caption(
    canvas.say(
      `f = 1/T = ${canvas.number(1 / period)} Hz · valor eficaz = valor de pico/√2`,
      `f = 1/T = ${canvas.number(1 / period)} Hz · RMS = peak/√2`,
    ),
    { row: 1, color: "white", visible: Anim.after(3.8) },
  );
  return canvas.illustration(title, Anim.duration(4.4), [
    slider("peak", "Vp", peak, 50, 400),
    slider("frequency", "f (Hz)", 1 / period, 0.1, 100),
  ]);
};

/** The electromagnetism of batch 2, by premade type. */
export const electromagnetismFigures: Record<string, Compiler> = {
  electricFieldLines,
  equipotentials,
  parallelPlates,
  magneticField,
  lorentzForce,
  faradayLenz,
  rcCircuitCurve,
  acSignal,
};
