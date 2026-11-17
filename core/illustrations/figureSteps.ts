// Port of Figure3DSteps.solidPart and CircuitReduction in LearnLayer/Explanation/Figure3DSteps.swift @ ref
// 2026-11-04: the figure following the written solution, from the steps' own numbers and words (no script from a
// model). A circuit is reduced as its steps reduce it (the resistors joined so far into the latest block); a solid's
// step lights the part it works with. Not yet here: the slice sent along [a, b] on the step that writes the volume's
// integral (LatexIntegral) and the parts of a space figure.

import { CircuitMerges, type CircuitSpec } from "./circuit";

export const Figure3DSteps = {
  /** The solid's part a step works with, from its words: the disc or washer (the radii), the axis, the curves, the
   * region; null when it names none. */
  solidPart(step: string, parts: readonly string[]): string | null {
    const text = step.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    const rules: [string, string[]][] = [
      [
        "section",
        [
          "disco",
          "anilha",
          "arruela",
          "washer",
          "disc",
          "disk",
          "casca",
          "shell",
          "seccao",
          "secao",
          "section",
          "raio",
          "radius",
          "radii",
          "\\pi r",
        ],
      ],
      ["axis", ["eixo", "axis", "rotacao", "rotation"]],
      ["curve2", ["g(x)", "curva interior", "inner curve"]],
      ["region", ["regiao", "region", "area", "limitad", "bounded", "intersec"]],
      ["curve", ["f(x)", "curva", "curve", "grafico", "graph"]],
      ["surface", ["volume", "integral"]],
    ];
    for (const [part, words] of rules)
      if (parts.includes(part) && words.some((word) => text.includes(word))) return part;
    return null;
  },
};

interface Piece {
  ids: Set<string>;
  ohms: number;
}

const disjoint = (a: Set<string>, b: Set<string>) => [...a].every((id) => !b.has(id));
const subset = (a: Set<string>, b: Set<string>) => [...a].every((id) => b.has(id));

export const CircuitReduction = {
  /** Up to this many resistors are searched; beyond that no step is matched. */
  maximumResistors: 10,

  /** For each step, the resistors joined so far into the latest block (null before the first). */
  plan(spec: CircuitSpec, steps: readonly string[]): (string[] | null)[] {
    const resistors = spec.components.filter((item) => item.kind === "resistor" && (item.value ?? 0) > 0);
    if (resistors.length < 2 || resistors.length > CircuitReduction.maximumResistors) return steps.map(() => null);
    // Every block of two or more resistors that meets the rest at two nodes, with its value.
    const blocks: Piece[] = [];
    const count = resistors.length;
    for (let mask = 1; mask < 1 << count; mask += 1) {
      const ids = resistors.filter((_, index) => (mask & (1 << index)) !== 0).map((item) => item.id);
      if (ids.length < 2) continue;
      const merge = CircuitMerges.make(spec, ids);
      if (merge) blocks.push({ ids: new Set(ids), ohms: merge.ohms });
    }
    // What is drawn as one piece now: single resistors, then the blocks the steps made.
    let pieces: Piece[] = resistors.map((item) => ({ ids: new Set([item.id]), ohms: item.value ?? 0 }));
    let latest: string[] | null = null;
    const plan: (string[] | null)[] = [];
    for (const step of steps) {
      const found = match(CircuitReduction.values(step), pieces, blocks);
      if (found) {
        pieces = pieces.filter((existing) => disjoint(existing.ids, found.ids));
        pieces.push(found);
        latest = resistors.map((item) => item.id).filter((id) => found.ids.has(id));
      }
      plan.push(latest);
    }
    return plan;
  },

  /** The numbers a step writes, from LaTeX or plain text: "1{,}5" and "1,5" are 1.5, "\frac{21}{13}" and "21/13" are
   * also read as their quotient. */
  values(step: string): number[] {
    let text = step;
    for (const [from, to] of [
      ["{,}", "."],
      ["\\,", " "],
      ["\\!", ""],
      ["−", "-"],
    ] as const)
      text = text.split(from).join(to);
    text = text.replace(/(\d),(\d)/gu, "$1.$2");
    const found: number[] = [];
    const fraction =
      /\\frac\{\s*(\d+(?:\.\d+)?)\s*\}\{\s*(\d+(?:\.\d+)?)\s*\}|(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/gu;
    for (const groups of text.matchAll(fraction)) {
      const top = Number(groups[1] ?? groups[3]);
      const bottom = Number(groups[2] ?? groups[4]);
      if (Number.isFinite(top) && Number.isFinite(bottom) && bottom !== 0) found.push(top / bottom);
    }
    // In order, so the last one is the step's result.
    const plain = [...text.matchAll(/(?<![A-Za-z_^])\d+(?:\.\d+)?/gu)].map((match) => Number(match[0]));
    return [...found, ...plain];
  },
};

/**
 * The block this step makes: a union of two or more current pieces, each piece's value and the block's value written
 * in the step (in Ω, kΩ or MΩ). Ties go to the block whose value is the step's last number (its result), then to the
 * one joining more pieces.
 */
function match(numbers: number[], pieces: Piece[], blocks: Piece[]): Piece | null {
  if (numbers.length === 0) return null;
  const close = (value: number, ohms: number) => Math.abs(value - ohms) <= 0.005 * Math.max(Math.abs(ohms), 1e-9);
  const written = (ohms: number, scale: number) => numbers.some((value) => close(value, ohms * scale));
  let best: { block: Piece; score: number } | null = null;
  for (const scale of [1e-3, 1, 1e-6]) {
    for (const block of blocks) {
      // Made of whole pieces only, at least two of them.
      const used = pieces.filter((piece) => !disjoint(piece.ids, block.ids));
      if (used.length < 2 || !used.every((piece) => subset(piece.ids, block.ids))) continue;
      const covered = new Set(used.flatMap((piece) => [...piece.ids]));
      if (covered.size !== block.ids.size || !subset(block.ids, covered)) continue;
      if (!written(block.ohms, scale) || !used.every((piece) => written(piece.ohms, scale))) continue;
      const last = numbers[numbers.length - 1];
      const isResult = last !== undefined && close(last, block.ohms * scale);
      const score = (isResult ? 100 : 0) + used.length;
      if (!best || score > best.score) best = { block, score };
    }
    if (best) break;
  }
  return best?.block ?? null;
}

/** A solution card as the plan reads it: its formula (the numbers) and its words (the part it names). */
export interface PlanStep {
  formula: string;
  words: string;
}

/** For each step (from 0), what the circuit lights: the resistors joined so far into the latest block. */
export function circuitStepPlan(spec: CircuitSpec, steps: readonly PlanStep[]): (string[] | null)[] {
  return CircuitReduction.plan(
    spec,
    steps.map((step) => step.formula),
  );
}

/** For each step (from 0), the solid's part it lights, among the parts drawn. */
export function solidStepPlan(parts: readonly string[], steps: readonly PlanStep[]): (string | null)[] {
  return steps.map((step) => Figure3DSteps.solidPart(`${step.formula} ${step.words}`, parts));
}
