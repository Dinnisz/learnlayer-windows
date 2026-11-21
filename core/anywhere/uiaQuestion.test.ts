// AccessibilityReader's choices, on what UI Automation gathers: a document's text cut at the question's labels, and
// a web page's question laid out as siblings widened from its number to the next one.

import { describe, expect, it } from "vitest";
import { joinedLines, questionInBlock, questionInLongText, screenQuestionFromUIA, type UIANode } from "./uiaQuestion";

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

  it("keeps a line cut around an inline element on one line, a raised piece as its exponent", () => {
    // quiz.html, Pergunta 3, as Chrome gives it: «Considere a função f(x) = x² e», the <sup>−x</sup> raised and
    // smaller, then «.» back on the line; the next paragraphs below.
    const text = joinedLines([
      { text: "Pergunta 3", frame: { x: 660, y: 498, width: 72, height: 18 } },
      { text: "Considere a função f(x) = x² e", frame: { x: 660, y: 530, width: 200, height: 18 } },
      { text: "−x", frame: { x: 860, y: 526, width: 12, height: 12 } },
      { text: ".", frame: { x: 872, y: 530, width: 4, height: 18 } },
      { text: "a) Determine os extremos de f.", frame: { x: 660, y: 560, width: 200, height: 18 } },
    ]);
    expect(text).toBe("Pergunta 3\nConsidere a função f(x) = x² e⁻ˣ.\na) Determine os extremos de f.");
  });

  it("keeps primes on their letter and spaces between the pieces of a typeset formula", () => {
    const text = joinedLines([
      { text: "y", frame: { x: 100, y: 200, width: 8, height: 18 } },
      { text: "‴", frame: { x: 108, y: 196, width: 6, height: 10 } },
      { text: "+", frame: { x: 120, y: 200, width: 10, height: 18 } },
      { text: "2y", frame: { x: 136, y: 200, width: 16, height: 18 } },
      { text: "= 0", frame: { x: 160, y: 200, width: 24, height: 18 } },
    ]);
    expect(text).toBe("y‴ + 2y = 0");
    // quiz.html, Pergunta 1: the words, then KaTeX's formula as one piece right after them (the words' box takes in
    // the space), its primes spelt apart.
    expect(
      joinedLines([
        {
          text: "Determine uma solução particular não nula da equação",
          frame: { x: 660, y: 240, width: 360, height: 20 },
        },
        { text: "y ‴ + 2 y ″ + 10 y ′ = 0", frame: { x: 1020, y: 240, width: 140, height: 20 } },
        { text: ".", frame: { x: 1160, y: 240, width: 4, height: 20 } },
      ]),
    ).toBe("Determine uma solução particular não nula da equação y‴ + 2 y″ + 10 y′ = 0.");
    // A raised piece no superscript letter can write goes after a caret.
    expect(
      joinedLines([
        { text: "e", frame: { x: 0, y: 10, width: 8, height: 18 } },
        { text: "πq", frame: { x: 8, y: 6, width: 12, height: 10 } },
      ]),
    ).toBe("e^(πq)");
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
