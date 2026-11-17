// Port of Space3DScene (meet, parts) in LearnLayer/Explanation/Space3D.swift and Figure3DSteps.spaceParts in
// LearnLayer/Explanation/Figure3DSteps.swift @ ref 2026-11-04: what a step of analytic geometry in space is about,
// read from its own formula and words (no script from a model), and the line's meeting point with the plane worked out
// by the app.

import {
  lineMeetsPlane,
  SpaceFigures,
  type SpaceFigure,
  type SpaceLine,
  type SpacePlane,
  type Vector3,
} from "./spaceFigure";

export const Space3D = {
  /** The names a step can light besides point names ("A") and edges ("AB"). */
  line: "line",
  plane: "plane",
  normal: "normal",
  intersection: "intersection",

  /** The point of the line on the plane; null when parallel (or either is missing). */
  meet(line: SpaceLine | null, plane: SpacePlane | null): Vector3 | null {
    return lineMeetsPlane(line, plane);
  },

  /** The part names this figure has, in the order an assembly shows them; null for a figure that doesn't check out. */
  parts(input: SpaceFigure): string[] | null {
    const figure = SpaceFigures.validated(input);
    if (!figure) return null;
    const names = [...figure.points.map((point) => point.name), ...(figure.edges ?? [])];
    if (figure.line) names.push(Space3D.line);
    if (figure.plane) names.push(Space3D.plane, Space3D.normal);
    if (Space3D.meet(figure.line, figure.plane)) names.push(Space3D.intersection);
    return names;
  },
};

const folded = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * What a step of analytic geometry is about: the points and edges its formula names (A, \overrightarrow{AB}), the
 * plane, the line, the normal vector, the meeting point ("AB,VA,normal,plane"); null when it names none of them.
 */
export function spaceParts(formula: string, words: string, figure: SpaceFigure): string | null {
  const all = Space3D.parts(figure);
  if (!all) return null;
  const parts = new Set(all);
  // Words inside \text{} are words, not names.
  const maths = formula.replace(/\\text\{[^}]*\}/gu, " ");
  const text = folded(`${words} ${formula}`);
  const found: string[] = [];
  const add = (name: string) => {
    if (parts.has(name) && !found.includes(name)) found.push(name);
  };
  // Edges and vectors between two named points: \overrightarrow{AB}, [AB], AB.
  const names = new Set(figure.points.map((point) => point.name));
  for (const match of maths.matchAll(/(?:overrightarrow\{|vec\{|\[)?([A-Z][0-9']?)([A-Z][0-9']?)(?:\}|\])?/gu)) {
    const a = match[1]!;
    const b = match[2]!;
    if (!names.has(a) || !names.has(b)) continue;
    if (parts.has(a + b)) add(a + b);
    else if (parts.has(b + a)) add(b + a);
    else {
      add(a);
      add(b);
    }
  }
  // Single points: a capital name standing alone in the formula ("A(1, 2, 3)", "V =").
  for (const match of maths.matchAll(/(?<![A-Za-z\\])([A-Z][0-9']?)(?![A-Za-z])/gu))
    if (names.has(match[1]!)) add(match[1]!);
  if (["normal", "\\vec{n}", "\\vec n", "\\overrightarrow{n}"].some((word) => text.includes(word))) {
    add(Space3D.normal);
    add(Space3D.plane);
  }
  if (text.includes("interse") || text.includes("intersect")) {
    add(Space3D.line);
    add(Space3D.plane);
    add(Space3D.intersection);
  }
  if (text.includes("plano") || text.includes("plane") || /[xyz]\s*[+-].*[xyz].*=\s*0/u.test(maths)) add(Space3D.plane);
  if (
    text.includes("reta") ||
    text.includes("recta") ||
    text.includes(" line") ||
    maths.includes("(x,y,z)") ||
    maths.includes("(x, y, z)")
  )
    add(Space3D.line);
  return found.length === 0 ? null : found.join(",");
}
