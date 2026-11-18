// Port of HandDrawnMark (LearnLayer/Explanation/HandDrawnShapes.swift @ ref 2026-11-04): a pen's loop round a
// rectangle or a pen's line under it, drawn progressively in the blue (0.6 s), or faded in with Reduce Motion
// ("Show animations in Windows" off). The rectangle is in the coordinates of the positioned element it is drawn in.

import { HandDrawnUnderline, PenRing, type MarkRect } from "@core/explanation/handDrawn";
import "./handDrawn.css";

export type HandDrawnStyle = "circle" | "underline";

/** The pen's stroke alone, for drawing inside an SVG of one's own (a graph). */
export function HandDrawnPath({
  style,
  rect,
  delay = 0,
  roundness = 2,
}: {
  style: HandDrawnStyle;
  rect: MarkRect;
  delay?: number;
  /** For a circle: 2 is an ellipse, higher fills out its corners. */
  roundness?: number;
}) {
  return (
    <path
      className="hand-drawn"
      d={style === "circle" ? PenRing.path(rect, roundness) : HandDrawnUnderline.path(rect)}
      pathLength={1}
      strokeWidth={style === "circle" ? PenRing.lineWidth : HandDrawnUnderline.lineWidth}
      style={{ animationDelay: `${delay}s` }}
    />
  );
}

/** The pen's stroke over an HTML element: an SVG at its origin that draws outside its own box. */
export function HandDrawnMark(props: { style: HandDrawnStyle; rect: MarkRect; delay?: number; roundness?: number }) {
  return (
    <svg className="hand-drawn-mark" aria-hidden="true">
      <HandDrawnPath {...props} />
    </svg>
  );
}
