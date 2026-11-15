// Port of LearnLayer/Problems/ModelRouting.swift, LearnLayer/AI/AISettings.swift (model ids) and
// LearnLayer/AI/ModelPrice.swift @ ref 2026-11-04

/** The model ids and defaults of AISettings.swift. */
export const AISettings = {
  /** Fast and cheap; good enough for most equations. */
  defaultModel: "anthropic/claude-haiku-5.5",
  /** Used for "Explain better", and when the default model's maths fails the checks. */
  strongModel: "anthropic/claude-sonnet-5.5",
  /**
   * The mascot's lesson on a solved question («Explica-me» and a doubt): cheap, with Sonnet behind it
   * when its reply cannot be played or skips a step of the solution.
   */
  lessonModel: "deepseek/deepseek-v4.1-flash",
  /** The fast transcription of a clicked question (FastTranscription.swift). */
  fastTranscriptionModel: "qwen/qwen3.8-flash",
  /** Low-latency ElevenLabs model on OpenRouter. Flash is the cheaper option. */
  defaultSpeechModel: "elevenlabs/eleven-v4-turbo",
  flashSpeechModel: "elevenlabs/eleven-flash-v2.5",
  /** The models-API premade voice that is relaxed and gender-neutral, so the tutor stays calm, clear, and mid-pitch. */
  defaultSpeechVoiceID: "river",
} as const;

export const areas = ["math", "physicsChemistry", "biologyGeology", "reading", "other"] as const;
export type Area = (typeof areas)[number];
export type Plan = "free" | "paid";
/** Which model solves a question first (SolutionProvider.swift). */
export type SolverRoute = "fast" | "strong";
/**
 * Routing switch, `cheapFirst` by default (23/23 vs 22/23 for `current`
 * at about the same cost in the October paid A/B). `current` is the routing (A);
 * `cheapFirst` (B) answers first with Gemini or Haiku-with-thinking and
 * leaves Sonnet to the existing escalations.
 */
export type RoutingConfig = "current" | "cheapFirst";

export interface ModelChoice {
  model: string;
  /** `reasoning.max_tokens`; null leaves reasoning off. */
  reasoningBudget: number | null;
}

/**
 * Which model writes the first answer, from the subject, the plan and
 * whether a figure goes with the question. Chosen from a blind-judged
 * comparison on IAVE exams (October 2026). Sonnet stays the fallback: an
 * unreadable reply, no text within `firstTextDeadline`, or "Explain better"
 * all go to `AISettings.strongModel`.
 */
export const ModelRouting = {
  haiku: "anthropic/claude-haiku-5.5",
  sonnet: "anthropic/claude-sonnet-5.5",
  gemini: "google/gemini-3.8-flash",
  /**
   * Haiku without thinking got 4 of 14 keyed answers right; with 2000
   * thinking tokens it matched 4000 (judge 8.7) and was faster.
   */
  haikuReasoningBudget: 2000,
  /** A cheaper model that hasn't written anything by now (seconds) is dropped for Sonnet. */
  firstTextDeadline: 30,
  planKey: "learnLayerPlan",
  configKey: "learnLayerRouting",

  /** The stored routing; anything else is `cheapFirst`. */
  config(stored: string | null | undefined): RoutingConfig {
    return stored === "current" ? "current" : "cheapFirst";
  },

  /** No payments yet on the Mac: everyone is on the paid routing unless set to free. */
  plan(stored: string | null | undefined): Plan {
    return stored === "free" ? "free" : "paid";
  },

  area(subject: string | null | undefined): Area {
    if (!subject) return "other";
    const name = subject.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    const short = name.trim();
    const has = (...parts: string[]) => parts.some((part) => name.includes(part));
    if (short === "bg" || has("biolog", "geolog")) return "biologyGeology";
    if (short === "fq" || short === "fqa" || has("fisic", "phys", "quim", "chem")) return "physicsChemistry";
    if (has("matem", "math", "macs", "calc", "algebr", "geometr", "statist", "estatist")) return "math";
    // prettier-ignore
    if (has("portugu", "ingles", "english", "frances", "french", "alema", "german", "espanhol", "spanish",
            "histor", "geograf", "geograph", "filosof", "philosoph", "literat", "latim", "latin", "econom", "sociolog", "psicolog")) {
      return "reading";
    }
    return "other";
  },

  /** `route` is the classifier's; `hasFigure` is true when page images are sent. */
  choice(route: SolverRoute, area: Area, hasFigure: boolean, plan: Plan, config: RoutingConfig): ModelChoice {
    if (config === "cheapFirst") return ModelRouting.cheapFirstChoice(route, area, hasFigure);
    const haikuThink = { model: ModelRouting.haiku, reasoningBudget: ModelRouting.haikuReasoningBudget };
    const sonnetChoice = { model: ModelRouting.sonnet, reasoningBudget: null };
    const geminiChoice = { model: ModelRouting.gemini, reasoningBudget: null };
    if (hasFigure) {
      if (plan === "free") return geminiChoice;
      return area === "math" || area === "other" ? sonnetChoice : geminiChoice;
    }
    switch (area) {
      case "math":
        return plan === "paid" ? sonnetChoice : haikuThink;
      case "biologyGeology":
      case "reading":
        return plan === "free" ? haikuThink : geminiChoice;
      case "physicsChemistry":
        return geminiChoice;
      case "other":
        return route === "fast" ? haikuThink : sonnetChoice;
    }
  },

  /**
   * Config B. Never Sonnet first: Gemini reads every figure page (it read
   * figures as well as Sonnet in the October comparison at a fraction of
   * the price) and answers physics, chemistry, biology and reading;
   * maths, and a question whose subject is unknown, go to Haiku with
   * thinking (4/14 without thinking, matched Sonnet's judge score with it).
   */
  cheapFirstChoice(_route: SolverRoute, area: Area, hasFigure: boolean): ModelChoice {
    const haikuThink = { model: ModelRouting.haiku, reasoningBudget: ModelRouting.haikuReasoningBudget };
    const geminiChoice = { model: ModelRouting.gemini, reasoningBudget: null };
    if (hasFigure) return geminiChoice;
    return area === "math" || area === "other" ? haikuThink : geminiChoice;
  },

  /**
   * The model for "Explain better" (the student asks again). A keeps
   * Sonnet. B tries Gemini first, unless Gemini already wrote the answer
   * being replaced or Sonnet already answered, then Sonnet.
   */
  explainBetterModel(firstModel: string, solvedByStronger: boolean, config: RoutingConfig): string {
    if (config !== "cheapFirst" || solvedByStronger || firstModel === ModelRouting.gemini)
      return AISettings.strongModel;
    return ModelRouting.gemini;
  },
};

