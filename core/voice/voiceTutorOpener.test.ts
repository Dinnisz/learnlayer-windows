// VoiceLatencyTests (the opener), EnglishOpenerTests, StepReadoutLatencyTests (clips) and ExplanationVisualsTests (a
// step asked for).

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { combineDirectives, pointingDirective, StepRequests, VoiceTutorOpener } from "./voiceTutorOpener";

const exercise = "Calcula a aceleração do bloco no plano inclinado.";
const clips = "referencia-mac/LearnLayer/Resources/OpenerClips";

describe("StepRequest", () => {
  it.each([
    ["explica o ponto 1", 1],
    ["explica-me o passo 2", 2],
    ["não percebi o passo dois", 2],
    ["explain step 3", 3],
    ["o segundo passo", 2],
    ["Explica o 3.º passo", 3],
    ["second step please", 2],
    ["Passo nº 4", 4],
    ["o ponto três", 3],
  ])("recognises %s", (text, number) => {
    expect(StepRequests.parse(text)).toEqual({ kind: "number", number });
  });

  it("recognises the last step, and ignores words that ask for none", () => {
    expect(StepRequests.parse("explica o último passo")).toEqual({ kind: "last" });
    expect(StepRequests.parse("explain the last step")).toEqual({ kind: "last" });
    for (const text of [
      "explica passo a passo",
      "explain it step by step",
      "o que é a aceleração",
      "um passo de cada vez",
      "",
    ]) {
      expect(StepRequests.parse(text)).toBeNull();
    }
    expect(StepRequests.index({ kind: "last" }, 4)).toBe(3);
    expect(StepRequests.index({ kind: "number", number: 5 }, 4)).toBeNull();
  });
});

describe("VoiceTutorOpener", () => {
  it("follows what was asked", () => {
    expect(VoiceTutorOpener.intent("explica o ponto 2")).toEqual({ kind: "step", step: { kind: "number", number: 2 } });
    expect(VoiceTutorOpener.lineFor("explica o ponto 2")).toBe("Vamos ao ponto 2.");
    expect(VoiceTutorOpener.lineFor("não percebi o passo dois")).toBe("Vamos ao ponto 2.");
    expect(VoiceTutorOpener.lineFor("dá-me uma pista")).toBe("Dou-te só uma pista.");
    expect(VoiceTutorOpener.lineFor("Explica-me")).toBe("Vamos lá ver isto.");
    expect(VoiceTutorOpener.lineFor("explica isto")).toBe("Vamos lá ver isto.");
    expect(VoiceTutorOpener.lineFor("explica melhor")).toBe("Vou explicar de outra forma.");
    expect(VoiceTutorOpener.lineFor("não percebi")).toBe("Vou explicar de outra forma.");
    expect(VoiceTutorOpener.lineFor("porque é que a aceleração é negativa?", exercise)).toBe(
      "Boa pergunta, vamos ver.",
    );
    expect(VoiceTutorOpener.lineFor("o que é o bloco", exercise)).toBe("Boa pergunta, vamos ver.");
    expect(VoiceTutorOpener.lineFor("Explica-me só esta parte que selecionei: «x»")).toBe("Vamos lá ver isto.");
  });

  it("says nothing to small talk or unclear words", () => {
    for (const words of [
      "qual o teu nome?",
      "olá",
      "como estás?",
      "obrigado",
      "és um robô?",
      "hmm",
      "?",
      "",
      "quem és tu?",
      "que horas são?",
    ]) {
      expect(VoiceTutorOpener.lineFor(words, exercise), words).toBeNull();
    }
  });

  it("maps English intents to their lines, and English small talk to none", () => {
    const en = (words: string, question = "Find the acceleration of the block on the incline.") =>
      VoiceTutorOpener.lineFor(words, question, 0, "en");
    expect(en("explain")).toBe("Let's take a look.");
    expect(en("can you explain this to me")).toBe("Let's take a look.");
    expect(en("explain point 3")).toBe("Let's go to point 3.");
    expect(en("explain step two")).toBe("Let's go to point 2.");
    expect(en("explain the last step")).toBe("Let's go to the last point.");
    expect(en("give me a hint")).toBe("Here's just a hint.");
    expect(en("explain it better")).toBe("Let me explain it another way.");
    expect(en("I don't understand")).toBe("Let me explain it another way.");
    expect(en("why is the acceleration negative?")).toBe("Good question, let's see.");
    expect(en("what is the block doing", "Find the acceleration of the block.")).toBe("Good question, let's see.");
    for (const words of [
      "what's your name?",
      "hello",
      "how are you?",
      "thanks",
      "who are you?",
      "what time is it?",
      "are you a robot?",
    ]) {
      expect(en(words), words).toBeNull();
    }
  });

  it("has three variants per intent, rotating", () => {
    for (const intent of [
      { kind: "step", step: { kind: "number", number: 1 } },
      { kind: "step", step: { kind: "last" } },
      { kind: "hint" },
      { kind: "explainAgain" },
      { kind: "explain" },
      { kind: "question" },
    ] as const) {
      const lines = VoiceTutorOpener.allLines(intent);
      expect(new Set(lines).size).toBe(3);
      for (const line of lines) expect(Array.from(line).length).toBeLessThan(40);
    }
    expect(VoiceTutorOpener.line({ kind: "explain" }, 3)).toBe(VoiceTutorOpener.line({ kind: "explain" }, 0));
  });

  it("ships every line as a recorded clip, under an ASCII name", () => {
    expect(VoiceTutorOpener.clipName("Vamos lá ver isto.")).toBe("opener-vamos-la-ver-isto");
    expect(VoiceTutorOpener.clipName("Vamos ao último ponto.")).toBe("opener-vamos-ao-ultimo-ponto");
    expect(VoiceTutorOpener.clipName("Let's take a look.", "en")).toBe("opener-en-let-s-take-a-look");
    for (const language of ["pt", "en"] as const) {
      const lines = VoiceTutorOpener.recordedLines(language);
      expect(lines).toHaveLength(39);
      const names = lines.map((line) => VoiceTutorOpener.clipName(line, language));
      expect(new Set(names).size).toBe(names.length);
      if (!existsSync(clips)) continue;
      for (const name of names) {
        const file = language === "pt" ? `${clips}/${name}.mp3` : `${clips}/en/${name}.m4a`;
        expect(existsSync(file), file).toBe(true);
      }
    }
  });
});

// The pointing note of EnglishTutorTests.swift @ ref 2026-11-04, and the notes joined.
describe("how the voice turn is told to point", () => {
  it("in the tutor's language, only for a student who learns from figures", () => {
    expect(pointingDirective(true, true, true)).toContain('"look at the graph"');
    expect(pointingDirective(true, true, true)).not.toContain("olha");
    expect(pointingDirective(true, true)).toContain('"olha para o gráfico"');
    expect(pointingDirective(true, false)).toContain('labelled "point" on a "plot"');
    expect(pointingDirective(false, true)).toBeNull();
  });

  it("the notes are joined, the empty ones left out", () => {
    expect(combineDirectives([null, ""])).toBeNull();
    expect(combineDirectives(["a", null, "b"])).toBe("a\n\nb");
  });
});
