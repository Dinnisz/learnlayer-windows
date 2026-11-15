// Port of the TextHelp cases of LearnLayerTests/LayoutFixTests.swift and SelectionAskTests.swift @ ref 2026-11-04.

import { describe, expect, it } from "vitest";
import mockTextHelp from "../mocks/MockTextHelp.json";
import { DiskCache, type DataFiles } from "../ai/diskCache";
import {
  decodeTextHelp,
  describePart,
  TextHelpContext,
  TextHelpMock,
  TextHelpPrompt,
  TextHelpProvider,
  type TextHelp,
} from "./textHelp";
import { decodeProblemSolution } from "./problemSolution";

const exercise = "Considere f(x) = e^{2x} − 3x.\n(a) Determine f'(x).";

const canned: TextHelp = {
  subject: "Physics",
  asks: "What the position equation says.",
  hint: "Look at each term.",
  explanation: [
    "The car starts at x₀ and already moves at v₀.",
    "The term ½at² adds the extra distance from speeding up.",
    "That t² is why the graph of position against time is a parabola.",
  ],
  graph: null,
  followUps: null,
};

describe("TextHelp", () => {
  it("answers a follow-up from its own question, not the canned reply", () => {
    const question = "Why does only E_z survive on the axis?";
    const context = TextHelpContext.followUp({
      studentQuestion: question,
      exercise: "The field of a charged disc.",
      partLabel: "I.2",
      partAsks: "The field E at the same point P.",
      partAnswer: "E_z(z) = (σ/2ε₀)(z/|z| − z/√(R² + z²))",
    });
    expect(context).toContain(`Student's question: ${question}`);
    expect(context).toContain("Current part I.2");
    const body = TextHelpMock.keyed(canned, context).explanation.join(" ");
    expect(body).toContain("E_z");
    expect(body).toContain("axis");
    expect(body).not.toContain("parabola");
    expect(body).not.toContain("½at");
    expect(TextHelpMock.keyed(canned, "Text around the equation on the page.").explanation).toEqual(canned.explanation);
  });

  it("sends no selection line with a typed question", () => {
    const typed = TextHelpContext.followUp({
      studentQuestion: "Porquê 2?",
      exercise,
      partLabel: "(a)",
      partAsks: "",
      partAnswer: "",
    });
    expect(typed.startsWith("Selected text")).toBe(false);
    expect(TextHelpMock.studentQuestion(typed)).toBe("Porquê 2?");
  });

  it("has the system prompt of version 5, word for word", () => {
    const system = TextHelpPrompt.system("Portuguese (Portugal)");
    expect(TextHelpPrompt.version).toBe("5");
    expect(system).toContain('If the context starts with "Selected text"');
    expect(system).toContain('the first item of "explanation" is the direct answer');
    expect(system).toContain("Never solve it again a different way");
    expect(system).toContain('"ponto n"');
    expect(system).toContain("Write every text in Portuguese (Portugal), keeping the passage's notation");
    expect(TextHelpPrompt.user("p", "c")).toBe("Selected passage:\np\n\nText around it on the page:\nc");
  });

  it("carries the written solution and the step asked", () => {
    const solution = "Step 1: Derivar e^{2x}\nStep 2: Derivar −3x\nAnswer: f'(x) = 2e^{2x} − 3";
    const context = TextHelpContext.followUp({
      studentQuestion: "Explica o ponto 1",
      exercise,
      partLabel: "(a)",
      partAsks: "Determine f'(x).",
      partAnswer: "f'(x) = 2e^{2x} − 3",
      solution,
      step: { number: 1, total: 2, text: "Derivar e^{2x}" },
    });
    expect(context).toContain("The written solution on screen");
    expect(context).toContain(solution);
    expect(context).toContain("The student asks about step 1 of 2 only: Derivar e^{2x}");
    const bare = TextHelpContext.followUp({
      studentQuestion: "Porquê?",
      exercise,
      partLabel: "(a)",
      partAsks: "",
      partAnswer: "",
    });
    expect(bare).not.toContain("written solution");
    expect(bare).not.toContain("asks about step");
  });

  it("describes a part's written solution with numbered steps", () => {
    const solution = decodeProblemSolution({
      subject: "Física",
      parts: [
        {
          label: "1",
          asks: "v?",
          hint: "Use v = v0 + at.",
          answer: "22 m/s",
          cards: [{ title: "Dados", note: "Os dados.", latex: "v_0=12" }],
        },
      ],
    });
    expect(describePart(solution.parts[0]!)).toEqual([
      "--- Part 1 ---",
      "Asks: v?",
      "Step 1: Dados",
      "  Why: Os dados.",
      "  Formula: v_0=12",
      "Hint: Use v = v0 + at.",
      "Answer: 22 m/s",
    ]);
  });

  it("answers from the mock file in development, once per question", async () => {
    const files = new Map<string, string>();
    const disk: DataFiles = {
      read: async (name) => files.get(name) ?? null,
      write: async (name, contents) => void files.set(name, contents),
    };
    let calls = 0;
    const provider = new TextHelpProvider({
      passages: new DiskCache<TextHelp>("passages.json", 200, disk),
      client: () => {
        throw new Error("no network");
      },
      language: () => "English",
      mock: () => {
        calls += 1;
        return decodeTextHelp(mockTextHelp);
      },
      sleep: async () => {},
    });
    const context = TextHelpContext.followUp({
      studentQuestion: "Why the square root?",
      exercise,
      partLabel: "(a)",
      partAsks: "",
      partAnswer: "",
    });
    const first = await provider.help("passage", context);
    const again = await provider.help("passage", context);
    expect(first).toEqual(again);
    expect(calls).toBe(1);
    expect(first.asks).toBe("Why the square root?");
  });
});
