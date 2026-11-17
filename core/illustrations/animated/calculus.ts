// Port of LearnLayer/Illustrations/PremadeFigureAnimatedCalculus.swift, PremadeFigureAnimatedCurves.swift and
// PremadeFigureAnimatedTables.swift @ ref 2026-11-04: the Calculus 1 animated figures (limits, the tangent, Maclaurin
// polynomials, Riemann sums, a solid of revolution, exponential and logarithm, a piecewise function, a rational
// function's asymptotes, sign and variation tables). The app works out every number it shows.

import type { PremadeValue } from "../premadeFigure";
import { Premade } from "../premadeFigure";
import {
  Anim,
  FigureCanvas,
  Params,
  PlottedFunction,
  PremadeFrame,
  slider,
  type AnimatedIllustration,
} from "./figureCanvas";

// MARK: Numerics the figures and their tests share

/** The limit of f at `a` from one side (−1 left, +1 right), ±∞ when it grows without bound, null when it does not
 * settle. */
export function lateralLimit(f: PlottedFunction, a: number, side: number, scale = 1): number | null {
  const values = [1e-2, 1e-3, 1e-4, 1e-5, 1e-6].map((d) => f.value(a + side * d * scale));
  if (values.some(Number.isNaN)) return null;
  const last = values[4]!;
  const previous = values[3]!;
  if (Math.abs(last) > 1e4 && last * previous > 0 && Math.abs(last) > Math.abs(previous) * 5)
    return last > 0 ? Infinity : -Infinity;
  if (
    !Number.isFinite(last) ||
    !Number.isFinite(previous) ||
    Math.abs(last - previous) > 1e-3 * Math.max(1, Math.abs(last))
  )
    return null;
  return swiftRound(last * 1e4) / 1e4;
}

/** Swift's `.rounded()`: half away from zero. */
const swiftRound = (value: number) => Math.sign(value) * Math.round(Math.abs(value));

/** f′(a) by a central difference, null where f is not differentiable (its one-sided slopes differ) or undefined. */
export function derivative(f: PlottedFunction, a: number): number | null {
  const h = 1e-5 * Math.max(1, Math.abs(a));
  const slope = (f.value(a + h) - f.value(a - h)) / (2 * h);
  const towards = 1e-6 * Math.max(1, Math.abs(a));
  const value = f.value(a);
  const right = (f.value(a + towards) - value) / towards;
  const left = (value - f.value(a - towards)) / towards;
  if (
    !Number.isFinite(slope) ||
    !Number.isFinite(right) ||
    !Number.isFinite(left) ||
    Math.abs(right - left) > 1e-3 * Math.max(1, Math.abs(slope))
  )
    return null;
  return swiftRound(slope * 1e6) / 1e6;
}

/** ∫ f over [a, b] by Simpson's rule. */
export function integral(f: PlottedFunction, a: number, b: number, intervals = 400): number | null {
  const count = intervals - (intervals % 2);
  const h = (b - a) / count;
  let total = f.value(a) + f.value(b);
  for (let index = 1; index < count; index++) total += f.value(a + h * index) * (index % 2 === 0 ? 2 : 4);
  const result = (total * h) / 3;
  return Number.isFinite(result) ? result : null;
}

/** Σ f(xᵢ)·Δx over n equal rectangles; the rule is "left", "right" or "midpoint". */
export function riemannSum(f: PlottedFunction, a: number, b: number, n: number, rule: string): number | null {
  if (n <= 0 || !(b > a)) return null;
  const dx = (b - a) / n;
  let total = 0;
  for (let index = 0; index < n; index++) total += f.value(rectangleSample(a, dx, index, rule)) * dx;
  return Number.isFinite(total) ? total : null;
}

export function rectangleSample(a: number, dx: number, index: number, rule: string): number {
  if (rule === "right") return a + dx * (index + 1);
  if (rule === "midpoint") return a + dx * (index + 0.5);
  return a + dx * index;
}

/** Volume of the solid made by turning f around the x axis (discs): π ∫ f². */
export function revolutionVolume(f: PlottedFunction, a: number, b: number): number | null {
  const squares = PlottedFunction.make(`(${f.replacing("x")})^2`);
  const area = squares ? integral(squares, a, b) : null;
  return area === null ? null : Math.PI * area;
}

export const logBase = (base: number, x: number) => Math.log(x) / Math.log(base);

/** The Maclaurin coefficients c₀…c_degree of a known function, null for an unknown name. */
export function taylorCoefficients(name: string, degree: number): number[] | null {
  if (degree < 0) return null;
  let factorial = 1;
  const coefficients: number[] = [];
  for (let k = 0; k <= degree; k++) {
    if (k > 1) factorial *= k;
    const odd = k % 2 === 1;
    const sign = Math.trunc(k / 2) % 2 === 0 ? 1 : -1;
    switch (name) {
      case "exp":
        coefficients.push(1 / factorial);
        break;
      case "sin":
        coefficients.push(odd ? sign / factorial : 0);
        break;
      case "cos":
        coefficients.push(odd ? 0 : sign / factorial);
        break;
      case "ln1p":
        coefficients.push(k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) / k);
        break;
      case "geometric":
        coefficients.push(1);
        break;
      case "atan":
        coefficients.push(odd ? sign / k : 0);
        break;
      default:
        return null;
    }
  }
  return coefficients;
}

/** Known function names, from the way the model may write them. */
export function taylorName(text: string): string | null {
  const compact = text.toLowerCase().split(" ").join("");
  switch (compact) {
    case "exp":
    case "exp(x)":
    case "e^x":
      return "exp";
    case "sin":
    case "sin(x)":
    case "sen":
    case "sen(x)":
      return "sin";
    case "cos":
    case "cos(x)":
      return "cos";
    case "ln1p":
    case "ln(1+x)":
    case "log(1+x)":
      return "ln1p";
    case "geometric":
    case "1/(1-x)":
      return "geometric";
    case "atan":
    case "atan(x)":
    case "arctan(x)":
      return "atan";
    default:
      return null;
  }
}

