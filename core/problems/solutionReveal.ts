// Port of LearnLayer/Problems/SolutionReveal.swift and SolveProgress.swift @ ref 2026-11-04: the worked solution's
// steps coming in one at a time, and what the progress line says while the solve is on its way.

import { StatementQuotes } from "./statementQuotes";

const epsilon = 1e-9;

/** When each step comes in, from the moment the solution opens. */
export class RevealSchedule {
  constructor(
    /** Seconds from the start at which each step appears, ascending. */
    readonly starts: readonly number[],
    /** Seconds from the start at which the cascade is over, after the last step. */
    readonly answerAt: number,
  ) {}

  get count(): number {
    return this.starts.length;
  }

  /** How many steps are on screen `elapsed` seconds in. */
  shown(elapsed: number): number {
    let count = 0;
    for (const start of this.starts) {
      if (start <= elapsed + epsilon) count += 1;
      else break;
    }
    return count;
  }

  showsAnswer(elapsed: number): boolean {
    return elapsed + epsilon >= this.answerAt;
  }

  /** The step that came in last; null before the first and once the cascade is over. */
  revealing(elapsed: number): number | null {
    if (this.showsAnswer(elapsed)) return null;
    const shown = this.shown(elapsed);
    return shown > 0 ? shown - 1 : null;
  }

  /** The next moment something comes in, after `elapsed`; null once the answer is there. */
  nextEvent(elapsed: number): number | null {
    const next = this.starts.find((start) => start > elapsed + epsilon);
    if (next !== undefined) return next;
    return this.showsAnswer(elapsed) ? null : this.answerAt;
  }

  /** Where to pick the schedule up with `shown` steps already on screen: when the last of them came in. */
  resumeElapsed(shown: number): number {
    if (shown <= 0 || this.starts.length === 0) return 0;
    return this.starts[Math.min(shown, this.starts.length) - 1]!;
  }
}

export const SolutionReveal = {
  /** Before the first step, so the panel has settled. */
  lead: 0.35,
  minimumGap: 0.9,
  maximumGap: 2.0,
  secondsPerCharacter: 0.012,
  secondsPerQuote: 0.2,
  reducedMotionScale: 0.7,
  answerHold: 0.5,

  /** How long a step stays the newest: its words to read and its data to find. */
  gap(characters: number, quotes: number, reduceMotion = false): number {
    const raw =
      SolutionReveal.minimumGap +
      Math.max(0, characters) * SolutionReveal.secondsPerCharacter +
      Math.max(0, quotes) * SolutionReveal.secondsPerQuote;
    const gap = Math.min(SolutionReveal.maximumGap, Math.max(SolutionReveal.minimumGap, raw));
    return reduceMotion ? gap * SolutionReveal.reducedMotionScale : gap;
  },

  /** One entry per step: the characters it shows and how many of its quotes are in the statement. */
  schedule(characters: readonly number[], quotes: readonly number[], reduceMotion = false): RevealSchedule {
    const starts: number[] = [];
    let cursor = SolutionReveal.lead;
    characters.forEach((count, index) => {
      starts.push(cursor);
      cursor += SolutionReveal.gap(count, quotes[index] ?? 0, reduceMotion);
    });
    // The last step's beat ends a little early: the answer only needs a breath after it.
    const last = starts[starts.length - 1];
    const answerAt =
      last === undefined
        ? SolutionReveal.lead
        : Math.max(last + SolutionReveal.answerHold, cursor - (cursor - last) / 2);
    return new RevealSchedule(starts, answerAt);
  },

  /**
   * The step the voice is saying, from the statement's data it names: the step whose quotes it says most of. A tie
   * goes to the first at or after `from`, so a datum two steps share moves the explanation forward, not back.
   */
  spokenStep(steps: readonly (readonly string[])[], spoken: string | null, from: number | null = null): number | null {
    if (!spoken) return null;
    const counts = steps.map(
      (quotes) =>
        new Set(
          quotes.map(StatementQuotes.key).filter((key) => key !== "" && StatementQuotes.ranges(key, spoken).length > 0),
        ).size,
    );
    const best = Math.max(0, ...counts);
    if (best <= 0) return null;
    const tied = counts.map((count, index) => (count === best ? index : -1)).filter((index) => index >= 0);
    if (from !== null) {
      const ahead = tied.find((index) => index >= from);
      if (ahead !== undefined) return ahead;
    }
    return tied[0] ?? null;
  },

  /** Steps on screen once the voice has named `spokenStep`: never fewer than before. */
  shown(shown: number, spokenStep: number | null, count: number): number {
    if (spokenStep === null || spokenStep < 0) return shown;
    return Math.min(count, Math.max(shown, spokenStep + 1));
  },
};

/** Stages of one solve, in the order a student hears them. */
export const solveStages = ["reading", "figure", "equations", "solving", "checking"] as const;
export type SolveStage = (typeof solveStages)[number];

/** The sort of exercise, guessed from its words. Only the phrases change, never the pipeline. */
export type SolveKind = "generic" | "circuit" | "induction" | "graph" | "calculus" | "text" | "chemistry";

