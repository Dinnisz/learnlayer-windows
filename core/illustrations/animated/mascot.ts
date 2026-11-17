// Port of LearnLayer/Illustrations/PremadeFigureMascot.swift @ ref 2026-11-04: the mascot sphere's trip into a physics
// scene (it glides from where the tutor rests to its target and its outline flows into the scene's object), smooth
// paths, the car's side view, a rounded box turned on a slope, and the canvas pieces these scenes draw with.

import { CompiledIllustration } from "../illustration";
import { Anim, FigureCanvas } from "./figureCanvas";

export interface Point {
  x: number;
  y: number;
}

/** Whether the student keeps the mascot on (Settings › General); the app sets this from its preference. */
let mascotShown: () => boolean = () => true;

/** Sets where the scenes read the mascot preference from (`AppPreferences.standard.mascotEnabled` on the Mac). */
export function setMascotPreference(read: () => boolean): void {
  mascotShown = read;
}

/**
 * The mascot sphere's trip into a physics scene: it starts where the tutor's body rests (the stage passes that point
 * as `mascotX`, `mascotY`; the corner stands in when there is no stage), glides slowly (calm ease, a small hop) to
 * `target`, and its outline then morphs, with a gentle spring, into the object of the scene.
 */
export class MascotTrip {
  readonly corner = CompiledIllustration.defaultMascotStart;
  constructor(
    readonly target: Point,
    readonly radius = 0.3,
    /** False when Settings turned the mascot off: the object is there from the first frame. */
    readonly shown = mascotShown(),
    readonly hop = 0.4,
  ) {}

  get moveStart(): number {
    return this.shown ? 0.4 : 0.1;
  }
  get moveEnd(): number {
    return this.shown ? 3.6 : 0.3;
  }
  get morphStart(): number {
    return this.shown ? 3.0 : 0.1;
  }
  get morphEnd(): number {
    return this.shown ? 4.6 : 0.3;
  }
  get travel(): string {
    return this.shown ? Anim.smootherRamp(this.moveStart, this.moveEnd) : "1";
  }
  get morph(): string {
    return this.shown ? Anim.springRamp(this.morphStart, this.morphEnd) : "1";
  }
  /** Where the sphere is on its way; it rests at `target`. */
  get x(): string {
    return `mascotX+(${Anim.lit(this.target.x)}-mascotX)*${this.travel}`;
  }
  get y(): string {
    return `mascotY+(${Anim.lit(this.target.y)}-mascotY)*${this.travel}+${Anim.lit(this.hop)}*sin(pi*${this.travel})`;
  }
  /** Until this second the stage's own body is out of its corner, standing in the figure. */
  get holdsUntil(): number {
    return this.morphEnd;
  }
}

/** A path built from straight runs and cubic Béziers, sampled densely. */
export class SmoothPath {
  readonly points: Point[];

  constructor(start: Point) {
    this.points = [start];
  }

  line(end: Point): void {
    this.points.push(end);
  }

  curve(end: Point, c1: Point, c2: Point, steps = 8): void {
    const start = this.points[this.points.length - 1];
    if (!start) return;
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const u = 1 - t;
      this.points.push({
        x: u * u * u * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * end.x,
        y: u * u * u * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * end.y,
      });
    }
  }

  /** Half a circle over the top, from the left end to the right end. */
  arch(centre: Point, radius: number, steps = 10): void {
    for (let step = 1; step <= steps; step++) {
      const angle = Math.PI * (1 - step / steps);
      this.points.push({ x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) });
    }
  }
}

/** `count` segments of equal length along `points`, as the evenly spaced outline a `.shape` morphs from a circle into. */
export function resampled(points: Point[], count: number): number[][] {
  if (points.length <= 1) return points.map((point) => [point.x, point.y]);
  const lengths = [0];
  for (let index = 1; index < points.length; index++)
    lengths.push(
      lengths[index - 1]! +
        Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y),
    );
  const total = Math.max(lengths[lengths.length - 1]!, 1e-9);
  const result: number[][] = [];
  let segment = 0;
  for (let step = 0; step <= count; step++) {
    const target = (total * step) / count;
    while (segment < points.length - 2 && lengths[segment + 1]! < target) segment += 1;
    const span = Math.max(lengths[segment + 1]! - lengths[segment]!, 1e-9);
    const along = Math.max(0, Math.min(1, (target - lengths[segment]!) / span));
    result.push([
      points[segment]!.x + (points[segment + 1]!.x - points[segment]!.x) * along,
      points[segment]!.y + (points[segment + 1]!.y - points[segment]!.y) * along,
    ]);
  }
  return result;
}

