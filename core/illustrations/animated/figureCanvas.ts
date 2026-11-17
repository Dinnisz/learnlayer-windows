// Port of LearnLayer/Illustrations/PremadeFigureAnimated.swift @ ref 2026-11-04 (the parts every animated premade
// shares): reading params, time written as expressions (`Anim`), a function of x checked and ready to draw, the plot
// frame in the 10 × 6 world, the label board and the canvas that collects a figure's elements. The model gives only
// `{ "type", "params" }`; the app computes the maths and draws. Each figure reveals or moves over the scene's
// `duration` and rests on its finished picture for the last fifth, so a paused frame at 80 % is complete.

import { tryParseExpression, variables, evaluate, type Expression } from "../../math/expression";
import { formatF } from "../../math/printf";
import type { Illustration, IllustrationElement, IllustrationParameter } from "../illustration";
import { TemplateBuilder, TemplateWords } from "../illustrationTemplate";
import { Premade, type PremadeFigure, type PremadeValue } from "../premadeFigure";

/** Reading a figure's params as the Mac does: finite numbers, trimmed text, lists of numbers or objects. */
export class Params {
  constructor(readonly figure: PremadeFigure) {}

  number(key: string): number | null {
    const value = Premade.number(this.figure.params[key]);
    return value !== null && Number.isFinite(value) ? value : null;
  }

  numbers(key: string): number[] | null {
    const entries = Premade.array(this.figure.params[key]);
    if (!entries) return null;
    const values = entries
      .map((entry) => Premade.number(entry))
      .filter((v): v is number => v !== null && Number.isFinite(v));
    return values.length === entries.length ? values : null;
  }

  text(key: string): string | null {
    const text = Premade.string(this.figure.params[key])?.trim() ?? "";
    return text === "" ? null : text;
  }

  objects(key: string): Record<string, PremadeValue>[] | null {
    const entries = Premade.array(this.figure.params[key]);
    if (!entries) return null;
    const objects: Record<string, PremadeValue>[] = [];
    for (const entry of entries) {
      const object = Premade.object(entry);
      if (!object) return null;
      objects.push(object);
    }
    return objects;
  }

  has(key: string): boolean {
    return this.figure.params[key] !== undefined;
  }
}

export const slider = (
  name: string,
  label: string,
  value: number,
  min: number,
  max: number,
): IllustrationParameter => ({
  name,
  label,
  value,
  min,
  max,
});

// MARK: Time written as expressions

/** The renderer evaluates these every frame with `t` in seconds, from 0 to `duration`, then repeats. */
export const Anim = {
  n(value: number): string {
    return formatF(value, 5);
  },

  /** A number safe to embed in an expression. */
  lit(value: number): string {
    return value < 0 ? `(${Anim.n(value)})` : Anim.n(value);
  },

  clamp01(u: string): string {
    return `((abs(${u})-abs(${u}-1)+1)/2)`;
  },

  /** 0 before t0, 1 after t1, a straight line between. */
  ramp(t0: number, t1: number): string {
    return Anim.clamp01(`((t-${Anim.lit(t0)})/${Anim.n(Math.max(t1 - t0, 0.001))})`);
  },

  /** Smooth ease in/out on top of `ramp` (smoothstep). */
  smoothRamp(t0: number, t1: number): string {
    const u = Anim.ramp(t0, t1);
    return `(${u}*${u}*(3-2*${u}))`;
  },

  /** Sinusoidal ease in/out: gentle at both ends, for calm motion. */
  smootherRamp(t0: number, t1: number): string {
    return `(0.5-0.5*cos(pi*${Anim.ramp(t0, t1)}))`;
  },

  /** Calm ease in/out that overshoots 1 by about 1 % near the end and settles: a soft spring. */
  springRamp(t0: number, t1: number): string {
    const u = Anim.ramp(t0, t1);
    return `(${Anim.smootherRamp(t0, t1)}+0.07*${u}*sin(pi*${u}))`;
  },

  /** Like `simTime` but on the calm sinusoidal ease. */
  calmTime(tMax: number, from: number, to: number): string {
    return `${Anim.lit(tMax)}*${Anim.smootherRamp(from, to)}`;
  },

  /** Simulation time τ in [0, tMax], eased between `from` and `to` on the scene clock `t`. */
  simTime(tMax: number, from: number, to: number): string {
    return `${Anim.lit(tMax)}*(${Anim.smoothRamp(from, to)})`;
  },

  /** Shown (positive) once t passes t0. */
  after(t0: number): string {
    return `t-${Anim.lit(t0)}`;
  },

  /** Shown (positive) only while t0 < t < t1. */
  window(t0: number, t1: number): string {
    return `${Anim.n(t1 - t0)}-abs(2*t-${Anim.lit(t0 + t1)})`;
  },

  /** `expression` held between `low` and `high`. */
  clamp(expression: string, low: number, high: number): string {
    const floored = `((${expression}) + ${Anim.lit(low)} + abs((${expression}) - ${Anim.lit(low)}))/2`;
    return `((${floored}) + ${Anim.lit(high)} - abs((${floored}) - ${Anim.lit(high)}))/2`;
  },

  /** A duration that lets the animation end at 80 % and rest. */
  duration(end: number): number {
    return Math.max(4, end / 0.8);
  },
};