const foldCase = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export const SolveKind = {
  /** First match wins, most specific first. Accents and case do not matter. */
  detect(text: string): SolveKind {
    const folded = foldCase(text);
    const rules: [SolveKind, RegExp][] = [
      ["circuit", /\b(circuitos?|circuits?|malhas?|resistenc\w*|resistors?|resistances?|loops?|kirchhoff)\b/],
      ["induction", /\b(inducao|inducoes|induction|prove n|prove by|prove that|prove por|prove que)\b/],
      [
        "chemistry",
        /\b(quimic\w*|chemi\w*|moles?|mols?|molar\w*|reacao|reacoes|reactions?|estequiometr\w*|stoichiometr\w*)\b/,
      ],
      ["graph", /\b(graficos?|graphs?)\b/],
      ["calculus", /\b(derivad\w*|derivatives?|limites?|limits?|integrais?|integral|integrals)\b/],
      ["text", /\b(poemas?|poems?|poesia|poetry|sonetos?|textos?|texts?|excertos?|passages?|estrofes?|stanzas?)\b/],
    ];
    return rules.find(([, pattern]) => pattern.test(folded))?.[0] ?? "generic";
  },
};

/** When each stage became true, in seconds since the solve was asked for; null: it has not happened. */
export interface SolveClock {
  hasFigure: boolean;
  figureAt: number | null;
  equationsAt: number | null;
  solveCallAt: number | null;
  checkingAt: number | null;
  ready: boolean;
  kind: SolveKind;
}

export function solveClock(options: Partial<SolveClock> = {}): SolveClock {
  return {
    hasFigure: false,
    figureAt: null,
    equationsAt: null,
    solveCallAt: null,
    checkingAt: null,
    ready: false,
    kind: "generic",
    ...options,
  };
}

/** Records `elapsed` the first time `event` happens. */
export function noteStage(
  clock: SolveClock,
  event: "figureAt" | "equationsAt" | "solveCallAt" | "checkingAt",
  elapsed: number,
  happened: boolean,
): SolveClock {
  if (!happened || clock[event] !== null) return clock;
  return { ...clock, [event]: Math.max(0, elapsed) };
}

const rank = (stage: SolveStage) => solveStages.indexOf(stage);

export const SolveProgress = {
  /** How long one phrase stays before the next one that has already happened. */
  dwell: 2.5,

  /** The phrase for `elapsed` seconds in, or null once the solution is ready. A later event never walks backwards. */
  stage(clock: SolveClock, elapsed: number, notBefore: SolveStage | null = null): SolveStage | null {
    if (clock.ready) return null;
    const time = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
    if (clock.checkingAt !== null && time >= clock.checkingAt) return "checking";
    const shown = walked(clock, time);
    if (notBefore === null) return shown;
    return rank(shown) >= rank(notBefore) ? shown : notBefore;
  },

  /** The English phrase (also its catalog key) for a stage. */
  phrase(stage: SolveStage, kind: SolveKind): string {
    if (stage === "reading") {
      const reading: Partial<Record<SolveKind, string>> = {
        circuit: "Reading the circuit…",
        graph: "Analysing the graph…",
        calculus: "Analysing the function…",
        text: "Reading the text…",
        chemistry: "Reading the reaction…",
      };
      return reading[kind] ?? "Reading the question…";
    }
    if (stage === "equations") {
      const equations: Partial<Record<SolveKind, string>> = {
        circuit: "Identifying the loops…",
        induction: "Setting up the induction…",
        chemistry: "Balancing the equation…",
      };
      return equations[kind] ?? "Setting up the equations…";
    }
    if (stage === "figure") return "Reading the figure…";
    if (stage === "solving") return "Solving…";
    return "Checking the result…";
  },

  /** The question sends the student to a printed figure. A rhetorical figure does not count. */
  mentionsFigure(text: string): boolean {
    let folded = foldCase(text);
    for (const phrase of [
      "figura de estilo",
      "figura de retorica",
      "figure de style",
      "figure of speech",
      "rhetorical figure",
    ]) {
      folded = folded.replaceAll(phrase, " ");
    }
    return /\b(figuras?|figures?|circuitos?|circuits?|graficos?|graphs?|diagramas?|diagrams?|esquemas?)\b/.test(folded);
  },

  /** The streamed JSON has started a figure transcription, not `"figure": null`. */
  figureStarted(content: string): boolean {
    return /"figure"\s*:\s*"/.test(content);
  },

  /** The streamed JSON has started a formula. */
  equationsStarted(content: string): boolean {
    return /"latex"\s*:\s*"/.test(content) || content.includes("\\frac") || content.includes("\\begin{");
  },
};

function walked(clock: SolveClock, elapsed: number): SolveStage {
  const sequence: [SolveStage, number | null][] = [
    ["reading", 0],
    ["figure", clock.hasFigure ? clock.figureAt : null],
    ["equations", clock.equationsAt],
    ["solving", clock.solveCallAt],
  ];
  let shown: SolveStage = "reading";
  let cursor = 0;
  for (const [stage, unlocked] of sequence) {
    if (unlocked === null || unlocked > elapsed) continue;
    const reveal = Math.max(unlocked, cursor);
    if (!(elapsed + 1e-6 >= reveal)) break;
    shown = stage;
    cursor = reveal + SolveProgress.dwell;
  }
  return shown;
}
