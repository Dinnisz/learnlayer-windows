// Port of LearnLayerTests/SolveScopeTests.swift, the session cases of QuestionDetectorTests and SolutionRevealTests,
// and the escalation rules of QuestionSession.show/confirm @ ref 2026-11-04, with a solver that never calls a network.

import { describe, expect, it } from "vitest";
import mockSolution from "../mocks/MockSolution.json";
import { DiskCache, type DataFiles } from "../ai/diskCache";
import { ProblemPrompt } from "../prompts/problemPrompt";
import { decodeProblemSolution, restrictedTo, type ProblemSolution } from "./problemSolution";
import { QuestionPages } from "./questionPages";
import type { ExamQuestion } from "./questionDetector";
import { QuestionSession, QuestionSessionRules } from "./questionSession";
import { SolutionProvider, type SolverServices } from "./solutionProvider";
import { framedTestPage } from "../testing/testPages";
import { questionsOn } from "./questionDetector";

function memoryFiles(): DataFiles {
  const files = new Map<string, string>();
  return {
    read: async (name) => files.get(name) ?? null,
    write: async (name, contents) => void files.set(name, contents),
  };
}

function question(
  label: string,
  groupText: string,
  groupLabels: string[],
  text = groupText,
  group = label.split(/[.(]/)[0]!,
): ExamQuestion {
  const zero = { x: 0, y: 0, width: 0, height: 0 };
  return {
    label,
    group,
    pageIndex: 0,
    labelBounds: zero,
    bounds: zero,
    text,
    groupText,
    groupLabels,
    groupBounds: null,
    startsOnPreviousPage: false,
    statementBounds: null,
    statementPageIndex: null,
  };
}

/** A solver answering with `solution` (from "the model", after no wait), counting its calls. */
function provider(answer: () => ProblemSolution, extra: Partial<SolverServices> = {}) {
  const calls = { solves: 0 };
  const services: SolverServices = {
    solutions: new DiskCache<ProblemSolution>("solutions.json", 100, memoryFiles()),
    escalated: new DiskCache<boolean>("escalated-answers.json", 300, memoryFiles()),
    client: () => {
      throw new Error("no network in tests");
    },
    hasCredentials: () => false,
    config: () => "cheapFirst",
    plan: () => "paid",
    language: () => "English",
    mockSolution: () => {
      calls.solves += 1;
      return answer();
    },
    sleep: async () => {},
    ...extra,
  };
  return { provider: new SolutionProvider(services), calls };
}

function session(q: ExamQuestion, answer: () => ProblemSolution, subject: string | null = null) {
  const solver = provider(answer);
  return {
    session: new QuestionSession({ question: q }, { provider: solver.provider, config: () => "cheapFirst", subject }),
    calls: solver.calls,
  };
}

const until = async (condition: () => boolean) => {
  for (let tries = 0; tries < 200 && !condition(); tries += 1) await new Promise((resolve) => setTimeout(resolve, 5));
};

function answered(
  parts: [string, string][],
  subject = "Matemática A",
  extra: Record<string, unknown> = {},
): ProblemSolution {
  return decodeProblemSolution({
    subject,
    parts: parts.map(([label, text]) => ({
      label,
      asks: "a",
      hint: "h",
      steps: [],
      answer: { text, expression: null },
    })),
    ...extra,
  });
}

const romanGroup = ["3", "3(i)", "3(ii)", "3(iii)", "3(iv)"];

describe("Solve scope", () => {
  it("keeps only the asked question in a solution", () => {
    const four = answered(
      ["1", "2", "3", "4"].map((label) => [label, "A"]),
      "Biologia e Geologia",
    );
    expect(restrictedTo(four, ["1"]).parts.map((part) => part.label)).toEqual(["1"]);
    expect(restrictedTo(four, ["2", "3"]).parts.map((part) => part.label)).toEqual(["2", "3"]);
    expect(
      restrictedTo(
        answered([
          ["2(a)", "A"],
          ["2(b)", "A"],
          ["3", "A"],
        ]),
        ["2(a)", "2(b)"],
      ).parts.length,
    ).toBe(2);
    expect(
      restrictedTo(
        answered([
          ["a)", "A"],
          ["b)", "A"],
        ]),
        ["(b)"],
      ).parts.map((part) => part.label),
    ).toEqual(["b)"]);
    expect(
      restrictedTo(
        answered([
          ["x", "A"],
          ["y", "A"],
        ]),
        ["1"],
      ).parts.length,
    ).toBe(2);
    expect(
      restrictedTo(
        answered([
          ["x", "A"],
          ["y", "A"],
        ]),
        [],
      ).parts.length,
    ).toBe(2);
  });

  it("shows a clicked part's own answer from the group's solution", () => {
    const group = answered([
      ["3(i)", "contínua"],
      ["3(ii)", "crescente"],
      ["3(iii)", "mínimo 0"],
      ["3(iv)", "[0, +∞["],
    ]);
    const part = QuestionSessionRules.part("3(iii)", group, romanGroup, true)!;
    expect(part.label).toBe("3(iii)");
    expect(part.answer.text).toBe("mínimo 0");
    expect(QuestionSessionRules.showsAlone("3(iii)", group, romanGroup)).toBe(true);
    const bare = answered([
      ["(i)", "contínua"],
      ["(ii)", "crescente"],
      ["(iii)", "mínimo 0"],
      ["(iv)", "[0, +∞["],
    ]);
    expect(QuestionSessionRules.part("3(iii)", bare, romanGroup, true)?.answer.text).toBe("mínimo 0");
    expect(QuestionSessionRules.part("3(ii)", bare, romanGroup, true)?.answer.text).toBe("crescente");
  });

  it("does not show a combined group answer for one part", () => {
    const combined = answered([["3", "(i) contínua (ii) crescente (iii) mínimo 0 (iv) [0, +∞["]]);
    expect(QuestionSessionRules.showsAlone("3(iii)", combined, romanGroup)).toBe(false);
    expect(QuestionSessionRules.part("3(iii)", combined, romanGroup, false)).toBeNull();
    expect(QuestionSessionRules.part("3(iii)", combined, romanGroup, true)).not.toBeNull();
  });

  it("names only the asked labels in the request", () => {
    const message = ProblemPrompt.user("1. Pergunta um.", ["1"], null, false);
    expect(message).toContain("Use exactly these labels for the parts, one part each: 1");
    expect(message).toContain("Answer only these");
  });

  it("solves a clicked part alone with the group as context", () => {
    expect(QuestionSessionRules.solveLabels("3(i)", romanGroup)).toEqual(["3(i)"]);
    expect(QuestionSessionRules.solveLabels("2.2", ["2.1", "2.2", "2.3"])).toEqual(["2.2"]);
    expect(QuestionSessionRules.solveLabels("3", romanGroup)).toEqual(romanGroup);
    expect(QuestionSessionRules.solveLabels("1", ["1", "10"])).toEqual(["1"]);
    expect(QuestionSessionRules.solveLabels("4", ["4"])).toEqual(["4"]);
    expect(QuestionSessionRules.solveLabels("4", ["4.1", "4.2"])).toEqual(["4.1", "4.2"]);
  });

  it("asks the session only for the clicked part but keeps the group", () => {
    const groupText =
      "3. Seja f(x) = x/(1+x^2).\n(i) Estude a continuidade.\n(ii) Estude a monotonia.\n(iii) Calcule os extremos.\n(iv) Indique o contradomínio.";
    const { session: clicked } = session(
      question("3(i)", groupText, romanGroup, "(i) Estude a continuidade.", "3"),
      () => answered([]),
    );
    expect(clicked.partLabels).toEqual(romanGroup);
    expect(clicked.solveLabels).toEqual(["3(i)"]);
    expect(clicked.requestText.startsWith(groupText)).toBe(true);
    expect(clicked.requestText.endsWith(QuestionSessionRules.onlyPartNote("3(i)"))).toBe(true);
    const message = ProblemPrompt.user(clicked.requestText, clicked.solveLabels, null, false);
    expect(message).toContain("one part each: 3(i).");
    expect(message).toContain("do not solve");
  });

  it("gives a part solve a smaller budget", () => {
    expect(ProblemPrompt.maxTokens(["3(i)"])).toBe(7000);
    expect(ProblemPrompt.maxTokens(["3(i)", "3(ii)"])).toBe(16000);
  });

  it("sends a clean one-page question without its picture", () => {
    const page = framedTestPage("x");
    const q = (text: string) => question("2.1", text, ["2.1"], text, "2");
    expect(QuestionPages.textSuffices(q("2.1. Calcule o limite da função no ponto a."), [page])).toBe(true);
    expect(QuestionPages.textSuffices(q("2.1. Observe a figura 1 e calcule a área."), [page])).toBe(false);
    expect(QuestionPages.textSuffices(q("2.1. Seja f(x) =\narcsen x 1+x2"), [page])).toBe(false);
    expect(QuestionPages.textSuffices(q("2.1. Calcule o limite da função no ponto a."), [page, page])).toBe(false);
  });
});

describe("QuestionSession labels from the detector", () => {
  it("keeps separate numbered questions apart", () => {
    const page = framedTestPage(
      [
        "1. Calcule o valor de 2 + 3 e justifique a resposta.",
        "2. Resolva a equação x + 1 = 4 no conjunto dos reais.",
        "3. Determine a derivada da função f(x) = x².",
        "4. Indique o domínio da função g(x) = 1/x.",
      ].join("\n"),
    );
    for (const found of questionsOn(page)) {
      expect(session(found, () => answered([])).session.partLabels).toEqual([found.label]);
    }
  });

  it("solves the leaves of a nested item", () => {
    const page = framedTestPage(
      [
        "1. Enunciado da questão um com texto suficiente para a identificar.",
        "1.1. Primeira subquestão com o seu próprio enunciado e dados.",
        "1.2. Segunda subquestão com outro enunciado completamente distinto.",
        "1.2.1. Terceiro nível dentro da segunda subquestão com texto.",
        "1.2.2 Outro item do terceiro nível, sem ponto final no rótulo.",
        "1.2.2.1 Quarto nível dentro do item anterior com mais texto.",
      ].join("\n"),
    );
    const deep = questionsOn(page).find((found) => found.label === "1.2.1")!;
    expect(new Set(session(deep, () => answered([])).session.partLabels)).toEqual(new Set(["1.1", "1.2.1", "1.2.2.1"]));
  });
});

describe("QuestionSession solving", () => {
  const mockQuestion = () =>
    question(
      "I.1",
      "I.1) The potential V(z) on the axis of the disc.",
      ["I.1", "I.2", "I.3"],
      "I.1) The potential.",
      "I",
    );

  it("opens quietly without a call and solves on the first choice, once", async () => {
    const { session: open, calls } = session(mockQuestion(), () => decodeProblemSolution(mockSolution));
    await open.openQuietly();
    expect(calls.solves).toBe(0);
    expect(open.solution).toBeNull();
    open.choose("hint");
    open.choose("solution");
    await until(() => open.state.kind === "ready");
    expect(open.state.kind).toBe("ready");
    expect(open.part?.label).toBe("I.1");
    expect(calls.solves).toBe(1);
    expect(open.usedHint && open.sawSolution).toBe(true);
  });

  it("finds a saved answer when the question is opened again", async () => {
    const solver = provider(() => decodeProblemSolution(mockSolution));
    const services = { provider: solver.provider, config: () => "cheapFirst" as const };
    const first = new QuestionSession({ question: mockQuestion() }, services);
    first.choose("solution");
    await until(() => first.state.kind === "ready");
    const again = new QuestionSession({ question: mockQuestion() }, services);
    await again.openQuietly();
    await until(() => again.state.kind === "ready");
    expect(again.part?.label).toBe("I.1");
    expect(solver.calls.solves).toBe(1);
  });

  it("does not confirm an answer whose check fails, and does when the checks pass", async () => {
    const failing = () =>
      answered([["1", "x = 3"]], "Matemática A", { checks: [{ kind: "equal", left: "2 + 2", right: "5" }] });
    const { session: wrong, calls: wrongCalls } = session(
      question("1", "1. Quanto é 2 + 2?", ["1"]),
      failing,
      "Matemática A",
    );
    // The first answer is not confirmed: the failed check sends the question to the stronger model, and only its
    // answer counts as confirmed. (Waiting for that second answer keeps the test from racing it.)
    wrong.choose("hint");
    await until(() => wrong.state.kind === "ready" && wrongCalls.solves >= 2 && !wrong.isConfirming);
    expect(wrongCalls.solves).toBe(2);
    expect(wrong.solvedByStrongerModel).toBe(true);
    const passing = () =>
      answered([["1", "4"]], "Matemática A", { checks: [{ kind: "equal", left: "2 + 2", right: "4" }] });
    const { session: right, calls: rightCalls } = session(
      question("1", "1. Quanto é 2 + 2?", ["1"]),
      passing,
      "Matemática A",
    );
    right.choose("hint");
    await until(() => right.state.kind === "ready");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(right.isConfirmed).toBe(true);
    expect(right.solvedByStrongerModel).toBe(false);
    expect(rightCalls.solves).toBe(1);
  });

  it("checks the student's attempt numerically, and waits for confirmation before saying it differs", async () => {
    const solution = () =>
      decodeProblemSolution({
        subject: "Física",
        parts: [
          { label: "1", asks: "v?", hint: "h", steps: [], answer: { text: "v = 22 m/s", expression: "12 + 2*5" } },
        ],
        checks: [{ kind: "equal", left: "12 + 2*5", right: "22" }],
      });
    const { session: attempt } = session(question("1", "1. Um carro…", ["1"]), solution, "Física");
    attempt.choose("tryIt");
    await until(() => attempt.state.kind === "ready" && !attempt.isConfirming);
    attempt.check("22");
    expect(attempt.attemptResult).toBe("matches");
    expect(attempt.solvedAlone).toBe(true);
    attempt.check("((");
    expect(attempt.attemptResult).toBe("unreadable");
    attempt.check("21");
    expect(attempt.attemptResult).toBe("differs");
  });

  it("asks for a transcript instead of solving a listening item", async () => {
    const { session: listening, calls } = session(
      question(
        "1",
        "You will hear a conversation about a school trip.\n1. The speaker is calling to\n(A) cancel\n(B) change",
        ["1"],
      ),
      () => answered([["1", "A"]], "Inglês"),
    );
    expect(listening.needsTranscript).toBe(true);
    listening.choose("solution");
    await until(() => listening.state.kind === "ready");
    expect(calls.solves).toBe(0);
    listening.provideTranscript("Anna: I need to cancel my booking.");
    await until(() => listening.solution !== null);
    expect(calls.solves).toBe(1);
    expect(listening.requestText).toContain("Transcript of the recording, as given by the student:");
  });
});

describe("QuestionSession cascade", () => {
  const statement = "Um carro parte com v0 = 12 m/s e acelera com a = 2 m/s² durante t = 5 s.";
  const json = {
    subject: "Física",
    parts: [
      {
        label: "1",
        asks: "Calcule a velocidade final.",
        hint: "Use v = v0 + a t.",
        answer: "22 m/s",
        cards: [
          { title: "Dados", note: "Os dados.", latex: "", quotes: ["v0 = 12 m/s"] },
          { title: "Aceleração", note: "Durante 5 s.", latex: "", quotes: ["a = 2 m/s²", "t = 5 s"] },
          { title: "Velocidade", note: "Somar.", latex: "v = 12 + 2 \\cdot 5 = 22" },
        ],
      },
    ],
  };

  async function opened() {
    const { session: open } = session(question("1", statement, ["1"]), () => decodeProblemSolution(json), "Física");
    open.choose("solution");
    await until(() => open.state.kind === "ready");
    return open;
  }

  it("starts the whole solution with no steps on screen and the answer there", async () => {
    const open = await opened();
    expect(open.stepCount).toBe(3);
    expect(open.cascadingCount).toBe(0);
    expect(open.visibleSolutionSteps).toBe(0);
    expect(open.cascadeFinished).toBe(false);
    expect(open.showsFinalAnswer).toBe(true);
    expect(open.revealingStep).toBeNull();
    expect(open.figureRevealed).toBe(false);
    expect(open.figureStep).toBe(0);
  });

  it("underlines and draws the step coming in, and the pointer still wins", async () => {
    const open = await opened();
    let now = 0;
    const controller = new AbortController();
    const run = open.runCascade({
      reduceMotion: true,
      now: () => now,
      signal: controller.signal,
      sleep: async (seconds) => {
        if (open.visibleSolutionSteps >= 2) controller.abort();
        now += seconds;
      },
    });
    await run;
    expect(open.visibleSolutionSteps).toBe(2);
    expect(open.revealingStep).toBe(1);
    expect(open.underlinedStep).toBe(1);
    expect(open.figureStep).toBe(2);
    open.hover(0, true);
    expect(open.underlinedStep).toBe(0);
  });

  it("ends with every step and the answer, and stays", async () => {
    const open = await opened();
    let now = 0;
    await open.runCascade({ reduceMotion: true, now: () => now, sleep: async (seconds) => void (now += seconds) });
    expect(open.cascadingCount).toBeNull();
    expect(open.visibleSolutionSteps).toBe(3);
    expect(open.figureRevealed).toBe(true);
    await open.runCascade({ reduceMotion: true, now: () => now, sleep: async (seconds) => void (now += seconds) });
    expect(open.visibleSolutionSteps).toBe(3);
  });

  it("brings in a later step the voice names", async () => {
    const open = await opened();
    open.beginCascadeForTesting(1);
    expect(open.visibleSolutionSteps).toBe(1);
    open.voiceSaid("Accelerating at a = 2 m/s² for t = 5 s.");
    expect(open.spokenStep).toBe(1);
    expect(open.visibleSolutionSteps).toBe(2);
    expect(open.underlinedStep).toBe(1);
    open.voiceSaid(null);
    expect(open.spokenStep).toBeNull();
    expect(open.visibleSolutionSteps).toBe(2);
  });

  it("shows everything at once when finished for checks", async () => {
    const open = await opened();
    open.finishCascade();
    expect(open.cascadingCount).toBeNull();
    expect(open.visibleSolutionSteps).toBe(3);
  });

  it("does not cascade outside the whole solution", async () => {
    const open = await opened();
    open.choose("hint");
    open.nextStep();
    expect(open.cascadingCount).toBeNull();
    expect(open.revealingStep).toBeNull();
    expect(open.underlinedStep).toBe(0);
  });
});

describe("QuestionSession similar question", () => {
  it("writes the numbers in, works out the answer from the verified formula, and checks the student's", async () => {
    const reply = JSON.stringify({
      kind: "number",
      statement: "Um carro parte a {v0} e acelera a {a} durante {t}. Qual é a velocidade final?",
      values: [
        { name: "v0", value: 10, unit: "m/s" },
        { name: "a", value: 3, unit: "m/s²" },
        { name: "t", value: 4, unit: "s" },
      ],
      unit: "m/s",
      hint: "Use v = v0 + a t.",
      variable: null,
      left: null,
      right: null,
      nonZero: null,
      example: null,
    });
    const fakeClient = { complete: async () => ({ content: reply, cost: 0 }) } as unknown as ModelClientStandIn;
    const solver = provider(
      () =>
        decodeProblemSolution({
          subject: "Física",
          parts: [{ label: "1", asks: "v?", hint: "h", steps: [], answer: { text: "22 m/s", expression: "v0 + a*t" } }],
          checks: [{ kind: "equal", left: "12 + 2*5", right: "22" }],
        }),
      { client: () => fakeClient },
    );
    const open = new QuestionSession(
      { question: question("1", "1. Um carro…", ["1"]) },
      { provider: solver.provider, config: () => "cheapFirst", subject: "Física" },
    );
    open.choose("solution");
    await until(() => open.state.kind === "ready");
    expect(open.canPractiseVariant).toBe(true);
    await open.tryVariant();
    expect(open.variantState).toBe("ready");
    expect(open.variantText).toBe("Um carro parte a 10 m/s e acelera a 3 m/s² durante 4 s. Qual é a velocidade final?");
    expect(open.variantAnswer).toBe(22);
    open.checkVariant("22,1");
    expect(open.variantResult).toBe("matches");
    open.checkVariant("30");
    expect(open.variantResult).toBe("differs");
    open.backToOriginal();
    expect(open.mode).toBe("solution");
  });
});

type ModelClientStandIn = ReturnType<SolverServices["client"]>;
