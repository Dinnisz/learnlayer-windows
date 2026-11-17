// Port of LearnLayerTests/PremadeFigureAnimatedAlgorithmTests.swift @ ref 2026-11-04.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration, type IllustrationElement } from "../illustration";
import { PremadeFigures, type PremadeFigure } from "../premadeFigure";
import { sample } from "./animated";
import { binarySearchTrace, hashBuckets, linkedListAfter, simulateStackQueue, sortSnapshots } from "./algorithms";

const language = "Portuguese (Portugal)";
const compile = (figure: PremadeFigure, lang = language) => new PremadeFigures(figure).compile("t", lang);
const values = (time: number) => ({ t: time, revealed: 1, step: 1000 });
const scene = (type: string, json: string) => {
  const compiled = compile(sample(type, json));
  if (!compiled) throw new Error(`${type} did not compile`);
  return compiled;
};
function labels(figure: Illustration, time: number): string[] {
  const compiled = new CompiledIllustration(figure);
  const at = values(time);
  return figure.elements
    .filter((e) => e.kind === "label" && (!e.visible || (compiled.value(e.visible, at) ?? 0) > 0))
    .map((e) => e.text ?? "");
}
const finalLabels = (figure: Illustration) => labels(figure, 0.95 * (figure.duration ?? 0));
const isShown = (element: IllustrationElement, compiled: CompiledIllustration, at: Record<string, number>) =>
  !element.visible || (compiled.value(element.visible, at) ?? 0) > 0;
const isWhole = (text: string | null | undefined) => typeof text === "string" && /^-?\d+$/.test(text);

/** The pairs a sort must put right. */
function inversions(list: number[]): number {
  let count = 0;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (list[i]! > list[j]!) count += 1;
  return count;
}

