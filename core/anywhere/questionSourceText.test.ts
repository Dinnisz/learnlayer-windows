// Port of LearnLayerTests/QuestionSourceTextTests.swift @ 5701363: a reading question goes with the text it reads.
// Português 639 (2026, 1.ª fase), Parte B: the five stanzas of «O Sentimento dum Ocidental» on the left page of a
// spread, questions 4–6 on the right (Tools/TestPDFs). The two cases that read a screenshot of Preview with Vision
// (a click on a spread) are not ported: Windows reads the window with its own OCR, and node has none.

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PageText } from "../pdf/page";
import { ProblemPrompt } from "../prompts/problemPrompt";
import { questionsOn } from "../problems/questionDetector";
import { QuestionSession, QuestionSessionRules } from "../problems/questionSession";
import type { SolutionProvider } from "../problems/solutionProvider";
import { pdfPages } from "../testing/testPages";
import { PDFQuestionReading, type PDFQuestionRead } from "./pdfQuestionRead";

const testPDF = (name: string) => `referencia-mac/Tools/TestPDFs/${name}`;
let pages: PageText[] | null = null;

async function read(label: string): Promise<PDFQuestionRead> {
  pages ??= await pdfPages(testPDF("port639-parte-b.pdf"));
  const page = pages[1]!;
  const question = questionsOn(page).find((found) => found.label === label);
  if (!question) throw new Error(`missing ${label}`);
  const placement = { page, pageUnitsPerPoint: 1, tx: 0, ty: 0, residual: 0, anchors: 9 };
  const made = PDFQuestionReading.make(question, page, placement);
  if (!made) throw new Error(`no reading of ${label}`);
  return made;
}

const session = (made: PDFQuestionRead) =>
  new QuestionSession(
    { question: made.exam, supportText: made.supportText },
    { provider: {} as SolutionProvider, config: () => "cheapFirst", subject: "" },
  );

