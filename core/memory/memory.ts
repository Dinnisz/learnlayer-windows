// Port of LearnLayer/Memory/ConceptBelief.swift, ObservedPreferences.swift, PedagogicalFloor.swift,
// ExplanationPlanner.swift and MemoryStore.swift @ ref 2026-11-04
//
// On-device memory: questions, explanations, concepts and the links between them. The map reads it; the planner
// reads it. Nothing here is a review queue. `memory.json` keeps the Mac's field names (dates as seconds since 2001,
// as Swift's JSONEncoder writes them), so the nodes and edges sync as they are.

import { swiftText } from "../prompts/swiftText";
import { BrainMerge } from "./brainSync";

// MARK: Beliefs

export type BeliefEvent =
  | "similarCorrect"
  | "similarWrong"
  | "guidedCorrect"
  | "reask"
  | "replay"
  | "explainBetter"
  | "harderQuiet"
  | "fastSteps";

const beliefDelta: Record<BeliefEvent, [number, number]> = {
  similarCorrect: [1, 0],
  similarWrong: [0, 1],
  guidedCorrect: [0.8, 0],
  reask: [0, 0.5],
  replay: [0, 0.3],
  explainBetter: [0, 0.5],
  harderQuiet: [0.2, 0],
  fastSteps: [0.05, 0],
};
const confirmsSuccess = (event: BeliefEvent) => event === "similarCorrect" || event === "guidedCorrect";

export type BeliefState = "new" | "learning" | "fluent" | "rusty";

/** Beta(α, β) of "can do it without help" for one concept, plus when the last evidence arrived. Never drawn. */
export interface ConceptBelief {
  conceptID: string;
  alpha: number;
  beta: number;
  /** Unix seconds of the last evidence. */
  lastEvidence: number;
  confirmedSuccesses: number;
  reachedFluent: boolean;
}

export const Beliefs = {
  priorAlpha: 1,
  priorBeta: 1,
  baseHalfLifeDays: 45,

  make(conceptID: string, lastEvidence = 0): ConceptBelief {
    return { conceptID, alpha: 1, beta: 1, lastEvidence, confirmedSuccesses: 0, reachedFluent: false };
  },
  probability(b: ConceptBelief): number {
    const total = b.alpha + b.beta;
    return total > 0 ? b.alpha / total : 0.5;
  },
  uncertainty(b: ConceptBelief): number {
    const total = b.alpha + b.beta;
    return total > 0 ? (b.alpha * b.beta) / (total * total * (total + 1)) : 1;
  },
  hasEvidence: (b: ConceptBelief) => b.alpha + b.beta > Beliefs.priorAlpha + Beliefs.priorBeta + 0.05,
  state(b: ConceptBelief): BeliefState {
    if (!Beliefs.hasEvidence(b)) return "new";
    const p = Beliefs.probability(b);
    if (b.reachedFluent && p <= 0.75) return "rusty";
    if (p < 0.35) return "new";
    if (p > 0.75 && Beliefs.uncertainty(b) < 0.05) return "fluent";
    return "learning";
  },
  halfLifeDays: (b: ConceptBelief) => Beliefs.baseHalfLifeDays * (1 + b.confirmedSuccesses),
  /** Pulls α and β toward the prior; never moves `lastEvidence`. */
  decay(b: ConceptBelief, days: number): void {
    if (!(days > 0)) return;
    const factor = 0.5 ** (days / Beliefs.halfLifeDays(b));
    b.alpha = Beliefs.priorAlpha + (b.alpha - Beliefs.priorAlpha) * factor;
    b.beta = Beliefs.priorBeta + (b.beta - Beliefs.priorBeta) * factor;
  },
  /** Successes weigh more as difficulty rises; misses weigh more as it falls. */
  scale(difficulty: number, success: boolean): number {
    const d = Math.min(5, Math.max(1, difficulty));
    return success ? 0.7 + 0.15 * d : 1.45 - 0.15 * d;
  },
  apply(b: ConceptBelief, event: BeliefEvent, difficulty = 3): void {
    const [da, db] = beliefDelta[event];
    b.alpha += da * Beliefs.scale(difficulty, da > 0 && db === 0);
    b.beta += db * (da === 0 && db > 0 ? Beliefs.scale(difficulty, false) : 1);
    if (confirmsSuccess(event)) b.confirmedSuccesses += 1;
    if (Beliefs.state(b) === "fluent") b.reachedFluent = true;
  },
};

// MARK: Habits noticed

export type PreferenceDimension = "analogy" | "visual" | "algebra" | "voice" | "help";
export const preferenceDimensions: PreferenceDimension[] = ["analogy", "visual", "algebra", "voice", "help"];
export type StepFocus = "analogy" | "visual" | "algebra" | "rule" | "numeric" | "result";
export type Emphasis = "less" | "default" | "more";
export type MascotAsk = "example" | "analogy" | "showGraph" | "stepByStep" | "why";

export type PreferenceSignal =
  | { kind: "mascot"; ask: MascotAsk }
  | { kind: "explainBetter"; focus: StepFocus | null }
  | { kind: "hint" | "replay" | "expand" | "neverExpand" | "interruptVoice"; focus: StepFocus }
  | { kind: "dragGraph" }
  | { kind: "showSolution" };

export interface StoredSignal {
  dimension: PreferenceDimension;
  /** "user" or "area|state|kind". */
  context: string;
  direction: number;
  weight: number;
  /** Seconds since 2001-01-01 (Swift's Date). */
  at: number;
}

export interface StoredOutcome {
  dimension: PreferenceDimension;
  emphasis: Emphasis;
  correct: boolean;
  at: number;
}

