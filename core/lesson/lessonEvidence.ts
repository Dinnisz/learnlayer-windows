// Port of LessonEvidence.inPlaceOp, isSingleValue and ringBox (LearnLayer/Lesson/LessonLayer.swift @ ref 2026-11-04):
// how a part of the question is marked where it stands.

import { narrowestWobble, PenRing, type MarkRect } from "../explanation/handDrawn";

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

  /**
   * The box to ring `quote` with in place. The inside of the pen's loop (at its narrowest wobble, less half the stroke)
   * goes round the whole quote, its corners `corner` points clear and its ends at least `reach` points clear, so no
   * letter at either end is cut. Of the ellipses that fit, the one that grows least, height counting double since it
   * runs into the lines above and below.
   */
  ringBox(quote: MarkRect, reach = 4, corner = 2): MarkRect {
    if (quote.width <= 0 || quote.height <= 0) return quote;
    const halfWidth = quote.width / 2 + corner;
    const halfHeight = quote.height / 2 + corner;
    let best: { cost: number; x: number; y: number } | null = null;
    // (halfWidth / x)² + (halfHeight / y)² = 1: `share` is the corner's part on the vertical axis.
    for (let step = 5; step <= 95; step += 1) {
      const share = step / 100;
      const x = Math.max(halfWidth / Math.sqrt(1 - share), quote.width / 2 + reach);
      const y = halfHeight / Math.sqrt(share);
      const cost = x - quote.width / 2 + 2 * (y - quote.height / 2);
      if (best === null || cost < best.cost) best = { cost, x, y };
    }
    if (!best) return quote;
    // From the inside of the stroke to the loop's centre line at its narrowest wobble, with room for the chords
    // between its samples, then to the box the loop grows its ellipse from.
    const stroke = PenRing.lineWidth / 2 + 0.5;
    const pad = PenRing.ellipse({ x: 0, y: 0, width: 0, height: 0 });
    const radiusX = (best.x + stroke) / narrowestWobble;
    const radiusY = (best.y + stroke) / narrowestWobble;
    const width = Math.max(1, 2 * (radiusX - pad.radiusX));
    const height = Math.max(1, 2 * (radiusY - pad.radiusY));
    return {
      x: quote.x + quote.width / 2 - width / 2,
      y: quote.y + quote.height / 2 - height / 2,
      width,
      height,
    };
  },
};
