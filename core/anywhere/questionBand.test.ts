// QuestionCropTests.swift, case by case: each tapped exam question is cropped alone, not its neighbours, not the
// exam's header, not the footer. Plus the text-cutting cases of OptionClickFixesTests.swift.

import { describe, expect, it } from "vitest";
import { QuestionBand, type BandLine } from "./questionBand";
import { ScreenQuestions, type RegionLabel } from "./screenQuestion";

const line = (text: string, y: number, x = 60, width = 400): BandLine => ({ text, rect: { x, y, width, height: 12 } });
const maxY = (rect: { y: number; height: number }) => rect.y + rect.height;

/** Header, answer table, three questions with option lines, then the page number. */
const page = (): BandLine[] => [
  line("MAP45", 20),
  line("Duração: 0:45", 50),
  line("Número: Nome:", 80),
  line("Secção I", 110),
  line("Questão 1 2 3 4", 150),
  line("Questão 1 – O circuito da figura", 200),
  line("A. R = 6,5 kΩ", 220),
  line("D. Nenhuma", 240),
  line("Questão 2 – Considere o circuito", 300),
  line("A. RTh = 1,2 kΩ", 320),
  line("D. Nenhuma", 340),
  line("Questão 3 – Escolha a afirmação", 400),
  line("A. V5 = 0 V", 420),
  line("D. Nenhuma", 440),
  line("1", 700, 280, 8),
];

const region = (label: string, text = "", part: string | null = null): RegionLabel => ({
  label,
  part,
  hasFigure: true,
  text,
});

