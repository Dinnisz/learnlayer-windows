// Port of LearnLayer/Problems/QuestionSession.swift @ ref 2026-11-04: one exam question being worked on. What
// comes in later phases: the mascot's lesson and the voice (phase 5), drawings, graphs and the timing diagram
// (phase 6), the fast transcription of a picture (phase 4), and "Try a Similar One" (with ProblemVariant).
// Observable by subscription (`subscribe` / `version`), for React's useSyncExternalStore.

import { isBlocked, isSignedOut, isTransient } from "../ai/modelClient";
import { AISettings, ModelRouting, type RoutingConfig, type SolverRoute } from "../ai/modelRouting";
import { streamedPart, type StreamedPart } from "../ai/partialJSON";
import { evaluate, tryParseExpression, variables, type Expression } from "../math/expression";
import { latexToUnicode } from "../math/latexText";
import { Verifier } from "../math/verifier";
import { AnswerAudit, FigureConsistency, ListeningDetection, ReadingAnswerCheck } from "./answerChecks";
import { ChoiceCheck } from "./choiceCheck";
import {
  evidenceAnswer,
  locate,
  passageChunk,
  type EvidenceAnswer,
  type PassageChunk,
  type PassageLine,
} from "./passage";
import { ignoresMissingFigure, partLabelled, type Part, type ProblemSolution } from "./problemSolution";
import type { ExamQuestion } from "./questionDetector";
import { QuestionText } from "./textChecks";
import { RouteDecision, type RouteOutcome } from "./routeDecision";
import { realigned, signTableProblems } from "./signTable";
import { noteStage, solveClock, SolutionReveal, SolveKind, SolveProgress, type SolveClock } from "./solutionReveal";
import type { SolutionProvider } from "./solutionProvider";
import { typedFunction, typedNumber, Variant, type ProblemVariant } from "./problemVariant";
import { StatementQuotes, stepMarks, stepQuotes } from "./statementQuotes";

export type SessionState =
  | { kind: "loading" }
  /** Signed out (no session, no local key): the stage offers to sign in. */
  | { kind: "needsKey" }
  /** `error` is the model client's (translate it with `failureMessage`). */
  | { kind: "failed"; error: unknown }
  | { kind: "ready" };

export type Mode = "hint" | "tryIt" | "solution" | "followUp" | "variant";
export type AttemptResult = "matches" | "differs" | "unreadable" | "checking";

/** What the session needs beyond the solver: the clock, and the answer to a question about the exercise. */
export interface SessionServices {
  provider: SolutionProvider;
  config(): RoutingConfig;
  /** The paper's subject, when the app knows it (the document's name, the student's default). */
  subject?: string | null;
  /** Answers "Ask about this exercise" (TextHelp); its paragraphs, or null when it failed. */
  help?(request: {
    heading: string;
    passage: string;
    context: string;
    image: Uint8Array | null;
  }): Promise<string[] | null>;
  now?(): number;
  setTimer?(callback: () => void, seconds: number): () => void;
}

export interface SessionInit {
  question: ExamQuestion;
  /** Pictures of the question's pages (cropped), so the model sees the figures. */
  images?: readonly Uint8Array[];
  /** A captured area of the screen: always read from its picture. */
  isPicture?: boolean;
  /** Pages beyond the question's own were sent: a figure or document it names. */
  sendsMaterial?: boolean;
  /** The source text's lines (the pages sent), where a text answer's quotes are looked for. */
  passageLines?: readonly PassageLine[];
  /** The text printed before the question (the poem a question about "o texto" reads). */
  supportText?: string | null;
}

const foldDiacritics = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** The figure words with rhetorical figures ("figura de estilo", "figure of speech") set aside. */
function withoutRhetoricalFigures(text: string): string {
  let folded = foldDiacritics(text);
  for (const phrase of [
    "figura de estilo",
    "figura de retorica",
    "figure de style",
    "figure of speech",
    "rhetorical figure",
  ]) {
    folded = folded.replaceAll(phrase, " ");
  }
  return folded;
}

const plainLabel = (text: string) =>
  Array.from(text.toLowerCase())
    .filter((character) => !"()[]. ".includes(character))
    .join("");

/** "4" when `label` ("4" or "4.") numbers a group that has parts "4.1", "4.2"… in `labels`. */
function stem(label: string, labels: readonly string[]): string | null {
  const own = label.endsWith(".") ? label.slice(0, -1) : label;
  if (!/^\d[\d.]*$/.test(own)) return null;
  const hasParts = labels.some((other) => other.startsWith(own + ".") && /^\d/.test(other.slice(own.length + 1)));
  return hasParts ? own : null;
}

