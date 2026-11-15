// Port of LearnLayer/Illustrations/LabelPlacer.swift @ ref 2026-11-04

/**
 * Where a label goes in a picture: the nearest spot to its anchor that covers no other label, dot or stroke and
 * stays inside the picture; when no spot is clear, the one that covers least. Any units work: view points for the
 * renderers, world units for the templates.
 */
export class Rect {
  constructor(
    public minX: number,
    public minY: number,
    public maxX: number,
    public maxY: number,
  ) {}

  static centred(centreX: number, centreY: number, width: number, height: number): Rect {
    return new Rect(centreX - width / 2, centreY - height / 2, centreX + width / 2, centreY + height / 2);
  }

  get width() {
    return this.maxX - this.minX;
  }
  get height() {
    return this.maxY - this.minY;
  }
  get midX() {
    return (this.minX + this.maxX) / 2;
  }
  get midY() {
    return (this.minY + this.maxY) / 2;
  }

  equals(other: Rect): boolean {
    return this.minX === other.minX && this.minY === other.minY && this.maxX === other.maxX && this.maxY === other.maxY;
  }

  padded(amount: number): Rect {
    return new Rect(this.minX - amount, this.minY - amount, this.maxX + amount, this.maxY + amount);
  }

  moved(dx: number, dy: number): Rect {
    return new Rect(this.minX + dx, this.minY + dy, this.maxX + dx, this.maxY + dy);
  }

  intersects(other: Rect): boolean {
    return this.minX < other.maxX && this.maxX > other.minX && this.minY < other.maxY && this.maxY > other.minY;
  }

  contains(x: number, y: number): boolean {
    return x >= this.minX && x <= this.maxX && y >= this.minY && y <= this.maxY;
  }

  /** How far `point` is from the box: 0 inside it. */
  distance(point: Point): number {
    const dx = Math.max(this.minX - point.x, 0, point.x - this.maxX);
    const dy = Math.max(this.minY - point.y, 0, point.y - this.maxY);
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** The segment a–b passes through the box. */
  crosses(a: Pair, b: Pair): boolean {
    return this.entry(a, b) !== null;
  }

  /** How far along a–b (0 at a, 1 at b) the segment first meets the box; null when it misses it (Liang–Barsky). */
  entry(a: Pair, b: Pair): number | null {
    if (
      Math.max(a[0], b[0]) < this.minX ||
      Math.min(a[0], b[0]) > this.maxX ||
      Math.max(a[1], b[1]) < this.minY ||
      Math.min(a[1], b[1]) > this.maxY
    )
      return null;
    let low = 0;
    let high = 1;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const tests: [number, number][] = [
      [-dx, a[0] - this.minX],
      [dx, this.maxX - a[0]],
      [-dy, a[1] - this.minY],
      [dy, this.maxY - a[1]],
    ];
    for (const [p, q] of tests) {
      if (Math.abs(p) < 1e-12) {
        if (q < 0) return null;
        continue;
      }
      const t = q / p;
      if (p < 0) low = Math.max(low, t);
      else high = Math.min(high, t);
      if (low > high) return null;
    }
    return low;
  }

  /** Moved the least to lie inside `bounds` (its top-left corner when it is bigger). */
  kept(bounds: Rect): Rect {
    const dx = this.maxX > bounds.maxX ? bounds.maxX - this.maxX : 0;
    const dy = this.maxY > bounds.maxY ? bounds.maxY - this.maxY : 0;
    let rect = this.moved(dx, dy);
    if (rect.minX < bounds.minX) rect = rect.moved(bounds.minX - rect.minX, 0);
    if (rect.minY < bounds.minY) rect = rect.moved(0, bounds.minY - rect.minY);
    return rect;
  }
}

export interface Point {
  x: number;
  y: number;
}
export type Pair = readonly [number, number];
export type Segment = readonly [Point, Point];

/** How a picture is drawn smaller and shifted so its fixed-size labels fit. */
export interface Fit {
  scale: number;
  dx: number;
  dy: number;
}

export const identityFit: Fit = { scale: 1, dx: 0, dy: 0 };

export function applyFit(fit: Fit, point: Point, centre: Point): Point {
  return {
    x: centre.x + fit.scale * (point.x - centre.x) + fit.dx,
    y: centre.y + fit.scale * (point.y - centre.y) + fit.dy,
  };
}

/** Sixteen directions, in degrees: the corners first, then the sides, then between. */
const directions = [45, 135, -45, -135, 0, 180, 90, -90, 22.5, 157.5, -22.5, -157.5, 67.5, 112.5, -67.5, -112.5];

function difference(a: number, b: number): number {
  const d = Math.abs((a - b) % 360);
  return Math.min(d, 360 - d);
}

export class LabelPlacer {
  /** Labels already placed. A new label never covers one. */
  labels: Rect[] = [];
  /** Dots of points, which a label must not cover either. */
  dots: Rect[] = [];
  /** Lines, edges and curves as segments: a label sits beside them. */
  strokes: Segment[] = [];
  /** Light lines (an axis, a plane's outline) a label may cross rather than sit far from its point. */
  faintStrokes: Segment[] = [];

