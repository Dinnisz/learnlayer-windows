// Port of LearnLayerTests/PremadeFigureAnimatedTests.swift @ ref 2026-11-04: what every animated premade figure must
// satisfy (measured the way the renderer reads a scene: expressions evaluated at a moment in time), and the Calculus 1
// suite. The other suites come with their figures.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration } from "../illustration";
import { TemplateWords } from "../illustrationTemplate";
import { applyingPremadeFigure, PremadeFigures, type PremadeFigure } from "../premadeFigure";
import { animatedGallery, animatedTypes, sample } from "./animated";
import {
  derivative,
  integral,
  lateralLimit,
  lineText,
  logBase,
  piecewisePieces,
  piecewiseValue,
  rationalAsymptotes,
  revolutionVolume,
  riemannSum,
  signTable,
  taylorCoefficients,
  variationSigns,
  type SignFactor,
} from "./calculus";
import { Params, PlottedFunction, withinBounds } from "./figureCanvas";
import {
  animates,
  boundsProblems,
  curvePoints,
  finalLabels,
  labels,
  overlapProblems,
  times,
  values,
} from "./sceneCheck";

const language = "Portuguese (Portugal)";
/** `PremadeFigure.AnimatedKind.allCases` on the Mac. */
const macAnimatedKinds = [
  "limitApproach",
  "tangentLine",
  "taylorPolynomials",
  "riemannSums",
  "revolutionVolume",
  "signTable",
  "variationTable",
  "piecewiseFunction",
  "rationalAsymptotes",
  "expLog",
  "seriesPartialSums",
  "slopeField",
  "polarCurve",
  "parametricCurve",
  "levelCurves",
  "surface3D",
  "gradientField",
  "doubleIntegralRegion",
  "cylindricalSpherical",
  "vectorField2D",
  "characteristicsPDE",
  "arrayBars",
  "binarySearch",
  "linkedList",
  "stackQueue",
  "binaryTree",
  "heap",
  "hashTable",
  "graph",
  "complexityChart",
  "motionScene",
  "verticalThrow",
  "inclinedBlock",
];
const compile = (figure: PremadeFigure, lang = language) => new PremadeFigures(figure).compile("t", lang);

/** A number as the figures print it in Portuguese. */
const pt = (value: number) => new TemplateWords(language).number(value);
const fn = (text: string) => {
  const f = PlottedFunction.make(text);
  if (!f) throw new Error(`not a function: ${text}`);
  return f;
};
const scene = (type: string, json: string, lang = language) => {
  const compiled = compile(sample(type, json), lang);
  if (!compiled) throw new Error(`${type} did not compile`);
  return compiled;
};

