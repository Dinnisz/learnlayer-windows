// Port of the orbital diagram, Ruffini and equation build-up tests of LearnLayerTests/PremadeFigureReviewTests.swift,
// PremadeFigureSemanticsTests.swift, PremadeFigureInteractiveTests.swift and PremadeFigureTests.swift @ ref 2026-11-04.

import { describe, expect, it } from "vitest";
import type { Illustration } from "../illustration";
import { TemplateWords } from "../illustrationTemplate";
import { PremadeFigures } from "../premadeFigure";
import { sample } from "./animated";
import { LabelBoard, withinBounds } from "./figureCanvas";
import { formatCoeff, orbitalArrows, orbitalLayout, parseElectronConfig, ruffiniDivide } from "./kinds";
import { boundsProblems, times } from "./sceneCheck";

const portuguese = "Portuguese (Portugal)";
const compile = (type: string, json: string, language = portuguese) =>
  new PremadeFigures(sample(type, json)).compile("t", language);
const labels = (scene: Illustration) => scene.elements.filter((e) => e.kind === "label");
const steps = (scene: Illustration) =>
  (scene as { stepPlayback?: { boundaries: number[] } | null }).stepPlayback?.boundaries ?? [];

describe("orbital diagram", () => {
  it("2p4 uses Hund's arrows, and the configuration is read with spaces or superscripts", () => {
    const shells = parseElectronConfig("1s2 2s2 2p4");
    expect(shells.map((s) => `${s.n}${s.kind}${s.electrons}`)).toEqual(["1s2", "2s2", "2p4"]);
    const p = shells[2]!;
    expect(orbitalArrows(p, 0)).toBe("↑↓");
    expect(orbitalArrows(p, 1)).toBe("↑");
    expect(orbitalArrows(p, 2)).toBe("↑");
    expect(parseElectronConfig("1s² 2s² 2p⁴").map((s) => s.electrons)).toEqual([2, 2, 4]);
    const eight = { n: 3, kind: "d", electrons: 8 };
    expect(orbitalArrows(eight, 0)).toBe("↑↓");
    expect(orbitalArrows(eight, 4)).toBe("↑");
  });

  it("a long configuration wraps inside the scene", () => {
    const scene = compile("orbitalDiagram", '{"config": "1s2 2s2 2p6 3s2 3p6 4s2 3d6"}')!;
    const boxes = scene.elements.filter((e) => e.kind === "rect");
    for (const box of boxes) {
      const x = Number(box.x);
      const width = Number(box.w);
      expect(x >= 0.1 && x + width <= 9.9).toBe(true);
    }
    expect(new Set(boxes.map((b) => b.y)).size).toBeGreaterThanOrEqual(2);
    // 15 orbital boxes, all drawn.
    expect(boxes).toHaveLength(15);
    expect(withinBounds(scene)).toBe(true);
    for (const time of times(scene)) expect(boundsProblems(scene, time)).toEqual([]);
  });

  it("the subshell name sits under the middle of its boxes", () => {
    const layout = orbitalLayout([1, 3]);
    expect(Math.abs(layout.center(0, 1) - (layout.boxLeft(0, 0) + layout.boxWidth / 2))).toBeLessThan(1e-9);
    expect(Math.abs(layout.center(1, 3) - (layout.boxLeft(1, 1) + layout.boxWidth / 2))).toBeLessThan(1e-9);
    const scene = compile("orbitalDiagram", '{"config": "1s2 2p3"}', "English")!;
    const name = Number(scene.elements.find((e) => e.text === "1s")!.x);
    const box = Number(scene.elements.find((e) => e.kind === "rect")!.x);
    expect(Math.abs(name - (box + layout.boxWidth / 2))).toBeLessThan(1e-9);
    expect(scene.duration ?? 0).toBeGreaterThan(0);
    expect(steps(scene).length).toBeGreaterThanOrEqual(2);
  });
});

describe("Ruffini's rule", () => {
  it("divides a cubic by a linear factor", () => {
    const result = ruffiniDivide([1, -6, 11, -6], 1);
    expect(result.bottom).toEqual([1, -5, 6]);
    expect(Math.abs(result.remainder)).toBeLessThan(1e-9);
  });

  it("the products align under the trailing coefficients", () => {
    const scene = new PremadeFigures({ type: "ruffini", params: { coefficients: [1, -6, 11, -6], root: 1 } }).compile(
      "t",
      portuguese,
    )!;
    const minusSix = Number(scene.elements.find((e) => e.text === "−6")!.x);
    const productOne = Number(scene.elements.find((e) => e.text === "1" && e.color === "muted")!.x);
    expect(Math.abs(productOne - minusSix)).toBeLessThan(1e-9);
  });

  it("a long division keeps every number inside the scene", () => {
    const coefficients = Array.from({ length: 12 }, (_, i) => (i + 1) * 7 - 40).join(", ");
    const scene = compile("ruffini", `{"coefficients": [${coefficients}], "root": 1}`)!;
    expect(labels(scene).some((l) => l.text === "−33")).toBe(true);
    for (const label of labels(scene)) expect(Number(label.x), label.text ?? "").toBeLessThanOrEqual(9.5);
    // The last coefficient is on the page, not silently dropped.
    expect(labels(scene).some((l) => l.text === "44")).toBe(true);
  });

  it("states the remainder", () => {
    const scene = compile("ruffini", '{"coefficients": [1, -6, 11, -6], "root": 2}')!;
    const caption = labels(scene).find((l) => (l.text ?? "").startsWith("Resto"))!;
    expect(caption.text).toBe("Resto = 0: P(2) = 0");
    expect(caption.visible).not.toBeNull();
  });

  it("writes a negative decimal with one minus sign", () => {
    const words = new TemplateWords(portuguese);
    expect(formatCoeff(-0.5, words)).toBe("−0,5");
    expect(formatCoeff(-6, words)).toBe("−6");
    expect(formatCoeff(2.5, words)).toBe("2,5");
  });
});

describe("equation build-up", () => {
  const equationSteps = (count: number) =>
    compile(
      "equationSteps",
      `{"steps": [${Array.from({ length: count }, (_, i) => `{"line": "linha ${i}"}`).join(",")}]}`,
    );

  it("ten steps all appear and never overlap", () => {
    const scene = equationSteps(10)!;
    const lines = labels(scene).filter((l) => (l.text ?? "").startsWith("linha"));
    expect(lines).toHaveLength(10);
    const ys = lines.map((l) => Number(l.y));
    for (let i = 1; i < ys.length; i++) expect(ys[i - 1]! - ys[i]!).toBeGreaterThanOrEqual(LabelBoard.labelHeight);
    expect(Math.min(...ys) - LabelBoard.labelHeight / 2).toBeGreaterThanOrEqual(LabelBoard.room.minY);
    expect(steps(scene).length).toBeGreaterThan(5);
  });

  it("too many steps fall back instead of losing the end", () => {
    expect(equationSteps(14)).toBeNull();
  });

  it("a long line keeps its note instead of dropping it", () => {
    const line = "x+".repeat(20);
    const scene = compile("equationSteps", `{"steps": [{"line": "${line}", "highlight": "passo importante"}]}`)!;
    expect(
      labels(scene)
        .map((l) => l.text)
        .join("|"),
    ).toContain("passo importante");
  });
});
