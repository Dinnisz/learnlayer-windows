// An exam's footer as Windows' OCR reads it (2026 exams, pages drawn at 1.5× and 2×): the slash of "Página 4/ 13" read
// as ",'" or as a 1, and the footer split in two lines, "Prova 635/1 .a" and "F. • Página 4,' 13". Each is a footer.

import { describe, expect, it } from "vitest";
import { QuestionBand } from "./questionBand";

describe("an exam's footer read by the OCR", () => {
  it("is a footer however its slash is read, and split in two", () => {
    for (const text of [
      "Prova 715.V1/1.aF. • Página 10/ 15",
      "F. • Página 4,' 13",
      "• Página 71 15",
      "Prova 635/1 .a",
      "Prova 719.v1,'1.a",
      "Prova",
      "E • Página 5/ 15",
    ])
      expect(QuestionBand.isFooter(text), text).toBe(true);
  });

  it("is not a sentence that names a page or a test", () => {
    for (const text of [
      "Na página 4 do documento, o autor refere",
      "A prova de que o argumento é válido",
      "Prova que a função é contínua.",
      "Considere o documento da página anterior.",
    ])
      expect(QuestionBand.isFooter(text), text).toBe(false);
  });
});