export interface SkillState {
  id: string;
  wrong: number;
  right: number;
}

const skillEmphasis = (skill: SkillState): Emphasis =>
  skill.wrong >= 2 && skill.wrong > skill.right ? "more" : skill.right >= 4 && skill.wrong === 0 ? "less" : "default";

const referenceDate = Date.UTC(2001, 0, 1) / 1000;
/** Unix seconds to Swift's seconds since 2001. */
export const swiftDate = (unix: number) => unix - referenceDate;

export const PreferenceEstimate = {
  minimumEvents: 5,
  kappa: 5,
  kappa2: 3,
  halfLifeDays: 30,
  leave: 0.3,
  back: 0.15,

  aggregate(signals: readonly StoredSignal[], now: number): { mean: number; mass: number } {
    let mass = 0;
    let signed = 0;
    for (const signal of signals) {
      const days = Math.max(0, (now - signal.at) / 86_400);
      const weight = days > 0 ? signal.weight * 0.5 ** (days / PreferenceEstimate.halfLifeDays) : signal.weight;
      mass += weight;
      signed += weight * signal.direction;
    }
    return { mean: mass === 0 ? 0 : signed / (mass + PreferenceEstimate.kappa), mass };
  },

  /** Shrinkage toward 0, then toward the user's own estimate. Fewer than five events stays at 0. `now` in Swift seconds. */
  value(
    signals: readonly StoredSignal[],
    dimension: PreferenceDimension,
    context: string,
    now: number,
  ): { x: number; events: number } {
    const mine = signals.filter((signal) => signal.dimension === dimension);
    if (mine.length < PreferenceEstimate.minimumEvents) return { x: 0, events: mine.length };
    const user = PreferenceEstimate.aggregate(mine, now);
    const local = PreferenceEstimate.aggregate(
      mine.filter((signal) => signal.context === context),
      now,
    );
    const x =
      (local.mass * local.mean + PreferenceEstimate.kappa2 * user.mean) / (local.mass + PreferenceEstimate.kappa2);
    return { x, events: mine.length };
  },

  /** Hysteresis so a noisy signal does not flip the level on every question. */
  level(x: number, previous: Emphasis, events: number, frozen: boolean): Emphasis {
    const { leave, back } = PreferenceEstimate;
    if (frozen || events < PreferenceEstimate.minimumEvents) return "default";
    switch (previous) {
      case "default":
        return x >= leave ? "more" : x <= -leave ? "less" : "default";
      case "more":
        return x < back ? (x <= -leave ? "less" : "default") : "more";
      case "less":
        return x > -back ? (x >= leave ? "more" : "default") : "less";
    }
  },

  shouldFreeze(outcomes: readonly StoredOutcome[], dimension: PreferenceDimension): boolean {
    const more = outcomes.filter((o) => o.dimension === dimension && o.emphasis === "more");
    const base = outcomes.filter((o) => o.dimension === dimension && o.emphasis === "default");
    if (more.length < 4 || base.length === 0) return false;
    const rate = (list: StoredOutcome[]) => list.filter((o) => o.correct).length / list.length;
    return rate(more) <= rate(base);
  },

  dimensionFor(focus: StepFocus): PreferenceDimension | null {
    return focus === "analogy" || focus === "visual" || focus === "algebra" ? focus : null;
  },

  /** Where a signal lands. Algebra is absent on purpose: mistakes own that dimension. */
  attributions(signal: PreferenceSignal): [PreferenceDimension, number, number][] {
    const dimensionOf = (focus: StepFocus | null) => (focus ? PreferenceEstimate.dimensionFor(focus) : null);
    switch (signal.kind) {
      case "mascot":
        return signal.ask === "example" || signal.ask === "analogy"
          ? [["analogy", 1, 1]]
          : signal.ask === "showGraph"
            ? [["visual", 1, 1]]
            : signal.ask === "stepByStep"
              ? [["help", 1, 1]]
              : [["help", 1, 0.4]];
      case "explainBetter": {
        const dimension = dimensionOf(signal.focus);
        return dimension && dimension !== "algebra" ? [[dimension, 1, 0.7]] : [];
      }
      case "hint": {
        const dimension = dimensionOf(signal.focus);
        return dimension && dimension !== "algebra"
          ? [
              [dimension, 1, 0.6],
              ["help", 1, 0.6],
            ]
          : [["help", 1, 0.6]];
      }
      case "replay":
      case "expand":
      case "neverExpand": {
        const dimension = dimensionOf(signal.focus);
        if (!dimension || dimension === "algebra") return [];
        return signal.kind === "replay"
          ? [[dimension, 1, 0.4]]
          : signal.kind === "expand"
            ? [[dimension, 1, 0.3]]
            : [[dimension, -1, 0.1]];
      }
      case "interruptVoice":
        return signal.focus === "analogy"
          ? [
              ["voice", -1, 0.3],
              ["analogy", -1, 0.3],
            ]
          : [["voice", -1, 0.3]];
      case "dragGraph":
        return [["visual", 1, 0.3]];
      case "showSolution":
        return [["help", -1, 0.8]];
    }
  },
};

// MARK: The plan

export type ExplanationKind = "exercise" | "formula" | "text" | "code" | "proof";

export interface ExplanationPlan {
  mode: string;
  depth: number;
  maxSteps: number;
  collapseRoutineSteps: boolean;
  hintFirst: boolean;
  revealFinalResult: string;
  checkQuestion: boolean;
  channel: string;
  voiceBudgetChars: number;
  language: string;
  vocab: string;
  assume: string[];
  anchors: string[];
  standing: string[];
  offerSimilar: boolean;
  emphasisAnalogy: Emphasis;
  emphasisVisual: Emphasis;
  emphasisAlgebra: Emphasis;
  pointer: boolean;
  voiceStyle: string;
  algebraSkills: string[];
}

