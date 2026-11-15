// Port of LearnLayer/Timing/TimingDiagram.swift and TimingSimulator.swift @ ref 2026-11-04
//
// The Mac renders the page region with CoreGraphics; here the reader renders it (pdf.js) and hands over grey pixels.

import type { PageText, Rect } from "../pdf/page";

/**
 * A timing diagram printed in the PDF: its rows (CLK, X, Q1, Q0, Z), where the given waveforms change, and where the
 * empty rows' high and low levels sit, so the answer can be drawn exactly on top of it.
 */
export interface TimingRow {
  name: string;
  /** PDF y of the high and low levels. */
  highY: number;
  lowY: number;
  /** Levels per interval for a waveform printed in the PDF; null for a row to fill in. */
  given: number[] | null;
}

export interface TimingBoundary {
  x: number;
  /** "CLK rises", "CLK falls", "X rises"… for the model. */
  events: string[];
}

export interface TimingDiagram {
  rows: TimingRow[];
  boundaries: TimingBoundary[];
  xStart: number;
  xEnd: number;
}

export const TimingDiagrams = {
  intervalCount: (diagram: TimingDiagram) => diagram.boundaries.length + 1,
  rowsToFill: (diagram: TimingDiagram) => diagram.rows.filter((row) => row.given === null),

  /** How the diagram is described to the model. */
  description(diagram: TimingDiagram): string {
    const count = TimingDiagrams.intervalCount(diagram);
    const lines = [`A timing diagram is printed with ${count} time intervals (numbered 0 to ${count - 1}).`];
    diagram.boundaries.forEach((boundary, index) =>
      lines.push(`Between interval ${index} and ${index + 1}: ${boundary.events.join(", ")}.`),
    );
    for (const row of diagram.rows)
      if (row.given !== null) lines.push(`${row.name} levels per interval: ${row.given.join(" ")}.`);
    lines.push(
      `Rows to fill in: ${TimingDiagrams.rowsToFill(diagram)
        .map((row) => row.name)
        .join(", ")}.`,
    );
    return lines.join("\n");
  },
};

// MARK: The model's answer

