// Port of LearnLayer/Illustrations/IllustrationView.swift (`IllustrationRenderer`) @ ref 2026-11-04
//
// The Mac draws into a SwiftUI Canvas; here the renderer produces a display list (paths and text boxes in view points,
// y down) that the interface draws as SVG. Label placement is the Mac's, with the text measured by the caller.

import { formatG } from "../math/printf";
import type { CompiledIllustration, IllustrationElement, Point2D } from "./illustration";
import { identityFit, LabelPlacer, Rect, type Fit, type Point } from "./labelPlacer";

export interface Size {
  width: number;
  height: number;
}

/** Measures a label at a font size, wrapped within `maxWidth`. */
export type TextMeasurer = (
  text: string,
  fontSize: number,
  weight: number,
  maxWidth: number,
) => { width: number; height: number; lines: string[] };

/** A paint: a named figure colour ("white", "accent", "second", "muted"…) and an opacity. */
export interface Paint {
  color: string;
  opacity: number;
}

export type DrawOp =
  | {
      op: "path";
      d: string;
      stroke: Paint | null;
      fill: Paint | null;
      width: number;
      dash: number[] | null;
      element: number;
      /** A stroke that is drawn in by hand when it first appears. */
      drawn: boolean;
    }
  | { op: "text"; box: Rect; lines: string[]; size: number; weight: number; paint: Paint; element: number }
  | { op: "glyph"; x: number; y: number; text: string; size: number; weight: number; paint: Paint; element: number }
  | { op: "hole"; cx: number; cy: number; r: number; element: number }
  | { op: "sphere"; cx: number; cy: number; r: number; amount: number; element: number };

/** Builds an SVG path in view points. */
class PathBuilder {
  private parts: string[] = [];
  private static f(value: number) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  }
  move(p: Point) {
    this.parts.push(`M${PathBuilder.f(p.x)} ${PathBuilder.f(p.y)}`);
    return this;
  }
  line(p: Point) {
    this.parts.push(`L${PathBuilder.f(p.x)} ${PathBuilder.f(p.y)}`);
    return this;
  }
  quad(to: Point, control: Point) {
    this.parts.push(
      `Q${PathBuilder.f(control.x)} ${PathBuilder.f(control.y)} ${PathBuilder.f(to.x)} ${PathBuilder.f(to.y)}`,
    );
    return this;
  }
  curve(to: Point, c1: Point, c2: Point) {
    const f = PathBuilder.f;
    this.parts.push(`C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(to.x)} ${f(to.y)}`);
    return this;
  }
  ellipse(cx: number, cy: number, r: number) {
    const f = PathBuilder.f;
    this.parts.push(
      `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z`,
    );
    return this;
  }
  rect(x: number, y: number, w: number, h: number) {
    this.move({ x, y })
      .line({ x: x + w, y })
      .line({ x: x + w, y: y + h })
      .line({ x, y: y + h });
    this.parts.push("Z");
    return this;
  }
  close() {
    this.parts.push("Z");
    return this;
  }
  get d() {
    return this.parts.join("");
  }
}

type Anchor = "leading" | "trailing" | "center";
const anchorX = (anchor: Anchor) => (anchor === "leading" ? 0 : anchor === "trailing" ? 1 : 0.5);

interface Resolved {
  lines: string[];
  width: number;
  height: number;
  size: number;
  weight: number;
}

/** Where labels already are this frame, and the strokes and dots they keep clear of. */
export class LabelRoom {
  placer = new LabelPlacer(new Rect(0, 0, 0, 0));
  strokes = new Map<number, [number, number]>();
  dots = new Map<number, [number, number]>();
  tickBoxes = new Map<number, Rect>();
  hiddenTicks = new Set<number>();
  current: number | null = null;
  fit: Fit = identityFit;
}

export class IllustrationRenderer {
  readonly room = new LabelRoom();
  readonly ops: DrawOp[] = [];
  private readonly lineWidth = 1.6;

  constructor(
    readonly compiled: CompiledIllustration,
    readonly values: Readonly<Record<string, number>>,
    readonly size: Size,
    readonly time: number,
    readonly measure: TextMeasurer,
  ) {}

  private get scene() {
    return this.compiled.scene;
  }
  /** View points per world unit when the picture fills the view. */
  private get fullScale() {
    return Math.min(this.size.width / this.scene.width, this.size.height / this.scene.height);
  }
  get scale() {
    return this.fullScale * this.room.fit.scale;
  }
  private get labelBounds() {
    const inset = 4;
    return new Rect(inset, inset, Math.max(inset, this.size.width - inset), Math.max(inset, this.size.height - inset));
  }

  private static worldKey(x: number, y: number) {
    return `${formatG(x, 6)},${formatG(y, 6)}`;
  }

  private namedMarkPoints(): Set<string> {
    const keys = new Set<string>();
    for (const element of this.scene.elements) {
      if (element.kind !== "label") continue;
      const x = this.number(element.x2);
      const y = this.number(element.y2);
      if (x !== null && y !== null) keys.add(IllustrationRenderer.worldKey(x, y));
    }
    return keys;
  }

  /** World (y up) to view (y down), centred. */
  point(x: number, y: number): Point {
    const offsetX = (this.size.width - this.scene.width * this.scale) / 2 + this.room.fit.dx;
    const offsetY = (this.size.height - this.scene.height * this.scale) / 2 - this.room.fit.dy;
    return { x: offsetX + x * this.scale, y: this.size.height - offsetY - y * this.scale };
  }

