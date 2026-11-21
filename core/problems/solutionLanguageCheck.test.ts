// Port of LearnLayerTests/SolutionLanguageCheckTests.swift @ 5701363: an answer in two languages (titles in
// Portuguese under English notes) is told apart from one that only quotes the exam or names a mathematician.
import { describe, expect, it } from "vitest";
import { decodeProblemSolution } from "./problemSolution";
import { SolutionLanguageCheck } from "./solutionLanguageCheck";

describe("SolutionLanguageCheck", () => {
  it("flags Portuguese titles under an English tutor", () => {
    // Titles a cheaper model wrote with the tutor in English (8 Nov 2026, washer questions).
    for (const title of [
      "Área da arruela",
      "Pontos de interseção",
      "Qual curva é a externa",
      "Interseção das curvas",
      "Método das anilhas",
      "Cálculo da integral",
      "Definição da casca cilíndrica",
    ])
      expect(SolutionLanguageCheck.isOtherLanguage(title, "en"), title).toBe(true);
  });

  it("does not flag English text for an English tutor", () => {
    for (const text of [
      "Disk method formula",
      "Set up the integral",
      "Evaluate the integral",
      "Cross-sectional area",
      "The limits of integration are where the two curves meet, so solve x = x² to find them.",
      "By de Moivre's theorem the modulus is raised to the n-th power.",
      "Apply l'Hôpital's rule once more: the limit is 1/2.",
      'The exam calls it "região limitada pelas curvas", the region between them.',
      "The region is «limitada pelas curvas y = x e y = x²».",
      "V = 2π/15 ≈ 0.419 cubic units",
    ])
      expect(SolutionLanguageCheck.isOtherLanguage(text, "en"), text).toBe(false);
  });

  it("flags English under a Portuguese tutor, and not Portuguese", () => {
    expect(SolutionLanguageCheck.isOtherLanguage("Find the points where the curves meet", "pt")).toBe(true);
    expect(SolutionLanguageCheck.isOtherLanguage("The outer radius is the line y = x", "pt")).toBe(true);
    for (const text of [
      "Pontos de interseção",
      "Se x for positivo, o raio é x.",
      "Calcula-se o integral entre 0 e 1.",
      "Disk method",
    ])
      expect(SolutionLanguageCheck.isOtherLanguage(text, "pt"), text).toBe(false);
  });

  it("tolerates one stray title, not two", () => {
    const solution = (titles: string[]) =>
      decodeProblemSolution({
        subject: "Calculus",
        parts: [
          {
            label: "4",
            asks: "Calcule o volume.",
            hint: "Find where the curves meet.",
            steps: ["Solve x = x²."],
            answer: { text: "V = 2π/15" },
            uses: [],
            cards: titles.map((title) => ({ title, latex: "x", note: "The two curves meet at x = 0 and x = 1." })),
          },
        ],
      })!;
    expect(SolutionLanguageCheck.mismatch(solution(["Pontos de interseção", "Set up the integral"]), "en")).toBe(false);
    expect(SolutionLanguageCheck.mismatch(solution(["Pontos de interseção", "Área da arruela"]), "en")).toBe(true);
  });
});
