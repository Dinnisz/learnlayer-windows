// Port of LearnLayer/Problems/FunctionGraph.swift @ ref 2026-11-04

import { evaluate, tryParseExpression, variables } from "../math/expression";
import { latexToUnicode } from "../math/latexText";
import { formatG } from "../math/printf";
import type { Part } from "../problems/problemSolution";
import type { Graph, GraphMark } from "./graph";
import { CompiledIllustration, type Illustration } from "./illustration";
import { compileTemplate, escapeRegExp, type IllustrationTemplate } from "./illustrationTemplate";

/**
 * A curve for a function study, read from the formulas themselves. Bolzano, the intermediate-value theorem,
 * continuity, monotonicity, extrema, limits and roots are the same picture in every language: a function of one
 * variable, values at the ends of an interval, and a level the curve crosses.
 */
export interface Piece {
  text: string;
  /** 1-based card, when this text is one step. Null is the question or the answer. */
  step: number | null;
}

export interface Spec {
  name: string;
  expression: string;
  variable: string;
  xMin: number;
  xMax: number;
  marks: GraphMark[];
  curveStep: number | null;
}

interface Definition {
  name: string;
  variable: string;
  expression: string;
  step: number | null;
}

interface Sample {
  x: number;
  y: number;
  label: string;
  step: number | null;
  comparedTo: number | null;
  above: boolean | null;
}

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .normalize("NFC")
    .toLowerCase();

/** `trimmingCharacters(in: .whitespaces)`: spaces and tabs, not newlines. */
const trimSpaces = (text: string) => text.replace(/^[\p{Zs}\t]+|[\p{Zs}\t]+$/gu, "");

const finite = (value: number) => (Number.isFinite(value) ? value : null);

function value(expression: string, variable: string, x: number): number | null {
  const parsed = tryParseExpression(expression);
  return parsed ? finite(evaluate(parsed, { [variable]: x })) : null;
}

const hasOnly = (expression: string, variable: string) => {
  const parsed = tryParseExpression(expression);
  if (!parsed) return false;
  const names = variables(parsed);
  return names.size === 1 && names.has(variable);
};

function flatten(text: string): string {
  let result = text;
  for (const token of ["\\left", "\\right", "\\,", "\\;", "\\!", "\\ "]) result = result.split(token).join("");
  result = result.replace(/\\color\{[^{}]*\}/g, "");
  return result.replace(/−/g, "-").replace(/–/g, "-");
}