const taylorTargets: Record<string, { text: string; low: number; high: number }> = {
  exp: { text: "exp(x)", low: -3, high: 3 },
  sin: { text: "sin(x)", low: -4.5, high: 4.5 },
  cos: { text: "cos(x)", low: -4.5, high: 4.5 },
  ln1p: { text: "ln(1+x)", low: -0.9, high: 3 },
  geometric: { text: "1/(1-x)", low: -1.9, high: 0.9 },
  atan: { text: "atan(x)", low: -3, high: 3 },
};

export function subscripted(value: number): string {
  const digits = Array.from("₀₁₂₃₄₅₆₇₈₉");
  return Array.from(String(value))
    .map((character) => (/\d/.test(character) ? digits[Number(character)]! : ""))
    .join("");
}

export function sameLimit(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return false;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= 1e-3 * Math.max(1, Math.abs(a));
}

// MARK: Piecewise and rational

export interface PiecewisePiece {
  f: PlottedFunction;
  from: number;
  to: number;
  fromClosed: boolean;
  toClosed: boolean;
  text: string | null;
}

export interface RationalAsymptotes {
  vertical: number[];
  holes: number[];
  horizontal: number | null;
  slantSlope: number | null;
  slantIntercept: number | null;
}

export function piecewisePieces(params: Params): PiecewisePiece[] | null {
  const objects = params.objects("pieces");
  if (!objects || objects.length < 1 || objects.length > 5) return null;
  const pieces: PiecewisePiece[] = [];
  for (const [index, object] of objects.entries()) {
    const f = PlottedFunction.make(stringOf(object["f"]));
    const from = Premade.number(object["from"]);
    const to = Premade.number(object["to"]);
    if (!f || from === null || to === null || !Number.isFinite(from) || !Number.isFinite(to) || !(from < to))
      return null;
    pieces.push({
      f,
      from,
      to,
      fromClosed: Premade.bool(object["fromClosed"]) ?? true,
      toClosed: Premade.bool(object["toClosed"]) ?? index === objects.length - 1,
      text: stringOf(object["text"]),
    });
  }
  pieces.sort((a, b) => a.from - b.from);
  for (let index = 1; index < pieces.length; index++)
    if (pieces[index]!.from < pieces[index - 1]!.to - 1e-9) return null;
  return pieces;
}

const stringOf = (value: PremadeValue | undefined): string | null => (typeof value === "string" ? value : null);

/** The value of the branch that holds x, null outside every branch or where it is undefined. */
export function piecewiseValue(pieces: PiecewisePiece[], x: number): number | null {
  for (const piece of pieces) {
    const afterStart = x > piece.from || (x === piece.from && piece.fromClosed);
    const beforeEnd = x < piece.to || (x === piece.to && piece.toClosed);
    if (afterStart && beforeEnd) {
      const value = piece.f.value(x);
      return Number.isFinite(value) ? value : null;
    }
  }
  return null;
}

export function snapped(value: number): number {
  const rounded = swiftRound(value * 1e4) / 1e4;
  return Math.abs(rounded - value) < 1e-3 ? rounded : value;
}

/** Vertical asymptotes (zeros of the denominator the numerator does not cancel), holes, and the behaviour at ±∞. */
export function rationalAsymptotes(
  numerator: PlottedFunction,
  denominator: PlottedFunction,
  xLow: number,
  xHigh: number,
): RationalAsymptotes | null {
  const ratio = PlottedFunction.make(`(${numerator.replacing("x")})/(${denominator.replacing("x")})`);
  if (!ratio) return null;
  const samples = 4000;
  const xs = Array.from({ length: samples + 1 }, (_, i) => xLow + ((xHigh - xLow) * i) / samples);
  const values = xs.map((x) => denominator.value(x));
  const roots: number[] = [];
  const add = (root: number) => {
    if (!roots.some((existing) => Math.abs(existing - root) < 1e-4)) roots.push(root);
  };
  for (let index = 0; index <= samples; index++) {
    if (values[index] === 0) add(xs[index]!);
    if (
      index === 0 ||
      !Number.isFinite(values[index - 1]!) ||
      !Number.isFinite(values[index]!) ||
      !(values[index - 1]! * values[index]! < 0)
    )
      continue;
    let low = xs[index - 1]!;
    let high = xs[index]!;
    let lowValue = values[index - 1]!;
    for (let i = 0; i < 60; i++) {
      const middle = (low + high) / 2;
      const value = denominator.value(middle);
      if (value * lowValue <= 0) high = middle;
      else {
        low = middle;
        lowValue = value;
      }
    }
    add((low + high) / 2);
  }
  // A double root touches zero without changing sign: look for dips of |D|.
  for (let index = 1; index < samples; index++) {
    if (!(
      Math.abs(values[index]!) <= Math.abs(values[index - 1]!) &&
      Math.abs(values[index]!) <= Math.abs(values[index + 1]!)
    ))
      continue;
    let low = xs[index - 1]!;
    let high = xs[index + 1]!;
    for (let i = 0; i < 80; i++) {
      const a = low + (high - low) / 3;
      const b = high - (high - low) / 3;
      if (Math.abs(denominator.value(a)) < Math.abs(denominator.value(b))) high = b;
      else low = a;
    }
    const candidate = (low + high) / 2;
    if (Math.abs(denominator.value(candidate)) < 1e-7) add(candidate);
  }
  roots.sort((a, b) => a - b);
  const vertical: number[] = [];
  const holes: number[] = [];
  for (const root of roots) {
    if (Math.abs(numerator.value(root)) < 1e-6) holes.push(snapped(root));
    else vertical.push(snapped(root));
  }
  const result: RationalAsymptotes = { vertical, holes, horizontal: null, slantSlope: null, slantIntercept: null };
  const far = 1e6;
  const near = ratio.value(far);
  const double = ratio.value(2 * far);
  if (Number.isFinite(near) && Number.isFinite(double)) {
    if (Math.abs(double - near) < 1e-4 * Math.max(1, Math.abs(near))) result.horizontal = snapped(double);
    else {
      const slope = (double - near) / far;
      if (Math.abs(slope) > 1e-6 && Math.abs(slope) < 1e6) {
        result.slantSlope = snapped(slope);
        result.slantIntercept = snapped(near - slope * far);
      }
    }
  }
  return result;
}

