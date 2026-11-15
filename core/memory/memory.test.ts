// Port of LearnLayerTests/MemoryBrainTests.swift @ ref 2026-11-04 (the beliefs, habits, planner and graph; the sync
// cases come with the sync in phase 8).

import { describe, expect, test } from "vitest";
import {
  Beliefs,
  ExplanationPlanner,
  MemoryStore,
  PedagogicalFloor,
  plannerInput,
  Plans,
  PreferenceEstimate,
  preferenceDimensions,
  stableBucket,
  swiftDate,
  type StoredOutcome,
  type StoredSignal,
} from "./memory";

const store = () => MemoryStore.inMemory();

function quiet(suffix: string): string {
  for (let n = 0; ; n++) {
    const text = `quiet-${suffix}-${n}`;
    const bucket = stableBucket(text);
    if (bucket < 10 || bucket >= 22) return text;
  }
}

describe("Beliefs", () => {
  test("a correct answer raises confidence and a miss lowers it", () => {
    const belief = Beliefs.make("local/derivadas");
    const before = Beliefs.probability(belief);
    Beliefs.apply(belief, "similarCorrect", 3);
    expect(Beliefs.probability(belief)).toBeGreaterThan(before);
    expect(belief.confirmedSuccesses).toBe(1);
    const mid = Beliefs.probability(belief);
    Beliefs.apply(belief, "similarWrong", 3);
    expect(Beliefs.probability(belief)).toBeLessThan(mid);
  });

  test("difficulty scales success up and misses down", () => {
    expect(Beliefs.scale(5, true)).toBeGreaterThan(Beliefs.scale(1, true));
    expect(Beliefs.scale(1, false)).toBeGreaterThan(Beliefs.scale(5, false));
  });

  test("decay pulls toward the prior without scheduling anything", () => {
    const belief = {
      conceptID: "local/limites",
      alpha: 10,
      beta: 2,
      lastEvidence: 0,
      confirmedSuccesses: 2,
      reachedFluent: true,
    };
    const before = Beliefs.probability(belief);
    Beliefs.decay(belief, Beliefs.halfLifeDays(belief));
    expect(Beliefs.probability(belief)).toBeLessThan(before);
    expect(Beliefs.probability(belief)).toBeGreaterThan(0.5);
    expect(belief.lastEvidence).toBe(0);
    expect(Beliefs.halfLifeDays(belief)).toBe(45 * 3);
  });

  test("a success lends a little evidence to the prerequisite", () => {
    const memory = store();
    memory.linkPrereq("local/limites", "local/derivadas");
    const before = memory.belief("local/limites").alpha;
    memory.observe("similarCorrect", "local/derivadas", 3);
    expect(memory.belief("local/limites").alpha).toBeGreaterThan(before);
  });
});

