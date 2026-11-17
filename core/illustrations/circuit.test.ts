// Port of LearnLayerTests/Circuit3DSolveTests.swift @ ref 2026-11-04 (the solver, the check against the answer and the
// joined resistors; the board layout tests come with the 3D drawing).

import { describe, expect, it } from "vitest";
import { CircuitCheck, CircuitMerges, CircuitSolver, CircuitSpecs, type CircuitSpec } from "./circuit";
import type { PremadeFigure } from "./premadeFigure";

const sample = (json: string): PremadeFigure => ({ type: CircuitSpecs.generic, params: JSON.parse(json) });

function circuit(json: string): CircuitSpec {
  const spec = CircuitSpecs.fromPremade(sample(json));
  if (!spec) throw new Error("no circuit");
  return spec;
}

/** ICSE 25/26 MAP45 Q1: a–1.5 kΩ–bottom, a–1 kΩ–2 kΩ–bottom, bottom–2 kΩ–b. */
const icseQ1 = `
{"netlist": {"terminals": ["a", "b"], "components": [
  {"id": "R1", "kind": "resistor", "from": "a", "to": "n1", "value": 1000},
  {"id": "R2", "kind": "resistor", "from": "n1", "to": "n2", "value": 2000},
  {"id": "R3", "kind": "resistor", "from": "a", "to": "n2", "value": 1500},
  {"id": "R4", "kind": "resistor", "from": "n2", "to": "b", "value": 2000}]}}`;