export function lineText(slope: number, intercept: number, number: (value: number) => string): string {
  let text = "y = ";
  if (Math.abs(slope - 1) < 1e-9) text += "x";
  else if (Math.abs(slope + 1) < 1e-9) text += "−x";
  else text += number(slope) + "x";
  if (Math.abs(intercept) > 1e-9) text += (intercept < 0 ? " − " : " + ") + number(Math.abs(intercept));
  return text;
}

// MARK: Sign and variation tables

/** A factor of an expression: sign changes at `root`, to `rightSign` on its right. */
export interface SignFactor {
  name: string;
  root: number;
  rightSign: number;
  denominator: boolean;
}

/** The signs of each factor on each interval, and of their product. Cells run interval, root, interval … interval. */
export interface ComputedSignTable {
  roots: number[];
  rows: string[][];
  result: string[];
}

const plus = "+";
const minus = "−";
const zero = "0";
const undefinedCell = "||";

export function signFactors(params: Params): SignFactor[] | null {
  const objects = params.objects("factors");
  if (!objects || objects.length < 1 || objects.length > 4) return null;
  const factors: SignFactor[] = [];
  for (const object of objects) {
    const root = Premade.number(object["root"]);
    if (root === null || !Number.isFinite(root)) return null;
    const sign = Math.trunc(Premade.number(object["sign"]) ?? 1);
    if (sign !== 1 && sign !== -1) return null;
    const name = stringOf(object["name"]) ?? `x − ${root}`;
    if (Array.from(name).length > 16) return null;
    factors.push({ name, root, rightSign: sign, denominator: Premade.bool(object["denominator"]) ?? false });
  }
  return factors;
}

export function signTable(factors: SignFactor[]): ComputedSignTable {
  const roots: number[] = [];
  for (const root of factors.map((factor) => factor.root).sort((a, b) => a - b)) {
    const last = roots[roots.length - 1];
    if (last === undefined || Math.abs(last - root) > 1e-9) roots.push(root);
  }
  const rootIndex = (value: number) =>
    Math.max(
      0,
      roots.findIndex((root) => Math.abs(root - value) <= 1e-9),
    );
  const rows: string[][] = [];
  for (const factor of factors) {
    const position = rootIndex(factor.root);
    const cells: string[] = [];
    for (let interval = 0; interval <= roots.length; interval++) {
      const right = interval > position;
      cells.push((right ? factor.rightSign : -factor.rightSign) > 0 ? plus : minus);
      if (interval < roots.length) cells.push(interval === position ? (factor.denominator ? undefinedCell : zero) : "");
    }
    rows.push(cells);
  }
  const result: string[] = [];
  for (let column = 0; column < 2 * roots.length + 1; column++) {
    if (column % 2 === 1) {
      const value = roots[Math.trunc(column / 2)]!;
      const here = factors.filter((factor) => Math.abs(factor.root - value) <= 1e-9);
      result.push(here.some((factor) => factor.denominator) ? undefinedCell : zero);
    } else {
      const negatives = rows.filter((row) => row[column] === minus).length;
      result.push(negatives % 2 === 0 ? plus : minus);
    }
  }
  return { roots, rows, result };
}

/** The sign of f′ on each interval between the bounds (+1, −1 or 0 when flat). */
export function variationSigns(f: PlottedFunction, bounds: number[]): number[] | null {
  if (bounds.length < 2) return null;
  const signs: number[] = [];
  for (let index = 0; index < bounds.length - 1; index++) {
    const slope = derivative(f, (bounds[index]! + bounds[index + 1]!) / 2);
    if (slope === null) return null;
    signs.push(slope > 1e-6 ? 1 : slope < -1e-6 ? -1 : 0);
  }
  return signs;
}

// MARK: The figures

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

