// The 3D figure as a lesson is told about it, and a beat's request to it (Figure3DSpec.lessonDescription and
// LessonFigure3D.init(shows:) @ ref 2026-11-04).

import { describe, expect, it } from "vitest";
import { lessonFigure, LessonFigureText } from "./lessonFigure";
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
    ).toEqual({ highlight: "R2", assemble: 3, yaw: 30 });
  });
});