describe("Preferences", () => {
  test("fewer than five events stays at the default", () => {
    const memory = store();
    memory.observeSignal({ kind: "mascot", ask: "analogy" }, "math", "learning", "exercise");
    memory.observeSignal({ kind: "mascot", ask: "analogy" }, "math", "learning", "exercise");
    expect(memory.emphasis("analogy", "math", "learning", "exercise")).toBe("default");
  });

  test("repeated analogy asks cross the hysteresis", () => {
    const memory = store();
    for (let i = 0; i < 6; i++)
      memory.observeSignal({ kind: "mascot", ask: "analogy" }, "math", "learning", "exercise");
    expect(memory.emphasis("analogy", "math", "learning", "exercise")).toBe("more");
    expect(PreferenceEstimate.level(0.2, "more", 6, false)).toBe("more");
    expect(PreferenceEstimate.level(0.1, "more", 6, false)).toBe("default");
    expect(PreferenceEstimate.level(0.4, "default", 4, false)).toBe("default");
  });

  test("old signals weigh less", () => {
    const now = swiftDate(Date.now() / 1000);
    const context = "math|learning|exercise";
    const fresh: StoredSignal = { dimension: "visual", context, direction: 1, weight: 1, at: now };
    const old: StoredSignal = { ...fresh, at: now - 60 * 86_400 };
    const recent = PreferenceEstimate.value(Array(6).fill(fresh), "visual", context, now).x;
    const faded = PreferenceEstimate.value(Array(6).fill(old), "visual", context, now).x;
    expect(faded).toBeLessThan(recent);
  });

  test("a requested emphasis that does not help freezes", () => {
    const outcomes: StoredOutcome[] = [
      ...Array.from({ length: 4 }, (): StoredOutcome => ({
        dimension: "visual",
        emphasis: "more",
        correct: false,
        at: 0,
      })),
      { dimension: "visual", emphasis: "default", correct: true, at: 0 },
    ];
    expect(PreferenceEstimate.shouldFreeze(outcomes, "visual")).toBe(true);
    const memory = store();
    for (const outcome of outcomes) memory.observeOutcome(outcome.dimension, outcome.emphasis, outcome.correct);
    expect(memory.emphasis("visual", "math", "learning", "exercise")).toBe("default");
  });

  test("algebra follows mistakes, not requests", () => {
    const memory = store();
    for (let i = 0; i < 8; i++)
      memory.observeSignal({ kind: "explainBetter", focus: "algebra" }, "math", "learning", "exercise");
    expect(memory.emphasis("algebra", "math", "learning", "exercise")).toBe("default");
    expect(PreferenceEstimate.attributions({ kind: "explainBetter", focus: "algebra" })).toEqual([]);
    memory.observeSkill("chain-rule", false);
    memory.observeSkill("chain-rule", false);
    expect(memory.emphasis("algebra", "math", "learning", "exercise")).toBe("more");
  });

  test("the plan does not name a learning style", () => {
    const block = Plans.promptBlock(
      ExplanationPlanner.plan(plannerInput({ question: quiet("style"), kind: "exercise" })),
    );
    expect(block).not.toContain('"style"');
    expect(block.toLowerCase()).not.toContain("learner");
    expect(preferenceDimensions.includes("style" as never)).toBe(false);
  });
});

