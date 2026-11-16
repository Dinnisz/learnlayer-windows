// The app's solver: the model client through the LearnLayer API with the session's token, the caches in the data
// folder, and Settings. In development (`npm run dev` in a browser, or `?mock=1`) every solve answers with the Mac's
// MockSolution.json, so the stage can be worked on without spending anything (CLAUDE.md: mocks first).

import mockSolution from "@core/mocks/MockSolution.json";
import sampleSolution from "@core/mocks/SampleQuestionSolution.json";
import mockTextHelp from "@core/mocks/MockTextHelp.json";
import mockIllustrations from "@core/mocks/MockIllustrations.json";
import { decodeIllustration, type Illustration } from "@core/illustrations/illustration";
import { IllustrationProvider } from "@core/illustrations/illustrationProvider";
import { DiskCache } from "@core/ai/diskCache";
import {
  chatPath,
  endpoint,
  fastModelUsesLocalKey,
  localTransport,
  openRouterChat,
  openRouterSpeech,
  prefersLocalKey,
  speechPath,
} from "@core/ai/aiGateway";
import { ModelClient, type ModelEnvironment, type ModelOptions } from "@core/ai/modelClient";
import { AISettings, ModelRouting } from "@core/ai/modelRouting";
import { MascotLessonProvider } from "@core/lesson/mascotLessonProvider";
import type { MascotLesson } from "@core/lesson/mascotLesson";
import { lessonFromWork } from "@core/lesson/readSteps";
import { FastTranscriptionReader } from "@core/problems/fastTranscription";
import { decodeProblemSolution, type ProblemSolution } from "@core/problems/problemSolution";
import { TranscriptionRequests, type QuestionTranscription } from "@core/problems/questionTranscription";
import { FastTranscription } from "@core/prompts/problemPrompt";
import { SolutionProvider } from "@core/problems/solutionProvider";
import { TutorLanguage } from "@core/problems/solutionRequest";
import { decodeTextHelp, TextHelpProvider, type TextHelp } from "@core/problems/textHelp";
import { untypesetMath } from "../components/Math";
import { appConfig, dataFiles, invoke, isTauri, session, streamingFetch } from "../native";
import { fittedJPEGs } from "./pictures";

/** True when solves answer from the mock file: `?mock=1`, or a browser during development unless `?live=1`. */
export function usesMock(): boolean {
  const query = new URLSearchParams(window.location.search);
  if (query.get("mock") === "1") return true;
  if (query.get("live") === "1") return false;
  return import.meta.env.DEV && !isTauri;
}

let apiBase: Promise<string> | null = null;

/** The OpenRouter key kept in the Credential Manager for development (`LearnLayer.OpenRouter`); never in a release
 * build, where the native side always answers null. Read once. */
let localKey: Promise<string | null> | null = null;
const storedLocalKey = () =>
  (localKey ??= isTauri ? invoke<string | null>("local_openrouter_key") : Promise.resolve(null));

/** Whether a call goes with the local key: the explicit flag, or a debug build with no session (`prefersLocalKey`);
 * the fast transcription model also whenever a debug build has the key (`fastModelUsesLocalKey`). */
async function usesLocalKey(fastModel: boolean): Promise<string | null> {
  const key = await storedLocalKey();
  if (!key) return null;
  const config = await appConfig();
  const question = {
    arguments: [] as string[],
    environment: config.environment,
    hasLocalKey: true,
    hasSession: (await session.accessToken(false)) !== null,
    debug: config.debug,
  };
  return (fastModel ? fastModelUsesLocalKey(question) : prefersLocalKey(question)) ? key : null;
}

/** Known once the key has been looked up: whether the fast model can be asked at all. */
let fastModelAvailable = false;
void usesLocalKey(true).then((key) => (fastModelAvailable = key !== null));

const environment: ModelEnvironment = {
  async transport(purpose, local) {
    const key = await usesLocalKey(local);
    if (key) return { ...localTransport(key), url: purpose === "speech" ? openRouterSpeech : openRouterChat };
    apiBase ??= appConfig().then((config) => config.apiBase);
    const base = await apiBase;
    const token = (await session.accessToken(false)) ?? "";
    return {
      url: endpoint(purpose === "speech" ? speechPath : chatPath, base),
      bearer: token,
      kind: token === "" ? "none" : "backend",
    };
  },
  forceRefresh: () => session.accessToken(true),
  fetch: streamingFetch,
};

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

let provider: SolutionProvider | null = null;

/** One solver for the window, so its caches and in-flight requests are shared by every question. */
export function solutionProvider(): SolutionProvider {
  if (provider) return provider;
  const mock = usesMock();
  provider = new SolutionProvider({
    solutions: new DiskCache<ProblemSolution>("solutions.json", 100, dataFiles),
    escalated: new DiskCache<boolean>("escalated-answers.json", 300, dataFiles),
    client: (options) => new ModelClient(environment, options),
    // Signed-in is checked by the call itself (no token: `signedOut`); the classifier needs it known first.
    hasCredentials: () => !mock,
    config: () => ModelRouting.config(read(ModelRouting.configKey)),
    plan: () => ModelRouting.plan(read(ModelRouting.planKey)),
    language: () =>
      TutorLanguage.promptName(TutorLanguage.resolve(read(TutorLanguage.settingKey), navigator.languages)),
    // A question read from the screen (labelled "Q", as the onboarding's sample) has a mock of its own: the exam's parts
    // would never match it.
    mockSolution: mock
      ? (request) => decodeProblemSolution(request.labels.includes("Q") ? sampleSolution : mockSolution)
      : undefined,
    transcribing: (images) => transcriptionRequests.isRequested(images),
  });
  return provider;
}

