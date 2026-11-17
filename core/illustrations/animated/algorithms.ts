// Port of LearnLayer/Illustrations/PremadeFigureAnimatedAlgorithms.swift @ ref 2026-11-04: things that slide from frame
// to frame (`slide`), and the algorithm figures built on it: four sorts as moving bars, a binary search, a linked list
// (traverse, insert, delete), a stack and a queue, and a hash table with chaining. The app runs each algorithm itself.

import type { PremadeValue } from "../premadeFigure";
import { Premade } from "../premadeFigure";
import { Anim, FigureCanvas, Params, type AnimatedIllustration } from "./figureCanvas";

interface Point {
  x: number;
  y: number;
}

/** The moments frames are reached. */
export const frames = (count: number, start: number, step: number) =>
  Array.from({ length: count }, (_, index) => start + step * index);

/**
 * Expressions for something that sits at `positions[j]` when frame j is reached (at `frameTimes[j]`) and slides there
 * over the `move` seconds before. A null position means it is not on stage in that frame. With a `bow`, each move swings
 * sideways and back, so two things that trade places pass each other.
 */
export function slide(
  positions: (Point | null)[],
  frameTimes: number[],
  move: number,
  bow = 0,
): { x: string; y: string; visible: string | null } | null {
  if (positions.length !== frameTimes.length) return null;
  const first = positions.findIndex((p) => p !== null);
  let last = -1;
  positions.forEach((p, index) => {
    if (p !== null) last = index;
  });
  if (first < 0) return null;
  const start = positions[first]!;
  for (let index = first; index <= last; index++) if (positions[index] === null) return null;
  let x = Anim.n(start.x);
  let y = Anim.n(start.y);
  for (let index = first + 1; index <= last; index++) {
    const from = positions[index - 1]!;
    const to = positions[index]!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) continue;
    const ramp = Anim.ramp(frameTimes[index]! - move, frameTimes[index]!);
    x += ` + (${Anim.n(dx)})*${ramp}`;
    y += ` + (${Anim.n(dy)})*${ramp}`;
    if (bow !== 0) {
      x += ` + (${Anim.n((-dy / length) * bow)})*sin(3.14159*${ramp})`;
      y += ` + (${Anim.n((dx / length) * bow)})*sin(3.14159*${ramp})`;
    }
  }
  const appears = first > 0 ? frameTimes[first]! - move : null;
  const vanishes = last + 1 < positions.length ? frameTimes[last + 1]! - move : null;
  return { x, y, visible: shownBetween(appears, vanishes) };
}

/** Shown from `begin` (always when null) until `end` (for good when null). */
function shownBetween(begin: number | null, end: number | null): string | null {
  if (begin === null && end === null) return null;
  if (begin === null) return `${Anim.n(end!)}-t`;
  if (end === null) return Anim.after(begin);
  return Anim.window(begin, end);
}

/** What a slot holds in each frame (null when empty), written at `point` and swapped when the frame is reached: one
 * label per run of equal contents, so nothing slides across the other slots. */
export function slotLabels(
  canvas: FigureCanvas,
  contents: (string | null)[],
  frameTimes: number[],
  point: Point,
  color: string | null = "white",
): void {
  let runStart = 0;
  for (let frame = 1; frame <= Math.max(contents.length, 1); frame++) {
    if (frame !== contents.length && contents[frame] === contents[runStart]) continue;
    const text = contents[runStart];
    if (text !== null && text !== undefined) {
      const begin = runStart === 0 ? null : frameTimes[runStart]!;
      const end = frame === contents.length ? null : frameTimes[frame]!;
      canvas.label(text, point.x, point.y, {
        anchor: "center",
        color,
        visible: shownBetween(begin, end),
        claim: false,
      });
    }
    runStart = frame;
  }
}

