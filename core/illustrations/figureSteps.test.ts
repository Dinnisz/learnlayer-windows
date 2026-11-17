// Port of LearnLayerTests/Figure3DStepsTests.swift @ ref 2026-11-04 (the circuit reduced step by step, a solid's step
// lighting its part). The slice along the volume's integral and the joining animation come with the 3D step hooks.

import { describe, expect, it } from "vitest";
import { CircuitSpecs, type CircuitSpec } from "./circuit";
import { CircuitReduction, Figure3DSteps } from "./figureSteps";

function circuit(json: string): CircuitSpec {
  const spec = CircuitSpecs.fromPremade({ type: CircuitSpecs.generic, params: JSON.parse(json) });
  if (!spec) throw new Error("no circuit");
  return spec;
}

describe("Figure3DSteps", () => {
  /** ICSE 25/26 Q1 as the app drew it and the three steps its solution wrote. */
  it("the ICSE Q1 steps reduce the circuit step by step", () => {
    const spec = circuit(`{"netlist": {"terminals": ["a", "b"], "components": [
      {"id": "R1", "kind": "resistor", "from": "a", "to": "n2", "value": 1500},
      {"id": "R2", "kind": "resistor", "from": "a", "to": "m", "value": 1000},
      {"id": "R3", "kind": "resistor", "from": "m", "to": "n2", "value": 2000},
      {"id": "R4", "kind": "resistor", "from": "n2", "to": "b", "value": 2000}]}}`);
    const steps = [
      "R_{\\text{série}} = 1\\text{ k}\\Omega + 2\\text{ k}\\Omega = 3\\text{ k}\\Omega",
      "R_p = \\frac{3 \\times 1{,}5}{3 + 1{,}5} = \\frac{4{,}5}{4{,}5} = 1\\text{ k}\\Omega",
      "R_{ab} = R_p + 2\\text{ k}\\Omega = 1\\text{ k}\\Omega + 2\\text{ k}\\Omega = 3\\text{ k}\\Omega",
    ];
    expect(CircuitReduction.plan(spec, steps)).toEqual([
      ["R2", "R3"],
      ["R1", "R2", "R3"],
      ["R1", "R2", "R3", "R4"],
    ]);
  });

  /** ICSE Q2 (Thévenin): the source is turned off, so 2 kΩ ∥ 2 kΩ then the 1 kΩ in series. */
  it("a Thévenin step reduces with the source off", () => {
    const spec = circuit(`{"netlist": {"terminals": ["a", "b"], "components": [
      {"id": "R1", "kind": "resistor", "from": "t", "to": "a", "value": 1000},
      {"id": "R2", "kind": "resistor", "from": "t", "to": "b", "value": 2000},
      {"id": "I1", "kind": "current_source", "from": "t", "to": "b", "value": 0.003},
      {"id": "R3", "kind": "resistor", "from": "t", "to": "b", "value": 2000}]}}`);
    const plan = CircuitReduction.plan(spec, [
      "R_{Th} = 1\\text{ k}\\Omega + (2\\text{ k}\\Omega \\parallel 2\\text{ k}\\Omega) = 1\\text{ k}\\Omega + 1\\text{ k}\\Omega = 2\\text{ k}\\Omega",
      "V_{Th} = -3\\text{ V}",
    ]);
    expect(plan).toEqual([
      ["R1", "R2", "R3"],
      ["R1", "R2", "R3"],
    ]);
  });

  it("numbers that combine nothing leave the figure alone", () => {
    const spec = circuit(
      `{"components": [{"id": "R1", "kind": "resistor", "from": "a", "to": "b", "value": 100}, {"id": "R2", "kind": "resistor", "from": "b", "to": "c", "value": 200}]}`,
    );
    expect(CircuitReduction.plan(spec, ["I = 12 / 300 = 0,04 A", "R = 100 + 200 = 300 Ω"])).toEqual([
      null,
      ["R1", "R2"],
    ]);
    expect(CircuitReduction.values("\\frac{21}{13} = 1{,}6").some((value) => Math.abs(value - 21 / 13) < 1e-9)).toBe(
      true,
    );
  });

  it("a solid's step lights the part it works with", () => {
    const parts = ["region", "curve", "axis", "surface", "section"];
    expect(Figure3DSteps.solidPart("Raio de cada disco: r = √x", parts)).toBe("section");
    expect(Figure3DSteps.solidPart("Rotação em torno do eixo Ox", parts)).toBe("axis");
    expect(Figure3DSteps.solidPart("V = 8π", parts)).toBeNull();
  });
});
