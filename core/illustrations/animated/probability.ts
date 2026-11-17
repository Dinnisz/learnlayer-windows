// Port of the probability tree and the Venn diagram of LearnLayer/Illustrations/PremadeFigureBatch3Math.swift, with
// `stringsParam` and `matrixParam` (PremadeFigureBatch3.swift) @ ref 2026-11-04: a two-stage tree with the product on
// every end branch, and a Venn diagram of two or three sets with the number in every region and the
// inclusion–exclusion count. Every number is worked out by the app.

import type { IllustrationParameter } from "../illustration";
import { Premade, type PremadeValue } from "../premadeFigure";
import { Anim, FigureCanvas, Params, slider, type AnimatedIllustration } from "./figureCanvas";
import { Teach } from "./heating";
import { growingLine, type Point } from "./optics";

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

// MARK: Reading lists of words and rows of numbers

/** A list of words (`["A", "B"]`), null unless every entry is text. */
export function stringsParam(params: Params, key: string): string[] | null {
  const entries = Premade.array(params.figure.params[key]);
  if (!entries) return null;
  const words = entries.flatMap((entry) => {
    if (typeof entry !== "string") return [];
    const trimmed = entry.trim();
    return trimmed === "" ? [] : [trimmed];
  });
  return words.length === entries.length ? words : null;
}

/** A table of numbers given as rows. One flat row stands for the same row `rows` times. */
export function matrixParam(params: Params, key: string, rows: number, columns: number): number[][] | null {
  const entries = Premade.array(params.figure.params[key]);
  if (!entries || entries.length === 0) return null;
  const numbers = (value: PremadeValue): number[] | null => {
    const list = Premade.array(value);
    if (!list) return null;
    const found = list.map((v) => Premade.number(v)).filter((v): v is number => v !== null && Number.isFinite(v));
    return found.length === list.length ? found : null;
  };
  let table: number[][];
  if (entries.every((entry) => Premade.array(entry) === null)) {
    const row = numbers(entries);
    if (!row) return null;
    table = Array.from({ length: rows }, () => row);
  } else {
    table = [];
    for (const entry of entries) {
      const row = numbers(entry);
      if (!row) return null;
      table.push(row);
    }
  }
  if (table.length !== rows || !table.every((row) => row.length === columns)) return null;
  return table;
}

// MARK: Probability tree

/** The probability of every end of a two-stage tree, first stage by first stage: p(i)·p(j | i). */
export function treeLeaves(first: number[], second: number[][]): number[] {
  const leaves: number[] = [];
  first.forEach((p, index) => {
    for (const q of second[index]!) leaves.push(p * q);
  });
  return leaves;
}

const isDistribution = (values: number[]) =>
  values.every((v) => v >= 0 && v <= 1) && Math.abs(values.reduce((sum, v) => sum + v, 0) - 1) < 1e-6;
const characters = (text: string) => Array.from(text).length;

