// Port of LearnLayer/Problems/VisualAid.swift (VisualAid, VisualAidPrompt v1, VisualAidProvider) @ ref 2026-11-04:
// whether a picture would make an explanation clearer. The fast model (Haiku) decides; the app draws. A curve it can't
// plot is dropped. One short call per question, saved in `visual-aids.json`, so opening it again costs nothing.

import { cacheKey, type DiskCache } from "../ai/diskCache";
import type { ModelClient } from "../ai/modelClient";
import { decodeFromContent } from "../ai/replyDecoding";
import { FunctionPlot, type Graph } from "../illustrations/graph";
import type { JSONSchema } from "../prompts/swiftText";
import type { Part } from "./problemSolution";

export type VisualAidKind = "none" | "graph" | "diagram";

export interface VisualAid {
  kind: VisualAidKind;
  /** y as ASCII in `variable` ("x^2 - 4*x + 1"), when `kind` is graph. */
  expression: string | null;
  variable: string | null;
  xMin: number | null;
  xMax: number | null;
  xLabel: string | null;
  yLabel: string | null;
}

const str = (value: unknown) => (typeof value === "string" ? value : null);
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

export function decodeVisualAid(value: unknown): VisualAid {
  const json = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const kind = json.kind === "graph" || json.kind === "diagram" ? json.kind : "none";
  return {
    kind,
    expression: str(json.expression),
    variable: str(json.variable),
    xMin: num(json.xMin),
    xMax: num(json.xMax),
    xLabel: str(json.xLabel),
    yLabel: str(json.yLabel),
  };
}

export const VisualAids = {
  none: (): VisualAid => ({
    kind: "none",
    expression: null,
    variable: null,
    xMin: null,
    xMax: null,
    xLabel: null,
    yLabel: null,
  }),

  /** The curve to draw, or null when it doesn't parse or isn't finite. */
  plot(aid: VisualAid): Graph | null {
    if (aid.kind !== "graph" || !aid.expression) return null;
    const variable = aid.variable ? aid.variable : "x";
    return FunctionPlot.make(aid.expression, variable, aid.xMin ?? -5, aid.xMax ?? 5, aid.xLabel, aid.yLabel);
  },
};

/** What Haiku is asked: a picture or not, never a solution. */
export const VisualAidPrompt = {
  version: "1",

  system(language: string): string {
    return (
      "You decide whether a picture would make a worked solution clearer. You do not " +
      "solve the question and you do not repeat its answer.\n" +
      "\n" +
      'Reply with JSON only. "kind":\n' +
      '- "graph" when a single curve y = f(x) would help: a function and its ' +
      'variation, a derivative\'s sign, a trajectory, a rate. "expression" is that ' +
      "curve in ASCII the app can plot (+ - * / ^, sqrt, abs, ln, exp, sin, cos, pi), " +
      'with every constant already substituted, so the only name is "variable" ' +
      '("x" or "t"). "xMin" and "xMax" are the interval the question is about. ' +
      `"xLabel" and "yLabel" are short axis names, in ${language}.\n` +
      '- "diagram" when a sketch that is not one curve would help (forces on a body, ' +
      "a geometric figure, a timeline) and the exam does not already print it.\n" +
      '- "none" when words are enough, the exam already shows the figure, or the ' +
      "subject is a language, literature or philosophy. Never invent a graph for a " +
      "text answer.\n" +
      'For "none" and "diagram", the other fields are null.'
    );
  },

  user(groupText: string, subject: string, part: Part): string {
    let message = `Subject: ${subject}\n\nQuestion:\n` + Array.from(groupText).slice(0, 4000).join("");
    message += `\n\nPart ${part.label}: ${part.asks}`;
    const steps = part.steps.slice(0, 4).join("\n");
    if (steps !== "") message += "\n\nSteps so far:\n" + steps;
    if (part.answer.text !== "") message += "\n\nAnswer: " + part.answer.text;
    return message;
  },

  schema: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "expression", "variable", "xMin", "xMax", "xLabel", "yLabel"],
    properties: {
      kind: { type: "string", enum: ["none", "graph", "diagram"] },
      expression: { type: ["string", "null"] },
      variable: { type: ["string", "null"] },
      xMin: { type: ["number", "null"] },
      xMax: { type: ["number", "null"] },
      xLabel: { type: ["string", "null"] },
      yLabel: { type: ["string", "null"] },
    },
  } as JSONSchema,
};

export interface VisualAidServices {
  cache: DiskCache<VisualAid>;
  client(): ModelClient;
  language(): string;
  /** Working without the API: no picture is asked for. */
  usesMock: boolean;
}

/** One short Haiku call per question, saved, so opening it again costs nothing. */
export class VisualAidProvider {
  constructor(readonly services: VisualAidServices) {}

  async aid(groupText: string, subject: string, part: Part, signal?: AbortSignal): Promise<VisualAid> {
    const key = await cacheKey(
      (this.services.usesMock ? "mock-" : "") + VisualAidPrompt.version,
      groupText,
      part.label,
      part.answer.text,
    );
    return this.services.cache.script(key, async () => {
      if (this.services.usesMock) return VisualAids.none();
      const { content } = await this.services.client().complete({
        system: VisualAidPrompt.system(this.services.language()),
        user: VisualAidPrompt.user(groupText, subject, part),
        schemaName: "visual",
        schema: VisualAidPrompt.schema,
        maxTokens: 500,
        signal,
      });
      return decodeFromContent(content, decodeVisualAid);
    });
  }
}
