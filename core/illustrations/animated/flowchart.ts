// Port of LearnLayer/Illustrations/PremadeFigureFlowchart.swift @ ref 2026-11-04 (and `choiceIndex` of
// PremadeFigureBatch4.swift): a small flowchart interpreter and four programs (sum 1…n, factorial, Euclid's gcd,
// parity). The picture is drawn from the same program that is run, so the lit box and the variable table always agree
// with what the algorithm really does.

import { Premade } from "../premadeFigure";
import type { IllustrationParameter } from "../illustration";
import { frames, slotLabels } from "./algorithms";
import { Anim, FigureCanvas, Params, slider, type AnimatedIllustration } from "./figureCanvas";
import { integerParam } from "./loops";

interface Point {
  x: number;
  y: number;
}

type Shape = "terminator" | "process" | "decision" | "output";
type Values = Record<string, number>;

export interface FlowNode {
  shape: Shape;
  pt: string;
  en: string;
  centre: Point;
  width: number;
  height: number;
  /** What the box does to the variables; a decision returns its outcome. */
  run: (values: Values) => boolean;
  /** For a decision: the test with the values in it ("3 ≤ 4"). For an output: what is written. */
  detail: ((values: Values) => string) | null;
  /** The same in English, when it is not just numbers. */
  detailEnglish: ((values: Values) => string) | null;
}

const top = (node: FlowNode): Point => ({ x: node.centre.x, y: node.centre.y + node.height / 2 });
const bottom = (node: FlowNode): Point => ({ x: node.centre.x, y: node.centre.y - node.height / 2 });
const leftOf = (node: FlowNode): Point => ({ x: node.centre.x - node.width / 2, y: node.centre.y });
const rightOf = (node: FlowNode): Point => ({ x: node.centre.x + node.width / 2, y: node.centre.y });

export interface FlowEdge {
  from: number;
  to: number;
  /** Which outcome of a decision takes this arrow; null for any other box. */
  branch: boolean | null;
  /** The arrow's corners, from the first box's border to the next one's. */
  path: Point[];
}

export interface FlowProgram {
  nodes: FlowNode[];
  edges: FlowEdge[];
  labels: { branch: boolean; at: Point; anchor: string }[];
  variables: string[];
  inputs: Values;
  titlePt: string;
  titleEn: string;
}

export interface FlowStep {
  node: number;
  /** The variables after the box has run. */
  values: Values;
  outcome: boolean | null;
  written: string | null;
  /** The arrow taken to the next step, null on the last. */
  edge: number | null;
}

/** Runs the flowchart from its first box to a box with nothing after it; null if it takes more than `limit` steps. */
export function traceProgram(program: FlowProgram, limit = 60): FlowStep[] | null {
  const values: Values = { ...program.inputs };
  let current = 0;
  const steps: FlowStep[] = [];
  while (steps.length < limit) {
    const node = program.nodes[current]!;
    const result = node.run(values);
    const outcome = node.shape === "decision" ? result : null;
    const written = node.shape === "output" ? (node.detail?.(values) ?? null) : null;
    const next = program.edges.findIndex(
      (edge) => edge.from === current && (edge.branch === null || edge.branch === outcome),
    );
    steps.push({ node: current, values: { ...values }, outcome, written, edge: next < 0 ? null : next });
    if (next < 0) return steps;
    current = program.edges[next]!.to;
  }
  return null;
}

export const flowchartPrograms = ["sum", "factorial", "gcd", "parity"];

const boxWidth = (text: string, minimum = 1.2) => Math.max(minimum, Array.from(text).length * 0.13 + 0.4);

function node(
  shape: Shape,
  pt: string,
  en: string,
  x: number,
  y: number,
  run: (values: Values) => boolean = () => false,
  detail: ((values: Values) => string) | null = null,
  detailEnglish: ((values: Values) => string) | null = null,
): FlowNode {
  const longest = Math.max(Array.from(pt).length, Array.from(en).length);
  const [width, height] =
    shape === "terminator"
      ? [boxWidth(pt, 1.2), 0.4]
      : shape === "process"
        ? [boxWidth(pt), 0.5]
        : shape === "output"
          ? [boxWidth(pt, 1.5), 0.5]
          : [Math.max(1.9, longest * 0.13 * 2.05), 0.9];
  return { shape, pt, en, centre: { x, y }, width, height, run, detail, detailEnglish };
}

