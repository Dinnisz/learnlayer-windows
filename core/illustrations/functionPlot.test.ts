// Port of LearnLayerTests/FunctionPlotTests.swift (FunctionPlotTests and the GraphRelevance tests that need no
// session) @ ref 2026-11-04

import { describe, expect, test } from "vitest";
import { decodeProblemSolution, type Part } from "../problems/problemSolution";
import { FunctionPlot, Graphs, type Graph } from "./graph";
import { GraphRelevance } from "./graphRelevance";

function part(json: string): Part {
  const wrapped = `{"subject":"Matemática A","parts":[${json}]}`;
  return decodeProblemSolution(JSON.parse(wrapped)).parts[0]!;
}

const y = (graph: Graph, x: number) => Graphs.y(graph, x);

describe("FunctionPlot", () => {
  test("plots a function the solution does not draw", () => {
    const question = "Estude a função f definida por f(x) = x^2 - 4*x + 1.";
    const graph = FunctionPlot.graph(
      question,
      "Matemática A",
      part(`{"label":"1.","asks":"Estude a função.","answer":{"text":"mínimo"}}`),
    );
    expect(graph?.expression).toBe("x^2-4*x+1");
    expect(graph && Graphs.isDrawable(graph)).toBe(true);
  });

  test("uses the interval the question gives", () => {
    const question = "Considere a função f(x) = x^2 no intervalo [0, 4].";
    const graph = FunctionPlot.graph(
      question,
      "Matemática A",
      part(`{"label":"1.","asks":"Esboce.","answer":{"text":""}}`),
    );
    expect(graph?.xMin ?? 1).toBeLessThan(0);
    expect(graph?.xMax ?? 0).toBeGreaterThan(4);
    expect(graph?.xMax ?? 0).toBeLessThan(6);
  });

  test("the variable row of a sign table is not a curve", () => {
    const table = `{"variable":"x","points":[{"text":"0","value":0},{"text":"3","value":3}],
     "rows":[{"name":"x","expression":"x","cells":["","",""]},
             {"name":"f'(x)","expression":"x*(exp(3-x)-1)","cells":["","",""]}]}`;
    const graph = FunctionPlot.graph(
      "Estude a monotonia.",
      "Matemática A",
      part(`{"label":"2.2","asks":"Monotonia.","answer":{"text":"decrescente"},"signTable":${table}}`),
    );
    expect(graph).toBeNull();
  });

  test("plots from the sign table when the line is not readable", () => {
    const table = `{"variable":"x","points":[{"text":"0","value":0},{"text":"4","value":4}],
     "rows":[{"name":"f(x)","expression":"x^2 - 4*x","cells":["","",""]}]}`;
    const graph = FunctionPlot.graph(
      "Estude a monotonia da função f.",
      "Matemática A",
      part(`{"label":"2.","asks":"Estude a função.","answer":{"text":"decrescente"},"signTable":${table}}`),
    );
    expect(graph?.expression).toBe("x^2 - 4*x");
  });

  test("skips continuity because the branches are already drawn", () => {
    const graph = FunctionPlot.graph(
      "Estude a função f(x) = x.",
      "Matemática A",
      part(
        `{"label":"1.","asks":"Continuidade.","answer":{"text":"contínua"},"continuity":{"point":1,"left":"x","right":"x+1"}}`,
      ),
    );
    expect(graph).toBeNull();
  });

  test("physics is not a maths function graph", () => {
    const graph = FunctionPlot.graph(
      "A função x(t) = 2*t descreve o movimento.",
      "Física e Química A",
      part(`{"label":"1.","asks":"Determine x(2).","answer":{"text":"4","expression":"4"}}`),
    );
    expect(graph).toBeNull();
  });

  test("a Bolzano solution plots the interval and the crossing", () => {
    const cards = String.raw`{"label":"2.3","asks":"[-1, 0]","answer":{"text":""},"cards":[
    {"title":"h","note":"","latex":"h(x)=4-e^{3(x+1)}+\\frac{x}{2}"},
    {"title":"left","note":"","latex":"h(-1)=\\frac{5}{2}>0"},
    {"title":"right","note":"","latex":"h(0)=4-e^{3}<0"},
    {"title":"root","note":"","latex":"h(c)=0"}]}`;
    const graph = FunctionPlot.graph("2.3.", "Mathematik", part(cards))!;
    expect(graph).not.toBeNull();
    expect(Graphs.isDrawable(graph)).toBe(true);
    expect(graph.variable).toBe("x");
    expect(graph.expression).toContain("exp");
    expect(graph.xMin).toBeLessThanOrEqual(-1);
    expect(graph.xMax).toBeGreaterThanOrEqual(0);
    expect(graph.curveStep).toBe(1);
    const left = graph.marks.find((mark) => mark.role === "value" && Math.abs(mark.x + 1) < 1e-6)!;
    const right = graph.marks.find((mark) => mark.role === "value" && Math.abs(mark.x) < 1e-6)!;
    expect(left.label).toContain("5/2");
    expect(left.label).toContain(">");
    expect(Math.abs(left.y - 2.5)).toBeLessThan(1e-6);
    expect(left.step).toBe(2);
    expect(right.label).toContain("e³");
    expect(right.label).not.toContain("^");
    expect(right.label).toContain("<");
    expect(right.y).toBeLessThan(0);
    expect(right.step).toBe(3);
    const crossing = graph.marks.find((mark) => mark.role === "crossing")!;
    expect(crossing.y).toBe(0);
    expect(crossing.x > -1 && crossing.x < 0).toBe(true);
    expect(crossing.step).toBe(4);
  });

  test("the word Bolzano alone does not plot", () => {
    const graph = FunctionPlot.graph(
      "Use o teorema de Bolzano.",
      "Matemática A",
      part(`{"label":"1.","asks":"Justifique.","answer":{"text":"pelo teorema de Bolzano"}}`),
    );
    expect(graph).toBeNull();
  });

  test("drops a curve that does not plot", () => {
    expect(FunctionPlot.make("not a function", "x", -1, 1)).toBeNull();
    const line = FunctionPlot.make("2*x+1", "x", -2, 2);
    expect(line && Graphs.isDrawable(line)).toBe(true);
  });
});

