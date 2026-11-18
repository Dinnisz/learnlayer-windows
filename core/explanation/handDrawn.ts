// Port of the pen's shapes: PenRing.points, ellipse, outerBounds and encloses (LearnLayer/Voice/PenRing.swift), the
// underline of HandDrawnUnderline (LearnLayer/Explanation/HandDrawnShapes.swift) and LessonEvidence.ringBox
// (LearnLayer/Lesson/LessonLayer.swift) @ ref 2026-11-04. A teacher's loop round a symbol or a quote: a little larger
// than it, wobbling, not quite closing on itself; and a steady stroke just under a line, past its ends. The app strokes
// these points progressively (`HandDrawnMark`).
//
// The Mac also measures a typeset formula's ink to ring one glyph and spread its neighbours (`PenRing.ring`,
// `split`, `spread`); on Windows KaTeX draws each symbol in its own element and the ring goes round that element's box
// (docs/DECISOES.md), so those are not ported.

export interface MarkRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MarkPoint {
  x: number;
  y: number;
}

/** The loop's ellipse has radii `rect.width / 2 + padX` and `rect.height / 2 + padY`. */
const padX = 3;
const padY = 2;
/** The least the pen's loop reaches, as a share of its ellipse. */
export const narrowestWobble = 0.955;

/** Ink at `scale` pixels per point, origin at the top left (the Mac's InkMask, made from boxes). */
export class InkMask {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly bits: Uint8Array;

  constructor(width: number, height: number, scale: number, bits: Uint8Array) {
    this.width = Math.max(0, width);
    this.height = Math.max(0, height);
    this.scale = scale > 0 ? scale : 1;
    this.bits = bits.length === this.width * this.height ? bits : new Uint8Array(this.width * this.height);
  }

  /** Boxes in points painted as ink. */
  static boxes(boxes: readonly MarkRect[], width: number, height: number, scale = 4): InkMask {
    const columns = Math.ceil(width * scale);
    const rows = Math.ceil(height * scale);
    const bits = new Uint8Array(Math.max(0, columns * rows));
    for (const box of boxes) {
      const x0 = Math.max(0, Math.floor(box.x * scale));
      const x1 = Math.min(columns, Math.ceil((box.x + box.width) * scale));
      const y0 = Math.max(0, Math.floor(box.y * scale));
      const y1 = Math.min(rows, Math.ceil((box.y + box.height) * scale));
      for (let row = y0; row < y1; row += 1) bits.fill(1, row * columns + x0, row * columns + Math.max(x0, x1));
    }
    return new InkMask(columns, rows, scale, bits);
  }
}