describe("Circuit3DSolve", () => {
  it("the ICSE Q1 resistance is three kilohms", () => {
    const spec = circuit(icseQ1);
    expect(spec.terminals).toEqual(["a", "b"]);
    const r = CircuitSolver.equivalentResistance(spec, "a", "b");
    expect(r).not.toBeNull();
    expect(Math.abs(r! - 3000)).toBeLessThan(0.01);
  });

  it("the answer agrees or the figure is refused", () => {
    const spec = circuit(icseQ1);
    expect(CircuitCheck.verdict(spec, "(C) R_ab = 3 kΩ")).toEqual({ kind: "keep" });
    expect(CircuitCheck.verdict(spec, "R_{ab} = 3\\,\\text{k}\\Omega")).toEqual({ kind: "keep" });
    expect(CircuitCheck.verdict(spec, "𝑅𝑎𝑏 = 3 𝑘Ω")).toEqual({ kind: "keep" });
    expect(CircuitCheck.verdict(spec, "R_ab = 21/13 kΩ")).toEqual({ kind: "refuse" });
    expect(CircuitCheck.verdict(spec, "C")).toEqual({ kind: "keep" });
  });

  it("values written in kilohms are rescaled", () => {
    const inKilohms = icseQ1.replace(/000/g, "").replace("1500", "1.5");
    const spec = circuit(inKilohms);
    expect(CircuitCheck.verdict(spec, "R_ab = 3 kΩ")).toEqual({ kind: "rescaled", factor: 1000 });
    const premade = CircuitCheck.reconcile(sample(inKilohms), "R_ab = 3 kΩ");
    expect(premade).not.toBeNull();
    const fixed = CircuitSpecs.fromPremade(premade!);
    expect(fixed?.components.find((item) => item.id === "R3")?.value).toBe(1500);
    expect(fixed?.terminals).toEqual(["a", "b"]);
  });

  it("ohms are read from answers", () => {
    const fraction = CircuitCheck.ohms("R = 21/13 kΩ")[0];
    expect(Math.abs(fraction! - 21000 / 13)).toBeLessThan(1e-6);
    expect(CircuitCheck.ohms("6,5 kΩ")).toEqual([6500]);
    expect(CircuitCheck.ohms("470 ohms")).toEqual([470]);
    expect(CircuitCheck.ohms("I = 3 mA")).toEqual([]);
  });

  it("the app solves the currents", () => {
    // 9 V across 100 Ω and 200 Ω in parallel, with 100 Ω in series: I = 9 / (100 + 66.7) = 54 mA.
    const spec = circuit(`{"components": [
      {"id": "B1", "kind": "battery", "from": "d", "to": "a", "value": 9, "current": 5},
      {"id": "R1", "kind": "resistor", "from": "a", "to": "b", "value": 100},
      {"id": "R2", "kind": "resistor", "from": "b", "to": "d", "value": 100},
      {"id": "R3", "kind": "resistor", "from": "b", "to": "d", "value": 200}]}`);
    const total = 9 / (100 + 200 / 3);
    expect(Math.abs(CircuitSpecs.current(spec, "B1") - total)).toBeLessThan(1e-6);
    expect(Math.abs(CircuitSpecs.current(spec, "R1") - total)).toBeLessThan(1e-6);
    expect(Math.abs(CircuitSpecs.current(spec, "R2") - (total * 2) / 3)).toBeLessThan(1e-6);
    expect(Math.abs(CircuitSpecs.current(spec, "R3") - total / 3)).toBeLessThan(1e-6);
  });

  it("a current source and a coil are understood", () => {
    // ICSE Q2: 2 kΩ ∥ 3 mA ∥ 2 kΩ, then 1 kΩ to a; b at the bottom. R_th = 1 kΩ + 1 kΩ = 2 kΩ.
    const spec = circuit(`{"netlist": {"terminals": ["a", "b"], "components": [
      {"id": "R1", "kind": "resistor", "from": "t", "to": "b", "value": 2000},
      {"id": "I1", "kind": "current_source", "from": "t", "to": "b", "value": 0.003},
      {"id": "R2", "kind": "resistor", "from": "t", "to": "b", "value": 2000},
      {"id": "R3", "kind": "resistor", "from": "t", "to": "a", "value": 1000}]}}`);
    expect(spec.components.some((item) => item.kind === "currentsource")).toBe(true);
    const r = CircuitSolver.equivalentResistance(spec, "a", "b");
    expect(Math.abs(r! - 2000)).toBeLessThan(0.01);
    const coil = circuit(`{"components": [{"id": "L1", "kind": "coil", "from": "a", "to": "b", "value": 0.01}]}`);
    expect(coil.components[0]?.kind).toBe("inductor");
  });

  it("unjoined terminals have no resistance", () => {
    const spec = circuit(
      `{"netlist": {"terminals": ["a", "b"], "components": [{"id": "R1", "kind": "resistor", "from": "a", "to": "c", "value": 10}, {"id": "R2", "kind": "resistor", "from": "b", "to": "d", "value": 10}]}}`,
    );
    expect(CircuitSolver.equivalentResistance(spec, "a", "b")).toBeNull();
    expect(CircuitCheck.verdict(spec, "R = 20 Ω")).toEqual({ kind: "refuse" });
  });

  /** ICSE Q2 as Haiku drew it, its source pointing up: the answer's V_Th = −3 V turns it round. */
  it("the Thévenin voltage is checked and the one source turned", () => {
    const json = `{"netlist": {"terminals": ["a", "b"], "components": [
      {"id": "R1", "kind": "resistor", "from": "a", "to": "t", "value": 1000},
      {"id": "R2", "kind": "resistor", "from": "t", "to": "b", "value": 2000},
      {"id": "R3", "kind": "resistor", "from": "t", "to": "b", "value": 2000},
      {"id": "I1", "kind": "current_source", "from": "b", "to": "t", "value": 0.003}]}}`;
    const spec = circuit(json);
    const open = CircuitSolver.openCircuitVoltage(spec, "a", "b");
    expect(Math.abs(open! - 3)).toBeLessThan(1e-9);
    expect(CircuitCheck.verdict(spec, "(B) R_Th = 2 kΩ e V_Th = 3 V")).toEqual({ kind: "keep" });
    expect(CircuitCheck.verdict(spec, "(B) R_Th = 2 kΩ e V_Th = −3 V")).toEqual({ kind: "flipSource" });
    expect(CircuitCheck.verdict(spec, "R_Th = 2 kΩ e V_Th = 9 V")).toEqual({ kind: "refuse" });
    const fixed = CircuitCheck.reconcile(sample(json), "V_Th = −3 V, R_Th = 2 kΩ");
    const turned = CircuitSpecs.fromPremade(fixed!);
    expect(Math.abs((CircuitSolver.openCircuitVoltage(turned!, "a", "b") ?? 0) + 3)).toBeLessThan(1e-9);
    expect(CircuitCheck.volts("V_{Th} = -3\\,\\text{V}")).toEqual([-3]);
  });

  /** A lesson beat that joins resistors: the equivalent between the two nodes where the group meets the rest. */
  it("joined resistors show their equivalent", () => {
    const spec = circuit(icseQ1);
    expect(CircuitMerges.ids("R1, R2")).toEqual(["R1", "R2"]);
    expect(CircuitMerges.ids("R1+R2+R1")).toEqual(["R1", "R2"]);
    const series = CircuitMerges.make(spec, ["R1", "R2"]);
    expect(Math.abs(series!.ohms - 3000)).toBeLessThan(1e-6);
    const block = CircuitMerges.make(spec, ["R1", "R2", "R3"]);
    expect(Math.abs(block!.ohms - 1000)).toBeLessThan(1e-6);
    const all = CircuitMerges.make(spec, ["R1", "R2", "R3", "R4"]);
    expect(Math.abs(all!.ohms - 3000)).toBeLessThan(1e-6);
    // R1 and R4 do not meet the rest at two nodes: no join, only a highlight.
    expect(CircuitMerges.make(spec, ["R1", "R4"])).toBeNull();
  });

  it("the templates and the netlist round trip", () => {
    const rc = CircuitSpecs.fromPremade({ type: CircuitSpecs.seriesRC, params: {} });
    expect(rc?.chargeTau).toBe(2.5);
    const open = CircuitSpecs.fromPremade({ type: CircuitSpecs.seriesLampSwitch, params: { closed: false } });
    expect(open && CircuitSpecs.current(open, "L1")).toBe(0);
    const back = CircuitSpecs.fromPremade(CircuitSpecs.premade(circuit(icseQ1)));
    expect(back?.components.map((item) => item.id)).toEqual(["R1", "R2", "R3", "R4"]);
    expect(CircuitSpecs.fromPremade({ type: "something_else", params: {} })).toBeNull();
  });
});
