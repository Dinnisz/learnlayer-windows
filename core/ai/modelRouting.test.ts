// Port of LearnLayerTests/ModelRoutingTests.swift (ModelRoutingTests and CheapFirstRoutingTests) @ ref 2026-11-04
// (`noTextInTimeIsReported`, `textInTimeKeepsTheAnswer`, `thinkingBeforeTheFirstWordsIsNotGivenUpOn`,
// `aSolutionAskedWithoutStreamingMayTakeLongerThanOtherCalls` and `portuguesePromptRulesOutBrazilianForms`
// are in core/ai/solutionStream.test.ts and core/prompts/problemPrompt.test.ts.)

import { describe, expect, it } from "vitest";
import { AISettings, areas, ModelPrice, ModelRouting, type Plan, type SolverRoute } from "./modelRouting";

const routes: SolverRoute[] = ["fast", "strong"];
const plans: Plan[] = ["free", "paid"];
const sonnet = { model: ModelRouting.sonnet, reasoningBudget: null };
const gemini = { model: ModelRouting.gemini, reasoningBudget: null };
const haikuThink = { model: ModelRouting.haiku, reasoningBudget: ModelRouting.haikuReasoningBudget };

describe("ModelRouting", () => {
  it("subjects map to areas", () => {
    expect(ModelRouting.area("Matemática A")).toBe("math");
    expect(ModelRouting.area("MACS")).toBe("math");
    expect(ModelRouting.area("Física e Química A")).toBe("physicsChemistry");
    expect(ModelRouting.area("FQ")).toBe("physicsChemistry");
    expect(ModelRouting.area("Biologia e Geologia")).toBe("biologyGeology");
    expect(ModelRouting.area("BG")).toBe("biologyGeology");
    expect(ModelRouting.area("Português")).toBe("reading");
    expect(ModelRouting.area("Inglês")).toBe("reading");
    expect(ModelRouting.area("História A")).toBe("reading");
    expect(ModelRouting.area("Geografia A")).toBe("reading");
    expect(ModelRouting.area("Filosofia")).toBe("reading");
    expect(ModelRouting.area(null)).toBe("other");
    expect(ModelRouting.area("Desenho")).toBe("other");
  });

  it("paid plan routing", () => {
    expect(ModelRouting.choice("strong", "math", false, "paid", "current")).toEqual(sonnet);
    expect(ModelRouting.choice("strong", "physicsChemistry", false, "paid", "current")).toEqual(gemini);
    expect(ModelRouting.choice("strong", "biologyGeology", false, "paid", "current")).toEqual(gemini);
    expect(ModelRouting.choice("fast", "reading", false, "paid", "current")).toEqual(gemini);
    expect(ModelRouting.choice("strong", "math", true, "paid", "current")).toEqual(sonnet);
    expect(ModelRouting.choice("strong", "physicsChemistry", true, "paid", "current")).toEqual(gemini);
    expect(ModelRouting.choice("strong", "other", false, "paid", "current")).toEqual(sonnet);
  });

  it("free plan routing", () => {
    expect(ModelRouting.choice("strong", "math", false, "free", "current")).toEqual({
      ...haikuThink,
      reasoningBudget: 2000,
    });
    expect(ModelRouting.choice("strong", "biologyGeology", false, "free", "current")).toEqual(haikuThink);
    expect(ModelRouting.choice("fast", "reading", false, "free", "current")).toEqual(haikuThink);
    expect(ModelRouting.choice("strong", "physicsChemistry", false, "free", "current")).toEqual(gemini);
    for (const area of areas) {
      expect(ModelRouting.choice("strong", area, true, "free", "current")).toEqual(gemini);
      if (area === "other") continue;
      for (const route of routes) {
        expect(ModelRouting.choice(route, area, false, "free", "current").model).not.toBe(ModelRouting.sonnet);
      }
    }
  });

  it("Haiku always thinks and the others do not", () => {
    for (const area of areas)
      for (const route of routes)
        for (const figure of [false, true])
          for (const plan of plans)
            for (const config of ["current", "cheapFirst"] as const) {
              const choice = ModelRouting.choice(route, area, figure, plan, config);
              expect(choice.model === ModelRouting.haiku).toBe(choice.reasoningBudget !== null);
            }
  });

  it("the fallback is Sonnet", () => {
    expect(ModelRouting.sonnet).toBe(AISettings.strongModel);
    expect(ModelRouting.firstTextDeadline).toBe(30);
  });

  it("new models are priced", () => {
    expect(ModelPrice.rate("google/gemini-3.8-flash").outputPerMillion).toBe(4.125);
    expect(ModelPrice.rate("z-ai/glm-5.3-flash").inputPerMillion).toBe(0.0052);
    expect(ModelPrice.rate("anthropic/claude-haiku-5.5").outputPerMillion).toBe(0.5);
    expect(ModelPrice.rate("deepseek/deepseek-v4.1-flash").inputPerMillion).toBe(0.045);
    expect(ModelPrice.rate(AISettings.lessonModel).outputPerMillion).toBe(0.5);
  });

  it("prices unknown models as Sonnet, batch at half, and unnamed tokens as output", () => {
    expect(ModelPrice.rate("someone/new-model")).toEqual(ModelPrice.rate(AISettings.strongModel));
    expect(ModelPrice.rate("anthropic/claude-sonnet-5").inputPerMillion).toBe(2);
    expect(ModelPrice.rate("anthropic/claude-sonnet-5").cacheReadPerMillion).toBe(0.2);
    expect(ModelPrice.rate("anthropic/claude-haiku-5.5:batch").outputPerMillion).toBe(0.25);
    // 1M prompt (half cached) + 1M completion + 1M reasoning only in the total, on Haiku 5.5.
    expect(ModelPrice.estimate(AISettings.defaultModel, 1_000_000, 1_000_000, 500_000, 3_000_000)).toBeCloseTo(
      0.05 + 0.005 + 1.0,
      10,
    );
  });
});

