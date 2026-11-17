// Port of the first part of LearnLayer/Illustrations/PremadeFigureBatch3Math.swift (numerics, modulus, Bolzano's
// theorem, sequence terms, Argand plane) and `prettyExpression` (PremadeFigureBatch3.swift) @ ref 2026-11-04: the graph of |f| with
// the solutions of |f(x)| = k, the bisection that Bolzano's theorem allows, and a sequence drawn term by term with its
// behaviour. Every number is worked out by the app.

import { evaluate, tryParseExpression, variables, type Expression } from "../../math/expression";
import type { IllustrationParameter } from "../illustration";
import { subscripted } from "./calculus";
import { Teach } from "./heating";
import type { Point } from "./optics";
import {
  Anim,
  FigureCanvas,
  LabelBoard,
  Params,
  PlottedFunction,
  PremadeFrame,
  slider,
  type AnimatedIllustration,
} from "./figureCanvas";

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

const superscripts: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

/** An expression the model wrote (`x^2-4`, `2*x`) as it is printed in the exam. */
export function prettyExpression(text: string, decimalComma: boolean): string {
  let result = "";
  const characters = Array.from(text.replace(/ /g, ""));
  let index = 0;
  while (index < characters.length) {
    const character = characters[index]!;
    if (character === "^") {
      // The digits after a caret become a superscript; anything else keeps the caret.
      let digits = "";
      let next = index + 1;
      while (next < characters.length && superscripts[characters[next]!] !== undefined) {
        digits += superscripts[characters[next]!];
        next += 1;
      }
      if (digits === "") result += "^";
      else {
        result += digits;
        index = next;
        continue;
      }
    } else if (character === "*") result += "·";
    else if (character === "-") result += "−";
    else if (character === "." && decimalComma) result += ",";
    else result += character;
    index += 1;
  }
  return result.replace(/sqrt\(/g, "√(").replace(/pi/g, "π");
}

// MARK: Numerics shared by the maths figures and their tests

/** Sorted values with the near-duplicates removed. */
export function uniqueSorted(values: number[], tolerance = 1e-6): number[] {
  const unique: number[] = [];
  for (const value of [...values].sort((a, b) => a - b))
    if (unique.length === 0 || Math.abs(unique[unique.length - 1]! - value) > tolerance) unique.push(value);
  return unique;
}

/**
 * Where f(x) = level inside [a, b]: sign changes found by sampling, then bisected; a point where the graph only touches
 * the level (a double root) is found as a minimum of |f − level|.
 */
export function solutions(f: PlottedFunction, level: number, a: number, b: number, samples = 1200): number[] {
  if (!(b > a)) return [];
  const found: number[] = [];
  const step = (b - a) / samples;
  const xs = Array.from({ length: samples + 1 }, (_, i) => (i === samples ? b : a + step * i));
  const gs = xs.map((x) => f.value(x) - level);
  const scale = Math.max(1, Math.abs(level), ...gs.filter(Number.isFinite).map(Math.abs));
  for (let index = 0; index <= samples; index++) if (gs[index] === 0) found.push(xs[index]!);
  for (let index = 1; index <= samples; index++) {
    const low = gs[index - 1]!;
    const high = gs[index]!;
    if (!Number.isFinite(low) || !Number.isFinite(high) || !(low * high < 0)) continue;
    let lowX = xs[index - 1]!;
    let highX = xs[index]!;
    let lowValue = low;
    for (let i = 0; i < 60; i++) {
      const middle = (lowX + highX) / 2;
      const middleValue = f.value(middle) - level;
      if (lowValue * middleValue <= 0) highX = middle;
      else {
        lowX = middle;
        lowValue = middleValue;
      }
    }
    found.push((lowX + highX) / 2);
  }
  // A touch: |g| has a local minimum that is zero although g keeps its sign.
  if (samples >= 2)
    for (let index = 1; index < samples; index++) {
      const before = gs[index - 1]!;
      const here = gs[index]!;
      const after = gs[index + 1]!;
      if (
        !Number.isFinite(before) ||
        !Number.isFinite(here) ||
        !Number.isFinite(after) ||
        !(before * here > 0) ||
        !(here * after > 0) ||
        !(Math.abs(here) <= Math.abs(before)) ||
        !(Math.abs(here) < Math.abs(after))
      )
        continue;
      let lowX = xs[index - 1]!;
      let highX = xs[index + 1]!;
      for (let i = 0; i < 100; i++) {
        const first = lowX + (highX - lowX) / 3;
        const second = highX - (highX - lowX) / 3;
        if (Math.abs(f.value(first) - level) < Math.abs(f.value(second) - level)) highX = second;
        else lowX = first;
      }
      const x = (lowX + highX) / 2;
      if (Math.abs(f.value(x) - level) < 1e-7 * scale) found.push(x);
    }
  return uniqueSorted(found, 1e-4);
}

/** The solutions of |f(x)| = k: f(x) = k or f(x) = −k. None when k < 0. */
export function modulusSolutions(f: PlottedFunction, k: number, a: number, b: number): number[] {
  if (k < 0) return [];
  let all = solutions(f, k, a, b);
  if (k > 0) all = all.concat(solutions(f, -k, a, b));
  return uniqueSorted(all);
}

// MARK: Modulus

const modulus: Compiler = (params, title, language) => {
  const fText = params.text("f");
  const f = PlottedFunction.make(fText);
  const absolute = fText === null ? null : PlottedFunction.make(`abs(${fText})`);
  if (fText === null || !f || !absolute) return null;
  const xLow = params.number("xMin") ?? -5;
  const xHigh = params.number("xMax") ?? 5;
  if (!(xLow < xHigh && xHigh - xLow <= 200)) return null;
  const k = params.number("k");
  if (k !== null && Math.abs(k) > 1e4) return null;
  const values = Array.from({ length: 241 }, (_, i) => f.value(xLow + ((xHigh - xLow) * i) / 240));
  if (!values.every(Number.isFinite)) return null;
  const maxAbs = Math.max(...values.map(Math.abs));
  const lowest = Math.min(...values);
  if (!(maxAbs > 1e-9 && maxAbs < 1e6)) return null;
  const top = Math.max(maxAbs, k ?? 0);
  const frame = new PremadeFrame(xLow, xHigh, Math.min(lowest, 0) - 0.12 * top, top * 1.12);
  const canvas = new FigureCanvas(language);
  canvas.axes(frame, { ticks: false });

  // Step 1: the graph of f. Step 2: |f|, the negative part reflected in the x axis.
  const fName = "f(x) = " + prettyExpression(fText, canvas.words.decimalComma);
  canvas.label(fName, 1.5, 5.5, { anchor: "leading", color: "muted", visible: Anim.after(0.4) });
  const absoluteX = 1.5 + Array.from(fName).length * LabelBoard.charWidth + 0.5;
  canvas.label("y = |f(x)|", absoluteX, 5.5, { anchor: "leading", color: "white", visible: Anim.after(1.9) });
  canvas.plot(f, frame, xLow, xHigh, { color: "muted", dashed: true, start: 0.4, end: 1.6 });
  const zeros = solutions(f, 0, xLow, xHigh);
  const breaks = [xLow, ...zeros.filter((z) => z > xLow + 1e-9 && z < xHigh - 1e-9), xHigh];
  const span = xHigh - xLow;
  for (let index = 1; index < breaks.length; index++) {
    const p = breaks[index - 1]!;
    const q = breaks[index]!;
    if (!(q - p > 1e-9)) continue;
    const color = f.value((p + q) / 2) >= 0 ? "white" : "accent";
    canvas.plot(absolute, frame, p, q, {
      color,
      start: 1.9 + (1.4 * (p - xLow)) / span,
      end: 1.9 + (1.4 * (q - xLow)) / span,
    });
  }
  for (const zero of zeros)
    if (frame.containsX(zero)) canvas.dot(frame.x(zero), frame.axisY, { color: "white", visible: Anim.after(3.4) });
  canvas.axisTicks(frame);
  let boundaries = [0, 1.7, 3.5];
  let end = 3.5;
  const note = canvas.say(
    "Onde f(x) < 0, o gráfico reflete-se no eixo Ox: |f(x)| ≥ 0",
    "Where f(x) < 0 the graph is reflected in the x axis: |f(x)| ≥ 0",
  );

  // Step 3 (when k is given): the line y = k and the points where it meets |f|.
  let parameters: IllustrationParameter[] = [];
  if (k !== null) {
    const found = modulusSolutions(f, k, xLow, xHigh);
    const lineStart = 4.4;
    const firstDot = 5.0;
    canvas.caption(note, { row: 1, color: "white", visible: Anim.window(1.9, lineStart) });
    canvas.line(frame.left, frame.y(k), frame.right, frame.y(k), {
      color: "second",
      dashed: true,
      visible: Anim.after(lineStart),
    });
    canvas.labelBeside(`y = ${canvas.number(k)}`, frame.right - 0.1, frame.y(k), {
      color: "second",
      visible: Anim.after(lineStart),
    });
    found.forEach((x, index) => {
      const shown = Anim.after(firstDot + 0.3 * index);
      canvas.line(frame.x(x), frame.axisY, frame.x(x), frame.y(k), { color: "second", dashed: true, visible: shown });
      canvas.dot(frame.x(x), frame.y(k), { color: "second", visible: shown });
    });
    end = firstDot + 0.3 * found.length + 0.2;
    const result =
      found.length === 0
        ? canvas.say(`|f(x)| = ${canvas.number(k)} não tem soluções`, `|f(x)| = ${canvas.number(k)} has no solution`)
        : `|f(x)| = ${canvas.number(k)}  ⇒  ` + canvas.list(found.map((x) => `x = ${canvas.number(x)}`));
    canvas.caption(result, { row: 1, color: "second", visible: Anim.after(firstDot), claim: false });
    boundaries = [...boundaries, lineStart + 0.1, end];
    parameters = [slider("k", "k", k, Math.min(0, k), top)];
  } else canvas.caption(note, { row: 1, color: "white", visible: Anim.after(1.9) });
  canvas.recordSteps(boundaries);
  return canvas.illustration(title, Anim.duration(end + 0.6), parameters);
};

// MARK: Bolzano's theorem

export interface BisectionStep {
  mid: number;
  valueAtMid: number;
  low: number;
  high: number;
}

/** Halves [a, b] `count` times, keeping the half where f changes sign. Null unless f(a) and f(b) have opposite signs. */
export function bisection(f: PlottedFunction, a: number, b: number, count: number): BisectionStep[] | null {
  if (!(a < b) || count < 1) return null;
  let low = a;
  let high = b;
  const fa = f.value(a);
  const fb = f.value(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb) || !(fa * fb < 0)) return null;
  let lowValue = fa;
  const steps: BisectionStep[] = [];
  for (let i = 0; i < count; i++) {
    const mid = (low + high) / 2;
    const value = f.value(mid);
    if (!Number.isFinite(value)) return null;
    if (value === 0) {
      low = mid;
      high = mid;
    } else if (lowValue * value < 0) high = mid;
    else {
      low = mid;
      lowValue = value;
    }
    steps.push({ mid, valueAtMid: value, low, high });
    if (value === 0) break;
  }
  return steps;
}

