// A page of the 2026 Matemática A exam (EX-MatA635, page 9, at 1.5×) as Windows' OCR reads it: the denominator of
// "θ ∈ ]0, π/6[" on item 10's first line comes out as a line "6" of its own. A number alone is what a page number
// looks like, but a page's footer has no text under it: this "6" must not end item 10 on its first line.

import { describe, expect, it } from "vitest";
import { QuestionLocator, type GreyImage, type LocatorLine } from "./questionRegion";

const width = 893;
const height = 1263;

const lines: LocatorLine[] = [
  ["Considere, em C , conjunto dos números complexos, o número z — elo , com", 115, 112, 583, 20],
  ["*", 59, 117, 12, 12],
  ["10.", 86, 118, 19, 11],
  ["6", 706, 126, 8, 13],
  [
    "Na Figura 5, estão representados, no primeiro quadrante do plano complexo, o ponto P , afixo de z , e",
    116,
    150,
    691,
    15,
  ],
  ["outros quatro pontos, A, B, C e D.", 115, 171, 254, 15],
  ["Im(z)", 300, 212, 38, 16],
  ["O", 327, 413, 12, 12],
  ["Re(z)", 575, 419, 38, 16],
  ["Figura 5", 437, 459, 49, 13],
  ["Qual desses quatro pontos pode ser o afixo do número complexo z2 ?", 115, 502, 468, 18],
  ["(A) Ponto A", 115, 548, 86, 15],
  ["(B) Ponto B", 115, 579, 87, 15],
  ["(C) Ponto C", 115, 611, 89, 15],
  ["(D) Ponto D", 115, 642, 89, 15],
  ["11. Resolva este item sem recorrer à calculadora.", 86, 727, 333, 15],
  ["Considere, em C , conjunto dos números complexos, o número", 115, 770, 430, 15],
  ["Prova 635/1.a F. • Página 9/ 13", 620, 1189, 188, 13],
].map(([text, x, y, w, h]) => ({
  text: text as string,
  rect: { x: x as number, y: y as number, width: w as number, height: h as number },
}));

/** White, with each line's box inked, and the axes of Figure 5. */
function page(): GreyImage {
  const pixels = new Uint8Array(width * height).fill(255);
  const fill = (x: number, y: number, w: number, h: number) => {
    for (let row = Math.max(0, Math.round(y)); row < Math.min(height, Math.round(y + h)); row += 1)
      for (let column = Math.max(0, Math.round(x)); column < Math.min(width, Math.round(x + w)); column += 1)
        pixels[row * width + column] = 20;
  };
  for (const line of lines) fill(line.rect.x, line.rect.y + 3, line.rect.width, line.rect.height - 6);
  fill(343, 210, 2, 230);
  fill(310, 407, 310, 2);
  return { width, height, pixels };
}

describe("a number alone on a question's first line", () => {
  it("is not the page's footer: the item runs on to its options", () => {
    const region = QuestionLocator.locate({
      image: page(),
      window: { x: 0, y: 0, width, height },
      point: { x: 400, y: 124 },
      lines,
    })!;
    expect(region.label).toBe("10.");
    expect(region.frame.y).toBeLessThanOrEqual(112);
    // Down to "(D) Ponto D", short of item 11.
    expect(region.frame.y + region.frame.height).toBeGreaterThanOrEqual(655);
    expect(region.frame.y + region.frame.height).toBeLessThan(727);
    expect(region.text).toContain("(D) Ponto D");
  });
});
