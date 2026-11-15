// Port of LearnLayer/Lesson/MascotLessonProvider.swift and LessonFeed (LearnLayer/Lesson/LessonRun.swift)
// @ ref 2026-11-04: one lesson call, streamed beat by beat, kept in a cache, asked once however often it is wanted,
// and asked of Sonnet when the lesson model's reply is not a lesson.

import { cacheKey, type DiskCache } from "../ai/diskCache";
import { AISettings } from "../ai/modelRouting";
import { ModelError, type ModelClient, type ModelOptions } from "../ai/modelClient";
import { PartialJSON } from "../ai/partialJSON";
import type { TutorLanguage } from "../problems/solutionRequest";
import { VoiceTutorRouting } from "../voice/voiceTutorPrompt";
import {
  decodeBeat,
  LessonFailure,
  LessonStream,
  MascotLessons,
  type LessonBeat,
  type LessonSummary,
  type MascotLesson,
} from "./mascotLesson";
import { MascotLessonPrompt } from "./mascotLessonPrompt";

/** Everything one lesson call needs. Equal requests have the same key, so a lesson asked twice is bought once. */
export interface LessonRequest {
  doubt: string | null;
  questionText: string;
  optionLines: Readonly<Record<string, string>>;
  optionLetters: readonly string[];
  subject: string | null;
  /** What the student already read (the solution on screen); null when there is none yet. */
  work: string | null;
  /** The solution's own wording, to keep the lesson from repeating it. */
  solutionTexts: readonly string[];
  figureLabels?: readonly string[];
  picture?: Uint8Array | null;
  statementPicture?: Uint8Array | null;
  language: TutorLanguage;
  needsStrongModel: boolean;
  /** The option the written answer names ("B"), kept off-limits for the mascot's marks. */
  correctOption: string | null;
  figure3D?: string | null;
  /** Set on the copy asked again of Sonnet. */
  modelOverride?: string | null;
}

export const LessonRequests = {
  key(request: LessonRequest): Promise<string> {
    const doubt = (request.doubt ?? "").trim().toLowerCase();
    return cacheKey(
      MascotLessonPrompt.version,
      request.language,
      request.questionText,
      doubt,
      request.work ?? "",
      request.figure3D ?? "",
    );
  },

  /** A solved question is taught by the lesson model, with Sonnet behind it; an unsolved one follows its route. */
  modelID(request: LessonRequest): string {
    if (request.modelOverride) return request.modelOverride;
    if ((request.work ?? "") !== "") return AISettings.lessonModel;
    return VoiceTutorRouting.modelID(request.needsStrongModel);
  },

  /** The same request asked of Sonnet; null when this one is not on the lesson model (Sonnet is asked once). */
  fallback(request: LessonRequest): LessonRequest | null {
    if (request.modelOverride || LessonRequests.modelID(request) !== AISettings.lessonModel) return null;
    return { ...request, modelOverride: AISettings.strongModel };
  },

  /** How many lines the written solution numbers ("Step 1:", "Step 2:"…), 0 when there is none. */
  stepCount(request: LessonRequest): number {
    const numbers = (request.work ?? "")
      .split("\n")
      .map((line) => /^Step (\d+):/u.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => Number(match[1]));
    return numbers.length ? Math.max(...numbers) : 0;
  },

  /** Enough beats and, for «Explica-me» on a written solution, every step lit at least once. */
  isGoodEnough(request: LessonRequest, beats: readonly LessonBeat[]): boolean {
    if (beats.length < MascotLessons.minimumBeats) return false;
    const count = LessonRequests.stepCount(request);
    if (request.doubt !== null || count === 0) return true;
    const shown = new Set(beats.flatMap((beat) => beat.show.map((show) => show.step).filter((step) => step != null)));
    return Array.from({ length: count }, (_, index) => index + 1).every((step) => shown.has(step));
  },

  userText(request: LessonRequest): string {
    return MascotLessonPrompt.user({
      doubt: request.doubt,
      question: request.questionText,
      options: request.optionLines,
      optionLetters: request.optionLetters,
      subject: request.subject,
      work: request.work,
      hasPicture: request.picture != null,
      hasStatementPicture: request.statementPicture != null,
      figureLabels: request.figureLabels ?? [],
      figure3D: request.figure3D ?? null,
    });
  },

  images(request: LessonRequest): Uint8Array[] {
    return [request.picture, request.statementPicture].filter((image): image is Uint8Array => image != null);
  },

  sanitize(request: LessonRequest, lesson: MascotLesson): MascotLesson {
    return MascotLessons.sanitized(lesson, {
      solutionTexts: request.solutionTexts,
      withholding: request.correctOption,
      hasOptions: request.optionLetters.length > 0,
    });
  },
};

