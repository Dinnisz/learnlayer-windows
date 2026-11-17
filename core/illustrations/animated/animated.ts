// Port of PremadeFigure.compileAnimated (LearnLayer/Illustrations/PremadeFigureAnimated.swift) and the gallery of
// PremadeFigureAnimatedGallery.swift @ ref 2026-11-04, for the animated kinds this port draws so far (Calculus 1;
// series, slope fields, polar and parametric curves; multivariable; sorting, search, lists, stacks, queues and hash
// tables; trees, heaps, graphs and growth rates; the physics scenes). The other kinds the Mac offers (the Batch
// figures: optics, chemistry, logic…) return null here, so the provider asks for a template instead and a figure
// that can't be drawn never appears.

import { CompiledIllustration, type Illustration } from "../illustration";
import type { PremadeFigure, PremadeValue } from "../premadeFigure";
import { algorithmFigures } from "./algorithms";
import { calculusFigures } from "./calculus";
import { heatingFigures } from "./heating";
import { multivariableFigures } from "./multivariable";
import { opticsFigures } from "./optics";
import { physicsFigures } from "./physics";
import { seriesFigures } from "./series";
import { structureFigures } from "./structures";
import { Params } from "./figureCanvas";

/** The animated premade types this port compiles. */
const compilers = {
  ...calculusFigures,
  ...seriesFigures,
  ...multivariableFigures,
  ...algorithmFigures,
  ...structureFigures,
  ...physicsFigures,
  ...heatingFigures,
  ...opticsFigures,
};

export const animatedTypes: ReadonlySet<string> = new Set(Object.keys(compilers));

/** The animated figure, or null for a kind not drawn here or invalid params. */
export function compileAnimated(figure: PremadeFigure, title: string, language: string): Illustration | null {
  const compiler = compilers[figure.type];
  if (!compiler) return null;
  const scene = compiler(new Params(figure), title, language);
  // A figure the renderer could not draw is not offered: free-form runs instead.
  if (!scene || scene.elements.length === 0 || !new CompiledIllustration(scene).isDrawable) return null;
  return { ...scene, premade: { type: figure.type, params: figure.params } };
}

/** A figure built from JSON params, for samples and tests. */
export function sample(type: string, json: string): PremadeFigure {
  try {
    return { type, params: JSON.parse(json) as Record<string, PremadeValue> };
  } catch {
    return { type, params: {} };
  }
}