const bolzano: Compiler = (params, title, language) => {
  const f = PlottedFunction.make(params.text("f"));
  const a = params.number("a");
  const b = params.number("b");
  if (!f || a === null || b === null || !(a < b) || b - a > 1e4) return null;
  const iterations = Math.trunc(params.number("n") ?? 4);
  if (!(iterations >= 1 && iterations <= 6)) return null;
  const samples = Array.from({ length: 241 }, (_, i) => f.value(a + ((b - a) * i) / 240));
  if (!samples.every(Number.isFinite)) return null;
  const high = Math.max(...samples);
  const low = Math.min(...samples);
  if (!(high - low > 1e-9)) return null;
  // A continuous function does not jump: a pole between the ends is not Bolzano's case.
  let biggestJump = 0;
  for (let index = 1; index < samples.length; index++)
    biggestJump = Math.max(biggestJump, Math.abs(samples[index]! - samples[index - 1]!));
  if (!(biggestJump < 0.6 * (high - low))) return null;
  const fa = samples[0]!;
  const fb = samples[240]!;
  const steps = fa * fb < 0 ? bisection(f, a, b, iterations) : null;
  const last = steps?.at(-1);
  if (!steps || !last) return null;

  const pad = 0.12 * (b - a);
  const margin = 0.1 * (high - low);
  const frame = new PremadeFrame(
    a - pad,
    b + pad,
    Math.min(low, 0) - margin,
    Math.max(high, 0) + margin,
    1.4,
    9.2,
    2.1,
    5.0,
  );
  const canvas = new FigureCanvas(language);
  canvas.axes(frame, { ticks: false });
  // Step 3: the theorem. Written first so that nothing else takes its place.
  const separator = canvas.words.decimalComma ? "; " : ", ";
  const interval = `[${canvas.number(a)}${separator}${canvas.number(b)}]`;
  canvas.caption(
    canvas.say(
      `f contínua em ${interval}, f(a)·f(b) < 0 ⇒ ∃ c ∈ ]a, b[: f(c) = 0`,
      `f continuous on ${interval}, f(a)·f(b) < 0 ⇒ ∃ c ∈ ]a, b[: f(c) = 0`,
    ),
    { row: 0, color: "white", visible: Anim.after(3.1) },
  );
  const first = 3.9;
  const gap = 0.9;
  const finalStart = first + gap * steps.length;
  const enclosure = `[${canvas.number(last.low, 5)}${separator}${canvas.number(last.high, 5)}]`;
  canvas.caption(
    canvas.say(`Após ${steps.length} bisseções: c ∈ ${enclosure}`, `After ${steps.length} halvings: c ∈ ${enclosure}`),
    { row: 1, color: "accent", visible: Anim.after(finalStart) },
  );
  canvas.plot(f, frame, a - pad, b + pad, { color: "white", start: 0.4, end: 1.6 });
  canvas.axisTicks(frame);

  // Step 2: the signs at both ends.
  const shownEnds = Anim.after(1.9);
  for (const [x, value] of [
    [a, fa],
    [b, fb],
  ] as const) {
    const color = value < 0 ? "second" : "accent";
    canvas.line(frame.x(x), frame.axisY, frame.x(x), frame.y(value), { color, dashed: true, visible: shownEnds });
    canvas.dot(frame.x(x), frame.y(value), { color, visible: shownEnds });
  }
  canvas.labelBeside(`f(a) = ${canvas.number(fa)}`, frame.x(a), frame.y(fa), {
    color: fa < 0 ? "second" : "accent",
    visible: shownEnds,
  });
  canvas.labelBeside(`f(b) = ${canvas.number(fb)}`, frame.x(b), frame.y(fb), {
    color: fb < 0 ? "second" : "accent",
    visible: shownEnds,
  });
  // The interval [a, b] is the first row under the picture; every halving adds a row.
  const rowTop = 1.8;
  const rowGap = 0.18;
  const bracket = (from: number, to: number, row: number, color: string, visible: string) => {
    const y = rowTop - rowGap * row;
    canvas.line(frame.x(from), y, frame.x(to), y, { color, visible });
    canvas.line(frame.x(from), y - 0.06, frame.x(from), y + 0.06, { color, visible });
    canvas.line(frame.x(to), y - 0.06, frame.x(to), y + 0.06, { color, visible });
  };
  bracket(a, b, 0, "white", shownEnds);
  canvas.label("a", frame.x(a) - 0.12, rowTop, { anchor: "trailing", color: "white", visible: shownEnds });
  canvas.label("b", frame.x(b) + 0.12, rowTop, { anchor: "leading", color: "white", visible: shownEnds });

  // Steps 4…: the interval is halved; the half where the sign changes is kept.
  const boundaries = [0, 1.7, 2.0, 3.2];
  steps.forEach((step, index) => {
    const shown = Anim.after(first + gap * index);
    const color = step.valueAtMid < 0 ? "second" : "accent";
    canvas.line(frame.x(step.mid), frame.axisY, frame.x(step.mid), frame.y(step.valueAtMid), {
      color,
      dashed: true,
      visible: shown,
    });
    canvas.dot(frame.x(step.mid), frame.y(step.valueAtMid), { color, visible: shown });
    bracket(step.low, step.high, index + 1, "accent", shown);
    boundaries.push(first + gap * index + 0.1);
  });
  const zero = (last.low + last.high) / 2;
  canvas.ring(frame.x(zero), frame.axisY, 0.09, { color: "white", visible: Anim.after(finalStart) });
  canvas.labelBeside("c", frame.x(zero), frame.axisY, { color: "white", visible: Anim.after(finalStart) });
  boundaries.push(finalStart + 0.2);
  canvas.recordSteps(boundaries);
  return canvas.illustration(title, Anim.duration(finalStart + 0.8), [slider("n", "n", iterations, 1, 6)]);
};

