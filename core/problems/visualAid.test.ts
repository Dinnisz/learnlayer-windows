// Port of `dropsACurveThatDoesNotPlot` (LearnLayerTests/FunctionPlotTests.swift @ ref 2026-11-04), with the prompt's
// message, its schema, and the provider's cache: one call per question, none with mocks.

import { describe, expect, it } from "vitest";
import { DiskCache } from "../ai/diskCache";
import type { ModelClient } from "../ai/modelClient";
import { Graphs } from "../illustrations/graph";
import type { Part } from "./problemSolution";
import { decodeVisualAid, VisualAidPrompt, VisualAidProvider, VisualAids, type VisualAid } from "./visualAid";

const aid = (fields: Partial<VisualAid>): VisualAid => ({ ...VisualAids.none(), ...fields });
const files = () => {
  const store = new Map<string, string>();
  return {
    read: async (name: string) => store.get(name) ?? null,
    write: async (name: string, text: string) => void store.set(name, text),
  };
};
const part = {
  label: "2.1.",
  asks: "Estude a monotonia de f.",
  steps: ["f'(x) = 2x - 4", "f'(x) = 0 ⇔ x = 2", "f decresce em ]-∞, 2]", "f cresce em [2, +∞[", "mínimo f(2) = -1"],
  answer: { text: "f decrescente em ]-∞, 2] e crescente em [2, +∞[" },
} as unknown as Part;

describe("visual aid", () => {
  it("drops a curve that does not plot", () => {
    expect(
      VisualAids.plot(aid({ kind: "graph", expression: "not a function", variable: "x", xMin: -1, xMax: 1 })),
    ).toBeNull();
    const line = VisualAids.plot(aid({ kind: "graph", expression: "2*x+1", variable: "x", xMin: -2, xMax: 2 }));
    expect(line !== null && Graphs.isDrawable(line)).toBe(true);
    // A diagram or nothing is no curve.
    expect(VisualAids.plot(aid({ kind: "diagram" }))).toBeNull();
  });

  it("reads the model's reply, and anything else is none", () => {
    expect(decodeVisualAid({ kind: "graph", expression: "x^2", variable: "x", xMin: 0, xMax: 3 }).kind).toBe("graph");
    expect(decodeVisualAid({ kind: "picture" }).kind).toBe("none");
    expect(decodeVisualAid(null).kind).toBe("none");
  });

  it("asks for a picture or not, never a solution, with the part's first four steps and its answer", () => {
    expect(VisualAidPrompt.version).toBe("1");
    const system = VisualAidPrompt.system("Portuguese (Portugal)");
    expect(system.startsWith("You decide whether a picture would make a worked solution clearer.")).toBe(true);
    expect(system).toContain('"xLabel" and "yLabel" are short axis names, in Portuguese (Portugal).');
    const message = VisualAidPrompt.user("Considere f(x) = x^2 - 4x + 3.", "Matemática A", part);
    expect(message.startsWith("Subject: Matemática A\n\nQuestion:\nConsidere f(x) = x^2 - 4x + 3.")).toBe(true);
    expect(message).toContain("\n\nPart 2.1.: Estude a monotonia de f.");
    expect(message).toContain("f cresce em [2, +∞[");
    expect(message).not.toContain("mínimo f(2) = -1");
    expect(message.endsWith("\n\nAnswer: f decrescente em ]-∞, 2] e crescente em [2, +∞[")).toBe(true);
    expect(VisualAidPrompt.schema.required).toEqual([
      "kind",
      "expression",
      "variable",
      "xMin",
      "xMax",
      "xLabel",
      "yLabel",
    ]);
  });

  it("asks once per question and part, and never with mocks", async () => {
    let calls = 0;
    const provider = new VisualAidProvider({
      cache: new DiskCache<VisualAid>("visual-aids.json", 100, files()),
      client: () =>
        ({
          complete: async () => {
            calls += 1;
            return { content: JSON.stringify(aid({ kind: "graph", expression: "x^2-4*x+3", variable: "x" })), cost: 0 };
          },
        }) as unknown as ModelClient,
      language: () => "English",
      usesMock: false,
    });
    expect((await provider.aid("Considere f.", "Matemática A", part)).kind).toBe("graph");
    expect((await provider.aid("Considere f.", "Matemática A", part)).kind).toBe("graph");
    expect(calls).toBe(1);
    const mocked = new VisualAidProvider({ ...provider.services, usesMock: true });
    expect((await mocked.aid("Considere f.", "Matemática A", part)).kind).toBe("none");
    expect(calls).toBe(1);
  });
});