export const PenRing = {
  lineWidth: 2.2,

  /**
   * A loop a little larger than `rect`, wobbling, that does not quite close on itself. `roundness` 2 is an ellipse;
   * higher fills out its corners (a superellipse), for a loop round a long run of words.
   */
  points(rect: MarkRect, samples = 72, roundness = 2): MarkPoint[] {
    const { centreX, centreY, radiusX, radiusY } = PenRing.ellipse(rect);
    const start = -0.65 * Math.PI;
    const sweep = 2.18 * Math.PI;
    const count = Math.max(samples, 8);
    const power = 2 / Math.max(roundness, 1);
    const shaped = (value: number) => (power === 1 ? value : (value < 0 ? -1 : 1) * Math.abs(value) ** power);
    return Array.from({ length: count + 1 }, (_, index) => {
      const fraction = index / count;
      const angle = start + sweep * fraction;
      const wobble = 1 + 0.045 * Math.sin(angle * 3 + 0.7) + 0.05 * fraction;
      return {
        x: centreX + radiusX * wobble * shaped(Math.cos(angle)),
        y: centreY + radiusY * wobble * shaped(Math.sin(angle)),
      };
    });
  },

  /** The ellipse the loop for `rect` wobbles around. */
  ellipse(rect: MarkRect) {
    return {
      centreX: rect.x + rect.width / 2,
      centreY: rect.y + rect.height / 2,
      radiusX: rect.width / 2 + padX,
      radiusY: rect.height / 2 + padY,
    };
  },

  /** True when the point is inside the loop's ellipse. */
  enclosesPoint(rect: MarkRect, x: number, y: number): boolean {
    const shape = PenRing.ellipse(rect);
    const dx = (x - shape.centreX) / shape.radiusX;
    const dy = (y - shape.centreY) / shape.radiusY;
    return dx * dx + dy * dy < 1;
  },

  /** Everything the loop for `rect` covers, the stroke width included. */
  outerBounds(rect: MarkRect, roundness = 2): MarkRect {
    const loop = PenRing.points(rect, 72, roundness);
    const half = PenRing.lineWidth / 2;
    const xs = loop.map((point) => point.x);
    const ys = loop.map((point) => point.y);
    const minX = Math.min(...xs) - half;
    const minY = Math.min(...ys) - half;
    return { x: minX, y: minY, width: Math.max(...xs) + half - minX, height: Math.max(...ys) + half - minY };
  },

  /** True when the loop drawn for `ring` goes round every ink pixel of `mask`, its stroke at least `margin` points
   * from each. */
  encloses(ring: MarkRect, mask: InkMask, margin = 1): boolean {
    const size = 1 / mask.scale;
    const points: MarkPoint[] = [];
    for (let row = 0; row < mask.height; row += 1) {
      for (let column = 0; column < mask.width; column += 1) {
        if (mask.bits[row * mask.width + column]) points.push({ x: (column + 0.5) * size, y: (row + 0.5) * size });
      }
    }
    return enclosesPoints(ring, points, (0.5 * Math.SQRT2) / mask.scale, margin);
  },

  /** The most a ring may be wider than tall, or taller than wide. */
  maximumAspect: 1.4,
  /** The least gap, in points, between the glyph's own ink and the inside of its stroke. */
  margin: 1,

  /**
   * The rect to draw a round ring around one glyph with: the smallest loop, at most `maximumAspect` wide or tall, whose
   * stroke keeps `margin` points off every ink pixel of the glyph and goes all the way around it. `own` is the glyph's
   * ink; without it the glyph's box stands in.
   */
  ring(glyph: MarkRect, own: InkMask | null = null): MarkRect {
    if (glyph.width <= 0 || glyph.height <= 0) return glyph;
    const ink = inkPoints(glyph, own);
    const hull = convexHull(ink.points);
    const pixel = (0.5 * Math.SQRT2) / ink.scale;
    const inset = PenRing.lineWidth / 2 + PenRing.margin + pixel;
    const centreX = glyph.x + glyph.width / 2;
    const centreY = glyph.y + glyph.height / 2;
    const ratios = Array.from({ length: 17 }, (_, index) => PenRing.maximumAspect ** ((index - 8) / 8));
    let best: { cost: number; x: number; y: number; radiusX: number; radiusY: number } | null = null;
    for (const shiftX of outward(1.5, 0.25)) {
      for (const shiftY of outward(1.5, 0.25)) {
        const x = centreX + shiftX;
        const y = centreY + shiftY;
        for (const ratio of ratios) {
          let reach = 0;
          for (const point of hull) {
            const dx = point.x - x;
            const dy = (point.y - y) / ratio;
            reach = Math.max(reach, dx * dx + dy * dy);
          }
          reach = Math.sqrt(reach);
          const radiusX = Math.max(padX + 0.1, (reach + inset) / narrowestWobble);
          const radiusY = Math.max(padY + 0.1, (ratio * reach + inset) / narrowestWobble);
          if (Math.max(radiusX, radiusY) / Math.min(radiusX, radiusY) > PenRing.maximumAspect) continue;
          const cost = radiusX * radiusY + 0.5 * (Math.abs(shiftX) + Math.abs(shiftY));
          if (best === null || cost < best.cost) best = { cost, x, y, radiusX, radiusY };
        }
      }
    }
    if (!best) return glyph;
    const shape = best;
    const rect = (): MarkRect => ({
      x: shape.x - shape.radiusX + padX,
      y: shape.y - shape.radiusY + padY,
      width: 2 * (shape.radiusX - padX),
      height: 2 * (shape.radiusY - padY),
    });
    for (let tries = 0; tries < 24 && !enclosesPoints(rect(), ink.points, pixel, PenRing.margin); tries += 1) {
      shape.radiusX += 0.25;
      shape.radiusY += 0.25;
    }
    // The fit assumed the loop's narrowest wobble all round; take back what the real loop allows.
    let shrinking = true;
    while (shrinking) {
      shrinking = false;
      for (const axis of [0, 1]) {
        const before = { ...shape };
        if (axis === 0) shape.radiusX -= 0.1;
        else shape.radiusY -= 0.1;
        const fits =
          shape.radiusX > padX &&
          shape.radiusY > padY &&
          Math.max(shape.radiusX, shape.radiusY) / Math.min(shape.radiusX, shape.radiusY) <= PenRing.maximumAspect &&
          enclosesPoints(rect(), ink.points, pixel, PenRing.margin);
        if (fits) shrinking = true;
        else Object.assign(shape, before);
      }
    }
    return rect();
  },

  /** Width over height of the ring's ellipse, or the other way, whichever is at least 1. */
  aspect(ring: MarkRect): number {
    const shape = PenRing.ellipse(ring);
    return Math.max(shape.radiusX, shape.radiusY) / Math.max(Math.min(shape.radiusX, shape.radiusY), 1e-9);
  },

  /** An SVG path through the loop's points. */
  path(rect: MarkRect, roundness = 2): string {
    return polyline(PenRing.points(rect, 72, roundness));
  },
};

