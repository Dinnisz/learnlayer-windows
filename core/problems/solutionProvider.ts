// Port of LearnLayer/Problems/SolutionProvider.swift and QuestionClassifier.classify @ ref 2026-11-04. The debug
// switches (-stage, -items, -route, bypassCache) and the shared answer cache (off on the Mac) are not ported.

import type { DiskCache } from "../ai/diskCache";
import { imagesDigest, solutionCacheKey } from "../ai/diskCache";
import {
  isBlocked,
  isSignedOut,
  ModelError,
  withFirstTextDeadline,
  type ModelClient,
  type ModelOptions,
} from "../ai/modelClient";
import {
  AISettings,
  ModelRouting,
  type Area,
  type ModelChoice,
  type Plan,
  type RoutingConfig,
  type SolverRoute,
} from "../ai/modelRouting";
import { ProblemPrompt, QuestionClassifier } from "../prompts/problemPrompt";
import { decodeProblemSolution, restrictedTo, type ProblemSolution } from "./problemSolution";
import { decodeFromContent } from "../ai/replyDecoding";
import { decodeVariant, VariantPrompt, type ProblemVariant } from "./problemVariant";
import { RouteDecision, type Classification, type RouteOutcome } from "./routeDecision";
import { solution as plainSolution, streamedSolution, TutorLanguage, type SolveOptions } from "./solutionRequest";

/** What the solver needs from the app: where answers are saved, how to reach a model, and the settings. */
export interface SolverServices {
  /** `solutions.json`, at most 100 answers. */
  solutions: DiskCache<ProblemSolution>;
  /** `escalated-answers.json`: answers the stronger model wrote after the first failed. */
  escalated: DiskCache<boolean>;
  /** A model client for `options` (the gateway chooses the transport). */
  client(options: ModelOptions): ModelClient;
  /** False until signed in (or a local key in debug): the classifier is then skipped. */
  hasCredentials(): boolean;
  config(): RoutingConfig;
  plan(): Plan;
  /** `TutorLanguage.promptName` of the language Settings chose. */
  language(): string;
  /** The figure model from Settings; the strong model when empty. */
  figureModel?(): string;
  /** Development without the API: every solve answers with `MockSolution.json` after half a second (the request
   * lets a sample question have its own answer). */
  mockSolution?: (request: SolveRequest) => ProblemSolution;
  /** A small JPEG (512 px, quality 0.45) for the classifier; null when it can't be made. */
  thumbnail?(image: Uint8Array): Promise<Uint8Array | null>;
  /** `CostFlags.skipsClassifierForKnownSubject` (off by default). */
  skipsClassifierForKnownSubject?: boolean;
  /** The solve transcribes the question from its picture (`QuestionTranscription.isRequested`). */
  transcribing?(images: readonly Uint8Array[]): Promise<boolean>;
  sleep?(seconds: number): Promise<void>;
}

const wait = (seconds: number) => new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));

export interface SolveRequest {
  groupText: string;
  labels: readonly string[];
  figureNote: string | null;
  images: readonly Uint8Array[];
  route: SolverRoute;
}

export class SolutionProvider {
  /** Stronger-model passes on their way, by question and model, so reopening never asks twice. */
  private readonly confirmations = new Map<string, Promise<ProblemSolution>>();
  /** Classifier verdicts by question, and calls on their way. */
  private readonly verdicts = new Map<string, { classification: Classification | null; raw: string }>();
  private readonly pendingVerdicts = new Map<string, Promise<{ classification: Classification | null; raw: string }>>();

  constructor(readonly services: SolverServices) {}

  private get usesMock(): boolean {
    return this.services.mockSolution !== undefined;
  }

  private figureModel(): string {
    const stored = this.services.figureModel?.().trim() ?? "";
    return stored === "" ? AISettings.strongModel : stored;
  }

  /** Keyed by the pages sent too, so a change to which pages go with a question isn't hidden by an older answer. */
  async key(
    groupText: string,
    figureNote: string | null,
    images: readonly Uint8Array[],
    route: SolverRoute,
  ): Promise<string> {
    return solutionCacheKey({
      groupText,
      figureNote,
      imagesKey: await imagesDigest(images),
      route,
      promptVersion: ProblemPrompt.version,
      config: this.services.config(),
      language: TutorLanguage.fromPromptName(this.services.language()),
      usesMock: this.usesMock,
    });
  }

  async cached(
    groupText: string,
    figureNote: string | null,
    images: readonly Uint8Array[],
    route: SolverRoute,
  ): Promise<ProblemSolution | null> {
    return this.services.solutions.cached(await this.key(groupText, figureNote, images, route));
  }

  /** The route a saved answer was made on (strong first, when both are saved); null when none is saved. */
  async savedRoute(
    groupText: string,
    figureNote: string | null,
    images: readonly Uint8Array[],
  ): Promise<SolverRoute | null> {
    for (const route of ["strong", "fast"] as const) {
      if ((await this.cached(groupText, figureNote, images, route)) !== null) return route;
    }
    return null;
  }