export const QuestionSessionRules = {
  audioNeededTitle: "Audio needed",
  audioNeededDetail: "This question comes from a recording I can’t hear. Paste the transcript and I’ll answer from it.",

  /** A diagram, circuit or graph the question names, after rhetorical figures are set aside. */
  mentionsPrintedFigure(text: string): boolean {
    const folded = withoutRhetoricalFigures(text);
    return [
      "figura",
      "figure",
      "fig.",
      "circuito",
      "circuit",
      "diagrama",
      "diagram",
      "esquema",
      "karnaugh",
      "grafico",
      "graph",
    ].some((word) => folded.includes(word));
  },

  /** "Figura 1", not "figure de style". */
  mentionsFigureWord(text: string): boolean {
    return /\b(figura|figure)\b|\bfig\./.test(withoutRhetoricalFigures(text));
  },

  /** The shared statement and the other parts go with a clicked part, to be read, not solved. */
  onlyPartNote(label: string): string {
    return `\n\nOnly part ${label} is asked. The statement and the other parts are context: do not solve, check or discuss them.`;
  },

  /** "o sujeito poético", "o texto", "os versos", "linhas 3 a 5": the question reads a printed text it doesn't contain. */
  refersToText(text: string): boolean {
    const folded = foldDiacritics(text);
    const pattern = new RegExp(
      "\\b(sujeito poetico|eu (poetico|lirico)|poema|poesia|estrofes?|versos?|excertos?|fragmentos?|narrador|cronista|autora?|" +
        "(d?o|no|deste|neste|desse|nesse) texto|textos? [ab12]\\b|(linhas?|ll?\\.|vv?\\.) ?\\d|" +
        "the (text|passage|poem|extract|excerpt|speaker|narrator)|lines? \\d)",
    );
    return pattern.test(folded);
  },

  /** The passage to send with a question that refers to a text; null when it is empty or already in the question. */
  supportPassage(support: string | null | undefined, question: string): string | null {
    const passage = (support ?? "").trim();
    if (passage === "" || !QuestionSessionRules.refersToText(question)) return null;
    const characters = Array.from(passage);
    const tail = characters.slice(-12_000).join("");
    if (question.includes(Array.from(tail).slice(0, 200).join(""))) return null;
    return tail;
  },

  /** The part answering `label`: "3(iii)" also matches a part the model called "(iii)" or "iii". */
  part(label: string, solution: ProblemSolution, groupLabels: readonly string[], allowsCombined: boolean): Part | null {
    const own = stem(label, groupLabels);
    if (own !== null) {
      const first = solution.parts.find((part) => stem(own, [part.label]) !== null);
      if (first) return first;
    }
    const found = partLabelled(solution, label);
    if (found) return found;
    const open = label.lastIndexOf("(");
    if (open > 0 && label.endsWith(")")) {
      const sub = plainLabel(label.slice(open));
      const match = solution.parts.find((part) => plainLabel(part.label) === sub);
      if (match) return match;
    }
    return allowsCombined && solution.parts.length === 1 ? solution.parts[0]! : null;
  },

  /** Whether a group's answer has a part of its own for `label`. */
  showsAlone(label: string, solution: ProblemSolution, groupLabels: readonly string[]): boolean {
    return QuestionSessionRules.part(label, solution, groupLabels, false) !== null;
  },

  /** The clicked part alone when it is one of the group's parts; a clicked statement still asks for its parts. */
  solveLabels(clicked: string, partLabels: readonly string[]): string[] {
    if (partLabels.length <= 1 || !partLabels.includes(clicked)) return [...partLabels];
    const introducesOthers = partLabels.some(
      (other) => other !== clicked && other.startsWith(clicked) && !/^\d/.test(other.slice(clicked.length)),
    );
    return introducesOthers ? [...partLabels] : [clicked];
  },

  /** The button offers an explanation, not a worked solution: a text answer, or a subject with nothing to calculate. */
  explains(subject: string | null, part: Part | null, expectsText: boolean, hasEvidenceAnswer: boolean): boolean {
    if (hasEvidenceAnswer || (part?.evidence && part.evidence.length > 0)) return true;
    if (part?.paragraphs && part.paragraphs.length > 0 && part.answer.expression === null && !part.equation)
      return true;
    const formula =
      (part?.answer.expression ?? null) !== null || Boolean(part?.equation) || (part?.signTable ?? null) !== null;
    if (formula) return false;
    if (!part) return expectsText;
    if (expectsText) return true;
    const asks = part.asks.toLowerCase();
    if (["explica", "explain", "comenta", "comment", "interpreta", "interpret"].some((verb) => asks.startsWith(verb)))
      return true;
    if (!subject) return false;
    const name = subject.toLowerCase();
    return [
      "portugu",
      "english",
      "inglês",
      "ingles",
      "french",
      "francês",
      "frances",
      "histór",
      "histor",
      "geograf",
      "geograph",
      "filosof",
      "philosoph",
      "literat",
      "língua",
      "lingua",
    ].some((stemWord) => name.includes(stemWord));
  },

  /** An empty answer, or one with a placeholder for a number ("2,2xx %", "?"). */
  isUnfinished(answer: string): boolean {
    return answer.trim() === "" || /\d[.,]?\d*x{2,}|\?\?|…\s*%/.test(answer);
  },

  /** Equal at random values of every name, including negative ones. */
  agree(a: Expression, b: Expression, random: () => number = Math.random): boolean {
    let compared = 0;
    const names = new Set([...variables(a), ...variables(b)]);
    for (let round = 0; round < 16; round += 1) {
      const values: Record<string, number> = {};
      for (const name of names) {
        const magnitude = 0.3 + random() * 2.4;
        values[name] = random() < 0.5 ? magnitude : -magnitude;
      }
      let x: number;
      let y: number;
      try {
        x = evaluate(a, values);
        y = evaluate(b, values);
      } catch {
        continue;
      }
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      compared += 1;
      if (Math.abs(x - y) > 1e-6 * Math.max(1, Math.abs(y))) return false;
    }
    return compared > 0;
  },
};

export class QuestionSession {
  readonly question: ExamQuestion;
  readonly images: readonly Uint8Array[];
  readonly passageLines: readonly PassageLine[];
  readonly supportText: string | null;
  private readonly isPicture: boolean;
  private readonly services: SessionServices;
  private readonly subjectHint: string | null;

  state: SessionState = { kind: "loading" };
  solution: ProblemSolution | null = null;
  /** The answers passed the checks (or were re-solved by the stronger model). */
  isConfirmed = false;
  isConfirming = false;
  /** Null until the student picks an option. */
  mode: Mode | null = null;
  revealedSteps = 0;
  attemptResult: AttemptResult | null = null;
  /** What the student typed about a figure the model can't read. */
  figureNote: string | null = null;
  /** The spoken text of a listening item, pasted by the student. */
  transcript: string | null = null;
  usedHint = false;
  sawSolution = false;
  solvedAlone = false;
  solvedByStrongerModel = false;
  /** B: Gemini re-explained once, so the next "Explain better" goes to Sonnet. */
  explainedBetterCheaply = false;
  route: SolverRoute = "strong";
  routeKind = "unclassified";
  routeReason = "unclassified";
  classifierJSON = "";
  /** What has arrived of this part while the solution streams in. */
  streamed: StreamedPart | null = null;
  /** No text has arrived after `slowStartDelay`: a thinking model is still working. */
  isSlowToStart = false;
  solveClock: SolveClock = solveClock();
  solveStartedAt = 0;
  selectedStep: number | null = null;
  hoveredStep: number | null = null;
  /** The step the voice is saying now, from the statement's data it names. */
  spokenStep: number | null = null;
  /** The transcription's text, once the app shows the question typeset from it (phase 4). */
  shownStatement: string | null = null;
  followUpQuestion: string | null = null;
  followUpAnswer: string[] | null = null;
  isAnsweringFollowUp = false;
  /** Bumped to put the cursor in the "Ask about this exercise" field. */
  askFocusID = 0;
  /** Bumped for every change, for `useSyncExternalStore`. */
  version = 0;

