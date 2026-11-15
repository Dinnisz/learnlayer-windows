// PrereadTests.swift: which PDFs are read whole, in what order, within what budget; and the reading ahead itself,
// on synthetic pages.

import { describe, expect, it } from "vitest";
import { documentTestPages } from "../testing/testPages";
import { DocumentPreread, PrereadPlan } from "./preread";

describe("PrereadPlan", () => {
  it("reads a short test whole", () => {
    const texts = [
      "Exame Nacional de Matemática A\nDuração da Prova: 150 minutos",
      "1. Considere a função f. (10 val.)",
    ];
    expect(PrereadPlan.scope(2, texts, [0, 1])).toBe("document");
    // Cotações at the end, a Grupo header: also a test.
    expect(PrereadPlan.scope(8, ["GRUPO I", "COTAÇÕES"], [1, 0])).toBe("document");
  });

  it("never reads a long PDF whole", () => {
    const texts = Array<string>(13).fill("Exame · Teste · Grupo · Questão");
    expect(PrereadPlan.scope(13, texts, Array<number>(13).fill(10))).toBe("window");
    expect(PrereadPlan.scope(12, texts.slice(0, 12), [])).toBe("document");
  });

  it("reads notes without test words or many questions by their window", () => {
    const notes = ["Capítulo 3: Séries numéricas", "Definição. Uma série converge se…", "Exemplo 1. Teorema 2."];
    expect(PrereadPlan.scope(3, notes, [0, 1, 2])).toBe("window");
    // One test word alone is not enough ("grupo" in prose).
    expect(PrereadPlan.scope(3, ["o grupo de simetrias"], [1, 1, 1])).toBe("window");
    expect(PrereadPlan.scope(0, [], [])).toBe("window");
  });

  it("makes a test of many numbered questions per page", () => {
    expect(PrereadPlan.scope(3, ["", "", ""], [5, 4, 3])).toBe("document");
    expect(PrereadPlan.scope(3, ["", "", ""], [4, 4, 3])).toBe("window");
  });

  it("finds test words without case or accents", () => {
    const found = PrereadPlan.keywords("QUESTÃO 2 … cotacao … Duracao … 12 val. … Testes");
    expect(found).toEqual(new Set(["questao", "cotacao", "duracao", "val", "teste"]));
    // Inside other words, they are not test words.
    expect(PrereadPlan.keywords("contestem, agrupou, valor, examiná-lo").size).toBe(0);
  });

  it("puts the pages in view first, then outward", () => {
    expect(PrereadPlan.order(6, [2], "document")).toEqual([2, 3, 1, 4, 0, 5]);
    expect(PrereadPlan.order(6, [3, 4], "document")).toEqual([3, 4, 5, 2, 1, 0]);
    expect(PrereadPlan.order(3, [0], "document")).toEqual([0, 1, 2]);
  });

  it("reads a window as the pages in view and their neighbours", () => {
    expect(PrereadPlan.order(40, [10], "window")).toEqual([10, 11, 9]);
    expect(PrereadPlan.order(40, [0], "window")).toEqual([0, 1]);
    expect(PrereadPlan.order(40, [39], "window")).toEqual([39, 38]);
    expect(PrereadPlan.order(40, [10, 11], "window")).toEqual([10, 11, 12, 9]);
  });

  it("drops pages out of range or repeated", () => {
    expect(PrereadPlan.order(3, [7, -1], "window")).toEqual([0, 1]);
    expect(PrereadPlan.order(3, [1, 1], "document")).toEqual([1, 2, 0]);
    expect(PrereadPlan.order(0, [0], "document")).toEqual([]);
  });

  it("stops the budget at forty calls or five cents", () => {
    expect(PrereadPlan.allows(0, 0, 0)).toBe(true);
    expect(PrereadPlan.allows(39, 0, 0.049)).toBe(true);
    expect(PrereadPlan.allows(40, 0, 0)).toBe(false);
    expect(PrereadPlan.allows(0, 0, 0.05)).toBe(false);
    // Readings on their way count as calls already.
    expect(PrereadPlan.allows(38, 2, 0)).toBe(false);
    expect(PrereadPlan.allows(37, 2, 0)).toBe(true);
  });
});

describe("DocumentPreread", () => {
  const pages = documentTestPages([
    "Exame Nacional\nGRUPO I\n1. Considere a função f definida por f(x) = x².\n2. Calcule o limite.",
    "3. Resolva a equação.\n4. Determine o domínio.",
    "5. Estude a monotonia.",
  ]);
  const document = (id: string) => ({ id, pageCount: pages.length, page: async (index: number) => pages[index]! });

  it("reads a short test whole, the page in view first, and keeps each page's questions", async () => {
    const preread = new DocumentPreread(document("a.pdf"));
    await preread.start([1]);
    const report = await preread.finished();
    expect(report.scope).toBe("document");
    expect(report.pages).toBe(3);
    expect([...preread.questions.keys()]).toEqual([0, 1, 2]);
    expect(preread.questions.get(1)?.map((question) => question.label)).toEqual(["3", "4"]);
  });

  it("keeps to the budget when the questions are read from their pictures too", async () => {
    DocumentPreread.resetSpendsForTesting();
    let asked = 0;
    const preread = new DocumentPreread(document("b.pdf"), async () => {
      asked += 1;
      return { accepted: true, calls: 1, cost: 0.02 };
    });
    await preread.start([0]);
    const report = await preread.finished();
    // Two at a time, each new one only once one on its way is counted: the fourth starts at 0.04 recorded, and
    // the fifth finds 0.06, past the five cents.
    expect(report.stoppedByBudget).toBe(true);
    expect(asked).toBe(4);
    expect(report.cost).toBeCloseTo(0.08);
    // Read again (brought to the front once more): it goes on from what it spent, so nothing more is asked.
    const again = new DocumentPreread(document("b.pdf"), async () => {
      asked += 1;
      return { accepted: true, calls: 1, cost: 0.02 };
    });
    await again.start([0]);
    expect((await again.finished()).stoppedByBudget).toBe(true);
    expect(asked).toBe(4);
  });

  it("stops when cancelled", async () => {
    const preread = new DocumentPreread(document("c.pdf"));
    preread.cancel();
    await preread.start([0]);
    expect(preread.report.pages).toBe(0);
  });
});
