// Port of LearnLayer/Problems/QuestionLabels.swift @ ref 2026-11-04

/**
 * The label shapes and the judgement calls of question detection that need no PDF page,
 * so they can be tested on plain strings.
 */
export const QuestionLabels = {
  /**
   * A numbered item with three or four levels ("1.2.1", "2.3.1.4"), at the start of a line and
   * followed by a space or the end of the line. The trailing "." or ")" is part of the match.
   * The label is the first group; the second is the question it belongs to ("1").
   */
  nestedExpression: /^[ \t]*((\d{1,2})(?:\.\d{1,2}){2,3})[.)]?(?!\d)(?=[ \t\u00A0]|$)/gmu,

  /**
   * "(1)   1.   2)   1o)   1.º)" followed by text, or alone on its line before a sentence.
   * An ordinal mark after the number ("o", "º", "°") is how many Portuguese papers number items. A label with its
   * marks glued on («6)(3.0)Seja», the text layer of a TeX paper) is one too.
   */
  topPattern:
    /^[ \t]*(\(?(\d{1,2})(?:[.)]|\.?[ºo°]\)))(?:[ \t]+(?=[\p{L}([])|[ \t]*\n(?=[ \t]*\p{Lu})|(?<=\))(?=\(\d{1,2}(?:[.,]\d{1,2})?\)))/gmu,

  /**
   * An ordinal label ("2o)") that sits after other text on its line, as the second column's
   * number does when the text layer stores both columns on one line.
   */
  midLineOrdinalExpression: /(?<=\s)((\d{1,2})[ºo°]\))(?:[ \t]+(?=[\p{L}([])|[ \t]*\n(?=[ \t]*\p{Lu}))/gu,

  /** "For each letter, the number of the option": the letters are gaps to fill or rows to match. */
  lettersAreOptions: /para cada letra|pour chaque lettre|for each letter|cada espaço|each gap|chaque espace/iu,

  /** True when the text has a digit or an operator: a formula or a value, not words. */
  isMathLike(text: string): boolean {
    return /[\p{N}=<>≤≥+−×÷^√∑∫∞±/]/u.test(text);
  },

  /** A name with arguments ("g(x)", "f'(x)") or anything math-like. */
  isShortFormula(text: string): boolean {
    if (QuestionLabels.isMathLike(text)) return true;
    // "|x|": an absolute value is a formula, however few letters it has.
    if (text.split("|").length - 1 >= 2) return true;
    const characters = Array.from(text);
    return characters.some(
      (character, index) =>
        character === "(" && index > 0 && (/\p{L}/u.test(characters[index - 1]!) || characters[index - 1] === "'"),
    );
  },

  /**
   * Whether a "(a)" at the start of a line is a real part (an alínea) of the question above it,
   * given what follows the label up to the next label and what the question says before it.
   * `numbered`: the page numbers its questions "1.", "2.1.", "I.1)", so a short "(a)" may be
   * a row to match or a gap to fill instead.
   */
  isSubItem(body: string, instructions: string, numbered: boolean): boolean {
    const trimmed = body.trim();
    const opening = trimmed[0];
    if (opening === undefined) return false;
    const firstLine = trimmed.split("\n").find((line) => line !== "") ?? trimmed;
    const letters = Array.from(trimmed).filter((character) => /\p{L}/u.test(character)).length;
    // A header row "(a) (b) (c) (d)": the next thing is another label.
    if (/^\(?[a-h]\)(\s|$)/u.test(firstLine)) return false;
    // A gap inside a sentence: "(a) , originando".
    if (",.;:".includes(opening)) return false;
    if (QuestionLabels.lettersAreOptions.test(instructions)) return false;
    // "(c) g(x)": a formula is a whole part, however few letters it has.
    if (letters < 3) return QuestionLabels.isShortFormula(firstLine);
    if (numbered && letters < 80 && !QuestionLabels.isMathLike(firstLine)) return !optionsIntroduction(instructions);
    return true;
  },
};

/** Words that introduce rows to match or gaps to fill, whose "(a)" lines are answered together. */
function optionsIntroduction(instructions: string): boolean {
  return (
    /coluna|associ|relacion|complet|lacuna|espa[cç]o|preench|selecion|assinal|ordene|match|fill|column/iu.test(
      instructions,
    ) || /^[ \t]*\(\d\)/mu.test(instructions)
  );
}

/** The first group of every match of a global pattern. */
export function labelsMatching(pattern: RegExp, text: string): string[] {
  const global = pattern.global ? pattern : new RegExp(pattern.source, pattern.flags + "g");
  return Array.from(text.matchAll(global), (match) => match[1] ?? "");
}
