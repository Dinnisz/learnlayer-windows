// Port of LearnLayerTests/Figure3DAuditTests.swift @ 5701363: the audit of the 3D figures (8 Nov 2026), with known
// volumes, how answers are read, and space figures. Each test states what a correct figure needs. (The cache case,
// `aSavedAnswerIsNotReusedInTheOtherLanguage`, is in core/ai/diskCache.test.ts.)
import { describe, expect, it } from "vitest";
import { checkableSolid, GenericSolids, SolidCheck, solidOf, type GenericSolid } from "./solid";
import { GenericSolidBuilder } from "./solidBuilder";
import { decodeSpaceFigure, SpaceFigures, type SpaceFigure } from "./spaceFigure";
import type { PremadeFigure } from "./premadeFigure";

const sample = (type: string, json: string): PremadeFigure => ({
  type,
  params: JSON.parse(json) as PremadeFigure["params"],
});
const solid = (json: string): GenericSolid | null => GenericSolids.fromPremade(sample(GenericSolids.premadeType, json));
const volume = (json: string) => {
  const found = solid(json);
  return found ? SolidCheck.volume(found) : null;
};

describe("3D audit: volumes against textbook answers", () => {
  it("measures the textbook volumes", () => {
    const cases: [string, number][] = [
      ['{"kind":"revolution","f":"sqrt(x)","a":0,"b":4}', 8 * Math.PI],
      ['{"kind":"revolution","f":"x","g":"x^2","a":0,"b":1}', (2 * Math.PI) / 15],
      ['{"kind":"revolution","f":"x^2","axis":"y","a":0,"b":1}', Math.PI / 2],
      ['{"kind":"revolution","f":"x","g":"x^2","axis":"y","a":0,"b":1}', Math.PI / 6],
      ['{"kind":"revolution","f":"x^2","axis":"x","k":-1,"a":0,"b":1}', Math.PI * (1 / 5 + 2 / 3)],
      ['{"kind":"revolution","f":"x^2","axis":"y","k":2,"a":0,"b":1}', 2 * Math.PI * (2 / 3 - 1 / 4)],
      ['{"kind":"revolution","f":"sqrt(4-x^2)","a":-2,"b":2}', (32 * Math.PI) / 3],
      ['{"kind":"sections","f":"sqrt(x)","g":"-sqrt(x)","a":0,"b":4,"section":"square"}', 32],
      ['{"kind":"sections","f":"1-x","a":0,"b":1,"section":"semicircle"}', Math.PI / 24],
      ['{"kind":"sections","f":"2","a":0,"b":3,"section":"triangle"}', Math.sqrt(3) * 3],
      ['{"kind":"bounded","top":"4-x^2-y^2","x":[-1,1],"y":[-1,1]}', 16 - 8 / 3],
      ['{"kind":"bounded","top":"x+y","x":[0,1],"ylow":"0","yhigh":"x"}', 0.5],
    ];
    for (const [json, expected] of cases) {
      const measured = volume(json);
      expect(measured, json).not.toBeNull();
      expect(Math.abs(measured! - expected) <= 1e-4 * expected, `${json}: ${measured} vs ${expected}`).toBe(true);
    }
  });
});

describe("3D audit: reading the answer", () => {
  it("reads the answers in the ways solutions write them", () => {
    const eightPi = 8 * Math.PI;
    const answers = [
      "V = 8π",
      "V = 8\\pi",
      "V = 8π ≈ 25,13",
      "V = 8π (unidades de volume)",
      "V = 8π u.v.",
      "V = 8\\pi\\ \\text{u.v.}",
      "V = \\frac{24\\pi}{3}",
      "V = \\dfrac{24\\pi}{3}",
      "V = 8π cm³",
      "$V = 8\\pi$",
      "V=8 \\pi \\approx 25.13",
    ];
    for (const answer of answers) {
      const values = SolidCheck.values(answer);
      expect(
        values.some((value) => Math.abs(value - eightPi) < 1e-3),
        `${answer} → ${values.join(", ")}`,
      ).toBe(true);
    }
  });

  it("reads the axis from the statement", () => {
    expect(SolidCheck.axis("rodando a região em torno do eixo Oy")).toEqual({ kind: "vertical", k: 0 });
    expect(SolidCheck.axis("em torno do eixo dos xx")).toEqual({ kind: "horizontal", k: 0 });
    expect(SolidCheck.axis("em torno da reta y = −1")).toEqual({ kind: "horizontal", k: -1 });
    expect(SolidCheck.axis("about the line x = 2")).toEqual({ kind: "vertical", k: 2 });
    expect(SolidCheck.axis("rotated about the y-axis")).toEqual({ kind: "vertical", k: 0 });
  });
});

