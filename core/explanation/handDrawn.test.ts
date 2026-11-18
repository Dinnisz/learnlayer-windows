// Port of LearnLayerTests/MascotLessonTests.swift anInPlaceRingGoesRoundTheWholeQuoteWithRoomAtItsEnds and the loop's
// shape from HighlightMappingTests.swift theSphereSitsBesideTheMarkAndNeverBecomesAPenOrAnArrow @ ref 2026-11-04.

import { describe, expect, it } from "vitest";
import { LessonEvidence } from "../lesson/lessonEvidence";
import { HandDrawnUnderline, InkMask, PenRing } from "./handDrawn";

describe("the pen's loop and line", () => {
  it("an in-place ring goes round the whole quote with room at its ends", () => {
    // "1000 € a 5% ao ano" on a line: the drawn loop goes round every corner of the quote, so neither the "1" it
    // starts with nor its last "o" is cut.
    for (const quote of [
      { x: 140, y: 30, width: 150, height: 18 },
      { x: 60, y: 40, width: 40, height: 10 },
    ]) {
      const ring = LessonEvidence.ringBox(quote);
      const words = InkMask.boxes([quote], 400, 120);
      expect(PenRing.encloses(ring, words, 1)).toBe(true);
      // At least 4 points of room past each end, at the line's middle.
      const midY = quote.y + quote.height / 2;
      const ends = InkMask.boxes([{ x: quote.x - 4, y: midY - 0.5, width: quote.width + 8, height: 1 }], 400, 120);
      expect(PenRing.encloses(ring, ends, 0)).toBe(true);
      // Centred on the quote, and no bigger than going round it needs.
      const loop = PenRing.outerBounds(ring);
      expect(Math.abs(loop.x + loop.width / 2 - (quote.x + quote.width / 2))).toBeLessThan(4);
      expect(loop.width).toBeLessThanOrEqual(quote.width * 1.6 + 16);
      expect(loop.height).toBeLessThanOrEqual(quote.height * 3.4);
    }
  });

  it("the loop wobbles round its ellipse, a little past where it began", () => {
    const rect = { x: 0, y: 0, width: 30, height: 40 };
    const loop = PenRing.points(rect);
    expect(loop).toHaveLength(73);
    const shape = PenRing.ellipse(rect);
    expect(shape).toEqual({ centreX: 15, centreY: 20, radiusX: 18, radiusY: 22 });
    // Every point near the ellipse (wobble under 10 %), and the pen goes past its start rather than closing on it.
    for (const point of loop) {
      const r = Math.hypot((point.x - 15) / 18, (point.y - 20) / 22);
      expect(r).toBeGreaterThan(0.9);
      expect(r).toBeLessThan(1.1);
    }
    const first = loop[0]!;
    const last = loop[loop.length - 1]!;
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeGreaterThan(5);
    // A ring this size does not take in a point well outside it.
    expect(PenRing.enclosesPoint(rect, 15, 20)).toBe(true);
    expect(PenRing.enclosesPoint(rect, 40, 20)).toBe(false);
    expect(PenRing.path(rect).startsWith("M")).toBe(true);
  });

  it("a ring round a glyph goes round all of it with a margin and stays round", () => {
    // From VoiceFlowTests.expectRoundRing: the ring encloses the glyph's ink with its margin, at most 1.4 wide or tall.
    for (const glyph of [
      { x: 10, y: 6, width: 6, height: 9 },
      { x: 4, y: 4, width: 18, height: 7 },
      { x: 8, y: 2, width: 3, height: 14 },
    ]) {
      const own = InkMask.boxes([glyph], 40, 24, 4);
      const ring = PenRing.ring(glyph, own);
      expect(PenRing.encloses(ring, own)).toBe(true);
      expect(PenRing.encloses(ring, own, 1)).toBe(true);
      expect(PenRing.aspect(ring)).toBeLessThanOrEqual(PenRing.maximumAspect + 1e-9);
      // Without its ink, the glyph's box stands in.
      expect(PenRing.encloses(PenRing.ring(glyph), own, 1)).toBe(true);
    }
    expect(PenRing.ring({ x: 0, y: 0, width: 0, height: 4 })).toEqual({ x: 0, y: 0, width: 0, height: 4 });
  });

  it("the underline runs under the words, past their ends", () => {
    const path = HandDrawnUnderline.path({ x: 10, y: 20, width: 100, height: 14 });
    expect(path).toBe("M8 36.4 C44.4 35.4 80.8 36.6 112 35.7");
  });
});