describe("CheapFirstRouting", () => {
  it("never starts on Sonnet", () => {
    for (const area of areas)
      for (const figure of [false, true])
        for (const route of routes) {
          expect(ModelRouting.choice(route, area, figure, "paid", "cheapFirst").model).not.toBe(ModelRouting.sonnet);
        }
  });

  it("cheap-first routing", () => {
    const plan = ModelRouting.plan(null);
    expect(ModelRouting.choice("strong", "math", false, plan, "cheapFirst")).toEqual(haikuThink);
    expect(ModelRouting.choice("strong", "other", false, plan, "cheapFirst")).toEqual(haikuThink);
    expect(ModelRouting.choice("strong", "math", true, plan, "cheapFirst")).toEqual(gemini);
    expect(ModelRouting.choice("strong", "other", true, plan, "cheapFirst")).toEqual(gemini);
    expect(ModelRouting.choice("strong", "physicsChemistry", false, plan, "cheapFirst")).toEqual(gemini);
    expect(ModelRouting.choice("fast", "reading", false, plan, "cheapFirst")).toEqual(gemini);
  });

  it("the current config is unchanged", () => {
    expect(ModelRouting.choice("strong", "math", true, "paid", "current")).toEqual(sonnet);
    expect(ModelRouting.choice("strong", "other", false, "paid", "current")).toEqual(sonnet);
  });

  it("explain better", () => {
    expect(ModelRouting.explainBetterModel(ModelRouting.haiku, false, "current")).toBe(AISettings.strongModel);
    expect(ModelRouting.explainBetterModel(ModelRouting.haiku, false, "cheapFirst")).toBe(ModelRouting.gemini);
    expect(ModelRouting.explainBetterModel(ModelRouting.gemini, false, "cheapFirst")).toBe(AISettings.strongModel);
    expect(ModelRouting.explainBetterModel(ModelRouting.haiku, true, "cheapFirst")).toBe(AISettings.strongModel);
  });

  it("config defaults to cheap-first", () => {
    expect(ModelRouting.config(null)).toBe("cheapFirst");
    expect(ModelRouting.config("current")).toBe("current");
    expect(ModelRouting.config("nonsense")).toBe("cheapFirst");
    expect(ModelRouting.plan(null)).toBe("paid");
    expect(ModelRouting.plan("free")).toBe("free");
  });
});