  private solvesClickedPartOnly = false;
  private hasStartedSolve = false;
  private defersConfirmation = false;
  private hasStartedStreaming = false;
  private lastParse = -Infinity;
  private controller: AbortController | null = null;
  private stopSlowStart: (() => void) | null = null;
  private lastAttempt = "";
  private followUpID = 0;
  private cascadeKey: string | null = null;
  private cascadeShown = 0;
  private cascadeDone = false;
  private evidenceCache: { label: string; answerText: string; answer: EvidenceAnswer | null } | null = null;
  private passageCache: { end: number; chunk: PassageChunk } | null = null;
  private readonly listeners = new Set<() => void>();

  static readonly slowStartDelay = 4;

  constructor(init: SessionInit, services: SessionServices) {
    this.question = init.question;
    this.images = init.images ?? [];
    this.isPicture = init.isPicture ?? false;
    this.supportText = init.supportText ?? null;
    this.passageLines =
      init.passageLines && init.passageLines.length > 0
        ? init.passageLines
        : init.question.groupText.split("\n").map((text) => ({ number: null, text }));
    this.services = services;
    this.subjectHint = services.subject ?? null;
    // `sendsMaterial` is kept by the Mac for the evaluation log only.
    void init.sendsMaterial;
  }

  // MARK: Observation

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private changed(): void {
    this.version += 1;
    for (const listener of [...this.listeners]) listener();
  }

  private now(): number {
    return this.services.now?.() ?? Date.now() / 1000;
  }

  // MARK: The question and its parts

  /** The subject name that was used to choose the route. */
  get routeSubject(): string | null {
    const trimmed = this.subjectHint?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
  }

  /** The question relies on a figure: a picture, or a circuit, diagram or graph named in its text. */
  get dependsOnFigure(): boolean {
    return this.isPicture || QuestionSessionRules.mentionsPrintedFigure(this.question.groupText);
  }

  /** The labels the model answers. A stem ("4") whose parts (4.1, 4.2) are in the group is only their statement. */
  get partLabels(): string[] {
    if (this.solvesClickedPartOnly) return [this.question.label];
    const groupLabels = this.question.groupLabels;
    const labels = groupLabels.filter((label) => stem(label, groupLabels) === null);
    // A part whose label was glued to the next glyph ("2.3.@") can be missing from the detected list.
    for (const label of QuestionText.decimalPartLabels(this.question.groupText)) {
      if (!labels.includes(label) && stem(label, [...labels, label]) === null) labels.push(label);
    }
    const clicked = this.question.label;
    if (clicked !== "" && !labels.includes(clicked) && stem(clicked, [...labels, clicked]) === null)
      labels.push(clicked);
    return labels;
  }

  get solveLabels(): string[] {
    return QuestionSessionRules.solveLabels(this.question.label, this.partLabels);
  }

  /**
   * The group's text, plus a listening transcript once pasted. A comparison of two texts also gets the printed
   * lines of the pages sent. A question that reads a text printed above it gets that text.
   */
  get requestText(): string {
    let text = this.question.groupText;
    const support = QuestionSessionRules.supportPassage(this.supportText, this.question.groupText);
    if (support) text += "\n\nTexto de apoio (printed before the question):\n" + support;
    if (this.transcript) text += "\n\nTranscript of the recording, as given by the student:\n" + this.transcript;
    if (RouteDecision.comparesTwoTexts(this.question.groupText) && this.passageLines.length > 0) {
      const passage = this.passageLines
        .map((line) => (line.number === null ? line.text : `${line.number}\t${line.text}`))
        .join("\n");
      if (passage !== "")
        text += "\n\nPrinted source, with the exam's line numbers:\n" + Array.from(passage).slice(0, 12_000).join("");
    }
    const solveLabels = this.solveLabels;
    const partLabels = this.partLabels;
    const differ =
      solveLabels.length !== partLabels.length || solveLabels.some((label, index) => label !== partLabels[index]);
    if (this.solvesClickedPartOnly || differ) text += QuestionSessionRules.onlyPartNote(this.question.label);
    return text;
  }

  /** A listening item whose recording and transcript are not in the question. */
  get needsTranscript(): boolean {
    if (this.transcript !== null) return false;
    const page = this.passageLines.map((line) => line.text).join("\n");
    const text = page === "" ? this.question.groupText : this.question.groupText + "\n" + page;
    return ListeningDetection.isWithoutSource(text, this.subjectHint);
  }

  /** The student pasted the recording's words: the question is solved from those, not guessed. */
  provideTranscript(note: string): void {
    const trimmed = note.trim();
    if (trimmed === "") return;
    this.transcript = trimmed;
    this.solution = null;
    void this.load();
  }

  /** The student described a figure the model couldn't read. */
  describeFigure(note: string): void {
    this.figureNote = note;
    this.solution = null;
    void this.load();
  }

  /** This question's part; a group answered as one part still shows that part. */
  get part(): Part | null {
    if (!this.solution) return null;
    return QuestionSessionRules.part(this.question.label, this.solution, this.question.groupLabels, true);
  }

  /** The question mentions a figure the model couldn't read. */
  get needsFigure(): boolean {
    return this.solution?.needsFigure === true && QuestionSessionRules.mentionsFigureWord(this.question.text);
  }

  get canTry(): boolean {
    const part = this.part;
    return (part?.answer.expression ?? null) !== null || Boolean(part?.equation);
  }

  // MARK: Loading

  /** Opens the stage with no paid call: a saved answer is read from disk; anything else waits for a choice. */
  async openQuietly(): Promise<void> {
    this.defersConfirmation = true;
    if (this.hasStartedSolve) return;
    const saved = await this.services.provider.savedRoute(this.requestText, this.figureNote, this.images);
    if (saved !== null && !this.hasStartedSolve) await this.load();
  }

