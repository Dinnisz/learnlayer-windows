// Port of LearnLayerTests/SolutionRevealTests.swift (pacing and voice) and SolveProgressTests.swift @ ref 2026-11-04.
// The session cases are in questionSession.test.ts.

import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import pt from "../i18n/locales/pt-PT.json";
import {
  solveClock,
  SolutionReveal,
  SolveKind,
  SolveProgress,
  solveStages,
  type SolveKind as Kind,
} from "./solutionReveal";

describe("SolutionReveal pacing", () => {
  it("gives each step a beat between the shortest and the longest", () => {
    expect(SolutionReveal.gap(0, 0)).toBe(SolutionReveal.minimumGap);
    expect(SolutionReveal.gap(10_000, 9)).toBe(SolutionReveal.maximumGap);
    const short = SolutionReveal.gap(20, 0);
    expect(SolutionReveal.gap(60, 0)).toBeGreaterThan(short);
    expect(SolutionReveal.gap(20, 2)).toBeGreaterThan(short);
  });

  it("is quicker with Reduce Motion but still one by one", () => {
    const reduced = SolutionReveal.gap(40, 1, true);
    expect(reduced).toBeLessThan(SolutionReveal.gap(40, 1));
    expect(reduced).toBeGreaterThan(0.5);
  });

  it("brings the steps in one after another, never together", () => {
    const schedule = SolutionReveal.schedule([30, 80, 10, 50], [1, 0, 2, 0]);
    expect(schedule.count).toBe(4);
    expect(schedule.starts[0]).toBe(SolutionReveal.lead);
    for (let index = 1; index < schedule.starts.length; index += 1) {
      const gap = schedule.starts[index]! - schedule.starts[index - 1]!;
      expect(gap).toBeGreaterThanOrEqual(SolutionReveal.minimumGap - 1e-9);
      expect(gap).toBeLessThanOrEqual(SolutionReveal.maximumGap + 1e-9);
    }
    let previous = 0;
    for (let tick = 0; tick <= schedule.answerAt + 1; tick += 0.05) {
      const shown = schedule.shown(tick);
      expect(shown - previous).toBeLessThanOrEqual(1);
      previous = shown;
    }
    expect(previous).toBe(4);
  });

  it("shows nothing before the lead and the first step then", () => {
    const schedule = SolutionReveal.schedule([10, 10], [0, 0]);
    expect(schedule.shown(0)).toBe(0);
    expect(schedule.revealing(0)).toBeNull();
    expect(schedule.shown(SolutionReveal.lead)).toBe(1);
    expect(schedule.revealing(SolutionReveal.lead)).toBe(0);
  });

  it("ends after the last step with a breath", () => {
    const schedule = SolutionReveal.schedule([10, 40, 90], [0, 1, 0]);
    const last = schedule.starts[2]!;
    expect(schedule.answerAt).toBeGreaterThanOrEqual(last + SolutionReveal.answerHold - 1e-9);
    expect(schedule.showsAnswer(last)).toBe(false);
    expect(schedule.revealing(last)).toBe(2);
    expect(schedule.showsAnswer(schedule.answerAt)).toBe(true);
    expect(schedule.revealing(schedule.answerAt)).toBeNull();
    expect(schedule.nextEvent(schedule.answerAt)).toBeNull();
  });

  it("has the next step, then the answer, as its next event", () => {
    const schedule = SolutionReveal.schedule([10, 10], [0, 0]);
    expect(schedule.nextEvent(0)).toBe(schedule.starts[0]);
    expect(schedule.nextEvent(schedule.starts[0]!)).toBe(schedule.starts[1]);
    expect(schedule.nextEvent(schedule.starts[1]!)).toBe(schedule.answerAt);
  });

  it("gives the next step its whole beat when resumed", () => {
    const schedule = SolutionReveal.schedule([10, 50, 20], [0, 0, 0]);
    expect(schedule.resumeElapsed(0)).toBe(0);
    const resumed = schedule.resumeElapsed(2);
    expect(resumed).toBe(schedule.starts[1]);
    expect(schedule.shown(resumed)).toBe(2);
    expect(schedule.nextEvent(resumed)).toBe(schedule.starts[2]);
    expect(schedule.resumeElapsed(9)).toBe(schedule.starts[2]);
  });

  it("has only the answer when there are no steps", () => {
    const schedule = SolutionReveal.schedule([], []);
    expect(schedule.count).toBe(0);
    expect(schedule.shown(100)).toBe(0);
    expect(schedule.showsAnswer(SolutionReveal.lead)).toBe(true);
  });
});

