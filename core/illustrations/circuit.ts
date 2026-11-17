// Port of LearnLayer/Explanation/Circuit3DSolve.swift and the netlist of Circuit3D.swift (CircuitSpec, CircuitMerge)
// @ ref 2026-11-04: the app's own DC analysis of a circuit's netlist, so a drawn circuit is checked against the solution
// instead of trusted. The 3D drawing (CircuitLayout, CircuitPlacement) is not here yet.

import { formatG } from "../math/printf";
import { mathLettersToPlain } from "../problems/textNormalizer";
import type { PremadeFigure, PremadeValue } from "./premadeFigure";

export type CircuitKind =
  "battery" | "resistor" | "capacitor" | "lamp" | "switch" | "wire" | "inductor" | "currentsource";

const kinds: readonly CircuitKind[] = [
  "battery",
  "resistor",
  "capacitor",
  "lamp",
  "switch",
  "wire",
  "inductor",
  "currentsource",
];

/** The kind a model wrote, in any case, with underscores or a common synonym. */
export function circuitKind(written: string): CircuitKind | null {
  const key = written.toLowerCase().replace(/_/g, "").replace(/ /g, "");
  const synonyms: Record<string, CircuitKind> = {
    coil: "inductor",
    bobina: "inductor",
    resistance: "resistor",
    isource: "currentsource",
    voltagesource: "battery",
    source: "battery",
    cell: "battery",
    bulb: "lamp",
    condensador: "capacitor",
  };
  const kind = synonyms[key] ?? key;
  return (kinds as readonly string[]).includes(kind) ? (kind as CircuitKind) : null;
}

export interface CircuitComponent {
  id: string;
  kind: CircuitKind;
  from: string;
  to: string;
  /** Volts, ohms or farads by kind; unused for lamps, switches and wires. */
  value: number | null;
  /** Amperes from `from` to `to`; negative runs the other way. A battery's `+` is at `to`. */
  current: number | null;
  /** A resistor's bands by colour name, in place of those its ohms give. */
  bands: string[] | null;
  /** A switch: closed (the default) or open. */
  isClosed: boolean;
}

export interface CircuitSpec {
  nodes: string[];
  components: CircuitComponent[];
  /** With a capacitor: it charges on screen with this time constant, in seconds of animation. */
  chargeTau: number | null;
  /** The two open ends the question looks in from ("visto dos terminais a e b"), if any. */
  terminals: string[] | null;
}