// MARK: Sequence terms

export type SequenceKind =
  | { kind: "arithmetic"; first: number; difference: number }
  | { kind: "geometric"; first: number; ratio: number }
  | { kind: "general"; expression: Expression; text: string };

export type SequenceBehaviour =
  | { kind: "converges"; limit: number }
  /** Grows without bound towards +∞ (1) or −∞ (−1). */
  | { kind: "diverges"; direction: number }
  /** Neither settles nor heads for ±∞ (alternates, or swings). */
  | { kind: "oscillates" };

/** A sequence uₙ the figure draws term by term: arithmetic, geometric, or a formula in n. */
export class SequenceSpec {
  constructor(readonly kind: SequenceKind) {}

  /** uₙ for n = 1, 2, 3… */
  term(n: number): number {
    const spec = this.kind;
    if (spec.kind === "arithmetic") return spec.first + (n - 1) * spec.difference;
    if (spec.kind === "geometric") return spec.first * Math.pow(spec.ratio, n - 1);
    return evaluate(spec.expression, { n });
  }

  get behaviour(): SequenceBehaviour {
    const spec = this.kind;
    if (spec.kind === "arithmetic")
      return spec.difference === 0
        ? { kind: "converges", limit: spec.first }
        : { kind: "diverges", direction: spec.difference > 0 ? 1 : -1 };
    if (spec.kind === "geometric") {
      if (spec.first === 0 || Math.abs(spec.ratio) < 1) return { kind: "converges", limit: 0 };
      if (spec.ratio === 1) return { kind: "converges", limit: spec.first };
      if (spec.ratio > 1) return { kind: "diverges", direction: spec.first > 0 ? 1 : -1 };
      return { kind: "oscillates" };
    }
    // Far out, decade by decade, each with its neighbour: so (−1)ⁿ cannot pass for a limit or for ∞.
    const points = [1_000_000, 1_000_001, 1_000_000_000, 1_000_000_001, 1_000_000_000_000, 1_000_000_000_001];
    const far = points.map((n) => this.term(n));
    if (!far.every(Number.isFinite)) return { kind: "oscillates" };
    // |a − b| < tolerance · max(1, |scale|)
    const close = (a: number, b: number, tolerance: number, scale: number) =>
      Math.abs(a - b) < tolerance * Math.max(1, Math.abs(scale));
    const agrees = close(far[5]!, far[4]!, 1e-3, far[5]!) && close(far[3]!, far[2]!, 1e-2, far[3]!);
    if (agrees && close(far[4]!, far[2]!, 1e-3, far[4]!) && close(far[2]!, far[0]!, 1e-2, far[2]!))
      return { kind: "converges", limit: far[4]! };
    const anchor = far[0]!;
    const sameSign = far.every((value) => value * anchor > 0);
    // Growing in one direction, and every decade adds at least as much as the one before (ln n, √n, n², …).
    const first = Math.abs(far[2]!) - Math.abs(far[0]!);
    const second = Math.abs(far[4]!) - Math.abs(far[2]!);
    if (sameSign && first > 0 && second >= 0.9 * first) return { kind: "diverges", direction: far[4]! > 0 ? 1 : -1 };
    return { kind: "oscillates" };
  }

