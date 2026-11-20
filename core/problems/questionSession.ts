// Port of LearnLayer/Problems/QuestionSession.swift @ ref 2026-11-04: one exam question being worked on. What
// comes in later phases: the mascot's lesson and the voice (phase 5), drawings, graphs and the timing diagram
// (phase 6), the fast transcription of a picture (phase 4), and "Try a Similar One" (with ProblemVariant).
// Observable by subscription (`subscribe` / `version`), for React's useSyncExternalStore.

import { isBlocked, isSignedOut, isTransient } from "../ai/modelClient";
import { AISettings, ModelRouting, type RoutingConfig, type SolverRoute } from "../ai/modelRouting";
import { PartialJSON, streamedPart, type StreamedPart } from "../ai/partialJSON";
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
import type { FastTranscriptionReader } from "./fastTranscription";
import type { ExamQuestion } from "./questionDetector";
import { decodeBlocks, Transcriptions, type QuestionTranscription } from "./questionTranscription";
import { keepingSpelling } from "./printedSpelling";
import { SolutionLanguageCheck, tutorLanguageOf } from "./solutionLanguageCheck";
import { QuestionText } from "./textChecks";
import { RouteDecision, type RouteOutcome } from "./routeDecision";
import { realigned, signTableProblems } from "./signTable";
import { noteStage, solveClock, SolutionReveal, SolveKind, SolveProgress, type SolveClock } from "./solutionReveal";
import type { SolutionProvider } from "./solutionProvider";
import { typedFunction, typedNumber, Variant, type ProblemVariant } from "./problemVariant";
import { StatementQuotes, stepMarks, stepQuotes } from "./statementQuotes";
import { CircuitCheck, circuitOf, CircuitSpecs } from "../illustrations/circuit";
import type { PremadeFigure } from "../illustrations/premadeFigure";
import { checkableSolid, SolidCheck, solidOf } from "../illustrations/solid";
import { ComplexFigures, decodeComplexFigure } from "../illustrations/complexFigure";
import {
  figureTopicOf,
  shouldDraw,
  topicText,
  wants3D,
  examPrintsCurve,
  type FigureTopic,
} from "../illustrations/figureTopic";
import { FunctionGraph } from "../illustrations/functionGraph";
import { decodeGraph, FunctionPlot, Graphs, type Graph } from "../illustrations/graph";
import { VisualAids, type VisualAid } from "./visualAid";
import { MascotGuide } from "../voice/mascotGuide";
import { GraphRelevance } from "../illustrations/graphRelevance";
import { CompiledIllustration, gatedBySteps, type Illustration } from "../illustrations/illustration";
import { continuityIllustration, decodeTemplate } from "../illustrations/illustrationTemplate";
import { subjectAllowsDrawing } from "./problemSolution";
import type { SignTable } from "./signTable";
import { decodeSpaceFigure, SpaceFigures, type SpaceFigure } from "../illustrations/spaceFigure";
import { decodeTimingAnswer, simulateTiming, TimingDiagrams, type TimingDiagram } from "../timing/timing";

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
  /** The fast reading of the question's picture, raced with the solve (FastTranscription). */
  fast?: FastTranscriptionReader;
  /** The picture is one the app shows typeset, so it is to be transcribed (`QuestionTranscription.isRequested`). */
  transcribing?(images: readonly Uint8Array[]): Promise<boolean>;
  /** The drawing of a part (IllustrationProvider), asked for on "Draw It" or beside the solution's steps. */
  illustrate?(request: {
    groupText: string;
    part: Part;
    figure: string | null;
    images: readonly Uint8Array[];
    topicText: string;
    signal: AbortSignal;
  }): Promise<Illustration>;
  /** The language the app writes into a drawing ("Portuguese (Portugal)"). */
  language?(): string;
  /** Haiku's call: would a graph or a diagram make this clearer (VisualAidProvider)? */
  visualAid?(request: { groupText: string; subject: string; part: Part; signal: AbortSignal }): Promise<VisualAid>;
}

/** What goes beside the steps: the sign table (every sign checked), or a drawing. */
export type SolutionFigure =
  | { kind: "table"; table: SignTable }
  | { kind: "drawing"; scene: Illustration }
  | { kind: "space"; figure: SpaceFigure };
/** What the figure box beside the steps can show (`QuestionSession.FigureTab`). */
export type FigureTab = "figure" | "graph";

