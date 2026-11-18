// Port of VoiceCanvasPlan.covered and .perch (LearnLayer/Voice/VoiceCanvasPlan.swift) and VoiceMascot.perch
// (LearnLayer/Voice/VoiceMascot.swift) @ ref 2026-11-04: where the sphere sits while the voice says a mark on the
// formula it writes. It stays the sphere and sits just above the mark (`OrbAim`): centred over it, above the formula
// and the stroke both, and inside the formula's width. It never traces the stroke.

import { PenRing, type MarkRect } from "../explanation/handDrawn";

export type VoiceMarkKind = "circle" | "underline" | "arrow";

export const VoicePerch = {
  /** Everything a stroke covers, its width included. */
  covered(kind: VoiceMarkKind, placed: MarkRect): MarkRect {
    const half = PenRing.lineWidth / 2;
    switch (kind) {
      case "circle":
        return PenRing.outerBounds(placed);
      case "underline":
        return {
          x: placed.x - 3 - half,
          y: placed.y,
          width: placed.width + 7 + half * 2,
          height: placed.height + 5 + half,
        };
      case "arrow":
        return {
          x: placed.x,
          y: placed.y + placed.height / 2 - 6 - half,
          width: placed.width,
          height: 12 + half * 2,
        };
    }
  },

  /** The sphere's box over a stroke: centred over it, its bottom `gap` above the stroke or the `ceiling`, whichever is
   * higher (VoiceMascot.perch). */
  over(stroke: MarkRect, size: number, ceiling = Infinity, gap = 2): MarkRect {
    const bottom = Math.min(stroke.y, ceiling) - gap;
    return { x: stroke.x + stroke.width / 2 - size / 2, y: bottom - size, width: size, height: size };
  },

  /** Where the sphere sits over a stroke, in the formula's points: above the formula (its top is 0) and the stroke
   * both, and inside the formula's width. */
  perch(covered: MarkRect, viewWidth: number, size: number): MarkRect {
    const spot = VoicePerch.over(covered, size, 0);
    return { ...spot, x: Math.min(Math.max(0, spot.x), Math.max(0, viewWidth - spot.width)) };
  },
};
