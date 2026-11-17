// Port of LearnLayer/Illustrations/PremadeFigureHeatingCurve.swift and `Teach` (PremadeFigureBatch3.swift) @ ref
// 2026-11-04: the heating curve of water, temperature against the energy supplied, with the warming stages
// (Q = m·c·ΔT) and the plateaus where it melts at 0 °C and boils at 100 °C (Q = m·L), every energy worked out by the app.

import { Anim, FigureCanvas, Params, PremadeFrame, slider, type AnimatedIllustration } from "./figureCanvas";

/** The teaching rhythm of the Batch 3 figures: step k starts at `first + gap·k`. */
export const Teach = {
  start(step: number, first = 0.4, gap = 2.1): number {
    return first + gap * step;
  },
  /** Step 0 is the page before anything is drawn; step k is complete `grow` seconds after it starts. */
  boundaries(steps: number, first = 0.4, gap = 2.1, grow = 0.9): number[] {
    return [
      0,
      ...Array.from({ length: steps }, (_, k) => Teach.start(k, first, gap) + Math.min(grow, gap - 0.05) + 0.05),
    ];
  },
  /** When the last of `steps` steps is complete. */
  finish(steps: number, first = 0.4, gap = 2.1, grow = 0.9): number {
    const all = Teach.boundaries(steps, first, gap, grow);
    return all[all.length - 1] ?? 0;
  },
};

export type HeatingKind = "ice" | "fusion" | "liquid" | "boiling" | "vapour";

/** One stretch of the curve: the substance warming in one state, or changing state at a fixed temperature. */
export interface HeatingStage {
  kind: HeatingKind;
  from: number;
  to: number;
  /** Energy in kJ. */
  energy: number;
}

const changesState = (stage: HeatingStage) => stage.kind === "fusion" || stage.kind === "boiling";

/** Water heated from `start` to `end` °C: the stages it goes through and the energy each takes. */
export class HeatingCurve {
  static readonly meltingPoint = 0;
  static readonly boilingPoint = 100;
  iceHeat = 2.1;
  waterHeat = 4.18;
  vapourHeat = 2.0;
  fusionHeat = 334;
  boilingHeat = 2260;

  constructor(
    /** Mass in g. */
    readonly mass: number,
    readonly start: number,
    readonly end: number,
  ) {}

  /** Energies are kJ from c in kJ/(kg·K) and L in kJ/kg. */
  get stages(): HeatingStage[] {
    const kilograms = this.mass / 1000;
    const list: HeatingStage[] = [];
    let at = this.start;
    const { meltingPoint, boilingPoint } = HeatingCurve;
    if (at < meltingPoint) {
      const to = Math.min(this.end, meltingPoint);
      list.push({ kind: "ice", from: at, to, energy: kilograms * this.iceHeat * (to - at) });
      at = to;
    }
    if (at === meltingPoint && this.end > meltingPoint && this.start < meltingPoint)
      list.push({ kind: "fusion", from: at, to: at, energy: kilograms * this.fusionHeat });
    if (at >= meltingPoint && at < boilingPoint && this.end > at) {
      const to = Math.min(this.end, boilingPoint);
      list.push({ kind: "liquid", from: at, to, energy: kilograms * this.waterHeat * (to - at) });
      at = to;
    }
    if (at === boilingPoint && this.end > boilingPoint && this.start < boilingPoint)
      list.push({ kind: "boiling", from: at, to: at, energy: kilograms * this.boilingHeat });
    if (at >= boilingPoint && this.end > at)
      list.push({ kind: "vapour", from: at, to: this.end, energy: kilograms * this.vapourHeat * (this.end - at) });
    return list;
  }

  get totalEnergy(): number {
    return this.stages.reduce((sum, stage) => sum + stage.energy, 0);
  }
}

export function heatingCurve(params: Params): HeatingCurve | null {
  const mass = params.number("m");
  const end = params.number("T1") ?? params.number("Tf") ?? params.number("end");
  if (mass === null || end === null) return null;
  // A temperature that is written but is not a number is a mistake, not a reason to guess.
  for (const key of ["T0", "Ti", "start"]) if (params.has(key) && params.number(key) === null) return null;
  const start = params.number("T0") ?? params.number("Ti") ?? params.number("start") ?? -20;
  if (mass < 1 || mass > 10_000 || start < -100 || start > 150 || end < -50 || end > 300 || !(end > start)) return null;
  const curve = new HeatingCurve(mass, start, end);
  const constants: [string, "iceHeat" | "waterHeat" | "vapourHeat" | "fusionHeat" | "boilingHeat"][] = [
    ["cIce", "iceHeat"],
    ["cWater", "waterHeat"],
    ["cVapour", "vapourHeat"],
    ["Lf", "fusionHeat"],
    ["Lv", "boilingHeat"],
  ];
  for (const [key, keep] of constants)
    if (params.has(key)) {
      const value = params.number(key);
      if (value === null || value < 0.1 || value > 10_000) return null;
      curve[keep] = value;
    }
  return curve.stages.length === 0 ? null : curve;
}

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