const limitApproach: Compiler = (params, title, language) => {
  const f = PlottedFunction.make(params.text("f"));
  const a = params.number("a");
  if (!f || a === null) return null;
  const half = params.number("width") ?? 2;
  const side = params.text("side") ?? "both";
  if (!(half > 0) || !["both", "left", "right"].includes(side)) return null;
  const xLow = params.number("xMin") ?? a - half;
  const xHigh = params.number("xMax") ?? a + half;
  if (!(xLow < a && a < xHigh)) return null;
  const scale = Math.min(a - xLow, xHigh - a);
  const left = side === "right" ? null : lateralLimit(f, a, -1, scale);
  const right = side === "left" ? null : lateralLimit(f, a, 1, scale);
  const atPoint = f.value(a);
  const frame = PremadeFrame.fitting(
    [f],
    xLow,
    xHigh,
    [left, right].filter((v): v is number => v !== null && Number.isFinite(v)),
  );
  const canvas = new FigureCanvas(language);
  canvas.axes(frame);
  canvas.plot(f, frame, xLow, xHigh);

  const end = 5.0;
  const progress = Anim.ramp(0.8, end);
  const approach = (direction: number, color: string) => {
    const x = `${Anim.lit(a)} + ${Anim.lit(direction * 0.85 * scale)}*(1-0.97*${progress})`;
    const worldX = frame.xText(x);
    const worldY = Anim.clamp(frame.yText(f.replacing(x)), frame.bottom, frame.top);
    canvas.line(worldX, worldY, worldX, frame.axisY, { color: "muted", dashed: true });
    canvas.line(worldX, worldY, frame.axisX, worldY, { color: "muted", dashed: true });
    canvas.dot(worldX, worldY, { color });
  };
  if (side !== "right") approach(-1, "accent");
  if (side !== "left") approach(1, "second");

  // The point the limit is about: open where f does not take the limit's value.
  for (const limit of [left, right])
    if (limit !== null && Number.isFinite(limit) && frame.containsY(limit))
      canvas.ring(frame.x(a), frame.y(limit), 0.06, { color: "white" });
  if (Number.isFinite(atPoint) && frame.containsY(atPoint))
    canvas.dot(frame.x(a), frame.y(atPoint), { color: "white" });
  const shown = Anim.after(end);
  const text = (limit: number | null) => {
    if (limit === null) return canvas.say("não existe", "does not exist");
    if (!Number.isFinite(limit)) return limit > 0 ? "+∞" : "−∞";
    return canvas.number(limit);
  };
  const target = canvas.number(a);
  const agree = side === "both" && left !== null && right !== null && sameLimit(left, right);
  if (side === "both" && !agree) {
    canvas.caption(`lim x→${target}⁻ f(x) = ${text(left)}`, { row: 0, color: "accent", visible: shown });
    canvas.caption(`lim x→${target}⁺ f(x) = ${text(right)}`, { row: 1, color: "second", visible: shown });
  } else {
    const mark = side === "left" ? "⁻" : side === "right" ? "⁺" : "";
    canvas.caption(`lim x→${target}${mark} f(x) = ${text(left ?? right)}`, { row: 0, color: "accent", visible: shown });
  }
  canvas.recordSteps([0, 0.8, end]);
  return canvas.illustration(title, Anim.duration(end + 1));
};

const tangentLine: Compiler = (params, title, language) => {
  const f = PlottedFunction.make(params.text("f"));
  const a = params.number("a");
  if (!f || a === null) return null;
  const half = params.number("width") ?? 2;
  const xLow = params.number("xMin") ?? a - half;
  const xHigh = params.number("xMax") ?? a + half;
  if (!(half > 0) || !(xLow < a && a < xHigh)) return null;
  const h0 = params.number("h") ?? (xHigh - a) * 0.8;
  const fa = f.value(a);
  const fq = f.value(a + h0);
  if (h0 === 0 || !(a + h0 > xLow) || !(a + h0 < xHigh) || !Number.isFinite(fa) || !Number.isFinite(fq)) return null;
  const slope = derivative(f, a);
  if (slope === null) return null;
  const frame = PremadeFrame.fitting([f], xLow, xHigh, [fa, fq]);
  const canvas = new FigureCanvas(language);
  canvas.axes(frame);
  canvas.plot(f, frame, xLow, xHigh);

  const end = 5.0;
  const x = `${Anim.lit(a)} + ${Anim.lit(h0)}*(1-0.97*${Anim.ramp(0.8, end)})`;
  const qx = frame.xText(x);
  const qy = frame.yText(f.replacing(x));
  canvas.line(frame.x(a), frame.y(fa), qx, qy, { color: "second" });
  canvas.dot(qx, qy, { color: "second" });

  // The tangent, cut where it leaves the frame.
  let low = xLow;
  let high = xHigh;
  if (Math.abs(slope) > 1e-9) {
    const atBottom = a + (frame.yLow - fa) / slope;
    const atTop = a + (frame.yHigh - fa) / slope;
    low = Math.max(low, Math.min(atBottom, atTop));
    high = Math.min(high, Math.max(atBottom, atTop));
  }
  const shown = Anim.after(end);
  canvas.line(frame.x(low), frame.y(fa + slope * (low - a)), frame.x(high), frame.y(fa + slope * (high - a)), {
    color: "accent",
    visible: shown,
  });
  canvas.dot(frame.x(a), frame.y(fa), { color: "accent" });
  // Clear of the axis tick numbers (a "1" beside the "P" reads as "1 P"), above the point first.
  canvas.labelBeside("P", frame.x(a), frame.y(fa), { color: "accent", clearance: 0.2 });
  canvas.caption(
    canvas.say(
      `declive da tangente: f′(${canvas.number(a)}) = ${canvas.number(slope)}`,
      `tangent slope: f′(${canvas.number(a)}) = ${canvas.number(slope)}`,
    ),
    { row: 0, color: "accent", visible: Anim.after(end + 0.9) },
  );
  const parameters = [slider("a", "a", a, xLow + 0.05, xHigh - 0.05)];
  canvas.recordSteps([0, 0.8, end, end + 1.0]);
  return canvas.illustration(title, Anim.duration(end + 1.8), parameters);
};

