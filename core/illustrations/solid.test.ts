// Port of LearnLayerTests/Figure3DGenericTests.swift @ ref 2026-11-04: the safe formula reader and the volume checked
// against the answer. The tests of the mesh builder (kinds' geometry, falling back to 2D) come with the builder.

import { describe, expect, it } from "vitest";
import { GenericSolids, SafeFormula, SolidCheck, type GenericSolid } from "./solid";

const solid = (json: string): GenericSolid => {
  const found = GenericSolids.fromParams(JSON.parse(json));
  if (!found) throw new Error("no solid");
  return found;
};

describe("SafeFormula", () => {
  it("precedence and powers", () => {
    expect(SafeFormula.make("1 + 2*x^2 - -3", ["x"])!.valueAt(2)).toBe(12);
    expect(SafeFormula.make("2^3^2", [])!.value({})).toBe(512);
    expect(SafeFormula.make("-x^2", ["x"])!.valueAt(3)).toBe(-9);
  });

  it("functions and constants", () => {
    const f = SafeFormula.make("sqrt(x) + sin(pi/2) + ln(e) + abs(-2) + exp(0) + cos(0) + tan(0) + log(100)", ["x"]);
    expect(Math.abs(f!.valueAt(4) - (2 + 1 + 1 + 2 + 1 + 1 + 0 + 2))).toBeLessThan(1e-12);
  });

  it("a Portuguese decimal comma reads as a point", () => {
    expect(SafeFormula.make("0,5x^2", ["x"])!.valueAt(2)).toBe(2);
    expect(SafeFormula.make("y = 1,25", [])!.value({})).toBe(1.25);
  });

  it("anything but maths is rejected", () => {
    for (const text of [
      "system(x)",
      "x; rm -rf /",
      "`ls`",
      'x"',
      "$(x)",
      "x[0]",
      "x == 1",
      "a + x",
      "{x}",
      "import Foundation",
      "x+".repeat(100) + "x",
      "(".repeat(20) + "x" + ")".repeat(20),
    ]) {
      expect(SafeFormula.make(text, ["x"]), text).toBeNull();
    }
    expect(SafeFormula.make("x + y", ["x"])).toBeNull();
    expect(SafeFormula.make("", ["x"])).toBeNull();
    expect(SafeFormula.make("2 +", ["x"])).toBeNull();
  });

  it("undefined values are NaN, never infinite", () => {
    expect(SafeFormula.make("1/x", ["x"])!.valueAt(0)).toBeNaN();
    expect(SafeFormula.make("sqrt(x)", ["x"])!.valueAt(-1)).toBeNaN();
  });
});

describe("SolidCheck", () => {
  it("the volume of each round 10 solid matches its answer", () => {
    const washer = solid(`{"kind":"revolution","f":"x","g":"x^2","axis":"x","k":-1,"a":0,"b":1}`);
    expect(Math.abs((SolidCheck.volume(washer) ?? 0) - (7 * Math.PI) / 15)).toBeLessThan(1e-6);
    expect(SolidCheck.agrees(washer, "V = 7π/15 (unidades de volume)")).toBe(true);
    const shell = solid(`{"kind":"revolution","f":"x^2","axis":"y","a":0,"b":2}`);
    expect(SolidCheck.agrees(shell, "V = 8π (≈ 25,13 unidades de volume)")).toBe(true);
    const tetra = solid(`{"kind":"bounded","top":"6-2x-3y","x":[0,3],"ylow":"0","yhigh":"(6-2x)/3"}`);
    expect(Math.abs((SolidCheck.volume(tetra) ?? 0) - 6)).toBeLessThan(1e-3);
    const semicircles = solid(`{"kind":"sections","f":"sqrt(x)","g":"-sqrt(x)","a":0,"b":4,"section":"semicircle"}`);
    expect(SolidCheck.agrees(semicircles, "V = 4\\pi")).toBe(true);
  });

  it("a solid turned about the wrong axis or missing a curve is refused", () => {
    // Round 10: y = x² about Oy drawn about Ox (32π/5), and the washer drawn without g or its line.
    const aboutOx = solid(`{"kind":"revolution","f":"x^2","axis":"x","a":0,"b":2}`);
    expect(SolidCheck.agrees(aboutOx, "V = 8π")).toBe(false);
    const noWasher = solid(`{"kind":"revolution","f":"x","axis":"x","a":0,"b":1}`);
    expect(SolidCheck.agrees(noWasher, "V = 7π/15")).toBe(false);
    expect(SolidCheck.agrees(noWasher, "Ver os passos")).toBeNull();
  });

  it("answer values are read", () => {
    expect(SolidCheck.values("V = 8π ≈ 25,13 unidades de volume").some((v) => Math.abs(v - 8 * Math.PI) < 1e-9)).toBe(
      true,
    );
    expect(SolidCheck.values("V = \\frac{7\\pi}{15}").some((v) => Math.abs(v - (7 * Math.PI) / 15) < 1e-9)).toBe(true);
    expect(SolidCheck.values("V = 6 cubic units.")).toEqual([6]);
  });

  it("the statement's axis repairs a revolution", () => {
    expect(SolidCheck.axis("Calcule o volume do sólido obtido pela rotação, em torno do eixo Oy, da região")).toEqual({
      kind: "vertical",
      k: 0,
    });
    expect(SolidCheck.axis("obtido pela rotação, em torno da reta y = −1, da região")).toEqual({
      kind: "horizontal",
      k: -1,
    });
    expect(SolidCheck.axis("rotating the region about the line x = 2")).toEqual({ kind: "vertical", k: 2 });
    expect(SolidCheck.axis("em torno do eixo Ox")).toEqual({ kind: "horizontal", k: 0 });
    expect(SolidCheck.axis("Calcule a área.")).toBeNull();
    const aboutOx = solid(`{"kind":"revolution","f":"x^2","a":0,"b":2}`);
    const statement =
      "Calcule o volume do sólido obtido pela rotação, em torno do eixo Oy, da região limitada por y = x^2, pelo eixo Ox e pela reta x = 2.";
    const fixed = SolidCheck.repaired(aboutOx, statement, "V = 8π");
    expect(fixed).not.toBeNull();
    expect(fixed!.kind.kind === "revolution" && fixed!.kind.axis).toEqual({ kind: "vertical", k: 0 });
    const back = GenericSolids.fromPremade(GenericSolids.premade(fixed!));
    expect(back && GenericSolids.same(back, fixed!)).toBe(true);
    // Turning it does not make 5π: no repair.
    expect(SolidCheck.repaired(aboutOx, statement, "V = 5π")).toBeNull();
  });

  it("an empty premade is no solid", () => {
    expect(GenericSolids.fromPremade({ type: GenericSolids.premadeType, params: {} })).toBeNull();
  });
});