/** Side view of a small hatchback facing right, feet (lowest point of the wheels) at y = 0. */
export const CarArt = (() => {
  /** Everything is drawn for a 1.8-long car and scaled by this. */
  const k = 1.25;
  const wheelRadius = 0.2 * k;
  const wheelXs = [-0.42 * k, 0.42 * k] as const;
  const archRadius = 0.24 * k;
  const sill = 0.2 * k;
  /** Half the height of the silhouette: the car's centre above the ground. */
  const halfHeight = 0.41 * k;
  const p = (x: number, y: number): Point => ({ x: x * k, y: y * k });

  /** Body outline, counter-clockwise from the left end of the rear arch, with round arches over the wheels. */
  const outline = (): Point[] => {
    const path = new SmoothPath({ x: wheelXs[0] - archRadius, y: sill });
    path.arch(p(wheelXs[0], sill), archRadius);
    path.line({ x: wheelXs[1] - archRadius, y: sill });
    path.arch(p(wheelXs[1], sill), archRadius);
    path.line({ x: 0.77 * k, y: sill });
    path.curve(p(0.89, 0.34), p(0.88, 0.2), p(0.89, 0.25));
    path.curve(p(0.72, 0.52), p(0.89, 0.45), p(0.84, 0.5));
    path.curve(p(0.36, 0.6), p(0.55, 0.54), p(0.45, 0.56));
    path.curve(p(0.1, 0.8), p(0.28, 0.64), p(0.22, 0.77));
    path.curve(p(-0.38, 0.76), p(-0.05, 0.84), p(-0.25, 0.84));
    path.curve(p(-0.66, 0.55), p(-0.48, 0.68), p(-0.55, 0.58));
    path.curve(p(-0.89, 0.4), p(-0.78, 0.54), p(-0.88, 0.52));
    path.curve({ x: -0.77 * k, y: sill }, p(-0.9, 0.3), p(-0.89, 0.22));
    path.line({ x: wheelXs[0] - archRadius, y: sill });
    return path.points;
  };

  /** Closed glass shapes, front and rear. */
  const windows = (): Point[][] => {
    const front = new SmoothPath(p(0.04, 0.6));
    front.line(p(0.04, 0.77));
    front.curve(p(0.3, 0.6), p(0.14, 0.79), p(0.22, 0.72));
    const rear = new SmoothPath(p(-0.06, 0.6));
    rear.line(p(-0.06, 0.77));
    rear.curve(p(-0.47, 0.6), p(-0.2, 0.8), p(-0.37, 0.74));
    return [front.points, rear.points];
  };

  return {
    k,
    wheelRadius,
    wheelXs,
    archRadius,
    sill,
    halfHeight,
    p,
    outline,
    /** The outline around its centre, for the morph. */
    centred: () => outline().map((point) => ({ x: point.x, y: point.y - halfHeight })),
    windows,
  };
})();

/** A rounded rectangle turned by `angle`, around its centre, counter-clockwise from its lower-left corner. */
export function rotatedBox(width: number, height: number, angle: number, chamfer = 0.07): Point[] {
  const w = width / 2;
  const h = height / 2;
  let local = new SmoothPath({ x: -w + chamfer, y: -h });
  const c = chamfer;
  const k = 0.45 * chamfer;
  if (c > 0) {
    local.line({ x: w - c, y: -h });
    local.curve({ x: w, y: -h + c }, { x: w - k, y: -h }, { x: w, y: -h + k }, 4);
    local.line({ x: w, y: h - c });
    local.curve({ x: w - c, y: h }, { x: w, y: h - k }, { x: w - k, y: h }, 4);
    local.line({ x: -w + c, y: h });
    local.curve({ x: -w, y: h - c }, { x: -w + k, y: h }, { x: -w, y: h - k }, 4);
    local.line({ x: -w, y: -h + c });
    local.curve({ x: -w + c, y: -h }, { x: -w, y: -h + k }, { x: -w + k, y: -h }, 4);
  } else {
    local = new SmoothPath({ x: -w, y: -h });
    for (const [x, y] of [
      [w, -h],
      [w, h],
      [-w, h],
    ] as const)
      local.line({ x, y });
  }
  const turnCos = Math.cos(angle);
  const turnSin = Math.sin(angle);
  return local.points.map((point) => ({
    x: point.x * turnCos - point.y * turnSin,
    y: point.x * turnSin + point.y * turnCos,
  }));
}

/** Points around an ellipse, for small filled details. */
export function ellipsePoints(centre: Point, rx: number, ry: number, count = 14): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / count;
    return { x: centre.x + rx * Math.cos(angle), y: centre.y + ry * Math.sin(angle) };
  });
}

// MARK: Drawing