describe("animated premade figures", () => {
  it("the gallery has every animated type drawn here", () => {
    expect(new Set(animatedGallery.map((figure) => figure.type))).toEqual(new Set(animatedTypes));
  });

  // One test per sample of the gallery (the Mac runs them in one loop): the same checks, each with its own time budget.
  it.each(animatedGallery.map((figure, index) => [`${index} ${figure.type}`, figure] as const))(
    "every animated figure fits, draws and moves: %s",
    (_, figure) => {
      const compiled = compile(figure);
      expect(compiled, `${figure.type} did not compile`).not.toBeNull();
      if (!compiled) return;
      expect(compiled.duration ?? 0, `${figure.type} has no duration`).toBeGreaterThan(0);
      expect(new CompiledIllustration(compiled).isDrawable, `${figure.type} is not drawable`).toBe(true);
      expect(animates(compiled), `${figure.type} does not change over its duration`).toBe(true);
      expect(withinBounds(compiled), `${figure.type} leaves the picture`).toBe(true);
      for (const time of times(compiled)) {
        expect(boundsProblems(compiled, time).slice(0, 3), figure.type).toEqual([]);
        expect(overlapProblems(compiled, time).slice(0, 3), figure.type).toEqual([]);
      }
    },
  );

  // LogicGatesLayoutTests and aWideCircuitFitsItsPicture (PremadeFigureBatch4LogicTests.swift): a small circuit and a
  // wide one fit, and the wide one at every stop of its slider (Batch4Check.everyStop).
  it("small and wide gate circuits fit their picture at every stop", () => {
    const fits = (built: Illustration | null, name: string) => {
      expect(built, `${name} did not compile`).not.toBeNull();
      if (!built) return;
      for (const time of times(built)) {
        expect(boundsProblems(built, time).slice(0, 3), name).toEqual([]);
        expect(overlapProblems(built, time).slice(0, 3), name).toEqual([]);
      }
    };
    fits(compile(sample("logicGates", '{"expression": "a & b", "inputs": 3}')), "small");
    const wide = sample("logicGates", '{"expression": "((p & q) | r) & !(p ⊕ r)", "inputs": 6}');
    const built = compile(wide);
    fits(built, "wide");
    for (const parameter of built?.parameters ?? []) {
      const span = Math.round(parameter.max - parameter.min);
      const stops =
        span <= 8
          ? Array.from({ length: Math.max(span, 0) + 1 }, (_, i) => parameter.min + i)
          : Array.from({ length: 8 }, (_, i) => Math.round(parameter.min + (span * i) / 7));
      for (const value of stops)
        fits(
          compile(new PremadeFigures(wide).mergingParameters({ [parameter.name]: value })),
          `${parameter.name} = ${value}`,
        );
    }
  });

  // batch2FiguresExposeLocalParameterSliders, batch2SliderValuesRecompileDrawably and
  // batch2InteractiveLabelsAvoidOverlapAtSliderExtremes (PremadeFigureInteractiveTests.swift).
  it("batch 2 figures expose local parameter sliders", () => {
    for (const [type, json, names] of [
      ["lensRays", '{"kind": "converging", "focal": 2, "objectDistance": 5}', ["objectDistance"]],
      ["mirrorRays", '{"kind": "concave", "focal": 2, "objectDistance": 5}', ["objectDistance"]],
      ["refraction", '{"n1": 1, "n2": 1.5, "angle": 40}', ["angle", "n2"]],
      ["prismDispersion", '{"incidence": 60}', ["incidence"]],
      ["doubleSlit", '{"wavelength": 600, "separation": 0.5, "screenDistance": 2}', ["wavelength", "separation"]],
      ["parallelPlates", '{"voltage": 100, "distance": 0.02}', ["voltage", "distance"]],
      ["lorentzForce", '{"charge": "positive", "field": "into"}', ["v", "B"]],
      ["rcCircuitCurve", '{"mode": "both"}', ["R", "C"]],
      ["acSignal", '{"peak": 325, "frequency": 50}', ["peak", "frequency"]],
    ] as const) {
      const built = compile(sample(type, json), "English");
      expect(built, type).not.toBeNull();
      for (const name of names)
        expect(
          built?.parameters?.some((p) => p.name === name),
          `${type} missing ${name}`,
        ).toBe(true);
      expect(built?.premade?.type).toBe(type);
    }
  });

  it("batch 2 slider values recompile drawably", () => {
    const premade = sample("refraction", '{"n1": 1.5, "n2": 1, "angle": 30}');
    const merged = compile(new PremadeFigures(premade).mergingParameters({ angle: 60, n2: 1 }), "English");
    expect(merged).not.toBeNull();
    expect(new CompiledIllustration(merged!).isDrawable).toBe(true);
    expect(merged!.duration ?? 0).toBeGreaterThan(0);
    expect(merged!.parameters?.find((p) => p.name === "angle")?.value).toBe(60);
    expect(
      labels(merged!, 0.95 * (merged!.duration ?? 0)).some(
        (l) => l.includes("reflexão total") || l.toLowerCase().includes("total internal"),
      ),
    ).toBe(true);

    const rc = sample("rcCircuitCurve", '{"mode": "charge", "tau": 2, "V0": 10}');
    const tuned = new PremadeFigures(rc).mergingParameters({ R: 20, C: 100 });
    const rcScene = compile(tuned, "English");
    expect(rcScene).not.toBeNull();
    expect(labels(rcScene!, 0.95 * (rcScene!.duration ?? 0)).some((l) => l.includes("τ = RC"))).toBe(true);
    const tunedParams = new Params(tuned);
    expect(Math.abs((tunedParams.number("R") ?? 0) * (tunedParams.number("C") ?? 0) * 1e-3 - 2)).toBeLessThan(0.01);

    const lorentz = sample("lorentzForce", '{"charge": "positive", "field": "into"}');
    expect(compile(new PremadeFigures(lorentz).mergingParameters({ v: 2.5, B: 0.5 }), "English")).not.toBeNull();
  });

  it("batch 2 interactive labels avoid overlap at the slider extremes", () => {
    for (const figure of [
      sample("lensRays", '{"kind": "converging", "focal": 2, "objectDistance": 2}'),
      sample("mirrorRays", '{"kind": "plane", "objectDistance": 3}'),
      sample("refraction", '{"n1": 1.5, "n2": 1, "angle": 45}'),
      sample("parallelPlates", '{"voltage": 100, "distance": 0.02}'),
      sample("lorentzForce", '{"charge": "positive", "field": "into"}'),
      sample("rcCircuitCurve", '{"mode": "both"}'),
      sample("acSignal", '{"peak": 230, "frequency": 50}'),
      sample("doubleSlit", '{"wavelength": 550, "separation": 0.8, "screenDistance": 2}'),
      sample("prismDispersion", '{"incidence": 62}'),
    ]) {
      const sliders = compile(figure)?.parameters ?? [];
      expect(sliders.length, `${figure.type} did not expose sliders`).toBeGreaterThan(0);
      const settings = [
        Object.fromEntries(sliders.map((s) => [s.name, s.min])),
        Object.fromEntries(sliders.map((s) => [s.name, s.max])),
        Object.fromEntries(sliders.map((s) => [s.name, s.value])),
      ];
      for (const values of settings) {
        const built = compile(new PremadeFigures(figure).mergingParameters(values));
        const name = `${figure.type} ${JSON.stringify(values)}`;
        expect(built, name).not.toBeNull();
        if (!built) continue;
        expect(new CompiledIllustration(built).isDrawable, name).toBe(true);
        for (const time of times(built))
          expect(overlapProblems(built, time).slice(0, 2), `${name} t=${time}`).toEqual([]);
      }
    }
  });

  it("English figures keep their decimal point", () => {
    const text = finalLabels(scene("riemannSums", '{"f": "x^2", "a": 0, "b": 2, "n": 6}', "English")).join(" ");
    expect(text).toContain("2.04");
    expect(text).not.toContain("2,04");
  });

  it("unknown or invalid params fall back", () => {
    expect(compile({ type: "hypercube", params: {} }, "English")).toBeNull();
    // As on the Mac, over `AnimatedKind` (the batch figures, such as the optics, have defaults for every param), and
    // these two have defaults too.
    for (const type of macAnimatedKinds) {
      if (type === "expLog" || type === "complexityChart") continue;
      expect(compile({ type, params: { nonsense: "?" } }, "English"), `${type} accepted empty params`).toBeNull();
    }
    expect(compile(sample("riemannSums", '{"f": "x +* 2", "a": 0, "b": 1}'), "English")).toBeNull();
    expect(compile(sample("riemannSums", '{"f": "x", "a": 2, "b": 1}'), "English")).toBeNull();
    expect(compile(sample("expLog", '{"base": 1}'), "English")).toBeNull();
    expect(compile(sample("limitApproach", '{"f": "y", "a": 1}'), "English")).toBeNull();
  });

  it("an invalid animated figure falls back to the model's own drawing", () => {
    const free: Illustration = {
      title: "t",
      width: 10,
      height: 6,
      parameters: [],
      elements: [{ kind: "point", x: "1", y: "1" }],
      premade: sample("signTable", '{"factors": []}'),
    };
    expect(applyingPremadeFigure(free, "English").elements).toHaveLength(1);
  });
});