const probabilityTree: Compiler = (params, title, language) => {
  const names1 = stringsParam(params, "events1");
  const names2 = stringsParam(params, "events2");
  const first = params.numbers("p1");
  if (!names1 || !names2 || !first) return null;
  if (
    names1.length < 2 ||
    names1.length > 3 ||
    names2.length < 2 ||
    names2.length > 3 ||
    new Set(names1).size !== names1.length ||
    new Set(names2).size !== names2.length ||
    ![...names1, ...names2].every((name) => characters(name) <= 3) ||
    first.length !== names1.length
  )
    return null;
  const second = matrixParam(params, "p2", names1.length, names2.length);
  if (!second || !isDistribution(first) || !second.every(isDistribution)) return null;
  const marked: [number, number][] = [];
  const highlight = stringsParam(params, "highlight");
  if (highlight) {
    for (const entry of highlight) {
      // Swift's split drops empty pieces.
      const pair = entry
        .split(",")
        .filter((piece) => piece !== "")
        .map((piece) => piece.trim());
      const i = pair.length === 2 ? names1.indexOf(pair[0]!) : -1;
      const j = pair.length === 2 ? names2.indexOf(pair[1]!) : -1;
      if (i < 0 || j < 0 || marked.some(([a, b]) => a === i && b === j)) return null;
      marked.push([i, j]);
    }
  } else if (params.has("highlight")) return null;
  const isMarked = (i: number, j: number) => marked.some(([a, b]) => a === i && b === j);
  const leaves = treeLeaves(first, second);
  const canvas = new FigureCanvas(language);
  const n1 = names1.length;
  const n2 = names2.length;
  const steps = marked.length === 0 ? 3 : 4;
  const p = (value: number) => canvas.number(value, 3);

  // Words first.
  canvas.caption(
    canvas.say(
      "Probabilidade de um ramo = produto das probabilidades ao longo dele",
      "Probability of a branch = product of the probabilities along it",
    ),
    { row: 0, color: "white", visible: Anim.after(Teach.start(2)) },
  );
  if (marked.length === 0)
    canvas.caption(canvas.say("A soma dos ramos finais é 1", "The end branches add up to 1"), {
      row: 1,
      color: "accent",
      visible: Anim.after(Teach.start(2) + 0.6),
    });
  else {
    const terms = marked.map(([i, j]) => leaves[i * n2 + j]!);
    const names = marked.map(([i, j]) => `P(${names1[i]}∩${names2[j]})`);
    const sum = terms.reduce((s, v) => s + v, 0);
    const line = names.join(" + ") + " = " + terms.map(p).join(" + ") + " = " + p(sum);
    canvas.caption(line, { row: 1, color: "accent", visible: Anim.after(Teach.start(3)) });
  }

  // Layout: the root on the left, the first stage in the middle, the ends on the right.
  const rootX = 0.9;
  const firstX = 2.9;
  const leafX = 5.1;
  const leafCount = n1 * n2;
  const gap = Math.min(1.25, 3.7 / Math.max(leafCount - 1, 1));
  const top = 3.0 + (gap * (leafCount - 1)) / 2;
  const leafY = (i: number, j: number) => top - gap * (i * n2 + j);
  const nodeY = (i: number) => (leafY(i, 0) + leafY(i, n2 - 1)) / 2;
  const rootY = 3.0;
  canvas.dot(rootX, rootY, { color: "white" });

  // Step 1: the first stage and its probabilities.
  const shown1 = Anim.after(Teach.start(0) + 0.6);
  for (let i = 0; i < n1; i++) {
    growingLine(
      canvas,
      { x: rootX, y: rootY },
      { x: firstX - 0.3, y: nodeY(i) },
      Teach.start(0),
      Teach.start(0) + 0.6,
      {
        color: "white",
      },
    );
    canvas.ring(firstX, nodeY(i), 0.3, { text: names1[i]!, color: "accent", visible: shown1 });
    const above = nodeY(i) >= rootY;
    canvas.label(p(first[i]!), (rootX + firstX) / 2 - 0.2, (rootY + nodeY(i)) / 2 + (above ? 0.25 : -0.25), {
      anchor: "center",
      color: "muted",
      visible: shown1,
    });
  }
  // Step 2: the second stage, with probabilities given the first outcome.
  const shown2 = Anim.after(Teach.start(1) + 0.6);
  for (let i = 0; i < n1; i++)
    for (let j = 0; j < n2; j++) {
      const color = isMarked(i, j) ? "accent" : "white";
      growingLine(
        canvas,
        { x: firstX + 0.3, y: nodeY(i) },
        { x: leafX - 0.3, y: leafY(i, j) },
        Teach.start(1),
        Teach.start(1) + 0.6,
        { color },
      );
      const above = leafY(i, j) >= nodeY(i);
      canvas.label(p(second[i]![j]!), (firstX + leafX) / 2, (nodeY(i) + leafY(i, j)) / 2 + (above ? 0.25 : -0.25), {
        anchor: "center",
        color: "muted",
        visible: shown2,
      });
      canvas.ring(leafX, leafY(i, j), 0.3, { text: names2[j]!, color, visible: shown2 });
    }
  // Step 3: the probability of every end branch, as a product.
  const shown3 = Anim.after(Teach.start(2));
  for (let i = 0; i < n1; i++)
    for (let j = 0; j < n2; j++) {
      const color = isMarked(i, j) ? "accent" : "white";
      const text = `${names1[i]}∩${names2[j]}: ${p(first[i]!)}·${p(second[i]![j]!)} = ${p(first[i]! * second[i]![j]!)}`;
      canvas.label(text, leafX + 0.45, leafY(i, j), { anchor: "leading", color, visible: shown3 });
    }
  canvas.recordSteps(Teach.boundaries(steps));
  const parameters: IllustrationParameter[] = [];
  if (n1 === 2) parameters.push(slider("p", `P(${names1[0]})`, first[0]!, 0.05, 0.95));
  return canvas.illustration(title, Anim.duration(Teach.finish(steps) + 0.6), parameters);
};

