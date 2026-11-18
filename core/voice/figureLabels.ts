// Port of the text side of LearnLayer/Voice/FigureLabels.swift @ ref 2026-11-04: labels on the question's figure that the
// tutor marks while it speaks (a point B, an angle α, an option (B), an ion H⁺, SO₄²⁻). They are found in the page's own
// text inside the question, so the circle lands on the printed label, not on a look-alike letter of the text. The Mac
// turns the found range into a rectangle with PDFKit; here the stage does it with the page's text lines.

/** Words that, said just before a mark, mean the figure: "o ponto [[2]]B", "o ângulo [[7]]alfa". */
const cueWords = new Set([
  "ponto",
  "pontos",
  "ângulo",
  "angulo",
  "ângulos",
  "opção",
  "opcao",
  "opções",
  "alternativa",
  "figura",
  "esquema",
  "esquemas",
  "ião",
  "iao",
  "iões",
  "ioes",
  "compartimento",
  "vértice",
  "vertice",
  "reta",
  "recta",
  "segmento",
  "lado",
  "point",
  "angle",
  "option",
  "figure",
  "ion",
  "vertex",
  "line",
]);

const superscripts: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "−": "⁻",
};
const subscripts: Record<string, string> = Object.fromEntries(
  Array.from("₀₁₂₃₄₅₆₇₈₉").map((ch, index) => [String(index), ch]),
);
const greek: Record<string, string[]> = {
  α: ["α", "𝛼", "alfa", "alpha"],
  β: ["β", "𝛽"],
  θ: ["θ", "𝜃"],
  γ: ["γ", "𝛾"],
  alfa: ["α", "𝛼"],
  alpha: ["α", "𝛼"],
  beta: ["β", "𝛽"],
  teta: ["θ", "𝜃"],
  theta: ["θ", "𝜃"],
};

const isLetter = (ch: string | undefined) => ch !== undefined && /^\p{L}$/u.test(ch);
const isNumber = (ch: string | undefined) => ch !== undefined && /^\p{N}$/u.test(ch);
const isWordy = (ch: string | undefined) => isLetter(ch) || isNumber(ch);
const isSpace = (ch: string | undefined) => ch === undefined || /^\s$/u.test(ch);

export const FigureLabels = {
  /** True when the words said just before `utf16` in `spoken` (up to three) hold a cue word. */
  saidAboutTheFigure(spoken: string, utf16: number | null): boolean {
    if (utf16 === null) return false;
    const before = spoken.slice(0, Math.min(Math.max(utf16, 0), spoken.length)).toLowerCase();
    const words = before.split(/[^\p{L}]+/u).filter((word) => word !== "");
    return words.slice(-3).some((word) => cueWords.has(word));
  },

  /**
   * Ways a label may be written in the page's text, most specific first.
   * "H +" → "H+", "H⁺", "H"; "SO4" → "SO4", "SO₄", "SO"; "(B)" → "(B)", "B)", "B".
   */
  variants(term: string): string[] {
    const raw = term
      .trim()
      .replace(/[\^_{}]/g, "")
      .replace(/\\alpha/g, "α")
      .replace(/\\beta/g, "β")
      .replace(/\\theta/g, "θ");
    const compact = Array.from(raw)
      .filter((ch) => !/^\s$/u.test(ch))
      .join("");
    if (compact === "") return [];
    const out: string[] = [];
    const add = (text: string) => {
      if (text !== "" && !out.includes(text)) out.push(text);
    };
    add(raw);
    add(compact);
    const bare = Array.from(compact)
      .filter((ch) => ch !== "(" && ch !== ")")
      .join("");
    if (compact.startsWith("(") && compact.endsWith(")")) add(`${bare})`);
    for (const name of greek[bare.toLowerCase()] ?? []) add(name);
    // The letters, then digits written as subscripts and a trailing charge as superscripts.
    const chars = Array.from(bare);
    let split = 0;
    while (split < chars.length && isLetter(chars[split])) split += 1;
    const letters = chars.slice(0, split).join("");
    const rest = chars.slice(split);
    if (letters !== "" && rest.length > 0) {
      let cut = 0;
      while (cut < rest.length && isNumber(rest[cut])) cut += 1;
      let digits = rest.slice(0, cut).join("");
      let charge = rest.slice(cut).join("");
      const isCharge = (text: string) => Array.from(text).every((ch) => "+-−".includes(ch));
      // "SO42-": the last digit before a charge is the charge's size.
      if (charge !== "" && isCharge(charge) && Array.from(digits).length >= 2) {
        charge = digits.slice(-1) + charge;
        digits = digits.slice(0, -1);
      } else if (charge === "" && digits !== "" && "+-−".includes(rest.at(-1)!)) charge = rest.at(-1)!;
      const sub = Array.from(digits)
        .map((ch) => subscripts[ch] ?? "")
        .join("");
      const sup = Array.from(charge)
        .map((ch) => superscripts[ch] ?? "")
        .join("");
      add(letters + sub + sup);
      add(letters + digits + charge);
      add(letters + sub);
      add(letters + digits);
      add(letters);
    }
    add(bare);
    return out;
  },

  /**
   * 3: between spaces on a short line (a figure's labels); 2: between spaces in running text; 1: not inside a word;
   * 0: part of a word. `start` and `end` are UTF-16 offsets in `text`.
   */
  isolation(text: string, start: number, end: number): number {
    const before = start > 0 ? text[start - 1] : undefined;
    const after = end < text.length ? text[end] : undefined;
    if (isWordy(before) || isWordy(after)) return 0;
    if (!(isSpace(before) && isSpace(after))) return 1;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const nextBreak = text.indexOf("\n", end);
    const line = text.slice(lineStart, nextBreak < 0 ? text.length : nextBreak);
    const words = line.split(/\s+/u).filter((word) => word !== "");
    return words.length <= 4 && words.every((word) => Array.from(word).length <= 4) ? 3 : 2;
  },

  /**
   * Where `term` is printed in `text` as [start, end), among the places `accept` lets through (inside the question): a
   * label printed on its own wins over the same letters inside a word or a formula. Null when it is not there.
   */
  range(term: string, text: string, accept: (start: number, end: number) => boolean): [number, number] | null {
    for (const variant of FigureLabels.variants(term)) {
      let best: { score: number; at: [number, number] } | null = null;
      for (
        let from = text.indexOf(variant);
        from >= 0;
        from = text.indexOf(variant, from + Math.max(variant.length, 1))
      ) {
        const end = from + variant.length;
        const score = FigureLabels.isolation(text, from, end);
        if (score === 0 || !accept(from, end)) continue;
        if (!best || score > best.score) best = { score, at: [from, end] };
        if (score >= 3) break;
      }
      if (best) return best.at;
    }
    return null;
  },
};
