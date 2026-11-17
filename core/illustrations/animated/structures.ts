// Port of LearnLayer/Illustrations/PremadeFigureAnimatedStructures.swift @ ref 2026-11-04: a binary search tree built
// insertion by insertion (and walked in order, pre-order or post-order), a heap that sifts up and down, BFS, DFS and
// Dijkstra on a small graph, and the growth of T(n). The app runs each structure itself.

import { Premade, type PremadeValue } from "../premadeFigure";
import { frames, shownValue, slide, slotLabels } from "./algorithms";
import { Anim, FigureCanvas, Params, PlottedFunction, PremadeFrame, type AnimatedIllustration } from "./figureCanvas";

interface Point {
  x: number;
  y: number;
}

// MARK: Binary search tree

export class BinarySearchTree {
  private constructor(
    readonly values: number[],
    readonly left: (number | null)[],
    readonly right: (number | null)[],
    readonly parent: (number | null)[],
  ) {}

  /** The tree made by inserting the values in order; null when empty or when a value repeats. */
  static inserting(inputs: number[]): BinarySearchTree | null {
    if (inputs.length === 0) return null;
    const left: (number | null)[] = inputs.map(() => null);
    const right: (number | null)[] = inputs.map(() => null);
    const parent: (number | null)[] = inputs.map(() => null);
    for (let index = 1; index < inputs.length; index++) {
      let current = 0;
      for (;;) {
        if (inputs[index] === inputs[current]) return null;
        const side = inputs[index]! < inputs[current]! ? left : right;
        const next = side[current];
        if (next !== null && next !== undefined) current = next;
        else {
          side[current] = index;
          parent[index] = current;
          break;
        }
      }
    }
    return new BinarySearchTree(inputs, left, right, parent);
  }

  /** Node indices (in insertion order) left, node, right. */
  inorder(node: number | null = 0): number[] {
    return node === null ? [] : [...this.inorder(this.left[node]!), node, ...this.inorder(this.right[node]!)];
  }

  preorder(node: number | null = 0): number[] {
    return node === null ? [] : [node, ...this.preorder(this.left[node]!), ...this.preorder(this.right[node]!)];
  }

  postorder(node: number | null = 0): number[] {
    return node === null ? [] : [...this.postorder(this.left[node]!), ...this.postorder(this.right[node]!), node];
  }

  /** Nodes from the root down to the node's parent: what an insertion compared against. */
  ancestors(node: number): number[] {
    const chain: number[] = [];
    let current = this.parent[node] ?? null;
    while (current !== null) {
      chain.unshift(current);
      current = this.parent[current] ?? null;
    }
    return chain;
  }

  depth(node: number): number {
    return this.ancestors(node).length;
  }

  get height(): number {
    return Math.max(0, ...this.values.map((_, index) => this.depth(index)));
  }
}

// MARK: Heap

export interface HeapEvent {
  /** "insert", "swap" or "extract". */
  kind: string;
  first: number;
  second: number;
}

export interface HeapTrace {
  /** Item index per slot after each step; null for an empty slot. */
  frames: (number | null)[][];
  /** What happened to reach each frame; the first frame has none. */
  events: HeapEvent[];
  /** Frames at which an operation is complete and the heap property must hold. */
  settled: number[];
}

