// Port of LearnLayer/Problems/GraphRelevance.swift @ ref 2026-11-04

import type { Part } from "../problems/problemSolution";
import { FunctionGraph } from "./functionGraph";
import { FunctionPlot, Graphs, type Graph, type GraphMark } from "./graph";
import { swiftDouble } from "./illustration";

/**
 * Whether a curve explains this part. A proof by induction or a sum over the naturals is not a continuous curve, so
 * any curve there is decoration. A derivative's sign or a limit is the shape of a curve, so when no formula can be
 * plotted the app sketches that shape itself.
 */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .normalize("NFC")
    .toLowerCase();

const trimSpaces = (text: string) => text.replace(/^[\p{Zs}\t]+|[\p{Zs}\t]+$/gu, "");

function flatten(text: string): string {
  let result = text;
  for (const token of ["\\left", "\\right", "\\,", "\\;", "\\!", "\\ ", "\\displaystyle", "\\limits", "$"])
    result = result.split(token).join("");
  result = result.split("^{\\prime}").join("'").split("\\prime").join("'");
  return result.replace(/−/g, "-").replace(/–/g, "-");
}

/** Capture groups of the first match; a group that did not take part is null. */
function firstMatch(pattern: RegExp, text: string): (string | null)[] | null {
  const match = pattern.exec(text);
  return match ? [...match].map((group) => group ?? null) : null;
}

const explainsShape = (folded: string) => folded.includes("lim") || /[a-z]\s*['′]/.test(folded);
const isInfinite = (text: string) => text.includes("∞") || text.includes("infty") || text.includes("infinity");

interface DerivativeSign {
  name: string;
  argument: string | null;
  falls: boolean;
}

function derivativeSign(text: string): DerivativeSign | null {
  const pattern =
    /(?<![A-Za-z])([a-zA-Z])\s*['′](?!['′])\s*(?:\(\s*([^()]{1,6}?)\s*\))?\s*(<|>|≤|≥|\\lt|\\gt|\\leq?|\\geq?)\s*0(?!\d|[.,]\d)/u;
  const match = firstMatch(pattern, text);
  if (!match || !match[1] || !match[3]) return null;
  const sign = match[3];
  const falls = sign.includes("<") || sign.includes("≤") || sign.includes("lt") || sign.includes("le");
  return { name: match[1], argument: match[2] ?? null, falls };
}

function derivativeSketch(text: string): Graph | null {
  const sign = derivativeSign(text);
  if (!sign) return null;
  const argument = sign.argument;
  const point =
    argument !== null && [...argument].length <= 3 && argument !== "x" && argument !== "t" ? argument : null;
  const variable = argument === "t" ? "t" : "x";
  const center = 2.5;
  const delta = 0.9;
  const expression = sign.falls ? "3 - 0.8*(x-2.5) - 0.06*(x-2.5)^3" : "3 + 0.8*(x-2.5) + 0.06*(x-2.5)^3";
  let marks: GraphMark[] = [];
  if (point) {
    const slope = sign.falls ? -1 : 1;
    const y = (offset: number) => 3 + slope * (0.8 * offset + 0.06 * offset * offset * offset);
    marks = [
      { role: "value", x: center - delta, y: y(-delta), label: `${point} − δ`, step: null },
      { role: "crossing", x: center, y: 0, label: point, step: null },
      { role: "value", x: center + delta, y: y(delta), label: `${point} + δ`, step: null },
    ];
  }
  return FunctionPlot.make(expression, "x", 0, 5, variable, `${sign.name}(${variable})`, marks);
}

function limitSketch(text: string): Graph | null {
  const infinity = String.raw`[+-]?\s*(?:\\infty|∞|infinity)`;
  const pattern = new RegExp(
    String.raw`lim[\p{L}\p{N}_]*\s*_?\{?\s*([a-zA-Z])\s*(?:\\to|\\rightarrow|→|->)\s*(` +
      infinity +
      String.raw`|[^\s{}=]{1,8})\s*\}?\s*([a-zA-Z])?\s*(?:\([^()]{0,12}\))?\s*=\s*(` +
      infinity +
      String.raw`|[+-]?\d+(?:[.,]\d+)?)`,
    "u",
  );
  const match = firstMatch(pattern, text);
  if (!match || !match[1] || !match[2] || !match[4]) return null;
  const variable = match[1];
  const target = match[2];
  const result = match[4];
  const yLabel = `${match[3] ?? "f"}(${variable})`;
  if (isInfinite(result)) {
    const down = trimSpaces(result).startsWith("-");
    return FunctionPlot.make(down ? "-1/x^2" : "1/x^2", "x", -2.5, 2.5, variable, yLabel);
  }
  const level = Number(result.replace(",", "."));
  if (!isInfinite(target) || !Number.isFinite(level)) return null;
  const left = trimSpaces(target).startsWith("-");
  const expression = `${swiftDouble(level)} + 2/(1 + x^2)`;
  const [xMin, xMax] = left ? [-8, 0.5] : [-0.5, 8];
  const asymptoteX = left ? xMin + (xMax - xMin) * 0.25 : xMin + (xMax - xMin) * 0.75;
  const mark: GraphMark = { role: "crossing", x: asymptoteX, y: level, label: "y = " + trimSpaces(result), step: null };
  return FunctionPlot.make(expression, "x", xMin, xMax, variable, yLabel, [mark]);
}

export const GraphRelevance = {
  /** The text the decision reads: the item and the part, not the rest of the group. */
  text(question: string, part: Part | null | undefined): string {
    return FunctionGraph.pieces(question, part)
      .map((piece) => piece.text)
      .join("\n");
  },

  /** A curve here would only decorate: induction, or a sum or sequence over the naturals. */
  isDecorative(text: string): boolean {
    const folded = fold(text);
    if (
      ["inducao", "induction", "induktion", "induccion", "recurrence", "hereditar"].some((word) =>
        folded.includes(word),
      )
    )
      return true;
    const sum = folded.includes("\\sum") || folded.includes("∑") || folded.includes("somatorio");
    const naturals = folded.includes("ℕ") || folded.includes("\\mathbb{n}") || folded.includes("natural");
    return sum && naturals && !explainsShape(folded);
  },

  /** A schematic curve for a derivative's sign or a limit, when the part reasons about a shape it does not write. */
  sketch(text: string): Graph | null {
    const flat = flatten(text);
    return derivativeSketch(flat) ?? limitSketch(flat);
  },

  /** True when the part says the function falls ("g'(c) < 0"), false when it rises, null when it states no sign. */
  statedFall(text: string): boolean | null {
    return derivativeSign(flatten(text))?.falls ?? null;
  },

  /** Whether a curve goes the way the stated sign says: strictly, across the middle half of its window. */
  agrees(graph: Graph, falls: boolean): boolean {
    const parsed = Graphs.parsed(graph);
    if (!(graph.xMax > graph.xMin) || !parsed) return false;
    const span = graph.xMax - graph.xMin;
    const ys = Array.from({ length: 17 }, (_, index) =>
      Graphs.y(graph, graph.xMin + span * (0.25 + (0.5 * index) / 16), null, parsed),
    );
    if (!ys.every(Number.isFinite)) return false;
    const low = Math.min(...ys);
    const high = Math.max(...ys);
    if (!(high - low > 1e-9)) return false;
    const least = (high - low) * 0.005;
    return ys.slice(1).every((next, index) => (falls ? ys[index]! - next > least : next - ys[index]! > least));
  },
};
