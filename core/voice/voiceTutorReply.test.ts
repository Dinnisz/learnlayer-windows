// VoiceTutorOpeningTests.swift and VoiceTutorTests.decodeSanitizesSpokenAndKeepsDrawingLatex: the spoken turn read
// from the model's JSON, its marks tied to the words they stand before.

import { describe, expect, it } from "vitest";
import { VoiceTutorPrompt } from "./voiceTutorPrompt";
import { SpeechWords, VoiceTutorDecodeError, VoiceTutorReplies } from "./voiceTutorReply";
import { SpokenText } from "./spokenText";

const answer =
  '"spoken":"A aceleração, o [[0]]a, diz quão depressa muda a velocidade. Esse [[0]]a é constante.",' +
  '"drawing":[{"op":"circle","term":"a","from":null,"to":null,"latex":null,"expression":null,"variable":null,"xMin":null,"xMax":null,"segment":1,"anchor":null,"point":null}]';
const reply = (opening: string | null) =>
  VoiceTutorReplies.decode("{" + (opening === null ? "" : `"opening":${opening},`) + answer + "}");

describe("VoiceTutorReply", () => {
  it("reads the opening beside the answer", () => {
    const read = reply('"Vamos por partes."');
    expect(read.opening).toBe("Vamos por partes.");
    expect(read.spoken.startsWith("A aceleração")).toBe(true);
  });

  it("has no opening when it is missing, empty or not text", () => {
    for (const opening of [null, "null", '""', '"   "', '"…"', "42"]) expect(reply(opening).opening).toBeNull();
  });

  it("cleans the opening like the spoken text, and drops one that repeats the answer or runs long", () => {
    expect(reply('"[[0]]Boa **pergunta**!"').opening).toBe("Boa pergunta!");
    expect(reply('"A aceleração,"').opening).toBeNull();
    expect(reply(`"${"muito ".repeat(40)}"`).opening).toBeNull();
    const plain = reply(null);
    expect(reply("null")).toEqual(plain);
    expect(VoiceTutorReplies.speakingTheOpening(plain)).toEqual(plain);
  });

  it("says the opening first, in the same text, and the marks still light on their words", () => {
    const original = reply('"Vamos por partes."');
    const spoken = VoiceTutorReplies.speakingTheOpening(original);
    expect(spoken.opening).toBeNull();
    expect(spoken.spoken).toBe("Vamos por partes. " + original.spoken);
    const text = SpokenText.forSpeech(spoken.spoken);
    expect(text.startsWith("Vamos por partes.")).toBe(true);
    expect(text.endsWith("constante.")).toBe(true);
    expect(VoiceTutorReplies.speakingTheOpening(reply('"Vamos lá"')).spoken.startsWith("Vamos lá. A aceleração")).toBe(
      true,
    );
    const shift = "Vamos por partes. ".length;
    const before = original.drawing[0]!;
    const after = spoken.drawing[0]!;
    expect(after.mentionsUTF16).toEqual(before.mentionsUTF16.map((offset) => offset + shift));
    expect(spoken.markerOffsets).toEqual(original.markerOffsets.map((offset) => offset + shift));
    expect(before.mentionsUTF16.length).toBeGreaterThan(0);
    for (const offset of before.mentionsUTF16) {
      expect(SpeechWords.word(offset + shift, spoken.spoken)).toBe(SpeechWords.word(offset, original.spoken));
    }
  });

  it("cleans what is spoken and keeps the drawing's LaTeX", () => {
    const read = VoiceTutorReplies.decode(
      '{"spoken":" See **this** $x^2$. ","drawing":[{"op":"formula","latex":"$x^2$"}]}',
    );
    expect(read.spoken).toBe("See this.");
    expect(read.drawing.map((command) => command.kind)).toEqual([{ op: "formula", latex: "$x^2$" }]);
    for (const content of ['{"spoken":" $x^2$ ","drawing":[]}', '{"spoken":"** **","drawing":[]}']) {
      expect(() => VoiceTutorReplies.decode(content)).toThrow(VoiceTutorDecodeError);
    }
  });

  it("lights a mark on each place it is said, and drops marks no word lights", () => {
    const read = reply(null);
    const [first, second] = read.drawing[0]!.mentionsUTF16;
    expect(read.spoken.slice(first, first! + 1)).toBe("a");
    expect(VoiceTutorReplies.lit(read, first!)).toEqual([0]);
    expect(VoiceTutorReplies.lit(read, second!)).toEqual([0]);
    expect(VoiceTutorReplies.lit(read, 0)).toEqual([]);
    const unlit = VoiceTutorReplies.decode(
      '{"spoken":"Olha para a fórmula toda com calma.","drawing":[{"op":"circle","term":"v"},{"op":"formula","latex":"v=at"}]}',
    );
    expect(VoiceTutorReplies.droppingUnlitMarks(unlit).drawing.map((command) => command.kind.op)).toEqual(["formula"]);
  });

  it("asks for a nullable opening in its schema", () => {
    const schema = VoiceTutorPrompt.schema as { required: string[]; properties: Record<string, { type: unknown }> };
    expect(schema.required).toContain("opening");
    expect(schema.required).toContain("spoken");
    expect(schema.properties["opening"]!.type).toEqual(["string", "null"]);
    expect(VoiceTutorReplies.isDegenerate("x")).toBe(true);
    expect(VoiceTutorReplies.isDegenerate("A aceleração é constante neste troço.")).toBe(false);
  });
});
