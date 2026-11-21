// A 2026 exam page read by Windows' OCR (EX-FQA715, page 4, at 1.5×): the item "* 1.1." sits in a grey pill, which the
// engine drops with the pill unless the pill is made white first (`ocr::without_fills` in the Rust side). These are the
// lines it reads each way; a click on item 1.1 must take item 1.1, not item 1's stem with it.

import { describe, expect, it } from "vitest";
import { QuestionBand, type BandLine } from "./questionBand";

const line = (text: string, x: number, y: number, width: number): BandLine => ({
  text,
  rect: { x, y, width, height: 18 },
});

const before: BandLine[] = [
  line(
    "1. No podcast de Carlos Fiolhais e David Marçal, Mais lento do que a luz, publicado em 11 de maio de 2023,",
    86,
    63,
    721,
  ),
  line(
    "a astrobióloga Zita Martins refere que um dos requisitos para a procura de vida fora da Terra é a presença",
    107,
    84,
    700,
  ),
  line(
    "dos elementos químicos essenciais para a existência de vida: carbono, hidrogénio e oxigénio, entre outros.",
    106,
    106,
    701,
  ),
  line("O átomo de carbono pode ser identificado, em amostras gasosas, por espectroscopia.", 141, 168, 572),
  line("Considere o espectro atómico do carbono, na região do visível, apresentado na Figura 1.", 141, 200, 590),
  line("Figura 1", 450, 392, 47),
  line("O espectro apresentado na Figura 1 é de", 141, 433, 273),
  line("(A) emissão e contínuo.", 141, 475, 162),
  line("(C) emissão e descontinuo.", 141, 506, 186),
  line("(B) absorção e contínuo.", 426, 475, 167),
  line("(D) absorção e descontínuo.", 426, 506, 192),
  line(
    "1.2. A Figura 2 apresenta valores típicos das percentagens em massa dos elementos químicos mais",
    107,
    570,
    701,
  ),
  line("abundantes no corpo humano.", 141, 591, 202),
  line("Prova 715.V1/1.a F.", 86, 1189, 114),
  line("• Página 4/ 15", 206, 1189, 86),
];

const after = before.map((found) =>
  found.text.startsWith("O átomo")
    ? line("* 1.1. O átomo de carbono pode ser identificado, em amostras gasosas, por espectroscopia.", 80, 168, 633)
    : found,
);

/** A click on the words of item 1.1. */
const click = { x: 300, y: 205 };

describe("an item number in a grey pill", () => {
  it("is a label once the pill is read, so a click takes that item alone, with item 1's stem as context", () => {
    const band = QuestionBand.select(after, click)!;
    expect(band.label).toBe("1.");
    expect(band.part).toBe("1.1");
    expect(band.top).toBe(168);
    expect(band.end).toBe(570);
    expect(band.stemText).toContain("No podcast");
  });

  it("without it, the click is taken for item 1's stem, with item 1.1 run into it", () => {
    const band = QuestionBand.select(before, click)!;
    expect(band.part).toBeNull();
    expect(band.top).toBe(63);
    expect(band.text).toContain("O átomo de carbono");
  });
});
