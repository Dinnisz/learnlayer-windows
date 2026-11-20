// Port of LearnLayer/Problems/FastTranscription.swift, FastDeadline, OpenRouterClient.fastQuestion and
// LearnLayer/Problems/QuestionReading.swift @ ref 2026-11-04. The prompt and the timing knobs are in
// core/prompts/problemPrompt.ts (`FastTranscription`).
//
// The question typeset from a cheap, fast vision model, asked at the same time as the solve. The solve writes the
// same blocks as the first field of its reply, but only after it has read the picture with a larger model; this
// reply is a few seconds sooner. Whichever comes first is what the student sees, after the same check.
//
// One call per question picture: the answer is kept (in memory and on disk) and a call already on its way is shared,
// so opening the question again, or twice at once, asks nothing more. A failed call is not repeated either.
//
// The Mac also reads the picture itself first (`LocalQuestionReader`, a formula model on the Mac); Windows has no such
// model, so the reading is the cloud's alone (see docs/DECISOES.md).

import { cacheKey, imagesDigest, type DiskCache } from "../ai/diskCache";
import { fastQuestionSchema, isProviderHiccup, ModelError, type ModelClient } from "../ai/modelClient";
import { FastTranscription as Prompt } from "../prompts/problemPrompt";
import { decodeBlocks, Transcriptions, type QuestionTranscription } from "./questionTranscription";

export interface FastTranscriptionServices {
  /** `fast-questions.json`, at most 200 readings. */
  cache: DiskCache<QuestionTranscription>;
  /** The fast model can be asked (a local key in a debug build, as on the Mac; see `fastModelUsesLocalKey`). */
  isAvailable(): boolean;
  /** A client for the fast model; `sortsByLatency` false for the retry with any provider. */
  client(options: { sortsByLatency: boolean }): ModelClient;
  /** The pictures as sent: none larger than `maxImagePixels` on its long side (the interface scales them). */
  fitted?(images: readonly Uint8Array[]): Promise<Uint8Array[]>;
  /** Maths the renderer can't draw (KaTeX), the first such piece; null when everything typesets. */
  untypesetMath?(transcription: QuestionTranscription): string | null;
  /** Seconds, for the deadlines (tests move it themselves). */
  now?(): number;
  /** Tests: stands in for the network call. Returns the reply's text. */
  fetcher?(images: readonly Uint8Array[]): Promise<string>;
}

const seconds = () => performance.now() / 1000;

/** A wait bounded by the clock: gives up on `work` (aborting it) once `limit` has gone by, or once `firstContent`
 * has with no word of the reply yet. A request's own timeout does not do this: a keep-alive comment restarts it. */
export const FastDeadline = {
  expired(elapsed: number, sawContent: boolean, limit: number, firstContent: number | null): boolean {
    if (elapsed >= limit) return true;
    if (firstContent === null || sawContent) return false;
    return elapsed >= firstContent;
  },

  run<T>(
    limit: number,
    firstContent: number | null,
    work: (progress: { sawContent: boolean }, signal: AbortSignal) => Promise<T>,
    options: { now?: () => number; tick?: number } = {},
  ): Promise<T> {
    const now = options.now ?? seconds;
    const progress = { sawContent: false };
    const controller = new AbortController();
    const start = now();
    return new Promise<T>((resolve, reject) => {
      let open = true;
      const timer = setInterval(
        () => {
          if (!open) return;
          if (FastDeadline.expired(now() - start, progress.sawContent, limit, firstContent)) {
            open = false;
            clearInterval(timer);
            controller.abort();
            reject(new ModelError({ kind: "network", reason: "timedOut" }));
          }
        },
        (options.tick ?? 0.1) * 1000,
      );
      work(progress, controller.signal).then(
        (value) => {
          if (!open) return;
          open = false;
          clearInterval(timer);
          resolve(value);
        },
        (error: unknown) => {
          if (!open) return;
          open = false;
          clearInterval(timer);
          reject(error);
        },
      );
    });
  },
};

/** [x1, y1, x2, y2] (Qwen's own way to give a box, on a 0 to 1000 scale; shares are tolerated) as
 * [x, y, width, height] shares. Null when it is not a box. */
