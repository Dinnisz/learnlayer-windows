// Port of LearnLayerTests/EquationStudyActionTests.swift and `explanationStudyMenuBuildsLocalPremade`
// (FigureRenderingPolicyTests.swift) @ ref 2026-11-04.

import { describe, expect, it, vi } from "vitest";
import { DiskCache } from "../ai/diskCache";
import type { ModelClient } from "../ai/modelClient";
import mockExplanation from "../mocks/MockExplanation.json";
import { CompiledIllustration } from "../illustrations/illustration";
import { decodeExplanationScript, ExplanationPrompt, ExplanationProvider, ExplanationSession } from "./explanation";
import { EquationStudyActions, ExplanationFigure, explicitProducts, ParsedStandaloneMath } from "./studyAction";

describe("the study menu of a clicked function or equation", () => {
  it("parses a function definition", () => {
    const parsed = ParsedStandaloneMath.parse("f(x) = x^2 - 4*x + 1");
    expect(parsed?.functionName).toBe("f");
    expect(parsed?.variable).toBe("x");
    expect(parsed?.expression.includes("x^2")).toBe(true);
    expect(parsed?.isEquation).toBe(false);
  });

  it("does not parse prose", () => {
    expect(ParsedStandaloneMath.parse("Determine o valor de x.")).toBeNull();
  });

  it("the menu has Solve for equations and not for pure functions", () => {
    const equation = { functionName: "2*x+1", variable: "x", expression: "2*x+1=0", isEquation: true, raw: "2*x+1=0" };
    expect(EquationStudyActions.menuOptions(equation)).toContain("solveEquation");
    const function_ = ParsedStandaloneMath.parse("g(t) = 3*t + 2")!;
    expect(EquationStudyActions.menuOptions(function_)).not.toContain("solveEquation");
  });

  it("maps the study actions to templates and premades", () => {
    expect(EquationStudyActions.explanationTemplate("monotonicity")).toBe("derivativeMonotonicity");
    expect(EquationStudyActions.explanationTemplate("integral")).toBe("integral");
    expect(EquationStudyActions.explanationTemplate("solveEquation")).toBe("solveEquation");
    expect(EquationStudyActions.premadeFigure("graph")).toBe("functionGraph");
    expect(EquationStudyActions.premadeFigure("integral")).toBe("integralArea");
    expect(EquationStudyActions.premadeFigure("solveEquation")).toBe("equationSteps");
  });

  it("the prompt mentions the premade and the template", () => {
    const parsed = ParsedStandaloneMath.parse("f(x) = x^2")!;
    const text = EquationStudyActions.promptAddendum("zeros", parsed);
    expect(text).toContain("functionGraph");
    expect(text.includes("f(x) = x^2") || text.includes("x^2")).toBe(true);
  });

  it("the study menu builds a local premade that draws", () => {
    const parsed = ParsedStandaloneMath.parse("f(x) = x^2 - 1")!;
    expect(ExplanationFigure.localPremade("graph", parsed, null)?.type).toBe("functionGraph");
    const compiled = ExplanationFigure.compiled(null, "graph", parsed.raw, "English", true);
    expect(compiled).not.toBeNull();
    expect(new CompiledIllustration(compiled!).isDrawable).toBe(true);
    // An equation to solve, before the model answers: its one line, as the first step.
    const equation = ParsedStandaloneMath.parse("2x + 3 = 11");
    expect(ExplanationFigure.localPremade("solveEquation", equation, null)?.params["steps"]).toEqual([
      { line: "2x + 3 = 11" },
    ]);
  });

  it("a function read with implicit products is drawn (the figures put the variable in by name)", () => {
    expect(explicitProducts("x^2-4x+3")).toBe("x^2-4*x+3");
    expect(explicitProducts("2(x+1) - 3.5x")).toBe("2*(x+1) - 3.5*x");
    expect(explicitProducts("log10(x) + 1e5 + x2")).toBe("log10(x) + 1e5 + x2");
    const text = "f(x) = x^2 - 4x + 3";
    expect(ExplanationFigure.compiled(null, "graph", text, "Portuguese (Portugal)", true)).not.toBeNull();
    expect(ExplanationFigure.compiled(null, "integral", text, "Portuguese (Portugal)", true)).not.toBeNull();
  });

  it("the task goes into the message, after the equation and before the plan (ExplanationPrompt.user)", () => {
    const message = ExplanationPrompt.user("f(x) = x^2", "context", "", "PLAN", "zeros");
    const task = message.indexOf("Study task: zeros.");
    expect(task).toBeGreaterThan(message.indexOf("f(x) = x^2"));
    expect(task).toBeLessThan(message.indexOf("PLAN"));
    expect(ExplanationPrompt.user("f(x) = x^2", "context")).not.toContain("Study task");
  });
});

describe("choosing a task from the study menu", () => {
  const files = () => {
    const store = new Map<string, string>();
    return {
      read: async (name: string) => store.get(name) ?? null,
      write: async (name: string, text: string) => void store.set(name, text),
    };
  };
  const clicked = { text: "f(x) = x^2 - 4", context: "Estude a função.", has: () => true };

  it("asks the model with the task's note, and solves line by line", async () => {
    const messages: string[] = [];
    const provider = new ExplanationProvider({
      cache: new DiskCache("explanations.json", 100, files()),
      client: () =>
        ({
          complete: async (request: { user: string }) => {
            messages.push(request.user);
            return { content: JSON.stringify(mockExplanation), cost: 0 };
          },
        }) as unknown as ModelClient,
      language: () => "English",
    });
    const session = new ExplanationSession(clicked, provider);
    session.chooseStudy("zeros", ParsedStandaloneMath.parse(clicked.text));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await vi.waitFor(() => expect(session.state.kind).toBe("ready"));
    expect(session.intent).toBe("solve");
    expect(session.studyAction).toBe("zeros");
    expect(messages[0]).toContain("Study task: zeros.");
    expect(messages[0]).toContain("Parsed function: f(x) = x^2");
    // Another task is another request: the task is part of the cache key.
    const again = new ExplanationSession(clicked, provider);
    again.chooseStudy("derivative", ParsedStandaloneMath.parse(clicked.text));
    await vi.waitFor(() => expect(again.state.kind).toBe("ready"));
    expect(messages).toHaveLength(2);
    expect(messages[1]).toContain("Study task: derivative.");
  });

  it("a task that needs a function, on a click that is not one, is solved as it is", () => {
    const provider = new ExplanationProvider({
      cache: new DiskCache("explanations.json", 100, files()),
      client: () => {
        throw new Error("no network in tests");
      },
      language: () => "English",
      mock: () => decodeExplanationScript(mockExplanation),
    });
    const session = new ExplanationSession({ ...clicked, text: "v = d/t" }, provider);
    session.chooseStudy("graph", null);
    expect(session.studyAction).toBeNull();
    expect(session.intent).toBe("solve");
  });
});
