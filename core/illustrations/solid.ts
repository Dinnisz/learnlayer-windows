// Port of SafeFormula, GenericSolid and SolidCheck in LearnLayer/Explanation/Figure3DGeneric.swift @ ref 2026-11-04:
// any solid, surface or region the model describes by its equations (premade `solid3d`), read safely, and its volume
// checked against the answer, so a solid turned about the wrong axis or missing a curve is never shown.

import { evaluate, tryParseExpression, variables as expressionVariables, type Expression } from "../math/expression";
import type { PremadeFigure, PremadeValue } from "./premadeFigure";
import { GenericSolidBuilder } from "./solidBuilder";

const allowedCharacters = /^[a-zA-Z0-9 .+\-*/^()−·×√²³π]+$/u;

export class SafeFormula {
  static readonly maxLength = 160;
  static readonly maxDepth = 16;

  private constructor(
    readonly text: string,
    private readonly expression: Expression,
  ) {}

  /** Null for anything but maths in the allowed variables. */
  static make(raw: string | null | undefined, allowed: ReadonlySet<string> | readonly string[]): SafeFormula | null {
    let text = raw?.trim() ?? "";
    if (text === "" || Array.from(text).length > SafeFormula.maxLength) return null;
    // "y = …", "z = …", "f(x) = …": the right-hand side.
    text = text.replace(/^\s*[a-zA-Z](\s*\([a-z,\s]*\))?\s*=/u, "").trim();
    // pt-PT decimal comma, only between digits; any other comma is not maths here.
    text = text.replace(/(\d),(\d)/gu, "$1.$2");
    if (text === "" || !allowedCharacters.test(text)) return null;
    let depth = 0;
    for (const character of text) {
      if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
      if (depth < 0 || depth > SafeFormula.maxDepth) return null;
    }
    if (depth !== 0) return null;
    const parsed = tryParseExpression(text);
    if (!parsed) return null;
    const names = new Set(allowed);
    for (const name of expressionVariables(parsed)) if (!names.has(name)) return null;
    return new SafeFormula(text, parsed);
  }

  /** NaN when undefined there; never ±∞. */
  value(values: Readonly<Record<string, number>>): number {
    const value = evaluate(this.expression, values);
    return Number.isFinite(value) ? value : NaN;
  }

  valueAt(x: number): number {
    return this.value({ x });
  }
}

export type SolidAxis = { kind: "horizontal"; k: number } | { kind: "vertical"; k: number };
export type SectionShape = "square" | "semicircle" | "triangle";

export interface SolidDomain {
  x: [number, number];
  /** A rectangle, or y between two curves in x. */
  y: [number, number] | null;
  yLow: SafeFormula | null;
  yHigh: SafeFormula | null;
}

export type SolidKind =
  | { kind: "revolution"; f: SafeFormula; g: SafeFormula | null; axis: SolidAxis; a: number; b: number }
  | { kind: "surface"; z: SafeFormula; x: [number, number]; y: [number, number] }
  | {
      kind: "parametric";
      x: SafeFormula;
      y: SafeFormula;
      z: SafeFormula;
      u: [number, number];
      v: [number, number];
    }
  | { kind: "bounded"; top: SafeFormula; bottom: SafeFormula; domain: SolidDomain }
  | { kind: "sections"; f: SafeFormula; g: SafeFormula; a: number; b: number; shape: SectionShape };

/** A plane x = c, y = c or z = c (maths axes). */
export interface SolidPlane {
  axis: 0 | 1 | 2;
  value: number;
}

export interface GenericSolid {
  kind: SolidKind;
  planes: SolidPlane[];
}

type Value = PremadeValue;
const isObject = (value: Value | undefined): value is Record<string, Value> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: Value | undefined) => (typeof value === "string" ? value : null);
const asNumber = (value: Value | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : null);