// MARK: Venn diagram

/**
 * The value in every region of a Venn diagram of two or three sets. Keys are masks: bit 0 is A, bit 1 is B, bit 2 is
 * C; 0 is outside all of them (present only when the universe is known). Null when some region would be negative: the
 * numbers cannot belong to sets.
 */
export function vennRegions(
  sets: number,
  a: number,
  b: number,
  c: number,
  ab: number,
  ac: number,
  bc: number,
  abc: number,
  universe: number | null,
): Map<number, number> | null {
  let entries: [number, number][];
  if (sets === 2)
    entries = [
      [1, a - ab],
      [2, b - ab],
      [3, ab],
    ];
  else if (sets === 3)
    entries = [
      [7, abc],
      [3, ab - abc],
      [5, ac - abc],
      [6, bc - abc],
      [1, a - ab - ac + abc],
      [2, b - ab - bc + abc],
      [4, c - ac - bc + abc],
    ];
  else return null;
  if (!entries.every(([, v]) => v >= -1e-9 && Number.isFinite(v))) return null;
  const regions = new Map(entries.map(([mask, v]) => [mask, Math.max(v, 0)] as [number, number]));
  if (universe !== null) {
    const inside = [...regions.values()].reduce((s, v) => s + v, 0);
    if (!(universe - inside >= -1e-9)) return null;
    regions.set(0, Math.max(universe - inside, 0));
  }
  return regions;
}

export interface VennCircle {
  x: number;
  y: number;
  r: number;
}

const inCircle = (circle: VennCircle, px: number, py: number) => Math.hypot(px - circle.x, py - circle.y) <= circle.r;

export function vennCircles(sets: number): VennCircle[] {
  return sets === 2
    ? [
        { x: 3.9, y: 3.0, r: 1.5 },
        { x: 6.1, y: 3.0, r: 1.5 },
      ]
    : [
        { x: 4.25, y: 3.5, r: 1.25 },
        { x: 5.75, y: 3.5, r: 1.25 },
        { x: 5.0, y: 2.25, r: 1.25 },
      ];
}

export function vennMask(circles: VennCircle[], x: number, y: number): number {
  return circles.reduce((mask, circle, index) => mask | (inCircle(circle, x, y) ? 1 << index : 0), 0);
}

