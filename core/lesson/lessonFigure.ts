// Port of `Figure3DSpec.lessonDescription` (LearnLayer/Explanation/Figure3D.swift) and `LessonFigure3D`
// (LearnLayer/Lesson/LessonRun.swift) @ ref 2026-11-04: the 3D figure as a lesson is told about it, and what a beat asks
// of it (a part standing out, the first parts assembled, a turn).

import { CircuitSpecs, type CircuitComponent, type CircuitSpec } from "../illustrations/circuit";
import { LessonShows, type LessonShow } from "./mascotLesson";

/** A part's value as the circuit prints it ("470 Ω", "9 V"); null for a lamp, a switch or a wire. */
function valueText(part: CircuitComponent): string | null {
  const value = part.value;
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const units: Partial<Record<string, string>> = {
    battery: "V",
    resistor: "Ω",
    capacitor: "F",
    inductor: "H",
    currentSource: "A",
  };
  const unit = units[part.kind];
  return unit ? CircuitSpecs.engineering(value, unit) : null;
}

const solidMeaning: Record<string, string> = {
  region: "the flat region",
  curve: "the curve f",
  curve2: "the curve g",
  axis: "the axis of rotation",
  surface: "the solid's surface",
  inner: "the inner surface (the hole, or the bottom)",
  ends: "the flat ends or walls",
  section: "one cross-section halfway (a disc, a washer or a shell)",
  cutPlane: "a cutting plane",
};

export const LessonFigureText = {
  /** A circuit, part by part: "an electric circuit on a board. Parts in order (id: kind value, from node → to node): …". */
  circuit(circuit: CircuitSpec): string {
    const parts = circuit.components
      .filter((part) => part.kind !== "wire")
      .map((part) => {
        const value = valueText(part);
        return `${part.id}: ${part.kind}${value ? " " + value : ""}, ${part.from} → ${part.to}`;
      });
    const terminals = circuit.terminals ? ` Terminals: ${circuit.terminals.join(", ")}.` : "";
    return (
      "an electric circuit on a board. Parts in order (id: kind value, from node → to node): " +
      parts.join("; ") +
      "." +
      terminals
    );
  },

  /** A solid, by the parts its assembly shows, in order. */
  solid(label: string, order: readonly string[]): string {
    return (
      `the solid ${label}. Parts in order: ` +
      order.map((part) => `${part} (${solidMeaning[part] ?? part})`).join("; ") +
      "."
    );
  },

  /** A figure in space, by its parts. */
  space(parts: readonly string[]): string {
    return (
      "a 3D figure in Oxyz (x toward the student, y right, z up). Parts: " +
      parts.join(", ") +
      ' ("normal" is the plane\'s normal vector and "intersection" the point where the line meets the plane, both shown only when named).'
    );
  },
};

/** A lesson beat's request to the 3D figure: `highlight` standing out, the first `assemble` parts shown, turned to `yaw`. */
export interface LessonFigure3D {
  highlight: string | null;
  assemble: number | null;
  yaw: number | null;
}

/** From the beat's shows on the figure; null when it has none (the figure stays in its place). */
export function lessonFigure(shows: readonly LessonShow[]): LessonFigure3D | null {
  const onFigure = shows.filter((show) => LessonShows.isOnFigure3D(show));
  if (onFigure.length === 0) return null;
  return {
    highlight: onFigure.map((show) => show.label?.trim() ?? "").find((label) => label !== "") ?? null,
    assemble:
      onFigure.map((show) => show.assemble).find((count): count is number => count != null && count > 0) ?? null,
    yaw: onFigure.map((show) => show.yaw).find((yaw): yaw is number => yaw != null && Number.isFinite(yaw)) ?? null,
  };
}