type Value = PremadeValue;
const isObject = (value: Value | undefined): value is Record<string, Value> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: Value | undefined) => (typeof value === "string" ? value : null);
const asNumber = (value: Value | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const asBool = (value: Value | undefined) => (typeof value === "boolean" ? value : null);

const part = (
  id: string,
  kind: CircuitKind,
  from: string,
  to: string,
  value: number | null = null,
  current: number | null = null,
): CircuitComponent => ({ id, kind, from, to, value, current, bands: null, isClosed: true });

export const CircuitSpecs = {
  seriesRC: "circuit_series_rc",
  parallelResistors: "circuit_parallel_resistors",
  seriesLampSwitch: "circuit_series_lamp_switch",
  /** Takes its netlist from params (`netlist`, an object or a JSON string, or `components` directly). */
  generic: "circuit",

  templates(): Record<string, CircuitSpec> {
    const spec = (components: CircuitComponent[], chargeTau: number | null = null): CircuitSpec => ({
      nodes: ["a", "b", "c", "d"],
      components,
      chargeTau,
      terminals: null,
    });
    return {
      circuit_series_rc: spec(
        [
          part("B1", "battery", "d", "a", 9, 0.019),
          part("R1", "resistor", "a", "b", 470, 0.019),
          part("C1", "capacitor", "b", "c", 100e-6, 0.019),
          part("W1", "wire", "c", "d", null, 0.019),
        ],
        2.5,
      ),
      circuit_parallel_resistors: spec([
        part("B1", "battery", "d", "a", 6, 0.0873),
        part("W1", "wire", "a", "b", null, 0.0873),
        part("R1", "resistor", "b", "c", 100, 0.06),
        part("R2", "resistor", "b", "c", 220, 0.0273),
        part("W2", "wire", "c", "d", null, 0.0873),
      ]),
      circuit_series_lamp_switch: spec([
        part("B1", "battery", "d", "a", 3, 0.3),
        part("S1", "switch", "a", "b", null, 0.3),
        part("L1", "lamp", "b", "c", null, 0.3),
        part("W1", "wire", "c", "d", null, 0.3),
      ]),
    };
  },

  hasCapacitor: (spec: CircuitSpec) => spec.components.some((item) => item.kind === "capacitor"),

  /** The circuit a premade names, or null (also for `circuit` without a usable netlist). */
  fromPremade(premade: PremadeFigure): CircuitSpec | null {
    const p = premade.params;
    let spec: CircuitSpec | null;
    if (premade.type === CircuitSpecs.generic) spec = CircuitSpecs.fromParams(p);
    else spec = CircuitSpecs.templates()[premade.type] ?? null;
    if (!spec) return null;
    const closed = asBool(p["closed"]) ?? (asBool(p["open"]) === null ? null : !asBool(p["open"]));
    if (closed !== null) for (const item of spec.components) if (item.kind === "switch") item.isClosed = closed;
    const tau = asNumber(p["tau"]);
    if (tau !== null && tau > 0 && CircuitSpecs.hasCapacitor(spec)) spec.chargeTau = tau;
    return spec;
  },

  /** `{ nodes?, components: [{id, kind, from, to, value?, current?, bands?, closed?}], tau?, charging? }`. */
  fromParams(params: Record<string, Value>): CircuitSpec | null {
    let source = params;
    const netlist = params["netlist"];
    if (netlist !== undefined) {
      if (isObject(netlist)) source = netlist;
      else if (typeof netlist === "string") {
        try {
          const parsed = JSON.parse(netlist) as Value;
          if (!isObject(parsed)) return null;
          source = parsed;
        } catch {
          return null;
        }
      } else return null;
    }
    const list = source["components"];
    if (!Array.isArray(list)) return null;
    const parts: CircuitComponent[] = [];
    const used = new Set<string>();
    list.slice(0, 24).forEach((item, index) => {
      if (!isObject(item)) return;
      const kindText = asString(item["kind"]);
      const kind = kindText === null ? null : circuitKind(kindText);
      const from = asString(item["from"]);
      const to = asString(item["to"]);
      if (!kind || !from || !to || from === to) return;
      let id = asString(item["id"]) || `${kind}${index + 1}`;
      if (used.has(id)) id += `_${index + 1}`;
      used.add(id);
      const open = asBool(item["open"]);
      const isClosed =
        asBool(item["closed"]) ??
        (open === null ? null : !open) ??
        (asString(item["state"])?.toLowerCase() === "open" ? false : true);
      const bands = item["bands"];
      parts.push({
        id,
        kind,
        from,
        to,
        value: asNumber(item["value"]),
        current: asNumber(item["current"]),
        bands: Array.isArray(bands) ? bands.flatMap((band) => (typeof band === "string" ? [band] : [])) : null,
        isClosed,
      });
    });
    if (parts.length === 0) return null;
    const listed = source["nodes"];
    let names = Array.isArray(listed) ? listed.flatMap((node) => (typeof node === "string" ? [node] : [])) : [];
    for (const item of parts) for (const node of [item.from, item.to]) if (!names.includes(node)) names.push(node);
    names = names.filter((name) => parts.some((item) => item.from === name || item.to === name));
    // A terminal joined to nothing is still a node: it is where the question looks in.
    const ends = Array.isArray(source["terminals"])
      ? (source["terminals"] as Value[]).flatMap((end) => (typeof end === "string" ? [end] : []))
      : [];
    if (names.length > 16) return null;
    const spec: CircuitSpec = { nodes: names, components: parts, chargeTau: null, terminals: null };
    if (ends.length === 2 && ends.every((end) => names.includes(end))) spec.terminals = ends;
    // The app's own currents where it can solve the circuit, not the model's.
    if (parts.some((item) => item.kind === "battery" || item.kind === "currentsource")) {
      const solved = CircuitSolver.currents(spec);
      if (solved) for (const item of spec.components) item.current = solved[item.id] ?? null;
    }
    if (CircuitSpecs.hasCapacitor(spec)) {
      const tau = asNumber(source["tau"]);
      if (tau !== null && tau > 0) spec.chargeTau = tau;
      else if (asBool(source["charging"]) === true) spec.chargeTau = 2.5;
    }
    return spec;
  },

  /** Back to a premade the illustration pipeline carries (`circuit` with its netlist). */
  premade(spec: CircuitSpec): PremadeFigure {
    const parts: Value[] = spec.components.map((item) => {
      const object: Record<string, Value> = { id: item.id, kind: item.kind, from: item.from, to: item.to };
      if (item.value !== null) object["value"] = item.value;
      if (item.current !== null) object["current"] = item.current;
      if (item.bands) object["bands"] = item.bands;
      if (!item.isClosed) object["closed"] = false;
      return object;
    });
    const netlist: Record<string, Value> = { nodes: spec.nodes, components: parts };
    if (spec.terminals) netlist["terminals"] = spec.terminals;
    if (spec.chargeTau !== null) netlist["tau"] = spec.chargeTau;
    return { type: CircuitSpecs.generic, params: { netlist } };
  },

  /** 470 → "470 Ω", 0.0001 → "100 µF", 4700 → "4.7 kΩ". */
  engineering(value: number, unit: string): string {
    const prefixes: [number, string][] = [
      [1e9, "G"],
      [1e6, "M"],
      [1e3, "k"],
      [1, ""],
      [1e-3, "m"],
      [1e-6, "µ"],
      [1e-9, "n"],
      [1e-12, "p"],
    ];
    const magnitude = Math.abs(value);
    const [scale, prefix] =
      magnitude === 0 ? [1, ""] : (prefixes.find(([step]) => magnitude >= step * 0.9995) ?? [1e-12, "p"]);
    return `${formatG(value / scale)} ${prefix}${unit}`;
  },

  /** One loop: as many components as nodes, every node joining exactly two. */
  isSingleLoop(spec: CircuitSpec): boolean {
    if (spec.components.length !== spec.nodes.length || spec.nodes.length < 2) return false;
    return spec.nodes.every(
      (node) =>
        spec.components.reduce((sum, item) => sum + (item.from === node ? 1 : 0) + (item.to === node ? 1 : 0), 0) === 2,
    );
  },

  /**
   * The current through `id` in amperes: zero through an open switch (and round a single loop it opens), the loop's
   * current where a part of one gives none, and, while the capacitor charges, dying away.
   */
  current(spec: CircuitSpec, id: string, chargeFraction: number | null = null): number {
    const item = spec.components.find((candidate) => candidate.id === id);
    if (!item) return 0;
    if (item.kind === "switch" && !item.isClosed) return 0;
    const loop = CircuitSpecs.isSingleLoop(spec);
    if (loop && spec.components.some((candidate) => candidate.kind === "switch" && !candidate.isClosed)) return 0;
    let value = item.current ?? (loop ? (spec.components.find((c) => c.current !== null)?.current ?? 0) : 0);
    if (!Number.isFinite(value)) return 0;
    if (
      chargeFraction !== null &&
      spec.chargeTau !== null &&
      CircuitSpecs.hasCapacitor(spec) &&
      (loop || item.kind === "capacitor")
    ) {
      value *= 1 - Math.min(Math.max(chargeFraction, 0), 1);
    }
    return value;
  },
};

/** Wires, closed switches and coils (in DC) as a tiny resistance, so their current is known too. */
const shortOhms = 1e-6;

function resistance(item: CircuitComponent, scale: number): { open: boolean; ohms: number | null } | null {
  switch (item.kind) {
    case "resistor":
    case "lamp":
      return item.value !== null && Number.isFinite(item.value) && item.value > 0
        ? { open: false, ohms: item.value }
        : null;
    case "wire":
    case "inductor":
      return { open: false, ohms: shortOhms * scale };
    case "switch":
      return item.isClosed ? { open: false, ohms: shortOhms * scale } : { open: true, ohms: null };
    case "capacitor":
    case "currentsource":
      return { open: true, ohms: null };
    case "battery":
      return { open: false, ohms: null };
  }
}

const resistanceScale = (spec: CircuitSpec) => {
  const values = spec.components.flatMap((item) =>
    item.kind === "resistor" && item.value !== null && item.value > 0 ? [item.value] : [],
  );
  return Math.max(values.length > 0 ? Math.min(...values) : 1, 1e-6);
};

export const CircuitSolver = {
  /** Solves G·x = b by Gaussian elimination with partial pivoting; null when singular. */
  solve(matrix: number[][], vector: number[]): number[] | null {
    const a = matrix.map((row) => [...row]);
    const b = [...vector];
    const n = b.length;
    const magnitudes = a.flat().map(Math.abs);
    const scale = magnitudes.length > 0 ? Math.max(...magnitudes) : 1;
    for (let column = 0; column < n; column += 1) {
      let pivot = column;
      for (let row = column + 1; row < n; row += 1)
        if (Math.abs(a[row]![column]!) > Math.abs(a[pivot]![column]!)) pivot = row;
      if (!(Math.abs(a[pivot]![column]!) > scale * 1e-14)) return null;
      [a[column], a[pivot]] = [a[pivot]!, a[column]!];
      [b[column], b[pivot]] = [b[pivot]!, b[column]!];
      for (let row = column + 1; row < n; row += 1) {
        if (a[row]![column] === 0) continue;
        const factor = a[row]![column]! / a[column]![column]!;
        for (let k = column; k < n; k += 1) a[row]![k]! -= factor * a[column]![k]!;
        b[row]! -= factor * b[column]!;
      }
    }
    const x = new Array<number>(n).fill(0);
    for (let row = n - 1; row >= 0; row -= 1) {
      let sum = b[row]!;
      for (let k = row + 1; k < n; k += 1) sum -= a[row]![k]! * x[k]!;
      x[row] = sum / a[row]![row]!;
    }
    return x.every(Number.isFinite) ? x : null;
  },

  /**
   * Node voltages (relative to `ground`) and battery currents, by modified nodal analysis. `inject` adds a test current
   * into nodes; `sources` false turns batteries into shorts and current sources off.
   */
  analyse(
    spec: CircuitSpec,
    ground: string,
    inject: Record<string, number> = {},
    sources = true,
  ): { voltages: Map<string, number>; batteryCurrents: Map<string, number> } | null {
    const scale = resistanceScale(spec);
    const others = spec.nodes.filter((node) => node !== ground);
    const index = new Map(others.map((node, position) => [node, position]));
    const batteries = spec.components.filter((item) => item.kind === "battery");
    const size = others.length + batteries.length;
    if (size === 0) return null;
    const g = Array.from({ length: size }, () => new Array<number>(size).fill(0));
    const rhs = new Array<number>(size).fill(0);
    for (const [node, amps] of Object.entries(inject)) {
      const i = index.get(node);
      if (i !== undefined) rhs[i]! += amps;
    }
    const conduct = (i: number | undefined, j: number | undefined, conductance: number) => {
      if (i !== undefined) g[i]![i]! += conductance;
      if (j !== undefined) g[j]![j]! += conductance;
      if (i !== undefined && j !== undefined) {
        g[i]![j]! -= conductance;
        g[j]![i]! -= conductance;
      }
    };
    for (const item of spec.components) {
      const i = index.get(item.from);
      const j = index.get(item.to);
      if (item.kind === "battery") {
        // A short in place of the source.
        if (!sources) conduct(i, j, 1 / (shortOhms * scale));
        continue;
      }
      if (item.kind === "currentsource") {
        if (!sources) continue;
        if (item.value === null || !Number.isFinite(item.value)) return null;
        // Drives `amps` from `from` through itself to `to`.
        if (i !== undefined) rhs[i]! -= item.value;
        if (j !== undefined) rhs[j]! += item.value;
        continue;
      }
      const r = resistance(item, scale);
      if (!r) return null;
      if (r.open || r.ohms === null) continue;
      conduct(i, j, 1 / r.ohms);
    }
    if (sources) {
      for (const [k, battery] of batteries.entries()) {
        if (battery.value === null || !Number.isFinite(battery.value)) return null;
        const row = others.length + k;
        // V(to) − V(from) = volts; its current enters `to` from inside.
        const j = index.get(battery.to);
        const i = index.get(battery.from);
        if (j !== undefined) {
          g[row]![j]! += 1;
          g[j]![row]! -= 1;
        }
        if (i !== undefined) {
          g[row]![i]! -= 1;
          g[i]![row]! += 1;
        }
        rhs[row] = battery.value;
      }
    } else {
      for (let k = 0; k < batteries.length; k += 1) g[others.length + k]![others.length + k] = 1;
    }
    const x = CircuitSolver.solve(g, rhs);
    if (!x) return null;
    const voltages = new Map<string, number>([[ground, 0]]);
    for (const [node, i] of index) voltages.set(node, x[i]!);
    const batteryCurrents = new Map<string, number>();
    batteries.forEach((battery, k) => batteryCurrents.set(battery.id, sources ? -x[others.length + k]! : 0));
    return { voltages, batteryCurrents };
  },

  /** The DC current through every part, from `from` to `to`; null when the netlist can't be solved. */
  currents(spec: CircuitSpec): Record<string, number> | null {
    const ground = spec.components.find((item) => item.kind === "battery")?.from ?? spec.nodes[0];
    if (ground === undefined) return null;
    const solved = CircuitSolver.analyse(spec, ground);
    if (!solved) return null;
    const scale = resistanceScale(spec);
    const result: Record<string, number> = {};
    for (const item of spec.components) {
      if (item.kind === "battery") {
        // Through the source from − to +.
        result[item.id] = -(solved.batteryCurrents.get(item.id) ?? 0);
      } else if (item.kind === "currentsource") {
        result[item.id] = item.value ?? 0;
      } else {
        const r = resistance(item, scale);
        if (!r) return null;
        if (r.open) {
          result[item.id] = 0;
          continue;
        }
        const drop = (solved.voltages.get(item.from) ?? 0) - (solved.voltages.get(item.to) ?? 0);
        result[item.id] = drop / (r.ohms ?? 1);
      }
    }
    return Object.values(result).every(Number.isFinite) ? result : null;
  },

  /** V(a) − V(b) with the terminals open, sources on; null without a source or a solution. */
  openCircuitVoltage(spec: CircuitSpec, a: string, b: string): number | null {
    if (!spec.components.some((item) => item.kind === "battery" || item.kind === "currentsource")) return null;
    if (!spec.nodes.includes(a) || !spec.nodes.includes(b)) return null;
    const volts = CircuitSolver.analyse(spec, b)?.voltages.get(a);
    return volts !== undefined && Number.isFinite(volts) ? volts : null;
  },

  /** The resistance seen between two nodes, sources turned off; null when they aren't joined. */
  equivalentResistance(spec: CircuitSpec, a: string, b: string): number | null {
    if (!spec.nodes.includes(a) || !spec.nodes.includes(b) || a === b) return null;
    const volts = CircuitSolver.analyse(spec, b, { [a]: 1 }, false)?.voltages.get(a);
    if (volts === undefined || !Number.isFinite(volts) || volts <= 0) return null;
    // Open terminals with no path between them show up as an enormous value.
    return volts < 1e12 ? volts : null;
  },
};

export type CircuitVerdict =
  /** Nothing in the answer to check against, or it matches. */
  | { kind: "keep" }
  /** Every resistance was off by the same power of a thousand. */
  | { kind: "rescaled"; factor: number }
  /** The one source points the other way from the answer's Thévenin voltage. */
  | { kind: "flipSource" }
  | { kind: "refuse" };

function plainAnswer(answer: string, withOmega: boolean): string {
  let text = answer;
  const replacements: [string, string][] = [
    ...(withOmega ? ([["\\Omega", "Ω"]] as [string, string][]) : []),
    ["\\,", " "],
    ["\\text{", ""],
    ["\\mathrm{", ""],
    ["{", ""],
    ["}", ""],
    ["−", "-"],
  ];
  for (const [from, to] of replacements) text = text.split(from).join(to);
  return mathLettersToPlain(text);
}

const decimal = (text: string) => Number(text.replace(",", "."));

export const CircuitCheck = {
  /** Ohm values written in an answer ("R_ab = 3 kΩ", "21/13 kΩ", "3\,\text{k}\Omega"), in ohms. */
  ohms(answer: string): number[] {
    const text = plainAnswer(answer, true);
    const pattern = /(-?\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+(?:[.,]\d+)?))?\s*(k|K|M|m)?\s*(?:Ω|ohms?\b)/gu;
    return [...text.matchAll(pattern)].flatMap((match) => {
      let value = decimal(match[1]!);
      if (!Number.isFinite(value)) return [];
      if (match[2] !== undefined) {
        const denominator = decimal(match[2]);
        if (denominator === 0 || !Number.isFinite(denominator)) return [];
        value /= denominator;
      }
      if (match[3] === "k" || match[3] === "K") value *= 1e3;
      else if (match[3] === "M") value *= 1e6;
      else if (match[3] === "m") value *= 1e-3;
      return [value];
    });
  },

  agree: (a: number, b: number) => Math.abs(a - b) <= 0.01 * Math.max(Math.abs(a), Math.abs(b)) + 1e-9,

  /** Volt values in an answer ("V_Th = −3 V", "9\,\text{V}"), in volts. */
  volts(answer: string): number[] {
    const text = plainAnswer(answer, false);
    return [...text.matchAll(/(-?\s*\d+(?:[.,]\d+)?)\s*(k|m)?\s*V\b/gu)].flatMap((match) => {
      let value = decimal(match[1]!.replace(/ /g, ""));
      if (!Number.isFinite(value)) return [];
      if (match[2] !== undefined) value *= match[2] === "k" ? 1e3 : 1e-3;
      return [value];
    });
  },

  /** With terminals, the resistance between them must be one the answer gives. */
  verdict(spec: CircuitSpec, answer: string): CircuitVerdict {
    const terminals = spec.terminals;
    if (!terminals || terminals.length !== 2) return { kind: "keep" };
    const written = CircuitCheck.ohms(answer);
    if (written.length === 0) return { kind: "keep" };
    const measured = CircuitSolver.equivalentResistance(spec, terminals[0]!, terminals[1]!);
    if (measured === null) return { kind: "refuse" };
    let verdict: CircuitVerdict = { kind: "refuse" };
    if (written.some((value) => CircuitCheck.agree(value, measured))) verdict = { kind: "keep" };
    else {
      const factor = [1e3, 1e6, 1e-3].find((candidate) =>
        written.some((value) => CircuitCheck.agree(value, measured * candidate)),
      );
      if (factor !== undefined) verdict = { kind: "rescaled", factor };
    }
    if (verdict.kind === "refuse") return verdict;
    // A Thévenin voltage in the answer must be the one between the terminals.
    const voltages = CircuitCheck.volts(answer);
    if (voltages.length === 0 || verdict.kind !== "keep") return verdict;
    const open = CircuitSolver.openCircuitVoltage(spec, terminals[0]!, terminals[1]!);
    if (open === null) return verdict;
    if (voltages.some((value) => CircuitCheck.agree(value, open))) return verdict;
    const sources = spec.components.filter((item) => item.kind === "battery" || item.kind === "currentsource");
    if (sources.length === 1 && voltages.some((value) => CircuitCheck.agree(value, -open)))
      return { kind: "flipSource" };
    return { kind: "refuse" };
  },

  /** The premade to draw for this answer: as given, its resistances rescaled, its source turned, or null. */
  reconcile(premade: PremadeFigure, answer: string): PremadeFigure | null {
    const spec = CircuitSpecs.fromPremade(premade);
    if (!spec) return premade;
    const verdict = CircuitCheck.verdict(spec, answer);
    switch (verdict.kind) {
      case "keep":
        return premade;
      case "refuse":
        return null;
      case "flipSource": {
        for (const item of spec.components) {
          if (item.kind === "battery" || item.kind === "currentsource") [item.from, item.to] = [item.to, item.from];
        }
        // The currents follow the source.
        const solved = CircuitSolver.currents(spec);
        if (solved) for (const item of spec.components) item.current = solved[item.id] ?? null;
        return CircuitSpecs.premade(spec);
      }
      case "rescaled":
        for (const item of spec.components) {
          if (item.kind === "resistor" && item.value !== null) item.value *= verdict.factor;
        }
        return CircuitSpecs.premade(spec);
    }
  },
};

