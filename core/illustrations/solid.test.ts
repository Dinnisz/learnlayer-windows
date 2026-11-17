// Port of LearnLayerTests/Figure3DGenericTests.swift @ ref 2026-11-04: the safe formula reader and the volume checked
// against the answer. The tests of the mesh builder (kinds' geometry, falling back to 2D) come with the builder.

import { describe, expect, it } from "vitest";
import { checkableSolid, fixedSolid, GenericSolids, SafeFormula, SolidCheck, type GenericSolid } from "./solid";
import { GenericSolidBuilder, type BuiltSolid } from "./solidBuilder";

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

const tryParse = (json: string) => GenericSolids.fromParams(JSON.parse(json));
const built = (json: string): BuiltSolid => {
  const figure = GenericSolidBuilder.build(solid(json));
  if (!figure) throw new Error("not built");
  return figure;
};
const meshOf = (figure: BuiltSolid, name: string) => figure.pieces.find((part) => part.name === name)?.mesh ?? null;

describe("GenericSolidBuilder", () => {
  it("a revolution about Ox has the right radius", () => {
    const figure = built(`{"kind":"revolution","f":"sqrt(x)","axis":"x","a":0,"b":4}`);
    expect(GenericSolidBuilder.order(figure)).toEqual(["region", "curve", "axis", "surface", "ends", "section"]);
    const surface = meshOf(figure, "surface")!;
    expect(surface.rows).toBe(GenericSolidBuilder.curveSamples + 1);
    expect(surface.columns).toBe(GenericSolidBuilder.turnSamples + 1);
    // Radius 2 at x = 4 on a length of 4: as tall (−2…2) as it is long, same scale on both.
    const xs = surface.positions.map((p) => p[0]);
    const ys = surface.positions.map((p) => p[1]);
    const length = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(Math.abs(height / length - 1)).toBeLessThan(0.01);
  });

  it("a washer about a line has a hole", () => {
    const order = GenericSolidBuilder.order(
      built(`{"kind":"revolution","f":"x","g":"x^2","axis":"x","k":-1,"a":0,"b":1}`),
    );
    expect(order).toContain("inner");
    expect(order).toContain("curve2");
  });

  it("a shell about Oy is upright", () => {
    const surface = meshOf(built(`{"kind":"revolution","f":"x^2","axis":"y","a":0,"b":2}`), "surface")!;
    // Every ring is level (same scene y).
    for (let i = 0; i < surface.rows; i += 1) {
      const row = surface.positions.slice(i * surface.columns, (i + 1) * surface.columns);
      expect(row.every((p) => Math.abs(p[1] - row[0]![1]) < 1e-4)).toBe(true);
    }
  });

  it("a region crossing its axis falls back to 2D", () => {
    expect(tryParse(`{"kind":"revolution","f":"sin(x)","axis":"x","a":0,"b":6.28}`)).toBeNull();
    expect(tryParse(`{"kind":"revolution","f":"x","axis":"y","k":1,"a":0,"b":2}`)).toBeNull();
  });

  it("a surface grid is bounded and centred", () => {
    const mesh = meshOf(built(`{"kind":"surface","z":"x^2+y^2","x":[-2,2],"y":[-2,2]}`), "surface")!;
    expect(mesh.rows * mesh.columns).toBeLessThanOrEqual(200 * 200);
    expect(mesh.finiteFraction).toBe(1);
    expect(mesh.positions.every((p) => Math.max(...p.map(Math.abs)) <= 2.01)).toBe(true);
  });

  it("a pole is left out, not drawn as a spike", () => {
    const mesh = meshOf(built(`{"kind":"surface","z":"1/(x^2+y^2)","x":[-1,1],"y":[-1,1]}`), "surface")!;
    expect(mesh.finiteFraction).toBeLessThan(1);
    expect(mesh.finiteFraction).toBeGreaterThanOrEqual(GenericSolidBuilder.minimumDefined);
  });

  it("a parametric torus, a bounded solid and sections", () => {
    built(
      `{"kind":"parametric","x":"(2+0.7cos(v))cos(u)","y":"(2+0.7cos(v))sin(u)","z":"0.7sin(v)","u":[0,6.2832],"v":[0,6.2832]}`,
    );
    const tetra = built(`{"kind":"bounded","top":"6-2x-3y","x":[0,3],"ylow":"0","yhigh":"2-2x/3"}`);
    expect(GenericSolidBuilder.order(tetra)).toEqual(["region", "surface", "inner", "ends"]);
    const sections = built(`{"kind":"sections","f":"sqrt(x)","g":"-sqrt(x)","a":0,"b":4,"section":"semicircle"}`);
    expect(GenericSolidBuilder.order(sections)).toEqual(["region", "curve", "curve2", "surface", "section"]);
  });

  it("top under bottom falls back to 2D", () => {
    expect(tryParse(`{"kind":"bounded","top":"x","bottom":"1","x":[0,2],"y":[0,1]}`)).toBeNull();
  });

  it("bounds and bad params fall back", () => {
    expect(tryParse(`{"kind":"surface","z":"x","x":[0,1e9],"y":[0,1]}`)).toBeNull();
    expect(tryParse(`{"kind":"surface","z":"x","x":[1,1],"y":[0,1]}`)).toBeNull();
    expect(tryParse(`{"kind":"blob","z":"x"}`)).toBeNull();
    expect(tryParse(`{"kind":"surface","z":"exec(x)","x":[0,1],"y":[0,1]}`)).toBeNull();
    expect(tryParse(`{"kind":"revolution","f":"1/(x-x)","a":0,"b":1}`)).toBeNull();
  });

  it("planes are cut planes", () => {
    const figure = built(
      `{"kind":"parametric","x":"2sin(v)cos(u)","y":"2sin(v)sin(u)","z":"2cos(v)","u":[0,6.2832],"v":[0,3.1416],"planes":[{"z":1}]}`,
    );
    expect(GenericSolidBuilder.order(figure).at(-1)).toBe("cutPlane");
  });

  it("building is fast", () => {
    const start = performance.now();
    built(`{"kind":"surface","z":"sin(x)*cos(y)+sqrt(x^2+y^2)","x":[-3,3],"y":[-3,3]}`);
    expect(performance.now() - start).toBeLessThan(300); // fromParams builds once to check, then again here
  });
});

