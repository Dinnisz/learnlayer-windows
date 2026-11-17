// Port of LearnLayer/Illustrations/PremadeFigure.swift, PremadeFigureKinds.swift (the kinds laid out by the templates)
// and PremadeFigureInteractive.swift (the sliders that recompile a figure) @ ref 2026-11-04.
//
// The animated premades of Calculus 1 (limits, tangent, Maclaurin, Riemann, revolution, exp/log, piecewise, asymptotes,
// sign and variation tables) are drawn by core/illustrations/animated/. The Mac's other animated kinds (series, fields,
// algorithms, physics scenes, Ruffini, orbitals…) are not drawn here yet: `compile` returns null for them, so the
// provider asks for a template instead and a figure that can't be drawn never appears.

import { tryParseExpression, variables } from "../math/expression";
import { formatF } from "../math/printf";
import {
  CompiledIllustration,
  swiftDouble,
  type Illustration,
  type IllustrationElement,
  type IllustrationParameter,
} from "./illustration";
import { compileTemplate, parseDouble, TemplateWords, type IllustrationTemplate } from "./illustrationTemplate";
import { animatedTypes, compileAnimated, mergingAnimatedParameters } from "./animated/animated";

export type PremadeValue = string | number | boolean | PremadeValue[] | { [key: string]: PremadeValue };

export interface PremadeFigure {
  type: string;
  params: Record<string, PremadeValue>;
}

const isObject = (value: unknown): value is Record<string, PremadeValue> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const Premade = {
  string(value: PremadeValue | undefined): string | null {
    if (typeof value === "string") return value;
    if (typeof value === "number") return swiftDouble(value);
    return null;
  },
  number(value: PremadeValue | undefined): number | null {
    if (typeof value === "number") return value;
    if (typeof value === "string") return parseDouble(value.replace(/,/g, "."));
    return null;
  },
  bool(value: PremadeValue | undefined): boolean | null {
    return typeof value === "boolean" ? value : null;
  },
  array(value: PremadeValue | undefined): PremadeValue[] | null {
    return Array.isArray(value) ? value : null;
  },
  object(value: PremadeValue | undefined): Record<string, PremadeValue> | null {
    return isObject(value) ? value : null;
  },
};

export function decodePremade(value: unknown): PremadeFigure | null {
  if (!isObject(value) || typeof value.type !== "string") return null;
  return { type: value.type, params: isObject(value.params) ? value.params : {} };
}

const S = swiftDouble;
const slider = (name: string, label: string, value: number, min: number, max: number): IllustrationParameter => ({
  name,
  label,
  value,
  min,
  max,
});

/** Types whose sliders recompile the figure locally (the ones this port draws). */
const recompiledTypes = new Set([
  "functionGraph",
  "parabola",
  "projectile",
  "wave",
  "lens",
  "tangentLine",
  "riemannSums",
  "limitApproach",
  "seriesPartialSums",
  "motionScene",
  "verticalThrow",
  "inclinedBlock",
  "heatingCurve",
  "lensRays",
  "mirrorRays",
  "refraction",
  "prismDispersion",
  "doubleSlit",
  "parallelPlates",
  "lorentzForce",
  "rcCircuitCurve",
  "acSignal",
  "freeBody",
  "circularMotion",
  "energyBars",
  "collision",
  "springOscillator",
  "resistorNetwork",
  "atwood",
  "arrayLoop",
  "recursionTree",
  "flowchart",
  "truthTable",
  "logicGates",
  "argumentMap",
  "syllogismVenn",
  "fallacies",
  "squareOfOpposition",
]);

export class PremadeFigures {
  constructor(readonly figure: PremadeFigure) {}

  private get params() {
    return this.figure.params;
  }

  private numberParam(key: string): number | null {
    const value = Premade.number(this.params[key]);
    return value !== null && Number.isFinite(value) ? value : null;
  }

