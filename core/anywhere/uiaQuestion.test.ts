// AccessibilityReader's choices, on what UI Automation gathers: a document's text cut at the question's labels, and
// a web page's question laid out as siblings widened from its number to the next one.

import { describe, expect, it } from "vitest";
import { questionInBlock, questionInLongText, screenQuestionFromUIA, type UIANode } from "./uiaQuestion";

const frame = { x: 0, y: 0, width: 600, height: 400 };
const node = (text: string, y: number, kind: UIANode["kind"] = "text", hasImage = false): UIANode => ({
  text,
  frame: { x: 40, y, width: 500, height: 20 },
  kind,
  hasImage,
});

describe("UI Automation's question", () => {
  const page = [
    "Ficha de trabalho de Física",
    "1. Um carro parte do repouso e atinge 20 m/s em 5 s. Qual é a sua aceleração?",
    "2. Uma bola é lançada na vertical com 12 m/s. Que altura máxima atinge?",
    "a) Considere g = 10 m/s².",
    "3. Indique a energia cinética de um corpo de 2 kg a 3 m/s.",
  ].join("\n");

  it("cuts a document's text at the labels around the point, keeping a part with its statement", () => {
    const index = page.indexOf("Considere");
    const found = questionInLongText({ text: page + " ".repeat(100), index, frame })!;
    expect(found.text.startsWith("2. Uma bola")).toBe(true);
    expect(found.text).toContain("a) Considere");
    expect(found.text).not.toContain("3. Indique");
    expect(found.focus).toContain("Considere g");
  });

  it("takes the paragraph and the one before it when there is no label", () => {
    const prose = "Primeiro parágrafo sem número.\n" + "Segundo parágrafo, onde está o clique. ".repeat(8);
    const found = questionInLongText({ text: prose, index: prose.length - 5, frame })!;
    expect(found.text.startsWith("Primeiro parágrafo")).toBe(true);
  });

  it("widens a web page's block from the question's number to the next one, leaving links out", () => {
    const nodes = [
      node("Questão 1", 0),
      node("Calcule o limite da sucessão u_n = (n+1)/n quando n tende para infinito.", 30),
      node("(A) 0", 60),
      node("(B) 1", 90),
      node("Ver Resposta", 120, "link"),
      node("", 150, "image", true),
      node("Questão 2", 300),
      node("Outra pergunta", 330),
    ];
    const found = questionInBlock({ index: 1, nodes })!;
    expect(found.text.split("\n")[0]).toBe("Questão 1");
    expect(found.text).toContain("(B) 1");
    expect(found.text).not.toContain("Ver Resposta");
    expect(found.text).not.toContain("Questão 2");
    expect(found.hasImage).toBe(true);
  });

  it("takes only the short lines after a block with no number, never the page", () => {
    const nodes = [
      node("Qual é a capital de Portugal, segundo o texto?", 0),
      node("A. Lisboa", 30),
      node("B. Porto", 60),
      node("Um parágrafo seguinte muito longo que já não pertence à pergunta, " + "com muito texto ".repeat(10), 90),
    ];
    const found = questionInBlock({ index: 0, nodes })!;
    expect(found.text).toContain("B. Porto");
    expect(found.text).not.toContain("parágrafo seguinte");
  });

  it("returns the question as the Mac's reader does, with how it was read", () => {
    const question = screenQuestionFromUIA(
      { longText: null, block: { index: 0, nodes: [node("Pergunta 4 – Calcule a área do triângulo.", 0)] }, focus: "" },
      "chrome.exe",
    )!;
    expect(question.method).toBe("block");
    expect(question.appName).toBe("chrome.exe");
    expect(screenQuestionFromUIA({ longText: null, block: null, focus: "" }, "x")).toBeNull();
  });
});
