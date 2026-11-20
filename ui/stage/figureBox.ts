// Port of LearnLayer/Problems/QuestionOverlay.swift (FigureBoxSize) @ 5701363

/**
 * The figure box's height: fixed for the window, whatever the steps or the column, and never more than about 40% of
 * the overlay, so the box always fits on screen.
 */
export const FigureBoxSize = {
  overlayShare: 0.42,
  workShare: 0.55,
  minimum: 200,
  /** Above the 3D view, inside the box: the figure's title. */
  titleRoom: 32,

  height(overlayHeight: number, workHeight: number): number {
    return Math.max(
      FigureBoxSize.minimum,
      Math.min(overlayHeight * FigureBoxSize.overlayShare, workHeight * FigureBoxSize.workShare),
    );
  },
};
