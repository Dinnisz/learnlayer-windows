// Port of LearnLayerTests/Figure3DStepsTests.swift @ ref 2026-11-04 (the circuit reduced step by step, a solid's step
// lighting its part). The slice along the volume's integral and the joining animation come with the 3D step hooks.

import { describe, expect, it } from "vitest";
import { CircuitSpecs, type CircuitSpec } from "./circuit";
import {
  CircuitReduction,
  Figure3DSteps,
  solidPartOpacity,
  solidStepPlan,
  stepFigureHooks,
  sweepOpacity,
} from "./figureSteps";
import { LatexIntegrals } from "./latexIntegral";
import { GenericSolids, solidOf } from "./solid";

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

  it("a card's own figure hooks come first; a derived highlight only where the plan changes", () => {
    const plan = ["R2,R3", "R2,R3", null, "R1,R2,R3"];
    const cards = [
      { figureHighlight: null, assembleStep: null },
      { figureHighlight: null, assembleStep: 2 },
      { figureHighlight: "R4", assembleStep: null },
      { figureHighlight: null, assembleStep: null },
    ];
    expect(stepFigureHooks(plan, cards, 0)).toEqual({ highlight: "R2,R3", assembleStep: null });
    expect(stepFigureHooks(plan, cards, 1)).toEqual({ highlight: null, assembleStep: 2 });
    expect(stepFigureHooks(plan, cards, 2)).toEqual({ highlight: "R4", assembleStep: null });
    expect(stepFigureHooks(plan, cards, 3)).toEqual({ highlight: "R1,R2,R3", assembleStep: null });
    expect(stepFigureHooks(plan, cards, 9)).toEqual({ highlight: null, assembleStep: null });
  });

  it("the slice travels one slice after another and the last one stays", () => {
    // Four slices over 1.8 s: 0.45 s each, fading in for 0.18 s.
    expect(sweepOpacity(0, 4, 0, false)).toBe(0);
    expect(sweepOpacity(0, 4, 0.2, false)).toBeCloseTo(0.9);
    expect(sweepOpacity(1, 4, 0.2, false)).toBe(0);
    expect(sweepOpacity(0, 4, 1.5, false)).toBe(0);
    expect(sweepOpacity(3, 4, 10, false)).toBeCloseTo(0.9);
    expect([0, 1, 2, 3].map((index) => sweepOpacity(index, 4, 99, true))).toEqual([0.8, 0, 0.8, 0.8]);
  });

  it("a step shows the parts assembled so far and dims the ones it doesn't name", () => {
    const order = ["region", "curve", "axis", "surface", "section"];
    expect(solidPartOpacity("surface", order, null)).toBe(1);
    const two = { highlight: null, assembleStep: 2 };
    expect(order.map((name) => solidPartOpacity(name, order, two))).toEqual([1, 1, 0, 0, 0]);
    const washer = { highlight: "washer,f", assembleStep: null };
    expect(order.map((name) => solidPartOpacity(name, order, washer))).toEqual([0.3, 1, 0.3, 0.3, 1]);
    // A part not shown yet is not lit; with none left lit, everything shown is as drawn.
    expect(solidPartOpacity("region", order, { highlight: "section", assembleStep: 1 })).toBe(1);
    const sweep = { highlight: "sweep,section", assembleStep: null };
    expect(solidPartOpacity("surface", order, sweep)).toBeNull();
    expect(solidPartOpacity("section", order, sweep)).toBe(1);
    expect(solidPartOpacity("curve", order, sweep)).toBe(0.3);
  });

  it("a solid's step lights the part it works with", () => {
    const parts = ["region", "curve", "axis", "surface", "section"];
    expect(Figure3DSteps.solidPart("Raio de cada disco: r = √x", parts)).toBe("section");
    expect(Figure3DSteps.solidPart("Rotação em torno do eixo Ox", parts)).toBe("axis");
    expect(Figure3DSteps.solidPart("V = 8π", parts)).toBeNull();
  });

  it("integrals are read from LaTeX and worked out", () => {
    const value = (latex: string) => {
      const integral = LatexIntegrals.read(latex);
      if (!integral) throw new Error(`not read: ${latex}`);
      return LatexIntegrals.value(integral) ?? 0;
    };
    expect(
      Math.abs(value(String.raw`V = \pi \int_{0}^{4} \left(\sqrt{x}\right)^2 \, dx = 8\pi`) - 8 * Math.PI),
    ).toBeLessThan(1e-6);
    expect(
      Math.abs(value(String.raw`V = \pi\int_0^1 \left[(x+1)^2 - (x^2+1)^2\right] dx`) - (7 * Math.PI) / 15),
    ).toBeLessThan(1e-6);
    expect(Math.abs(value(String.raw`V = 2\pi \int_{0}^{2} x \cdot x^{2} \, dx`) - 8 * Math.PI)).toBeLessThan(1e-6);
    expect(Math.abs(value(String.raw`V = \int_0^4 \frac{\pi}{2} x \, dx`) - 4 * Math.PI)).toBeLessThan(1e-6);
    expect(LatexIntegrals.read("x = 2")).toBeNull();
  });

  it("the step that writes the volume sends the slice along", () => {
    const solid = solidOf({
      premade: { type: GenericSolids.premadeType, params: { kind: "revolution", f: "x^2", axis: "y", a: 0, b: 2 } },
    });
    if (!solid) throw new Error("no solid");
    const plan = solidStepPlan(solid, [
      { formula: String.raw`\text{Método das cascas}`, words: "Escolha do método: cascas cilíndricas" },
      { formula: String.raw`V = 2\pi \int_{0}^{2} x \cdot x^{2} \, dx`, words: "Montar a integral" },
      { formula: String.raw`V = 2\pi \int_{0}^{2} x^{2} \, dx`, words: "Um integral errado não move nada" },
    ]);
    expect(plan[0]).toBe("section");
    expect(plan[1]).toBe("sweep,section");
    expect(plan[2]).not.toBe("sweep,section");
  });
});
