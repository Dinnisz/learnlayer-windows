// Port of LearnLayer/Illustrations/SpaceFigure.swift, SpaceGeometry.swift, SpaceFigureDrawing.swift and
// Explanation/Space3D.swift (`inferringEdges`) @ ref 2026-11-04

import { LabelPlacer, Rect, type Point } from "./labelPlacer";

export class Vector3 {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly z: number,
  ) {}
  static from(values: readonly number[] | null | undefined): Vector3 | null {
    if (!values || values.length !== 3 || !values.every(Number.isFinite)) return null;
    return new Vector3(values[0]!, values[1]!, values[2]!);
  }
  plus(b: Vector3) {
    return new Vector3(this.x + b.x, this.y + b.y, this.z + b.z);
  }
  minus(b: Vector3) {
    return new Vector3(this.x - b.x, this.y - b.y, this.z - b.z);
  }
  times(k: number) {
    return new Vector3(this.x * k, this.y * k, this.z * k);
  }
  dot(b: Vector3) {
    return this.x * b.x + this.y * b.y + this.z * b.z;
  }
  cross(b: Vector3) {
    return new Vector3(this.y * b.z - this.z * b.y, this.z * b.x - this.x * b.z, this.x * b.y - this.y * b.x);
  }
  get length() {
    return Math.sqrt(this.dot(this));
  }
  axis(index: number) {
    return index === 0 ? this.x : index === 1 ? this.y : this.z;
  }
}

export interface Vertex {
  name: string;
  x: number;
  y: number;
  z: number;
}

/** point + k·direction. */
export interface SpaceLine {
  name: string | null;
  point: number[];
  direction: number[];
  /** Named points the line passes through, checked. */
  through: string[] | null;
  /** The step (from 1) that brings it in; null from the start. */
  step: number | null;
}

/** normal · (X − point) = 0. */
export interface SpacePlane {
  name: string | null;
  normal: number[];
  point: number[];
  through: string[] | null;
  step: number | null;
}

/** Points, a line and a plane in an Oxyz frame, from the question's data. */
export interface SpaceFigure {
  points: Vertex[];
  /** Edges between named points ("AB", "BC"…), e.g. a solid's. */
  edges: string[] | null;
  line: SpaceLine | null;
  plane: SpacePlane | null;
}

const vector = (vertex: Vertex) => new Vector3(vertex.x, vertex.y, vertex.z);
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const numbers = (value: unknown) =>
  Array.isArray(value) && value.every((n) => typeof n === "number") ? (value as number[]) : null;
const strings = (value: unknown) =>
  Array.isArray(value) && value.every((n) => typeof n === "string") ? (value as string[]) : null;
const step = (value: unknown) => (typeof value === "number" && Number.isInteger(value) ? value : null);

export function decodeSpaceFigure(value: unknown): SpaceFigure | null {
  if (!isObject(value) || !Array.isArray(value.points)) return null;
  const points = value.points.map((point) =>
    isObject(point) && typeof point.name === "string" && [point.x, point.y, point.z].every((n) => typeof n === "number")
      ? { name: point.name, x: point.x as number, y: point.y as number, z: point.z as number }
      : null,
  );
  if (points.some((point) => point === null)) return null;
  const line =
    isObject(value.line) && numbers(value.line.point) && numbers(value.line.direction)
      ? {
          name: typeof value.line.name === "string" ? value.line.name : null,
          point: numbers(value.line.point)!,
          direction: numbers(value.line.direction)!,
          through: strings(value.line.through),
          step: step(value.line.step),
        }
      : null;
  const plane =
    isObject(value.plane) && numbers(value.plane.normal) && numbers(value.plane.point)
      ? {
          name: typeof value.plane.name === "string" ? value.plane.name : null,
          normal: numbers(value.plane.normal)!,
          point: numbers(value.plane.point)!,
          through: strings(value.plane.through),
          step: step(value.plane.step),
        }
      : null;
  return { points: points as Vertex[], edges: strings(value.edges), line, plane };
}

/** "AB", "A-B", "AA'", "A1B1" → the two points. */
function ends(edge: string, named: Map<string, Vector3>): [Vector3, Vector3] | null {
  if (edge.includes("-")) {
    const parts = edge.split("-");
    if (parts.length !== 2) return null;
    const a = named.get(parts[0]!);
    const b = named.get(parts[1]!);
    return a && b ? [a, b] : null;
  }
  // Every split into two known names; one only, so "AB1" is never read two ways.
  const characters = [...edge];
  const splits: [Vector3, Vector3][] = [];
  for (let cut = 1; cut < Math.max(characters.length, 1); cut++) {
    const a = named.get(characters.slice(0, cut).join(""));
    const b = named.get(characters.slice(cut).join(""));
    if (a && b) splits.push([a, b]);
  }
  return splits.length === 1 ? splits[0]! : null;
}

/** The points by name; "O" is the origin unless a point is named so. */
function namedPoints(points: readonly Vertex[]): Map<string, Vector3> {
  const named = new Map<string, Vector3>();
  for (const point of points) if (!named.has(point.name)) named.set(point.name, vector(point));
  if (!named.has("O")) named.set("O", new Vector3(0, 0, 0));
  return named;
}

// MARK: Completing a box [ABCDEFGH]