// The PDF lives in `referencia-mac/`, which is not in git: the CI has none of it.
describe.runIf(existsSync(testPDF("port639-parte-b.pdf")))("the source text of a reading question", () => {
  it("goes with question 4: the stanzas on the page before, numbered as the exam numbers them, with their notes", async () => {
    const made = await read("4");
    const support = made.supportText!;
    expect(support.startsWith("Leia as cinco estrofes seguintes")).toBe(true);
    expect(support).toContain("1\tE o fim da tarde inspira-me; e incomoda!");
    expect(support).toContain("5\tNum trem de praça arengam3 dois dentistas;");
    expect(support).toContain("20\tE o peixe podre gera os focos de infeção!");
    expect(support.includes("NOTAS") && support.includes("pilastras – pilares; colunas.")).toBe(true);
    // The page footer and the source line are not numbered lines of the poem.
    expect(support).not.toContain("Prova 639");
    expect(support).not.toContain("\tCesário Verde, Cânticos");
    expect(Array.from(support).length).toBeLessThanOrEqual(PDFQuestionReading.supportLimit);

    const opened = session(made);
    expect(opened.requestText.startsWith("4. Refira duas situações")).toBe(true);
    expect(opened.requestText).toContain("Texto de apoio");
    expect(opened.requestText).toContain("Às portas, em cabelo, enfadam-se os lojistas!");
    // What is shown is the question alone.
    expect(made.exam.text).not.toContain("lojistas");
    // A follow-up question reads the poem too, and the answer's quotes are found in it.
    expect(opened.exerciseWithSource).toContain("assomam as varinas");
    expect(opened.passageLines.some((line) => line.number === 12 && line.text.includes("assomam as varinas"))).toBe(
      true,
    );
  });

  it("cites a poem by verse and prose by line", async () => {
    const section = session(await read("5")).supportSection!;
    expect(section).toContain('cite verses as "v. 14"');
    expect(section).not.toContain("cite lines as");

    const prose = [1, 2, 3, 4, 5, 6]
      .map(
        (number) =>
          `${number}\tO narrador descreve longamente a praia ao entardecer, enquanto as gaivotas se afastam do cais e a luz cai.`,
      )
      .join("\n");
    expect(
      QuestionSessionRules.isVerse("Leia o texto seguinte.\n" + prose, "1. Segundo o texto, o que observa o narrador?"),
    ).toBe(false);
    expect(
      QuestionSessionRules.isVerse(
        "1\tE o fim da tarde inspira-me; e incomoda!\n2\tDe um couraçado inglês vogam os escaleres;\n3\tE em terra num tinir de louças e talheres\n4\tFlamejam, ao jantar, alguns hotéis da moda.",
        "2. Explique o sentido do texto.",
      ),
    ).toBe(true);
    expect(QuestionSessionRules.supportHeading(false)).toContain('cite lines as "l. 12"');
  });

  it("goes with questions 5 and 6 too", async () => {
    for (const label of ["5", "6"]) {
      const made = await read(label);
      const support = QuestionSessionRules.supportPassage(made.supportText, made.exam.groupText);
      expect(support).toContain("Correndo com firmeza, assomam as varinas.");
    }
  });

  it("is quick to read: the text layer only", async () => {
    pages ??= await pdfPages(testPDF("port639-parte-b.pdf"));
    const page = pages[1]!;
    const question = questionsOn(page).find((found) => found.label === "4")!;
    PDFQuestionReading.supportText(question, page);
    const start = performance.now();
    for (let run = 0; run < 5; run += 1) PDFQuestionReading.supportText(question, page);
    expect((performance.now() - start) / 5).toBeLessThan(150);
  });

  it("is the last passage, or both for a comparison", () => {
    const lines = [
      "GRUPO I",
      "Texto A",
      "Leia o texto seguinte.",
      "O mar enrola na areia.",
      "1. Explique o verso 1.",
      "Texto B",
      "A tarde cai sobre a cidade.",
      "Prova 639 • Página 3/ 12",
    ].map((text) => ({ number: null, text }));
    const last = PDFQuestionReading.supportTextFrom(lines, "2. Explique o sentido do texto.");
    expect(last).toBe("Texto B\nA tarde cai sobre a cidade.");
    const both = PDFQuestionReading.supportTextFrom(lines, "3. Compare os textos A e B.");
    expect(both?.startsWith("Texto A\nLeia o texto seguinte.")).toBe(true);
    expect(both).toContain("A tarde cai");
    expect(both).not.toContain("Página");
  });

  it("knows where a source starts and what is a page's footer", () => {
    expect(PDFQuestionReading.isSourceStart("Leia as cinco estrofes seguintes, extraídas da primeira parte")).toBe(
      true,
    );
    expect(PDFQuestionReading.isSourceStart("Lê o excerto de Os Maias.")).toBe(true);
    expect(PDFQuestionReading.isSourceStart("Read the text below and answer the questions.")).toBe(true);
    expect(PDFQuestionReading.isSourceStart("TEXTO B")).toBe(true);
    expect(PDFQuestionReading.isSourceStart("Le soleil se lève sur la ville.")).toBe(false);
    expect(PDFQuestionReading.isSourceStart("Leiria fica no centro do país.")).toBe(false);
    expect(PDFQuestionReading.isPageFooter("Prova 639.V1/1.ª F. • Página 6/ 14")).toBe(true);
    expect(PDFQuestionReading.isPageFooter("Page 3 of 12")).toBe(true);
    expect(PDFQuestionReading.isPageFooter("Num trem de praça arengam dois dentistas;")).toBe(false);
  });

  it("caps a long passage: about 1 500 input tokens at most", () => {
    const lines = [
      { number: null, text: "Leia o texto." },
      ...Array.from({ length: 400 }, (_, index) => ({
        number: index + 1,
        text: `Linha ${index + 1} de um texto longo em prosa.`,
      })),
    ];
    const support = PDFQuestionReading.supportTextFrom(lines, "1. Segundo o texto, …");
    expect(Array.from(support ?? "").length).toBeLessThanOrEqual(PDFQuestionReading.supportLimit);
    expect(support?.startsWith("Leia o texto.")).toBe(true);
  });

  it("is answered as an exam answers it, from the source, never asking for the text again", () => {
    const system = ProblemPrompt.system("Portuguese (Portugal)");
    expect(system).toContain("Texto de apoio");
    expect(system).toContain("never say the text is missing");
    expect(system).toContain("give exactly those");
    expect(system).toContain("v. 5");
  });
});