const value = (values: Values, name: string) => values[name] ?? 0;

/** A loop that runs i from 1 to n, the first line setting the accumulator `acc` and the second updating it. */
function countingLoop(
  n: number,
  acc: string,
  start: number,
  update: string,
  titlePt: string,
  titleEn: string,
  step: (accumulator: number, i: number) => number,
): FlowProgram {
  const spine = 2.2;
  const nodes = [
    node("terminator", "Início", "Start", spine, 5.0),
    node("process", `${acc} ← ${start} ; i ← 1`, `${acc} ← ${start} ; i ← 1`, spine, 4.25, (v) => {
      v[acc] = start;
      v["i"] = 1;
      return false;
    }),
    node(
      "decision",
      "i ≤ n ?",
      "i ≤ n ?",
      spine,
      3.25,
      (v) => value(v, "i") <= value(v, "n"),
      (v) => `${value(v, "i")} ≤ ${value(v, "n")}`,
    ),
    node("process", update, update, spine, 2.0, (v) => {
      v[acc] = step(value(v, acc), value(v, "i"));
      return false;
    }),
    node("process", "i ← i + 1", "i ← i + 1", spine, 1.2, (v) => {
      v["i"] = value(v, "i") + 1;
      return false;
    }),
    node(
      "output",
      `escrever ${acc}`,
      `print ${acc}`,
      4.75,
      2.5,
      () => false,
      (v) => `${value(v, acc)}`,
    ),
    node("terminator", "Fim", "End", 4.75, 1.6),
  ];
  const [n0, n1, n2, n3, n4, n5, n6] = nodes as [FlowNode, FlowNode, FlowNode, FlowNode, FlowNode, FlowNode, FlowNode];
  const edges: FlowEdge[] = [
    { from: 0, to: 1, branch: null, path: [bottom(n0), top(n1)] },
    { from: 1, to: 2, branch: null, path: [bottom(n1), top(n2)] },
    { from: 2, to: 3, branch: true, path: [bottom(n2), top(n3)] },
    { from: 3, to: 4, branch: null, path: [bottom(n3), top(n4)] },
    {
      from: 4,
      to: 2,
      branch: null,
      path: [leftOf(n4), { x: 0.6, y: n4.centre.y }, { x: 0.6, y: n2.centre.y }, leftOf(n2)],
    },
    { from: 2, to: 5, branch: false, path: [rightOf(n2), { x: 4.75, y: n2.centre.y }, top(n5)] },
    { from: 5, to: 6, branch: null, path: [bottom(n5), top(n6)] },
  ];
  return {
    nodes,
    edges,
    labels: [
      { branch: true, at: { x: spine + 0.1, y: 2.6 }, anchor: "leading" },
      { branch: false, at: { x: 3.3, y: 3.5 }, anchor: "leading" },
    ],
    variables: ["n", acc, "i"],
    inputs: { n },
    titlePt,
    titleEn,
  };
}