  /** The figure, or null for an unknown type or invalid params, so a template or free-form drawing can run instead. */
  compile(title: string, language: string): Illustration | null {
    switch (this.figure.type) {
      case "functionGraph":
        return this.compileFunction(title, language);
      case "inclinedPlane":
        return this.compileInclinedPlane(title, language);
      case "simpleCircuit":
        return this.compileCircuit(title);
      case "triangle":
        return this.compileTriangle(title, language);
      case "motionGraph":
        return this.compileMotion(title, language);
      case "vectors":
        return this.compileVectors(title);
      case "sineCosine":
        return this.compileSineCosine(title, language);
      case "integralArea":
        return this.compileIntegralArea(title, language);
      case "parabola":
        return this.compileParabola(title, language);
      case "circle":
        return this.compileCircle(title, language);
      case "unitCircle":
        return this.compileUnitCircle(title, language);
      case "projectile":
        return this.compileProjectile(title, language);
      case "wave":
        return this.compileWave(title, language);
      case "lens":
        return this.compileLens(title);
      case "statsChart":
        return this.compileStatsChart(title, language);
      default:
        return compileAnimated(this.figure, title, language);
    }
  }

  /** A slider of this figure recompiles it (no model call). */
  get needsParameterRecompile(): boolean {
    return recompiledTypes.has(this.figure.type);
  }

  mergingParameters(values: Readonly<Record<string, number>>): PremadeFigure {
    // The animated figures take a slider's value the way they read it (rounded, kept in range, a shorthand replaced).
    if (animatedTypes.has(this.figure.type)) return mergingAnimatedParameters(this.figure, values);
    const next = { ...this.params };
    for (const [key, value] of Object.entries(values)) next[key] = value;
    return { type: this.figure.type, params: next };
  }

  templateScene(template: IllustrationTemplate, title: string, language: string): Illustration | null {
    const built = compileTemplate(template, language);
    if (built.elements.length === 0) return null;
    return {
      title,
      width: 10,
      height: 6,
      parameters: built.parameters,
      elements: built.elements,
      template,
      premade: this.figure,
    };
  }

