// Port of LearnLayerTests/Space3DTests.swift @ ref 2026-11-04 (the app's own meeting point, the parts a step of the
// written solution names). The plane cut to the box and the line across it are the 2D drawing's (spaceFigure.test.ts).

import { describe, expect, it } from "vitest";
import { decodeSpaceFigure, type SpaceFigure } from "./spaceFigure";
import { Space3D, spaceParts } from "./spaceSteps";

/** A pyramid [ABCDV] (D at the origin), the plane ABV: 3x + z = 6, the line through C along its normal. */
const json = {
  points: [
    { name: "A", x: 2, y: 0, z: 0 },
    { name: "B", x: 2, y: 2, z: 0 },
    { name: "C", x: 0, y: 2, z: 0 },
    { name: "D", x: 0, y: 0, z: 0 },
    { name: "V", x: 1, y: 1, z: 3 },
  ],
  edges: ["AB", "BC", "CD", "DA", "VA", "VB", "VC", "VD"],
  line: { name: "r", point: [0, 2, 0], direction: [3, 0, 1], through: ["C"], step: null },
  plane: { name: "α", normal: [3, 0, 1], point: [2, 0, 0], through: ["A", "B", "V"], step: null },
};

function model(): SpaceFigure {
  const figure = decodeSpaceFigure(json);
  if (!figure) throw new Error("no figure");
  return figure;
}

describe("Space3D", () => {
  it("the line meets the plane where the app works it out", () => {
    const figure = model();
    const meet = Space3D.meet(figure.line, figure.plane);
    expect(meet).not.toBeNull();
    expect(Math.abs(meet!.x - 1.8)).toBeLessThan(1e-9);
    expect(Math.abs(meet!.y - 2)).toBeLessThan(1e-9);
    expect(Math.abs(meet!.z - 0.6)).toBeLessThan(1e-9);
    expect(Math.abs(3 * meet!.x + meet!.z - 6)).toBeLessThan(1e-9);
    expect(Space3D.parts(figure)).toContain("intersection");
  });

  it("each step lights what it names", () => {
    const figure = model();
    const plan = (formula: string, words = "") => new Set((spaceParts(formula, words, figure) ?? "").split(","));
    expect(
      plan(
        String.raw`\vec{n} = \overrightarrow{AB} \times \overrightarrow{AV} = (6, 0, 2)`,
        "Vetor normal ao plano ABV",
      ),
    ).toEqual(new Set(["AB", "VA", "normal", "plane"]));
    expect(plan(String.raw`3x + z - 6 = 0`, "Equação do plano")).toEqual(new Set(["plane"]));
    expect(plan(String.raw`(x, y, z) = (0, 2, 0) + k(3, 0, 1)`, "Reta r que passa em C")).toEqual(new Set(["line"]));
    expect(plan(String.raw`3(3k) + k = 6 \Rightarrow k = 0{,}6`, "Interseção da reta com o plano")).toEqual(
      new Set(["line", "plane", "intersection"]),
    );
    expect(plan(String.raw`V(1, 1, 3)`, "A altura da pirâmide")).toEqual(new Set(["V"]));
    expect(spaceParts("2 + 2 = 4", "Conta", figure)).toBeNull();
  });
});
