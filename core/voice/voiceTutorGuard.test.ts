// Port of the VoiceTutorGuard tests of LearnLayerTests/MascotCouncilFixTests.swift (plot gating, invented geometry,
// collinearity and diameter) and OptionFiguresAndAngleGuardTests.swift (where angles sit, self-corrections)
// @ ref 2026-11-04.

import { describe, expect, it } from "vitest";
import { VoiceTutorGuard } from "./voiceTutorGuard";
import type { DrawingCommand, DrawingKind, VoiceTutorReply } from "./voiceTutorReply";

const command = (kind: DrawingKind): DrawingCommand => ({
  kind,
  segment: 0,
  anchor: null,
  point: null,
  label: null,
  mentionUTF16: null,
  mentioned: null,
  mentionsUTF16: [],
});
const reply = (spoken: string, drawing: DrawingCommand[]): VoiceTutorReply => ({
  spoken,
  drawing,
  modelSpoken: spoken,
  markerCount: 0,
  markerOffsets: [],
  opening: null,
});

describe("plot gating", () => {
  it("a plot of a function the steps never mention is unused", () => {
    const steps = "Step 1: a razão entre os lados é a cotangente de α";
    expect(VoiceTutorGuard.plotIsUsed("sin(x)", "x", steps)).toBe(false);
    expect(VoiceTutorGuard.plotIsUsed("cos(x)/sin(x)", "x", steps + " seno e coseno")).toBe(true);
    expect(VoiceTutorGuard.plotIsUsed("20^x", "x", "a bactéria duplica a cada hora")).toBe(false);
    expect(VoiceTutorGuard.plotIsUsed("2^x", "x", "f(x) = 2^x")).toBe(true);
    expect(VoiceTutorGuard.plotIsUsed("20*x", "x", "o solo tem várias camadas")).toBe(false);
    expect(VoiceTutorGuard.plotIsUsed("20*x", "x", "v = 20x")).toBe(true);
    expect(VoiceTutorGuard.plotIsUsed("sin(x)", "x", "")).toBe(true);
  });

  it("dropping an unused plot keeps the other marks", () => {
    const circle = command({ op: "circle", term: "B" });
    const both = reply("Olha o ponto B.", [
      circle,
      command({ op: "plot", expression: "tan(x)", variable: "x", xMin: -1, xMax: 1 }),
    ]);
    expect(VoiceTutorGuard.droppingUnusedPlots(both, "triângulo ABC com o ângulo α em B").drawing).toEqual([circle]);
    expect(VoiceTutorGuard.droppingUnusedPlots(both, "tangente de x").drawing).toHaveLength(2);
  });
});

describe("invented geometry", () => {
  it("a relation not in the steps is flagged", () => {
    const steps = "Step 1: o ângulo α está em B. Step 2: AB = BC.";
    expect(VoiceTutorGuard.unsupportedRelations("D é simétrico de B.", steps)).toEqual(["symmetric"]);
    expect(VoiceTutorGuard.unsupportedRelations("O ângulo α está em B.", steps)).toEqual([]);
    expect(VoiceTutorGuard.unsupportedRelations("D é simétrico de B.", steps + " D é o simétrico de B")).toEqual([]);
    expect(VoiceTutorGuard.unsupportedRelations("As retas são paralelas.", "")).toEqual([]);
  });

  it("collinearity and a diameter need support", () => {
    const steps = "Os pontos B, C e D estão na circunferência.";
    expect(VoiceTutorGuard.unsupportedRelations("B, O e D estão alinhados e O está entre eles", steps)).toEqual([
      "collinear",
    ]);
    expect(VoiceTutorGuard.unsupportedRelations("Os pontos são colineares", steps)).toEqual(["collinear"]);
    expect(VoiceTutorGuard.unsupportedRelations("BD é um diâmetro", steps)).toEqual(["diameter"]);
    expect(VoiceTutorGuard.unsupportedRelations("B, O e D estão alinhados", "B, O e D são pontos alinhados")).toEqual(
      [],
    );
    expect(VoiceTutorGuard.unsupportedRelations("BD é um diâmetro", "BD é um diâmetro da circunferência")).toEqual([]);
  });
});

describe("where angles sit", () => {
  // The v20 MatA635 "explica o ponto 2" expansion.
  const mat635 =
    "O ângulo alfa está em O, entre o raio OB e a vertical. Aliás, quer dizer, o ângulo entre " +
    "OB e a vertical não é alfa, mas o ângulo alfa aparece como ângulo alterno interno em B.";

  it("an angle moving between vertices is flagged", () => {
    expect(VoiceTutorGuard.conflictingAngleLocations(mat635)).toEqual(["alfa: O, B"]);
    expect(VoiceTutorGuard.conflictingAngleLocations("O ângulo α está em B. Em B, α vale 30°.")).toEqual([]);
  });

  it("angle locations the sources do not give are flagged", () => {
    const sources = "Passo 2: o ângulo OBC = α, por serem alternos internos.";
    expect(VoiceTutorGuard.unsupportedAngleLocations(mat635, sources)).toEqual(["alfa at O"]);
    expect(VoiceTutorGuard.unsupportedAngleLocations("O ângulo alfa está em B.", sources)).toEqual([]);
    expect(VoiceTutorGuard.unsupportedAngleLocations(mat635, "")).toEqual([]);
  });

  it("words that only look like angles are ignored", () => {
    expect(VoiceTutorGuard.angleLocations("O programa fica em C.")).toEqual([]);
    expect(VoiceTutorGuard.angleLocations("Isto fica em A.")).toEqual([]);
  });

  it("self-corrections are flagged", () => {
    expect(VoiceTutorGuard.selfCorrections(mat635)).toEqual(["alias,", "quer dizer"]);
    expect(VoiceTutorGuard.selfCorrections("O ângulo α está em B.")).toEqual([]);
    const issues = VoiceTutorGuard.issues(mat635, "o ângulo OBC = α");
    expect(issues).toContain("angle moves: alfa: O, B");
    expect(issues).toContain("self-correction: quer dizer");
  });
});