/** A group of resistors a lesson joins, and the equivalent the app works out between the two nodes it meets the rest. */
export interface CircuitMerge {
  ids: string[];
  ohms: number;
  /** The two nodes the equivalent resistor joins. */
  ends: string[];
}

export const CircuitMerges = {
  /** "R1,R2", "R1+R2", "R1 R2" → ["R1", "R2"]. */
  ids(text: string | null | undefined): string[] {
    if (!text) return [];
    const seen = new Set<string>();
    return text.split(/[,+ ;|&]/u).filter((id) => id !== "" && !seen.has(id) && Boolean(seen.add(id)));
  },

  /** Null unless every part is a resistor with a value and the group meets the rest at exactly two nodes. */
  make(spec: CircuitSpec, ids: readonly string[]): CircuitMerge | null {
    const group = spec.components.filter((item) => ids.includes(item.id));
    if (group.length !== ids.length || group.length < 2) return null;
    if (!group.every((item) => item.kind === "resistor" && (item.value ?? 0) > 0)) return null;
    const nodes = new Set(group.flatMap((item) => [item.from, item.to]));
    // An open part (a current source turned off, a capacitor in DC, an open switch) joins nothing.
    const outside = spec.components.filter(
      (item) =>
        !ids.includes(item.id) &&
        item.kind !== "currentsource" &&
        item.kind !== "capacitor" &&
        !(item.kind === "switch" && !item.isClosed),
    );
    const terminals = new Set(spec.terminals ?? []);
    const degree = (node: string) =>
      spec.components.reduce((sum, item) => sum + (item.from === node ? 1 : 0) + (item.to === node ? 1 : 0), 0);
    const boundary = [...nodes]
      .filter(
        (node) =>
          terminals.has(node) || outside.some((item) => item.from === node || item.to === node) || degree(node) === 1,
      )
      .sort();
    if (boundary.length !== 2) return null;
    const alone: CircuitSpec = { nodes: [...nodes], components: group, chargeTau: null, terminals: null };
    const ohms = CircuitSolver.equivalentResistance(alone, boundary[0]!, boundary[1]!);
    if (ohms === null) return null;
    return { ids: group.map((item) => item.id), ohms, ends: boundary };
  },
};
