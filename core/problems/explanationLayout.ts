// Port of LearnLayer/Problems/ExplanationLayout.swift @ ref 2026-11-04 (the columns; the body's home is MascotHome in
// core/voice/mascotMotion.ts).
//
// How an open explanation is laid out under the question: its words on the left in a readable measure, the drawings,
// animations and figures on the right. A window too narrow for both stacks them in one column.

export type Arrangement = "sideBySide" | "stacked";

export interface ExplanationColumns {
  arrangement: Arrangement;
  /** The whole explanation: words, gutter and figures. */
  panelWidth: number;
  /** The column of words. */
  textWidth: number;
  /** The column of figures on the right; null when stacked. */
  figureWidth: number | null;
  /** Between the words and the figures. */
  gutter: number;
}

export const ExplanationLayout = {
  /** Narrower windows stack the figures under the words, unless they are short (compact). */
  sideBySideMinimumWidth: 720,
  /** Lines longer than this are hard to read; the figures take the rest. */
  readableMeasure: 720,
  compactReadableMeasure: 800,
  /** Below this the words would wrap every few words: stack instead. */
  textMinimum: 300,
  compactTextMinimum: 200,
  /** The figure column's usual share of the width, and its sizes. */
  figureShare: 0.42,
  compactFigureShare: 0.38,
  figureMaximum: 520,
  compactFigureMaximum: 190,
  /** A wide window gives the figure what the words cannot use, up to this. */
  wideFigureMaximum: 640,

  /** Whether the figures may go beside the words (`make` decides whether the words stay readable). */
  wantsSideBySide(windowWidth: number, hasFigure: boolean, compact: boolean): boolean {
    return hasFigure && (compact || windowWidth >= ExplanationLayout.sideBySideMinimumWidth);
  },

  /**
   * - `windowWidth`: the stage's width; `margin`: its margin on each side;
   * - `stackedWidth`: the work's width as one column (`Stage.workWidth`);
   * - `hasFigure`: the explanation has a figure, a graph or a drawing to show;
   * - `compact`: a short window (`Stage.isCompact`).
   */
  make({
    windowWidth,
    margin,
    stackedWidth,
    hasFigure,
    compact,
  }: {
    windowWidth: number;
    margin: number;
    stackedWidth: number;
    hasFigure: boolean;
    compact: boolean;
  }): ExplanationColumns {
    const L = ExplanationLayout;
    const content = Math.max(0, windowWidth - 2 * margin);
    const gutter = compact ? 12 : 32;
    if (L.wantsSideBySide(windowWidth, hasFigure, compact)) {
      const share = compact ? L.compactFigureShare : L.figureShare;
      const cap = compact ? L.compactFigureMaximum : L.figureMaximum;
      const measure = compact ? L.compactReadableMeasure : L.readableMeasure;
      let figure = Math.min(cap, content * share);
      const text = Math.min(measure, content - gutter - figure);
      if (text >= (compact ? L.compactTextMinimum : L.textMinimum)) {
        // The words are at their measure: the figure takes the spare room.
        if (!compact && text >= measure)
          figure = Math.max(figure, Math.min(L.wideFigureMaximum, content - gutter - text));
        return {
          arrangement: "sideBySide",
          panelWidth: text + gutter + figure,
          textWidth: text,
          figureWidth: figure,
          gutter,
        };
      }
    }
    const width = Math.min(Math.max(0, stackedWidth), content);
    return { arrangement: "stacked", panelWidth: width, textWidth: width, figureWidth: null, gutter: 0 };
  },
};
