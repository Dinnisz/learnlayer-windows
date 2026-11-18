// Port of LearnLayerTests/MascotClickGuideTests.swift @ ref 2026-11-04 (the beat, the steps a click walks, the spot
// beside a datum, and the session's walk: first step underlined, moving on by itself, stopped by a click or a pick,
// each step said while the mascot is on it, words not formulas). The sphere's body and the voice canvas are the UI's.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeProblemSolution } from "../problems/problemSolution";
import type { ExamQuestion } from "../problems/questionDetector";
import { QuestionSession } from "../problems/questionSession";
import type { SolutionProvider } from "../problems/solutionProvider";
import { MascotGuide } from "./mascotGuide";
import { VoiceFormula } from "./voiceFormula";

describe("the mascot walking the steps", () => {
  it("each step gets a beat long enough to travel and read", () => {
    expect(MascotGuide.beat(0, 0)).toBe(MascotGuide.minimumBeat);
    expect(MascotGuide.beat(10_000, 20)).toBe(MascotGuide.maximumBeat);
    expect(MascotGuide.beat(40, 2)).toBeGreaterThan(MascotGuide.beat(40, 0));
    expect(MascotGuide.beat(40, 1, true)).toBeLessThan(MascotGuide.beat(40, 1));
  });

  it("a click walks the solution from the open step, and a hint's step only", () => {
    expect(MascotGuide.steps(true, false, null, 0, 3)).toEqual([0, 1, 2]);
    expect(MascotGuide.steps(true, false, 1, 0, 3)).toEqual([1, 2]);
    expect(MascotGuide.steps(true, false, 9, 0, 3)).toEqual([2]);
    expect(MascotGuide.steps(false, true, null, 2, 3)).toEqual([1]);
    expect(MascotGuide.steps(false, true, null, 0, 3)).toEqual([]);
    expect(MascotGuide.steps(false, false, null, 2, 3)).toEqual([]);
    expect(MascotGuide.steps(true, false, null, 0, 0)).toEqual([]);
  });

  it("beside a datum the sphere covers no words of the text", () => {
    const text = { x: 100, y: 50, width: 400, height: 120 };
    const datum = { x: 180, y: 90, width: 60, height: 16 };
    const size = 84;
    const room = MascotGuide.spot(datum, text, { width: 1200, height: 800 }, size);
    expect(room.x - size / 2).toBeGreaterThanOrEqual(500);
    expect(room.y).toBe(98);
    // No room on the right: it waits on the left of the text instead.
    const tight = MascotGuide.spot(datum, text, { width: 520, height: 800 }, size);
    expect(tight.x + size / 2).toBeLessThanOrEqual(100);
  });

  it("what it says is a cue to what to look at, then the step", () => {
    expect(MascotGuide.narration("Soma-se.", ["v0 = 12 m/s"], false, false)).toBe("Repara em «v0 = 12 m/s». Soma-se.");
    expect(MascotGuide.narration("Soma-se.", ["a"], true, true)).toBe("Olha para a figura. Soma-se.");
    expect(MascotGuide.narration("Add.", ["a = 2", "t = 5"], false, false, true)).toBe(
      "Notice “a = 2” and “t = 5”. Add.",
    );
    expect(MascotGuide.narration("Soma-se.", [], false, false)).toBe("Soma-se.");
  });
});

const statement = "Um carro parte com v0 = 12 m/s e acelera com a = 2 m/s² durante t = 5 s.";
const json =
  '{"subject":"Física","parts":[{"label":"1","asks":"Calcule a velocidade final.","hint":"Use v = v0 + a t.","answer":"22 m/s","cards":[' +
  '{"title":"Dados","note":"Os dados.","latex":"","quotes":["v0 = 12 m/s"]},' +
  '{"title":"Aceleração","note":"Durante 5 s.","latex":"","quotes":["a = 2 m/s²","t = 5 s"]},' +
  '{"title":"Velocidade","note":"Somar.","latex":"v = 12 + 2 \\\\cdot 5 = 22"}]}]}';

function session(): QuestionSession {
  const zero = { x: 0, y: 0, width: 0, height: 0 };
  const question: ExamQuestion = {
    label: "1",
    group: "1",
    pageIndex: 0,
    labelBounds: zero,
    bounds: zero,
    text: statement,
    groupText: statement,
    groupLabels: ["1"],
    groupBounds: null,
    startsOnPreviousPage: false,
    statementBounds: null,
    statementPageIndex: null,
  };
  const provider = {
    firstChoice: () => ({ model: "anthropic/claude-haiku-5.5", reasoningBudget: null }),
  } as unknown as SolutionProvider;
  const opened = new QuestionSession(
    { question },
    { provider, config: () => "cheapFirst", language: () => "Portuguese (Portugal)" },
  );
  opened.showForTesting(decodeProblemSolution(JSON.parse(json)));
  opened.mode = "solution";
  return opened;
}