  constructor(
    /** The picture, already inset by its margin. */
    public bounds: Rect,
    /** Space kept between a label and anything it must not touch. */
    public padding = 0,
  ) {}

  copy(): LabelPlacer {
    const copy = new LabelPlacer(this.bounds, this.padding);
    copy.labels = [...this.labels];
    copy.dots = [...this.dots];
    copy.strokes = [...this.strokes];
    copy.faintStrokes = [...this.faintStrokes];
    return copy;
  }

  /** A polyline as strokes: a curve's samples, an outline. */
  addStroke(points: readonly Point[]) {
    for (let index = 0; index + 1 < points.length; index++) this.strokes.push([points[index]!, points[index + 1]!]);
  }

  /**
   * What a box covers: a label or a dot outweighs any number of strokes, and a stroke thirty faint ones. The name
   * of the point `owner` also pays for lying nearer another dot. Counting stops once it reaches `limit`.
   */
  cost(box: Rect, limit = Number.MAX_SAFE_INTEGER, owner: Point | null = null): number {
    const padded = box.padded(this.padding);
    let cost = 0;
    for (const label of this.labels) {
      if (!label.intersects(padded)) continue;
      cost += 10_000;
      if (cost >= limit) return cost;
    }
    for (const dot of this.dots) {
      if (!dot.intersects(padded)) continue;
      cost += 10_000;
      if (cost >= limit) return cost;
    }
    if (owner) {
      const own = box.distance(owner);
      if (this.dots.some((dot) => box.distance({ x: dot.midX, y: dot.midY }) < own - 1e-9)) {
        cost += 5_000;
        if (cost >= limit) return cost;
      }
    }
    for (const [a, b] of this.strokes) {
      if (!padded.crosses([a.x, a.y], [b.x, b.y])) continue;
      cost += 90;
      if (cost >= limit) return cost;
    }
    for (const [a, b] of this.faintStrokes) {
      if (!padded.crosses([a.x, a.y], [b.x, b.y])) continue;
      cost += 3;
      if (cost >= limit) return cost;
    }
    return cost;
  }

  /** Whether the box intersects any stroke (axes and curves when `faint` is true). */
  crossesStrokes(box: Rect, faint = true): boolean {
    const padded = box.padded(this.padding);
    if (this.strokes.some(([a, b]) => padded.crosses([a.x, a.y], [b.x, b.y]))) return true;
    return faint && this.faintStrokes.some(([a, b]) => padded.crosses([a.x, a.y], [b.x, b.y]));
  }

  /**
   * The first clear box in `candidates`, each kept inside the picture; else the one covering least, the earlier on
   * a tie. It is then taken. A label naming the point `owner` also pays for distance.
   */
  place(candidates: readonly Rect[], owner: Point | null = null): Rect {
    let best: { box: Rect; cost: number } | null = null;
    for (const candidate of candidates) {
      const box = candidate.kept(this.bounds);
      const far = owner ? Math.trunc((2 * box.distance(owner)) / Math.max(box.height, 1e-9)) : 0;
      if (best && best.cost <= far) continue;
      const cost = far + this.cost(box, best ? best.cost - far : Number.MAX_SAFE_INTEGER, owner);
      if (!best || cost < best.cost) best = { box, cost };
      if (!owner && cost === 0) break;
    }
    const box = best?.box ?? candidates[0]?.kept(this.bounds) ?? this.bounds;
    this.labels.push(box);
    return box;
  }

  /** Takes `box` where it is, so later labels keep clear of it. */
  pin(box: Rect): Rect {
    const kept = box.kept(this.bounds);
    this.labels.push(kept);
    return kept;
  }

  /** Takes `box` where it is written, or the nearest clear spot within `reach` when that one touches something. */
  nudge(box: Rect, step: number, reach: number): Rect {
    const written = box.kept(this.bounds);
    let taken = written;
    if (this.cost(written) > 0) {
      for (const candidate of LabelPlacer.around(written, step, reach).slice(1)) {
        const moved = candidate.kept(this.bounds);
        if (this.cost(moved) === 0) {
          taken = moved;
          break;
        }
      }
    }
    this.labels.push(taken);
    return taken;
  }

  /** A long label as two lines: before the coordinates it ends with, else at the space nearest its middle. */
  static twoLines(text: string): [string, string] | null {
    const words = text.split(" ").filter((word) => word !== "");
    if (words.length <= 1) return null;
    if (words[words.length - 1]!.endsWith(")")) {
      let open = -1;
      for (let index = words.length - 1; index >= 0; index--)
        if (words[index]!.startsWith("(")) {
          open = index;
          break;
        }
      if (open > 0) return [words.slice(0, open).join(" "), words.slice(open).join(" ")];
    }
    const total = [...words.join(" ")].length;
    let best = 1;
    let bestImbalance = Number.MAX_SAFE_INTEGER;
    for (let split = 1; split < words.length; split++) {
      const first = [...words.slice(0, split).join(" ")].length;
      const imbalance = Math.abs(2 * first + 1 - total);
      if (imbalance < bestImbalance) {
        best = split;
        bestImbalance = imbalance;
      }
    }
    return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
  }