/** Builds a heap by inserting the values one by one (sifting up), then optionally extracts the root (sifting down). */
export function heapTrace(values: number[], isMin: boolean, extract: boolean): HeapTrace | null {
  if (values.length < 2) return null;
  const better = (a: number, b: number) => (isMin ? values[a]! < values[b]! : values[a]! > values[b]!);
  const slots: number[] = [];
  const framesList: (number | null)[][] = [];
  const events: HeapEvent[] = [];
  const settled: number[] = [];
  const snapshot = () => values.map((_, index) => (index < slots.length ? slots[index]! : null));
  const swap = (a: number, b: number) => ([slots[a], slots[b]] = [slots[b]!, slots[a]!]);
  framesList.push(snapshot());
  values.forEach((_, item) => {
    slots.push(item);
    framesList.push(snapshot());
    events.push({ kind: "insert", first: values[item]!, second: 0 });
    let index = slots.length - 1;
    while (index > 0 && better(slots[index]!, slots[Math.trunc((index - 1) / 2)]!)) {
      const up = Math.trunc((index - 1) / 2);
      events.push({ kind: "swap", first: values[slots[index]!]!, second: values[slots[up]!]! });
      swap(index, up);
      framesList.push(snapshot());
      index = up;
    }
    settled.push(framesList.length - 1);
  });
  if (extract && slots.length > 0) {
    events.push({ kind: "extract", first: values[slots[0]!]!, second: 0 });
    const last = slots.pop()!;
    if (slots.length > 0) slots[0] = last;
    framesList.push(snapshot());
    let index = 0;
    for (;;) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let best = index;
      if (leftChild < slots.length && better(slots[leftChild]!, slots[best]!)) best = leftChild;
      if (rightChild < slots.length && better(slots[rightChild]!, slots[best]!)) best = rightChild;
      if (best === index) break;
      events.push({ kind: "swap", first: values[slots[index]!]!, second: values[slots[best]!]! });
      swap(index, best);
      framesList.push(snapshot());
      index = best;
    }
    settled.push(framesList.length - 1);
  }
  return framesList.length <= 46 ? { frames: framesList, events, settled } : null;
}

// MARK: Graph

export interface GraphEdge {
  from: number;
  to: number;
  weight: number;
}

export interface GraphModel {
  names: string[];
  edges: GraphEdge[];
  directed: boolean;
}

/** Neighbours of a node with the edge weight, in the order of their indices. */
export function neighbours(graph: GraphModel, node: number): { node: number; weight: number }[] {
  const result: { node: number; weight: number }[] = [];
  for (const edge of graph.edges) {
    if (edge.from === node) result.push({ node: edge.to, weight: edge.weight });
    if (!graph.directed && edge.to === node) result.push({ node: edge.from, weight: edge.weight });
  }
  return result.sort((a, b) => a.node - b.node);
}

export interface DistanceUpdate {
  node: number;
  distance: number;
  afterStep: number;
}

export interface GraphRun {
  /** Nodes in the order they are visited (settled, for Dijkstra). */
  order: number[];
  parents: (number | null)[];
  /** Dijkstra only: the best distance found for each node (infinity when unreached). */
  distances: number[];
  /** Dijkstra only: (node, distance, the settle step after which it was found), in order. */
  updates: DistanceUpdate[];
}

export function graphRun(graph: GraphModel, algorithm: string, source: number): GraphRun | null {
  const count = graph.names.length;
  if (source < 0 || source >= count) return null;
  const run: GraphRun = {
    order: [],
    parents: graph.names.map(() => null),
    distances: graph.names.map(() => Infinity),
    updates: [],
  };
  switch (algorithm) {
    case "bfs": {
      const seen = new Set([source]);
      const queue = [source];
      while (queue.length > 0) {
        const node = queue.shift()!;
        run.order.push(node);
        for (const next of neighbours(graph, node)) {
          if (seen.has(next.node)) continue;
          seen.add(next.node);
          run.parents[next.node] = node;
          queue.push(next.node);
        }
      }
      break;
    }
    case "dfs": {
      const seen = new Set<number>();
      const visit = (node: number, origin: number | null) => {
        seen.add(node);
        run.parents[node] = origin;
        run.order.push(node);
        for (const next of neighbours(graph, node)) if (!seen.has(next.node)) visit(next.node, node);
      };
      visit(source, null);
      break;
    }
    case "dijkstra": {
      if (!graph.edges.every((edge) => edge.weight >= 0)) return null;
      run.distances[source] = 0;
      run.updates.push({ node: source, distance: 0, afterStep: -1 });
      const done = new Set<number>();
      while (done.size < count) {
        let best: number | null = null;
        for (let node = 0; node < count; node++)
          if (!done.has(node) && Number.isFinite(run.distances[node]!))
            if (best === null || run.distances[node]! < run.distances[best]!) best = node;
        if (best === null) break;
        const node = best;
        done.add(node);
        run.order.push(node);
        for (const next of neighbours(graph, node)) {
          if (done.has(next.node)) continue;
          const candidate = run.distances[node]! + next.weight;
          if (candidate < run.distances[next.node]!) {
            run.distances[next.node] = candidate;
            run.parents[next.node] = node;
            run.updates.push({ node: next.node, distance: candidate, afterStep: run.order.length - 1 });
          }
        }
      }
      break;
    }
    default:
      return null;
  }
  return run;
}