/** A drawing that is one of the app's own solids or circuits (`Figure3DSpec(premade:)`), not a flat sketch. */
export function isFigure3D(illustration: Illustration): boolean {
  return circuitOf(illustration) !== null || solidOf(illustration) !== null;
}
export type IllustrationState = "loading" | "ready" | "empty" | "failed";

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
  /** A printed timing diagram this question asks to fill in, if any. */
  timing?: TimingDiagram | null;
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
  /** A printed timing diagram this question asks to fill in, if any. */
  readonly timing: TimingDiagram | null;
  /** The levels drawn on the diagram: the circuit's simulation, else the model's own. */
  timingLevels: Record<string, number[]> | null = null;
  showsTiming = false;
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
  /** The transcription's text, once the app shows the question typeset from it. */
  shownStatement: string | null = null;
  /** What the fast reading must pass to be shown at once (the app sets the check against its own numbers); one that
   * fails is asked for once more, then waits for the solve's transcription instead. Says which test fails. */
  rejectsFastTranscription: (found: QuestionTranscription) => string | null = (found) =>
    Transcriptions.isUsable(found) ? null : "isUsable";
  /** The part clicked ("ii"), when the picture is of one: a reading of another part is set aside. */
  fastTranscriptionPart: string | null = null;
  /** Called when the fast reading failed or was set aside: the app shows the crop rather than wait on. */
  onFastTranscriptionMissed: (() => void) | null = null;
  private transcriptionSettled = false;
  /** A transcription that came before anyone was listening (undefined: none), handed over when someone is. */
  private pendingTranscription: QuestionTranscription | null | undefined = undefined;
  private transcriptionListener: ((found: QuestionTranscription | null) => void) | null = null;
  private fastController: AbortController | null = null;
  followUpQuestion: string | null = null;
  followUpAnswer: string[] | null = null;
  isAnsweringFollowUp = false;
  /** Bumped to put the cursor in the "Ask about this exercise" field. */
  askFocusID = 0;
  /** Bumped for every change, for `useSyncExternalStore`. */
  version = 0;
  /** The solution's curve is on screen beside the steps ("Hide Graph"). */
  showsGraph = false;
  /** The draggable parameter of the solution's curve. */
  parameterValue = 0;
  /** Where the student dragged the end of the shaded area. */
  areaEnd: number | null = null;
  /** Bumped when the student lets go of the graph: the car runs again. */
  runID = 0;
  illustration: Illustration | null = null;
  illustrationState: IllustrationState | null = null;
  showsIllustration = false;
  /** The student hid the drawing beside the steps with "Hide Drawing". */
  hidesDrawing = false;
  /** The figure box's tab the student (or "Draw It" / "Show the graph") picked last. */
  private chosenFigureTab: FigureTab | null = null;
  private illustrationController: AbortController | null = null;
  /** Haiku's call on whether a graph or a diagram would make this clearer; null until asked. */
  visualAid: VisualAid | null = null;
  private visualController: AbortController | null = null;
  private visualForAnswer: string | null | undefined = undefined;
  private illustrationGeneration = 0;
  private readonly figureCache = new Map<string, unknown>();

  private solvesClickedPartOnly = false;
  private hasStartedSolve = false;
  private defersConfirmation = false;
  /** The shown answer mixes languages (`SolutionLanguageCheck`). */
  private languageMismatch = false;
  private hasStartedStreaming = false;
  private lastParse = -Infinity;
  private controller: AbortController | null = null;
  private stopSlowStart: (() => void) | null = null;
  private lastAttempt = "";
  private followUpID = 0;
  private cascadeKey: string | null = null;
  /** The step the mascot is on while it walks the steps after a click on it (`MascotGuide`); null at rest. */
  guideStep: number | null = null;
  private guideController: AbortController | null = null;
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
    this.timing = init.timing ?? null;
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
    if (this.timing || this.isPicture) return true;
    return QuestionSessionRules.mentionsPrintedFigure(this.question.groupText);
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
    if (this.timing) text += `\n\nFor ${this.question.label}: ` + TimingDiagrams.description(this.timing);
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
    else if (saved === null) await this.startFastTranscription();
  }

  // MARK: The question read from its picture

  /**
   * The stage's side of the hand-over (`AnywhereController.awaitTranscription`): the check a reading must pass, who
   * hears that the fast reading missed, and who gets the reading. Returns the way to stop listening.
   */
  awaitTranscription(options: {
    rejects: (found: QuestionTranscription) => string | null;
    missed: () => void;
    settled: (found: QuestionTranscription | null) => void;
  }): () => void {
    this.rejectsFastTranscription = options.rejects;
    this.onFastTranscriptionMissed = options.missed;
    this.onTranscription = options.settled;
    return () => {
      if (this.transcriptionListener === options.settled) this.transcriptionListener = null;
      if (this.onFastTranscriptionMissed === options.missed) this.onFastTranscriptionMissed = null;
    };
  }

  /** The question is shown typeset from `text`: the quotes are checked against it. */
  showStatement(text: string | null): void {
    this.shownStatement = text;
  }

  /** Called once with the question as a model read it from the picture (null when none did): the fast reading, or
   * the solve's from the stream as soon as that field is complete, else from the solution. */
  get onTranscription(): ((found: QuestionTranscription | null) => void) | null {
    return this.transcriptionListener;
  }

  set onTranscription(listener: ((found: QuestionTranscription | null) => void) | null) {
    this.transcriptionListener = listener;
    if (listener && this.pendingTranscription !== undefined) this.settleTranscription(this.pendingTranscription);
  }

  private settleTranscription(raw: QuestionTranscription | null): void {
    if (this.transcriptionSettled) return;
    // The page's own spelling: a reading that writes «polinômio» for the printed «polinómio» is put right. A solve's
    // own transcription (or one streamed) is not checked by the fast reading: its lookalike label («1)» for part l)
    // is put right here too.
    const part = this.fastTranscriptionPart;
    const found = raw && Transcriptions.withLookalikeLabel(keepingSpelling(raw, this.question.groupText), part);
    const listener = this.transcriptionListener;
    if (!listener) {
      if (this.pendingTranscription === undefined) this.pendingTranscription = found;
      return;
    }
    this.transcriptionSettled = true;
    this.pendingTranscription = undefined;
    listener(found);
  }

  private transcribes: boolean | null = null;

  private async isTranscribing(): Promise<boolean> {
    this.transcribes ??= (await this.services.transcribing?.(this.images)) ?? false;
    return this.transcribes;
  }

  /** The question read by the fast model, in parallel with the solve: shown as soon as it arrives, unless the
   * solve's own transcription already was, or it fails the check. */
  private async startFastTranscription(): Promise<void> {
    this.fastController?.abort();
    const fast = this.services.fast;
    if (this.transcriptionSettled || !fast?.isAvailable || !(await this.isTranscribing())) return;
    // A saved solve already has the question in it: nothing to race.
    const provider = this.services.provider;
    const saved = await provider.savedRoute(this.requestText, this.figureNote, this.images);
    if (saved !== null) {
      const cached = await provider.cached(this.requestText, this.figureNote, this.images, saved);
      const blocks = decodeBlocks(cached?.question ?? null);
      if (blocks && Transcriptions.isUsable({ blocks })) return;
    }
    const controller = new AbortController();
    this.fastController = controller;
    const part = this.fastTranscriptionPart;
    // The app's check is read when a reading comes: it may be set after the question opened.
    // Every reading is checked and shown with the part's label set right («1)» read for «l)»).
    const relabel = (reading: QuestionTranscription) => Transcriptions.withLookalikeLabel(reading, part);
    const found = await fast.read(this.images, (raw) => {
      const reading = relabel(raw);
      const reason = Transcriptions.rejection(reading, part, null);
      return reason ?? this.rejectsFastTranscription(reading);
    });
    if (controller.signal.aborted) return;
    if (found && this.offerFastTranscription(relabel(found))) return;
    this.onFastTranscriptionMissed?.();
  }

  /** False when the reading is not shown (unusable, or it fails the check); true once a transcription is settled. */
  offerFastTranscription(found: QuestionTranscription): boolean {
    if (this.transcriptionSettled) return true;
    if (!Transcriptions.isUsable(found) || this.rejectsFastTranscription(found) !== null) return false;
    this.settleTranscription(found);
    return true;
  }

  /** The "question" blocks once the reply has moved on to the next field (so they are whole). */
  static streamedQuestion(content: string): QuestionTranscription | null {
    if (!content.includes('"question"') || !content.includes('"subject"')) return null;
    const object = PartialJSON.value(content);
    if (typeof object !== "object" || object === null || Array.isArray(object)) return null;
    const record = object as Record<string, unknown>;
    if (record["subject"] === undefined) return null;
    const blocks = decodeBlocks(record["question"]);
    return blocks ? { blocks } : null;
  }

  private solveOnFirstChoice(): void {
    if (this.hasStartedSolve || this.solution) return;
    void this.load();
  }

  /** A hint needs no verified answer; every other choice does. */
  private confirmIfAnswerWanted(): void {
    if (this.isConfirmed) return;
    // An answer in two languages is on screen from the start (even a hint shows it): replaced at once.
    if (!this.languageMismatch && this.defersConfirmation && (this.mode === null || this.mode === "hint")) return;
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
    void this.startFastTranscription();

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
    if (!this.transcriptionSettled && this.transcribes === true) {
      const found = QuestionSession.streamedQuestion(content);
      if (found) this.settleTranscription(found);
    }
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
    this.stopGuide();
    this.illustrationController?.abort();
    this.visualController?.abort();
    this.controller?.abort();
    this.fastController?.abort();
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
    const blocks = decodeBlocks(solution.question);
    this.settleTranscription(blocks ? { blocks } : null);
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
    // Written partly in another language than the tutor's (titles in Portuguese under English notes): the stronger
    // model writes it again, in one language. Only with the tutor's language known (Settings, `services.language`).
    const tutor = this.services.language?.();
    this.languageMismatch =
      tutor !== undefined &&
      !this.solvedByStrongerModel &&
      SolutionLanguageCheck.mismatch(solution, tutorLanguageOf(tutor));
    if (this.languageMismatch) this.isConfirmed = false;
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
    // A timing diagram is confirmed when the circuit, simulated, gives the model's own levels.
    this.timingLevels = null;
    const answer = this.timing ? decodeTimingAnswer(solution.timing) : null;
    if (this.timing && answer) {
      const simulated = simulateTiming(this.timing, answer);
      const expected: Record<string, number[]> = {};
      for (const signal of answer.signals) if (!(signal.name in expected)) expected[signal.name] = signal.levels;
      this.timingLevels = simulated ?? expected;
      this.isConfirmed =
        simulated !== null &&
        TimingDiagrams.rowsToFill(this.timing).every(
          (row) => JSON.stringify(simulated[row.name]) === JSON.stringify(expected[row.name]),
        );
    }
    this.parameterValue = this.solutionGraph ? (Graphs.draggableParameter(this.solutionGraph)?.value ?? 0) : 0;
    this.figureCache.clear();
    // A drawing of the old answer is drawn again for the new one.
    if (this.illustration || this.illustrationState) {
      this.illustrationController?.abort();
      this.illustration = null;
      this.illustrationState = null;
      if (this.showsIllustration) this.fetchIllustration();
    }
    // A curve the solver returned is part of the answer, shown with it.
    const side = this.sideGraph;
    if (side && Graphs.isDrawable(side)) this.showsGraph = true;
    // A new answer is a new question for Haiku.
    const answerText = this.part?.answer.text ?? null;
    if (answerText !== this.visualForAnswer) {
      this.visualController?.abort();
      this.visualController = null;
      this.visualAid = null;
      this.visualForAnswer = answerText;
    }
    this.solveClock = { ...this.solveClock, ready: true };
    this.state = { kind: "ready" };
    if (this.mode !== null) this.considerVisual();
    // «Resolução» chosen before the solver answered had nothing to draw from: the figure is asked for now.
    this.fetchFigureBesideSteps();
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
      if (this.canDrawTiming) this.showsTiming = true;
      this.fetchFigureBesideSteps();
    }
    if (mode === "hint" || mode === "tryIt" || mode === "solution") this.considerVisual();
    this.changed();
  }

  // MARK: Haiku's visual check

  /** Skipped when a curve or a drawing is already coming. */
  private get needsVisualCheck(): boolean {
    if (this.evidenceAnswer !== null) return false;
    if (this.curveIsDecorative || this.shapeSketch !== null) return false;
    const given = this.solutionGraph;
    if (given && Graphs.isDrawable(given)) return false;
    if (this.functionCurveIsOnStage) return false;
    if (FunctionPlot.graph(this.question.groupText, this.solution?.subject ?? null, this.part) !== null) return false;
    if (examPrintsCurve(this.question.groupText)) return false;
    if (this.canDraw && this.part?.signTable == null && this.part?.continuity == null) return false;
    return this.part !== null;
  }

  private considerVisual(): void {
    const ask = this.services.visualAid;
    const part = this.part;
    const solution = this.solution;
    if (!ask || this.visualAid || this.visualController || !this.needsVisualCheck || !part || !solution) return;
    const controller = new AbortController();
    this.visualController = controller;
    void ask({ groupText: this.question.groupText, subject: solution.subject, part, signal: controller.signal })
      .then((aid) => {
        if (controller.signal.aborted) return;
        this.visualAid = aid;
        if (aid.kind === "diagram" && this.mode === "solution" && this.canDraw) this.fetchIllustration();
        this.changed();
      })
      .catch(() => {});
  }

  // MARK: The figure beside the steps

  /** The text that decides the figure: the item and its group's shared statement. */
  get figureTopicText(): string {
    return topicText(this.question.groupText, this.question.text, this.question.groupLabels);
  }

  /** What the figure is about: the question's words, else the solver's word. */
  get figureTopic(): FigureTopic | null {
    const part = this.part;
    return part ? figureTopicOf(this.question.groupText, part.figureTopic) : null;
  }

  /** "Draw It" when a template topic or the solver asked for a drawing; languages and philosophy stay words. */
  get canDraw(): boolean {
    const solution = this.solution;
    return shouldDraw({
      topic: this.figureTopic,
      modelAsked: solution?.drawing === true,
      questionText: this.question.groupText,
      subjectAllows: solution ? subjectAllowsDrawing(solution.subject) : false,
      diagramAid: false,
    });
  }

  /** The app's own complex figure is ready (a failed check is not one: nothing unchecked is shown). */
  private get builtInFigureReady(): boolean {
    const part = this.part;
    if (!part) return false;
    if (this.figureTopic === "complex") return this.complexDrawing(part) !== null;
    if (this.figureTopic === "space") return this.spaceFigure(part) !== null;
    return false;
  }

  /** The solution's curve, as the solver wrote it. */
  get solutionGraph(): Graph | null {
    return this.solution ? decodeGraph(this.solution.graph) : null;
  }

  private cachedFigure<T>(key: string, make: () => T): T {
    if (this.figureCache.has(key)) return this.figureCache.get(key) as T;
    const value = make();
    this.figureCache.set(key, value);
    return value;
  }

  /**
   * The figure beside the steps, when a template or the solver asked for one (`fetchFigureBesideSteps`). Asked when
   * the solution is opened and again when it arrives: on a first opening the solution is still on its way when
   * «Resolução» is chosen, so there is no part (nor `canDraw`) to ask with yet.
   */
  fetchFigureBesideSteps(): void {
    if (this.mode !== "solution" || !this.wantsFigureBesideSteps) return;
    this.fetchIllustration();
  }

  /**
   * The solution asks for a drawing beside its steps (a 3D solid, a circuit, a sketch). A sign table, the continuity
   * graph, or a complex or space figure that checked out already shows the point; a returned curve covers a function.
   */
  get wantsFigureBesideSteps(): boolean {
    const part = this.part;
    if (!part || this.illustration) return false;
    const topic = this.figureTopic;
    const graph = this.solutionGraph;
    const graphCoversFunction = graph !== null && Graphs.isDrawable(graph) && (topic === null || topic === "function");
    const drawsClosedForm = this.localCurve(part) !== null;
    // A volume of revolution or a circuit still asks: its 3D figure wins over the curve.
    return (
      this.canDraw &&
      part.signTable == null &&
      part.continuity == null &&
      !this.builtInFigureReady &&
      (wants3D(this.figureTopicText) || (!graphCoversFunction && !drawsClosedForm))
    );
  }

  /** The sign table (only when every sign checks out), the continuity graph, or the drawing; null for steps alone. */
  get solutionFigure(): SolutionFigure | null {
    const part = this.part;
    const found = part ? this.figureBesideSteps(part) : null;
    if (!found) return null;
    // "Hide Drawing" hides the drawing beside the steps too (it is the same one).
    if (found.isDrawing && this.hidesDrawing) return null;
    return found.figure;
  }

  /** The drawing is the figure beside the steps (a 3D solid, the solver's sketch): shown there once, never twice. */
  get drawingIsBesideSteps(): boolean {
    const part = this.part;
    return part ? (this.figureBesideSteps(part)?.isDrawing ?? false) : false;
  }

  /** The "Draw It" panel: only for a drawing that is not already the figure beside the steps. */
  get showsIllustrationPanel(): boolean {
    return this.showsIllustration && !this.drawingIsBesideSteps;
  }

  /** Whether the drawing is on screen, wherever it is: what "Draw It" / "Hide Drawing" says. */
  get drawingVisible(): boolean {
    return this.drawingIsBesideSteps ? !this.hidesDrawing : this.showsIllustration;
  }

  private figureBesideSteps(part: Part): { figure: SolutionFigure; isDrawing: boolean } | null {
    // Complex numbers and space geometry use the app's own figure when its numbers check out.
    if (this.figureTopic === "complex") {
      const drawing = this.complexDrawing(part);
      if (drawing) return { figure: { kind: "drawing", scene: drawing }, isDrawing: false };
    }
    if (this.figureTopic === "space") {
      const space = this.spaceFigure(part);
      if (space) return { figure: { kind: "space", figure: space }, isDrawing: false };
    }
    if (part.signTable && signTableProblems(part.signTable).length === 0)
      return { figure: { kind: "table", table: part.signTable }, isDrawing: false };
    const continuity = this.continuityDrawing(part);
    if (continuity) return { figure: { kind: "drawing", scene: continuity }, isDrawing: false };
    const illustration = this.illustrationState === "ready" ? this.illustration : null;
    // A 3D solid or circuit replaces the plot of the curve.
    if (illustration && isFigure3D(illustration))
      return { figure: { kind: "drawing", scene: this.gatedDrawing(illustration, part) }, isDrawing: true };
    const local = this.localCurve(part);
    if (local) return { figure: { kind: "drawing", scene: local }, isDrawing: false };
    if (this.canDraw && illustration)
      return { figure: { kind: "drawing", scene: this.gatedDrawing(illustration, part) }, isDrawing: true };
    return null;
  }

  // MARK: The figure box (a 3D solid and the graph, one at a time)

  /** What the figure box beside the steps can show, the figure (a solid) first. */
  get figureTabs(): FigureTab[] {
    const tabs: FigureTab[] = [];
    if (this.solutionFigure !== null || this.expectsFigure) tabs.push("figure");
    if (this.showsGraph && this.sideGraph !== null) tabs.push("graph");
    return tabs;
  }

  /** The tab on show: the one picked while it is there, else the figure. */
  get activeFigureTab(): FigureTab | null {
    const tabs = this.figureTabs;
    if (this.chosenFigureTab !== null && tabs.includes(this.chosenFigureTab)) return this.chosenFigureTab;
    return tabs[0] ?? null;
  }

  selectFigureTab(tab: FigureTab): void {
    this.chosenFigureTab = tab;
    this.changed();
  }

  /** The figure beside the steps is a 3D one (a solid, a circuit, a space figure), or is being drawn as one. */
  get figureIs3D(): boolean {
    const figure = this.solutionFigure;
    if (figure === null)
      return this.canDraw && this.illustrationState === "loading" && wants3D(this.question.groupText);
    if (figure.kind === "drawing") return isFigure3D(figure.scene);
    return figure.kind === "space";
  }

  /** The figure and the graph share one box of a fixed size: always for a 3D figure, and whenever there are both. */
  get figureIsBoxed(): boolean {
    const tabs = this.figureTabs;
    return tabs.length > 1 || (tabs.includes("figure") && this.figureIs3D);
  }

  /** A figure is coming (the drawing is on its way), or a passage with its quotes: the layout keeps its column. */
  get expectsFigure(): boolean {
    if (this.state.kind === "loading") return this.mode === "solution" && this.expectsTextAnswer;
    return (
      this.evidenceAnswer !== null ||
      this.solutionFigure !== null ||
      (this.canDraw && (this.illustrationState === "loading" || this.illustrationState === "failed"))
    );
  }

  /** g drawn from its closed form, with no model call. */
  private localCurve(part: Part): Illustration | null {
    return this.cachedFigure(`local\n${part.label}\n${part.answer.text}`, () =>
      this.curveIsDecorative
        ? null
        : FunctionGraph.illustration(this.question.groupText, part, this.solutionGraph, this.drawingLanguage),
    );
  }

  private gatedDrawing(drawing: Illustration, part: Part): Illustration {
    return this.cachedFigure(`gated\n${part.label}\n${this.illustrationGeneration}`, () =>
      gatedBySteps(drawing, part.cards ?? []),
    );
  }

  private complexDrawing(part: Part): Illustration | null {
    return this.cachedFigure(`complex\n${part.label}`, () => {
      const figure = decodeComplexFigure(part.complex);
      return figure
        ? ComplexFigures.illustration(figure, part.cards ?? [], part.topic ?? part.asks, this.drawingLanguage)
        : null;
    });
  }

  /** The Oxyz figure that checks out, with the edges the statement names. */
  private spaceFigure(part: Part): SpaceFigure | null {
    return this.cachedFigure(
      `space
${part.label}`,
      () => {
        const decoded = decodeSpaceFigure(part.space);
        const valid = decoded ? SpaceFigures.validated(decoded) : null;
        return valid ? SpaceFigures.inferringEdges(valid, this.question.groupText) : null;
      },
    );
  }

  private continuityDrawing(part: Part): Illustration | null {
    const continuity = part.continuity;
    if (!continuity) return null;
    return this.cachedFigure(`continuity\n${part.label}`, () => {
      const scene = continuityIllustration(continuity, part.topic ?? part.asks, this.drawingLanguage);
      return scene ? gatedBySteps(scene, part.cards ?? []) : null;
    });
  }

  /** The language the exam's notation follows ("sen" in Portuguese, `ExamNotation`): the tutor's. */
  get notationLanguage(): string {
    return this.drawingLanguage;
  }

  private get drawingLanguage(): string {
    return this.services.language?.() ?? "Portuguese (Portugal)";
  }

  /** The text of this item and part, for deciding whether a curve explains it. */
  private get partText(): string {
    return GraphRelevance.text(this.question.text, this.part);
  }

  private get curveIsDecorative(): boolean {
    return this.part !== null && GraphRelevance.isDecorative(this.partText);
  }

  /** A derivative's sign or a limit with no formula to plot: the app sketches the shape. */
  private get shapeSketch(): Graph | null {
    if (!this.part || !FunctionGraph.accepts(this.solution?.subject) || examPrintsCurve(this.question.groupText))
      return null;
    return GraphRelevance.sketch(this.partText);
  }

  /** The curve already beside the steps (the branches, or a function drawing). */
  private get functionCurveIsOnStage(): boolean {
    const figure = this.solutionFigure;
    if (figure?.kind !== "drawing") return false;
    return this.part?.continuity != null || decodeTemplate(figure.scene.template)?.kind === "function";
  }

  /** The solution's curve, else a maths function plotted from the question; null when a sign table is the figure. */
  get graph(): Graph | null {
    if (this.solutionFigure?.kind === "table") return null;
    if (this.curveIsDecorative) return null;
    const falls = GraphRelevance.statedFall(this.partText);
    const agrees = (graph: Graph) => (falls === null ? true : GraphRelevance.agrees(graph, falls));
    const subject = this.solution?.subject ?? null;
    const given = this.solutionGraph;
    const fitted = FunctionPlot.graph(this.question.groupText, subject, this.part, given);
    const local = fitted ? Graphs.fittedToMarks(fitted) : null;
    if (local && local.marks.some((mark) => mark.role === "value" || mark.role === "crossing") && agrees(local))
      return local;
    if (given && Graphs.isDrawable(given) && agrees(Graphs.fittedToMarks(given))) return Graphs.fittedToMarks(given);
    const plain = FunctionPlot.graph(this.question.groupText, subject, this.part);
    if (plain && agrees(plain)) return plain;
    const sketch = this.shapeSketch;
    if (sketch) return sketch;
    // Haiku's curve, when it asked for one the app can plot.
    const plot = this.visualAid ? VisualAids.plot(this.visualAid) : null;
    if (plot && agrees(plot)) return plot;
    return null;
  }

  /** The curve drawn beside the steps; null when that curve is already the figure. */
  get sideGraph(): Graph | null {
    if (this.functionCurveIsOnStage) return null;
    return this.graph;
  }

  get hasGraph(): boolean {
    const side = this.sideGraph;
    return side !== null && Graphs.isDrawable(side);
  }

  /** The step the graph is drawn at: marks from a later step stay hidden. */
  get graphStep(): number {
    return this.figureStep;
  }

  /** The answer to a timing diagram is drawn on the diagram itself. */
  get canDrawTiming(): boolean {
    return this.timing !== null && this.timingLevels !== null;
  }

  toggleTiming(): void {
    this.showsTiming = !this.showsTiming;
    this.changed();
  }

  toggleGraph(): void {
    this.showsGraph = !this.showsGraph;
    if (this.showsGraph) this.chosenFigureTab = "graph";
    else if (this.chosenFigureTab === "graph") this.chosenFigureTab = null;
    this.changed();
  }

  setParameterValue(value: number): void {
    const parameter = this.sideGraph ? Graphs.draggableParameter(this.sideGraph) : null;
    if (!parameter) return;
    this.parameterValue = Math.min(parameter.max, Math.max(parameter.min, value));
    this.changed();
  }

  setAreaEnd(value: number): void {
    this.areaEnd = value;
    this.changed();
  }

  replayCar(): void {
    this.runID += 1;
    this.changed();
  }

  /**
   * Asked for once, on the first "Draw It"; saved after that. One drawing, shown or hidden: the one beside the steps
   * when it is there, else the panel.
   */
  toggleIllustration(): void {
    if (this.drawingVisible) {
      this.showsIllustration = false;
      this.hidesDrawing = true;
      this.changed();
      return;
    }
    this.hidesDrawing = false;
    this.showsIllustration = true;
    this.chosenFigureTab = "figure";
    this.fetchIllustration();
    this.changed();
  }

  /** The drawing, asked for once (Draw It, or by itself beside the solution's steps). */
  fetchIllustration(): void {
    const part = this.part;
    const illustrate = this.services.illustrate;
    if (this.illustration || this.illustrationState === "loading" || !part || !illustrate) return;
    this.illustrationState = "loading";
    this.illustrationGeneration += 1;
    const generation = this.illustrationGeneration;
    const controller = new AbortController();
    this.illustrationController = controller;
    // A drawing given up on never leaves "Drawing…" behind: unless a newer one started, it goes back to not asked.
    const abandon = () => {
      if (generation === this.illustrationGeneration && this.illustrationState === "loading")
        this.illustrationState = null;
    };
    void illustrate({
      groupText: this.question.groupText,
      part,
      figure: this.solution?.figure ?? null,
      images: this.images,
      topicText: this.figureTopicText,
      signal: controller.signal,
    })
      .then((drawn) => {
        if (controller.signal.aborted || generation !== this.illustrationGeneration) return abandon();
        // A circuit is checked against the answer: the resistance between its terminals must be the one the solution
        // gives (or the same in kΩ), else it is not shown.
        const premade = drawn.premade as PremadeFigure | null | undefined;
        // A solid whose volume is not the answer's is not shown.
        const solid = checkableSolid(premade);
        if (solid && SolidCheck.agrees(solid, part.answer.text) === false) {
          this.illustrationState = "failed";
          return;
        }
        if (premade && CircuitSpecs.fromPremade(premade)) {
          const checked = CircuitCheck.reconcile(premade, part.answer.text);
          if (!checked) {
            this.illustrationState = "failed";
            return;
          }
          drawn = { ...drawn, premade: checked };
        }
        this.illustration = drawn;
        // Not drawable as asked (free-form refused, a template that doesn't compile): say so.
        this.illustrationState =
          circuitOf(drawn) || solidOf(drawn)
            ? "ready"
            : drawn.elements.length === 0 || !new CompiledIllustration(drawn).isDrawable
              ? drawn.rejected === true
                ? "failed"
                : "empty"
              : "ready";
        this.drawingChecked(drawn);
      })
      .catch(() => {
        if (controller.signal.aborted) abandon();
        else if (generation === this.illustrationGeneration) this.illustrationState = "failed";
      })
      .finally(() => this.changed());
    this.changed();
  }

  /** "Try Again" on a drawing that failed: asked once more (a failure is not saved). */
  retryIllustration(): void {
    if (this.illustrationState !== "failed") return;
    this.illustrationState = null;
    this.fetchIllustration();
  }

  /** The drawing put a mark the solution names somewhere else than the curve does: the stronger model solves again. */
  private resolvedAfterDrawing = false;

  private drawingChecked(drawn: Illustration): void {
    if (
      (drawn.disagreements ?? []).length === 0 ||
      !(this.route === "fast" || !this.firstModelIsStrong) ||
      this.solvedByStrongerModel ||
      this.resolvedAfterDrawing
    )
      return;
    this.resolvedAfterDrawing = true;
    this.isConfirmed = false;
    void this.confirm();
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
    // The student picked a step themselves: the mascot's tour gives way.
    this.stopGuide();
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
    // The mascot's step is underlined the moment it gets there, in step with it.
    const explained = this.mascotFocusStep ?? spoken;
    return StatementQuotes.shownStep(explained ?? this.revealingStep ?? open, this.hoveredStep);
  }

  /** The step the figure is drawn at. */
  get figureStep(): number {
    // The mascot on a step of the whole solution: the figure is drawn up to that step.
    const guided = this.mascotFocusStep;
    if (this.mode === "solution" && guided !== null) return guided + 1;
    const cascading = this.cascadingCount;
    if (cascading !== null) return cascading;
    if (this.mode === "solution") return this.selectedStep === null ? Number.MAX_SAFE_INTEGER : this.selectedStep + 1;
    return this.revealedSteps;
  }

  /** The figure shows the answer: in the solution unless a step is picked. */
  get figureRevealed(): boolean {
    if (this.mode === "solution" && this.mascotFocusStep !== null) return false;
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

  // MARK: The mascot walking the steps (MascotGuide)

  /** The mascot is walking the steps. */
  get isGuiding(): boolean {
    return this.guideStep !== null;
  }

  /** The step the mascot explains: only after a click on it, in the hint or the solution. */
  get mascotFocusStep(): number | null {
    const step = this.guideStep;
    if ((this.mode !== "hint" && this.mode !== "solution") || step === null || step < 0 || step >= this.stepCount)
      return null;
    return step;
  }

  /** The steps a click on the mascot explains. */
  get guideSteps(): number[] {
    if (!this.part) return [];
    return MascotGuide.steps(
      this.mode === "solution",
      this.mode === "hint",
      this.selectedStep,
      this.revealedSteps,
      this.stepCount,
    );
  }

  /**
   * The student clicked the mascot. With steps on the stage it explains them one at a time, then rests; a click while
   * it explains stops it. Returns false when there is nothing here to explain, so the click goes to the voice tutor.
   * `narrate` says one step and returns once it is said.
   */
  mascotClicked(reduceMotion: boolean, narrate?: (step: number, signal: AbortSignal) => Promise<void>): boolean {
    if (this.guideStep !== null) {
      this.stopGuide();
      return true;
    }
    const steps = this.guideSteps;
    if (steps.length === 0) return false;
    this.guideController?.abort();
    const controller = new AbortController();
    this.guideController = controller;
    const beats = steps.map((step) =>
      MascotGuide.beat(
        Array.from((this.hasSpokenExplanation(step) ? this.spokenStepText(step) : this.stepText(step)) ?? "").length,
        this.verifiedQuotes(step).length,
        reduceMotion,
      ),
    );
    this.guide(steps[0]!);
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        controller.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    void (async () => {
      for (const [offset, step] of steps.entries()) {
        if (offset > 0) this.guide(step);
        // The step is said while the body is on it and its data is underlined; its beat is the least time it stays.
        const started = Date.now();
        if (narrate) await narrate(step, controller.signal);
        if (controller.signal.aborted) return;
        const left = beats[offset]! * 1000 - (Date.now() - started);
        if (left > 0) await wait(left);
        if (controller.signal.aborted) return;
      }
      if (this.guideController === controller) {
        this.guideController = null;
        this.guideStep = null;
        this.changed();
      }
    })();
    return true;
  }

  /** The mascot and the figure go to one step while the voice expands it ("explica o ponto 2"). */
  focusStepForVoice(step: number): void {
    this.guideController?.abort();
    this.guideController = null;
    this.guide(step);
  }

  /** The mascot goes back to rest. */
  stopGuide(): void {
    this.guideController?.abort();
    this.guideController = null;
    if (this.guideStep === null) return;
    this.guideStep = null;
    this.changed();
  }

  /** The mascot on `step`: a step still to come in is brought on screen first. */
  private guide(step: number): void {
    if (this.cascadingCount !== null) {
      if (this.cascadeKey !== this.solutionKey) {
        this.cascadeKey = this.solutionKey;
        this.cascadeShown = 0;
        this.cascadeDone = false;
      }
      this.cascadeShown = Math.max(this.cascadeShown, Math.min(this.stepCount, step + 1));
    }
    this.guideStep = step;
    this.changed();
  }

  /**
   * What the stage already shows in words and formulas: the statement, the steps on screen and the answer. The tutor
   * marks these where they are and writes only what none of them holds (`VoiceFormula.formulas`).
   */
  get onScreenText(): string[] {
    const texts = [this.question.text, this.question.groupText];
    const shown =
      this.mode === "solution"
        ? this.visibleSolutionSteps
        : this.mode === "hint"
          ? Math.min(this.revealedSteps, this.stepCount)
          : 0;
    for (let step = 0; step < shown; step++) texts.push(this.stepText(step) ?? "");
    const part = this.part;
    if (this.mode === "solution" && part) {
      texts.push(part.answer.text);
      if (part.answerLatex) texts.push(latexToUnicode(part.answerLatex));
    }
    return texts.filter((text) => text !== "");
  }

  /** What the mascot says for a step: its title and why, in words (a formula alone when that is all the step has). */
  spokenStepText(step: number): string | null {
    const part = this.part;
    if (!part) return null;
    if (part.cards && part.cards.length > 0) {
      const card = part.cards[step];
      if (!card) return null;
      // The model's own spoken explanation: the idea, not the written text read back.
      const said = card.say?.trim();
      if (said) return said;
      const words = [card.title, card.note ?? ""]
        .map((text) => text.trim())
        .filter((text) => text !== "")
        .map((text) => (text.endsWith(".") || text.endsWith(":") ? text : text + "."))
        .join(" ");
      return words === "" ? latexToUnicode(card.latex) : words;
    }
    return part.steps[step] ?? null;
  }

  /** The model wrote what to say for this step (`Card.say`). */
  hasSpokenExplanation(step: number): boolean {
    return (this.part?.cards?.[step]?.say?.trim() ?? "") !== "";
  }

  /** What the mascot says for a step: a cue to what to look at, then the step itself. */
  narratedStep(step: number, pointer: boolean, hasFigure: boolean, english = false): string | null {
    const text = this.spokenStepText(step);
    if (text === null) return null;
    // An explanation already says what to look at; the cue is for steps read from the card.
    if (this.hasSpokenExplanation(step)) return text;
    return MascotGuide.narration(
      text,
      this.verifiedQuotes(step).map((quote) => quote.quote),
      hasFigure,
      pointer,
      english,
    );
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
  /** The stage check: a written-out solution shown as if it came from the solver (the Mac's `debugShow`). */
  showForTesting(solution: ProblemSolution): void {
    this.show(solution);
  }

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

  /**
   * Answers a question about the exercise. `context` is built by TextHelp (`TextHelpContext.followUp`); `passage`
   * is what it is about (the question, or a selection the student asked about).
   */
  ask(heading: string, context: string, passage: string = this.question.text): void {
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
        answer = help ? await help({ heading: trimmed, passage, context, image: this.images[0] ?? null }) : null;
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
