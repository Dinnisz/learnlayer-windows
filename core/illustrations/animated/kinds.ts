// Port of the orbital diagram, Ruffini's rule and the equation build-up of
// LearnLayer/Illustrations/PremadeFigureKinds.swift @ ref 2026-11-04: the electron configuration as boxes filled by
// Hund's rule, a polynomial divided by (x − a) column by column with the remainder P(a), and a derivation written
// line by line. Every number is worked out by the app.

import { Premade } from "../premadeFigure";
import { TemplateWords } from "../illustrationTemplate";
import { Anim, FigureCanvas, LabelBoard, Params, type AnimatedIllustration } from "./figureCanvas";

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

/** Swift's `.rounded()`: half away from zero. */
const swiftRound = (value: number) => Math.sign(value) * Math.round(Math.abs(value));

// MARK: Orbital diagram

export interface Subshell {
  n: number;
  kind: string;
  electrons: number;
}

const superscriptDigits: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
};

export function parseElectronConfig(text: string): Subshell[] {
  const cleaned = Array.from(text)
    .map((ch) => superscriptDigits[ch] ?? ch)
    .join("");
  return [...cleaned.matchAll(/([1-7])\s*([spdf])\s*(\d{1,2})/g)].map((match) => ({
    n: Number(match[1]),
    kind: match[2]!,
    electrons: Number(match[3]),
  }));
}

export const orbitalBoxCount = (kind: string) => (kind === "s" ? 1 : kind === "p" ? 3 : kind === "d" ? 5 : 7);

/**
 * Where each subshell's boxes sit: side by side, wrapping to a new row (and shrinking a little) so a long configuration
 * stays inside the 10-wide scene instead of running off the right edge.
 */
export class OrbitalLayout {
  constructor(
    readonly boxWidth: number,
    readonly boxHeight: number,
    readonly gap: number,
    readonly groups: { left: number; row: number }[],
    readonly rowCount: number,
  ) {}

  rowY(row: number): number {
    if (this.rowCount === 1) return 3.0;
    if (this.rowCount === 2) return 3.85 - 1.7 * row;
    return 4.05 - 1.55 * row;
  }

  boxLeft(group: number, box: number): number {
    return this.groups[group]!.left + box * (this.boxWidth + this.gap);
  }

  /** The middle of the group's boxes, where its name goes. */
  center(group: number, boxes: number): number {
    return this.groups[group]!.left + (boxes * this.boxWidth + (boxes - 1) * this.gap) / 2;
  }
}

export function orbitalLayout(boxCounts: number[]): OrbitalLayout {
  const left = 1.0;
  const right = 9.4;
  const groupGap = 0.25;
  let scale = 1.0;
  for (;;) {
    const width = 0.55 * scale;
    const gap = 0.12 * scale;
    const groups: { left: number; row: number }[] = [];
    let x = left;
    let row = 0;
    for (const count of boxCounts) {
      const span = count * width + (count - 1) * gap;
      if (x > left && x + span > right) {
        row += 1;
        x = left;
      }
      groups.push({ left: x, row });
      x += span + groupGap;
    }
    if (row < 3 || scale <= 0.5)
      return new OrbitalLayout(width, row >= 2 ? 0.8 : 0.9, gap, groups, Math.min(row + 1, 3));
    scale -= 0.1;
  }
}

/** The arrows in one box of a subshell: one up in every box first (Hund's rule), then the down ones. */
export function orbitalArrows(shell: Subshell, box: number): string {
  let remaining = shell.electrons;
  const boxes: string[][] = Array.from({ length: orbitalBoxCount(shell.kind) }, () => []);
  while (remaining > 0) {
    let placed = false;
    for (const entry of boxes) {
      if (entry.length >= 1) continue;
      entry.push("↑");
      remaining -= 1;
      placed = true;
      if (remaining === 0) break;
    }
    if (remaining === 0) break;
    for (const entry of boxes) {
      if (entry.length !== 1) continue;
      entry.push("↓");
      remaining -= 1;
      placed = true;
      if (remaining === 0) break;
    }
    if (!placed) break;
  }
  return (boxes[box] ?? []).join("");
}