interface PictureBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** A point inside each region, near its centre of mass, by sampling the universe. */
export function vennLabelSpots(circles: VennCircle[], universe: PictureBox): Map<number, Point> {
  const sums = new Map<number, { x: number; y: number; n: number }>();
  const samples = new Map<number, Point[]>();
  const step = 0.04;
  for (let y = universe.minY + step / 2; y < universe.maxY; y += step)
    for (let x = universe.minX + step / 2; x < universe.maxX; x += step) {
      const mask = vennMask(circles, x, y);
      const entry = sums.get(mask) ?? { x: 0, y: 0, n: 0 };
      entry.x += x;
      entry.y += y;
      entry.n += 1;
      sums.set(mask, entry);
      const list = samples.get(mask) ?? [];
      list.push({ x, y });
      samples.set(mask, list);
    }
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const spots = new Map<number, Point>();
  for (const [mask, entry] of sums) {
    if (!(entry.n > 0)) continue;
    const centre = { x: entry.x / entry.n, y: entry.y / entry.n };
    const inside = samples.get(mask);
    if (mask !== 0 && inside) {
      // Inside a circle, away from every outline: the number must not touch one. Up to 0.45 clear counts the same,
      // and among those the point nearest the centre of mass wins.
      const score = (point: Point) => {
        const clear = Math.min(...circles.map((c) => Math.abs(Math.hypot(point.x - c.x, point.y - c.y) - c.r)));
        return Math.min(clear, 0.45) - 0.01 * distance(point, centre);
      };
      let best = inside[0]!;
      let bestScore = score(best);
      for (const point of inside.slice(1)) {
        const value = score(point);
        if (value > bestScore) {
          best = point;
          bestScore = value;
        }
      }
      spots.set(mask, best);
    } else if (vennMask(circles, centre.x, centre.y) === mask) {
      // Outside every circle: the centre of mass.
      spots.set(mask, centre);
    } else if (inside && inside.length > 0) {
      spots.set(
        mask,
        inside.reduce((nearest, point) => (distance(point, centre) < distance(nearest, centre) ? point : nearest)),
      );
    }
  }
  return spots;
}

const bitCount = (mask: number) => mask.toString(2).replace(/0/g, "").length;