/** The beats of a lesson as they arrive, its closing at the end, and who is listening. */
export class LessonFeed {
  beats: LessonBeat[] = [];
  summary: LessonSummary | null = null;
  isFinished = false;
  /** The whole lesson, once the reply was read to its end; null while it arrives or when it broke off. */
  lesson: MascotLesson | null = null;
  failure: unknown = null;
  private readonly listeners = new Set<() => void>();

  static of(lesson: MascotLesson): LessonFeed {
    const feed = new LessonFeed();
    feed.finish(lesson);
    return feed;
  }

  append(beat: LessonBeat): void {
    if (this.isFinished) return;
    this.beats.push(beat);
    this.notify();
  }

  /** The reply is in: `lesson.beats` starts with the beats already here. */
  finish(lesson: MascotLesson): void {
    if (this.isFinished) return;
    this.beats = [...lesson.beats];
    this.summary = lesson.summary;
    this.lesson = lesson;
    this.isFinished = true;
    this.notify();
  }

  /** The reply broke off: what arrived is played, without a closing. */
  end(failure: unknown): void {
    if (this.isFinished) return;
    this.failure = failure;
    this.isFinished = true;
    this.notify();
  }

  /** Resolves at the next change (a beat, the end). */
  changed(): Promise<void> {
    if (this.isFinished) return Promise.resolve();
    return new Promise((resolve) => {
      const once = () => {
        this.listeners.delete(once);
        resolve();
      };
      this.listeners.add(once);
    });
  }

