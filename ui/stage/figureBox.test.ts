// Port of LearnLayerTests/SolidFigureDisplayTests.swift (theBoxHasOneHeightThatFitsTheScreen) @ 5701363
import { describe, expect, it } from "vitest";
import { FigureBoxSize } from "./figureBox";

describe("FigureBoxSize", () => {
  it("has one height that fits the screen", () => {
    // The overlay of a 1470×956 screen, with a tall and a short work area: never more than 42%.
    for (const [overlay, work] of [
      [956, 820],
      [956, 600],
      [700, 520],
      [1200, 1050],
    ] as const) {
      const height = FigureBoxSize.height(overlay, work);
      expect(height).toBeLessThanOrEqual(Math.max(FigureBoxSize.minimum, overlay * 0.45));
      expect(height).toBeLessThanOrEqual(Math.max(FigureBoxSize.minimum, work * 0.6));
      expect(height).toBeGreaterThanOrEqual(FigureBoxSize.minimum);
    }
    // It depends on the window only: the same while the steps stream in.
    expect(FigureBoxSize.height(956, 820)).toBe(FigureBoxSize.height(956, 820));
  });
});
