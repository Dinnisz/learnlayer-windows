// Port of LearnLayer/Illustrations/Illustration.swift @ ref 2026-11-04

import { evaluate, tryParseExpression, variables, type Expression } from "../math/expression";
import { latexToUnicode } from "../math/latexText";
import type { Card } from "../problems/problemSolution";

/**
 * An illustration the model describes and the app draws and animates: a projectile, charges and their field lines,
 * a circuit with its current, a counter's states. Positions are expressions in the time `t` and in the scene's
 * parameters, which the student can drag; the model never writes drawing code.
 *
 * World coordinates: x to the right, y up, from (0, 0) to (width, height).
 */
export interface Illustration {
  title: string;
  width: number;
  height: number;
  /** Seconds before the motion repeats; null or 0 for a still picture. */
  duration?: number | null;
  parameters?: IllustrationParameter[] | null;
  elements: IllustrationElement[];
  /** A drawing the app lays out itself (a function, a data series…); its elements are compiled from it. */
  template?: unknown;
  /** A verified premade figure (`type` + `params`); the app draws it locally. */
  premade?: { type: string; params: Record<string, unknown> } | null;
  /** The model needs a free-form picture and no premade or template fit. */
  needsFigure?: boolean | null;
  /** The model drew free-form what must come as a template, twice: not drawn. */
  rejected?: boolean | null;
  /** Marks whose coordinates as written aren't on the curve: the solution may be wrong. */
  disagreements?: string[] | null;
}

export interface IllustrationParameter {
  name: string;
  label?: string | null;
  value: number;
  min: number;
  max: number;
}

export const elementKinds = [
  "point",
  "line",
  "arrow",
  "circle",
  "rect",
  "label",
  "curve",
  "spring",
  "charge",
  "fieldLines",
  "component",
  "state",
  "transition",
  "shape",
] as const;
export type ElementKind = (typeof elementKinds)[number];

export interface IllustrationElement {
  kind: ElementKind;
  x?: string | null;
  y?: string | null;
  /** For a label: the point it names, which it stays beside. */
  x2?: string | null;
  y2?: string | null;
  r?: string | null;
  w?: string | null;
  h?: string | null;
  text?: string | null;
  /** "white" (default), "accent", "second", "muted", or "shadow". */
  color?: string | null;
  dashed?: boolean | null;
  /** For a circle or a closed curve: also fill it with its colour at this opacity (0–1). */
  fill?: number | null;
  /** False: a curve is only filled, with no outline. */
  stroke?: boolean | null;
  /** For a filled circle: 0 is flat, 1 a shaded sphere. */
  shading?: string | null;
  curveX?: string | null;
  curveY?: string | null;
  from?: string | null;
  to?: string | null;
  /** For a shape: 0 is a circle of radius `r`, 1 the outline. */
  morph?: string | null;
  /** For a shape: the outline, evenly spaced along its length. */
  points?: number[][] | null;
  /** For a charge. */
  q?: string | null;
  /** resistor, capacitor, inductor, source, battery, switch, lamp, ground. */
  component?: string | null;
  /** Current along a line or component, in the direction (x, y) → (x2, y2). */
  current?: string | null;
  /** Highlighted while this is > 0 (the current state). */
  active?: string | null;
  /** Drawn only while this is > 0. */
  visible?: string | null;
  /** For a label: "leading" (the default), "trailing" or "center". */
  anchor?: string | null;
  /** For the first line of a sentence drawn over several lines: the whole sentence. */
  sentence?: string | null;
}

export interface Point2D {
  x: number;
  y: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Swift's `String(Double)`: "1.0" for one, "1.2" for 1.2, so expressions read the same as on the Mac. */
export function swiftDouble(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e16) return `${value}.0`;
  return String(value);
}

/** The model often writes plain numbers where an expression is expected ("x": 1.2); read either. */
function expressionField(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return swiftDouble(value);
  return null;
}

const optionalString = (value: unknown) => (typeof value === "string" ? value : null);
const optionalBool = (value: unknown) => (typeof value === "boolean" ? value : null);
const optionalNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

