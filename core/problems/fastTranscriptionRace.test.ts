// FastTranscriptionTests.swift, "The race": the question typeset from the fast model or from the solve, whichever
// comes first, handed to the stage once. The solve and the fast model are both scripted: nothing is spent.

import { describe, expect, it } from "vitest";
import { DiskCache, type DataFiles } from "../ai/diskCache";
import { FastTranscriptionReader } from "./fastTranscription";
import { decodeProblemSolution, type ProblemSolution } from "./problemSolution";
import type { ExamQuestion } from "./questionDetector";
import { QuestionSession } from "./questionSession";
import { Transcriptions, TranscriptionRequests, type QuestionTranscription } from "./questionTranscription";
import { SolutionProvider } from "./solutionProvider";

const solveQuestion = [
  { type: "text", text: "Calcula 12 e 30 e 4 e 7 no circuito (solve).", box: [0, 0, 1, 0.2], caption: null },
];
const fastReply = JSON.stringify({
  question: [
    { type: "text", text: "Calcula 12 e 30 e 4 e 7 no circuito (fast).", box: [40, 20, 960, 180], caption: null },
    { type: "figure", text: "stray", box: [500, 200, 900, 700], caption: "Figura 1" },
  ],
});
const ocr = "Calcula 12 e 30 e 4 e 7 no circuito";

