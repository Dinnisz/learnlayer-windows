// Port of `Repair` (LearnLayer/Problems/LocalTranscriptionRepair.swift), `LocalTranscriber.Context` and
// `LocalTranscriber.Cell.label` (LearnLayer/Problems/LocalTranscriber.swift) @ ref 2026-11-04: rules that repair what
// the computer's own text recognition makes of units and small formulas, and set what is plainly an equation as maths.
// The recogniser does not report glyph positions inside a word, so a subscript or a power is a guess from the shape of
// the text (a capital R, V, I or L followed by a digit or one or two letters, in a question about circuits). Only text
// outside `$…$` is touched. ICU's `\b` counts any letter as a word character; here that is written out with `\p{L}`.

/** What the whole text says about the subject, for the repairs that depend on it. */
export interface RepairContext {
  electrical: boolean;
}

export const RepairContexts = {
  of(text: string): RepairContext {
    return {
      electrical:
        /circuito|resistência|resistor|tensão|corrente|Thévenin|Norton|\bmA\b|\bmH\b|kΩ|\bV\d?\s*=|\bR[a-zA-Z0-9]{0,2}\s*=/iu.test(
          text,
        ),
    };
  },
};

/** "(A)", "B.", "[c]": the letter that starts a multiple-choice option, as written; null otherwise. */
export function optionLabel(text: string): string | null {
  return /^[([]?[A-Da-d][).\]](?=\s|$)/u.exec(text.trim())?.[0] ?? null;
}

const notWord = "(?![\\p{L}\\p{N}_])";
const lookalikeMap: Record<string, string> = {
  А: "A",
  В: "B",
  С: "C",
  Е: "E",
  К: "K",
  М: "M",
  Н: "H",
  О: "O",
  Р: "P",
  Т: "T",
  Х: "X",
  а: "a",
  с: "c",
  е: "e",
  о: "o",
  р: "p",
  х: "x",
  і: "i",
  з: "3",
};

const symbol = /^[RVILCPQ](?:\d{1,2}|[A-Za-z]{1,2})$/u;
const number = /^[-−–]?\d+(?:[.,]\d+)?(?:\/\d+)?$/u;
const operators = new Set(["=", "+", "-", "−", "–", "×", "/", "≈"]);
const units = new Set([
  "V",
  "A",
  "mA",
  "μA",
  "µA",
  "kΩ",
  "Ω",
  "MΩ",
  "mV",
  "kV",
  "mH",
  "H",
  "F",
  "μF",
  "µF",
  "nF",
  "pF",
  "Hz",
  "kHz",
  "W",
  "mW",
  "ms",
  "s",
]);

/** "20V" → "20", "V": a number with its unit written together. */
function splitGlued(word: string): string[] {
  const glued = /^([-−–]?\d+(?:[.,]\d+)?)(V|A|mA|kΩ|MΩ|Ω|mV|mH|kHz|Hz|W|ms)$/u.exec(word);
  return glued ? [glued[1]!, glued[2]!] : [word];
}

function isEquationStart(words: readonly string[], index: number): boolean {
  if (index + 1 < words.length && ["=", "≈"].includes(words[index + 1]!)) return true;
  return index > 0 && ["=", "≈"].includes(words[index - 1]!);
}

function isMathy(word: string, previous: string | undefined): boolean {
  if (operators.has(word) || number.test(word) || symbol.test(word)) return true;
  return units.has(word) && previous !== undefined && number.test(previous);
}

function unit(word: string): string {
  switch (word) {
    case "Ω":
      return "\\Omega";
    case "kΩ":
      return "\\mathrm{k}\\Omega";
    case "MΩ":
      return "\\mathrm{M}\\Omega";
    default:
      return "\\mathrm{" + word + "}";
  }
}

function latex(run: readonly string[]): string {
  let out = "";
  for (const word of run) {
    if (symbol.test(word))
      out += (out === "" ? "" : " ") + Array.from(word)[0] + "_{" + Array.from(word).slice(1).join("") + "}";
    else if (units.has(word)) out += "\\," + unit(word);
    else if (number.test(word)) out += (out === "" ? "" : " ") + word.replace(/,/g, "{,}").replace(/[–−]/g, "-");
    else out += (out === "" ? "" : " ") + word;
  }
  return out;
}