  /** The first `count` terms. */
  terms(count: number): number[] {
    return Array.from({ length: Math.max(count, 1) }, (_, i) => this.term(i + 1));
  }
}

export function sequenceSpec(params: Params): SequenceSpec | null {
  const kind = params.text("kind") ?? (params.has("u") ? "general" : "arithmetic");
  if (kind === "arithmetic") {
    const first = params.number("u1");
    const difference = params.number("d");
    return first === null || difference === null ? null : new SequenceSpec({ kind: "arithmetic", first, difference });
  }
  if (kind === "geometric") {
    const first = params.number("u1");
    const ratio = params.number("r");
    return first === null || ratio === null ? null : new SequenceSpec({ kind: "geometric", first, ratio });
  }
  if (kind === "general") {
    const text = params.text("u");
    const parsed = text === null ? null : tryParseExpression(text);
    if (text === null || !parsed || [...variables(parsed)].some((name) => name !== "n")) return null;
    return new SequenceSpec({ kind: "general", expression: parsed, text });
  }
  return null;
}

const sequenceTerms: Compiler = (params, title, language) => {
  const spec = sequenceSpec(params);
  if (!spec) return null;
  const count = Math.trunc(params.number("count") ?? 10);
  if (!(count >= 4 && count <= 16)) return null;
  const terms = spec.terms(count);
  if (!terms.every((t) => Number.isFinite(t) && Math.abs(t) < 1e9)) return null;
  const behaviour = spec.behaviour;
  const limit = behaviour.kind === "converges" ? behaviour.limit : null;
  const low = Math.min(0, ...terms, limit ?? 0);
  const high = Math.max(0, ...terms, limit ?? 0);
  const span = Math.max(high - low, 1e-9);
  const pad = high - low < 1e-9 ? 1 : 0.14 * span;
  const frame = new PremadeFrame(0, count + 1, low - pad, high + pad, 1.6, 9.2);
  const canvas = new FigureCanvas(language);
  const n = (value: number, digits = 3) => canvas.number(value, digits);

  // Words first, so that nothing else takes their place.
  const kind = spec.kind;
  let formula: string;
  if (kind.kind === "arithmetic") {
    const step = kind.difference < 0 ? `(${n(kind.difference)})` : n(kind.difference);
    formula = `uₙ = ${n(kind.first)} + (n − 1)·${step}`;
  } else if (kind.kind === "geometric") {
    const base = kind.ratio < 0 ? `(${n(kind.ratio)})` : n(kind.ratio);
    formula = `uₙ = ${n(kind.first)}·${base}ⁿ⁻¹`;
  } else formula = "uₙ = " + prettyExpression(kind.text, canvas.words.decimalComma);
  canvas.caption(formula, { row: 0, color: "white", visible: Anim.after(0.4) });
  const firstTerms = [1, 2, 3, 4].map((i) => `u${subscripted(i)} = ${n(terms[i - 1]!)}`);
  const listed = canvas.list(firstTerms) + (canvas.words.decimalComma ? "; …" : ", …");
  let verdict: string;
  const infinity = (direction: number) => (direction > 0 ? "+∞" : "−∞");
  if (kind.kind === "arithmetic") {
    if (behaviour.kind === "diverges")
      verdict = canvas.say(
        `Progressão aritmética de razão ${n(kind.difference)}: ${kind.difference > 0 ? "crescente, uₙ → +∞" : "decrescente, uₙ → −∞"}`,
        `Arithmetic sequence, difference ${n(kind.difference)}: ${kind.difference > 0 ? "increasing, uₙ → +∞" : "decreasing, uₙ → −∞"}`,
      );
    else verdict = canvas.say("Progressão constante: converge", "Constant sequence: it converges");
  } else if (kind.kind === "geometric") {
    if (behaviour.kind === "converges")
      verdict = canvas.say(
        `Progressão geométrica de razão ${n(kind.ratio)}: converge para ${n(behaviour.limit)}`,
        `Geometric sequence, ratio ${n(kind.ratio)}: converges to ${n(behaviour.limit)}`,
      );
    else if (behaviour.kind === "diverges")
      verdict = canvas.say(
        `Progressão geométrica de razão ${n(kind.ratio)}: diverge (uₙ → ${infinity(behaviour.direction)})`,
        `Geometric sequence, ratio ${n(kind.ratio)}: diverges (uₙ → ${infinity(behaviour.direction)})`,
      );
    else
      verdict = canvas.say(
        `Progressão geométrica de razão ${n(kind.ratio)} ≤ −1: não tem limite`,
        `Geometric sequence, ratio ${n(kind.ratio)} ≤ −1: no limit`,
      );
  } else if (behaviour.kind === "converges")
    verdict = canvas.say(`Converge: lim uₙ ≈ ${n(behaviour.limit, 4)}`, `Converges: lim uₙ ≈ ${n(behaviour.limit, 4)}`);
  else if (behaviour.kind === "diverges")
    verdict = canvas.say(
      `Diverge: uₙ → ${infinity(behaviour.direction)}`,
      `Diverges: uₙ → ${infinity(behaviour.direction)}`,
    );
  else verdict = canvas.say("Não converge: uₙ não tem limite", "Does not converge: uₙ has no limit");
  const dotsStart = 1.4;
  const dotGap = 0.28;
  const dotsEnd = dotsStart + dotGap * count;
  canvas.caption(listed, { row: 1, color: "muted", visible: Anim.window(0.4, dotsEnd + 0.2) });
  canvas.caption(verdict, { row: 1, color: "accent", visible: Anim.after(dotsEnd + 0.2), claim: false });

  canvas.axes(frame, { xName: "n", yName: "uₙ" });
  terms.forEach((value, index) => {
    const shown = Anim.after(dotsStart + dotGap * index);
    canvas.line(frame.x(index + 1), frame.axisY, frame.x(index + 1), frame.y(value), {
      color: "muted",
      dashed: true,
      visible: shown,
    });
    canvas.dot(frame.x(index + 1), frame.y(value), { color: "white", visible: shown });
  });
  if (limit !== null) {
    const shown = Anim.after(dotsEnd + 0.2);
    canvas.line(frame.left, frame.y(limit), frame.right, frame.y(limit), {
      color: "second",
      dashed: true,
      visible: shown,
    });
    canvas.labelBeside(`L = ${n(limit, 4)}`, frame.right - 0.1, frame.y(limit), { color: "second", visible: shown });
  }
  const boundaries = [0, 0.5];
  for (let group = 4; group <= count; group += 4) boundaries.push(dotsStart + dotGap * (group - 1) + 0.1);
  if (count % 4 > 1) boundaries.push(dotsStart + dotGap * (count - 1) + 0.1);
  boundaries.push(dotsEnd + 0.5);
  canvas.recordSteps(boundaries);
  const parameters: IllustrationParameter[] = [];
  if (kind.kind === "arithmetic")
    parameters.push(slider("d", "d", kind.difference, Math.min(-5, kind.difference), Math.max(5, kind.difference)));
  else if (kind.kind === "geometric")
    parameters.push(slider("r", "r", kind.ratio, Math.min(-1.5, kind.ratio), Math.max(1.5, kind.ratio)));
  parameters.push(slider("count", "n", count, 4, 16));
  return canvas.illustration(title, Anim.duration(dotsEnd + 1.0), parameters);
};

