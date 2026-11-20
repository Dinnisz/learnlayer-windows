import { describe, expect, it } from "vitest";
import mockSolution from "../mocks/MockSolution.json";
import { ModelClient, ModelError, resetModelClientState, type ModelEnvironment } from "../ai/modelClient";
import { solution, streamedSolution, TutorLanguage } from "./solutionRequest";

function api(reply: { body?: string; chunks?: string[] }) {
  const sent: Record<string, unknown>[] = [];
  const environment: ModelEnvironment = {
    transport: async () => ({ url: "https://api.test/v1/chat/completions", bearer: "t", kind: "backend" }),
    forceRefresh: async () => null,
    fetch: async (_url, init) => {
      sent.push(JSON.parse(init.body) as Record<string, unknown>);
      if (reply.body !== undefined) return { status: 200, body: null, text: async () => reply.body! };
      const pieces = [...(reply.chunks ?? [])];
      const encoder = new TextEncoder();
      return {
        status: 200,
        body: new ReadableStream<Uint8Array>({
          pull(controller) {
            const next = pieces.shift();
            if (next === undefined) controller.close();
            else controller.enqueue(encoder.encode(next));
          },
        }),
        text: async () => "",
      };
    },
  };
  return { client: new ModelClient(environment, { model: "anthropic/claude-haiku-5.5", reasoningBudget: 2000 }), sent };
}

const options = {
  groupText: "I. Um disco carregado…",
  labels: ["I.1", "I.2", "I.3"],
  figureNote: null,
  images: [],
  language: "English",
  transcribing: false,
};

describe("the solve", () => {
  it("asks with the solution prompt, a described schema and the solve's budget, and reads the mock answer", async () => {
    resetModelClientState();
    const content = JSON.stringify(mockSolution);
    const { client, sent } = api({
      body: JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }], usage: { cost: 0.01 } }),
    });
    const reply = await solution(client, options);
    expect(reply.solution.parts.map((part) => part.label)).toEqual(["I.1", "I.2", "I.3"]);
    expect(reply.cost).toBe(0.01);
    expect(sent[0]).toMatchObject({
      max_tokens: 16000,
      reasoning: { max_tokens: 2000 },
      response_format: { type: "json_object" },
    });
    const system = (sent[0]!.messages as { content: { text: string }[] }[])[0]!.content[0]!.text;
    expect(system).toContain(
      "You are LearnLayer, a careful exam tutor (maths, sciences, languages, literature, philosophy, history).",
    );
    expect(system).toContain("\n\nMatch this JSON schema:\n{");
  });

  it("streams the answer as it arrives and reports an unreadable end as a stream failure", async () => {
    const half = JSON.stringify(mockSolution);
    const chunks = [half.slice(0, 200), half.slice(200)].map(
      (piece) => `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`,
    );
    const { client } = api({ chunks: [...chunks, "data: [DONE]\n\n"] });
    const seen: string[] = [];
    const reply = await streamedSolution(client, { ...options, onContent: (content) => void seen.push(content) });
    expect(seen).toHaveLength(2);
    expect(reply.solution.subject).toBe("Electromagnetism");

    const broken = api({
      chunks: [
        `data: ${JSON.stringify({ choices: [{ delta: { content: "not json at all" } }] })}\n\n`,
        "data: [DONE]\n\n",
      ],
    });
    const failure = await streamedSolution(broken.client, { ...options, onContent: () => {} }).catch(
      (error: unknown) => error,
    );
    expect((failure as ModelError).failure).toEqual({ kind: "stream", reason: "ended unreadable" });
  });
});

describe("TutorLanguage", () => {
  it("is Settings' choice, else European Portuguese unless the system speaks English first", () => {
    expect(TutorLanguage.resolve("en", ["pt-PT"])).toBe("en");
    expect(TutorLanguage.resolve("pt-PT", ["en-GB"])).toBe("pt");
    expect(TutorLanguage.resolve("", ["en-US", "pt-PT"])).toBe("en");
    expect(TutorLanguage.resolve(null, ["fr-FR"])).toBe("pt");
    expect(TutorLanguage.resolve(null, [])).toBe("pt");
    expect(TutorLanguage.promptName("pt")).toBe("Portuguese (Portugal)");
    expect(TutorLanguage.locale("pt")).toBe("pt-PT");
  });
});
