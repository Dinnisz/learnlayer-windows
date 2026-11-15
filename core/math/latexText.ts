// Port of LearnLayer/Math/LatexText.swift (and `MathView.withAccents`) @ ref 2026-11-04
//
// The renderer on the Mac is SwiftMath; on Windows it is KaTeX. The rewrites stay the same so both apps
// send the same strings to the same tests; the commands KaTeX lacks (`\decimalcomma`, `\sen`, `\tg`…)
// are defined as macros where the interface typesets (ui/math/katexMacros.ts).

/** One brace group, with a single level of braces inside it. */
const braceGroup = String.raw`(?:[^{}]|\{[^{}]*\})*`;

const isLetter = (character: string | undefined) => character !== undefined && /\p{L}/u.test(character);
const graphemes = (text: string) => Array.from(text).length;

/** Replaces every match; `$1`… in `replacement` are the groups, a backslash is literal. */
function replaceAll(text: string, pattern: string, replacement: string, flags = ""): string {
  return text.replace(new RegExp(pattern, "g" + flags), replacement);
}

/** `\'e`, `\'{e}`, `\c{c}`… as the accented letters they write. */
export function withAccents(latex: string): string {
  let text = latex;
  const marks: [string, string][] = [
    [String.raw`\\'`, "́"],
    [String.raw`\\\``, "̀"],
    [String.raw`\\~`, "̃"],
    [String.raw`\\\^`, "̂"],
    [String.raw`\\"`, "̈"],
  ];
  for (const [command, mark] of marks) {
    text = replaceAll(text, command + String.raw`\{?([A-Za-z])\}?`, "$1" + mark);
  }
  text = replaceAll(text, String.raw`\\c\{?([cC])\}?`, "$1̧");
  return text.normalize("NFC");
}

/** Symbols as the commands that draw them. The renderer reads only ASCII outside its own commands. */
export const symbolCommands: Readonly<Record<string, string>> = {
  α: String.raw`\alpha`,
  β: String.raw`\beta`,
  γ: String.raw`\gamma`,
  δ: String.raw`\delta`,
  ε: String.raw`\varepsilon`,
  ϵ: String.raw`\epsilon`,
  ζ: String.raw`\zeta`,
  η: String.raw`\eta`,
  θ: String.raw`\theta`,
  ϑ: String.raw`\vartheta`,
  ι: String.raw`\iota`,
  κ: String.raw`\kappa`,
  λ: String.raw`\lambda`,
  μ: String.raw`\mu`,
  ν: String.raw`\nu`,
  ξ: String.raw`\xi`,
  π: String.raw`\pi`,
  ρ: String.raw`\rho`,
  σ: String.raw`\sigma`,
  ς: String.raw`\varsigma`,
  τ: String.raw`\tau`,
  υ: String.raw`\upsilon`,
  φ: String.raw`\varphi`,
  ϕ: String.raw`\phi`,
  χ: String.raw`\chi`,
  ψ: String.raw`\psi`,
  ω: String.raw`\omega`,
  Γ: String.raw`\Gamma`,
  Δ: String.raw`\Delta`,
  Θ: String.raw`\Theta`,
  Λ: String.raw`\Lambda`,
  Ξ: String.raw`\Xi`,
  Π: String.raw`\Pi`,
  Σ: String.raw`\Sigma`,
  Υ: String.raw`\Upsilon`,
  Φ: String.raw`\Phi`,
  Ψ: String.raw`\Psi`,
  Ω: String.raw`\Omega`,
  "∞": String.raw`\infty`,
  "≤": String.raw`\leq`,
  "≥": String.raw`\geq`,
  "≠": String.raw`\neq`,
  "≈": String.raw`\approx`,
  "≃": String.raw`\simeq`,
  "≡": String.raw`\equiv`,
  "→": String.raw`\to`,
  "←": String.raw`\leftarrow`,
  "↔": String.raw`\leftrightarrow`,
  "⇒": String.raw`\Rightarrow`,
  "⇔": String.raw`\Leftrightarrow`,
  "∈": String.raw`\in`,
  "∉": String.raw`\notin`,
  "⊂": String.raw`\subset`,
  "⊃": String.raw`\supset`,
  "⊆": String.raw`\subseteq`,
  "⊇": String.raw`\supseteq`,
  "∪": String.raw`\cup`,
  "∩": String.raw`\cap`,
  "∧": String.raw`\wedge`,
  "∨": String.raw`\vee`,
  "¬": String.raw`\neg`,
  "±": String.raw`\pm`,
  "∓": String.raw`\mp`,
  "×": String.raw`\times`,
  "÷": String.raw`\div`,
  "·": String.raw`\cdot`,
  "∘": String.raw`\circ`,
  "∀": String.raw`\forall`,
  "∃": String.raw`\exists`,
  "∅": String.raw`\emptyset`,
  "∂": String.raw`\partial`,
  "∇": String.raw`\nabla`,
  "∑": String.raw`\sum`,
  "∏": String.raw`\prod`,
  "∫": String.raw`\int`,
  "…": String.raw`\ldots`,
  "⋯": String.raw`\cdots`,
  "↘": String.raw`\searrow`,
  "↗": String.raw`\nearrow`,
  ℝ: String.raw`\mathbb{R}`,
  ℕ: String.raw`\mathbb{N}`,
  ℤ: String.raw`\mathbb{Z}`,
  ℚ: String.raw`\mathbb{Q}`,
  ℂ: String.raw`\mathbb{C}`,
  "°": String.raw`^{\circ}`,
  "−": "-",
  "–": "-",
  "′": "'",
  "″": "''",
  "½": String.raw`\frac{1}{2}`,
  "⅓": String.raw`\frac{1}{3}`,
  "⅔": String.raw`\frac{2}{3}`,
  "¼": String.raw`\frac{1}{4}`,
  "¾": String.raw`\frac{3}{4}`,
  "⅕": String.raw`\frac{1}{5}`,
  "⅙": String.raw`\frac{1}{6}`,
  "⅛": String.raw`\frac{1}{8}`,
};

