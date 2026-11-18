// Port of LearnLayer/Problems/StepFocus.swift @ ref 2026-11-04 (StepFocusGeometry, FocusArrow, the placement of
// StepFocusMarks): where in the question's crop a step is about, from the model's normalised box, and the ring or arrow
// and few words drawn there. Coordinates are a crop's, origin top-left, y down.

import type { Focus } from "./problemSolution";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

const midX = (box: Box) => box.x + box.width / 2;
const midY = (box: Box) => box.y + box.height / 2;
const maxX = (box: Box) => box.x + box.width;
const maxY = (box: Box) => box.y + box.height;
const inset = (box: Box, dx: number, dy: number): Box => ({
  x: box.x + dx,
  y: box.y + dy,
  width: box.width - 2 * dx,
  height: box.height - 2 * dy,
});
const intersects = (a: Box, b: Box) => a.x < maxX(b) && b.x < maxX(a) && a.y < maxY(b) && b.y < maxY(a);

/** The air a lens keeps round what it shows, before it is scaled. */
const lensPadding = { width: 6, height: 4 };

export const StepFocusGeometry = {
  /** The least a side is given, as a share of the crop, so a point is still a spot. */
  minimumShare: 0.08,
  /** How far the region is magnified, at most. */
  maximumZoom: 2.4,
  /** The air a lens keeps round what it shows, before it is scaled. */
  lensPadding,

  /** The box in a crop of `size`, kept inside it; null when it is not a box (not numbers, empty, or wholly outside). */
  rect(focus: Focus, size: { width: number; height: number }): Box | null {
    const values = [focus.x, focus.y, focus.w, focus.h];
    if (!(size.width > 1 && size.height > 1) || !values.every(Number.isFinite)) return null;
    const w = Math.min(Math.max(focus.w, StepFocusGeometry.minimumShare), 1);
    const h = Math.min(Math.max(focus.h, StepFocusGeometry.minimumShare), 1);
    const x = Math.min(Math.max(focus.x, 0), 1 - w);
    const y = Math.min(Math.max(focus.y, 0), 1 - h);
    if (!(focus.x < 1 && focus.y < 1 && focus.x + focus.w > 0 && focus.y + focus.h > 0)) return null;
    return { x: x * size.width, y: y * size.height, width: w * size.width, height: h * size.height };
  },

  /** How far to magnify `region` in a crop of `size`: to about half its width, within reason and never past the crop. */
  zoom(region: Box, size: { width: number; height: number }): number {
    if (!(region.width > 0 && region.height > 0)) return 1;
    const wanted = (0.5 * size.width) / region.width;
    const fits = Math.min(size.width / region.width, size.height / region.height) * 0.95;
    return Math.max(1, Math.min(StepFocusGeometry.maximumZoom, wanted, fits));
  },

  /** `region` scaled about its centre, which is where the loupe puts it. */
  scaled(region: Box, scale: number): Box {
    const width = region.width * scale;
    const height = region.height * scale;
    return { x: midX(region) - width / 2, y: midY(region) - height / 2, width, height };
  },

  /**
   * The lens that shows `target` magnified by `scale`: centred on it, covering it with a little air, and moved (never
   * cut) so it lies inside `stage`; only a lens larger than the stage is made smaller. No stage leaves it where it is.
   */
  lens(target: Box, scale: number, stage: Box | null, padding = lensPadding): Box {
    let width = (target.width + 2 * padding.width) * Math.max(scale, 1);
    let height = (target.height + 2 * padding.height) * Math.max(scale, 1);
    const centred = { x: midX(target) - width / 2, y: midY(target) - height / 2, width, height };
    if (!stage || !(stage.width > 0 && stage.height > 0)) return centred;
    width = Math.min(width, stage.width);
    height = Math.min(height, stage.height);
    const x = Math.min(Math.max(midX(target) - width / 2, stage.x), maxX(stage) - width);
    const y = Math.min(Math.max(midY(target) - height / 2, stage.y), maxY(stage) - height);
    return { x, y, width, height };
  },

  /** The point to magnify about so that `target`'s centre lands on `lens`' centre. */
  zoomAnchor(target: Box, lens: Box, scale: number): Point {
    if (Math.abs(scale - 1) <= 0.001) return { x: midX(target), y: midY(target) };
    return {
      x: (midX(lens) - scale * midX(target)) / (1 - scale),
      y: (midY(lens) - scale * midY(target)) / (1 - scale),
    };
  },

  isArrow: (focus: Focus) => focus.mark?.toLowerCase() === "arrow",
};

export type FocusSide = "below" | "above" | "trailing" | "leading";
const sides: FocusSide[] = ["below", "above", "trailing", "leading"];

export interface FocusPlacement {
  side: FocusSide;
  tail: Point;
  label: Point;
  /** The label's box, null without a note. */
  box: Box | null;
  cost: number;
}

