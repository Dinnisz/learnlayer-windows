// The model writes short labels in ASCII («ramo para x <= 3», «v -> 0»). On screen they read as maths does:
// ≤, ≥, ≠, →. Only between spaces or next to a letter or digit, so code («a->b» in C) is not touched by a stray rule.

const replacements: [RegExp, string][] = [
  [/(^|[\s\w)])<=(?=[\s\w(-])/g, "$1≤"],
  [/(^|[\s\w)])>=(?=[\s\w(-])/g, "$1≥"],
  [/(^|[\s\w)])!=(?=[\s\w(-])/g, "$1≠"],
  [/(^|\s)->(?=\s)/g, "$1→"],
  [/(^|\s)=>(?=\s)/g, "$1⇒"],
];

/**
 * LaTeX the model wrote with ASCII signs, as maths sets them: «x <= 3» → «x \le 3», «g(-1) * g(0)» → «g(-1) \cdot
 * g(0)». KaTeX draws «<=» as two signs and «*» as an asterisk. A star raised or lowered (z^*, x_*) stays.
 */
export function latexOperators(latex: string): string {
  return latex
    .replace(/<=/g, String.raw`\le `)
    .replace(/>=/g, String.raw`\ge `)
    .replace(/!=/g, String.raw`\ne `)
    .replace(/(^|[^_^{*])\*(?![*}])/g, String.raw`$1\cdot `);
}

/** A short label with its ASCII comparison and arrow signs written as maths: «x <= 3» → «x ≤ 3». */
export function readableOperators(text: string): string {
  return replacements.reduce((result, [pattern, sign]) => result.replace(pattern, sign), text);
}