describe("Calculus 1 figures", () => {
  it("limits from both sides", () => {
    const hole = fn("(x^2-1)/(x-1)");
    expect(lateralLimit(hole, 1, -1)).toBe(2);
    expect(lateralLimit(hole, 1, 1)).toBe(2);
    expect(lateralLimit(fn("1/x^2"), 0, 1)).toBe(Infinity);
    const jump = fn("abs(x)/x");
    expect(lateralLimit(jump, 0, -1)).toBe(-1);
    expect(lateralLimit(jump, 0, 1)).toBe(1);
  });

  it("the limit figure states the limit and approaches it", () => {
    const limit = scene("limitApproach", '{"f": "(x^2-1)/(x-1)", "a": 1}');
    expect(finalLabels(limit)).toContain("lim x→1 f(x) = 2");
    // The moving points are two dots that end close to the point x = 1.
    const compiled = new CompiledIllustration(limit);
    const dots = limit.elements.filter((element) => element.kind === "point" && element.color !== "white");
    const early = dots.map((dot) => compiled.value(dot.x, values(0.1))!);
    const late = dots.map((dot) => compiled.value(dot.x, values(0.95 * (limit.duration ?? 0)))!);
    expect(dots).toHaveLength(2);
    expect(Math.abs(late[0]! - late[1]!)).toBeLessThan(Math.abs(early[0]! - early[1]!) * 0.1);
    const jump = scene("limitApproach", '{"f": "abs(x)/x", "a": 0}');
    expect(finalLabels(jump)).toContain("lim x→0⁻ f(x) = −1");
    expect(finalLabels(jump)).toContain("lim x→0⁺ f(x) = 1");
  });

  it("the derivative of a square", () => {
    const square = fn("x^2");
    expect(derivative(square, 3)).toBe(6);
    expect(derivative(square, -1.5)).toBe(-3);
    // A corner has no tangent: the two one-sided slopes differ.
    const corner = fn("abs(x)");
    expect(derivative(corner, 0)).toBeNull();
    expect(derivative(corner, 2)).toBe(1);
    expect(compile(sample("tangentLine", '{"f": "abs(x)", "a": 0}'), "English")).toBeNull();
  });

  it("the secant turns into the tangent", () => {
    const tangent = scene("tangentLine", '{"f": "x^2/2", "a": 1, "xMin": -1, "xMax": 3}');
    expect(finalLabels(tangent)).toContain("declive da tangente: f′(1) = 1");
    // The secant's second point starts away from P and ends beside it.
    const compiled = new CompiledIllustration(tangent);
    const chord = tangent.elements.find((element) => element.kind === "line" && element.color === "second")!;
    const length = (time: number) => {
      const at = values(time);
      const dx = (compiled.value(chord.x2, at) ?? 0) - (compiled.value(chord.x, at) ?? 0);
      const dy = (compiled.value(chord.y2, at) ?? 0) - (compiled.value(chord.y, at) ?? 0);
      return Math.hypot(dx, dy);
    };
    expect(length(0)).toBeGreaterThan(1);
    expect(length(0.95 * (tangent.duration ?? 0))).toBeLessThan(0.15);
  });

  it("Maclaurin coefficients and approximation", () => {
    const sine = taylorCoefficients("sin", 5)!;
    expect(sine).toEqual([0, 1, 0, -1 / 6, 0, 1 / 120]);
    expect(taylorCoefficients("cos", 4)).toEqual([1, 0, -0.5, 0, 1 / 24]);
    expect(taylorCoefficients("exp", 3)).toEqual([1, 1, 0.5, 1 / 6]);
    expect(taylorCoefficients("ln1p", 3)).toEqual([0, 1, -0.5, 1 / 3]);
    expect(taylorCoefficients("geometric", 2)).toEqual([1, 1, 1]);
    expect(taylorCoefficients("atan", 3)).toEqual([0, 1, 0, -1 / 3]);
    const value = sine.reduce((sum, c, k) => sum + c * Math.pow(0.5, k), 0);
    expect(Math.abs(value - Math.sin(0.5))).toBeLessThan(1e-4);
    expect(taylorCoefficients("sec", 3)).toBeNull();
    const taylor = scene("taylorPolynomials", '{"function": "sin", "degrees": [1, 3, 5]}');
    const shown = finalLabels(taylor);
    expect(shown.includes("P₁") && shown.includes("P₃") && shown.includes("P₅")).toBe(true);
    expect(taylor.elements.filter((element) => element.kind === "curve").length).toBeGreaterThanOrEqual(4);
  });

  it("Riemann sums of a square", () => {
    const square = fn("x^2");
    expect(Math.abs((riemannSum(square, 0, 1, 4, "left") ?? 0) - 0.21875)).toBeLessThan(1e-12);
    expect(Math.abs((riemannSum(square, 0, 1, 4, "right") ?? 0) - 0.46875)).toBeLessThan(1e-12);
    expect(Math.abs((riemannSum(square, 0, 1, 4, "midpoint") ?? 0) - 0.328125)).toBeLessThan(1e-12);
    expect(Math.abs((integral(square, 0, 1) ?? 0) - 1 / 3)).toBeLessThan(1e-9);
    const sums = scene("riemannSums", '{"f": "x^2", "a": 0, "b": 2, "n": 6}');
    expect(finalLabels(sums)).toContain("Soma (n = 6, esquerda): 2,04");
    expect(finalLabels(sums)).toContain("Integral: 2,67");
    // The rectangles appear one after another, each as tall as f at its left edge.
    const boxes = sums.elements.filter((element) => element.kind === "rect");
    expect(boxes).toHaveLength(6);
    const compiled = new CompiledIllustration(sums);
    const shown = [0.2, 0.5, 0.8].map(
      (fraction) =>
        boxes.filter((box) => (compiled.value(box.visible, values(fraction * (sums.duration ?? 0))) ?? 0) > 0).length,
    );
    expect(shown[0]! <= shown[1]! && shown[1]! <= shown[2]! && shown[2] === 6 && shown[0]! < 6).toBe(true);
  });

  it("solids of revolution", () => {
    expect(Math.abs((revolutionVolume(fn("1"), 0, 2) ?? 0) - 2 * Math.PI)).toBeLessThan(1e-9);
    expect(Math.abs((revolutionVolume(fn("x"), 0, 1) ?? 0) - Math.PI / 3)).toBeLessThan(1e-9);
    const solid = scene("revolutionVolume", '{"f": "sqrt(x)", "a": 0, "b": 4}');
    expect(finalLabels(solid)).toContain(`V = π∫ f(x)² dx = ${pt(8 * Math.PI)}`);
    expect(solid.elements.filter((element) => element.kind === "curve" && element.color === "accent")).toHaveLength(8);
    expect(compile(sample("revolutionVolume", '{"f": "x-1", "a": 0, "b": 2}'), "English")).toBeNull();
  });

  it("the sign table multiplies the factors", () => {
    const factors: SignFactor[] = [
      { name: "x − 1", root: 1, rightSign: 1, denominator: false },
      { name: "x + 2", root: -2, rightSign: 1, denominator: false },
      { name: "x", root: 0, rightSign: 1, denominator: true },
    ];
    const table = signTable(factors);
    expect(table.roots).toEqual([-2, 0, 1]);
    expect(table.rows[0]).toEqual(["−", "", "−", "", "−", "0", "+"]);
    expect(table.rows[1]).toEqual(["−", "0", "+", "", "+", "", "+"]);
    expect(table.result).toEqual(["−", "0", "+", "||", "−", "0", "+"]);
    // A factor that decreases, 1 − x, flips the product.
    expect(signTable([{ name: "1 − x", root: 1, rightSign: -1, denominator: false }]).result).toEqual(["+", "0", "−"]);
    const figure = scene(
      "signTable",
      '{"factors": [{"name": "x − 1", "root": 1}, {"name": "x + 2", "root": -2}, {"name": "x", "root": 0, "denominator": true}]}',
    );
    expect(finalLabels(figure).filter((text) => text === "||")).toHaveLength(2);
    expect(compile(sample("signTable", '{"factors": []}'), "English")).toBeNull();
  });

  it("the variation table follows the derivative", () => {
    expect(variationSigns(fn("x^3-3*x"), [-3, -1, 1, 3])).toEqual([1, -1, 1]);
    const text = finalLabels(scene("variationTable", '{"f": "x^3-3*x", "xMin": -3, "xMax": 3, "points": [-1, 1]}'));
    expect(text).toContain("máx. f(−1) = 2 · mín. f(1) = −2");
    expect(text.includes("−18") && text.includes("18")).toBe(true);
    expect(compile(sample("variationTable", '{"f": "x", "xMin": 0, "xMax": 1, "points": [5]}'), "English")).toBeNull();
    // A listed point where f′ is not zero is not a critical point.
    expect(
      compile(sample("variationTable", '{"f": "x^3-3*x", "xMin": -3, "xMax": 3, "points": [0.5]}'), "English"),
    ).toBeNull();
  });

  it("piecewise branches and open ends", () => {
    const figure = sample(
      "piecewiseFunction",
      '{"pieces": [{"f": "x+2", "from": -3, "to": 0}, {"f": "x^2", "from": 0, "to": 2}]}',
    );
    const pieces = piecewisePieces(new Params(figure))!;
    expect(piecewiseValue(pieces, -3)).toBe(-1);
    expect(piecewiseValue(pieces, -1)).toBe(1);
    expect(piecewiseValue(pieces, 0)).toBe(0);
    expect(piecewiseValue(pieces, 2)).toBe(4);
    expect(piecewiseValue(pieces, 3)).toBeNull();
    // The first branch is open where the second starts: one open point at (0, 2), three closed or open ends in all.
    const compiled = compile(figure)!;
    expect(compiled.elements.filter((element) => element.kind === "circle")).toHaveLength(1);
    expect(compiled.elements.filter((element) => element.kind === "point")).toHaveLength(3);
    expect(
      compile(
        sample("piecewiseFunction", '{"pieces": [{"f": "x", "from": 0, "to": 2}, {"f": "x", "from": 1, "to": 3}]}'),
        "English",
      ),
    ).toBeNull();
  });

  it("rational asymptotes are found", () => {
    const found = (n: string, d: string, low = -6, high = 6) => rationalAsymptotes(fn(n), fn(d), low, high)!;
    const slant = found("x^2+1", "x-1");
    expect([slant.vertical, slant.slantSlope, slant.slantIntercept, slant.horizontal]).toEqual([[1], 1, 1, null]);
    const horizontal = found("2*x+1", "x-3");
    expect([horizontal.vertical, horizontal.horizontal, horizontal.slantSlope]).toEqual([[3], 2, null]);
    const hole = found("x^2-1", "x-1");
    expect([hole.vertical, hole.holes, hole.slantSlope]).toEqual([[], [1], 1]);
    const double = found("1", "x^2", -5, 7);
    expect([double.vertical, double.horizontal]).toEqual([[0], 0]);
    const twoRoots = found("x", "x^2-4");
    expect([twoRoots.vertical, twoRoots.horizontal]).toEqual([[-2, 2], 0]);
    const shown = finalLabels(
      scene("rationalAsymptotes", '{"numerator": "x^2+1", "denominator": "x-1", "xMin": -5, "xMax": 7}'),
    );
    expect(shown.includes("x = 1") && shown.includes("y = x + 1")).toBe(true);
    expect(lineText(-2, -0.5, pt)).toBe("y = −2x − 0,5");
  });

  it("exponential and logarithm are mirror images", () => {
    expect(Math.abs(logBase(2, 8) - 3)).toBeLessThan(1e-12);
    for (const x of [0.3, 1.0, 2.5])
      expect(Math.abs(Math.pow(2, logBase(2, Math.pow(2, x))) - Math.pow(2, x))).toBeLessThan(1e-9);
    const figure = scene("expLog", '{"base": 2}');
    // Equal units on both axes: the dashed line is y = x, at 45°.
    const mirror = figure.elements.find((e) => e.kind === "line" && e.dashed === true && e.color === "muted")!;
    const compiled = new CompiledIllustration(figure);
    const at = values(0.95 * (figure.duration ?? 0));
    const dx = (compiled.value(mirror.x2, at) ?? 0) - (compiled.value(mirror.x, at) ?? 0);
    const dy = (compiled.value(mirror.y2, at) ?? 0) - (compiled.value(mirror.y, at) ?? 0);
    expect(Math.abs(dx - dy) < 1e-9 && dx > 1).toBe(true);
    // Reflecting the exponential through that line gives points of the logarithm: (x, 2ˣ) ↔ (2ˣ, x).
    const growth = figure.elements.find((e) => e.kind === "curve" && e.color === "white")!;
    const logarithm = figure.elements.filter((e) => e.kind === "curve" && e.color === "accent");
    const up = curvePoints(growth, figure, at.t);
    const down = logarithm.flatMap((e) => curvePoints(e, figure, at.t, 400));
    const offset = (compiled.value(mirror.x, at) ?? 0) - (compiled.value(mirror.y, at) ?? 0);
    let candidates = 0;
    let matched = 0;
    for (const point of up) {
      const reflected = { x: point.y + offset, y: point.x - offset };
      if (!(reflected.x > 4.8 && reflected.x < 7.6 && reflected.y > 1.5 && reflected.y < 4.8)) continue;
      candidates += 1;
      if (down.some((p) => Math.hypot(p.x - reflected.x, p.y - reflected.y) < 0.05)) matched += 1;
    }
    expect(candidates >= 3 && matched === candidates).toBe(true);
    expect(finalLabels(figure)).toContain("log₂ x");
  });
});
