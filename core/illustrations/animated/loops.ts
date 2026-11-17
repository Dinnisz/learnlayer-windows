// Port of LearnLayer/Illustrations/PremadeFigureLoops.swift @ ref 2026-11-04 (and `integerParam` of
// PremadeFigureBatch4.swift): a for loop over an array with its trace table (sum, maximum, count, linear search) and
// the call tree of a recursive function (Fibonacci, factorial). The app runs the loop and the recursion itself.

import { frames, slide } from "./algorithms";
import { Anim, FigureCanvas, Params, slider, type AnimatedIllustration } from "./figureCanvas";
import type { IllustrationParameter } from "../illustration";

/** Swift's `.rounded()`: half away from zero. */
const swiftRound = (value: number) => Math.sign(value) * Math.round(Math.abs(value));

/** A whole-number param (Batch4 `integerParam`): rounded, null when absent or absurd. */
export function integerParam(params: Params, key: string): number | null {
  const number = params.number(key);
  return number === null || !(Math.abs(number) < 1_000_000) ? null : swiftRound(number);
}

// MARK: Loop over an array

export interface LoopPass {
  index: number;
  element: number;
  /** The test of this pass: a[i] > k for "count", a[i] = target for "search", a[i] > máx for "max" (not on the first). */
  test: boolean | null;
  /** The running result after this pass; null for a search. */
  accumulator: number | null;
}

export interface ArrayLoopRun {
  passes: LoopPass[];
  /** The sum, the maximum, the count, or the index found (null when the search finds nothing). */
  result: number | null;
  /** The cell the answer sits in: where the maximum is, or where the search stopped. */
  answerIndex: number | null;
}

export const arrayLoopTasks = ["sum", "max", "count", "search"];

export function arrayLoopRun(task: string, values: number[], k: number, target: number): ArrayLoopRun | null {
  if (values.length === 0) return null;
  const passes: LoopPass[] = [];
  switch (task) {
    case "sum": {
      let total = 0;
      values.forEach((element, index) => {
        total += element;
        passes.push({ index, element, test: null, accumulator: total });
      });
      return { passes, result: total, answerIndex: null };
    }
    case "max": {
      let best = values[0]!;
      let bestIndex = 0;
      values.forEach((element, index) => {
        let test: boolean | null = null;
        if (index > 0) {
          test = element > best;
          if (element > best) {
            best = element;
            bestIndex = index;
          }
        }
        passes.push({ index, element, test, accumulator: best });
      });
      return { passes, result: best, answerIndex: bestIndex };
    }
    case "count": {
      let count = 0;
      values.forEach((element, index) => {
        const above = element > k;
        if (above) count += 1;
        passes.push({ index, element, test: above, accumulator: count });
      });
      return { passes, result: count, answerIndex: null };
    }
    case "search":
      for (const [index, element] of values.entries()) {
        const hit = element === target;
        passes.push({ index, element, test: hit, accumulator: null });
        if (hit) return { passes, result: index, answerIndex: index };
      }
      return { passes, result: null, answerIndex: null };
    default:
      return null;
  }
}

// MARK: Recursion

/** One call of a recursive function: its argument, who called it, and what it returned. */
export interface RecursionCall {
  argument: number;
  parent: number | null;
  children: number[];
  depth: number;
  result: number;
  /** For factorial: the product written as "n × f(n−1)"; for Fibonacci: the sum. */
  detail: string;
}

export interface RecursionTrace {
  calls: RecursionCall[];
  /** The order things happen in: a call begins, or it returns. */
  events: { call: number; returns: boolean }[];
}

export const recursionFunctions = ["fibonacci", "factorial"];

export function recursionTrace(fn: string, n: number): RecursionTrace | null {
  if (fn === "fibonacci") {
    if (n < 2 || n > 5) return null;
  } else if (fn === "factorial") {
    if (n < 1 || n > 6) return null;
  } else return null;
  const trace: RecursionTrace = { calls: [], events: [] };
  const visit = (argument: number, parent: number | null, depth: number): number => {
    const id = trace.calls.length;
    trace.calls.push({ argument, parent, children: [], depth, result: 0, detail: "" });
    if (parent !== null) trace.calls[parent]!.children.push(id);
    trace.events.push({ call: id, returns: false });
    let result: number;
    let detail = "";
    if (fn === "fibonacci") {
      if (argument < 2) result = argument;
      else {
        const a = visit(argument - 1, id, depth + 1);
        const b = visit(argument - 2, id, depth + 1);
        result = a + b;
        detail = `${a} + ${b}`;
      }
    } else if (argument === 0) result = 1;
    else {
      const inner = visit(argument - 1, id, depth + 1);
      result = argument * inner;
      detail = `${argument} × ${inner}`;
    }
    trace.calls[id]!.result = result;
    trace.calls[id]!.detail = detail;
    trace.events.push({ call: id, returns: true });
    return result;
  };
  visit(n, null, 0);
  return trace;
}