  world(view: Point): Point2D {
    const offsetX = (this.size.width - this.scene.width * this.scale) / 2 + this.room.fit.dx;
    const offsetY = (this.size.height - this.scene.height * this.scale) / 2 - this.room.fit.dy;
    return { x: (view.x - offsetX) / this.scale, y: (this.size.height - offsetY - view.y) / this.scale };
  }

  private number(text: string | null | undefined, fallback: number | null = null): number | null {
    const value = this.compiled.value(text, this.values);
    return value !== null && Number.isFinite(value) ? value : fallback;
  }

  private hidden(element: IllustrationElement): boolean {
    return typeof element.visible === "string" && (this.number(element.visible) ?? 0) <= 0;
  }

  draw(): DrawOp[] {
    const currents = this.scene.elements
      .map((element) => this.number(element.current))
      .filter((value): value is number => value !== null)
      .map(Math.abs);
    const maxCurrent = currents.length > 0 ? Math.max(...currents) : 0;
    this.room.fit = this.anchoredLabelFit();
    this.prepareRoom();
    this.seedTickObstacles();
    this.scene.elements.forEach((element, index) => {
      if (this.hidden(element)) return;
      this.room.current = index;
      const dash = element.dashed === true ? [5, 4] : null;
      const paint = paintOf(element.color);
      const stroke = (d: string, drawn = true) =>
        this.ops.push({ op: "path", d, stroke: paint, fill: null, width: this.lineWidth, dash, element: index, drawn });
      const fill = (d: string, with_: Paint = paint) =>
        this.ops.push({ op: "path", d, stroke: null, fill: with_, width: 0, dash: null, element: index, drawn: false });
      switch (element.kind) {
        case "point": {
          const p = this.start(element);
          if (!p) return;
          fill(new PathBuilder().ellipse(p.x, p.y, 4).d);
          this.label(element.text, p, { x: 0, y: 0 }, element.color, { besideGap: 7 });
          return;
        }
        case "line": {
          const a = this.start(element);
          const b = this.end(element);
          if (!a || !b) return;
          stroke(new PathBuilder().move(a).line(b).d);
          this.currentDots(element, a, b, maxCurrent, false);
          this.label(element.text, mid(a, b), { x: 0, y: -12 }, element.color);
          return;
        }
        case "arrow": {
          const a = this.start(element);
          const b = this.end(element);
          if (!a || !b) return;
          this.arrow(a, b, paint, dash, index);
          this.label(element.text, b, offsetBeyond(a, b), element.color);
          return;
        }
        case "circle": {
          const c = this.start(element);
          const circle = this.drawnCircle(element);
          if (!c || !circle) return;
          const ring = new PathBuilder().ellipse(c.x, c.y, circle.radius).d;
          if (circle.open) this.ops.push({ op: "hole", cx: c.x, cy: c.y, r: circle.radius, element: index });
          if (element.fill != null && !circle.open) {
            fill(ring, { color: paint.color, opacity: paint.opacity * element.fill });
            const amount = this.number(element.shading);
            if (amount !== null && amount > 0.001)
              this.ops.push({ op: "sphere", cx: c.x, cy: c.y, r: circle.radius, amount, element: index });
          }
          if (element.stroke !== false) stroke(ring);
          this.label(element.text, c, { x: 0, y: 0 }, element.color);
          return;
        }
        case "rect": {
          const [x, y, w, h] = [element.x, element.y, element.w, element.h].map((text) => this.number(text));
          if (x === null || y === null || w === null || h === null) return;
          const a = this.point(x!, y! + h!);
          const b = this.point(x! + w!, y!);
          const box = new PathBuilder().rect(a.x, a.y, b.x - a.x, b.y - a.y).d;
          fill(box, { color: paint.color, opacity: paint.opacity * 0.22 });
          stroke(box);
          this.label(element.text, mid(a, b), { x: 0, y: 0 }, element.color);
          return;
        }
        case "label": {
          const p = this.start(element);
          if (!p || this.room.hiddenTicks.has(index)) return;
          const tick = this.room.tickBoxes.get(index);
          if (this.isPlotTickNumber(element) && tick) {
            const resolved = this.resolvedLabel(element.text ?? "", 14);
            this.ops.push({
              op: "text",
              box: tick,
              lines: resolved.lines,
              size: resolved.size,
              weight: resolved.weight,
              paint,
              element: index,
            });
          } else {
            const named = this.end(element);
            this.label(element.text, p, { x: 0, y: 0 }, element.color, {
              size: 14,
              anchor: anchorOf(element),
              pinned: element.anchor != null && named === null,
              naming: named,
            });
          }
          return;
        }
        case "curve": {
          const path = new PathBuilder();
          for (const piece of this.curvePieces(element)) {
            path.move(piece[0]!);
            for (const p of piece.slice(1)) path.line(p);
          }
          if (element.fill != null) fill(path.d, { color: paint.color, opacity: paint.opacity * element.fill });
          if (element.stroke !== false) stroke(path.d);
          return;
        }
        case "shape": {
          const outline = this.compiled.shapePoints(element, this.values).map((p) => this.point(p.x, p.y));
          if (outline.length === 0) return;
          const path = new PathBuilder().move(outline[0]!);
          for (const p of outline.slice(1)) path.line(p);
          if (element.fill != null) fill(path.d, { color: paint.color, opacity: paint.opacity * element.fill });
          if (element.stroke !== false) stroke(path.d);
          return;
        }
        case "spring": {
          const a = this.start(element);
          const b = this.end(element);
          if (!a || !b) return;
          this.ops.push({
            op: "path",
            d: spring(a, b),
            stroke: paint,
            fill: null,
            width: this.lineWidth,
            dash: null,
            element: index,
            drawn: true,
          });
          return;
        }
        case "charge": {
          const p = this.start(element);
          const q = this.number(element.q);
          if (!p || q === null) return;
          fill(new PathBuilder().ellipse(p.x, p.y, 9).d, q >= 0 ? paintOf("second") : paintOf("accent"));
          this.label(q >= 0 ? "+" : "−", p, { x: 0, y: 0 }, "white", { size: 14, pinned: true });
          this.label(element.text, p, { x: 0, y: -20 }, element.color);
          return;
        }
        case "fieldLines":
          this.drawFieldLines(index);
          return;
        case "component": {
          const a = this.start(element);
          const b = this.end(element);
          if (!a || !b) return;
          this.drawComponent(element.component ?? "", a, b, paint, index);
          this.currentDots(element, a, b, maxCurrent, true);
          const upright = Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
          this.label(element.text, mid(a, b), upright ? { x: -18, y: 0 } : { x: 0, y: -20 }, element.color, {
            anchor: upright ? "trailing" : "center",
          });
          return;
        }
        case "state": {
          const c = this.start(element);
          if (!c) return;
          const radius = (this.number(element.r) ?? 0.5) * this.scale;
          const active = (this.number(element.active) ?? 0) > 0;
          const circle = new PathBuilder().ellipse(c.x, c.y, radius).d;
          if (active) fill(circle, paintOf("accent"));
          this.ops.push({
            op: "path",
            d: circle,
            stroke: active ? paintOf("accent") : paintOf("white"),
            fill: null,
            width: this.lineWidth,
            dash: null,
            element: index,
            drawn: true,
          });
          this.label(element.text, c, { x: 0, y: 0 }, "white", { size: 13, pinned: true });
          return;
        }
        case "transition":
          this.drawTransition(element, paint, index);
          return;
      }
    });
    return this.ops;
  }