/** The expression as text with each variable in `names` replaced by its text (Expression.text(replacing:)). */
export function expressionText(expression: Expression, names: Readonly<Record<string, string>>): string {
  switch (expression.kind) {
    case "number":
      return expression.value < 0 ? `(${formatF(expression.value, 10)})` : formatF(expression.value, 10);
    case "variable": {
      const replacement = names[expression.name];
      return replacement !== undefined ? `(${replacement})` : expression.name;
    }
    case "unary":
      return `(${expression.op}${expressionText(expression.operand, names)})`;
    case "binary":
      return `(${expressionText(expression.left, names)}${expression.op}${expressionText(expression.right, names)})`;
    case "function":
      return `${expression.name}(${expressionText(expression.argument, names)})`;
  }
}

/** A function of x the model wrote, checked and ready to evaluate or draw. */
export class PlottedFunction {
  private constructor(
    readonly text: string,
    private readonly expression: Expression,
  ) {}

  static make(text: string | null | undefined): PlottedFunction | null {
    if (typeof text !== "string") return null;
    const parsed = tryParseExpression(text);
    if (!parsed) return null;
    for (const name of variables(parsed)) if (name !== "x") return null;
    return new PlottedFunction(text, parsed);
  }

  value(x: number): number {
    return evaluate(this.expression, { x });
  }

  /** The expression with `x` replaced, for a curve element in the parameter `s`. */
  replacing(replacement: string): string {
    return expressionText(this.expression, { x: replacement });
  }
}

/** An expression in two variables (x, y), for fields and surfaces. */
export class PlottedField {
  private constructor(
    readonly text: string,
    private readonly expression: Expression,
  ) {}

  static make(text: string | null | undefined): PlottedField | null {
    if (typeof text !== "string") return null;
    const parsed = tryParseExpression(text);
    if (!parsed) return null;
    for (const name of variables(parsed)) if (name !== "x" && name !== "y") return null;
    return new PlottedField(text, parsed);
  }

  value(x: number, y: number): number {
    return evaluate(this.expression, { x, y });
  }
}

export interface CurveRun {
  from: number;
  to: number;
}

// MARK: Plot frame

/** Maths coordinates mapped into the 10 × 6 world. */
export class PremadeFrame {
  constructor(
    readonly xLow: number,
    readonly xHigh: number,
    readonly yLow: number,
    readonly yHigh: number,
    readonly left = 1.4,
    readonly right = 9.2,
    readonly bottom = 1.35,
    readonly top = 5.0,
  ) {}

  get kx(): number {
    return (this.right - this.left) / (this.xHigh - this.xLow);
  }
  get ky(): number {
    return (this.top - this.bottom) / (this.yHigh - this.yLow);
  }
  x(value: number): number {
    return this.left + (value - this.xLow) * this.kx;
  }
  y(value: number): number {
    return this.bottom + (value - this.yLow) * this.ky;
  }
  containsX(value: number): boolean {
    return value >= this.xLow && value <= this.xHigh;
  }
  containsY(value: number): boolean {
    return value >= this.yLow && value <= this.yHigh;
  }

  /** World x of an expression written in maths x. */
  xText(expression: string): string {
    return `${Anim.n(this.left)} + ((${expression}) - ${Anim.lit(this.xLow)})*${Anim.lit(this.kx)}`;
  }

  yText(expression: string): string {
    return `${Anim.n(this.bottom)} + ((${expression}) - ${Anim.lit(this.yLow)})*${Anim.lit(this.ky)}`;
  }