const orbitalDiagram: Compiler = (params, title, language) => {
  const config = params.text("config") ?? params.text("electrons");
  if (config === null) return null;
  const subshells = parseElectronConfig(config);
  if (subshells.length === 0) return null;
  const canvas = new FigureCanvas(language);
  const counts = subshells.map((shell) => orbitalBoxCount(shell.kind));
  const layout = orbitalLayout(counts);
  const boundaries = [0];
  let time = 0.6;
  subshells.forEach((shell, position) => {
    const shown = Anim.after(time);
    const rowY = layout.rowY(layout.groups[position]!.row);
    for (let index = 0; index < counts[position]!; index++) {
      const x = layout.boxLeft(position, index);
      canvas.box(x, rowY, layout.boxWidth, layout.boxHeight, { color: "white", visible: shown });
      canvas.label(orbitalArrows(shell, index), x + layout.boxWidth / 2, rowY + layout.boxHeight / 2, {
        anchor: "center",
        color: "white",
        visible: shown,
      });
    }
    canvas.label(`${shell.n}${shell.kind}`, layout.center(position, counts[position]!), rowY - 0.45, {
      anchor: "center",
      color: "muted",
      visible: shown,
    });
    boundaries.push(time + 0.35);
    time += 0.75;
  });
  canvas.caption(canvas.say("Enchimento orbital (regra de Hund)", "Orbital filling (Hund's rule)"), {
    row: 0,
    color: "accent",
    visible: Anim.after(0.2),
  });
  canvas.recordSteps(boundaries);
  const scene = canvas.illustration(title, Anim.duration(time + 0.6));
  return { ...scene, premade: params.figure };
};

// MARK: Ruffini's rule

/** The bottom row of Ruffini's table (the quotient's coefficients) and the remainder. */
export function ruffiniDivide(coefficients: number[], root: number): { bottom: number[]; remainder: number } {
  if (coefficients.length === 0) return { bottom: [], remainder: 0 };
  const work = [coefficients[0]!];
  for (let index = 1; index < coefficients.length; index++) work.push(coefficients[index]! + root * work[index - 1]!);
  const remainder = work.pop()!;
  return { bottom: work, remainder };
}

/**
 * A coefficient as the table writes it: whole numbers in full, others as the figures write numbers, with a minus sign.
 * The Mac writes a negative decimal with two minus signs ("−−0,5"); here the sign is written once (docs/DECISOES.md).
 */
export function formatCoeff(value: number, words: TemplateWords): string {
  const text = Math.abs(value - swiftRound(value)) < 1e-9 ? String(swiftRound(value)) : words.number(value);
  return value < 0 ? "−" + text.replace(/[-−]/g, "") : text;
}