  // MARK: Pieces

  private start(element: IllustrationElement): Point | null {
    const x = this.number(element.x);
    const y = this.number(element.y);
    return x === null || y === null ? null : this.point(x, y);
  }

  private end(element: IllustrationElement): Point | null {
    const x = this.number(element.x2);
    const y = this.number(element.y2);
    return x === null || y === null ? null : this.point(x, y);
  }

  /** A circle no wider than a dot is an open point, drawn at least as wide as a dot so it reads as open. */
  private drawnCircle(element: IllustrationElement): { radius: number; open: boolean } | null {
    const r = this.number(element.r);
    if (r === null || r < 0) return null;
    const radius = r * this.scale;
    return radius <= 6 ? { radius: Math.max(radius, 4 - this.lineWidth / 2), open: true } : { radius, open: false };
  }

  /** The fit that keeps every anchored label (a tick's number, an axis's name) beside its point and inside the view. */
  private anchoredLabelFit(): Fit {
    this.room.fit = identityFit;
    const boxes: { point: Point; box: Rect }[] = [];
    for (const element of this.scene.elements) {
      if (element.kind !== "label" || element.anchor == null || element.x2 != null) continue;
      if (this.hidden(element)) continue;
      const p = this.start(element);
      if (!element.text || !p) continue;
      const measured = this.resolvedLabel(element.text, 14);
      boxes.push({ point: p, box: boxAt(measured, p, anchorOf(element)) });
    }
    if (boxes.length === 0) return identityFit;
    const topLeft = this.point(0, this.scene.height);
    const bottomRight = this.point(this.scene.width, 0);
    return LabelPlacer.fit(
      boxes,
      new Rect(topLeft.x, topLeft.y, bottomRight.x, bottomRight.y),
      new Rect(0, 0, this.size.width, this.size.height),
      this.labelBounds,
    );
  }