const superscripts: Record<string, string> = {
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

/** Squares and minus signs as the plotter writes them (`FunctionPlot.asciiMath`). */
function asciiMath(text: string): string {
  let result = "";
  for (const character of text) {
    if (character === "²") result += "^2";
    else if (character === "³") result += "^3";
    else if (character === "⁴") result += "^4";
    else if (character === "−" || character === "–" || character === "—") result += "-";
    else if (character === "×" || character === "·" || character === "⋅") result += "*";
    else if (character !== " ") result += character;
  }
  return result;
}

function formulaASCII(input: string): string {
  let text = flatten(input);
  let expanded = "";
  for (const character of text) expanded += superscripts[character] ? "^" + superscripts[character] : character;
  text = expanded;
  text = text.replace(/e\s*\^\s*\{([^{}]*)\}/g, "exp($1)");
  text = text.replace(/e\s*\^\s*(\d+)/g, "exp($1)");
  text = text.replace(/\^\s*\{([^{}]*)\}/g, "^($1)");
  const frac = /\\(?:tfrac|dfrac|frac)\s*\{([^{}]+)\}\{([^{}]+)\}/;
  for (let match = frac.exec(text); match; match = frac.exec(text))
    text = text.slice(0, match.index) + `(${match[1]})/(${match[2]})` + text.slice(match.index + match[0].length);
  for (const [from, to] of [
    ["\\cdot", "*"],
    ["\\times", "*"],
    ["\\ln", "ln"],
    ["\\log", "log"],
    ["\\sin", "sin"],
    ["\\cos", "cos"],
    ["\\exp", "exp"],
    ["\\sqrt", "sqrt"],
  ] as const)
    text = text.split(from).join(to);
  text = text.replace(/\\[A-Za-z]+/g, "");
  text = text.replace(/(\d),(\d)/g, "$1.$2");
  return asciiMath(text);
}

/** The value as the solution writes it, in the characters a label draws: `\frac{5}{2}` is `5/2`. */
function display(text: string): string {
  return trimSpaces(latexToUnicode(flatten(text)));
}

function cut(input: string): string {
  let raw = trimSpaces(input);
  for (const name of [
    "exp",
    "sin",
    "cos",
    "tan",
    "ln",
    "log",
    "sqrt",
    "abs",
    "sinh",
    "cosh",
    "tanh",
    "asin",
    "acos",
    "atan",
    "floor",
    "sign",
  ])
    raw = raw.split(` ${name}`).join(name);
  const stop = raw.search(/\\(?:quad|iff|text|implies)|\\\\|\s+[A-Za-zÀ-ÿ]{2,}/);
  if (stop >= 0) raw = raw.slice(0, stop);
  while (raw.length > 0 && ".,;".includes(raw[raw.length - 1]!)) raw = raw.slice(0, -1);
  return trimSpaces(raw);
}

function format(number: number): string {
  if (Math.abs(number) < 1e-9) return "0";
  if (Math.abs(number - Math.round(number)) < 1e-9) return String(Math.round(number));
  return formatG(number);
}

const parseNumber = (text: string) => Number(text.replace(",", "."));

function evaluations(name: string, pieces: readonly Piece[]): Sample[] {
  const pattern = new RegExp(
    `(?<![A-Za-z])${escapeRegExp(name)}\\s*\\(\\s*(-?\\d+(?:[.,]\\d+)?)\\s*\\)\\s*=\\s*((?:\\\\.|[^\\n;<>])+)`,
    "g",
  );
  const samples: Sample[] = [];
  for (const piece of pieces) {
    for (const match of piece.text.matchAll(pattern)) {
      const x = parseNumber(match[1]!);
      if (!Number.isFinite(x)) continue;
      const raw = cut(match[2]!);
      const parsed = tryParseExpression(formulaASCII(raw));
      if (!parsed || variables(parsed).size > 0) continue;
      const y = finite(evaluate(parsed, {}));
      if (y === null) continue;
      const found = relation(match.index! + match[0].length, piece.text);
      const sign = found ? ` ${found.symbol} ${format(found.level)}` : y > 0 ? " > 0" : y < 0 ? " < 0" : " = 0";
      const label = `${name}(${display(match[1]!)}) = ${display(raw)}` + sign;
      samples.push({
        x,
        y,
        label,
        step: piece.step,
        comparedTo: found?.level ?? null,
        above: found ? found.above : null,
      });
    }
  }
  const unique: Sample[] = [];
  for (const sample of samples) if (!unique.some((other) => Math.abs(other.x - sample.x) < 1e-9)) unique.push(sample);
  return unique;
}

/** The inequality written just after the value: `> 0`, `< 0`, `\geq 3`. */
function relation(start: number, text: string): { above: boolean; level: number; symbol: string } | null {
  if (start >= text.length) return null;
  const tail = text.slice(start);
  const found = /^(\s*(?:\\(?:geq|ge|leq|le|gt|lt)|>=|<=|>|<)\s*)(-?\d+(?:[.,]\d+)?)/.exec(tail);
  if (!found) return null;
  const level = parseNumber(found[2]!);
  if (!Number.isFinite(level)) return null;
  const symbol = trimSpaces(found[1]!.replace(/\\/g, ""));
  const above = [">", ">=", "gt", "geq", "ge"].includes(symbol);
  const inclusive = symbol.includes("=") || ["geq", "ge", "leq", "le"].includes(symbol);
  const written = above ? (inclusive ? "≥" : ">") : inclusive ? "≤" : "<";
  return { above, level, symbol: written };
}

function definitions(pieces: readonly Piece[]): Definition | null {
  const pattern = /(?<![A-Za-z])([A-Za-z])\s*\(\s*([A-Za-z])\s*\)\s*=\s*((?:\\.|[^\n;<>])+)/g;
  const found: Definition[] = [];
  for (const piece of pieces) {
    for (const match of piece.text.matchAll(pattern)) {
      const variable = match[2]!.toLowerCase();
      const ascii = formulaASCII(cut(match[3]!));
      if (!hasOnly(ascii, variable)) continue;
      found.push({ name: match[1]!, variable, expression: ascii, step: piece.step });
    }
  }
  const summed = sums(found, pieces);
  const summedNames = new Set(summed.map((item) => item.name));
  found.push(...summed);
  const scored = found.map((item) => [item, evaluations(item.name, pieces).length] as const);
  const before = (lhs: readonly [Definition, number], rhs: readonly [Definition, number]) => {
    const leftSum = summedNames.has(lhs[0].name) && changesSign(lhs[0], pieces);
    const rightSum = summedNames.has(rhs[0].name) && changesSign(rhs[0], pieces);
    if (leftSum !== rightSum) return rightSum;
    if (lhs[1] !== rhs[1]) return lhs[1] < rhs[1];
    return lhs[0].expression.length < rhs[0].expression.length;
  };
  let best: readonly [Definition, number] | null = null;
  for (const item of scored) if (!best || before(best, item)) best = item;
  return best?.[0] ?? null;
}

/** `g(x) = f(x) + x` once `f` has a closed form in the same text. */
function sums(bases: readonly Definition[], pieces: readonly Piece[]): Definition[] {
  const pattern =
    /(?<![A-Za-z])([A-Za-z])\s*\(\s*([A-Za-z])\s*\)\s*=\s*([A-Za-z])\s*\(\s*\2\s*\)\s*([+-])\s*([^;\n<>=]+)/g;
  const found: Definition[] = [];
  for (const piece of pieces) {
    for (const match of piece.text.matchAll(pattern)) {
      const name = match[1]!;
      const variable = match[2]!.toLowerCase();
      const base = match[3]!;
      if (name === base) continue;
      const term = formulaASCII(cut(match[5]!));
      for (const baseDefinition of bases.filter((item) => item.name === base && item.variable === variable)) {
        const ascii = `(${baseDefinition.expression})${match[4]}(${term})`;
        if (!hasOnly(ascii, variable)) continue;
        const built = { name, variable, expression: ascii, step: piece.step };
        if (!agreesWithEndpoints(built, pieces)) continue;
        found.push(built);
      }
    }
  }
  return found;
}

/** The written endpoints, not the curve: a sum that is identically zero against g(−1) = 5/2 is the wrong f. */
function agreesWithEndpoints(definition: Definition, pieces: readonly Piece[]): boolean {
  const samples = evaluations(definition.name, pieces);
  if (samples.length < 2) return true;
  for (const sample of samples) {
    const y = value(definition.expression, definition.variable, sample.x);
    if (y === null) return false;
    const tolerance = Math.max(0.15 * Math.max(Math.abs(sample.y), 1), 0.2);
    if (Math.abs(y - sample.y) > tolerance) return false;
  }
  return true;
}

function changesSign(definition: Definition, pieces: readonly Piece[]): boolean {
  const samples = evaluations(definition.name, pieces);
  return samples.some((sample) => sample.y > 0) && samples.some((sample) => sample.y < 0);
}

function levelPattern(name: string) {
  return new RegExp(`(?<![A-Za-z])${escapeRegExp(name)}\\s*\\(\\s*[A-Za-z]\\s*\\)\\s*=\\s*(-?\\d+(?:[.,]\\d+)?)\\b`);
}

/** `h(c) = 0` or `h(x) = 3`: a constant the solution says the function equals. */
function statedLevel(name: string, pieces: readonly Piece[]): number | null {
  const pattern = levelPattern(name);
  for (const piece of pieces) {
    const match = pattern.exec(piece.text);
    if (!match) continue;
    const level = parseNumber(match[1]!);
    if (Number.isFinite(level)) return level;
  }
  return null;
}

/** The step that says the function equals the level inside the interval, not an endpoint value. */
function levelStep(name: string, level: number, pieces: readonly Piece[]): number | null {
  const pattern = levelPattern(name);
  let step: number | null = null;
  for (const piece of pieces) {
    const match = pattern.exec(piece.text);
    if (!match) continue;
    const found = parseNumber(match[1]!);
    if (!Number.isFinite(found) || Math.abs(found - level) >= 1e-6) continue;
    if (piece.step !== null) step = piece.step;
  }
  return step;
}

function targetLevel(samples: readonly Sample[], name: string, pieces: readonly Piece[]): number {
  const compared = samples.map((sample) => sample.comparedTo).filter((level): level is number => level !== null);
  const first = compared[0];
  if (
    first !== undefined &&
    compared.every((level) => Math.abs(level - first) < 1e-9) &&
    samples.some((sample) => sample.above === true) &&
    samples.some((sample) => sample.above === false)
  )
    return first;
  if (samples.some((sample) => sample.y > 0) && samples.some((sample) => sample.y < 0)) return 0;
  return statedLevel(name, pieces) ?? 0;
}

function root(
  expression: string,
  variable: string,
  low: number,
  high: number,
  level: number,
  left: number,
  right: number,
): number | null {
  if (!((left - level) * (right - level) < 0)) return null;
  let a = low;
  let b = high;
  let fa = left - level;
  for (let index = 0; index < 60; index++) {
    const mid = (a + b) / 2;
    const y = value(expression, variable, mid);
    if (y === null) return null;
    const fm = y - level;
    if (Math.abs(fm) < 1e-7 || Math.abs(b - a) < 1e-6) return mid;
    if (fa * fm <= 0) b = mid;
    else {
      a = mid;
      fa = fm;
    }
  }
  return (a + b) / 2;
}

/** "[0, 4]", "]-2; 5[", and "0 ≤ x ≤ 4" ("0 <= x <= 4", "0 \le x \le 4") as a question writes them. */
export function intervals(text: string): [number, number][] {
  const normalised = text.replace(/−/g, "-").replace(/–/g, "-");
  const pattern = /[[\](]\s*(-?\d+(?:[.,]\d+)?)\s*[,;]\s*(-?\d+(?:[.,]\d+)?)\s*[[\])]/g;
  return [...pairs(normalised, pattern), ...chainedIntervals(normalised)];
}

/**
 * "a ≤ x ≤ b" (or with <, <=, ⩽, \le, \leq, \lt): the interval between the bounds
 * (`FunctionGraph.chainedIntervals` @ 5701363).
 */
export function chainedIntervals(text: string): [number, number][] {
  const below = String.raw`(?:<=|≤|⩽|<|\\leqslant|\\leq|\\le|\\lt)`;
  const number = String.raw`(-?\d+(?:[.,]\d+)?)`;
  return pairs(
    text,
    new RegExp(number + String.raw`\s*` + below + String.raw`\s*[A-Za-z]\s*` + below + String.raw`\s*` + number, "g"),
  );
}

function pairs(text: string, pattern: RegExp): [number, number][] {
  const result: [number, number][] = [];
  for (const match of text.matchAll(pattern)) {
    const low = parseNumber(match[1]!);
    const high = parseNumber(match[2]!);
    if (Number.isFinite(low) && Number.isFinite(high)) result.push([low, high]);
  }
  return result;
}

const shortest = (list: [number, number][]) =>
  list.reduce<[number, number] | null>(
    (best, item) => (!best || item[1] - item[0] < best[1] - best[0] ? item : best),
    null,
  );

function domain(text: string, xs: readonly number[]): [number, number] {
  const finiteIntervals = intervals(text).filter(([low, high]) => high > low && high - low < 1e6);
  const covering = finiteIntervals.filter(([low, high]) => xs.every((x) => x >= low - 1e-6 && x <= high + 1e-6));
  const chosen = shortest(covering.length === 0 ? finiteIntervals : covering);
  if (chosen) {
    const pad = Math.max(0.25, (chosen[1] - chosen[0]) * 0.05);
    return [chosen[0] - pad, chosen[1] + pad];
  }
  if (xs.length > 0) {
    const low = Math.min(...xs);
    const high = Math.max(...xs);
    if (high > low) {
      const pad = Math.max(0.25, (high - low) * 0.15);
      return [low - pad, high + pad];
    }
  }
  return [-5, 5];
}

function crossing(
  expression: string,
  variable: string,
  name: string,
  samples: readonly Sample[],
  pieces: readonly Piece[],
): GraphMark | null {
  if (samples.length < 2) return crossingOnTheInterval(expression, variable, name, pieces);
  const level = targetLevel(samples, name, pieces);
  const ordered = [...samples].sort((a, b) => a.x - b.x);
  const left = ordered[0]!;
  const right = ordered[ordered.length - 1]!;
  if (!(right.x > left.x)) return null;
  const leftValue = value(expression, variable, left.x) ?? left.y;
  const rightValue = value(expression, variable, right.x) ?? right.y;
  const found = root(expression, variable, left.x, right.x, level, leftValue, rightValue);
  if (found === null) return null;
  return {
    role: "crossing",
    x: found,
    y: level,
    label: `${name} = ${format(level)}`,
    step: levelStep(name, level, pieces),
  };
}

function crossingOnTheInterval(
  expression: string,
  variable: string,
  name: string,
  pieces: readonly Piece[],
): GraphMark | null {
  const level = statedLevel(name, pieces);
  if (level === null) return null;
  const text = pieces.map((piece) => piece.text).join("\n");
  const chosen = shortest(intervals(text).filter(([low, high]) => high > low));
  if (!chosen) return null;
  const left = value(expression, variable, chosen[0]);
  const right = value(expression, variable, chosen[1]);
  if (left === null || right === null) return null;
  const found = root(expression, variable, chosen[0], chosen[1], level, left, right);
  if (found === null) return null;
  return {
    role: "crossing",
    x: found,
    y: level,
    label: `${name} = ${format(level)}`,
    step: levelStep(name, level, pieces),
  };
}

export const FunctionGraph = {
  /** Physics, chemistry and text subjects are not a function graph. An empty subject is decided by the formulas. */
  accepts(subject: string | null | undefined): boolean {
    const folded = fold(subject ?? "");
    if (folded === "") return true;
    const blocked = [
      "fisic",
      "physic",
      "quimic",
      "chemi",
      "biolog",
      "geolog",
      "histor",
      "filosof",
      "philosoph",
      "portugu",
      "literat",
      "geograf",
      "geograph",
      "econom",
    ];
    return !blocked.some((word) => folded.includes(word));
  },

  /** The curve, the endpoint values and the crossing, or null when the text has no plottable function. */
  spec(pieces: readonly Piece[]): Spec | null {
    const flat = pieces.map((piece) => ({ text: flatten(piece.text), step: piece.step }));
    const definition = definitions(flat);
    if (!definition) return null;
    const samples = evaluations(definition.name, flat);
    const window = domain(
      flat.map((piece) => piece.text).join("\n"),
      samples.map((sample) => sample.x),
    );
    const marks: GraphMark[] = samples.map((sample) => ({
      role: "value",
      x: sample.x,
      y: value(definition.expression, definition.variable, sample.x) ?? sample.y,
      label: sample.label,
      step: sample.step,
    }));
    const crossed = crossing(definition.expression, definition.variable, definition.name, samples, flat);
    if (crossed) marks.push(crossed);
    return {
      name: definition.name,
      expression: definition.expression,
      variable: definition.variable,
      xMin: window[0],
      xMax: window[1],
      marks,
      curveStep: definition.step,
    };
  },

  /** The question and one part, in the order a curve is read from them. */
  pieces(question: string, part: Part | null | undefined): Piece[] {
    const pieces: Piece[] = [{ text: question, step: null }];
    if (!part) return pieces;
    for (const text of [
      part.asks,
      part.topic ?? "",
      part.hint,
      part.answer.text,
      part.answerLatex ?? "",
      ...part.steps,
    ])
      pieces.push({ text, step: null });
    (part.cards ?? []).forEach((card, index) =>
      pieces.push({ text: [card.title, card.note ?? "", card.latex].join("\n"), step: index + 1 }),
    );
    return pieces;
  },

  /**
   * The curve of a sign-changing auxiliary function, laid out by the app. Null when the closed form does not meet
   * the written endpoints, so a picture of the zero line is not offered in place of g.
   */
  illustration(question: string, part: Part, model: Graph | null, language: string): Illustration | null {
    const seeded = FunctionGraph.seeding(FunctionGraph.pieces(question, part), model);
    const spec = FunctionGraph.spec(seeded);
    if (!spec) return null;
    const values = spec.marks.filter((mark) => mark.role === "value");
    if (!values.some((mark) => mark.y > 0) || !values.some((mark) => mark.y < 0)) return null;
    const template: IllustrationTemplate = {
      kind: "function",
      f: spec.expression,
      xMin: spec.xMin,
      xMax: spec.xMax,
      marks: values.map((mark) => ({ x: format(mark.x), text: mark.label })),
    };
    const built = compileTemplate(template, language);
    if (built.elements.length === 0) return null;
    const scene: Illustration = {
      title: spec.name,
      width: 10,
      height: 6,
      parameters: built.parameters,
      elements: built.elements,
      template,
    };
    return new CompiledIllustration(scene).isDrawable ? scene : null;
  },

  /** The model's curve, named by its y label, so `g(x) = f(x) + x` can use that f. */
  seeding(pieces: Piece[], graph: Graph | null): Piece[] {
    if (!graph) return pieces;
    const name = FunctionGraph.plottedName(graph.yLabel);
    if (!name || !hasOnly(graph.expression, graph.variable)) return pieces;
    return [...pieces, { text: `${name}(${graph.variable})=${graph.expression}`, step: null }];
  },

  /** "f(x)" or "f" — the function a graph's vertical axis names. */
  plottedName(label: string): string | null {
    const match = /^([A-Za-z])(?:\s*\(\s*[A-Za-z]\s*\))?$/.exec(trimSpaces(label));
    return match ? match[1]! : null;
  },

  formulaASCII,
};
