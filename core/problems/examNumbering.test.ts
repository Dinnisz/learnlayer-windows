// The numbering of a paper decided on the whole document, not page by page (a Windows change, docs/DECISOES.md
// 2026-11-19): groups numbered from 1 again keep their prefix on every page, a procedure's numbered steps are not
// items, and parts numbered on («Parte A» 1–3, «Parte B» 4–5) keep plain numbers.

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { documentTestPages, pdfPages } from "../testing/testPages";
import { questionsOn } from "./questionDetector";

const labels = (texts: string[]) => documentTestPages(texts).flatMap((page) => questionsOn(page).map((q) => q.label));

describe("exam numbering over the whole paper", () => {
  it("prefixes a group's items on a page with none of its headings", () => {
    expect(
      labels([
        "GRUPO I\n1. Indique a data do documento.\n2. Explique a causa.",
        "GRUPO II\n1. Compare as duas perspetivas.",
        "2. Desenvolva o tema proposto.\n3. Identifique o movimento.",
      ]),
    ).toEqual(["I.1", "I.2", "II.1", "II.2", "II.3"]);
  });

  it("carries the group over a page of documents", () => {
    expect(
      labels([
        "GRUPO I\n1. Indique a data do documento.",
        "GRUPO II",
        "Documento 1 — um texto sem itens.",
        "1. Compare as duas perspetivas.\n2. Desenvolva o tema proposto.",
      ]),
    ).toEqual(["I.1", "II.1", "II.2"]);
  });

  it("leaves out the numbered steps of a procedure before the group's first item", () => {
    expect(
      labels([
        "GRUPO I\n1. Selecione a opção correta.\n2. Explique o resultado.",
        "GRUPO II\n1. Marcaram-se três lâminas.\n2. Destacaram-se três fragmentos.\n3. Observou-se ao microscópio.\n1. Identifique as afirmações corretas.",
        "2. As células têm em comum a presença de\n3. Descreva os resultados previstos.",
      ]),
    ).toEqual(["I.1", "I.2", "II.1", "II.2", "II.3"]);
  });

  it("keeps plain numbers for parts that number on", () => {
    expect(
      labels([
        "PARTE A\n1. Explicite o sentido do verso.\n2. Refira o recurso expressivo.",
        "PARTE B\n3. Interprete a imagem final.\n4. Compare os dois textos.",
        "GRUPO II\n1. Selecione a opção correta.\n2. Identifique a função sintática.",
      ]),
    ).toEqual(["1", "2", "3", "4", "II.1", "II.2"]);
  });

  it("leaves a paper numbered on from group to group as it was", () => {
    expect(
      labels([
        "GRUPO I\n1. Indique a data.\n2. Explique a causa.",
        "GRUPO II\n3. Compare as perspetivas.\n4. Desenvolva o tema.",
      ]),
    ).toEqual(["1", "2", "3", "4"]);
  });

  const exam = (name: string) => `exames/${name}`;
  it.runIf(existsSync(exam("EX-BG702-F1-2026-V1_net-1.pdf")))(
    "labels the 2026 Biology and Geology paper by group, without the procedure's steps",
    async () => {
      const pages = await pdfPages(exam("EX-BG702-F1-2026-V1_net-1.pdf"));
      const found = pages.flatMap((page) => questionsOn(page).map((q) => q.label));
      expect(found.slice(20)).toEqual(["II.1", "II.2", "II.3", "III.1", "III.2", "III.3", "III.4", "III.5"]);
      expect(found.slice(0, 20)).toEqual(Array.from({ length: 20 }, (_, index) => `I.${index + 1}`));
    },
  );

  it.runIf(existsSync(exam("EX-HistA623-F1-2026-V1_NET.pdf")))("labels the 2026 History A paper by group", async () => {
    const pages = await pdfPages(exam("EX-HistA623-F1-2026-V1_NET.pdf"));
    expect(pages.flatMap((page) => questionsOn(page).map((q) => q.label))).toEqual([
      "I.1",
      "I.2",
      "II.1",
      "II.2",
      "II.3",
      "III.1",
      "III.2",
      "III.3",
      "III.4",
      "IV.1",
      "IV.2",
      "IV.3",
      "IV.4",
      "IV.5",
    ]);
  });

  it.runIf(existsSync(exam("EX-Port639-F1-2026-V1_net.pdf")))(
    "labels the 2026 Portuguese paper: part A to C numbered on, groups II and III by group",
    async () => {
      const pages = await pdfPages(exam("EX-Port639-F1-2026-V1_net.pdf"));
      expect(pages.flatMap((page) => questionsOn(page).map((q) => q.label))).toEqual([
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "II.1",
        "II.2",
        "II.3",
        "II.4",
        "II.5",
        "II.6",
        "II.7",
        "III.1",
        "III.2",
      ]);
    },
  );
});