const taylorPolynomials: Compiler = (params, title, language) => {
  const name = taylorName(params.text("function") ?? params.text("f") ?? "");
  const target = name ? taylorTargets[name] : undefined;
  if (!name || !target) return null;
  const degrees = (params.numbers("degrees") ?? [1, 3, 5]).map((d) => Math.trunc(d));
  if (degrees.length < 1 || degrees.length > 4 || !degrees.every((d) => d >= 0 && d <= 12)) return null;
  const xLow = params.number("xMin") ?? target.low;
  const xHigh = params.number("xMax") ?? target.high;
  const f = PlottedFunction.make(target.text);
  if (!(xLow < xHigh) || !f) return null;
  const polynomials: { degree: number; f: PlottedFunction }[] = [];
  for (const degree of degrees) {
    const coefficients = taylorCoefficients(name, degree);
    if (!coefficients) return null;
    const terms = coefficients
      .map((c, offset) => ({ c, offset }))
      .filter(({ c }) => c !== 0)
      .map(({ c, offset }) => `${Anim.lit(c)}*x^${offset}`);
    const polynomial = PlottedFunction.make(terms.length === 0 ? "0" : terms.join("+"));
    if (!polynomial) return null;
    polynomials.push({ degree, f: polynomial });
  }
  const frame = PremadeFrame.fitting([f], xLow, xHigh);
  const canvas = new FigureCanvas(language);
  canvas.axes(frame);
  canvas.plot(f, frame, xLow, xHigh, { color: "white", start: 0.4, end: 1.8 });
  canvas.label("f", 1.6, 5.5, { anchor: "leading", color: "white", visible: Anim.after(0.4) });
  const colors = ["accent", "second", "white", "muted"];
  let time = 2.0;
  polynomials.forEach((polynomial, index) => {
    const color = colors[index]!;
    canvas.plot(polynomial.f, frame, xLow, xHigh, { color, dashed: index >= 2, start: time, end: time + 1.3 });
    canvas.label("P" + subscripted(polynomial.degree), 2.3 + 0.9 * index, 5.5, {
      anchor: "leading",
      color: color === "muted" ? "accent" : color,
      visible: Anim.after(time),
    });
    time += 1.5;
  });
  canvas.label(canvas.say("Polinómios de Maclaurin", "Maclaurin polynomials"), 9.6, 5.5, {
    anchor: "trailing",
    color: "white",
    visible: Anim.after(0.4),
  });
  const boundaries = [0, 1.8];
  let mark = 2.0;
  for (let i = 0; i < polynomials.length; i++) {
    boundaries.push(mark + 1.3);
    mark += 1.5;
  }
  canvas.recordSteps(boundaries);
  return canvas.illustration(title, Anim.duration(time));
};

const riemannSums: Compiler = (params, title, language) => {
  const f = PlottedFunction.make(params.text("f"));
  const a = params.number("a");
  const b = params.number("b");
  if (!f || a === null || b === null || !(b > a)) return null;
  const n = Math.trunc(params.number("n") ?? 6);
  const rule = params.text("rule") ?? "left";
  if (n < 1 || n > 24 || !["left", "right", "midpoint"].includes(rule)) return null;
  const sum = riemannSum(f, a, b, n, rule);
  const exact = integral(f, a, b);
  if (sum === null || exact === null) return null;
  const dx = (b - a) / n;
  const heights = Array.from({ length: n }, (_, index) => f.value(rectangleSample(a, dx, index, rule)));
  const pad = (b - a) * 0.08;
  const frame = PremadeFrame.fitting([f], a - pad, b + pad, [...heights, 0]);
  const canvas = new FigureCanvas(language);
  canvas.axes(frame);
  canvas.plot(f, frame, a - pad, b + pad);
  const step = 3.6 / n;
  heights.forEach((height, index) =>
    canvas.box(frame.x(a + dx * index), frame.y(0), dx * frame.kx, height * frame.ky, {
      color: "accent",
      visible: Anim.after(0.6 + step * index),
    }),
  );
  const end = 0.6 + 3.6;
  const ruleName = canvas.say(
    rule === "left" ? "esquerda" : rule === "right" ? "direita" : "ponto médio",
    rule === "midpoint" ? "midpoint" : rule,
  );
  canvas.caption(
    canvas.say(
      `Soma (n = ${n}, ${ruleName}): ${canvas.number(sum)}`,
      `Sum (n = ${n}, ${ruleName}): ${canvas.number(sum)}`,
    ),
    { row: 0, color: "accent", visible: Anim.after(end) },
  );
  canvas.caption(`Integral: ${canvas.number(exact)}`, { row: 1, color: "white", visible: Anim.after(end) });
  const boundaries = [0];
  for (let index = 0; index < n; index++) boundaries.push(0.6 + step * (index + 1));
  canvas.recordSteps(boundaries);
  return canvas.illustration(title, Anim.duration(end + 0.6), [slider("n", "n", n, 1, 24)]);
};

const revolution: Compiler = (params, title, language) => {
  const f = PlottedFunction.make(params.text("f"));
  const a = params.number("a");
  const b = params.number("b");
  if (!f || a === null || b === null || !(b > a)) return null;
  let peak = 0;
  for (let index = 0; index <= 100; index++) {
    const value = f.value(a + ((b - a) * index) / 100);
    if (!Number.isFinite(value) || value < -1e-9) return null;
    peak = Math.max(peak, value);
  }
  const volume = revolutionVolume(f, a, b);
  if (!(peak > 1e-9) || volume === null) return null;
  const pad = (b - a) * 0.1;
  const frame = new PremadeFrame(a - pad, b + pad, -peak * 1.2, peak * 1.2);
  const canvas = new FigureCanvas(language);
  canvas.axes(frame, { ticks: false });
  canvas.plot(f, frame, a, b, { color: "white", start: 0.5, end: 2.0 });
  const mirror = PlottedFunction.make(`-(${f.replacing("x")})`);
  if (mirror) canvas.plot(mirror, frame, a, b, { color: "muted", start: 0.5, end: 2.0 });
  const discs = 8;
  for (let index = 0; index < discs; index++) {
    const x = a + ((b - a) * (index + 0.5)) / discs;
    const radius = f.value(x) * frame.ky;
    if (!(radius > 0.02)) continue;
    canvas.curve(
      `${Anim.n(frame.x(x))} + 0.14*cos(s)`,
      `${Anim.n(frame.y(0))} + ${Anim.n(radius)}*sin(s)`,
      "0",
      Anim.n(2 * Math.PI),
      { color: "accent", visible: Anim.after(2.2 + 0.4 * index) },
    );
  }
  const end = 2.2 + 0.4 * discs;
  canvas.caption(`V = π∫ f(x)² dx = ${canvas.number(volume)}`, { row: 0, color: "accent", visible: Anim.after(end) });
  return canvas.illustration(title, Anim.duration(end + 0.6));
};

