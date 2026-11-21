// Port of LearnLayer/Problems/QuestionOverlay.swift (Stage.init: the lifted question's scale) @ ref 2026-11-04

/** The stage's margin and the gap from the question to the work (`Stage.edge`, `Stage.gap`), normal and compact. */
export const StageGeometry = {
  edge: (compactWindow: boolean) => (compactWindow ? 12 : 28),
  gap: (compactWindow: boolean) => (compactWindow ? 8 : 16),
};

/**
 * The scale of the lifted question, from the size of its body text on the page (`body`, in points at scale 1):
 * - while it is read (choices, hint, try): body at 17 pt, never wider than the column (`fits`) nor taller than 45 % of
 *   the height;
 * - once the solution is open (`compact`): body at 14 pt, at most 30 % of the height; and when the work has measured
 *   itself (`panel` > 0), the question gives up only the room the work needs, never below 11 pt.
 * `available` is the stage's height and `height` the question's own height at scale 1, in the same points.
 */
export function questionScale({
  body,
  compact,
  fits,
  height,
  available,
  panel = 0,
  compactWindow = false,
}: {
  body: number;
  compact: boolean;
  fits: number;
  height: number;
  available: number;
  panel?: number;
  compactWindow?: boolean;
}): number {
  const perPoint = Math.max(1, body);
  const tall = Math.max(1, height);
  const size = compact ? 14 : 17;
  const share = compact ? 0.3 : 0.45;
  let scale = Math.min(size / perPoint, fits, (available * share) / tall);
  if (compact && panel > 0) {
    const smaller = Math.min(scale, 11 / perPoint);
    const room = available - 2 * StageGeometry.edge(compactWindow) - StageGeometry.gap(compactWindow) - panel;
    scale = Math.max(smaller, Math.min(scale, room / tall));
  }
  return scale;
}