  /** What labels keep clear of this frame: every visible stroke and dot. */
  private prepareRoom() {
    const placer = new LabelPlacer(this.labelBounds, 2);
    const dot = (p: Point, radius: number) => Rect.centred(p.x, p.y, 2 * radius, 2 * radius);
    const ring = (c: Point, radius: number): Point[] =>
      Array.from({ length: 25 }, (_, index) => {
        const angle = (2 * Math.PI * index) / 24;
        return { x: c.x + radius * Math.cos(angle), y: c.y + radius * Math.sin(angle) };
      });
    const namedDots = this.namedMarkPoints();
    this.scene.elements.forEach((element, index) => {
      if (this.hidden(element)) return;
      const strokeStart = placer.strokes.length;
      const dotStart = placer.dots.length;
      switch (element.kind) {
        case "point": {
          const x = this.number(element.x);
          const y = this.number(element.y);
          const p = this.start(element);
          if (x !== null && y !== null && p) {
            const named = namedDots.has(IllustrationRenderer.worldKey(x, y));
            if (named || (element.text ?? "") !== "") placer.dots.push(dot(p, 4));
          }
          break;
        }
        case "charge": {
          const p = this.start(element);
          if (p) placer.dots.push(dot(p, 9));
          break;
        }
        case "line":
        case "spring":
        case "component": {
          const a = this.start(element);
          const b = this.end(element);
          if (a && b) {
            if (element.color === "muted" || element.dashed === true) placer.faintStrokes.push([a, b]);
            else placer.strokes.push([a, b]);
          }
          break;
        }
        case "arrow": {
          const a = this.start(element);
          const b = this.end(element);
          if (a && b) {
            placer.strokes.push([a, b]);
            const head = arrowHead(a, b);
            if (head) placer.addStroke([head.left, head.tip, head.right, head.left]);
          }
          break;
        }
        case "curve":
          for (const piece of this.curvePieces(element)) placer.addStroke(piece);
          break;
        case "shape":
          if (element.stroke !== false)
            placer.addStroke(this.compiled.shapePoints(element, this.values).map((p) => this.point(p.x, p.y)));
          break;
        case "rect": {
          const [x, y, w, h] = [element.x, element.y, element.w, element.h].map((text) => this.number(text));
          if (x === null || y === null || w === null || h === null) break;
          const a = this.point(x!, y! + h!);
          const b = this.point(x! + w!, y!);
          if (IllustrationRenderer.isTextBand(Math.abs(b.x - a.x), Math.abs(b.y - a.y), this.fontSize(14))) break;
          placer.addStroke([a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a]);
          break;
        }
        case "circle": {
          const c = this.start(element);
          const circle = this.drawnCircle(element);
          if (c && circle) {
            placer.addStroke(ring(c, circle.radius));
            if (circle.open) placer.dots.push(dot(c, Math.max(4, circle.radius + this.lineWidth / 2)));
          }
          break;
        }
        case "state": {
          const radius = (this.number(element.r) ?? 0.5) * this.scale;
          const c = this.start(element);
          if (c && radius > 0) placer.addStroke(ring(c, radius));
          break;
        }
        default:
          break;
      }
      this.room.strokes.set(index, [strokeStart, placer.strokes.length]);
      this.room.dots.set(index, [dotStart, placer.dots.length]);
    });
    this.room.placer = placer;
  }

  /** A rectangle wide and low enough that a line of text inside it cannot clear its outline: it frames the text. */
  static isTextBand(width: number, height: number, fontSize: number): boolean {
    return height < fontSize * 1.9 && width > height * 2.5;
  }

  /** 14 pt when a world unit is about 46 px; a small stage keeps the same proportion, down to 9 pt. */
  fontSize(size: number): number {
    return Math.min(size, Math.max(9, (size * this.fullScale) / 46));
  }

  /** A label's text as drawn, and its size: wrapped rather than cut when it is wider than the picture. */
  private resolvedLabel(text: string, size: number, weight = 500): Resolved {
    const fitted = this.fontSize(size);
    const measured = this.measure(text, fitted, weight, Math.max(24, this.size.width - 8));
    return { ...measured, size: fitted, weight };
  }

  /** Plot tick numbers (not axis names like x or h/1,50). */
  private isPlotTickNumber(element: IllustrationElement): boolean {
    if (element.kind !== "label" || element.color !== "muted" || element.anchor == null) return false;
    if (this.end(element) !== null || !element.text) return false;
    if (element.anchor === "center") return true;
    if (element.anchor !== "trailing") return false;
    return /^[0-9.,−\-+ ]+$/.test(element.text);
  }

  /** Axis tick numbers sit in the placer before marks are placed. */
  private seedTickObstacles() {
    this.room.tickBoxes.clear();
    this.room.hiddenTicks.clear();
    this.scene.elements.forEach((element, index) => {
      if (!this.isPlotTickNumber(element) || this.hidden(element)) return;
      const p = this.start(element);
      if (!p || !element.text) return;
      const box = boxAt(this.resolvedLabel(element.text, 14), p, anchorOf(element)).kept(this.labelBounds);
      this.room.tickBoxes.set(index, box);
      this.room.placer.labels.push(box);
    });
  }

  private hideTick(index: number) {
    const box = this.room.tickBoxes.get(index);
    if (!box || this.room.hiddenTicks.has(index)) return;
    this.room.hiddenTicks.add(index);
    const spot = this.room.placer.labels.findIndex((label) => label.equals(box));
    if (spot >= 0) this.room.placer.labels.splice(spot, 1);
  }

  private hideTicks(box: Rect) {
    for (const [index, tick] of this.room.tickBoxes) {
      if (this.room.hiddenTicks.has(index) || !tick.intersects(box.padded(2))) continue;
      this.hideTick(index);
    }
  }