/** The pictures whose question the app shows typeset: the solve and the fast model transcribe them. */
export const transcriptionRequests = new TranscriptionRequests();

let fast: FastTranscriptionReader | null = null;

/** The fast reading of a clicked question's picture, saved in `fast-questions.json`. Off with mocks, as on the Mac. */
export function fastReader(): FastTranscriptionReader {
  if (fast) return fast;
  const mock = usesMock();
  fast = new FastTranscriptionReader({
    cache: new DiskCache<QuestionTranscription>("fast-questions.json", 200, dataFiles),
    isAvailable: () => !mock && fastModelAvailable,
    client: ({ sortsByLatency }) =>
      new ModelClient(environment, { model: FastTranscription.model, usesLocalKey: true, sortsByLatency }),
    fitted: (images) => fittedJPEGs(images, FastTranscription.maxImagePixels, FastTranscription.imageQuality),
    untypesetMath: (found) => untypesetMath(found.blocks),
  });
  return fast;
}

let textHelp: TextHelpProvider | null = null;

/** Answers questions about an exercise (and selected passages), saved in `passages.json`. */
export function textHelpProvider(): TextHelpProvider {
  if (textHelp) return textHelp;
  const mock = usesMock();
  textHelp = new TextHelpProvider({
    passages: new DiskCache<TextHelp>("passages.json", 200, dataFiles),
    client: () => new ModelClient(environment, { model: AISettings.defaultModel }),
    language: () =>
      TutorLanguage.promptName(TutorLanguage.resolve(read(TutorLanguage.settingKey), navigator.languages)),
    mock: mock ? () => decodeTextHelp(mockTextHelp) : undefined,
  });
  return textHelp;
}

/** Whether a call can be made at all: signed in, or a local key in a debug build. */
export async function hasCredentials(): Promise<boolean> {
  if (usesMock()) return false;
  if (await usesLocalKey(false)) return true;
  return (await session.accessToken(false)) !== null;
}

/**
 * One speech request (`POST /v1/audio/speech`, OpenRouter's body): through the LearnLayer API with the session's token
 * and `X-LearnLayer-Purpose: speech`, one forced refresh after a 401, as the Mac's `OpenRouterSpeech` does.
 */
export async function requestSpeech(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ status: number; bytes: Uint8Array }> {
  const transport = await environment.transport("speech", false);
  if (transport.bearer === "") return { status: 401, bytes: new Uint8Array() };
  const send = async (bearer: string) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Title": "LearnLayer",
      Authorization: `Bearer ${bearer}`,
    };
    if (transport.kind === "backend") headers["X-LearnLayer-Purpose"] = "speech";
    const response = await streamingFetch(transport.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: signal ?? new AbortController().signal,
    });
    const bytes = response.body ? new Uint8Array(await new Response(response.body).arrayBuffer()) : new Uint8Array();
    return { status: response.status, bytes };
  };
  let result = await send(transport.bearer);
  if (result.status === 401 && transport.kind === "backend") {
    const token = await environment.forceRefresh();
    if (token) result = await send(token);
  }
  return result;
}

let illustrations: IllustrationProvider | null = null;

/** The drawings beside the solutions ("Draw It"), saved in `illustrations.json`. With mocks, the first sample drawing. */
export function illustrationProvider(): IllustrationProvider {
  if (illustrations) return illustrations;
  illustrations = new IllustrationProvider({
    cache: new DiskCache<Illustration>("illustrations.json", 100, dataFiles),
    client: (wants3D) =>
      new ModelClient(environment, { model: wants3D ? ModelRouting.gemini : AISettings.defaultModel }),
    mock: usesMock() ? decodeIllustration((mockIllustrations as unknown[])[0]) : null,
  });
  return illustrations;
}

/** The language the app writes into drawings and asks the model to write in. */
export function drawingLanguage(): string {
  return TutorLanguage.promptName(TutorLanguage.resolve(read(TutorLanguage.settingKey), navigator.languages));
}

let lessons: MascotLessonProvider | null = null;

/** The mascot's lessons («Explica-me»), saved in `lessons.json`. With mocks, a lesson made from the written steps. */
export function lessonProvider(): MascotLessonProvider {
  if (lessons) return lessons;
  lessons = new MascotLessonProvider({
    cache: new DiskCache<MascotLesson>("lessons.json", 100, dataFiles),
    client: (options) => new ModelClient(environment, options),
    ...(usesMock() ? { mock: (request) => lessonFromWork(request.work) } : {}),
  });
  return lessons;
}

/** A model client for `options`, through the gateway (the API with the session, or the local key in debug). */
export function modelClient(options: ModelOptions): ModelClient {
  return new ModelClient(environment, options);
}