  /** World position of the x axis and of the y axis (at zero, else the near edge). */
  get axisY(): number {
    return this.containsY(0) ? this.y(0) : this.yLow > 0 ? this.bottom : this.top;
  }
  get axisX(): number {
    return this.containsX(0) ? this.x(0) : this.xLow > 0 ? this.left : this.right;
  }

  /** A frame whose y range holds most of the functions' values over [xLow, xHigh]. */
  static fitting(functions: PlottedFunction[], xLow: number, xHigh: number, include: number[] = []): PremadeFrame {
    const values: number[] = [];
    for (const f of functions)
      for (let index = 0; index <= 200; index++) values.push(f.value(xLow + ((xHigh - xLow) * index) / 200));
    return PremadeFrame.fittingValues(values, xLow, xHigh, include);
  }

  /** A frame whose y range holds the middle 94 % of `values`, and all of `include`. */
  static fittingValues(values: number[], xLow: number, xHigh: number, include: number[] = []): PremadeFrame {
    const sorted = values.filter((v) => Number.isFinite(v) && Math.abs(v) < 1e6).sort((a, b) => a - b);
    let low = sorted.length === 0 ? -1 : sorted[Math.trunc((sorted.length - 1) * 0.03)]!;
    let high = sorted.length === 0 ? 1 : sorted[Math.trunc((sorted.length - 1) * 0.97)]!;
    for (const extra of include)
      if (Number.isFinite(extra)) {
        low = Math.min(low, extra);
        high = Math.max(high, extra);
      }
    if (high - low < 1e-9) {
      low -= 1;
      high += 1;
    }
    const pad = (high - low) * 0.12;
    return new PremadeFrame(xLow, xHigh, low - pad, high + pad);
  }

  /** Equal units on both axes, the ranges grown to fill the box. */
  static equalScale(
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    left = 1.4,
    right = 9.2,
    bottom = 1.35,
    top = 5.0,
  ): PremadeFrame {
    let spanX = Math.max(maxX - minX, 1e-6);
    let spanY = Math.max(maxY - minY, 1e-6);
    spanX *= 1.1;
    spanY *= 1.1;
    const aspect = (right - left) / (top - bottom);
    if (spanX / spanY < aspect) spanX = spanY * aspect;
    else spanY = spanX / aspect;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return new PremadeFrame(cx - spanX / 2, cx + spanX / 2, cy - spanY / 2, cy + spanY / 2, left, right, bottom, top);
  }

  /** Stretches of [from, to] where the function is finite and inside the frame, found by sampling and bisecting the
   * edges, so a curve never leaves the box. */
  runs(f: PlottedFunction, from: number, to: number, samples = 240): CurveRun[] {
    if (!(to > from)) return [];
    const inside = (x: number) => {
      const value = f.value(x);
      return Number.isFinite(value) && value >= this.yLow && value <= this.yHigh;
    };
    const edge = (goodStart: number, badStart: number) => {
      let good = goodStart;
      let bad = badStart;
      for (let i = 0; i < 40; i++) {
        const middle = (good + bad) / 2;
        if (inside(middle)) good = middle;
        else bad = middle;
      }
      return good;
    };
    const step = (to - from) / samples;
    const runs: CurveRun[] = [];
    let start: number | null = null;
    let previous = from;
    for (let index = 0; index <= samples; index++) {
      const x = index === samples ? to : from + step * index;
      if (inside(x)) {
        if (start === null) start = index === 0 ? x : edge(x, previous);
      } else if (start !== null) {
        runs.push({ from: start, to: edge(previous, x) });
        start = null;
      }
      previous = x;
    }
    if (start !== null) runs.push({ from: start, to });
    return runs.filter((run) => run.to - run.from > step * 0.2);
  }
}

// MARK: Label placement

export interface LabelBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  // The boxes are taller than the text, so boxes that only just touch (ticks a label's height apart) do not overlap.
  const margin = 0.01;
  return a.minX < b.maxX - margin && b.minX < a.maxX - margin && a.minY < b.maxY - margin && b.minY < a.maxY - margin;
}

/** Boxes of the labels written so far, so a new one keeps clear of them. */
export class LabelBoard {
  static readonly charWidth = 0.13;
  static readonly labelHeight = 0.46;
  static readonly room: LabelBox = { minX: 0.12, maxX: 9.88, minY: 0.23, maxY: 5.77 };