  private solveOnFirstChoice(): void {
    if (this.hasStartedSolve || this.solution) return;
    void this.load();
  }

  /** A hint needs no verified answer; every other choice does. */
  private confirmIfAnswerWanted(): void {
    if (this.isConfirmed) return;
    if (this.defersConfirmation && (this.mode === null || this.mode === "hint")) return;
    void this.confirm();
  }

  private async solveClickedPartAloneIfCombined(): Promise<void> {
    if (this.solvesClickedPartOnly || this.partLabels.length <= 1 || !this.partLabels.includes(this.question.label))
      return;
    const provider = this.services.provider;
    const route = await provider.savedRoute(this.requestText, this.figureNote, this.images);
    if (route === null) return;
    const saved = await provider.cached(this.requestText, this.figureNote, this.images, route);
    if (saved && !QuestionSessionRules.showsAlone(this.question.label, saved, this.question.groupLabels)) {
      this.solvesClickedPartOnly = true;
      this.solution = null;
    }
  }

  async load(): Promise<void> {
    this.hasStartedSolve = true;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const cancelled = () => controller.signal.aborted;
    // No audio and no transcript: don't guess the answers. Ask for the words.
    if (this.needsTranscript) {
      this.state = { kind: "ready" };
      this.changed();
      return;
    }
    await this.solveClickedPartAloneIfCombined();
    if (cancelled()) return;
    this.state = { kind: "loading" };
    this.streamed = null;
    this.beginSolveProgress();
    this.isSlowToStart = false;
    this.hasStartedStreaming = false;
    this.stopSlowStart?.();
    this.stopSlowStart = this.timer(() => {
      if (cancelled() || this.state.kind !== "loading" || this.hasStartedStreaming) return;
      this.isSlowToStart = true;
      this.changed();
    }, QuestionSession.slowStartDelay);
    this.changed();

    const provider = this.services.provider;
    const requestText = this.requestText;
    const { figureNote, images } = this;
    const solveLabels = this.solveLabels;
    let outcome: RouteOutcome;
    try {
      const saved = await provider.savedRoute(requestText, figureNote, images);
      outcome =
        saved !== null
          ? { needsStrongModel: saved === "strong", reason: "saved answer", kind: "saved", classifierJSON: "" }
          : await provider.classifiedRoute(requestText, images, this.subjectHint);
    } catch (error) {
      if (cancelled()) return;
      if (isBlocked(error) || isSignedOut(error)) {
        this.state = isSignedOut(error) ? { kind: "needsKey" } : { kind: "failed", error };
        this.changed();
        return;
      }
      outcome = { needsStrongModel: true, reason: "classifier failed", kind: "unclassified", classifierJSON: "" };
    }
    if (cancelled()) return;
    this.markSolveCall();
    const route: SolverRoute = outcome.needsStrongModel ? "strong" : "fast";
    this.route = route;
    this.routeKind = outcome.kind;
    this.routeReason = outcome.reason;
    this.classifierJSON = outcome.classifierJSON;
    this.changed();

    const saved = await provider.cached(requestText, figureNote, images, route);
    if (cancelled()) return;
    if (saved) {
      this.show(saved);
      const escalated = await provider.wasEscalated(requestText, figureNote, images, route);
      if (this.firstModelIsStrong || escalated) this.markSolvedByStrongerModel();
      else this.confirmIfAnswerWanted();
      this.changed();
      return;
    }
    try {
      const solution = await provider.solution({
        groupText: requestText,
        labels: solveLabels,
        figureNote,
        images,
        route,
        subject: this.subjectHint,
        signal: controller.signal,
        onPartial: (content) => this.received(content),
      });
      if (cancelled()) return;
      this.show(solution);
      // The stronger model's answer isn't sent to itself again.
      if (this.firstModelIsStrong) this.markSolvedByStrongerModel();
      else if (!this.isConfirmed) this.confirmIfAnswerWanted();
      this.changed();
    } catch (error) {
      if (cancelled()) return;
      if (isSignedOut(error)) {
        this.state = { kind: "needsKey" };
        this.changed();
        return;
      }
      // Not a wrong answer, and not a reason to call the stronger model: a refusal or an outage.
      if (isBlocked(error) || isTransient(error)) {
        this.state = { kind: "failed", error };
        this.changed();
        return;
      }
      // The first model's reply was unusable (cut off, malformed, nothing in time): the stronger model solves it.
      this.markSolveChecking();
      this.changed();
      try {
        const confirmed = await provider.confirmedSolution({
          groupText: requestText,
          labels: solveLabels,
          figureNote,
          images,
          route,
          after: this.firstModelName,
          signal: controller.signal,
        });
        if (cancelled()) return;
        this.show(confirmed);
        this.isConfirmed = true;
        this.solvedByStrongerModel = true;
      } catch {
        if (!cancelled()) this.state = { kind: "failed", error };
      }
      this.changed();
    }
  }

  private timer(callback: () => void, seconds: number): () => void {
    if (this.services.setTimer) return this.services.setTimer(callback, seconds);
    const handle = setTimeout(callback, seconds * 1000);
    return () => clearTimeout(handle);
  }

  /** The model that wrote (or writes) the first answer. */
  get firstModelName(): string {
    return this.services.provider.firstChoice(this.route, this.images, this.subjectHint).model;
  }

  /** Only Sonnet counts as the stronger model; a cheaper first answer is still checked. */
  private get firstModelIsStrong(): boolean {
    return this.firstModelName === AISettings.strongModel;
  }

  /** The reply so far: read again at most ten times a second. */
  private received(content: string): void {
    if (!this.hasStartedStreaming) {
      this.hasStartedStreaming = true;
      this.isSlowToStart = false;
    }
    this.noteSolveStream(content);
    const now = this.now();
    if (this.state.kind !== "loading" || now - this.lastParse <= 0.1) return;
    this.lastParse = now;
    const labels = this.partLabels;
    const label = labels.includes(this.question.label) ? this.question.label : (labels[0] ?? null);
    const part = streamedPart(content, label);
    if (part && JSON.stringify(part) !== JSON.stringify(this.streamed)) this.streamed = part;
    this.changed();
  }