/** A value as shown on a node or bar: whole numbers without a decimal mark. */
export function shownValue(value: PremadeValue | undefined, canvas: FigureCanvas): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const rounded = Math.round(value);
    return Math.abs(value - rounded) < 1e-9 ? String(rounded).replace(/-/g, "−") : canvas.number(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return null;
}

function shownValues(params: Params, key: string, canvas: FigureCanvas, longest = 5): string[] | null {
  const entries = Premade.array(params.figure.params[key]);
  if (!entries) return null;
  const texts: string[] = [];
  for (const entry of entries) {
    const text = shownValue(entry, canvas);
    if (text === null || Array.from(text).length > longest) return null;
    texts.push(text);
  }
  return texts;
}

// MARK: Sorting

/** The arrangement of the bars after each swap or merge: slot → index of the bar there. The first is the start. */
export function sortSnapshots(values: number[], algorithm: string): number[][] | null {
  const count = values.length;
  if (count < 2) return null;
  const order = Array.from({ length: count }, (_, i) => i);
  const snapshots = [[...order]];
  const swapSlots = (a: number, b: number) => {
    [order[a], order[b]] = [order[b]!, order[a]!];
    snapshots.push([...order]);
  };
  const v = (slot: number) => values[order[slot]!]!;
  switch (algorithm) {
    case "bubble": {
      let end = count - 1;
      while (end > 0) {
        let swapped = false;
        for (let j = 0; j < end; j++)
          if (v(j) > v(j + 1)) {
            swapSlots(j, j + 1);
            swapped = true;
          }
        if (!swapped) break;
        end -= 1;
      }
      break;
    }
    case "insertion":
      for (let i = 1; i < count; i++) {
        let j = i;
        while (j > 0 && v(j - 1) > v(j)) {
          swapSlots(j - 1, j);
          j -= 1;
        }
      }
      break;
    case "merge": {
      const sort = (low: number, high: number) => {
        if (high - low <= 1) return;
        const middle = Math.trunc((low + high) / 2);
        sort(low, middle);
        sort(middle, high);
        const merged: number[] = [];
        let i = low;
        let j = middle;
        while (i < middle || j < high) {
          if (j >= high || (i < middle && v(i) <= v(j))) merged.push(order[i++]!);
          else merged.push(order[j++]!);
        }
        if (merged.some((id, k) => id !== order[low + k])) {
          order.splice(low, high - low, ...merged);
          snapshots.push([...order]);
        }
      };
      sort(0, count);
      break;
    }
    case "quick": {
      const sort = (low: number, high: number) => {
        if (low >= high) return;
        const pivot = v(high);
        let boundary = low;
        for (let j = low; j < high; j++)
          if (v(j) < pivot) {
            if (boundary !== j) swapSlots(boundary, j);
            boundary += 1;
          }
        if (boundary !== high) swapSlots(boundary, high);
        sort(low, boundary - 1);
        sort(boundary + 1, high);
      };
      sort(0, count - 1);
      break;
    }
    default:
      return null;
  }
  return snapshots.length >= 2 ? snapshots : null;
}

// MARK: Binary search

export interface BinarySearchStep {
  low: number;
  high: number;
  middle: number;
}

/** The ranges and middles looked at, and the index found (null when the target is not there). */
export function binarySearchTrace(
  values: number[],
  target: number,
): { steps: BinarySearchStep[]; found: number | null } {
  let low = 0;
  let high = values.length - 1;
  const steps: BinarySearchStep[] = [];
  while (low <= high) {
    const middle = Math.trunc((low + high) / 2);
    steps.push({ low, high, middle });
    if (values[middle] === target) return { steps, found: middle };
    if (values[middle]! < target) low = middle + 1;
    else high = middle - 1;
  }
  return { steps, found: null };
}

// MARK: Linked list, stack, queue, hash table

