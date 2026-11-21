// Port of GridMesh, GenericPiece and GenericSolidBuilder in LearnLayer/Explanation/Figure3DGeneric.swift
// @ ref 2026-11-04: the pieces of a generic solid in scene space (y up), centred and scaled to about 4 across, as
// meshes and lines any 3D view can draw (three.js on Windows, SceneKit on the Mac). Null when the figure can't be
// drawn honestly (too little of it defined, crossing its axis, top under bottom): the caller falls back to 2D.

import type { GenericSolid, SafeFormula, SectionShape, SolidAxis, SolidDomain } from "./solid";

export type V3 = [number, number, number];

const finite = (p: V3) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]);
const nan: V3 = [NaN, NaN, NaN];

/** A grid of vertices, rows × columns, NaN where undefined; triangles touching an undefined vertex are left out. */
export class GridMesh {
  positions: V3[];

  constructor(
    readonly rows: number,
    readonly columns: number,
    point: (i: number, j: number) => V3,
  ) {
    this.positions = [];
    for (let i = 0; i < rows; i += 1) for (let j = 0; j < columns; j += 1) this.positions.push(point(i, j));
  }

  get finiteFraction(): number {
    return this.positions.length === 0 ? 0 : this.positions.filter(finite).length / this.positions.length;
  }

  get indices(): number[] {
    const result: number[] = [];
    for (let i = 0; i < this.rows - 1; i += 1) {
      for (let j = 0; j < this.columns - 1; j += 1) {
        const v0 = i * this.columns + j;
        const v1 = v0 + 1;
        const v2 = v0 + this.columns;
        const v3 = v2 + 1;
        const p = this.positions;
        if (finite(p[v0]!) && finite(p[v1]!) && finite(p[v2]!)) result.push(v0, v1, v2);
        if (finite(p[v1]!) && finite(p[v3]!) && finite(p[v2]!)) result.push(v1, v3, v2);
      }
    }
    return result;
  }

  transform(change: (p: V3) => V3): void {
    this.positions = this.positions.map((p) => (finite(p) ? change(p) : p));
  }
}

export type PieceLook = "surface" | "inner" | "accentFace" | "accentLine" | "line";

/** One named piece of a generic figure; the mascot's `figureHighlight` names it. */
export interface GenericPiece {
  name: string;
  look: PieceLook;
  mesh: GridMesh | null;
  line: V3[];
}

export interface BuiltSolid {
  pieces: GenericPiece[];
  /** Maths axes after centring and scaling: where x, y, z run in the scene, and their names. */
  axes: { start: V3; end: V3; name: string }[];
}

const piece = (name: string, look: PieceLook, mesh: GridMesh | null, line: V3[] = []): GenericPiece => ({
  name,
  look,
  mesh,
  line,
});

const samples = (a: number, b: number, count: number) =>
  Array.from({ length: count + 1 }, (_, index) => a + ((b - a) * index) / count);

/** Maths (x, y, z) with z up to scene (x, z, −y). */
const scene = (x: number, y: number, z: number): V3 =>
  Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? [x, z, -y] : nan;

/** Values far outside the bulk (a pole) are left out rather than drawn as a spike. */
function trimmed(values: number[]): (value: number) => number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length <= 10) return (value) => value;
  const lo = sorted[Math.floor((sorted.length - 1) * 0.02)]!;
  const hi = sorted[Math.floor((sorted.length - 1) * 0.98)]!;
  const pad = Math.max((hi - lo) * 0.5, 1e-6);
  return (value) => (value >= lo - pad && value <= hi + pad ? value : NaN);
}

type V2 = [number, number];

