// Port of LearnLayerTests/PDFPlacementTests.swift @ 5701363: a line read on the screen is matched to the page's line
// it is, to place the page under the window; and a click on the right-hand page of two shown side by side.
import { describe, expect, it } from "vitest";
import { pageFromLines, type PageText } from "../pdf/page";
import { boundedSimilarity, LineKey, lineMatch, PDFQuestionReading, similarity } from "./pdfQuestionRead";
import type { LocatorLine } from "./questionRegion";

/** MAP2 23/24, page 4, folded as the placement folds them: four lines, two questions. */
const page = [
  "520sejaa2m33rtalquepa232escrevaa1comocombinaaolineardas",
  "matrizesa2aeiecalculeopolinumiocaracteristicodea1",
  "630sejaa2mnnrtalqueartra2tra3etra3tra4mostreque",
];

describe("PDF placement", () => {
  it("matches whole lines as before", () => {
    expect(lineMatch("520sejaem3x3rtalquepai2131escrevaaicomocombin0linedas", page)?.index).toBe(0);
    expect(lineMatch("matrizesaaeiecalculeopolinomiocaracterfsticodea", page)?.edge).toBe("whole");
  });

  // Q6's line read in two pieces: its start and its end, each a third anchor for the sparse page.
  it("matches pieces of a line to its start and end", () => {
    const start = lineMatch("630sejaaemrtalquetacrtratra3", page);
    expect(start).toEqual({ index: 2, edge: "start" });
    const end = lineMatch("etra3tramostreque", page);
    expect(end).toEqual({ index: 2, edge: "end" });
  });

  it("takes a piece of no line, or of two alike, as no anchor", () => {
    expect(lineMatch("considereafuncaogdefinida", page)).toBeNull();
    const twice = ["abcdefghijklmnopqrstuvwxyz0123", "abcdefghijklmnopqrstuvwxyz4567"];
    expect(lineMatch("abcdefghijklmnop", twice)).toBeNull();
  });

  // The bounded score agrees with the full one wherever it matters (>= 0.64), and is 0 below.
  it("agrees with the full similarity where it matters", () => {
    const pairs: [string, string][] = [
      ["520sejaem3x3rtalquepai2131escrevaaicomocombin0linedas", page[0]!],
      ["matrizesaaeiecalculeopolinomiocaracterfsticodea", page[1]!],
      ["considereafuncaogdefinidaporfxigual", page[2]!],
      ["abcdefghijklmnopqrstuvwxyz0123", "abcdefghijklmnopqrstuvwxyz4567"],
    ];
    for (const [a, b] of pairs) {
      const key = new LineKey(a);
      const other = new LineKey(b);
      const full = similarity(a, b);
      const bounded = boundedSimilarity(key.codes, other.codes, key.counts, other.counts);
      if (full >= 0.64) expect(Math.abs(bounded - full)).toBeLessThan(1e-9);
      else expect(bounded).toBe(0);
    }
  });
});

// Two pages shown side by side (a spread): most lines read are on the left page, the click is on the right one.
const left = [
  "Questao 1 - Considere a funcao f definida em R por f(x) = x ao quadrado",
  "menos quatro vezes x mais tres. Determine os zeros da funcao f.",
  "Questao 2 - Uma caixa contem doze bolas numeradas de um a doze",
  "Retiram-se ao acaso duas bolas da caixa, sem reposicao.",
  "Qual e a probabilidade de a soma dos numeros ser par?",
  "Questao 3 - Na figura esta representado um cubo de aresta dois",
  "Determine o volume da piramide inscrita no cubo indicado.",
];
const right = [
  "Questao 4 - Resolva a inequacao logaritmica seguinte em R",
  "apresentando o conjunto solucao na forma de intervalo.",
  "Questao 5 - Seja g a funcao definida por g(x) = e elevado a x",
  "Estude a funcao g quanto a monotonia e aos extremos relativos.",
];

function spread(): PageText[] {
  const pages: PageText[] = [];
  [left, right].forEach((texts, index) => {
    const lines = texts.map((text, row) => ({ text, x: 40, baseline: 540 - row * 40, fontSize: 11 }));
    pages.push(pageFromLines(lines, { index, mediaBox: { x: 0, y: 0, width: 470, height: 600 }, pages: () => pages }));
  });
  return pages;
}

/** A page's lines as read on the screen, the page shown at `zoom` with its top left at `origin`. */
const read = (texts: readonly string[], zoom: number, origin: { x: number; y: number }): LocatorLine[] =>
  texts.map((text, row) => ({
    text,
    rect: {
      x: origin.x + 40 * zoom,
      y: origin.y + (600 - (540 - row * 40) - 11) * zoom,
      width: Array.from(text).length * 5 * zoom,
      height: 11 * zoom,
    },
  }));

describe("a spread", () => {
  it("reads the question under a click on the right-hand page", () => {
    const zoom = 0.9;
    const leftOrigin = { x: 80, y: 60 };
    const rightOrigin = { x: 80 + 470 * zoom + 12, y: 60 };
    const lines = [...read(left, zoom, leftOrigin), ...read(right, zoom, rightOrigin)];
    // On "Questao 5", the third line of the right-hand page.
    const point = { x: rightOrigin.x + 120 * zoom, y: rightOrigin.y + (600 - 460 - 4) * zoom };
    const found = PDFQuestionReading.read(lines, point, spread());
    expect(found?.page.index).toBe(1);
    expect(found?.exam.label).toBe("5");
  });

  it("still reads the left-hand page's questions", () => {
    const zoom = 0.9;
    const leftOrigin = { x: 80, y: 60 };
    const rightOrigin = { x: 80 + 470 * zoom + 12, y: 60 };
    const lines = [...read(left, zoom, leftOrigin), ...read(right, zoom, rightOrigin)];
    const point = { x: leftOrigin.x + 120 * zoom, y: leftOrigin.y + (600 - 460 - 4) * zoom };
    const found = PDFQuestionReading.read(lines, point, spread());
    expect(found?.page.index).toBe(0);
    expect(found?.exam.label).toBe("2");
  });
});