// MARK: The figures

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

const arrayLoop: Compiler = (params, title, language) => {
  const canvas = new FigureCanvas(language);
  const task = params.text("task");
  const entries = params.numbers("values");
  if (
    !task ||
    !arrayLoopTasks.includes(task) ||
    !entries ||
    entries.length < 2 ||
    entries.length > 8 ||
    !entries.every((v) => Math.abs(v) <= 99 && v === Math.round(v))
  )
    return null;
  const all = entries.map((v) => Math.trunc(v));
  let length = all.length;
  if (params.has("length")) {
    const asked = integerParam(params, "length");
    if (asked === null || asked < 2 || asked > all.length) return null;
    length = asked;
  }
  const values = all.slice(0, length);
  let k = swiftRound(values.reduce((sum, v) => sum + v, 0) / values.length);
  if (params.has("k")) {
    const asked = integerParam(params, "k");
    if (asked === null || Math.abs(asked) > 100) return null;
    k = asked;
  }
  let target = values[Math.trunc(values.length / 2)]!;
  if (params.has("target")) {
    const asked = integerParam(params, "target");
    if (asked === null || Math.abs(asked) > 100) return null;
    target = asked;
  }
  const run = arrayLoopRun(task, values, k, target);
  if (!run) return null;

  const count = values.length;
  const columnWidth = Math.min(1.0, 8.0 / count);
  const originX = 1.2 + (8.0 - columnWidth * count) / 2;
  const columnCentre = (index: number) => originX + columnWidth * (index + 0.5);
  const trueText = canvas.say("V", "T");
  const falseText = canvas.say("F", "F");
  const tested = (pass: LoopPass) => (pass.test === null ? "–" : pass.test ? trueText : falseText);

  // The rows of the trace table: what each pass leaves in them.
  const rows: { name: string; cells: string[]; color: string }[] = [
    { name: "i", cells: run.passes.map((p) => String(p.index)), color: "white" },
    { name: "a[i]", cells: run.passes.map((p) => String(p.element)), color: "white" },
  ];
  const accumulated = run.passes.map((p) => String(p.accumulator ?? 0));
  if (task === "max") {
    rows.push({ name: canvas.say("> máx", "> max"), cells: run.passes.map(tested), color: "white" });
    rows.push({ name: canvas.say("máx", "max"), cells: accumulated, color: "accent" });
  } else if (task === "sum") rows.push({ name: canvas.say("soma", "sum"), cells: accumulated, color: "accent" });
  else if (task === "count") {
    rows.push({ name: "a[i]>k", cells: run.passes.map(tested), color: "white" });
    rows.push({ name: canvas.say("total", "count"), cells: accumulated, color: "accent" });
  } else rows.push({ name: "a[i]=x", cells: run.passes.map(tested), color: "accent" });

  const first = 1.0;
  const passTime = 1.1;
  const times = frames(run.passes.length, first, passTime);
  const end = times[times.length - 1]! + passTime;

  const heading =
    task === "sum"
      ? canvas.say("Soma dos elementos de um vetor (ciclo for)", "Sum of the elements of an array (for loop)")
      : task === "max"
        ? canvas.say("Máximo de um vetor (ciclo for)", "Maximum of an array (for loop)")
        : task === "count"
          ? canvas.say(`Contar valores maiores que k = ${k}`, `Count the values greater than k = ${k}`)
          : canvas.say(`Pesquisa linear de x = ${target}`, `Linear search for x = ${target}`);
  canvas.caption(heading, { row: 0, color: "white", visible: Anim.after(0.1) });

  // The array and its indices.
  canvas.label(canvas.say("vetor", "array"), 1.15, 4.1, { anchor: "trailing", color: "muted" });
  canvas.label(canvas.say("índice", "index"), 1.15, 3.5, { anchor: "trailing", color: "muted" });
  for (let index = 0; index < count; index++) {
    canvas.box(originX + columnWidth * index, 3.8, columnWidth, 0.6, { color: "white" });
    canvas.label(String(values[index]), columnCentre(index), 4.1, { anchor: "center", color: "white" });
    canvas.label(String(index), columnCentre(index), 3.5, { anchor: "center", color: "muted" });
  }

  // The trace table, one column per cell of the array.
  const rowCentres = rows.map((_, i) => 2.75 - 0.5 * i);
  const tableTop = rowCentres[0]! + 0.25;
  const tableBottom = rowCentres[rows.length - 1]! - 0.25;
  rows.forEach((row, index) => {
    canvas.label(row.name, 1.15, rowCentres[index]!, { anchor: "trailing", color: "muted" });
    canvas.line(originX, rowCentres[index]! - 0.25, originX + columnWidth * count, rowCentres[index]! - 0.25, {
      color: "muted",
    });
  });
  canvas.line(originX, tableTop, originX + columnWidth * count, tableTop, { color: "muted" });
  for (let index = 0; index <= count; index++) {
    const x = originX + columnWidth * index;
    canvas.line(x, tableTop, x, tableBottom, { color: "muted" });
  }

  // The pointer i moves along the array; the column of the trace table being filled is lit.
  const pointer = slide(
    run.passes.map((p) => ({ x: columnCentre(p.index), y: 0 })),
    times,
    0.3,
  );
  if (pointer) {
    canvas.arrow(pointer.x, 4.68, pointer.x, 4.47, { color: "accent" });
    canvas.movingLabel("i", pointer.x, "4.95000", { color: "accent" });
  }
  run.passes.forEach((current, position) => {
    const visible = Anim.window(times[position]!, times[position]! + passTime);
    canvas.box(originX + columnWidth * current.index, 3.8, columnWidth, 0.6, { color: "accent", visible });
    canvas.box(originX + columnWidth * position, tableBottom, columnWidth, tableTop - tableBottom, {
      color: "accent",
      visible,
    });
    rows.forEach((row, rowIndex) =>
      canvas.label(row.cells[position]!, columnCentre(position), rowCentres[rowIndex]!, {
        anchor: "center",
        color: row.color,
        visible: Anim.after(times[position]! + 0.25 * rowIndex),
      }),
    );
  });

  // The answer.
  const shown = Anim.after(end);
  let answer: string;
  if (task === "sum") answer = canvas.say(`soma = ${run.result ?? 0}`, `sum = ${run.result ?? 0}`);
  else if (task === "max")
    answer = canvas.say(
      `máximo = ${run.result ?? 0} (índice ${run.answerIndex ?? 0})`,
      `maximum = ${run.result ?? 0} (index ${run.answerIndex ?? 0})`,
    );
  else if (task === "count") {
    const total = run.result ?? 0;
    answer = canvas.say(
      total === 1 ? `1 valor maior que ${k}` : `${total} valores maiores que ${k}`,
      total === 1 ? `1 value greater than ${k}` : `${total} values greater than ${k}`,
    );
  } else
    answer =
      run.result !== null
        ? canvas.say(`${target} encontrado no índice ${run.result}`, `${target} found at index ${run.result}`)
        : canvas.say(`${target} não existe no vetor`, `${target} is not in the array`);
  if (run.answerIndex !== null)
    canvas.box(originX + columnWidth * run.answerIndex, 3.8, columnWidth, 0.6, { color: "accent", visible: shown });
  canvas.caption(answer, { row: 1, color: "accent", visible: shown });

  const parameters: IllustrationParameter[] = [];
  if (all.length > 2)
    parameters.push(slider("length", canvas.say("n (comprimento)", "n (length)"), length, 2, all.length));
  if (task === "count") parameters.push(slider("k", "k", k, Math.min(...values) - 1, Math.max(...values)));
  if (task === "search")
    parameters.push(
      slider("target", canvas.say("alvo x", "target x"), target, Math.min(...values), Math.max(...values)),
    );
  canvas.recordSteps([0, ...times.map((t) => t + 0.78), end + 0.8]);
  return canvas.illustration(title, Anim.duration(end + 1.2), parameters);
};

