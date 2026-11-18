// Port of `Figure3DSpec.lessonDescription` (LearnLayer/Explanation/Figure3D.swift) and `LessonFigure3D`
// (LearnLayer/Lesson/LessonRun.swift) @ ref 2026-11-04: the 3D figure as a lesson is told about it, and what a beat asks
// of it (a part standing out, the first parts assembled, a turn).

import { CircuitMerges, CircuitSpecs, type CircuitComponent, type CircuitSpec } from "../illustrations/circuit";
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
  /** The highlighted resistors joined so far ("" none, null all): the join itself waits for the voice. */
  join?: string | null;
}

/** A beat's figure: shown as the beat starts, then (when it joins parts) what it ends on. */
export interface LessonFigureBeat {
  start: LessonFigure3D;
  end: LessonFigure3D | null;
}

const figure = (highlight: string | null, join: string | null = null): LessonFigure3D => ({
  highlight,
  assemble: null,
  yaw: null,
  join,
});

/**
 * When the lesson raises the 3D figure (`LessonFigurePicker`): only where it shows something new. A step that changes
 * the figure (the app's reading of the solution) comes first; then a part the model names, once each. A beat that would
 * show again what the figure already showed leaves it in its place.
 */
export class LessonFigurePicker {
  private readonly steps = new Set<number>();
  private readonly shown = new Set<string>();

  constructor(
    readonly plan: readonly (string | null)[],
    readonly partIDs: ReadonlySet<string>,
  ) {}

  figure(beat: { show: readonly LessonShow[] }, step: number | null): LessonFigureBeat | null {
    // The step's own reduction first: it starts from the step before (its block still joined, the new parts lit) and
    // joins as it is said.
    const highlight = step !== null ? (this.plan[step] ?? null) : null;
    if (step !== null && highlight !== null) {
      const before = step > 0 ? (this.plan[step - 1] ?? null) : null;
      if (before === highlight || this.steps.has(step)) return null;
      this.steps.add(step);
      if (!this.isNew(highlight)) return null;
      return { start: figure(highlight, before ?? ""), end: figure(highlight) };
    }
    const explicit = lessonFigure(beat.show);
    if (explicit) return this.isNew(explicit.highlight) ? { start: explicit, end: null } : null;
    const named = beat.show
      .map((show) => show.label)
      .find((label): label is string => {
        if (!label) return false;
        const ids = CircuitMerges.ids(label);
        return ids.length > 0 && ids.every((id) => this.partIDs.has(id));
      });
    if (named) return this.isNew(named) ? { start: figure(named), end: null } : null;
    return null;
  }

  /** The same parts in any order are the same view; the whole figure (no part) counts once too. */
  private isNew(highlight: string | null): boolean {
    const parts = (highlight ?? "")
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter((part) => part !== "")
      .sort();
    const key = parts.length === 0 ? "*" : parts.join(",");
    if (this.shown.has(key)) return false;
    this.shown.add(key);
    return true;
  }
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
    join: null,
  };
}
