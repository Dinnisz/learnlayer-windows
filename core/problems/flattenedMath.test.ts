// Port of LearnLayerTests/FlattenedMathTests.swift @ ref 2026-11-04
// (`modelFiguresAreReplacedByTheOnesFromThePDF` comes with QuestionTranscription in phase 3;
// `oneGateCatchesCharactersPlainTextCantCarry` is in textNormalizer.test.ts; the prompt case is in
// core/prompts/prompts.test.ts.)

import { describe, expect, it } from "vitest";
import { looksFlattened } from "./flattenedMath";

describe("FlattenedMath", () => {
  it.each(["n k=1 k 2 = n(n + 1) 4", "arcsen x 1+x2", "1 (cosh x) x", "Mostre que ∑ k3 = n(n+1)", "f(x) = ⎧ x2"])(
    "spots the flattened formula %s",
    (text) => {
      expect(looksFlattened(text)).toBe(true);
    },
  );

  it("fraction parts on lines of their own are spotted", () => {
    expect(looksFlattened("Calcule\n1\nx\n2\n= 3")).toBe(true);
  });

  it.each([
    "2. Usando o princípio de indução matemática, demonstre a seguinte afirmação:\nn\nk=1\nk\n2\n=\nn(n + 1)\n4 , n ∈N.",
    "3. Considere a função f : R \\{0}→R definida por\nf (x) = arcsen x\n1+x2 , se x < 0,\n1\n(cosh x)\nx, se x > 0.\n(ii) A função f é diferenciável em R\\{0}? Justifique.",
  ])("a display formula split into lines is spotted (%#)", (text) => {
    expect(looksFlattened(text)).toBe(true);
  });

  it.each(["Qual é a resistência equivalente?\nA) 12 V\nB) 24 V\nC) 36 V", "Resolva a equação\nx = 2y + 3\ny = 1"])(
    "options and plain equations on lines of their own are left alone (%#)",
    (text) => {
      expect(looksFlattened(text)).toBe(false);
    },
  );

  it.each([
    "(2) A equação seguinte é exacta.\nα2ye2t\n−y2et + eαt\n−2yet dy\ndt = 0.\n(a) (5,0 val.) Determine a sua solução particular y(t) que verifica y(0) = 1.",
    "(1) (6,0 val.) Determine a solução geral da equação\ny\n−\nt sen (ty) + 1\nt−sen (ty) dy\ndt = 0 (para t > 0).",
  ])("glued exponents and a flat derivative are spotted (%#)", (text) => {
    expect(looksFlattened(text)).toBe(true);
  });

  it.each(["Resolva dy/dt = 2y com y(0) = 1.", "A reação produz CO2 e H2O.", "Considere a matriz A2 e o vetor v."])(
    "derivatives with a slash and chemistry are left alone: %s",
    (text) => {
      expect(looksFlattened(text)).toBe(false);
    },
  );

  it.each([
    "Determine o valor de x quando t = 2 s.",
    "Um carro parte do repouso e acelera a 3 m/s durante 4 s.",
    "2.1. Calcule o limite da função no ponto a.",
    "x = 2y + 3",
    "A) 12 V\nB) 24 V\nC) 36 V",
  ])("plain prose and simple equations are left alone: %s", (text) => {
    expect(looksFlattened(text)).toBe(false);
  });
});