export function decodeElement(value: unknown): IllustrationElement | null {
  if (!isObject(value) || !elementKinds.includes(value.kind as ElementKind)) return null;
  const points = Array.isArray(value.points)
    ? value.points.every((point) => Array.isArray(point) && point.every((n) => typeof n === "number"))
      ? (value.points as number[][])
      : null
    : null;
  return {
    kind: value.kind as ElementKind,
    x: expressionField(value.x),
    y: expressionField(value.y),
    x2: expressionField(value.x2),
    y2: expressionField(value.y2),
    r: expressionField(value.r),
    w: expressionField(value.w),
    h: expressionField(value.h),
    text: optionalString(value.text),
    color: optionalString(value.color),
    dashed: optionalBool(value.dashed),
    fill: optionalNumber(value.fill),
    stroke: optionalBool(value.stroke),
    shading: expressionField(value.shading),
    curveX: expressionField(value.curveX),
    curveY: expressionField(value.curveY),
    from: expressionField(value.from),
    to: expressionField(value.to),
    morph: expressionField(value.morph),
    points,
    q: expressionField(value.q),
    component: optionalString(value.component),
    current: expressionField(value.current),
    active: expressionField(value.active),
    visible: expressionField(value.visible),
    anchor: optionalString(value.anchor),
  };
}

function decodeParameter(value: unknown): IllustrationParameter | null {
  if (!isObject(value) || typeof value.name !== "string") return null;
  const [number, min, max] = [value.value, value.min, value.max].map(optionalNumber);
  if (number === null || min === null || max === null) return null;
  return { name: value.name, label: optionalString(value.label), value: number, min, max };
}

/** A template the app can't read is dropped, not the whole drawing; an element it can't read fails it, as on the Mac. */
export function decodeIllustration(value: unknown): Illustration | null {
  if (!isObject(value)) return null;
  const rawElements = Array.isArray(value.elements) ? value.elements : [];
  const elements = rawElements.map(decodeElement);
  if (elements.some((element) => element === null)) return null;
  let parameters: IllustrationParameter[] | null = null;
  if (Array.isArray(value.parameters)) {
    const decoded = value.parameters.map(decodeParameter);
    parameters = decoded.every((parameter) => parameter !== null) ? (decoded as IllustrationParameter[]) : null;
  }
  const premade =
    isObject(value.premade) && typeof value.premade.type === "string"
      ? { type: value.premade.type, params: isObject(value.premade.params) ? value.premade.params : {} }
      : null;
  return {
    title: optionalString(value.title) ?? "",
    width: optionalNumber(value.width) ?? 10,
    height: optionalNumber(value.height) ?? 6,
    duration: optionalNumber(value.duration),
    parameters,
    elements: elements as IllustrationElement[],
    template: isObject(value.template) ? value.template : null,
    premade,
    needsFigure: optionalBool(value.needsFigure),
    rejected: optionalBool(value.rejected),
    disagreements: Array.isArray(value.disagreements)
      ? value.disagreements.filter((item): item is string => typeof item === "string")
      : null,
  };
}

const expressionKeys = [
  "x",
  "y",
  "x2",
  "y2",
  "r",
  "w",
  "h",
  "curveX",
  "curveY",
  "from",
  "to",
  "morph",
  "shading",
  "q",
  "current",
  "active",
  "visible",
] as const;

/** A scene with its expressions parsed once, evaluated every frame. */
export class CompiledIllustration {
  private readonly parsed = new Map<string, Expression>();
  /** Expressions that failed to read, so the scene can say it is broken. */
  readonly unreadable: string[] = [];
  private readonly startsAtMascot = new Set<string>();

  /** The names a scene uses for the point where the tutor's body is when a figure begins. */
  static readonly mascotStartNames = ["mascotX", "mascotY"] as const;
  static readonly defaultMascotStart: Point2D = { x: 0.7, y: 5.0 };

  constructor(readonly scene: Illustration) {
    for (const element of scene.elements) {
      for (const key of expressionKeys) {
        const text = element[key];
        if (typeof text !== "string" || this.parsed.has(text) || this.unreadable.includes(text)) continue;
        const expression = tryParseExpression(text);
        if (expression) {
          this.parsed.set(text, expression);
          if (text.includes("mascotX") || text.includes("mascotY")) this.startsAtMascot.add(text);
        } else {
          this.unreadable.push(text);
        }
      }
    }
  }

  /** Null when absent or unreadable; NaN when undefined at these values. */
  value(text: string | null | undefined, values: Readonly<Record<string, number>>): number | null {
    if (typeof text !== "string") return null;
    const expression = this.parsed.get(text);
    if (!expression) return null;
    if (this.startsAtMascot.has(text) && values.mascotX === undefined) {
      return evaluate(expression, {
        ...values,
        mascotX: CompiledIllustration.defaultMascotStart.x,
        mascotY: CompiledIllustration.defaultMascotStart.y,
      });
    }
    return evaluate(expression, values);
  }

