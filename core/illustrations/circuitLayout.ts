// Port of CircuitPlacement and CircuitLayout in LearnLayer/Explanation/Circuit3D.swift @ ref 2026-11-04: the nodes on a
// small grid, searched so no wire runs through a node it doesn't join, wires overlap or cross as little as they can, and
// the terminals sit on the left, a above b, as exams draw them; then each part's path (an L between nodes that are not
// aligned, parallel branches stepped aside) and where its body sits on it. The Mac builds a 3D board from it; Windows
// draws the same layout as a 2D schematic.

import type { CircuitSpec } from "./circuit";

export interface Vec {
  x: number;
  y: number;
}

const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
const length = (a: Vec) => Math.hypot(a.x, a.y);
const distance = (a: Vec, b: Vec) => length(sub(a, b));
const normalize = (a: Vec): Vec => {
  const l = length(a);
  return l > 0 ? scale(a, 1 / l) : { x: 0, y: 0 };
};

/** A pair of node names, order-free, as one key. */
const pairKey = (a: string, b: string) => [a, b].sort().join("\u0000");

interface Segment {
  a: Vec;
  b: Vec;
  edge: number;
}

const isHorizontal = (s: Segment) => Math.abs(s.a.y - s.b.y) < 1e-9;

function on(p: Vec, s: Segment): boolean {
  const lowX = Math.min(s.a.x, s.b.x) - 1e-9;
  const highX = Math.max(s.a.x, s.b.x) + 1e-9;
  const lowY = Math.min(s.a.y, s.b.y) - 1e-9;
  const highY = Math.max(s.a.y, s.b.y) + 1e-9;
  if (p.x < lowX || p.x > highX || p.y < lowY || p.y > highY) return false;
  return isHorizontal(s) ? Math.abs(p.y - s.a.y) < 1e-9 : Math.abs(p.x - s.a.x) < 1e-9;
}

function overlap(s: Segment, t: Segment): number {
  if (isHorizontal(s) !== isHorizontal(t)) return 0;
  if (isHorizontal(s)) {
    if (Math.abs(s.a.y - t.a.y) >= 1e-9) return 0;
    return Math.max(
      0,
      Math.min(Math.max(s.a.x, s.b.x), Math.max(t.a.x, t.b.x)) -
        Math.max(Math.min(s.a.x, s.b.x), Math.min(t.a.x, t.b.x)),
    );
  }
  if (Math.abs(s.a.x - t.a.x) >= 1e-9) return 0;
  return Math.max(
    0,
    Math.min(Math.max(s.a.y, s.b.y), Math.max(t.a.y, t.b.y)) - Math.max(Math.min(s.a.y, s.b.y), Math.min(t.a.y, t.b.y)),
  );
}

function crosses(s: Segment, t: Segment): boolean {
  if (isHorizontal(s) === isHorizontal(t)) return false;
  const [h, v] = isHorizontal(s) ? [s, t] : [t, s];
  const x = v.a.x;
  const y = h.a.y;
  const inH = x > Math.min(h.a.x, h.b.x) + 1e-9 && x < Math.max(h.a.x, h.b.x) - 1e-9;
  const inV = y > Math.min(v.a.y, v.b.y) + 1e-9 && y < Math.max(v.a.y, v.b.y) - 1e-9;
  return inH && inV;
}

export interface Placement {
  cells: Map<string, Vec>;
  /** Node pairs (`pairKey`) whose wire goes up or down first. */
  verticalFirst: Set<string>;
}