  readonly boxes: LabelBox[] = [];
  /** Small boxes along drawn strokes: labels that name something stay off them when they can. */
  readonly strokes: LabelBox[] = [];

  static box(text: string, x: number, y: number, anchor: string): LabelBox {
    const width = Array.from(text).length * LabelBoard.charWidth;
    const minX = anchor === "trailing" ? x - width : anchor === "center" ? x - width / 2 : x;
    return { minX, maxX: minX + width, minY: y - LabelBoard.labelHeight / 2, maxY: y + LabelBoard.labelHeight / 2 };
  }

  /** `clearance` keeps the box that far from every label already placed (axis tick numbers included). */
  isFree(box: LabelBox, avoidingStrokes = false, clearance = 0): boolean {
    const room = LabelBoard.room;
    if (box.minX < room.minX || box.maxX > room.maxX || box.minY < room.minY || box.maxY > room.maxY) return false;
    const apart = {
      minX: box.minX - clearance,
      maxX: box.maxX + clearance,
      minY: box.minY - clearance,
      maxY: box.maxY + clearance,
    };
    if (this.boxes.some((placed) => boxesOverlap(placed, apart))) return false;
    return !avoidingStrokes || !this.strokes.some((stroke) => boxesOverlap(stroke, box));
  }

  reserve(box: LabelBox): void {
    this.boxes.push(box);
  }

  reserveStroke(x: number, y: number): void {
    this.strokes.push({ minX: x - 0.07, maxX: x + 0.07, minY: y - 0.07, maxY: y + 0.07 });
  }
}

// MARK: Canvas

type WorldValue = number | string;
const world = (value: WorldValue) => (typeof value === "number" ? Anim.n(value) : value);
const numeric = (value: WorldValue): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return typeof value === "string" && !/^\s*-?\d+(\.\d+)?\s*$/.test(value)
    ? null
    : Number.isFinite(parsed)
      ? parsed
      : null;
};

/** An animated figure: the scene and, for stepped playback, the times each step finishes. */
export type AnimatedIllustration = Illustration & {
  stepPlayback?: { boundaries: number[] } | null;
  /** Until this second the stage's own mascot body is out of its corner, standing in the figure. */
  mascotHoldsUntil?: number | null;
};

/** Collects a figure's elements in the 10 × 6 world. */
export class FigureCanvas {
  readonly words: TemplateWords;
  readonly portuguese: boolean;
  readonly elements: IllustrationElement[] = [];
  readonly board = new LabelBoard();
  /** Times when each interactive step completes. */
  stepBoundaries: number[] = [];

  constructor(language: string) {
    this.words = new TemplateWords(language);
    this.portuguese = language.toLowerCase().includes("portug");
  }

  /** The Portuguese or the English wording. */
  say(pt: string, en: string): string {
    return this.portuguese ? pt : en;
  }

  /** A number with the language's decimal mark. */
  number(value: number, digits = 3): string {
    return this.words.number(value, digits);
  }

  /** A whole number without scientific notation (e.g. 230, not 2,30×10²). */
  integer(value: number): string {
    const text = formatF(Math.round(value), 0);
    return this.words.decimalComma ? text.replace(/\./g, ",") : text;
  }

  /** Items in a row, split by "; " where the decimal mark is a comma so the two cannot be confused. */
  list(items: string[]): string {
    return items.join(this.words.decimalComma ? "; " : ", ");
  }

  line(
    x: WorldValue,
    y: WorldValue,
    x2: WorldValue,
    y2: WorldValue,
    options: { color?: string | null; dashed?: boolean; visible?: string | null } = {},
  ): void {
    const ax = numeric(x);
    const ay = numeric(y);
    const bx = numeric(x2);
    const by = numeric(y2);
    if (ax !== null && ay !== null && bx !== null && by !== null)
      for (let step = 0; step <= 20; step++)
        this.board.reserveStroke(ax + ((bx - ax) * step) / 20, ay + ((by - ay) * step) / 20);
    this.elements.push({
      kind: "line",
      x: world(x),
      y: world(y),
      x2: world(x2),
      y2: world(y2),
      color: options.color ?? null,
      dashed: options.dashed ? true : null,
      visible: options.visible ?? null,
    });
  }