/** The levels the model expects in each interval, and the circuit it read from the figure. */
export interface TimingAnswer {
  signals: { name: string; levels: number[] }[];
  circuit: {
    /** The signal this element drives ("Q1", "Z"). */
    signal: string;
    /** "JK", "D", "T", "SR" flip-flop, or "comb" for a gate output. */
    kind: string;
    edge: string | null;
    clock: string | null;
    /** Pin → boolean expression ("J" → "X + Q0"). */
    inputs: { pin: string; expression: string }[];
  }[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function decodeTimingAnswer(value: unknown): TimingAnswer | null {
  if (!isObject(value) || !Array.isArray(value.signals) || !Array.isArray(value.circuit)) return null;
  const signals = value.signals.map((signal) =>
    isObject(signal) &&
    typeof signal.name === "string" &&
    Array.isArray(signal.levels) &&
    signal.levels.every((l) => typeof l === "number")
      ? { name: signal.name, levels: signal.levels as number[] }
      : null,
  );
  const circuit = value.circuit.map((element) => {
    if (
      !isObject(element) ||
      typeof element.signal !== "string" ||
      typeof element.kind !== "string" ||
      !Array.isArray(element.inputs)
    )
      return null;
    const inputs = element.inputs.map((pin) =>
      isObject(pin) && typeof pin.pin === "string" && typeof pin.expression === "string"
        ? { pin: pin.pin, expression: pin.expression }
        : null,
    );
    if (inputs.some((pin) => pin === null)) return null;
    return {
      signal: element.signal,
      kind: element.kind,
      edge: typeof element.edge === "string" ? element.edge : null,
      clock: typeof element.clock === "string" ? element.clock : null,
      inputs: inputs as { pin: string; expression: string }[],
    };
  });
  if (signals.some((signal) => signal === null) || circuit.some((element) => element === null)) return null;
  return { signals: signals as TimingAnswer["signals"], circuit: circuit as TimingAnswer["circuit"] };
}

// MARK: Boolean expressions

type BooleanNode =
  | { kind: "constant"; value: number }
  | { kind: "signal"; name: string }
  | { kind: "not"; inner: BooleanNode }
  | { kind: "and" | "or" | "xor"; a: BooleanNode; b: BooleanNode };

const isLetter = (c: string | undefined) => c !== undefined && /\p{L}/u.test(c);
const isNumber = (c: string | undefined) => c !== undefined && /\p{N}/u.test(c);

/** A boolean expression over signals: + or |, * · & or juxtaposition, ^ or ⊕ for XOR, ' after or ! ~ ¬ before for NOT. */
export class BooleanExpression {
  private readonly root: BooleanNode;
  private readonly characters: string[];
  private index = 0;

  constructor(text: string) {
    this.characters = Array.from(text.replace(/̄/g, "'"));
    this.root = this.parseOr();
    if (!this.atEnd()) throw new Error("not a boolean expression");
  }

  /** 0 or 1, or null when a signal has no value. */
  evaluate(values: Readonly<Record<string, number>>): number | null {
    return BooleanExpression.evaluateNode(this.root, values);
  }

  private static evaluateNode(node: BooleanNode, values: Readonly<Record<string, number>>): number | null {
    switch (node.kind) {
      case "constant":
        return node.value;
      case "signal":
        return values[node.name] ?? values[node.name.toUpperCase()] ?? null;
      case "not": {
        const inner = BooleanExpression.evaluateNode(node.inner, values);
        return inner === null ? null : 1 - inner;
      }
      default: {
        const x = BooleanExpression.evaluateNode(node.a, values);
        const y = BooleanExpression.evaluateNode(node.b, values);
        if (x === null || y === null) return null;
        return node.kind === "and" ? x & y : node.kind === "or" ? x | y : x ^ y;
      }
    }
  }

  private skipSpaces() {
    while (this.index < this.characters.length && this.characters[this.index] === " ") this.index += 1;
  }

  private atEnd(): boolean {
    this.skipSpaces();
    return this.index >= this.characters.length;
  }

  private peek(): string | null {
    this.skipSpaces();
    return this.index < this.characters.length ? this.characters[this.index]! : null;
  }

  private parseOr(): BooleanNode {
    let node = this.parseXor();
    for (let next = this.peek(); next === "+" || next === "|"; next = this.peek()) {
      this.index += 1;
      node = { kind: "or", a: node, b: this.parseXor() };
    }
    return node;
  }

  private parseXor(): BooleanNode {
    let node = this.parseAnd();
    for (let next = this.peek(); next === "^" || next === "⊕"; next = this.peek()) {
      this.index += 1;
      node = { kind: "xor", a: node, b: this.parseAnd() };
    }
    return node;
  }

  private parseAnd(): BooleanNode {
    let node = this.parseNot();
    for (;;) {
      const next = this.peek();
      if (next === null) break;
      if (next === "*" || next === "·" || next === "&" || next === ".") {
        this.index += 1;
        node = { kind: "and", a: node, b: this.parseNot() };
      } else if (isLetter(next) || ["(", "!", "~", "¬", "0", "1"].includes(next)) {
        node = { kind: "and", a: node, b: this.parseNot() };
      } else break;
    }
    return node;
  }

  private parseNot(): BooleanNode {
    const next = this.peek();
    if (next === "!" || next === "~" || next === "¬") {
      this.index += 1;
      return { kind: "not", inner: this.parseNot() };
    }
    let node = this.parseAtom();
    while (
      this.index < this.characters.length &&
      (this.characters[this.index] === "'" || this.characters[this.index] === "’")
    ) {
      this.index += 1;
      node = { kind: "not", inner: node };
    }
    return node;
  }

  private parseAtom(): BooleanNode {
    const next = this.peek();
    if (next === null) throw new Error("expression ends early");
    if (next === "(") {
      this.index += 1;
      const inner = this.parseOr();
      if (this.peek() !== ")") throw new Error("unclosed parenthesis");
      this.index += 1;
      return inner;
    }
    if (next === "0" || next === "1") {
      this.index += 1;
      return { kind: "constant", value: next === "1" ? 1 : 0 };
    }
    if (!isLetter(next)) throw new Error("not a signal");
    let name = "";
    while (
      this.index < this.characters.length &&
      (isLetter(this.characters[this.index]) ||
        isNumber(this.characters[this.index]) ||
        this.characters[this.index] === "_")
    ) {
      name += this.characters[this.index];
      this.index += 1;
    }
    return { kind: "signal", name };
  }
}

function parsed(text: string): BooleanExpression | null {
  try {
    return new BooleanExpression(text);
  } catch {
    return null;
  }
}

/**
 * The levels of every row to fill, worked out from the circuit, or null if the circuit can't be read. Flip-flops start
 * at the model's first level.
 */
export function simulateTiming(diagram: TimingDiagram, answer: TimingAnswer): Record<string, number[]> | null {
  const count = TimingDiagrams.intervalCount(diagram);
  const expressions = new Map<string, Map<string, BooleanExpression>>();
  for (const element of answer.circuit) {
    const pins = new Map<string, BooleanExpression>();
    for (const pin of element.inputs) {
      const expression = parsed(pin.expression);
      if (!expression) return null;
      pins.set(pin.pin.toUpperCase(), expression);
    }
    expressions.set(element.signal, pins);
  }
  const values: Record<string, number[]> = {};
  for (const row of diagram.rows) if (row.given !== null) values[row.name] = row.given;
  const flipFlops = answer.circuit.filter((element) => element.kind.toUpperCase() !== "COMB");
  const gates = answer.circuit.filter((element) => element.kind.toUpperCase() === "COMB");
  const state: Record<string, number> = {};
  for (const flipFlop of flipFlops)
    state[flipFlop.signal] = answer.signals.find((signal) => signal.name === flipFlop.signal)?.levels[0] ?? 0;
  const result: Record<string, number[]> = {};
  for (let interval = 0; interval < count; interval++) {
    const current: Record<string, number> = { ...state };
    for (const [name, levels] of Object.entries(values))
      if (interval < levels.length) current[name] = levels[interval]!;
    // Gates may feed each other: settle them over a few passes.
    for (let pass = 0; pass < 4; pass++) {
      for (const gate of gates) {
        const first = expressions.get(gate.signal)?.values().next().value;
        const output = first ? first.evaluate(current) : null;
        if (output === null) return null;
        current[gate.signal] = output;
      }
    }
    for (const row of TimingDiagrams.rowsToFill(diagram)) (result[row.name] ??= []).push(current[row.name] ?? 0);
    // At the boundary after this interval, clocked flip-flops update.
    if (interval >= diagram.boundaries.length) continue;
    const events = diagram.boundaries[interval]!.events.map((event) => event.toLowerCase());
    for (const flipFlop of flipFlops) {
      const clock = (flipFlop.clock ?? "CLK").toLowerCase();
      const edge = (flipFlop.edge ?? "rising").toLowerCase().startsWith("f") ? "falls" : "rises";
      if (!events.includes(`${clock} ${edge}`)) continue;
      const pins = expressions.get(flipFlop.signal);
      if (!pins) return null;
      const q = current[flipFlop.signal] ?? 0;
      const pin = (name: string) => pins.get(name)?.evaluate(current) ?? null;
      switch (flipFlop.kind.toUpperCase()) {
        case "D": {
          const d = pin("D");
          if (d === null) return null;
          state[flipFlop.signal] = d;
          break;
        }
        case "T": {
          const t = pin("T");
          if (t === null) return null;
          state[flipFlop.signal] = t === 1 ? 1 - q : q;
          break;
        }
        case "JK": {
          const j = pin("J");
          const k = pin("K");
          if (j === null || k === null) return null;
          state[flipFlop.signal] = j === 1 && k === 1 ? 1 - q : j === 1 ? 1 : k === 1 ? 0 : q;
          break;
        }
        case "SR": {
          const set = pin("S");
          const reset = pin("R");
          if (set === null || reset === null) return null;
          state[flipFlop.signal] = set === 1 ? 1 : reset === 1 ? 0 : q;
          break;
        }
        default:
          return null;
      }
    }
  }
  return result;
}

// MARK: Finding the diagram on the page

/** A grey rendering of part of a page: row 0 at the top, one byte per pixel. */
export interface GreyBitmap {
  width: number;
  height: number;
  pixels: Uint8Array;
}

/** Renders `region` (PDF points, y up) at `scale` pixels per point; null when it can't. */
export type RegionRenderer = (region: Rect, scale: number) => Promise<GreyBitmap | null>;

interface Label {
  text: string;
  bounds: Rect;
}

const clockNames = new Set(["CLK", "CK", "CLOCK", "Clk", "clk"]);
const maxX = (r: Rect) => r.x + r.width;
const maxY = (r: Rect) => r.y + r.height;
const midX = (r: Rect) => r.x + r.width / 2;
const midY = (r: Rect) => r.y + r.height / 2;
const intersects = (a: Rect, b: Rect) => a.x < maxX(b) && maxX(a) > b.x && a.y < maxY(b) && maxY(a) > b.y;
const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** The page's short labels ("CLK", "Q1"): lines of 1 to 5 letters and digits starting with a letter. */
function shortLabels(page: PageText): Label[] {
  const labels: Label[] = [];
  let start = 0;
  for (const line of page.text.split("\n")) {
    const end = start + line.length;
    const trimmed = line.replace(/^[\p{Zs}\t]+|[\p{Zs}\t]+$/gu, "");
    if ([...trimmed].length >= 1 && [...trimmed].length <= 5 && /^\p{L}[\p{L}\p{N}]*$/u.test(trimmed)) {
      let bounds: Rect | null = null;
      for (let at = start; at < end; at++) {
        const box = page.boxes[at];
        if (!box) continue;
        if (!bounds) bounds = { ...box };
        else {
          const x = Math.min(bounds.x, box.x);
          const y = Math.min(bounds.y, box.y);
          bounds = {
            x,
            y,
            width: Math.max(maxX(bounds), maxX(box)) - x,
            height: Math.max(maxY(bounds), maxY(box)) - y,
          };
        }
      }
      if (bounds) labels.push({ text: trimmed, bounds });
    }
    start = end + 1;
  }
  return labels;
}

class Bitmap {
  constructor(readonly grey: GreyBitmap) {}
  get width() {
    return this.grey.width;
  }
  get height() {
    return this.grey.height;
  }
  value(column: number, row: number): number {
    if (column < 0 || column >= this.width || row < 0 || row >= this.height) return 255;
    return this.grey.pixels[row * this.width + column]!;
  }
  isDark(column: number, row: number, radius = 0): boolean {
    for (let r = row - radius; r <= row + radius; r++) if (this.value(column, r) < 170) return true;
    return false;
  }

  /** A dark square wave in a band of rows: its two levels and its edges. */
  waveform(
    band: [number, number],
  ): { high: number; low: number; start: number; end: number; edges: { column: number; rising: boolean }[] } | null {
    const levelRows: number[] = [];
    for (let row = band[0]; row <= band[1]; row++) {
      let count = 0;
      for (let column = 0; column < this.width; column++) if (this.value(column, row) < 170) count += 1;
      if (count > Math.trunc(this.width / 20)) levelRows.push(row);
    }
    if (levelRows.length === 0) return null;
    const high = Math.min(...levelRows);
    const low = Math.max(...levelRows);
    if (low - high < 6) return null;
    const darkIn = (column: number) => {
      let count = 0;
      for (let row = high; row <= low; row++) if (this.value(column, row) < 170) count += 1;
      return count;
    };
    let start = -1;
    let end = -1;
    for (let column = 0; column < this.width; column++)
      if (darkIn(column) > 0) {
        if (start < 0) start = column;
        end = column;
      }
    if (start < 0) return null;
    const edges: { column: number; rising: boolean }[] = [];
    let column = start + 2;
    const tall = 0.7 * (low - high + 1);
    while (column < end - 2) {
      if (darkIn(column) > tall) {
        let stroke = column;
        while (stroke + 1 < end && darkIn(stroke + 1) > tall) stroke += 1;
        edges.push({ column: Math.trunc((column + stroke) / 2), rising: this.isDark(column - 4, low, 1) });
        column = stroke + 4;
      } else column += 1;
    }
    return { high, low, start, end, edges };
  }

  /** Faint horizontal guide lines in a band (rows that are light grey across much of the width). */
  guideLines(band: [number, number]): number[] {
    const lines: number[] = [];
    for (let row = band[0]; row <= band[1]; row++) {
      let marked = 0;
      for (let column = 0; column < this.width; column += 2) {
        for (let r = row - 2; r <= row + 2; r++)
          if (this.value(column, r) < 248) {
            marked += 1;
            break;
          }
      }
      const last = lines[lines.length - 1];
      if (marked > Math.trunc(this.width / 5) && (last === undefined || row - last > 6)) lines.push(row + 2);
    }
    return lines;
  }
}

/** The timing diagram whose labels sit within (or just below) `area` on `page`. */
export async function detectTimingDiagram(
  page: PageText,
  area: Rect,
  render: RegionRenderer,
): Promise<TimingDiagram | null> {
  const labels = shortLabels(page);
  const near: Rect = { x: area.x - 20, y: area.y - 260, width: area.width + 40, height: area.height + 520 };
  for (const clock of labels) {
    if (!clockNames.has(clock.text) || !intersects(near, clock.bounds)) continue;
    const diagram = await diagramUnder(clock, labels, page, render);
    if (diagram) return diagram;
  }
  return null;
}

async function diagramUnder(
  clock: Label,
  labels: Label[],
  page: PageText,
  render: RegionRenderer,
): Promise<TimingDiagram | null> {
  const column = labels
    .filter(
      (label) => Math.abs(midX(label.bounds) - midX(clock.bounds)) < 14 && maxY(label.bounds) <= maxY(clock.bounds) + 1,
    )
    .sort((a, b) => midY(b.bounds) - midY(a.bounds));
  const stack = [clock];
  for (const label of column) {
    if (label.text === clock.text && sameRect(label.bounds, clock.bounds)) continue;
    const last = stack[stack.length - 1]!;
    if (!(midY(last.bounds) - midY(label.bounds) < 60)) break;
    if (midY(label.bounds) < midY(last.bounds) - 4) stack.push(label);
  }
  if (stack.length < 3) return null;
  return measure(stack, page, render);
}

async function measure(stack: Label[], page: PageText, render: RegionRenderer): Promise<TimingDiagram | null> {
  const media = page.mediaBox;
  const left = Math.max(...stack.map((label) => maxX(label.bounds))) + 3;
  const top = maxY(stack[0]!.bounds);
  const bottom = stack[stack.length - 1]!.bounds.y;
  const wanted: Rect = { x: left, y: bottom - 26, width: maxX(media) - 15 - left, height: top - bottom + 52 };
  const x = Math.max(wanted.x, media.x);
  const y = Math.max(wanted.y, media.y);
  const region: Rect = {
    x,
    y,
    width: Math.min(maxX(wanted), maxX(media)) - x,
    height: Math.min(maxY(wanted), maxY(media)) - y,
  };
  if (!(region.width > 0) || !(region.height > 0)) return null;
  const scale = 3;
  const grey = await render(region, scale);
  if (!grey) return null;
  const bitmap = new Bitmap(grey);
  const pdfX = (column: number) => region.x + column / scale;
  const pdfY = (row: number) => maxY(region) - row / scale;
  const pixelRow = (pdfYValue: number) => Math.trunc((maxY(region) - pdfYValue) * scale);
  const centres = stack.map((label) => pixelRow(midY(label.bounds)));
  const band = (index: number): [number, number] => {
    const topRow =
      index === 0 ? Math.max(0, centres[0]! - 60) : Math.trunc((centres[index - 1]! + centres[index]!) / 2);
    const bottomRow =
      index === centres.length - 1
        ? Math.min(bitmap.height - 1, centres[index]! + 40)
        : Math.trunc((centres[index]! + centres[index + 1]!) / 2);
    return [topRow, Math.max(topRow, bottomRow)];
  };
  const clockWave = bitmap.waveform(band(0));
  if (!clockWave) return null;
  const amplitude = clockWave.low - clockWave.high;
  const transitions: { x: number; events: string[] }[] = clockWave.edges.map((edge) => ({
    x: edge.column,
    events: [`${stack[0]!.text} ${edge.rising ? "rises" : "falls"}`],
  }));
  const givenWaves: { index: number; wave: NonNullable<ReturnType<Bitmap["waveform"]>> }[] = [
    { index: 0, wave: clockWave },
  ];
  for (let index = 1; index < stack.length; index++) {
    const wave = bitmap.waveform(band(index));
    if (!wave || !(wave.low - wave.high > amplitude / 2)) continue;
    givenWaves.push({ index, wave });
    for (const edge of wave.edges) {
      const event = `${stack[index]!.text} ${edge.rising ? "rises" : "falls"}`;
      const nearby = transitions.find((transition) => Math.abs(transition.x - edge.column) <= 2);
      if (nearby) nearby.events.push(event);
      else transitions.push({ x: edge.column, events: [event] });
    }
  }
  transitions.sort((a, b) => a.x - b.x);
  const cuts = [clockWave.start, ...transitions.map((transition) => transition.x), clockWave.end];
  const middles = cuts.slice(1).map((cut, index) => Math.trunc((cuts[index]! + cut) / 2));
  const rows: TimingRow[] = stack.map((label, index) => {
    const given = givenWaves.find((entry) => entry.index === index)?.wave;
    if (given)
      return {
        name: label.text,
        highY: pdfY(given.high),
        lowY: pdfY(given.low),
        given: middles.map((middle) => (bitmap.isDark(middle, given.high, 2) ? 1 : 0)),
      };
    // An empty row: the faint guide lines mark its levels; else use the clock's height.
    const lines = bitmap.guideLines(band(index));
    const target = centres[index]! + 4;
    const low =
      lines.length > 0
        ? lines.reduce((best, line) => (Math.abs(line - target) < Math.abs(best - target) ? line : best))
        : centres[index]! + Math.trunc(amplitude / 2);
    const above = lines.filter((line) => line < low - amplitude / 2);
    const high =
      above.length > 0
        ? above.reduce((best, line) =>
            Math.abs(line - (low - amplitude)) < Math.abs(best - (low - amplitude)) ? line : best,
          )
        : low - amplitude;
    return { name: label.text, highY: pdfY(high), lowY: pdfY(low), given: null };
  });
  if (!rows.some((row) => row.given === null)) return null;
  return {
    rows,
    boundaries: transitions.map((transition) => ({ x: pdfX(transition.x), events: transition.events })),
    xStart: pdfX(clockWave.start),
    xEnd: pdfX(clockWave.end),
  };
}

/** The filled-in row as a polyline in PDF points: level by interval, vertical at each change. */
export function timingPath(
  diagram: TimingDiagram,
  row: TimingRow,
  levels: readonly number[],
): { x: number; y: number }[] {
  const y = (level: number) => (level === 1 ? row.highY : row.lowY);
  const xs = [diagram.xStart, ...diagram.boundaries.map((boundary) => boundary.x), diagram.xEnd];
  let level = levels[0] ?? 0;
  const points = [{ x: xs[0]!, y: y(level) }];
  for (let interval = 0; interval < Math.min(levels.length, xs.length - 1); interval++) {
    const next = levels[interval]!;
    if (next !== level) {
      points.push({ x: xs[interval]!, y: y(next) });
      level = next;
    }
    points.push({ x: xs[interval + 1]!, y: y(level) });
  }
  return points;
}