export const CircuitPlacement = {
  /** Up to this many nodes are searched; more keep the ring. */
  searchLimit: 6,

  ring(nodes: readonly string[]): Map<string, Vec> {
    const top = Math.floor((nodes.length + 1) / 2);
    const cells = new Map<string, Vec>();
    nodes.forEach((node, index) =>
      cells.set(node, index < top ? { x: index, y: 0 } : { x: top - 1 - (index - top), y: 1 }),
    );
    return cells;
  },

  /** Lower is better; also the L wires that turn vertically first. Null when no routing works at all. */
  score(
    cells: Map<string, Vec>,
    edges: readonly [string, string][],
    terminals: ReadonlySet<string>,
    parallel: ReadonlyMap<string, number> = new Map(),
  ): [number, Set<string>] | null {
    const ends = edges.map(([first, second]): [Vec, Vec] => {
      const [p, q] = [first, second].sort();
      return [cells.get(p!) ?? { x: 0, y: 0 }, cells.get(q!) ?? { x: 0, y: 0 }];
    });
    const diagonal = ends.flatMap(([a, b], index) =>
      Math.abs(a.x - b.x) > 1e-9 && Math.abs(a.y - b.y) > 1e-9 ? [index] : [],
    );
    if (diagonal.length > 4) return null;
    const positions = [...cells.values()];
    // Each edge's routes (one, or two for an L), their own cost, and the cost of every pair of routes.
    const options: Segment[][][] = ends.map(([a, b], index) => {
      const corners: (Vec | null)[] = diagonal.includes(index)
        ? [
            { x: b.x, y: a.y },
            { x: a.x, y: b.y },
          ]
        : [null];
      return corners.map((corner) => {
        const points = corner ? [a, corner, b] : [a, b];
        return points.slice(1).map((point, step) => ({ a: points[step]!, b: point, edge: index }));
      });
    });
    const own = options.map((routes) =>
      routes.map((route) =>
        route.reduce((cost, s) => {
          // Through a node it does not join: it would look connected.
          const through = positions.filter(
            (p) => distance(p, s.a) > 1e-9 && distance(p, s.b) > 1e-9 && on(p, s),
          ).length;
          return cost + distance(s.a, s.b) * 0.2 + through * 100;
        }, 0),
      ),
    );
    const pairCost = (r: Segment[], t: Segment[]) => {
      let cost = 0;
      for (const s of r) for (const u of t) cost += overlap(s, u) * 100 + (crosses(s, u) ? 4 : 0);
      return cost;
    };
    const count = ends.length;
    const table: number[][][][] = Array.from({ length: count }, () => Array.from({ length: count }, () => []));
    for (let i = 0; i < count; i += 1)
      for (let j = i + 1; j < count; j += 1)
        table[i]![j] = options[i]!.map((r) => options[j]!.map((t) => pairCost(r, t)));
    let bestScore = Infinity;
    let bestBends = new Set<string>();
    for (let mask = 0; mask < 1 << diagonal.length; mask += 1) {
      const choice = Array.from({ length: count }, (_, index) => {
        const at = diagonal.indexOf(index);
        return at >= 0 && (mask & (1 << at)) !== 0 ? 1 : 0;
      });
      let total = 0;
      for (let i = 0; i < count; i += 1) {
        total += own[i]![choice[i]!]!;
        for (let j = i + 1; j < count; j += 1) total += table[i]![j]![choice[i]!]![choice[j]!]!;
      }
      if (total < bestScore) {
        bestScore = total;
        bestBends = new Set(diagonal.filter((index) => choice[index] === 1).map((index) => pairKey(...edges[index]!)));
      }
    }
    for (const index of diagonal) bestScore += Math.max((parallel.get(pairKey(...edges[index]!)) ?? 1) - 1, 0) * 50;
    // The terminals on the left, a above b, as exams draw them.
    const sorted = [...terminals].sort();
    for (const name of sorted) bestScore += (cells.get(name)?.x ?? 0) * 1.5;
    if (sorted.length === 2) {
      const first = cells.get(sorted[0]!);
      const second = cells.get(sorted[1]!);
      if (first && second && first.y > second.y) bestScore += 1;
    }
    return [bestScore, bestBends];
  },

  best(spec: CircuitSpec): Placement {
    const nodes = spec.nodes;
    const edges: [string, string][] = [];
    const seen = new Set<string>();
    const parallel = new Map<string, number>();
    for (const item of spec.components) {
      const key = pairKey(item.from, item.to);
      if (item.from !== item.to && !seen.has(key)) {
        seen.add(key);
        edges.push([item.from, item.to]);
      }
      parallel.set(key, (parallel.get(key) ?? 0) + 1);
    }
    const ringCells = CircuitPlacement.ring(nodes);
    if (nodes.length < 3 || nodes.length > CircuitPlacement.searchLimit)
      return { cells: ringCells, verticalFirst: new Set() };
    // One spare column for four nodes or fewer; beyond that the search would be too slow for a click.
    const columns = Math.floor((nodes.length + 1) / 2) + (nodes.length <= 4 ? 1 : 0);
    const grid: Vec[] = [];
    for (let row = 0; row < 2; row += 1)
      for (let column = 0; column < columns; column += 1) grid.push({ x: column, y: row });
    const terminals = new Set(spec.terminals ?? []);
    let best: { score: number; result: Placement } = {
      score: Infinity,
      result: { cells: ringCells, verticalFirst: new Set() },
    };
    const ringScore = CircuitPlacement.score(ringCells, edges, terminals, parallel);
    if (ringScore) best = { score: ringScore[0], result: { cells: ringCells, verticalFirst: ringScore[1] } };
    const used = new Array<boolean>(grid.length).fill(false);
    const cells = new Map<string, Vec>();
    const place = (index: number) => {
      if (index === nodes.length) {
        const scored = CircuitPlacement.score(cells, edges, terminals, parallel);
        if (scored && scored[0] < best.score - 1e-9)
          best = { score: scored[0], result: { cells: new Map(cells), verticalFirst: scored[1] } };
        return;
      }
      grid.forEach((cell, slot) => {
        if (used[slot]) return;
        // Mirror images score the same (with no terminals to keep on the left): the first node only in the top row's
        // left half.
        if (index === 0 && terminals.size === 0 && (cell.y > 0 || cell.x > (columns - 1) / 2)) return;
        used[slot] = true;
        cells.set(nodes[index]!, cell);
        place(index + 1);
        used[slot] = false;
      });
    };
    place(0);
    return best.result;
  },
};