export const GenericSolidBuilder = {
  /** The part names the mascot may point at, in the order a step-by-step assembly shows them. */
  names: ["region", "curve", "curve2", "axis", "surface", "inner", "ends", "section", "cutPlane"],
  /** Other words for a part. */
  aliases: {
    disc: "section",
    washer: "section",
    shell: "section",
    plane: "cutPlane",
    solid: "surface",
    f: "curve",
    g: "curve2",
    hole: "inner",
    base: "region",
  } as Record<string, string>,
  curveSamples: 96,
  /** The slice that travels [a, b] on the step that writes the volume's integral. */
  sweep: "sweep",
  sweepCount: 16,
  turnSamples: 64,
  gridSamples: 72,
  /** The share of finite values a curve or surface must have to be drawn. */
  minimumDefined: 0.6,
  maxSpan: 1000,

  /** The named parts drawn, in assembly order. */
  order(built: BuiltSolid): string[] {
    return GenericSolidBuilder.names.filter((name) => built.pieces.some((part) => part.name === name));
  },

  build(solid: GenericSolid): BuiltSolid | null {
    let pieces: GenericPiece[] | null;
    // Maths (x, y, z) to scene: a revolution keeps y up; the rest put z up.
    let zUp = true;
    const kind = solid.kind;
    switch (kind.kind) {
      case "revolution":
        pieces = revolution(kind.f, kind.g, kind.axis, kind.a, kind.b);
        zUp = false;
        break;
      case "surface":
        pieces = surface(kind.z, kind.x, kind.y);
        break;
      case "parametric":
        pieces = parametric(kind.x, kind.y, kind.z, kind.u, kind.v);
        break;
      case "bounded":
        pieces = bounded(kind.top, kind.bottom, kind.domain);
        break;
      case "sections":
        pieces = sections(kind.f, kind.g, kind.a, kind.b, kind.shape);
        break;
    }
    if (!pieces) return null;
    // Bounds of everything drawn.
    const low: V3 = [Infinity, Infinity, Infinity];
    const high: V3 = [-Infinity, -Infinity, -Infinity];
    for (const part of pieces) {
      for (const p of [...(part.mesh?.positions ?? []), ...part.line]) {
        if (!finite(p)) continue;
        for (let axis = 0; axis < 3; axis += 1) {
          low[axis] = Math.min(low[axis]!, p[axis]!);
          high[axis] = Math.max(high[axis]!, p[axis]!);
        }
      }
    }
    if (!Number.isFinite(low[0]) || !Number.isFinite(high[0])) return null;
    // Cut planes, across the figure.
    for (const plane of solid.planes) {
      const axis = zUp ? [0, 2, 1][plane.axis]! : plane.axis;
      const sign = zUp && plane.axis === 1 ? -1 : 1;
      const value = plane.value * sign;
      const lo = low.map((l, index) => l - ((high[index]! - l) * 0.08 + 0.1));
      const hi = high.map((h, index) => h + ((h - low[index]!) * 0.08 + 0.1));
      const others = [0, 1, 2].filter((index) => index !== axis);
      const mesh = new GridMesh(2, 2, (i, j) => {
        const p: V3 = [0, 0, 0];
        p[axis] = value;
        p[others[0]!] = i === 0 ? lo[others[0]!]! : hi[others[0]!]!;
        p[others[1]!] = j === 0 ? lo[others[1]!]! : hi[others[1]!]!;
        return p;
      });
      pieces.push(piece("cutPlane", "accentFace", mesh));
      low[axis] = Math.min(low[axis]!, value);
      high[axis] = Math.max(high[axis]!, value);
    }
    const span: V3 = [high[0] - low[0], high[1] - low[1], high[2] - low[2]];
    const size = Math.max(span[0], span[1], span[2], 1e-3);
    const middle: V3 = [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2];
    // A very flat or very tall figure is not squashed: the scale is the same on all axes.
    const scale = 4 / size;
    const place = (p: V3): V3 => [(p[0] - middle[0]) * scale, (p[1] - middle[1]) * scale, (p[2] - middle[2]) * scale];
    for (const part of pieces) {
      part.mesh?.transform(place);
      part.line = part.line.map(place);
    }
    // Axes through the maths origin when it is near, else through the figure's corner.
    const origin: V3 = [0, 0, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      if (origin[axis]! < low[axis]! - span[axis]! * 0.5 || origin[axis]! > high[axis]! + span[axis]! * 0.5)
        origin[axis] = low[axis]!;
    }
    const lowP = place(low);
    const highP = place(high);
    const o = place(origin);
    // Scene axes: x right, then up, then toward the viewer.
    const names = zUp ? ["x", "z", "y"] : ["x", "y", "z"];
    const axes = [0, 1, 2].map((axis) => {
      const start: V3 = [...o];
      const end: V3 = [...o];
      if (zUp && axis === 2) {
        // Maths y runs into the screen (scene −z).
        start[axis] = Math.max(highP[axis]!, o[axis]!) + 0.4;
        end[axis] = Math.min(lowP[axis]!, o[axis]!) - 0.6;
      } else {
        start[axis] = Math.min(lowP[axis]!, o[axis]!) - 0.4;
        end[axis] = Math.max(highP[axis]!, o[axis]!) + 0.6;
      }
      return { start, end, name: names[axis]! };
    });
    return { pieces, axes };
  },
};