  /** Every name the expressions use that isn't t, s or a parameter. */
  get undefinedNames(): Set<string> {
    const known = new Set([
      "t",
      "s",
      "revealed",
      "step",
      ...CompiledIllustration.mascotStartNames,
      ...(this.scene.parameters ?? []).map((parameter) => parameter.name),
    ]);
    const names = new Set<string>();
    for (const expression of this.parsed.values())
      for (const name of variables(expression)) if (!known.has(name)) names.add(name);
    return names;
  }

  /** Readable and complete: every expression parses and uses only known names. */
  get isDrawable(): boolean {
    return (
      this.unreadable.length === 0 && this.undefinedNames.size === 0 && this.scene.width > 0 && this.scene.height > 0
    );
  }

  /**
   * A `.shape`'s outline in world coordinates at these values: the circle of radius `r` at (x, y) blended into the
   * scaled outline by `morph`, and trimmed to the fraction from `from` to `to` of its length.
   */
  shapePoints(element: IllustrationElement, values: Readonly<Record<string, number>>): Point2D[] {
    const outline = element.points;
    if (!outline || outline.length <= 1 || !outline.every((point) => point.length === 2)) return [];
    const number = (text: string | null | undefined, fallback: number): number | null => {
      if (text === null || text === undefined) return fallback;
      const value = this.value(text, values);
      return value !== null && Number.isFinite(value) ? value : null;
    };
    const ox = number(element.x, 0);
    const oy = number(element.y, 0);
    const sx = number(element.w, 1);
    const sy = number(element.h, 1);
    const morph = number(element.morph, 1);
    const radius = number(element.r, 0);
    const from = number(element.from, 0);
    const to = number(element.to, 1);
    if ([ox, oy, sx, sy, morph, radius, from, to].some((value) => value === null)) return [];
    const segments = outline.length - 1;
    const phase = Math.atan2(outline[0]![1]!, outline[0]![0]!);
    const blended = outline.map((point, index) => {
      const angle = phase + (2 * Math.PI * index) / segments;
      return {
        x: ox! + (1 - morph!) * radius! * Math.cos(angle) + morph! * sx! * point[0]!,
        y: oy! + (1 - morph!) * radius! * Math.sin(angle) + morph! * sy! * point[1]!,
      };
    });
    const start = Math.max(0, Math.min(1, from!)) * segments;
    const end = Math.max(0, Math.min(1, to!)) * segments;
    if (end <= start) return [];
    const at = (position: number): Point2D => {
      const index = Math.min(segments - 1, Math.trunc(position));
      const along = position - index;
      return {
        x: blended[index]!.x + (blended[index + 1]!.x - blended[index]!.x) * along,
        y: blended[index]!.y + (blended[index + 1]!.y - blended[index]!.y) * along,
      };
    };
    const result = [at(start)];
    let index = Math.trunc(start) + 1;
    while (index < end) {
      result.push(blended[index]!);
      index += 1;
    }
    result.push(at(end));
    return result;
  }
}

/** Free-form elements are trusted only where no template applies: circuits, charges, state machines, bar charts. */
export function isAllowedFreeForm(scene: Illustration): boolean {
  const kinds = new Set(scene.elements.map((element) => element.kind));
  if (["component", "charge", "fieldLines", "state", "transition"].some((kind) => kinds.has(kind as ElementKind)))
    return true;
  return (
    scene.elements.filter((element) => element.kind === "rect").length >= 2 &&
    [...kinds].every((kind) => kind === "rect" || kind === "label" || kind === "line")
  );
}

const superscriptDigits: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
};

/** The digits and fraction bars of a text, for matching a value: "−9/2" → "9/2". */
function digits(text: string): string {
  let result = "";
  for (const character of text) {
    if (superscriptDigits[character]) result += superscriptDigits[character];
    else if (/[0-9/,]/.test(character)) result += character;
  }
  return result;
}

/**
 * Parts that give the answer away (shown "revealed") tied to the solution step that first writes their value: a
 * label's number found in a step's formula or words makes it appear with that step; the rest wait for the answer.
 */
export function gatedBySteps(scene: Illustration, cards: readonly Card[]): Illustration {
  const steps = cards.map((card) => digits(latexToUnicode(card.latex) + " " + (card.note ?? "")));
  return {
    ...scene,
    elements: scene.elements.map((element) => {
      if (element.visible !== "revealed" || !element.text) return element;
      const value = digits(element.text.split("=").pop() ?? element.text);
      if (value.length < 2) return element;
      const index = steps.findIndex((step) => step.includes(value));
      if (index < 0) return element;
      return { ...element, visible: `step - ${index + 1} + 0.5` };
    }),
  };
}
