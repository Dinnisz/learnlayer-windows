// Port of `LessonGeometry.box` and its limits (LearnLayer/Lesson/LessonGeometry.swift @ ref 2026-11-04): a box the
// model draws on the question's picture, as shares (0…1) of it, kept only when it is believable.

import type { LessonBox } from "./mascotLesson";

/** A rectangle as shares of the picture, from its top-left corner. */
export interface ShareRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const LessonGeometry = {
  /** The smallest and largest box a model's `box` may be, as shares of the picture. */
  smallestBox: 0.025,
  largestBoxArea: 0.6,

  /** The share of the picture a box covers, or null when it is not a believable box. */
  box(box: LessonBox): ShareRect | null {
    const values = [box.x, box.y, box.w, box.h];
    if (
      !values.every(Number.isFinite) ||
      !(box.w >= LessonGeometry.smallestBox) ||
      !(box.h >= LessonGeometry.smallestBox) ||
      !(box.x < 1) ||
      !(box.y < 1) ||
      !(box.x + box.w > 0) ||
      !(box.y + box.h > 0) ||
      !(box.w * box.h <= LessonGeometry.largestBoxArea)
    )
      return null;
    const x = Math.max(0, box.x);
    const y = Math.max(0, box.y);
    const width = Math.min(1, box.x + box.w) - x;
    const height = Math.min(1, box.y + box.h) - y;
    return width > 0 && height > 0 ? { x, y, width, height } : null;
  },
};