// MARK: Complexity

export const complexityNames = ["1", "log n", "n", "n log n", "n²", "n³", "2ⁿ"];

/** T(n) for a growth rate, null for an unknown name. */
export function complexityValue(name: string, n: number): number | null {
  switch (name) {
    case "1":
      return 1;
    case "log n":
      return n > 0 ? Math.log2(n) : null;
    case "n":
      return n;
    case "n log n":
      return n > 0 ? n * Math.log2(n) : null;
    case "n²":
      return n * n;
    case "n³":
      return n * n * n;
    case "2ⁿ":
      return Math.pow(2, n);
    default:
      return null;
  }
}

export function complexityName(text: string): string | null {
  const compact = text.toLowerCase().split(" ").join("");
  const names: Record<string, string> = {
    "1": "1",
    "o(1)": "1",
    logn: "log n",
    "log(n)": "log n",
    lgn: "log n",
    n: "n",
    "o(n)": "n",
    nlogn: "n log n",
    "nlog(n)": "n log n",
    "n*logn": "n log n",
    "n^2": "n²",
    "n²": "n²",
    n2: "n²",
    "n^3": "n³",
    "n³": "n³",
    n3: "n³",
    "2^n": "2ⁿ",
    "2ⁿ": "2ⁿ",
  };
  return names[compact] ?? null;
}

function complexityText(name: string): string {
  const texts: Record<string, string> = {
    "1": "1",
    "log n": "ln(x)/ln(2)",
    n: "x",
    "n log n": "x*ln(x)/ln(2)",
    "n²": "x^2",
    "n³": "x^3",
  };
  return texts[name] ?? "2^x";
}

// MARK: The figures

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