  private markSolvedByStrongerModel(): void {
    this.isConfirmed = true;
    this.solvedByStrongerModel = true;
  }

  cancel(): void {
    this.controller?.abort();
    this.variantController?.abort();
    this.stopSlowStart?.();
  }

  private show(incoming: ProblemSolution): void {
    const solution: ProblemSolution = {
      ...incoming,
      parts: incoming.parts.map((part) => ({ ...part, signTable: part.signTable ? realigned(part.signTable) : null })),
    };
    // A language, philosophy or text question does not depend on an unread diagram.
    if (solution.needsFigure && ignoresMissingFigure(solution, this.question.groupText)) solution.needsFigure = false;
    this.solution = solution;
    this.evidenceCache = null;
    // Confirmed unless a check fails; a missing check is no reason to pay the stronger model.
    this.isConfirmed = solution.checks.every((check) => Verifier.outcome(check) !== "failed");
    // A figure that couldn't be read, a missing answer, or a choice that isn't one listed option: the stronger model.
    if ((solution.needsFigure && this.images.length > 0) || solution.parts.some((part) => !this.isUsable(part)))
      this.isConfirmed = false;
    // A fast reading answer that only points at lines, delegates, says the excerpt is missing, or skips items.
    if (
      this.route === "fast" &&
      !this.solvedByStrongerModel &&
      solution.parts.some((part) => {
        const options = ChoiceCheck.options(part.label, this.question.groupText, this.partLabels);
        const asked = [part.asks, this.question.text].filter((text) => text !== "").join("\n");
        return ReadingAnswerCheck.needsEscalation(part.answer.text, options.size > 0, asked);
      })
    ) {
      this.isConfirmed = false;
    }
    // A maths or physics answer from a cheaper model whose only checks restate its own formula was never tested.
    if (
      AnswerAudit.needsStrongerModel(
        solution.checks,
        ModelRouting.area(this.subjectHint),
        this.firstModelIsStrong || this.solvedByStrongerModel,
        false,
      )
    ) {
      this.isConfirmed = false;
    }
    // A sign table the app can't confirm sign by sign.
    if (solution.parts.some((part) => part.signTable !== null && signTableProblems(part.signTable).length > 0))
      this.isConfirmed = false;
    // The figure reading and the answer describe different curves.
    if (solution.figure) {
      const answers = solution.parts
        .map((part) =>
          [part.answer.text, ...part.steps, ...(part.cards ?? []).map((card) => card.note ?? "")].join("\n"),
        )
        .join("\n");
      if (FigureConsistency.disagreement(solution.figure, answers) !== null) this.isConfirmed = false;
    }
    this.solveClock = { ...this.solveClock, ready: true };
    this.state = { kind: "ready" };
    this.changed();
  }

  private isUsable(part: Part): boolean {
    return (
      !QuestionSessionRules.isUnfinished(part.answer.text) &&
      ChoiceCheck.isUsable(part.answer.text, ChoiceCheck.options(part.label, this.requestText, this.partLabels))
    );
  }

  /** The student asks for the stronger model's own solution, replacing the saved one. */
  solveWithStrongerModel(): void {
    this.isConfirmed = false;
    this.revealedSteps = 0;
    const model = ModelRouting.explainBetterModel(
      this.firstModelName,
      this.solvedByStrongerModel || this.explainedBetterCheaply,
      this.services.config(),
    );
    void this.confirm(model === AISettings.strongModel ? null : model);
  }

  /** The first answer's checks didn't all pass: ask the stronger model in the background. Hints stay available. */
  private async confirm(model: string | null = null): Promise<void> {
    if (this.isConfirming) return;
    this.isConfirming = true;
    this.changed();
    try {
      const confirmed = await this.services.provider.confirmedSolution({
        groupText: this.requestText,
        labels: this.solveLabels,
        figureNote: this.figureNote,
        images: this.images,
        route: this.route,
        model,
        after: this.firstModelName,
      });
      this.show(confirmed);
      this.isConfirmed = model === null;
      this.solvedByStrongerModel = model === null;
      if (model !== null) this.explainedBetterCheaply = true;
      if (this.mode === "hint") this.revealedSteps = 0;
      this.selectedStep = null;
      if (this.attemptResult === "checking") this.check(this.lastAttempt);
    } catch {
      // The first answer stays; nothing better came.
    } finally {
      this.isConfirming = false;
      this.changed();
    }
  }

  // MARK: Solve progress

  /** True while «Solution» is waiting on the solve. */
  get isSolvingSolution(): boolean {
    return this.mode === "solution" && this.state.kind === "loading";
  }

  /** The progress phrase now (an English catalog key), or null once the solution is ready. */
  progressPhrase(notBefore: Parameters<typeof SolveProgress.stage>[2] = null): string | null {
    const stage = SolveProgress.stage(this.solveClock, this.now() - this.solveStartedAt, notBefore);
    return stage === null ? null : SolveProgress.phrase(stage, this.solveClock.kind);
  }

  private beginSolveProgress(): void {
    this.solveStartedAt = this.now();
    this.solveClock = solveClock({
      hasFigure: SolveProgress.mentionsFigure(this.requestText) || (this.figureNote ?? "") !== "",
      kind: SolveKind.detect(this.requestText),
    });
  }

  private elapsed(): number {
    return Math.max(0, this.now() - this.solveStartedAt);
  }

  private markSolveCall(): void {
    const elapsed = this.elapsed();
    this.solveClock = noteStage(this.solveClock, "solveCallAt", elapsed, true);
    this.solveClock = noteStage(this.solveClock, "figureAt", elapsed, this.solveClock.hasFigure);
  }

  private markSolveChecking(): void {
    this.solveClock = noteStage(this.solveClock, "checkingAt", this.elapsed(), true);
  }