/** Each corner as B + a·BA + b·BG + c·BC. */
const boxCorners: [string, number, number, number][] = [
  ["B", 0, 0, 0],
  ["A", 1, 0, 0],
  ["G", 0, 1, 0],
  ["C", 0, 0, 1],
  ["F", 1, 1, 0],
  ["D", 1, 0, 1],
  ["H", 0, 1, 1],
  ["E", 1, 1, 1],
];
const boxEdges = ["BA", "AF", "FG", "GB", "CD", "DE", "EH", "HC", "BC", "AD", "FE", "GH"];

/** A solution of rows · p = rhs and a basis of the directions left free, or null when they contradict. */
function solveLinear(
  rows: number[][],
  rhs: number[],
  tolerance: number,
): { particular: number[]; free: number[][] } | null {
  const width = rows[0]?.length;
  if (width === undefined) return null;
  const matrix = rows.map((row, index) => [...row, rhs[index]!]);
  const pivots: number[] = [];
  let row = 0;
  for (let column = 0; column < width && row < matrix.length; column++) {
    let best = row;
    for (let candidate = row; candidate < matrix.length; candidate++)
      if (Math.abs(matrix[candidate]![column]!) > Math.abs(matrix[best]![column]!)) best = candidate;
    if (!(Math.abs(matrix[best]![column]!) > 1e-9)) continue;
    [matrix[row], matrix[best]] = [matrix[best]!, matrix[row]!];
    const pivot = matrix[row]![column]!;
    matrix[row] = matrix[row]!.map((value) => value / pivot);
    for (let other = 0; other < matrix.length; other++) {
      if (other === row) continue;
      const factor = matrix[other]![column]!;
      if (factor !== 0) matrix[other] = matrix[other]!.map((value, index) => value - factor * matrix[row]![index]!);
    }
    pivots.push(column);
    row += 1;
  }
  for (let rest = row; rest < matrix.length; rest++) if (Math.abs(matrix[rest]![width]!) > tolerance) return null;
  const particular: number[] = new Array<number>(width).fill(0);
  pivots.forEach((column, index) => (particular[column] = matrix[index]![width]!));
  const free: number[][] = [];
  for (let column = 0; column < width; column++) {
    if (pivots.includes(column)) continue;
    const direction: number[] = new Array<number>(width).fill(0);
    direction[column] = 1;
    pivots.forEach((pivot, index) => (direction[pivot] = -matrix[index]![column]!));
    free.push(direction);
  }
  return { particular, free };
}

interface BoxEdges {
  b: Vector3;
  ba: Vector3;
  bg: Vector3;
  bc: Vector3;
}

/**
 * All eight corners of a rectangular box named as Portuguese exams name it (B on Oy, A on Ox), or null when the
 * corners given (and `edgeDH`) fit no box under this naming, or leave it free.
 */