const recursionTree: Compiler = (params, title, language) => {
  const canvas = new FigureCanvas(language);
  const fn = params.text("function");
  const n = integerParam(params, "n");
  if (!fn || !recursionFunctions.includes(fn) || n === null) return null;
  const trace = recursionTrace(fn, n);
  if (!trace) return null;
  const calls = trace.calls;
  const fibonacci = fn === "fibonacci";
  const name = fibonacci ? "F" : "f";

  // Where each call sits: a tree spread by its leaves, or a column for the single chain of factorial.
  const positions = calls.map(() => ({ x: 0, y: 0 }));
  const levels = Math.max(...calls.map((call) => call.depth)) + 1;
  const dy = Math.min(fibonacci ? 0.85 : 0.6, 3.6 / Math.max(levels - 1, 1));
  if (fibonacci) {
    const leaves = calls.filter((call) => call.children.length === 0).length;
    const spacing = Math.min(1.15, 8.6 / leaves);
    const left = (10 - spacing * (leaves - 1)) / 2;
    let nextLeaf = 0;
    const place = (id: number) => {
      const call = calls[id]!;
      if (call.children.length === 0) positions[id]!.x = left + spacing * nextLeaf++;
      else {
        call.children.forEach(place);
        const xs = call.children.map((child) => positions[child]!.x);
        positions[id]!.x = (Math.min(...xs) + Math.max(...xs)) / 2;
      }
      positions[id]!.y = 4.8 - dy * call.depth;
    };
    place(0);
  } else calls.forEach((call, id) => (positions[id] = { x: 2.4, y: 4.8 - dy * call.depth }));

  const first = 0.8;
  const eventStep = 0.38;
  const eventTime = (index: number) => first + eventStep * index;
  const callTime = calls.map(() => 0);
  const returnTime = calls.map(() => 0);
  trace.events.forEach((event, index) => {
    if (event.returns) returnTime[event.call] = eventTime(index);
    else callTime[event.call] = eventTime(index);
  });
  const end = eventTime(trace.events.length);
  const radius = 0.3;

  canvas.caption(
    fibonacci
      ? canvas.say("Chamadas recursivas de F(n) = F(n−1) + F(n−2)", "Recursive calls of F(n) = F(n−1) + F(n−2)")
      : canvas.say("Recursão: n! = n · (n−1)!  e  0! = 1", "Recursion: n! = n · (n−1)!  and  0! = 1"),
    { row: 0, color: "white", visible: Anim.after(0.1) },
  );

  calls.forEach((call, id) => {
    const at = positions[id]!;
    const shown = Anim.after(callTime[id]!);
    if (call.parent !== null) {
      const from = positions[call.parent]!;
      const length = Math.max(Math.hypot(at.x - from.x, at.y - from.y), 1e-6);
      const ux = (at.x - from.x) / length;
      const uy = (at.y - from.y) / length;
      canvas.line(from.x + ux * radius, from.y + uy * radius, at.x - ux * radius, at.y - uy * radius, {
        color: "muted",
        visible: shown,
      });
      // The value travelling back up, beside the way down.
      const nx = -uy * 0.1;
      const ny = ux * 0.1;
      canvas.arrow(
        at.x - ux * radius + nx,
        at.y - uy * radius + ny,
        from.x + ux * radius + nx,
        from.y + uy * radius + ny,
        {
          color: "second",
          visible: Anim.after(returnTime[id]!),
        },
      );
    }
    canvas.ring(at.x, at.y, radius, { color: "white", visible: shown });
    canvas.label(`${name}(${call.argument})`, at.x, at.y, { anchor: "center", color: "white", visible: shown });
    const value = fibonacci
      ? `=${call.result}`
      : call.detail === ""
        ? `= ${call.result}`
        : `= ${call.detail} = ${call.result}`;
    canvas.label(value, at.x + radius + 0.06, at.y, {
      anchor: "leading",
      color: "second",
      visible: Anim.after(returnTime[id]!),
    });
  });
  // The call being handled, or the one returning, is circled.
  trace.events.forEach((event, index) => {
    const at = positions[event.call]!;
    const visible =
      index === trace.events.length - 1
        ? Anim.after(eventTime(index))
        : Anim.window(eventTime(index), eventTime(index + 1));
    canvas.ring(at.x, at.y, radius + 0.07, { color: event.returns ? "second" : "accent", visible });
  });

  // At the end: the answer, the number of calls and, for Fibonacci, what was calculated again and again.
  const shown = Anim.after(end);
  const answer = calls[0]!.result;
  let summary = fibonacci ? `F(${n}) = ${answer}` : `${n}! = ${answer}`;
  summary += canvas.say(` · ${calls.length} chamadas`, ` · ${calls.length} calls`);
  if (fibonacci && n >= 4) {
    const repeats = calls.filter((call) => call.argument === 2);
    calls.forEach((call, id) => {
      if (call.argument === 2)
        canvas.ring(positions[id]!.x, positions[id]!.y, radius + 0.1, {
          color: "second",
          dashed: true,
          visible: shown,
        });
    });
    summary += canvas.say(` · F(2) é calculado ${repeats.length} vezes`, ` · F(2) is computed ${repeats.length} times`);
  }
  canvas.caption(summary, { row: 1, color: "accent", visible: shown });

  const parameters = [slider("n", "n", n, fibonacci ? 2 : 1, fibonacci ? 5 : 6)];
  canvas.recordSteps([0, ...trace.events.map((_, index) => eventTime(index) + 0.2), end + 0.8]);
  return canvas.illustration(title, Anim.duration(end + 1.2), parameters);
};

/** The programming figures of Batch 4 ported so far, by premade type. */
export const loopFigures: Record<string, Compiler> = { arrayLoop, recursionTree };
