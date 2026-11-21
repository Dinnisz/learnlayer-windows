// Port of LearnLayerTests/SolidFigureDisplayTests.swift @ 5701363: a solid of revolution beside the steps, drawn by
// itself once the solution arrives, shown once ("Draw It" toggles that one), and the solid and the graph in one box.
// The Mac's `debugShow` puts a solution and a drawing in place; here a solver and a drawer that never call a network
// answer at once. The volume is the answer's (8π), so the app's own check lets the solid through.

import { describe, expect, it } from "vitest";
import { DiskCache, type DataFiles } from "../ai/diskCache";
import type { Illustration } from "../illustrations/illustration";
import { decodeProblemSolution, type ProblemSolution } from "./problemSolution";
import type { ExamQuestion } from "./questionDetector";
import { QuestionSession } from "./questionSession";
import { SolutionProvider } from "./solutionProvider";

const statement =
  "Find the volume of the solid obtained by rotating the region under y = sqrt(x), 0 <= x <= 4, about the x-axis.";

function memoryFiles(): DataFiles {
  const files = new Map<string, string>();
  return {
    read: async (name) => files.get(name) ?? null,
    write: async (name, contents) => void files.set(name, contents),
  };
}

function question(): ExamQuestion {
  const zero = { x: 0, y: 0, width: 0, height: 0 };
  return {
    label: "2",
    group: "2",
    pageIndex: 0,
    labelBounds: zero,
    bounds: zero,
    text: statement,
    groupText: statement,
    groupLabels: ["2"],
    groupBounds: null,
    startsOnPreviousPage: false,
    statementBounds: null,
    statementPageIndex: null,
  };
}

function solution(withGraph: boolean): ProblemSolution {
  const graph = withGraph
    ? `,"graph":{"xLabel":"x","yLabel":"y","variable":"x","expression":"sqrt(x)","xMin":0,"xMax":4,"showsCar":false}`
    : "";
  return decodeProblemSolution(
    JSON.parse(
      `{"subject":"Calculus","drawing":true${graph},"parts":[{"label":"2","asks":"Volume.","answer":{"text":"8π"},"answerLatex":"8\\\\pi"}]}`,
    ),
  )!;
}

const solid: Illustration = {
  title: "Sólido de revolução",
  width: 400,
  height: 300,
  elements: [],
  premade: { type: "solid_of_revolution", params: { f: "sqrt(x)", a: 0, b: 4 } },
};

const until = async (condition: () => boolean) => {
  for (let tries = 0; tries < 200 && !condition(); tries += 1) await new Promise((resolve) => setTimeout(resolve, 5));
};

/** A session with the solution open; `drawings` counts the drawer's calls. */
async function opened(withGraph: boolean) {
  const drawings = { count: 0 };
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
    mockSolution: () => solution(withGraph),
    sleep: async () => {},
  });
  const session = new QuestionSession(
    { question: question() },
    {
      provider,
      config: () => "cheapFirst",
      subject: null,
      illustrate: async () => {
        drawings.count += 1;
        return solid;
      },
    },
  );
  // «Resolução» chosen before the solver answered: nothing to draw from yet.
  session.choose("solution");
  await until(() => session.illustrationState === "ready");
  return { session, drawings };
}

describe("a solid beside the steps", () => {
  it("is asked for when the solution arrives, once", async () => {
    const { session, drawings } = await opened(false);
    expect(session.illustrationState).toBe("ready");
    expect(drawings.count).toBe(1);
    // Already drawn: not asked twice.
    expect(session.wantsFigureBesideSteps).toBe(false);
  });

  it("shows once, and Draw It toggles that one", async () => {
    const { session } = await opened(false);
    expect(session.solutionFigure).not.toBeNull();
    expect(session.drawingIsBesideSteps).toBe(true);
    expect(session.drawingVisible).toBe(true);
    expect(session.showsIllustrationPanel).toBe(false);
    // "Hide Drawing" hides the one copy.
    session.toggleIllustration();
    expect(session.drawingVisible).toBe(false);
    expect(session.solutionFigure).toBeNull();
    expect(session.showsIllustrationPanel).toBe(false);
    // "Draw It" brings it back, still once.
    session.toggleIllustration();
    expect(session.drawingVisible).toBe(true);
    expect(session.solutionFigure).not.toBeNull();
    expect(session.showsIllustrationPanel).toBe(false);
  });
});

describe("the solid and the graph in one box", () => {
  it("share one box that opens on the solid", async () => {
    const { session } = await opened(true);
    expect(session.figureIs3D).toBe(true);
    expect(session.figureTabs).toEqual(["figure", "graph"]);
    expect(session.activeFigureTab).toBe("figure");
    expect(session.figureIsBoxed).toBe(true);
    session.selectFigureTab("graph");
    expect(session.activeFigureTab).toBe("graph");
    session.selectFigureTab("figure");
    expect(session.activeFigureTab).toBe("figure");
  });

  it("follows the buttons", async () => {
    const { session } = await opened(true);
    // "Hide Graph": the solid alone, still in its box.
    session.toggleGraph();
    expect(session.figureTabs).toEqual(["figure"]);
    expect(session.figureIsBoxed).toBe(true);
    // "Show the graph": back, and on show.
    session.toggleGraph();
    expect(session.activeFigureTab).toBe("graph");
    // "Hide Drawing": the graph alone, as before (no box, no tabs).
    session.toggleIllustration();
    expect(session.figureTabs).toEqual(["graph"]);
    expect(session.figureIsBoxed).toBe(false);
    // "Draw It": the solid again, on show, once.
    session.toggleIllustration();
    expect(session.activeFigureTab).toBe("figure");
    expect(session.showsIllustrationPanel).toBe(false);
  });
});
