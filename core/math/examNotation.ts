// Port of LearnLayer/Math/ExamNotation.swift @ ref 2026-11-04: the exam's own name for a function, in the formula and in
// the sentences around it. Portuguese writes sen; English writes sin.

export const ExamNotation = {
  prefersSen(language: string): boolean {
    const lower = language.toLowerCase();
    return lower.includes("portug") || lower.startsWith("pt");
  },

  /** `\sin` or `\sen` in LaTeX, matching `language`. */
  trigInLatex(latex: string, language: string): string {
    if (ExamNotation.prefersSen(language))
      return latex.replace(/\\mathrm\{sin\}/g, "\\mathrm{sen}").replace(/\\sin(?![A-Za-z])/g, "\\sen");
    return latex.replace(/\\mathrm\{sen\}/g, "\\mathrm{sin}").replace(/\\sen(?![A-Za-z])/g, "\\sin");
  },

  /** The word sen or sin in a sentence, without touching a longer word ("sinal" stays "sinal"). */
  trigInProse(text: string, language: string): string {
    return ExamNotation.prefersSen(language) ? text.replace(/\bsin\b/g, "sen") : text.replace(/\bsen\b/g, "sin");
  },
};
