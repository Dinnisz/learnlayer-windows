// Port of the syllogism suite of LearnLayerTests/PremadeFigureBatch4PhilosophyTests.swift @ ref 2026-11-04. The
// figure's bounds and overlaps are checked with the gallery in animated.test.ts.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration } from "../illustration";
import { PremadeFigures } from "../premadeFigure";
import { sample } from "./animated";
import { M, P, S, Syllogism, syllogismNames, Venn, type Kind } from "./syllogism";

const unconditional = new Set([
  "AAA-1",
  "EAE-1",
  "AII-1",
  "EIO-1",
  "EAE-2",
  "AEE-2",
  "EIO-2",
  "AOO-2",
  "IAI-3",
  "AII-3",
  "OAO-3",
  "EIO-3",
  "AEE-4",
  "IAI-4",
  "EIO-4",
]);
const withImport = new Set(["AAI-1", "EAO-1", "EAO-2", "AEO-2", "AAI-3", "EAO-3", "AAI-4", "AEO-4", "EAO-4"]);
const everyMood: Syllogism[] = [];
for (let major = 0; major < 4; major++)
  for (let minor = 0; minor < 4; minor++)
    for (let conclusion = 0; conclusion < 4; conclusion++)
      for (let figure = 1; figure <= 4; figure++)
        everyMood.push(new Syllogism(major as Kind, minor as Kind, conclusion as Kind, figure));

const visibleAtEnd = (figure: Illustration) => {
  const compiled = new CompiledIllustration(figure);
  const at = { t: 0.95 * (figure.duration ?? 0), revealed: 1, step: 1000 };
  return figure.elements.filter((e) => !e.visible || (compiled.value(e.visible, at) ?? 0) > 0);
};
const scene = (json: string) => {
  const figure = new PremadeFigures(sample("syllogismVenn", json)).compile("t", "Portuguese (Portugal)");
  if (!figure) throw new Error(`no syllogism for ${json}`);
  return figure;
};

describe("syllogisms", () => {
  it("the traditional fifteen and nine valid moods are exactly the valid ones", () => {
    expect(everyMood).toHaveLength(256);
    expect(new Set(everyMood.filter((s) => s.verdict === "valid").map((s) => s.mood))).toEqual(unconditional);
    expect(new Set(everyMood.filter((s) => s.verdict === "validWithImport").map((s) => s.mood))).toEqual(withImport);
    expect(everyMood.filter((s) => s.verdict === "invalid")).toHaveLength(256 - 15 - 9);
    expect(everyMood.some((s) => s.verdict === "incompatiblePremises")).toBe(false);
    expect(new Set(Object.keys(syllogismNames))).toEqual(new Set([...unconditional, ...withImport]));
    expect(new Set(Object.values(syllogismNames)).size).toBe(24);
  });

  it("figures place the middle term as in the textbooks", () => {
    const barbara = Syllogism.fromMood("AAA-1")!;
    expect(barbara.majorStatement).toEqual({ kind: 0, subject: M, predicate: P });
    expect(barbara.minorStatement).toEqual({ kind: 0, subject: S, predicate: M });
    expect(barbara.conclusionStatement).toEqual({ kind: 0, subject: S, predicate: P });
    const cesare = Syllogism.fromMood("EAE-2")!;
    expect(cesare.majorStatement).toEqual({ kind: 1, subject: P, predicate: M });
    expect(cesare.minorStatement).toEqual({ kind: 0, subject: S, predicate: M });
    const disamis = Syllogism.fromMood("IAI-3")!;
    expect(disamis.majorStatement).toEqual({ kind: 2, subject: M, predicate: P });
    expect(disamis.minorStatement).toEqual({ kind: 0, subject: M, predicate: S });
    const camenes = Syllogism.fromMood("AEE-4")!;
    expect(camenes.majorStatement).toEqual({ kind: 0, subject: P, predicate: M });
    expect(camenes.minorStatement).toEqual({ kind: 1, subject: M, predicate: S });
    expect(Syllogism.fromMood("aaa 1")?.mood).toBe("AAA-1");
    for (const bad of ["AAA", "AAA-5", "AAA-0", "XAA-1", "AAAA-1", "AA-1", ""])
      expect(Syllogism.fromMood(bad), bad).toBeNull();
  });

  it("the diagram method agrees with the proof for every mood", () => {
    for (const mood of everyMood) expect(mood.diagramShowsConclusion, mood.mood).toBe(mood.verdict === "valid");
  });

  it("the pole of every region lies in it and away from the edges", () => {
    const poles = Venn.poles();
    for (let region = 1; region <= 7; region++) {
      const pole = poles.get(region)!;
      expect(Venn.region(pole.point), `region ${region}`).toBe(region);
      expect(pole.clearance, `region ${region} is too thin to mark`).toBeGreaterThan(0.1);
    }
    expect(poles.get(0)).toBeUndefined();
    const points = [1, 2, 3, 4, 5, 6, 7].map((r) => poles.get(r)!.point);
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++)
        expect(Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y)).toBeGreaterThan(0.4);
  });

  it("the scene shows the named form, its marks and its verdict", () => {
    const barbara = scene('{"mood": "AAA-1", "S": "gato", "M": "mamífero", "P": "animal"}');
    const shown = visibleAtEnd(barbara);
    const labels = shown.filter((e) => e.kind === "label").map((e) => e.text ?? "");
    for (const text of [
      "Silogismo AAA-1: Barbara",
      "S = gato  ·  M = mamífero",
      "P = animal",
      "Válido: o diagrama das premissas contém a conclusão",
      "S",
      "P",
      "M",
    ])
      expect(labels, text).toContain(text);
    // Each proposition is wrapped to stay inside its box, so it is read across its lines.
    const written = labels.join(" ");
    for (const text of [
      "P1: Tudo o que é mamífero é animal",
      "P2: Tudo o que é gato é mamífero",
      "C: Tudo o que é gato é animal",
    ])
      expect(written, text).toContain(text);
    // Four shaded regions, three strokes each.
    expect(shown.filter((e) => e.kind === "line" && e.color === "second")).toHaveLength(12);
    expect(shown.filter((e) => e.kind === "circle")).toHaveLength(3);
    const ferio = visibleAtEnd(scene('{"mood": "EIO-1", "S": "atleta", "M": "sedentário", "P": "campeão"}'));
    // Two shaded regions (six strokes) and one cross (two strokes).
    expect(ferio.filter((e) => e.kind === "line" && e.color === "second")).toHaveLength(8);
    const conditional = visibleAtEnd(scene('{"mood": "AAI-3", "S": "gato", "M": "mamífero", "P": "animal"}')).map(
      (e) => e.text,
    );
    expect(conditional).toContain("Válido só se nenhum termo for vazio (pressuposto existencial)");
    expect(conditional).toContain("Silogismo AAI-3: Darapti");
    const invalid = visibleAtEnd(scene('{"mood": "AAA-2", "S": "gato", "M": "mamífero", "P": "animal"}')).map(
      (e) => e.text,
    );
    expect(invalid).toContain("Inválido: o diagrama das premissas não garante a conclusão");
    expect(invalid).toContain("Silogismo AAA-2");
  });
});