function revolution(
  f: SafeFormula,
  g: SafeFormula | null,
  axis: SolidAxis,
  a: number,
  b: number,
): GenericPiece[] | null {
  const { curveSamples, turnSamples, sweepCount, minimumDefined, sweep } = GenericSolidBuilder;
  const xs = samples(a, b, curveSamples);
  const fs = xs.map((x) => f.valueAt(x));
  const k = axis.k;
  // Without g, the region reaches down to the x-axis.
  const gs = xs.map((x) => (g ? g.valueAt(x) : 0));
  const defined = fs.filter((value, index) => Number.isFinite(value) && Number.isFinite(gs[index]!)).length;
  if (defined / xs.length < minimumDefined) return null;
  // The region must lie on one side of the axis, or the turned solid is not what it seems.
  if (axis.kind === "horizontal") {
    const sides = fs
      .flatMap((value, index) => [value - k, gs[index]! - k])
      .filter((value) => Number.isFinite(value) && Math.abs(value) > 1e-9);
    if (!(sides.every((value) => value > 0) || sides.every((value) => value < 0))) return null;
  } else if (!(a >= k - 1e-9 || b <= k + 1e-9)) return null;
  // Turned about the axis: a point (px, py) to scene space (y up).
  const turn = (px: number, py: number, theta: number): V3 => {
    if (!Number.isFinite(px) || !Number.isFinite(py)) return nan;
    return axis.kind === "horizontal"
      ? [px, k + (py - k) * Math.cos(theta), (py - k) * Math.sin(theta)]
      : [k + (px - k) * Math.cos(theta), py, (px - k) * Math.sin(theta)];
  };
  const revolve = (points: V2[]) =>
    new GridMesh(points.length, turnSamples + 1, (i, j) =>
      turn(points[i]![0], points[i]![1], (2 * Math.PI * j) / turnSamples),
    );
  const segment = (from: V2, to: V2, count = 8): V2[] =>
    Array.from({ length: count + 1 }, (_, index) => [
      from[0] + ((to[0] - from[0]) * index) / count,
      from[1] + ((to[1] - from[1]) * index) / count,
    ]);
  const fCurve: V2[] = xs.map((x, index) => [x, fs[index]!]);
  const gCurve: V2[] = xs.map((x, index) => [x, gs[index]!]);
  // A g on the axis itself turns into nothing: a disc, not a washer.
  const gIsAxis =
    axis.kind === "horizontal" && gs.every((value) => !Number.isFinite(value) || Math.abs(value - k) < 1e-9);
  const flat = (curve: V2[]): V3[] =>
    curve.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).map((p): V3 => [p[0], p[1], 0]);
  const pieces: GenericPiece[] = [
    // The flat region, in the plane z = 0.
    piece(
      "region",
      "accentFace",
      new GridMesh(xs.length, 2, (i, j) => {
        const p = j === 0 ? gCurve[i]! : fCurve[i]!;
        return [p[0], p[1], 0];
      }),
    ),
    piece("curve", "accentLine", null, flat(fCurve)),
  ];
  if (g) pieces.push(piece("curve2", "accentLine", null, flat(gCurve)));
  // The axis line, a little past the region.
  const pad = (b - a) * 0.15;
  if (axis.kind === "horizontal") {
    pieces.push(
      piece("axis", "line", null, [
        [a - pad, k, 0],
        [b + pad, k, 0],
      ]),
    );
  } else {
    const ys = [...fs, ...gs].filter(Number.isFinite);
    const lo = Math.min(ys.length > 0 ? Math.min(...ys) : 0, 0);
    const hi = Math.max(ys.length > 0 ? Math.max(...ys) : 1, 0);
    const extra = (hi - lo) * 0.15;
    pieces.push(
      piece("axis", "line", null, [
        [k, lo - extra, 0],
        [k, hi + extra, 0],
      ]),
    );
  }
  pieces.push(piece("surface", "surface", revolve(fCurve)));
  if (!gIsAxis) pieces.push(piece("inner", "inner", revolve(gCurve)));
  // The ends (discs or rings) where f and g don't meet.
  for (const index of [0, xs.length - 1]) {
    const top = fCurve[index]!;
    const bottom = gCurve[index]!;
    if (Number.isFinite(top[1]) && Number.isFinite(bottom[1]) && Math.abs(top[1] - bottom[1]) > 1e-6)
      pieces.push(piece("ends", "inner", revolve(segment(bottom, top))));
  }
  // One cross-section halfway: a disc or washer (about y = k), a shell (about x = k).
  const mid = Math.floor(xs.length / 2);
  if (Number.isFinite(fCurve[mid]![1]) && Number.isFinite(gCurve[mid]![1]))
    pieces.push(piece("section", "accentFace", revolve(segment(gCurve[mid]!, fCurve[mid]!))));
  // The same slice at points along [a, b], each with its own radii.
  for (let i = 0; i < sweepCount; i += 1) {
    const index = Math.round((i / (sweepCount - 1)) * (xs.length - 1));
    if (!Number.isFinite(fCurve[index]![1]) || !Number.isFinite(gCurve[index]![1])) continue;
    pieces.push(piece(sweep, "accentFace", revolve(segment(gCurve[index]!, fCurve[index]!))));
  }
  return pieces;
}

