// Port of LearnLayer/Problems/StageScale.swift

/**
 * How much larger the question stage is drawn on a tall screen. The stage is laid out for the MacBook's 956-point-tall
 * screen; a taller one (a 1440p or 4K monitor) gets the same picture, larger, instead of the work sitting small in its
 * top-left corner. At 956 points tall and below it is exactly 1.
 */
export const StageScale = {
  /** The height the stage's sizes were chosen for. */
  referenceHeight: 956,
  /** Past this, lines would get long and the letters large: a 4K screen stops here. */
  maximum: 1.6,

  factor(height: number): number {
    if (!Number.isFinite(height) || height <= 0) return 1;
    return Math.min(StageScale.maximum, Math.max(1, height / StageScale.referenceHeight));
  },
};

/**
 * The CSS zoom an element is drawn at (the stage's column is zoomed by `StageScale`): window rectangles are this much
 * larger than the element's own pixels. 1 where the browser doesn't say.
 */
export function cssZoom(element: Element): number {
  const zoom = (element as Element & { currentCSSZoom?: number }).currentCSSZoom;
  return typeof zoom === "number" && zoom > 0 ? zoom : 1;
}
