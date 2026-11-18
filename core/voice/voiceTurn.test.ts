// OpenRouterClient.voiceTurn's cases: a reply that cannot be spoken is asked once more, a cut-off reply is continued.

import { describe, expect, it } from "vitest";
import { ModelError } from "../ai/modelClient";
import { voiceTurn } from "./voiceTurn";
import { VoiceTutorPrompt } from "./voiceTutorPrompt";

const good = '{"opening":null,"drawing":[],"spoken":"A aceleração diz quão depressa muda a velocidade."}';

describe("voiceTurn", () => {
  it("asks once more when the reply is only a symbol, with the retry note", async () => {
    const asked: string[] = [];
    const reply = await voiceTurn("Student said: x", async (user) => {
      asked.push(user);
      return asked.length === 1 ? '{"spoken":"$x$ x","drawing":[]}' : good;
    });
    expect(reply.spoken).toContain("aceleração");
    expect(asked).toHaveLength(2);
    expect(asked[1]).toContain('"spoken" was empty or only a symbol');
  });

  it("continues a reply cut off at the token limit and merges the rest", async () => {
    let calls = 0;
    const reply = await voiceTurn("Student said: x", async (user, maxTokens) => {
      calls += 1;
      if (calls === 1) {
        expect(maxTokens).toBe(4000);
        throw new ModelError({
          kind: "cutOff",
          tokens: 4000,
          partial: '{"drawing":[],"spoken":"Primeiro isolamos o tempo, porque é o que queremos."',
        });
      }
      expect(user).toContain("Partial JSON so far");
      expect(maxTokens).toBe(1500);
      return '{"drawing":[],"spoken":"Depois substituímos os valores dados."}';
    });
    expect(reply.spoken).toBe(
      "Primeiro isolamos o tempo, porque é o que queremos. Depois substituímos os valores dados.",
    );
  });

  it("asks again, shorter, when the budget ran out before the answer was said", async () => {
    const asked: string[] = [];
    const reply = await voiceTurn("x", async (user) => {
      asked.push(user);
      if (asked.length === 1)
        throw new ModelError({ kind: "cutOff", tokens: 4000, partial: '{"drawing":[],"spoken":"Primeiro isol' });
      return good;
    });
    expect(reply.spoken).toContain("aceleração");
    expect(asked[1]).toContain("Your previous reply ran out of room");
  });

  it("gives up after two unreadable replies", async () => {
    await expect(voiceTurn("x", async () => "nada")).rejects.toThrow();
  });
});

// The rest of LearnLayerTests/VoiceTurnRecoveryTests.swift @ ref 2026-11-04: recorded and simulated replies replayed.
describe("voiceTurn recovery (VoiceTurnRecoveryTests)", () => {
  const good2 =
    '{"spoken":"Primeiro escrevemos a fórmula da velocidade. Depois substituímos os valores dados.","drawing":[]}';
  type Outcome = { content: string } | { cutOff: string } | "empty";
  const script = (outcomes: Outcome[]) => {
    const users: string[] = [];
    const budgets: number[] = [];
    const send = async (user: string, maxTokens: number) => {
      users.push(user);
      budgets.push(maxTokens);
      const next = outcomes.shift();
      if (next === undefined) throw new ModelError({ kind: "http", status: 500, message: "script exhausted" });
      if (next === "empty") throw new ModelError({ kind: "emptyReply", raw: "{}" });
      if ("cutOff" in next) throw new ModelError({ kind: "cutOff", tokens: maxTokens, partial: next.cutOff });
      return next.content;
    };
    return { users, budgets, send };
  };

  it("an empty cut-off is retried shorter instead of failing empty", async () => {
    const played = script([{ cutOff: "" }, { content: good2 }]);
    const reply = await voiceTurn("Explica-me este exercício", played.send);
    expect(reply.spoken).toContain("fórmula da velocidade");
    expect(played.users).toHaveLength(2);
    expect(played.users[1]).toContain(VoiceTutorPrompt.shortNote);
    expect(played.budgets).toEqual([VoiceTutorPrompt.initialMaxTokens, VoiceTutorPrompt.initialMaxTokens]);
  });

  it("empty content is retried with the retry note", async () => {
    const played = script(["empty", { content: good2 }]);
    await voiceTurn("Explica-me este exercício", played.send);
    expect(played.users[1]).toContain(VoiceTutorPrompt.retryNote);
  });

  it("cut-off JSON without closing braces still gives its complete spoken line", async () => {
    const cut =
      '{"spoken":"Primeiro escrevemos a fórmula da velocidade. Depois substituímos os valores.","drawing":[{"op":"circle","term":"v","from":nu';
    const played = script([
      { cutOff: cut },
      { content: '{"spoken":"Por fim, o resultado é doze metros por segundo.","drawing":[]}' },
    ]);
    const reply = await voiceTurn("Explica-me este exercício", played.send);
    expect(reply.spoken).toContain("Primeiro escrevemos");
    expect(reply.spoken).toContain("doze metros por segundo");
    expect(played.budgets).toEqual([VoiceTutorPrompt.initialMaxTokens, VoiceTutorPrompt.continuationMaxTokens]);
    expect(played.users[1]).toContain("Partial JSON so far");
  });

  it("a long step-by-step reply is returned whole", async () => {
    const steps = Array.from(
      { length: 12 },
      (_, index) => `Passo ${index + 1}: calculamos o valor seguinte com cuidado.`,
    ).join(" ");
    const mark =
      '{"op":"highlight","term":"v","from":null,"to":null,"latex":null,"expression":null,"variable":null,"xMin":null,"xMax":null,"segment":0,"anchor":null,"point":null}';
    const long = `{"spoken":"${steps}","drawing":[${Array.from({ length: 8 }, () => mark).join(",")}]}`;
    const played = script([{ content: long }]);
    const reply = await voiceTurn("Explica-me este exercício", played.send);
    expect(played.users).toHaveLength(1);
    expect(reply.spoken).toContain("Passo 12");
    expect(reply.drawing).toHaveLength(8);
  });

  it("a continuation that is cut off too keeps what was said", async () => {
    const played = script([
      { cutOff: '{"spoken":"Primeiro escrevemos a fórmula da velocidade e os dados.","drawing":[]}' },
      { cutOff: '{"spoken":"Depois substituímos todos os valores conhecidos.","drawing":[]' },
      { content: '{"spoken":"No fim, a velocidade é doze metros por segundo.","drawing":[]}' },
    ]);
    const reply = await voiceTurn("Explica-me este exercício", played.send);
    expect(reply.spoken).toContain("Primeiro");
    expect(reply.spoken).toContain("Depois substituímos");
    expect(reply.spoken).toContain("doze metros");
  });

  it("the budgets fit a whole solution", () => {
    expect(VoiceTutorPrompt.initialMaxTokens).toBeGreaterThanOrEqual(3_000);
    expect(VoiceTutorPrompt.continuationMaxTokens).toBeGreaterThanOrEqual(1_000);
  });
});
