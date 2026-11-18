// Port of MorphPacer and LessonRun.Morph / morphSeconds / readingSeconds (LearnLayer/Lesson/LessonRun.swift @ ref
// 2026-11-04): the written solution's formula moving from the line a lesson was on to the one it moves to, its rows
// paced across the voice of the beat that works it out.

import { EquationMorph, MorphPacing } from "../explanation/equationMorph";

/** Seconds a line stays up to be said and read. */
export const readingSeconds = (text: string) => Math.max(1.6, 0.9 + Array.from(text).length * 0.055);

/**
 * How long a formula takes to become the next line: part of the beat that moves to it, so it has settled well before
 * the voice moves on.
 */
export const morphSeconds = (text: string) => Math.min(2.4, Math.max(0.9, readingSeconds(text) * 0.4));

/** The written solution's formula moving from the line the lesson was on to the one it moves to. */
export interface LessonMorph {
  /** Lines of the written solution, from 0. */
  from: number;
  to: number;
  /** The beat that moved the lesson to the new line. */
  beat: number;
  /** Milliseconds since the epoch. */
  started: number;
  /** One row's seconds. */
  duration: number;
  /** When each row plays, from `started`: kept in step with the beat's voice. */
  pacing: MorphPacing | null;
  /** The share of the animation drawn, held still. */
  frozen: number | null;
}

export const LessonMorphs = {
  total: (morph: LessonMorph) => morph.pacing?.total ?? morph.duration,

  /** 0…1 at `date` (milliseconds since the epoch). */
  progress(morph: LessonMorph, date: number): number {
    if (morph.frozen !== null) return Math.min(Math.max(morph.frozen, 0), 1);
    const total = LessonMorphs.total(morph);
    if (!(total > 0)) return 1;
    return Math.min(Math.max((date - morph.started) / 1000 / total, 0), 1);
  },
};

/**
 * Paces the rows of a block across the voice of the beat that works it out: the first row starts with the beat, the
 * last has come in as the voice reaches `spread` of the line (where it usually says the result), and the rows between
 * are spread evenly. What sets the voice's length, first to last: the narrator's progress through the actual audio
 * (`heard`), a length known before it plays (`voice`), or the speaking rate (`speakingSeconds`).
 */
export class MorphPacer {
  /** pt-PT read aloud, in characters a second (the Mac's and Joana's voices both say about 14–15). */
  static readonly charactersPerSecond = 14.5;
  /** The rows are spread over this share of the voice: the last has settled before it ends. */
  static readonly spread = 0.8;
  /** A row's move never takes less than this, however quick the voice. */
  static readonly shortestRow = 0.6;
  /** The voice's length is believed within these bounds. */
  static readonly voiceRange = { lowerBound: 0.8, upperBound: 40 };
  /** The beat waits this long at most for its last row after the voice ends. */
  static readonly maximumOverrun = 3;
  /** A move waits this long at most for its voice to be heard before it starts without it. */
  static readonly voiceWait = 2;

  readonly stages: number;
  /** Seconds the voice takes, best known so far. */
  voice: number;
  /** When the voice began, in seconds from the start of the morph (0 until it is heard). */
  voiceStart = 0;
  /** The rows' timing last given: rows it had begun by now keep their start and length. */
  private planned: { start: number; length: number }[] = [];

  constructor(
    stages: number,
    /** One row's move, in seconds. */
    readonly stageLength: number,
    voice: number,
  ) {
    this.stages = Math.max(1, stages);
    this.voice = MorphPacer.clampVoice(voice);
  }

  private static clampVoice(seconds: number): number {
    return Math.min(Math.max(seconds, MorphPacer.voiceRange.lowerBound), MorphPacer.voiceRange.upperBound);
  }

  /** Seconds to say `text` at the pt-PT speaking rate. */
  static speakingSeconds(text: string): number {
    const spoken = Array.from(text).filter((ch) => !/^\s$/u.test(ch) || ch === " ").length;
    return MorphPacer.clampVoice(spoken / MorphPacer.charactersPerSecond);
  }

  /**
   * The narrator has said `fraction` of the line `elapsed` seconds after it began, `now` seconds into the morph.
   * Early on the share is too small to tell the length by.
   */
  heard(fraction: number, elapsed: number, now: number): void {
    if (!Number.isFinite(fraction) || !Number.isFinite(elapsed) || elapsed < 0) return;
    this.voiceStart = Math.max(0, now - elapsed);
    if (fraction >= 0.08) this.voice = MorphPacer.clampVoice(elapsed / Math.min(fraction, 1));
  }

  /**
   * The rows' timing as known `now` seconds into the morph: rows already begun stay where they are, the others start
   * when the voice reaches them, never before `now` and never before the row above has played.
   */
  pacing(now: number): MorphPacing {
    const first =
      this.stages > 1
        ? Math.min(this.stageLength, Math.max(MorphPacer.shortestRow, (this.voice * MorphPacer.spread) / this.stages))
        : this.stageLength;
    const fixed: { start: number; length: number }[] = [];
    for (const row of this.planned) {
      if (row.start > now) break;
      fixed.push(row);
    }
    const starts: number[] = [];
    const lengths: number[] = [];
    for (let row = 0; row < this.stages; row++) {
      if (row < fixed.length) {
        starts.push(fixed[row]!.start);
        lengths.push(fixed[row]!.length);
        continue;
      }
      const length = row === 0 ? first : first * EquationMorph.stageShare;
      const lastStart = this.voice * MorphPacer.spread - first * EquationMorph.stageShare;
      const reached = row === 0 ? 0 : this.voiceStart + (lastStart * row) / (this.stages - 1);
      const afterAbove = row === 0 ? 0 : starts[row - 1]! + lengths[row - 1]!;
      starts.push(Math.max(reached, afterAbove, row === 0 ? 0 : now));
      lengths.push(length);
    }
    this.planned = starts.map((start, k) => ({ start, length: lengths[k]! }));
    return new MorphPacing(starts, lengths);
  }
}