/** A steady pen stroke just under a rectangle, from a little before its start to a little past its end: the faint
 * rise and sag keep it hand-drawn without sloping away from the words. */
export const HandDrawnUnderline = {
  lineWidth: 2.5,
  /** How far the stroke runs past each end of the rectangle. */
  overshoot: 2,
  /** The gap between the rectangle's bottom and the stroke's middle. */
  drop: 2,

  path(rect: MarkRect): string {
    const y = rect.y + rect.height + HandDrawnUnderline.drop;
    const start = rect.x - HandDrawnUnderline.overshoot;
    const end = rect.x + rect.width + HandDrawnUnderline.overshoot;
    const n = (value: number) => Number(value.toFixed(2));
    return (
      `M${n(start)} ${n(y + 0.4)} C${n(start + (end - start) * 0.35)} ${n(y - 0.6)} ` +
      `${n(start + (end - start) * 0.7)} ${n(y + 0.6)} ${n(end)} ${n(y - 0.3)}`
    );
  },
};

function enclosesPoints(ring: MarkRect, ink: readonly MarkPoint[], pixel: number, margin: number): boolean {
  const loop = PenRing.points(ring);
  const reach = PenRing.lineWidth / 2 + margin + pixel;
  for (const point of ink) {
    if (winding(point, loop) === 0) return false;
    if (distance(point, loop) < reach) return false;
  }
  return true;
}

/** The centres of the glyph's edge ink pixels, or a grid over its box. */
function inkPoints(glyph: MarkRect, own: InkMask | null): { points: MarkPoint[]; scale: number } {
  if (own) {
    const size = 1 / own.scale;
    const ink = (row: number, column: number) =>
      row >= 0 && column >= 0 && row < own.height && column < own.width && own.bits[row * own.width + column] === 1;
    // Only the edge: the ink nearest anything outside it is always on its edge.
    const points: MarkPoint[] = [];
    for (let row = 0; row < own.height; row += 1) {
      for (let column = 0; column < own.width; column += 1) {
        if (!ink(row, column)) continue;
        if (ink(row - 1, column) && ink(row + 1, column) && ink(row, column - 1) && ink(row, column + 1)) continue;
        points.push({ x: (column + 0.5) * size, y: (row + 0.5) * size });
      }
    }
    if (points.length > 0) return { points, scale: own.scale };
  }
  const scale = 4;
  const columns = Math.max(1, Math.ceil(glyph.width * scale));
  const rows = Math.max(1, Math.ceil(glyph.height * scale));
  const points: MarkPoint[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      points.push({ x: glyph.x + (column + 0.5) / scale, y: glyph.y + (row + 0.5) / scale });
    }
  }
  return { points, scale };
}

/** The corners of the smallest convex outline round the points. */
function convexHull(points: readonly MarkPoint[]): MarkPoint[] {
  const sorted = [...points].sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));
  if (sorted.length <= 2) return sorted;
  const cross = (o: MarkPoint, a: MarkPoint, b: MarkPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: MarkPoint[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: MarkPoint[] = [];
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** 0, then ±step, ±2·step, … up to `limit`, so the nearest offsets are tried first. */
function outward(limit: number, step: number): number[] {
  const values = [0];
  for (let offset = step; offset <= limit + 1e-9; offset += step) values.push(offset, -offset);
  return values;
}

function polyline(points: readonly MarkPoint[]): string {
  const n = (value: number) => Number(value.toFixed(2));
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${n(point.x)} ${n(point.y)}`).join(" ");
}

function distance(point: MarkPoint, loop: readonly MarkPoint[]): number {
  let nearest = Infinity;
  for (let index = 0; index + 1 < loop.length; index += 1) {
    const start = loop[index]!;
    const end = loop[index + 1]!;
    const ex = end.x - start.x;
    const ey = end.y - start.y;
    const length = ex * ex + ey * ey;
    const t = length > 0 ? Math.min(1, Math.max(0, ((point.x - start.x) * ex + (point.y - start.y) * ey) / length)) : 0;
    nearest = Math.min(nearest, Math.hypot(start.x + t * ex - point.x, start.y + t * ey - point.y));
  }
  return nearest;
}

/** How many times the closed loop winds round `point`. The pen's overlap winds twice. */
function winding(point: MarkPoint, loop: readonly MarkPoint[]): number {
  if (loop.length === 0) return 0;
  let count = 0;
  for (let index = 0; index < loop.length; index += 1) {
    const start = loop[index]!;
    const end = loop[(index + 1) % loop.length]!;
    const cross = (end.x - start.x) * (point.y - start.y) - (point.x - start.x) * (end.y - start.y);
    if (start.y <= point.y) {
      if (end.y > point.y && cross > 0) count += 1;
    } else if (end.y <= point.y && cross < 0) count -= 1;
  }
  return count;
}
