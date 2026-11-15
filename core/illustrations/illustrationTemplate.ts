// Port of LearnLayer/Illustrations/IllustrationTemplate.swift @ ref 2026-11-04

import { evaluate, tryParseExpression, variables, type Expression } from "../math/expression";
import { formatF, formatG, formatE } from "../math/printf";
import type { Continuity } from "../problems/signTable";
import { swiftDouble, type Illustration, type IllustrationElement, type IllustrationParameter } from "./illustration";
import { LabelPlacer, Rect, type Point } from "./labelPlacer";

/**
 * A drawing the app lays out itself from the solution's facts: the model names a kind (a function, a data series,
 * the unit circle…) and fills in only what it means; the app picks ranges, scales, ticks, arrowheads and where labels
 * go, so no coordinate is invented. Compiles to ordinary elements for the renderer.
 */
export const templateKinds = [
  "function",
  "series",
  "unitCircle",
  "complexPlane",
  "inclinedPlane",
  "timeline",
  "geometry",
] as const;
export type TemplateKind = (typeof templateKinds)[number];

export interface TemplateMark {
  /** The x, as an expression ("0", "ln(2)", "pi/3"). */
  x: string;
  text?: string | null;
}
export interface TemplatePoint {
  x: number;
  y: number;
  text?: string | null;
  /** Shown only once the solution is revealed (it is the answer). */
  answer?: boolean | null;
}
export interface TemplateAngle {
  value: string;
  text?: string | null;
}
export interface TemplateForce {
  kind: string;
  text?: string | null;
  direction?: string | null;
  degrees?: number | null;
  asked?: boolean | null;
}
export interface TemplateEvent {
  year: number;
  text: string;
}
export interface FigurePoint {
  name: string;
  x: string;
  y: string;
  answer?: boolean | null;
}
export interface TemplateSegment {
  from: string;
  to: string;
}
export interface TemplatePolygon {
  vertices: string[];
  asked?: boolean | null;
}
export interface TemplateCircle {
  centre: string;
  radius?: string | null;
  through?: string | null;
}
export interface AngleMark {
  vertex: string;
  from: string;
  to: string;
  text?: string | null;
}
export interface TemplateCurve {
  f: string;
  xMin?: number | null;
  xMax?: number | null;
}

export interface IllustrationTemplate {
  kind: TemplateKind;
  f?: string | null;
  g?: string | null;
  xMin?: number | null;
  xMax?: number | null;
  marks?: TemplateMark[] | null;
  tangent?: boolean | null;
  points?: TemplatePoint[] | null;
  xName?: string | null;
  xUnit?: string | null;
  yName?: string | null;
  yUnit?: string | null;
  connect?: boolean | null;
  /** none, linear or throughOrigin. */
  fit?: string | null;
  angles?: TemplateAngle[] | null;
  showSinCos?: boolean | null;
  radius?: number | null;
  angle?: number | null;
  forces?: TemplateForce[] | null;
  /** up, down or none. */
  motion?: string | null;
  components?: boolean | null;
  figurePoints?: FigurePoint[] | null;
  parameter?: IllustrationParameter | null;
  segments?: TemplateSegment[] | null;
  polygons?: TemplatePolygon[] | null;
  circles?: TemplateCircle[] | null;
  angleMarks?: AngleMark[] | null;
  curves?: TemplateCurve[] | null;
  axes?: boolean | null;
  events?: TemplateEvent[] | null;
}

// MARK: Decoding (tolerant: numbers may come as strings, fields may be missing)

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown) => (typeof value === "string" ? value : null);
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const bool = (value: unknown) => (typeof value === "boolean" ? value : null);

/** A strict `Double(text)`: digits only, no spaces. */
export function parseDouble(text: string | null | undefined): number | null {
  if (typeof text !== "string") return null;
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return null;
  return Number(text);
}

/** `try? decodeIfPresent([T])`: the whole list, or nothing when one item doesn't read. */
function list<T>(value: unknown, read: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.map(read);
  return items.every((item) => item !== null) ? (items as T[]) : null;
}

function textOrNumber(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return swiftDouble(value);
  return null;
}