export function flowProgram(name: string, n: number, a: number, b: number): FlowProgram | null {
  switch (name) {
    case "sum":
      if (n < 1 || n > 6) return null;
      return countingLoop(n, "s", 0, "s ← s + i", "Soma 1 + 2 + … + n", "Sum 1 + 2 + … + n", (total, i) => total + i);
    case "factorial":
      if (n < 1 || n > 6) return null;
      return countingLoop(n, "f", 1, "f ← f · i", "Fatorial de n", "Factorial of n", (product, i) => product * i);
    case "gcd": {
      if (a < 1 || a > 99 || b < 1 || b > 99) return null;
      const spine = 2.2;
      const nodes = [
        node("terminator", "Início", "Start", spine, 5.0),
        node(
          "decision",
          "b ≠ 0 ?",
          "b ≠ 0 ?",
          spine,
          4.05,
          (v) => value(v, "b") !== 0,
          (v) => `${value(v, "b")} ≠ 0`,
        ),
        node("process", "r ← a mod b", "r ← a mod b", spine, 2.85, (v) => {
          v["r"] = value(v, "a") % Math.max(v["b"] ?? 1, 1);
          return false;
        }),
        node("process", "a ← b", "a ← b", spine, 2.1, (v) => {
          v["a"] = value(v, "b");
          return false;
        }),
        node("process", "b ← r", "b ← r", spine, 1.35, (v) => {
          v["b"] = value(v, "r");
          return false;
        }),
        node(
          "output",
          "escrever a",
          "print a",
          4.75,
          3.0,
          () => false,
          (v) => `${value(v, "a")}`,
        ),
        node("terminator", "Fim", "End", 4.75, 2.1),
      ];
      const [n0, n1, n2, n3, n4, n5, n6] = nodes as [
        FlowNode,
        FlowNode,
        FlowNode,
        FlowNode,
        FlowNode,
        FlowNode,
        FlowNode,
      ];
      return {
        nodes,
        edges: [
          { from: 0, to: 1, branch: null, path: [bottom(n0), top(n1)] },
          { from: 1, to: 2, branch: true, path: [bottom(n1), top(n2)] },
          { from: 2, to: 3, branch: null, path: [bottom(n2), top(n3)] },
          { from: 3, to: 4, branch: null, path: [bottom(n3), top(n4)] },
          {
            from: 4,
            to: 1,
            branch: null,
            path: [leftOf(n4), { x: 0.6, y: n4.centre.y }, { x: 0.6, y: n1.centre.y }, leftOf(n1)],
          },
          { from: 1, to: 5, branch: false, path: [rightOf(n1), { x: 4.75, y: n1.centre.y }, top(n5)] },
          { from: 5, to: 6, branch: null, path: [bottom(n5), top(n6)] },
        ],
        labels: [
          { branch: true, at: { x: spine + 0.1, y: 3.35 }, anchor: "leading" },
          { branch: false, at: { x: 3.3, y: 4.3 }, anchor: "leading" },
        ],
        variables: ["a", "b", "r"],
        inputs: { a, b },
        titlePt: "Algoritmo de Euclides: máximo divisor comum",
        titleEn: "Euclid's algorithm: greatest common divisor",
      };
    }
    case "parity": {
      if (n < 0 || n > 99) return null;
      const spine = 2.6;
      const nodes = [
        node("terminator", "Início", "Start", spine, 5.0),
        node(
          "decision",
          "n é par ?",
          "n even ?",
          spine,
          3.85,
          (v) => value(v, "n") % 2 === 0,
          (v) => `${value(v, "n")} mod 2 = ${value(v, "n") % 2}`,
        ),
        node(
          "output",
          "escrever par",
          "print even",
          1.3,
          2.4,
          () => false,
          () => "par",
          () => "even",
        ),
        node(
          "output",
          "escrever ímpar",
          "print odd",
          4.2,
          2.4,
          () => false,
          () => "ímpar",
          () => "odd",
        ),
        node("terminator", "Fim", "End", spine, 1.2),
      ];
      const [n0, n1, n2, n3, n4] = nodes as [FlowNode, FlowNode, FlowNode, FlowNode, FlowNode];
      return {
        nodes,
        edges: [
          { from: 0, to: 1, branch: null, path: [bottom(n0), top(n1)] },
          { from: 1, to: 2, branch: true, path: [leftOf(n1), top(n2)] },
          { from: 1, to: 3, branch: false, path: [rightOf(n1), { x: 4.2, y: n1.centre.y }, top(n3)] },
          { from: 2, to: 4, branch: null, path: [bottom(n2), { x: 1.3, y: n4.centre.y }, leftOf(n4)] },
          { from: 3, to: 4, branch: null, path: [bottom(n3), { x: 4.2, y: n4.centre.y }, rightOf(n4)] },
        ],
        labels: [
          { branch: true, at: { x: 1.2, y: 3.3 }, anchor: "trailing" },
          { branch: false, at: { x: 4.3, y: 3.3 }, anchor: "leading" },
        ],
        variables: ["n"],
        inputs: { n },
        titlePt: "Par ou ímpar",
        titleEn: "Even or odd",
      };
    }
    default:
      return null;
  }
}