const pairs = (keys: string, values: string): Record<string, string> => {
  const from = Array.from(keys);
  const to = Array.from(values);
  return Object.fromEntries(from.map((key, index) => [key, to[index]!]));
};

/** Superscript and subscript characters, as what they raise or lower. */
export const raised = pairs("⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣʸᶻᵃᵇᶜᵈᵉᶠᵍʰʲᵏˡᵐᵒᵖʳˢᵗᵘᵛʷ", "0123456789+-=()nixyzabcdefghjklmoprstuvw");
export const lowered = pairs("₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜᵢⱼ", "0123456789+-=()aeoxhklmnpstij");

/** θ, →, ½ and the rest as commands; a run of ³⁻ˣ as ^{3-x}, of ₁₂ as _{12}. */
export function commandsForSymbols(latex: string): string {
  let output = "";
  let script: { mark: string; text: string } | null = null;
  const flush = () => {
    if (script) output += `${script.mark}{${script.text}}`;
    script = null;
  };
  for (const character of latex) {
    const up = raised[character];
    const down = lowered[character];
    if (up !== undefined || down !== undefined) {
      const mark = up !== undefined ? "^" : "_";
      if ((script as { mark: string } | null)?.mark !== mark) {
        flush();
        script = { mark, text: "" };
      }
      script!.text += up ?? down;
      continue;
    }
    flush();
    const command = symbolCommands[character];
    if (command !== undefined) {
      output += command;
      // "\theta x", not "\thetax".
      if (isLetter(command[command.length - 1])) output += " ";
    } else {
      output += character;
    }
  }
  flush();
  return output;
}

/**
 * An interval that opens with "]" or closes with "[" ("]−1, 0[", "[0, 3[").
 * The renderer takes "]" for a closing bracket and spaces the minus after
 * it as a subtraction ("] − 1, 0["). \left and \right make the pair one
 * group, as TeX does. Intervals are read left to right, so the "]" that
 * closes "[0, 3]" is not taken for the opening of the next one.
 */
export function groupingIntervals(latex: string): string {
  const side = String.raw`(?:[^\[\]{},;]|\{(?:[^{}]|\{[^{}]*\})*\})+`;
  const pattern = new RegExp(
    String.raw`(?<!\\left)(?<!\\right)([\[\]])(` + side + "[,;]" + side + String.raw`)([\[\]])`,
    "g",
  );
  return latex.replace(pattern, (whole, open: string, inner: string, close: string) => {
    const sides = inner.split(/[,;]/);
    const filled = sides.length === 2 && sides.every((piece) => piece.trim() !== "");
    return filled && (open === "]" || close === "[")
      ? String.raw`\left` + open + inner + String.raw`\right` + close
      : whole;
  });
}

/**
 * `\left\{ \begin{array}{ll} … \end{array} \right.`, how a formula reader (Pix2Text) writes a function by
 * branches, as `\begin{cases} … \end{cases}`, which the renderer draws; the cells' own braces stay as groups.
 */
export function casesFromArray(latex: string): string {
  const cases = replaceAll(
    latex,
    String.raw`\\left\s*(?:\\\{|\\lbrace(?![A-Za-z]))\s*\\begin\s*\{array\}\s*\{[^{}]*\}((?:(?!\\end\s*\{array\}).)*)\\end\s*\{array\}\s*\\right\s*\.`,
    String.raw`\begin{cases}$1\end{cases}`,
    "s",
  );
  // "= { \begin{cases} … \end{cases} }": the group around it is only the reader's.
  return replaceAll(
    cases,
    String.raw`(?<!\\)\{\s*(\\begin\{cases\}(?:(?!\\end\{cases\}).)*\\end\{cases\})\s*\}`,
    "$1",
    "s",
  );
}

/**
 * A formula reader's spaced tokens, as the renderer reads them: "\mathrm { ~ s e ~ }" → "\mathrm{\; s e \; }",
 * "e ^ { x }" → "e^{ x }". `\displaystyle` and `\textstyle` go (a formula block is in display already), and a
 * tie `~` is a space command.
 */
export function spacedTokensClosed(latex: string): string {
  let text = replaceAll(latex, String.raw`\\(?:displaystyle|textstyle)(?![A-Za-z])\s*`, "");
  text = replaceAll(text, String.raw`(?<!\\)~`, String.raw`\; `);
  text = replaceAll(text, String.raw`(\\[A-Za-z]+)\s+\{`, "$1{");
  text = replaceAll(text, String.raw`(?<!\\)\s*([\^_])\s+`, "$1");
  return text;
}

