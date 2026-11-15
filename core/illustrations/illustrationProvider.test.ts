// The illustration prompt (v22) and the provider's retries, with a fake model and the Mac's rules for what is drawn.

import { describe, expect, test } from "vitest";
import { DiskCache } from "../ai/diskCache";
import type { ModelClient } from "../ai/modelClient";
import { decodeProblemSolution, type Part } from "../problems/problemSolution";
import { CompiledIllustration, type Illustration } from "./illustration";
import { IllustrationPrompt } from "./illustrationPrompt";
import { hasDataTable, IllustrationProvider, prepareFigure } from "./illustrationProvider";

function memoryFiles() {
  const store = new Map<string, string>();
  return {
    read: async (name: string) => store.get(name) ?? null,
    write: async (name: string, text: string) => void store.set(name, text),
  };
}

function fakeClient(replies: unknown[]) {
  const asked: string[] = [];
  const client = {
    complete: async (request: { user: string }) => {
      asked.push(request.user);
      const next = replies.shift();
      if (next === undefined) throw new Error("no more replies");
      return { content: JSON.stringify(next), cost: 0 };
    },
  } as unknown as ModelClient;
  return { client, asked };
}

function part(json: string): Part {
  return decodeProblemSolution(JSON.parse(`{"subject":"Matemática A","parts":[${json}]}`)).parts[0]!;
}

const empty = { title: "f", width: 10, height: 6, duration: null, parameters: [], elements: [], needsFigure: null };

describe("IllustrationPrompt", () => {
  test("is version 22 and keeps the Mac's words", () => {
    expect(IllustrationPrompt.version).toBe("22");
    const system = IllustrationPrompt.system("Portuguese (Portugal)");
    expect(system.startsWith("You draw one illustration that helps a university student see an exam question")).toBe(
      true,
    );
    expect(system).toContain("Mathematics and sciences, built up step by step with pt-PT labels:");
    expect(system).toContain("heatingCurve {m in g");
    expect(system).toContain('Every "text" short, in Portuguese (Portugal)');
    expect(system.trimEnd().endsWith("Reply with JSON only.")).toBe(true);
  });

  test("the complex plane is told to include the derived number", () => {
    expect(IllustrationPrompt.system("English")).toContain("z²");
  });

  test("the user message is the exam, the part, its steps and answer, and the figure when read", () => {
    const p = part(`{"label":"1.","asks":"Calcule.","steps":["a","b"],"answer":{"text":"4"}}`);
    expect(IllustrationPrompt.user("Texto", p, null)).toBe(
      "The exam's text:\nTexto\n\nThe part: 1., which asks: Calcule.\nIts solution: a → b\nAnswer: 4",
    );
    expect(IllustrationPrompt.user("Texto", p, "um gráfico")).toContain("\n\nThe figure, as transcribed:\num gráfico");
  });
});

describe("FigureRenderingPolicy", () => {
  test("a template is compiled by the app", () => {
    const reply: Illustration = { ...empty, template: { kind: "function", f: "x^2 - 1", xMin: -2, xMax: 2 } };
    const prepared = prepareFigure(reply, "English", true, false);
    expect(prepared.outcome).toBe("template");
    expect(prepared.illustration.elements.length).toBeGreaterThan(0);
  });

  test("free-form elements are kept only where no template applies", () => {
    const projectile: Illustration = {
      ...empty,
      elements: [{ kind: "line", x: "0", y: "0", x2: "1", y2: "1" }],
    };
    expect(prepareFigure(projectile, "English", true, false).outcome).toBe("withheld");
    const circuit: Illustration = {
      ...empty,
      elements: [{ kind: "component", x: "1", y: "1", x2: "4", y2: "1", component: "resistor" }],
    };
    expect(prepareFigure(circuit, "English", true, false).outcome).toBe("freeForm");
  });

  test("a premade figure the app knows is drawn from its params", () => {
    const reply: Illustration = {
      ...empty,
      premade: { type: "functionGraph", params: { f: "x^3 - x", xMin: -2, xMax: 2 } },
    };
    const prepared = prepareFigure(reply, "English", true, false);
    expect(prepared.outcome).toBe("premade");
    expect(new CompiledIllustration(prepared.illustration).isDrawable).toBe(true);
  });

  test("a table of measurements is three lines of numbers", () => {
    expect(hasDataTable("h d\n0,10 0,47\n0,13 0,59\n0,18 0,77")).toBe(true);
    expect(hasDataTable("1 2\nsome words\n3 4")).toBe(false);
  });
});

describe("IllustrationProvider", () => {
  const question = "Considere a função f(x) = x^2 - 4.";
  const solved = part(
    `{"label":"1.","asks":"Esboce o gráfico.","steps":["zeros em ±2"],"answer":{"text":"zeros −2 e 2"}}`,
  );

  test("asks once more when the model draws free-form, then keeps the template it sends", async () => {
    const { client, asked } = fakeClient([
      { ...empty, elements: [{ kind: "line", x: "0", y: "0", x2: "1", y2: "1" }] },
      { ...empty, template: { kind: "function", f: "x^2 - 4", xMin: -3, xMax: 3 } },
    ]);
    const provider = new IllustrationProvider({
      cache: new DiskCache("illustrations.json", 100, memoryFiles()),
      client: () => client,
    });
    const drawn = await provider.illustration({ groupText: question, part: solved, figure: null, language: "English" });
    expect(asked.length).toBe(2);
    expect(asked[1]).toContain("Your last reply drew free-form elements");
    expect(drawn.elements.length).toBeGreaterThan(0);
    expect(new CompiledIllustration(drawn).isDrawable).toBe(true);
  });

  test("a drawing is saved: asking again costs nothing", async () => {
    const { client, asked } = fakeClient([
      { ...empty, template: { kind: "function", f: "x^2 - 4", xMin: -3, xMax: 3 } },
    ]);
    const provider = new IllustrationProvider({
      cache: new DiskCache("illustrations.json", 100, memoryFiles()),
      client: () => client,
    });
    await provider.illustration({ groupText: question, part: solved, figure: null, language: "English" });
    await provider.illustration({ groupText: question, part: solved, figure: null, language: "English" });
    expect(asked.length).toBe(1);
  });

  // As on the Mac: an unknown premade twice gives an empty drawing, which the stage shows as nothing to draw.
  test("a figure that can't be drawn twice, with nothing to fall back on, comes back empty", async () => {
    const text = "Descreva a cena.";
    const prose = part(`{"label":"1.","asks":"Descreva.","answer":{"text":"Uma cena."}}`);
    const { client } = fakeClient([
      { ...empty, premade: { type: "noSuchFigure", params: {} } },
      { ...empty, premade: { type: "noSuchFigure", params: {} } },
    ]);
    const provider = new IllustrationProvider({
      cache: new DiskCache("illustrations.json", 100, memoryFiles()),
      client: () => client,
    });
    const drawn = await provider.illustration({ groupText: text, part: prose, figure: null, language: "English" });
    expect(drawn.elements).toEqual([]);
  });
});