  arrow(
    x: WorldValue,
    y: WorldValue,
    x2: WorldValue,
    y2: WorldValue,
    options: { color?: string | null; visible?: string | null } = {},
  ): void {
    this.elements.push({
      kind: "arrow",
      x: world(x),
      y: world(y),
      x2: world(x2),
      y2: world(y2),
      color: options.color ?? null,
      visible: options.visible ?? null,
    });
  }

  dot(x: WorldValue, y: WorldValue, options: { color?: string | null; visible?: string | null } = {}): void {
    this.elements.push({
      kind: "point",
      x: world(x),
      y: world(y),
      color: options.color === undefined ? "accent" : options.color,
      visible: options.visible ?? null,
    });
  }

  /** A circle; under about 0.09 it is drawn as an open point. */
  ring(
    x: WorldValue,
    y: WorldValue,
    radius: WorldValue,
    options: {
      text?: string | null;
      color?: string | null;
      dashed?: boolean;
      fill?: number | null;
      stroke?: boolean;
      shading?: string | null;
      visible?: string | null;
    } = {},
  ): void {
    this.elements.push({
      kind: "circle",
      x: world(x),
      y: world(y),
      r: world(radius),
      text: options.text ?? null,
      color: options.color ?? null,
      dashed: options.dashed ? true : null,
      fill: options.fill ?? null,
      stroke: options.stroke === false ? false : null,
      shading: options.shading ?? null,
      visible: options.visible ?? null,
    });
  }

  /** A box with its bottom-left corner at (x, y); a negative height hangs below. */
  box(
    x: WorldValue,
    y: WorldValue,
    width: WorldValue,
    height: WorldValue,
    options: { text?: string | null; color?: string | null; dashed?: boolean; visible?: string | null } = {},
  ): void {
    this.elements.push({
      kind: "rect",
      x: world(x),
      y: world(y),
      w: world(width),
      h: world(height),
      text: options.text ?? null,
      color: options.color ?? null,
      dashed: options.dashed ? true : null,
      visible: options.visible ?? null,
    });
  }

  curve(
    x: string,
    y: string,
    from: string,
    to: string,
    options: {
      color?: string | null;
      dashed?: boolean;
      fill?: number | null;
      stroke?: boolean;
      visible?: string | null;
    } = {},
  ): void {
    this.elements.push({
      kind: "curve",
      color: options.color ?? null,
      dashed: options.dashed ? true : null,
      fill: options.fill ?? null,
      stroke: options.stroke === false ? false : null,
      curveX: x,
      curveY: y,
      from,
      to,
      visible: options.visible ?? null,
    });
  }

  /** Text at an exact spot. With `claim`, it is dropped when it would cover another label. */
  label(
    text: string,
    x: number,
    y: number,
    options: {
      anchor?: string;
      color?: string | null;
      visible?: string | null;
      claim?: boolean;
      avoidStrokes?: boolean;
      clearance?: number;
      sentence?: string | null;
    } = {},
  ): boolean {
    const anchor = options.anchor ?? "center";
    if (options.claim ?? true) {
      const box = LabelBoard.box(text, x, y, anchor);
      if (!this.board.isFree(box, options.avoidStrokes ?? false, options.clearance ?? 0)) return false;
      this.board.reserve(box);
    }
    this.elements.push({
      kind: "label",
      x: Anim.n(x),
      y: Anim.n(y),
      text,
      color: options.color === undefined ? "white" : options.color,
      visible: options.visible ?? null,
      anchor,
      sentence: options.sentence ?? null,
    });
    return true;
  }

  /** Text whose position is an expression in time, so it travels with what it names; not checked against labels. */
  movingLabel(
    text: string,
    x: string,
    y: string,
    options: { anchor?: string; color?: string | null; visible?: string | null } = {},
  ): void {
    this.elements.push({
      kind: "label",
      x,
      y,
      text,
      color: options.color === undefined ? "white" : options.color,
      visible: options.visible ?? null,
      anchor: options.anchor ?? "center",
    });
  }

