// Port of the slider tests of LearnLayerTests/PremadeFigureBatch4PhilosophyTests.swift and
// PremadeFigureBatch4LogicTests.swift (`theFourSlidersChangeTheMoodAndKeepTheTerms`, `theLawSliderReplacesAnExpression`,
// the connective slider's rounding) @ ref 2026-11-04, and of the merge rules in PremadeFigureInteractive.swift.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration } from "../illustration";
import { PremadeFigures } from "../premadeFigure";
import { sample } from "./animated";

const merge = (type: string, json: string, values: Record<string, number>) =>
  new PremadeFigures(sample(type, json)).mergingParameters(values);
function finalLabels(figure: Illustration): string[] {
  const compiled = new CompiledIllustration(figure);
  const at = { t: 0.95 * (figure.duration ?? 0), revealed: 1, step: 1000 };
  return figure.elements
    .filter((e) => e.kind === "label" && (!e.visible || (compiled.value(e.visible, at) ?? 0) > 0))
    .map((e) => e.text ?? "");
}

describe("sliders of the animated figures", () => {
  it("the four syllogism sliders change the mood and keep the terms", () => {
    const figure = sample("syllogismVenn", '{"mood": "AAA-1", "S": "gato", "M": "mamífero", "P": "animal"}');
    const scene = new PremadeFigures(figure).compile("t", "Portuguese (Portugal)")!;
    expect(scene.parameters?.map((p) => p.name)).toEqual(["major", "minor", "conclusion", "figure"]);
    expect(new PremadeFigures(figure).needsParameterRecompile).toBe(true);
    const moved = new PremadeFigures(figure).mergingParameters({ major: 1.2 });
    expect(moved.params["mood"]).toBeUndefined();
    expect([moved.params["major"], moved.params["minor"], moved.params["figure"]]).toEqual([1, 0, 1]);
    const built = new PremadeFigures(moved).compile("t", "Portuguese (Portugal)")!;
    // EAA-1 is not a valid mood; the terms are kept.
    expect(finalLabels(built)).toContain("S = gato  ·  M = mamífero");
    expect(finalLabels(built)).toContain("Silogismo EAA-1");
  });

  it("the law slider replaces an expression, and the connective slider is rounded", () => {
    const moved = merge("truthTable", '{"expression": "p & q"}', { law: 4 });
    expect(moved.params["expression"]).toBeUndefined();
    expect(finalLabels(new PremadeFigures(moved).compile("t", "Portuguese (Portugal)")!)).toContain(
      "Terceiro excluído",
    );
    expect(merge("truthTable", '{"connective": "and"}', { connective: 2.2 }).params["connective"]).toBe(2);
  });

  it("another flowchart program starts from its own defaults", () => {
    const moved = merge("flowchart", '{"program": "sum", "n": 6}', { program: 2.4 });
    expect(moved.params["program"]).toBe(2);
    expect(moved.params["n"]).toBeUndefined();
    expect(new PremadeFigures(moved).compile("t", "English")).not.toBeNull();
    // The same program keeps its inputs.
    expect(merge("flowchart", '{"program": "sum", "n": 6}', { program: 0.2, n: 3.6 }).params["n"]).toBe(4);
  });

  it("counts are rounded and kept in range, and the tangent's window stays put", () => {
    expect(merge("riemannSums", '{"f": "x^2", "a": 0, "b": 2, "n": 6}', { n: 30.4 }).params["n"]).toBe(24);
    expect(merge("seriesPartialSums", '{"kind": "harmonic", "count": 12}', { count: 1.2 }).params["count"]).toBe(3);
    expect(merge("refraction", '{"n1": 1, "n2": 1.5, "angle": 40}', { angle: 95 }).params["angle"]).toBe(89);
    const tangent = merge("tangentLine", '{"f": "x^2/2", "a": 1}', { a: 2.5 });
    expect([tangent.params["xMin"], tangent.params["xMax"], tangent.params["a"]]).toEqual([-1, 3, 2.5]);
  });
});
