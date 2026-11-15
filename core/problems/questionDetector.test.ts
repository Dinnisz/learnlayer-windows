// Port of LearnLayerTests/QuestionDetectorTests.swift @ ref 2026-11-04. The cases that need QuestionSession
// (partLabels) and PDFQuestionRead are ported with those files.

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { Rects, selectionIn, type Rect } from "../pdf/page";
import { drawnTestPage, framedTestPage, pdfPages, twoColumnTestPage } from "../testing/testPages";
import { normalizeText } from "./textNormalizer";
import {
  endingAbove,
  inRomanSequence,
  numberingRestarts,
  questionsOn,
  questionWithLabelAt,
  withCarriedStatement,
  withoutNextLineSliver,
  type ExamQuestion,
} from "./questionDetector";

const testPDF = (name: string) => `referencia-mac/Tools/TestPDFs/${name}`;
const mid = (r: Rect) => ({ x: Rects.midX(r), y: Rects.midY(r) });
const find = (questions: ExamQuestion[], label: string) => {
  const question = questions.find((q) => q.label === label);
  if (!question) throw new Error(`missing ${label} in ${questions.map((q) => q.label).join(", ")}`);
  return question;
};

describe("QuestionDetector", () => {
  it("keeps the padding off the next line's top", () => {
    const text = { x: 50, y: 700, width: 300, height: 12 };
    const padded = Rects.inset(text, -6, -4);
    const next = { x: 50, y: 686, width: 10, height: 12 };
    const trimmed = withoutNextLineSliver(padded, text, next);
    expect(trimmed.y).toBe(text.y - 1);
    expect(Rects.maxY(trimmed)).toBe(Rects.maxY(padded));
    const far = { x: 50, y: 650, width: 10, height: 12 };
    expect(withoutNextLineSliver(padded, text, far)).toEqual(padded);
    const withFigure = { x: 44, y: 600, width: 312, height: 112 };
    expect(withoutNextLineSliver(withFigure, text, next)).toEqual(withFigure);
  });

  it.runIf(existsSync(testPDF("exam.pdf")))("detects labels in the exam test PDF", async () => {
    const [page] = await pdfPages(testPDF("exam.pdf"));
    const labels = questionsOn(page!).map((q) => q.label);
    for (const label of ["I.1", "I.2", "I.3", "II.1", "II.2"]) expect(labels).toContain(label);
  });

  it("keeps a figure edge under the lowest label when nothing else is there", () => {
    const page = framedTestPage("1. Considere o circuito da figura e indique o valor da tensão pedida no enunciado.");
    const [question] = questionsOn(page);
    const text = selectionIn(page, page.mediaBox)!.bounds;
    expect(question!.bounds.y).toBeLessThanOrEqual(text.y - 4 - 19);
  });

  it("detects decimal items on a generated page", () => {
    const page = framedTestPage(
      "GRUPO 2\n2.1. Determine o valor de a.\n2.2. Estude o sinal de f no intervalo ]−∞, 3[.",
    );
    const labels = questionsOn(page).map((q) => q.label);
    expect(labels).toContain("2.1");
    expect(labels).toContain("2.2");
  });

  it("stops part (b) before sibling (c)", () => {
    const longB = "texto ".repeat(20);
    const longC = "outro ".repeat(20);
    const page = framedTestPage(
      [
        "1. Enunciado comum da primeira questão com dados partilhados por todas as alíneas.",
        "(a) Primeira alínea com texto suficientemente longo para ser reconhecida como parte.",
        `(b) ${longB}`,
        `(c) ${longC}`,
      ].join("\n"),
    );
    const partB = questionsOn(page).find((q) => q.label.endsWith("(b)"))!;
    expect(partB.text).not.toContain("(c)");
    expect(partB.text).not.toContain("outro");
    expect(partB.groupText).toContain("Enunciado comum");
  });

  it("stops part (b) before the next question number", () => {
    const longB = "linha ".repeat(20);
    const page = framedTestPage(
      [
        "2. Texto partilhado do grupo dois com enunciado para o modelo.",
        `(b) ${longB}`,
        "3. Terceira questão que não deve entrar na alínea b.",
      ].join("\n"),
    );
    const partB = questionsOn(page).find((q) => q.label.endsWith("(b)"))!;
    expect(partB.text).not.toContain("Terceira questão");
    expect(partB.text).not.toContain("3.");
    expect(partB.groupText).toContain("Texto partilhado");
  });

  it("keeps a glued decimal label as its own part", () => {
    const page = framedTestPage(
      [
        "GRUPO 2",
        "2.1. Determine o valor de a.",
        "2.2. Estude o sinal de f no intervalo ]−∞, 3[.",
        "2.3.@- 6 10, ,",
        "2.3.1 Isto não é um item.",
      ].join("\n"),
    );
    const questions = questionsOn(page);
    const labels = questions.map((q) => q.label);
    for (const label of ["2.1", "2.2", "2.3", "2.3.1"]) expect(labels).toContain(label);
    const part = find(questions, "2.3");
    expect(part.groupLabels).toContain("2.3");
    expect(part.group).toBe("2");
  });

  it("keeps separate numbered questions on one page as separate groups", () => {
    const page = framedTestPage(
      [
        "1. Calcule o valor de 2 + 3 e justifique a resposta.",
        "2. Resolva a equação x + 1 = 4 no conjunto dos reais.",
        "3. Determine a derivada da função f(x) = x².",
        "4. Indique o domínio da função g(x) = 1/x.",
      ].join("\n"),
    );
    const questions = questionsOn(page);
    expect(questions.map((q) => q.label)).toEqual(["1", "2", "3", "4"]);
    for (const question of questions) {
      expect(question.groupLabels).toEqual([question.label]);
      for (const other of questions.filter((q) => q.label !== question.label))
        expect(question.groupText).not.toContain(other.text);
    }
  });

  it("detects every nesting level and makes it clickable", () => {
    const page = framedTestPage(
      [
        "1. Enunciado da questão um com texto suficiente para a identificar.",
        "1.1. Primeira subquestão com o seu próprio enunciado e dados.",
        "1.2. Segunda subquestão com outro enunciado completamente distinto.",
        "1.2.1. Terceiro nível dentro da segunda subquestão com texto.",
        "1.2.2 Outro item do terceiro nível, sem ponto final no rótulo.",
        "1.2.2.1 Quarto nível dentro do item anterior com mais texto.",
      ].join("\n"),
    );
    const questions = questionsOn(page);
    const labels = questions.map((q) => q.label);
    for (const expected of ["1", "1.1", "1.2", "1.2.1", "1.2.2", "1.2.2.1"]) expect(labels).toContain(expected);
    for (const question of questions) expect(question.group).toBe("1");
    for (const label of ["1.2.1", "1.2.2", "1.2.2.1"]) {
      const question = find(questions, label);
      expect(questionWithLabelAt(mid(question.labelBounds), page)?.label).toBe(label);
    }
    const deep = find(questions, "1.2.1");
    expect(deep.text).toContain("Terceiro nível");
    expect(deep.text).not.toContain("Outro item");
  });

  it("treats ordinal labels as questions", () => {
    const page = framedTestPage(
      [
        "1o) Um automóvel move-se com velocidade constante durante dez segundos.",
        "2o) Determine a aceleração do corpo sabendo que parte do repouso.",
        "3o) Calcule o trabalho realizado pela força resultante no percurso.",
      ].join("\n"),
    );
    const questions = questionsOn(page);
    expect(questions.map((q) => q.label)).toEqual(["1", "2", "3"]);
    const second = find(questions, "2");
    expect(second.text).toContain("aceleração");
    expect(second.text).not.toContain("automóvel");
    expect(questionWithLabelAt(mid(second.labelBounds), page)?.label).toBe("2");
  });

  it("keeps the text of short formula parts", () => {
    const page = framedTestPage(
      [
        "8. Considere as funções f e g definidas no conjunto dos números reais.",
        "(a) Determine o domínio da função f e justifique a resposta dada.",
        "(b) Estude a monotonia da função f no seu domínio e indique os extremos.",
        "(c) g(x)",
        "(d) h(x)",
      ].join("\n"),
    );
    const questions = questionsOn(page);
    const labels = questions.map((q) => q.label);
    for (const part of ["8(a)", "8(b)", "8(c)", "8(d)"]) expect(labels).toContain(part);
    const c = find(questions, "8(c)");
    expect(c.text).toContain("g(x)");
    expect(c.text).not.toContain("h(x)");
    expect(c.groupText).toContain("Considere as funções");
  });

  it("offers short word parts on a numbered page", () => {
    const page = framedTestPage(
      [
        "2. Considere a função f representada graficamente no referencial.",
        "(a) Indique o domínio da função.",
        "(b) Indique o contradomínio da função.",
      ].join("\n"),
    );
    const labels = questionsOn(page).map((q) => q.label);
    expect(labels).toContain("2(a)");
    expect(labels).toContain("2(b)");
  });

  const romanPage = () =>
    framedTestPage(
      [
        "3. Considere a função f definida por ramos no conjunto dos números reais.",
        "(i) A função f é contínua em x = 0? Justifique a resposta dada.",
        "(ii) Estude a monotonia da função f no seu domínio.",
        "(iii) Indique os extremos relativos da função f.",
        "(iv) Determine o contradomínio da função f.",
      ].join("\n"),
    );

  it("treats lower-case roman parts as sub-parts", () => {
    const questions = questionsOn(romanPage());
    const labels = questions.map((q) => q.label);
    for (const part of ["3(i)", "3(ii)", "3(iii)", "3(iv)"]) expect(labels).toContain(part);
    const ii = find(questions, "3(ii)");
    expect(ii.text).toContain("monotonia");
    expect(ii.text).not.toContain("extremos");
    expect(ii.group).toBe("3");
    expect(ii.groupText).toContain("Considere a função");
  });

  it("keeps the group's statement for a roman part opened alone", () => {
    const page = framedTestPage(
      [
        "3. Considere a função f definida por ramos no conjunto dos números reais.",
        "(i) A função f é prolongável por continuidade em x = 0? Justifique.",
        "(ii) Estude a monotonia da função f no seu domínio.",
      ].join("\n"),
    );
    const i = find(questionsOn(page), "3(i)");
    const stem = i.statementBounds!;
    expect(stem).not.toBeNull();
    expect(i.statementPageIndex).toBeNull();
    expect(stem.y).toBeGreaterThan(Rects.midY(i.labelBounds));
    expect(selectionIn(page, stem)?.text).toContain("Considere a função");
    expect(i.text).toContain("prolongável");
    expect(i.text).not.toContain("monotonia");
  });

  it("keeps the statement from the page before for a part on the next page", () => {
    const stem = { x: 66, y: 80, width: 460, height: 90 };
    const base = (label: string, group: string, pageIndex: number, bounds: Rect, text: string): ExamQuestion => ({
      label,
      group,
      pageIndex,
      labelBounds:
        pageIndex === 4 ? { x: 72, y: 156, width: 12, height: 14 } : { x: 72, y: 760, width: 20, height: 14 },
      bounds,
      text,
      groupText: text,
      groupLabels: [],
      groupBounds: null,
      startsOnPreviousPage: false,
      statementBounds: null,
      statementPageIndex: null,
    });
    const top = base("3", "3", 4, stem, "3. Considere a função f definida por");
    const part = (label: string, group = "3") =>
      base(label, group, 5, { x: 66, y: 720, width: 460, height: 60 }, label);
    const carried = withCarriedStatement([part("3(i)"), part("3(ii)"), part("4", "4")], top, 4);
    expect(carried[0]!.statementBounds).toEqual(stem);
    expect(carried[0]!.statementPageIndex).toBe(4);
    expect(carried[1]!.statementBounds).toEqual(stem);
    expect(carried[1]!.statementPageIndex).toBe(4);
    expect(carried[2]!.statementBounds).toBeNull();

    const earlier = { ...part("3(i)"), statementBounds: stem, statementPageIndex: 4 };
    const handed = withCarriedStatement([part("3(ii)")], earlier, 5);
    expect(handed[0]!.statementBounds).toEqual(stem);
    expect(handed[0]!.statementPageIndex).toBe(4);

    const own = { ...part("3(iii)"), statementBounds: { x: 1, y: 2, width: 3, height: 4 } };
    expect(withCarriedStatement([own], top, 4)[0]!.statementPageIndex).toBeNull();
  });

  it("ends a roman part's crop above the next part", () => {
    const questions = questionsOn(romanPage());
    const iii = find(questions, "3(iii)");
    const iv = find(questions, "3(iv)");
    expect(iii.bounds.y).toBeGreaterThanOrEqual(Rects.maxY(iv.labelBounds));
    expect(Rects.contains(iii.bounds, mid(iii.labelBounds))).toBe(true);
    expect(iii.text).not.toContain("Determine");
  });

  it("ends a part above the next label below it", () => {
    const label = { x: 50, y: 700, width: 20, height: 12 };
    const reaching = { x: 44, y: 676, width: 312, height: 40 };
    const next = { x: 50, y: 680, width: 20, height: 12 };
    const trimmed = endingAbove(reaching, label, next);
    expect(trimmed.y).toBe(Rects.maxY(next));
    expect(Rects.maxY(trimmed)).toBe(Rects.maxY(reaching));
    expect(endingAbove(reaching, label, { x: 300, y: 700, width: 20, height: 12 })).toEqual(reaching);
    expect(endingAbove(reaching, label, { x: 50, y: 640, width: 20, height: 12 })).toEqual(reaching);
  });

  it("does not take a lone roman-looking label for a part", () => {
    expect(inRomanSequence(["a", "b", "i"])).toEqual([true, true, false]);
    expect(inRomanSequence(["v"])).toEqual([false]);
    expect(inRomanSequence(["i", "ii", "iii", "iv"])).toEqual([true, true, true, true]);
  });

  it("reads a two-column page column by column", () => {
    const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, offset) => from + offset);
    const left = range(1, 5).map(
      (n) => `${n}o) Pergunta ${n} da coluna esquerda com texto próprio\nsegunda linha ${n} da esquerda`,
    );
    const right = range(6, 10).map(
      (n) => `${n}o) Pergunta ${n} da coluna direita com texto próprio\nsegunda linha ${n} da direita`,
    );
    const page = twoColumnTestPage(left.join("\n"), right.join("\n"));
    const questions = questionsOn(page);
    const labels = new Set(questions.map((q) => q.label));
    for (const n of range(1, 10)) expect(labels.has(String(n))).toBe(true);
    const two = find(questions, "2");
    expect(two.text).toContain("Pergunta 2");
    expect(two.text).not.toContain("direita");
    expect(two.text).not.toContain("Pergunta 3");
    const seven = find(questions, "7");
    expect(seven.text).toContain("Pergunta 7");
    expect(seven.text).not.toContain("esquerda");
    expect(questionWithLabelAt(mid(seven.labelBounds), page)?.label).toBe("7");
  });

  it("keeps the previous question's figure label out of the next question", () => {
    const page = drawnTestPage([
      { text: "Questão 1 – Qual é a resistência vista de a e b:", x: 72, y: 700 },
      { text: "A. 6,5 kΩ", x: 72, y: 670 },
      { text: "D. Nenhuma das respostas anteriores", x: 72, y: 640 },
      { text: "Questão 2 – Escolha os parâmetros do equivalente de Thévenin.", x: 72, y: 560 },
      { text: "A. 1,2 kΩ e 9 V", x: 72, y: 530 },
      { text: "2 kΩ do circuito", x: 400, y: 640 },
    ]);
    const questions = questionsOn(page);
    const second = find(questions, "2");
    expect(second.text).not.toContain("circuito");
    const first = find(questions, "1");
    expect(Rects.maxY(second.bounds)).toBeLessThan(first.bounds.y + 30);
  });

  it("keeps every item of groups that number from one again with its statement", () => {
    const page = framedTestPage(
      [
        "Grupo V – Corrente eléctrica (2 val.)",
        "Um fio de cobre de comprimento L = 5 m é percorrido por uma corrente I = 2 A.",
        "1. (0,75) Calcule a resistência do fio e a potência dissipada.",
        "2. (0,5) Calcule a densidade de corrente no interior do fio.",
        "Grupo VII – Condensadores e circuito RC (3 val.)",
        "Um condensador C1 = 6 µF é carregado a 100 V e ligado a um condensador C2 = 3 µF descarregado.",
        "1. (0,5) Calcule a carga e a energia iniciais armazenadas em C1.",
        "2. (1,0) Calcule as cargas, as tensões e a energia armazenada em cada condensador no regime estacionário.",
      ].join("\n"),
    );
    const questions = questionsOn(page);
    const labels = questions.map((q) => q.label);
    for (const label of ["V.1", "V.2", "VII.1", "VII.2"]) expect(labels).toContain(label);
    const two = find(questions, "VII.2");
    expect(two.group).toBe("VII");
    expect(two.text).toContain("regime estacionário");
    expect(two.text).not.toContain("densidade de corrente");
    expect(two.groupText).toContain("C1 = 6");
    const stemText = selectionIn(page, two.statementBounds!)?.text ?? "";
    expect(stemText).toContain("condensador C1");
    expect(stemText).not.toContain("fio de cobre");
    expect(find(questions, "V.1").text).toContain("resistência do fio");
  });

  it("keeps the labels of groups that number on", () => {
    const page = framedTestPage(
      [
        "GRUPO I",
        "1. Primeira pergunta do primeiro grupo com texto suficiente.",
        "2. Segunda pergunta do primeiro grupo com texto suficiente.",
        "GRUPO II",
        "3. Terceira pergunta, já no segundo grupo, com texto suficiente.",
        "4. Quarta pergunta do segundo grupo com texto suficiente.",
      ].join("\n"),
    );
    expect(questionsOn(page).map((q) => q.label)).toEqual(["1", "2", "3", "4"]);
  });

  it("restarts numbering when a number comes back under another heading", () => {
    const items = (pairs: [string, string | null][]) => pairs.map(([number, section]) => ({ number, section }));
    expect(
      numberingRestarts(
        items([
          ["1", "I"],
          ["2", "I"],
          ["1", "II"],
        ]),
      ),
    ).toBe(true);
    expect(
      numberingRestarts(
        items([
          ["1", "VII"],
          ["2", "VII"],
        ]),
      ),
    ).toBe(true);
    expect(
      numberingRestarts(
        items([
          ["1", "I"],
          ["2", "I"],
          ["3", "II"],
        ]),
      ),
    ).toBe(false);
    expect(
      numberingRestarts(
        items([
          ["1", null],
          ["2", null],
        ]),
      ),
    ).toBe(false);
  });

  it("spells out ligature codes", () => {
    const c = String.fromCharCode;
    expect(normalizeText(`Justi${c(0x1c)}que todas as respostas`)).toBe("Justifique todas as respostas");
    expect(normalizeText(`um ${c(0x1c)}o condutor ${c(0x1c)}no`)).toBe("um fio condutor fino");
    expect(normalizeText(`Grupo IV ${c(0x15)} Lei de Gauss`)).toBe("Grupo IV – Lei de Gauss");
    expect(normalizeText(`e${c(0xfb03)}ciente`)).toBe("efficiente");
  });

  it("does not take a marks table for the problem's label", () => {
    const page = framedTestPage(
      [
        "Problema 5 a) 5 b) 6 a) 6 b)",
        "Cotação 2 2 2 2",
        "Problema 5",
        "Considere o circuito da figura.",
        "a) Indique o número de nós, ramos e malhas elementares do circuito.",
        "b) Defina correntes de circulação nas malhas elementares e apresente as equações.",
      ].join("\n"),
    );
    const partA = find(questionsOn(page), "5(a)");
    const stemText = selectionIn(page, partA.statementBounds!)?.text ?? "";
    expect(stemText).toContain("Considere o circuito");
    expect(stemText).not.toContain("Cotação");
  });

  it.runIf(existsSync(testPDF("teste-modelo-eo.pdf")))(
    "keeps every group's items in the electromagnetism paper",
    async () => {
      const pages = await pdfPages(testPDF("teste-modelo-eo.pdf"));
      const page = pages[1]!;
      const questions = questionsOn(page);
      const labels = questions.map((q) => q.label);
      for (const label of ["IV.1", "IV.4", "V.1", "V.3", "VI.1", "VI.3", "VII.1", "VII.2", "VII.4"])
        expect(labels).toContain(label);
      const two = find(questions, "VII.2");
      expect(two.text).toContain("estacionário");
      const stemText = selectionIn(page, two.statementBounds!)?.text ?? "";
      expect(stemText.includes("6 µF") || stemText.includes("6 μF")).toBe(true);
      const gauss = find(questions, "IV.1");
      expect(gauss.statementPageIndex).toBe(0);
      const gaussText = selectionIn(pages[0]!, gauss.statementBounds!)?.text ?? "";
      expect(gaussText).toContain("esfera condutora");
      const control = (text: string) =>
        Array.from(text).some((ch) => ch.charCodeAt(0) < 0x20 && ch.charCodeAt(0) !== 10);
      expect(questions.some((q) => control(q.text))).toBe(false);
    },
  );
});
