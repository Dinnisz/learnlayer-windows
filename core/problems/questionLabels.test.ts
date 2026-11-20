// Port of LearnLayerTests/QuestionLabelsTests.swift @ ref 2026-11-04
// (the two PDFColumns cases come with the PDF reader in phase 3.)

import { describe, expect, it } from "vitest";
import { labelsMatching, QuestionLabels } from "./questionLabels";
import { joiningBrokenLines, normalizeText } from "./textNormalizer";

describe("QuestionLabels", () => {
  it("nested labels match at three and four levels", () => {
    const text = [
      "1.2.1. Terceiro nível",
      "1.2.2 Sem ponto final",
      "  2.3.1.4 Quatro níveis",
      "1.2. Dois níveis não são aninhados",
      "3.14 é um número no início de uma linha",
      "12.03.2019 uma data",
    ].join("\n");
    expect(labelsMatching(QuestionLabels.nestedExpression, text)).toEqual(["1.2.1", "1.2.2", "2.3.1.4"]);
  });

  it("ordinal labels match like numbers", () => {
    const text = "1o) Um automóvel\n 12º) Outro texto\n3.º) Mais um\n4o)\nQuanto vale?\n5) Normal\n";
    expect(labelsMatching(QuestionLabels.topPattern, text)).toEqual(["1o)", "12º)", "3.º)", "4o)", "5)"]);
  });

  it("a label with its score glued on is found", () => {
    // MAP2 23/24 (a TeX paper): the score glued to the label, words glued to each other.
    const text = [
      "1)(4.0)EmR4,considereU=L(f(1;0;0; 1);(1; 1;0; 1)g)",
      "2)(4.0)DetermineafactorizaÁ„oCRdamatriz2",
      "5) (2.0)SejaA2M3 3(R)talquepA( )=(2 )(3 )2.",
      "6)(3.0)SejaA2Mn n(R)talque A R, tr(A2)=tr(A3)",
      "7)(x) não é um rótulo",
      "3)2 nem isto",
    ].join("\n");
    expect(labelsMatching(QuestionLabels.topPattern, text)).toEqual(["1)", "2)", "5)", "6)"]);
  });

  it("a second-column ordinal after text on the same line is found", () => {
    const text = "1o) texto da primeira coluna   2o) texto da segunda coluna";
    expect(labelsMatching(QuestionLabels.midLineOrdinalExpression, text)).toEqual(["2o)"]);
  });

  it("a formula is a part however short", () => {
    expect(QuestionLabels.isSubItem("g(x)\n", "8. Considere f e g.", true)).toBe(true);
    expect(QuestionLabels.isSubItem(" f'(x) = 2x\n", "", true)).toBe(true);
    expect(QuestionLabels.isSubItem("(x+1)² − 4\n", "", true)).toBe(true);
    expect(QuestionLabels.isSubItem("3\n", "", true)).toBe(true);
  });

  it("words on a numbered page are parts unless they are option rows", () => {
    const ask = "2. Considere a função f representada no referencial.";
    expect(QuestionLabels.isSubItem("Indique o domínio da função.\n", ask, true)).toBe(true);
    expect(QuestionLabels.isSubItem("Basalto\n", "3. Associe as colunas.", true)).toBe(false);
    expect(QuestionLabels.isSubItem("Indique o domínio.\n", "3. Complete os espaços com as palavras.", true)).toBe(
      false,
    );
    expect(QuestionLabels.isSubItem("Basalto\n", "3. Para cada letra, indique o número da opção.", true)).toBe(false);
  });

  it("header rows and gaps are not parts", () => {
    expect(QuestionLabels.isSubItem("(b) (c) (d)\n", "", false)).toBe(false);
    expect(QuestionLabels.isSubItem(", originando o composto\n", "", false)).toBe(false);
    expect(QuestionLabels.isSubItem("   \n", "", false)).toBe(false);
  });

  it("a wrapped word is joined and a stray full stop goes back", () => {
    expect(joiningBrokenLines("Um automó-\nvel parte")).toBe("Um automóvel parte");
    expect(joiningBrokenLines("a aceleração é 2 m/s2\n.")).toBe("a aceleração é 2 m/s2.");
    expect(joiningBrokenLines("x -\ny")).toBe("x -\ny");
    expect(joiningBrokenLines("- primeiro\n- segundo")).toBe("- primeiro\n- segundo");
    expect(normalizeText("Um automó-\nvel")).toBe("Um automóvel");
  });
});