  /** Text beside a point: to its right, else to its left, nudged up or down until nothing is in the way. */
  labelBeside(
    text: string,
    x: number,
    y: number,
    options: { color?: string | null; visible?: string | null; clearance?: number } = {},
  ): boolean {
    const color = options.color === undefined ? "white" : options.color;
    for (const avoid of [true, false])
      for (const gap of [0.14, 0.5])
        for (const dy of [0.3, -0.3, 0.72, -0.72, 0.0, 1.1, -1.1, 1.6, -1.6]) {
          const clearance = avoid ? (options.clearance ?? 0) : 0;
          const common = { color, visible: options.visible ?? null, avoidStrokes: avoid, clearance };
          if (this.label(text, x + gap, y + dy, { ...common, anchor: "leading" })) return true;
          if (this.label(text, x - gap, y + dy, { ...common, anchor: "trailing" })) return true;
        }
    return false;
  }

  /** A line of words for a result: row 0 above the picture, row 1 below it. */
  caption(
    text: string,
    options: { row?: number; color?: string | null; visible?: string | null; claim?: boolean } = {},
  ): boolean {
    return this.label(text, 5.3, (options.row ?? 0) === 0 ? 5.5 : 0.5, {
      anchor: "center",
      color: options.color === undefined ? "white" : options.color,
      visible: options.visible ?? null,
      claim: options.claim ?? true,
    });
  }

  /** Axes through zero where it lies in the frame, with a few numbered ticks. */
  axes(
    frame: PremadeFrame,
    options: {
      xName?: string;
      yName?: string;
      ticks?: boolean;
      visible?: string | null;
      xNameBeyond?: boolean;
      nameBeyondArrow?: boolean;
      titles?: boolean;
    } = {},
  ): void {
    const ay = frame.axisY;
    const ax = frame.axisX;
    const visible = options.visible ?? null;
    this.arrow(frame.left, ay, frame.right + 0.2, ay, { color: "muted", visible });
    this.arrow(ax, frame.bottom, ax, frame.top + 0.2, { color: "muted", visible });
    if (options.titles ?? true)
      this.axisTitles(frame, options.xName ?? "x", options.yName ?? "y", {
        xNameBeyond: (options.xNameBeyond ?? false) || (options.nameBeyondArrow ?? false),
        visible,
      });
    if (options.ticks ?? true) this.axisTicks(frame, visible);
  }

  /** The names of the axes, each clear of the curves: past the arrow's tip, above or below the axis, as there is room. */
  axisTitles(
    frame: PremadeFrame,
    xName: string,
    yName: string,
    options: { xNameBeyond?: boolean; visible?: string | null } = {},
  ): void {
    const ay = frame.axisY;
    const ax = frame.axisX;
    const visible = options.visible ?? null;
    const beyond: [number, number, string] = [frame.right + 0.3, ay, "leading"];
    const above: [number, number, string] = [frame.right + 0.1, ay + 0.3, "trailing"];
    const below: [number, number, string] = [frame.right + 0.1, ay - 0.8, "trailing"];
    const spots = options.xNameBeyond ? [beyond, above, below] : [above, beyond, below];
    if (
      !spots.some(([x, y, anchor]) => this.label(xName, x, y, { anchor, color: "white", visible, avoidStrokes: true }))
    )
      this.label(xName, spots[0]![0], spots[0]![1], { anchor: spots[0]![2], color: "white", visible });
    const tops: [number, number, string][] = [
      [ax + 0.18, frame.top - 0.05, "leading"],
      [ax - 0.18, frame.top - 0.05, "trailing"],
      [ax + 0.18, frame.top + 0.3, "leading"],
    ];
    if (
      !tops.some(([x, y, anchor]) => this.label(yName, x, y, { anchor, color: "white", visible, avoidStrokes: true }))
    )
      this.label(yName, tops[0]![0], tops[0]![1], { anchor: tops[0]![2], color: "white", visible });
  }

  /** The numbered ticks of `axes`, each number on a spot the curves do not cross. */
  axisTicks(frame: PremadeFrame, visible: string | null = null): void {
    const ay = frame.axisY;
    const ax = frame.axisX;
    const xStep = TemplateBuilder.step(frame.xHigh - frame.xLow);
    let value = Math.ceil(frame.xLow / xStep) * xStep;
    while (value <= frame.xHigh + 1e-9) {
      if (Math.abs(value) > 1e-9) this.tick(true, frame.x(value), ay, this.number(value), visible);
      value += xStep;
    }
    const yStep = TemplateBuilder.step(frame.yHigh - frame.yLow);
    value = Math.ceil(frame.yLow / yStep) * yStep;
    while (value <= frame.yHigh + 1e-9) {
      if (Math.abs(value) > 1e-9) this.tick(false, frame.y(value), ax, this.number(value), visible);
      value += yStep;
    }
  }