  private noteSolveStream(content: string): void {
    const elapsed = this.elapsed();
    if (SolveProgress.figureStarted(content)) {
      this.solveClock = { ...this.solveClock, hasFigure: true };
      this.solveClock = noteStage(this.solveClock, "figureAt", elapsed, true);
    }
    this.solveClock = noteStage(this.solveClock, "equationsAt", elapsed, SolveProgress.equationsStarted(content));
  }

  // MARK: Text answers

  /** A text answer with its quotes found in the source; null when the part has no evidence or none is found. */
  get evidenceAnswer(): EvidenceAnswer | null {
    const part = this.part;
    if (!part) return null;
    const cached = this.evidenceCache;
    if (cached && cached.label === part.label && cached.answerText === part.answer.text) return cached.answer;
    const answer = evidenceAnswer(part, this.passageLines);
    this.evidenceCache = { label: part.label, answerText: part.answer.text, answer };
    return answer;
  }

  /** The button offers an explanation, not a worked solution. */
  get explains(): boolean {
    return QuestionSessionRules.explains(
      this.solution?.subject ?? null,
      this.part,
      this.expectsTextAnswer,
      this.evidenceAnswer !== null,
    );
  }

  /** A written answer from a text or document is likely; decided before any reply, by the question's words. */
  get expectsTextAnswer(): boolean {
    if (this.streamed?.hasNoEvidence) return false;
    if (this.streamed && this.streamed.evidence.length > 0) return true;
    const text = this.question.groupText.toLowerCase();
    return [
      "texto",
      "excerto",
      "documento",
      "doc.",
      "poema",
      "cantiga",
      "crónica",
      "soneto",
      "passage",
      "document",
      "extract",
    ].some((word) => text.includes(word));
  }

  /** The source's lines: the ones the exam numbers when it does. */
  private get passageText(): PassageLine[] {
    const lines = this.passageLines.filter((line) => line.text.trim() !== "");
    const numbered = lines.filter((line) => line.number !== null);
    return numbered.length === 0 ? lines : numbered;
  }

  /** The passage shown while the answer comes: its first lines, and down to the last quote found so far. */
  get streamedPassage(): PassageChunk {
    const lines = this.passageText;
    let end = Math.min(lines.length, 22);
    if (this.streamed) {
      const joined = lines.map((line) => line.text).join("\n");
      for (const item of this.streamed.evidence) {
        const range = locate(item.quote, joined);
        if (!range) continue;
        const line = joined.slice(0, range.end).split("\n").length - 1;
        end = Math.max(end, Math.min(lines.length, line + 2));
      }
    }
    if (this.passageCache && this.passageCache.end === end) return this.passageCache.chunk;
    const chunk = passageChunk(lines.slice(0, end));
    this.passageCache = { end, chunk };
    return chunk;
  }

  /** The quotes received so far that are found in the passage (others are never shown). */
  get streamedQuotes(): { quote: string; range: { start: number; end: number } }[] {
    if (!this.streamed) return [];
    const text = this.streamedPassage.text;
    return this.streamed.evidence
      .map((item) => ({ quote: item.quote, range: locate(item.quote, text) }))
      .filter((item): item is { quote: string; range: { start: number; end: number } } => item.range !== null);
  }

  // MARK: What the student asked for

  choose(mode: Mode): void {
    this.mode = mode;
    this.solveOnFirstChoice();
    // The check by the stronger model waits for a choice that needs a right answer.
    if (this.defersConfirmation && mode !== "hint" && this.solution) this.confirmIfAnswerWanted();
    this.attemptResult = null;
    this.hoveredStep = null;
    if (mode === "hint") this.usedHint = true;
    if (mode === "solution") {
      this.sawSolution = true;
      this.selectedStep = null;
    }
    this.changed();
  }

  // MARK: Steps

  /** Cards when the model drew the solution as cards, else its text steps. */
  get stepCount(): number {
    const part = this.part;
    if (part?.cards && part.cards.length > 0) return part.cards.length;
    return part?.steps.length ?? 0;
  }

  get showsAnswer(): boolean {
    return this.revealedSteps > this.stepCount;
  }

  get hasMoreSolution(): boolean {
    return this.revealedSteps <= this.stepCount;
  }

  select(step: number): void {
    this.selectedStep = this.selectedStep === step ? null : step;
    this.changed();
  }

  hover(step: number, inside: boolean): void {
    if (inside) this.hoveredStep = step;
    else if (this.hoveredStep === step) this.hoveredStep = null;
    else return;
    this.changed();
  }

  /** The step whose data the statement underlines: hovered, else the one being said, coming in, or open. */
  get underlinedStep(): number | null {
    const open = StatementQuotes.openStep(
      this.mode === "solution",
      this.mode === "hint",
      this.selectedStep,
      this.revealedSteps,
      this.stepCount,
    );
    const spoken =
      this.spokenStep !== null && this.spokenStep >= 0 && this.spokenStep < this.stepCount ? this.spokenStep : null;
    return StatementQuotes.shownStep(spoken ?? this.revealingStep ?? open, this.hoveredStep);
  }

  /** The step the figure is drawn at. */
  get figureStep(): number {
    const cascading = this.cascadingCount;
    if (cascading !== null) return cascading;
    if (this.mode === "solution") return this.selectedStep === null ? Number.MAX_SAFE_INTEGER : this.selectedStep + 1;
    return this.revealedSteps;
  }

  /** The figure shows the answer: in the solution unless a step is picked. */
  get figureRevealed(): boolean {
    if (this.cascadingCount !== null) return false;
    return this.mode === "solution" ? this.selectedStep === null : this.showsAnswer;
  }

  /** The statement the quotes are checked against: the transcription the student reads, else the PDF's text. */
  get statementText(): string {
    if (this.shownStatement !== null) return this.shownStatement;
    return this.question.groupText === "" ? this.question.text : this.question.groupText;
  }

  get quoteColors(): Map<string, number> {
    const part = this.part;
    return part ? StatementQuotes.palette(stepMarks(part), this.statementText) : new Map();
  }