export function completeBox(given: Map<string, Vector3>, edgeDH: Vector3 | null = null): Map<string, Vector3> | null {
  const known = boxCorners.filter(([name]) => given.has(name));
  if (known.length === 0) return null;
  const scale = Math.max(1, ...[...given.values()].map((p) => Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z))));
  const rows: number[][] = [];
  const rhs: number[] = [];
  for (const [name, a, b, c] of known) {
    const p = given.get(name)!;
    rows.push([0, a, b, 0, 0, c, 0, 0]);
    rhs.push(p.x);
    rows.push([1 - a, 0, 0, b, 0, 0, c, 0]);
    rhs.push(p.y);
    rows.push([0, 0, 0, 0, b, 0, 0, c]);
    rhs.push(p.z);
  }
  if (edgeDH && edgeDH.length > 1e-9) {
    const n = edgeDH.times(1 / edgeDH.length);
    rows.push([n.z, 0, 0, n.z, -n.y, 0, 0, 0]);
    rhs.push(0);
    rows.push([0, n.z, -n.z, 0, n.x, 0, 0, 0]);
    rhs.push(0);
    rows.push([-n.x, -n.y, n.y, -n.x, 0, 0, 0, 0]);
    rhs.push(0);
  }
  const solved = solveLinear(rows, rhs, 1e-6 * scale);
  if (!solved || solved.free.length > 2) return null;
  const { particular, free } = solved;
  const box = (p: number[]): BoxEdges => ({
    b: new Vector3(0, p[0]!, 0),
    ba: new Vector3(p[1]!, -p[0]!, 0),
    bg: new Vector3(p[2]!, p[3]!, p[4]!),
    bc: new Vector3(p[5]!, p[6]!, p[7]!),
  });
  const at = (t: number[]) => {
    const p = [...particular];
    free.forEach((direction, index) => {
      for (let k = 0; k < p.length; k++) p[k]! += t[index]! * direction[k]!;
    });
    return p;
  };
  const residuals = (t: number[]) => {
    const e = box(at(t));
    return [e.ba.dot(e.bg), e.ba.dot(e.bc), e.bg.dot(e.bc)];
  };
  let candidates: number[][] = [];
  if (free.length === 0) candidates = [[]];
  else if (free.length === 1) {
    const roots: number[] = [];
    let anyEquation = false;
    for (let index = 0; index < 3; index++) {
      const c = residuals([0])[index]!;
      const plus = residuals([1])[index]!;
      const minus = residuals([-1])[index]!;
      const a = (plus + minus) / 2 - c;
      const b = (plus - minus) / 2;
      const size = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), 1e-300);
      if (Math.abs(a) > 1e-12 * size) {
        anyEquation = true;
        const discriminant = b * b - 4 * a * c;
        if (!(discriminant >= -1e-9 * Math.max(b * b, Math.abs(4 * a * c), 1e-300))) continue;
        const root = Math.sqrt(Math.max(0, discriminant));
        roots.push((-b - root) / (2 * a), (-b + root) / (2 * a));
      } else if (Math.abs(b) > 1e-12 * size) {
        anyEquation = true;
        roots.push(-c / b);
      }
    }
    if (!anyEquation) return null;
    candidates = roots.map((root) => [root]);
  } else {
    // Two free parameters, three right angles: Gauss–Newton from a grid.
    const reach = 4 * scale;
    const sum = (a: number[], b: number[]) => a.reduce((total, value, index) => total + value * b[index]!, 0);
    for (let i = 0; i <= 8; i++) {
      for (let j = 0; j <= 8; j++) {
        let t = [reach * (i / 4 - 1), reach * (j / 4 - 1)];
        for (let iteration = 0; iteration < 60; iteration++) {
          const r = residuals(t);
          const h = 1e-6 * scale;
          const ds = residuals([t[0]! + h, t[1]!]).map((value, index) => (value - r[index]!) / h);
          const dt = residuals([t[0]!, t[1]! + h]).map((value, index) => (value - r[index]!) / h);
          const a11 = sum(ds, ds);
          const a12 = sum(ds, dt);
          const a22 = sum(dt, dt);
          const g1 = sum(ds, r);
          const g2 = sum(dt, r);
          const determinant = a11 * a22 - a12 * a12;
          if (!(Math.abs(determinant) > 1e-300)) break;
          const stepT = [(a22 * g1 - a12 * g2) / determinant, (a11 * g2 - a12 * g1) / determinant];
          t = [t[0]! - stepT[0]!, t[1]! - stepT[1]!];
          if (Math.abs(stepT[0]!) + Math.abs(stepT[1]!) < 1e-13 * scale) break;
        }
        candidates.push(t);
      }
    }
  }
  const isolated = (t: number[]) => {
    if (t.length !== 2) return true;
    const h = 1e-5 * scale;
    const r0 = residuals(t);
    const ds = residuals([t[0]! + h, t[1]!]).map((value, index) => (value - r0[index]!) / h);
    const dt = residuals([t[0]!, t[1]! + h]).map((value, index) => (value - r0[index]!) / h);
    const dot = (a: number[], b: number[]) => a.reduce((total, value, index) => total + value * b[index]!, 0);
    const a11 = dot(ds, ds);
    const a12 = dot(ds, dt);
    const a22 = dot(dt, dt);
    const trace = a11 + a22;
    if (!(trace > 1e-300)) return false;
    return (a11 * a22 - a12 * a12) / (trace * trace) > 1e-8;
  };
  const boxes: BoxEdges[] = [];
  for (const t of candidates) {
    if (!isolated(t)) continue;
    const e = box(at(t));
    const lengths = [e.ba.length, e.bg.length, e.bc.length];
    if (!lengths.every((length) => length > 1e-3 * scale && Number.isFinite(length))) continue;
    const right =
      Math.abs(e.ba.dot(e.bg)) <= 1e-6 * lengths[0]! * lengths[1]! &&
      Math.abs(e.ba.dot(e.bc)) <= 1e-6 * lengths[0]! * lengths[2]! &&
      Math.abs(e.bg.dot(e.bc)) <= 1e-6 * lengths[1]! * lengths[2]!;
    if (!right) continue;
    const same = boxes.some(
      (other) =>
        other.b.minus(e.b).length +
          other.ba.minus(e.ba).length +
          other.bg.minus(e.bg).length +
          other.bc.minus(e.bc).length <
        1e-6 * scale,
    );
    if (!same) boxes.push(e);
  }
  const unevenness = (e: BoxEdges) => {
    const lengths = [e.ba.length, e.bg.length, e.bc.length];
    return Math.max(...lengths) / Math.min(...lengths);
  };
  const chosen = boxes.reduce<BoxEdges | null>(
    (best, e) => (!best || unevenness(e) < unevenness(best) ? e : best),
    null,
  );
  if (!chosen) return null;
  const result = new Map<string, Vector3>();
  for (const [name, a, b, c] of boxCorners)
    result.set(name, chosen.b.plus(chosen.ba.times(a)).plus(chosen.bg.times(b)).plus(chosen.bc.times(c)));
  return result;
}

// MARK: Checking

