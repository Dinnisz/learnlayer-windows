// Port of LearnLayer/Explanation/ExplanationScript.swift (`ExplanationScript.Graph`) and
// LearnLayer/Problems/VisualAid.swift (`FunctionPlot`) @ ref 2026-11-04

import { asciiSubscripts, evaluate, tryParseExpression, variables, type Expression } from "../math/expression";
import type { Part } from "../problems/problemSolution";
import type { SignTable } from "../problems/signTable";
import { FunctionGraph } from "./functionGraph";

/** A point on the curve, shown from `step` onward. */
export interface GraphMark {
  /** "value" for h(a) = …, "crossing" for where the curve meets the asked level. */
  role: string;
  x: number;
  y: number;
  label: string;
  /** 1-based card that uses this point. Null shows it with the curve. */
  step: number | null;
}

export interface GraphParameter {
  name: string;
  value: number;
  min: number;
  max: number;
}

/** The area under the curve between two x values; `to` can be dragged. */
export interface GraphArea {
  from: number;
  to: number;
  draggableBound: boolean;
}

/**
 * A curve y = f(x) the app draws and evaluates itself, from an expression the model writes (e.g. "A*sin(w*x + p)").
 * One parameter can be dragged, and an optional shaded area shows an integral.
 */
export interface Graph {
  xLabel: string;
  yLabel: string;
  /** The horizontal variable in `expression`, e.g. "x" or "t". */
  variable: string;
  expression: string;
  xMin: number;
  xMax: number;
  /** Values for every other name in the expression. */
  parameters: GraphParameter[];
  /** Name of the parameter the student drags, if any. */
  draggable: string | null;
  area: GraphArea | null;
  /** Show a car whose position follows y, for position-against-time graphs. */
  showsCar: boolean;
  /** Points the solution computes: an endpoint value, or where the curve meets the asked level. */
  marks: GraphMark[];
  /** The 1-based step that introduces the curve. Null shows it with every step. */
  curveStep: number | null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Reads both the current format and the earlier polynomial one (coefficients + one parameter). */
export function decodeGraph(value: unknown): Graph | null {
  if (!isObject(value)) return null;
  const { xLabel, yLabel, xMin, xMax } = value;
  if (typeof xLabel !== "string" || typeof yLabel !== "string" || !isNumber(xMin) || !isNumber(xMax)) return null;
  const showsCar = value.showsCar === true;
  const area =
    isObject(value.area) &&
    isNumber(value.area.from) &&
    isNumber(value.area.to) &&
    typeof value.area.draggableBound === "boolean"
      ? { from: value.area.from, to: value.area.to, draggableBound: value.area.draggableBound }
      : null;
  let marks: GraphMark[] = [];
  if (Array.isArray(value.marks)) {
    const decoded = value.marks.map((mark): GraphMark | null =>
      isObject(mark) &&
      typeof mark.role === "string" &&
      isNumber(mark.x) &&
      isNumber(mark.y) &&
      typeof mark.label === "string"
        ? {
            role: mark.role,
            x: mark.x,
            y: mark.y,
            label: mark.label,
            step: isNumber(mark.step) ? Math.trunc(mark.step) : null,
          }
        : null,
    );
    if (decoded.some((mark) => mark === null)) return null;
    marks = decoded as GraphMark[];
  }
  const curveStep = isNumber(value.curveStep) ? Math.trunc(value.curveStep) : null;
  const readParameter = (item: unknown): GraphParameter | null =>
    isObject(item) && typeof item.name === "string" && isNumber(item.value) && isNumber(item.min) && isNumber(item.max)
      ? { name: item.name, value: item.value, min: item.min, max: item.max }
      : null;
  if (typeof value.expression === "string") {
    let parameters: GraphParameter[] = [];
    if (Array.isArray(value.parameters)) {
      const decoded = value.parameters.map(readParameter);
      if (decoded.some((item) => item === null)) return null;
      parameters = decoded as GraphParameter[];
    }
    return {
      xLabel,
      yLabel,
      variable: typeof value.variable === "string" ? value.variable : "x",
      expression: value.expression,
      xMin,
      xMax,
      parameters,
      draggable: typeof value.draggable === "string" ? value.draggable : null,
      area,
      showsCar,
      marks,
      curveStep,
    };
  }
  if (!Array.isArray(value.coefficients) || !value.coefficients.every(isNumber)) return null;
  const legacy = isObject(value.parameter) ? value.parameter : null;
  const coefficientIndex = legacy && isNumber(legacy.coefficientIndex) ? legacy.coefficientIndex : null;
  const terms = (value.coefficients as number[]).map((coefficient, power) => {
    const factor =
      legacy && coefficientIndex === power ? `${String(legacy.scale)}*${String(legacy.name)}` : `${coefficient}`;
    return power === 0 ? factor : `${factor}*x^${power}`;
  });
  const parameter = legacy ? readParameter(legacy) : null;
  return {
    xLabel,
    yLabel,
    variable: "x",
    expression: terms.join(" + "),
    xMin,
    xMax,
    parameters: parameter ? [parameter] : [],
    draggable: parameter ? parameter.name : null,
    area,
    showsCar,
    marks,
    curveStep,
  };
}

export const Graphs = {
  parsed(graph: Graph): Expression | null {
    return tryParseExpression(graph.expression);
  },

  draggableParameter(graph: Graph): GraphParameter | null {
    return graph.parameters.find((parameter) => parameter.name === graph.draggable) ?? null;
  },

  values(graph: Graph, overriding: number | null = null): Record<string, number> {
    const values: Record<string, number> = {};
    for (const parameter of graph.parameters) {
      const name = asciiSubscripts(parameter.name);
      if (!(name in values)) values[name] = parameter.value;
    }
    if (graph.draggable && overriding !== null) values[asciiSubscripts(graph.draggable)] = overriding;
    return values;
  },

  /**
   * Whether the curve breaks between two neighbouring samples (a jump, as E_z across a charged plane, or a pole
   * through infinity), so the pen lifts instead of drawing a false vertical line. The interval is halved towards the
   * steeper side: a steep but continuous curve shrinks its step as it is cut, a break keeps it. `tall` is the step, in
   * the curve's own units, that counts as a break (a quarter of the plot's height suits).
   */
  breaksBetween(curve: (x: number) => number, x0: number, x1: number, tall: number): boolean {
    let a = x0;
    let b = x1;
    let ya = curve(a);
    let yb = curve(b);
    if (!Number.isFinite(ya) || !Number.isFinite(yb)) return true;
    if (Math.abs(yb - ya) <= tall) return false;
    for (let cut = 0; cut < 24; cut++) {
      const m = (a + b) / 2;
      const ym = curve(m);
      if (!Number.isFinite(ym)) return true;
      if (Math.abs(ym - ya) >= Math.abs(yb - ym)) {
        b = m;
        yb = ym;
      } else {
        a = m;
        ya = ym;
      }
      if (Math.abs(yb - ya) <= tall / 4) return false;
    }
    return true;
  },

  y(graph: Graph, x: number, parameter: number | null = null, parsed: Expression | null = null): number {
    const expression = parsed ?? Graphs.parsed(graph);
    if (!expression) return NaN;
    const values = Graphs.values(graph, parameter);
    values[asciiSubscripts(graph.variable)] = x;
    return evaluate(expression, values);
  },

  /** Whether the curve can be drawn: it parses and has finite values. */
  isDrawable(graph: Graph): boolean {
    const known = new Set([...graph.parameters.map((p) => asciiSubscripts(p.name)), asciiSubscripts(graph.variable)]);
    const parsed = Graphs.parsed(graph);
    if (!(graph.xMax > graph.xMin) || !parsed || [...variables(parsed)].some((name) => !known.has(name))) return false;
    for (let index = 0; index <= 20; index++) {
      if (Number.isFinite(Graphs.y(graph, graph.xMin + ((graph.xMax - graph.xMin) * index) / 20, null, parsed)))
        return true;
    }
    return false;
  },

  /**
   * The y range over the domain and the whole range of the draggable parameter, so the axes stay put while the
   * student drags. Extremes that would flatten the curve the student sees are left outside the window.
   */
  yRange(graph: Graph): [number, number] {
    const parsed = Graphs.parsed(graph);
    if (!parsed) return [0, 1];
    const samples = (value: number | null) => {
      const ys: number[] = [];
      for (let step = 0; step <= 60; step++) {
        const y = Graphs.y(graph, graph.xMin + ((graph.xMax - graph.xMin) * step) / 60, value, parsed);
        if (Number.isFinite(y)) ys.push(y);
      }
      return ys;
    };
    const draggable = Graphs.draggableParameter(graph);
    const shown = samples(draggable?.value ?? null);
    const extremes: number[] = [];
    for (const value of draggable ? [draggable.min, draggable.max] : []) extremes.push(...samples(value));
    let low = 0;
    let high = 0;
    for (const y of [...shown, ...extremes]) {
      low = Math.min(low, y);
      high = Math.max(high, y);
    }
    if (shown.length > 0) {
      const curveLow = Math.min(...shown);
      const curveHigh = Math.max(...shown);
      const span = Math.max(curveHigh - curveLow, 1e-6);
      if (high - low > span / 0.35) {
        const pad = span * 0.45;
        low = Math.min(0, curveLow) - (curveLow < 0 ? pad : 0);
        high = curveHigh + pad;
        if (graph.showsCar) low = Math.min(low, 0);
      }
    }
    if (shown.length >= 8) {
      const sorted = [...shown].sort((a, b) => a - b);
      const clipLow = sorted[Math.trunc((sorted.length - 1) * 0.08)]!;
      const clipHigh = sorted[Math.trunc((sorted.length - 1) * 0.92)]!;
      const central = Math.max(clipHigh - clipLow, 1e-6);
      if (high - low > central * 4) {
        const markYs = graph.marks.map((mark) => mark.y).filter(Number.isFinite);
        low = Math.min(clipLow, markYs.length > 0 ? Math.min(...markYs) : clipLow);
        high = Math.max(clipHigh, markYs.length > 0 ? Math.max(...markYs) : clipHigh);
        if ((low < 0 && high > 0) || graph.marks.some((mark) => Math.abs(mark.y) < 1e-6)) {
          low = Math.min(low, 0);
          high = Math.max(high, 0);
        }
      }
    }
    const fitted = Graphs.fittedWindow(
      shown,
      graph.marks.map((mark) => mark.y),
    );
    if (fitted) return fitted;
    if (high - low < 1e-9) return [low, low + 1];
    const margin = (high - low) * 0.05;
    return [low - (low < 0 ? margin : 0), high + margin];
  },

  /** Endpoint marks and the crossing of zero stay on screen; a spike many times taller is left outside. */
  fittedWindow(samples: number[], markValues: number[]): [number, number] | null {
    const marks = markValues.filter(Number.isFinite);
    if (marks.length === 0) return null;
    const markLow = Math.min(...marks);
    const markHigh = Math.max(...marks);
    const markSpan = Math.max(markHigh - markLow, 1);
    const finite = samples.filter(Number.isFinite);
    const rawLow = finite.length > 0 ? Math.min(...finite) : markLow;
    const rawHigh = finite.length > 0 ? Math.max(...finite) : markHigh;
    if (!(rawHigh - rawLow > markSpan * 4)) return null;
    let low = Math.min(markLow, markHigh);
    let high = Math.max(markLow, markHigh);
    if (low < 0 || high > 0 || marks.some((mark) => Math.abs(mark) < 1e-9)) {
      low = Math.min(low, 0);
      high = Math.max(high, 0);
    }
    const near = finite.filter((y) => y >= low - markSpan && y <= high + markSpan);
    if (near.length > 0) {
      low = Math.min(low, Math.min(...near));
      high = Math.max(high, Math.max(...near));
    }
    if (high - low < 1e-6) high = low + 1;
    const pad = (high - low) * 0.08;
    return [low - pad, high + pad];
  },

  /** The window the marks actually use, when the given domain is many times wider. */
  fittedToMarks(graph: Graph): Graph {
    const copy = Graphs.withReadableCurve(graph);
    const xs = graph.marks.map((mark) => mark.x).filter(Number.isFinite);
    if (xs.length === 0) return copy;
    const low = Math.min(...xs);
    const high = Math.max(...xs);
    if (!(high > low)) return copy;
    const span = high - low;
    if (!(copy.xMax - copy.xMin > span * 3)) return copy;
    const pad = Math.max(0.15, span * 0.12);
    return { ...copy, xMin: low - pad, xMax: high + pad };
  },

  /** A longer time axis when the given window keeps a position-against-time curve in a stub at the origin. */
  withReadableCurve(graph: Graph): Graph {
    const [xMin, xMax] = readableTimeDomain(graph);
    return { ...graph, xMin, xMax };
  },

  /** The value of the draggable parameter that makes the curve pass closest to (x, y), found numerically. */
  parameterValue(graph: Graph, x: number, target: number): number | null {
    const parameter = Graphs.draggableParameter(graph);
    const parsed = Graphs.parsed(graph);
    if (!parameter || !parsed) return null;
    const miss = (value: number) => {
      const y = Graphs.y(graph, x, value, parsed);
      return Number.isFinite(y) ? Math.abs(y - target) : Infinity;
    };
    let best = parameter.value;
    let bestMiss = Infinity;
    for (let step = 0; step <= 200; step++) {
      const value = parameter.min + ((parameter.max - parameter.min) * step) / 200;
      const m = miss(value);
      if (m < bestMiss) {
        best = value;
        bestMiss = m;
      }
    }
    const width = (parameter.max - parameter.min) / 200;
    let low = Math.max(parameter.min, best - width);
    let high = Math.min(parameter.max, best + width);
    for (let index = 0; index < 30; index++) {
      const a = low + (high - low) / 3;
      const b = high - (high - low) / 3;
      if (miss(a) < miss(b)) high = b;
      else low = a;
    }
    return (low + high) / 2;
  },

  /** ∫ y dx from `from` to `to`, by Simpson's rule. */
  integral(graph: Graph, a: number, b: number, parameter: number | null = null): number {
    const parsed = Graphs.parsed(graph);
    if (!parsed) return NaN;
    const n = 200;
    const h = (b - a) / n;
    let sum = Graphs.y(graph, a, parameter, parsed) + Graphs.y(graph, b, parameter, parsed);
    for (let i = 1; i < n; i++) sum += (i % 2 === 0 ? 2 : 4) * Graphs.y(graph, a + i * h, parameter, parsed);
    return (sum * h) / 3;
  },
};

function readableTimeDomain(graph: Graph): [number, number] {
  const { xMin, xMax } = graph;
  if (!(graph.showsCar || graph.variable === "t") || !(xMax > xMin) || !Graphs.parsed(graph)) return [xMin, xMax];
  const parameter = Graphs.draggableParameter(graph)?.value ?? null;
  const travel = (high: number) => {
    const start = Graphs.y(graph, xMin, parameter);
    let peak = 0;
    for (let step = 1; step <= 30; step++) {
      const x = xMin + ((high - xMin) * step) / 30;
      const value = Graphs.y(graph, x, parameter);
      if (Number.isFinite(value) && Number.isFinite(start)) peak = Math.max(peak, Math.abs(value - start));
    }
    return peak;
  };
  const given = travel(xMax);
  if (xMax - xMin >= 3 && given >= 1) return [xMin, xMax];
  let high = Math.max(xMax, xMin + 3);
  for (let index = 0; index < 8; index++) {
    const moved = travel(high);
    if (moved >= Math.max(2, given * 3) && high - xMin >= 3) return [xMin, high];
    const next = xMin + (high - xMin) * 1.5;
    if (next - xMin > 24) return [xMin, next];
    high = next;
  }
  return [xMin, high];
}

/**
 * A function exercise, plotted by the app from the formulas in the question or the solution, when the solution
 * itself shows no curve.
 */
export const FunctionPlot = {
  /** The curve for this part, or null when the subject is not a function study or nothing can be plotted. */
  graph(question: string, subject: string | null, part: Part | null, model: Graph | null = null): Graph | null {
    if (!FunctionGraph.accepts(subject)) return null;
    if (part?.continuity) return null;
    const seeded = FunctionGraph.seeding(FunctionGraph.pieces(question, part), model);
    const spec = FunctionGraph.spec(seeded);
    if (spec) {
      const made = FunctionPlot.make(
        spec.expression,
        spec.variable,
        spec.xMin,
        spec.xMax,
        spec.variable,
        `${spec.name}(${spec.variable})`,
        spec.marks,
        spec.curveStep,
      );
      return made ? Graphs.fittedToMarks(made) : null;
    }
    const table = part?.signTable;
    if (table) {
      const row = tableExpression(table);
      if (row) return FunctionPlot.make(row.expression, row.variable, row.xMin, row.xMax);
    }
    const expression = part?.answer.expression;
    if (expression) {
      const parsed = tryParseExpression(expression);
      const names = parsed ? [...variables(parsed)] : [];
      if (parsed && names.length === 1) {
        const [low, high] = domain(question, part?.signTable ?? null);
        return FunctionPlot.make(expression, names[0]!, low, high);
      }
    }
    return null;
  },

  make(
    expression: string,
    variable: string,
    xMin: number,
    xMax: number,
    xLabel: string | null = null,
    yLabel: string | null = null,
    marks: GraphMark[] = [],
    curveStep: number | null = null,
  ): Graph | null {
    if (!(xMax > xMin) || !Number.isFinite(xMin) || !Number.isFinite(xMax)) return null;
    const graph: Graph = {
      xLabel: xLabel ? xLabel : variable,
      yLabel: yLabel ? yLabel : "y",
      variable,
      expression,
      xMin,
      xMax,
      parameters: [],
      draggable: null,
      area: null,
      showsCar: false,
      marks,
      curveStep,
    };
    return Graphs.isDrawable(graph) ? graph : null;
  },

  /** Squares and minus signs as the plotter writes them. */
  asciiMath(text: string): string {
    let result = "";
    for (const character of text) {
      switch (character) {
        case "²":
          result += "^2";
          break;
        case "³":
          result += "^3";
          break;
        case "⁴":
          result += "^4";
          break;
        case "−":
        case "–":
        case "—":
          result += "-";
          break;
        case "×":
        case "·":
        case "⋅":
          result += "*";
          break;
        case " ":
          break;
        default:
          result += character;
      }
    }
    return result;
  },
};

/** The function's own row, not its derivative, when the table gives one. */
function tableExpression(
  table: SignTable,
): { expression: string; variable: string; xMin: number; xMax: number } | null {
  const isDerivative = (name: string) => name.includes("'") || name.includes("′");
  const variable = asciiSubscripts(table.variable);
  const chosen = table.rows.find((row) => {
    const expression = row.expression;
    if (!expression || isDerivative(row.name)) return false;
    const parsed = tryParseExpression(expression);
    if (!parsed || ![...variables(parsed)].every((name) => name === variable)) return false;
    return expression.replace(/ /g, "") !== variable;
  });
  if (!chosen?.expression) return null;
  const [low, high] = domain("", table);
  return { expression: chosen.expression, variable, xMin: low, xMax: high };
}

function domain(text: string, table: SignTable | null): [number, number] {
  const found = interval(text);
  if (found) return found;
  const values = (table?.points ?? []).map((point) => point.value).filter((value): value is number => isNumber(value));
  if (values.length > 0) {
    const low = Math.min(...values);
    const high = Math.max(...values);
    if (high - low < 1e-6) return [low - 4, high + 4];
    const pad = Math.max(1, (high - low) * 0.2);
    return [low - pad, high + pad];
  }
  return [-5, 5];
}

/** "[0, 4]" or "]-2; 5[" as the question writes the domain. */
function interval(text: string): [number, number] | null {
  const match = /[[\]]\s*(-?\d+(?:[.,]\d+)?)\s*[,;]\s*(-?\d+(?:[.,]\d+)?)\s*[[\]]/.exec(text);
  if (!match) return null;
  const low = Number(match[1]!.replace(",", "."));
  const high = Number(match[2]!.replace(",", "."));
  if (!(high > low)) return null;
  const pad = Math.max(0.5, (high - low) * 0.05);
  return [low - pad, high + pad];
}