  /** A mark naming its dot: beside it, off ink and tick numbers, within reach. */
  private placeNamedMark(
    resolved: Resolved,
    owner: Point,
    anchor: Anchor,
    local: LabelPlacer,
    step: number,
    reach: number,
  ): Rect {
    const { width, height } = resolved;
    const markReach = 20;
    const candidates = (span: number, towards: number | null) =>
      LabelPlacer.beside(owner, width, height, 7, step, span, towards, false).map((box) => box.kept(this.labelBounds));
    const nearClear = (span: number, towards: number | null) =>
      candidates(span, towards).filter((box) => box.distance(owner) <= markReach && !local.crossesStrokes(box, true));
    const bearings: number[] = [];
    if (anchor === "trailing") bearings.push(180);
    if (anchor === "leading") bearings.push(0);
    if (IllustrationRenderer.markSitsOnHorizontalAxis(owner, local)) bearings.push(-90, 90, 135, -135);
    bearings.push(45, -45, 135, -135, 180, 0, -90, 90);
    let span = reach;
    let ordered: Rect[] = [];
    let towards: number | null = null;
    for (const bearing of bearings) {
      ordered = nearClear(span, bearing);
      if (ordered.length > 0) {
        towards = bearing;
        break;
      }
    }
    while (ordered.length === 0 && span < markReach * 2) {
      span += step;
      ordered = nearClear(span, towards);
    }
    if (ordered.length === 0) {
      towards = null;
      span = reach;
      ordered = nearClear(span, towards);
      while (ordered.length === 0 && span < markReach * 2) {
        span += step;
        ordered = nearClear(span, towards);
      }
    }
    const tries =
      ordered.length === 0 ? candidates(span, towards).filter((box) => box.distance(owner) <= markReach) : ordered;
    const working = local.copy();
    let best: Rect | null = null;
    let bestCost = Number.MAX_SAFE_INTEGER;
    for (const trial of tries) {
      for (let pass = 0; pass < this.room.tickBoxes.size + 2; pass++) {
        working.labels = [...this.room.placer.labels];
        this.hideTicks(trial);
        working.labels = [...this.room.placer.labels];
        const cost = working.cost(trial, Number.MAX_SAFE_INTEGER, owner);
        if (cost === 0 && trial.distance(owner) <= markReach) return trial;
        if (cost < bestCost && trial.distance(owner) <= markReach) {
          best = trial;
          bestCost = cost;
        }
        const blockers = [...this.room.tickBoxes].filter(
          ([index, tick]) => !this.room.hiddenTicks.has(index) && tick.intersects(trial.padded(2)),
        );
        if (blockers.length === 0) break;
        for (const [index] of blockers) this.hideTick(index);
      }
    }
    let chosen = best;
    if (!chosen) {
      working.labels = [...this.room.placer.labels];
      chosen = working.place(tries.length === 0 ? candidates(markReach, towards) : tries, owner);
    }
    this.hideTicks(chosen);
    return chosen;
  }

  /** A dot on the x-axis (or any long horizontal guide): place the mark below it. */
  private static markSitsOnHorizontalAxis(owner: Point, placer: LabelPlacer): boolean {
    const band = 7;
    const nearAxis = ([a, b]: readonly [Point, Point]) =>
      Math.abs(a.y - b.y) < 2 && Math.abs(a.x - b.x) > 40 && Math.abs(owner.y - a.y) < band;
    return placer.strokes.some(nearAxis) || placer.faintStrokes.some(nearAxis);
  }

  /**
   * Text inside the picture, in the nearest spot clear of the labels already drawn, the dots and the strokes (its
   * own element's aside). A pinned label stays where it is written, or within a line of it.
   */
  private label(
    text: string | null | undefined,
    at: Point,
    offset: Point,
    colorName: string | null | undefined,
    options: { size?: number; anchor?: Anchor; pinned?: boolean; besideGap?: number; naming?: Point | null } = {},
  ) {
    if (!text) return;
    const size = options.size ?? 12;
    const anchor = options.anchor ?? "center";
    const pinned = options.pinned ?? false;
    const gap = options.besideGap ?? null;
    const named = options.naming ?? null;
    const fitted = this.fontSize(size);
    const target = { x: at.x + offset.x, y: at.y + offset.y };
    const local = this.room.placer.copy();
    if (this.room.current !== null) {
      const own = this.room.strokes.get(this.room.current);
      if (own) local.strokes.splice(own[0], own[1] - own[0]);
      const ownDots = this.room.dots.get(this.room.current);
      if (ownDots) local.dots.splice(ownDots[0], ownDots[1] - ownDots[0]);
    }
    const step = Math.max(3, fitted * 0.35);
    const reach = fitted * 5;
    const oneLine = this.resolvedLabel(text, size);
    const ownerPoint = pinned ? null : gap !== null ? at : named;
    const owner: Point | null = ownerPoint ? { x: ownerPoint.x, y: ownerPoint.y } : null;
    const placed = (resolved: Resolved) => {
      const requested = boxAt(resolved, target, anchor);
      const trial = local.copy();
      let box: Rect;
      if (pinned) box = trial.nudge(requested, 1, requested.height);
      else if (named && owner) box = this.placeNamedMark(resolved, owner, anchor, trial, step, reach);
      else {
        let candidates = gap === null ? LabelPlacer.around(requested, step, reach) : [];
        if (owner)
          candidates = candidates.concat(
            LabelPlacer.beside(owner, requested.width, requested.height, gap ?? 7, step, reach, null, false),
          );
        box = trial.place(candidates, owner);
      }
      return { resolved, box, cost: local.cost(box, Number.MAX_SAFE_INTEGER, owner) };
    };
    let chosen = placed(oneLine);
    const lines = LabelPlacer.twoLines(text);
    if (!pinned && [...text].length > (named === null ? 28 : 12) && chosen.cost > 0 && lines) {
      const wrapped = placed(this.resolvedLabel(lines[0] + "\n" + lines[1], size));
      if (wrapped.cost < chosen.cost) chosen = wrapped;
    }
    if (named) {
      this.hideTicks(chosen.box);
      let check = this.room.placer;
      while (
        check.cost(chosen.box, Number.MAX_SAFE_INTEGER, owner) > 0 &&
        [...this.room.tickBoxes].some(
          ([index, tick]) => !this.room.hiddenTicks.has(index) && tick.intersects(chosen.box.padded(2)),
        )
      ) {
        this.hideTicks(chosen.box);
        check = this.room.placer;
      }
    }
    this.room.placer.labels.push(chosen.box);
    this.ops.push({
      op: "text",
      box: chosen.box,
      lines: chosen.resolved.lines,
      size: chosen.resolved.size,
      weight: chosen.resolved.weight,
      paint: paintOf(colorName),
      element: this.room.current ?? -1,
    });
  }