const expLog: Compiler = (params, title, language) => {
  const baseText = params.text("base");
  const isE = baseText !== null ? baseText.toLowerCase() === "e" : !params.has("base");
  const base = isE ? Math.E : (params.number("base") ?? 0);
  if (!(base > 0) || !(Math.abs(base - 1) > 1e-9)) return null;
  const growth = isE ? "exp(x)" : `${Anim.lit(base)}^x`;
  const inverse = isE ? "ln(x)" : `ln(x)/ln(${Anim.lit(base)})`;
  const exponential = PlottedFunction.make(growth);
  const logarithm = PlottedFunction.make(inverse);
  if (!exponential || !logarithm) return null;
  // One unit is the same length on both axes, so the mirror line really is y = x.
  const frame = new PremadeFrame(-2, 3, -1.5, 2.15, 2.7, 7.7);
  const canvas = new FigureCanvas(language);
  canvas.axes(frame);
  canvas.plot(exponential, frame, frame.xLow, frame.xHigh, { color: "white", start: 0.5, end: 2.3 });
  const low = Math.max(frame.xLow, frame.yLow);
  const high = Math.min(frame.xHigh, frame.yHigh);
  const mirrorEnd = `${Anim.n(frame.x(low))} + ${Anim.n(frame.x(high) - frame.x(low))}*${Anim.ramp(2.5, 3.2)}`;
  const mirrorTop = `${Anim.n(frame.y(low))} + ${Anim.n(frame.y(high) - frame.y(low))}*${Anim.ramp(2.5, 3.2)}`;
  canvas.line(frame.x(low), frame.y(low), mirrorEnd, mirrorTop, { color: "muted", dashed: true });
  canvas.plot(logarithm, frame, 1e-4, frame.xHigh, { color: "accent", start: 3.4, end: 5.2 });
  const marks = Anim.after(5.2);
  const separator = canvas.words.decimalComma ? "; " : ", ";
  canvas.dot(frame.x(0), frame.y(1), { color: "white", visible: marks });
  canvas.dot(frame.x(1), frame.y(0), { color: "accent", visible: marks });
  canvas.labelBeside(`(0${separator}1)`, frame.x(0), frame.y(1), { color: "white", visible: marks });
  canvas.labelBeside(`(1${separator}0)`, frame.x(1), frame.y(0), { color: "accent", visible: marks });
  const baseName = isE ? "e" : canvas.number(base);
  const growthLabel = isE ? "eˣ" : `${baseName}ˣ`;
  const logLabel = isE
    ? "ln x"
    : base === Math.round(base) && base < 10
      ? "log" + subscripted(Math.trunc(base)) + " x"
      : `log_${baseName} x`;
  const topX = Math.min(frame.xHigh - 0.4, logBase(base, frame.yHigh * 0.9));
  const rightY = logBase(base, frame.xHigh - 0.3);
  const growthAt = base > 1 ? topX : Math.max(frame.xLow + 0.4, logBase(base, frame.yHigh * 0.9));
  canvas.labelBeside(growthLabel, frame.x(growthAt), frame.y(Math.pow(base, growthAt)), {
    color: "white",
    visible: Anim.after(2.3),
  });
  canvas.labelBeside(logLabel, frame.x(frame.xHigh - 0.3), frame.y(rightY), {
    color: "accent",
    visible: Anim.after(5.2),
  });
  canvas.caption(canvas.say("y = x é o eixo de simetria", "y = x is the mirror line"), {
    row: 0,
    color: "white",
    visible: Anim.after(3.2),
  });
  return canvas.illustration(title, Anim.duration(5.8));
};

const piecewise: Compiler = (params, title, language) => {
  const pieces = piecewisePieces(params);
  const first = pieces?.[0];
  const last = pieces?.[pieces.length - 1];
  if (!pieces || !first || !last) return null;
  const values: number[] = [];
  for (const piece of pieces)
    for (let index = 0; index <= 40; index++)
      values.push(piece.f.value(piece.from + ((piece.to - piece.from) * index) / 40));
  if (!values.some(Number.isFinite)) return null;
  const pad = (last.to - first.from) * 0.08;
  const ends = pieces.flatMap((piece) => [piece.f.value(piece.from), piece.f.value(piece.to)]);
  const frame = PremadeFrame.fittingValues(values, first.from - pad, last.to + pad, ends.filter(Number.isFinite));
  const canvas = new FigureCanvas(language);
  canvas.axes(frame);
  let end = 0.6;
  for (const piece of pieces) {
    const start = end;
    const finish = end + 1.0;
    canvas.plot(piece.f, frame, piece.from, piece.to, { color: "white", start, end: finish });
    for (const [x, closed] of [
      [piece.from, piece.fromClosed],
      [piece.to, piece.toClosed],
    ] as const) {
      const y = piece.f.value(x);
      if (!Number.isFinite(y) || !frame.containsY(y)) continue;
      const shown = Anim.after(x === piece.from ? start : finish);
      if (closed) canvas.dot(frame.x(x), frame.y(y), { color: "accent", visible: shown });
      else canvas.ring(frame.x(x), frame.y(y), 0.06, { color: "accent", visible: shown });
    }
    if (piece.text) {
      const middle = frame.x((piece.from + piece.to) / 2);
      for (const shift of [0.0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5])
        if (
          canvas.label(piece.text, middle + shift, 5.5, {
            anchor: "center",
            color: "white",
            visible: Anim.after(finish),
          })
        )
          break;
    }
    end = finish + 0.1;
  }
  return canvas.illustration(title, Anim.duration(end + 0.6));
};

