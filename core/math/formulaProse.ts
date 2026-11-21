// A formula the model wrote with a sentence at its end («f(c) = d \quad \text{pelo Teorema de Bolzano-Cauchy}»):
// the sentence is words, not maths. In the Formulas column it was set in KaTeX's serif text font, as wide as the
// formula, and ran to the screen's edge (live test 2026-11-21). Split off, it is shown under the formula as a caption.

const sentenceAtEnd =
  /^(.*?)(?:\s*(?:\\[,;:!]|\\q?quad|~|\\ )\s*)*\\(?:text|mbox|textrm|mathrm)\{([^{}]+)\}\s*\.?\s*$/s;

/** The formula and the trailing sentence (two words or more), or the formula alone when it ends in maths. */
export function trailingProse(latex: string): { math: string; prose: string | null } {
  const match = sentenceAtEnd.exec(latex);
  if (!match) return { math: latex, prose: null };
  const [, math, words] = match;
  const prose = words!.trim();
  if (math!.trim() === "" || prose.split(/\s+/).length < 2) return { math: latex, prose: null };
  return { math: math!.trim().replace(/[,;]\s*$/, ""), prose };
}
