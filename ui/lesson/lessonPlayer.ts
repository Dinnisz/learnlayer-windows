// The playing half of LearnLayer/Lesson/LessonRun.swift @ ref 2026-11-04: a lesson said beat by beat, each beat's
// marks shown while its words are said (the step of the written solution lit, words of the question marked, an option
// crossed out or ringed, a box on the figure), its calculation and its check, then the closing sentence. The view only
// reads this; the voice is `speak`.

import {
  LessonShows,
  type LessonBeat,
  type LessonPitfall,
  type LessonShow,
  type LessonSummary,
} from "@core/lesson/mascotLesson";
import type { LessonFeed } from "@core/lesson/mascotLessonProvider";
import { LessonMorphs, morphSeconds, MorphPacer, type LessonMorph } from "@core/lesson/morphPacer";

export interface LessonState {
  /** The beat being said, from 0; -1 before the first. */
  beat: number;
  /** The line of the written solution the beat is about, from 0. */
  step: number | null;
  /** What is shown on the question while the beat is said. */
  shows: LessonShow[];
  calc: string | null;
  check: { ask: string; options: string[] } | null;
  closing: LessonSummary | null;
  /** The lesson's «Watch out» tag, once its beat has arrived: folded on its step until its beat is said. */
  pitfall: LessonPitfall | null;
  /** The tag is open now: its beat is being said. */
  pitfallIsActive: boolean;
  /** The answer card waits for the lesson to work the answer out (`LessonRun.hidesAnswer`). */
  hidesAnswer: boolean;
  /** The written solution's formula moving from the line the lesson was on to the one this beat moves to. */
  morph: LessonMorph | null;
  speaking: boolean;
  level: number;
  playing: boolean;
}

export type Narrate = (text: string, onLevel: (level: number) => void, signal: AbortSignal) => Promise<void>;

const idle: LessonState = {
  beat: -1,
  step: null,
  shows: [],
  calc: null,
  check: null,
  closing: null,
  pitfall: null,
  pitfallIsActive: false,
  hidesAnswer: false,
  morph: null,
  speaking: false,
  level: 0,
  playing: false,
};

/** How long a check waits for a tap before the lesson goes on. */
const checkPatience = 20_000;

export class LessonPlayer {
  state: LessonState = idle;
  version = 0;
  private readonly controller = new AbortController();
  private readonly listeners = new Set<() => void>();
  private answerCheck: ((index: number | null) => void) | null = null;
  /**
   * Rows of a block worked out from line `from` to line `to` (1 for a single line). Set by the stage, which has the
   * lines; the rows are paced across the beat's voice.
   */
  morphStages: (from: number, to: number) => number = () => 1;
  /** The written solution's line the final answer is worked out on (its last); null for none. */
  answerStep: number | null = null;
  /** The lesson has been on the answer's line and moved on from it. */
  private answerReached = false;
  private answerTimer: number | undefined;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(change: Partial<LessonState>): void {
    this.state = { ...this.state, ...change };
    this.version += 1;
    for (const listener of [...this.listeners]) listener();
  }

  get stopped(): boolean {
    return this.controller.signal.aborted;
  }

  /** Stops the lesson: the voice ends, the marks go, an open check is let go. */
  stop(): void {
    this.controller.abort();
    window.clearTimeout(this.answerTimer);
    this.answerCheck?.(null);
    this.set({ ...idle });
  }

  /** The student's tap on one of the check's two answers. */
  answer(index: number): void {
    this.answerCheck?.(index);
  }

  private say(text: string, narrate: Narrate): Promise<void> {
    this.set({ speaking: true });
    return narrate(text, (level) => this.set({ level }), this.controller.signal).finally(() =>
      this.set({ speaking: false, level: 0 }),
    );
  }

  /** Plays the feed's beats as they arrive, then its closing. */
  async play(feed: LessonFeed, narrate: Narrate): Promise<void> {
    this.set({ playing: true });
    let index = 0;
    while (!this.stopped) {
      if (index >= feed.beats.length) {
        if (feed.isFinished) break;
        await feed.changed();
        continue;
      }
      this.learnPitfall(feed.beats);
      const beat = feed.beats[index]!;
      await this.playBeat(beat, index, narrate);
      index += 1;
    }
    if (!this.stopped && feed.summary) {
      window.clearTimeout(this.answerTimer);
      this.set({
        shows: [],
        calc: null,
        step: null,
        pitfallIsActive: false,
        hidesAnswer: false,
        morph: null,
        closing: feed.summary,
      });
      await this.say(feed.summary.say, narrate);
      await this.pause(1_200);
    }
    if (!this.stopped) this.set({ ...idle });
  }

