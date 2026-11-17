// Port of LearnLayerTests/PremadeFigureAnimatedStructureTests.swift @ ref 2026-11-04.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration, type IllustrationElement } from "../illustration";
import { PremadeFigures, type PremadeFigure } from "../premadeFigure";
import { sample } from "./animated";
import { boxesOverlap, LabelBoard } from "./figureCanvas";
import {
  BinarySearchTree,
  complexityName,
  complexityNames,
  complexityValue,
  graphRun,
  heapTrace,
  type GraphModel,
} from "./structures";

const language = "Portuguese (Portugal)";
const compile = (figure: PremadeFigure, lang = language) => new PremadeFigures(figure).compile("t", lang);
const values = (time: number) => ({ t: time, revealed: 1, step: 1000 });
const scene = (type: string, json: string) => {
  const compiled = compile(sample(type, json));
  if (!compiled) throw new Error(`${type} did not compile`);
  return compiled;
};
const isShown = (element: IllustrationElement, compiled: CompiledIllustration, at: Record<string, number>) =>
  !element.visible || (compiled.value(element.visible, at) ?? 0) > 0;
const isWhole = (text: string | null | undefined) => typeof text === "string" && /^-?\d+$/.test(text);
function finalLabels(figure: Illustration): string[] {
  const compiled = new CompiledIllustration(figure);
  const at = values(0.95 * (figure.duration ?? 0));
  return figure.elements.filter((e) => e.kind === "label" && isShown(e, compiled, at)).map((e) => e.text ?? "");
}
/** Labels shown together at `time` must not cover one another. */
function overlapProblems(figure: Illustration, time: number): string[] {
  const compiled = new CompiledIllustration(figure);
  const at = values(time);
  const boxes = figure.elements
    .filter((e) => e.kind === "label" && e.text && isShown(e, compiled, at))
    .flatMap((e) => {
      const x = compiled.value(e.x, at);
      const y = compiled.value(e.y, at);
      return x === null || y === null
        ? []
        : [{ text: e.text!, box: LabelBoard.box(e.text!, x, y, e.anchor ?? "leading") }];
    });
  const problems: string[] = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]!.box;
      const shrunk = { minX: b.minX + 0.02, maxX: b.maxX - 0.02, minY: b.minY + 0.02, maxY: b.maxY - 0.02 };
      if (boxesOverlap(boxes[i]!.box, shrunk))
        problems.push(`“${boxes[i]!.text}” covers “${boxes[j]!.text}” at ${time}`);
    }
  return problems;
}

