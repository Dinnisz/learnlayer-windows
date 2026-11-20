// Port of LearnLayerTests/ExplanationLayoutTests.swift (the columns) @ ref 2026-11-04
import { describe, expect, it } from "vitest";
import { ExplanationLayout } from "./explanationLayout";

/** `Stage.isCompact`: a window no taller than 420 points. */
function layout(width: number, height = 900, hasFigure = true) {
  const compact = height <= 420;
  const margin = compact ? 12 : 28;
  return ExplanationLayout.make({ windowWidth: width, margin, stackedWidth: width - 2 * margin, hasFigure, compact });
}

describe("ExplanationLayout columns", () => {
  it("a wide window puts the words left and the figures right", () => {
    const wide = layout(1440);
    expect(wide.arrangement).toBe("sideBySide");
    expect(wide.figureWidth!).toBeGreaterThan(0);
    expect(wide.textWidth).toBeGreaterThanOrEqual(ExplanationLayout.textMinimum);
    expect(Math.abs(wide.textWidth + wide.gutter + wide.figureWidth! - wide.panelWidth)).toBeLessThan(0.001);
    expect(wide.panelWidth).toBeLessThanOrEqual(1440 - 2 * 28 + 0.001);
  });

  it("the words keep a readable measure and the figure takes the rest", () => {
    const huge = layout(2560);
    expect(huge.arrangement).toBe("sideBySide");
    expect(huge.textWidth).toBe(ExplanationLayout.readableMeasure);
    expect(huge.figureWidth).toBe(ExplanationLayout.wideFigureMaximum);
    const large = layout(1440);
    expect(large.textWidth).toBe(ExplanationLayout.readableMeasure);
    expect(large.figureWidth!).toBeGreaterThan(ExplanationLayout.figureMaximum);
    expect(large.figureWidth!).toBeLessThanOrEqual(ExplanationLayout.wideFigureMaximum);
  });

  it("a mid-size window shares the width as before", () => {
    const mid = layout(1100);
    expect(mid.arrangement).toBe("sideBySide");
    expect(Math.abs(mid.figureWidth! - 1044 * 0.42)).toBeLessThan(0.001);
    expect(Math.abs(mid.panelWidth - 1044)).toBeLessThan(0.001);
    expect(mid.gutter).toBe(32);
  });

  it("a narrow window stacks the figures under the words", () => {
    const narrow = layout(640);
    expect(narrow.arrangement).toBe("stacked");
    expect(narrow.figureWidth).toBeNull();
    expect(Math.abs(narrow.panelWidth - (640 - 2 * 28))).toBeLessThan(0.001);
    expect(narrow.textWidth).toBe(narrow.panelWidth);
  });

  it("a short window keeps the figure beside the steps", () => {
    const short = layout(480, 400);
    expect(short.arrangement).toBe("sideBySide");
    expect(short.figureWidth!).toBeLessThanOrEqual(ExplanationLayout.compactFigureMaximum);
    expect(short.gutter).toBe(12);
    expect(short.textWidth).toBeGreaterThanOrEqual(ExplanationLayout.compactTextMinimum);
  });

  it("no figure means one column", () => {
    const plain = layout(1440, 900, false);
    expect(plain.arrangement).toBe("stacked");
    expect(plain.figureWidth).toBeNull();
  });

  it("a window too narrow for readable words stacks", () => {
    const tiny = ExplanationLayout.make({
      windowWidth: 300,
      margin: 12,
      stackedWidth: 276,
      hasFigure: true,
      compact: true,
    });
    expect(tiny.arrangement).toBe("stacked");
    expect(tiny.panelWidth).toBe(276);
  });

  it("every width stays readable and inside the stage", () => {
    for (let width = 720; width <= 2880; width += 40) {
      const each = layout(width);
      expect(each.arrangement).toBe("sideBySide");
      expect(each.textWidth).toBeGreaterThanOrEqual(ExplanationLayout.textMinimum);
      expect(each.textWidth).toBeLessThanOrEqual(ExplanationLayout.readableMeasure);
      expect(each.figureWidth!).toBeLessThanOrEqual(ExplanationLayout.wideFigureMaximum);
      expect(each.panelWidth).toBeLessThanOrEqual(width - 2 * 28 + 0.001);
    }
  });
});