describe("GraphRelevance", () => {
  function expectNeighbourhood(graph: Graph, falls: boolean) {
    const c = graph.marks.find((mark) => mark.label === "c")!;
    expect(c.role).toBe("crossing");
    expect(c.y).toBe(0);
    expect(c.x > graph.xMin && c.x < graph.xMax).toBe(true);
    const left = graph.marks.find((mark) => mark.label === "c − δ")!;
    const right = graph.marks.find((mark) => mark.label === "c + δ")!;
    expect(left.x < c.x && c.x < right.x).toBe(true);
    expect(left.x > graph.xMin && right.x < graph.xMax).toBe(true);
    expect(Math.abs(y(graph, left.x) - left.y)).toBeLessThan(1e-9);
    expect(Math.abs(y(graph, right.x) - right.y)).toBeLessThan(1e-9);
    if (falls) expect(y(graph, c.x - 0.1)).toBeGreaterThan(y(graph, c.x + 0.1));
    else expect(y(graph, c.x - 0.1)).toBeLessThan(y(graph, c.x + 0.1));
    expect(GraphRelevance.agrees(graph, falls)).toBe(true);
    expect(GraphRelevance.agrees(graph, !falls)).toBe(false);
  }

  test("an induction proof is decoration", () => {
    expect(
      GraphRelevance.isDecorative(
        String.raw`1.2. Prove, por indução matemática, que \sum_{k=1}^{n} k = \frac{n(n+1)}{2} para todo o n \in \mathbb{N}.`,
      ),
    ).toBe(true);
    expect(
      GraphRelevance.isDecorative("2.1. Sabe-se que g'(c) < 0. Justifique que g é decrescente numa vizinhança de c."),
    ).toBe(false);
  });

  test("a positive derivative at c rises, a negative one falls", () => {
    const text =
      "4. Mostre que se g' é contínua em c e g'(c) > 0, então g é estritamente crescente numa vizinhança V_δ(c).";
    expectNeighbourhood(GraphRelevance.sketch(text)!, false);
    expectNeighbourhood(GraphRelevance.sketch(text.replace("> 0", "< 0"))!, true);
  });

  test("the sign decides the direction", () => {
    const rises = GraphRelevance.sketch(String.raw`Como f^{\prime}(x) > 0 em ]0, 2[, f é crescente.`)!;
    expect(rises.yLabel).toBe("f(x)");
    expect(y(rises, rises.xMax)).toBeGreaterThan(y(rises, rises.xMin));
    expect(rises.marks).toEqual([]);
    expect(GraphRelevance.statedFall("g'(c) < 0")).toBe(true);
    expect(GraphRelevance.statedFall(String.raw`f^{\prime}(x) > 0`)).toBe(false);
    expect(GraphRelevance.statedFall("O resultado é 3.")).toBeNull();
    expect(GraphRelevance.sketch("f''(x) > 0")).toBeNull();
    expect(GraphRelevance.sketch("O resultado é 3.")).toBeNull();
  });

  test("a limit gets its shape", () => {
    const level = GraphRelevance.sketch(String.raw`\lim_{x \to +\infty} h(x) = 2, logo y = 2 é assíntota.`)!;
    expect(level.yLabel).toBe("h(x)");
    expect(Math.abs(y(level, level.xMax) - 2)).toBeLessThan(0.1);
    expect(level.marks[0]?.label).toBe("y = 2");
    const wall = GraphRelevance.sketch("lim x→0 f(x) = +∞")!;
    expect(y(wall, 0.1)).toBeGreaterThan(y(wall, 2));
  });

  test("a derivative or limit in a sum is not decoration", () => {
    expect(GraphRelevance.isDecorative(String.raw`\lim_{n \to \infty} \sum_{k=1}^{n} 1/k^2, n \in \mathbb{N}`)).toBe(
      false,
    );
    expect(GraphRelevance.isDecorative("Estude a monotonia da função f(x) = x^2.")).toBe(false);
  });
});
