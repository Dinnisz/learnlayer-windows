// Port of LearnLayer/Problems/FlattenedMath.swift @ ref 2026-11-04

/**
 * Spots PDF or Accessibility text whose maths lost its layout: a sum read as «n k=1 k 2 = n(n + 1) 4», a root of
 * a fraction as «arcsen x 1+x2». Such text cannot be typeset as it is; the model reads the picture instead and the
 * question is drawn from its LaTeX.
 */

/** Signs that only a sum, a product, an integral or the brace of a piecewise definition leaves behind. */
const structuralSigns = new Set(Array.from("∑∏∫∮⎧⎨⎩⎪⎡⎢⎣⎤⎥⎦"));

const functionNames =
  "(?:arcsen|arcsin|arccos|arctg|arctan|senh|sinh|cosh|tgh|tanh|sen|sin|cos|tg|tan|cotg|cot|ln|log|lim|exp)";
const functionNamesAnywhere = new RegExp(functionNames, "gi");
const proseWord = /[A-Za-zÀ-ÿ]{4,}/;

/** Swift's `isNewline` splits: LF, CR, VT, FF, NEL, LINE SEPARATOR, PARAGRAPH SEPARATOR. */
const newlines = new RegExp(
  "[" + [0x0a, 0x0b, 0x0c, 0x0d, 0x85, 0x2028, 0x2029].map((c) => String.fromCharCode(c)).join("") + "]+",
);

/** Nothing in the line is a word of prose: its letters come in runs of up to three, or are a function's name. */
function isFormulaOnly(line: string): boolean {
  const bare = line.replace(functionNamesAnywhere, " ");
  if (proseWord.test(bare)) return false;
  const tokens = bare.split(" ").filter((token) => token !== "");
  if (!(tokens.length >= 3 || Array.from(line).length !== Array.from(bare).length)) return false;
  return /[0-9=+\-−×·/^()]/.test(bare);
}

/**
 * A line that is only a formula (no word of prose) and shows the marks of lost layout: a letter with its exponent
 * apart («k 2»), a closing bracket followed by a stray term («(cosh x) x»), a bound of a sum with no sign
 * («n k=1»), a function with its exponent glued on («1+x2»), an exponent glued between letters («e2t») or a
 * derivative laid flat («dy dt»).
 */
export function lineLooksFlattened(line: string): boolean {
  if (!isFormulaOnly(line)) return false;
  const has = (pattern: RegExp) => pattern.test(line);
  if (has(/^[a-z]\s+[a-z]\s*=\s*\d/)) return true;
  if (has(/\b[a-z]\s+\d\b/) || has(/\)\s+(?:\d\b|[a-z]\b)/) || has(/\b\d\s+\(/)) return true;
  if (has(new RegExp("\\b" + functionNames + "\\b")) && (has(/\b\d*[+-]?\d*[a-z]\d\b/) || has(/\s\d$/))) return true;
  // An exponent glued between two letters («ye2t» for y·e^{2t», «y2et» for y²eᵗ) and a derivative's fraction laid
  // flat («dy dt» for dy/dt): CDI3 2025/26, question 2, went to the model as such text.
  if (has(/[a-zα-ω]\d+[a-zα-ω]/) || has(/\bd[a-z]\s+d[a-z]\b/)) return true;
  return false;
}

export function looksFlattened(text: string): boolean {
  if (Array.from(text).some((character) => structuralSigns.has(character))) return true;
  // `split(whereSeparator:)` leaves out empty pieces; a line of spaces is kept, and trims to "".
  const lines = text
    .split(newlines)
    .filter((line) => line !== "")
    .map((line) => line.replace(/^[ \t]+|[ \t]+$/g, ""));
  if (lines.some(lineLooksFlattened)) return true;
  // A PDF's text layer puts each piece of a display formula on a line of its own («n», «k=1», «k», «2»): the run
  // of lines with no word of prose, read as one line.
  let pieces: string[] = [];
  for (const line of [...lines, ""]) {
    const bare = line.replace(functionNamesAnywhere, " ");
    // An option ("A) 12 V") is a line of its own, never a piece of the formula above it.
    const isOption = /^\(?[A-Ea-e][.)]\s/.test(line);
    if (line !== "" && !isOption && !proseWord.test(bare)) {
      pieces.push(line);
      continue;
    }
    if (pieces.length >= 2 && lineLooksFlattened(pieces.join(" "))) return true;
    pieces = [];
  }
  // The numerator and the denominator of a fraction, each on a line of its own.
  let run = 0;
  for (const line of lines) {
    run = Array.from(line).length <= 2 && /^[a-z0-9]{1,2}$/.test(line) ? run + 1 : 0;
    if (run >= 3) return true;
  }
  return false;
}