function surface(z: SafeFormula, x: [number, number], y: [number, number]): GenericPiece[] | null {
  const { gridSamples, minimumDefined } = GenericSolidBuilder;
  const xs = samples(x[0], x[1], gridSamples);
  const ys = samples(y[0], y[1], gridSamples);
  const values = xs.map((px) => ys.map((py) => z.value({ x: px, y: py })));
  const keep = trimmed(values.flat());
  const mesh = new GridMesh(xs.length, ys.length, (i, j) => scene(xs[i]!, ys[j]!, keep(values[i]![j]!)));
  if (mesh.finiteFraction < minimumDefined) return null;
  const region = new GridMesh(2, 2, (i, j) => scene(i === 0 ? x[0] : x[1], j === 0 ? y[0] : y[1], 0));
  return [piece("region", "accentFace", region), piece("surface", "surface", mesh)];
}

function parametric(
  x: SafeFormula,
  y: SafeFormula,
  z: SafeFormula,
  u: [number, number],
  v: [number, number],
): GenericPiece[] | null {
  const { gridSamples, minimumDefined, maxSpan } = GenericSolidBuilder;
  const us = samples(u[0], u[1], gridSamples);
  const vs = samples(v[0], v[1], gridSamples);
  const mesh = new GridMesh(us.length, vs.length, (i, j) => {
    const values = { u: us[i]!, v: vs[j]! };
    const p = scene(x.value(values), y.value(values), z.value(values));
    return Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])) <= maxSpan ? p : nan;
  });
  if (mesh.finiteFraction < minimumDefined) return null;
  return [piece("surface", "surface", mesh)];
}