/** The index of a choice param: a key by name or its index (Batch4 `choiceIndex`). */
export function choiceIndex(params: Params, key: string, keys: string[]): number | null {
  const raw = params.figure.params[key];
  if (raw === undefined) return null;
  if (typeof raw === "string") {
    const index = keys.findIndex((candidate) => candidate.toLowerCase() === raw.toLowerCase());
    if (index >= 0) return index;
  }
  const number = Premade.number(raw);
  if (number === null || !Number.isFinite(number) || !(Math.abs(number) < 1000)) return null;
  const index = Math.sign(number) * Math.round(Math.abs(number));
  return index >= 0 && index < keys.length ? index : null;
}

// MARK: Drawing

function drawFlowShape(canvas: FigureCanvas, node: FlowNode, color: string, visible: string | null = null): void {
  const { x, y } = node.centre;
  const halfW = node.width / 2;
  const halfH = node.height / 2;
  if (node.shape === "terminator" || node.shape === "process") {
    canvas.box(x - halfW, y - halfH, node.width, node.height, { color, visible });
    return;
  }
  const slant = 0.2;
  const corners =
    node.shape === "decision"
      ? [
          { x, y: y + halfH },
          { x: x + halfW, y },
          { x, y: y - halfH },
          { x: x - halfW, y },
        ]
      : [
          { x: x - halfW + slant, y: y + halfH },
          { x: x + halfW + slant, y: y + halfH },
          { x: x + halfW - slant, y: y - halfH },
          { x: x - halfW - slant, y: y - halfH },
        ];
  for (let index = 0; index < 4; index++) {
    const a = corners[index]!;
    const b = corners[(index + 1) % 4]!;
    canvas.line(a.x, a.y, b.x, b.y, { color, visible });
  }
}

function drawFlowPath(canvas: FigureCanvas, path: Point[], color: string, visible: string | null = null): void {
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1]!;
    const b = path[index]!;
    if (index === path.length - 1) canvas.arrow(a.x, a.y, b.x, b.y, { color, visible });
    else canvas.line(a.x, a.y, b.x, b.y, { color, visible });
  }
}

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