function memoryFiles(): DataFiles {
  const files = new Map<string, string>();
  return {
    read: async (name) => files.get(name) ?? null,
    write: async (name, contents) => void files.set(name, contents),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function question(): ExamQuestion {
  const text = "1. Calcula 12 e 30 e 4 e 7 no circuito.";
  const zero = { x: 0, y: 0, width: 0, height: 0 };
  return {
    label: "1",
    group: "1",
    pageIndex: 0,
    labelBounds: zero,
    bounds: zero,
    text,
    groupText: text,
    groupLabels: ["1"],
    groupBounds: null,
    startsOnPreviousPage: false,
    statementBounds: null,
    statementPageIndex: null,
  };
}

const solution = (): ProblemSolution =>
  decodeProblemSolution({
    question: solveQuestion,
    subject: "Física",
    parts: [{ label: "1", asks: "Calcula.", hint: "Pensa.", answer: { text: "42", expression: null }, steps: [] }],
  });

/** A session over a picture the app shows typeset, with the solve answering after `solveDelay` ms. */
async function scripted(options: { solveDelay?: number; fast?: (() => Promise<string>) | null; requested?: boolean }) {
  const calls = { fast: 0, solves: 0 };
  const requests = new TranscriptionRequests();
  const images = [new TextEncoder().encode(`picture-${Math.random()}`)];
  if (options.requested ?? true) await requests.request(images);
  const provider = new SolutionProvider({
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
      return solution();
    },
    sleep: async () => void (await sleep(options.solveDelay ?? 0)),
  });
  const fetch = options.fast === undefined ? async () => fastReply : options.fast;
  const fast = new FastTranscriptionReader({
    cache: new DiskCache<QuestionTranscription>("fast-questions.json", 200, memoryFiles()),
    isAvailable: () => fetch !== null,
    client: () => {
      throw new Error("no network in tests");
    },
    ...(fetch
      ? {
          fetcher: () => {
            calls.fast += 1;
            return fetch();
          },
        }
      : {}),
  });
  const session = new QuestionSession(
    { question: question(), images, isPicture: true },
    {
      provider,
      config: () => "cheapFirst",
      subject: "",
      fast,
      transcribing: (sent) => requests.isRequested(sent),
    },
  );
  const received: (QuestionTranscription | null)[] = [];
  const listen = () => (session.onTranscription = (found) => received.push(found));
  const text = () => (received[0] ? Transcriptions.plainText(received[0]) : null);
  return { session, received, listen, text, calls };
}

const until = async (condition: () => boolean, ms = 3000) => {
  for (let waited = 0; waited < ms && !condition(); waited += 10) await sleep(10);
};

describe("the fast reading and the solve", () => {
  it("shows the fast reading first, and the solve doesn't replace it", async () => {
    const run = await scripted({ solveDelay: 300 });
    run.listen();
    void run.session.load();
    await until(() => run.received.length > 0);
    expect(run.received).toHaveLength(1);
    expect(run.text()).toContain("(fast)");
    expect(run.session.state.kind).toBe("loading");
    await until(() => run.session.state.kind === "ready");
    await sleep(50);
    expect(run.received).toHaveLength(1);
    expect(run.text()).toContain("(fast)");
    // The solve still runs.
    expect(run.calls.solves).toBeGreaterThanOrEqual(1);
    expect(run.session.part?.answer.text).toBe("42");
  });

  it("shows the solve's reading when the fast model is slower", async () => {
    const run = await scripted({
      fast: async () => {
        await sleep(400);
        return fastReply;
      },
    });
    run.listen();
    void run.session.load();
    await until(() => run.session.state.kind === "ready");
    await until(() => run.received.length > 0);
    expect(run.text()).toContain("(solve)");
    await sleep(500);
    expect(run.received).toHaveLength(1);
    expect(run.text()).toContain("(solve)");
  });

  it("waits for the solve when the fast reading loses the computer's numbers", async () => {
    const wrongDigits = JSON.stringify({
      question: [
        { type: "text", text: "Calcula 18 e 80 e 9 no circuito (fast).", box: [0, 0, 1000, 200], caption: null },
      ],
    });
    const run = await scripted({ solveDelay: 100, fast: async () => wrongDigits });
    run.session.rejectsFastTranscription = (found) => Transcriptions.rejection(found, null, ocr);
    run.listen();
    void run.session.load();
    await until(() => run.received.length > 0);
    expect(run.received).toHaveLength(1);
    expect(run.text()).toContain("(solve)");
  });

  it("falls back to the solve when the fast call fails or is unreadable", async () => {
    for (const fast of [
      async () => {
        throw new Error("offline");
      },
      async () => "Sorry, I can't read this.",
    ]) {
      const run = await scripted({ fast });
      run.listen();
      void run.session.load();
      await until(() => run.received.length > 0);
      expect(run.text()).toContain("(solve)");
    }
  });

  it("hands over once a reading that came before the stage was listening", async () => {
    const run = await scripted({ solveDelay: 200 });
    void run.session.load();
    // The reading has come in (held for the stage) before the stage listens; waited for, not timed, so a busy
    // machine doesn't make it listen first.
    const held = () => (run.session as unknown as { pendingTranscription: unknown }).pendingTranscription !== undefined;
    await until(held);
    expect(held()).toBe(true);
    run.listen();
    expect(run.received).toHaveLength(1);
    await until(() => run.session.state.kind === "ready");
    await sleep(50);
    expect(run.received).toHaveLength(1);
    expect(run.text()).toContain("(fast)");
  });

  it("doesn't read a page question it wasn't asked to transcribe", async () => {
    const run = await scripted({ requested: false });
    void run.session.load();
    await until(() => run.session.state.kind === "ready");
    expect(run.calls.fast).toBe(0);
  });

  it("tells the stage at once when the fast reading fails or is set aside, and asks nothing else", async () => {
    const opened = async (fast: () => Promise<string>) => {
      const run = await scripted({ fast });
      run.session.rejectsFastTranscription = (found) => Transcriptions.rejection(found, null, ocr);
      let missed = 0;
      run.session.onFastTranscriptionMissed = () => (missed += 1);
      run.listen();
      await run.session.openQuietly();
      await until(() => missed > 0 || run.received.length > 0);
      await sleep(30);
      return { missed: missed > 0, received: run.received.length, solves: run.calls.solves };
    };
    const failed = await opened(async () => {
      throw new Error("offline");
    });
    expect(failed).toEqual({ missed: true, received: 0, solves: 0 });
    const wrongDigits = JSON.stringify({
      question: [{ type: "text", text: "Calcula 18 e 80 e 9.", box: null, caption: null }],
    });
    const rejected = await opened(async () => wrongDigits);
    expect(rejected).toEqual({ missed: true, received: 0, solves: 0 });
    const shown = await opened(async () => fastReply);
    expect(shown).toEqual({ missed: false, received: 1, solves: 0 });
  });

  it("shows only the clicked part's reading", async () => {
    let round = 0;
    const readsThree = JSON.stringify({
      question: [{ type: "text", text: "(iii) Averigue.", box: null, caption: null }],
    });
    const readsTwo = JSON.stringify({
      question: [{ type: "text", text: "(ii) A função f é diferenciável?", box: null, caption: null }],
    });
    const run = await scripted({ solveDelay: 300, fast: async () => ((round += 1) === 1 ? readsThree : readsTwo) });
    run.session.fastTranscriptionPart = "ii";
    run.listen();
    void run.session.load();
    await until(() => run.received.length > 0);
    expect(run.text()).toContain("(ii) A função");
    expect(run.text()).not.toContain("(iii)");
  });
});