export interface BodyPlacement {
  center: Vec;
  /** Unit, from `from` toward `to`. */
  direction: Vec;
}

export interface CircuitLayout {
  nodes: Map<string, Vec>;
  routes: Map<string, Vec[]>;
  bodies: Map<string, BodyPlacement>;
}

export const CircuitLayouts = {
  spacing: 2.4,
  /** How far apart parallel components between the same nodes run. */
  parallelStep: 1.2,
  /** A component's body along its path; the wire leaves a gap this long for it. */
  bodyLength: 1.0,

  make(spec: CircuitSpec): CircuitLayout {
    const placement = CircuitPlacement.best(spec);
    const nodes = new Map<string, Vec>();
    for (const [node, cell] of placement.cells) nodes.set(node, scale(cell, CircuitLayouts.spacing));
    const all = [...nodes.values()];
    const middle = scale(
      all.reduce((sum, p) => add(sum, p), { x: 0, y: 0 }),
      1 / Math.max(all.length, 1),
    );
    const routes = new Map<string, Vec[]>();
    const bodies = new Map<string, BodyPlacement>();
    const pairs = new Map<string, number>();
    for (const item of spec.components) {
      const a = nodes.get(item.from);
      const b = nodes.get(item.to);
      if (!a || !b) continue;
      const key = pairKey(item.from, item.to);
      const rank = pairs.get(key) ?? 0;
      pairs.set(key, rank + 1);
      let offset: Vec = { x: 0, y: 0 };
      if (rank > 0) {
        // Outward from the middle of the board, across the pair.
        const across = Math.abs(a.x - b.x) < 1e-9 ? { x: 1, y: 0 } : { x: 0, y: 1 };
        const side = dot(sub(scale(add(a, b), 0.5), middle), across) < 0 ? -1 : 1;
        offset = scale(across, side * CircuitLayouts.parallelStep * rank);
      }
      let points: Vec[] = [a, add(a, offset)];
      if (Math.abs(a.x - b.x) > 1e-9 && Math.abs(a.y - b.y) > 1e-9) {
        // The same L the search chose, which it drew from the pair's first name (sorted).
        const first = [item.from, item.to].sort()[0] === item.from;
        const [p, q] = first ? [a, b] : [b, a];
        const corner = placement.verticalFirst.has(key) ? { x: p.x, y: q.y } : { x: q.x, y: p.y };
        points.push(add(corner, offset));
      }
      points.push(add(b, offset), b);
      points = points.reduce<Vec[]>((kept, point) => {
        const last = kept[kept.length - 1];
        if (!last || distance(last, point) >= 1e-9) kept.push(point);
        return kept;
      }, []);
      routes.set(item.id, points);
      if (item.kind === "wire") continue;
      const segments = points.slice(1).map((point, index): [Vec, Vec] => [points[index]!, point]);
      // A parallel branch carries its body on the leg that runs beside the others, not on a connecting wire.
      const along = length(sub(b, a)) > 0 ? normalize(sub(b, a)) : { x: 1, y: 0 };
      const besides = segments.filter(([s, e]) => {
        const d = sub(e, s);
        return length(d) > 0 && Math.abs(dot(normalize(d), along)) > 0.99;
      });
      const pool = rank > 0 && besides.length > 0 ? besides : segments;
      const longest = pool.reduce<[Vec, Vec] | null>(
        (best, segment) => (!best || distance(segment[0], segment[1]) > distance(best[0], best[1]) ? segment : best),
        null,
      );
      if (longest && distance(longest[0], longest[1]) > 0)
        bodies.set(item.id, {
          center: scale(add(longest[0], longest[1]), 0.5),
          direction: normalize(sub(longest[1], longest[0])),
        });
    }
    return { nodes, routes, bodies };
  },

  /** The board's corners round every node and path. */
  bounds(layout: CircuitLayout): { min: Vec; max: Vec } {
    const points = [...layout.nodes.values(), ...[...layout.routes.values()].flat()];
    if (points.length === 0) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
    return {
      min: { x: Math.min(...points.map((p) => p.x)), y: Math.min(...points.map((p) => p.y)) },
      max: { x: Math.max(...points.map((p) => p.x)), y: Math.max(...points.map((p) => p.y)) },
    };
  },

  /** The wire of `id`'s path, without the gap its body fills. */
  wires(layout: CircuitLayout, id: string): [Vec, Vec][] {
    const points = layout.routes.get(id);
    if (!points) return [];
    const segments = points.slice(1).map((point, index): [Vec, Vec] => [points[index]!, point]);
    const body = layout.bodies.get(id);
    if (!body) return segments;
    const half = scale(body.direction, CircuitLayouts.bodyLength / 2);
    return segments.flatMap(([start, end]): [Vec, Vec][] =>
      distance(scale(add(start, end), 0.5), body.center) >= 1e-9
        ? [[start, end]]
        : [
            [start, sub(body.center, half)],
            [add(body.center, half), end],
          ],
    );
  },
};