describe("3D audit: fixed templates", () => {
  it("never draws another curve than its label with the √x template", () => {
    const premade = sample("solid_of_revolution_sqrt", '{"f":"x^2","a":0,"b":1}');
    const drawn = solidOf({ premade });
    expect(drawn?.kind.kind).toBe("revolution");
    if (drawn?.kind.kind === "revolution") expect(drawn.kind.f.text).toBe("x^2");
    expect(checkableSolid(premade)).not.toBeNull();
    expect(SolidCheck.agreesFigure(premade, "V = π/5")).toBe(true);
  });

  it("checks fixed solids against the answer's volume", () => {
    const cone = sample("solid_cone", '{"r":3,"h":4}');
    expect(SolidCheck.agreesFigure(cone, "V = 12π")).toBe(true);
    expect(SolidCheck.agreesFigure(cone, "V = 36π")).toBe(false);
    // Not a volume (a slant height, an area): nothing to check.
    expect(SolidCheck.agreesFigure(cone, "g = 5")).toBeNull();
    const sphere = sample("solid_sphere", '{"r":3}');
    expect(SolidCheck.agreesFigure(sphere, "V_{esfera} = 36\\pi")).toBe(true);
    const cut = sample("solid_sphere_plane_cut", '{"r":2,"h":1}');
    expect(SolidCheck.agreesFigure(cut, "V = 5π/3")).toBe(true);
    expect(SolidCheck.agreesFigure(cut, "V = 9π")).toBe(true); // the rest of the sphere
    expect(SolidCheck.agreesFigure(cut, "V = 3π")).toBe(false);
    const torus = sample("solid_torus", '{"R":2,"r":1}');
    expect(SolidCheck.agreesFigure(torus, "V = 4\\pi^2")).toBe(true);
  });

  it("holds an exact answer to half a percent", () => {
    expect(SolidCheck.agreesWithVolume(8 * Math.PI, "V = 25.4")).toBe(false);
    expect(SolidCheck.agreesWithVolume(8 * Math.PI, "V ≈ 25.4")).toBe(true);
  });

  it("stands square sections on the base whichever side g lies", () => {
    const sections = solid('{"kind":"sections","f":"0","g":"sqrt(x)","a":0,"b":4,"section":"square"}');
    expect(sections).not.toBeNull();
    const built = GenericSolidBuilder.build(sections!);
    expect(built).not.toBeNull();
    const surface = built!.pieces.find((piece) => piece.name === "surface")?.mesh;
    const region = built!.pieces.find((piece) => piece.name === "region")?.mesh;
    expect(surface && region).toBeTruthy();
    // Scene points (x, up, toward the viewer): the height is the second.
    const finite = (p: readonly number[]) => p.every(Number.isFinite);
    const base = Math.min(...region!.positions.filter(finite).map((p) => p[1]!));
    expect(surface!.positions.filter(finite).every((p) => p[1]! >= base - 1e-4)).toBe(true);
  });
});

describe("3D audit: space", () => {
  const space = (json: string): SpaceFigure => decodeSpaceFigure(JSON.parse(json))!;

  it("keeps a plane through the origin", () => {
    const figure =
      space(`{"points":[{"name":"O","x":0,"y":0,"z":0},{"name":"A","x":2,"y":0,"z":0},{"name":"B","x":0,"y":2,"z":0}],
      "plane":{"name":"α","normal":[0,0,1],"point":[0,0,0],"through":["O","A","B"]}}`);
    expect(SpaceFigures.validated(figure)?.plane, "plane OAB dropped").toBeTruthy();
  });

  it("keeps a line through the origin", () => {
    const figure = space(`{"points":[{"name":"O","x":0,"y":0,"z":0},{"name":"A","x":1,"y":1,"z":1}],
      "line":{"name":"r","point":[0,0,0],"direction":[1,1,1],"through":["O","A"]}}`);
    expect(SpaceFigures.validated(figure)?.line, "line OA dropped").toBeTruthy();
  });

  it("draws edges to the origin", () => {
    const figure =
      space(`{"points":[{"name":"O","x":0,"y":0,"z":0},{"name":"A","x":2,"y":0,"z":0},{"name":"B","x":0,"y":2,"z":0},{"name":"C","x":0,"y":0,"z":2}],
      "edges":["OA","OB","OC","AB","BC","CA"]}`);
    expect(SpaceFigures.validated(figure)?.edges).toHaveLength(6);
  });

  it("gives a pyramid named apex first its edges", () => {
    const figure =
      space(`{"points":[{"name":"V","x":1,"y":1,"z":3},{"name":"A","x":2,"y":0,"z":0},{"name":"B","x":2,"y":2,"z":0},
      {"name":"C","x":0,"y":2,"z":0},{"name":"D","x":0,"y":0,"z":0}]}`);
    const edges = SpaceFigures.inferringEdges(figure, "Considere a pirâmide [VABCD].").edges ?? [];
    const sorted = (names: readonly string[]) => new Set(names.map((edge) => [...edge].sort().join("")));
    expect(sorted(edges)).toEqual(sorted(["AB", "BC", "CD", "DA", "VA", "VB", "VC", "VD"]));
  });

  it("keeps a point O away from the origin", () => {
    const figure = space('{"points":[{"name":"O","x":1,"y":2,"z":3},{"name":"A","x":0,"y":0,"z":0}],"edges":["OA"]}');
    expect(SpaceFigures.validated(figure)?.points.map((point) => point.name)).toEqual(["O", "A"]);
    expect(SpaceFigures.validated(figure)?.edges).toEqual(["OA"]);
  });

  it("draws primed vertex edges", () => {
    const figure = space(
      `{"points":[{"name":"A","x":0,"y":0,"z":0},{"name":"A'","x":0,"y":0,"z":2}], "edges":["AA'"]}`,
    );
    expect(SpaceFigures.validated(figure)?.edges).toEqual(["AA'"]);
  });
});