describe("data structure figures", () => {
  it("binary search tree order", () => {
    const inputs = [5, 3, 8, 1, 4];
    const tree = BinarySearchTree.inserting(inputs)!;
    expect(tree.inorder().map((i) => inputs[i])).toEqual([1, 3, 4, 5, 8]);
    expect(tree.preorder().map((i) => inputs[i])).toEqual([5, 3, 1, 4, 8]);
    expect(tree.postorder().map((i) => inputs[i])).toEqual([1, 4, 3, 8, 5]);
    expect(tree.height).toBe(2);
    expect(tree.ancestors(4).map((i) => inputs[i])).toEqual([5, 3]);
    expect(tree.ancestors(0)).toEqual([]);
    expect(BinarySearchTree.inserting([2, 1, 2])).toBeNull();
    expect(BinarySearchTree.inserting([])).toBeNull();
    expect(BinarySearchTree.inserting([1, 2, 3, 4, 5])!.height).toBe(4);
  });

  it("the tree figure has smaller keys to the left and below", () => {
    const inputs = [5, 3, 8, 1, 4, 7, 9];
    const tree = BinarySearchTree.inserting(inputs)!;
    const figure = scene("binaryTree", '{"values": [5, 3, 8, 1, 4, 7, 9]}');
    const compiled = new CompiledIllustration(figure);
    const at = values(0.95 * (figure.duration ?? 0));
    const where = new Map<string, { x: number; y: number }>();
    for (const e of figure.elements) {
      if (e.kind !== "label" || !isWhole(e.text) || !isShown(e, compiled, at)) continue;
      where.set(e.text!, { x: compiled.value(e.x, at)!, y: compiled.value(e.y, at)! });
    }
    expect(where.size).toBe(inputs.length);
    tree.parent.forEach((up, child) => {
      if (up === null) return;
      const a = where.get(String(inputs[child]))!;
      const b = where.get(String(inputs[up]))!;
      expect(inputs[child]! < inputs[up]!).toBe(a.x < b.x);
      expect(a.y).toBeLessThan(b.y);
    });
    // Left to right, the nodes read in sorted order.
    expect([...where.entries()].sort((a, b) => a[1].x - b[1].x).map((entry) => entry[0])).toEqual([
      "1",
      "3",
      "4",
      "5",
      "7",
      "8",
      "9",
    ]);
    // The insertion of 4 compares it with 5, then 3.
    const all = figure.elements.map((e) => e.text);
    expect(all.includes("4 < 5 → esquerda") && all.includes("4 > 3 → direita")).toBe(true);
    const walked = scene("binaryTree", '{"values": [5, 3, 8, 1, 4, 7, 9], "traversal": "inorder"}');
    expect(finalLabels(walked)).toContain("Em ordem: 1 3 4 5 7 8 9");
    expect(compile(sample("binaryTree", '{"values": [1, 2, 3, 4, 5, 6]}'), "English")).toBeNull();
    expect(compile(sample("binaryTree", '{"values": [3, 3]}'), "English")).toBeNull();
  });

  const holds = (slots: (number | null)[], list: number[], isMin: boolean) => {
    const items = slots.filter((slot): slot is number => slot !== null);
    return items.every((item, position) => {
      if (position === 0) return true;
      const parent = items[Math.trunc((position - 1) / 2)]!;
      return isMin ? list[parent]! <= list[item]! : list[parent]! >= list[item]!;
    });
  };

  it("a heap keeps its property after every operation", () => {
    for (const isMin of [true, false]) {
      const list = [7, 3, 9, 1, 5, 8, 2, 6];
      const trace = heapTrace(list, isMin, true)!;
      for (const index of trace.settled) expect(holds(trace.frames[index]!, list, isMin), `frame ${index}`).toBe(true);
      for (const frame of trace.frames) {
        const items = frame.filter((slot) => slot !== null);
        expect(new Set(items).size).toBe(items.length);
        // Slots fill from the left.
        expect(frame.slice(0, items.length).every((slot) => slot !== null)).toBe(true);
      }
      const afterBuilding = trace.frames[trace.settled[trace.settled.length - 2]!]!.filter((slot) => slot !== null);
      expect(afterBuilding).toHaveLength(list.length);
      expect(list[afterBuilding[0]!]).toBe(isMin ? Math.min(...list) : Math.max(...list));
      const extracted = trace.events.find((event) => event.kind === "extract")!;
      expect(extracted.first).toBe(isMin ? Math.min(...list) : Math.max(...list));
      const remaining = trace.frames[trace.frames.length - 1]!.filter((slot) => slot !== null);
      expect(remaining).toHaveLength(list.length - 1);
      const rest = list.filter((value) => value !== extracted.first);
      expect(list[remaining[0]!]).toBe(isMin ? Math.min(...rest) : Math.max(...rest));
      // Every swap exchanges a child with its parent.
      expect(trace.events.filter((e) => e.kind === "swap")).toHaveLength(
        trace.frames.length - 1 - trace.events.filter((e) => e.kind !== "swap").length,
      );
    }
    expect(heapTrace([1], true, false)).toBeNull();
  });

  it("the heap figure shows the root at the top", () => {
    const list = [7, 3, 9, 1, 5];
    const figure = scene("heap", '{"values": [7, 3, 9, 1, 5], "kind": "min", "extract": true}');
    const compiled = new CompiledIllustration(figure);
    const moment = values(0.95 * (figure.duration ?? 0));
    const tree: { y: number; text: string }[] = [];
    const cells: { x: number; text: string }[] = [];
    for (const e of figure.elements) {
      if (e.kind !== "label" || !isWhole(e.text) || !isShown(e, compiled, moment)) continue;
      const x = compiled.value(e.x, moment)!;
      const y = compiled.value(e.y, moment)!;
      if (y > 1.8) tree.push({ y, text: e.text! });
      else cells.push({ x, text: e.text! });
    }
    // 1 was extracted; 3 is now the root, and the array reads by level.
    expect(tree.reduce((top, node) => (node.y > top.y ? node : top)).text).toBe("3");
    expect(tree.length === 4 && !tree.some((node) => node.text === "1")).toBe(true);
    const trace = heapTrace(list, true, true)!;
    const expected = trace.frames[trace.frames.length - 1]!.filter((s) => s !== null).map((s) => String(list[s!]));
    expect(cells.sort((a, b) => a.x - b.x).map((cell) => cell.text)).toEqual(expected);
    // Halfway through every swap, the two numbers trading places pass each other without touching, and at the end of
    // every move nothing covers anything.
    const step = Math.min(0.8, Math.max(0.4, 7.0 / trace.frames.length));
    trace.events.forEach((event, index) => {
      const reached = 0.8 + step * (index + 1);
      expect(overlapProblems(figure, reached + 0.01).slice(0, 1)).toEqual([]);
      if (event.kind === "swap") expect(overlapProblems(figure, reached - (step * 0.75) / 2).slice(0, 1)).toEqual([]);
    });
    expect(compile(sample("heap", '{"values": [1, 2, 3], "kind": "median"}'), "English")).toBeNull();
  });

  const sampleGraph = (): GraphModel => ({
    names: ["A", "B", "C", "D", "E"],
    edges: [
      { from: 0, to: 1, weight: 1 },
      { from: 0, to: 2, weight: 1 },
      { from: 1, to: 3, weight: 1 },
      { from: 2, to: 3, weight: 1 },
      { from: 3, to: 4, weight: 1 },
    ],
    directed: false,
  });

  it("graph search orders", () => {
    const graph = sampleGraph();
    const breadth = graphRun(graph, "bfs", 0)!;
    expect(breadth.order).toEqual([0, 1, 2, 3, 4]);
    expect(breadth.parents).toEqual([null, 0, 0, 1, 3]);
    const depth = graphRun(graph, "dfs", 0)!;
    expect(depth.order).toEqual([0, 1, 3, 2, 4]);
    expect(depth.parents).toEqual([null, 0, 3, 1, 3]);
    // A disconnected node is never visited.
    const apart: GraphModel = { names: ["A", "B", "C"], edges: [{ from: 0, to: 1, weight: 1 }], directed: false };
    expect(graphRun(apart, "bfs", 0)?.order).toEqual([0, 1]);
    // Directed edges are followed one way only.
    const oneWay: GraphModel = { names: ["A", "B"], edges: [{ from: 0, to: 1, weight: 1 }], directed: true };
    expect(graphRun(oneWay, "bfs", 1)?.order).toEqual([1]);
    expect(graphRun(graph, "bfs", 9)).toBeNull();
    expect(graphRun(graph, "astar", 0)).toBeNull();
  });

  it("Dijkstra finds the shortest distances", () => {
    const graph: GraphModel = {
      names: ["A", "B", "C", "D", "E"],
      edges: [
        { from: 0, to: 1, weight: 4 },
        { from: 0, to: 2, weight: 1 },
        { from: 2, to: 1, weight: 2 },
        { from: 1, to: 3, weight: 1 },
        { from: 2, to: 3, weight: 5 },
        { from: 3, to: 4, weight: 3 },
      ],
      directed: false,
    };
    const run = graphRun(graph, "dijkstra", 0)!;
    expect(run.distances).toEqual([0, 3, 1, 4, 7]);
    expect(run.order).toEqual([0, 2, 1, 3, 4]);
    expect(run.parents).toEqual([null, 2, 0, 1, 3]);
    // D was first found at 6 (through C), then improved to 4 (through B).
    expect(run.updates.filter((u) => u.node === 3).map((u) => u.distance)).toEqual([6, 4]);
    const negative: GraphModel = { names: ["A", "B"], edges: [{ from: 0, to: 1, weight: -1 }], directed: true };
    expect(graphRun(negative, "dijkstra", 0)).toBeNull();
  });

  it("the graph figure shows the visit order and the distances", () => {
    const bfs = scene(
      "graph",
      '{"nodes": ["A", "B", "C", "D", "E"], "algorithm": "bfs", "source": "A", "edges": [{"from": "A", "to": "B"}, {"from": "A", "to": "C"}, {"from": "B", "to": "D"}, {"from": "C", "to": "D"}, {"from": "D", "to": "E"}]}',
    );
    expect(finalLabels(bfs)).toContain("A → B → C → D → E");
    // The nodes light up one after another.
    const compiled = new CompiledIllustration(bfs);
    const duration = bfs.duration ?? 0;
    const lit = [0.1, 0.3, 0.5, 0.7, 0.8].map(
      (fraction) =>
        bfs.elements.filter(
          (e) =>
            e.kind === "circle" &&
            e.color === "accent" &&
            (compiled.value(e.visible, values(fraction * duration)) ?? 0) > 0,
        ).length,
    );
    expect(lit).toEqual([...lit].sort((a, b) => a - b));
    expect(lit[0]! < lit[4]! && lit[4] === 5).toBe(true);
    const dijkstra = finalLabels(
      scene(
        "graph",
        '{"nodes": ["A", "B", "C", "D", "E"], "algorithm": "dijkstra", "source": "A", "edges": [{"from": "A", "to": "B", "weight": 4}, {"from": "A", "to": "C", "weight": 1}, {"from": "C", "to": "B", "weight": 2}, {"from": "B", "to": "D", "weight": 1}, {"from": "C", "to": "D", "weight": 5}, {"from": "D", "to": "E", "weight": 3}]}',
      ),
    );
    expect(dijkstra).toContain("A → C → B → D → E");
    for (const distance of ["0", "1", "3", "4", "7"])
      expect(dijkstra, `missing distance ${distance}`).toContain(distance);
    expect(
      compile(sample("graph", '{"nodes": ["A", "B"], "edges": [{"from": "A", "to": "Z"}]}'), "English"),
    ).toBeNull();
    expect(
      compile(
        sample(
          "graph",
          '{"nodes": ["A", "B"], "algorithm": "dijkstra", "edges": [{"from": "A", "to": "B", "weight": -2}]}',
        ),
        "English",
      ),
    ).toBeNull();
    expect(
      compile(sample("graph", '{"nodes": ["A", "A"], "edges": [{"from": "A", "to": "A"}]}'), "English"),
    ).toBeNull();
  });

  it("growth rates order", () => {
    for (const n of [10, 16, 30]) {
      const rates = complexityNames.map((name) => complexityValue(name, n)!);
      expect(rates, `at n = ${n}`).toEqual([...rates].sort((a, b) => a - b));
    }
    expect(complexityValue("2ⁿ", 8) === 256 && complexityValue("n log n", 8) === 24).toBe(true);
    expect(complexityValue("n!", 3)).toBeNull();
    expect(complexityName("O(n)") === "n" && complexityName("n^2") === "n²" && complexityName("2^n") === "2ⁿ").toBe(
      true,
    );
    const figure = scene("complexityChart", "{}");
    const shown = finalLabels(figure);
    for (const name of ["O(log n)", "O(n)", "O(n log n)", "O(n²)"]) expect(shown, `missing ${name}`).toContain(name);
    expect(figure.elements.filter((e) => e.kind === "curve").length).toBeGreaterThanOrEqual(4);
    expect(
      compile(
        sample("complexityChart", '{"curves": ["1", "log n", "n", "n log n", "n^2", "2^n"], "nMax": 12}'),
        "English",
      ),
    ).toBeNull();
    expect(compile(sample("complexityChart", '{"curves": ["n!"]}'), "English")).toBeNull();
    expect(compile(sample("complexityChart", '{"nMax": 2}'), "English")).toBeNull();
  });
});