  async whole(): Promise<MascotLesson> {
    while (!this.isFinished) await this.changed();
    if (this.lesson) return this.lesson;
    throw this.failure ?? new LessonFailure("unreadable");
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

/** Reads the beats out of a lesson reply while it streams in and puts them through the guards. A beat is read once it
 * is whole: when the next one has begun, or the reply is over. */
export class LessonStreamReader {
  private taken = 0;
  private readLength = 0;

  constructor(private readonly guards: LessonStream) {}

  read(content: string, ended = false): LessonBeat[] {
    // Only a brace can close one beat or open the next: anything else is not worth parsing again.
    const added = content.slice(this.readLength);
    this.readLength = content.length;
    if (!ended && !added.includes("{") && !added.includes("}")) return [];
    const ready: LessonBeat[] = [];
    const root = PartialJSON.value(content);
    const beats =
      typeof root === "object" && root !== null && !Array.isArray(root)
        ? (root as Record<string, unknown>)["beats"]
        : undefined;
    if (Array.isArray(beats)) {
      const whole = ended ? beats.length : beats.length - 1;
      while (this.taken < whole) {
        const beat = decodeBeat(beats[this.taken]);
        if (beat) ready.push(...this.guards.add(beat));
        this.taken += 1;
      }
    }
    if (ended) ready.push(...this.guards.finish());
    return ready;
  }

  /** The reply broke off: the beats read and still waiting are decided as they are. */
  finish(): LessonBeat[] {
    return this.guards.finish();
  }
}

export interface LessonServices {
  /** `lessons.json`: the lessons already bought. */
  cache: DiskCache<MascotLesson>;
  client(options: ModelOptions): ModelClient;
  /** Development without the API: a lesson made from the written solution, after a moment. */
  mock?(request: LessonRequest): MascotLesson;
}

/** A stream that broke, or a reply that was not a lesson: worth asking once more. */
const isWorthAskingAgain = (error: unknown) =>
  error instanceof LessonFailure || (error instanceof ModelError && error.failure.kind === "stream");

export class MascotLessonProvider {
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(private readonly services: LessonServices) {}

  /** The lesson for `request`, into a feed as it is written: the cache's at once, one on its way joined, else one
   * streamed call (the first beat is said while the model writes the rest). */
  feed(request: LessonRequest, signal?: AbortSignal): LessonFeed {
    const feed = new LessonFeed();
    void this.fill(request, feed, signal).catch((error: unknown) => feed.end(error));
    return feed;
  }

  private async fill(request: LessonRequest, feed: LessonFeed, signal?: AbortSignal): Promise<void> {
    const key = await LessonRequests.key(request);
    const saved = await this.services.cache.cached(key);
    if (saved) return feed.finish(saved);
    const mock = this.services.mock;
    if (mock) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const lesson = LessonRequests.sanitize(request, mock(request));
      await this.services.cache.store(lesson, key);
      return feed.finish(lesson);
    }
    // One call per request: a second feed for the same lesson waits for the first one's and reads the cache.
    const pending = this.inFlight.get(key);
    if (pending) {
      await pending.catch(() => {});
      const lesson = await this.services.cache.cached(key);
      if (lesson) return feed.finish(lesson);
    }
    const work = this.stream(request, feed, signal).then(async () => {
      if (feed.lesson) await this.services.cache.store(feed.lesson, key);
    });
    this.inFlight.set(key, work);
    try {
      await work;
    } finally {
      this.inFlight.delete(key);
    }
  }

  /** The streamed call. Before the first beat, a failure or a weak reply is asked again (of Sonnet when it was the
   * lesson model's); after it, what arrived is played without a closing. */
  private async stream(request: LessonRequest, feed: LessonFeed, signal?: AbortSignal): Promise<void> {
    const reader = new LessonStreamReader(
      new LessonStream(request.solutionTexts, request.correctOption, request.optionLetters.length > 0),
    );
    const fallback = LessonRequests.fallback(request);
    let tooWeak = false;
    try {
      const completion = await this.services.client({ model: LessonRequests.modelID(request) }).complete({
        system: MascotLessonPrompt.system(request.language),
        user: LessonRequests.userText(request),
        images: LessonRequests.images(request),
        schemaName: "lesson",
        schema: MascotLessonPrompt.schema,
        maxTokens: MascotLessonPrompt.maxTokens,
        timeout: 60,
        ...(signal ? { signal } : {}),
        onContent: (content) => reader.read(content).forEach((beat) => feed.append(beat)),
      });
      const whole = MascotLessons.decode(completion.content);
      const last = reader.read(completion.content, true);
      // Nothing is being said yet: a reply short of a lesson, or one that skips a step, is Sonnet's to give.
      tooWeak = feed.beats.length === 0 && fallback !== null && !LessonRequests.isGoodEnough(request, last);
      if (!tooWeak) {
        last.forEach((beat) => feed.append(beat));
        feed.finish(MascotLessons.finished(whole, feed.beats));
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      const again = fallback ?? (isWorthAskingAgain(error) ? request : null);
      if (feed.beats.length === 0 && again) return feed.finish(await this.lesson(again));
      if (feed.beats.length === 0) throw error;
      reader.finish().forEach((beat) => feed.append(beat));
      feed.end(error);
    }
    if (tooWeak && fallback) feed.finish(await this.lesson(fallback));
  }

  /** One call, not streamed. On the lesson model, a failure or a reply that is short or skips a step is asked of
   * Sonnet once; otherwise a reply that cannot be read is asked for once more. */
  async lesson(request: LessonRequest): Promise<MascotLesson> {
    const fallback = LessonRequests.fallback(request);
    if (!fallback) return this.ask(request, 2);
    try {
      const lesson = await this.ask(request, 1);
      if (LessonRequests.isGoodEnough(request, lesson.beats)) return lesson;
    } catch {
      // Sonnet answers instead.
    }
    return this.ask(fallback, 2);
  }

  private async ask(request: LessonRequest, attempts: number): Promise<MascotLesson> {
    let lastError: unknown = new LessonFailure("unreadable");
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const completion = await this.services.client({ model: LessonRequests.modelID(request) }).complete({
          system: MascotLessonPrompt.system(request.language),
          user: LessonRequests.userText(request),
          images: LessonRequests.images(request),
          schemaName: "lesson",
          schema: MascotLessonPrompt.schema,
          maxTokens: MascotLessonPrompt.maxTokens,
          timeout: 60,
        });
        const lesson = LessonRequests.sanitize(request, MascotLessons.decode(completion.content));
        // One beat is not a lesson: ask once more, and play what came back only if the second try is no better.
        if (lesson.beats.length < MascotLessons.minimumBeats && attempt + 1 < attempts) {
          lastError = new LessonFailure("empty");
          continue;
        }
        return lesson;
      } catch (error) {
        if (!(error instanceof LessonFailure)) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }
}