/** The list after an operation: "traverse" leaves it, "insert" puts `value` before `index`, "delete" removes the node. */
export function linkedListAfter(
  values: string[],
  operation: string,
  index: number,
  value: string | null,
): string[] | null {
  switch (operation) {
    case "traverse":
      return values;
    case "insert":
      if (value === null || index < 0 || index > values.length) return null;
      return [...values.slice(0, index), value, ...values.slice(index)];
    case "delete":
      if (index < 0 || index >= values.length) return null;
      return values.filter((_, i) => i !== index);
    default:
      return null;
  }
}

export interface StackQueueTrace {
  /** Contents after each operation, bottom to top (or front to back), as item ids and as shown values. */
  idStates: number[][];
  states: string[][];
  /** The value each id was given. */
  values: string[];
  /** The operations as the student reads them: "push(5)", "dequeue()". */
  captions: string[];
}

export function simulateStackQueue(kind: string, operations: string[]): StackQueueTrace | null {
  if (kind !== "stack" && kind !== "queue") return null;
  let ids: number[] = [];
  const values: string[] = [];
  const trace: StackQueueTrace = { idStates: [[]], states: [[]], values: [], captions: [] };
  for (const operation of operations) {
    const parts = operation
      .replace(/[()]/g, " ")
      .split(" ")
      .filter((part) => part !== "");
    const name = parts[0]?.toLowerCase();
    if (!name) return null;
    if ((kind === "stack" && name === "push") || (kind === "queue" && name === "enqueue")) {
      if (parts.length !== 2 || Array.from(parts[1]!).length > 4) return null;
      values.push(parts[1]!);
      ids.push(values.length - 1);
      trace.captions.push(`${name}(${parts[1]})`);
    } else if (kind === "stack" && name === "pop") {
      if (ids.length === 0) return null;
      ids = ids.slice(0, -1);
      trace.captions.push("pop()");
    } else if (kind === "queue" && name === "dequeue") {
      if (ids.length === 0) return null;
      ids = ids.slice(1);
      trace.captions.push("dequeue()");
    } else return null;
    if (ids.length > 6) return null;
    trace.idStates.push([...ids]);
    trace.states.push(ids.map((id) => values[id]!));
  }
  trace.values = values;
  return trace;
}

/** The keys in each bucket, in insertion order (separate chaining, new keys at the end of the chain). */
export function hashBuckets(keys: number[], size: number): number[][] {
  const buckets: number[][] = Array.from({ length: Math.max(size, 1) }, () => []);
  for (const key of keys) buckets[((key % size) + size) % size]!.push(key);
  return buckets;
}

// MARK: The figures

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