describe("Fixed solids", () => {
  it("every fixed id still draws, through the generic builder", () => {
    for (const type of [
      "solid_cone",
      "solid_cylinder",
      "solid_sphere",
      "solid_paraboloid",
      "solid_torus",
      "solid_of_revolution",
      "solid_of_revolution_sqrt",
      "solid_washer_x_x2",
      "solid_sphere_plane_cut",
    ]) {
      const fixed = fixedSolid({ type, params: {} });
      expect(fixed, type).not.toBeNull();
      expect(GenericSolidBuilder.build(fixed!), type).not.toBeNull();
    }
    expect(fixedSolid({ type: "functionGraph", params: {} })).toBeNull();
  });

  it("the cut sphere has its plane, and sizes come from the params", () => {
    const cut = GenericSolidBuilder.build(fixedSolid({ type: "solid_sphere_plane_cut", params: { r: 3, h: 1 } })!)!;
    expect(GenericSolidBuilder.order(cut).at(-1)).toBe("cutPlane");
    const cone = fixedSolid({ type: "solid_cone", params: { r: 2, h: 6 } })!;
    // An upright cone of radius 2 and height 6: V = πr²h/3 = 8π.
    expect(Math.abs(SolidCheck.volume(cone)! - 8 * Math.PI)).toBeLessThan(1e-3);
  });

  it("a fixed revolution with its own curve is checked like a generic one", () => {
    const own = checkableSolid({ type: "solid_of_revolution", params: { f: "x^2", a: 0, b: 2 } });
    expect(own).not.toBeNull();
    expect(SolidCheck.agrees(own!, "V = 32π/5")).toBe(true);
    expect(checkableSolid({ type: "solid_cone", params: {} })).toBeNull();
  });
});
