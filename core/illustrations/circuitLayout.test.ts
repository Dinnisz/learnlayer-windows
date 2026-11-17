// Port of the board tests in LearnLayerTests/Circuit3DSolveTests.swift @ ref 2026-11-04 (CircuitPlacement and
// CircuitLayout): no part on another, no wire through a node, parallel branches between aligned nodes, quick enough.

import { describe, expect, it } from "vitest";
import { CircuitSpecs, type CircuitSpec } from "./circuit";
import { CircuitLayouts, CircuitPlacement } from "./circuitLayout";

function circuit(json: string): CircuitSpec {
  const spec = CircuitSpecs.fromPremade({ type: CircuitSpecs.generic, params: JSON.parse(json) });
  if (!spec) throw new Error("no circuit");
  return spec;
}

/** The fastest of three runs, in milliseconds: the same 100 ms bound as the Mac, without the noise of a full parallel run. */
function fastest<T>(run: () => T): [T, number] {
  let best = Infinity;
  let result: T | undefined;
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    result = run();
    best = Math.min(best, performance.now() - start);
  }
  return [result as T, best];
}

const edges = (spec: CircuitSpec) => spec.components.map((item): [string, string] => [item.from, item.to]);

describe("CircuitPlacement", () => {
  /** Round 12: the ring put 1 kΩ on top of 1.5 kΩ and ran a wire from a to b. */
  it("the ICSE Q1 board has no part on another and no wire through a node", () => {
    const spec = circuit(`{"netlist": {"terminals": ["a", "b"], "components": [
      {"id": "R1", "kind": "resistor", "from": "a", "to": "n2", "value": 1500},
      {"id": "R2", "kind": "resistor", "from": "a", "to": "m", "value": 1000},
      {"id": "R3", "kind": "resistor", "from": "m", "to": "n2", "value": 2000},
      {"id": "R4", "kind": "resistor", "from": "n2", "to": "b", "value": 2000}]}}`);
    const [placement, milliseconds] = fastest(() => CircuitPlacement.best(spec));
    expect(milliseconds).toBeLessThan(100);
    const score = CircuitPlacement.score(placement.cells, edges(spec), new Set(["a", "b"]));
    expect(score).not.toBeNull();
    expect(score![0]).toBeLessThan(100);
    const layout = CircuitLayouts.make(spec);
    // Bodies apart from one another.
    const centres = [...layout.bodies.values()].map((body) => body.center);
    centres.forEach((c, i) => {
      for (const d of centres.slice(i + 1)) expect(Math.hypot(c.x - d.x, c.y - d.y)).toBeGreaterThan(0.5);
    });
  });

  it("six nodes are laid out quickly", () => {
    const spec = circuit(`{"components": [
      {"id": "B1", "kind": "battery", "from": "f", "to": "a", "value": 9},
      {"id": "R1", "kind": "resistor", "from": "a", "to": "b", "value": 100},
      {"id": "R2", "kind": "resistor", "from": "b", "to": "c", "value": 100},
      {"id": "R3", "kind": "resistor", "from": "c", "to": "d", "value": 100},
      {"id": "R4", "kind": "resistor", "from": "d", "to": "e", "value": 100},
      {"id": "R5", "kind": "resistor", "from": "e", "to": "f", "value": 100},
      {"id": "R6", "kind": "resistor", "from": "b", "to": "e", "value": 100}]}`);
    const [, milliseconds] = fastest(() => CircuitLayouts.make(spec));
    expect(milliseconds).toBeLessThan(100);
  });

  /** Round 12, ICSE Q3: the ground node joins three branches; no wire may end on the battery. */
  it("the ICSE Q3 board has no wire on another part", () => {
    const spec = circuit(`{"components": [
      {"id": "V1", "kind": "battery", "from": "0", "to": "n1", "value": 20},
      {"id": "R2", "kind": "resistor", "from": "n1", "to": "n2", "value": 75000},
      {"id": "R4", "kind": "resistor", "from": "n2", "to": "0", "value": 50000},
      {"id": "R3", "kind": "resistor", "from": "n2", "to": "n3", "value": 50000},
      {"id": "L5", "kind": "inductor", "from": "n3", "to": "0", "value": 0.01}]}`);
    const placement = CircuitPlacement.best(spec);
    const score = CircuitPlacement.score(placement.cells, edges(spec), new Set());
    expect(score).not.toBeNull();
    expect(score![0]).toBeLessThan(100);
  });

  /** Round 12, ICSE Q2: three parts in parallel between t and b sit between aligned nodes. */
  it("parallel branches are between aligned nodes", () => {
    const spec = circuit(`{"netlist": {"terminals": ["a", "b"], "components": [
      {"id": "R1", "kind": "resistor", "from": "t", "to": "a", "value": 1000},
      {"id": "R2", "kind": "resistor", "from": "t", "to": "b", "value": 2000},
      {"id": "I1", "kind": "current_source", "from": "t", "to": "b", "value": 0.003},
      {"id": "R3", "kind": "resistor", "from": "t", "to": "b", "value": 2000}]}}`);
    const layout = CircuitLayouts.make(spec);
    const t = layout.nodes.get("t")!;
    const b = layout.nodes.get("b")!;
    expect(Math.abs(t.x - b.x) < 1e-9 || Math.abs(t.y - b.y) < 1e-9).toBe(true);
    expect(new Set(layout.bodies.keys())).toEqual(new Set(["R1", "R2", "I1", "R3"]));
  });

  it("a body leaves a gap in its wire", () => {
    const spec = circuit(`{"components": [
      {"id": "B1", "kind": "battery", "from": "c", "to": "a", "value": 9},
      {"id": "R1", "kind": "resistor", "from": "a", "to": "b", "value": 100},
      {"id": "W1", "kind": "wire", "from": "b", "to": "c"}]}`);
    const layout = CircuitLayouts.make(spec);
    const pieces = CircuitLayouts.wires(layout, "R1");
    const gap =
      pieces.length === 2 ? Math.hypot(pieces[1]![0].x - pieces[0]![1].x, pieces[1]![0].y - pieces[0]![1].y) : 0;
    expect(gap).toBeCloseTo(CircuitLayouts.bodyLength);
    expect(layout.bodies.has("W1")).toBe(false);
  });
});
