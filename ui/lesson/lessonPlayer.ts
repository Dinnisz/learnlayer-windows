// The playing half of LearnLayer/Lesson/LessonRun.swift @ ref 2026-11-04: a lesson said beat by beat, each beat's
// marks shown while its words are said (the step of the written solution lit, words of the question marked, an option
// crossed out or ringed, a box on the figure), its calculation and its check, then the closing sentence. The view only
// reads this; the voice is `speak`.

import type { LessonBeat, LessonShow, LessonSummary } from "@core/lesson/mascotLesson";
import type { LessonFeed } from "@core/lesson/mascotLessonProvider";

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
  /** A «Watch out» tag on a step. */
  pitfall: { step: number; mistake: string; why: string } | null;
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
      const beat = feed.beats[index]!;
      await this.playBeat(beat, index, narrate);
      index += 1;
    }
    if (!this.stopped && feed.summary) {
      this.set({ shows: [], calc: null, step: null, pitfall: null, closing: feed.summary });
      await this.say(feed.summary.say, narrate);
      await this.pause(1_200);
    }
    if (!this.stopped) this.set({ ...idle });
  }

  private async playBeat(beat: LessonBeat, index: number, narrate: Narrate): Promise<void> {
    const steps = beat.show.map((show) => show.step).filter((step): step is number => step != null && step > 0);
    const pitfallShow = beat.show.find((show) => show.op === "pitfall" && show.step && show.mistake && show.why);
    this.set({
      beat: index,
      step: steps.length > 0 ? steps[0]! - 1 : this.state.step,
      shows: beat.show.filter((show) => show.op !== "pitfall"),
      calc: beat.calc?.line ?? null,
      check: null,
      pitfall: pitfallShow
        ? { step: pitfallShow.step! - 1, mistake: pitfallShow.mistake!, why: pitfallShow.why! }
        : this.state.pitfall,
    });
    await this.say(beat.say, narrate);
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