export const GenericSolids = {
  premadeType: "solid3d",
  maxSpan: 1000,

  /** From a premade's params; null when anything is missing, out of bounds or not safe. */
  fromParams(p: Record<string, Value>): GenericSolid | null {
    const number = (key: string) => {
      const value = asNumber(p[key]);
      return value !== null && Math.abs(value) <= GenericSolids.maxSpan ? value : null;
    };
    const range = (key: string, lowKey: string, highKey: string): [number, number] | null => {
      let low = number(lowKey);
      let high = number(highKey);
      const pair = p[key];
      if (Array.isArray(pair) && pair.length === 2) {
        low = asNumber(pair[0]);
        high = asNumber(pair[1]);
      }
      if (low === null || high === null) return null;
      if (Math.abs(low) > GenericSolids.maxSpan || Math.abs(high) > GenericSolids.maxSpan || high - low <= 1e-6)
        return null;
      return [low, high];
    };
    const formula = (key: string, variables: string[]) => SafeFormula.make(asString(p[key]), variables);
    const kindText = (asString(p["kind"]) ?? asString(p["shape"]) ?? "").toLowerCase();
    let kind: SolidKind;
    switch (kindText) {
      case "revolution":
      case "washer": {
        const f = formula("f", ["x"]);
        const interval = range("x", "a", "b");
        if (!f || !interval) return null;
        const g = p["g"] === undefined ? null : formula("g", ["x"]);
        if (p["g"] !== undefined && !g) return null;
        const k = number("k") ?? 0;
        const axisText = (asString(p["axis"]) ?? "x").toLowerCase();
        let axis: SolidAxis;
        if (["x", "ox", "horizontal"].includes(axisText)) axis = { kind: "horizontal", k };
        else if (["y", "oy", "vertical"].includes(axisText)) axis = { kind: "vertical", k };
        else return null;
        kind = { kind: "revolution", f, g, axis, a: interval[0], b: interval[1] };
        break;
      }
      case "surface": {
        const z = formula("z", ["x", "y"]) ?? formula("f", ["x", "y"]);
        const x = range("x", "x0", "x1");
        const y = range("y", "y0", "y1");
        if (!z || !x || !y) return null;
        kind = { kind: "surface", z, x, y };
        break;
      }
      case "parametric": {
        const x = formula("x", ["u", "v"]);
        const y = formula("y", ["u", "v"]);
        const z = formula("z", ["u", "v"]);
        const u = range("u", "u0", "u1");
        const v = range("v", "v0", "v1");
        if (!x || !y || !z || !u || !v) return null;
        kind = { kind: "parametric", x, y, z, u, v };
        break;
      }
      case "bounded": {
        const top = formula("top", ["x", "y"]);
        const x = range("x", "x0", "x1");
        if (!top || !x) return null;
        const bottom = p["bottom"] === undefined ? SafeFormula.make("0", []) : formula("bottom", ["x", "y"]);
        if (!bottom) return null;
        const domain: SolidDomain = { x, y: null, yLow: null, yHigh: null };
        const y = range("y", "y0", "y1");
        if (y) domain.y = y;
        else {
          const low = formula("ylow", ["x"]);
          const high = formula("yhigh", ["x"]);
          if (!low || !high) return null;
          domain.yLow = low;
          domain.yHigh = high;
        }
        kind = { kind: "bounded", top, bottom, domain };
        break;
      }
      case "sections":
      case "crosssections":
      case "cross_sections": {
        const f = formula("f", ["x"]);
        const interval = range("x", "a", "b");
        const shapeText = (asString(p["section"]) ?? "square").toLowerCase();
        if (!f || !interval || !["square", "semicircle", "triangle"].includes(shapeText)) return null;
        const g = p["g"] === undefined ? SafeFormula.make("0", []) : formula("g", ["x"]);
        if (!g) return null;
        kind = { kind: "sections", f, g, a: interval[0], b: interval[1], shape: shapeText as SectionShape };
        break;
      }
      default:
        return null;
    }
    const planes: SolidPlane[] = [];
    const listed = p["planes"];
    for (const entry of Array.isArray(listed) ? listed : []) {
      if (!isObject(entry)) return null;
      (["x", "y", "z"] as const).forEach((name, index) => {
        const value = asNumber(entry[name]);
        if (value !== null && Math.abs(value) <= GenericSolids.maxSpan)
          planes.push({ axis: index as 0 | 1 | 2, value });
      });
    }
    if (planes.length > 3) return null;
    const solid: GenericSolid = { kind, planes };
    // Drawn now, once: a figure that can't be built honestly falls back to 2D.
    return GenericSolidBuilder.build(solid) ? solid : null;
  },

  fromPremade(premade: PremadeFigure | null | undefined): GenericSolid | null {
    return premade && premade.type === GenericSolids.premadeType ? GenericSolids.fromParams(premade.params) : null;
  },

  /** Back to the premade's params (for a repaired solid); only a revolution. */
  premade(solid: GenericSolid): PremadeFigure | null {
    const kind = solid.kind;
    if (kind.kind !== "revolution") return null;
    const params: Record<string, Value> = { kind: "revolution", f: kind.f.text, a: kind.a, b: kind.b };
    if (kind.g) params["g"] = kind.g.text;
    params["axis"] = kind.axis.kind === "horizontal" ? "x" : "y";
    params["k"] = kind.axis.k;
    if (solid.planes.length > 0)
      params["planes"] = solid.planes.map((plane) => ({ [["x", "y", "z"][plane.axis]!]: plane.value }));
    return { type: GenericSolids.premadeType, params };
  },

  /** Equal kinds and planes, formulas compared by their text (SafeFormula's ==). */
  same(a: GenericSolid, b: GenericSolid): boolean {
    const plain = (solid: GenericSolid) =>
      JSON.stringify(solid, (_, value: unknown) => (value instanceof SafeFormula ? value.text : value));
    return plain(a) === plain(b);
  },
};

