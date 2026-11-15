// OpenRouterClient.voiceTurn's cases: a reply that cannot be spoken is asked once more, a cut-off reply is continued.

import { describe, expect, it } from "vitest";
import { ModelError } from "../ai/modelClient";
import { voiceTurn } from "./voiceTurn";

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
