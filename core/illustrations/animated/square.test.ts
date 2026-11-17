// Port of the square-of-opposition suite of LearnLayerTests/PremadeFigureBatch4PhilosophyTests.swift @ ref 2026-11-04.
// The figure's bounds and overlaps are checked with the gallery in animated.test.ts.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration } from "../illustration";
import { PremadeFigures } from "../premadeFigure";
import { sample } from "./animated";
import { squareRelation, squareStatuses, type Status } from "./square";
import type { Kind } from "./syllogism";

const t: Status = "isTrue";
const f: Status = "isFalse";
const o: Status = "open";
const kinds: Kind[] = [0, 1, 2, 3];
function finalLabels(figure: Illustration): string[] {
  const compiled = new CompiledIllustration(figure);
  const at = { t: 0.95 * (figure.duration ?? 0), revealed: 1, step: 1000 };
  return figure.elements
    .filter((e) => e.kind === "label" && (!e.visible || (compiled.value(e.visible, at) ?? 0) > 0))
    .map((e) => e.text ?? "");
}

describe("square of opposition", () => {
  it("the traditional square follows from S having members", () => {
    // Rows: given A, E, I, O; the statuses of A, E, I, O when the given one is true, then when it is false.
    const whenTrue = [
      [t, f, t, f],
      [f, t, f, t],
      [o, f, t, o],
      [f, o, o, t],
    ];
    const whenFalse = [
      [f, o, o, t],
      [o, f, t, o],
      [f, t, f, t],
      [t, f, t, f],
    ];
    for (const kind of kinds) {
      expect(squareStatuses(kind, true, true), `${kind} true`).toEqual(whenTrue[kind]);
      expect(squareStatuses(kind, false, true), `${kind} false`).toEqual(whenFalse[kind]);
    }
  });

  it("without existential import only the contradictories remain", () => {
    const whenTrue = [
      [t, o, o, f],
      [o, t, f, o],
      [o, f, t, o],
      [f, o, o, t],
    ];
    const whenFalse = [
      [f, o, o, t],
      [o, f, t, o],
      [o, t, f, o],
      [t, o, o, f],
    ];
    for (const kind of kinds) {
      expect(squareStatuses(kind, true, false), `${kind} true`).toEqual(whenTrue[kind]);
      expect(squareStatuses(kind, false, false), `${kind} false`).toEqual(whenFalse[kind]);
    }
    // Contradictories are opposite in both squares.
    const opposite: Record<Kind, Kind> = { 0: 3, 3: 0, 1: 2, 2: 1 };
    for (const importFlag of [true, false])
      for (const kind of kinds)
        for (const value of [true, false])
          expect(squareStatuses(kind, value, importFlag)![opposite[kind]]).toBe(value ? f : t);
  });

  it("the relations are named as on the square, and the figure says what follows", () => {
    expect(squareRelation(0, 3)).toBe("contradictory");
    expect(squareRelation(2, 1)).toBe("contradictory");
    expect(squareRelation(0, 1)).toBe("contrary");
    expect(squareRelation(3, 2)).toBe("subcontrary");
    expect(squareRelation(0, 2)).toBe("subalternation");
    expect(squareRelation(0, 0)).toBeNull();
    const figure = new PremadeFigures(
      sample("squareOfOpposition", '{"S": "gato", "P": "preto", "given": "A", "value": true}'),
    ).compile("t", "Portuguese (Portugal)")!;
    expect(finalLabels(figure)).toContain("Dada A verdadeira: E falsa, I verdadeira, O falsa");
    expect(
      new PremadeFigures(
        sample("squareOfOpposition", '{"S": "gato", "P": "preto", "given": "X", "value": true}'),
      ).compile("t", "English"),
    ).toBeNull();
  });
});
