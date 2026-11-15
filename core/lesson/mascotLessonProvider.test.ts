// MascotLessonTests.swift, the provider's cases: which model teaches, Sonnet behind the lesson model, every step lit,
// one call per lesson, and the first beat said before the reply has finished arriving. Scripted: nothing is spent.

import { describe, expect, it } from "vitest";
import { DiskCache, type DataFiles } from "../ai/diskCache";
import { AISettings } from "../ai/modelRouting";
import type { CompleteRequest, ModelClient, ModelOptions } from "../ai/modelClient";
import type { MascotLesson } from "./mascotLesson";
import { LessonRequests, MascotLessonProvider, type LessonRequest } from "./mascotLessonProvider";

function memoryFiles(): DataFiles {
  const files = new Map<string, string>();
  return {
    read: async (name) => files.get(name) ?? null,
    write: async (name, contents) => void files.set(name, contents),
  };
}

const request = (extra: Partial<LessonRequest> = {}): LessonRequest => ({
  doubt: null,
  questionText: "Questão 1 - Uma fonte de 12 V alimenta duas resistências de 3 kΩ em paralelo.",
  optionLines: {},
  optionLetters: [],
  subject: null,
  work: "Step 1: associar em paralelo\nStep 2: lei de Ohm\nAnswer: 8 mA",
  solutionTexts: [],
  language: "pt",
  needsStrongModel: false,
  correctOption: null,
  ...extra,
});

const beat = (say: string, step: number | null) =>
  ({ kind: "explain", say, show: step === null ? [] : [{ op: "highlight", step }], calc: null, check: null }) as const;

const reply = (beats: unknown[]) =>
  JSON.stringify({ angle: "a", mistake: "m", beats, summary: { say: "Mais resistência, menos corrente.", key: null } });

const good = reply([
  beat("Primeiro juntamos as duas resistências lado a lado.", 1),
  beat("Imagina dois canos, a água divide-se pelos dois.", null),
  beat("Depois a lei de Ohm dá a corrente total.", 2),
]);
const skipping = reply([
  beat("Só o primeiro passo.", 1),
  beat("Outra ideia qualquer.", null),
  beat("E mais uma.", null),
]);

/** A model that answers `replies[model]`, streaming it in pieces, and counts its calls. */
function scripted(replies: Record<string, string>) {
  const calls: string[] = [];
  const client = (options: ModelOptions): ModelClient =>
    ({
      async complete(sent: CompleteRequest) {
        calls.push(options.model);
        const content = replies[options.model] ?? "nothing";
        if (sent.onContent) {
          for (let end = 40; end < content.length; end += 40) {
            sent.onContent(content.slice(0, end));
            await new Promise((resolve) => setTimeout(resolve, 1));
          }
        }
        return { content, cost: 0 };
      },
    }) as unknown as ModelClient;
  const provider = new MascotLessonProvider({
    cache: new DiskCache<MascotLesson>("lessons.json", 100, memoryFiles()),
    client,
  });
  return { provider, calls };
}

describe("MascotLessonProvider", () => {
  it("teaches a solved question with the lesson model and Sonnet behind it, an unsolved one by its route", () => {
    expect(LessonRequests.modelID(request())).toBe(AISettings.lessonModel);
    expect(LessonRequests.fallback(request())?.modelOverride).toBe(AISettings.strongModel);
    expect(LessonRequests.fallback(LessonRequests.fallback(request())!)).toBeNull();
    expect(LessonRequests.modelID(request({ work: null, needsStrongModel: true }))).toBe(AISettings.strongModel);
    expect(LessonRequests.modelID(request({ work: null }))).toBe(AISettings.defaultModel);
    expect(LessonRequests.fallback(request({ work: null }))).toBeNull();
  });

  it("wants every step of the written solution lit by «Explica-me»", () => {
    expect(LessonRequests.stepCount(request())).toBe(2);
    expect(LessonRequests.isGoodEnough(request(), JSON.parse(good).beats)).toBe(true);
    expect(LessonRequests.isGoodEnough(request(), JSON.parse(skipping).beats)).toBe(false);
    // A doubt need not walk every step.
    expect(LessonRequests.isGoodEnough(request({ doubt: "porquê?" }), JSON.parse(skipping).beats)).toBe(true);
  });

  it("plays the first beat before the reply has finished, and keeps the lesson", async () => {
    const { provider, calls } = scripted({ [AISettings.lessonModel]: good });
    const feed = provider.feed(request());
    await feed.changed();
    expect(feed.beats.length).toBeGreaterThanOrEqual(1);
    expect(feed.isFinished).toBe(false);
    const lesson = await feed.whole();
    expect(lesson.beats).toHaveLength(3);
    expect(lesson.summary?.say).toBe("Mais resistência, menos corrente.");
    // Asked again: the cache answers, nothing more is bought.
    expect((await provider.feed(request()).whole()).beats).toHaveLength(3);
    expect(calls).toEqual([AISettings.lessonModel]);
  });

  it("asks Sonnet when the lesson model's reply skips a step", async () => {
    const { provider, calls } = scripted({ [AISettings.lessonModel]: skipping, [AISettings.strongModel]: good });
    const lesson = await provider.lesson(request());
    expect(calls).toEqual([AISettings.lessonModel, AISettings.strongModel]);
    expect(lesson.beats.map((item) => item.say)[0]).toBe("Primeiro juntamos as duas resistências lado a lado.");
  });

  it("plays what a stream has started saying, and asks Sonnet only before the first beat", async () => {
    // A streamed weak reply whose first beat is already being said is played to its end, as on the Mac.
    const started = scripted({ [AISettings.lessonModel]: skipping, [AISettings.strongModel]: good });
    await started.provider.feed(request()).whole();
    expect(started.calls).toEqual([AISettings.lessonModel]);
    // A reply that breaks before any beat is Sonnet's to give.
    const broken = scripted({ [AISettings.lessonModel]: "nothing", [AISettings.strongModel]: good });
    const lesson = await broken.provider.feed(request()).whole();
    expect(broken.calls).toEqual([AISettings.lessonModel, AISettings.strongModel]);
    expect(lesson.beats).toHaveLength(3);
  });

  it("buys a lesson asked twice at once only once", async () => {
    const { provider, calls } = scripted({ [AISettings.lessonModel]: good });
    const [first, second] = await Promise.all([provider.feed(request()).whole(), provider.feed(request()).whole()]);
    expect(first.beats).toHaveLength(3);
    expect(second.beats).toHaveLength(3);
    expect(calls).toHaveLength(1);
  });
});