export function decodeTemplate(value: unknown): IllustrationTemplate | null {
  if (!isObject(value) || !templateKinds.includes(value.kind as TemplateKind)) return null;
  const number = (key: string) => {
    const raw = value[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") return parseDouble(raw.replace(/,/g, "."));
    return null;
  };
  const text = (key: string) => textOrNumber(value[key]);
  return {
    kind: value.kind as TemplateKind,
    f: text("f"),
    g: text("g"),
    xMin: number("xMin"),
    xMax: number("xMax"),
    marks: list(value.marks, (item) => {
      if (!isObject(item)) return null;
      const x = textOrNumber(item.x);
      return x === null ? null : { x, text: str(item.text) };
    }),
    tangent: bool(value.tangent),
    points: list(value.points, (item) => {
      if (!isObject(item) || num(item.x) === null || num(item.y) === null) return null;
      return { x: item.x as number, y: item.y as number, text: str(item.text), answer: bool(item.answer) };
    }),
    xName: text("xName"),
    xUnit: text("xUnit"),
    yName: text("yName"),
    yUnit: text("yUnit"),
    connect: bool(value.connect),
    fit: text("fit"),
    angles: list(value.angles, (item) => {
      if (!isObject(item)) return null;
      const angle = textOrNumber(item.value);
      return angle === null ? null : { value: angle, text: str(item.text) };
    }),
    showSinCos: bool(value.showSinCos),
    radius: number("radius"),
    angle: number("angle"),
    forces: list(value.forces, (item) =>
      isObject(item) && typeof item.kind === "string"
        ? {
            kind: item.kind,
            text: str(item.text),
            direction: str(item.direction),
            degrees: num(item.degrees),
            asked: bool(item.asked),
          }
        : null,
    ),
    motion: text("motion"),
    events: list(value.events, (item) =>
      isObject(item) && num(item.year) !== null && typeof item.text === "string"
        ? { year: item.year as number, text: item.text }
        : null,
    ),
    components: bool(value.components),
    figurePoints: list(value.figurePoints, (item) =>
      isObject(item) && typeof item.name === "string" && typeof item.x === "string" && typeof item.y === "string"
        ? { name: item.name, x: item.x, y: item.y, answer: bool(item.answer) }
        : null,
    ),
    parameter: (() => {
      const item = value.parameter;
      if (!isObject(item) || typeof item.name !== "string") return null;
      const [v, min, max] = [item.value, item.min, item.max].map(num);
      return v === null || min === null || max === null
        ? null
        : { name: item.name, label: str(item.label), value: v, min, max };
    })(),
    segments: list(value.segments, (item) =>
      isObject(item) && typeof item.from === "string" && typeof item.to === "string"
        ? { from: item.from, to: item.to }
        : null,
    ),
    polygons: list(value.polygons, (item) =>
      isObject(item) && Array.isArray(item.vertices) && item.vertices.every((v) => typeof v === "string")
        ? { vertices: item.vertices as string[], asked: bool(item.asked) }
        : null,
    ),
    circles: list(value.circles, (item) =>
      isObject(item) && typeof item.centre === "string"
        ? { centre: item.centre, radius: str(item.radius), through: str(item.through) }
        : null,
    ),
    angleMarks: list(value.angleMarks, (item) =>
      isObject(item) && typeof item.vertex === "string" && typeof item.from === "string" && typeof item.to === "string"
        ? { vertex: item.vertex, from: item.from, to: item.to, text: str(item.text) }
        : null,
    ),
    curves: list(value.curves, (item) =>
      isObject(item) && typeof item.f === "string" ? { f: item.f, xMin: num(item.xMin), xMax: num(item.xMax) } : null,
    ),
    axes: bool(value.axes),
  };
}

// MARK: Compiling

export interface CompiledTemplate {
  elements: IllustrationElement[];
  parameters: IllustrationParameter[];
  disagreements: string[];
}

/**
 * The template as elements in a 10 × 6 world, with its draggable parameters. Empty when its data doesn't make a
 * picture, so the app says it couldn't draw rather than drawing something wrong. `disagreements`: marks whose
 * coordinates, as the model wrote them, aren't where the curve is.
 */
export function compileTemplate(template: IllustrationTemplate, language: string): CompiledTemplate {
  const builder = new TemplateBuilder(new TemplateWords(language));
  let ok: boolean;
  switch (template.kind) {
    case "function":
      ok = builder.function(template);
      break;
    case "series":
      ok = builder.series(template);
      break;
    case "unitCircle":
      ok = builder.unitCircle(template);
      break;
    case "complexPlane":
      ok = builder.complexPlane(template);
      break;
    case "inclinedPlane":
      ok = builder.inclinedPlane(template);
      break;
    case "timeline":
      ok = builder.timeline(template);
      break;
    case "geometry":
      ok = builder.geometry(template);
      break;
  }
  return ok
    ? { elements: builder.elements, parameters: builder.parameters, disagreements: builder.disagreements }
    : { elements: [], parameters: [], disagreements: builder.disagreements };
}

/** The fitted line of a series, for checking ("y = 4.53x − 0.00100, r² = 0.999"). */
export function fitDescription(template: IllustrationTemplate): string | null {
  if (template.kind !== "series") return null;
  const fitted = fittedLine(template);
  if (!fitted) return null;
  return `y = ${formatG(fitted.slope, 4)}·x + ${formatG(fitted.intercept, 4)} (r² = ${formatF(fitted.r2, 4)})`;
}

export function fittedLine(template: IllustrationTemplate): { slope: number; intercept: number; r2: number } | null {
  const points = (template.points ?? []).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const fit = template.fit;
  if (points.length < 2 || (fit !== "linear" && fit !== "throughOrigin")) return null;
  const n = points.length;
  const sx = points.reduce((sum, p) => sum + p.x, 0);
  const sy = points.reduce((sum, p) => sum + p.y, 0);
  const sxx = points.reduce((sum, p) => sum + p.x * p.x, 0);
  const sxy = points.reduce((sum, p) => sum + p.x * p.y, 0);
  let slope: number;
  let intercept: number;
  if (fit === "throughOrigin") {
    if (!(sxx > 0)) return null;
    slope = sxy / sxx;
    intercept = 0;
  } else {
    const denominator = n * sxx - sx * sx;
    if (denominator === 0) return null;
    slope = (n * sxy - sx * sy) / denominator;
    intercept = (sy - slope * sx) / n;
  }
  const mean = sy / n;
  const total = points.reduce((sum, p) => sum + (p.y - mean) ** 2, 0);
  const residual = points.reduce((sum, p) => sum + (p.y - (slope * p.x + intercept)) ** 2, 0);
  return { slope, intercept, r2: total > 0 ? 1 - residual / total : 1 };
}

/** Characters as Swift counts them (close enough for the labels the templates write). */
const count = (text: string) => [...text].length;

/** The few words the app writes into a drawing itself, in the exam's language. */
export class TemplateWords {
  readonly decimalComma: boolean;
  readonly pointOfTangency: string;
  readonly slopeAngle: string;
  readonly circleName: string;
  readonly parabolaName: string;

  constructor(language: string) {
    const lower = language.toLowerCase();
    this.decimalComma = ["portug", "french", "spanish", "german", "italian"].some((word) => lower.includes(word));
    if (lower.includes("portug")) {
      this.pointOfTangency = "a (ponto de tangência)";
      this.slopeAngle = "inclinação θ (°)";
      this.circleName = "circunferência";
      this.parabolaName = "parábola";
    } else if (lower.includes("french")) {
      this.pointOfTangency = "a (point de tangence)";
      this.slopeAngle = "inclinaison θ (°)";
      this.circleName = "cercle";
      this.parabolaName = "parabole";
    } else if (lower.includes("spanish")) {
      this.pointOfTangency = "a (punto de tangencia)";
      this.slopeAngle = "inclinación θ (°)";
      this.circleName = "circunferencia";
      this.parabolaName = "parábola";
    } else {
      this.pointOfTangency = "a (point of tangency)";
      this.slopeAngle = "slope θ (°)";
      this.circleName = "circle";
      this.parabolaName = "parabola";
    }
  }

  /** A number as printed in the exam: three significant figures, its decimal mark. */
  number(value: number, digits = 3): string {
    let text = formatG(value, digits);
    // Whole numbers in full ("18 000"), not "1.8e+04".
    if (value === Math.round(value) && Math.abs(value) >= 1000 && Math.abs(value) < 1e9) {
      text = formatF(value, 0);
      let grouped = "";
      [...text].reverse().forEach((character, index) => {
        if (index > 0 && index % 3 === 0 && character !== "-") grouped += " ";
        grouped += character;
      });
      text = [...grouped].reverse().join("");
    }
    if (text.includes("e")) text = formatE(value, 2);
    if (text === "-0") text = "0";
    text = text.replace(/-/g, "−");
    return this.decimalComma ? text.replace(/\./g, ",") : text;
  }
}

interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

type XY = [number, number];

interface PlottedCurve {
  name: string;
  expression: Expression;
  text: string;
}

const evalAt = (expression: Expression, x: number) => evaluate(expression, { x });

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface LabelOptions {
  color?: string | null;
  visible?: string | null;
  counted?: boolean;
  anchor?: string | null;
  naming?: XY | null;
}

export class TemplateBuilder {
  elements: IllustrationElement[] = [];
  parameters: IllustrationParameter[] = [];
  disagreements: string[] = [];
  /** Labels written so far (axis ticks don't count): at most six. */
  private labelCount = 0;
  /** The box of every label written so far, ticks included. */
  taken: Rect[] = [];
  /** X-axis tick numbers: marks must not sit on them. */
  tickObstacles: Rect[] = [];

  // The plot area inside the 10 × 6 world.
  readonly left = 1.1;
  readonly right = 9.3;
  readonly bottom = 0.8;
  readonly top = 5.4;
  /** Approximate width of a character, in world units, for placing labels. */
  readonly charWidth = 0.13;

  constructor(readonly words: TemplateWords) {}

  static n(value: number): string {
    return formatF(value, 5);
  }

  // MARK: Pieces

  lineN(
    x: number,
    y: number,
    x2: number,
    y2: number,
    color: string | null = null,
    dashed = false,
    visible: string | null = null,
  ) {
    this.line(
      TemplateBuilder.n(x),
      TemplateBuilder.n(y),
      TemplateBuilder.n(x2),
      TemplateBuilder.n(y2),
      color,
      dashed,
      visible,
    );
  }

  line(
    x: string,
    y: string,
    x2: string,
    y2: string,
    color: string | null = null,
    dashed = false,
    visible: string | null = null,
  ) {
    this.elements.push({ kind: "line", x, y, x2, y2, color, dashed: dashed ? true : null, visible });
  }

  arrow(
    x: string,
    y: string,
    x2: string,
    y2: string,
    text: string | null,
    color: string | null = null,
    visible: string | null = null,
  ) {
    const shown = text !== null && this.takeLabel() ? text : null;
    this.elements.push({ kind: "arrow", x, y, x2, y2, text: shown, color, visible });
  }

  /** An axis: a muted arrow, its name at the tip. Not counted as a label. */
  axis(x: number, y: number, x2: number, y2: number, name: string) {
    const n = TemplateBuilder.n;
    this.elements.push({ kind: "arrow", x: n(x), y: n(y), x2: n(x2), y2: n(y2), color: "muted" });
    if (name === "") return;
    if (Math.abs(y2 - y) < Math.abs(x2 - x)) {
      const end = Math.max(0.12 + this.width(name), Math.min(x2, 9.88));
      const above = y + 0.62;
      const placeY = above <= 5.05 ? above : Math.max(0.36, y - 0.7);
      this.label(n(end), n(placeY), name, { color: "muted", counted: false, anchor: "trailing" });
    } else {
      this.label(n(x + 0.28), n(Math.min(y2 - 0.42, 5.32)), name, {
        color: "muted",
        counted: false,
        anchor: "leading",
      });
    }
  }

  /** A label's box. `y` is the vertical centre; `x` is the text's leading edge, or its trailing edge or centre. */
  static labelBox(
    x: number,
    y: number,
    text: string,
    charWidth = 0.13,
    height = 0.62,
    anchor: string | null = null,
  ): Box {
    const width = count(text) * charWidth;
    const minX = anchor === "trailing" ? x - width : anchor === "center" ? x - width / 2 : x;
    return { minX, maxX: minX + width, minY: y - height / 2, maxY: y + height / 2 };
  }

  /** The box of a label element whose position is a number. */
  static labelBoxOf(element: IllustrationElement, height = 0.62): Box | null {
    if (element.kind !== "label" || typeof element.text !== "string") return null;
    const x = parseDouble(element.x);
    const y = parseDouble(element.y);
    if (x === null || y === null) return null;
    return TemplateBuilder.labelBox(x, y, element.text, 0.13, height, element.anchor ?? null);
  }

  /** Room for labels: the picture less a small margin. */
  static readonly labelBounds = new Rect(0.12, 0.22, 9.88, 5.72);

  /** A placer that already holds every label written so far, the given strokes and dots. */
  placer(strokes: XY[][], dots: XY[]): LabelPlacer {
    const placer = new LabelPlacer(TemplateBuilder.labelBounds, 0.04);
    placer.labels = [...this.taken];
    for (const stroke of strokes) placer.addStroke(stroke.map(([x, y]) => ({ x, y })));
    placer.dots = dots.map(([x, y]) => Rect.centred(x, y, 0.2, 0.2));
    return placer;
  }

  plotObstacles(): Rect[] {
    return [...this.tickObstacles];
  }

  /** Extra room a mark label keeps from curves and other labels, beyond the placer's padding. */
  static readonly markHalo = 0.07;

  /** The nearest clear spot for a mark beside its point, trying several bearings. */
  placeMark(
    text: string,
    x: number,
    y: number,
    axisX: number,
    axisY: number,
    room: LabelPlacer,
    preferred: number[] = [],
  ): XY {
    const owner: Point = { x, y };
    const width = this.width(text);
    const height = 0.62;
    const bearings = [...preferred];
    if (Math.abs(x - axisX) < 0.4) bearings.push(0, 90, -90);
    if (Math.abs(y - axisY) < 0.35) bearings.push(-90, 90, 0, 180);
    bearings.push(45, -45, 135, -135, 180, 0);
    const seen = new Set<number>();
    let best: { box: Rect; cost: number } | null = null;
    for (const bearing of bearings) {
      const key = Math.round(bearing * 10);
      if (seen.has(key)) continue;
      seen.add(key);
      const candidates = LabelPlacer.beside(owner, width, height, 0.2, 0.15, 1.2, bearing, true).map((box) =>
        box.kept(TemplateBuilder.labelBounds),
      );
      for (const box of candidates) {
        if (box.distance(owner) > 0.65) continue;
        const cost = room.cost(box.padded(TemplateBuilder.markHalo), Number.MAX_SAFE_INTEGER, owner);
        if (!best || cost < best.cost || (cost === best.cost && box.distance(owner) < best.box.distance(owner)))
          best = { box, cost };
        if (cost === 0) break;
      }
      if (best?.cost === 0) break;
    }
    const box =
      best?.box ??
      LabelPlacer.beside(owner, width, height, 0.2, 0.15, 1.2, preferred[0] ?? null, true)[0]?.kept(
        TemplateBuilder.labelBounds,
      ) ??
      Rect.centred(x + 0.4, y, width, height);
    room.labels.push(box);
    return [box.minX, box.midY];
  }

  /** Drops axis tick numbers that would sit under a revealed mark label. */
  suppressTickLabels(markBoxes: Rect[]) {
    if (markBoxes.length === 0) return;
    this.elements = this.elements.filter((element) => {
      if (element.kind !== "label" || element.color !== "muted" || !element.anchor) return true;
      const box = TemplateBuilder.labelBoxOf(element);
      if (!box) return true;
      const rect = new Rect(box.minX, box.minY, box.maxX, box.maxY);
      return !markBoxes.some((mark) => mark.intersects(rect.padded(0.1)));
    });
  }

  /** Where a label of `text` beside the point (x, y) goes: the nearest clear spot in `placer`, which then holds it. */
  bestPlace(text: string, x: number, y: number, placer: LabelPlacer, towards: number | null = null): XY {
    const candidates = LabelPlacer.beside({ x, y }, this.width(text), 0.62, 0.2, 0.15, 4.5, towards, true);
    const box = placer.place(candidates, { x, y });
    return [box.minX, box.midY];
  }

  /** The plot's axes as strokes, for a placer. */
  static axisStrokes(axisX: number, axisY: number, left: number, right: number, bottom: number, top: number): XY[][] {
    return [
      [
        [left - 0.2, axisY],
        [right + 0.3, axisY],
      ],
      [
        [axisX, bottom - 0.2],
        [axisX, top + 0.3],
      ],
    ];
  }

  /** A curve's samples as strokes, broken where it leaves the window. */
  static curveStrokes(points: (XY | null)[]): XY[][] {
    const strokes: XY[][] = [[]];
    for (const point of points) {
      if (point) strokes[strokes.length - 1]!.push(point);
      else if (strokes[strokes.length - 1]!.length > 0) strokes.push([]);
    }
    return strokes.filter((stroke) => stroke.length >= 2);
  }

  point(x: string, y: string, options: { text?: string | null; color?: string | null; visible?: string | null } = {}) {
    const text = options.text != null && this.takeLabel() ? options.text : null;
    const color = options.color === undefined ? "accent" : options.color;
    this.elements.push({ kind: "point", x, y, text, color, visible: options.visible ?? null });
  }

  /** Text at (x, y), naming the point `naming` when it is a point's. Ticks pass `counted: false`. */
  label(x: string, y: string, text: string, options: LabelOptions = {}) {
    const counted = options.counted ?? true;
    if (counted && !this.takeLabel()) return;
    const naming = options.naming ?? null;
    const element: IllustrationElement = {
      kind: "label",
      x,
      y,
      x2: naming ? TemplateBuilder.n(naming[0]) : null,
      y2: naming ? TemplateBuilder.n(naming[1]) : null,
      text,
      color: options.color ?? null,
      visible: options.visible ?? null,
      anchor: options.anchor ?? null,
    };
    this.elements.push(element);
    const box = TemplateBuilder.labelBoxOf(element);
    if (box) this.taken.push(new Rect(box.minX, box.minY, box.maxX, box.maxY));
  }

  takeLabel(): boolean {
    if (this.labelCount >= 6) return false;
    this.labelCount += 1;
    return true;
  }

  width(text: string): number {
    return count(text) * this.charWidth;
  }

  /**
   * A mark's words with coordinates the app computed. The model's own text stays when its coordinates match the
   * point within 1 %; when they don't, it is dropped and noted as a disagreement. Words alone get the computed point
   * when `addingCoordinates`.
   */
  markText(text: string | null | undefined, x: number, y: number, addingCoordinates: boolean): string | null {
    const separator = this.words.decimalComma ? "; " : ", ";
    const computed = `(${this.words.number(x)}${separator}${this.words.number(y)})`;
    const trimmed = (text ?? "").trim();
    if (trimmed === "") return addingCoordinates ? computed : null;
    const pair = TemplateBuilder.coordinates(trimmed);
    if (pair) {
      if (TemplateBuilder.agrees(pair[0], x) && TemplateBuilder.agrees(pair[1], y)) return trimmed;
      this.disagreements.push(`${trimmed} vs ${computed}`);
      return null;
    }
    if (addingCoordinates) {
      const stated = TemplateBuilder.statedValue(trimmed);
      if (stated !== null && !TemplateBuilder.agrees(stated, y)) {
        this.disagreements.push(`${trimmed} vs ${computed}`);
        return trimmed;
      }
    }
    return addingCoordinates ? `${trimmed} ${computed}` : trimmed;
  }

  static agrees(a: number, b: number): boolean {
    return Math.abs(a - b) <= Math.max(0.01 * Math.abs(b), 1e-6);
  }

  /** The pair in "mín (0; 4−e³)" or "(1,5, −2)", evaluated. */
  static coordinates(text: string): XY | null {
    const open = text.indexOf("(");
    const close = text.lastIndexOf(")");
    if (open < 0 || close < 0 || open >= close) return null;
    const inside = text.slice(open + 1, close);
    const parts = inside.includes(";") ? inside.split(";") : inside.split(", ");
    if (parts.length !== 2) return null;
    const a = TemplateBuilder.value(parts[0]!);
    const b = TemplateBuilder.value(parts[1]!);
    return a === null || b === null ? null : [a, b];
  }

  /** A number written as an exam would ("4−e³", "−9/2", "1,375", "√3/2"), or null. */
  static value(written: string): number | null {
    let text = written.trim();
    for (const [from, to] of [
      ["−", "-"],
      ["×", "*"],
      ["·", "*"],
      ["π", "pi"],
      ["²", "^2"],
      ["³", "^3"],
      ["≈", ""],
      [" ", ""],
    ] as const)
      text = text.split(from).join(to);
    text = text.replace(/(\d),(\d)/g, "$1.$2");
    text = text.replace(/√(\d+(?:\.\d+)?|[a-z]+)/g, "sqrt($1)");
    if (text === "") return null;
    const expression = tryParseExpression(text);
    if (!expression || variables(expression).size > 0) return null;
    const value = evaluate(expression, {});
    return Number.isFinite(value) ? value : null;
  }

  /** Round steps (1, 2, 5 × 10ⁿ) about a quarter of the span. */
  static step(span: number): number {
    if (!(span > 0) || !Number.isFinite(span)) return 1;
    const raw = span / 4;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const fraction = raw / magnitude;
    return (fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10) * magnitude;
  }

  /** Ticks with numbers along both axes of a plot. `clearance` is the gap between a tick label and the axis. */
  ticks(
    xRange: XY,
    yRange: XY,
    axisX: number,
    axisY: number,
    wx: (x: number) => number,
    wy: (y: number) => number,
    clearance = 0.55,
    curveY: ((x: number) => number) | null = null,
  ) {
    const n = TemplateBuilder.n;
    const hits = (a: Box, b: Box) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
    const occupied: Box[] = [];
    this.tickObstacles = [];
    const lineHeight = 0.58;
    const xStep = TemplateBuilder.step(xRange[1] - xRange[0]);
    let value = Math.ceil(xRange[0] / xStep) * xStep;
    while (value <= xRange[1] + 1e-9) {
      if (Math.abs(value) > xStep * 1e-6) {
        const text = this.words.number(value);
        const width = this.width(text);
        this.lineN(wx(value), axisY - 0.07, wx(value), axisY + 0.07, "muted");
        const x = Math.min(Math.max(0.08, wx(value) - width / 2), 9.9 - width);
        const y = Math.max(0.36, axisY - clearance);
        this.label(n(x + width / 2), n(y), text, { color: "muted", counted: false, anchor: "center" });
        const box = { minX: x - 0.06, maxX: x + width + 0.06, minY: y - lineHeight / 2, maxY: y + lineHeight / 2 };
        occupied.push(box);
        this.tickObstacles.push(new Rect(box.minX, box.minY, box.maxX, box.maxY));
      }
      value += xStep;
    }
    const yStep = TemplateBuilder.step(yRange[1] - yRange[0]);
    value = Math.ceil(yRange[0] / yStep) * yStep;
    while (value <= yRange[1] + 1e-9) {
      if (Math.abs(value) > yStep * 1e-6) {
        const text = this.words.number(value);
        const width = this.width(text);
        this.lineN(axisX - 0.07, wy(value), axisX + 0.07, wy(value), "muted");
        let y = wy(value);
        const leftEdge = Math.max(0.08, axisX - clearance - width);
        let box = {
          minX: leftEdge - 0.04,
          maxX: leftEdge + width + 0.08,
          minY: y - lineHeight / 2,
          maxY: y + lineHeight / 2,
        };
        if (curveY) {
          const span = xRange[1] - xRange[0];
          if (span > 0) {
            let hitsInk = false;
            const bandMin = leftEdge - 0.15;
            const bandMax = leftEdge + width + 0.2;
            for (let index = 0; index <= 80; index++) {
              const x = xRange[0] + (span * index) / 80;
              const sx = wx(x);
              if (sx < bandMin || sx > bandMax) continue;
              const height = curveY(x);
              if (!Number.isFinite(height) || Math.abs(height - value) >= yStep * 0.08) continue;
              if (Math.abs(wy(height) - y) <= lineHeight * 0.55) {
                hitsInk = true;
                break;
              }
            }
            if (hitsInk) {
              value += yStep;
              continue;
            }
          }
        }
        if (occupied.some((other) => hits(other, box))) {
          const direction = y >= axisY ? 1 : -1;
          y += direction * (lineHeight + 0.08);
          box = { ...box, minY: y - lineHeight / 2, maxY: y + lineHeight / 2 };
        }
        this.label(n(leftEdge + width), n(y), text, { color: "muted", counted: false, anchor: "trailing" });
        occupied.push(box);
      }
      value += yStep;
    }
  }

  /** The parameter is a height in the figure (a point's y, a radius, a curve), so y = a is part of the drawing. */
  static levelUses(name: string, template: IllustrationTemplate): boolean {
    const pattern = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(name)}(?![A-Za-z0-9_])`);
    if ((template.figurePoints ?? []).some((point) => pattern.test(point.y))) return true;
    if ((template.circles ?? []).some((circle) => pattern.test(circle.radius ?? ""))) return true;
    return (template.curves ?? []).some((curve) => pattern.test(curve.f));
  }

  static isParabola(expression: string): boolean {
    const folded = expression.replace(/ /g, "");
    return folded.includes("x^2") || folded.includes("x*x") || folded.includes("^2");
  }

  /** "1+a/2" as the student reads it. */
  static pretty(expression: string): string {
    return expression.replace(/\*/g, "").replace(/\+/g, " + ");
  }

  /** `expression` with the name `x` replaced by `replacement` ("exp" etc. untouched). */
  static substitute(expression: string, name: string, replacement: string): string {
    const pattern = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(name)}(?![A-Za-z0-9_])`, "g");
    return expression.replace(pattern, () => `(${replacement})`);
  }

  // MARK: Which curve a mark belongs to

  /** The letter a mark names: "g(-1) = 5/2" is g. A function word ("exp") is not one. */
  static calledFunction(text: string): string | null {
    const match = /(?<![A-Za-z])([A-Za-z])\s*\(/.exec(text);
    return match ? match[1]! : null;
  }

  /** The number after "=" in a mark, before a comparison: "5/2" in "g(-1) = 5/2 > 0". */
  static statedValue(text: string): number | null {
    const equals = text.indexOf("=");
    if (equals < 0) return null;
    let tail = text.slice(equals + 1).trim();
    const stop = tail.search(/[<>≤≥≠]/);
    if (stop >= 0) tail = tail.slice(0, stop);
    const written = tail.trim();
    return written === "" ? null : TemplateBuilder.value(written);
  }

  private static curveFor(
    text: string | null | undefined,
    x: number,
    curves: PlottedCurve[],
  ): { y: number; text: string } | null {
    const named = text ? TemplateBuilder.calledFunction(text) : null;
    const stated = text ? TemplateBuilder.statedValue(text) : null;
    const values = curves
      .map((curve) => [curve, evalAt(curve.expression, x)] as const)
      .filter(([, y]) => Number.isFinite(y));
    if (stated !== null) {
      const agreeing = values.filter(([, y]) => TemplateBuilder.agrees(y, stated));
      const match = (named !== null ? agreeing.find(([curve]) => curve.name === named) : undefined) ?? agreeing[0];
      if (match) return { y: match[1], text: match[0].text };
    }
    const match = (named !== null ? values.find(([curve]) => curve.name === named) : undefined) ?? values[0];
    return match ? { y: match[1], text: match[0].text } : null;
  }

  static primaryCurve(texts: string[], fallback: string): string {
    const counts = new Map<string, number>();
    for (const text of texts) counts.set(text, (counts.get(text) ?? 0) + 1);
    let best: [string, number] | null = null;
    for (const entry of counts) {
      if (!best) {
        best = entry;
        continue;
      }
      // Swift's max(by:): the running best gives way when it orders before the next one.
      const less = best[1] !== entry[1] ? best[1] < entry[1] : best[0] !== fallback && entry[0] === fallback;
      if (less) best = entry;
    }
    return best?.[0] ?? fallback;
  }

  /** Where `expression` changes sign on [from, to], by bisection. */
  static signChange(expression: Expression, low: number, high: number): number | null {
    if (!(high > low)) return null;
    const left = evalAt(expression, low);
    const right = evalAt(expression, high);
    if (!Number.isFinite(left) || !Number.isFinite(right) || !(left * right < 0)) return null;
    let a = low;
    let b = high;
    let fa = left;
    for (let index = 0; index < 50; index++) {
      const mid = (a + b) / 2;
      const fm = evalAt(expression, mid);
      if (!Number.isFinite(fm)) return null;
      if (Math.abs(fm) < 1e-7 || Math.abs(b - a) < 1e-5) return mid;
      if (fa * fm <= 0) b = mid;
      else {
        a = mid;
        fa = fm;
      }
    }
    return (a + b) / 2;
  }

  /** World y of a height expression, NaN (a gap) outside the plot. */
  private static worldY(height: string, bottom: number, yLow: number, yHigh: number, sy: number): string {
    const n = TemplateBuilder.n;
    return `${n(bottom)} + ((${height}) - (${n(yLow)}))*${n(sy)} + 0*sqrt(((${n(yHigh)}) - (${height}))*((${height}) - (${n(yLow)})))`;
  }

  // MARK: Function

  function(template: IllustrationTemplate): boolean {
    const n = TemplateBuilder.n;
    const fText = template.f;
    const f = fText ? tryParseExpression(fText) : null;
    if (!fText || !f || ![...variables(f)].every((name) => name === "x")) return false;
    const gParsed = template.g ? tryParseExpression(template.g) : null;
    const g = gParsed && [...variables(gParsed)].every((name) => name === "x") ? gParsed : null;
    const gText = g ? template.g! : null;
    const markXs: [number, string | null][] = [];
    for (const mark of template.marks ?? []) {
      const x = tryParseExpression(mark.x);
      if (!x || variables(x).size > 0) continue;
      const value = evaluate(x, {});
      if (Number.isFinite(value)) markXs.push([value, mark.text ?? null]);
    }
    let xLow: number;
    let xHigh: number;
    const low = template.xMin;
    const high = template.xMax;
    if (low != null && high != null && low < high && Number.isFinite(low) && Number.isFinite(high)) {
      xLow = low;
      xHigh = high;
    } else if (markXs.length > 0) {
      const lowest = Math.min(...markXs.map(([x]) => x));
      const highest = Math.max(...markXs.map(([x]) => x));
      const span = Math.max(highest - lowest, 2);
      xLow = lowest - 0.4 * span;
      xHigh = highest + 0.4 * span;
    } else {
      xLow = -5;
      xHigh = 5;
    }
    for (const [x] of markXs) {
      if (x < xLow) xLow = x - 0.1 * (xHigh - xLow);
      if (x > xHigh) xHigh = x + 0.1 * (xHigh - xLow);
    }
    const curves: PlottedCurve[] = [{ name: "f", expression: f, text: fText }];
    if (g && gText) curves.push({ name: "g", expression: g, text: gText });
    const placed: { x: number; y: number; text: string | null; curve: string }[] = [];
    for (const [x, text] of markXs) {
      const hit = TemplateBuilder.curveFor(text, x, curves);
      if (hit) placed.push({ x, y: hit.y, text, curve: hit.text });
    }
    const primaryText = TemplateBuilder.primaryCurve(
      placed.map((mark) => mark.curve),
      fText,
    );
    const primary = curves.find((curve) => curve.text === primaryText)?.expression ?? f;
    const secondary = curves.find((curve) => curve.text !== primaryText) ?? null;
    const drawSecondary =
      secondary !== null && (placed.length === 0 || placed.some((mark) => mark.curve !== primaryText));
    const samples: number[] = [];
    const drawn = [primary, ...(drawSecondary ? [secondary!.expression] : [])];
    for (let index = 0; index <= 240; index++) {
      const x = xLow + ((xHigh - xLow) * index) / 240;
      for (const curve of drawn) {
        const y = evalAt(curve, x);
        if (Number.isFinite(y)) samples.push(y);
      }
    }
    if (samples.length < 20) return false;
    samples.sort((a, b) => a - b);
    let yLow = samples[Math.trunc((samples.length - 1) * 0.04)]!;
    let yHigh = samples[Math.trunc((samples.length - 1) * 0.96)]!;
    const marks = placed.filter((mark) => mark.curve === primaryText);
    for (const mark of marks) {
      yLow = Math.min(yLow, mark.y);
      yHigh = Math.max(yHigh, mark.y);
    }
    if (marks.length > 0) {
      const markLow = Math.min(...marks.map((mark) => mark.y));
      const markHigh = Math.max(...marks.map((mark) => mark.y));
      const scale = Math.max(1, markHigh - markLow, Math.abs(markLow), Math.abs(markHigh));
      if (yHigh - yLow > 8 * scale) {
        yLow = Math.max(yLow, markLow - 2 * scale);
        yHigh = Math.min(yHigh, markHigh + 4 * scale);
      }
    }
    if (yHigh - yLow < 1e-9) {
      yLow -= 1;
      yHigh += 1;
    }
    if (yLow > 0 && yLow < 0.6 * (yHigh - yLow)) yLow = 0;
    if (yHigh < 0 && -yHigh < 0.6 * (yHigh - yLow)) yHigh = 0;
    const pad = 0.1 * (yHigh - yLow);
    yLow -= pad;
    yHigh += pad;

    const { left, bottom, right, top } = this;
    const sx = (right - left) / (xHigh - xLow);
    const sy = (top - bottom) / (yHigh - yLow);
    const wx = (x: number) => left + (x - xLow) * sx;
    const wy = (y: number) => bottom + (y - yLow) * sy;
    const axisY = yLow <= 0 && 0 <= yHigh ? wy(0) : bottom;
    const axisX = xLow <= 0 && 0 <= xHigh ? wx(0) : left;
    const xAxis = template.xName ? template.xName : "x";
    const yAxis = template.yName ? template.yName : "y";
    this.axis(left - 0.2, axisY, right + 0.3, axisY, xAxis);
    this.axis(axisX, bottom - 0.2, axisX, top + 0.3, yAxis);
    this.ticks([xLow, xHigh], [yLow, yHigh], axisX, axisY, wx, wy, 0.55, (x) => evalAt(primary, x));

    const worldY = (height: string) => TemplateBuilder.worldY(height, bottom, yLow, yHigh, sy);
    const worldX = `${n(left)} + (s - (${n(xLow)}))*${n(sx)}`;
    this.elements.push({
      kind: "curve",
      color: "white",
      curveX: worldX,
      curveY: worldY(TemplateBuilder.substitute(primaryText, "x", "s")),
      from: n(xLow),
      to: n(xHigh),
    });
    if (drawSecondary && secondary) {
      this.elements.push({
        kind: "curve",
        color: "second",
        curveX: worldX,
        curveY: worldY(TemplateBuilder.substitute(secondary.text, "x", "s")),
        from: n(xLow),
        to: n(xHigh),
      });
    }

    let strokes = TemplateBuilder.axisStrokes(axisX, axisY, left, right, bottom, top);
    for (const curve of drawn) {
      const points: (XY | null)[] = [];
      for (let index = 0; index <= 200; index++) {
        const x = xLow + ((xHigh - xLow) * index) / 200;
        const y = evalAt(curve, x);
        points.push(Number.isFinite(y) && y >= yLow && y <= yHigh ? [wx(x), wy(y)] : null);
      }
      strokes = strokes.concat(TemplateBuilder.curveStrokes(points));
    }
    const shown = marks.slice(0, 4);
    const dots: XY[] = shown.map((mark) => [wx(mark.x), wy(mark.y)]);
    const changeLow = shown.length > 0 ? Math.min(...shown.map((mark) => mark.x)) : xLow;
    const changeHigh = shown.length > 0 ? Math.max(...shown.map((mark) => mark.x)) : xHigh;
    const change = TemplateBuilder.signChange(primary, changeLow, changeHigh);
    const crossing = change !== null && yLow <= 0 && 0 <= yHigh ? change : null;
    if (crossing !== null && shown.length < 2) dots.push([wx(crossing), wy(0)]);
    const room = this.placer(strokes, dots);
    room.labels.push(...this.plotObstacles());
    const markBoxes: Rect[] = [];
    for (const mark of shown) {
      this.point(n(wx(mark.x)), n(wy(mark.y)));
      const text = this.markText(mark.text, mark.x, mark.y, true);
      if (text === null) continue;
      const place = this.placeMark(text, wx(mark.x), wy(mark.y), axisX, axisY, room);
      const width = this.width(text);
      markBoxes.push(new Rect(place[0], place[1] - 0.31, place[0] + width, place[1] + 0.31));
      this.label(n(place[0]), n(place[1]), text, {
        color: "accent",
        visible: "revealed",
        naming: [wx(mark.x), wy(mark.y)],
      });
    }
    this.suppressTickLabels(markBoxes);
    if (crossing !== null && shown.length < 2) this.point(n(wx(crossing)), n(wy(0)), { color: "accent" });

    if (template.tangent === true) {
      const start = marks[0]?.x ?? (xLow + xHigh) / 2;
      this.parameters.push({ name: "a", label: this.words.pointOfTangency, value: start, min: xLow, max: xHigh });
      const h = n((xHigh - xLow) * 1e-4);
      const fa = TemplateBuilder.substitute(primaryText, "x", "a");
      const slope = `((${TemplateBuilder.substitute(primaryText, "x", `a + ${h}`)}) - (${TemplateBuilder.substitute(primaryText, "x", `a - ${h}`)}))/(2*${h})`;
      this.elements.push({
        kind: "curve",
        color: "accent",
        dashed: true,
        curveX: worldX,
        curveY: worldY(`(${fa}) + (${slope})*(s - a)`),
        from: n(xLow),
        to: n(xHigh),
      });
      this.point(`${n(left)} + (a - (${n(xLow)}))*${n(sx)}`, worldY(fa));
    }
    return true;
  }

  // MARK: Series

  series(template: IllustrationTemplate): boolean {
    const n = TemplateBuilder.n;
    const points = (template.points ?? []).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (points.length < 2) return false;
    const fitted = fittedLine(template);
    let xLow = Math.min(...points.map((p) => p.x));
    let xHigh = Math.max(...points.map((p) => p.x));
    let yLow = Math.min(...points.map((p) => p.y));
    let yHigh = Math.max(...points.map((p) => p.y));
    if (xHigh - xLow < 1e-12) {
      xLow -= 1;
      xHigh += 1;
    }
    if (yHigh - yLow < 1e-12) {
      yLow -= 1;
      yHigh += 1;
    }
    const xFromZero = xLow > 0 && (xLow < 0.3 * xHigh || template.fit === "throughOrigin");
    const yFromZero = yLow > 0 && (yLow < 0.3 * yHigh || template.fit === "throughOrigin");
    const xSpan = xHigh - xLow;
    const ySpan = yHigh - yLow;
    xLow = xFromZero ? 0 : xLow - 0.08 * xSpan;
    yLow = yFromZero ? 0 : yLow - 0.1 * ySpan;
    xHigh += 0.08 * xSpan;
    yHigh += 0.1 * ySpan;
    const { left, bottom, right, top } = this;
    const sx = (right - left) / (xHigh - xLow);
    const sy = (top - bottom) / (yHigh - yLow);
    const wx = (x: number) => left + (x - xLow) * sx;
    const wy = (y: number) => bottom + (y - yLow) * sy;
    const axisY = yLow <= 0 && 0 <= yHigh ? wy(0) : bottom;
    const axisX = xLow <= 0 && 0 <= xHigh ? wx(0) : left;
    const name = (value: string | null | undefined, unit: string | null | undefined, fallback: string) => {
      const named = value ? value : fallback;
      return unit ? `${named} / ${unit}` : named;
    };
    this.axis(left - 0.2, axisY, right + 0.3, axisY, name(template.xName, template.xUnit, "x"));
    this.axis(axisX, bottom - 0.2, axisX, top + 0.3, name(template.yName, template.yUnit, "y"));
    this.ticks([xLow, xHigh], [yLow, yHigh], axisX, axisY, wx, wy, 0.58);

    const pairs = points.slice(1).map((b, index) => [points[index]!, b] as const);
    if (template.connect === true) for (const [a, b] of pairs) this.lineN(wx(a.x), wy(a.y), wx(b.x), wy(b.y));
    let fitEnds: { from: XY; to: XY } | null = null;
    if (fitted) {
      const ends: XY[] = [];
      for (let index = 0; index <= 200; index++) {
        const x = xLow + ((xHigh - xLow) * index) / 200;
        const y = fitted.slope * x + fitted.intercept;
        if (y >= yLow && y <= yHigh) ends.push([wx(x), wy(y)]);
      }
      if (ends.length > 0) fitEnds = { from: ends[0]!, to: ends[ends.length - 1]! };
    }
    let strokes = TemplateBuilder.axisStrokes(axisX, axisY, left, right, bottom, top);
    if (template.connect === true)
      strokes = strokes.concat(
        pairs.map(([a, b]) => [
          [wx(a.x), wy(a.y)],
          [wx(b.x), wy(b.y)],
        ]),
      );
    if (fitEnds) strokes.push([fitEnds.from, fitEnds.to]);
    const room = this.placer(
      strokes,
      points.map((p) => [wx(p.x), wy(p.y)]),
    );
    room.labels.push(...this.plotObstacles());
    for (const point of points) {
      const visible = point.answer === true ? "revealed" : null;
      this.point(n(wx(point.x)), n(wy(point.y)), { color: "white", visible });
      const text = this.markText(point.text, point.x, point.y, false);
      if (text === null) continue;
      const place = this.bestPlace(text, wx(point.x), wy(point.y), room);
      this.label(n(place[0]), n(place[1]), text, { visible, naming: [wx(point.x), wy(point.y)] });
    }
    if (fitted && fitEnds) {
      this.lineN(fitEnds.from[0], fitEnds.from[1], fitEnds.to[0], fitEnds.to[1], "accent", true);
      const y = this.shortName(template.yName, "y");
      let equation = `${y} = ${this.words.number(fitted.slope)}${this.factor(template.xName, "x")}`;
      const precision = 10 ** (Math.floor(Math.log10(Math.max(Math.abs(fitted.slope), 1e-12))) - 2);
      const intercept = swiftRound(fitted.intercept / precision) * precision;
      if (template.fit !== "throughOrigin" && intercept !== 0) {
        const text = this.words.number(Math.abs(intercept));
        equation += intercept < 0 ? ` − ${text}` : ` + ${text}`;
      }
      const along = 0.8;
      const anchor: XY = [
        fitEnds.from[0] + (fitEnds.to[0] - fitEnds.from[0]) * along,
        fitEnds.from[1] + (fitEnds.to[1] - fitEnds.from[1]) * along,
      ];
      const place = this.bestPlace(equation, anchor[0], anchor[1], room, fitted.slope >= 0 ? 135 : 45);
      this.label(n(place[0]), n(place[1]), equation, { color: "accent", visible: "revealed" });
    }
    return true;
  }

  /** A symbol short enough to write in an equation ("d", "t"), else the fallback. */
  private shortName(name: string | null | undefined, fallback: string): string {
    return name && count(name) <= 3 ? name : fallback;
  }

  /** The axis's quantity as the factor after a number: "4,53x", or "4,53 · h/1,50". */
  private factor(name: string | null | undefined, fallback: string): string {
    if (!name) return fallback;
    const symbol = count(name) <= 3 && /^[\p{L}\p{N}]+$/u.test(name);
    return symbol ? name : ` · ${name}`;
  }

  // MARK: Unit circle

  unitCircle(template: IllustrationTemplate): boolean {
    const n = TemplateBuilder.n;
    const cx = 5;
    const cy = 3;
    const r = 2.3;
    this.axis(cx - r - 0.6, cy, cx + r + 0.6, cy, "x");
    this.axis(cx, cy - r - 0.4, cx, cy + r + 0.5, "y");
    this.elements.push({ kind: "circle", x: n(cx), y: n(cy), r: n(r), color: "muted" });
    let drawn = 0;
    (template.angles ?? []).slice(0, 4).forEach((angle, index) => {
      const expression = tryParseExpression(angle.value);
      if (!expression) return;
      let value = angle.value;
      const names = variables(expression);
      if (names.size > 0) {
        if (!this.parameters.some((parameter) => parameter.name === "theta"))
          this.parameters.push({ name: "theta", label: "θ", value: 0.7, min: 0, max: 2 * Math.PI });
        for (const name of names) value = TemplateBuilder.substitute(value, name, "theta");
      } else if (!Number.isFinite(evaluate(expression, {}))) {
        return;
      }
      const px = `${n(cx)} + ${n(r)}*cos(${value})`;
      const py = `${n(cy)} + ${n(r)}*sin(${value})`;
      const color = index === 0 ? "accent" : "second";
      this.elements.push({ kind: "line", x: n(cx), y: n(cy), x2: px, y2: py, color });
      this.point(px, py, { color });
      if (angle.text && index !== 0) {
        const w = n(this.width(angle.text));
        this.label(
          `${n(cx)} + ${n(r + 0.25)}*cos(${value}) - ${w}*(1 - sign(cos(${value})))/2`,
          `${n(cy)} + ${n(r + 0.25)}*sin(${value})`,
          angle.text,
          { color },
        );
      }
      if (index === 0 && template.showSinCos === true) {
        this.elements.push({
          kind: "curve",
          color: "accent",
          curveX: `${n(cx)} + ${n(r)}*cos(s)`,
          curveY: `${n(cy)} + ${n(r)}*sin(s)`,
          from: "0",
          to: value,
        });
        this.elements.push({ kind: "line", x: px, y: n(cy), x2: px, y2: py, color: "accent", dashed: true });
        this.elements.push({ kind: "line", x: n(cx), y: py, x2: px, y2: py, color: "second", dashed: true });
        this.label(`${n(cx)} + ${n(r * 0.55)}*cos(${value}/2)`, `${n(cy)} - 0.35`, "cos", {
          color: "second",
          anchor: "center",
        });
        this.label(`${px} + 0.22`, `${n(cy)} + ${n(r * 0.55)}*sin(${value}/2)`, "sin", {
          color: "accent",
          anchor: "leading",
        });
      }
      if (index === 0 && angle.text) {
        this.label(
          `${n(cx)} + ${n(r + 0.35)}*cos(${value}/2)`,
          `${n(cy)} + ${n(r + 0.35)}*sin(${value}/2)`,
          angle.text,
          { color, anchor: "center" },
        );
      }
      drawn += 1;
    });
    return drawn > 0;
  }

  // MARK: Complex plane

  complexPlane(template: IllustrationTemplate): boolean {
    const n = TemplateBuilder.n;
    const points = (template.points ?? []).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (points.length === 0 && !((template.radius ?? 0) > 0)) return false;
    const largest = Math.max(
      points.length > 0 ? Math.max(...points.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)))) : 0,
      template.radius ?? 0,
      1e-9,
    );
    const extent = largest * 1.25;
    const cx = 5;
    const cy = 3;
    const half = 2.5;
    const k = half / extent;
    this.axis(cx - half - 0.2, cy, cx + half + 0.4, cy, "Re");
    this.axis(cx, cy - half - 0.2, cx, cy + half + 0.4, "Im");
    const step = TemplateBuilder.step(2 * extent);
    let value = step;
    while (value <= extent + 1e-9) {
      for (const v of [value, -value]) {
        const text = this.words.number(v);
        this.lineN(cx + v * k, cy - 0.07, cx + v * k, cy + 0.07, "muted");
        this.label(n(cx + v * k - this.width(text) / 2), n(cy - 0.3), text, { color: "muted", counted: false });
        this.lineN(cx - 0.07, cy + v * k, cx + 0.07, cy + v * k, "muted");
        this.label(n(cx - 0.15 - this.width(text)), n(cy + v * k), text, { color: "muted", counted: false });
      }
      value += step;
    }
    const radius = template.radius;
    if (radius != null && radius > 0)
      this.elements.push({ kind: "circle", x: n(cx), y: n(cy), r: n(radius * k), color: "muted", dashed: true });
    for (const point of points) {
      const px = cx + point.x * k;
      const py = cy + point.y * k;
      const visible = point.answer === true ? "revealed" : null;
      if (Math.abs(point.y) > 1e-9) this.lineN(px, cy, px, py, "muted", true, visible);
      if (Math.abs(point.x) > 1e-9) this.lineN(cx, py, px, py, "muted", true, visible);
      const text = this.markText(point.text, point.x, point.y, true);
      this.point(n(px), n(py), { text, color: point.answer === true ? "accent" : "white", visible });
    }
    return true;
  }

  // MARK: Inclined plane

  inclinedPlane(template: IllustrationTemplate): boolean {
    const n = TemplateBuilder.n;
    const degrees = Math.min(Math.max(template.angle ?? 30, 10), 60);
    this.parameters.push({ name: "ang", label: this.words.slopeAngle, value: degrees, min: 10, max: 60 });
    const c = "cos(ang*pi/180)";
    const s = "sin(ang*pi/180)";
    const ax = 1;
    const ay = 0.6;
    const length = 6;
    const at = (along: string, out: string): [string, string] => [
      `${n(ax)} + (${along})*${c} - (${out})*${s}`,
      `${n(ay)} + (${along})*${s} + (${out})*${c}`,
    ];
    const top = at(n(length), "0");
    this.line(n(0.3), n(ay), n(9.7), n(ay), "muted");
    this.line(top[0], n(ay), top[0], top[1], "muted");
    this.line(n(ax), n(ay), top[0], top[1]);
    this.label(n(ax + 1.2), n(ay + 0.15), "θ", { color: "muted", counted: false });
    const foot = 0.55 * length;
    const w = 1.1;
    const h = 0.7;
    const corners = [
      at(n(foot - w / 2), "0"),
      at(n(foot + w / 2), "0"),
      at(n(foot + w / 2), n(h)),
      at(n(foot - w / 2), n(h)),
    ];
    for (let index = 0; index < 4; index++) {
      const a = corners[index]!;
      const b = corners[(index + 1) % 4]!;
      this.line(a[0], a[1], b[0], b[1], "second");
    }
    const p = at(n(foot), n(h / 2));
    const weight = 1.7;
    const up: [string, string] = [c, s];
    const out: [string, string] = [`-${s}`, c];
    let weightAsked = false;
    for (const force of (template.forces ?? []).slice(0, 5)) {
      let direction: [string, string];
      let size = "1.2";
      switch (force.kind) {
        case "weight":
          direction = ["0", "-1"];
          size = n(weight);
          weightAsked = force.asked === true;
          break;
        case "normal":
          direction = out;
          size = `${n(weight)}*${c}`;
          break;
        case "friction":
          direction = template.motion === "down" ? up : [`-${c}`, `-${s}`];
          size = "0.9";
          break;
        default:
          switch (force.direction) {
            case "up-the-plane":
              direction = up;
              break;
            case "down-the-plane":
              direction = [`-${c}`, `-${s}`];
              break;
            case "perpendicular":
              direction = out;
              break;
            case "vertical":
              direction = ["0", "1"];
              break;
            case "angle": {
              const a = ((force.degrees ?? 0) * Math.PI) / 180;
              direction = [n(Math.cos(a)), n(Math.sin(a))];
              break;
            }
            default:
              continue;
          }
      }
      const tipX = `${p[0]} + (${direction[0]})*(${size})`;
      const tipY = `${p[1]} + (${direction[1]})*(${size})`;
      const asked = force.asked === true;
      this.arrow(p[0], p[1], tipX, tipY, null, asked ? "accent" : null, asked ? "revealed" : null);
      if (force.text) {
        this.label(
          `(${p[0]})+(${direction[0]})*(${size})*0.55+(${out[0]})*0.35`,
          `(${p[1]})+(${direction[1]})*(${size})*0.55+(${out[1]})*0.35`,
          force.text,
          { color: asked ? "accent" : null, visible: asked ? "revealed" : null, counted: false },
        );
      }
    }
    if (template.components === true) {
      const visible = weightAsked ? "revealed" : null;
      const parallelX = `${p[0]} - ${c}*${n(weight)}*${s}`;
      const parallelY = `${p[1]} - ${s}*${n(weight)}*${s}`;
      const normalX = `${p[0]} + ${s}*${n(weight)}*${c}`;
      const normalY = `${p[1]} - ${c}*${n(weight)}*${c}`;
      this.arrow(p[0], p[1], parallelX, parallelY, null, "muted", visible);
      this.arrow(p[0], p[1], normalX, normalY, null, "muted", visible);
      this.label(
        `((${p[0]})+(${parallelX}))*0.5+(${out[0]})*0.45`,
        `((${p[1]})+(${parallelY}))*0.5+(${out[1]})*0.45`,
        "P∥",
        {
          color: "muted",
          visible,
          counted: false,
        },
      );
      this.label(
        `((${p[0]})+(${normalX}))*0.5+(${out[0]})*0.45`,
        `((${p[1]})+(${normalY}))*0.5+(${out[1]})*0.45`,
        "P⊥",
        {
          color: "muted",
          visible,
          counted: false,
        },
      );
    }
    const motion = template.motion;
    if (motion === "up" || motion === "down") {
      const from = motion === "up" ? 0.6 : 1.9;
      const to = motion === "up" ? 1.9 : 0.6;
      const a = at(n(from), "0.62");
      const b = at(n(to), "0.62");
      this.arrow(a[0], a[1], b[0], b[1], null, "muted");
      this.label(`((${a[0]})+(${b[0]}))*0.5+(${out[0]})*0.35`, `((${a[1]})+(${b[1]}))*0.5+(${out[1]})*0.35`, "v", {
        color: "muted",
        counted: false,
      });
    }
    return true;
  }

  // MARK: Geometry

  geometry(template: IllustrationTemplate): boolean {
    const n = TemplateBuilder.n;
    const figurePoints = (template.figurePoints ?? []).slice(0, 12);
    if (figurePoints.length === 0) return false;
    const parameter = template.parameter && template.parameter.min < template.parameter.max ? template.parameter : null;
    const allowed = new Set(parameter ? [parameter.name] : []);
    const within = (expression: Expression, extra: string[] = []) =>
      [...variables(expression)].every((name) => allowed.has(name) || extra.includes(name));
    const parsed = new Map<string, { x: Expression; y: Expression; xText: string; yText: string }>();
    for (const point of figurePoints) {
      const x = tryParseExpression(point.x);
      const y = tryParseExpression(point.y);
      if (!x || !y || !within(x) || !within(y)) return false;
      parsed.set(point.name, { x, y, xText: point.x, yText: point.y });
    }
    let samples = [0];
    if (parameter)
      samples = [
        ...Array.from({ length: 9 }, (_, index) => parameter.min + ((parameter.max - parameter.min) * index) / 8),
        parameter.value,
      ];
    const xs: number[] = [];
    const ys: number[] = [];
    const valuesAt = (v: number): Record<string, number> => (parameter ? { [parameter.name]: v } : {});
    for (const v of samples) {
      for (const point of parsed.values()) {
        const x = evaluate(point.x, valuesAt(v));
        const y = evaluate(point.y, valuesAt(v));
        if (Number.isFinite(x) && Number.isFinite(y)) {
          xs.push(x);
          ys.push(y);
        }
      }
      for (const circle of template.circles ?? []) {
        const centre = parsed.get(circle.centre);
        if (!centre) continue;
        const cx = evaluate(centre.x, valuesAt(v));
        const cy = evaluate(centre.y, valuesAt(v));
        let r = NaN;
        if (circle.radius) {
          const e = tryParseExpression(circle.radius);
          if (e && within(e)) r = evaluate(e, valuesAt(v));
        }
        const through = circle.through ? parsed.get(circle.through) : undefined;
        if (through) r = Math.hypot(evaluate(through.x, valuesAt(v)) - cx, evaluate(through.y, valuesAt(v)) - cy);
        if (Number.isFinite(r) && Number.isFinite(cx) && Number.isFinite(cy)) {
          xs.push(cx - r, cx + r);
          ys.push(cy - r, cy + r);
        }
      }
    }
    if (template.axes === true) {
      xs.push(0);
      ys.push(0);
    }
    if (xs.length === 0 || ys.length === 0) return false;
    const xLow0 = Math.min(...xs);
    const xHigh0 = Math.max(...xs);
    const yLow0 = Math.min(...ys);
    const yHigh0 = Math.max(...ys);
    const spanX = Math.max(xHigh0 - xLow0, 1e-6);
    const spanY = Math.max(yHigh0 - yLow0, 1e-6);
    const margin = 0.1 * Math.max(spanX, spanY);
    const xLow = xLow0 - margin;
    const xHigh = xHigh0 + margin;
    const yLow = yLow0 - margin;
    const yHigh = yHigh0 + margin;
    const k = Math.min(8.8 / (xHigh - xLow), 5.2 / (yHigh - yLow));
    const x0 = 5 - ((xLow + xHigh) / 2) * k;
    const y0 = 3 - ((yLow + yHigh) / 2) * k;
    const wx = (e: string) => `${n(x0)} + (${e})*${n(k)}`;
    const wy = (e: string) => `${n(y0)} + (${e})*${n(k)}`;
    if (parameter) this.parameters.push(parameter);

    if (template.axes === true) {
      if (yLow <= 0 && 0 <= yHigh) this.axis(x0 + xLow * k, y0, x0 + xHigh * k, y0, "x");
      if (xLow <= 0 && 0 <= xHigh) this.axis(x0, y0 + yLow * k, x0, y0 + yHigh * k, "y");
    }
    for (const curve of (template.curves ?? []).slice(0, 2)) {
      const f = tryParseExpression(curve.f);
      if (!f || !within(f, ["x"])) continue;
      const from = Math.max(curve.xMin ?? xLow, xLow);
      const to = Math.min(curve.xMax ?? xHigh, xHigh);
      if (!(from < to)) continue;
      const height = TemplateBuilder.substitute(curve.f, "x", "s");
      this.elements.push({
        kind: "curve",
        color: "muted",
        curveX: wx("s"),
        curveY: `${wy(height)} + 0*sqrt((${n(yHigh)} - (${height}))*((${height}) - (${n(yLow)})))`,
        from: n(from),
        to: n(to),
      });
      if (TemplateBuilder.isParabola(curve.f))
        this.label(`${wx(n(to))} + 0.2`, wy(TemplateBuilder.substitute(curve.f, "x", n(to))), this.words.parabolaName, {
          counted: false,
        });
    }
    for (const circle of (template.circles ?? []).slice(0, 3)) {
      const centre = parsed.get(circle.centre);
      if (!centre) continue;
      let radius: string | null = null;
      const through = circle.through ? parsed.get(circle.through) : undefined;
      if (through) {
        radius = `sqrt(((${through.xText}) - (${centre.xText}))^2 + ((${through.yText}) - (${centre.yText}))^2)`;
      } else if (circle.radius) {
        const e = tryParseExpression(circle.radius);
        if (e && within(e)) radius = circle.radius;
      }
      if (!radius) continue;
      this.elements.push({
        kind: "circle",
        x: wx(centre.xText),
        y: wy(centre.yText),
        r: `(${radius})*${n(k)}`,
        color: "muted",
      });
      this.label(
        `${wx(centre.xText)} + 0.25`,
        `${wy(`(${centre.yText}) + (${radius})`)} + 0.32`,
        this.words.circleName,
        {
          counted: false,
        },
      );
      if (/\p{L}/u.test(radius))
        this.label(wx(centre.xText), `${wy(centre.yText)} - 0.42`, `r = ${TemplateBuilder.pretty(radius)}`, {
          color: "accent",
          visible: "revealed",
          counted: false,
        });
    }
    if (parameter && TemplateBuilder.levelUses(parameter.name, template)) {
      const caption = `y = ${parameter.name}`;
      this.line(wx(n(xLow)), wy(parameter.name), wx(n(xHigh)), wy(parameter.name), "second", true);
      this.label(`${wx(n(xHigh))} - ${n(this.width(caption) + 0.15)}`, `${wy(parameter.name)} + 0.36`, caption, {
        color: "second",
        counted: false,
      });
    }
    const answers = new Set(figurePoints.filter((point) => point.answer === true).map((point) => point.name));
    const visibility = (...names: string[]) => (names.some((name) => answers.has(name)) ? "revealed" : null);
    for (const segment of (template.segments ?? []).slice(0, 12)) {
      const a = parsed.get(segment.from);
      const b = parsed.get(segment.to);
      if (!a || !b) continue;
      this.elements.push({
        kind: "line",
        x: wx(a.xText),
        y: wy(a.yText),
        x2: wx(b.xText),
        y2: wy(b.yText),
        visible: visibility(segment.from, segment.to),
      });
    }
    for (const polygon of (template.polygons ?? []).slice(0, 3)) {
      const names = polygon.vertices.filter((name) => parsed.has(name));
      if (names.length < 3) continue;
      names.forEach((nameA, index) => {
        const nameB = names[(index + 1) % names.length]!;
        const a = parsed.get(nameA)!;
        const b = parsed.get(nameB)!;
        this.elements.push({
          kind: "line",
          x: wx(a.xText),
          y: wy(a.yText),
          x2: wx(b.xText),
          y2: wy(b.yText),
          visible: visibility(nameA, nameB),
        });
        if (polygon.asked === true)
          this.elements.push({
            kind: "line",
            x: wx(a.xText),
            y: wy(a.yText),
            x2: wx(b.xText),
            y2: wy(b.yText),
            color: "accent",
            visible: "revealed",
          });
      });
    }
    for (const mark of (template.angleMarks ?? []).slice(0, 2)) {
      const v = parsed.get(mark.vertex);
      const a = parsed.get(mark.from);
      const b = parsed.get(mark.to);
      if (!v || !a || !b) continue;
      const unit = (p: { xText: string; yText: string }): [string, string] => {
        const dx = `((${p.xText}) - (${v.xText}))`;
        const dy = `((${p.yText}) - (${v.yText}))`;
        const length = `sqrt(${dx}^2 + ${dy}^2)`;
        return [`${dx}/${length}`, `${dy}/${length}`];
      };
      const u = unit(a);
      const w = unit(b);
      const mx = `((1 - s)*${u[0]} + s*${w[0]})`;
      const my = `((1 - s)*${u[1]} + s*${w[1]})`;
      const norm = `sqrt(${mx}^2 + ${my}^2)`;
      const radius = n(0.45);
      const shown = visibility(mark.vertex, mark.from, mark.to);
      this.elements.push({
        kind: "curve",
        color: "accent",
        curveX: `${wx(v.xText)} + ${radius}*${mx}/${norm}`,
        curveY: `${wy(v.yText)} + ${radius}*${my}/${norm}`,
        from: "0",
        to: "1",
        visible: shown,
      });
      if (mark.text) {
        const bx = `(${u[0]} + ${w[0]})`;
        const by = `(${u[1]} + ${w[1]})`;
        const bn = `sqrt(${bx}^2 + ${by}^2)`;
        this.label(
          `${wx(v.xText)} + 0.75*${bx}/${bn} - ${n(this.width(mark.text) / 2)}`,
          `${wy(v.yText)} + 0.75*${by}/${bn}`,
          mark.text,
          { color: "accent", visible: shown },
        );
      }
    }
    for (const point of figurePoints) {
      const p = parsed.get(point.name);
      if (!p) continue;
      this.elements.push({
        kind: "point",
        x: wx(p.xText),
        y: wy(p.yText),
        text: point.name,
        color: point.answer === true ? "accent" : "white",
        visible: point.answer === true ? "revealed" : null,
      });
    }
    return true;
  }

  // MARK: Timeline

  timeline(template: IllustrationTemplate): boolean {
    const n = TemplateBuilder.n;
    const events = (template.events ?? []).filter((event) => Number.isFinite(event.year)).slice(0, 6);
    if (events.length < 2) return false;
    const sorted = [...events].sort((a, b) => a.year - b.year);
    const low = sorted[0]!.year;
    const high = sorted[sorted.length - 1]!.year;
    const span = Math.max(high - low, 1);
    const axisY = 2.7;
    const x0 = 1;
    const x1 = 9;
    const wx = (year: number) => x0 + ((year - low) / span) * (x1 - x0);
    this.axis(0.5, axisY, 9.6, axisY, "");
    [...events]
      .sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0))
      .forEach((event, index) => {
        const column = index % 2;
        const row = Math.trunc(index / 2);
        this.elements.push({
          kind: "label",
          x: n(0.6 + column * 4.6),
          y: n(5.5 - row * 0.5),
          text: "• " + event.text,
          color: "muted",
          visible: "1 - revealed",
        });
      });
    const levels = [0.75, -0.75, 1.4, -1.4, 2.05, -2.05];
    const ends = levels.map(() => -Infinity);
    for (const event of sorted) {
      const x = wx(event.year);
      this.point(n(x), n(axisY), { visible: "revealed" });
      const text = `${swiftRound(event.year)} – ${event.text}`;
      const textX = Math.min(Math.max(0.2, x - this.width(text) / 2), 9.8 - this.width(text));
      let level = levels.findIndex((_, index) => ends[index]! < textX - 0.15);
      if (level < 0) level = ends.indexOf(Math.min(...ends));
      ends[level] = textX + this.width(text);
      const y = axisY + levels[level]!;
      this.lineN(x, axisY, x, y + (levels[level]! > 0 ? -0.2 : 0.2), "muted", false, "revealed");
      this.elements.push({ kind: "label", x: n(textX), y: n(y), text, visible: "revealed" });
    }
    return true;
  }

  // MARK: Continuity at a point

  continuity(c: Continuity): boolean {
    const n = TemplateBuilder.n;
    const leftBranch = tryParseExpression(c.left);
    const rightBranch = tryParseExpression(c.right);
    if (
      !leftBranch ||
      !rightBranch ||
      ![...variables(leftBranch)].every((name) => name === "x") ||
      ![...variables(rightBranch)].every((name) => name === "x")
    )
      return false;
    const a = c.point;
    const halfWidth = Math.max(2.5, Math.abs(a) * 0.5);
    const xLow = a - halfWidth;
    const xHigh = a + halfWidth;
    const leftLimit = evalAt(leftBranch, a - 1e-7);
    const rightLimit = evalAt(rightBranch, a + 1e-7);
    if (!Number.isFinite(leftLimit) && !Number.isFinite(rightLimit)) return false;
    const samples: number[] = [];
    for (let index = 0; index <= 120; index++) {
      const t = index / 120;
      const yl = evalAt(leftBranch, xLow + (a - xLow) * t * 0.999);
      const yr = evalAt(rightBranch, a + 1e-6 + (xHigh - a) * t);
      for (const y of [yl, yr]) if (Number.isFinite(y)) samples.push(y);
    }
    if (samples.length < 20) return false;
    samples.sort((p, q) => p - q);
    const key = [leftLimit, rightLimit, c.value ?? NaN].filter(Number.isFinite);
    let yLow = Math.min(samples[Math.trunc((samples.length - 1) * 0.1)]!, key.length > 0 ? Math.min(...key) : 0);
    let yHigh = Math.max(samples[Math.trunc((samples.length - 1) * 0.9)]!, key.length > 0 ? Math.max(...key) : 0);
    if (yHigh - yLow < 1e-9) {
      yLow -= 1;
      yHigh += 1;
    }
    const pad = 0.18 * (yHigh - yLow);
    yLow -= pad;
    yHigh += pad;
    const left0 = this.left;
    const bottom0 = this.bottom;
    const { right, top } = this;
    const sx = (right - left0) / (xHigh - xLow);
    const sy = (top - bottom0) / (yHigh - yLow);
    const wx = (x: number) => left0 + (x - xLow) * sx;
    const wy = (y: number) => bottom0 + (y - yLow) * sy;
    const axisY = yLow <= 0 && 0 <= yHigh ? wy(0) : bottom0;
    const axisX = xLow <= 0 && 0 <= xHigh ? wx(0) : left0;
    this.axis(left0 - 0.2, axisY, right + 0.3, axisY, "x");
    this.axis(axisX, bottom0 - 0.2, axisX, top + 0.3, "y");
    this.ticks([xLow, xHigh], [yLow, yHigh], axisX, axisY, wx, wy);
    const tickGap = 1.05;
    if (axisY - tickGap > bottom0 + 0.05) this.lineN(wx(a), bottom0 + 0.05, wx(a), axisY - tickGap, "muted", true);
    this.lineN(wx(a), axisY + 0.45, wx(a), Math.min(top, 5.45), "muted", true);
    const worldY = (height: string) => TemplateBuilder.worldY(height, bottom0, yLow, yHigh, sy);
    const worldX = `${n(left0)} + (s - (${n(xLow)}))*${n(sx)}`;
    const gap = (xHigh - xLow) * 0.004;
    this.elements.push({
      kind: "curve",
      color: "white",
      curveX: worldX,
      curveY: worldY(TemplateBuilder.substitute(c.left, "x", "s")),
      from: n(xLow),
      to: n(a - gap),
    });
    this.elements.push({
      kind: "curve",
      color: "second",
      curveX: worldX,
      curveY: worldY(TemplateBuilder.substitute(c.right, "x", "s")),
      from: n(a + gap),
      to: n(xHigh),
    });
    let strokes = TemplateBuilder.axisStrokes(axisX, axisY, left0, right, bottom0, top);
    strokes.push([
      [wx(a), axisY + 0.45],
      [wx(a), Math.min(top, 5.45)],
    ]);
    if (axisY - tickGap > bottom0 + 0.05)
      strokes.push([
        [wx(a), bottom0 + 0.05],
        [wx(a), axisY - tickGap],
      ]);
    const leftPoints: (XY | null)[] = [];
    const rightPoints: (XY | null)[] = [];
    for (let index = 0; index <= 160; index++) {
      const xl = xLow + (((a - xLow) * index) / 160) * 0.999;
      const yl = evalAt(leftBranch, xl);
      leftPoints.push(Number.isFinite(yl) && yl >= yLow && yl <= yHigh ? [wx(xl), wy(yl)] : null);
      const xr = a + gap + ((xHigh - a - gap) * index) / 160;
      const yr = evalAt(rightBranch, xr);
      rightPoints.push(Number.isFinite(yr) && yr >= yLow && yr <= yHigh ? [wx(xr), wy(yr)] : null);
    }
    strokes = strokes.concat(TemplateBuilder.curveStrokes(leftPoints), TemplateBuilder.curveStrokes(rightPoints));
    const endValues = [leftLimit, rightLimit, c.value ?? NaN].filter(
      (value) => Number.isFinite(value) && value >= yLow && value <= yHigh,
    );
    const room = this.placer(
      strokes,
      endValues.map((value) => [wx(a), wy(value)]),
    );
    room.labels.push(...this.plotObstacles());
    const pointText = c.pointText ?? this.words.number(a);
    const sides: [number, "left" | "right", string, string][] = [
      [leftLimit, "left", "⁻", "white"],
      [rightLimit, "right", "⁺", "second"],
    ];
    for (const [limit, side, sign, color] of sides) {
      if (!Number.isFinite(limit)) continue;
      const closed = c.closedSide === side;
      if (closed) this.point(n(wx(a)), n(wy(limit)), { color });
      else this.elements.push({ kind: "circle", x: n(wx(a)), y: n(wy(limit)), r: "0.09", color });
      const text = `lim x→${pointText}${sign} = ${exactText(limit, this.words)}`;
      const place = this.placeMark(
        text,
        wx(a),
        wy(limit),
        axisX,
        axisY,
        room,
        side === "left" ? [180, -135, 135] : [0, 45, -45],
      );
      const anchorX = side === "left" ? place[0] + this.width(text) : place[0];
      this.label(n(anchorX), n(place[1]), text, {
        color,
        visible: "revealed",
        anchor: side === "left" ? "trailing" : "leading",
        naming: [wx(a), wy(limit)],
      });
    }
    if (c.value != null && Number.isFinite(c.value) && c.closedSide == null) this.point(n(wx(a)), n(wy(c.value)));
    return true;
  }
}