function bounded(top: SafeFormula, bottom: SafeFormula, domain: SolidDomain): GenericPiece[] | null {
  const n = GenericSolidBuilder.gridSamples / 2;
  // (s, t) ∈ [0, 1]² onto the base.
  const base = (s: number, t: number): [number, number] => {
    const x = domain.x[0] + (domain.x[1] - domain.x[0]) * s;
    if (domain.y) return [x, domain.y[0] + (domain.y[1] - domain.y[0]) * t];
    const low = domain.yLow?.valueAt(x) ?? NaN;
    const high = domain.yHigh?.valueAt(x) ?? NaN;
    return [x, low + (high - low) * t];
  };
  let crossings = 0;
  let checked = 0;
  for (let i = 0; i <= n; i += 1) {
    for (let j = 0; j <= n; j += 1) {
      const [x, y] = base(i / n, j / n);
      const t = top.value({ x, y });
      const b = bottom.value({ x, y });
      if (!Number.isFinite(t) || !Number.isFinite(b)) continue;
      checked += 1;
      if (t < b - 1e-9) crossings += 1;
    }
  }
  // Top under bottom: not the solid the formulas say.
  if (checked === 0 || crossings > 0) return null;
  if (!domain.y) {
    for (let i = 0; i <= n; i += 1) {
      const x = base(i / n, 0)[0];
      if ((domain.yHigh?.valueAt(x) ?? 0) < (domain.yLow?.valueAt(x) ?? 0) - 1e-9) return null;
    }
  }
  const sheet = (formula: SafeFormula) =>
    new GridMesh(n + 1, n + 1, (i, j) => {
      const [x, y] = base(i / n, j / n);
      return scene(x, y, formula.value({ x, y }));
    });
  const topSheet = sheet(top);
  const bottomSheet = sheet(bottom);
  const { minimumDefined } = GenericSolidBuilder;
  if (topSheet.finiteFraction < minimumDefined || bottomSheet.finiteFraction < minimumDefined) return null;
  const pieces = [
    piece(
      "region",
      "accentFace",
      new GridMesh(n + 1, n + 1, (i, j) => {
        const [x, y] = base(i / n, j / n);
        return scene(x, y, 0);
      }),
    ),
    piece("surface", "surface", topSheet),
    piece("inner", "inner", bottomSheet),
  ];
  // The four walls, from bottom to top along the base's edges.
  const edges: ((value: number) => [number, number])[] = [
    (value) => [0, value],
    (value) => [1, value],
    (value) => [value, 0],
    (value) => [value, 1],
  ];
  for (const edge of edges) {
    pieces.push(
      piece(
        "ends",
        "inner",
        new GridMesh(n + 1, 2, (i, j) => {
          const [s, t] = edge(i / n);
          const [x, y] = base(s, t);
          return scene(x, y, (j === 0 ? bottom : top).value({ x, y }));
        }),
      ),
    );
  }
  return pieces;
}

function sections(f: SafeFormula, g: SafeFormula, a: number, b: number, shape: SectionShape): GenericPiece[] | null {
  const { curveSamples, minimumDefined, sweepCount, sweep } = GenericSolidBuilder;
  const xs = samples(a, b, curveSamples);
  const widths = xs.map((x) => f.valueAt(x) - g.valueAt(x));
  const defined = widths.filter(Number.isFinite);
  if (
    defined.length / xs.length < minimumDefined ||
    !(defined.every((w) => w >= -1e-9) || defined.every((w) => w <= 1e-9))
  )
    return null;
  /** The section's outline, t ∈ [0, 1], as (across from g, height) for width w. */
  const outline = (w: number, t: number): [number, number] => {
    if (shape === "square") {
      // Standing up from the base whichever side g lies (height |w|, as the other shapes).
      const side = Math.abs(w);
      if (t < 1 / 3) return [0, 3 * t * side];
      if (t < 2 / 3) return [(3 * t - 1) * w, side];
      return [w, (3 - 3 * t) * side];
    }
    if (shape === "semicircle") {
      const angle = Math.PI * (1 - t);
      return [w / 2 + (w / 2) * Math.cos(angle), (Math.abs(w) / 2) * Math.sin(angle)];
    }
    return [t * w, ((Math.abs(w) * Math.sqrt(3)) / 2) * (1 - Math.abs(2 * t - 1))];
  };
  const steps = 48;
  const mesh = new GridMesh(xs.length, steps + 1, (i, j) => {
    const x = xs[i]!;
    const [across, height] = outline(widths[i]!, j / steps);
    return scene(x, g.valueAt(x) + across, height);
  });
  const baseMesh = new GridMesh(xs.length, 2, (i, j) => {
    const x = xs[i]!;
    return scene(x, (j === 0 ? g : f).valueAt(x), 0);
  });
  const slice = (index: number) =>
    new GridMesh(steps + 1, 2, (i, j) => {
      const x = xs[index]!;
      const w = widths[index]!;
      const [across, height] = j === 0 ? [w / 2, 0] : outline(w, i / steps);
      return scene(x, g.valueAt(x) + across, height);
    });
  const curve = (formula: SafeFormula): V3[] => xs.map((x) => scene(x, formula.valueAt(x), 0)).filter(finite);
  const travelling = Array.from({ length: sweepCount }, (_, i) =>
    piece(sweep, "accentFace", slice(Math.round((i / (sweepCount - 1)) * (xs.length - 1)))),
  );
  return [
    piece("region", "accentFace", baseMesh),
    piece("curve", "accentLine", null, curve(f)),
    piece("curve2", "accentLine", null, curve(g)),
    piece("surface", "surface", mesh),
    piece("section", "accentFace", slice(Math.floor(xs.length / 2))),
    ...travelling,
  ];
}
