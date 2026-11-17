// Port of the probability tree and Venn diagram suites of LearnLayerTests/PremadeFigureBatch3MathTests.swift @ ref
// 2026-11-04. Every gallery sample is also checked for bounds, overlaps and movement in animated.test.ts.

import { describe, expect, it } from "vitest";
import { CompiledIllustration } from "../illustration";
import { PremadeFigures, type PremadeFigure } from "../premadeFigure";
import { sample } from "./animated";
import { treeLeaves, vennCircles, vennLabelSpots, vennMask, vennRegions } from "./probability";
import { finalLabels, values } from "./sceneCheck";

const language = "Portuguese (Portugal)";
const figure = (type: string, json: string) => sample(type, json);
const compile = (premade: PremadeFigure, lang = language) => new PremadeFigures(premade).compile("t", lang);
const scene = (type: string, json: string) => {
  const built = compile(figure(type, json));
  if (!built) throw new Error(`${type} did not compile: ${json}`);
  return built;
};
const merged = (premade: PremadeFigure, sliders: Record<string, number>) =>
  compile(new PremadeFigures(premade).mergingParameters(sliders));
const refused = (type: string, json: string) => compile(figure(type, json), "English") === null;
const asObject = (regions: Map<number, number> | null) => (regions ? Object.fromEntries(regions) : null);

describe("probability tree", () => {
  const treeJSON =
    '{"events1": ["A", "B"], "p1": [0.3, 0.7], "events2": ["R", "V"], "p2": [[0.5, 0.5], [0.2, 0.8]], "highlight": ["A,R", "B,R"]}';

  it("the ends multiply along the branch and add up to one", () => {
    const leaves = treeLeaves(
      [0.3, 0.7],
      [
        [0.5, 0.5],
        [0.2, 0.8],
      ],
    );
    expect(leaves).toHaveLength(4);
    leaves.forEach((value, index) => expect(Math.abs(value - [0.15, 0.15, 0.14, 0.56][index]!)).toBeLessThan(1e-12));
    expect(Math.abs(leaves.reduce((s, v) => s + v, 0) - 1)).toBeLessThan(1e-12);
    // Total probability of R: P(A)P(R|A) + P(B)P(R|B).
    expect(Math.abs(leaves[0]! + leaves[2]! - 0.29)).toBeLessThan(1e-12);
    const three = treeLeaves(
      [0.2, 0.5, 0.3],
      [
        [0.6, 0.4],
        [0.6, 0.4],
        [0.6, 0.4],
      ],
    );
    expect(three.length === 6 && Math.abs(three.reduce((s, v) => s + v, 0) - 1) < 1e-12).toBe(true);
  });

  it("writes the product on every end", () => {
    const built = scene("probabilityTree", treeJSON);
    const shown = finalLabels(built);
    for (const text of ["A∩R: 0,3·0,5 = 0,15", "A∩V: 0,3·0,5 = 0,15", "B∩R: 0,7·0,2 = 0,14", "B∩V: 0,7·0,8 = 0,56"])
      expect(shown, text).toContain(text);
    expect(shown).toContain("P(A∩R) + P(B∩R) = 0,15 + 0,14 = 0,29");
    for (const branch of ["0,3", "0,7", "0,5", "0,2", "0,8"]) expect(shown, branch).toContain(branch);
    // Structure: 2 first-stage branches and 4 second-stage branches; each first node sits midway between its ends.
    const compiled = new CompiledIllustration(built);
    const time = 0.95 * (built.duration ?? 0);
    expect(built.elements.filter((e) => e.kind === "line")).toHaveLength(6);
    const rings = built.elements.filter((e) => e.kind === "circle");
    expect(rings).toHaveLength(6);
    const y = (text: string) =>
      rings.filter((e) => e.text === text).map((e) => compiled.value(e.y ?? "", values(time))!);
    const a = y("A")[0]!;
    const b = y("B")[0]!;
    const ends = rings
      .filter((e) => e.text === "R" || e.text === "V")
      .map((e) => compiled.value(e.y ?? "", values(time))!);
    expect(ends).toHaveLength(4);
    expect(Math.abs(a - (ends[0]! + ends[1]!) / 2) < 1e-3 && Math.abs(b - (ends[2]! + ends[3]!) / 2) < 1e-3).toBe(true);
    expect(Math.abs(ends[0]! - ends[1]! - (ends[1]! - ends[2]!)), "the ends are evenly spaced").toBeLessThan(1e-3);
    // The ends that are added are drawn in the accent colour.
    const accented = built.elements.filter(
      (e) => e.kind === "circle" && e.color === "accent" && (e.text === "R" || e.text === "V"),
    );
    expect(accented.length === 2 && accented.every((e) => e.text === "R")).toBe(true);
  });

  it("the slider sets the first probability and the complement", () => {
    const tree = figure("probabilityTree", treeJSON);
    const moved = merged(tree, { p: 0.4 })!;
    const shown = finalLabels(moved);
    expect(shown.includes("A∩R: 0,4·0,5 = 0,2") && shown.includes("B∩V: 0,6·0,8 = 0,48")).toBe(true);
    expect(shown).toContain("P(A∩R) + P(B∩R) = 0,2 + 0,12 = 0,32");
    expect(moved.parameters?.find((p) => p.name === "p")?.value).toBe(0.4);
    // Three branches at the first stage: no single slider, the figure still draws.
    const three = scene(
      "probabilityTree",
      '{"events1": ["X", "Y", "Z"], "p1": [0.2, 0.5, 0.3], "events2": ["S", "N"], "p2": [0.6, 0.4]}',
    );
    expect(three.parameters ?? []).toHaveLength(0);
    expect(finalLabels(three)).toContain("Y∩N: 0,5·0,4 = 0,2");
    expect(finalLabels(three)).toContain("A soma dos ramos finais é 1");
  });

  it("refuses probabilities that are not ones", () => {
    const base = '"events1": ["A", "B"], "events2": ["R", "V"]';
    for (const json of [
      `{${base}, "p1": [0.3, 0.6], "p2": [0.5, 0.5]}`, // first stage adds to 0.9
      `{${base}, "p1": [0.3, 0.7], "p2": [[0.5, 0.5], [0.2, 0.7]]}`, // second row adds to 0.9
      `{${base}, "p1": [1.3, -0.3], "p2": [0.5, 0.5]}`, // not probabilities
      `{${base}, "p1": [0.3, 0.7], "p2": [[0.5, 0.5]]}`, // a row missing
      '{"events1": ["A", "A"], "p1": [0.5, 0.5], "events2": ["R", "V"], "p2": [0.5, 0.5]}',
      '{"events1": ["Alpha", "B"], "p1": [0.5, 0.5], "events2": ["R", "V"], "p2": [0.5, 0.5]}',
      '{"events1": ["A"], "p1": [1], "events2": ["R", "V"], "p2": [0.5, 0.5]}',
      `{${base}, "p1": [0.3, 0.7], "p2": [0.5, 0.5], "highlight": ["A,Q"]}`,
      `{${base}, "p1": [0.3, 0.7], "p2": [0.5, 0.5], "highlight": "A,R"}`,
    ])
      expect(refused("probabilityTree", json), json).toBe(true);
  });
});