/** The body of a multiple-choice option when it is a formula and not words: no word of four letters, a digit or an operator. */
function optionFormula(words: readonly string[], electrical: boolean): string | null {
  const body = words.join(" ");
  if (/[A-Za-zÀ-ÿ]{4,}/u.test(body)) return null;
  if (!/\d|[=+^]/u.test(body)) return null;
  if (electrical) return null;
  return body
    .replace(/(?<![A-Za-z])([kxn])?\s?[EÉ]\s?R(?![A-Za-z])/gu, "$1 \\in \\mathbb{R}")
    .replace(/(?<![A-Za-z0-9])([a-zA-Z])(\d)(?![\d,.])/gu, "$1^{$2}");
}

export const Repair = {
  apply(text: string, context: RepairContext, isOption: boolean): string {
    const parts = Repair.cleaned(text).split("$");
    const hasMath = parts.length > 1;
    const out = parts.map((part, index) => {
      if (index % 2 === 1) return "$" + part + "$";
      let s = Repair.ohms(part, context.electrical);
      if (!hasMath) s = Repair.equations(s, context.electrical, isOption);
      return s;
    });
    return Repair.joinWrapped(out.join(""));
  },

  /** Letters taken from Cyrillic for Latin ones that look the same, and the badge that marks some exam items. */
  cleaned(text: string): string {
    let s = Repair.lookalikes(text);
    s = s.replace(/^\s*[*✱★]\s*/u, "");
    s = s.replace(/^[JO0]uestão/u, "Questão");
    // Roman numerals of the propositions: the recogniser reads the second I as an l.
    s = s.replace(/(?<=\bI e )Il\b/u, "II");
    s = s.replace(/^I[lI1]\.(?=\s)/u, "II.");
    s = s.replace(/^I[lI1][lI1]\.(?=\s)/u, "III.");
    return s;
  },

  lookalikes(text: string): string {
    return Array.from(text)
      .map((ch) => lookalikeMap[ch] ?? ch)
      .join("");
  },

  joinWrapped(text: string): string {
    return text.replace(/\s+/gu, " ").trim();
  },

  /**
   * "kD", "kR", "kS", "kQ", "k2", "kl" after a number are always a kilo-ohm; so are "kg", "kn", "ks", "kd" when the
   * question is about a circuit (where a mass would have been a "kg").
   */
  ohms(text: string, electrical: boolean): string {
    let s = text.replace(new RegExp(`(?<=\\d)\\s*([kKM])\\s?[DRSQ2lI1]${notWord}`, "gu"), "$1Ω");
    if (electrical) {
      s = s.replace(new RegExp(`(?<=\\d)\\s*([kM])\\s?(?:g|n|s|d|ð|A|\\u2126)${notWord}`, "gu"), "$1Ω");
      s = s.replace(/(?<=\d)\s?Ω/gu, " Ω");
    }
    // A kilo-ohm is written "k" and the sign, with a space after the number.
    s = s.replace(/(\d)\s*([kM])Ω/gu, "$1 $2Ω");
    return s.replace(/KΩ/gu, "kΩ");
  },

  /** Equations in a circuit question ("Rab = 3 kΩ", "V5 = 20 V") and the formulas of an option ("(A) e + 3") as maths. */
  equations(text: string, electrical: boolean, isOption: boolean): string {
    let words = text
      .split(" ")
      .filter((word) => word !== "")
      .flatMap(splitGlued);
    let prefix = "";
    const label = isOption ? optionLabel(text) : null;
    if (label && words.length > 0) {
      prefix = label;
      words = words.slice(1);
      if (words.length === 0) return text;
      const formula = optionFormula(words, electrical);
      if (formula !== null) return prefix + " $" + formula + "$";
    }
    if (!electrical) return text;
    const out: string[] = [];
    let index = 0;
    while (index < words.length) {
      const word = words[index]!;
      if (!symbol.test(word) || !isEquationStart(words, index)) {
        out.push(word);
        index += 1;
        continue;
      }
      const run: string[] = [];
      let end = index;
      while (end < words.length && isMathy(words[end]!, run.at(-1))) {
        run.push(words[end]!);
        end += 1;
      }
      while (run.length > 0 && operators.has(run.at(-1)!)) {
        run.pop();
        end -= 1;
      }
      out.push("$" + latex(run) + "$");
      index = Math.max(end, index + 1);
    }
    return (prefix === "" ? "" : prefix + " ") + out.join(" ");
  },
};

/**
 * The computer's own reading of a question, line by line, repaired by rule (`Repair`): units the recogniser garbles, an
 * equation of a circuit question or a multiple-choice formula set as maths between `$`.
 */
export function repairedDraft(text: string): string {
  const context = RepairContexts.of(text);
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? line : Repair.apply(line, context, optionLabel(line) !== null)))
    .join("\n");
}
