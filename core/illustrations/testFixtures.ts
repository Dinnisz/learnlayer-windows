// Scenes shared by the figure tests (from LearnLayerTests/LabelPlacerTests.swift and IllustrationRendererTests.swift).

import { expect } from "vitest";
import { decodeProblemSolution } from "../problems/problemSolution";
import { FunctionGraph } from "./functionGraph";
import type { Illustration } from "./illustration";

export const bolzano = String.raw`
{"subject": "Matemática A", "drawing": false, "needsFigure": false, "checks": [], "parts": [{
  "label": "2.3", "topic": "Teorema de Bolzano", "asks": "Mostrar que existe um ponto do gráfico de f, com abcissa em ]−1, 0[, cuja ordenada é simétrica da abcissa.",
  "hint": "Escreva a condição como um zero de uma função.", "steps": [], "uses": [],
  "answer": {"text": "Pelo teorema de Bolzano, g(x) = f(x) + x tem um zero em ]−1, 0[, logo f(x) = −x para algum x desse intervalo.", "expression": null},
  "answerLatex": "\\exists\\, c\\in\\,]-1,0[:\\ f(c)=-c",
  "cards": [
    {"title": "A condição", "note": "A ordenada ser simétrica da abcissa significa f(x) = −x. Define-se g(x) = f(x) + x e procura-se um zero de g em ]−1, 0[.", "latex": "g(x)=4-e^{3-x}(x+1)-\\frac{x^2}{2}+x"},
    {"title": "Continuidade", "note": "g é contínua em [−1, 0], por ser a soma de funções contínuas.", "latex": "g(-1)=\\frac{5}{2}>0"},
    {"title": "Sinal em 0", "note": "Usa-se e³ > 4 (e³ ≈ 20,09), pois e > 2.", "latex": "g(0)=4-e^{3}<0"},
    {"title": "Conclusão", "note": "Como g(0) < 0 < g(−1), o teorema de Bolzano garante um zero de g em ]−1, 0[.", "latex": "g(c)=0"}
  ]}]}`;

export const fitJSON = `{"kind": "series", "points": [{"x": 0.10, "y": 0.47}, {"x": 0.13, "y": 0.59}, {"x": 0.18, "y": 0.77}, {"x": 0.25, "y": 1.16}, {"x": 0.31, "y": 1.40}],
 "xName": "h/1,50", "yName": "d", "yUnit": "m", "connect": false, "fit": "linear"}`;

export const bolzanoQuestion =
  "2.3. Mostre que existe, pelo menos, um ponto do gráfico da função f, de abcissa pertencente ao intervalo ]−1, 0[, cuja ordenada é simétrica da abcissa.";

export const continuityCase = {
  point: 3,
  pointText: "3",
  left: "4 - exp(3-x)*(x+1) - x^2/2",
  right: "(exp(x-3)-1)/(x^2-9)",
  value: -4.5,
  closedSide: "left",
};

export function bolzanoScene(): Illustration {
  const solution = decodeProblemSolution(JSON.parse(bolzano));
  const scene = FunctionGraph.illustration(bolzanoQuestion, solution.parts[0]!, null, "Portuguese (Portugal)");
  expect(scene).not.toBeNull();
  return scene!;
}
