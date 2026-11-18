// Port of LearnLayer/Illustrations/MascotStart.swift @ ref 2026-11-04: where a figure's sphere starts, in the scene's
// own units, so it sets off from where the stage's body rests (one mascot: the figure's sphere is that body on a trip).

import type { Point2D } from "./illustration";

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MascotStart = {
  /**
   * `resting`: the body's resting point in window coordinates (y down). `canvas`: where the figure is drawn, in the same
   * coordinates; the figure fills it edge to edge, keeping its aspect. The point is kept inside the picture, a sphere's
   * radius from the edge, so the sphere starts in view. Null when either is unknown.
   */
  world(
    resting: { x: number; y: number } | null,
    canvas: WindowRect,
    width: number,
    height: number,
    radius = 0.3,
  ): Point2D | null {
    if (!resting || canvas.width <= 1 || canvas.height <= 1 || width <= 0 || height <= 0) return null;
    const scale = Math.min(canvas.width / width, canvas.height / height);
    if (scale <= 0) return null;
    const offsetX = (canvas.width - width * scale) / 2;
    const offsetY = (canvas.height - height * scale) / 2;
    const x = (resting.x - canvas.x - offsetX) / scale;
    const y = (canvas.height - (resting.y - canvas.y) - offsetY) / scale;
    const margin = Math.min(radius, width / 2, height / 2);
    return { x: Math.min(Math.max(x, margin), width - margin), y: Math.min(Math.max(y, margin), height - margin) };
  },
};