const arrayBars: Compiler = (params, title, language) => {
  const values = params.numbers("values");
  if (!values || values.length < 3 || values.length > 12 || !values.every((v) => v > 0)) return null;
  const algorithm = params.text("algorithm") ?? params.text("sortSteps") ?? "bubble";
  const snapshots = sortSnapshots(values, algorithm);
  if (!snapshots || snapshots.length > 41) return null;
  const tallest = Math.max(...values);
  const canvas = new FigureCanvas(language);
  const count = values.length;
  const slotWidth = 8.4 / count;
  const barWidth = slotWidth * 0.7;
  const left = 0.8;
  const baseY = 2.0;
  const tallestBar = 2.8;
  const step = Math.min(0.9, Math.max(0.35, 6.0 / snapshots.length));
  const times = frames(snapshots.length, 0.8, step);
  const slotCentre = (slot: number) => left + slotWidth * (slot + 0.5);
  canvas.line(left, baseY, left + slotWidth * count, baseY, { color: "muted" });
  // The bars, each sliding to its slot when the arrangement changes.
  for (let id = 0; id < count; id++) {
    const positions = snapshots.map((snapshot) => {
      const slot = snapshot.indexOf(id);
      return slot < 0 ? null : { x: slotCentre(slot) - barWidth / 2, y: 0 };
    });
    const moving = slide(positions, times, step * 0.7);
    if (!moving) return null;
    canvas.box(moving.x, baseY, barWidth, Math.max(0.15, (values[id]! / tallest) * tallestBar), { color: "accent" });
  }
  // Under them, the array as it stands: a number per slot, replaced when the move ends.
  for (let slot = 0; slot < count; slot++) {
    canvas.box(slotCentre(slot) - slotWidth * 0.42, baseY - 0.85, slotWidth * 0.84, 0.5, { color: "muted" });
    const contents = snapshots.map((snapshot) => shownValue(values[snapshot[slot]!], canvas));
    slotLabels(canvas, contents, times, { x: slotCentre(slot), y: baseY - 0.6 });
  }
  // Markers under the slots that change in each step.
  for (let frame = 1; frame < snapshots.length; frame++)
    for (let slot = 0; slot < count; slot++)
      if (snapshots[frame]![slot] !== snapshots[frame - 1]![slot])
        canvas.dot(slotCentre(slot), baseY - 1.2, {
          color: "second",
          visible: Anim.window(times[frame]! - step, times[frame]!),
        });
  const names: Record<string, [string, string]> = {
    bubble: ["Ordenação por bolha", "Bubble sort"],
    insertion: ["Ordenação por inserção", "Insertion sort"],
    merge: ["Ordenação por fusão", "Merge sort"],
    quick: ["Quicksort", "Quicksort"],
  };
  const name = names[algorithm] ? canvas.say(names[algorithm][0], names[algorithm][1]) : algorithm;
  canvas.caption(name, { row: 0, color: "accent", visible: Anim.after(0.2) });
  const moves = snapshots.length - 1;
  const lastTime = times[times.length - 1] ?? 0;
  canvas.caption(canvas.say(`${moves} passos`, `${moves} steps`), {
    row: 1,
    color: "white",
    visible: Anim.after(lastTime),
  });
  canvas.recordSteps(times);
  return canvas.illustration(title, Anim.duration(lastTime + 0.6));
};

const binarySearch: Compiler = (params, title, language) => {
  const values = params.numbers("values");
  const target = params.number("target");
  if (!values || values.length < 3 || values.length > 12 || target === null) return null;
  for (let i = 1; i < values.length; i++) if (!(values[i - 1]! < values[i]!)) return null;
  const trace = binarySearchTrace(values, target);
  const canvas = new FigureCanvas(language);
  const count = values.length;
  const cell = Math.min(0.8, 9.2 / count);
  const start = (10 - cell * count) / 2;
  const centre = (index: number) => start + cell * (index + 0.5);
  const rowY = 2.9;
  const rowHeight = 0.7;
  for (let index = 0; index < count; index++) {
    canvas.box(start + cell * index, rowY, cell, rowHeight, { color: "white" });
    canvas.label(shownValue(values[index], canvas) ?? "", centre(index), rowY + rowHeight / 2, {
      anchor: "center",
      color: "white",
    });
    canvas.label(String(index), centre(index), rowY - 0.32, { anchor: "center", color: "muted" });
  }
  const stepTime = 1.7;
  const begin = 0.8;
  const excluded = new Set<number>();
  trace.steps.forEach((step, number) => {
    const from = begin + stepTime * number;
    const to = from + stepTime;
    const live = Anim.window(from, to);
    // What this step has ruled out stays dimmed from now on.
    for (let index = 0; index < count; index++) {
      if (excluded.has(index) || (index >= step.low && index <= step.high)) continue;
      excluded.add(index);
      const left = start + cell * index;
      canvas.line(left, rowY, left + cell, rowY + rowHeight, { color: "muted", visible: Anim.after(from) });
      canvas.line(left, rowY + rowHeight, left + cell, rowY, { color: "muted", visible: Anim.after(from) });
    }
    canvas.label("lo", centre(step.low) - 0.04, rowY - 0.85, {
      anchor: "trailing",
      color: "second",
      visible: live,
      claim: false,
    });
    canvas.label("hi", centre(step.high) + 0.04, rowY - 0.85, {
      anchor: "leading",
      color: "second",
      visible: live,
      claim: false,
    });
    canvas.arrow(centre(step.middle), rowY + rowHeight + 0.85, centre(step.middle), rowY + rowHeight + 0.1, {
      color: "accent",
      visible: live,
    });
    canvas.label("mid", centre(step.middle), rowY + rowHeight + 1.15, {
      anchor: "center",
      color: "accent",
      visible: live,
      claim: false,
    });
    const middleValue = values[step.middle]!;
    const relation = middleValue === target ? "=" : middleValue < target ? "<" : ">";
    const outcome =
      middleValue === target
        ? canvas.say("encontrado", "found")
        : middleValue < target
          ? canvas.say("procurar à direita", "search right")
          : canvas.say("procurar à esquerda", "search left");
    canvas.label(
      `mid = ${step.middle}: ${canvas.number(middleValue)} ${relation} ${canvas.number(target)} → ${outcome}`,
      5.0,
      5.45,
      { anchor: "center", color: "white", visible: live, claim: false },
    );
  });
  const end = begin + stepTime * trace.steps.length;
  const shown = Anim.after(end);
  if (trace.found !== null) {
    canvas.box(start + cell * trace.found, rowY, cell, rowHeight, { color: "accent", visible: shown });
    canvas.caption(
      canvas.say(
        `Encontrado no índice ${trace.found} em ${trace.steps.length} passos`,
        `Found at index ${trace.found} in ${trace.steps.length} steps`,
      ),
      { row: 1, color: "accent", visible: shown },
    );
  } else
    canvas.caption(
      canvas.say(`${canvas.number(target)} não está na lista`, `${canvas.number(target)} is not in the list`),
      { row: 1, color: "accent", visible: shown },
    );
  canvas.recordSteps([0, ...trace.steps.map((_, index) => begin + stepTime * (index + 1))]);
  return canvas.illustration(title, Anim.duration(end + 0.6));
};