/** The gap that puts the label just outside the crop on that side, where nothing is written. */
function edgeGap(side: FocusSide, region: Box, bounds: Box): number {
  switch (side) {
    case "below":
      return Math.max(maxY(bounds) - maxY(region), 0) + 22;
    case "above":
      return Math.max(region.y - bounds.y, 0) + 22;
    case "trailing":
      return Math.max(maxX(bounds) - maxX(region), 0) + 12;
    case "leading":
      return Math.max(region.x - bounds.x, 0) + 12;
  }
}

export const StepFocusMarks = {
  /** The size a label is given while it is placed. */
  labelSize: (note: string | null) => ({ width: Array.from(note ?? "").length * 7.5 + 20, height: 26 }),

  /**
   * Where the arrow starts and the label sits: the side of the spot where they cover the least of the question's ink
   * (the free room under the crop counts), under the spot when it is a tie. A label never lands on `avoiding` (a lens)
   * while any side is clear of it.
   */
  placement(
    note: string | null,
    arrow: boolean,
    region: Box,
    bounds: Box,
    overshoot = 0,
    avoiding: Box | null = null,
    inkIn: ((box: Box) => number) | null = null,
  ): FocusPlacement {
    const { width, height } = StepFocusMarks.labelSize(note);
    const near = arrow ? 30 : 12;
    const keepOut = avoiding ? inset(avoiding, -6, -6) : null;
    let best: FocusPlacement | null = null;
    const choices = sides.flatMap((side) =>
      [near, near + 40, edgeGap(side, region, bounds)].map((gap) => [side, gap] as const),
    );
    choices.forEach(([side, gap], order) => {
      let tail: Point;
      let label: Point;
      let run: Box | null;
      switch (side) {
        case "below":
          tail = { x: midX(region), y: maxY(region) + gap };
          label = { x: midX(region), y: maxY(region) + gap + 4 + height / 2 };
          run = arrow ? { x: midX(region) - 3, y: maxY(region), width: 6, height: gap } : null;
          break;
        case "above":
          tail = { x: midX(region), y: region.y - gap };
          label = { x: midX(region), y: region.y - gap - 4 - height / 2 };
          run = arrow ? { x: midX(region) - 3, y: region.y - gap, width: 6, height: gap } : null;
          break;
        case "trailing":
          tail = { x: maxX(region) + gap, y: midY(region) };
          label = { x: maxX(region) + gap + 4 + width / 2, y: midY(region) };
          run = arrow ? { x: maxX(region), y: midY(region) - 3, width: gap, height: 6 } : null;
          break;
        case "leading":
          tail = { x: region.x - gap, y: midY(region) };
          label = { x: region.x - gap - 4 - width / 2, y: midY(region) };
          run = arrow ? { x: region.x - gap, y: midY(region) - 3, width: gap, height: 6 } : null;
          break;
      }
      const box = note === null ? null : { x: label.x - width / 2, y: label.y - height / 2, width, height };
      let cost = order * 0.02 + (gap > near ? 0.1 + gap / 2000 : 0);
      [box, run].forEach((part, index) => {
        if (!part) return;
        // The label must not cover words; a thin arrow may cross a drawing.
        cost += (inkIn?.(inset(part, -3, -2)) ?? 0) * (index === 0 ? 40 : 6);
        // Off the stage's room: the crop's width, and its bottom plus the free strip under it.
        if (
          part.x < bounds.x - 4 ||
          maxX(part) > maxX(bounds) + 4 ||
          maxY(part) > maxY(bounds) + overshoot ||
          part.y < bounds.y - 4
        )
          cost += 10;
      });
      // On the lens: worse than leaving the crop, so it is only ever a last resort.
      if (box && keepOut && intersects(box, keepOut)) cost += 100;
      if (!best || cost < best.cost) best = { side, tail, label, box, cost };
    });
    return best!;
  },

  /** The tip stops at the edge of the spot, not in its middle, so the arrow does not cover it. */
  arrowTip(tail: Point, region: Box): Point {
    const centre = { x: midX(region), y: midY(region) };
    const dx = centre.x - tail.x;
    const dy = centre.y - tail.y;
    const length = Math.max(Math.hypot(dx, dy), 1);
    const reach = Math.min(region.width, region.height) / 2;
    return { x: centre.x - (dx / length) * reach, y: centre.y - (dy / length) * reach };
  },

  /** A hand-drawn arrow (`FocusArrow`) that ends at `tip`, coming from `tail` in a slight curve, as an SVG path. */
  arrowPath(tail: Point, tip: Point): string {
    const mid = { x: (tail.x + tip.x) / 2, y: (tail.y + tip.y) / 2 };
    const dx = tip.x - tail.x;
    const dy = tip.y - tail.y;
    const length = Math.max(Math.hypot(dx, dy), 1);
    const control = { x: mid.x - (dy / length) * 8, y: mid.y + (dx / length) * 8 };
    const angle = Math.atan2(dy, dx);
    const wings = [-1, 1].map((side) => {
      const wing = angle + Math.PI + side * 0.45;
      return `M ${tip.x} ${tip.y} L ${tip.x + Math.cos(wing) * 10} ${tip.y + Math.sin(wing) * 10}`;
    });
    return `M ${tail.x} ${tail.y} Q ${control.x} ${control.y} ${tip.x} ${tip.y} ${wings.join(" ")}`;
  },
};
