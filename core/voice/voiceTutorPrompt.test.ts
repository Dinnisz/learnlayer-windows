// VoiceTutorPromptStructureTests.swift and VoiceTutorFocusTests.swift: the spoken turn's prompt, word for word, and
// what its user message says about the open item.

import { describe, expect, it } from "vitest";
import { ProblemPrompt } from "../prompts/problemPrompt";
import { interpolations, swiftText } from "../prompts/swiftText";
import { focusNote, VoiceTutorPrompt, type VoiceTutorFocus } from "./voiceTutorPrompt";

const system = VoiceTutorPrompt.system("Portuguese (Portugal) [pt-PT]");
const user = (focus: VoiceTutorFocus, question = "", page = "Exercício 1 e 2") =>
  VoiceTutorPrompt.user({ transcript: "explica", question, page, subject: null, focus });

describe("VoiceTutorPrompt", () => {
  it("is version 24, distinct from the other prompts", () => {
    expect(VoiceTutorPrompt.version).toBe("24");
    for (const other of [
      swiftText("IllustrationPrompt", "version#0"),
      ProblemPrompt.version,
      swiftText("ExplanationPrompt", "version#0"),
    ]) {
      expect(VoiceTutorPrompt.version).not.toBe(other);
    }
  });

  it("speaks European Portuguese only", () => {
    expect(system).toContain("European Portuguese (pt-PT)");
    expect(system).toContain("Never reply in English.");
    expect(system).toContain('write "crusta" (never "crosta")');
  });

  it("teaches one step at a time, with the reason and the meaning", () => {
    for (const phrase of [
      "How to explain, step by step:",
      "One idea per sentence, one step at a time",
      "Say why the step is done",
      "Never say a symbol without its meaning",
      "what it stands for and its unit",
      "about twelve words or fewer",
      "at most two to four short sentences",
    ]) {
      expect(system).toContain(phrase);
    }
  });

  it("points at the figure and the formula while talking", () => {
    expect(system).toContain("Point at the figure or the formula while you talk");
    expect(system).toContain("every sentence that refers to something on screen has a drawing item");
    for (const example of [
      "a [[0]]fórmula diz",
      "o [[0]]a",
      "esse mesmo [[1]]a",
      "Say the name, then mark the letter",
    ]) {
      expect(system).toContain(example);
    }
    for (const op of ['"highlight"', '"circle"', '"arrow"', '"formula"', '"plot"']) expect(system).toContain(op);
  });

  it("explains the whole solution by default, and only the question when it is specific", () => {
    for (const phrase of [
      "By default explain the WHOLE solution, from the first step to the final result",
      "Only when the student asks something specific",
      "answer just that question",
      "do not stop after the first step",
      "final result at the end",
      "answer only that and nothing more",
      "At most eight marks",
    ]) {
      expect(system).toContain(phrase);
    }
    expect(VoiceTutorPrompt.initialMaxTokens).toBeGreaterThanOrEqual(2_000);
  });

  it("swaps every pt-PT phrase in English", () => {
    const english = VoiceTutorPrompt.system("English (United States) [en-US]");
    expect(english).toContain("Always write and speak English only");
    expect(english).not.toContain("crusta");
    expect(english).toContain('"x equals x zero plus v zero times t"');
    expect(english).not.toContain("pt-PT");
  });

  it("names the open item the student has", () => {
    const open = user({ kind: "openItem" }, "Calcula a derivada de x^2");
    expect(open).toContain("Open item: the student has the question above open");
    expect(open).toContain("do not pick another exercise");
    expect(open).not.toContain("nothing is selected");
    expect(user({ kind: "selection" })).toContain("selected the text at the start of the Page section");
    const several = user({ kind: "page", exerciseLabels: ["1", "2", "3"] });
    expect(several).toContain("nothing is selected");
    expect(several).toContain("3 exercises");
    expect(several).toContain("do not recommend one");
    expect(several).toContain("Ask which exercise");
    const one = user({ kind: "page", exerciseLabels: ["1"] });
    expect(one).toContain("Open item: the visible page");
    expect(one).not.toContain("Ask which exercise");
    expect(user({ kind: "page", exerciseLabels: [] })).toContain("Open item: the visible page");
    expect(focusNote({ kind: "unspecified" })).toBeNull();
    expect(user({ kind: "unspecified" })).not.toContain("Open item");
    expect(system).toContain('never switch to a different or "recommended" exercise');
    expect(system).toContain("ask in one short pt-PT sentence");
  });

  it("builds the user message as the Mac does", () => {
    const message = VoiceTutorPrompt.user({
      transcript: "não percebi o passo 2",
      question: "2.1. Calcule a velocidade.",
      page: "",
      subject: "Física e Química A",
      questionLabel: "2.1",
      workContext: "Step 1: …",
    });
    expect(message).toBe(
      "This answer will be spoken aloud.\n\nSubject: Física e Química A\n\nStudent said:\nnão percebi o passo 2" +
        "\n\nAlínea (question label): 2.1\n\nQuestion:\n2.1. Calcule a velocidade." +
        "\n\nPage: none. Do not refer to a page." +
        "\n\nWork shown on screen (solution steps and figures the tutor can refer to):\nStep 1: …",
    );
    expect(VoiceTutorPrompt.continuationUser('{"spoken":"Olá', "en")).toContain("Continue in English");
    expect(VoiceTutorPrompt.continuationUser('{"spoken":"Olá')).toContain(
      'Partial JSON so far (continue from here):\n{"spoken":"Olá',
    );
    expect(interpolations("VoiceTutorPrompt", "continuationUser#0")).toHaveLength(2);
  });
});