/** A `.shape` element: a fixed outline placed at an expression origin. */
export function shapeElement(
  canvas: FigureCanvas,
  points: number[][],
  x: string,
  y: string,
  options: {
    scaleX?: string | null;
    scaleY?: string | null;
    radius?: string | null;
    morph?: string | null;
    from?: string | null;
    to?: string | null;
    color: string;
    fill?: number | null;
    stroke?: boolean;
    visible?: string | null;
  },
): void {
  canvas.elements.push({
    kind: "shape",
    x,
    y,
    r: options.radius ?? null,
    w: options.scaleX ?? null,
    h: options.scaleY ?? null,
    color: options.color,
    fill: options.fill ?? null,
    stroke: options.stroke === false ? false : null,
    from: options.from ?? null,
    to: options.to ?? null,
    morph: options.morph ?? null,
    points,
    visible: options.visible ?? null,
  });
}

/** One closed shape that is the mascot sphere at first and the outline `shape` (around its centre) once `trip.morph`
 * reaches 1: every point of the circle slides to its place on the outline. */
export function mascotBody(
  canvas: FigureCanvas,
  trip: MascotTrip,
  centerX: string,
  centerY: string,
  shape: Point[],
  color = "accent",
  fill = 0.92,
): void {
  const first = shape[0];
  if (!first) return;
  shapeElement(canvas, resampled([...shape, first], 160), centerX, centerY, {
    radius: Anim.lit(trip.radius),
    morph: trip.morph,
    color,
    fill,
    stroke: false,
  });
}

/** A closed shape (points around an expression origin), outlined and softly filled. */
export function shape(
  canvas: FigureCanvas,
  points: Point[],
  originX: string,
  originY: string,
  options: { color: string; fill?: number | null; stroke?: boolean; visible?: string | null },
): void {
  const first = points[0];
  if (!first) return;
  shapeElement(
    canvas,
    [...points, first].map((point) => [point.x, point.y]),
    originX,
    originY,
    options,
  );
}

/** A flat ellipse filled in soft layers: a shadow without hard edges. */
export function softShadow(
  canvas: FigureCanvas,
  centerX: string,
  centerY: string,
  halfWidth: string,
  halfHeight: number,
  options: { strength?: number; visible?: string | null } = {},
): void {
  const strength = options.strength ?? 0.3;
  const unit = ellipsePoints({ x: 0, y: 0 }, 1, 1, 40);
  const closed = [...unit, unit[0]!].map((point) => [point.x, point.y]);
  for (const [scale, opacity] of [
    [1.0, strength * 0.5],
    [0.78, strength * 0.7],
    [0.55, strength],
  ] as const)
    shapeElement(canvas, closed, centerX, centerY, {
      scaleX: `${Anim.lit(scale)}*(${halfWidth})`,
      scaleY: Anim.lit(scale * halfHeight),
      color: "shadow",
      fill: opacity,
      stroke: false,
      visible: options.visible ?? null,
    });
}

/** An arc of a circle around an expression centre between two angles (radians), drawn to the fraction `progress`. */
export function arc(
  canvas: FigureCanvas,
  centerX: string,
  centerY: string,
  radius: number,
  from: number,
  to: number,
  options: { shift?: Point; progress?: string; color: string; visible?: string | null },
): void {
  const shift = options.shift ?? { x: 0, y: 0 };
  const points = Array.from({ length: 25 }, (_, step) => {
    const angle = from + ((to - from) * step) / 24;
    return [shift.x + radius * Math.cos(angle), shift.y + radius * Math.sin(angle)];
  });
  shapeElement(canvas, points, centerX, centerY, {
    from: "0",
    to: options.progress ?? "1",
    color: options.color,
    visible: options.visible ?? null,
  });
}

/** The app's mascot face on the orb: the thin white ring round it and two eyes, shrinking away as the morph starts. */
export function mascotFace(canvas: FigureCanvas, trip: MascotTrip, centerX: string, centerY: string): void {
  if (!trip.shown) return;
  const r = trip.radius;
  const halo = 0.27 * r;
  const fade = Anim.smootherRamp(trip.morphStart - 0.2, trip.morphStart + 0.35);
  const visible = `${Anim.lit(trip.morphStart + 0.35)}-t`;
  canvas.ring(centerX, centerY, `${Anim.lit(r + halo)}-${Anim.lit(halo)}*${fade}`, { color: "muted", visible });
  const eye = ellipsePoints({ x: 0, y: 0 }, 1, 1, 20);
  const closed = [...eye, eye[0]!].map((point) => [point.x, point.y]);
  for (const side of [-1.0, 1.0])
    shapeElement(canvas, closed, `(${centerX})+${Anim.lit(side * 0.34 * r)}`, `(${centerY})+${Anim.lit(0.22 * r)}`, {
      scaleX: `${Anim.lit(0.16 * r)}*(1-${fade})`,
      scaleY: `${Anim.lit(0.15 * r)}*(1-${fade})`,
      color: "white",
      fill: 0.95,
      stroke: false,
      visible,
    });
}
