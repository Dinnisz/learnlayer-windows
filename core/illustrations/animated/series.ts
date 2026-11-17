// Port of LearnLayer/Illustrations/PremadeFigureAnimatedSeries.swift @ ref 2026-11-04: partial sums of a series and
// its limit, a slope field with solutions the app integrates (Runge–Kutta), a polar curve and a parametric curve drawn
// as their parameter runs.

import { evaluate, tryParseExpression, variables, type Expression } from "../../math/expression";
import { formatG } from "../../math/printf";
import { TemplateBuilder, type TemplateWords } from "../illustrationTemplate";
import { Premade } from "../premadeFigure";
import {
  Anim,
  expressionText,
  FigureCanvas,
  Params,
  PlottedField,
  PremadeFrame,
  slider,
  type AnimatedIllustration,
} from "./figureCanvas";

/** The terms of a series, its limit when known, and whether it converges. */
export interface SeriesSpec {
  terms: number[];
  limit: number | null;
  converges: boolean | null;
  name: string;
}

/** Partial sums S₁…S_N. */
export function partialSums(terms: number[]): number[] {
  let total = 0;
  return terms.map((term) => (total += term));
}

/** ζ(p) for p > 1: a long sum plus the Euler–Maclaurin tail. */
export function zeta(p: number): number {
  const count = 2000;
  let total = 0;
  for (let n = 1; n <= count; n++) total += Math.pow(n, -p);
  const m = count;
  return total + Math.pow(m, 1 - p) / (p - 1) - Math.pow(m, -p) / 2 + (p * Math.pow(m, -p - 1)) / 12;
}

const onlyIn = (expression: Expression, allowed: string[]) =>
  [...variables(expression)].every((name) => allowed.includes(name));

export function seriesSpec(params: Params, count: number, words: TemplateWords): SeriesSpec | null {
  const kind = params.text("kind") ?? (params.text("terms") !== null ? "formula" : "");
  const indices = Array.from({ length: count }, (_, i) => i + 1);
  switch (kind) {
    case "geometric": {
      const ratio = params.number("ratio");
      if (ratio === null) return null;
      const converges = Math.abs(ratio) < 1;
      return {
        terms: indices.map((n) => Math.pow(ratio, n - 1)),
        limit: converges ? 1 / (1 - ratio) : null,
        converges,
        name: `Σ rⁿ⁻¹, r = ${words.number(ratio)}`,
      };
    }
    case "harmonic":
      return { terms: indices.map((n) => 1 / n), limit: null, converges: false, name: "Σ 1/n" };
    case "alternatingHarmonic":
      return {
        terms: indices.map((n) => (n % 2 === 1 ? 1 : -1) / n),
        limit: Math.log(2),
        converges: true,
        name: "Σ (−1)ⁿ⁺¹/n",
      };
    case "basel":
      return {
        terms: indices.map((n) => 1 / (n * n)),
        limit: (Math.PI * Math.PI) / 6,
        converges: true,
        name: "Σ 1/n²",
      };
    case "pSeries": {
      const p = params.number("p");
      if (p === null || !(p > 0)) return null;
      return {
        terms: indices.map((n) => Math.pow(n, -p)),
        limit: p > 1 ? zeta(p) : null,
        converges: p > 1,
        name: `Σ 1/n^${words.number(p)}`,
      };
    }
    case "formula": {
      const text = params.text("terms");
      const expression = text ? tryParseExpression(text) : null;
      if (!text || !expression || !onlyIn(expression, ["n"])) return null;
      const terms = indices.map((n) => evaluate(expression, { n }));
      if (!terms.every(Number.isFinite)) return null;
      return {
        terms,
        limit: params.number("limit"),
        converges: Premade.bool(params.figure.params["converges"]),
        name: "Σ " + text,
      };
    }
    default:
      return null;
  }
}