  private arrow(a: Point, b: Point, paint: Paint, dash: number[] | null, element: number) {
    const head = arrowHead(a, b);
    if (!head) return;
    this.ops.push({
      op: "path",
      d: new PathBuilder().move(a).line(b).d,
      stroke: paint,
      fill: null,
      width: this.lineWidth,
      dash,
      element,
      drawn: true,
    });
    this.ops.push({
      op: "path",
      d: new PathBuilder().move(head.tip).line(head.left).line(head.right).close().d,
      stroke: null,
      fill: paint,
      width: 0,
      dash: null,
      element,
      drawn: false,
    });
  }

  /** A curve's points in view space, in pieces broken where it is undefined. */
  curvePieces(element: IllustrationElement): Point[][] {
    const from = this.number(element.from);
    const to = this.number(element.to);
    if (from === null || to === null || to === from) return [];
    const pieces: Point[][] = [[]];
    for (let index = 0; index <= 160; index++) {
      const local = { ...this.values, s: from + ((to - from) * index) / 160 };
      const x = this.compiled.value(element.curveX, local);
      const y = this.compiled.value(element.curveY, local);
      if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) {
        if (pieces[pieces.length - 1]!.length > 0) pieces.push([]);
        continue;
      }
      pieces[pieces.length - 1]!.push(this.point(x, y));
    }
    return pieces.filter((piece) => piece.length > 0);
  }

  /** Dots moving along a wire or component, faster for a bigger current. */
  private currentDots(element: IllustrationElement, a: Point, b: Point, maxCurrent: number, skippingBody: boolean) {
    const current = this.number(element.current);
    if (current === null || !(maxCurrent > 0) || !(Math.abs(current) > maxCurrent * 1e-3)) return;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const spacing = 18;
    if (!(length > spacing)) return;
    const speed = 40 * (Math.abs(current) / maxCurrent);
    const shift = (Number.isFinite(this.time) ? this.time : 0) * speed;
    let along = shift % spacing;
    const body = skippingBody ? Math.min(44, length * 0.6) : 0;
    const bodyStart = (length - body) / 2 - 4;
    const bodyEnd = (length + body) / 2 + 4;
    const path = new PathBuilder();
    while (along < length) {
      if (skippingBody && along > bodyStart && along < bodyEnd) {
        along += spacing;
        continue;
      }
      const fraction = current >= 0 ? along / length : 1 - along / length;
      path.ellipse(a.x + (b.x - a.x) * fraction, a.y + (b.y - a.y) * fraction, 2.5);
      along += spacing;
    }
    this.ops.push({
      op: "path",
      d: path.d,
      stroke: null,
      fill: paintOf("accent"),
      width: 0,
      dash: null,
      element: this.room.current ?? -1,
      drawn: false,
    });
  }

  private drawComponent(name: string, a: Point, b: Point, paint: Paint, element: number) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / length;
    const uy = dy / length;
    const at = (along: number, side: number): Point => ({
      x: a.x + ux * along - uy * side,
      y: a.y + uy * along + ux * side,
    });
    const stroke = (path: PathBuilder) =>
      this.ops.push({
        op: "path",
        d: path.d,
        stroke: paint,
        fill: null,
        width: this.lineWidth,
        dash: null,
        element,
        drawn: true,
      });
    const body = Math.min(44, length * 0.6);
    const start = (length - body) / 2;
    const finish = start + body;
    if (name !== "ground") stroke(new PathBuilder().move(a).line(at(start, 0)).move(at(finish, 0)).line(b));
    switch (name) {
      case "resistor": {
        const path = new PathBuilder().move(at(start, 0));
        for (let index = 0; index < 6; index++)
          path.line(at(start + (body * (index + 0.5)) / 6, index % 2 === 0 ? 7 : -7));
        stroke(path.line(at(finish, 0)));
        return;
      }
      case "capacitor": {
        const gap = 5;
        stroke(
          new PathBuilder()
            .move(at(start, 0))
            .line(at(length / 2 - gap, 0))
            .move(at(length / 2 + gap, 0))
            .line(at(finish, 0))
            .move(at(length / 2 - gap, -11))
            .line(at(length / 2 - gap, 11))
            .move(at(length / 2 + gap, -11))
            .line(at(length / 2 + gap, 11)),
        );
        return;
      }
      case "inductor": {
        const path = new PathBuilder().move(at(start, 0));
        const loops = 4;
        for (let loop = 0; loop < loops; loop++) {
          const from = start + (body * loop) / loops;
          const to = from + body / loops;
          path.curve(at(to, 0), at(from, 9), at(to, 9));
        }
        stroke(path);
        return;
      }
      case "source":
      case "lamp": {
        const r = Math.min(13, body / 2);
        const c = at(length / 2, 0);
        stroke(
          new PathBuilder()
            .move(at(start, 0))
            .line(at(length / 2 - r, 0))
            .move(at(length / 2 + r, 0))
            .line(at(finish, 0)),
        );
        stroke(new PathBuilder().ellipse(c.x, c.y, r));
        if (name === "lamp") {
          const d = r * 0.7;
          stroke(
            new PathBuilder()
              .move({ x: c.x - d, y: c.y - d })
              .line({ x: c.x + d, y: c.y + d })
              .move({ x: c.x - d, y: c.y + d })
              .line({ x: c.x + d, y: c.y - d }),
          );
        } else {
          const plus = at(length / 2 + r * 0.45, 0);
          const minus = at(length / 2 - r * 0.45, 0);
          this.ops.push({
            op: "glyph",
            x: plus.x,
            y: plus.y,
            text: "+",
            size: 11,
            weight: 700,
            paint: paintOf("white"),
            element,
          });
          this.ops.push({
            op: "glyph",
            x: minus.x,
            y: minus.y,
            text: "−",
            size: 11,
            weight: 700,
            paint: paintOf("white"),
            element,
          });
        }
        return;
      }
      case "battery": {
        const gap = 4;
        stroke(
          new PathBuilder()
            .move(at(start, 0))
            .line(at(length / 2 - gap, 0))
            .move(at(length / 2 + gap, 0))
            .line(at(finish, 0))
            .move(at(length / 2 - gap, -6))
            .line(at(length / 2 - gap, 6))
            .move(at(length / 2 + gap, -13))
            .line(at(length / 2 + gap, 13)),
        );
        return;
      }
      case "switch": {
        stroke(new PathBuilder().move(at(start, 0)).line(at(finish - 4, 12)));
        const end = at(finish, 0);
        this.ops.push({
          op: "path",
          d: new PathBuilder().ellipse(end.x, end.y, 2.5).d,
          stroke: null,
          fill: paint,
          width: 0,
          dash: null,
          element,
          drawn: false,
        });
        return;
      }
      case "ground": {
        const path = new PathBuilder().move(a).line(b);
        [12, 8, 4].forEach((half, index) => {
          const base = { x: b.x + ux * index * 5, y: b.y + uy * index * 5 };
          path
            .move({ x: base.x - uy * half, y: base.y + ux * half })
            .line({ x: base.x + uy * half, y: base.y - ux * half });
        });
        stroke(path);
        return;
      }
      default:
        stroke(new PathBuilder().move(at(start, 0)).line(at(finish, 0)));
    }
  }

  private drawTransition(element: IllustrationElement, paint: Paint, index: number) {
    const a = this.start(element);
    const b = this.end(element);
    if (!a || !b) return;
    const radius = (this.number(element.r) ?? 0.5) * this.scale;
    const stroke = (path: PathBuilder) =>
      this.ops.push({
        op: "path",
        d: path.d,
        stroke: paint,
        fill: null,
        width: this.lineWidth,
        dash: null,
        element: index,
        drawn: true,
      });
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1) {
      const top = { x: a.x, y: a.y - radius };
      stroke(
        new PathBuilder()
          .move({ x: top.x - radius * 0.5, y: top.y + 3 })
          .curve(
            { x: top.x + radius * 0.5, y: top.y + 3 },
            { x: top.x - radius * 1.3, y: top.y - radius * 1.6 },
            { x: top.x + radius * 1.3, y: top.y - radius * 1.6 },
          ),
      );
      this.label(element.text, top, { x: 0, y: -radius * 1.4 }, element.color);
      return;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    const ux = dx / length;
    const uy = dy / length;
    const from = { x: a.x + ux * radius, y: a.y + uy * radius };
    const to = { x: b.x - ux * (radius + 2), y: b.y - uy * (radius + 2) };
    const bend = length * 0.15;
    const control = { x: (from.x + to.x) / 2 + uy * bend, y: (from.y + to.y) / 2 - ux * bend };
    stroke(new PathBuilder().move(from).quad(to, control));
    const hx = to.x - control.x;
    const hy = to.y - control.y;
    const hl = Math.max(1, Math.hypot(hx, hy));
    this.arrow({ x: to.x - (hx / hl) * 10, y: to.y - (hy / hl) * 10 }, to, paint, null, index);
    this.label(element.text, control, { x: uy * 10, y: -ux * 10 }, element.color);
  }

  /** Lines traced along the field of every charge, from the positive ones, stopping at a charge or the edge. */
  private drawFieldLines(index: number) {
    const charges: { x: number; y: number; q: number }[] = [];
    for (const element of this.scene.elements) {
      if (element.kind !== "charge") continue;
      const x = this.number(element.x);
      const y = this.number(element.y);
      const q = this.number(element.q);
      if (x !== null && y !== null && q !== null && q !== 0) charges.push({ x, y, q });
    }
    if (charges.length === 0) return;
    const anyPositive = charges.some((charge) => charge.q > 0);
    const sources = anyPositive ? charges.filter((charge) => charge.q > 0) : charges;
    const direction = anyPositive ? 1 : -1;
    const maxQ = Math.max(...sources.map((source) => Math.abs(source.q)));
    const { width, height } = this.scene;
    const step = Math.min(width, height) / 160;
    const start = Math.min(width, height) / 40;
    const field = (x: number, y: number) => {
      let ex = 0;
      let ey = 0;
      for (const charge of charges) {
        const rx = x - charge.x;
        const ry = y - charge.y;
        const r3 = Math.max(rx * rx + ry * ry, 1e-9) ** 1.5;
        ex += (charge.q * rx) / r3;
        ey += (charge.q * ry) / r3;
      }
      return [ex, ey] as const;
    };
    for (const source of sources) {
      const count = Math.max(6, Math.round((12 * Math.abs(source.q)) / maxQ));
      for (let line = 0; line < count; line++) {
        const angle = (2 * Math.PI * (line + 0.5)) / count;
        let x = source.x + start * Math.cos(angle);
        let y = source.y + start * Math.sin(angle);
        const path = new PathBuilder().move(this.point(x, y));
        const points: Point[] = [];
        for (let move = 0; move < 600; move++) {
          const [ex, ey] = field(x, y);
          const magnitude = Math.hypot(ex, ey);
          if (!(magnitude > 0)) break;
          x += (direction * step * ex) / magnitude;
          y += (direction * step * ey) / magnitude;
          const p = this.point(x, y);
          path.line(p);
          points.push(p);
          if (x < -width * 0.1 || x > width * 1.1 || y < -height * 0.1 || y > height * 1.1) break;
          if (
            charges.some((charge) => Math.hypot(x - charge.x, y - charge.y) < start * 0.8 && charge.q * direction < 0)
          )
            break;
        }
        this.ops.push({
          op: "path",
          d: path.d,
          stroke: { color: "white", opacity: 0.5 },
          fill: null,
          width: 1,
          dash: null,
          element: index,
          drawn: true,
        });
        if (points.length > 12) {
          const tip = points[Math.trunc(points.length / 3)]!;
          const world = this.world(tip);
          const [ex, ey] = field(world.x, world.y);
          const magnitude = Math.hypot(ex, ey);
          if (!(magnitude > 0)) continue;
          const ux = ex / magnitude;
          const uy = ey / magnitude;
          const head = this.point(world.x + ux * 0.08, world.y + uy * 0.08);
          const tail = this.point(world.x - ux * 0.08, world.y - uy * 0.08);
          const dx = head.x - tail.x;
          const dy = head.y - tail.y;
          const length = Math.max(0.001, Math.hypot(dx, dy));
          const vx = dx / length;
          const vy = dy / length;
          this.ops.push({
            op: "path",
            d: new PathBuilder()
              .move(head)
              .line({ x: head.x - vx * 7 - vy * 3.5, y: head.y - vy * 7 + vx * 3.5 })
              .line({ x: head.x - vx * 7 + vy * 3.5, y: head.y - vy * 7 - vx * 3.5 })
              .close().d,
            stroke: null,
            fill: { color: "white", opacity: 0.6 },
            width: 0,
            dash: null,
            element: index,
            drawn: false,
          });
        }
      }
    }
  }
}