describe("SolutionReveal voice", () => {
  const steps = [["v0 = 12 m/s"], ["a = 2 m/s²", "t = 5 s"], ["v0 = 12 m/s", "t = 5 s"]];

  it("takes the step whose data is said", () => {
    expect(SolutionReveal.spokenStep(steps, "Now take a = 2 m/s² for t = 5 s.")).toBe(1);
    expect(SolutionReveal.spokenStep(steps, "It starts at v0 = 12 m/s and lasts t = 5 s.")).toBe(2);
    expect(SolutionReveal.spokenStep(steps, "Nothing from the statement here.")).toBeNull();
    expect(SolutionReveal.spokenStep(steps, null)).toBeNull();
    expect(SolutionReveal.spokenStep(steps, "")).toBeNull();
  });

  it("moves forward, not back, on a datum two steps share", () => {
    expect(SolutionReveal.spokenStep(steps, "Recall v0 = 12 m/s.")).toBe(0);
    expect(SolutionReveal.spokenStep(steps, "Recall v0 = 12 m/s.", 1)).toBe(2);
    expect(SolutionReveal.spokenStep(steps, "Recall v0 = 12 m/s.", 2)).toBe(2);
    expect(SolutionReveal.spokenStep([["x = 1"], ["x = 1"]], "x = 1", 5)).toBe(0);
  });

  it("brings the spoken step on screen and never takes one away", () => {
    expect(SolutionReveal.shown(1, 2, 4)).toBe(3);
    expect(SolutionReveal.shown(3, 0, 4)).toBe(3);
    expect(SolutionReveal.shown(2, null, 4)).toBe(2);
    expect(SolutionReveal.shown(2, 9, 4)).toBe(4);
  });
});