function dropTrailingLoneBackslash(text: string): string {
  let trimmed = text;
  while (trimmed.endsWith("\\")) {
    const dropOne = trimmed.slice(0, -1);
    if (dropOne.endsWith("\\")) break;
    trimmed = dropOne;
  }
  return trimmed;
}

/** Solver lines sometimes end with a stray `\`; trim that without touching TeX row breaks (`\\ `). */
function trimStrayTrailingBackslash(text: string): string {
  return dropTrailingLoneBackslash(text.trim());
}

/** `\begin{array}`, `\implies`, `\geqslant`, `\pmod` and the rest of the commands the renderer does not parse. */
function rewritingUnsupportedCommands(latex: string): string {
  let text = latex;
  const inner = braceGroup;
  const replace = (pattern: string, replacement: string) => {
    text = replaceAll(text, pattern, replacement);
  };
  const r = String.raw;
  // Dropping the environment leaves "&" and "\\" , which build a table.
  replace(r`\\begin\{array\}\{` + inner + r`\}`, "");
  replace(r`\\end\{array\}`, "");
  replace(r`\\hline(?![A-Za-z])`, "");
  replace(r`\\begin\{align\*?\}`, r`\begin{aligned}`);
  replace(r`\\end\{align\*?\}`, r`\end{aligned}`);
  replace(r`\\begin\{equation\*?\}`, "");
  replace(r`\\end\{equation\*?\}`, "");
  replace(r`\\begin\{gather\*\}`, r`\begin{gather}`);
  replace(r`\\end\{gather\*\}`, r`\end{gather}`);
  replace(r`\\geqslant(?![A-Za-z])`, r`\geq`);
  replace(r`\\geqq(?![A-Za-z])`, r`\geq`);
  replace(r`\\leqslant(?![A-Za-z])`, r`\leq`);
  replace(r`\\leqq(?![A-Za-z])`, r`\leq`);
  replace(r`\\varnothing(?![A-Za-z])`, r`\emptyset`);
  replace(r`\\implies(?![A-Za-z])`, r`\Rightarrow`);
  replace(r`\\impliedby(?![A-Za-z])`, r`\Leftarrow`);
  replace(r`\\[lr]Vert(?![A-Za-z])`, r`\|`);
  replace(r`\\[lr]vert(?![A-Za-z])`, "|");
  replace(r`\\(?:stackrel|overset)\{(` + inner + r`)\}\{(` + inner + r`)\}`, "$2^{$1}");
  replace(r`\\underset\{(` + inner + r`)\}\{(` + inner + r`)\}`, "$2_{$1}");
  replace(r`\\(?:underbrace|overbrace)\{(` + inner + r`)\}`, "$1");
  replace(
    r`\\(?:boxed|cancel|bcancel|xcancel|sout|phantom|hphantom|vphantom|smash|mathclap|mathllap|mathrlap)\{(` +
      inner +
      r`)\}`,
    "$1",
  );
  replace(r`\\cancelto\{(` + inner + r`)\}\{(` + inner + r`)\}`, "$2 ($1)");
  replace(r`\\pmod\{(` + inner + r`)\}`, r`(\mathrm{mod}\ $1)`);
  replace(r`\\pod\{(` + inner + r`)\}`, "($1)");
  replace(r`\\mod(?![A-Za-z])`, r`\;\mathrm{mod}`);
  replace(r`\\(?:boldsymbol|pmb)\{`, r`\mathbf{`);
  replace(r`\\bm\{`, r`\mathbf{`);
  replace(r`\\(?:textrm|textup|textnormal|mbox)\{`, r`\text{`);
  replace(r`\\(?:ce|pu)\{(` + inner + r`)\}`, r`\mathrm{$1}`);
  replace(r`\\(?:SI|qty)\{(` + inner + r`)\}\{(` + inner + r`)\}`, r`$1\,\mathrm{$2}`);
  replace(r`\\num\{(` + inner + r`)\}`, "$1");
  replace(r`\\prescript\{(` + inner + r`)\}\{(` + inner + r`)\}\{(` + inner + r`)\}`, "^{$1}_{$2}$3");
  replace(r`\\substack\{(` + inner + r`)\}`, r`\begin{matrix}$1\end{matrix}`);
  replace(r`\\(?:tag|label)\{` + inner + r`\}`, "");
  replace(r`\\(?:nonumber|notag|allowbreak|nobreak|linebreak)(?![A-Za-z])`, "");
  replace(r`\\newline(?![A-Za-z])`, r`\\`);
  replace(r`\\middle(?![A-Za-z])`, "");
  replace(r`\\:`, r`\;`);
  replace(r`\\not\\in(?![A-Za-z])`, r`\notin`);
  replace(r`\\not\\eq(?![A-Za-z])`, r`\neq`);
  replace(r`\\not=`, r`\neq`);
  replace(r`\\not(?![A-Za-z])`, r`\neg`);
  replace(r`\\because(?![A-Za-z])`, r`\text{because}`);
  replace(
    r`\\(?:hspace|vspace|kern|mkern|hskip|vskip)\*?(?:\s*\{[^{}]*\}|\s*[+-]?[0-9.]+\s*(?:pt|em|mu|mm|cm|ex|in|pc)?)`,
    "",
  );
  replace(r`\\DeclareMathOperator\*?\{` + inner + r`\}\{` + inner + r`\}`, "");
  return text;
}