/** The figure colours, by name; "muted" is white at 45 %. */
export function paintOf(name: string | null | undefined): Paint {
  switch (name) {
    case "accent":
    case "second":
    case "red":
    case "orange":
    case "yellow":
    case "green":
    case "blue":
    case "violet":
    case "shadow":
      return { color: name, opacity: 1 };
    case "muted":
      return { color: "white", opacity: 0.45 };
    default:
      return { color: "white", opacity: 1 };
  }
}

function anchorOf(element: IllustrationElement): Anchor {
  return element.anchor === "trailing" ? "trailing" : element.anchor === "center" ? "center" : "leading";
}

function boxAt(measured: { width: number; height: number }, target: Point, anchor: Anchor): Rect {
  const left = target.x - measured.width * anchorX(anchor);
  const top = target.y - measured.height * 0.5;
  return new Rect(left, top, left + measured.width, top + measured.height);
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function offsetBeyond(a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  return { x: (dx / length) * 14, y: (dy / length) * 14 };
}

/** An arrow's head: its tip and the corners of its base. */
function arrowHead(a: Point, b: Point): { tip: Point; left: Point; right: Point } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0.5)) return null;
  const ux = dx / length;
  const uy = dy / length;
  const head = Math.min(10, length * 0.4);
  return {
    tip: b,
    left: { x: b.x - ux * head - uy * head * 0.5, y: b.y - uy * head + ux * head * 0.5 },
    right: { x: b.x - ux * head + uy * head * 0.5, y: b.y - uy * head - ux * head * 0.5 },
  };
}

function spring(a: Point, b: Point): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const coils = 10;
  const amplitude = 7;
  const lead = length * 0.1;
  const path = new PathBuilder().move(a).line({ x: a.x + ux * lead, y: a.y + uy * lead });
  for (let index = 0; index < coils * 2; index++) {
    const along = lead + ((length - 2 * lead) * (index + 0.5)) / (coils * 2);
    const side = index % 2 === 0 ? amplitude : -amplitude;
    path.line({ x: a.x + ux * along - uy * side, y: a.y + uy * along + ux * side });
  }
  return path.line({ x: b.x - ux * lead, y: b.y - uy * lead }).line(b).d;
}

/** A measurer for tests and for drawing before fonts load: an average glyph of 0.5 em (Segoe UI), lines of 1.2 em. */
export const approximateMeasurer: TextMeasurer = (text, fontSize, _weight, maxWidth) => {
  const glyph = fontSize * 0.5;
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    let line = "";
    for (const word of raw.split(" ")) {
      const next = line === "" ? word : `${line} ${word}`;
      if (line !== "" && [...next].length * glyph > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  const width = Math.min(maxWidth, Math.max(...lines.map((line) => [...line].length * glyph)));
  return { width, height: lines.length * fontSize * 1.2, lines };
};