const rational: Compiler = (params, title, language) => {
  const numerator = PlottedFunction.make(params.text("numerator"));
  const denominator = PlottedFunction.make(params.text("denominator"));
  if (!numerator || !denominator) return null;
  const xLow = params.number("xMin") ?? -6;
  const xHigh = params.number("xMax") ?? 6;
  if (!(xLow < xHigh)) return null;
  const found = rationalAsymptotes(numerator, denominator, xLow, xHigh);
  const ratio = PlottedFunction.make(`(${numerator.replacing("x")})/(${denominator.replacing("x")})`);
  if (!found || !ratio) return null;
  const frame = PremadeFrame.fitting([ratio], xLow, xHigh, found.horizontal !== null ? [found.horizontal] : []);
  const canvas = new FigureCanvas(language);
  canvas.axes(frame);
  canvas.plot(ratio, frame, xLow, xHigh, { color: "white", start: 0.5, end: 2.8 });
  let time = 3.0;
  for (const root of found.vertical) {
    if (!frame.containsX(root)) continue;
    const top = `${Anim.n(frame.bottom)} + ${Anim.n(frame.top - frame.bottom)}*${Anim.ramp(time, time + 0.6)}`;
    canvas.line(frame.x(root), frame.bottom, frame.x(root), top, { color: "accent", dashed: true });
    canvas.labelBeside(`x = ${canvas.number(root)}`, frame.x(root), frame.top - 0.5, {
      color: "accent",
      visible: Anim.after(time + 0.6),
    });
    time += 0.8;
  }
  const level = found.horizontal;
  if (level !== null && frame.containsY(level)) {
    const reach = `${Anim.n(frame.left)} + ${Anim.n(frame.right - frame.left)}*${Anim.ramp(time, time + 0.6)}`;
    canvas.line(frame.left, frame.y(level), reach, frame.y(level), { color: "second", dashed: true });
    canvas.labelBeside(`y = ${canvas.number(level)}`, frame.right - 0.9, frame.y(level), {
      color: "second",
      visible: Anim.after(time + 0.6),
    });
    time += 0.8;
  }
  const slope = found.slantSlope;
  const intercept = found.slantIntercept;
  if (slope !== null && intercept !== null) {
    // The slant line, cut where it leaves the frame.
    const atBottom = (frame.yLow - intercept) / slope;
    const atTop = (frame.yHigh - intercept) / slope;
    const low = Math.max(frame.xLow, Math.min(atBottom, atTop));
    const high = Math.min(frame.xHigh, Math.max(atBottom, atTop));
    if (high > low) {
      const startX = frame.x(low);
      const startY = frame.y(slope * low + intercept);
      const endX = frame.x(high);
      const endY = frame.y(slope * high + intercept);
      const grow = Anim.ramp(time, time + 0.6);
      canvas.line(
        startX,
        startY,
        `${Anim.n(startX)} + ${Anim.n(endX - startX)}*${grow}`,
        `${Anim.n(startY)} + ${Anim.n(endY - startY)}*${grow}`,
        { color: "second", dashed: true },
      );
      canvas.labelBeside(
        lineText(slope, intercept, (value) => canvas.number(value)),
        (startX + endX) / 2,
        (startY + endY) / 2 + 0.3,
        { color: "second", visible: Anim.after(time + 0.6) },
      );
      time += 0.8;
    }
  }
  for (const hole of found.holes) {
    if (!frame.containsX(hole)) continue;
    const value = ratio.value(hole + 1e-6);
    if (Number.isFinite(value) && frame.containsY(value))
      canvas.ring(frame.x(hole), frame.y(value), 0.06, { color: "white", visible: Anim.after(2.8) });
  }
  return canvas.illustration(title, Anim.duration(time + 0.6));
};

const signTableFigure: Compiler = (params, title, language) => {
  const factors = signFactors(params);
  if (!factors) return null;
  const table = signTable(factors);
  if (table.roots.length > 6) return null;
  const canvas = new FigureCanvas(language);
  const left = 2.7;
  const right = 9.5;
  const width = (right - left) / (table.roots.length + 1);
  const boundary = (index: number) => left + width * (index + 1);
  const cell = (column: number) =>
    column % 2 === 1 ? boundary(Math.trunc(column / 2)) : left + width * (Math.trunc(column / 2) + 0.5);
  const rowCount = factors.length + 1;
  const rowY: number[] = [];
  for (let index = 0; index < rowCount; index++) rowY.push(4.0 - 0.65 * index - (index === factors.length ? 0.15 : 0));
  // Frame of the table.
  canvas.line(0.4, 4.55, right, 4.55, { color: "muted" });
  canvas.line(left, 5.3, left, rowY[rowCount - 1]! - 0.4, { color: "muted" });
  // The dashed rules between columns stop short of the numbers they run past.
  for (let index = 0; index < table.roots.length; index++) {
    let top = 4.55;
    for (const y of rowY) {
      canvas.line(boundary(index), top, boundary(index), y + 0.26, { color: "muted", dashed: true });
      top = y - 0.26;
    }
    canvas.line(boundary(index), top, boundary(index), rowY[rowCount - 1]! - 0.4, { color: "muted", dashed: true });
  }
  canvas.label("x", 0.5, 4.95, { anchor: "leading", color: "white" });
  canvas.label("−∞", left + 0.1, 4.95, { anchor: "leading", color: "white" });
  canvas.label("+∞", right, 4.95, { anchor: "trailing", color: "white" });
  table.roots.forEach((root, index) =>
    canvas.label(canvas.number(root), boundary(index), 4.95, { anchor: "center", color: "white" }),
  );
  const start = 0.8;
  const gap = 0.9;
  factors.forEach((factor, index) => {
    const shown = Anim.after(start + gap * index);
    canvas.label(factor.name, 0.5, rowY[index]!, { anchor: "leading", color: "white", visible: shown });
    table.rows[index]!.forEach((text, column) =>
      canvas.label(text, cell(column), rowY[index]!, { anchor: "center", color: "white", visible: shown }),
    );
  });
  const resultTime = start + gap * factors.length;
  const shown = Anim.after(resultTime);
  canvas.line(0.4, rowY[factors.length]! + 0.4, right, rowY[factors.length]! + 0.4, { color: "muted" });
  canvas.label("f(x)", 0.5, rowY[factors.length]!, { anchor: "leading", color: "accent", visible: shown });
  table.result.forEach((text, column) =>
    canvas.label(text, cell(column), rowY[factors.length]!, { anchor: "center", color: "accent", visible: shown }),
  );
  const boundaries = [0];
  for (let index = 0; index < factors.length; index++) boundaries.push(start + gap * (index + 1));
  boundaries.push(resultTime + 0.4);
  canvas.recordSteps(boundaries);
  return canvas.illustration(title, Anim.duration(resultTime + 1));
};

