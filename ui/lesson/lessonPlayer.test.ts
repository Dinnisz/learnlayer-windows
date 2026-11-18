// Port of the lesson tests of LearnLayerTests/LessonPitfallMorphTests.swift @ ref 2026-11-04 that play a lesson
// (aBeatThatMovesToAnotherLineMorphsFromTheOneBefore, theAnswerWaitsForTheLessonToWorkItOut,
// thePitfallIsFoldedOnItsStepAndOpenOnlyWhileItsBeatIsSaid), on the Windows `LessonPlayer`, beat by beat.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonBeat, LessonShow, MascotLesson } from "@core/lesson/mascotLesson";
import { LessonFeed } from "@core/lesson/mascotLessonProvider";
import { LessonPlayer, type Narrate } from "./lessonPlayer";

const highlight = (step: number): LessonShow => ({ op: "highlight", step });
const beat = (say: string, show: LessonShow[] = []): LessonBeat => ({ kind: "explain", say, show });

/** A voice that says each line only when told to; `said` is how many lines it has been asked for. */
function voice() {
  const lines: string[] = [];
  let finish: (() => void) | null = null;
  const narrate: Narrate = (text) =>
    new Promise<void>((resolve) => {
      lines.push(text);
      finish = resolve;
    });
  return {
    narrate,
    lines,
    /** Ends the line being said, and lets the lesson go on to the next one. */
    async next(ms = 0) {
      const done = finish;
      finish = null;
      done?.();
      await vi.advanceTimersByTimeAsync(ms);
    },
  };
}

function walk(pitfallOn: number | null = null): MascotLesson {
  const second = beat("Now we put the data in.", [highlight(2)]);
  if (pitfallOn !== null)
    second.show.push({
      op: "pitfall",
      step: pitfallOn,
      mistake: "Using 1 + r = 0,05",
      why: "The one keeps the money you already have.",
    });
  return {
    beats: [
      beat("The formula first.", [highlight(1)]),
      second,
      beat("Still on the same line."),
      beat("Then the power.", [highlight(3)]),
    ],
    summary: { say: "Done." },
  };
}

describe("a lesson played beat by beat", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("a beat that moves to another line morphs from the one before", async () => {
    const lesson = walk();
    lesson.beats.push(beat("Same power.", [highlight(3)]));
    const player = new LessonPlayer();
    const said = voice();
    void player.play(LessonFeed.of(lesson), said.narrate);
    await vi.advanceTimersByTimeAsync(0);
    expect(player.state.morph).toBeNull();
    await said.next();
    expect([player.state.morph?.from, player.state.morph?.to]).toEqual([0, 1]);
    // A beat that stays on its line has no morph of its own.
    await said.next(5_000);
    expect(player.state.morph).toBeNull();
    expect(player.state.step).toBe(1);
    await said.next();
    expect([player.state.morph?.from, player.state.morph?.to]).toEqual([1, 2]);
    // A beat that names the line it is already on does not move it again.
    await said.next(5_000);
    expect(player.state.morph).toBeNull();
    player.stop();
  });

  it("the move waits for its rows before the next beat, at most the overrun", async () => {
    const player = new LessonPlayer();
    player.morphStages = () => 3;
    const said = voice();
    void player.play(LessonFeed.of(walk()), said.narrate);
    await vi.advanceTimersByTimeAsync(0);
    await said.next();
    const morph = player.state.morph!;
    expect(morph.pacing?.starts).toHaveLength(3);
    // The voice ends at once: the lesson waits for the rows (here less than the 3 s overrun), then goes on.
    await said.next(100);
    expect(said.lines).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(said.lines).toHaveLength(3);
    player.stop();
  });

  it("the answer waits for the lesson to work it out", async () => {
    const lesson: MascotLesson = {
      beats: [
        beat("The rule.", [highlight(1)]),
        beat("Put the numbers in.", [highlight(2)]),
        beat("Back to the rule.", [highlight(1)]),
      ],
      summary: { say: "Start speed plus acceleration times time." },
    };
    const player = new LessonPlayer();
    player.answerStep = 1;
    // Not playing: the answer is shown, as in the solution without a lesson.
    expect(player.state.hidesAnswer).toBe(false);
    const said = voice();
    void player.play(LessonFeed.of(lesson), said.narrate);
    await vi.advanceTimersByTimeAsync(0);
    expect(player.state.hidesAnswer).toBe(true);
    // On the answer's line: hidden while its rows come in, shown once the last has landed.
    await said.next();
    expect(player.state.step).toBe(1);
    expect(player.state.hidesAnswer).toBe(true);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(player.state.hidesAnswer).toBe(false);
    // Moving on from it keeps it shown, and so does the closing.
    await said.next(3_000);
    expect(player.state.step).toBe(0);
    expect(player.state.hidesAnswer).toBe(false);
    await said.next(3_000);
    expect(player.state.closing?.say).toBe("Start speed plus acceleration times time.");
    expect(player.state.hidesAnswer).toBe(false);
    player.stop();
    // A solution with no lines has nothing to wait for.
    const none = new LessonPlayer();
    const quiet = voice();
    void none.play(LessonFeed.of(lesson), quiet.narrate);
    await vi.advanceTimersByTimeAsync(0);
    expect(none.state.hidesAnswer).toBe(false);
    none.stop();
  });

  it("the pitfall is folded on its step and open only while its beat is said", async () => {
    const player = new LessonPlayer();
    const said = voice();
    void player.play(LessonFeed.of(walk(2)), said.narrate);
    await vi.advanceTimersByTimeAsync(0);
    // Known from the start, on the second line, folded.
    expect(player.state.pitfall?.step).toBe(1);
    expect(player.state.pitfallIsActive).toBe(false);
    await said.next();
    expect(player.state.pitfallIsActive).toBe(true);
    // It marks nothing on the question.
    expect(player.state.shows.some((show) => show.op === "pitfall")).toBe(false);
    await said.next(5_000);
    expect(player.state.pitfall?.step).toBe(1);
    expect(player.state.pitfallIsActive).toBe(false);
    await said.next(5_000);
    await said.next(5_000);
    expect(player.state.closing).not.toBeNull();
    expect(player.state.pitfallIsActive).toBe(false);
    player.stop();
  });
});
