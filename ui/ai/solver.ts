// The app's solver: the model client through the LearnLayer API with the session's token, the caches in the data
// folder, and Settings. In development (`npm run dev` in a browser, or `?mock=1`) every solve answers with the Mac's
// MockSolution.json, so the stage can be worked on without spending anything (CLAUDE.md: mocks first).

import mockSolution from "@core/mocks/MockSolution.json";
import mockTextHelp from "@core/mocks/MockTextHelp.json";
import { DiskCache } from "@core/ai/diskCache";
import { chatPath, endpoint, speechPath } from "@core/ai/aiGateway";
import { ModelClient, type ModelEnvironment } from "@core/ai/modelClient";
import { AISettings, ModelRouting } from "@core/ai/modelRouting";
import { decodeProblemSolution, type ProblemSolution } from "@core/problems/problemSolution";
import { SolutionProvider } from "@core/problems/solutionProvider";
import { TutorLanguage } from "@core/problems/solutionRequest";
import { decodeTextHelp, TextHelpProvider, type TextHelp } from "@core/problems/textHelp";
import { appConfig, dataFiles, isTauri, session, streamingFetch } from "../native";

/** True when solves answer from the mock file: `?mock=1`, or a browser during development unless `?live=1`. */
export function usesMock(): boolean {
  const query = new URLSearchParams(window.location.search);
  if (query.get("mock") === "1") return true;
  if (query.get("live") === "1") return false;
  return import.meta.env.DEV && !isTauri;
}

let apiBase: Promise<string> | null = null;

const environment: ModelEnvironment = {
  async transport(purpose) {
    apiBase ??= appConfig().then((config) => config.apiBase);
    const base = await apiBase;
    const token = (await session.accessToken(false)) ?? "";
    return {
      url: endpoint(purpose === "speech" ? speechPath : chatPath, base),
      bearer: token,
      kind: token === "" ? "none" : "backend",
    };
  },
  forceRefresh: () => session.accessToken(true),
  fetch: streamingFetch,
};

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

let provider: SolutionProvider | null = null;

/** One solver for the window, so its caches and in-flight requests are shared by every question. */
export function solutionProvider(): SolutionProvider {
  if (provider) return provider;
  const mock = usesMock();
  provider = new SolutionProvider({
    solutions: new DiskCache<ProblemSolution>("solutions.json", 100, dataFiles),
    escalated: new DiskCache<boolean>("escalated-answers.json", 300, dataFiles),
    client: (options) => new ModelClient(environment, options),
    // Signed-in is checked by the call itself (no token: `signedOut`); the classifier needs it known first.
    hasCredentials: () => !mock,
    config: () => ModelRouting.config(read(ModelRouting.configKey)),
    plan: () => ModelRouting.plan(read(ModelRouting.planKey)),
    language: () =>
      TutorLanguage.promptName(TutorLanguage.resolve(read(TutorLanguage.settingKey), navigator.languages)),
    mockSolution: mock ? () => decodeProblemSolution(mockSolution) : undefined,
  });
  return provider;
}

let textHelp: TextHelpProvider | null = null;

/** Answers questions about an exercise (and selected passages), saved in `passages.json`. */
export function textHelpProvider(): TextHelpProvider {
  if (textHelp) return textHelp;
  const mock = usesMock();
  textHelp = new TextHelpProvider({
    passages: new DiskCache<TextHelp>("passages.json", 200, dataFiles),
    client: () => new ModelClient(environment, { model: AISettings.defaultModel }),
    language: () =>
      TutorLanguage.promptName(TutorLanguage.resolve(read(TutorLanguage.settingKey), navigator.languages)),
    mock: mock ? () => decodeTextHelp(mockTextHelp) : undefined,
  });
  return textHelp;
}