export const SpaceFigures = {
  /** A rectangular box named by some of A…H is completed from the corners the reply gives. */
  fillingRectangularBox(figure: SpaceFigure): SpaceFigure {
    const named = new Map<string, Vertex>();
    for (const point of figure.points) if (!named.has(point.name)) named.set(point.name, point);
    const cornerNames = new Set(boxCorners.map(([name]) => name));
    if (![...cornerNames].some((name) => named.has(name))) return figure;
    let edgeDH: Vector3 | null = null;
    const line = figure.line;
    const direction = line ? Vector3.from(line.direction) : null;
    if (
      line &&
      direction &&
      direction.length > 1e-9 &&
      (["D", "H"].every((name) => (line.through ?? []).includes(name)) || line.name === "DH")
    ) {
      const d = named.get("D");
      const h = named.get("H");
      if (!d || !h) edgeDH = direction;
      else {
        const dh = vector(h).minus(vector(d));
        if (
          dh.length > 1e-9 &&
          dh.cross(direction).length <= 1e-6 * Math.max(dh.length, direction.length) * direction.length
        )
          edgeDH = direction;
      }
    }
    const given = new Map<string, Vector3>();
    for (const [name] of boxCorners) {
      const vertex = named.get(name);
      if (vertex) given.set(name, vector(vertex));
    }
    let anchor: Map<string, Vector3> | null = null;
    if (named.has("D") && named.has("H") && named.has("G")) {
      anchor = new Map([
        ["D", vector(named.get("D")!)],
        ["H", vector(named.get("H")!)],
        ["G", vector(named.get("G")!)],
      ]);
      const c = named.get("C");
      if (c) anchor.set("C", vector(c));
    }
    const corners = (anchor ? completeBox(anchor, edgeDH) : null) ?? completeBox(given, edgeDH);
    if (!corners) return figure;
    const built = boxCorners.map(([name]) => {
      const p = corners.get(name)!;
      return { name, x: p.x, y: p.y, z: p.z };
    });
    return {
      ...figure,
      points: [...built, ...figure.points.filter((point) => !cornerNames.has(point.name))],
      edges: boxEdges,
    };
  },

  /**
   * Only what checks out: finite points, edges between known points, a line through the points it names, a plane
   * holding the points it names. Null when nothing is left to draw.
   */
  validated(input: SpaceFigure): SpaceFigure | null {
    const figure = SpaceFigures.fillingRectangularBox(input);
    // "O" is the origin, drawn once beside A: a point of that name at the origin, or anywhere in a box (where the
    // exam's O is the origin and a misplaced one lands inside it), would be a second mark. It still names the origin
    // for edges, lines and planes ("OA", "through O"). An O elsewhere with no box (a sphere's centre) is a point of
    // its own (@ 5701363).
    const isBox = (figure.edges ?? []).join() === boxEdges.join();
    const points = figure.points.filter(
      (point) =>
        [point.x, point.y, point.z].every(Number.isFinite) &&
        point.name !== "" &&
        !(point.name === "O" && (isBox || vector(point).length < 1e-9)),
    );
    const named = namedPoints(points);
    const scale = Math.max(1, ...points.map((point) => vector(point).length));
    const edges = figure.edges?.filter((edge) => ends(edge, named) !== null) ?? null;
    let line = figure.line;
    if (line) {
      const known = (line.through ?? []).map((name) => named.get(name)).filter((p): p is Vector3 => p !== undefined);
      if (known.length >= 2 && known[1]!.minus(known[0]!).length > 1e-9) {
        const a = known[0]!;
        const b = known[1]!;
        line = {
          ...line,
          point: [a.x, a.y, a.z],
          direction: [b.x - a.x, b.y - a.y, b.z - a.z],
          name: line.name ? line.name : (line.through ?? []).slice(0, 2).join(""),
        };
      } else {
        const p = Vector3.from(line.point);
        const d = Vector3.from(line.direction);
        const ok =
          p !== null &&
          d !== null &&
          d.length > 1e-9 &&
          (line.through ?? []).every((name) => {
            const q = named.get(name);
            return q !== undefined && q.minus(p).cross(d).length <= 1e-6 * scale * d.length + 1e-9;
          });
        if (!ok) line = null;
      }
    }
    let plane = figure.plane;
    if (plane) {
      const p = Vector3.from(plane.point);
      const n = Vector3.from(plane.normal);
      const ok =
        p !== null &&
        n !== null &&
        n.length > 1e-9 &&
        (plane.through ?? []).every((name) => {
          const q = named.get(name);
          return q !== undefined && Math.abs(q.minus(p).dot(n)) <= 1e-6 * scale * n.length + 1e-9;
        });
      if (!ok) plane = null;
    }
    if (points.length === 0 && !line && !plane) return null;
    return { points, edges, line, plane };
  },

  /** The edges a statement implies: a pyramid's from its name "[ABCDV]", a box's from corners on the axes' planes. */
  inferringEdges(figure: SpaceFigure, statement: string): SpaceFigure {
    if ((figure.edges ?? []).length > 0) return figure;
    const names = new Set(figure.points.map((point) => point.name));
    const folded = statement
      .normalize("NFD")
      .replace(/\p{Mn}/gu, "")
      .toLowerCase();
    for (const match of statement.matchAll(/\[([A-Z](?:[A-Z]){2,9})\]/g)) {
      const letters = [...match[1]!];
      if (!letters.every((letter) => names.has(letter))) continue;
      if ((folded.includes("piramide") || folded.includes("pyramid")) && letters.length >= 4) {
        // The apex is the vertex off the others' plane: last in [ABCDV], first in [VABCD].
        const at = namedPoints(figure.points);
        // A base is flat: every corner on the plane of its first three.
        const isFlat = (base: readonly string[]) => {
          const corners = base.map((name) => at.get(name)).filter((corner): corner is Vector3 => corner !== undefined);
          if (corners.length !== base.length || corners.length < 3) return false;
          const n = corners[1]!.minus(corners[0]!).cross(corners[2]!.minus(corners[0]!));
          if (n.length <= 1e-9) return false;
          return corners.every((corner) => {
            const d = corner.minus(corners[0]!);
            return Math.abs(d.dot(n)) <= 1e-6 * n.length * Math.max(1, d.length);
          });
        };
        const apexFirst = !isFlat(letters.slice(0, -1)) && isFlat(letters.slice(1));
        const base = apexFirst ? letters.slice(1) : letters.slice(0, -1);
        const apex = apexFirst ? letters[0]! : letters[letters.length - 1]!;
        return {
          ...figure,
          edges: [
            ...base.map((letter, index) => letter + base[(index + 1) % base.length]),
            ...base.map((letter) => apex + letter),
          ],
        };
      }
    }
    if (figure.points.length === 8) {
      const found: string[] = [];
      figure.points.forEach((a, i) => {
        for (const b of figure.points.slice(i + 1)) {
          const d = vector(b).minus(vector(a));
          if ([d.x, d.y, d.z].filter((value) => Math.abs(value) > 1e-9).length === 1) found.push(a.name + b.name);
        }
      });
      if (found.length === 12) return { ...figure, edges: found };
    }
    return figure;
  },
};