  /** True when the saved answer is the stronger model's second pass. */
  async wasEscalated(
    groupText: string,
    figureNote: string | null,
    images: readonly Uint8Array[],
    route: SolverRoute,
  ): Promise<boolean> {
    return (await this.services.escalated.cached(await this.key(groupText, figureNote, images, route))) === true;
  }

  /**
   * The model that solves a question, after the cheap classifier. An obvious equation or unit, garbled text,
   * near-identical choices, or a maths or science subject is strong and skips the call.
   */
  async classifiedRoute(
    groupText: string,
    images: readonly Uint8Array[],
    subject: string | null,
  ): Promise<RouteOutcome> {
    const hard = RouteDecision.hardOverride(groupText);
    if (hard) return hard;
    const named = subject?.trim() ?? "";
    if (named !== "" && RouteDecision.subjectPushesStrong(named)) {
      return { needsStrongModel: true, reason: "quantitative subject", kind: "unclassified", classifierJSON: "" };
    }
    if (this.services.skipsClassifierForKnownSubject) {
      const known = RouteDecision.knownSubject(named);
      if (known) return known;
    }
    const classified = await this.classify(groupText, images);
    const outcome = RouteDecision.decide(classified.classification, subject);
    if (classified.raw !== "") outcome.classifierJSON = classified.raw;
    return outcome;
  }

  /** One cheap call: what kind of question this is. A failure, bad JSON or a timeout is null (strong). */
  async classify(
    groupText: string,
    images: readonly Uint8Array[],
  ): Promise<{ classification: Classification | null; raw: string }> {
    if (this.usesMock || !this.services.hasCredentials()) return { classification: null, raw: "" };
    const key = groupText + String.fromCharCode(0x1f) + (await imagesDigest(images));
    const known = this.verdicts.get(key);
    if (known) return known;
    let pending = this.pendingVerdicts.get(key);
    if (!pending) {
      pending = this.askClassifier(groupText, images);
      this.pendingVerdicts.set(key, pending);
    }
    try {
      const verdict = await pending;
      // A failed reading is not kept: asking again may work.
      if (verdict.classification) this.verdicts.set(key, verdict);
      return verdict;
    } finally {
      this.pendingVerdicts.delete(key);
    }
  }

  private async askClassifier(
    groupText: string,
    images: readonly Uint8Array[],
  ): Promise<{ classification: Classification | null; raw: string }> {
    const pictures = await this.classifierPictures(images, groupText);
    if (pictures === null) return { classification: null, raw: "" };
    try {
      const reply = await this.services.client({ model: AISettings.defaultModel }).complete({
        system: QuestionClassifier.system,
        user: Array.from(groupText).slice(0, QuestionClassifier.maxTextCharacters).join(""),
        images: pictures,
        schemaName: "classify",
        schema: QuestionClassifier.schema,
        maxTokens: QuestionClassifier.maxTokens,
        timeout: QuestionClassifier.timeout,
      });
      return { classification: RouteDecision.parseClassifier(reply.content), raw: reply.content };
    } catch (error) {
      if (isBlocked(error) || isSignedOut(error)) throw error;
      return { classification: null, raw: "" };
    }
  }

  /** Text when the crop has a paragraph; one small picture when it does not; null when there is nothing to send. */
  private async classifierPictures(images: readonly Uint8Array[], text: string): Promise<Uint8Array[] | null> {
    const letters = Array.from(text).filter((character) => /\p{L}/u.test(character)).length;
    if (letters >= 80) return [];
    const first = images[0];
    const small = first && this.services.thumbnail ? await this.services.thumbnail(first) : null;
    if (!small) return letters >= 12 ? [] : null;
    return [small];
  }

  /** The model (and thinking budget) that writes the first answer. A figure model set in Settings wins for a figure page. */
  firstChoice(route: SolverRoute, images: readonly Uint8Array[], subject: string | null): ModelChoice {
    const config = this.services.config();
    const figureModel = this.figureModel();
    if (config === "current" && route === "strong" && images.length > 0 && figureModel !== AISettings.strongModel) {
      return { model: figureModel, reasoningBudget: null };
    }
    return ModelRouting.choice(route, ModelRouting.area(subject), images.length > 0, this.services.plan(), config);
  }

  /** The model a failed or untested answer goes to; never the figure model twice in a row. */
  escalationModel(hasImages: boolean, firstModel: string | null): string {
    const figureModel = this.figureModel();
    if (!hasImages || figureModel === firstModel) return AISettings.strongModel;
    return figureModel;
  }

