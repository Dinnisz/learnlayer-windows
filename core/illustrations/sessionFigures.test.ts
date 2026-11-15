// Port of LearnLayerTests/FunctionPlotTests.swift (`GraphRelevanceTests`, the cases that need a session) @ ref
// 2026-11-04, and the figure the stage puts beside the steps.

import { describe, expect, test } from "vitest";
import type { SolutionProvider } from "../problems/solutionProvider";
import { decodeProblemSolution } from "../problems/problemSolution";
import { QuestionSession } from "../problems/questionSession";
import type { ExamQuestion } from "../problems/questionDetector";
import { Graphs, type Graph } from "./graph";
import { GraphRelevance } from "./graphRelevance";

/** Only what showing a written-out solution asks of the solver: the name of the first model. */
const fakeProvider = {
  firstChoice: () => ({ model: "anthropic/claude-haiku-5.5", reasoningBudget: null }),
} as unknown as SolutionProvider;

function session(label: string, text: string, json: string): QuestionSession {
  const zero = { x: 0, y: 0, width: 0, height: 0 };
  const question: ExamQuestion = {
    label,
    group: "1",
    pageIndex: 0,
    labelBounds: zero,
    bounds: zero,
    text,
    groupText: text,
    groupLabels: [label],
    groupBounds: null,
    startsOnPreviousPage: false,
    statementBounds: null,
    statementPageIndex: null,
  };
  const opened = new QuestionSession(
    { question },
    { provider: fakeProvider, config: () => "cheapFirst", language: () => "Portuguese (Portugal)" },
  );
  opened.showForTesting(decodeProblemSolution(JSON.parse(json)));
  return opened;
}

const y = (graph: Graph, x: number) => Graphs.y(graph, x);

function expectNeighbourhood(graph: Graph, falls: boolean) {
  const c = graph.marks.find((mark) => mark.label === "c")!;
  expect(c.role).toBe("crossing");
  expect(c.y).toBe(0);
  const left = graph.marks.find((mark) => mark.label === "c − δ")!;
  const right = graph.marks.find((mark) => mark.label === "c + δ")!;
  expect(left.x < c.x && c.x < right.x).toBe(true);
  if (falls) expect(y(graph, c.x - 0.1)).toBeGreaterThan(y(graph, c.x + 0.1));
  else expect(y(graph, c.x - 0.1)).toBeLessThan(y(graph, c.x + 0.1));
  expect(GraphRelevance.agrees(graph, falls)).toBe(true);
}

describe("GraphRelevance in a session", () => {
  test("an induction proof shows no curve", () => {
    const text = String.raw`1.2. Prove, por indução matemática, que \sum_{k=1}^{n} k = \frac{n(n+1)}{2} para todo o n \in \mathbb{N}.`;
    const json = String.raw`{"subject":"Matemática A","graph":{"xLabel":"n","yLabel":"S(n)","variable":"n","expression":"n*(n+1)/2","xMin":0,"xMax":10,"showsCar":false},
     "parts":[{"label":"1.2","asks":"Prove por indução.","hint":"","answer":{"text":"Provado por indução.","expression":"n*(n+1)/2"},"steps":[],"uses":[],
      "cards":[{"title":"Base","note":"n = 1","latex":"S(1)=1"},{"title":"Hereditariedade","note":"","latex":"S(n+1)=S(n)+(n+1)"}]}]}`;
    const opened = session("1.2", text, json);
    expect(opened.part?.label).toBe("1.2");
    expect(opened.graph).toBeNull();
    expect(opened.hasGraph).toBe(false);
  });

  test("a derivative sign with no formula gets a sketch", () => {
    const text = "2.1. Sabe-se que g'(c) < 0. Justifique que g é decrescente numa vizinhança de c.";
    const json = `{"subject":"Matemática A","parts":[{"label":"2.1","asks":"Justifique que g é decrescente perto de c.","hint":"","answer":{"text":"g é decrescente numa vizinhança de c."},"steps":[],"uses":[],
      "cards":[{"title":"Sinal da derivada","note":"Como g'(c) < 0, g decresce perto de c.","latex":"g'(c)<0"}]}]}`;
    const opened = session("2.1", text, json);
    const graph = opened.graph!;
    expect(graph).not.toBeNull();
    expect(opened.hasGraph).toBe(true);
    expect(graph.yLabel).toBe("g(x)");
    const c = graph.marks.find((mark) => mark.label === "c")!;
    expect(y(graph, graph.xMin)).toBeGreaterThan(y(graph, c.x));
    expect(y(graph, c.x)).toBeGreaterThan(y(graph, graph.xMax));
    expect(graph.marks.map((mark) => mark.label)).toEqual(["c − δ", "c", "c + δ"]);
  });

  test("a model curve that contradicts the sign gives way to the sketch", () => {
    const text =
      "4. Mostre que se g' é contínua em c e g'(c) < 0, então g é estritamente decrescente numa vizinhança V_δ(c).";
    const json = `{"subject":"Matemática A","graph":{"xLabel":"x","yLabel":"g(x)","variable":"x","expression":"2 - 2/(1 + x^2)","xMin":0,"xMax":6,"showsCar":false},
     "parts":[{"label":"4","asks":"Mostre que g é estritamente decrescente perto de c.","hint":"","answer":{"text":"Como g'(c) < 0 e g' é contínua, g' < 0 em V_δ(c), logo g é estritamente decrescente aí."},"steps":[],"uses":[],
      "cards":[{"title":"Sinal da derivada","note":"g'(c) < 0 e g' contínua: g' < 0 numa vizinhança de c.","latex":"g'(c)<0"}]}]}`;
    const graph = session("4", text, json).graph!;
    expect(graph.expression).not.toBe("2 - 2/(1 + x^2)");
    expect(graph.yLabel).toBe("g(x)");
    expectNeighbourhood(graph, true);
  });

  test("a positive derivative at c rises", () => {
    const text =
      "4. Mostre que se g' é contínua em c e g'(c) > 0, então g é estritamente crescente numa vizinhança V_δ(c).";
    const json = `{"subject":"Matemática A","graph":{"xLabel":"x","yLabel":"g(x)","variable":"x","expression":"2/(1 + x^2)","xMin":0,"xMax":6,"showsCar":false},
     "parts":[{"label":"4","asks":"Mostre que g é estritamente crescente perto de c.","hint":"","answer":{"text":"Como g'(c) > 0, g é estritamente crescente numa vizinhança de c."},"steps":[],"uses":[],
      "cards":[{"title":"Sinal da derivada","note":"g'(c) > 0.","latex":"g'(c)>0"}]}]}`;
    const graph = session("4", text, json).graph!;
    expect(graph.expression).not.toBe("2/(1 + x^2)");
    expectNeighbourhood(graph, false);
  });

  test("a model curve that agrees with the sign is kept", () => {
    const text = "4. Sabe-se que g'(c) < 0. Mostre que g é decrescente perto de c.";
    const json = `{"subject":"Matemática A","graph":{"xLabel":"x","yLabel":"g(x)","variable":"x","expression":"4 - x","xMin":0,"xMax":4,"showsCar":false},
     "parts":[{"label":"4","asks":"Mostre que g é decrescente perto de c.","hint":"","answer":{"text":"g é decrescente perto de c."},"steps":[],"uses":[],
      "cards":[{"title":"Sinal da derivada","note":"g'(c) < 0.","latex":"g'(c)<0"}]}]}`;
    expect(session("4", text, json).graph?.expression).toBe("4 - x");
  });
});