  /** Uniform scale and centre free-form elements in the 10 × 6 world. */
  fitToCanvas(elements: IllustrationElement[], margin = 0.9): IllustrationElement[] {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const element of elements) {
      for (const [a, b] of [
        [element.x, element.y],
        [element.x2, element.y2],
      ]) {
        const x = parseDouble(a);
        const y = parseDouble(b);
        if (x !== null && y !== null) {
          xs.push(x);
          ys.push(y);
        }
      }
    }
    if (xs.length === 0) return elements;
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 0.2);
    const spanY = Math.max(maxY - minY, 0.2);
    const scale = Math.min((10 - 2 * margin) / spanX, (6 - 2 * margin) / spanY);
    const padX = margin + (10 - 2 * margin - spanX * scale) / 2;
    const padY = margin + (6 - 2 * margin - spanY * scale) / 2;
    const map = (value: string | null | undefined, low: number, pad: number) => {
      const number = parseDouble(value);
      return number === null ? value : formatF((number - low) * scale + pad, 4);
    };
    return elements.map((element) => ({
      ...element,
      x: map(element.x, minX, padX),
      y: map(element.y, minY, padY),
      x2: map(element.x2, minX, padX),
      y2: map(element.y2, minY, padY),
    }));
  }

  private compileFunction(title: string, language: string): Illustration | null {
    const f = Premade.string(this.params.f);
    if (!f) return null;
    const scale = this.numberParam("scale") ?? 1;
    const expression = Math.abs(scale - 1) < 1e-9 ? f : `${S(scale)}*(${f})`;
    const template: IllustrationTemplate = {
      kind: "function",
      f: expression,
      xMin: Premade.number(this.params.xMin),
      xMax: Premade.number(this.params.xMax),
    };
    const marks = Premade.array(this.params.marks);
    if (marks)
      template.marks = marks.flatMap((entry) => {
        const object = Premade.object(entry);
        const x = object ? Premade.string(object.x) : null;
        return object && x !== null ? [{ x, text: Premade.string(object.text) }] : [];
      });
    const scene = this.templateScene(template, title, language);
    if (!scene) return null;
    return { ...scene, parameters: [...(scene.parameters ?? []), slider("scale", "k", scale, 0.25, 3)] };
  }

  private compileInclinedPlane(title: string, language: string): Illustration | null {
    const angle = Premade.number(this.params.angle);
    if (angle === null) return null;
    const template: IllustrationTemplate = {
      kind: "inclinedPlane",
      angle,
      motion: Premade.string(this.params.motion),
      components: Premade.bool(this.params.components),
    };
    const forces = Premade.array(this.params.forces);
    if (forces)
      template.forces = forces.flatMap((entry) => {
        const object = Premade.object(entry);
        const kind = object ? Premade.string(object.kind) : null;
        if (!object || kind === null) return [];
        return [
          {
            kind,
            text: Premade.string(object.text),
            direction: Premade.string(object.direction),
            degrees: Premade.number(object.degrees),
            asked: Premade.bool(object.asked),
          },
        ];
      });
    return this.templateScene(template, title, language);
  }

  private compileCircuit(title: string): Illustration | null {
    const parts = Premade.array(this.params.components);
    if (!parts || parts.length === 0) return null;
    const elements: IllustrationElement[] = [];
    for (const entry of parts) {
      const object = Premade.object(entry);
      if (!object) return null;
      const kind = Premade.string(object.kind);
      const [x, y, x2, y2] = [object.x, object.y, object.x2, object.y2].map(Premade.number);
      if (kind === null || x == null || y == null || x2 == null || y2 == null) return null;
      elements.push({
        kind: "component",
        x: S(x),
        y: S(y),
        x2: S(x2),
        y2: S(y2),
        text: Premade.string(object.text),
        component: kind,
      });
    }
    return { title, width: 10, height: 6, parameters: [], elements: this.fitToCanvas(elements) };
  }

  private compileTriangle(title: string, language: string): Illustration | null {
    const vertices = Premade.array(this.params.vertices);
    if (!vertices || vertices.length !== 3) return null;
    const names: string[] = [];
    const figurePoints = vertices.flatMap((entry, index) => {
      const object = Premade.object(entry);
      if (!object) return [];
      const name = Premade.string(object.name) ?? String.fromCharCode(65 + index);
      const x = Premade.string(object.x);
      const y = Premade.string(object.y);
      if (x === null || y === null) return [];
      names.push(name);
      return [{ name, x, y, answer: Premade.bool(object.answer) }];
    });
    if (figurePoints.length !== 3) return null;
    const template: IllustrationTemplate = {
      kind: "geometry",
      axes: Premade.bool(this.params.axes) ?? true,
      figurePoints,
      polygons: [{ vertices: names, asked: Premade.bool(this.params.asked) }],
    };
    return this.templateScene(template, title, language);
  }

  private compileMotion(title: string, language: string): Illustration | null {
    const xName = Premade.string(this.params.tName) ?? "t";
    const yName = Premade.string(this.params.vName) ?? "v";
    const expression = Premade.string(this.params.v) ?? Premade.string(this.params.f);
    if (expression !== null) {
      const tMin = this.numberParam("tMin") ?? 0;
      const tMax = this.numberParam("tMax") ?? 10;
      if (!(tMax > tMin)) return null;
      const asX = expression.replace(/t/g, "x");
      const curve = tryParseExpression(asX);
      if (curve && [...variables(curve)].every((name) => name === "x"))
        return this.templateScene({ kind: "function", f: asX, xMin: tMin, xMax: tMax, xName, yName }, title, language);
      return null;
    }
    const samples = Premade.array(this.params.points);
    if (!samples || samples.length < 2) return null;
    const points = samples.flatMap((entry) => {
      const object = Premade.object(entry);
      if (!object) return [];
      const x = Premade.number(object.t) ?? Premade.number(object.x);
      const y = Premade.number(object.v) ?? Premade.number(object.y);
      return x === null || y === null
        ? []
        : [{ x, y, text: Premade.string(object.text), answer: Premade.bool(object.answer) }];
    });
    return this.templateScene({ kind: "series", points, xName, yName, connect: true }, title, language);
  }

  private compileVectors(title: string): Illustration | null {
    const entries = Premade.array(this.params.vectors);
    if (!entries || entries.length === 0) return null;
    const arrows: { x: number; y: number; x2: number; y2: number; text: string | null }[] = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const entry of entries) {
      const object = Premade.object(entry);
      if (!object) return null;
      const [x, y, x2, y2] = [object.x, object.y, object.x2, object.y2].map(Premade.number);
      if (x == null || y == null || x2 == null || y2 == null) return null;
      minX = Math.min(minX, x, x2);
      minY = Math.min(minY, y, y2);
      maxX = Math.max(maxX, x, x2);
      maxY = Math.max(maxY, y, y2);
      arrows.push({ x, y, x2, y2, text: Premade.string(object.text) });
    }
    const margin = 0.9;
    const spanX = Math.max(maxX - minX, 0.5);
    const spanY = Math.max(maxY - minY, 0.5);
    const scale = Math.min((10 - 2 * margin) / spanX, (6 - 2 * margin) / spanY);
    const padX = margin + (10 - 2 * margin - spanX * scale) / 2;
    const padY = margin + (6 - 2 * margin - spanY * scale) / 2;
    const mapX = (v: number) => formatF((v - minX) * scale + padX, 4);
    const mapY = (v: number) => formatF((v - minY) * scale + padY, 4);
    const elements: IllustrationElement[] = [];
    for (const arrow of arrows) {
      elements.push({ kind: "arrow", x: mapX(arrow.x), y: mapY(arrow.y), x2: mapX(arrow.x2), y2: mapY(arrow.y2) });
      if (arrow.text !== null) {
        const dx = arrow.x2 - arrow.x;
        const dy = arrow.y2 - arrow.y;
        const length = Math.max(Math.hypot(dx, dy), 1e-6);
        const labelX = arrow.x2 - (dx / length) * 0.35 + (-dy / length) * 0.35;
        const labelY = arrow.y2 - (dy / length) * 0.35 + (dx / length) * 0.35;
        elements.push({ kind: "label", x: mapX(labelX), y: mapY(labelY), text: arrow.text, anchor: "center" });
      }
    }
    const ox = mapX(minX);
    const oy = mapY(minY);
    const axisX2 = mapX(maxX + spanX * 0.12);
    const axisY2 = mapY(maxY + spanY * 0.1);
    const yLabelY = mapY(maxY + spanY * 0.1 + 0.35 / scale);
    const framed: IllustrationElement[] = [
      { kind: "arrow", x: ox, y: oy, x2: axisX2, y2: oy, color: "muted" },
      { kind: "arrow", x: ox, y: oy, x2: ox, y2: axisY2, color: "muted" },
      { kind: "label", x: axisX2, y: oy, text: "x", color: "muted", anchor: "leading" },
      { kind: "label", x: ox, y: yLabelY, text: "y", color: "muted", anchor: "center" },
      ...elements,
    ];
    return { title, width: 10, height: 6, parameters: [], elements: framed };
  }

  private compileSineCosine(title: string, language: string): Illustration | null {
    const amplitude = this.numberParam("amplitude") ?? 1;
    const period = this.numberParam("period") ?? 2 * Math.PI;
    const phase = this.numberParam("phase") ?? 0;
    const shift = this.numberParam("shift") ?? 0;
    if (!(period > 0)) return null;
    const f = `${S(amplitude)}*sin(2*pi/${S(period)}*(x-${S(phase)}))+${S(shift)}`;
    return this.templateScene({ kind: "function", f, xMin: 0, xMax: period, xName: "x", yName: "y" }, title, language);
  }

  private compileIntegralArea(title: string, language: string): Illustration | null {
    const fText = Premade.string(this.params.f);
    const a = Premade.number(this.params.a);
    const b = Premade.number(this.params.b);
    if (fText === null || a === null || b === null || !(b > a) || !tryParseExpression(fText)) return null;
    const template: IllustrationTemplate = {
      kind: "function",
      f: fText,
      xMin: a - 0.15 * (b - a),
      xMax: b + 0.15 * (b - a),
      marks: [
        { x: S(a), text: "a" },
        { x: S(b), text: "b" },
      ],
    };
    const second = Premade.string(this.params.g);
    if (second !== null) template.g = second;
    const scene = this.templateScene(template, title, language);
    if (!scene) return null;
    const curve = scene.elements.find((element) => element.kind === "curve" && element.color === "white");
    const axis = scene.elements.find((element) => element.kind === "arrow" || element.kind === "line");
    const axisY = parseDouble(axis?.y);
    if (!curve || axisY === null) return scene;
    const compiled = new CompiledIllustration(scene);
    const strips: IllustrationElement[] = [];
    const steps = 40;
    const edge = (fraction: number) => a + ((b - a) * fraction) / steps;
    for (let index = 0; index < steps; index++) {
      const left = compiled.value(curve.curveX, { s: edge(index), revealed: 1, t: 0 });
      const right = compiled.value(curve.curveX, { s: edge(index + 1), revealed: 1, t: 0 });
      const top = compiled.value(curve.curveY, { s: edge(index + 0.5), revealed: 1, t: 0 });
      if (left === null || right === null || top === null) continue;
      if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !(right > left)) continue;
      const y = Math.min(Math.max(top, 0), scene.height);
      if (!(Math.abs(y - axisY) > 1e-9)) continue;
      strips.push({ kind: "rect", x: S(left), y: S(axisY), w: S(right - left), h: S(y - axisY), color: "accent" });
    }
    return { ...scene, elements: [...strips, ...scene.elements] };
  }

  private compileParabola(title: string, language: string): Illustration | null {
    const vx = this.numberParam("vertexX") ?? this.numberParam("vx") ?? 0;
    const vy = this.numberParam("vertexY") ?? this.numberParam("vy") ?? 0;
    const a = this.numberParam("a") ?? 1;
    const roots = (Premade.array(this.params.roots) ?? [])
      .map((value) => Premade.number(value) ?? parseDouble(Premade.string(value)))
      .filter((value): value is number => value !== null);
    const xMin = Math.min(vx - 3, roots.length > 0 ? Math.min(...roots) : vx - 3);
    const xMax = Math.max(vx + 3, roots.length > 0 ? Math.max(...roots) : vx + 3);
    const template: IllustrationTemplate = {
      kind: "function",
      f: `${S(a)}*(x-${S(vx)})^2+${S(vy)}`,
      xMin,
      xMax,
      marks: [{ x: S(vx), text: "V" }, ...roots.map((root) => ({ x: S(root), text: null }))],
    };
    const scene = this.templateScene(template, title, language);
    if (!scene) return null;
    const axisX = scene.elements.find((element) => element.kind === "point")?.x ?? S(vx);
    const axisLabel = language.toLowerCase().includes("portug") ? "eixo de simetria" : "axis of symmetry";
    return {
      ...scene,
      elements: [
        ...scene.elements,
        { kind: "line", x: axisX, y: "0.5", x2: axisX, y2: "5.5", color: "muted", dashed: true },
        {
          kind: "label",
          x: S((parseDouble(axisX) ?? vx) + 0.2),
          y: "5.2",
          text: axisLabel,
          color: "muted",
          anchor: "leading",
        },
      ],
      parameters: [slider("a", "a", a, -3, 3)],
    };
  }

  private compileCircle(title: string, language: string): Illustration | null {
    const cx = this.numberParam("cx") ?? 0;
    const cy = this.numberParam("cy") ?? 0;
    const r = this.numberParam("radius") ?? 1;
    if (!(r > 0)) return null;
    return this.templateScene(
      {
        kind: "geometry",
        axes: Premade.bool(this.params.axes) ?? true,
        figurePoints: [{ name: "C", x: S(cx), y: S(cy), answer: false }],
        circles: [{ centre: "C", radius: S(r), through: null }],
      },
      title,
      language,
    );
  }

  private compileUnitCircle(title: string, language: string): Illustration | null {
    const angle = this.numberParam("angle") ?? Math.PI / 4;
    return this.templateScene(
      {
        kind: "unitCircle",
        angles: [{ value: S(angle), text: Premade.string(this.params.label) ?? "α" }],
        showSinCos: Premade.bool(this.params.showSinCos) ?? true,
      },
      title,
      language,
    );
  }

  static projectileRange(v0: number, angleDegrees: number, g: number): number {
    return (v0 * v0 * Math.sin((2 * angleDegrees * Math.PI) / 180)) / g;
  }

  static projectileMaxHeight(v0: number, angleDegrees: number, g: number): number {
    const rad = (angleDegrees * Math.PI) / 180;
    return (v0 * v0 * Math.sin(rad) * Math.sin(rad)) / (2 * g);
  }

  private compileProjectile(title: string, language: string): Illustration | null {
    const v0 = this.numberParam("v0") ?? 20;
    const angle = this.numberParam("angle") ?? 45;
    const g = this.numberParam("g") ?? 9.8;
    const rad = (angle * Math.PI) / 180;
    const range = PremadeFigures.projectileRange(v0, angle, g);
    const height = PremadeFigures.projectileMaxHeight(v0, angle, g);
    const f = `x*${S(Math.tan(rad))} - ${S(g)}*x^2/(2*${S(v0 * v0)}*${S(Math.cos(rad))}*${S(Math.cos(rad))})`;
    const w = new TemplateWords(language);
    const scene = this.templateScene(
      {
        kind: "function",
        f,
        xMin: 0,
        xMax: Math.max(range * 1.05, 1),
        marks: [
          { x: "0", text: `v₀, ${w.number(angle)}°` },
          { x: S(range / 2), text: `hₘₐₓ = ${w.number(height)}` },
          { x: S(range), text: `alcance = ${w.number(range)}` },
        ],
      },
      title,
      language,
    );
    if (!scene) return null;
    return { ...scene, parameters: [slider("v0", "v₀", v0, 5, 40), slider("angle", "θ°", angle, 10, 80)] };
  }

  private compileWave(title: string, language: string): Illustration | null {
    const wavelength = this.numberParam("wavelength") ?? 4;
    const amplitude = this.numberParam("amplitude") ?? 1;
    if (!(wavelength > 0)) return null;
    const scene = this.templateScene(
      { kind: "function", f: `${S(amplitude)}*sin(2*pi/${S(wavelength)}*x)`, xMin: 0.2, xMax: 2.2 * wavelength },
      title,
      language,
    );
    if (!scene) return null;
    const w = new TemplateWords(language);
    const crest1 = wavelength / 4;
    const crest2 = crest1 + wavelength;
    const axisY = scene.elements.find((element) => element.kind === "arrow" || element.kind === "line")?.y ?? "1";
    return {
      ...scene,
      elements: [
        ...scene.elements,
        {
          kind: "arrow",
          x: S(crest1),
          y: S(amplitude + 0.55),
          x2: S(crest2),
          y2: S(amplitude + 0.55),
          color: "accent",
        },
        {
          kind: "label",
          x: S((crest1 + crest2) / 2),
          y: S(amplitude + 0.85),
          text: `λ = ${w.number(wavelength)}`,
          color: "accent",
          anchor: "center",
        },
        { kind: "arrow", x: S(crest1), y: axisY, x2: S(crest1), y2: S(amplitude), color: "second" },
        {
          kind: "label",
          x: S(crest1 + 0.35),
          y: S(amplitude / 2),
          text: `A = ${w.number(amplitude)}`,
          color: "second",
          anchor: "leading",
        },
      ],
      parameters: [slider("amplitude", "A", amplitude, 0.2, 3), slider("wavelength", "λ", wavelength, 1, 8)],
      premade: this.figure,
    };
  }

  private compileLens(title: string): Illustration | null {
    const converging = Premade.bool(this.params.converging) ?? true;
    const f = this.numberParam("focal") ?? 2;
    if (!(f > 0)) return null;
    const lensX = 5;
    const axisY = 3;
    const objectH = this.numberParam("objectHeight") ?? 1;
    const objectDistance = this.numberParam("objectDistance") ?? this.numberParam("do") ?? 2 * f;
    const objectX = lensX - objectDistance;
    const doDist = objectDistance;
    const atFocus = Math.abs(doDist - f) < Math.max(1e-6, 1e-4 * f);
    const elements: IllustrationElement[] = [
      { kind: "line", x: "1", y: S(axisY), x2: "9", y2: S(axisY), color: "muted" },
      { kind: "line", x: S(lensX), y: "1.2", x2: S(lensX), y2: "4.8", color: "white" },
      { kind: "arrow", x: S(lensX - 0.15), y: "2.2", x2: S(lensX - 0.55), y2: "2.6", color: "white" },
      { kind: "arrow", x: S(lensX + 0.15), y: "2.2", x2: S(lensX + 0.55), y2: "2.6", color: "white" },
      { kind: "arrow", x: S(lensX - 0.15), y: "3.8", x2: S(lensX - 0.55), y2: "3.4", color: "white" },
      { kind: "arrow", x: S(lensX + 0.15), y: "3.8", x2: S(lensX + 0.55), y2: "3.4", color: "white" },
      { kind: "label", x: S(lensX - f), y: S(axisY - 0.35), text: "F", color: "muted", anchor: "center" },
      { kind: "label", x: S(lensX + f), y: S(axisY - 0.35), text: "F′", color: "muted", anchor: "center" },
      { kind: "line", x: S(objectX), y: S(axisY), x2: S(objectX), y2: S(axisY + objectH), color: "accent" },
      {
        kind: "label",
        x: S(objectX - 0.15),
        y: S(axisY + objectH + 0.22),
        text: "objeto",
        color: "accent",
        anchor: "trailing",
      },
      { kind: "arrow", x: S(objectX), y: S(axisY + objectH), x2: S(lensX), y2: S(axisY + objectH), color: "accent" },
      {
        kind: "arrow",
        x: S(objectX),
        y: S(axisY + objectH),
        x2: S(lensX),
        y2: S(axisY),
        color: "accent",
        dashed: true,
      },
    ];
    if (converging && atFocus) {
      const topY = axisY + objectH;
      const exitX = 8.8;
      const slope = -objectH / doDist;
      elements.push(
        {
          kind: "arrow",
          x: S(lensX),
          y: S(axisY),
          x2: S(exitX),
          y2: S(axisY + (exitX - lensX) * slope),
          color: "accent",
        },
        {
          kind: "arrow",
          x: S(lensX),
          y: S(topY),
          x2: S(exitX),
          y2: S(topY + (exitX - lensX) * slope),
          color: "accent",
        },
        { kind: "label", x: "7.6", y: S(axisY - 0.55), text: "imagem no infinito", color: "second", anchor: "center" },
      );
    } else {
      const di = converging ? 1 / (1 / f - 1 / doDist) : 1 / (1 / -f - 1 / doDist);
      const imageX = lensX + di;
      const imageH = objectH * (-di / doDist);
      const real = converging && di > 0;
      const labelY = Math.min(5.35, Math.max(axisY + 0.35, axisY + imageH + (imageH >= 0 ? 0.18 : -0.28)));
      elements.push(
        { kind: "arrow", x: S(lensX), y: S(axisY + objectH), x2: S(imageX), y2: S(axisY + imageH), color: "second" },
        {
          kind: "line",
          x: S(imageX),
          y: S(axisY),
          x2: S(imageX),
          y2: S(axisY + imageH),
          color: "second",
          dashed: real ? null : true,
        },
        {
          kind: "label",
          x: S(imageX + (imageX > lensX ? 0.12 : -0.12)),
          y: S(labelY),
          text: "imagem",
          color: "second",
          anchor: imageX > lensX ? "leading" : "trailing",
        },
      );
    }
    return {
      title,
      width: 10,
      height: 6,
      parameters: [slider("objectDistance", "d₀", objectDistance, Math.max(f * 0.55, 0.5), f * 4)],
      elements: this.fitToCanvas(elements),
      premade: this.figure,
    };
  }

  private compileStatsChart(title: string, language: string): Illustration | null {
    const kind = Premade.string(this.params.kind) ?? "histogram";
    const w = new TemplateWords(language);
    const stats = Premade.object(this.params.stats);
    if (kind === "boxplot" && stats) {
      const [min, q1, median, q3, max] = ["min", "q1", "median", "q3", "max"].map((key) => Premade.number(stats[key]));
      if (min == null || q1 == null || median == null || q3 == null || max == null || !(max > min)) return null;
      const axisY = 3;
      const scale = 7 / (max - min);
      const x = (v: number) => S(1.5 + (v - min) * scale);
      const cap = 0.22;
      const elements: IllustrationElement[] = [
        { kind: "line", x: "1.2", y: S(axisY), x2: "9", y2: S(axisY), color: "muted" },
        { kind: "line", x: x(min), y: S(axisY), x2: x(q1), y2: S(axisY), color: "white" },
        { kind: "line", x: x(q3), y: S(axisY), x2: x(max), y2: S(axisY), color: "white" },
        { kind: "rect", x: x(q1), y: S(axisY - 0.4), w: S((q3 - q1) * scale), h: "0.8", color: "white" },
        { kind: "line", x: x(median), y: S(axisY - 0.45), x2: x(median), y2: S(axisY + 0.45), color: "accent" },
        { kind: "line", x: x(min), y: S(axisY - cap), x2: x(min), y2: S(axisY + cap), color: "white" },
        { kind: "line", x: x(max), y: S(axisY - cap), x2: x(max), y2: S(axisY + cap), color: "white" },
      ];
      for (const [value, name, lift] of [
        [min, "min", 0.52],
        [q1, "Q1", 0.72],
        [median, "med", 0.92],
        [q3, "Q3", 0.72],
        [max, "max", 0.52],
      ] as const)
        elements.push({
          kind: "label",
          x: x(value),
          y: S(axisY + lift),
          text: `${name} ${w.number(value)}`,
          color: "muted",
          anchor: "center",
        });
      return { title, width: 10, height: 6, parameters: [], elements };
    }
    const bins = Premade.array(this.params.bins);
    if (!bins || bins.length === 0) return null;
    const values = bins.map(Premade.number);
    if (values.some((value) => value === null)) return null;
    const numbers = values as number[];
    const peak = Math.max(...numbers);
    const axisY = 1;
    const elements: IllustrationElement[] = [
      { kind: "arrow", x: "1", y: S(axisY), x2: "9", y2: S(axisY), color: "muted" },
      { kind: "arrow", x: "1", y: S(axisY), x2: "1", y2: "5.2", color: "muted" },
    ];
    const barW = Math.min(0.85, 7.5 / numbers.length);
    numbers.forEach((value, index) => {
      const h = Math.max(0.12, (3.5 * value) / peak);
      const x = 1.4 + index * (barW + 0.18);
      elements.push(
        { kind: "rect", x: S(x), y: S(axisY), w: S(barW), h: S(h), color: "accent" },
        {
          kind: "label",
          x: S(x + barW / 2),
          y: S(axisY - 0.35),
          text: w.number(index + 1),
          color: "muted",
          anchor: "center",
        },
        {
          kind: "label",
          x: S(x + barW / 2),
          y: S(axisY + h + 0.25),
          text: w.number(value),
          color: "white",
          anchor: "center",
        },
      );
    });
    return { title, width: 10, height: 6, parameters: [], elements };
  }
}

/** When the model names a premade figure, draw that; otherwise keep templates and elements. */
export function applyingPremadeFigure(scene: Illustration, language: string): Illustration {
  const premade = decodePremade(scene.premade);
  if (!premade) return scene;
  const built = new PremadeFigures(premade).compile(scene.title, language);
  if (!built) return scene;
  return { ...built, disagreements: scene.disagreements, premade };
}