export function shareOfCorners(corners: readonly number[]): number[] | null {
  if (corners.length !== 4 || !corners.every(Number.isFinite)) return null;
  const scale = Math.max(...corners) > 1.5 ? 1000 : 1;
  const c = corners.map((value) => Math.min(Math.max(value / scale, 0), 1));
  if (!(c[2]! > c[0]!) || !(c[3]! > c[1]!)) return null;
  return [c[0]!, c[1]!, c[2]! - c[0]!, c[3]! - c[1]!];
}

/** No words outside the LaTeX commands and their \text{…} pieces: "f(x) = \frac{x}{2}", not "Seja \alpha o ângulo". */
function isOnlyLatex(text: string): boolean {
  const rest = text.replace(/\\(?:text|textbf|mathrm|operatorname|begin|end)\{[^{}]*\}|\\[A-Za-z]+/gu, "");
  return !/\p{L}{3,}/u.test(rest);
}

/** A LaTeX command the model wrote with one backslash where JSON has an escape of that letter (a form feed and
 * «rac» for «\frac», a tab and «imes» for «\times»). */
const latexEscape =
  /(?<!\\)\\((?:f(?:rac|orall)|b(?:eta|inom|ar|egin|oxed|igg?[lr]?|mod)|n(?:eq|abla|ot|eg|leq|geq)|r(?:ight|ho|angle|ceil|floor|m)|t(?:imes|heta|ext(?:bf|rm)?|an|anh|au|o|op|frac|ilde|riangle))(?![A-Za-z]))/gu;

/** Its backslash doubled, so the command survives the JSON (CDI sheet 1(f) came back as «rac{rac{x}{x+1}}{x-1}»).
 * A real escape (a \n before a word) is left as it is (@ 5701363). */
export function withLatexEscapesRepaired(text: string): string {
  return text.replace(latexEscape, "\\\\$1");
}

/** The blocks from the reply: `{"question": [...]}`, or the bare array a model sometimes writes instead; boxes
 * brought to the app's shares. */
export function transcriptionFromContent(content: string): QuestionTranscription | null {
  let text = content.trim();
  if (text.startsWith("```")) {
    const newline = text.indexOf("\n");
    text = newline < 0 ? "" : text.slice(newline);
    const fence = text.lastIndexOf("```");
    if (fence >= 0) text = text.slice(0, fence);
  }
  text = withLatexEscapesRepaired(text);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  let list: unknown;
  if (Array.isArray(json)) list = json;
  else if (typeof json === "object" && json !== null && Array.isArray((json as Record<string, unknown>)["question"]))
    list = (json as Record<string, unknown>)["question"];
  else return null;
  const blocks = decodeBlocks(list);
  if (!blocks) return null;
  for (const block of blocks) {
    block.box = block.box ? shareOfCorners(block.box) : null;
    if (block.type === "figure") block.text = null;
    // A text line that is only maths, written as bare LaTeX with no `$`, is typeset only once it is marked as maths.
    const latex = block.text?.trim();
    if (block.type === "text" && latex && !latex.includes("$") && /\\[A-Za-z]+/u.test(latex) && isOnlyLatex(latex)) {
      block.text = "$" + latex + "$";
    }
  }
  return { blocks };
}

/** The streamed reply so far, when its "question" array (or the bare array) has closed: the JSON to read. */
export function closedQuestion(partial: string): string | null {
  const text = partial.trim();
  if (!text.endsWith("]") && !text.endsWith("}")) return null;
  return [text, text + "}"].find((candidate) => transcriptionFromContent(candidate) !== null) ?? null;
}

/** The reply of `call` (which streams to its `onContent`) as soon as its "question" array has closed, or the whole
 * reply if that comes first. The call itself runs to its end either way, so its cost is still counted. */