const binaryTree: Compiler = (params, title, language) => {
  const inputs = params.numbers("values");
  if (!inputs || inputs.length < 2 || inputs.length > 9) return null;
  const tree = BinarySearchTree.inserting(inputs);
  if (!tree || tree.height > 4) return null;
  const traversal = params.text("traversal") ?? "none";
  if (!["none", "inorder", "preorder", "postorder"].includes(traversal)) return null;
  const canvas = new FigureCanvas(language);
  const count = inputs.length;
  const radius = 0.3;
  const rankOf = new Map(tree.inorder().map((node, rank) => [node, rank]));
  const dx = 8.2 / count;
  const dy = Math.min(0.95, 3.5 / Math.max(tree.height, 1));
  const place = (node: number): Point => ({
    x: 0.9 + dx * ((rankOf.get(node) ?? 0) + 0.5),
    y: 4.6 - dy * tree.depth(node),
  });
  const text = (node: number) => shownValue(inputs[node], canvas) ?? "";
  // Each insertion walks down from the root, comparing, then the node appears.
  let clock = 0.8;
  const boundaries = [0];
  for (let node = 0; node < count; node++) {
    const path = tree.ancestors(node);
    path.forEach((ancestor, step) => {
      const from = clock + 0.55 * step;
      const to = from + 0.55;
      canvas.ring(place(ancestor).x, place(ancestor).y, radius + 0.08, {
        color: "second",
        visible: Anim.window(from, to),
      });
      const smaller = inputs[node]! < inputs[ancestor]!;
      const words = canvas.say(smaller ? "esquerda" : "direita", smaller ? "left" : "right");
      canvas.label(`${text(node)} ${smaller ? "<" : ">"} ${text(ancestor)} → ${words}`, 5.3, 5.5, {
        anchor: "center",
        color: "white",
        visible: Anim.window(from, to),
        claim: false,
      });
    });
    const appears = clock + 0.55 * path.length + 0.05;
    const shown = Anim.after(appears);
    const here = place(node);
    const up = tree.parent[node];
    if (up !== null && up !== undefined) {
      const there = place(up);
      const length = Math.hypot(here.x - there.x, here.y - there.y);
      const ux = (here.x - there.x) / length;
      const uy = (here.y - there.y) / length;
      canvas.line(there.x + ux * radius, there.y + uy * radius, here.x - ux * radius, here.y - uy * radius, {
        color: "white",
        visible: shown,
      });
    }
    canvas.ring(here.x, here.y, radius, { color: node === count - 1 ? "accent" : "white", visible: shown });
    canvas.label(text(node), here.x, here.y, { anchor: "center", color: "white", visible: shown });
    clock = appears + 0.6;
    boundaries.push(clock);
  }
  const end = clock;
  if (traversal !== "none") {
    const order =
      traversal === "inorder" ? tree.inorder() : traversal === "preorder" ? tree.preorder() : tree.postorder();
    order.forEach((node, step) => {
      const from = end + 0.6 * step;
      canvas.ring(place(node).x, place(node).y, radius + 0.08, {
        color: "accent",
        visible: Anim.window(from, from + 0.6),
      });
      boundaries.push(from + 0.6);
    });
    const names: Record<string, [string, string]> = {
      inorder: ["Em ordem", "In-order"],
      preorder: ["Pré-ordem", "Pre-order"],
      postorder: ["Pós-ordem", "Post-order"],
    };
    const name = canvas.say(names[traversal]![0], names[traversal]![1]);
    canvas.caption(`${name}: ` + order.map(text).join(" "), {
      row: 1,
      color: "accent",
      visible: Anim.after(end + 0.6 * order.length),
    });
    canvas.recordSteps(boundaries);
    return canvas.illustration(title, Anim.duration(end + 0.6 * order.length + 0.6));
  }
  canvas.caption(canvas.say("Árvore binária de pesquisa", "Binary search tree"), {
    row: 1,
    color: "white",
    visible: Anim.after(0.2),
  });
  canvas.recordSteps(boundaries);
  return canvas.illustration(title, Anim.duration(end + 0.6));
};