  private async playBeat(beat: LessonBeat, index: number, narrate: Narrate): Promise<void> {
    const steps = beat.show.map((show) => show.step).filter((step): step is number => step != null && step > 0);
    const pitfall = beat.show.map((show) => LessonShows.pitfall(show)).find((found) => found !== null) ?? null;
    // A beat that names no line stays on the line before it; one that moves to another line morphs that line into it.
    const previous = this.state.step;
    const step = steps.length > 0 ? steps[0]! - 1 : previous;
    if (previous !== null && previous === this.answerStep && step !== previous) this.answerReached = true;
    let morph: LessonMorph | null = null;
    if (previous !== null && step !== null && step !== previous) {
      const pacer = new MorphPacer(
        this.morphStages(previous, step),
        morphSeconds(beat.say),
        MorphPacer.speakingSeconds(beat.say),
      );
      morph = {
        from: previous,
        to: step,
        beat: index,
        started: Date.now(),
        duration: pacer.stageLength,
        pacing: pacer.pacing(0),
        frozen: null,
      };
    }
    this.set({
      beat: index,
      step,
      morph,
      shows: beat.show.filter((show) => show.op !== "pitfall"),
      calc: beat.calc?.line ?? null,
      check: null,
      pitfallIsActive: pitfall !== null && samePitfall(pitfall, this.state.pitfall),
    });
    this.refreshAnswer();
    await this.say(beat.say, narrate);
    await this.settleMorph(index);
    const check = beat.check;
    if (!check || this.stopped) return;
    this.set({ check: { ask: check.ask, options: check.options } });
    await this.say(check.ask, narrate);
    const tapped = await new Promise<number | null>((resolve) => {
      const timer = window.setTimeout(() => resolve(null), checkPatience);
      this.answerCheck = (choice) => {
        window.clearTimeout(timer);
        this.answerCheck = null;
        resolve(choice);
      };
    });
    this.set({ check: null });
    if (tapped === null || this.stopped) return;
    await this.say(tapped === check.correct ? check.right : check.wrong, narrate);
  }

  /** The lesson's tag, from the beats arrived so far: the first one (the guards keep one at most). */
  private learnPitfall(beats: readonly LessonBeat[]): void {
    if (this.state.pitfall) return;
    for (const beat of beats)
      for (const show of beat.show) {
        const pitfall = LessonShows.pitfall(show);
        if (pitfall) {
          this.set({ pitfall });
          return;
        }
      }
  }

  /**
   * While a lesson plays, the answer card waits for the lesson to work the answer out: until its line has come in (its
   * move landed), or the closing.
   */
  private answerHidden(now: number): boolean {
    const { playing, closing, step, morph } = this.state;
    if (!playing || closing !== null || this.answerReached || this.answerStep === null) return false;
    if (step !== this.answerStep) return true;
    if (!morph || morph.to !== this.answerStep) return false;
    return LessonMorphs.progress(morph, now) < 1;
  }

  /** Works out whether the answer waits, and looks again when the answer's line has landed. */
  private refreshAnswer(): void {
    window.clearTimeout(this.answerTimer);
    const now = Date.now();
    const hidden = this.answerHidden(now);
    if (hidden !== this.state.hidesAnswer) this.set({ hidesAnswer: hidden });
    const morph = this.state.morph;
    if (hidden && morph && morph.to === this.answerStep && morph.frozen === null) {
      const left = morph.started + LessonMorphs.total(morph) * 1000 - now;
      this.answerTimer = window.setTimeout(() => this.refreshAnswer(), Math.max(0, left) + 20);
    }
  }

  /** Returns once beat `index`'s formula move has played, waiting at most `MorphPacer.maximumOverrun`. */
  private async settleMorph(index: number): Promise<void> {
    const morph = this.state.morph;
    if (this.stopped || !morph || morph.beat !== index || morph.frozen !== null) return;
    const left = morph.started / 1000 + LessonMorphs.total(morph) - Date.now() / 1000;
    if (left > 0) await this.pause(Math.min(left, MorphPacer.maximumOverrun) * 1000);
  }

  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(resolve, ms);
      this.controller.signal.addEventListener("abort", () => {
        window.clearTimeout(timer);
        resolve();
      });
    });
  }
}

const samePitfall = (a: LessonPitfall, b: LessonPitfall | null) =>
  b !== null && a.step === b.step && a.mistake === b.mistake && a.why === b.why;