const ruffini: Compiler = (params, title, language) => {
  const coefficients = Premade.array(params.figure.params["coefficients"]);
  const root = Premade.number(params.figure.params["root"]);
  if (!coefficients || coefficients.length < 2 || root === null) return null;
  const numbers = coefficients.map((v) => Premade.number(v)).filter((v): v is number => v !== null);
  if (numbers.length !== coefficients.length) return null;
  const division = ruffiniDivide(numbers, root);
  const words = new TemplateWords(language);
  const f = (value: number) => formatCoeff(value, words);
  const canvas = new FigureCanvas(language);
  const left = 2.0;
  const top = 5.0;
  const row = 0.55;
  // Columns narrow for a long polynomial (and widen for long numbers) so nothing runs off the right edge.
  const widest = Math.max(...[...numbers, ...division.bottom, division.remainder].map((v) => Array.from(f(v)).length));
  const col = Math.min(Math.max(0.85, widest * LabelBoard.charWidth + 0.25), 7.4 / numbers.length);
  // Numbers wider than their column would be dropped one by one; let free-form drawing take over instead.
  if (!(widest * LabelBoard.charWidth + 0.08 <= col)) return null;
  numbers.forEach((value, index) =>
    canvas.label(f(value), left + index * col, top, { anchor: "center", color: "white" }),
  );
  canvas.label(f(root), left - 0.9, top - row, { anchor: "center", color: "accent" });
  canvas.line(left - 1.15, top - row * 0.35, left + numbers.length * col, top - row * 0.35, { color: "muted" });
  const stepTime = 0.85;
  const boundaries = [0];
  for (let index = 1; index < numbers.length; index++) {
    const begin = 0.5 + stepTime * (index - 1);
    const shown = Anim.after(begin);
    const product = division.bottom[index - 1]! * root;
    canvas.label(f(product), left + index * col, top - row, { anchor: "center", color: "muted", visible: shown });
    canvas.label(f(division.bottom[index - 1]!), left + (index - 1) * col, top - 2 * row, {
      anchor: "center",
      color: "white",
      visible: shown,
    });
    boundaries.push(begin + 0.55);
  }
  const finish = 0.5 + stepTime * (numbers.length - 1);
  const done = Anim.after(finish);
  division.bottom.forEach((value, index) =>
    canvas.label(f(value), left + index * col, top - 2 * row, { anchor: "center", color: "white", visible: done }),
  );
  canvas.label(f(division.remainder), left + division.bottom.length * col, top - 2 * row, {
    anchor: "center",
    color: "accent",
    visible: done,
  });
  canvas.box(left + division.bottom.length * col - 0.35, top - 2 * row - 0.35, 0.7, 0.7, {
    color: "accent",
    dashed: true,
    visible: done,
  });
  boundaries.push(finish + 0.55);
  const r = f(division.remainder);
  canvas.caption(canvas.say(`Resto = ${r}: P(${f(root)}) = ${r}`, `Remainder = ${r}: P(${f(root)}) = ${r}`), {
    row: 1,
    color: "accent",
    visible: done,
  });
  canvas.recordSteps(boundaries);
  return canvas.illustration(title, Anim.duration(finish + 1.2));
};

// MARK: Equation build-up

const equationSteps: Compiler = (params, title, language) => {
  const steps = Premade.array(params.figure.params["steps"]);
  if (!steps || steps.length === 0) return null;
  const canvas = new FigureCanvas(language);
  const boundaries: number[] = [];
  let y = 5.2;
  // Rows are 0.65 apart, tighter for a long derivation, but never closer than a label is tall.
  const pitch = Math.min(0.65, steps.length > 1 ? 4.7 / (steps.length - 1) : 0.65);
  if (!(pitch >= LabelBoard.labelHeight + 0.02)) return null;
  const stepTime = 0.9;
  for (let index = 0; index < steps.length; index++) {
    const object = Premade.object(steps[index]);
    const line = object ? Premade.string(object["line"]) : null;
    if (!object || line === null) return null;
    const note = Premade.string(object["highlight"]);
    const highlight = note === null || note === "" ? null : note;
    const begin = 0.35 + stepTime * index;
    const shown = Anim.after(begin);
    // A note that would run into a long line goes after it instead of being dropped.
    const crowded =
      highlight !== null &&
      1 + (Array.from(line).length + Array.from(highlight).length) * LabelBoard.charWidth + 0.5 > 8.5;
    canvas.label(crowded ? `${line}   ${highlight}` : line, 1, y, {
      anchor: "leading",
      color: highlight === null ? "white" : "accent",
      visible: shown,
    });
    if (highlight !== null && !crowded)
      canvas.label(highlight, 8.5, y, { anchor: "trailing", color: "second", visible: shown });
    y -= pitch;
    boundaries.push(begin + 0.4);
  }
  canvas.recordSteps(boundaries);
  return canvas.illustration(title, Anim.duration((boundaries.at(-1) ?? 1) + 0.8));
};

/** The extended kinds the templates do not draw, by premade type. */
export const kindFigures: Record<string, Compiler> = { orbitalDiagram, ruffini, equationSteps };