/** One worked sample of every animated type drawn here (the Mac's gallery, its Calculus 1 entries). */
export const animatedGallery: PremadeFigure[] = [
  sample("limitApproach", '{"f": "(x^2-1)/(x-1)", "a": 1}'),
  sample("tangentLine", '{"f": "x^2/2", "a": 1, "xMin": -1, "xMax": 3}'),
  sample("taylorPolynomials", '{"function": "sin", "degrees": [1, 3, 5]}'),
  sample("riemannSums", '{"f": "x^2", "a": 0, "b": 2, "n": 6, "rule": "left"}'),
  sample("revolutionVolume", '{"f": "sqrt(x)", "a": 0, "b": 4}'),
  sample(
    "signTable",
    '{"factors": [{"name": "x − 1", "root": 1}, {"name": "x + 2", "root": -2}, {"name": "x", "root": 0, "denominator": true}]}',
  ),
  sample("variationTable", '{"f": "x^3-3*x", "xMin": -3, "xMax": 3, "points": [-1, 1]}'),
  sample(
    "piecewiseFunction",
    '{"pieces": [{"f": "x+2", "from": -3, "to": 0, "text": "x + 2"}, {"f": "x^2", "from": 0, "to": 2, "fromClosed": true, "toClosed": true, "text": "x²"}]}',
  ),
  sample("rationalAsymptotes", '{"numerator": "x^2+1", "denominator": "x-1", "xMin": -5, "xMax": 7}'),
  sample("expLog", '{"base": 2}'),
  sample("seriesPartialSums", '{"kind": "geometric", "ratio": 0.5, "count": 10}'),
  sample("slopeField", '{"f": "x-y", "solutions": [{"x": 0, "y": 1}, {"x": -2, "y": -1}]}'),
  sample("polarCurve", '{"kind": "cardioid"}'),
  sample("parametricCurve", '{"x": "sin(2*t)", "y": "sin(3*t)"}'),
  sample("levelCurves", '{"f": "x^2-y^2", "levels": [-4, -1, 0, 1, 4]}'),
  sample("doubleIntegralRegion", '{"lower": "x^2", "upper": "x", "a": 0, "b": 1}'),
  sample("cylindricalSpherical", '{"system": "spherical", "r": 3, "theta": 50, "phi": 40}'),
  sample("vectorField2D", '{"P": "-y", "Q": "x"}'),
  sample("characteristicsPDE", '{"a": 2, "b": 1, "phi": "exp(-x^2)"}'),
  sample("arrayBars", '{"values": [5, 2, 8, 1, 9, 3], "algorithm": "bubble"}'),
  sample("arrayBars", '{"values": [5, 2, 8, 1, 9, 3], "algorithm": "insertion"}'),
  sample("arrayBars", '{"values": [5, 2, 8, 1, 9, 3, 7], "algorithm": "merge"}'),
  sample("arrayBars", '{"values": [5, 2, 8, 1, 9, 3, 7], "algorithm": "quick"}'),
  sample("binarySearch", '{"values": [1, 3, 5, 7, 9, 11, 13, 15], "target": 11}'),
  sample("linkedList", '{"values": [4, 7, 2], "operation": "insert", "index": 1, "value": 9}'),
  sample("linkedList", '{"values": [4, 7, 2, 8], "operation": "delete", "index": 1}'),
  sample("linkedList", '{"values": [4, 7, 2], "operation": "traverse"}'),
  sample("stackQueue", '{"kind": "stack", "operations": ["push 3", "push 8", "push 5", "pop", "push 1"]}'),
  sample(
    "stackQueue",
    '{"kind": "queue", "operations": ["enqueue 3", "enqueue 8", "enqueue 5", "dequeue", "enqueue 1"]}',
  ),
  sample("hashTable", '{"size": 5, "keys": [12, 7, 22, 3, 17, 8]}'),
  sample("binaryTree", '{"values": [5, 3, 8, 1, 4, 7, 9]}'),
  sample("binaryTree", '{"values": [5, 3, 8, 1, 4, 7, 9], "traversal": "inorder"}'),
  sample("heap", '{"values": [7, 3, 9, 1, 5], "kind": "min", "extract": true}'),
  sample("heap", '{"values": [4, 10, 3, 8, 6, 9], "kind": "max"}'),
  sample(
    "graph",
    '{"nodes": ["A", "B", "C", "D", "E"], "algorithm": "bfs", "source": "A", "edges": [{"from": "A", "to": "B"}, {"from": "A", "to": "C"}, {"from": "B", "to": "D"}, {"from": "C", "to": "D"}, {"from": "D", "to": "E"}]}',
  ),
  sample(
    "graph",
    '{"nodes": ["A", "B", "C", "D", "E"], "algorithm": "dfs", "source": "A", "edges": [{"from": "A", "to": "B"}, {"from": "A", "to": "C"}, {"from": "B", "to": "D"}, {"from": "C", "to": "D"}, {"from": "D", "to": "E"}]}',
  ),
  sample(
    "graph",
    '{"nodes": ["A", "B", "C", "D", "E"], "algorithm": "dijkstra", "source": "A", "edges": [{"from": "A", "to": "B", "weight": 4}, {"from": "A", "to": "C", "weight": 1}, {"from": "C", "to": "B", "weight": 2}, {"from": "B", "to": "D", "weight": 1}, {"from": "C", "to": "D", "weight": 5}, {"from": "D", "to": "E", "weight": 3}]}',
  ),
  sample("complexityChart", "{}"),
  sample("motionScene", '{"x0": 0, "v0": 3, "a": 1.2, "tMax": 4}'),
  sample("verticalThrow", '{"v0": 12, "g": 9.8}'),
  sample("inclinedBlock", '{"angle": 30, "mu": 0.2}'),
  sample("inclinedBlock", '{"angle": 18, "mu": 0.75}'),
  sample("heatingCurve", '{"m": 100, "T0": -20, "T1": 120}'),
  sample("heatingCurve", '{"m": 200, "T0": -10, "T1": 60}'),
  sample("heatingCurve", '{"m": 50, "T0": -15, "T1": 100}'),
  sample("mirrorRays", '{"kind": "plane", "objectDistance": 3}'),
  sample("mirrorRays", '{"kind": "concave", "focal": 2, "objectDistance": 5}'),
  sample("mirrorRays", '{"kind": "concave", "focal": 2, "objectDistance": 1}'),
  sample("mirrorRays", '{"kind": "convex", "focal": 2, "objectDistance": 4}'),
  sample("lensRays", '{"kind": "converging", "focal": 2, "objectDistance": 5}'),
  sample("lensRays", '{"kind": "converging", "focal": 2, "objectDistance": 1}'),
  sample("lensRays", '{"kind": "converging", "focal": 2, "objectDistance": 2}'),
  sample("lensRays", '{"kind": "diverging", "focal": 2, "objectDistance": 4}'),
  sample("refraction", '{"n1": 1, "n2": 1.5, "angle": 40}'),
  sample("refraction", '{"n1": 1.5, "n2": 1, "angle": 30}'),
  sample("refraction", '{"n1": 1.5, "n2": 1, "angle": 60}'),
  sample("prismDispersion", '{"incidence": 60}'),
  sample("doubleSlit", '{"wavelength": 600, "separation": 0.5, "screenDistance": 2}'),
  sample("emSpectrum", "{}"),
];