// MARK: Argand plane

/** A complex number as written: 3 + 4i, −1 − 2i, 2i, i, −i, 5. */
export function complexText(re: number, im: number, number: (value: number) => string): string {
  const tiny = 1e-9;
  if (Math.abs(im) < tiny) return number(re);
  const imaginary = Math.abs(Math.abs(im) - 1) < tiny ? "i" : number(Math.abs(im)) + "i";
  if (Math.abs(re) < tiny) return (im < 0 ? "−" : "") + imaginary;
  return number(re) + (im < 0 ? " − " : " + ") + imaginary;
}

export class Complex {
  constructor(
    readonly re: number,
    readonly im: number,
  ) {}
  get modulus(): number {
    return Math.hypot(this.re, this.im);
  }
  /** The principal argument in degrees, in (−180, 180]. */
  get argumentDegrees(): number {
    return (Math.atan2(this.im, this.re) * 180) / Math.PI;
  }
  get conjugate(): Complex {
    return new Complex(this.re, -this.im);
  }
  plus(other: Complex): Complex {
    return new Complex(this.re + other.re, this.im + other.im);
  }
  times(other: Complex): Complex {
    return new Complex(this.re * other.re - this.im * other.im, this.re * other.im + this.im * other.re);
  }
}

const argandPlane: Compiler = (params, title, language) => {
  const operation = params.text("operation") ?? "polar";
  const re = params.number("re");
  const im = params.number("im");
  if (!["polar", "add", "multiply"].includes(operation) || re === null || im === null) return null;
  const z = new Complex(re, im);
  let w = new Complex(0, 0);
  if (operation !== "polar") {
    const re2 = params.number("re2");
    const im2 = params.number("im2");
    if (re2 === null || im2 === null) return null;
    w = new Complex(re2, im2);
  }
  if (
    ![z.re, z.im, w.re, w.im].every((v) => Math.abs(v) <= 1e3) ||
    !(z.modulus > 1e-9) ||
    !(operation === "polar" || w.modulus > 1e-9)
  )
    return null;
  const result = operation === "add" ? z.plus(w) : z.times(w);
  const shown = operation === "polar" ? [new Complex(0, 0), z, z.conjugate] : [new Complex(0, 0), z, w, result];
  const xs = shown.map((c) => c.re);
  const ys = shown.map((c) => c.im);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const padX = 0.12 * Math.max(spanX, 1);
  const padY = 0.12 * Math.max(spanY, 1);
  const frame = PremadeFrame.equalScale(
    Math.min(...xs) - padX,
    Math.max(...xs) + padX,
    Math.min(...ys) - padY,
    Math.max(...ys) + padY,
  );
  const canvas = new FigureCanvas(language);
  const origin = { x: frame.x(0), y: frame.y(0) };
  const world = (c: Complex) => ({ x: frame.x(c.re), y: frame.y(c.im) });
  const text = (c: Complex) => complexText(c.re, c.im, (v) => canvas.number(v));
  const growing = (from: Point, to: Point, step: number, color: string, dashed = false) => {
    const start = Teach.start(step);
    const grow = Anim.ramp(start, start + 0.8);
    const x2 = `${Anim.n(from.x)} + ${Anim.lit(to.x - from.x)}*${grow}`;
    const y2 = `${Anim.n(from.y)} + ${Anim.lit(to.y - from.y)}*${grow}`;
    if (dashed) canvas.line(from.x, from.y, x2, y2, { color, dashed: true });
    else canvas.arrow(from.x, from.y, x2, y2, { color });
  };
  // The arcs are known before the labels are placed, so that the labels keep clear of them.
  const reserveArc = (radius: number, degrees: number) =>
    canvas.reserveStrokes(
      Array.from({ length: 41 }, (_, index) => {
        const angle = (((degrees * Math.PI) / 180) * index) / 40;
        return { x: origin.x + radius * Math.cos(angle), y: origin.y + radius * Math.sin(angle) };
      }),
    );
  const arc = (radius: number, degrees: number, step: number, color: string) => {
    const start = Teach.start(step);
    canvas.curve(
      `${Anim.n(origin.x)} + ${Anim.n(radius)}*cos(s)`,
      `${Anim.n(origin.y)} + ${Anim.n(radius)}*sin(s)`,
      "0",
      `${Anim.lit((degrees * Math.PI) / 180)}*${Anim.ramp(start, start + 0.8)}`,
      { color },
    );
  };

  // Words first, so that nothing else takes their place.
  const degreesText = (value: number) => canvas.number(value, 4) + "°";
  let steps: number;
  if (operation === "polar") {
    const a = canvas.number(z.re);
    const b = canvas.number(Math.abs(z.im));
    canvas.caption(`z = a + bi = ${text(z)}`, { row: 0, color: "white", visible: Anim.after(Teach.start(0)) });
    const modulusLine = `|z| = √(a² + b²) = √(${a}² + ${b}²) = ${canvas.number(z.modulus)}`;
    const angleLine = canvas.say(
      `arg z = θ = ${degreesText(z.argumentDegrees)}  (tan θ = b/a)`,
      `arg z = θ = ${degreesText(z.argumentDegrees)}  (tan θ = b/a)`,
    );
    const conjugateLine = canvas.say(
      `z\u0304 = ${text(z.conjugate)}: reflexão de z no eixo real`,
      `z\u0304 = ${text(z.conjugate)}: z reflected in the real axis`,
    );
    canvas.caption(modulusLine, { row: 1, color: "white", visible: Anim.window(Teach.start(2), Teach.start(3)) });
    canvas.caption(angleLine, {
      row: 1,
      color: "accent",
      visible: Anim.window(Teach.start(3), Teach.start(4)),
      claim: false,
    });
    canvas.caption(conjugateLine, { row: 1, color: "second", visible: Anim.after(Teach.start(4)), claim: false });
    steps = Math.abs(z.im) > 1e-9 ? 5 : 4;
  } else if (operation === "add") {
    canvas.caption(
      canvas.say("Soma: os vetores somam-se (regra do paralelogramo)", "Sum: the vectors add (parallelogram rule)"),
      { row: 0, color: "white", visible: Anim.after(Teach.start(2)) },
    );
    canvas.caption(`z + w = (${text(z)}) + (${text(w)}) = ${text(result)}`, {
      row: 1,
      color: "white",
      visible: Anim.after(Teach.start(3)),
    });
    steps = 4;
  } else {
    canvas.caption(
      canvas.say(
        "Produto: multiplicam-se os módulos e somam-se os argumentos",
        "Product: the moduli multiply and the arguments add",
      ),
      { row: 0, color: "white", visible: Anim.after(Teach.start(2)) },
    );
    const modulusLine = `|z·w| = |z|·|w| = ${canvas.number(z.modulus)} × ${canvas.number(w.modulus)} = ${canvas.number(result.modulus)}`;
    const sum = z.argumentDegrees + w.argumentDegrees;
    const principal = result.argumentDegrees;
    const wrapped = Math.abs(sum - principal) > 1e-6;
    const anglesLine = `arg(z·w) = θ₁ + θ₂ = ${degreesText(sum)}` + (wrapped ? ` ≡ ${degreesText(principal)}` : "");
    canvas.caption(modulusLine, { row: 1, color: "white", visible: Anim.window(Teach.start(2), Teach.start(3)) });
    canvas.caption(anglesLine, { row: 1, color: "accent", visible: Anim.after(Teach.start(3)), claim: false });
    steps = 4;
  }
  canvas.axes(frame, { xName: "Re", yName: "Im", ticks: false, titles: false });
  if (operation === "polar") reserveArc(0.55, z.argumentDegrees);
  else if (operation === "multiply") {
    reserveArc(0.45, z.argumentDegrees);
    reserveArc(0.7, w.argumentDegrees);
    reserveArc(0.95, result.argumentDegrees);
  }
  growing(origin, world(z), 0, "accent");
  canvas.labelBeside("z", world(z).x, world(z).y, { color: "accent", visible: Anim.after(Teach.start(0) + 0.8) });
  if (operation === "polar") {
    const tip = world(z);
    const first = Anim.after(Teach.start(1));
    canvas.line(tip.x, tip.y, tip.x, origin.y, { color: "muted", dashed: true, visible: first });
    canvas.line(tip.x, tip.y, origin.x, tip.y, { color: "muted", dashed: true, visible: first });
    canvas.dot(tip.x, origin.y, { color: "accent", visible: first });
    canvas.dot(origin.x, tip.y, { color: "accent", visible: first });
    // |z| written along the arrow; the angle between the real axis and z.
    const mid = { x: (origin.x + tip.x) / 2, y: (origin.y + tip.y) / 2 };
    canvas.labelBeside("|z|", mid.x, mid.y, { color: "white", visible: Anim.after(Teach.start(2)) });
    arc(0.55, z.argumentDegrees, 3, "second");
    const half = ((z.argumentDegrees / 2) * Math.PI) / 180;
    for (const reach of [0.85, 1.15, 1.45])
      if (
        canvas.label("θ", origin.x + reach * Math.cos(half), origin.y + reach * Math.sin(half), {
          anchor: "center",
          color: "second",
          visible: Anim.after(Teach.start(3) + 0.4),
          avoidStrokes: true,
        })
      )
        break;
    if (steps === 5) {
      const mirror = world(z.conjugate);
      growing(origin, mirror, 4, "second");
      canvas.line(tip.x, tip.y, mirror.x, mirror.y, {
        color: "muted",
        dashed: true,
        visible: Anim.after(Teach.start(4)),
      });
      canvas.labelBeside("z\u0304", mirror.x, mirror.y, { color: "second", visible: Anim.after(Teach.start(4) + 0.8) });
    }
  } else if (operation === "add") {
    growing(origin, world(w), 1, "second");
    canvas.labelBeside("w", world(w).x, world(w).y, { color: "second", visible: Anim.after(Teach.start(1) + 0.8) });
    const zTip = world(z);
    const wTip = world(w);
    const sum = world(result);
    growing(zTip, sum, 2, "second", true);
    growing(wTip, sum, 2, "accent", true);
    growing(origin, sum, 3, "white");
    canvas.labelBeside("z + w", sum.x, sum.y, { color: "white", visible: Anim.after(Teach.start(3) + 0.8) });
  } else {
    growing(origin, world(w), 1, "second");
    canvas.labelBeside("w", world(w).x, world(w).y, { color: "second", visible: Anim.after(Teach.start(1) + 0.8) });
    const product = world(result);
    growing(origin, product, 2, "white");
    canvas.labelBeside("z·w", product.x, product.y, { color: "white", visible: Anim.after(Teach.start(2) + 0.8) });
    arc(0.45, z.argumentDegrees, 3, "accent");
    arc(0.7, w.argumentDegrees, 3, "second");
    arc(0.95, result.argumentDegrees, 3, "white");
    for (const [name, radius, degrees, color] of [
      ["θ₁", 0.45, z.argumentDegrees, "accent"],
      ["θ₂", 0.7, w.argumentDegrees, "second"],
      ["θ₁+θ₂", 0.95, result.argumentDegrees, "white"],
    ] as const) {
      const half = ((degrees / 2) * Math.PI) / 180;
      for (const reach of [0.3, 0.6, 0.9, 1.2])
        if (
          canvas.label(
            name,
            origin.x + (radius + reach) * Math.cos(half),
            origin.y + (radius + reach) * Math.sin(half),
            {
              anchor: "center",
              color,
              visible: Anim.after(Teach.start(3) + 0.5),
              avoidStrokes: true,
            },
          )
        )
          break;
    }
  }
  canvas.axisTitles(frame, "Re", "Im");
  canvas.axisTicks(frame);
  canvas.recordSteps(Teach.boundaries(steps));
  const parameters: IllustrationParameter[] = [
    slider("re", "Re z", re, Math.min(-6, re), Math.max(6, re)),
    slider("im", "Im z", im, Math.min(-6, im), Math.max(6, im)),
  ];
  if (operation !== "polar")
    parameters.push(
      slider("re2", "Re w", w.re, Math.min(-6, w.re), Math.max(6, w.re)),
      slider("im2", "Im w", w.im, Math.min(-6, w.im), Math.max(6, w.im)),
    );
  return canvas.illustration(title, Anim.duration(Teach.finish(steps) + 0.6), parameters);
};

/** The first maths figures of batch 3, by premade type. */
export const analysisFigures: Record<string, Compiler> = { modulus, bolzano, sequenceTerms, argandPlane };