describe("Venn diagram", () => {
  it("the regions follow inclusion–exclusion", () => {
    const two = asObject(vennRegions(2, 12, 8, 0, 3, 0, 0, 0, 20))!;
    expect(two).toEqual({ 1: 9, 2: 5, 3: 3, 0: 3 });
    expect(two[1]! + two[2]! + two[3]!, "|A ∪ B| = |A| + |B| − |A ∩ B|").toBe(12 + 8 - 3);
    expect(
      Object.values(two).reduce((s, v) => s + v, 0),
      "the regions add up to the universe",
    ).toBe(20);
    const three = asObject(vennRegions(3, 10, 8, 6, 4, 3, 2, 1, 20))!;
    expect(three).toEqual({ 1: 4, 2: 3, 4: 2, 3: 3, 5: 2, 6: 1, 7: 1, 0: 4 });
    const union = Object.entries(three)
      .filter(([mask]) => mask !== "0")
      .reduce((s, [, v]) => s + v, 0);
    expect(union, "three-set inclusion–exclusion").toBe(10 + 8 + 6 - 4 - 3 - 2 + 1);
    // Each set is the sum of the regions inside it.
    expect(three[1]! + three[3]! + three[5]! + three[7]!).toBe(10);
    expect(three[2]! + three[3]! + three[6]! + three[7]!).toBe(8);
    expect(three[4]! + three[5]! + three[6]! + three[7]!).toBe(6);
    // Impossible numbers: an intersection bigger than a set, or a union bigger than the universe.
    expect(vennRegions(2, 5, 8, 0, 6, 0, 0, 0, null)).toBeNull();
    expect(vennRegions(2, 12, 8, 0, 3, 0, 0, 0, 15)).toBeNull();
    expect(vennRegions(3, 10, 8, 6, 1, 3, 2, 2, null)).toBeNull();
    const probabilities = vennRegions(2, 0.5, 0.4, 0, 0.2, 0, 0, 0, 1)!;
    expect(Math.abs(probabilities.get(0)! - 0.3)).toBeLessThan(1e-12);
  });

  it("the labels sit inside their own regions", () => {
    for (const sets of [2, 3]) {
      const circles = vennCircles(sets);
      const spots = vennLabelSpots(circles, { minX: 0.6, maxX: 9.4, minY: 0.95, maxY: 5.05 });
      expect(spots.size, `every region of ${sets} sets has a spot`).toBe(1 << sets);
      for (const [mask, spot] of spots) expect(vennMask(circles, spot.x, spot.y), `mask ${mask}`).toBe(mask);
    }
  });

  it("writes every region and the count", () => {
    const two = scene("vennDiagram", '{"sets": 2, "A": 12, "B": 8, "AB": 3, "U": 20}');
    const shown = finalLabels(two);
    expect(shown).toContain("|A∪B| = |A| + |B| − |A∩B|");
    expect(shown).toContain("= 12 + 8 − 3 = 17  ·  fora: 20 − 17 = 3");
    for (const text of ["9", "5", "3", "fora: 3"]) expect(shown, text).toContain(text);
    // The numbers stand where they belong: 9 in A only, 5 in B only, 3 in the lens.
    const compiled = new CompiledIllustration(two);
    const time = 0.95 * (two.duration ?? 0);
    const circles = vennCircles(2);
    for (const e of two.elements) {
      if (e.kind !== "label" || !["9", "5", "3"].includes(e.text ?? "")) continue;
      const x = compiled.value(e.x ?? "", values(time))!;
      const y = compiled.value(e.y ?? "", values(time))!;
      expect(vennMask(circles, x, y), `${e.text} is in its region`).toBe(e.text === "9" ? 1 : e.text === "5" ? 2 : 3);
    }
    const three = scene(
      "vennDiagram",
      '{"sets": 3, "A": 10, "B": 8, "C": 6, "AB": 4, "AC": 3, "BC": 2, "ABC": 1, "U": 20}',
    );
    expect(finalLabels(three)).toContain("= 10 + 8 + 6 − 4 − 3 − 2 + 1 = 16  ·  fora: 20 − 16 = 4");
    expect(three.elements.filter((e) => e.kind === "curve")).toHaveLength(3);
    // Probabilities: P(A∪B) and the rest of the sample space.
    const chances = finalLabels(
      scene("vennDiagram", '{"sets": 2, "A": 0.5, "B": 0.4, "AB": 0.2, "measure": "probability"}'),
    );
    expect(chances).toContain("P(A∪B) = P(A) + P(B) − P(A∩B)");
    expect(chances).toContain("= 0,5 + 0,4 − 0,2 = 0,7  ·  fora: 1 − 0,7 = 0,3");
    expect(chances.includes("0,3") && chances.includes("0,2") && chances.includes("fora: 0,3")).toBe(true);
  });

  it("the slider moves the overlap and keeps counts whole", () => {
    const base = figure("vennDiagram", '{"sets": 2, "A": 12, "B": 8, "AB": 3, "U": 20}');
    const moved = merged(base, { AB: 5.4 })!;
    expect(finalLabels(moved)).toContain("= 12 + 8 − 5 = 15  ·  fora: 20 − 15 = 5");
    expect(moved.parameters?.find((p) => p.name === "AB")?.value).toBe(5);
    // Every setting of the slider is a possible diagram.
    const slider = moved.parameters![0]!;
    expect(slider.min === 0 && slider.max === 8).toBe(true);
    for (const json of [
      '{"sets": 2, "A": 5, "B": 8, "AB": 6}',
      '{"sets": 3, "A": 5, "B": 8, "AB": 2}',
      '{"sets": 4, "A": 5, "B": 8, "AB": 2}',
      '{"sets": 2, "A": 5, "B": 8, "AB": 2, "U": 9}',
      '{"sets": 2, "A": 0.5, "B": 0.4, "AB": 0.2, "U": 2, "measure": "probability"}',
      '{"sets": 2, "A": 5, "B": 8, "AB": 2, "measure": "odds"}',
    ])
      expect(refused("vennDiagram", json), json).toBe(true);
  });
});
