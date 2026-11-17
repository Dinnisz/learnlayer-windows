// Port of AnimatedFigureCheck (LearnLayerTests/PremadeFigureAnimatedTests.swift) @ ref 2026-11-04: a scene read the way
// the renderer reads it (expressions evaluated at a moment in time), for the tests of the animated figures: what is
// shown, where, whether it stays in the picture, and whether its labels cover one another.

import { CompiledIllustration, type Illustration, type IllustrationElement } from "../illustration";
import { boxesOverlap, LabelBoard, type LabelBox } from "./figureCanvas";

export const values = (time: number) => ({ t: time, revealed: 1, step: 1000 });
export const times = (scene: Illustration) => {
  const duration = scene.duration ?? 0;
  return [0, 0.2 * duration, 0.4 * duration, 0.6 * duration, 0.8 * duration, 0.95 * duration];
};
const isShown = (element: IllustrationElement, compiled: CompiledIllustration, at: Record<string, number>) => {
  if (!element.visible) return true;
  const value = compiled.value(element.visible, at);
  return value !== null && Number.isFinite(value) && value > 0;
};
const labelBox = (element: IllustrationElement, compiled: CompiledIllustration, at: Record<string, number>) => {
  if (element.kind !== "label" || !element.text) return null;
  const x = compiled.value(element.x, at);
  const y = compiled.value(element.y, at);
  if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return LabelBoard.box(element.text, x, y, element.anchor ?? "leading");
};

/** Everything drawn at `time` lies inside the 10 × 6 world. */
export function boundsProblems(scene: Illustration, time: number): string[] {
  const compiled = new CompiledIllustration(scene);
  const at = values(time);
  const problems: string[] = [];
  const inside = (x: number | null, y: number | null, what: string) => {
    if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < -0.001 || x > 10.001 || y < -0.001 || y > 6.001) problems.push(`${what} at (${x}, ${y}) when t = ${time}`);
  };
  const number = (text: string | null | undefined) => compiled.value(text, at);
  scene.elements.forEach((element, index) => {
    if (!isShown(element, compiled, at)) return;
    const name = `#${index} ${element.kind} ${element.text ?? ""}`;
    switch (element.kind) {
      case "point":
      case "line":
      case "arrow":
      case "component":
      case "state":
      case "transition":
      case "spring":
        inside(number(element.x), number(element.y), name);
        inside(number(element.x2), number(element.y2), name);
        break;
      case "rect": {
        const x = number(element.x);
        const y = number(element.y);
        const w = number(element.w);
        const h = number(element.h);
        if (x !== null && y !== null && w !== null && h !== null) {
          inside(x, y, name);
          inside(x + w, y + h, name);
        }
        break;
      }
      case "circle": {
        const x = number(element.x);
        const y = number(element.y);
        const r = number(element.r);
        if (x !== null && y !== null && r !== null) {
          inside(x - r, y - r, name);
          inside(x + r, y + r, name);
        }
        break;
      }
      case "label": {
        const box = labelBox(element, compiled, at);
        if (box) {
          inside(box.minX, box.minY, name);
          inside(box.maxX, box.maxY, name);
        }
        break;
      }
      case "curve": {
        const from = number(element.from);
        const to = number(element.to);
        if (from === null || to === null) break;
        for (let step = 0; step <= 40; step++) {
          const local = { ...at, s: from + ((to - from) * step) / 40 };
          inside(compiled.value(element.curveX, local), compiled.value(element.curveY, local), name);
        }
        break;
      }
      default:
        break;
    }
  });
  return problems;
}

/** Labels shown together at `time` must not cover one another. */
export function overlapProblems(scene: Illustration, time: number): string[] {
  const compiled = new CompiledIllustration(scene);
  const at = values(time);
  const boxes: { text: string; box: LabelBox }[] = [];
  for (const element of scene.elements) {
    if (!isShown(element, compiled, at)) continue;
    const box = labelBox(element, compiled, at);
    if (box && element.text) boxes.push({ text: element.text, box });
  }
  const problems: string[] = [];
  for (let first = 0; first < boxes.length; first++)
    for (let second = first + 1; second < boxes.length; second++) {
      const a = boxes[first]!.box;
      const b = boxes[second]!.box;
      const shrunk = { minX: b.minX + 0.02, maxX: b.maxX - 0.02, minY: b.minY + 0.02, maxY: b.maxY - 0.02 };
      if (boxesOverlap(a, shrunk))
        problems.push(`“${boxes[first]!.text}” covers “${boxes[second]!.text}” when t = ${time}`);
    }
  return problems;
}

/** What is drawn, and where, at `time`: it differs between two moments if the figure moves or reveals. */
export function signature(scene: Illustration, time: number): number[] {
  const compiled = new CompiledIllustration(scene);
  const at = values(time);
  const result: number[] = [];
  for (const element of scene.elements) {
    if (!isShown(element, compiled, at)) {
      result.push(-1);
      continue;
    }
    for (const text of [element.x, element.y, element.x2, element.y2, element.w, element.h, element.to]) {
      const value = compiled.value(text, at) ?? -999;
      result.push(Number.isFinite(value) ? value : -998);
    }
  }
  return result;
}

export const animates = (scene: Illustration) => {
  const duration = scene.duration ?? 0;
  return duration > 0 && JSON.stringify(signature(scene, 0)) !== JSON.stringify(signature(scene, 0.8 * duration));
};

export function labels(scene: Illustration, time: number): string[] {
  const compiled = new CompiledIllustration(scene);
  const at = values(time);
  return scene.elements
    .filter((element) => element.kind === "label" && isShown(element, compiled, at))
    .map((element) => element.text ?? "");
}
export const finalLabels = (scene: Illustration) => labels(scene, 0.95 * (scene.duration ?? 0));

export function curvePoints(element: IllustrationElement, scene: Illustration, time: number, samples = 60) {
  const compiled = new CompiledIllustration(scene);
  const at = values(time);
  const from = compiled.value(element.from, at);
  const to = compiled.value(element.to, at);
  if (from === null || to === null) return [];
  const points: { x: number; y: number }[] = [];
  for (let step = 0; step <= samples; step++) {
    const local = { ...at, s: from + ((to - from) * step) / samples };
    const x = compiled.value(element.curveX, local);
    const y = compiled.value(element.curveY, local);
    if (x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
  }
  return points;
}
