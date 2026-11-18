// The 3D figure as a lesson is told about it, and a beat's request to it (Figure3DSpec.lessonDescription and
// LessonFigure3D.init(shows:) @ ref 2026-11-04).

import { describe, expect, it } from "vitest";
import { lessonFigure, LessonFigurePicker, LessonFigureText } from "./lessonFigure";
import type { CircuitSpec } from "../illustrations/circuit";

describe("the 3D figure in a lesson", () => {
  it("a circuit is told part by part, wires left out", () => {
    const circuit = {
      nodes: ["a", "n1", "b"],
      components: [
        { id: "R1", kind: "resistor", from: "a", to: "n1", value: 1000 },
        { id: "W1", kind: "wire", from: "n1", to: "b", value: null },
        { id: "V1", kind: "battery", from: "b", to: "a", value: 9 },
      ],
      chargeTau: null,
      terminals: ["a", "b"],
    } as unknown as CircuitSpec;
    expect(LessonFigureText.circuit(circuit)).toBe(
      "an electric circuit on a board. Parts in order (id: kind value, from node → to node): " +
        "R1: resistor 1 kΩ, a → n1; V1: battery 9 V, b → a. Terminals: a, b.",
    );
  });

  it("a solid and a figure in space are told by their parts", () => {
    expect(LessonFigureText.solid("de revolução", ["region", "axis", "surface"])).toBe(
      "the solid de revolução. Parts in order: region (the flat region); axis (the axis of rotation); surface (the solid's surface).",
    );
    expect(LessonFigureText.space(["A", "B", "plane"])).toContain("Parts: A, B, plane (");
  });

  it("a beat's shows on the figure ask for a part, an assembly and a turn", () => {
    expect(lessonFigure([{ op: "highlight", quote: "R1" }])).toBeNull();
    expect(
      lessonFigure([
        { op: "highlight", on: "figure3d", label: "  " },
        { op: "highlight", on: "figure3d", label: "R2", assemble: 0, yaw: 30 },
        { op: "point", on: "figure3d", assemble: 3 },
      ]),
    ).toEqual({ highlight: "R2", assemble: 3, yaw: 30, join: null });
  });
});

// theFigureRisesOnlyWhenItShowsSomethingNew and aCircuitReductionStillRisesOnEachStepThatJoinsParts
// (LearnLayerTests/LessonFigure3DTests.swift @ ref 2026-11-04).
describe("when the lesson raises the 3D figure (LessonFigurePicker)", () => {
  const on = (label: string) => ({ show: [{ op: "highlight", on: "figure3d", label }] });
  const figure = (highlight: string, join: string | null = null) => ({ highlight, assemble: null, yaw: null, join });

  it("the figure rises only when it shows something new", () => {
    const beats = [
      on("curve"),
      on("section"),
      on("section"),
      { show: [{ op: "highlight", step: 2 }] },
      on("surface"),
      on("curve"),
    ];
    const picker = new LessonFigurePicker([], new Set(["curve", "section", "surface"]));
    expect(beats.map((beat) => picker.figure(beat, null)?.start.highlight ?? null)).toEqual([
      "curve",
      "section",
      null,
      null,
      "surface",
      null,
    ]);
  });

  it("a circuit reduction still rises on each step that joins parts", () => {
    const beat = { show: [{ op: "highlight", step: 1 }] };
    const picker = new LessonFigurePicker(["R1,R2", "R1,R2", "R1,R2,R3"], new Set(["R1", "R2", "R3"]));
    expect(picker.figure(beat, 0)?.end).toEqual(figure("R1,R2"));
    expect(picker.figure(beat, 0)).toBeNull();
    expect(picker.figure(beat, 1)).toBeNull();
    expect(picker.figure(beat, 2)?.start).toEqual(figure("R1,R2,R3", "R1,R2"));
  });

  it("a part named by its id raises the figure even without saying figure3d", () => {
    const picker = new LessonFigurePicker([], new Set(["R1", "R2"]));
    expect(picker.figure({ show: [{ op: "circle", label: "R1+R2" }] }, null)?.start.highlight).toBe("R1+R2");
    expect(picker.figure({ show: [{ op: "circle", label: "R7" }] }, null)).toBeNull();
  });
});
