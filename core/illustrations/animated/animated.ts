// Port of PremadeFigure.compileAnimated (LearnLayer/Illustrations/PremadeFigureAnimated.swift) and the gallery of
// PremadeFigureAnimatedGallery.swift @ ref 2026-11-04, for the animated kinds this port draws so far (Calculus 1, and
// series, slope fields, polar and parametric curves). The other kinds the Mac offers (multivariable, algorithms, data
// structures, physics scenes) return null here, so the provider asks for a template instead and a figure that can't be
// drawn never appears.

import { CompiledIllustration, type Illustration } from "../illustration";
import type { PremadeFigure, PremadeValue } from "../premadeFigure";
import { calculusFigures } from "./calculus";
import { seriesFigures } from "./series";
import { Params } from "./figureCanvas";

/** The animated premade types this port compiles. */
const compilers = { ...calculusFigures, ...seriesFigures };

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
];
