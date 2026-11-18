// The sphere's perch over a voice mark (VoiceCanvasPlan.covered and .perch, VoiceMascot.perch @ ref 2026-11-04).

import { describe, expect, it } from "vitest";
import { PenRing } from "../explanation/handDrawn";
import { VoicePerch } from "./voicePerch";

describe("where the sphere sits for a voice mark", () => {
  it("a ring covers its loop; a line its overshoot and its sag", () => {
    const ring = { x: 40, y: 10, width: 12, height: 16 };
    expect(VoicePerch.covered("circle", ring)).toEqual(PenRing.outerBounds(ring));
    const line = VoicePerch.covered("underline", { x: 10, y: 30, width: 100, height: 0 });
    expect(line.x).toBeCloseTo(10 - 3 - 1.1);
    expect(line.width).toBeCloseTo(100 + 7 + 2.2);
    expect(line.height).toBeCloseTo(5 + 1.1);
  });

  it("sits centred above the formula and the stroke, inside the formula's width", () => {
    // A ring in the middle of a 300-wide formula: centred over it, its bottom 2 above the formula's top.
    const spot = VoicePerch.perch({ x: 140, y: 12, width: 20, height: 24 }, 300, 56);
    expect(spot).toEqual({ x: 122, y: -58, width: 56, height: 56 });
    // Near an edge it stays inside.
    expect(VoicePerch.perch({ x: 0, y: 12, width: 10, height: 24 }, 300, 56).x).toBe(0);
    expect(VoicePerch.perch({ x: 290, y: 12, width: 10, height: 24 }, 300, 56).x).toBe(244);
    // A stroke above the formula's top (none here) would set it higher still.
    expect(VoicePerch.over({ x: 0, y: -20, width: 10, height: 4 }, 56, 0).y).toBe(-78);
  });
});
