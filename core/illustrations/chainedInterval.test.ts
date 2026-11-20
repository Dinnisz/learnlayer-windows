// Port of FunctionPlotTests.aChainedInequalityIsTheGraphsWindow @ 5701363: "0 ≤ x ≤ 4" in the question is the graph's
// window. (The axis at the origin and the round ticks are `yAxisValue` and the tick labels of ui/figures/CurveGraph.)
import { describe, expect, it } from "vitest";
import { decodeProblemSolution } from "../problems/problemSolution";
import { chainedIntervals } from "./functionGraph";
import { FunctionPlot } from "./graph";

const question =
  "2. Find the volume of the solid obtained by rotating the region under y = √x, 0 ≤ x ≤ 4, about the x-axis.";
const part = decodeProblemSolution({
  subject: "Matemática A",
  parts: [
    {
      label: "1",
      figureTopic: "function",
      asks: "Calcular o volume do sólido gerado pela rotação, em torno do eixo Ox, da região sob y = √x para 0 ≤ x ≤ 4.",
      steps: ["Método dos discos: V = π∫₀⁴ [f(x)]² dx, com f(x) = √x", "V = 8π"],
      answer: { text: "V = 8π", expression: "8*pi" },
      answerLatex: "V = 8\\pi",
    },
  ],
}).parts[0]!;

describe("a chained inequality", () => {
  it("is the graph's window", () => {
    const graph = FunctionPlot.graph(question, "Cálculo", part)!;
    expect(graph).not.toBeNull();
    // [0, 4] with a little room, not the default [-5, 5].
    expect(graph.xMin < 0 && graph.xMin >= -0.5).toBe(true);
    expect(graph.xMax > 4 && graph.xMax <= 4.5).toBe(true);
    expect(chainedIntervals("0 <= x <= 4")[0]).toEqual([0, 4]);
    expect(chainedIntervals("0 \\le x \\le 2")[0]).toEqual([0, 2]);
    expect(chainedIntervals("-1 < t < 2,5")[0]).toEqual([-1, 2.5]);
    expect(chainedIntervals("x ≤ 4")).toEqual([]);
  });
});