/**
 * "or" between two solutions (`x = -1 \quad \vee \quad x = 3`) with the operator's own
 * spacing: the renderer drops a space written before it and keeps the one after, so a
 * `\quad` around it left a wide gap on one side only.
 */
export function tightConnectives(latex: string): string {
  const space = String.raw`(?:\s|~|(?<!\\)\\(?:q?quad(?![A-Za-z])|[,;:> ]))*`;
  return replaceAll(latex, space + String.raw`\\(?:vee|lor)(?![A-Za-z])` + space, String.raw` \vee `);
}

/** Binary operators the renderer spaces against the atom before them. */
const binaryOperator = String.raw`(?:[+\-*]|\\(?:times|cdot|div|pm|mp|ast|star|circ|bullet|wedge|vee|land|lor|cap|cup|oplus|ominus|otimes|odot|oslash|setminus|amalg|wr|uplus|sqcap|sqcup|dagger|ddagger)(?![A-Za-z]))`;
/** `\,` `\:` `\>` `\;` `\!` `\ ` `\quad` `\qquad`. The renderer skips these and still pairs the atoms on either side. */
const spacingCommand = String.raw`(?:\\(?:[,;:!>]| |qquad|quad)\s*)`;

/**
 * A spacing command hides the atom before a binary operator, so the
 * operator is not reclassified and SwiftMath asserts: punctuation, a relation, an open
 * delimiter, a large operator or another binary operator, then `\times`
 * and the rest. The operator keeps its own spacing instead.
 */
export function avoidingTypesetterAssertion(latex: string): string {
  return replaceAll(latex, spacingCommand + "+(?=" + binaryOperator + ")", " ");
}

/** True when typesetting `latex` as written would hit that SwiftMath assertion. */
export function wouldTripTypesetter(latex: string): boolean {
  const left =
    String.raw`(?:(?<!\\)[,;:=<>()\[\]]|\\(?:colon|cdotp|sum|int|prod|lim|Rightarrow|Leftarrow|Leftrightarrow|rightarrow|leftarrow|to|implies|iff|le|leq|ge|geq|neq|ne|approx|equiv|sim|simeq|cong|in|notin|subset|subseteq|supset|mapsto|propto|longrightarrow|Longrightarrow|Longleftrightarrow)(?![A-Za-z])|[+\-*]|` +
    binaryOperator +
    ")";
  const gap = String.raw`(?:\s*` + spacingCommand + String.raw`\s*)+`;
  return new RegExp(left + gap + binaryOperator).test(latex);
}

/** Shorthand the renderer doesn't read, in the form it does: \tfrac and \dfrac as \frac, \frac92 as \frac{9}{2}. */
export function normalized(latex: string): string {
  const r = String.raw;
  let text = commandsForSymbols(trimStrayTrailingBackslash(tightConnectives(latex)));
  text = spacedTokensClosed(casesFromArray(text));
  text = replaceAll(text, r`\\(?:tfrac|dfrac|cfrac|nicefrac|sfrac|flatfrac)(?![A-Za-z])`, r`\frac`);
  text = replaceAll(text, r`\\(?:dbinom|tbinom)(?![A-Za-z])`, r`\binom`);
  // \frac92, \frac1{x}, \frac{x}2: a single digit or letter without braces.
  const token = r`(\{(?:[^{}]|\{[^{}]*\})*\}|\\[A-Za-z]+|[0-9A-Za-z])`;
  text = replaceAll(text, r`\\frac\s*` + token + r`\s*` + token, r`\frac{$1}{$2}`);
  // The braces now doubled around a group that had them: {{x}} → {x}.
  text = replaceAll(text, r`\\frac\{\{((?:[^{}]|\{[^{}]*\})*)\}\}\{`, r`\frac{$1}{`);
  text = replaceAll(text, r`(\\frac\{(?:[^{}]|\{[^{}]*\})*\})\{\{((?:[^{}]|\{[^{}]*\})*)\}\}`, "$1{$2}");
  text = replaceAll(text, r`\\frac\{\\([A-Za-z]+)\}`, r`\frac{\$1}`);
  // "\ " spacing, and \! which only tightens. A row break is "\\ ", and that second backslash must stay a break.
  text = replaceAll(text, r`(?<!\\)\\ `, r`\; `);
  text = replaceAll(text, r`\\!`, "");
  // Commands the renderer lacks, as ones it has: upright names, arrows, symbols.
  // A function name written upright is still an operator: "g sen θ", not "gsenθ".
  text = replaceAll(
    text,
    r`\\(?:operatorname\*?|mathrm)\{(sen|sin|cos|tg|tan|cotg|cot|sgn|arcsen|arcsin|arccos|arctg|arctan|ln|log|exp)\}`,
    r`\$1 `,
  );
  text = replaceAll(text, r`\\operatorname\*?\{`, r`\mathrm{`);
  text = replaceAll(text, r`\\bmod(?![A-Za-z])`, r`\;\mathrm{mod}\;`);
  // TeX reads a braced comma as an ordinary symbol: 20{,}09 has no space after the comma.
  text = replaceAll(text, r`([0-9])\s*\{,\}\s*(?=[0-9])`, r`$1\decimalcomma `);
  text = groupingIntervals(text);
  text = replaceAll(text, r`\\[Bb]igg?[lr]?(?![A-Za-z])`, "");
  text = replaceAll(text, r`\\xrightarrow\{((?:[^{}]|\{[^{}]*\})*)\}`, r`\longrightarrow^{$1}`);
  text = replaceAll(text, r`\\xleftarrow\{((?:[^{}]|\{[^{}]*\})*)\}`, r`\longleftarrow^{$1}`);
  text = replaceAll(text, r`\\xrightarrow(?![A-Za-z{])`, r`\longrightarrow`);
  text = replaceAll(text, r`\\xleftarrow(?![A-Za-z{])`, r`\longleftarrow`);
  text = replaceAll(text, r`\\overrightarrow(?![A-Za-z])`, r`\vec`);
  text = replaceAll(text, r`\\dots(?![A-Za-z])`, r`\ldots`);
  // The renderer drops "'"; TeX reads f' as f^{\prime}. An apostrophe inside a word (\text{d'água}) or an accent (\'e) stays.
  for (const [marks, primes] of [
    ["'''", r`\prime\prime\prime`],
    ["''", r`\prime\prime`],
    ["'", r`\prime`],
  ] as const) {
    text = replaceAll(text, r`(?<![\\'])` + marks + r`(?![\p{L}'])`, "^{" + primes + "}", "u");
  }
  for (const [command, symbol] of [
    ["therefore", "∴"],
    ["rightleftharpoons", "⇌"],
    ["checkmark", "✓"],
  ] as const) {
    text = replaceAll(text, r`\\` + command + r`(?![A-Za-z])`, r`\text{` + symbol + "}");
  }
  // Commands the renderer rejects, written as ones it accepts. Before the spacing pass.
  return avoidingTypesetterAssertion(rewritingUnsupportedCommands(dropTrailingLoneBackslash(text)));
}