const heap: Compiler = (params, title, language) => {
  const values = params.numbers("values");
  if (!values || values.length < 3 || values.length > 10) return null;
  const kind = params.text("kind") ?? "min";
  if (kind !== "min" && kind !== "max") return null;
  const extract = Premade.bool(params.figure.params["extract"]) ?? false;
  const trace = heapTrace(values, kind === "min", extract);
  if (!trace) return null;
  const canvas = new FigureCanvas(language);
  const step = Math.min(0.8, Math.max(0.4, 7.0 / trace.frames.length));
  const times = frames(trace.frames.length, 0.8, step);
  const move = step * 0.75;
  const count = values.length;
  const treePoint = (slot: number): Point => {
    let level = 0;
    while ((1 << (level + 1)) - 1 <= slot) level += 1;
    const first = (1 << level) - 1;
    const across = slot - first + 0.5;
    return { x: 0.6 + (across / (1 << level)) * 8.8, y: 4.75 - 0.85 * level };
  };
  const cellPoint = (slot: number): Point => ({ x: 0.9 + ((slot + 0.5) * 8.8) / count, y: 1.2 });
  // Edges, shown while the child slot is occupied.
  for (let slot = 1; slot < count; slot++) {
    let runStart: number | null = null;
    for (let frame = 0; frame <= trace.frames.length; frame++) {
      const occupied = frame < trace.frames.length && trace.frames[frame]![slot] !== null;
      if (occupied && runStart === null) runStart = frame;
      if (!occupied && runStart !== null) {
        const begin = runStart;
        runStart = null;
        const parent = treePoint(Math.trunc((slot - 1) / 2));
        const child = treePoint(slot);
        const length = Math.hypot(child.x - parent.x, child.y - parent.y);
        const ux = (child.x - parent.x) / length;
        const uy = (child.y - parent.y) / length;
        const appears = begin === 0 ? null : times[begin]! - move;
        const vanishes = frame === trace.frames.length ? null : times[frame]! - move;
        const visible =
          appears === null && vanishes === null
            ? null
            : appears === null
              ? `${Anim.n(vanishes!)}-t`
              : vanishes === null
                ? Anim.after(appears)
                : Anim.window(appears, vanishes);
        canvas.line(parent.x + ux * 0.3, parent.y + uy * 0.3, child.x - ux * 0.3, child.y - uy * 0.3, {
          color: "muted",
          visible,
        });
      }
    }
  }
  for (let slot = 0; slot < count; slot++) {
    const cell = cellPoint(slot);
    canvas.box(cell.x - 0.4, cell.y - 0.25, 0.8, 0.5, { color: "muted" });
  }
  for (let item = 0; item < count; item++) {
    const text = shownValue(values[item], canvas) ?? "";
    const tree = trace.frames.map((frame) => {
      const slot = frame.indexOf(item);
      return slot < 0 ? null : treePoint(slot);
    });
    const node = slide(tree, times, move, 0.4);
    if (!node) continue;
    canvas.ring(node.x, node.y, 0.3, { color: "accent", visible: node.visible });
    canvas.movingLabel(text, node.x, node.y, { anchor: "center", color: "white", visible: node.visible });
  }
  // The array under the tree reads by slot and changes when a move ends.
  for (let slot = 0; slot < count; slot++) {
    const contents = trace.frames.map((frame) => {
      const item = frame[slot];
      return item === null || item === undefined ? null : shownValue(values[item], canvas);
    });
    slotLabels(canvas, contents, times, cellPoint(slot));
  }
  trace.events.forEach((event, index) => {
    const begin = times[index]! + 0.05;
    const end = index === trace.events.length - 1 ? (times[times.length - 1] ?? 0) + 4 : times[index + 1]!;
    const first = shownValue(event.first, canvas) ?? "";
    const second = shownValue(event.second, canvas) ?? "";
    const text =
      event.kind === "insert"
        ? canvas.say(`inserir ${first}`, `insert ${first}`)
        : event.kind === "extract"
          ? canvas.say(`extrair a raiz (${first})`, `extract the root (${first})`)
          : canvas.say(`trocar ${first} ↔ ${second}`, `swap ${first} ↔ ${second}`);
    canvas.label(text, 5.3, 5.5, { anchor: "center", color: "accent", visible: Anim.window(begin, end), claim: false });
  });
  canvas.label(
    kind === "min" ? canvas.say("Heap de mínimo", "Min-heap") : canvas.say("Heap de máximo", "Max-heap"),
    0.4,
    5.5,
    {
      anchor: "leading",
      color: "white",
      visible: Anim.after(0.2),
    },
  );
  canvas.recordSteps(times);
  return canvas.illustration(title, Anim.duration((times[times.length - 1] ?? 0) + 0.6));
};