export const SolidCheck = {
  /** The volume of the solid, by Simpson's rule; null for a surface (no volume) or when undefined. */
  volume(solid: GenericSolid): number | null {
    const simpson = (a: number, b: number, n: number, f: (x: number) => number): number | null => {
      const h = (b - a) / n;
      let sum = 0;
      for (let i = 0; i <= n; i += 1) {
        const value = f(a + i * h);
        if (!Number.isFinite(value)) return null;
        sum += value * (i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2);
      }
      return (sum * h) / 3;
    };
    const kind = solid.kind;
    switch (kind.kind) {
      case "revolution": {
        const { f, g, axis, a, b } = kind;
        if (axis.kind === "horizontal") {
          return simpson(a, b, 400, (x) => {
            const outer = Math.abs(f.valueAt(x) - axis.k);
            const inner = Math.abs((g?.valueAt(x) ?? 0) - axis.k);
            return Math.PI * Math.abs(outer * outer - inner * inner);
          });
        }
        return simpson(
          a,
          b,
          400,
          (x) => 2 * Math.PI * Math.abs(x - axis.k) * Math.abs(f.valueAt(x) - (g?.valueAt(x) ?? 0)),
        );
      }
      case "bounded": {
        const { top, bottom, domain } = kind;
        return simpson(domain.x[0], domain.x[1], 200, (x) => {
          const low = domain.y ? domain.y[0] : (domain.yLow?.valueAt(x) ?? NaN);
          const high = domain.y ? domain.y[1] : (domain.yHigh?.valueAt(x) ?? NaN);
          if (!Number.isFinite(low) || !Number.isFinite(high)) return NaN;
          if (Math.abs(high - low) < 1e-12) return 0;
          return simpson(low, high, 200, (y) => top.value({ x, y }) - bottom.value({ x, y })) ?? NaN;
        });
      }
      case "sections": {
        const { f, g, a, b, shape } = kind;
        return simpson(a, b, 400, (x) => {
          const w = f.valueAt(x) - g.valueAt(x);
          if (shape === "square") return w * w;
          if (shape === "semicircle") return (Math.PI * w * w) / 8;
          return (Math.sqrt(3) / 4) * w * w;
        });
      }
      case "surface":
      case "parametric":
        return null;
    }
  },

  /** The values an answer gives ("V = 7π/15 (unidades de volume)", "V = 8π ≈ 25,13", "4\pi"). */
  values(answer: string): number[] {
    let text = answer;
    const replacements: [string, string][] = [
      ["\\pi", "π"],
      ["\\frac{", "("],
      ["}{", ")/("],
      ["\\,", " "],
      ["\\cdot", "*"],
      ["\\approx", "≈"],
      ["{", "("],
      ["}", ")"],
      ["−", "-"],
      ["$", ""],
    ];
    for (const [from, to] of replacements) text = text.split(from).join(to);
    const found: number[] = [];
    for (const piece of text.split(/[=≈]/u).slice(1)) {
      // Without the units or a bracketed remark ("(unidades de volume)", "cubic units.").
      let formula = piece.replace(/\s*\((?=\s*[A-Za-zÀ-ú≈]).*$/su, "");
      formula = formula.replace(/\s+(?!sqrt|pi\b)[A-Za-zÀ-ú]{2,}.*$/su, "");
      formula = formula.replace(/^[ .,;]+|[ .,;]+$/gu, "");
      const value = SafeFormula.make(formula.replace(/π/gu, "pi"), [])?.value({});
      if (value !== undefined && Number.isFinite(value)) found.push(value);
    }
    return found;
  },

  /** The axis of rotation the statement names ("em torno do eixo Oy", "about the line y = -1"), if one. */
  axis(statement: string): SolidAxis | null {
    const folded = statement.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/−/gu, "-");
    const around = String.raw`(em torno d[ao]|about|around|rotating .{0,40}about|rotacao .{0,40}em torno d[ao])\s+`;
    const number = (pattern: string): number | null => {
      const match = new RegExp(pattern + String.raw`\s*=\s*(-?\d+(?:[.,]\d+)?)`, "u").exec(folded);
      if (!match) return null;
      const value = Number(match[match.length - 1]!.replace(",", "."));
      return Number.isFinite(value) ? value : null;
    };
    const horizontal = number(around + String.raw`(the\s+)?(reta|line)\s+y`);
    if (horizontal !== null) return { kind: "horizontal", k: horizontal };
    const vertical = number(around + String.raw`(the\s+)?(reta|line)\s+x`);
    if (vertical !== null) return { kind: "vertical", k: vertical };
    if (new RegExp(around + String.raw`(eixo\s+(oy|dos\s+yy|y)|(the\s+)?y-axis)`, "u").test(folded))
      return { kind: "vertical", k: 0 };
    if (new RegExp(around + String.raw`(eixo\s+(ox|dos\s+xx|x)|(the\s+)?x-axis)`, "u").test(folded))
      return { kind: "horizontal", k: 0 };
    return null;
  },

  /** A revolution about another axis than the statement names, turned about that one when its volume then is the
   * answer's; null when that does not make it agree. */
  repaired(solid: GenericSolid, statement: string, answer: string): GenericSolid | null {
    const kind = solid.kind;
    if (kind.kind !== "revolution") return null;
    const named = SolidCheck.axis(statement);
    if (!named || (named.kind === kind.axis.kind && named.k === kind.axis.k)) return null;
    const turned: GenericSolid = { kind: { ...kind, axis: named }, planes: solid.planes };
    return GenericSolidBuilder.build(turned) && SolidCheck.agrees(turned, answer) === true ? turned : null;
  },

  /** true: it matches; false: the answer gives a different volume; null: nothing to check. */
  agrees(solid: GenericSolid, answer: string): boolean | null {
    const measured = SolidCheck.volume(solid);
    if (measured === null || measured <= 0) return null;
    const given = SolidCheck.values(answer).filter((value) => value > 0);
    if (given.length === 0) return null;
    // The decimal after ≈ is rounded: 2 % for it.
    return given.some((value) => Math.abs(value - measured) <= 0.02 * measured);
  },
};