/** Swift's `rounded()`: halves away from zero. */
export function swiftRound(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** A number as an exam writes it: a simple fraction when it is one (−9/2, 1/6). */
export function exactText(value: number, words: TemplateWords): string {
  for (let denominator = 1; denominator <= 12; denominator++) {
    const numerator = value * denominator;
    if (Math.abs(numerator - swiftRound(numerator)) < 1e-6 * Math.max(1, Math.abs(numerator))) {
      const whole = swiftRound(numerator);
      if (denominator === 1) return words.number(whole);
      return (whole < 0 ? "−" : "") + `${Math.abs(whole)}/${denominator}`;
    }
  }
  return words.number(value);
}

/**
 * The two branches of a function near a point, with the lateral limits as open dots (closed on the side that holds
 * the point) and f(point) as a closed dot; their values show once the solution is revealed. Null when the branches
 * don't evaluate there.
 */
export function continuityIllustration(continuity: Continuity, title: string, language: string): Illustration | null {
  const builder = new TemplateBuilder(new TemplateWords(language));
  if (!builder.continuity(continuity)) return null;
  return { title, width: 10, height: 6, duration: null, parameters: [], elements: builder.elements };
}

/** With a template, its elements as the app lays them out (none when its data doesn't compile); otherwise unchanged. */
export function compilingTemplate(scene: Illustration, language: string): Illustration {
  const template = decodeTemplate(scene.template);
  if (!template) return scene;
  const compiled = compileTemplate(template, language);
  return {
    ...scene,
    width: 10,
    height: 6,
    duration: null,
    elements: compiled.elements,
    parameters: compiled.parameters,
    disagreements: compiled.disagreements.length > 0 ? compiled.disagreements : null,
    rejected: compiled.elements.length === 0 ? true : scene.rejected,
  };
}