const jsonList = (values: readonly string[]) => `[${values.map((value) => `"${value.replace(/"/g, "'")}"`).join(",")}]`;

export const Plans = {
  cacheToken(plan: ExplanationPlan): string {
    return [
      plan.mode,
      String(plan.depth),
      String(plan.maxSteps),
      plan.hintFirst ? "h" : "n",
      plan.revealFinalResult,
      plan.channel,
      String(plan.voiceBudgetChars),
      plan.emphasisAnalogy,
      plan.emphasisVisual,
      plan.emphasisAlgebra,
      plan.pointer ? "p" : "q",
      plan.voiceStyle,
      plan.language,
    ].join("|");
  },

  /** The block that replaces "what the student studied recently", word for word. */
  promptBlock(plan: ExplanationPlan): string {
    return swiftText("ExplanationPlanner", "promptBlock#0", {
      mode: plan.mode,
      depth: String(plan.depth),
      maxSteps: String(plan.maxSteps),
      collapseRoutineSteps: String(plan.collapseRoutineSteps),
      hintFirst: String(plan.hintFirst),
      revealFinalResult: plan.revealFinalResult,
      checkQuestion: String(plan.checkQuestion),
      channel: plan.channel,
      voiceBudgetChars: String(plan.voiceBudgetChars),
      language: plan.language,
      vocab: plan.vocab,
      "json(assume)": jsonList(plan.assume),
      "json(anchors)": jsonList(plan.anchors),
      "json(standing)": jsonList(plan.standing),
      offerSimilar: String(plan.offerSimilar),
      "emphasisAnalogy.promptValue": plan.emphasisAnalogy,
      "emphasisVisual.promptValue": plan.emphasisVisual,
      "emphasisAlgebra.promptValue": plan.emphasisAlgebra,
      pointer: String(plan.pointer),
      voiceStyle: plan.voiceStyle,
      "json(algebraSkills)": jsonList(plan.algebraSkills),
    });
  },
};

const fullRevealPhrases = [
  "mostra tudo",
  "mostra-me tudo",
  "mostrame tudo",
  "mostrar tudo",
  "mostra a resolução",
  "mostra a resolucao",
  "resolução completa",
  "resolucao completa",
  "show me everything",
  "show everything",
  "show the full solution",
];
const foldPhrase = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/-/g, " ");

export const PedagogicalFloor = {
  requestsFullReveal(utterance: string, standing: readonly string[] = []): boolean {
    const folded = foldPhrase([utterance, ...standing].join("\n"));
    return fullRevealPhrases.some((phrase) => folded.includes(foldPhrase(phrase)));
  },
};

export interface PlannerInput {
  question: string;
  kind: ExplanationKind;
  state: BeliefState;
  encounter: number;
  examEve: boolean;
  gaming: boolean;
  adaptationsEnabled: boolean;
  studentUsesVoice: boolean;
  language: string;
  vocab: string;
  anchors: string[];
  assume: string[];
  standing: string[];
  utterance: string;
  analogy: Emphasis;
  visual: Emphasis;
  algebra: Emphasis;
  voice: Emphasis;
  help: Emphasis;
  algebraSkills: string[];
}

export function plannerInput(partial: Partial<PlannerInput>): PlannerInput {
  return {
    question: "",
    kind: "exercise",
    state: "new",
    encounter: 1,
    examEve: false,
    gaming: false,
    adaptationsEnabled: true,
    studentUsesVoice: false,
    language: "pt-PT",
    vocab: "secondary",
    anchors: [],
    assume: [],
    standing: [],
    utterance: "",
    analogy: "default",
    visual: "default",
    algebra: "default",
    voice: "default",
    help: "default",
    algebraSkills: [],
    ...partial,
  };
}

/** FNV-1a over the UTF-8 bytes: a stable bucket of the question, 0…99. */
export function stableBucket(text: string): number {
  let hash = 2_166_136_261;
  for (const byte of new TextEncoder().encode(text)) hash = Math.imul(hash ^ byte, 16_777_619) >>> 0;
  return hash % 100;
}

const nudge = (emphasis: Emphasis): Emphasis => (emphasis === "default" ? "more" : "default");