describe("algorithm figures", () => {
  it("every sort ends sorted and only ever permutes", () => {
    const samples = [
      [5, 2, 8, 1, 9, 3],
      [3, 1, 2],
      [9, 8, 7, 6, 5, 4, 3],
      [4, 4, 1, 3, 1],
      [2, 1],
      [6, 2, 9, 2, 7, 1, 8, 3, 5],
    ];
    for (const algorithm of ["bubble", "insertion", "merge", "quick"])
      for (const list of samples) {
        const snapshots = sortSnapshots(list, algorithm);
        expect(snapshots, `${algorithm} ${list}`).not.toBeNull();
        const identity = list.map((_, i) => i);
        for (const snapshot of snapshots!) expect([...snapshot].sort((a, b) => a - b)).toEqual(identity);
        for (let i = 1; i < snapshots!.length; i++) expect(snapshots![i]).not.toEqual(snapshots![i - 1]);
        expect(snapshots![0]).toEqual(identity);
        const finished = snapshots![snapshots!.length - 1]!.map((id) => list[id]!);
        expect(finished, `${algorithm} ${list}`).toEqual([...list].sort((a, b) => a - b));
      }
    // Bubble and insertion sort make exactly one swap per inversion.
    for (const list of samples) {
      expect(sortSnapshots(list, "bubble")?.length).toBe(inversions(list) + 1);
      expect(sortSnapshots(list, "insertion")?.length).toBe(inversions(list) + 1);
    }
    expect(sortSnapshots([1, 2, 3], "bubble")).toBeNull();
    expect(sortSnapshots([3, 1, 2], "heap")).toBeNull();
    // Insertion sort moves only neighbours.
    const steps = sortSnapshots([4, 3, 2, 1], "insertion")!;
    for (let i = 1; i < steps.length; i++) {
      const moved = steps[i - 1]!.map((_, slot) => slot).filter((slot) => steps[i - 1]![slot] !== steps[i]![slot]);
      expect(moved.length === 2 && moved[1]! - moved[0]! === 1).toBe(true);
    }
  });

  it("bars end in order and move to get there", () => {
    for (const algorithm of ["bubble", "insertion", "merge", "quick"]) {
      const figure = scene("arrayBars", JSON.stringify({ values: [5, 2, 8, 1, 9, 3, 7], algorithm }));
      const compiled = new CompiledIllustration(figure);
      const bars = figure.elements.filter((e) => e.kind === "rect" && e.color === "accent");
      expect(bars).toHaveLength(7);
      const heightsLeftToRight = (time: number) =>
        bars
          .map((bar) => [compiled.value(bar.x, values(time))!, compiled.value(bar.h, values(time))!] as const)
          .sort((a, b) => a[0] - b[0])
          .map((pair) => pair[1]);
      const finish = heightsLeftToRight(0.95 * (figure.duration ?? 0));
      expect(finish, `${algorithm} bars end as ${finish}`).toEqual([...finish].sort((a, b) => a - b));
      const start = heightsLeftToRight(0);
      expect(start).not.toEqual([...start].sort((a, b) => a - b));
      // Mid-way, some bar is between slots: the swap is animated, not a jump.
      let between = false;
      const slot = 8.4 / 7;
      for (let fraction = 0.05; fraction <= 0.75 + 1e-9; fraction += 0.01)
        for (const bar of bars) {
          const x = compiled.value(bar.x, values(fraction * (figure.duration ?? 0)));
          if (x === null) continue;
          const offset = (x - 0.8 - slot * 0.15) % slot;
          if (Math.abs(offset) > 0.1 * slot && Math.abs(offset) < 0.9 * slot) between = true;
        }
      expect(between, `${algorithm} never shows a bar in motion`).toBe(true);
    }
    expect(compile(sample("arrayBars", '{"values": [1, 2, 3, 4]}'), "English")).toBeNull();
    expect(compile(sample("arrayBars", '{"values": [3, -1, 2]}'), "English")).toBeNull();
  });

  it("binary search halves the range", () => {
    const list = [1, 3, 5, 7, 9, 11, 13];
    const hit = binarySearchTrace(list, 11);
    expect(hit.steps).toEqual([
      { low: 0, high: 6, middle: 3 },
      { low: 4, high: 6, middle: 5 },
    ]);
    expect(hit.found).toBe(5);
    const miss = binarySearchTrace(list, 4);
    expect(miss.found).toBeNull();
    const last = miss.steps[miss.steps.length - 1]!;
    expect(last.low).toBe(last.high);
    expect(miss.steps.length).toBeLessThanOrEqual(3);
    const first = binarySearchTrace(list, 1);
    expect(first.found === 0 && first.steps.length === 3).toBe(true);
    const figure = scene("binarySearch", '{"values": [1, 3, 5, 7, 9, 11, 13, 15], "target": 11}');
    expect(finalLabels(figure)).toContain("Encontrado no índice 5 em 2 passos");
    expect(finalLabels(scene("binarySearch", '{"values": [1, 3, 5, 7], "target": 4}'))).toContain(
      "4 não está na lista",
    );
    // Each step's comparison is written out.
    expect(labels(figure, 0.2 * (figure.duration ?? 0))).toContain("mid = 3: 7 < 11 → procurar à direita");
    expect(compile(sample("binarySearch", '{"values": [3, 1, 2, 5], "target": 1}'), "English")).toBeNull();
  });

  it("linked list operations", () => {
    expect(linkedListAfter(["1", "2", "3"], "insert", 1, "9")).toEqual(["1", "9", "2", "3"]);
    expect(linkedListAfter(["1", "2", "3"], "insert", 3, "9")).toEqual(["1", "2", "3", "9"]);
    expect(linkedListAfter(["1", "2", "3"], "delete", 0, null)).toEqual(["2", "3"]);
    expect(linkedListAfter(["1", "2", "3"], "delete", 3, null)).toBeNull();
    expect(linkedListAfter(["1"], "insert", 0, null)).toBeNull();
    expect(linkedListAfter(["1", "2"], "traverse", 0, null)).toEqual(["1", "2"]);
    const finish = (json: string) => {
      const figure = scene("linkedList", json);
      const compiled = new CompiledIllustration(figure);
      const at = values(0.95 * (figure.duration ?? 0));
      const order = figure.elements
        .filter((e) => e.kind === "label" && isWhole(e.text) && isShown(e, compiled, at))
        .map((e) => [compiled.value(e.x, at)!, e.text!] as const)
        .sort((a, b) => a[0] - b[0])
        .map((pair) => pair[1]);
      const arrows = figure.elements.filter((e) => e.kind === "arrow" && isShown(e, compiled, at)).length;
      return { order, arrows };
    };
    expect(finish('{"values": [4, 7, 2], "operation": "insert", "index": 1, "value": 9}')).toEqual({
      order: ["4", "9", "7", "2"],
      arrows: 5,
    });
    expect(finish('{"values": [4, 7, 2, 8], "operation": "delete", "index": 1}')).toEqual({
      order: ["4", "2", "8"],
      arrows: 4,
    });
    expect(finish('{"values": [4, 7, 2], "operation": "traverse"}')).toEqual({ order: ["4", "7", "2"], arrows: 4 });
    expect(
      compile(sample("linkedList", '{"values": [1, 2], "operation": "insert", "index": 5, "value": 3}'), "English"),
    ).toBeNull();
    expect(compile(sample("linkedList", '{"values": [], "operation": "traverse"}'), "English")).toBeNull();
  });

  it("stacks are last in first out and queues first in first out", () => {
    const stack = simulateStackQueue("stack", ["push 1", "push 2", "pop", "push 3"])!;
    expect(stack.states).toEqual([[], ["1"], ["1", "2"], ["1"], ["1", "3"]]);
    expect(stack.captions).toEqual(["push(1)", "push(2)", "pop()", "push(3)"]);
    const queue = simulateStackQueue("queue", ["enqueue 1", "enqueue 2", "enqueue 3", "dequeue"])!;
    expect(queue.states[queue.states.length - 1]).toEqual(["2", "3"]);
    expect(simulateStackQueue("stack", ["pop"])).toBeNull();
    expect(simulateStackQueue("queue", ["push 1"])).toBeNull();
    expect(simulateStackQueue("deque", ["push 1"])).toBeNull();
    expect(
      simulateStackQueue(
        "stack",
        [0, 1, 2, 3, 4, 5, 6].map((n) => `push ${n}`),
      ),
    ).toBeNull();
    const order = (json: string, axis: "x" | "y") => {
      const figure = scene("stackQueue", json);
      const compiled = new CompiledIllustration(figure);
      const at = values(0.95 * (figure.duration ?? 0));
      return figure.elements
        .filter((e) => e.kind === "label" && isWhole(e.text) && isShown(e, compiled, at))
        .map((e) => [compiled.value(e[axis], at)!, e.text!] as const)
        .sort((a, b) => a[0] - b[0])
        .map((pair) => pair[1]);
    };
    expect(order('{"kind": "stack", "operations": ["push 3", "push 8", "push 5", "pop", "push 1"]}', "y")).toEqual([
      "3",
      "8",
      "1",
    ]);
    expect(
      order('{"kind": "queue", "operations": ["enqueue 3", "enqueue 8", "enqueue 5", "dequeue", "enqueue 1"]}', "x"),
    ).toEqual(["8", "5", "1"]);
  });

  it("a hash table chains collisions", () => {
    expect(hashBuckets([12, 7, 22, 3, 17, 8], 5)).toEqual([[], [], [12, 7, 22, 17], [3, 8], []]);
    expect(hashBuckets([-3, 2, 7], 5)[2]).toEqual([-3, 2, 7]);
    expect(hashBuckets([1, 4, 7, 2], 3)).toEqual([[], [1, 4, 7], [2]]);
    const figure = scene("hashTable", '{"size": 5, "keys": [12, 7, 22, 3, 17, 8]}');
    const compiled = new CompiledIllustration(figure);
    const at = values(0.95 * (figure.duration ?? 0));
    // Entries sit in the row of their bucket, in order along it.
    const rows = new Map<number, [number, string][]>();
    for (const e of figure.elements) {
      if (e.kind !== "label" || !isWhole(e.text) || !isShown(e, compiled, at)) continue;
      const x = compiled.value(e.x, at)!;
      const y = compiled.value(e.y, at)!;
      if (!(x > 2.5)) continue;
      rows.set(y, [...(rows.get(y) ?? []), [x, e.text!]]);
    }
    const chains = [...rows.keys()]
      .sort((a, b) => b - a)
      .map((y) =>
        rows
          .get(y)!
          .sort((a, b) => a[0] - b[0])
          .map((pair) => pair[1]),
      );
    expect(chains).toEqual([
      ["12", "7", "22", "17"],
      ["3", "8"],
    ]);
    expect(compile(sample("hashTable", '{"size": 2, "keys": [1, 2]}'), "English")).toBeNull();
    expect(compile(sample("hashTable", '{"size": 5, "keys": [1.5, 2]}'), "English")).toBeNull();
  });
});