const flowchart: Compiler = (params, title, language) => {
  const canvas = new FigureCanvas(language);
  const choice = choiceIndex(params, "program", flowchartPrograms);
  if (choice === null) return null;
  const name = flowchartPrograms[choice]!;
  const base = name === "parity" ? { n: 7, a: 48, b: 18 } : { n: 4, a: 48, b: 18 };
  const n = params.has("n") ? integerParam(params, "n") : base.n;
  const a = params.has("a") ? integerParam(params, "a") : base.a;
  const b = params.has("b") ? integerParam(params, "b") : base.b;
  if (n === null || a === null || b === null) return null;
  const program = flowProgram(name, n, a, b);
  const steps = program ? traceProgram(program) : null;
  if (!program || !steps || steps.length < 2) return null;

  const times = frames(steps.length, 1.0, 0.55);
  const finish = times[times.length - 1]!;
  const shownWhile = (index: number) =>
    index === steps.length - 1 ? Anim.after(times[index]!) : Anim.window(times[index]!, times[index + 1]!);

  canvas.caption(canvas.say(program.titlePt, program.titleEn), { row: 0, color: "white", visible: Anim.after(0.1) });

  // The boxes, the arrows and the names of the two ways out of a test.
  for (const item of program.nodes) {
    drawFlowShape(canvas, item, item.shape === "terminator" ? "muted" : "white");
    canvas.label(canvas.say(item.pt, item.en), item.centre.x, item.centre.y, { anchor: "center", color: "white" });
  }
  for (const edge of program.edges) drawFlowPath(canvas, edge.path, "muted");
  for (const label of program.labels)
    canvas.label(label.branch ? canvas.say("sim", "yes") : canvas.say("não", "no"), label.at.x, label.at.y, {
      anchor: label.anchor,
      color: "muted",
    });

  // The box being run is lit while its step lasts, and the arrow taken afterwards.
  steps.forEach((current, index) => {
    const last = index === steps.length - 1;
    drawFlowShape(canvas, program.nodes[current.node]!, "accent", shownWhile(index));
    if (current.edge !== null && !last)
      drawFlowPath(
        canvas,
        program.edges[current.edge]!.path,
        "accent",
        Anim.window(times[index]! + 0.2, times[index + 1]!),
      );
  });

  // The variables, with the one that just changed marked.
  const cellWidth = 1.15;
  const gap = 0.1;
  const count = program.variables.length;
  const panelLeft = 7.95 - (count * cellWidth + (count - 1) * gap) / 2;
  program.variables.forEach((variable, column) => {
    const centre = panelLeft + column * (cellWidth + gap) + cellWidth / 2;
    canvas.label(variable, centre, 4.75, { anchor: "center", color: "white" });
    canvas.box(centre - cellWidth / 2, 3.95, cellWidth, 0.5, { color: "muted" });
    const contents = steps.map((current) =>
      current.values[variable] === undefined ? "?" : String(current.values[variable]),
    );
    slotLabels(canvas, contents, times, { x: centre, y: 4.2 }, "white");
    for (let index = 1; index < steps.length; index++)
      if (steps[index]!.values[variable] !== steps[index - 1]!.values[variable])
        canvas.box(centre - cellWidth / 2, 3.95, cellWidth, 0.5, { color: "accent", visible: shownWhile(index) });
  });

  // What each step did, in words, along the bottom; the answer in a box once it is written.
  steps.forEach((current, index) => {
    const item = program.nodes[current.node]!;
    let text = `${index + 1}. ${canvas.say(item.pt, item.en)}`;
    const detail = item.detail?.(current.values);
    if (current.outcome !== null && detail !== undefined)
      text += `  →  ${detail}: ` + (current.outcome ? canvas.say("sim", "yes") : canvas.say("não", "no"));
    else if (item.shape === "process" && index > 0) {
      const changed = program.variables.filter((v) => current.values[v] !== steps[index - 1]!.values[v]);
      if (changed.length > 0) text += "  →  " + changed.map((v) => `${v} = ${current.values[v] ?? 0}`).join(", ");
    } else if (current.written !== null)
      text +=
        "  →  " + (canvas.portuguese ? current.written : (item.detailEnglish?.(current.values) ?? current.written));
    canvas.label(text, 5.3, 0.5, { anchor: "center", color: "white", visible: shownWhile(index), claim: false });
    canvas.label(
      canvas.say(`Passo ${index + 1} de ${steps.length}`, `Step ${index + 1} of ${steps.length}`),
      7.95,
      2.4,
      {
        anchor: "center",
        color: "muted",
        visible: shownWhile(index),
        claim: false,
      },
    );
  });
  const writtenAt = steps.findIndex((current) => current.written !== null);
  if (writtenAt >= 0) {
    const current = steps[writtenAt]!;
    const written = canvas.portuguese
      ? current.written!
      : (program.nodes[current.node]!.detailEnglish?.(current.values) ?? current.written!);
    canvas.box(6.6, 2.95, 2.7, 0.5, { color: "accent", visible: Anim.after(times[writtenAt]!) });
    canvas.label(canvas.say(`Saída: ${written}`, `Output: ${written}`), 7.95, 3.2, {
      anchor: "center",
      color: "accent",
      visible: Anim.after(times[writtenAt]!),
      claim: false,
    });
  }

  const parameters: IllustrationParameter[] = [
    slider(
      "program",
      canvas.say("programa: 0 soma 1 fatorial 2 mdc 3 paridade", "program: 0 sum 1 factorial 2 gcd 3 parity"),
      choice,
      0,
      flowchartPrograms.length - 1,
    ),
  ];
  if (name === "sum" || name === "factorial") parameters.push(slider("n", "n", n, 1, 6));
  else if (name === "gcd") parameters.push(slider("a", "a", a, 1, 60), slider("b", "b", b, 1, 60));
  else parameters.push(slider("n", "n", n, 0, 20));
  canvas.recordSteps([0, ...times.map((t) => t + 0.3)]);
  return canvas.illustration(title, Anim.duration(finish + 1.2), parameters);
};

/** The flowchart, by premade type. */
export const flowchartFigures: Record<string, Compiler> = { flowchart };