  /** A step's quotes that are in the statement, with their places, in the step's order. */
  verifiedQuotes(step: number): { quote: string; color: number }[] {
    const part = this.part;
    if (!part) return [];
    const quotes = stepQuotes(part);
    if (step < 0 || step >= quotes.length) return [];
    const colors = this.quoteColors;
    const seen = new Set<string>();
    const result: { quote: string; color: number }[] = [];
    for (const quote of quotes[step]!) {
      const key = StatementQuotes.key(quote);
      const color = colors.get(key);
      if (color === undefined || seen.has(key)) continue;
      seen.add(key);
      result.push({ quote: key, color });
    }
    return result;
  }

  /** What a step says, for the length of its beat. */
  stepText(step: number): string | null {
    const part = this.part;
    if (!part) return null;
    if (part.cards && part.cards.length > 0) {
      const card = part.cards[step];
      return card ? [card.title, latexToUnicode(card.latex), card.note ?? ""].join(" ") : null;
    }
    return part.steps[step] ?? null;
  }

  // MARK: The solution coming in

  /** The solution on screen: the cascade runs again only for a new one. */
  get solutionKey(): string {
    return `${this.part?.label ?? ""}|${this.stepCount}`;
  }

  /** While the whole solution is still coming in, how many steps are on screen; null once it is all there. */
  get cascadingCount(): number | null {
    if (this.mode !== "solution" || this.stepCount <= 0 || this.evidenceAnswer !== null) return null;
    if (this.cascadeKey !== this.solutionKey) return 0;
    return this.cascadeDone ? null : Math.min(this.cascadeShown, this.stepCount);
  }

  /** The step that came in last while the solution is coming in. */
  get revealingStep(): number | null {
    const count = this.cascadingCount;
    return count !== null && count > 0 ? count - 1 : null;
  }

  get visibleSolutionSteps(): number {
    return this.cascadingCount ?? this.stepCount;
  }

  get cascadeFinished(): boolean {
    return this.cascadingCount === null;
  }

  /** The final answer is on screen from the moment the solution opens (a lesson may hold it back, phase 5). */
  get showsFinalAnswer(): boolean {
    return this.part !== null;
  }