  /**
   * The first solution (or the saved one), from the route's model. With `onPartial`, the reply streams and each
   * piece is passed on as it arrives; a cheaper model that writes nothing in `firstTextDeadline` is given up on.
   */
  async solution(
    request: SolveRequest & { subject: string | null; onPartial?: (content: string) => void; signal?: AbortSignal },
  ): Promise<ProblemSolution> {
    const key = await this.key(request.groupText, request.figureNote, request.images, request.route);
    const choice = this.firstChoice(request.route, request.images, request.subject);
    const area = ModelRouting.area(request.subject);
    const fetch = async (): Promise<ProblemSolution> => {
      const onPartial = request.onPartial;
      if (onPartial) {
        // The deadline's signal and the stage's both stop the call (and its cost).
        const streamed = (pass: (content: string) => void, thinking: () => void, deadline?: AbortSignal) => {
          const signals = [request.signal, deadline].filter((signal): signal is AbortSignal => signal !== undefined);
          const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
          return this.streamedRequest({ ...request, signal }, choice, area, pass, thinking);
        };
        // Sonnet is the fallback, so only a cheaper model is given up on.
        if (choice.model === AISettings.strongModel) return streamed(onPartial, () => {});
        return withFirstTextDeadline(ModelRouting.firstTextDeadline, onPartial, streamed);
      }
      return this.request(request, choice.model, choice.reasoningBudget, request.route, area);
    };
    // An answer saved before the parts were cut back may still hold other questions.
    return restrictedTo(await this.services.solutions.script(key, fetch), request.labels);
  }

  /** A practice variant of one part, from the fast model (never saved: each one should differ). */
  async variant(request: {
    groupText: string;
    label: string;
    asks: string;
    formula: string;
    avoiding: readonly string[];
  }): Promise<ProblemVariant> {
    const reply = await this.services.client({ model: AISettings.defaultModel }).complete({
      system: VariantPrompt.system(this.services.language()),
      user: VariantPrompt.user(request.groupText, request.label, request.asks, request.formula, request.avoiding),
      schemaName: "variant",
      schema: VariantPrompt.schema,
    });
    return decodeFromContent(reply.content, decodeVariant);
  }

  /** Re-solves with the stronger model (or `chosen`) and saves that instead. */
  async confirmedSolution(
    request: SolveRequest & { model?: string | null; after?: string | null; signal?: AbortSignal },
  ): Promise<ProblemSolution> {
    const model = request.model ?? this.escalationModel(request.images.length > 0, request.after ?? null);
    const saved = await this.key(request.groupText, request.figureNote, request.images, request.route);
    const id = saved + "|" + model;
    const running = this.confirmations.get(id);
    if (running) return running;
    const pass = (async () => {
      // A follow-up inside the explanation already shown (the server lets it run a little past the limit).
      const solution = await this.request(request, model, null, null, null, true);
      await this.services.solutions.store(solution, saved);
      await this.services.escalated.store(true, saved);
      return solution;
    })();
    this.confirmations.set(id, pass);
    try {
      return await pass;
    } finally {
      this.confirmations.delete(id);
    }
  }

  private options(request: SolveRequest & { signal?: AbortSignal }, transcribing: boolean): SolveOptions {
    return {
      groupText: request.groupText,
      labels: request.labels,
      figureNote: request.figureNote,
      images: request.images,
      language: this.services.language(),
      transcribing,
      signal: request.signal,
    };
  }

  private client(
    model: string,
    reasoningBudget: number | null,
    images: readonly Uint8Array[],
    route: SolverRoute | null,
    area: Area | null,
    continuesExplanation = false,
  ) {
    return this.services.client({
      model,
      reasoningBudget,
      routeArea: area,
      routeName: route,
      routeHasFigure: route !== null ? images.length > 0 : null,
      ...(continuesExplanation ? { continuesExplanation } : {}),
    });
  }

  /** Streamed; when the stream breaks off or ends unreadable, asked once more the plain way. */
  private async streamedRequest(
    request: SolveRequest & { signal?: AbortSignal },
    choice: ModelChoice,
    area: Area,
    onPartial: (content: string) => void,
    onThinking: () => void,
  ): Promise<ProblemSolution> {
    if (this.usesMock) return this.request(request, choice.model, choice.reasoningBudget, null, null);
    const transcribing = (await this.services.transcribing?.(request.images)) ?? false;
    const client = this.client(choice.model, choice.reasoningBudget, request.images, request.route, area);
    try {
      const reply = await streamedSolution(client, {
        ...this.options(request, transcribing),
        onContent: onPartial,
        onThinking,
      });
      return restrictedTo(reply.solution, request.labels);
    } catch (error) {
      const broke =
        error instanceof ModelError && (error.failure.kind === "stream" || error.failure.kind === "network");
      if (!broke || request.signal?.aborted) throw error;
    }
    return this.request(request, choice.model, choice.reasoningBudget, null, null);
  }

  private async request(
    request: SolveRequest & { signal?: AbortSignal },
    model: string,
    reasoningBudget: number | null,
    route: SolverRoute | null,
    area: Area | null,
    continuesExplanation = false,
  ): Promise<ProblemSolution> {
    const mock = this.services.mockSolution;
    if (mock) {
      await (this.services.sleep ?? wait)(0.5);
      return decodeProblemSolution(JSON.parse(JSON.stringify(mock(request))));
    }
    const transcribing = (await this.services.transcribing?.(request.images)) ?? false;
    const reply = await plainSolution(
      this.client(model, reasoningBudget, request.images, route, area, continuesExplanation),
      this.options(request, transcribing),
    );
    return restrictedTo(reply.solution, request.labels);
  }
}