export function firstWholeQuestion(call: (onContent: (content: string) => void) => Promise<string>): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let done = false;
    const finish = (settle: () => void) => {
      if (done) return;
      done = true;
      settle();
    };
    call((partial) => {
      const closed = closedQuestion(partial);
      if (closed !== null) finish(() => resolve(closed));
    }).then(
      (content) => finish(() => resolve(content)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

export class FastTranscriptionReader {
  private readonly failed = new Set<string>();
  /** Questions whose reading ahead failed: not read ahead again, but a click still asks once. */
  private readonly failedAhead = new Set<string>();
  /** The readings ahead still on their way, by key: a click joins one rather than start a second. */
  private readonly prereads = new Map<string, Promise<QuestionTranscription | null>>();
  /** Questions whose reading was set aside and asked for once more, and that answer set aside too: a click on them
   * again is not charged for a third reading the check would set aside as well (while the reader lives). */
  private readonly rejectedAgain = new Set<string>();

  constructor(private readonly services: FastTranscriptionServices) {}

  get isAvailable(): boolean {
    return this.services.fetcher !== undefined || this.services.isAvailable();
  }

  key(images: readonly Uint8Array[]): Promise<string> {
    return imagesDigest(images).then((digest) => cacheKey(Prompt.promptVersion, Prompt.model, digest));
  }

  /** A reading to keep and show: usable, and all its maths typeset. */
  isKeepable(found: QuestionTranscription): boolean {
    return Transcriptions.isUsable(found) && (this.services.untypesetMath?.(found) ?? null) === null;
  }

  /** The reading kept under `key`; one that can't be typeset is dropped. */
  private async saved(key: string): Promise<QuestionTranscription | null> {
    const found = await this.services.cache.cached(key);
    if (!found) return null;
    if (!this.isKeepable(found)) {
      await this.services.cache.remove(key);
      return null;
    }
    return found;
  }

  /** The question as the fast model read it, or null when it could not. Never throws: the solve is the fallback. */
  async transcription(images: readonly Uint8Array[], ahead = false): Promise<QuestionTranscription | null> {
    if (images.length === 0 || !this.isAvailable) return null;
    const key = await this.key(images);
    const saved = await this.saved(key);
    if (saved) return saved;
    if (this.failed.has(key) || (ahead && this.failedAhead.has(key))) return null;
    try {
      return await this.services.cache.script(key, async () => {
        const content = await this.reply(images);
        const found = transcriptionFromContent(content);
        if (!found || !this.isKeepable(found)) throw new Error("The fast reading had no question in it.");
        return found;
      });
    } catch {
      (ahead ? this.failedAhead : this.failed).add(key);
      return null;
    }
  }

  /** The reading already kept for `images`, without asking anything. */
  async cachedTranscription(images: readonly Uint8Array[]): Promise<QuestionTranscription | null> {
    if (images.length === 0) return null;
    return this.saved(await this.key(images));
  }

  /** Keeps an accepted reading that did not come from the fast model, under the key a click looks up first. */
  async store(found: QuestionTranscription, images: readonly Uint8Array[]): Promise<void> {
    if (images.length === 0 || !this.isKeepable(found)) return;
    await this.services.cache.store(found, await this.key(images));
  }

  /** The reading of `images` if the caller `accepts` it; one it sets aside is asked for once more in what is left of
   * `placeholderLimit` (at least `minimumRetry`), and that answer, if accepted, is saved in its place. A question whose
   * second answer was set aside as well is not asked again (`rejectedAgain`): the same picture reads the same way. */
  async accepted(
    images: readonly Uint8Array[],
    accepts: (found: QuestionTranscription) => boolean,
  ): Promise<QuestionTranscription | null> {
    const now = this.services.now ?? seconds;
    const start = now();
    const found = await this.transcription(images);
    if (!found) return null;
    if (accepts(found)) return found;
    const id = await this.key(images);
    if (this.rejectedAgain.has(id)) return null;
    const left = Prompt.placeholderLimit - (now() - start);
    if (left < Prompt.minimumRetry) return null;
    let content: string;
    try {
      content = await this.reply(images, left);
    } catch {
      return null;
    }
    const again = transcriptionFromContent(content);
    if (!again || !this.isKeepable(again) || !accepts(again)) {
      this.rejectedAgain.add(id);
      return null;
    }
    await this.services.cache.store(again, id);
    return again;
  }

  /** Whether a question's placeholder gives way to its crop. */
  static placeholderGivesWay(elapsed: number, sessionEnded: boolean): boolean {
    return sessionEnded || elapsed >= Prompt.placeholderLimit;
  }

  /** Reads the questions of a page ahead of a click, `prefetchWidth` at a time, into the cache a click reads from. */
  async prefetch(imageSets: readonly (readonly Uint8Array[])[]): Promise<void> {
    if (!this.isAvailable) return;
    const seen = new Set<string>();
    const pending: { images: readonly Uint8Array[]; key: string }[] = [];
    for (const images of imageSets) {
      if (images.length === 0) continue;
      const key = await this.key(images);
      if (seen.has(key)) continue;
      seen.add(key);
      if ((await this.saved(key)) || this.failed.has(key) || this.failedAhead.has(key)) continue;
      pending.push({ images, key });
    }
    for (let start = 0; start < pending.length; start += Prompt.prefetchWidth) {
      await Promise.all(
        pending.slice(start, start + Prompt.prefetchWidth).map(async ({ images, key }) => {
          const reading = this.transcription(images, true);
          this.prereads.set(key, reading);
          try {
            await reading;
          } finally {
            this.prereads.delete(key);
          }
        }),
      );
    }
  }

  /**
   * The first accepted reading of the question when it opens (`QuestionReading.read`, the cloud's part): a reading
   * already kept at once; a reading ahead on its way joined; else the fast model, with one more try for a reading
   * set aside. `rejection` says which check a reading fails (null: accepted).
   */
  async read(
    images: readonly Uint8Array[],
    rejection: (found: QuestionTranscription) => string | null,
  ): Promise<QuestionTranscription | null> {
    if (!this.isAvailable || images.length === 0) return null;
    // Maths the renderer can't draw would be shown as its stripped LaTeX: never one to show.
    const rejects = (found: QuestionTranscription) => {
      const math = this.services.untypesetMath?.(found) ?? null;
      return math !== null ? `maths that can't be typeset: ${math.slice(0, 120)}` : rejection(found);
    };
    const saved = await this.cachedTranscription(images);
    if (saved && rejects(saved) === null) return saved;
    const pending = this.prereads.get(await this.key(images));
    if (pending) {
      const found = await pending;
      if (found && rejects(found) === null) return found;
    }
    return this.accepted(images, (found) => rejects(found) === null);
  }

  /** The fast model's reply: the quickest provider first, by the clock; a busy one is given up for any other. */
  private async reply(images: readonly Uint8Array[], limit: number = Prompt.placeholderLimit): Promise<string> {
    const sent = (await this.services.fitted?.(images)) ?? [...images];
    if (this.services.fetcher) return this.services.fetcher(sent);
    return firstWholeQuestion((onContent) => this.fastQuestion(sent, limit, onContent));
  }

  /** `OpenRouterClient.fastQuestion`: no word within `timeout` and the quickest provider is given up; words coming,
   * it has the whole limit. A provider's hiccup (429, 5xx, a timeout) is asked once more with default routing. */
  private async fastQuestion(
    images: readonly Uint8Array[],
    limit: number,
    onContent: (content: string) => void,
  ): Promise<string> {
    const now = this.services.now ?? seconds;
    const start = now();
    const ask = (
      client: ModelClient,
      timeout: number,
      signal: AbortSignal,
      stream: ((content: string) => void) | null,
    ) =>
      client
        .complete({
          system: Prompt.system,
          user: Prompt.user,
          images,
          schemaName: fastQuestionSchema,
          schema: Prompt.schema,
          maxTokens: Prompt.maxTokens,
          timeout,
          signal,
          ...(stream ? { onContent: stream } : {}),
        })
        .then((completion) => completion.content);
    const attempt = (client: ModelClient, timeout: number, within: number, firstContent: number | null) =>
      FastDeadline.run(
        within,
        firstContent,
        async (progress, signal) => {
          try {
            return await ask(client, timeout, signal, (content) => {
              progress.sawContent = true;
              onContent(content);
            });
          } catch (error) {
            if (error instanceof ModelError && error.failure.kind === "stream")
              return ask(client, timeout, signal, null);
            throw error;
          }
        },
        { now },
      );
    try {
      return await attempt(this.services.client({ sortsByLatency: true }), Prompt.timeout, limit, Prompt.timeout);
    } catch (error) {
      if (!isProviderHiccup(error)) throw error;
      const left = limit - (now() - start);
      if (left < 1) throw error;
      return attempt(this.services.client({ sortsByLatency: false }), left, left, null);
    }
  }
}