  /**
   * Brings the whole solution's steps in one after another, then its answer. Picks up where it was when the view
   * comes back. `now` (seconds) and `sleep` are the clock it runs on; `signal` stops it.
   */
  async runCascade(options: {
    reduceMotion: boolean;
    now?: () => number;
    sleep?: (seconds: number) => Promise<void>;
    signal?: AbortSignal;
  }): Promise<void> {
    if (this.cascadingCount === null) return;
    const now = options.now ?? (() => this.now());
    const sleep =
      options.sleep ?? ((seconds: number) => new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000)));
    const key = this.solutionKey;
    if (this.cascadeKey !== key) {
      this.cascadeKey = key;
      this.cascadeShown = 0;
      this.cascadeDone = false;
    }
    const steps = this.stepCount;
    const schedule = SolutionReveal.schedule(
      Array.from({ length: steps }, (_, step) => Array.from(this.stepText(step) ?? "").length),
      Array.from({ length: steps }, (_, step) => this.verifiedQuotes(step).length),
      options.reduceMotion,
    );
    let start = now() - schedule.resumeElapsed(this.cascadeShown);
    while (!options.signal?.aborted && this.cascadeKey === key && !this.cascadeDone) {
      let elapsed = now() - start;
      if (this.cascadeShown > schedule.shown(elapsed)) {
        // The voice brought a step in early: the next one gets its whole beat from here.
        elapsed = schedule.resumeElapsed(this.cascadeShown);
        start = now() - elapsed;
      }
      const shown = Math.max(this.cascadeShown, schedule.shown(elapsed));
      if (shown !== this.cascadeShown) {
        this.cascadeShown = shown;
        this.changed();
      }
      const next = schedule.nextEvent(elapsed);
      if (schedule.showsAnswer(elapsed) || next === null) {
        this.cascadeShown = steps;
        this.cascadeDone = true;
        this.changed();
        break;
      }
      await sleep(Math.max(0.02, next - elapsed));
    }
  }

  /** The cascade paused with `shown` steps on screen, no timer running, for tests. */
  beginCascadeForTesting(shown: number): void {
    this.cascadeKey = this.solutionKey;
    this.cascadeShown = shown;
    this.cascadeDone = false;
  }

  /** Every step and the answer at once (Reduce Motion off is not a reason: checks that can't wait). */
  finishCascade(): void {
    this.cascadeKey = this.solutionKey;
    this.cascadeShown = this.stepCount;
    this.cascadeDone = true;
    this.changed();
  }

  /** The voice is saying `sentence`: the step whose data it names is the one explained, and on screen at once. */
  voiceSaid(sentence: string | null): void {
    const part = this.part;
    if (!part) {
      this.spokenStep = null;
      this.changed();
      return;
    }
    const open = StatementQuotes.openStep(
      this.mode === "solution",
      this.mode === "hint",
      this.selectedStep,
      this.revealedSteps,
      this.stepCount,
    );
    this.spokenStep = SolutionReveal.spokenStep(stepQuotes(part), sentence, this.revealingStep ?? open);
    const count = this.cascadingCount;
    if (count !== null && this.cascadeKey === this.solutionKey)
      this.cascadeShown = SolutionReveal.shown(count, this.spokenStep, this.stepCount);
    this.changed();
  }

  /** After a hint the steps come one at a time (←/→). */
  previousStep(): void {
    if ((this.mode !== "hint" && this.mode !== "solution") || this.revealedSteps <= (this.mode === "hint" ? 0 : 1))
      return;
    this.revealedSteps -= 1;
    this.changed();
  }

  nextStep(): void {
    if ((this.mode !== "hint" && this.mode !== "solution") || !this.hasMoreSolution) return;
    this.revealedSteps += 1;
    this.changed();
  }

  /** The stepped solution, stopped on the first card. */
  showFirstStep(): void {
    this.choose("hint");
    if (this.revealedSteps < 1 && this.stepCount > 0) this.nextStep();
  }

  // MARK: Let me try

  /** Names the student can use, taken from the expected answer. */
  get answerNames(): string[] {
    const expression = this.part?.answer.expression;
    const parsed = expression ? tryParseExpression(expression) : null;
    return parsed ? [...variables(parsed)].sort() : [];
  }

  check(attempt: string): void {
    this.lastAttempt = attempt;
    const expression = this.part?.answer.expression;
    const expected = expression ? tryParseExpression(expression) : null;
    if (!expected) return;
    const given = tryParseExpression(attempt);
    if (!given) {
      this.attemptResult = "unreadable";
      this.changed();
      return;
    }
    const matches = QuestionSessionRules.agree(given, expected);
    if (!matches && !this.isConfirmed) {
      // Don't tell a student they're wrong on an unconfirmed answer.
      this.attemptResult = "checking";
      this.changed();
      void this.confirm();
      return;
    }
    this.attemptResult = matches ? "matches" : "differs";
    if (matches && !this.sawSolution) this.solvedAlone = true;
    this.changed();
  }

  // MARK: A similar one

  variant: ProblemVariant | null = null;
  /** The variant's question with its numbers and equation written in. */
  variantText = "";
  variantAnswer: number | null = null;
  /** For a function: a solution checked against the variant's equation. */
  variantExample: string | null = null;
  variantState: "loading" | "ready" | "failed" | null = null;
  variantResult: AttemptResult | null = null;
  showsVariantAnswer = false;
  showsVariantHint = false;
  solvedVariant = false;
  private earlierVariants: string[] = [];
  private modeBeforeVariant: Mode | null = null;
  private variantController: AbortController | null = null;

  /** A variant needs a formula: evaluated with new numbers. */
  get canPractiseVariant(): boolean {
    const expression = this.part?.answer.expression;
    return expression ? tryParseExpression(expression) !== null : false;
  }

  backToOriginal(): void {
    this.variantController?.abort();
    this.mode = this.modeBeforeVariant;
    this.changed();
  }

  async tryVariant(): Promise<void> {
    const part = this.part;
    const expression = part?.answer.expression;
    const formula = expression ? tryParseExpression(expression) : null;
    if (!part || !expression || !formula) return;
    if (this.mode !== "variant") this.modeBeforeVariant = this.mode;
    this.mode = "variant";
    this.variant = null;
    this.variantAnswer = null;
    this.variantExample = null;
    this.variantResult = null;
    this.showsVariantAnswer = false;
    this.showsVariantHint = false;
    this.variantState = "loading";
    this.variantController?.abort();
    const controller = new AbortController();
    this.variantController = controller;
    this.changed();
    // A variant the app can't check is asked for again, then given up.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (controller.signal.aborted) return;
      let variant: ProblemVariant;
      try {
        variant = await this.services.provider.variant({
          groupText: this.requestText,
          label: this.question.label,
          asks: part.asks,
          formula: expression,
          avoiding: this.earlierVariants,
        });
      } catch {
        continue;
      }
      if (controller.signal.aborted) return;
      // The numbers and equation shown must be the ones checked against.
      const text = Variant.text(variant, formula);
      if (text === null) continue;
      if (variant.kind === "number") {
        const answer = Variant.answer(variant, formula);
        if (answer === null) continue;
        this.variantAnswer = answer;
      } else {
        // Answers are checked against its own equation, so that must read.
        if (Variant.solves(variant, tryParseExpression(variant.variable ?? "t")!) === null) continue;
        const example = variant.example ? tryParseExpression(variant.example) : null;
        if (example && Variant.solves(variant, example) === true) this.variantExample = variant.example;
      }
      this.variant = variant;
      this.variantText = text;
      this.earlierVariants.push(text);
      this.variantState = "ready";
      this.changed();
      return;
    }
    if (!controller.signal.aborted) {
      this.variantState = "failed";
      this.changed();
    }
  }

  checkVariant(typed: string): void {
    const variant = this.variant;
    if (!variant) return;
    if (variant.kind === "number") {
      if (this.variantAnswer === null) return;
      const value = typedNumber(typed);
      this.variantResult =
        value === null ? "unreadable" : Variant.agrees(value, this.variantAnswer) ? "matches" : "differs";
    } else {
      const candidate = typedFunction(typed);
      const solves = candidate ? Variant.solves(variant, candidate) : null;
      this.variantResult = solves === null ? "unreadable" : solves ? "matches" : "differs";
    }
    if (this.variantResult === "matches" && !this.showsVariantAnswer) this.solvedVariant = true;
    this.changed();
  }

  revealVariantAnswer(): void {
    this.showsVariantAnswer = true;
    this.changed();
  }

  revealVariantHint(): void {
    this.showsVariantHint = true;
    this.changed();
  }

  // MARK: Asking about the exercise

  get followUps(): string[] {
    return this.part?.followUps ?? [];
  }

  startAsking(): void {
    this.mode = "followUp";
    this.solveOnFirstChoice();
    this.askFocusID += 1;
    this.changed();
  }

  /** Answers a question about the exercise. `context` is built by TextHelp (`TextHelpContext.followUp`). */
  ask(heading: string, context: string): void {
    const trimmed = heading.trim();
    if (trimmed === "") return;
    this.mode = "followUp";
    this.followUpQuestion = trimmed;
    this.followUpAnswer = null;
    this.isAnsweringFollowUp = true;
    this.followUpID += 1;
    const id = this.followUpID;
    this.changed();
    const help = this.services.help;
    void (async () => {
      let answer: string[] | null;
      try {
        answer = help
          ? await help({ heading: trimmed, passage: this.question.text, context, image: this.images[0] ?? null })
          : null;
      } catch {
        answer = null;
      }
      if (this.followUpID !== id) return;
      this.isAnsweringFollowUp = false;
      // An English catalog key the stage translates when the answer failed.
      this.followUpAnswer = answer ?? ["Couldn’t get an explanation."];
      this.changed();
    })();
  }

  /** How it went, for the memory; null when the student only looked. */
  get reviewGrade(): "easy" | "good" | "hard" | null {
    // Solving a fresh variant shows the method stuck, whatever came before.
    if (this.solvedVariant) return "good";
    if (this.sawSolution) return "hard";
    if (this.solvedAlone) return this.usedHint ? "good" : "easy";
    if (this.usedHint || this.attemptResult === "differs") return "hard";
    return null;
  }
}