describe("QuestionBand", () => {
  it("selects only the question tapped", () => {
    const band = QuestionBand.select(page(), { x: 200, y: 322 })!;
    expect(band.label).toBe("Questão 2");
    expect(band.text).toContain("Considere");
    expect(band.text).toContain("RTh");
    expect(band.text).not.toContain("Questão 1");
    expect(band.text).not.toContain("Questão 3");
    expect(band.text).not.toContain("Duração");
  });

  it("stops the last question before the page number", () => {
    const band = QuestionBand.select(page(), { x: 200, y: 425 })!;
    expect(band.label).toBe("Questão 3");
    expect(band.text.endsWith("D. Nenhuma")).toBe(true);
    expect(maxY(band.frame!)).toBeLessThan(700);
  });

  it("never takes the header for a question", () => {
    expect(QuestionBand.select(page(), { x: 200, y: 52 })).toBeNull();
  });

  it("doesn't read an answer table row as a label", () => {
    expect(QuestionBand.label("Questão 1 2 3 4")).toBeNull();
    expect(QuestionBand.label("Questão 1 – O circuito")).toBe("Questão 1");
    expect(QuestionBand.label("Resposta")).toBeNull();
  });

  it("recognises options, and noisy parentheses are not labels", () => {
    expect(QuestionBand.isOption("(D)")).toBe(true);
    expect(QuestionBand.isOption("B. Rab = 21/13 kΩ")).toBe(true);
    expect(QuestionBand.isOption("1 kW")).toBe(false);
    expect(QuestionBand.label("(0) ;")).toBeNull();
    expect(QuestionBand.label("(2) x")).toBe("(2)");
  });

  it("distrusts a span of most of the page, or a sliver", () => {
    expect(QuestionBand.isSuspect(0, 760, 800, 12)).toBe(true);
    expect(QuestionBand.isSuspect(200, 210, 800, 12)).toBe(true);
    expect(QuestionBand.isSuspect(300, 360, 800, 12)).toBe(false);
  });

  it("finds the block around the click without labels or footer", () => {
    const lines = [
      line("Título da folha", 20),
      line("Considere o circuito da figura.", 200),
      line("Determine a corrente I.", 216),
      line("A. 1 A   B. 2 A", 232),
      line("Considere agora o sinal x(t).", 330),
      line("Calcule a sua energia.", 346),
      line("12", 700, 280, 10),
    ];
    expect(QuestionBand.segment(lines, { x: 200, y: 340 }, 800)).toEqual({ top: 330, bottom: 358 });
    expect(QuestionBand.segment(lines, { x: 200, y: 220 }, 800)).toEqual({ top: 200, bottom: 244 });
  });

  it("bridges a figure and keeps the options below it", () => {
    const lines = [
      line("Questão 4 – Qual a tensão em R?", 200),
      line("A. 1 V", 360),
      line("B. 2 V", 376),
      line("Questão 5 – Outra", 450),
    ];
    const figure = { x: 80, y: 220, width: 200, height: 130 };
    expect(QuestionBand.segment(lines, { x: 100, y: 205 }, 800, [figure])).toEqual({ top: 200, bottom: 388 });
    // Without bridging, the figure's gap would cut the options off.
    expect(QuestionBand.segment(lines, { x: 100, y: 205 }, 800)!.bottom).toBe(212);
  });

  it("stops at a break in a dense page", () => {
    const lines = Array.from({ length: 50 }, (_, index) => line(`linha ${index}`, 10 + index * 15)).filter(
      (item) => !(item.rect.y > 60 && item.rect.y < 90),
    );
    expect(QuestionBand.segment(lines, { x: 100, y: 30 }, 800)!.bottom).toBeLessThanOrEqual(72);
  });

  it("cuts text read as one block for the page to the question", () => {
    const whole = [
      "MAP45",
      "Duração: 0:45",
      "Secção I",
      "Questão 1 2 3 4",
      "Cotação 2 3 2 3",
      "Questão 1 – O circuito da figura",
      "A. R = 6,5 kΩ",
      "Questão 2 – Considere o circuito",
      "A. RTh = 1,2 kΩ",
      "Questão 3 – Escolha a afirmação",
      "A. V5 = 0 V",
    ].join("\n");
    const read = ScreenQuestions.make({
      text: whole,
      frame: { x: 0, y: 0, width: 0, height: 0 },
      appName: "Preview",
      hasImage: false,
      method: "block",
      focus: whole,
    });
    const cut = ScreenQuestions.trimmed(read, region("Questão 2"));
    expect(cut.text.startsWith("Questão 2")).toBe(true);
    expect(cut.text).toContain("RTh");
    expect(cut.text).not.toContain("Questão 3");
    expect(cut.text).not.toContain("Duração");
    const first = ScreenQuestions.trimmed(read, region("Questão 1"));
    expect(first.text.startsWith("Questão 1 – O circuito")).toBe(true);
    expect(first.text).not.toContain("Cotação");
  });

  describe("numbered parts", () => {
    /** A national exam's question 2 with a shared function and two parts, then question 3. */
    const parts = () => [
      line("1. Qual é o limite da sucessão", 40, 60),
      line("(A) e + 3 (B) 3e (C) e3", 90, 90),
      line("2. Seja g a função, de domínio ]-∞, π], definida por", 160, 60),
      line("g(x) = sen x se x < 0", 200, 200),
      line("Resolva os itens 2.1. e 2.2. sem recorrer à calculadora.", 260, 90),
      line("★ 2.1. Averigue se a função g é contínua em x = 0.", 330, 80),
      line("★ 2.2. Estude, no intervalo ]0, π], a função g quanto à monotonia", 400, 80),
      line("relativos.", 418, 110),
      line("3. Considere o número complexo", 480, 60),
    ];

    it("gives part 2.1 alone with the shared stem", () => {
      const band = QuestionBand.select(parts(), { x: 300, y: 335 })!;
      expect(band.part).toBe("2.1");
      expect(band.label).toBe("2.");
      expect(band.text).toContain("Averigue");
      expect(band.text).not.toContain("Estude");
      expect(band.text).not.toContain("Seja g");
      expect(band.stemText).toContain("Seja g");
      expect(band.stemText).toContain("g(x)");
      expect(band.stemText).not.toContain("Averigue");
      expect(band.end).toBe(400);
    });

    it("stops the last part at the next question and keeps its continuation line", () => {
      const band = QuestionBand.select(parts(), { x: 300, y: 405 })!;
      expect(band.part).toBe("2.2");
      expect(band.text).toContain("Estude");
      expect(band.text).toContain("relativos.");
      expect(band.text).not.toContain("Averigue");
      expect(band.text).not.toContain("Considere");
      expect(band.stemText).toContain("Seja g");
    });

    it("gives the statement alone for a tap on it", () => {
      const band = QuestionBand.select(parts(), { x: 300, y: 205 })!;
      expect(band.part).toBeNull();
      expect(band.label).toBe("2.");
      expect(band.text).toContain("Seja g");
      expect(band.text).toContain("Resolva os itens");
      expect(band.text).not.toContain("Averigue");
      expect(band.text).not.toContain("Estude");
    });

    it("needs a part's closing dot, so a measure is not one", () => {
      expect(QuestionBand.partLabel("2.5 m de comprimento", 2)).toBeNull();
      expect(QuestionBand.partLabel("2.1. Averigue", 2)).toBe("2.1");
      expect(QuestionBand.partLabel("★ 2.2) Estude", 2)).toBe("2.2");
      expect(QuestionBand.partLabel("3.1. Outra", 2)).toBeNull();
      expect(QuestionBand.partLabel("5.(AE2018)", 5)).toBe("5.(AE2018)");
    });

    it("crops two alternative items apart under their introduction", () => {
      const lines = [
        line("5.", 40, 60),
        line("Os dois itens que se apresentam a seguir são itens em alternativa.", 70, 90),
        line("5.(AE2018)", 140, 70),
        line("Qual das expressões é termo geral de uma sucessão monótona?", 170, 100),
        line("5.(AE2023)", 260, 70),
        line("Qual das expressões é termo geral de uma progressão geométrica?", 290, 100),
      ];
      const second = QuestionBand.select(lines, { x: 200, y: 295 })!;
      expect(second.part).toBe("5.(AE2023)");
      expect(second.text).toContain("progressão");
      expect(second.text).not.toContain("monótona");
      expect(second.stemText).toContain("alternativa");
    });

    it("ends a part at an outdented question", () => {
      const lines = [
        line("2.3. A existência de espaços verdes apresenta vantagens como", 60, 100),
        line("(A) a redução da radiação", 100, 130),
        line("3. Na Figura 3, estão representados os fluxos", 234, 78),
        line("3.1. Os três centros urbanos são", 860, 99),
        line("3.2. As cidades médias", 960, 99),
      ];
      const band = QuestionBand.select(lines, { x: 200, y: 66 })!;
      expect(band.label).toBe("2.3");
      expect(band.end).toBe(234);
      expect(band.text).not.toContain("Figura 3");
    });

    it("treats each part as the question on a page of parts, and its table cells are not labels", () => {
      const lines = [
        line("1.3. O nosso organismo contém outros elementos químicos", 60, 90),
        line("(A) 2,5 × 10⁻³ %", 100, 120),
        line("1.4. Associe cada isótopo da Coluna I à Coluna II", 200, 90),
        line("(1) Isótopo mais abundante na natureza.", 300, 335),
        line("(2) Isótopo com 9 neutrões.", 330, 335),
        line("(3) Isótopo de carga nuclear +17.", 360, 335),
      ];
      const inTable = QuestionBand.select(lines, { x: 400, y: 335 })!;
      expect(inTable.label).toBe("1.4");
      expect(inTable.text).toContain("Associe");
      expect(inTable.text).toContain("(3) Isótopo");
      const first = QuestionBand.select(lines, { x: 200, y: 65 })!;
      expect(first.label).toBe("1.3");
      expect(first.text).not.toContain("Associe");
    });

    it("cuts text read through UI Automation to the tapped part with its statement", () => {
      const whole = [
        "2. Seja g a função definida por g(x) = sen x",
        "Resolva os itens 2.1. e 2.2. sem calculadora.",
        "2.1. Averigue se g é contínua em x = 0.",
        "2.2. Estude, no intervalo ]0, π], a função g.",
        "3. Considere o número complexo",
      ].join("\n");
      const one = ScreenQuestions.keepingPart("2.1", whole);
      expect(one.startsWith("2. Seja g")).toBe(true);
      expect(one).toContain("Averigue");
      expect(one).not.toContain("Estude");
      expect(one).not.toContain("Considere");
      const two = ScreenQuestions.keepingPart("2.2", whole);
      expect(two).toContain("Seja g");
      expect(two).toContain("Estude");
      expect(two).not.toContain("Averigue");
    });
  });

  it("cuts a whole page of UI Automation text to the clicked question", () => {
    const text =
      [
        "MAP45",
        "Duração: 0:45",
        "Questão 1 – O circuito da figura é equivalente a",
        "A. 6,5 kΩ",
        "Questão 2 – Considere o circuito da figura",
        "A. RTh = 1,2 kΩ",
        "Questão 3 – Escolha a afirmação verdadeira",
        "A. V5 = 0 V",
      ].join("\n") + "\nlinha de texto da página".repeat(40);
    const read = ScreenQuestions.make({
      text,
      frame: { x: 0, y: 0, width: 0, height: 0 },
      appName: "Preview",
      hasImage: false,
      method: "block",
      focus: text,
    });
    const picture = region("Questão 2", "Questão 2 – Considere o circuito da figura\nA. RTh = 1,2 kΩ");
    const cut = ScreenQuestions.trimmed(read, picture);
    expect(cut.text).toContain("Considere");
    expect(cut.text).not.toContain("Questão 3");
    expect(cut.text).not.toContain("Questão 1");
    // Text that starts at another question than the picture's is replaced by the picture's.
    const wrong = ScreenQuestions.make({
      text: "Questão 3 – Escolha a afirmação verdadeira\nA. V5 = 0 V",
      frame: { x: 0, y: 0, width: 0, height: 0 },
      appName: "Preview",
      hasImage: false,
      method: "block",
    });
    expect(ScreenQuestions.trimmed(wrong, picture).text.startsWith("Questão 2")).toBe(true);
  });
});
