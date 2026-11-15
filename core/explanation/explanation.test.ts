// The formula explainer: the prompt (v14), the steps by what the student chose, the checks against the equation, and
// the equation found on a page by its text.

import { describe, expect, test } from "vitest";
import { DiskCache } from "../ai/diskCache";
import type { ModelClient } from "../ai/modelClient";
import { AISettings } from "../ai/modelRouting";
import mockExplanation from "../mocks/MockExplanation.json";
import type { PageText, Rect } from "../pdf/page";
import {
  decodeExplanationScript,
  EquationDetector,
  ExplanationPrompt,
  ExplanationProvider,
  ExplanationSession,
  looksLikeMath,
  type ExplanationScript,
} from "./explanation";

function memoryFiles() {
  const store = new Map<string, string>();
  return {
    read: async (name: string) => store.get(name) ?? null,
    write: async (name: string, text: string) => void store.set(name, text),
  };
}

const equationText = "x(t) = x₀ + v₀t + ½at²";
const equation = {
  text: equationText,
  context: "A car speeds up.",
  has: (target: string) => equationText.includes(target),
};

function session(
  script: () => ExplanationScript = () => decodeExplanationScript(mockExplanation),
  intent: "explain" | "tryIt" | "graph" | "solve" | null = null,
) {
  const provider = new ExplanationProvider({
    cache: new DiskCache("explanations.json", 100, memoryFiles()),
    client: () => {
      throw new Error("no network in tests");
    },
    language: () => "Portuguese (Portugal)",
    mock: script,
  });
  return new ExplanationSession(equation, provider, intent);
}

describe("ExplanationPrompt", () => {
  test("is version 14 and sends the equation with the text around it", () => {
    expect(ExplanationPrompt.version).toBe("14");
    expect(
      ExplanationPrompt.system("English").startsWith(
        "You are LearnLayer, a calm maths and science tutor inside a PDF reader.",
      ),
    ).toBe(true);
    expect(ExplanationPrompt.user("E = mc²", "Energy.")).toBe(
      "Equation (read from the PDF's text, so spacing or symbols may be slightly off):\nE = mc²\n\nText around it on the page:\nEnergy.",
    );
  });
});

describe("ExplanationSession", () => {
  test("opening costs nothing: the steps load on the first choice", async () => {
    const open = session();
    expect(open.state.kind).toBe("ready");
    expect(open.script).toBeNull();
    open.choose("explain");
    for (let tries = 0; tries < 200 && open.state.kind !== "ready"; tries++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    expect(open.state.kind).toBe("ready");
    expect(open.script).not.toBeNull();
    expect(open.steps.every((step) => step.kind === "step" || step.kind === "animation")).toBe(true);
    expect(open.steps.length).toBeGreaterThan(0);
  });

  test("let me try: the question, one hint, a click on the right piece shows the rest", async () => {
    const open = session(undefined, "tryIt");
    await open.load();
    expect(open.steps.map((step) => step.kind)).toEqual(["question"]);
    expect(open.canShowHint).toBe(true);
    open.showHint();
    expect(open.canShowHint).toBe(false);
    open.answer("v₀");
    expect(open.feedback).toBe("notQuite");
    open.answer("a");
    expect(open.feedback).toBe("correct");
    expect(open.hasMoreSteps).toBe(false);
    expect(open.answeredCorrectly).toBe(false);
  });

  test("marks, answers and symbols that point at text the equation lacks are dropped", async () => {
    const script = decodeExplanationScript(mockExplanation);
    script.steps = [
      { kind: "question", text: "Which is α?", answer: "a", marks: null, showsGraph: null },
      {
        kind: "step",
        text: "x",
        answer: null,
        marks: [
          { style: "circle", target: "a" },
          { style: "underline", target: "not in it" },
        ],
        showsGraph: null,
      },
    ];
    script.symbols = [
      { target: "v₀", meaning: "initial speed" },
      { target: "k", meaning: "nothing here" },
    ];
    const open = session(() => script, "explain");
    await open.load();
    expect(open.marks).toEqual([{ style: "circle", target: "a" }]);
    expect(open.symbols.map((symbol) => symbol.target)).toEqual(["v₀"]);
    // The question's Greek letter is the equation's own symbol.
    expect(open.script?.steps[0]?.text).toBe("Which is a?");
  });

  test("maths that fails its checks is asked of the stronger model", async () => {
    const wrong = decodeExplanationScript({
      ...mockExplanation,
      checks: [{ kind: "equal", left: "2*x", right: "3*x", variable: null, from: null, to: null }],
    });
    const right = decodeExplanationScript(mockExplanation);
    const models: string[] = [];
    const provider = new ExplanationProvider({
      cache: new DiskCache("explanations.json", 100, memoryFiles()),
      client: (model) => {
        models.push(model);
        return {
          complete: async () => ({
            content: JSON.stringify(model === AISettings.strongModel ? right : wrong),
            cost: 0,
          }),
        } as unknown as ModelClient;
      },
      language: () => "English",
    });
    const open = new ExplanationSession(equation, provider, "explain");
    await open.load();
    expect(open.state.kind === "failed" ? String((open.state as { error: unknown }).error) : open.state.kind).toBe(
      "ready",
    );
    expect(models).toEqual([AISettings.defaultModel, AISettings.strongModel]);
    expect(open.model).toBe(AISettings.strongModel);
    expect(open.isUnverified).toBe(false);
  });
});

describe("EquationDetector", () => {
  function page(lines: { text: string; x: number; y: number }[]): PageText {
    let text = "";
    const boxes: (Rect | null)[] = [];
    lines.forEach((line, index) => {
      if (index > 0) {
        text += "\n";
        boxes.push(null);
      }
      for (const [at] of [...line.text].entries()) boxes.push({ x: line.x + at * 6, y: line.y, width: 6, height: 12 });
      text += line.text;
    });
    return {
      index: 0,
      mediaBox: { x: 0, y: 0, width: 595, height: 842 },
      text,
      boxes,
      page: () => null,
      pageCount: () => 1,
    };
  }

  test("prose is not maths; a displayed equation is", () => {
    expect(looksLikeMath("The car moves along the road with constant speed.")).toBe(false);
    expect(looksLikeMath("x(t) = x₀ + v₀t + ½at²")).toBe(true);
    expect(looksLikeMath("F = ma")).toBe(true);
    expect(looksLikeMath("ab")).toBe(false);
  });

  test("a click on the equation finds it, with the piece of it a step names", () => {
    const sheet = page([
      { text: "The position of the car is given by", x: 50, y: 700 },
      { text: "x(t) = x0 + v0 t + a t^2 / 2", x: 120, y: 670 },
      { text: "where a is the acceleration of the car.", x: 50, y: 640 },
    ]);
    const found = EquationDetector.equation(sheet, { x: 150, y: 676 })!;
    expect(found).not.toBeNull();
    expect(found.text).toBe("x(t) = x0 + v0 t + a t^2 / 2");
    expect(EquationDetector.equation(sheet, { x: 100, y: 706 })).toBeNull();
    expect(EquationDetector.rectOnPage(sheet, found.bounds, "v0")).not.toBeNull();
    expect(EquationDetector.rectOnPage(sheet, found.bounds, "speed")).toBeNull();
    expect(EquationDetector.context(sheet, found.bounds)).toContain("position of the car");
  });
});