const heatingCurveFigure: Compiler = (params, title, language) => {
  const curve = heatingCurve(params);
  if (!curve) return null;
  const stages = curve.stages;
  const canvas = new FigureCanvas(language);
  const n = (value: number) => canvas.number(value, 3);
  const degrees = (value: number) => n(value) + " °C";

  // The horizontal extent of each stage is not to scale (a state change would swallow the rest): each gets a share of
  // the axis, leaning on its energy.
  const total = Math.max(curve.totalEnergy, 1e-9);
  const weights = stages.map((stage) => (0.5 * stage.energy) / total + 0.5 / stages.length);
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  const edges = [0];
  for (const weight of weights) edges.push(edges[edges.length - 1]! + weight / weightSum);
  const span = curve.end - curve.start;
  const frame = new PremadeFrame(0, 1, curve.start - 0.1 * span, curve.end + 0.1 * span, 1.7, 8.9, 1.5, 4.65);

  // Words: what the figure is, then one line per stage.
  canvas.caption(
    canvas.say(
      `Curva de aquecimento da água (m = ${n(curve.mass)} g)`,
      `Heating curve of water (m = ${n(curve.mass)} g)`,
    ),
    { row: 0, color: "white", visible: Anim.after(Teach.start(0)) },
  );
  const caption = (stage: HeatingStage) => {
    const energy = n(stage.energy) + " kJ";
    switch (stage.kind) {
      case "ice":
        return canvas.say(
          `Aquecer o gelo de ${n(stage.from)} a ${degrees(stage.to)}: Q = m·c·ΔT = ${energy}`,
          `Warm the ice from ${n(stage.from)} to ${degrees(stage.to)}: Q = m·c·ΔT = ${energy}`,
        );
      case "fusion":
        return canvas.say(
          `Fusão a ${degrees(stage.from)}: Q = m·Lf = ${energy}, T constante`,
          `Melting at ${degrees(stage.from)}: Q = m·Lf = ${energy}, constant T`,
        );
      case "liquid":
        return canvas.say(
          `Aquecer a água de ${n(stage.from)} a ${degrees(stage.to)}: Q = m·c·ΔT = ${energy}`,
          `Warm the water from ${n(stage.from)} to ${degrees(stage.to)}: Q = m·c·ΔT = ${energy}`,
        );
      case "boiling":
        return canvas.say(
          `Ebulição a ${degrees(stage.from)}: Q = m·Lv = ${energy}, T constante`,
          `Boiling at ${degrees(stage.from)}: Q = m·Lv = ${energy}, constant T`,
        );
      case "vapour":
        return canvas.say(
          `Aquecer o vapor de ${n(stage.from)} a ${degrees(stage.to)}: Q = m·c·ΔT = ${energy}`,
          `Warm the steam from ${n(stage.from)} to ${degrees(stage.to)}: Q = m·c·ΔT = ${energy}`,
        );
    }
  };
  stages.forEach((stage, index) => {
    const visible =
      index === stages.length - 1
        ? Anim.after(Teach.start(index))
        : Anim.window(Teach.start(index), Teach.start(index + 1));
    canvas.caption(caption(stage), { row: 1, color: changesState(stage) ? "accent" : "white", visible, claim: false });
  });

  // Axes: temperature up, the energy supplied to the right (a plain arrow, no scale).
  canvas.arrow(frame.left, frame.bottom, frame.right + 0.35, frame.bottom, { color: "muted" });
  canvas.arrow(frame.left, frame.bottom, frame.left, frame.top + 0.25, { color: "muted" });
  canvas.label(canvas.say("energia fornecida, Q", "energy supplied, Q"), frame.right + 0.3, frame.bottom - 0.3, {
    anchor: "trailing",
    color: "muted",
  });
  canvas.label("T (°C)", frame.left + 0.15, frame.top + 0.25, { anchor: "leading", color: "muted" });

  // The curve, stage by stage, as drawn by hand; every stage is one step.
  const point = (stage: number, atStart: boolean) => ({
    x: frame.x(atStart ? edges[stage]! : edges[stage + 1]!),
    y: frame.y(atStart ? stages[stage]!.from : stages[stage]!.to),
  });
  const strokes: { x: number; y: number }[] = [];
  stages.forEach((stage, index) => {
    const a = point(index, true);
    const b = point(index, false);
    const begin = Teach.start(index);
    canvas.curve(
      `${Anim.n(a.x)} + ${Anim.lit(b.x - a.x)}*s`,
      `${Anim.n(a.y)} + ${Anim.lit(b.y - a.y)}*s`,
      "0",
      Anim.ramp(begin, begin + 0.9),
      { color: changesState(stage) ? "accent" : "white" },
    );
    const samples = Math.max(2, Math.trunc(Math.hypot(b.x - a.x, b.y - a.y) / 0.05));
    for (let step = 0; step <= samples; step++)
      strokes.push({ x: a.x + ((b.x - a.x) * step) / samples, y: a.y + ((b.y - a.y) * step) / samples });
  });
  canvas.reserveStrokes(strokes);

  // The temperatures the curve turns at, read off the axis with dashed guides. The states' own temperatures come
  // first: where two are too close to read, the end ones give way.
  const marked = stages.filter(changesState).map((stage) => stage.from);
  for (const temperature of [curve.end, curve.start]) if (!marked.includes(temperature)) marked.push(temperature);
  for (const temperature of marked) {
    const y = frame.y(temperature);
    const reaches = Math.max(
      0,
      stages.findIndex((stage) => stage.from === temperature || stage.to === temperature),
    );
    const stage = stages[reaches]!;
    const atStart = stage.from === temperature;
    const x = point(reaches, atStart).x;
    const shown = Anim.after(Teach.start(reaches) + (atStart ? 0 : 0.9));
    if (x - frame.left > 0.3) canvas.line(frame.left, y, x, y, { color: "muted", dashed: true, visible: shown });
    canvas.label(n(temperature), frame.left - 0.12, y, {
      anchor: "trailing",
      color: changesState(stage) && stage.from === temperature ? "accent" : "muted",
      visible: shown,
    });
  }

  // The name of each stage, beside its stretch of the curve.
  const names: Record<HeatingKind, [string, string]> = {
    ice: ["gelo", "ice"],
    fusion: ["fusão", "melting"],
    liquid: ["água líquida", "liquid water"],
    boiling: ["ebulição", "boiling"],
    vapour: ["vapor", "steam"],
  };
  stages.forEach((stage, index) => {
    const a = point(index, true);
    const b = point(index, false);
    const middleX = (a.x + b.x) / 2;
    const middleY = (a.y + b.y) / 2;
    const text = canvas.say(names[stage.kind][0], names[stage.kind][1]);
    const spots: [number, number, string][] = changesState(stage)
      ? [
          [middleX, middleY + 0.3, "center"],
          [middleX, middleY - 0.3, "center"],
        ]
      : [
          [b.x + 0.25, middleY - 0.25, "leading"],
          [a.x - 0.25, middleY + 0.25, "trailing"],
          [middleX + 0.3, middleY - 0.3, "leading"],
          [middleX - 0.3, middleY + 0.3, "trailing"],
          [b.x + 0.25, middleY + 0.1, "leading"],
          [a.x - 0.25, middleY - 0.1, "trailing"],
        ];
    const shown = Anim.after(Teach.start(index) + 0.9);
    for (const [x, y, anchor] of spots)
      if (
        canvas.label(text, x, y, {
          anchor,
          color: changesState(stage) ? "accent" : "white",
          visible: shown,
          avoidStrokes: true,
          clearance: 0.04,
        })
      )
        break;
  });

  // The total, once the whole curve is drawn.
  const last = Teach.start(stages.length - 1) + 0.9;
  canvas.label(
    canvas.say(`Q total = ${n(curve.totalEnergy)} kJ`, `Total Q = ${n(curve.totalEnergy)} kJ`),
    frame.right + 0.3,
    frame.top + 0.25,
    { anchor: "trailing", color: "second", visible: Anim.after(last), claim: false },
  );

  canvas.recordSteps([0, ...stages.map((_, index) => Teach.start(index) + 0.95)]);
  const parameters = [
    slider("m", canvas.say("massa (g)", "mass (g)"), curve.mass, Math.max(1, curve.mass / 2), curve.mass * 2),
  ];
  if (curve.start < 0)
    parameters.push(
      slider("T0", canvas.say("temperatura inicial (°C)", "initial temperature (°C)"), curve.start, -40, -1),
    );
  if (curve.end > 100)
    parameters.push(slider("T1", canvas.say("temperatura final (°C)", "final temperature (°C)"), curve.end, 101, 150));
  return canvas.illustration(title, Anim.duration(last + 0.6), parameters);
};

/** The heating curve, by premade type. */
export const heatingFigures: Record<string, Compiler> = { heatingCurve: heatingCurveFigure };