  /** The number beside its tick: under the axis, else above it, else further away (then without the mark). */
  private tick(horizontal: boolean, position: number, axis: number, text: string, visible: string | null): void {
    if (horizontal) {
      for (const [offset, marked] of [
        [-0.3, true],
        [0.3, true],
        [-0.62, false],
        [0.62, false],
      ] as const)
        if (
          this.label(text, position, axis + offset, { anchor: "center", color: "muted", visible, avoidStrokes: true })
        ) {
          if (marked) this.line(position, axis - 0.06, position, axis + 0.06, { color: "muted", visible });
          return;
        }
    } else {
      for (const [offset, marked] of [
        [-0.14, true],
        [0.14, true],
        [-0.45, false],
        [0.45, false],
      ] as const)
        if (
          this.label(text, axis + offset, position, {
            anchor: offset < 0 ? "trailing" : "leading",
            color: "muted",
            visible,
            avoidStrokes: true,
          })
        ) {
          if (marked) this.line(axis - 0.06, position, axis + 0.06, position, { color: "muted", visible });
          return;
        }
    }
  }

  /** Marks a stretch of a curve as drawn, so labels placed afterwards keep clear of it. */
  reserveStrokes(points: { x: number; y: number }[]): void {
    for (const point of points) this.board.reserveStroke(point.x, point.y);
  }

  /** The graph of `f` from `from` to `to`, drawn left to right between the times. */
  plot(
    f: PlottedFunction,
    frame: PremadeFrame,
    from: number,
    to: number,
    options: {
      color?: string | null;
      dashed?: boolean;
      start?: number;
      end?: number;
      eased?: boolean;
      visible?: string | null;
    } = {},
  ): void {
    const runs = frame.runs(f, from, to);
    const first = runs[0];
    const last = runs[runs.length - 1];
    if (!first || !last) return;
    const start = options.start ?? 0;
    const end = options.end ?? 0;
    const curveX = frame.xText("s");
    const curveY = frame.yText(f.replacing("s"));
    // `eased` follows the calm physics clock (`Anim.calmTime`), so a time cursor sits on the drawn head.
    const progress = options.eased ? Anim.smootherRamp(start, end) : Anim.ramp(start, end);
    const head = end > start ? `${Anim.n(first.from)} + (${Anim.n(last.to - first.from)})*${progress}` : "";
    for (const run of runs) {
      for (let step = 0; step <= 60; step++) {
        const x = run.from + ((run.to - run.from) * step) / 60;
        this.board.reserveStroke(frame.x(x), frame.y(f.value(x)));
      }
      const stop =
        end > start
          ? `${Anim.n(run.from)} + (${Anim.n(run.to - run.from)})*${Anim.clamp01(`((${head} - ${Anim.lit(run.from)})/${Anim.n(run.to - run.from)})`)}`
          : Anim.n(run.to);
      this.curve(curveX, curveY, Anim.n(run.from), stop, {
        color: options.color === undefined ? "white" : options.color,
        dashed: options.dashed ?? false,
        visible: options.visible ?? null,
      });
    }
  }

  recordSteps(boundaries: number[]): void {
    this.stepBoundaries = boundaries;
  }

  illustration(title: string, duration: number, parameters: IllustrationParameter[] = []): AnimatedIllustration {
    const scene: AnimatedIllustration = {
      title,
      width: 10,
      height: 6,
      duration,
      parameters: parameters.length === 0 ? null : parameters,
      elements: this.elements,
    };
    if (this.stepBoundaries.length > 0) scene.stepPlayback = { boundaries: this.stepBoundaries };
    return scene;
  }
}

/** World coordinates stay inside the scene's box with a little margin (PremadeFigure.withinBounds). */
export function withinBounds(scene: Illustration, margin = 1.0): boolean {
  if (scene.elements.length === 0 || scene.width <= 0 || scene.height <= 0) return false;
  for (const element of scene.elements)
    for (const [text, limit] of [
      [element.x, scene.width],
      [element.x2, scene.width],
      [element.y, scene.height],
      [element.y2, scene.height],
    ] as const) {
      if (typeof text !== "string") continue;
      const value = numeric(text);
      if (value === null) continue;
      if (value < -margin || value > limit + margin) return false;
    }
  return true;
}