function graphModel(params: Params, canvas: FigureCanvas): GraphModel | null {
  const entries = Premade.array(params.figure.params["nodes"]);
  if (!entries || entries.length < 2 || entries.length > 8) return null;
  const names: string[] = [];
  for (const entry of entries) {
    const name = shownValue(entry, canvas);
    if (name === null || Array.from(name).length > 3 || names.includes(name)) return null;
    names.push(name);
  }
  const objects = params.objects("edges");
  if (!objects || objects.length < 1 || objects.length > 14) return null;
  const edges: GraphEdge[] = [];
  const nameOf = (value: PremadeValue | undefined) => (value === undefined ? null : shownValue(value, canvas));
  for (const object of objects) {
    const fromName = nameOf(object["from"]);
    const toName = nameOf(object["to"]);
    const from = fromName === null ? -1 : names.indexOf(fromName);
    const to = toName === null ? -1 : names.indexOf(toName);
    if (from < 0 || to < 0 || from === to) return null;
    const weight = Premade.number(object["weight"]) ?? 1;
    if (!Number.isFinite(weight) || weight < 0 || weight >= 1000) return null;
    edges.push({ from, to, weight });
  }
  return { names, edges, directed: Premade.bool(params.figure.params["directed"]) ?? false };
}

const graph: Compiler = (params, title, language) => {
  const canvas = new FigureCanvas(language);
  const model = graphModel(params, canvas);
  if (!model) return null;
  const algorithm = params.text("algorithm") ?? "bfs";
  const sourceName =
    (params.has("source") ? shownValue(params.figure.params["source"], canvas) : null) ?? model.names[0]!;
  const source = model.names.indexOf(sourceName);
  const run = source < 0 ? null : graphRun(model, algorithm, source);
  if (!run) return null;
  const count = model.names.length;
  const radius = 0.32;
  const centre = { x: 5.0, y: 2.95 };
  const place = (node: number): Point => {
    const angle = Math.PI / 2 - (2 * Math.PI * node) / count;
    return { x: centre.x + 3.6 * Math.cos(angle), y: centre.y + 1.55 * Math.sin(angle) };
  };
  // Nodes and their names claim their room first.
  for (let node = 0; node < count; node++) {
    const here = place(node);
    canvas.ring(here.x, here.y, radius, { color: "white" });
    canvas.label(model.names[node]!, here.x, here.y, { anchor: "center", color: "white" });
  }
  const weighted = algorithm === "dijkstra" || model.edges.some((edge) => edge.weight !== 1);
  // Marks beside the nodes (visit numbers or distances) are placed before the edge weights.
  const outside = (node: number): Point => {
    const here = place(node);
    const dx = here.x - centre.x;
    const dy = (here.y - centre.y) * 2;
    const length = Math.max(Math.hypot(dx, dy), 1e-9);
    return { x: here.x + (dx / length) * 0.62, y: here.y + (dy / length) * 0.62 };
  };
  for (const edge of model.edges) {
    const a = place(edge.from);
    const b = place(edge.to);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    if (model.directed)
      canvas.arrow(a.x + ux * radius, a.y + uy * radius, b.x - ux * radius, b.y - uy * radius, { color: "muted" });
    else canvas.line(a.x + ux * radius, a.y + uy * radius, b.x - ux * radius, b.y - uy * radius, { color: "muted" });
  }
  const step = algorithm === "dijkstra" ? 1.6 : 1.1;
  const begin = 0.8;
  run.order.forEach((node, rank) => {
    const time = begin + step * rank;
    const here = place(node);
    canvas.ring(here.x, here.y, radius, { color: "accent", visible: Anim.after(time) });
    const up = run.parents[node];
    if (up !== null && up !== undefined) {
      const a = place(up);
      const length = Math.hypot(here.x - a.x, here.y - a.y);
      const ux = (here.x - a.x) / length;
      const uy = (here.y - a.y) / length;
      canvas.line(a.x + ux * radius, a.y + uy * radius, here.x - ux * radius, here.y - uy * radius, {
        color: "accent",
        visible: Anim.after(time),
      });
    }
    if (algorithm !== "dijkstra") {
      const mark = outside(node);
      canvas.label(String(rank + 1), mark.x, mark.y, { anchor: "center", color: "accent", visible: Anim.after(time) });
    }
  });
  if (algorithm === "dijkstra") {
    // Each node shows its best distance so far; a new one replaces the last. A relaxation shows 0.6 s after its node is
    // settled.
    const shownAt = (update: DistanceUpdate) => (update.afterStep < 0 ? 0.2 : begin + step * update.afterStep + 0.6);
    for (let node = 0; node < count; node++) {
      const versions = run.updates.filter((update) => update.node === node);
      versions.forEach((update, index) => {
        const from = shownAt(update);
        const visible =
          index + 1 < versions.length ? Anim.window(from, shownAt(versions[index + 1]!)) : Anim.after(from);
        const mark = outside(node);
        // The versions of one node take turns in the same place, so only the first claims it.
        canvas.label(canvas.number(update.distance), mark.x, mark.y, {
          anchor: "center",
          color: "accent",
          visible,
          claim: index === 0,
        });
      });
    }
  }
  if (weighted)
    for (const edge of model.edges) {
      const a = place(edge.from);
      const b = place(edge.to);
      canvas.labelBeside(canvas.number(edge.weight), (a.x + b.x) / 2, (a.y + b.y) / 2, { color: "white" });
    }
  const end = begin + step * run.order.length;
  const heading =
    algorithm === "bfs"
      ? canvas.say("BFS (largura)", "BFS")
      : algorithm === "dfs"
        ? canvas.say("DFS (profundidade)", "DFS")
        : "Dijkstra";
  canvas.label(`${heading} · ${model.names[source]}:`, 0.4, 5.5, {
    anchor: "leading",
    color: "accent",
    visible: Anim.after(0.2),
  });
  canvas.label(run.order.map((node) => model.names[node]).join(" → "), 0.4, 0.5, {
    anchor: "leading",
    color: "white",
    visible: Anim.after(end),
  });
  canvas.recordSteps([0, ...run.order.map((_, rank) => begin + step * (rank + 1))]);
  return canvas.illustration(title, Anim.duration(end + 0.6));
};

