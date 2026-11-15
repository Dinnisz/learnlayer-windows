// Port of LearnLayer/Illustrations/FigureTopic.swift (`ComplexFigure` and `TemplateBuilder.complexPower`) @ ref 2026-11-04

import type { Card } from "../problems/problemSolution";
import type { Illustration } from "./illustration";
import { TemplateBuilder, TemplateWords } from "./illustrationTemplate";

/** z and the power asked, drawn by the app from the solver's modulus and argument. */
export interface ComplexFigure {
  /** Its name in the exam ("z", "w"). */
  name: string | null;
  /** Its point's name in the figure ("P"), if the exam names one. */
  pointName: string | null;
  modulus: number;
  /** Radians. For a symbolic θ in a range, a value inside it. */
  argument: number;
  /** How the exam writes them ("1", "θ"), for the labels. */
  modulusText: string | null;
  argumentText: string | null;
  /** The power drawn (2 for z²). */
  power: number | null;
  /** The solver's own modulus and argument of zⁿ, checked against the app's. */
  resultModulus: number | null;
  resultArgument: number | null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const str = (value: unknown) => (typeof value === "string" ? value : null);

export function decodeComplexFigure(value: unknown): ComplexFigure | null {
  if (!isObject(value)) return null;
  const modulus = num(value.modulus);
  const argument = num(value.argument);
  if (modulus === null || argument === null) return null;
  const power = num(value.power);
  return {
    name: str(value.name),
    pointName: str(value.pointName),
    modulus,
    argument,
    modulusText: str(value.modulusText),
    argumentText: str(value.argumentText),
    power: power !== null && Number.isInteger(power) ? power : null,
    resultModulus: num(value.resultModulus),
    resultArgument: num(value.resultArgument),
  };
}

const close = (a: number, b: number) => Math.abs(a - b) <= 0.01 * Math.max(Math.abs(b), 1e-9);
const sameAngle = (a: number, b: number) => {
  const difference = (a - b) % (2 * Math.PI);
  return Math.min(Math.abs(difference), 2 * Math.PI - Math.abs(difference)) < 0.01;
};

export interface CheckedPower {
  x: number;
  y: number;
  modulus: number;
  argument: number;
}

export const ComplexFigures = {
  n(figure: ComplexFigure): number {
    return figure.power ?? 2;
  },

  /** zⁿ multiplied out, so |zⁿ| = |z|ⁿ and arg zⁿ = n·arg z are checked; null when anything is off. */
  checkedPower(figure: ComplexFigure): CheckedPower | null {
    const n = ComplexFigures.n(figure);
    const { modulus, argument } = figure;
    if (!(modulus > 0) || !Number.isFinite(modulus) || !Number.isFinite(argument) || n < 2 || n > 8) return null;
    const zx = modulus * Math.cos(argument);
    const zy = modulus * Math.sin(argument);
    let wx = zx;
    let wy = zy;
    for (let index = 1; index < n; index++) [wx, wy] = [wx * zx - wy * zy, wx * zy + wy * zx];
    const expectedModulus = modulus ** n;
    const expectedArgument = n * argument;
    if (!close(Math.sqrt(wx * wx + wy * wy), expectedModulus) || !sameAngle(Math.atan2(wy, wx), expectedArgument))
      return null;
    if (figure.resultModulus !== null && !close(figure.resultModulus, expectedModulus)) return null;
    if (figure.resultArgument !== null && !sameAngle(figure.resultArgument, expectedArgument)) return null;
    return { x: wx, y: wy, modulus: expectedModulus, argument: expectedArgument };
  },

  /** The drawing, its power shown from the step that first writes it; null when the numbers don't check out. */
  illustration(figure: ComplexFigure, cards: readonly Card[], title: string, language: string): Illustration | null {
    const power = ComplexFigures.checkedPower(figure);
    if (!power) return null;
    const builder = new TemplateBuilder(new TemplateWords(language));
    const n = ComplexFigures.n(figure);
    const name = figure.name ?? "z";
    const written = name + superscript(n);
    const forms = [`${name}^${n}`, `${name}^{${n}}`, written];
    const step = cards.findIndex((card) =>
      forms.some((form) => (card.latex + " " + (card.note ?? "")).replace(/ /g, "").includes(form)),
    );
    const visible = step >= 0 ? `step - ${step + 1} + 0.5` : "revealed";
    complexPower(builder, figure, power, written, visible);
    return { title, width: 10, height: 6, duration: null, parameters: [], elements: builder.elements };
  },
};

export function superscript(n: number): string {
  const digits = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  return [...String(n)].map((digit) => digits[Number(digit)] ?? "").join("");
}

/** z and zⁿ on the complex plane: the axes, the circles of their moduli near them, the argument arcs and both points. */
function complexPower(
  builder: TemplateBuilder,
  figure: ComplexFigure,
  power: CheckedPower,
  written: string,
  visible: string,
) {
  const n = TemplateBuilder.n;
  const words = builder.words;
  const r = figure.modulus;
  const theta = figure.argument;
  const z = { x: r * Math.cos(theta), y: r * Math.sin(theta) };
  const low = Math.min(0, theta, power.argument) - 0.25;
  const high = Math.max(theta, power.argument) + 0.25;
  const xs = [0, z.x, power.x];
  const ys = [0, z.y, power.y];
  for (const radius of [r, power.modulus]) {
    for (let index = 0; index <= 24; index++) {
      const angle = low + ((high - low) * index) / 24;
      xs.push(radius * Math.cos(angle));
      ys.push(radius * Math.sin(angle));
    }
  }
  const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 1e-6);
  const spanY = Math.max(Math.max(...ys) - Math.min(...ys), 1e-6);
  const minX = Math.min(...xs) - spanX * 0.12;
  const maxX = Math.max(...xs) + spanX * 0.12;
  const minY = Math.min(...ys) - spanY * 0.12;
  const maxY = Math.max(...ys) + spanY * 0.12;
  const k = Math.min((9.4 - 1.0) / (maxX - minX), (5.6 - 0.6) / (maxY - minY));
  const ox = 5.2 - ((minX + maxX) / 2) * k;
  const oy = 3.1 - ((minY + maxY) / 2) * k;
  const wx = (x: number) => ox + x * k;
  const wy = (y: number) => oy + y * k;
  builder.axis(wx(minX) - 0.1, oy, wx(maxX) + 0.3, oy, "Re");
  builder.axis(ox, wy(minY) - 0.1, ox, wy(maxY) + 0.3, "Im");
  builder.label(n(ox - 0.3), n(oy - 0.3), "O", { color: "muted", counted: false });
  const arc = (radius: number, color: string, dashed: boolean, from: number, to: number, shown: string | null = null) =>
    builder.elements.push({
      kind: "curve",
      color,
      dashed: dashed ? true : null,
      curveX: `${n(ox)} + ${n(radius * k)}*cos(s)`,
      curveY: `${n(oy)} + ${n(radius * k)}*sin(s)`,
      from: n(from),
      to: n(to),
      visible: shown,
    });
  arc(r, "muted", true, low, high);
  if (!(Math.abs(power.modulus - r) <= 0.02 * r)) arc(power.modulus, "muted", true, low, high, visible);
  const name = figure.name ?? "z";
  const pointText = figure.pointName !== null ? `${figure.pointName} (${name})` : name;
  builder.lineN(ox, oy, wx(z.x), wy(z.y), "white");
  builder.point(n(wx(z.x)), n(wy(z.y)), { text: pointText, color: "white" });
  const small = 0.55;
  const large = 0.95;
  arc(small / k, "white", false, 0, theta);
  const thetaText = figure.argumentText ?? words.number((theta * 180) / Math.PI) + "°";
  builder.label(n(ox + (small + 0.12) * Math.cos(theta / 2)), n(oy + (small + 0.12) * Math.sin(theta / 2)), thetaText);
  builder.line(n(ox), n(oy), n(wx(power.x)), n(wy(power.y)), "accent", false, visible);
  builder.point(n(wx(power.x)), n(wy(power.y)), { text: written, color: "accent", visible });
  arc(large / k, "accent", false, 0, power.argument, visible);
  const count = ComplexFigures.n(figure);
  const multiple =
    figure.argumentText !== null
      ? `${count}${figure.argumentText}`
      : words.number((power.argument * 180) / Math.PI) + "°";
  builder.label(
    n(ox + (large + 0.12) * Math.cos(power.argument / 2)),
    n(oy + (large + 0.12) * Math.sin(power.argument / 2)),
    multiple,
    { color: "accent", visible },
  );
  const modulusText = figure.modulusText ?? words.number(r);
  const raisedValue = TemplateBuilder.value(modulusText);
  const raised = raisedValue !== null ? words.number(raisedValue ** count) : `${modulusText}${superscript(count)}`;
  builder.label(n(wx(z.x) + 0.2), n(wy(z.y) - 0.35), `|${name}| = ${modulusText}`, { color: "muted" });
  builder.label(n(wx(power.x) + 0.2), n(wy(power.y) + 0.35), `|${written}| = ${raised}`, { color: "accent", visible });
}