const variationTable: Compiler = (params, title, language) => {
  const f = PlottedFunction.make(params.text("f"));
  const low = params.number("xMin");
  const high = params.number("xMax");
  const points = params.numbers("points");
  if (!f || low === null || high === null || !points || points.length > 3 || !(low < high)) return null;
  const inside = [...points].sort((a, b) => a - b);
  if (!inside.every((p) => p > low && p < high)) return null;
  for (let i = 1; i < inside.length; i++) if (!(inside[i]! - inside[i - 1]! > 1e-9)) return null;
  // The points must be critical: f′ is zero at each.
  for (const point of inside) {
    const slope = derivative(f, point);
    if (slope === null || !(Math.abs(slope) < 1e-3)) return null;
  }
  const bounds = [low, ...inside, high];
  const values = bounds.map((x) => f.value(x));
  const signs = values.every(Number.isFinite) ? variationSigns(f, bounds) : null;
  if (!signs) return null;
  const canvas = new FigureCanvas(language);
  const left = 3.3;
  const right = 9.0;
  const width = (right - left) / (bounds.length - 1);
  const column = (index: number) => left + width * index;
  const valueLow = 0.95;
  const valueHigh = 2.45;
  const smallest = Math.min(...values);
  const largest = Math.max(...values);
  const level = (value: number) =>
    largest - smallest < 1e-9
      ? (valueLow + valueHigh) / 2
      : valueLow + ((value - smallest) / (largest - smallest)) * (valueHigh - valueLow);
  canvas.line(0.4, 4.55, 9.7, 4.55, { color: "muted" });
  canvas.line(0.4, 3.35, 9.7, 3.35, { color: "muted" });
  canvas.line(2.1, 5.3, 2.1, 0.7, { color: "muted" });
  for (let index = 1; index < bounds.length - 1; index++) {
    canvas.line(column(index), 4.55, column(index), 4.21, { color: "muted", dashed: true });
    canvas.line(column(index), 3.69, column(index), 3.35, { color: "muted", dashed: true });
  }
  canvas.label("x", 0.5, 4.95, { anchor: "leading", color: "white" });
  canvas.label("f′(x)", 0.5, 3.95, { anchor: "leading", color: "white" });
  canvas.label("f(x)", 0.5, 1.7, { anchor: "leading", color: "accent" });
  bounds.forEach((bound, index) =>
    canvas.label(canvas.number(bound), column(index), 4.95, { anchor: "center", color: "white" }),
  );
  // f′: its sign between the points and a zero at each point.
  signs.forEach((sign, index) =>
    canvas.label(sign > 0 ? plus : sign < 0 ? minus : zero, (column(index) + column(index + 1)) / 2, 3.95, {
      anchor: "center",
      color: "white",
      visible: Anim.after(0.8),
    }),
  );
  for (let index = 1; index < bounds.length - 1; index++)
    canvas.label(zero, column(index), 3.95, { anchor: "center", color: "white", visible: Anim.after(0.8) });
  // f: values at the columns, arrows between.
  const step = 0.9;
  values.forEach((value, index) => {
    const time = 1.8 + step * Math.max(0, index - 1);
    canvas.label(canvas.number(value), column(index), level(value), {
      anchor: "center",
      color: "accent",
      visible: Anim.after(index === 0 ? 1.8 : time),
    });
  });
  signs.forEach((sign, index) => {
    const startX = column(index) + 0.5;
    const endX = column(index + 1) - 0.5;
    const startY = level(values[index]!);
    const endY = level(values[index + 1]!);
    const span = column(index + 1) - column(index);
    const shiftStart = (startX - column(index)) / span;
    const shiftEnd = (column(index + 1) - endX) / span;
    const fromY = startY + (endY - startY) * shiftStart;
    const toY = endY - (endY - startY) * shiftEnd;
    const visible = Anim.after(1.8 + step * index + 0.3);
    if (sign !== 0) canvas.arrow(startX, fromY, endX, toY, { color: "accent", visible });
    else canvas.line(startX, fromY, endX, toY, { color: "accent", visible });
  });
  // Extrema, in words, once everything is drawn.
  const end = 1.8 + step * bounds.length;
  const notes: string[] = [];
  for (let index = 1; index < bounds.length - 1; index++) {
    if (signs[index - 1]! > 0 && signs[index]! < 0)
      notes.push(canvas.say("máx.", "max") + ` f(${canvas.number(bounds[index]!)}) = ${canvas.number(values[index]!)}`);
    else if (signs[index - 1]! < 0 && signs[index]! > 0)
      notes.push(canvas.say("mín.", "min") + ` f(${canvas.number(bounds[index]!)}) = ${canvas.number(values[index]!)}`);
  }
  if (notes.length > 0) canvas.caption(notes.join(" · "), { row: 0, color: "accent", visible: Anim.after(end) });
  const boundaries = [0, 0.8];
  for (let index = 0; index < values.length; index++) boundaries.push(1.8 + step * Math.max(0, index));
  boundaries.push(end);
  canvas.recordSteps(boundaries);
  return canvas.illustration(title, Anim.duration(end + 0.6));
};

/** The Calculus 1 animated figures this port draws, by premade type. */
export const calculusFigures: Record<string, Compiler> = {
  limitApproach,
  tangentLine,
  taylorPolynomials,
  riemannSums,
  revolutionVolume: revolution,
  signTable: signTableFigure,
  variationTable,
  piecewiseFunction: piecewise,
  rationalAsymptotes: rational,
  expLog,
};