describe("Planner", () => {
  test("a new exercise opens on a hint, with the solution one tap away", () => {
    const plan = ExplanationPlanner.plan(
      plannerInput({ question: quiet("exercise"), kind: "exercise", state: "new", adaptationsEnabled: false }),
    );
    expect(plan.hintFirst).toBe(true);
    expect(plan.revealFinalResult).toBe("on_tap");
  });

  test("«mostra tudo» opens the full solution", () => {
    const plan = ExplanationPlanner.plan(
      plannerInput({
        question: quiet("all"),
        kind: "exercise",
        state: "new",
        adaptationsEnabled: false,
        utterance: "mostra tudo",
      }),
    );
    expect(plan.hintFirst).toBe(false);
    expect(plan.revealFinalResult).toBe("inline");
    expect(PedagogicalFloor.requestsFullReveal("Mostra-me tudo")).toBe(true);
    expect(PedagogicalFloor.requestsFullReveal("dá-me uma pista")).toBe(false);
  });

  test("a formula is direct", () => {
    const plan = ExplanationPlanner.plan(
      plannerInput({ question: quiet("formula"), kind: "formula", state: "new", adaptationsEnabled: false }),
    );
    expect(plan.mode).toBe("direct");
    expect(plan.hintFirst).toBe(false);
    expect(plan.revealFinalResult).toBe("inline");
  });

  test("a fluent concept collapses to text", () => {
    const plan = ExplanationPlanner.plan(
      plannerInput({ question: quiet("fluent"), kind: "formula", state: "fluent", adaptationsEnabled: false }),
    );
    expect(plan.collapseRoutineSteps).toBe(true);
    expect(plan.maxSteps).toBeLessThanOrEqual(3);
    expect(plan.channel).toBe("text");
  });

  test("exam eve stays short and does not quiz", () => {
    const plan = ExplanationPlanner.plan(
      plannerInput({
        question: quiet("eve"),
        kind: "exercise",
        state: "learning",
        examEve: true,
        adaptationsEnabled: false,
      }),
    );
    expect(plan.maxSteps).toBeLessThanOrEqual(3);
    expect(plan.checkQuestion).toBe(false);
    expect(plan.hintFirst).toBe(true);
  });

  test("gaming asks for a hint and skips the lecture", () => {
    const plan = ExplanationPlanner.plan(
      plannerInput({
        question: quiet("game"),
        kind: "exercise",
        state: "learning",
        gaming: true,
        adaptationsEnabled: false,
      }),
    );
    expect(plan.hintFirst).toBe(true);
    expect(plan.revealFinalResult).toBe("on_tap");
    expect(plan.checkQuestion).toBe(false);
    expect(ExplanationPlanner.looksLikeGaming(4, 600)).toBe(true);
    expect(ExplanationPlanner.looksLikeGaming(3, 600)).toBe(false);
  });

  test("turning adaptations off ignores a visual habit", () => {
    const ignored = ExplanationPlanner.plan(
      plannerInput({
        question: quiet("visual"),
        kind: "formula",
        state: "learning",
        adaptationsEnabled: false,
        visual: "more",
      }),
    );
    expect(ignored.pointer).toBe(false);
    const kept = ExplanationPlanner.plan(
      plannerInput({
        question: quiet("visual"),
        kind: "formula",
        state: "learning",
        adaptationsEnabled: true,
        visual: "more",
      }),
    );
    expect(kept.pointer).toBe(true);
    expect(kept.voiceStyle).toBe("pointing");
  });

  test("less analogy clears the anchors", () => {
    const plan = ExplanationPlanner.plan(
      plannerInput({
        question: quiet("anchor"),
        kind: "formula",
        state: "learning",
        anchors: ["o carro"],
        analogy: "less",
      }),
    );
    expect(plan.anchors).toEqual([]);
  });

  test("the stable bucket is the Mac's FNV-1a", () => {
    // FNV-1a 32-bit of "a" is 0xE40C292C.
    expect(stableBucket("a")).toBe(0xe40c292c % 100);
  });
});

describe("Graph", () => {
  test("recording a question can be reopened, and deleting tombstones it", () => {
    const memory = store();
    const id = memory.record({
      text: "Qual é a derivada de x^2?",
      documentName: "exame.pdf",
      page: 2,
      concepts: ["local/derivadas"],
      kind: "exercise",
      language: "pt-PT",
      explanationJSON: '{"steps":[{"text":"2x"}]}',
      area: "math",
    });
    expect(memory.explanationJSON(id)).toContain("2x");
    const again = memory.record({
      text: "Qual é a derivada de x^2?",
      documentName: null,
      page: null,
      concepts: ["local/derivadas"],
      kind: "exercise",
      language: "pt-PT",
      explanationJSON: null,
      area: "math",
    });
    expect(again).toBe(id);
    memory.delete(id);
    expect(memory.liveNodes.some((node) => node.id === id)).toBe(false);
    expect(memory.explanationJSON(id)).toBeNull();
  });

  test("the memory is saved to memory.json and read back", async () => {
    const files = new Map<string, string>();
    const disk = {
      read: async (name: string) => files.get(name) ?? null,
      write: async (name: string, text: string) => void files.set(name, text),
    };
    const memory = await MemoryStore.open(disk);
    memory.record({
      text: "F = ma",
      documentName: "fisica.pdf",
      page: 1,
      concepts: ["local/newton"],
      kind: "formula",
      language: "pt-PT",
      explanationJSON: null,
      area: "physics",
    });
    await memory.flushed();
    const reopened = await MemoryStore.open(disk);
    expect(reopened.liveNodes.filter((node) => node.kind === "question").length).toBe(1);
    expect(reopened.liveNodes.some((node) => node.kind === "document")).toBe(true);
  });
});