  /**
   * The largest scale, down to `minimumScale`, and the shift that keep every box inside `bounds` beside its point,
   * and the picture inside `canvas`. The identity when all fits.
   */
  static fit(
    boxes: readonly { point: Point; box: Rect }[],
    picture: Rect,
    canvas: Rect,
    bounds: Rect,
    minimumScale = 0.7,
  ): Fit {
    interface Item {
      at: number;
      low: number;
      high: number;
      min: number;
      max: number;
    }
    const items = (horizontal: boolean): Item[] => {
      const list: Item[] = boxes.map((entry) => {
        const at = horizontal ? entry.point.x : entry.point.y;
        return {
          at,
          low: (horizontal ? entry.box.minX : entry.box.minY) - at,
          high: (horizontal ? entry.box.maxX : entry.box.maxY) - at,
          min: horizontal ? bounds.minX : bounds.minY,
          max: horizontal ? bounds.maxX : bounds.maxY,
        };
      });
      for (const edge of horizontal ? [picture.minX, picture.maxX] : [picture.minY, picture.maxY])
        list.push({
          at: edge,
          low: 0,
          high: 0,
          min: horizontal ? canvas.minX : canvas.minY,
          max: horizontal ? canvas.maxX : canvas.maxY,
        });
      return list;
    };
    const horizontal = items(true);
    const vertical = items(false);
    const centre = { x: canvas.midX, y: canvas.midY };
    const shifts = (list: Item[], scale: number, middle: number) => {
      let low = -Infinity;
      let high = Infinity;
      for (const item of list) {
        const moved = middle + scale * (item.at - middle);
        low = Math.max(low, item.min - moved - item.low);
        high = Math.min(high, item.max - moved - item.high);
      }
      return { low, high };
    };
    const fits = (scale: number) => {
      const x = shifts(horizontal, scale, centre.x);
      const y = shifts(vertical, scale, centre.y);
      return x.low <= x.high + 1e-9 && y.low <= y.high + 1e-9;
    };
    let scale = 1;
    if (!fits(1)) {
      let low = minimumScale;
      let high = 1;
      if (fits(low)) {
        for (let index = 0; index < 40; index++) {
          const middle = (low + high) / 2;
          if (fits(middle)) low = middle;
          else high = middle;
        }
      }
      scale = low;
    }
    const shift = (range: { low: number; high: number }) =>
      range.low <= range.high ? Math.min(Math.max(0, range.low), range.high) : (range.low + range.high) / 2;
    return {
      scale,
      dx: shift(shifts(horizontal, scale, centre.x)),
      dy: shift(shifts(vertical, scale, centre.y)),
    };
  }

  static readonly directions = directions;

  /**
   * Boxes of `width` × `height` beside `anchor`, nearest first, out to `reach`. `towards` (degrees) puts that side
   * first in each ring. `yUp` says which way "above" is: world units grow up, view points down.
   */
  static beside(
    anchor: Point,
    width: number,
    height: number,
    gap: number,
    step: number,
    reach: number,
    towards: number | null,
    yUp: boolean,
  ): Rect[] {
    const order =
      towards === null ? directions : [...directions].sort((a, b) => difference(a, towards) - difference(b, towards));
    const boxes: Rect[] = [];
    let radius = gap;
    while (radius <= reach + 1e-9) {
      for (const degrees of order) {
        const angle = (degrees * Math.PI) / 180;
        const cx = Math.cos(angle);
        const cy = Math.sin(angle) * (yUp ? 1 : -1);
        const sx = Math.abs(cx) < 1e-9 ? 0 : cx > 0 ? 1 : -1;
        const sy = Math.abs(cy) < 1e-9 ? 0 : cy > 0 ? 1 : -1;
        boxes.push(
          Rect.centred(
            anchor.x + cx * radius + (sx * width) / 2,
            anchor.y + cy * radius + (sy * height) / 2,
            width,
            height,
          ),
        );
      }
      radius += step;
    }
    return boxes;
  }

  /** `box` where it is, then moved one `step` further each ring, out to `reach`. */
  static around(box: Rect, step: number, reach: number): Rect[] {
    const boxes = [box];
    let radius = step;
    while (radius <= reach + 1e-9) {
      for (const degrees of directions) {
        const angle = (degrees * Math.PI) / 180;
        boxes.push(box.moved(Math.cos(angle) * radius, Math.sin(angle) * radius));
      }
      radius += step;
    }
    return boxes;
  }
}