describe("the session's walk (QuestionSession.mascotClicked)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("asking for the solution never moves the mascot", () => {
    const opened = session();
    expect(opened.mascotFocusStep).toBeNull();
    expect(opened.isGuiding).toBe(false);
    opened.finishCascade();
    expect(opened.mascotFocusStep).toBeNull();
  });

  it("a click sends the mascot to the first step with its data underlined", () => {
    const opened = session();
    opened.beginCascadeForTesting(0);
    expect(opened.mascotClicked(true)).toBe(true);
    expect(opened.isGuiding).toBe(true);
    expect(opened.mascotFocusStep).toBe(0);
    // Its data is underlined the moment it is there, and the step is on screen.
    expect(opened.underlinedStep).toBe(0);
    expect(opened.cascadingCount ?? opened.stepCount).toBeGreaterThanOrEqual(1);
    // The figure is drawn up to that step, not the finished picture.
    expect(opened.figureStep).toBe(1);
    expect(opened.figureRevealed).toBe(false);
    opened.stopGuide();
  });

  it("the mascot moves on to the next step by itself, then rests", async () => {
    const opened = session();
    opened.mascotClicked(true);
    expect(opened.mascotFocusStep).toBe(0);
    await vi.advanceTimersByTimeAsync(MascotGuide.maximumBeat * 1000);
    expect(opened.mascotFocusStep).toBe(1);
    expect(opened.underlinedStep).toBe(1);
    await vi.advanceTimersByTimeAsync(MascotGuide.maximumBeat * 2000);
    expect(opened.isGuiding).toBe(false);
  });

  it("a second click or picking a step stops it", () => {
    const opened = session();
    opened.finishCascade();
    opened.mascotClicked(true);
    expect(opened.mascotClicked(true)).toBe(true);
    expect(opened.mascotFocusStep).toBeNull();
    opened.mascotClicked(true);
    opened.select(2);
    expect(opened.mascotFocusStep).toBeNull();
    expect(opened.underlinedStep).toBe(2);
    opened.mascotClicked(true);
    expect(opened.mascotFocusStep).toBe(2);
    opened.cancel();
    expect(opened.mascotFocusStep).toBeNull();
  });

  it("each step is said while the mascot is on it", async () => {
    const opened = session();
    const said: [number, number | null][] = [];
    const steps = opened.guideSteps;
    opened.mascotClicked(true, async (step) => void said.push([step, opened.mascotFocusStep]));
    await vi.advanceTimersByTimeAsync(MascotGuide.maximumBeat * 1000 * (steps.length + 1));
    expect(said.map(([step]) => step)).toEqual(steps);
    expect(said.every(([step, focus]) => step === focus)).toBe(true);
  });

  it("stopping the guide stops the voice waiting on a step", async () => {
    const opened = session();
    let started = 0;
    opened.mascotClicked(true, (_, signal) => {
      started += 1;
      return new Promise((resolve) => signal.addEventListener("abort", () => resolve()));
    });
    await vi.advanceTimersByTimeAsync(50);
    opened.stopGuide();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(started).toBe(1);
    expect(opened.mascotFocusStep).toBeNull();
  });

  it("what is said is words, not the formula", () => {
    const opened = session();
    for (const step of opened.guideSteps) {
      const spoken = opened.spokenStepText(step);
      expect(spoken).toBeTruthy();
      expect(spoken).not.toContain("\\");
    }
    expect(opened.narratedStep(0, false, false)).toBe("Repara em «v0 = 12 m/s». Dados. Os dados.");
  });

  it("what is on screen is known, so it is not written again", () => {
    const opened = session();
    opened.finishCascade();
    const shown = opened.onScreenText;
    expect(shown).toContain(opened.question.text);
    expect(shown.some((text) => text.includes("Velocidade"))).toBe(true);
    expect(VoiceFormula.isOnScreen("v_0 = 12", shown)).toBe(true);
    expect(VoiceFormula.isOnScreen("v = 12 + 2 \\cdot 5 = 22", shown)).toBe(true);
  });

  it("with nothing to explain the click goes to talk", () => {
    const opened = session();
    opened.mode = "tryIt";
    expect(opened.mascotClicked(false)).toBe(false);
    expect(opened.mascotFocusStep).toBeNull();
  });
});