const vennDiagram: Compiler = (params, title, language) => {
  const sets = Math.trunc(params.number("sets") ?? (params.has("C") ? 3 : 2));
  const a = params.number("A");
  const b = params.number("B");
  const ab = params.number("AB");
  if ((sets !== 2 && sets !== 3) || a === null || b === null || ab === null) return null;
  const measure = params.text("measure") ?? "count";
  const probability = measure === "probability";
  if (measure !== "count" && measure !== "probability") return null;
  const c = sets === 3 ? params.number("C") : 0;
  const ac = sets === 3 ? params.number("AC") : 0;
  const bc = sets === 3 ? params.number("BC") : 0;
  const abc = sets === 3 ? params.number("ABC") : 0;
  if (c === null || ac === null || bc === null || abc === null) return null;
  const universe = params.number("U");
  if (probability && universe !== null && Math.abs(universe - 1) > 1e-9) return null;
  if (![a, b, c, ab, ac, bc, abc].every((v) => v >= 0 && v <= 1e6)) return null;
  const regions = vennRegions(sets, a, b, c, ab, ac, bc, abc, probability ? (universe ?? 1) : universe);
  if (!regions) return null;
  const circles = vennCircles(sets);
  const room = { minX: 0.6, maxX: 9.4, minY: 0.95, maxY: 5.05 };
  const spots = vennLabelSpots(circles, room);
  const canvas = new FigureCanvas(language);
  const steps = 3;
  const names = ["A", "B", "C"];
  const value = (x: number) => canvas.number(x, 3);
  const size = (name: string) => (probability ? `P(${name})` : `|${name}|`);

  // Words first.
  const union = a + b + c - ab - ac - bc + abc;
  let symbolic: string;
  let numeric: string;
  if (sets === 2) {
    symbolic = `${size("A∪B")} = ${size("A")} + ${size("B")} − ${size("A∩B")}`;
    numeric = `= ${value(a)} + ${value(b)} − ${value(ab)} = ${value(union)}`;
  } else {
    symbolic = `${size("A∪B∪C")} = ${size("A")} + ${size("B")} + ${size("C")} − ${size("A∩B")} − ${size("A∩C")} − ${size("B∩C")} + ${size("A∩B∩C")}`;
    numeric = `= ${value(a)} + ${value(b)} + ${value(c)} − ${value(ab)} − ${value(ac)} − ${value(bc)} + ${value(abc)} = ${value(union)}`;
  }
  let outside = "";
  const rest = regions.get(0);
  const total = probability ? 1 : universe;
  if (rest !== undefined && total !== null)
    outside = canvas.say(
      `  ·  fora: ${value(total)} − ${value(union)} = ${value(rest)}`,
      `  ·  outside: ${value(total)} − ${value(union)} = ${value(rest)}`,
    );
  canvas.caption(symbolic, { row: 0, color: "white", visible: Anim.after(Teach.start(2)) });
  canvas.caption(numeric + outside, { row: 1, color: "accent", visible: Anim.after(Teach.start(2)) });

  // Step 1: the universe and the sets.
  canvas.box(room.minX, room.minY, room.maxX - room.minX, room.maxY - room.minY, {
    color: "muted",
    visible: Anim.after(0.2),
  });
  canvas.label(canvas.say("U", "U"), room.minX + 0.25, room.maxY - 0.25, {
    anchor: "center",
    color: "muted",
    visible: Anim.after(0.2),
  });
  const colors = ["accent", "second", "white"];
  circles.forEach((circle, index) => {
    const start = Teach.start(0) + 0.4 * index;
    canvas.curve(
      `${Anim.n(circle.x)} + ${Anim.n(circle.r)}*cos(s)`,
      `${Anim.n(circle.y)} + ${Anim.n(circle.r)}*sin(s)`,
      "0",
      `${Anim.n(2 * Math.PI)}*${Anim.ramp(start, start + 0.8)}`,
      { color: colors[index]! },
    );
    const spotX =
      sets === 2
        ? circle.x + (index === 0 ? -1.1 : 1.1)
        : index === 2
          ? circle.x + 1.5
          : circle.x + (index === 0 ? -1.0 : 1.0);
    const spotY = index === 2 ? circle.y - circle.r + 0.1 : circle.y + circle.r + 0.2;
    canvas.label(names[index]!, spotX, spotY, {
      anchor: "center",
      color: colors[index]!,
      visible: Anim.after(start + 0.4),
    });
  });
  // Step 2: the number in each region.
  [...regions.keys()]
    .sort((x, y) => x - y)
    .forEach((mask, rank) => {
      const spot = spots.get(mask);
      if (!spot) return;
      const shown = Anim.after(Teach.start(1) + 0.15 * rank);
      const amount = regions.get(mask) ?? 0;
      const text = mask === 0 ? canvas.say("fora: ", "outside: ") + value(amount) : value(amount);
      const color = mask === 0 ? "muted" : bitCount(mask) >= 2 ? "accent" : "white";
      if (mask === 0)
        canvas.label(text, room.maxX - 0.2, room.minY + 0.35, { anchor: "trailing", color, visible: shown });
      else canvas.label(text, spot.x, spot.y, { anchor: "center", color, visible: shown });
    });
  canvas.recordSteps(Teach.boundaries(steps, 0.4, 2.1, 1.1));
  const upper = sets === 2 ? Math.min(a, b) : Math.min(ab, ac, bc);
  const overlap = sets === 2 ? "A∩B" : "A∩B∩C";
  const current = sets === 2 ? ab : abc;
  return canvas.illustration(title, Anim.duration(Teach.finish(steps, 0.4, 2.1, 1.1) + 0.8), [
    slider(
      sets === 2 ? "AB" : "ABC",
      probability ? `P(${overlap})` : `|${overlap}|`,
      current,
      0,
      Math.max(upper, current),
    ),
  ]);
};

/** The probability figures of batch 3, by premade type. */
export const probabilityFigures: Record<string, Compiler> = { probabilityTree, vennDiagram };