/** A solution of y′ = f(x, y) through (x0, y0), by Runge–Kutta steps in x each way, kept inside the box. */
export function slopeFieldSolution(
  field: PlottedField,
  x0: number,
  y0: number,
  xLow: number,
  xHigh: number,
  yLow: number,
  yHigh: number,
  steps = 120,
): { x: number; y: number }[] {
  const h = (xHigh - xLow) / steps;
  const march = (direction: number) => {
    const points: { x: number; y: number }[] = [];
    let x = x0;
    let y = y0;
    const step = h * direction;
    for (let i = 0; i < steps; i++) {
      const k1 = field.value(x, y);
      const k2 = field.value(x + step / 2, y + (step / 2) * k1);
      const k3 = field.value(x + step / 2, y + (step / 2) * k2);
      const k4 = field.value(x + step, y + step * k3);
      const next = y + (step / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      if (!Number.isFinite(next) || x + step < xLow || x + step > xHigh || next < yLow || next > yHigh) break;
      x += step;
      y = next;
      points.push({ x, y });
    }
    return points;
  };
  return [...march(-1).reverse(), { x: x0, y: y0 }, ...march(1)];
}

/** An expression as it would be written on paper: no multiplication signs, a real minus. */
export function pretty(text: string): string {
  let result = text.split("*").join("·").split("theta").join("θ").split("-").join("−").split(" ").join("");
  Array.from("⁰¹²³⁴⁵⁶⁷⁸⁹").forEach((raised, digit) => (result = result.split(`^${digit}`).join(raised)));
  return result;
}

/** The largest |r| of r(θ) over [low, high]. */
export function polarExtent(expression: Expression, low: number, high: number): number {
  let largest = 0;
  for (let index = 0; index <= 720; index++) {
    const value = evaluate(expression, { theta: low + ((high - low) * index) / 720 });
    if (Number.isFinite(value)) largest = Math.max(largest, Math.abs(value));
  }
  return largest;
}

/** `%g` as Swift's String(format:) writes it. */
const g = (value: number) => formatG(value, 6);

/** r(θ) as the app evaluates it, as it is written for the student, and the default end of θ. */
function polarText(params: Params): { expression: string; display: string; thetaMax: number } | null {
  const text = params.text("r");
  if (text) return { expression: text, display: "r = " + pretty(text), thetaMax: 2 * Math.PI };
  const a = params.number("a") ?? 1;
  const factor = Math.abs(a - 1) < 1e-9 ? "" : g(a);
  switch (params.text("kind")) {
    case "cardioid":
      return {
        expression: `${Anim.lit(a)}*(1+cos(theta))`,
        display: `r = ${factor}${factor === "" ? "1+cos(θ)" : "(1+cos(θ))"}`,
        thetaMax: 2 * Math.PI,
      };
    case "rose": {
      const k = params.number("k") ?? 3;
      return {
        expression: `${Anim.lit(a)}*cos(${Anim.lit(k)}*theta)`,
        display: `r = ${factor}cos(${g(k)}θ)`,
        thetaMax: k === Math.round(k) && Math.trunc(k) % 2 === 0 ? 2 * Math.PI : Math.PI,
      };
    }
    case "spiral":
      return { expression: `${Anim.lit(a)}*theta`, display: `r = ${factor}θ`, thetaMax: 4 * Math.PI };
    default:
      return null;
  }
}

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

const seriesPartialSums: Compiler = (params, title, language) => {
  const count = Math.trunc(params.number("count") ?? 12);
  const canvas = new FigureCanvas(language);
  const spec = count >= 3 && count <= 24 ? seriesSpec(params, count, canvas.words) : null;
  if (!spec) return null;
  const sums = partialSums(spec.terms);
  if (!sums.every((sum) => Number.isFinite(sum) && Math.abs(sum) < 1e4)) return null;
  const low = Math.min(0, Math.min(...sums));
  const high = Math.max(Math.max(...sums), spec.limit ?? 0, 0.1);
  const pad = (high - low) * 0.12;
  const frame = new PremadeFrame(0, count + 1, low - (low < 0 ? pad : pad * 0.4), high + pad);
  canvas.axes(frame, { xName: "n", yName: "Sₙ" });
  const step = Math.max(4.0 / count, 0.45);
  sums.forEach((sum, index) => {
    const shown = Anim.after(0.6 + step * index);
    const x = frame.x(index + 1);
    canvas.line(x, frame.axisY, x, frame.y(sum), { color: "muted", visible: shown });
    canvas.dot(x, frame.y(sum), { color: "accent", visible: shown });
  });
  const end = 0.6 + step * count;
  if (spec.limit !== null) {
    const limit = spec.limit;
    const reach = `${Anim.n(frame.left)} + ${Anim.n(frame.right - frame.left)}*${Anim.ramp(end - 0.4, end + 0.4)}`;
    canvas.line(frame.left, frame.y(limit), reach, frame.y(limit), { color: "second", dashed: true });
    canvas.labelBeside(`L = ${canvas.number(limit)}`, frame.right - 0.8, frame.y(limit), {
      color: "second",
      visible: Anim.after(end + 0.4),
    });
    canvas.caption(
      canvas.say(
        `As somas parciais aproximam-se de ${canvas.number(limit)}`,
        `The partial sums approach ${canvas.number(limit)}`,
      ),
      { row: 0, color: "accent", visible: Anim.after(end) },
    );
  } else if (spec.converges === false) {
    canvas.caption(
      canvas.say("A série diverge: as somas crescem sem limite", "The series diverges: the sums grow without bound"),
      { row: 0, color: "accent", visible: Anim.after(end) },
    );
  }
  canvas.caption(spec.name, { row: 1, color: "white", visible: Anim.after(0.4) });
  canvas.recordSteps(sums.map((_, index) => 0.6 + step * (index + 1)));
  return canvas.illustration(title, Anim.duration(end + 1), [slider("count", "n", count, 3, 24)]);
};

const slopeField: Compiler = (params, title, language) => {
  const field = PlottedField.make(params.text("f"));
  if (!field) return null;
  const xLow = params.number("xMin") ?? -4;
  const xHigh = params.number("xMax") ?? 4;
  const yLow = params.number("yMin") ?? -2.5;
  const yHigh = params.number("yMax") ?? 2.5;
  if (!(xLow < xHigh) || !(yLow < yHigh)) return null;
  let starts = [{ x: 0, y: 1 }];
  const objects = params.objects("solutions");
  if (objects) {
    starts = [];
    for (const object of objects) {
      const x = Premade.number(object["x"]);
      const y = Premade.number(object["y"]);
      if (x === null || y === null) return null;
      starts.push({ x, y });
    }
  }
  if (
    starts.length < 1 ||
    starts.length > 3 ||
    !starts.every((start) => start.x >= xLow && start.x <= xHigh && start.y >= yLow && start.y <= yHigh)
  )
    return null;
  const frame = new PremadeFrame(xLow, xHigh, yLow, yHigh);
  const canvas = new FigureCanvas(language);
  canvas.axes(frame);
  // The field: a short stroke with the slope f(x, y) at each grid point.
  const columns = 13;
  const rows = 7;
  for (let column = 0; column < columns; column++)
    for (let row = 0; row < rows; row++) {
      const x = xLow + ((xHigh - xLow) * (column + 0.5)) / columns;
      const y = yLow + ((yHigh - yLow) * (row + 0.5)) / rows;
      const slope = field.value(x, y);
      if (!Number.isFinite(slope)) continue;
      const dx = frame.kx;
      const dy = slope * frame.ky;
      const length = Math.hypot(dx, dy);
      const half = 0.17;
      canvas.line(
        frame.x(x) - (dx / length) * half,
        frame.y(y) - (dy / length) * half,
        frame.x(x) + (dx / length) * half,
        frame.y(y) + (dy / length) * half,
        { color: "muted" },
      );
    }
  const colors = ["accent", "second", "white"];
  starts.forEach((start, index) => {
    const path = slopeFieldSolution(field, start.x, start.y, xLow, xHigh, yLow, yHigh);
    const origin = path.findIndex((point) => point.x === start.x && point.y === start.y);
    if (origin < 0) return;
    for (let k = 0; k < path.length - 1; k++) {
      const distance = k < origin ? origin - k : k - origin + 1;
      canvas.line(frame.x(path[k]!.x), frame.y(path[k]!.y), frame.x(path[k + 1]!.x), frame.y(path[k + 1]!.y), {
        color: colors[index]!,
        visible: Anim.after(0.5 + 0.045 * distance),
      });
    }
    canvas.dot(frame.x(start.x), frame.y(start.y), { color: colors[index]! });
  });
  canvas.caption(`y′ = ${pretty(field.text)}`, { row: 0, color: "white", visible: Anim.after(0.3) });
  return canvas.illustration(title, Anim.duration(0.5 + 0.045 * 62));
};

/** Rings at round radii around the pole, numbered along the x axis, and the two axes. */
function polarGrid(canvas: FigureCanvas, cx: number, cy: number, k: number, extent: number): void {
  canvas.arrow(cx - 2.4, cy, cx + 2.5, cy, { color: "muted" });
  canvas.arrow(cx, cy - 2.2, cx, cy + 2.2, { color: "muted" });
  const ringStep = TemplateBuilder.step(extent * 1.2);
  let radius = ringStep;
  while (radius <= extent * 1.001) {
    canvas.ring(cx, cy, k * radius, { color: "muted", dashed: true });
    canvas.label(canvas.number(radius), cx + k * radius + 0.12, cy - 0.45, { anchor: "leading", color: "muted" });
    radius += ringStep;
  }
}

const polarCurve: Compiler = (params, title, language) => {
  const cx = 5.3;
  const cy = 3.1;
  if (params.text("kind") === "cardioid") {
    const a = params.number("a") ?? 1;
    const low = params.number("thetaMin") ?? 0;
    const high = params.number("thetaMax") ?? 2 * Math.PI;
    if (!(high > low) || high - low > 8 * Math.PI) return null;
    const extent = 2 * Math.abs(a);
    const k = 2.1 / extent;
    const canvas = new FigureCanvas(language);
    polarGrid(canvas, cx, cy, k, extent);
    const factor = Math.abs(a - 1) < 1e-9 ? "" : g(a);
    const display = `r = ${factor}${factor === "" ? "1+cos(θ)" : "(1+cos(θ))"}`;
    const head = `${Anim.lit(low)} + ${Anim.n(high - low)}*${Anim.ramp(0.6, 5.0)}`;
    const scale = Anim.lit(k * a);
    canvas.curve(
      `${Anim.n(cx)} + ${scale}*(1+cos(s))*cos(s)`,
      `${Anim.n(cy)} + ${scale}*(1+cos(s))*sin(s)`,
      Anim.n(low),
      head,
      { color: "accent" },
    );
    const tipX = `${Anim.n(cx)} + ${scale}*(1+cos(${head}))*cos(${head})`;
    const tipY = `${Anim.n(cy)} + ${scale}*(1+cos(${head}))*sin(${head})`;
    canvas.line(cx, cy, tipX, tipY, { color: "second", visible: Anim.after(0.6) });
    canvas.dot(tipX, tipY, { color: "second", visible: Anim.after(0.6) });
    canvas.caption(display, { row: 1, color: "accent", visible: Anim.after(0.4) });
    canvas.dot(
      `${Anim.n(cx)} + ${scale}*(1+cos(theta))*cos(theta)`,
      `${Anim.n(cy)} + ${scale}*(1+cos(theta))*sin(theta)`,
      { color: "second" },
    );
    canvas.recordSteps([0, 2.4, 5.0]);
    return canvas.illustration(title, Anim.duration(5.8), [slider("theta", "θ", 0, low, high)]);
  }
  const spec = polarText(params);
  const expression = spec ? tryParseExpression(spec.expression) : null;
  if (!spec || !expression || !onlyIn(expression, ["theta"])) return null;
  const low = params.number("thetaMin") ?? 0;
  const high = params.number("thetaMax") ?? spec.thetaMax;
  if (!(high > low) || high - low > 8 * Math.PI) return null;
  const extent = polarExtent(expression, low, high);
  if (!(extent > 1e-9)) return null;
  const k = 2.1 / extent;
  const canvas = new FigureCanvas(language);
  polarGrid(canvas, cx, cy, k, extent);
  const head = `${Anim.lit(low)} + ${Anim.n(high - low)}*${Anim.ramp(0.6, 5.0)}`;
  const r = expressionText(expression, { theta: "s" });
  canvas.curve(
    `${Anim.n(cx)} + ${Anim.n(k)}*(${r})*cos(s)`,
    `${Anim.n(cy)} + ${Anim.n(k)}*(${r})*sin(s)`,
    Anim.n(low),
    head,
    {
      color: "accent",
    },
  );
  const tipR = expressionText(expression, { theta: head });
  const tipX = `${Anim.n(cx)} + ${Anim.n(k)}*(${tipR})*cos(${head})`;
  const tipY = `${Anim.n(cy)} + ${Anim.n(k)}*(${tipR})*sin(${head})`;
  canvas.line(cx, cy, tipX, tipY, { color: "second", visible: Anim.after(0.6) });
  canvas.dot(tipX, tipY, { color: "second", visible: Anim.after(0.6) });
  canvas.caption(spec.display, { row: 0, color: "accent", visible: Anim.after(0.4) });
  const rAtTheta = expressionText(expression, { theta: "theta" });
  canvas.dot(
    `${Anim.n(cx)} + ${Anim.n(k)}*(${rAtTheta})*cos(theta)`,
    `${Anim.n(cy)} + ${Anim.n(k)}*(${rAtTheta})*sin(theta)`,
    {
      color: "second",
    },
  );
  canvas.recordSteps([0, 2.4, 5.0]);
  return canvas.illustration(title, Anim.duration(5.8), [slider("theta", "θ", low, low, high)]);
};

const parametricCurve: Compiler = (params, title, language) => {
  const xText = params.text("x");
  const yText = params.text("y");
  const xExpression = xText ? tryParseExpression(xText) : null;
  const yExpression = yText ? tryParseExpression(yText) : null;
  if (!xText || !yText || !xExpression || !yExpression || !onlyIn(xExpression, ["t"]) || !onlyIn(yExpression, ["t"]))
    return null;
  const low = params.number("tMin") ?? 0;
  const high = params.number("tMax") ?? 2 * Math.PI;
  if (!(high > low)) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index <= 400; index++) {
    const t = low + ((high - low) * index) / 400;
    const x = evaluate(xExpression, { t });
    const y = evaluate(yExpression, { t });
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    xs.push(x);
    ys.push(y);
  }
  const frame = PremadeFrame.equalScale(Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys));
  const canvas = new FigureCanvas(language);
  canvas.axes(frame);
  const head = `${Anim.lit(low)} + ${Anim.n(high - low)}*${Anim.ramp(0.6, 5.0)}`;
  canvas.curve(
    frame.xText(expressionText(xExpression, { t: "s" })),
    frame.yText(expressionText(yExpression, { t: "s" })),
    Anim.n(low),
    head,
    { color: "accent" },
  );
  canvas.dot(
    frame.xText(expressionText(xExpression, { t: head })),
    frame.yText(expressionText(yExpression, { t: head })),
    {
      color: "second",
      visible: Anim.after(0.6),
    },
  );
  canvas.caption(`x(t) = ${pretty(xText)},  y(t) = ${pretty(yText)}`, {
    row: 0,
    color: "accent",
    visible: Anim.after(0.4),
  });
  canvas.dot(
    frame.xText(expressionText(xExpression, { t: "t" })),
    frame.yText(expressionText(yExpression, { t: "t" })),
    {
      color: "second",
    },
  );
  canvas.recordSteps([0, 2.4, 5.0]);
  return canvas.illustration(title, Anim.duration(5.8), [slider("t", "t", low, low, high)]);
};

/** The Calculus 2 animated figures this port draws, by premade type. */
export const seriesFigures: Record<string, Compiler> = {
  seriesPartialSums,
  slopeField,
  polarCurve,
  parametricCurve,
};
