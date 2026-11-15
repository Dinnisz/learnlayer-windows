// Port of LearnLayer/Problems/PDFColumns.swift @ ref 2026-11-04

import { Rects, type Rect } from "./page";

/**
 * Finds out whether a page sets its text in two columns, from where its lines sit. Papers made for printing often
 * do, and their text layer may store both columns line by line, so the questions have to be read column by column,
 * left one first.
 */
export interface ColumnLayout {
  /** The x (in page points) between the columns. */
  gutter: number;
  left: [number, number];
  right: [number, number];
  /** The lowest text of each column, where a column's last question ends. */
  leftBottom: number;
  rightBottom: number;
}

export const Columns = {
  column: (layout: ColumnLayout, x: number) => (x < layout.gutter ? 0 : 1),
  range: (layout: ColumnLayout, column: number) => (column === 0 ? layout.left : layout.right),
  bottom: (layout: ColumnLayout, column: number) => (column === 0 ? layout.leftBottom : layout.rightBottom),

  /** Null unless there is clear space between two columns, each holding a good share of the lines. */
  layout(lines: readonly Rect[], pageWidth: number): ColumnLayout | null {
    const usable = lines.filter((line) => line.width > 4 && line.height > 1 && Number.isFinite(line.width));
    if (usable.length < 8) return null;
    const minX = Math.min(...usable.map(Rects.minX));
    const maxX = Math.max(...usable.map(Rects.maxX));
    const span = maxX - minX;
    if (!(span > pageWidth * 0.5)) return null;
    const allowed = Math.max(1, Math.floor(usable.length / 20));
    const low = minX + span * 0.3;
    const high = maxX - span * 0.3;
    let best: { start: number; end: number } | null = null;
    let runStart: number | null = null;
    for (let x = low; x <= high; x += 1) {
      const across = usable.filter((line) => Rects.minX(line) < x && Rects.maxX(line) > x).length;
      if (across <= allowed) {
        const start: number = runStart ?? x;
        runStart = start;
        if (!best || x - start > best.end - best.start) best = { start, end: x };
      } else {
        runStart = null;
      }
    }
    if (!best || best.end - best.start < 8) return null;
    const gutter = (best.start + best.end) / 2;
    const leftLines = usable.filter((line) => Rects.midX(line) < gutter);
    const rightLines = usable.filter((line) => Rects.midX(line) >= gutter);
    const share = Math.floor(usable.length / 4);
    if (leftLines.length < share || rightLines.length < share || leftLines.length === 0 || rightLines.length === 0) {
      return null;
    }
    const extent = (group: Rect[], fallback: [number, number]): [number, number] => {
      const lo = Math.min(...group.map(Rects.minX));
      const hi = Math.max(...group.map(Rects.maxX));
      return lo < hi ? [lo, hi] : fallback;
    };
    const leftRange = extent(leftLines, [minX, gutter]);
    const rightRange = extent(rightLines, [gutter, maxX]);
    return {
      gutter,
      left: [Math.min(leftRange[0], gutter), Math.min(Math.max(leftRange[1], leftRange[0]), gutter)],
      right: [Math.max(rightRange[0], gutter), Math.max(rightRange[1], gutter)],
      leftBottom: Math.min(...leftLines.map(Rects.minY)),
      rightBottom: Math.min(...rightLines.map(Rects.minY)),
    };
  },

  /**
   * Items in reading order for two columns: the whole left column from top to bottom, then the right one.
   * `anchor` is the item's place on the page (y up); an item with none keeps its place after the placed ones.
   */
  readingOrder<Item>(
    items: readonly Item[],
    layout: ColumnLayout,
    anchor: (item: Item) => { x: number; y: number } | null,
  ): Item[] {
    const placed = items.map((item, offset) => ({ offset, item, point: anchor(item) }));
    return placed
      .sort((lhs, rhs) => {
        const a = lhs.point;
        const b = rhs.point;
        if (a && b) {
          const columnA = Columns.column(layout, a.x);
          const columnB = Columns.column(layout, b.x);
          if (columnA !== columnB) return columnA - columnB;
          if (Math.abs(a.y - b.y) > 0.5) return b.y - a.y;
          return lhs.offset - rhs.offset;
        }
        if (!a && !b) return lhs.offset - rhs.offset;
        return a ? -1 : 1;
      })
      .map((entry) => entry.item);
  },
};