/** The invisible reading of memory. Deterministic: the model receives the plan and fills in steps. */
export const ExplanationPlanner = {
  plan(input: PlannerInput): ExplanationPlan {
    const showAll = PedagogicalFloor.requestsFullReveal(input.utterance, input.standing);
    const emphasis = input.adaptationsEnabled
      ? { analogy: input.analogy, visual: input.visual, algebra: input.algebra, voice: input.voice, help: input.help }
      : {
          analogy: "default" as Emphasis,
          visual: "default" as Emphasis,
          algebra: "default" as Emphasis,
          voice: "default" as Emphasis,
          help: "default" as Emphasis,
        };
    if (input.adaptationsEnabled) {
      // About 12% of questions nudge one dimension, so a habit cannot become a cage.
      const bucket = stableBucket(input.question);
      if (bucket >= 10 && bucket < 22) {
        const which = (["analogy", "visual", "voice", "help"] as const)[bucket % 4]!;
        emphasis[which] = nudge(emphasis[which]);
      }
    }
    const exercise = input.kind === "exercise";
    const fading = input.examEve ? 1 : Math.max(1, input.encounter);
    let mode = "guided";
    let depth = 3;
    let maxSteps = 4;
    let collapse = false;
    let hintFirst = exercise;
    let reveal = exercise ? "on_tap" : "inline";
    let check = false;
    let channel = "text";
    let voiceBudget = 0;
    let offerSimilar: boolean;
    switch (input.state) {
      case "new":
        depth = 4;
        maxSteps = 6;
        collapse = false;
        channel = input.studentUsesVoice && emphasis.voice !== "less" ? "voice" : "text";
        voiceBudget = channel === "voice" ? 700 : 0;
        break;
      case "learning":
        depth = 3;
        maxSteps = fading >= 3 ? 4 : 5;
        collapse = fading >= 2;
        hintFirst = true;
        reveal = "on_tap";
        check = exercise && !input.examEve && !input.gaming;
        channel = emphasis.voice === "more" ? "voice" : "text";
        voiceBudget = channel === "voice" ? 550 : 0;
        break;
      case "fluent":
        mode = "direct";
        depth = 2;
        maxSteps = 3;
        collapse = true;
        hintFirst = false;
        reveal = "on_tap";
        channel = "text";
        voiceBudget = 0;
        break;
      case "rusty":
        depth = 3;
        maxSteps = 5;
        collapse = false;
        hintFirst = true;
        reveal = "on_tap";
        channel = emphasis.voice === "less" ? "text" : input.studentUsesVoice ? "voice" : "text";
        voiceBudget = channel === "voice" ? 550 : 0;
        break;
    }
    if (fading >= 4 && !input.examEve && input.state !== "new") {
      depth = Math.min(depth, 2);
      maxSteps = Math.min(maxSteps, 3);
      collapse = true;
    }
    if (input.examEve && !showAll) {
      depth = Math.min(depth, 2);
      maxSteps = Math.min(maxSteps, 3);
      check = false;
      offerSimilar = false;
      hintFirst = exercise || hintFirst;
      reveal = exercise ? "on_tap" : reveal;
    } else {
      offerSimilar =
        exercise && !input.gaming && input.state !== "new" && input.encounter > 0 && input.encounter % 5 === 0;
    }
    if (input.gaming && !showAll) {
      hintFirst = true;
      reveal = "on_tap";
      collapse = true;
      check = false;
    }
    if (exercise && !showAll) {
      hintFirst = true;
      if (reveal === "inline") reveal = "on_tap";
    }
    if (!exercise && input.state === "fluent") hintFirst = false;
    if (showAll) {
      mode = "direct";
      hintFirst = false;
      reveal = "inline";
      collapse = false;
      check = false;
      maxSteps = Math.max(maxSteps, 6);
    }
    if (emphasis.help === "more" && !showAll) {
      hintFirst = true;
      mode = "guided";
    } else if (emphasis.help === "less" && !exercise) {
      hintFirst = false;
      reveal = "inline";
    }
    // A formula is there to be understood, so it opens straight away.
    if (!exercise && emphasis.help !== "more" && !showAll) {
      mode = "direct";
      hintFirst = false;
      reveal = "inline";
      check = false;
    }
    if (emphasis.voice === "more") {
      channel = "voice";
      voiceBudget = Math.max(voiceBudget, 900);
    } else if (emphasis.voice === "less") {
      channel = "text";
      voiceBudget = 0;
    }
    if (emphasis.algebra === "less") collapse = true;
    if (emphasis.algebra === "more") collapse = false;
    if (input.state === "fluent" && emphasis.algebra !== "more") collapse = true;
    const voiceStyle =
      emphasis.visual === "more"
        ? "pointing"
        : emphasis.analogy === "more"
          ? "analogy-led"
          : emphasis.algebra === "more"
            ? "derivation"
            : input.state === "fluent"
              ? "brief"
              : "derivation";
    voiceBudget = channel !== "voice" ? 0 : Math.min(voiceBudget, 900);
    return {
      mode,
      depth,
      maxSteps,
      collapseRoutineSteps: collapse && !showAll,
      hintFirst,
      revealFinalResult: reveal,
      checkQuestion: check,
      channel,
      voiceBudgetChars: voiceBudget,
      language: input.language,
      vocab: input.vocab,
      assume: input.assume,
      anchors: emphasis.analogy === "less" ? [] : input.anchors,
      standing: input.standing.slice(0, 8),
      offerSimilar,
      emphasisAnalogy: emphasis.analogy,
      emphasisVisual: emphasis.visual,
      emphasisAlgebra: emphasis.algebra,
      pointer: emphasis.visual === "more",
      voiceStyle,
      algebraSkills: emphasis.algebra === "more" ? input.algebraSkills : [],
    };
  },

  looksLikeGaming: (resultOnly: number, withinSeconds: number) => resultOnly >= 4 && withinSeconds <= 600,

  /** `now` and `examDate` in Unix seconds. */
  examEve(now: number, examDate: number | null, questionsInLast40Min: number): boolean {
    if (questionsInLast40Min > 8) return true;
    if (examDate === null) return false;
    const delta = examDate - now;
    return delta < 36 * 3_600 && delta > -12 * 3_600;
  },
};

// MARK: The store

export interface MemoryNode {
  id: string;
  kind: string;
  /** A JSON object as text, as the Mac stores it. */
  data: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
}

export interface MemoryEdge {
  src: string;
  dst: string;
  type: string;
  weight?: number | null;
  source: string;
  updatedAt: number;
  deletedAt?: number | null;
}

export interface MemoryConsent {
  memorySync: boolean;
  productAnalytics: boolean;
  /** Observed habits. On until the student turns it off. */
  adaptToHabits: boolean;
}

export interface QuestionRecord {
  text: string;
  documentName: string | null;
  page: number | null;
  concepts: string[];
  kind: ExplanationKind;
  language: string;
  explanationJSON: string | null;
  area: string;
}