const complexityChart: Compiler = (params, title, language) => {
  // The Mac offers the chart only with its default curves (`isOfferedAnimatedFigure`).
  if (params.has("curves")) return null;
  const names = ["log n", "n", "n log n", "n²"];
  const nMax = params.number("nMax") ?? 10;
  if (nMax < 4 || nMax > 64) return null;
  const yMax = 4 * nMax;
  const frame = new PremadeFrame(0, nMax, 0, yMax);
  const canvas = new FigureCanvas(language);
  canvas.axes(frame, { xName: "n", yName: "T(n)" });
  const colors = ["white", "accent", "second", "white", "accent", "second"];
  let time = 0.6;
  const labelRows: number[] = [];
  for (const [index, name] of names.entries()) {
    const f = PlottedFunction.make(complexityText(name));
    if (!f) return null;
    canvas.plot(f, frame, 1e-3, nMax, { color: colors[index]!, dashed: index >= 3, start: time, end: time + 1.2 });
    // The label sits where the curve ends: at the right edge, or where it leaves through the top.
    let end = nMax;
    if ((complexityValue(name, nMax) ?? 0) > yMax) {
      let low = 1e-3;
      let high = nMax;
      for (let i = 0; i < 60; i++) {
        const middle = (low + high) / 2;
        if ((complexityValue(name, middle) ?? 0) > yMax) high = middle;
        else low = middle;
      }
      end = low;
    }
    let level = Math.min(complexityValue(name, end) ?? 0, yMax);
    while (labelRows.some((row) => Math.abs(row - level) < yMax * 0.06)) level += yMax * 0.07;
    labelRows.push(level);
    canvas.labelBeside(`O(${name})`, frame.x(end), frame.y(level), {
      color: colors[index]!,
      visible: Anim.after(time + 1.2),
    });
    time += 1.4;
  }
  canvas.caption(canvas.say("Crescimento de T(n)", "Growth of T(n)"), {
    row: 1,
    color: "white",
    visible: Anim.after(0.2),
  });
  return canvas.illustration(title, Anim.duration(time + 0.6));
};

/** The tree, heap, graph and growth figures, by premade type. */
export const structureFigures: Record<string, Compiler> = { binaryTree, heap, graph, complexityChart };
