// Port of LearnLayer/Illustrations/Illustration.swift (`plottingAuxiliarySum`) @ ref 2026-11-04

import { evaluate, tryParseExpression } from "../math/expression";
import { formatG } from "../math/printf";
import type { Part } from "../problems/problemSolution";
import { FunctionGraph } from "./functionGraph";
import { CompiledIllustration, type Illustration } from "./illustration";
import { compileTemplate, decodeTemplate } from "./illustrationTemplate";

function sameCurve(left: string, right: string): boolean {
  const a = tryParseExpression(left);
  const b = tryParseExpression(right);
  if (!a || !b) return false;
  for (const x of [-1, -0.5, 0, 0.5, 1]) {
    const ya = evaluate(a, { x });
    const yb = evaluate(b, { x });
    if (!Number.isFinite(ya) || !Number.isFinite(yb)) return false;
    if (Math.abs(ya - yb) > Math.max(0.02 * Math.max(Math.abs(ya), Math.abs(yb)), 1e-6)) return false;
  }
  return true;
}

const literal = (value: number) =>
  Math.abs(value - Math.round(value)) < 1e-9 ? String(Math.round(value)) : formatG(value);

/**
 * The solution applies the theorem to an auxiliary function, `g(x) = f(x) + x`, while the drawing still shows f and
 * the line y = −x. Plot g itself: its signed endpoints and the crossing. A template that already draws that sum is
 * left as the model wrote it.
 */
export function plottingAuxiliarySum(scene: Illustration, part: Part): Illustration {
  const template = decodeTemplate(scene.template);
  const fText = template?.f;
  if (!template || template.kind !== "function" || !fText) return scene;
  const pieces = [...FunctionGraph.pieces("", part), { text: `f(x)=${fText}`, step: null }];
  const spec = FunctionGraph.spec(pieces);
  if (!spec || (spec.name === "f" && sameCurve(spec.expression, fText))) return scene;
  if (sameCurve(spec.expression, fText)) return scene;
  if (template.g && sameCurve(spec.expression, template.g)) return scene;
  const next = { ...template, f: spec.expression, g: null, xMin: spec.xMin, xMax: spec.xMax };
  // Endpoint values only: a crossing label "g = 0" sits a hair off zero.
  const marks = spec.marks.filter((mark) => mark.role === "value");
  if (marks.length > 0) next.marks = marks.map((mark) => ({ x: literal(mark.x), text: mark.label }));
  // A sum that does not compile must not wipe the drawing that was there.
  const trial = compileTemplate(next, "English");
  if (trial.elements.length === 0) return scene;
  const check: Illustration = {
    title: scene.title,
    width: 10,
    height: 6,
    parameters: trial.parameters,
    elements: trial.elements,
    template: next,
  };
  if (!new CompiledIllustration(check).isDrawable) return scene;
  return { ...scene, template: next };
}
