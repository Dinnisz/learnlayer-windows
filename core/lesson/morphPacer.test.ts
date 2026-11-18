// Port of the pacing tests of LearnLayerTests/LessonPitfallMorphTests.swift @ ref 2026-11-04 (rowsArePacedAcrossTheVoice,
// theHeardVoiceMovesRowsNotYetBegun, theVoiceLengthFallsBackToTheSpeakingRate, theMorphTakesPartOfTheBeatsSpokenTime).

import { describe, expect, it } from "vitest";
import { MorphPacing } from "../explanation/equationMorph";
import { LessonMorphs, morphSeconds, MorphPacer } from "./morphPacer";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("a block's rows paced across the voice", () => {
  it("the morph takes part of the beat's spoken time", () => {
    expect(morphSeconds("Hi.")).toBe(0.9);
    expect(morphSeconds("word ".repeat(80))).toBe(2.4);
    const morph = { from: 0, to: 1, beat: 1, started: 0, duration: 2, pacing: null, frozen: null };
    expect(LessonMorphs.progress(morph, 1000)).toBe(0.5);
    expect(LessonMorphs.progress(morph, 5000)).toBe(1);
    // A held frame stays where it is held.
    expect(LessonMorphs.progress({ ...morph, frozen: 0.4 }, 99_000)).toBe(0.4);
  });

  it("rows are paced across the voice", () => {
    // 3 rows over 6 s of voice: the last has come in at 80% of it (4.8 s), the middle one starts halfway to the last
    // one's start.
    const pacing = new MorphPacer(3, 2.4, 6).pacing(0);
    expect(pacing.starts[0]).toBe(0);
    expect(pacing.lengths.every((length, k) => near(length, [1.6, 1.28, 1.28][k]!))).toBe(true);
    expect(near(pacing.starts[1]!, 1.76) && near(pacing.starts[2]!, 3.52)).toBe(true);
    expect(near(pacing.total, 6 * MorphPacer.spread)).toBe(true);
    // A row never starts before the one above has played, however quick the voice.
    const rushed = new MorphPacer(3, 2.4, 0.2).pacing(0);
    expect(rushed.lengths[0]).toBe(MorphPacer.shortestRow);
    expect(rushed.starts[1]!).toBeGreaterThanOrEqual(rushed.starts[0]! + rushed.lengths[0]!);
    expect(rushed.starts[2]!).toBeGreaterThanOrEqual(rushed.starts[1]! + rushed.lengths[1]!);
    // One line: the move is the beat's own length, not stretched to the voice.
    expect(new MorphPacer(1, 1.2, 9).pacing(0)).toEqual(new MorphPacing([0], [1.2]));
  });

  it("the heard voice moves rows not yet begun", () => {
    const pacer = new MorphPacer(3, 2.4, 6);
    const planned = pacer.pacing(0);
    // The voice began 0.5 s in and has said 20% after 2 s: 10 s long, not 6.
    pacer.heard(0.2, 2, 2.5);
    const heard = pacer.pacing(2.5);
    expect(heard.starts[0]).toBe(planned.starts[0]);
    expect(heard.lengths[0]).toBe(planned.lengths[0]);
    // Row 2 had begun at 1.76 s: it stays. Row 3 moves to end at 0.5 + 10 × 0.8.
    expect(heard.starts[1]).toBe(planned.starts[1]);
    expect(near(heard.starts[2]! + heard.lengths[2]!, 0.5 + 10 * 0.8)).toBe(true);
    // Too little said to tell the length by: only the start is learned.
    const early = new MorphPacer(2, 2, 4);
    early.pacing(0);
    early.heard(0.01, 0.1, 0.4);
    expect(near(early.pacing(0.4).starts[1]!, 0.3 + 4 * 0.8 - 1.28)).toBe(true);
    // A row whose moment has passed starts now, never in the past.
    const late = new MorphPacer(2, 0.6, 4);
    expect(near(late.pacing(0).starts[1]!, 2.72)).toBe(true);
    late.heard(0.6, 0.4, 1);
    expect(late.pacing(1).starts[1]).toBe(1);
  });

  it("the voice length falls back to the speaking rate", () => {
    expect(near(MorphPacer.speakingSeconds("a".repeat(145)), 10)).toBe(true);
    expect(MorphPacer.speakingSeconds("Sim.")).toBe(MorphPacer.voiceRange.lowerBound);
    expect(MorphPacer.speakingSeconds("palavra ".repeat(200))).toBe(MorphPacer.voiceRange.upperBound);
  });
});