const linkedList: Compiler = (params, title, language) => {
  const canvas = new FigureCanvas(language);
  const values = shownValues(params, "values", canvas, 4);
  if (!values || values.length < 1 || values.length > 6) return null;
  const operation = params.text("operation") ?? "traverse";
  const index = Math.trunc(params.number("index") ?? 0);
  const newValue = params.has("value") ? shownValue(params.figure.params["value"], canvas) : null;
  const result = linkedListAfter(values, operation, index, newValue);
  if (!result || (newValue !== null && Array.from(newValue).length > 4)) return null;
  const count = values.length;
  const slots = Math.max(count, result.length);
  const pitch = Math.min(1.5, 7.0 / (slots + 1));
  const width = pitch * 0.64;
  const height = 0.7;
  const rowY = 3.2;
  const lowY = 1.7;
  const slotX = (slot: number) => 2.2 + pitch * slot;
  const headID = -1;
  const nullID = -2;
  // Frames: where each node is, and which links exist, step by step.
  const nodePositions = new Map<number, (Point | null)[]>();
  let links: { from: number; to: number }[][] = [];
  let frameCount = 0;
  const chain = (ids: number[]) => {
    const sequence = [headID, ...ids, nullID];
    return sequence.slice(0, -1).map((from, i) => ({ from, to: sequence[i + 1]! }));
  };
  const ids = Array.from({ length: count }, (_, i) => i);
  if (operation === "insert") {
    const newID = count;
    frameCount = 4;
    for (const id of ids) {
      const slot = id < index ? id : id + 1;
      nodePositions.set(
        id,
        Array.from({ length: frameCount }, () => ({ x: slotX(slot), y: rowY })),
      );
    }
    nodePositions.set(newID, [
      null,
      { x: slotX(index), y: lowY },
      { x: slotX(index), y: lowY },
      { x: slotX(index), y: rowY },
    ]);
    const before = [...ids.slice(0, index), newID, ...ids.slice(index)];
    links = [chain(ids), chain(ids), chain(before), chain(before)];
  } else if (operation === "delete") {
    frameCount = 4;
    for (const id of ids) {
      const track: (Point | null)[] = [];
      for (let frame = 0; frame < frameCount; frame++) {
        const slot = frame === 3 && id > index ? id - 1 : id;
        if (id === index)
          track.push(frame === 0 ? { x: slotX(slot), y: rowY } : frame === 1 ? { x: slotX(slot), y: lowY } : null);
        else track.push({ x: slotX(slot), y: rowY });
      }
      nodePositions.set(id, track);
    }
    const after = ids.filter((id) => id !== index);
    links = [chain(ids), chain(after), chain(after), chain(after)];
  } else {
    frameCount = count;
    for (const id of ids)
      nodePositions.set(
        id,
        Array.from({ length: frameCount }, () => ({ x: slotX(id), y: rowY })),
      );
    links = Array.from({ length: frameCount }, () => chain(ids));
  }
  const step = operation === "traverse" ? 0.9 : 1.2;
  const times = frames(frameCount, 0.8, step);
  const move = step * 0.7;
  const headPoint = { x: 0.9, y: rowY };
  const nullPoint = { x: slotX(slots), y: rowY };
  // Where a link meets a node: its right side to leave it, its left side to arrive.
  const edge = (id: number, frame: number, towards: boolean): Point | null => {
    if (id === headID) return { x: headPoint.x + 0.4, y: headPoint.y };
    if (id === nullID) return { x: nullPoint.x - 0.3, y: nullPoint.y };
    const position = nodePositions.get(id)?.[frame];
    return position ? { x: position.x + (towards ? -width / 2 : width / 2), y: position.y } : null;
  };
  canvas.label(canvas.say("cabeça", "head"), headPoint.x, headPoint.y, { anchor: "center", color: "white" });
  canvas.label(canvas.say("nulo", "null"), nullPoint.x, nullPoint.y, { anchor: "center", color: "muted" });
  for (const id of [...nodePositions.keys()].sort((a, b) => a - b)) {
    const track = nodePositions.get(id)!;
    const corners = track.map((p) => (p ? { x: p.x - width / 2, y: p.y - height / 2 } : null));
    const body = slide(corners, times, move);
    const text = slide(track, times, move);
    if (!body || !text) continue;
    const label = id < count ? values[id]! : (newValue ?? "");
    canvas.box(body.x, body.y, width, height, { color: id >= count ? "accent" : "white", visible: body.visible });
    canvas.movingLabel(label, text.x, text.y, { anchor: "center", color: "white", visible: text.visible });
  }
  // Links, each from the moment it exists to the moment it is replaced.
  const seen = new Set<string>();
  for (const frameLinks of links)
    for (const link of frameLinks) {
      const key = `${link.from}>${link.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const tails: (Point | null)[] = [];
      const heads: (Point | null)[] = [];
      for (let frame = 0; frame < frameCount; frame++) {
        const present = links[frame]!.some((other) => other.from === link.from && other.to === link.to);
        tails.push(present ? edge(link.from, frame, false) : null);
        heads.push(present ? edge(link.to, frame, true) : null);
      }
      const tail = slide(tails, times, move);
      const head = slide(heads, times, move);
      if (!tail || !head) continue;
      canvas.arrow(tail.x, tail.y, head.x, head.y, { color: "white", visible: tail.visible });
    }
  if (operation === "traverse") {
    const track = Array.from({ length: frameCount }, (_, frame) => ({
      x: slotX(frame) - width / 2 - 0.08,
      y: rowY - height / 2 - 0.08,
    }));
    const box = slide(track, times, move);
    if (box) canvas.box(box.x, box.y, width + 0.16, height + 0.16, { color: "accent" });
  }
  const caption =
    operation === "insert"
      ? canvas.say(`Inserir ${newValue ?? ""} na posição ${index}`, `Insert ${newValue ?? ""} at position ${index}`)
      : operation === "delete"
        ? canvas.say(`Remover o nó da posição ${index}`, `Delete the node at position ${index}`)
        : canvas.say("Percorrer a lista", "Traverse the list");
  canvas.caption(caption, { row: 0, color: "accent", visible: Anim.after(0.2) });
  canvas.recordSteps(times);
  return canvas.illustration(title, Anim.duration((times[times.length - 1] ?? 0) + 0.6));
};

const stackQueue: Compiler = (params, title, language) => {
  const kind = params.text("kind") ?? "stack";
  const entries = Premade.array(params.figure.params["operations"]);
  if (!entries || entries.length < 1 || entries.length > 10) return null;
  const operations: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== "string") return null;
    operations.push(entry);
  }
  const trace = simulateStackQueue(kind, operations);
  if (!trace) return null;
  const canvas = new FigureCanvas(language);
  const isStack = kind === "stack";
  const slotPoint = (slot: number): Point => (isStack ? { x: 2.6, y: 1.57 + 0.62 * slot } : { x: 1.9 + slot, y: 3.0 });
  const entryPoint = isStack ? { x: 2.6, y: 5.4 } : { x: 9.2, y: 3.0 };
  const exitPoint = isStack ? { x: 2.6, y: 5.4 } : { x: 0.9, y: 3.0 };
  const itemWidth = isStack ? 0.9 : 0.86;
  const itemHeight = isStack ? 0.56 : 0.86;
  // The container.
  if (isStack) {
    canvas.line(2.05, 1.2, 2.05, 5.0, { color: "muted" });
    canvas.line(3.15, 1.2, 3.15, 5.0, { color: "muted" });
    canvas.line(2.05, 1.2, 3.15, 1.2, { color: "muted" });
    canvas.label(canvas.say("Pilha (LIFO)", "Stack (LIFO)"), 5.3, 0.5, { anchor: "center", color: "white" });
  } else {
    canvas.line(1.4, 3.55, 8.4, 3.55, { color: "muted" });
    canvas.line(1.4, 2.45, 8.4, 2.45, { color: "muted" });
    canvas.label(canvas.say("frente", "front"), 1.9, 1.95, { anchor: "center", color: "white" });
    canvas.label(canvas.say("trás", "back"), 7.9, 1.95, { anchor: "center", color: "white" });
    canvas.label(canvas.say("Fila (FIFO)", "Queue (FIFO)"), 5.3, 0.5, { anchor: "center", color: "white" });
  }
  // Two frames per operation: the item travels to or from the container, then everything settles.
  const frameList: Map<number, Point>[] = [new Map()];
  for (let index = 0; index < operations.length; index++) {
    const before = trace.idStates[index]!;
    const after = trace.idStates[index + 1]!;
    const travelling = new Map(frameList[frameList.length - 1]!);
    let settled: Map<number, Point>;
    const added = after.length > before.length ? after.find((id) => !before.includes(id)) : undefined;
    const removed = before.find((id) => !after.includes(id));
    if (added !== undefined) {
      travelling.set(added, entryPoint);
      settled = new Map(travelling);
    } else if (removed !== undefined) {
      travelling.set(removed, exitPoint);
      settled = new Map(travelling);
      settled.delete(removed);
    } else settled = new Map(travelling);
    after.forEach((id, slot) => settled.set(id, slotPoint(slot)));
    frameList.push(travelling, settled);
  }
  const step = Math.min(0.8, Math.max(0.4, 7.0 / frameList.length));
  const times = frames(frameList.length, 0.8, step);
  for (let id = 0; id < trace.values.length; id++) {
    const track = frameList.map((frame) => frame.get(id) ?? null);
    const corners = track.map((p) => (p ? { x: p.x - itemWidth / 2, y: p.y - itemHeight / 2 } : null));
    const body = slide(corners, times, step * 0.7);
    const text = slide(track, times, step * 0.7);
    if (!body || !text) continue;
    canvas.box(body.x, body.y, itemWidth, itemHeight, { color: "accent", visible: body.visible });
    canvas.movingLabel(trace.values[id]!, text.x, text.y, { anchor: "center", color: "white", visible: text.visible });
  }
  trace.captions.forEach((caption, index) => {
    const begin = times[2 * index]! + 0.05;
    const end = index === trace.captions.length - 1 ? (times[times.length - 1] ?? 0) + 4 : times[2 * index + 2]!;
    canvas.label(caption, 7.0, 5.5, {
      anchor: "center",
      color: "accent",
      visible: Anim.window(begin, end),
      claim: false,
    });
  });
  canvas.recordSteps(times);
  return canvas.illustration(title, Anim.duration((times[times.length - 1] ?? 0) + 0.6));
};

const hashTable: Compiler = (params, title, language) => {
  const sizeValue = params.number("size");
  const size = sizeValue === null ? null : Math.trunc(sizeValue);
  const numbers = params.numbers("keys");
  if (
    size === null ||
    size < 3 ||
    size > 8 ||
    !numbers ||
    numbers.length < 2 ||
    numbers.length > 10 ||
    !numbers.every((n) => n === Math.round(n) && Math.abs(n) < 10_000)
  )
    return null;
  const keys = numbers.map((n) => Math.trunc(n));
  if (!hashBuckets(keys, size).every((bucket) => bucket.length <= 6)) return null;
  const canvas = new FigureCanvas(language);
  const pitchY = Math.min(0.62, 3.9 / size);
  const rowY = (bucket: number) => 4.7 - pitchY * bucket;
  const entryX = (position: number) => 3.1 + 1.15 * position;
  for (let bucket = 0; bucket < size; bucket++) {
    canvas.box(1.2, rowY(bucket) - 0.25, 0.7, 0.5, { color: "muted" });
    canvas.label(String(bucket), 1.55, rowY(bucket), { anchor: "center", color: "white" });
  }
  const step = 1.4;
  const begin = 0.8;
  const chains: number[][] = Array.from({ length: size }, () => []);
  keys.forEach((key, index) => {
    const bucket = ((key % size) + size) % size;
    const from = begin + step * index;
    const to = from + step;
    const position = chains[bucket]!.length;
    chains[bucket]!.push(key);
    const shownKey = String(key).replace(/-/g, "−");
    canvas.label(`h(${shownKey}) = ${shownKey} mod ${size} = ${bucket}`, 5.3, 5.5, {
      anchor: "center",
      color: "accent",
      visible: Anim.window(from, to),
      claim: false,
    });
    canvas.box(1.2, rowY(bucket) - 0.25, 0.7, 0.5, { color: "accent", visible: Anim.window(from, from + 0.7) });
    const shown = Anim.after(from + 0.7);
    const tail = position === 0 ? 1.9 : entryX(position - 1) + 0.45;
    canvas.arrow(tail, rowY(bucket), entryX(position) - 0.45, rowY(bucket), { color: "white", visible: shown });
    canvas.box(entryX(position) - 0.45, rowY(bucket) - 0.25, 0.9, 0.5, { color: "white", visible: shown });
    canvas.label(shownKey, entryX(position), rowY(bucket), {
      anchor: "center",
      color: "white",
      visible: shown,
      claim: false,
    });
  });
  const end = begin + step * keys.length;
  canvas.caption(
    canvas.say(`Tabela de dispersão com encadeamento (m = ${size})`, `Hash table with chaining (m = ${size})`),
    { row: 1, color: "white", visible: Anim.after(0.2) },
  );
  canvas.recordSteps([0, ...keys.map((_, index) => begin + step * (index + 1))]);
  return canvas.illustration(title, Anim.duration(end + 0.6));
};

/** The algorithm figures, by premade type. */
export const algorithmFigures: Record<string, Compiler> = {
  arrayBars,
  binarySearch,
  linkedList,
  stackQueue,
  hashTable,
};