// MARK: Drawing

export type StrokeRole = "axis" | "frame" | "plane" | "edge" | "line";
export type NameRole = "axis" | "vertex" | "line" | "plane" | "origin";

export interface SpaceDrawing {
  strokes: { from: Point; to: Point; role: StrokeRole; dashed: boolean; part?: string }[];
  /** Where the plane cuts the box, in order around it. */
  section: Point[];
  dots: { name: string; at: Point }[];
  /** Where the line meets the plane (worked out by the app) and the plane's normal: drawn when a step names them. */
  meeting?: Point;
  normal?: { from: Point; to: Point };
  names: { text: string; box: Rect; role: NameRole }[];
}

export interface SpaceFrame {
  width: number;
  height: number;
  /** World units grow up; view points grow down. */
  yUp: boolean;
  /** A name's font size in the frame's units. Gaps and margins follow it. */
  textSize: number;
  axes: boolean;
}

/** The turn and tilt a still picture shows: open enough that no face is edge-on. */
export const stillYaw = 0.62;
export const stillPitch = 0.48;

/** A view of this size, in points: names at 14 pt in a full-size figure, down to 9 pt in a small one. */
export function viewFrame(width: number, height: number): SpaceFrame {
  return { width, height, yUp: false, textSize: Math.min(14, Math.max(9, width * 0.034)), axes: true };
}

type Box = { low: Vector3; high: Vector3 };

function cornersOf(box: Box): Vector3[] {
  return Array.from(
    { length: 8 },
    (_, i) =>
      new Vector3(i & 1 ? box.high.x : box.low.x, i & 2 ? box.high.y : box.low.y, i & 4 ? box.high.z : box.low.z),
  );
}

function boundsOf(all: Vector3[]): Box {
  let low = new Vector3(Infinity, Infinity, Infinity);
  let high = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of all) {
    low = new Vector3(Math.min(low.x, p.x), Math.min(low.y, p.y), Math.min(low.z, p.z));
    high = new Vector3(Math.max(high.x, p.x), Math.max(high.y, p.y), Math.max(high.z, p.z));
  }
  return { low, high };
}

/** The box the drawing spans: the points, the origin and a line's point, padded. */
function figureBounds(figure: SpaceFigure, showingLine: boolean): Box {
  const all = [...figure.points.map(vector), new Vector3(0, 0, 0)];
  const p = showingLine && figure.line ? Vector3.from(figure.line.point) : null;
  if (p) all.push(p);
  const { low, high } = boundsOf(all);
  const span = Math.max(high.x - low.x, high.y - low.y, high.z - low.z, 1);
  const pad = new Vector3(span * 0.15, span * 0.15, span * 0.15);
  return { low: low.minus(pad), high: high.plus(pad) };
}

/** The rectangular box around the named points and the origin. */
function solidOf(points: readonly Vertex[]): Box | null {
  if (points.length === 0) return null;
  const { low, high } = boundsOf([...points.map(vector), new Vector3(0, 0, 0)]);
  if (!(high.x - low.x > 1e-6 || high.y - low.y > 1e-6 || high.z - low.z > 1e-6)) return null;
  return { low, high };
}

/** The range of k for which p + k·d is inside the box, or null when the line misses it. */
function clipRange(p: Vector3, d: Vector3, box: Box): [number, number] | null {
  let low = -Infinity;
  let high = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const origin = p.axis(axis);
    const stepAlong = d.axis(axis);
    const minimum = box.low.axis(axis);
    const maximum = box.high.axis(axis);
    if (Math.abs(stepAlong) < 1e-12) {
      if (origin < minimum || origin > maximum) return null;
      continue;
    }
    const a = (minimum - origin) / stepAlong;
    const b = (maximum - origin) / stepAlong;
    low = Math.max(low, Math.min(a, b));
    high = Math.min(high, Math.max(a, b));
  }
  return low < high ? [low, high] : null;
}

/** Where the plane cuts the box: its corners in order around it. */
function sectionOf(box: Box, n: Vector3, p: Vector3): Vector3[] {
  const corners = cornersOf(box);
  const hits: Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    for (const bit of [1, 2, 4]) {
      if (i & bit) continue;
      const a = corners[i]!;
      const b = corners[i | bit]!;
      const fa = a.minus(p).dot(n);
      const fb = b.minus(p).dot(n);
      if (fa === 0) hits.push(a);
      if (fa < 0 !== fb < 0 && fa !== 0 && fb !== 0) hits.push(a.plus(b.minus(a).times(fa / (fa - fb))));
    }
  }
  if (hits.length < 3) return [];
  const centre = hits.reduce((sum, hit) => sum.plus(hit), new Vector3(0, 0, 0)).times(1 / hits.length);
  const u = (Math.abs(n.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)).cross(n);
  const v = n.cross(u);
  const angle = (point: Vector3) => Math.atan2(point.minus(centre).dot(v), point.minus(centre).dot(u));
  return [...hits].sort((a, b) => angle(a) - angle(b));
}