export interface ModelRate {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
}

const rate = (inputPerMillion: number, outputPerMillion: number, cacheReadPerMillion: number): ModelRate => ({
  inputPerMillion,
  outputPerMillion,
  cacheReadPerMillion,
});

const sonnet55 = rate(2, 10, 0.1);

/** Longest key first, so `claude-sonnet-5` does not win over `claude-sonnet-5.5`. */
const rates: readonly (readonly [string, ModelRate])[] = (
  [
    ["claude-opus-4.1", rate(15, 75, 1.5)],
    ["claude-opus-4.8", rate(5, 25, 0.5)],
    ["claude-opus-4.7", rate(5, 25, 0.5)],
    ["claude-opus-4.6", rate(5, 25, 0.5)],
    ["claude-opus-4.5", rate(5, 25, 0.5)],
    ["claude-opus-5.5", rate(4, 20, 0.2)],
    ["claude-opus-5", rate(5, 25, 0.5)],
    ["claude-sonnet-4.5", rate(3, 15, 0.3)],
    ["claude-sonnet-5.5", sonnet55],
    ["claude-sonnet-5", rate(2, 10, 0.2)],
    ["glm-5.3-flashx", rate(0.37, 1.25, 0.37)],
    ["glm-5.3-prime", rate(2.8, 8.8, 2.8)],
    ["glm-5.3-flash", rate(0.0052, 0.1985, 0.0052)],
    ["glm-5.3", rate(0.7, 2.2, 0.7)],
    ["deepseek-v4.1-flash", rate(0.045, 0.5, 0.045)],
    ["qwen3.8-flash", rate(0.15, 0.47, 0.15)],
    ["qwen3.7-flash", rate(0.03, 0.13, 0.03)],
    ["qwen3.7-plus", rate(0.32, 1.28, 0.32)],
    ["gemini-3.8-flash", rate(0.825, 4.125, 0.2)],
    ["gemini-3.5-flash-lite", rate(0.3, 2.5, 0.1)],
    ["gpt-6-luna", rate(0.1, 0.5, 0.05)],
    ["minimax-m3.1-flash", rate(0.15, 0.6, 0.15)],
    ["claude-haiku-4.5", rate(1, 5, 0.1)],
    ["claude-haiku-5.5", rate(0.1, 0.5, 0.01)],
  ] as const
)
  .slice()
  .sort((a, b) => b[0].length - a[0].length);

/**
 * OpenRouter list prices, in US dollars per million tokens (October 2026).
 * A reply with no reported cost is priced from these, so the cost ledger still
 * counts it. Unknown models use Sonnet 5.5, the app's strong model, rather
 * than zero. `:batch` variants are half the list price.
 */
export const ModelPrice = {
  rate(model: string): ModelRate {
    const id = model.toLowerCase();
    const match = rates.find(([key]) => id.includes(key))?.[1] ?? sonnet55;
    if (!id.includes(":batch")) return match;
    return rate(match.inputPerMillion / 2, match.outputPerMillion / 2, match.cacheReadPerMillion / 2);
  },

  estimate(model: string, promptTokens: number, completionTokens: number, cachedTokens: number, totalTokens: number) {
    const price = ModelPrice.rate(model);
    const prompt = Math.max(promptTokens, 0);
    let completion = Math.max(completionTokens, 0);
    const total = Math.max(totalTokens, 0);
    // Tokens the split doesn't name (reasoning, or a total with no split)
    // are priced as output, so they cannot slip under the cap.
    if (total > prompt + completion) completion += total - prompt - completion;
    const cached = Math.min(Math.max(cachedTokens, 0), prompt);
    const fresh = prompt - cached;
    return (
      (fresh * price.inputPerMillion + cached * price.cacheReadPerMillion + completion * price.outputPerMillion) /
      1_000_000
    );
  },
};
