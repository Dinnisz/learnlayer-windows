// Port of LessonEvidence.inPlaceOp and isSingleValue (LearnLayer/Lesson/LessonLayer.swift @ ref 2026-11-04): how a
// part of the question is marked where it stands.

export interface InPlaceMark {
  op: string;
  /** The words it marks, when it marks words. */
  quote: string | null;
  note: string | null;
  /** A part of a figure (a label found in it). */
  onFigure: boolean;
  /** On the group's statement, not the question. */
  onStatement?: boolean;
}

export const LessonEvidence = {
  /**
   * How a part is marked where it stands (`zoom`, `underline` and `circle`; any other verb is kept):
   * - a part of a figure, a lone value ("5%", "1000 €", "x") or a ring with a note: ringed;
   * - words on a question that reads clearly: their own letters coloured in the accent (`tint`);
   * - words on one that does not: underlined, never ringed, since a loop round a run of words runs through the letters
   *   either side of it.
   */
  inPlaceOp(mark: InPlaceMark, legible: boolean): string {
    if (!["zoom", "underline", "circle"].includes(mark.op) || mark.onStatement) return mark.op;
    if (mark.onFigure) return "circle";
    const words = legible ? "tint" : "underline";
    // A box the model drew: a ring stays a ring (it may be on a drawing), anything else is words.
    if (mark.quote === null) return mark.op === "circle" ? "circle" : words;
    if (LessonEvidence.isSingleValue(mark.quote)) return "circle";
    if (mark.op === "circle" && (mark.note ?? "") !== "") return "circle";
    return words;
  },

  /**
   * One number with at most its unit ("5%", "1000 €", "3 mA", "x³") or one short symbol ("x", "R2", "f(x)"): a value a
   * ring goes round, not a run of words.
   */
  isSingleValue(quote: string): boolean {
    const tokens = quote.split(/\s+/u).filter((token) => token !== "");
    if (tokens.length === 0 || tokens.length > 2) return false;
    if (/\p{N}/u.test(tokens.join(""))) return true;
    if (tokens.length !== 1) return false;
    // No word in it: no run of three letters or more.
    let run = 0;
    let longest = 0;
    for (const ch of Array.from(tokens[0]!)) {
      run = /\p{L}/u.test(ch) ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    return longest < 3;
  },
};