describe("SolveProgress", () => {
  const dwell = SolveProgress.dwell;

  it("opens on the question and does not invent later stages", () => {
    let clock = solveClock();
    expect(SolveProgress.stage(clock, 0)).toBe("reading");
    expect(SolveProgress.stage(clock, dwell * 4)).toBe("reading");
    clock = { ...clock, solveCallAt: 0.2 };
    expect(SolveProgress.stage(clock, 0.2)).toBe("reading");
    expect(SolveProgress.stage(clock, dwell)).toBe("solving");
    expect(SolveProgress.stage(clock, 60)).toBe("solving");
  });

  it("names a figure only once the solve is looking at it", () => {
    let clock = solveClock({ hasFigure: true });
    expect(SolveProgress.stage(clock, dwell)).toBe("reading");
    clock = { ...clock, figureAt: 1, solveCallAt: 1 };
    expect(SolveProgress.stage(clock, 1)).toBe("reading");
    expect(SolveProgress.stage(clock, dwell)).toBe("figure");
    expect(SolveProgress.stage(clock, dwell * 2)).toBe("solving");
  });

  it("shows equations when they arrive and a check only when it starts", () => {
    let clock = solveClock({ hasFigure: true, figureAt: 0.4, equationsAt: 4, solveCallAt: 0.4 });
    expect(SolveProgress.stage(clock, 4)).toBe("figure");
    expect(SolveProgress.stage(clock, 6)).toBe("equations");
    expect(SolveProgress.stage(clock, 8)).toBe("solving");
    clock = { ...clock, equationsAt: null };
    expect(SolveProgress.stage(clock, 30)).toBe("solving");
    clock = { ...clock, checkingAt: 9 };
    expect(SolveProgress.stage(clock, 8.9)).not.toBe("checking");
    expect(SolveProgress.stage(clock, 9)).toBe("checking");
    clock = { ...clock, ready: true };
    expect(SolveProgress.stage(clock, 30)).toBeNull();
  });

  it("never walks a phrase backwards", () => {
    expect(SolveProgress.stage(solveClock({ equationsAt: 20, solveCallAt: 1 }), 20, "solving")).toBe("solving");
    expect(SolveProgress.stage(solveClock({ solveCallAt: 0, checkingAt: 2 }), 2, "reading")).toBe("checking");
  });

  it("does not take a rhetorical figure for a diagram", () => {
    expect(SolveProgress.mentionsFigure("Identifique a figura de estilo.")).toBe(false);
    expect(SolveProgress.mentionsFigure("Name the figure of speech.")).toBe(false);
    expect(SolveProgress.mentionsFigure("No circuito da figura, as malhas são I1, I2 e I3.")).toBe(true);
    expect(SolveProgress.mentionsFigure("From the graph below, read the value.")).toBe(true);
    expect(SolveProgress.figureStarted('{"figure": null}')).toBe(false);
    expect(SolveProgress.figureStarted('{"figure": "três malhas"}')).toBe(true);
    expect(SolveProgress.equationsStarted('{"steps": ["explica"]}')).toBe(false);
    expect(SolveProgress.equationsStarted('{"latex": "R_1 I_1"}')).toBe(true);
  });

  const samples: [Kind, string][] = [
    ["circuit", "No circuito da figura, calcule a resistência equivalente."],
    ["circuit", "Use Kirchhoff to find the loop currents."],
    ["induction", "Prove n por indução que 2^n > n."],
    ["induction", "Prove by induction that the sum is n(n+1)/2."],
    ["graph", "A partir do gráfico, indique o máximo da função."],
    ["graph", "Read the zero from the graph."],
    ["calculus", "Calcule a derivada de f(x) = x^2 e o limite em 0."],
    ["calculus", "Find the limit of the derivative."],
    ["text", "Comente a segunda estrofe do poema."],
    ["text", "Summarise the passage in the text."],
    ["chemistry", "Quantas moles existem em 18 g de água?"],
    ["chemistry", "Balance the chemical reaction."],
    ["generic", "Resolva a equação 2x + 3 = 7."],
    ["generic", "Solve for x."],
  ];

  it("picks the kind from the question's words", () => {
    for (const [kind, sample] of samples) expect(SolveKind.detect(sample), sample).toBe(kind);
    expect(SolveKind.detect("")).toBe("generic");
  });

  it("has short phrases in English and Portuguese for every kind", () => {
    const english = en as unknown as Record<string, unknown>;
    const portuguese = pt as unknown as Record<string, string | undefined>;
    const kinds: Kind[] = ["generic", "circuit", "induction", "graph", "calculus", "text", "chemistry"];
    for (const kind of kinds) {
      for (const stage of solveStages) {
        const phrase = SolveProgress.phrase(stage, kind);
        expect(english[phrase], phrase).toBeDefined();
        expect(phrase.endsWith("…") && Array.from(phrase).length <= 28, phrase).toBe(true);
        const translated = portuguese[phrase] ?? "";
        expect(translated.endsWith("…") && Array.from(translated).length <= 28, phrase).toBe(true);
      }
    }
    expect(portuguese["Reading the circuit…"]).toBe("A ler o circuito…");
    expect(portuguese["Identifying the loops…"]).toBe("A identificar as malhas…");
    expect(portuguese["Setting up the induction…"]).toBe("A montar a indução…");
    expect(portuguese["Analysing the graph…"]).toBe("A analisar o gráfico…");
    expect(portuguese["Reading the text…"]).toBe("A ler o texto…");
    expect(portuguese["Reading the question…"]).toBe("A ler o enunciado…");
  });

  it("speaks each kind's own phrase and falls back for the others", () => {
    expect(SolveProgress.phrase("reading", "circuit")).toBe("Reading the circuit…");
    expect(SolveProgress.phrase("equations", "circuit")).toBe("Identifying the loops…");
    expect(SolveProgress.phrase("equations", "induction")).toBe("Setting up the induction…");
    expect(SolveProgress.phrase("reading", "graph")).toBe("Analysing the graph…");
    expect(SolveProgress.phrase("reading", "text")).toBe("Reading the text…");
    expect(SolveProgress.phrase("equations", "chemistry")).toBe("Balancing the equation…");
    expect(SolveProgress.phrase("reading", "generic")).toBe("Reading the question…");
    expect(SolveProgress.phrase("equations", "text")).toBe("Setting up the equations…");
    expect(SolveProgress.phrase("solving", "circuit")).toBe("Solving…");
    expect(SolveProgress.dwell).toBe(2.5);
  });
});