export interface NoticedHabit {
  id: string;
  dimension: PreferenceDimension;
  context: string;
  /** A recent behaviour, never an identity: a catalog key with %@ for the area. */
  phraseKey: string;
  area: string;
}

export interface MemorySnapshot {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  beliefs: ConceptBelief[];
  signals: StoredSignal[];
  outcomes: StoredOutcome[];
  skills: SkillState[];
  levels: Record<string, string>;
  frozen: string[];
  consent: MemoryConsent;
  pseudoID: string;
  pseudoIssued: number;
  migratedStudy: boolean;
  standing: string[];
}

const emptySnapshot = (now: number): MemorySnapshot => ({
  nodes: [],
  edges: [],
  beliefs: [],
  signals: [],
  outcomes: [],
  skills: [],
  levels: {},
  frozen: [],
  consent: { memorySync: false, productAnalytics: false, adaptToHabits: true },
  pseudoID: crypto.randomUUID().toUpperCase(),
  pseudoIssued: swiftDate(now),
  migratedStudy: true,
  standing: [],
});

const parse = (text: string): Record<string, unknown> => {
  try {
    const value = JSON.parse(text) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

export const ConceptSlug = {
  make(text: string): string {
    const words = text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word !== "")
      .slice(0, 4);
    return words.length === 0 ? "local/question" : `local/${words.join("-")}`;
  },
  displayName(slug: string): string {
    const last = slug
      .split("/")
      .filter((part) => part !== "")
      .pop();
    return last ? last.replace(/-/g, " ") : slug;
  },
  area(subject: string): string {
    const folded = subject
      .normalize("NFD")
      .replace(/\p{Mn}/gu, "")
      .toLowerCase();
    if (folded.includes("fisic") || folded.includes("quim")) return "physics";
    if (folded.includes("bio")) return "biology";
    if (folded.includes("portug")) return "portuguese";
    if (folded.includes("filo")) return "philosophy";
    if (folded.includes("info") || folded.includes("prog")) return "programming";
    return "math";
  },
};

const phraseKeys: Record<string, string> = {
  "visual|more": "Often asks for graphs in %@",
  "visual|less": "Prefers symbols first in %@",
  "analogy|more": "Often asks for analogies in %@",
  "analogy|less": "Prefers no analogies in %@",
  "voice|more": "Often wants a slower voice in %@",
  "voice|less": "Prefers reading in %@",
  "help|more": "Often wants a hint first in %@",
  "help|less": "Prefers the solution in %@",
};

export interface MemoryFiles {
  read(name: string): Promise<string | null>;
  write(name: string, contents: string): Promise<void>;
}

/** The on-device memory, kept in `memory.json`. Every change is saved; reading is synchronous once loaded. */
export class MemoryStore {
  private snapshot: MemorySnapshot;
  private readonly listeners = new Set<() => void>();
  private saving: Promise<void> = Promise.resolve();
  version = 0;

  private constructor(
    snapshot: MemorySnapshot,
    private readonly files: MemoryFiles | null,
    private readonly clock: () => number,
  ) {
    this.snapshot = snapshot;
  }

  /** `clock` gives Unix seconds. */
  static async open(files: MemoryFiles | null, clock: () => number = () => Date.now() / 1000): Promise<MemoryStore> {
    const text = files ? await files.read("memory.json").catch(() => null) : null;
    const saved = text ? parse(text) : null;
    const snapshot = { ...emptySnapshot(clock()), ...(saved as Partial<MemorySnapshot> | null) };
    return new MemoryStore(snapshot, files, clock);
  }

  static inMemory(clock: () => number = () => Date.now() / 1000): MemoryStore {
    return new MemoryStore(emptySnapshot(clock()), null, clock);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private now() {
    return Math.trunc(this.clock());
  }

  /**
   * Writes `memory.json`. Each window (main, reader, stage) has its own store, so what another window wrote since is
   * merged in first (`BrainMerge`: the newer change wins, deletions are tombstones). `replace` writes this snapshot as
   * it is: the reset, which must not bring the old questions back. (The Mac has one store for the whole app.)
   */
  private save(replace = false) {
    this.version += 1;
    for (const listener of [...this.listeners]) listener();
    const files = this.files;
    if (!files) return;
    this.saving = this.saving
      .then(async () => {
        if (!replace) await this.mergeFromDisk(files);
        await files.write("memory.json", JSON.stringify(this.snapshot));
      })
      .catch(() => {});
  }

  /** Merges the graph another window wrote into this one; returns how many records changed here. */
  private async mergeFromDisk(files: MemoryFiles): Promise<number> {
    const text = await files.read("memory.json").catch(() => null);
    const saved = (text ? parse(text) : null) as Partial<MemorySnapshot> | null;
    if (!saved || !Array.isArray(saved.nodes) || !Array.isArray(saved.edges)) return 0;
    const merged = BrainMerge.merge(
      { nodes: this.snapshot.nodes, edges: this.snapshot.edges },
      { nodes: saved.nodes, edges: saved.edges },
    );
    if (merged.changed > 0) {
      this.snapshot.nodes = merged.graph.nodes;
      this.snapshot.edges = merged.graph.edges;
    }
    return merged.changed;
  }

  /** Reads what the other windows wrote (a question opened in the reader shows in the Memory page). */
  async reload(): Promise<void> {
    const files = this.files;
    if (!files) return;
    let changed = 0;
    this.saving = this.saving
      .then(async () => {
        changed = await this.mergeFromDisk(files);
      })
      .catch(() => {});
    await this.saving;
    if (changed === 0) return;
    this.version += 1;
    for (const listener of [...this.listeners]) listener();
  }

  /** Waits for the writes already started (tests and quitting). */
  flushed(): Promise<void> {
    return this.saving;
  }

  // MARK: Graph

  record(question: QuestionRecord): string {
    const stamp = this.now();
    const text = question.text.trim();
    const existing = this.snapshot.nodes.find(
      (node) => node.kind === "question" && !node.deletedAt && parse(node.data).text === text,
    );
    if (existing) {
      if (question.explanationJSON)
        this.attachExplanation(existing.id, question.explanationJSON, question.concepts, stamp);
      this.ensureConcepts(question.concepts, question.area, existing.id, stamp);
      this.save();
      return existing.id;
    }
    const id = crypto.randomUUID().toUpperCase();
    this.snapshot.nodes.push({
      id,
      kind: "question",
      data: JSON.stringify({
        text,
        document: question.documentName ?? "",
        page: question.page ?? -1,
        language: question.language,
        kind: question.kind,
        area: question.area,
      }),
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null,
    });
    if (question.documentName)
      this.addEdge(id, this.ensureDocument(question.documentName, stamp), "from", "app", stamp);
    this.ensureConcepts(question.concepts, question.area, id, stamp);
    if (question.explanationJSON) this.attachExplanation(id, question.explanationJSON, question.concepts, stamp);
    for (const concept of question.concepts) this.upsert(this.beliefUnlocked(concept, stamp));
    this.save();
    return id;
  }

  explanationJSON(questionID: string): string | null {
    const edge = this.snapshot.edges.find((e) => e.src === questionID && e.type === "answered_by" && !e.deletedAt);
    const node = edge ? this.snapshot.nodes.find((n) => n.id === edge.dst && !n.deletedAt) : undefined;
    const steps = node ? parse(node.data).steps : undefined;
    return typeof steps === "string" ? steps : null;
  }

  delete(nodeID: string): void {
    const stamp = this.now();
    for (const node of this.snapshot.nodes)
      if (node.id === nodeID) {
        node.deletedAt = stamp;
        node.updatedAt = stamp;
      }
    for (const edge of this.snapshot.edges)
      if (edge.src === nodeID || edge.dst === nodeID) {
        edge.deletedAt = stamp;
        edge.updatedAt = stamp;
      }
    this.save();
  }

  get liveNodes(): MemoryNode[] {
    return this.snapshot.nodes.filter((node) => !node.deletedAt);
  }

  get liveEdges(): MemoryEdge[] {
    return this.snapshot.edges.filter((edge) => !edge.deletedAt);
  }

  // MARK: Beliefs and preferences

  belief(concept: string): ConceptBelief {
    const stamp = this.now();
    const item = { ...this.beliefUnlocked(concept, stamp) };
    Beliefs.decay(item, this.daysSince(item.lastEvidence, stamp));
    return item;
  }

  linkPrereq(prereq: string, concept: string): void {
    const stamp = this.now();
    this.addEdge(
      this.ensureConcept(prereq, "", stamp),
      this.ensureConcept(concept, "", stamp),
      "prereq_of",
      "curated",
      stamp,
    );
    this.save();
  }

  observe(event: BeliefEvent, concept: string, difficulty = 3): void {
    const stamp = this.now();
    const item = { ...this.beliefUnlocked(concept, stamp) };
    Beliefs.decay(item, this.daysSince(item.lastEvidence, stamp));
    Beliefs.apply(item, event, difficulty);
    item.lastEvidence = stamp;
    if (Beliefs.state(item) === "fluent") item.reachedFluent = true;
    this.upsert(item);
    if (confirmsSuccess(event)) {
      const target = this.conceptID(concept);
      for (const edge of this.snapshot.edges) {
        if (edge.dst !== target || edge.type !== "prereq_of" || edge.deletedAt) continue;
        const prereq = this.snapshot.nodes.find((node) => node.id === edge.src && node.kind === "concept");
        if (!prereq) continue;
        const prior = { ...this.beliefUnlocked(this.slugOf(prereq), stamp) };
        prior.alpha += beliefDelta[event][0] * 0.3;
        prior.lastEvidence = stamp;
        this.upsert(prior);
      }
    }
    this.save();
  }

  observeSignal(signal: PreferenceSignal, area: string, state: BeliefState, kind: ExplanationKind): void {
    const context = `${area}|${state}|${kind}`;
    const at = swiftDate(this.clock());
    for (const [dimension, direction, weight] of PreferenceEstimate.attributions(signal)) {
      this.snapshot.signals.push({ dimension, context, direction, weight, at });
      this.snapshot.signals.push({ dimension, context: "user", direction, weight, at });
      this.refreshLevel(dimension, context, at);
    }
    this.save();
  }

  observeSkill(id: string, correct: boolean): void {
    let skill = this.snapshot.skills.find((entry) => entry.id === id);
    if (!skill) {
      skill = { id, wrong: 0, right: 0 };
      this.snapshot.skills.push(skill);
    }
    if (correct) skill.right += 1;
    else skill.wrong += 1;
    this.save();
  }

  observeOutcome(dimension: PreferenceDimension, emphasis: Emphasis, correct: boolean): void {
    this.snapshot.outcomes.push({ dimension, emphasis, correct, at: swiftDate(this.clock()) });
    if (PreferenceEstimate.shouldFreeze(this.snapshot.outcomes, dimension) && !this.snapshot.frozen.includes(dimension))
      this.snapshot.frozen.push(dimension);
    this.save();
  }

  emphasis(dimension: PreferenceDimension, area: string, state: BeliefState, kind: ExplanationKind): Emphasis {
    if (!this.snapshot.consent.adaptToHabits) return "default";
    if (dimension === "algebra") return this.algebraEmphasis();
    if (this.snapshot.frozen.includes(dimension)) return "default";
    const context = `${area}|${state}|${kind}`;
    const estimated = PreferenceEstimate.value(this.snapshot.signals, dimension, context, swiftDate(this.clock()));
    const previous = (this.snapshot.levels[`${dimension}|${context}`] as Emphasis | undefined) ?? "default";
    return PreferenceEstimate.level(estimated.x, previous, estimated.events, false);
  }

  plan(options: {
    question: string;
    kind: ExplanationKind;
    area: string;
    concept: string;
    utterance?: string;
    examDate?: number | null;
    usesVoice?: boolean;
  }): ExplanationPlan {
    const now = this.clock();
    const item = this.belief(options.concept);
    const state = Beliefs.state(item);
    const target = this.conceptID(options.concept);
    const encounters = this.liveEdges.filter((edge) => edge.dst === target && edge.type === "asked_about").length;
    const recent = this.questionsSince(now - 40 * 60);
    const emphasis = (dimension: PreferenceDimension) => this.emphasis(dimension, options.area, state, options.kind);
    return ExplanationPlanner.plan(
      plannerInput({
        question: options.question,
        kind: options.kind,
        state,
        encounter: Math.max(1, encounters),
        examEve: ExplanationPlanner.examEve(now, options.examDate ?? null, recent),
        gaming: ExplanationPlanner.looksLikeGaming(this.resultOnlyRecently(), 600),
        adaptationsEnabled: this.snapshot.consent.adaptToHabits,
        studentUsesVoice: options.usesVoice ?? false,
        anchors: this.anchors(options.concept),
        assume: [`${options.concept}: ${state}`],
        standing: this.standingInstructions(),
        utterance: options.utterance ?? "",
        analogy: emphasis("analogy"),
        visual: emphasis("visual"),
        algebra: emphasis("algebra"),
        voice: emphasis("voice"),
        help: emphasis("help"),
        algebraSkills: this.snapshot.skills.filter((skill) => skillEmphasis(skill) === "more").map((skill) => skill.id),
      }),
    );
  }

  // MARK: Consent, habits, export

  get consent(): MemoryConsent {
    return { ...this.snapshot.consent };
  }

  setConsent(consent: MemoryConsent): void {
    this.snapshot.consent = { ...consent };
    this.save();
  }

  standingInstructions(): string[] {
    return [...this.snapshot.standing];
  }

  addStanding(text: string): void {
    const trimmed = [...text].slice(0, 200).join("").trim();
    if (trimmed === "") return;
    this.snapshot.standing = this.snapshot.standing.filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase());
    this.snapshot.standing.push(trimmed);
    if (this.snapshot.standing.length > 8) this.snapshot.standing.splice(0, this.snapshot.standing.length - 8);
    this.save();
  }

  noticedHabits(): NoticedHabit[] {
    if (!this.snapshot.consent.adaptToHabits) return [];
    const now = swiftDate(this.clock());
    const found: NoticedHabit[] = [];
    const contexts = [
      ...new Set(this.snapshot.signals.map((signal) => signal.context).filter((context) => context !== "user")),
    ].sort();
    for (const context of contexts) {
      const area = context.split("|")[0] ?? context;
      for (const dimension of preferenceDimensions) {
        if (dimension === "algebra") continue;
        const estimated = PreferenceEstimate.value(this.snapshot.signals, dimension, context, now);
        const level = PreferenceEstimate.level(
          estimated.x,
          "default",
          estimated.events,
          this.snapshot.frozen.includes(dimension),
        );
        const key = level === "default" ? undefined : phraseKeys[`${dimension}|${level}`];
        if (key) found.push({ id: `${dimension}|${context}`, dimension, context, phraseKey: key, area });
      }
    }
    if (this.algebraEmphasis() === "more")
      found.push({
        id: "algebra|skill",
        dimension: "algebra",
        context: "skill",
        phraseKey: "Often wants the algebra written out",
        area: "",
      });
    return found;
  }

  forgetHabit(id: string): void {
    const [dimension, context = ""] = id.split(/\|(.*)/s);
    if (!dimension || !preferenceDimensions.includes(dimension as PreferenceDimension)) return;
    this.snapshot.signals = this.snapshot.signals.filter(
      (signal) => !(signal.dimension === dimension && (signal.context === context || context === "skill")),
    );
    this.snapshot.levels = Object.fromEntries(
      Object.entries(this.snapshot.levels).filter(([key]) => !key.startsWith(dimension)),
    );
    if (dimension === "algebra") this.snapshot.skills = [];
    this.save();
  }

  exportData(): string {
    return JSON.stringify(this.snapshot);
  }

  resetMemory(): void {
    const consent = this.snapshot.consent;
    this.snapshot = { ...emptySnapshot(this.clock()), consent };
    this.save(true);
  }

  /** Every node and edge, tombstones included, so a deletion reaches the other computers. */
  syncGraph(): { nodes: MemoryNode[]; edges: MemoryEdge[] } {
    return {
      nodes: this.snapshot.nodes.map((node) => ({ ...node })),
      edges: this.snapshot.edges.map((edge) => ({ ...edge })),
    };
  }

  /** Takes what another computer sent. The newer change wins per node and per edge. Returns how many records changed
   * here (`MemoryStore.mergeSynced`). */
  mergeSynced(remote: { nodes: MemoryNode[]; edges: MemoryEdge[] }): number {
    const merged = BrainMerge.merge({ nodes: this.snapshot.nodes, edges: this.snapshot.edges }, remote);
    this.snapshot.nodes = merged.graph.nodes;
    this.snapshot.edges = merged.graph.edges;
    this.save();
    return merged.changed;
  }

  /** Replaces the graph with a merged one (`BrainMerge`), keeping beliefs and habits. */
  replaceGraph(graph: { nodes: MemoryNode[]; edges: MemoryEdge[] }): void {
    this.snapshot.nodes = graph.nodes;
    this.snapshot.edges = graph.edges;
    this.save();
  }

  questionsSince(unix: number): number {
    return this.snapshot.nodes.filter((node) => node.kind === "question" && !node.deletedAt && node.createdAt >= unix)
      .length;
  }

  // MARK: Private

  private beliefUnlocked(concept: string, now: number): ConceptBelief {
    return this.snapshot.beliefs.find((belief) => belief.conceptID === concept) ?? Beliefs.make(concept, now);
  }

  private upsert(belief: ConceptBelief) {
    const index = this.snapshot.beliefs.findIndex((entry) => entry.conceptID === belief.conceptID);
    if (index >= 0) this.snapshot.beliefs[index] = belief;
    else this.snapshot.beliefs.push(belief);
  }

  private algebraEmphasis(): Emphasis {
    const skills = this.snapshot.skills;
    if (skills.some((skill) => skillEmphasis(skill) === "more")) return "more";
    if (skills.length > 0 && skills.every((skill) => skillEmphasis(skill) === "less")) return "less";
    return "default";
  }

  private refreshLevel(dimension: PreferenceDimension, context: string, at: number) {
    const estimated = PreferenceEstimate.value(this.snapshot.signals, dimension, context, at);
    const key = `${dimension}|${context}`;
    const previous = (this.snapshot.levels[key] as Emphasis | undefined) ?? "default";
    this.snapshot.levels[key] = PreferenceEstimate.level(
      estimated.x,
      previous,
      estimated.events,
      this.snapshot.frozen.includes(dimension),
    );
  }

  private anchors(concept: string): string[] {
    const id = this.conceptID(concept);
    return this.snapshot.edges
      .filter((edge) => !edge.deletedAt && (edge.src === id || edge.dst === id) && edge.type === "related")
      .map((edge) => (edge.src === id ? edge.dst : edge.src))
      .slice(0, 3)
      .map((nodeID) => this.snapshot.nodes.find((node) => node.id === nodeID))
      .map((node) => (node ? parse(node.data).name : undefined))
      .filter((name): name is string => typeof name === "string");
  }

  private resultOnlyRecently(): number {
    const since = swiftDate(this.clock() - 600);
    return this.snapshot.signals.filter(
      (signal) => signal.dimension === "help" && signal.direction < 0 && signal.at >= since,
    ).length;
  }

  private ensureConcepts(concepts: readonly string[], area: string, questionID: string, now: number) {
    const ids: string[] = [];
    for (const concept of concepts) {
      if (concept === "") continue;
      const id = this.ensureConcept(concept, area, now);
      ids.push(id);
      this.addEdge(questionID, id, "asked_about", "derived", now);
    }
    for (const other of ids.slice(1)) this.addEdge(ids[0]!, other, "related", "derived", now, 1);
  }

  private ensureConcept(slug: string, area: string, now: number): string {
    const existing = this.snapshot.nodes.find(
      (node) => node.kind === "concept" && !node.deletedAt && this.slugOf(node) === slug,
    );
    if (existing) return existing.id;
    const id = crypto.randomUUID().toUpperCase();
    this.snapshot.nodes.push({
      id,
      kind: "concept",
      data: JSON.stringify({ slug, name: ConceptSlug.displayName(slug), area }),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    return id;
  }

  private ensureDocument(name: string, now: number): string {
    const existing = this.snapshot.nodes.find(
      (node) => node.kind === "document" && !node.deletedAt && parse(node.data).title === name,
    );
    if (existing) return existing.id;
    const id = crypto.randomUUID().toUpperCase();
    this.snapshot.nodes.push({
      id,
      kind: "document",
      data: JSON.stringify({ title: name }),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    return id;
  }

  private attachExplanation(questionID: string, body: string, concepts: readonly string[], now: number) {
    const already = this.snapshot.edges.some((edge) => {
      if (edge.src !== questionID || edge.type !== "answered_by" || edge.deletedAt) return false;
      const node = this.snapshot.nodes.find((n) => n.id === edge.dst);
      return node !== undefined && parse(node.data).steps === body;
    });
    if (already) return;
    const id = crypto.randomUUID().toUpperCase();
    this.snapshot.nodes.push({
      id,
      kind: "explanation",
      data: JSON.stringify({ steps: body }),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    this.addEdge(questionID, id, "answered_by", "app", now);
    for (const concept of concepts) this.addEdge(id, this.ensureConcept(concept, "", now), "uses", "derived", now);
  }

  private addEdge(src: string, dst: string, type: string, source: string, now: number, weight: number | null = null) {
    if (
      this.snapshot.edges.some((edge) => edge.src === src && edge.dst === dst && edge.type === type && !edge.deletedAt)
    )
      return;
    this.snapshot.edges.push({ src, dst, type, weight, source, updatedAt: now, deletedAt: null });
  }

  private conceptID(slug: string): string {
    return (
      this.snapshot.nodes.find((node) => node.kind === "concept" && !node.deletedAt && this.slugOf(node) === slug)
        ?.id ?? slug
    );
  }

  private slugOf(node: MemoryNode): string {
    const slug = parse(node.data).slug;
    return typeof slug === "string" ? slug : "";
  }

  private daysSince(then: number, now: number): number {
    return then > 0 && now > then ? (now - then) / 86_400 : 0;
  }
}