describe("The figure beside the steps", () => {
  test("a sign table that checks out is the figure, and no curve is drawn beside it", () => {
    const table = `{"variable":"x","points":[{"text":"−∞"},{"text":"0","value":0},{"text":"+∞"}],
      "rows":[{"name":"f'(x)","expression":"2*x","cells":["","−","0","+",""]}],
      "variation":{"name":"f","cells":["","↘","0","↗",""]}}`;
    const json = `{"subject":"Matemática A","parts":[{"label":"1","asks":"Monotonia de f(x) = x^2.","hint":"","answer":{"text":"mínimo em 0"},"steps":[],"uses":[],"signTable":${table}}]}`;
    const opened = session("1", "1. Estude a monotonia de f(x) = x^2.", json);
    expect(opened.solutionFigure?.kind).toBe("table");
    expect(opened.graph).toBeNull();
  });

  test("a Bolzano solution draws g from its closed form, with no model call", () => {
    const json = String.raw`{"subject":"Matemática A","parts":[{"label":"2.3","topic":"Teorema de Bolzano","asks":"Mostre que existe c em ]−1, 0[.","hint":"","steps":[],"uses":[],
      "answer":{"text":"g tem um zero em ]−1, 0[."},
      "cards":[{"title":"A função","note":"","latex":"g(x)=4-e^{3-x}(x+1)-\\frac{x^2}{2}+x"},
               {"title":"Em −1","note":"","latex":"g(-1)=\\frac{5}{2}>0"},
               {"title":"Em 0","note":"","latex":"g(0)=4-e^{3}<0"}]}]}`;
    const opened = session("2.3", "2.3. Mostre que existe um zero no intervalo ]−1, 0[.", json);
    const figure = opened.solutionFigure;
    expect(figure?.kind).toBe("drawing");
    // The curve is the figure: it is not drawn a second time beside it.
    expect(opened.sideGraph).toBeNull();
  });

  test("a complex figure whose numbers don't check out is not drawn", () => {
    const good = `{"subject":"Matemática A","parts":[{"label":"1","figureTopic":"complex","asks":"Represente z².","hint":"","answer":{"text":"z² = 2i"},"steps":[],"uses":[],
      "complex":{"name":"z","modulus":1.4142135623730951,"argument":0.7853981633974483,"power":2,"resultModulus":2,"resultArgument":1.5707963267948966}}]}`;
    expect(session("1", "1. Considere o número complexo z = 1 + i.", good).solutionFigure?.kind).toBe("drawing");
    const wrong = good.replace(`"resultModulus":2`, `"resultModulus":3`);
    expect(session("1", "1. Considere o número complexo z = 1 + i.", wrong).solutionFigure).toBeNull();
  });
});