/** The cells of a \begin{array}…\end{array} (a sign or variation table), row by row, or null when it isn't one table. */
export function tableRows(latex: string): string[][] | null {
  const trimmed = latex.trim();
  if (!trimmed.startsWith(String.raw`\begin{array}`) || !trimmed.endsWith(String.raw`\end{array}`)) return null;
  let body = trimmed.replace(/^\\begin\{array\}\{[^{}]*\}/, "");
  body = body.replace(/\\end\{array\}$/, "").replace(/\\hline/g, "");
  const rows = body
    .split("\\\\")
    .map((row) => row.split("&").map((cell) => cell.trim()))
    .filter((row) => !row.every((cell) => cell === ""));
  if (rows.length < 2) return null;
  const width = Math.max(...rows.map((row) => row.length));
  return rows.map((row) => [...row, ...new Array<string>(width - row.length).fill("")]);
}

/** The first group of every match. */
function matches(pattern: string, text: string, flags = ""): string[] {
  return Array.from(text.matchAll(new RegExp(pattern, "g" + flags)), (match) => match[1] ?? "");
}

/**
 * Mostly words: the \text{…} parts hold the content and little maths
 * is left outside them. Shown as wrapped text, not typeset on one line.
 */
export function isProse(latex: string): boolean {
  const groups = matches(String.raw`\\(?:text|textbf|mathrm|operatorname)\{([^{}]*)\}`, latex);
  const words = groups.join(" ");
  const letters = Array.from(words).filter((character) => isLetter(character)).length;
  if (letters < 25) return false;
  let rest = replaceAll(latex, String.raw`\\(?:text|textbf|mathrm|operatorname)\{[^{}]*\}`, "");
  rest = replaceAll(rest, String.raw`\\(?:quad|qquad|;|,|:)|[\s.,;:!?()]`, "");
  if (graphemes(rest) <= Math.max(6, Math.floor(letters / 5))) return true;
  // A sentence whose maths is only names ("Só C está à distância |OP| de O"): no relation,
  // operator, script or command outside the words.
  const wordCount = matches(String.raw`(\p{L}{2,})`, words, "u").length;
  return wordCount >= 4 && !/[=<>+\-^_\\{}/*]/.test(rest);
}

export interface LatexPiece {
  isText: boolean;
  content: string;
}

/**
 * The formula cut into its top-level \text{…} pieces (words) and the maths between them, when some words
 * carry accents: the renderer draws an accented letter as a slanted maths accent, so those words are set
 * in a text font instead. Null when there are none.
 */
export function accentedTextPieces(latex: string): LatexPiece[] | null {
  const pieces: LatexPiece[] = [];
  let math = "";
  const commands = [String.raw`\textbf{`, String.raw`\text{`, String.raw`\mathrm{`];
  let depth = 0;
  let index = 0;
  while (index < latex.length) {
    const command = depth === 0 ? commands.find((candidate) => latex.startsWith(candidate, index)) : undefined;
    if (command) {
      // The group's end, minding nested braces.
      let end = index + command.length;
      let level = 1;
      let inner = "";
      while (end < latex.length) {
        const character = latex[end]!;
        if (character === "{") level += 1;
        else if (character === "}") {
          level -= 1;
          if (level === 0) break;
        }
        inner += character;
        end += 1;
      }
      if (end >= latex.length) return null;
      if (math !== "") {
        pieces.push({ isText: false, content: math });
        math = "";
      }
      pieces.push({ isText: true, content: withAccents(inner) });
      index = end + 1;
      continue;
    }
    const character = latex[index]!;
    if (character === "{") depth += 1;
    else if (character === "}") depth = Math.max(0, depth - 1);
    math += character;
    index += 1;
  }
  if (math !== "") pieces.push({ isText: false, content: math });
  const accented = pieces.some(
    (piece) => piece.isText && Array.from(piece.content).some((c) => c.codePointAt(0)! > 0x7f && isLetter(c)),
  );
  if (!accented) return null;
  // Punctuation opening the words stays with the maths before them ("0]; crescente").
  for (let position = 1; position < pieces.length; position += 1) {
    const piece = pieces[position]!;
    const before = pieces[position - 1]!;
    if (!piece.isText || before.isText) continue;
    const lead = /^[;,.:]*/.exec(piece.content)![0];
    if (lead === "") continue;
    before.content += lead;
    piece.content = piece.content.slice(lead.length);
  }
  // Spacing alone between pieces is the gap the layout already leaves.
  return pieces.filter(
    (piece) => piece.isText || replaceAll(piece.content, String.raw`\\(?:quad|qquad|;|,|:)|\s`, "") !== "",
  );
}

/** Plain text that is mostly words (an answer in Portuguese, an essay point), as opposed to a result shown like maths. */
export function isProsePlain(text: string): boolean {
  return matches(String.raw`(\p{L}{3,})`, text, "u").length >= 6;
}

/**
 * A command escaped twice (`\\text{…}`, `\\infty`) is the command, not a line break followed by the word "text".
 * A real `\\` has a space or a command after it, never letters straight away.
 */
export function undoubledCommands(latex: string): string {
  return replaceAll(latex, String.raw`(?<!\\)\\\\(?=[A-Za-z]{2,})`, "\\");
}

/** Letters that name a neighbourhood or a tolerance when written after a capital. */
const neighbourhoodGreek = "delta|varepsilon|epsilon";
/** Greek names that are never a product of single-letter variables. */
const greekNames = "alpha|beta|gamma|delta|varepsilon|epsilon|theta|lambda|sigma|omega";

/** A neighbourhood written without its underscore, V\delta(c), as V_{\delta}(c). */
export function gluedSubscripts(latex: string): string {
  return replaceAll(
    latex,
    String.raw`(?<![A-Za-z\\])([A-Z])\\(` + neighbourhoodGreek + ")(?![A-Za-z])",
    String.raw`$1_{\$2}`,
  );
}

/**
 * Maths the solver marked as LaTeX (between "$"), with the slips that show up in it mended: a Greek name that
 * lost its backslash ("delta", "Vdelta(c)") is the letter again, and a neighbourhood gets its subscript.
 */
export function mendedInline(latex: string): string {
  let text = replaceAll(
    latex,
    String.raw`(?<![A-Za-z\\])([A-Z])(` + neighbourhoodGreek + ")(?![A-Za-z])",
    String.raw`$1_{\$2}`,
  );
  text = replaceAll(text, String.raw`(?<![A-Za-z\\])(` + greekNames + ")(?![A-Za-z])", String.raw`\$1`);
  return gluedSubscripts(text);
}

const superscript = pairs("0123456789+-−nxi()", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻ⁿˣⁱ⁽⁾");
const subscriptMap = pairs("0123456789+-nxiaeohklmpstjruv", "₀₁₂₃₄₅₆₇₈₉₊₋ₙₓᵢₐₑₒₕₖₗₘₚₛₜⱼᵣᵤᵥ");

/** ^{…} and ^x as superscript letters when they all have one, else ^(…); _ likewise. */
function superscripts(text: string): string {
  let out = text;
  for (const [mark, map] of [
    ["^", superscript],
    ["_", subscriptMap],
  ] as const) {
    const escaped = mark === "^" ? String.raw`\^` : "_";
    for (const pattern of [escaped + String.raw`\{([^{}]*)\}`, escaped + String.raw`([0-9A-Za-z+\-])`]) {
      out = out.replace(new RegExp(pattern, "g"), (_whole, inner: string) => {
        const characters = Array.from(inner);
        const mapped = characters.map((character) => map[character]);
        if (characters.length > 0 && mapped.every((value) => value !== undefined)) return mapped.join("");
        return characters.length === 1 ? mark + inner : `${mark}(${inner})`;
      });
    }
  }
  return out;
}

/** ⟦…⟧ (a numerator or root) loses its marks when it is one term; ⟪…⟫ (a denominator) only when it is one number or letter. */
function bracketed(text: string): string {
  let out = text;
  for (;;) {
    const match = /⟦[^⟦⟧⟪⟫]*⟧|⟪[^⟦⟧⟪⟫]*⟫/u.exec(out);
    if (!match) return out;
    const piece = match[0];
    const inner = piece.slice(1, -1);
    const simple = piece.startsWith("⟦")
      ? /^[\p{L}\p{N}.,·⁰¹²³⁴⁵⁶⁷⁸⁹⁻ⁿˣ₀-₉]+$/u.test(inner)
      : /^(?:\p{N}+(?:[.,]\p{N}+)?|\p{L})$/u.test(inner);
    out = out.slice(0, match.index) + (simple ? inner : `(${inner})`) + out.slice(match.index + piece.length);
  }
}

/** `mark` (a combining character) after each character, or after the last, of what `pattern` captures. */
function combining(pattern: string, mark: string, eachCharacter: boolean, text: string): string {
  const regex = new RegExp(pattern);
  let out = text;
  for (;;) {
    const match = regex.exec(out);
    if (!match) return out;
    const content = match[1] ?? "";
    const replaced = eachCharacter ? Array.from(content, (character) => character + mark).join("") : content + mark;
    out = out.slice(0, match.index) + replaced + out.slice(match.index + match[0].length);
  }
}

/**
 * Combining overline and vector arrows sit on the character before them, so "1" + overline is one grapheme and
 * is no longer a digit. A spacing macron and a spacing arrow keep every character.
 */
function withoutFusedMarks(text: string): string {
  return text.replaceAll("̅", "¯").replaceAll("⃗", "→");
}

const unicodeSymbols: readonly (readonly [string, string])[] = (
  [
    ["\\to", "→"],
    ["\\rightarrow", "→"],
    ["\\longrightarrow", "→"],
    ["\\Rightarrow", "⇒"],
    ["\\Leftrightarrow", "⇔"],
    ["\\leftarrow", "←"],
    ["\\searrow", "↘"],
    ["\\nearrow", "↗"],
    ["\\rightleftharpoons", "⇌"],
    ["\\therefore", "∴"],
    ["\\cdot", "·"],
    ["\\times", "×"],
    ["\\div", "÷"],
    ["\\neq", "≠"],
    ["\\ne", "≠"],
    ["\\leq", "≤"],
    ["\\le", "≤"],
    ["\\geq", "≥"],
    ["\\ge", "≥"],
    ["\\approx", "≈"],
    ["\\pm", "±"],
    ["\\infty", "∞"],
    ["\\in", "∈"],
    ["\\notin", "∉"],
    ["\\cup", "∪"],
    ["\\cap", "∩"],
    ["\\emptyset", "∅"],
    ["\\varnothing", "∅"],
    ["\\wedge", "∧"],
    ["\\vee", "∨"],
    ["\\neg", "¬"],
    ["\\checkmark", "✓"],
    ["\\dots", "…"],
    ["\\ldots", "…"],
    ["\\cdots", "⋯"],
    ["\\bmod", " mod "],
    ["\\int", "∫"],
    ["\\sum", "∑"],
    ["\\partial", "∂"],
    ["\\Delta", "Δ"],
    ["\\alpha", "α"],
    ["\\beta", "β"],
    ["\\gamma", "γ"],
    ["\\delta", "δ"],
    ["\\varepsilon", "ε"],
    ["\\epsilon", "ε"],
    ["\\theta", "θ"],
    ["\\lambda", "λ"],
    ["\\mu", "μ"],
    ["\\pi", "π"],
    ["\\rho", "ρ"],
    ["\\sigma", "σ"],
    ["\\tau", "τ"],
    ["\\varphi", "φ"],
    ["\\phi", "φ"],
    ["\\omega", "ω"],
    ["\\Omega", "Ω"],
    ["\\circ", "°"],
    ["\\degree", "°"],
    ["\\qquad", "  "],
    ["\\quad", " "],
    ["\\,", " "],
    ["\\;", " "],
    ["\\:", " "],
    ["\\!", ""],
    ["\\ ", " "],
    ["\\{", "{"],
    ["\\}", "}"],
    ["\\%", "%"],
    ["\\lvert", "|"],
    ["\\rvert", "|"],
    ["\\mid", "|"],
    ["\\mathbb{R}", "ℝ"],
    ["\\mathbb{N}", "ℕ"],
    ["\\mathbb{Z}", "ℤ"],
    ["\\mathbb{C}", "ℂ"],
    ["\\mathbb{Q}", "ℚ"],
    ["\\xi", "ξ"],
    ["\\zeta", "ζ"],
    ["\\eta", "η"],
    ["\\iota", "ι"],
    ["\\kappa", "κ"],
    ["\\nu", "ν"],
    ["\\upsilon", "υ"],
    ["\\chi", "χ"],
    ["\\psi", "ψ"],
    ["\\vartheta", "ϑ"],
    ["\\Gamma", "Γ"],
    ["\\Theta", "Θ"],
    ["\\Lambda", "Λ"],
    ["\\Xi", "Ξ"],
    ["\\Pi", "Π"],
    ["\\Sigma", "Σ"],
    ["\\Phi", "Φ"],
    ["\\Psi", "Ψ"],
    ["\\subset", "⊂"],
    ["\\supset", "⊃"],
    ["\\subseteq", "⊆"],
    ["\\supseteq", "⊇"],
    ["\\forall", "∀"],
    ["\\exists", "∃"],
    ["\\nabla", "∇"],
    ["\\prod", "∏"],
    ["\\Leftarrow", "⇐"],
    ["\\iff", "⇔"],
    ["\\implies", "⇒"],
    ["\\equiv", "≡"],
    ["\\sim", "∼"],
    ["\\simeq", "≃"],
    ["\\setminus", "∖"],
  ] as const
)
  .slice()
  // Longest first, so \neq isn't read as \ne then "q". Stable, as Swift's sort keeps equal lengths in order.
  .sort((a, b) => b[0].length - a[0].length);

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Readable Unicode for LaTeX: −9/2, lim x→3⁻, √(x+1), x². Nothing is dropped: an unknown command keeps its name. */
export function latexToUnicode(latex: string): string {
  const r = String.raw;
  let text = withAccents(undoubledCommands(gluedSubscripts(latex)));
  const isTable = text.includes(r`\begin{array}`);
  text = replaceAll(text, r`\\begin\{array\}\{[^{}]*\}`, "");
  text = replaceAll(text, r`\\(?:begin|end)\{[a-z*]+\}|\\hline`, "");
  // Rows on their own lines; a table's cells apart, an alignment's joined.
  text = replaceAll(text, r`\\\\`, "\n");
  text = text.replaceAll("&", isTable ? "   " : "");
  text = replaceAll(text, r`\\(?:color|textcolor)\{[^{}]*\}`, "");
  text = replaceAll(text, r`\\(?:text|textbf|textit|mathrm|mathbf|mathit)\{([^{}]*)\}`, "$1");
  text = replaceAll(text, r`\\operatorname\*?\{([^{}]*)\}`, "$1 ");
  // \overline{BC} → B¯C¯, \vec{v} → v→. A combining mark would fuse with the digit under it.
  text = combining(r`\\overline\{([^{}]*)\}`, "̅", true, text);
  text = combining(r`\\(?:overrightarrow|vec)\{([^{}]*)\}`, "⃗", false, text);
  text = replaceAll(text, r`\\(?:overrightarrow|vec)\s*([A-Za-z])`, "$1⃗");
  text = replaceAll(text, r`\\xrightarrow\{([^{}]*)\}`, " —$1→ ");
  // \underbrace{5}_{\text{horizontais}} → 5 (horizontais)
  text = replaceAll(text, r`\\underbrace\{([^{}]*)\}_\{([^{}]*)\}`, "$1 ($2)");
  text = replaceAll(text, r`\\nexists(?![A-Za-z])`, "∄");
  // \lim_{x\to3^-} → lim x→3⁻
  text = replaceAll(text, r`\\lim_\{([^{}]*)\}`, "lim[$1] ");
  text = replaceAll(text, r`\\[Bb]igg?[lr]?(?![A-Za-z])|\\left|\\right`, "");
  // Function names keep a space before what they apply to.
  text = replaceAll(
    text,
    r`\\(sin|cos|tan|tg|sen|cotg|ln|log|exp|sgn|arcsin|arccos|arctan|arcsen|arctg|max|min|det)(?![A-Za-z])`,
    "$1 ",
  );
  text = replaceAll(text, r`\\decimalcomma\s*|\{,\}`, ",");
  for (const [command, symbol] of unicodeSymbols) {
    const pattern = escapeRegExp(command) + (isLetter(command[command.length - 1]) ? "(?![A-Za-z])" : "");
    text = text.replace(new RegExp(pattern, "g"), () => symbol);
  }
  // Fractions and roots, innermost first: ⟦numerator⟧ and ⟪denominator⟫ get brackets only when they need them.
  const group = r`\{([^{}]*)\}`;
  for (let pass = 0; pass < 8; pass += 1) {
    const before = text;
    text = replaceAll(text, r`\\[td]?frac\s*` + group + r`\s*` + group, "⟦$1⟧/⟪$2⟫");
    text = replaceAll(text, r`\\[td]?frac\s*([0-9A-Za-z])\s*([0-9A-Za-z])`, "$1/$2");
    text = replaceAll(text, r`\\sqrt\s*` + group, "√⟦$1⟧");
    text = superscripts(text);
    text = bracketed(text);
    if (text === before) break;
  }
  text = replaceAll(text, r`lim\[([^\[\]]*)\]`, "lim $1");
  // Any other command keeps its name; leftover braces go.
  text = replaceAll(text, r`\\([A-Za-z]+)`, "$1");
  text = text.replace(/[{}$]/g, "");
  // A minus, not a hyphen in a word ("debate-se").
  text = text.replace(/(?<!\p{L})-/gu, "−");
  const lines = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").replace(/^[ \t]+|[ \t]+$/g, ""))
    .filter((line) => line !== "")
    .join("\n");
  return withoutFusedMarks(lines);
}

/** The namespace the Swift code calls `LatexText`. */
export const LatexText = {
  normalized,
  casesFromArray,
  spacedTokensClosed,
  commandsForSymbols,
  groupingIntervals,
  tightConnectives,
  avoidingTypesetterAssertion,
  wouldTripTypesetter,
  tableRows,
  isProse,
  accentedTextPieces,
  isProsePlain,
  undoubledCommands,
  gluedSubscripts,
  mendedInline,
  unicode: latexToUnicode,
};
