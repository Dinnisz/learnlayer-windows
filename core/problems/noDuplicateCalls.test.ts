// Port of the classifier cases of LearnLayerTests/NoDuplicateCallsTests.swift @ ref 2026-11-04
// (twoClassificationsAtOnceShareOneCall, aClassifiedQuestionIsNotClassifiedAgain): one paid call per student action.
// The client is scripted and counts what reaches it, so nothing is spent.

import { describe, expect, it } from "vitest";
import { DiskCache, type DataFiles } from "../ai/diskCache";
import type { ModelClient } from "../ai/modelClient";
import type { ProblemSolution } from "./problemSolution";
import { SolutionProvider } from "./solutionProvider";

const memoryFiles = (): DataFiles => {
  const store = new Map<string, string>();
  return { read: async (name) => store.get(name) ?? null, write: async (name, text) => void store.set(name, text) };
};

function scripted(reply: string) {
  const calls: string[] = [];
  const client = {
    complete: async (request: { schemaName?: string }) => {
      calls.push(request.schemaName ?? "");
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { content: reply, cost: 0 };
    },
  } as unknown as ModelClient;
  const provider = new SolutionProvider({
    solutions: new DiskCache<ProblemSolution>("solutions.json", 100, memoryFiles()),
    escalated: new DiskCache<boolean>("escalated-answers.json", 300, memoryFiles()),
    client: () => client,
    hasCredentials: () => true,
    config: () => "cheapFirst",
    plan: () => "paid",
    language: () => "Portuguese (Portugal)",
    sleep: async () => {},
  });
  return { provider, calls };
}

const verdict = '{"kind":"reading","needs_strong":false,"reason":"a text question"}';

describe("one paid call per student action", () => {
  it("two classifications at once share one call", async () => {
    const { provider, calls } = scripted(verdict);
    const text = "Descreve o contexto histórico do documento apresentado, sem usar números.";
    const [first, second] = await Promise.all([provider.classify(text, []), provider.classify(text, [])]);
    expect(first).toEqual(second);
    expect(first.classification).not.toBeNull();
    expect(calls.filter((name) => name === "classify")).toHaveLength(1);
  });

  it("a classified question is not classified again", async () => {
    const { provider, calls } = scripted(verdict);
    const text = "Explica a importância do documento apresentado para o período estudado.";
    await provider.classify(text, []);
    await provider.classify(text, []);
    expect(calls.filter((name) => name === "classify")).toHaveLength(1);
  });

  it("a reading that failed is asked again, since asking again may work", async () => {
    const { provider, calls } = scripted("not json");
    const text = "Explica a importância do documento apresentado para o período estudado.";
    await provider.classify(text, []);
    await provider.classify(text, []);
    expect(calls.filter((name) => name === "classify")).toHaveLength(2);
  });
});