function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function onHullBoundary(point: Point, hull: Point[], epsilon = 1e-4): boolean {
  if (hull.length < 3) return true;
  for (let index = 0; index < hull.length; index++) {
    const a = hull[index]!;
    const b = hull[(index + 1) % hull.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (!(length > 1e-9)) continue;
    const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (length * length);
    if (t < -epsilon || t > 1 + epsilon) continue;
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    if (Math.sqrt((point.x - px) ** 2 + (point.y - py) ** 2) <= epsilon * Math.max(length, 1)) return true;
  }
  return false;
}

/** Corner strictly inside the projection hull and farthest along the view; null when none. */
function hiddenCornerIndex(projected: Point[], depths: number[]): number | null {
  if (projected.length !== depths.length || projected.length < 4) return null;
  const hull = convexHull(projected);
  if (hull.length < 3) return null;
  let best: { index: number; depth: number } | null = null;
  projected.forEach((point, index) => {
    if (onHullBoundary(point, hull)) return;
    if (!best || depths[index]! > best.depth) best = { index, depth: depths[index]! };
  });
  return (best as { index: number } | null)?.index ?? null;
}

const difference = (a: number, b: number) => {
  const d = Math.abs((a - b) % 360);
  return Math.min(d, 360 - d);
};

interface LineSpan {
  start: Vector3;
  first: Vector3;
  last: Vector3;
  end: Vector3;
}

/** The part of the line drawn: its named points and a third of their distance beyond each, inside `box`. */
function lineSpan(figure: SpaceFigure, box: Box, project: (p: Vector3) => Point, clearance: number): LineSpan | null {
  const line = figure.line;
  const p = line ? Vector3.from(line.point) : null;
  const d = line ? Vector3.from(line.direction) : null;
  if (!line || !p || !d || !(d.length > 1e-9)) return null;
  const range = clipRange(p, d, box);
  if (!range) return null;
  const [low, high] = range;
  const through = new Set(line.through ?? []);
  const held = figure.points
    .filter((point) => through.has(point.name))
    .map((point) => vector(point).minus(p).dot(d) / d.dot(d));
  if (held.length === 0 || !(Math.max(...held) - Math.min(...held) > 1e-9))
    return {
      start: p.plus(d.times(low)),
      first: p.plus(d.times(low)),
      last: p.plus(d.times(high)),
      end: p.plus(d.times(high)),
    };
  const first = Math.min(...held);
  const last = Math.max(...held);
  const beyond = (last - first) / 3;
  let start = Math.max(low, first - beyond);
  let end = Math.min(high, last + beyond);
  const a = project(p);
  const b = project(p.plus(d));
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const screenLength = Math.sqrt(sx * sx + sy * sy);
  if (screenLength > 1e-9) {
    const margin = clearance / screenLength;
    for (const vertex of figure.points) {
      if (through.has(vertex.name)) continue;
      if (vector(vertex).minus(p).cross(d).length <= 1e-6 * Math.max(1, d.length)) continue;
      const q = project(vector(vertex));
      const k = ((q.x - a.x) * sx + (q.y - a.y) * sy) / (screenLength * screenLength);
      const ox = q.x - (a.x + sx * k);
      const oy = q.y - (a.y + sy * k);
      if (!(Math.sqrt(ox * ox + oy * oy) < clearance)) continue;
      if (k > last) end = Math.min(end, Math.max(last, k - margin));
      if (k < first) start = Math.max(start, Math.min(first, k + margin));
    }
  }
  return {
    start: p.plus(d.times(start)),
    first: p.plus(d.times(first)),
    last: p.plus(d.times(last)),
    end: p.plus(d.times(end)),
  };
}

/**
 * The validated figure at `yaw` and `pitch`, in a frame's own units: every stroke and dot, and every name in the
 * nearest spot that covers no other name, no dot and no stroke.
 */
export function spaceDrawing(
  figure: SpaceFigure,
  yaw: number,
  pitch: number,
  frame: SpaceFrame,
  measure: (text: string, role: NameRole) => { width: number; height: number },
  stepReached = Number.MAX_SAFE_INTEGER,
  labelOrigin = true,
): SpaceDrawing {
  const shows = (itemStep: number | null) => (itemStep ?? 0) <= stepReached;
  const right = new Vector3(-Math.sin(yaw), Math.cos(yaw), 0);
  const up = new Vector3(-Math.cos(yaw) * Math.sin(pitch), -Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch));
  const box = figureBounds(figure, shows(figure.line?.step ?? null));
  const flat = cornersOf(box).map((corner) => [corner.dot(right), corner.dot(up)] as const);
  const minU = Math.min(...flat.map((f) => f[0]));
  const maxU = Math.max(...flat.map((f) => f[0]));
  const minV = Math.min(...flat.map((f) => f[1]));
  const maxV = Math.max(...flat.map((f) => f[1]));
  const scale = Math.min(frame.width / Math.max(maxU - minU, 1e-6), frame.height / Math.max(maxV - minV, 1e-6)) * 0.92;
  const midU = (minU + maxU) / 2;
  const midV = (minV + maxV) / 2;
  const flip = frame.yUp ? 1 : -1;
  const project = (p: Vector3): Point => ({
    x: frame.width / 2 + (p.dot(right) - midU) * scale,
    y: frame.height / 2 + flip * (p.dot(up) - midV) * scale,
  });
  const drawing: SpaceDrawing = { strokes: [], section: [], dots: [], names: [] };
  const forward = right.cross(up);
  const stroke = (a: Vector3, b: Vector3, role: StrokeRole, dashed = false, part?: string) =>
    drawing.strokes.push({ from: project(a), to: project(b), role, dashed, ...(part ? { part } : {}) });
  const text = frame.textSize;
  if (frame.axes) {
    for (let axis = 0; axis < 3; axis++) {
      const reach = Math.max(box.high.axis(axis), 1);
      stroke(
        new Vector3(0, 0, 0),
        axis === 0 ? new Vector3(reach, 0, 0) : axis === 1 ? new Vector3(0, reach, 0) : new Vector3(0, 0, reach),
        "axis",
      );
    }
  }
  const solid = solidOf(figure.points);
  const solidCorners = solid ? cornersOf(solid) : [];
  const projectedCorners = solidCorners.map(project);
  const depths = solidCorners.map((corner) => corner.dot(forward));
  let hiddenCorner: number | null = null;
  if (solidCorners.length > 0) {
    hiddenCorner = hiddenCornerIndex(projectedCorners, depths);
    if (hiddenCorner === null) {
      const hull = convexHull(projectedCorners);
      if (hull.length >= 3)
        projectedCorners.forEach((point, index) => {
          if (onHullBoundary(point, hull)) return;
          if (hiddenCorner === null || depths[index]! > depths[hiddenCorner]!) hiddenCorner = index;
        });
    }
  }
  const dashedEdge = (a: Vector3, b: Vector3) => {
    if (hiddenCorner === null || hiddenCorner >= solidCorners.length) return false;
    const h = solidCorners[hiddenCorner]!;
    return a.minus(h).length < 1e-5 || b.minus(h).length < 1e-5;
  };
  if (solid && (figure.edges ?? []).length < 12) {
    for (let i = 0; i < 8; i++)
      for (const bit of [1, 2, 4]) {
        if (i & bit) continue;
        const other = i | bit;
        stroke(solidCorners[i]!, solidCorners[other]!, "frame", dashedEdge(solidCorners[i]!, solidCorners[other]!));
      }
  }
  const plane = figure.plane;
  const planeNormal = plane ? Vector3.from(plane.normal) : null;
  const planePoint = plane ? Vector3.from(plane.point) : null;
  if (plane && shows(plane.step) && planeNormal && planePoint) {
    const polygon = sectionOf(box, planeNormal, planePoint);
    if (polygon.length >= 3) {
      drawing.section = polygon.map(project);
      polygon.forEach((corner, index) =>
        stroke(corner, polygon[(index + 1) % polygon.length]!, "plane", false, "plane"),
      );
    }
  }
  const named = namedPoints(figure.points);
  for (const edge of figure.edges ?? []) {
    const found = ends(edge, named);
    if (found) stroke(found[0], found[1], "edge", dashedEdge(found[0], found[1]), edge);
  }
  let drawnLine: LineSpan | null = null;
  let lineAnchor: Point | null = null;
  if (figure.line && shows(figure.line.step)) {
    const span = lineSpan(figure, box, project, 1.2 * text);
    if (span) {
      drawnLine = span;
      stroke(span.first, span.last, "line", false, "line");
      const held = (figure.line.through ?? [])
        .map((name) => named.get(name))
        .filter((p): p is Vector3 => p !== undefined);
      lineAnchor = project(
        held.length >= 2 ? held[0]!.plus(held[1]!).times(0.5) : span.first.plus(span.last).times(0.5),
      );
    }
  }
  // Shown only on the steps that name them (Space3DController.onDemand): where the line meets the plane, worked out by
  // the app, and the plane's normal from the middle of its cut.
  if (plane && shows(plane.step) && planeNormal && planePoint && figure.line && shows(figure.line.step)) {
    const meeting = lineMeetsPlane(figure.line, plane);
    if (meeting) drawing.meeting = project(meeting);
  }
  if (plane && shows(plane.step) && planeNormal && planePoint && planeNormal.length > 1e-12) {
    const polygon = sectionOf(box, planeNormal, planePoint);
    if (polygon.length >= 3) {
      const centre = polygon.reduce((sum, corner) => sum.plus(corner), new Vector3(0, 0, 0)).times(1 / polygon.length);
      const span = Math.max(box.high.x - box.low.x, box.high.y - box.low.y, box.high.z - box.low.z, 1);
      drawing.normal = {
        from: project(centre),
        to: project(centre.plus(planeNormal.times((0.25 * span) / planeNormal.length))),
      };
    }
  }
  drawing.dots = figure.points.map((point) => ({ name: point.name, at: project(vector(point)) }));

  const placer = new LabelPlacer(
    new Rect(0.15 * text, 0.15 * text, frame.width - 0.15 * text, frame.height - 0.15 * text),
    0.12 * text,
  );
  for (const s of drawing.strokes) {
    if (s.role === "edge" || s.role === "line") placer.strokes.push([s.from, s.to]);
    else placer.faintStrokes.push([s.from, s.to]);
  }
  const dotSize = 0.5 * text;
  placer.dots = drawing.dots.map((dot) => Rect.centred(dot.at.x, dot.at.y, dotSize, dotSize));
  const runs: [Point, Point][] = drawnLine
    ? [
        [project(drawnLine.start), project(drawnLine.first)],
        [project(drawnLine.last), project(drawnLine.end)],
      ]
    : [];
  const runStart = placer.strokes.length;
  placer.strokes.push(...runs);
  const name = (string: string, role: NameRole, box: Rect) => drawing.names.push({ text: string, box, role });
  const besideFor = (point: Point, measured: { width: number; height: number }, towards: number | null) =>
    LabelPlacer.beside(point, measured.width, measured.height, 0.3 * text, 0.25 * text, 3 * text, towards, frame.yUp);
  if (frame.axes) {
    const axes = drawing.strokes.filter((s) => s.role === "axis");
    axes.forEach((s, index) => {
      const axisName = ["x", "y", "z"][index]!;
      const along = (Math.atan2((s.to.y - s.from.y) * flip, s.to.x - s.from.x) * 180) / Math.PI;
      name(axisName, "axis", placer.place(besideFor(s.to, measure(axisName, "axis"), along), s.to));
    });
  }
  const centre: Point =
    drawing.dots.length === 0
      ? project(new Vector3(0, 0, 0))
      : {
          x: drawing.dots.reduce((sum, dot) => sum + dot.at.x, 0) / drawing.dots.length,
          y: drawing.dots.reduce((sum, dot) => sum + dot.at.y, 0) / drawing.dots.length,
        };
  const away = (point: Point): number | null => {
    const dx = point.x - centre.x;
    const dy = (point.y - centre.y) * flip;
    return dx * dx + dy * dy > 1e-12 ? (Math.atan2(dy, dx) * 180) / Math.PI : null;
  };
  drawing.dots.forEach((dot, index) => {
    const local = placer.copy();
    local.dots.splice(index, 1);
    const box = local.place(besideFor(dot.at, measure(dot.name, "vertex"), away(dot.at)), dot.at);
    placer.labels.push(box);
    name(dot.name, "vertex", box);
  });
  const lineIndex = drawing.strokes.findIndex((s) => s.role === "line");
  if (drawnLine && lineIndex >= 0) {
    const run = (inner: Vector3, outer: Vector3): Point => {
      const a = project(inner);
      const b = project(outer);
      const length = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
      if (!(length > 1e-9)) return a;
      const hits = drawing.names
        .map((entry) => entry.box.padded(placer.padding).entry([a.x, a.y], [b.x, b.y]))
        .filter((t): t is number => t !== null);
      const hit = hits.length > 0 ? Math.min(...hits) : 1;
      const t = hit >= 1 ? 1 : Math.max(0, hit - (0.15 * text) / length);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    };
    const start = run(drawnLine.first, drawnLine.start);
    const end = run(drawnLine.last, drawnLine.end);
    drawing.strokes[lineIndex] = { from: start, to: end, role: "line", dashed: false };
    placer.strokes.splice(runStart, runs.length, [start, project(drawnLine.first)], [project(drawnLine.last), end]);
  }
  const lineStroke = drawing.strokes.find((s) => s.role === "line");
  if (figure.line && lineAnchor && lineStroke) {
    const lineName = figure.line.name ? figure.line.name : (figure.line.through ?? []).slice(0, 2).join("");
    if (lineName !== "") {
      const dx = lineStroke.to.x - lineStroke.from.x;
      const dy = (lineStroke.to.y - lineStroke.from.y) * flip;
      let normal = (Math.atan2(dx, -dy) * 180) / Math.PI;
      const out = away(lineAnchor);
      if (out !== null && Math.abs(difference(normal, out)) > 90) normal += 180;
      name(lineName, "line", placer.place(besideFor(lineAnchor, measure(lineName, "line"), normal)));
    }
  }
  if (plane?.name && drawing.section.length > 0) {
    const middle = {
      x: drawing.section.reduce((sum, p) => sum + p.x, 0) / drawing.section.length,
      y: drawing.section.reduce((sum, p) => sum + p.y, 0) / drawing.section.length,
    };
    const measured = measure(plane.name, "plane");
    const start = Rect.centred(middle.x, middle.y, measured.width, measured.height);
    name(plane.name, "plane", placer.place(LabelPlacer.around(start, 0.25 * text, 3 * text)));
  }
  if (labelOrigin && !figure.points.some((point) => point.name === "O")) {
    const originAt = drawing.dots.find((dot) => dot.name === "A")?.at ?? project(new Vector3(0, 0, 0));
    name("O", "origin", placer.place(besideFor(originAt, measure("O", "origin"), away(originAt)), originAt));
  }
  return drawing;
}

/** The point of the line on the plane (Space3DScene.meet); null when parallel (or either is missing). */
export function lineMeetsPlane(line: SpaceLine | null, plane: SpacePlane | null): Vector3 | null {
  if (!line || !plane) return null;
  const p = Vector3.from(line.point);
  const d = Vector3.from(line.direction);
  const q = Vector3.from(plane.point);
  const n = Vector3.from(plane.normal);
  if (!p || !d || !q || !n) return null;
  const denominator = n.dot(d);
  if (Math.abs(denominator) <= 1e-9 * Math.max(n.length * d.length, 1e-12)) return null;
  const k = n.dot(q.minus(p)) / denominator;
  const point = p.plus(d.times(k));
  return [point.x, point.y, point.z].every(Number.isFinite) ? point : null;
}
