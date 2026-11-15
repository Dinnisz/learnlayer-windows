// Port of LearnLayer/Illustrations/IllustrationProvider.swift, FigureRenderingPolicy.swift and
// IllustrationFallback.swift @ ref 2026-11-04.
//
// The 3D checks of the Mac (a solid's volume, a circuit's resistance, SceneKit figures) come with the 3D figures: until
// then a question that wants its solid or circuit in 3D gets a flat figure only when one fits, else none.

import { cacheKey, type DiskCache } from "../ai/diskCache";
import { decodeFromContent } from "../ai/replyDecoding";
import type { ModelClient } from "../ai/modelClient";
import { tryParseExpression, variables } from "../math/expression";
import type { Part } from "../problems/problemSolution";
import { isCircuit, wants3D } from "./figureTopic";
import { CompiledIllustration, decodeIllustration, isAllowedFreeForm, type Illustration } from "./illustration";
import { IllustrationPrompt } from "./illustrationPrompt";
import { compileTemplate, compilingTemplate, decodeTemplate, type IllustrationTemplate } from "./illustrationTemplate";
import { applyingPremadeFigure, decodePremade, PremadeFigures } from "./premadeFigure";
import { plottingAuxiliarySum } from "./auxiliarySum";

export class IllustrationFailure extends Error {
  constructor() {
    super("Couldn’t draw this one.");
    this.name = "IllustrationFailure";
  }
}

export type RenderingOutcome = "premade" | "template" | "freeForm" | "withheld";

/**
 * When the app draws a figure: premade and templates are always compiled locally; free-form elements only when the
 * student or the model asked for a picture and no premade or template fits.
 */
export function prepareFigure(
  reply: Illustration,
  language: string,
  userRequestedFigure: boolean,
  modelNeedsFigure: boolean,
): { illustration: Illustration; outcome: RenderingOutcome } {
  const premade = decodePremade(reply.premade);
  if (premade && new PremadeFigures(premade).compile(reply.title === "" ? "Figure" : reply.title, language)) {
    const compiled = applyingPremadeFigure(reply, language);
    return { illustration: { ...compiled, template: null, premade }, outcome: "premade" };
  }
  if (reply.template) {
    const compiled = compilingTemplate(reply, language);
    if (compiled.elements.length > 0) return { illustration: compiled, outcome: "template" };
  }
  if (reply.elements.length === 0) return { illustration: reply, outcome: "withheld" };
  const shouldDraw = userRequestedFigure || modelNeedsFigure || reply.needsFigure === true;
  const allowed = isAllowedFreeForm(reply);
  if (!allowed || !shouldDraw)
    return { illustration: { ...reply, elements: [], rejected: allowed ? !shouldDraw : true }, outcome: "withheld" };
  if (new CompiledIllustration(reply).isDrawable) return { illustration: reply, outcome: "freeForm" };
  return { illustration: { ...reply, elements: [], rejected: true }, outcome: "withheld" };
}

/** Three or more lines of numbers only ("0,10 0,47"): a table of measurements. */
export function hasDataTable(text: string): boolean {
  return (
    text.split(/\r?\n/).filter((line) => /^\s*-?\d+(?:[.,]\d+)?(?:\s+-?\d+(?:[.,]\d+)?)+\s*$/.test(line)).length >= 3
  );
}

/** A picture when the model drew free-form twice and the app refused it: a function of x, or a table of measurements. */
export const IllustrationFallback = {
  scene(groupText: string, part: Part, language: string): Illustration | null {
    const title = part.topic ?? part.asks;
    const expression = IllustrationFallback.functionOfX(part);
    if (expression) return compiled({ kind: "function", f: expression, xMin: -2, xMax: 4 }, title, language);
    const template = series(groupText);
    return template ? compiled(template, title, language) : null;
  },

  /** An expression in x alone, from the checked answer or a step formula. */
  functionOfX(part: Part): string | null {
    const candidates: string[] = [];
    if (part.answer.expression) candidates.push(part.answer.expression);
    for (const card of part.cards ?? []) if (card.latex !== "") candidates.push(card.latex);
    candidates.push(...part.steps);
    for (const raw of candidates) {
      const ascii = asciiExpression(raw);
      const parsed = tryParseExpression(ascii);
      if (!parsed) continue;
      const names = variables(parsed);
      if (names.size === 1 && names.has("x")) return ascii;
    }
    return null;
  },
};

function series(text: string): IllustrationTemplate | null {
  if (!hasDataTable(text)) return null;
  const points: { x: number; y: number; text: null; answer: false }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const numbers = [...line.matchAll(/-?\d+(?:[.,]\d+)?/g)].map((match) => Number(match[0].replace(",", ".")));
    if (numbers.length < 2) continue;
    points.push({ x: numbers[0]!, y: numbers[1]!, text: null, answer: false });
  }
  if (points.length < 2) return null;
  return { kind: "series", points, xName: "x", yName: "y", connect: false, fit: "linear" };
}

function compiled(template: IllustrationTemplate, title: string, language: string): Illustration | null {
  const built = compileTemplate(template, language);
  if (built.elements.length === 0) return null;
  return {
    title: title === "" ? "Figure" : title,
    width: 10,
    height: 6,
    parameters: built.parameters,
    elements: built.elements,
    template,
  };
}

/** A step's LaTeX reduced to the ASCII the expression parser reads. */
function asciiExpression(input: string): string {
  let text = input;
  for (const [from, to] of [
    ["\\left", ""],
    ["\\right", ""],
    ["\\cdot", "*"],
    ["\\times", "*"],
    ["\\,", ""],
    ["\\;", ""],
    ["\\!", ""],
    ["{", ""],
    ["}", ""],
    ["\\frac", ""],
  ] as const)
    text = text.split(from).join(to);
  text = text.split("\\").join("");
  const tail = /=\s*([^=]+)$/.exec(text);
  if (tail) {
    const trimmed = tail[0].slice(1).replace(/^[\p{Zs}\t]+|[\p{Zs}\t]+$/gu, "");
    if (trimmed.includes("x")) text = trimmed;
  }
  return text.trim();
}

export interface IllustrationServices {
  cache: DiskCache<Illustration>;
  /** The model the drawing is asked of: the fast solver's, or Gemini for a figure that must be 3D. */
  client(wants3D: boolean): ModelClient;
  /** Working without the API: the first sample drawing. */
  mock?: Illustration | null;
}

/**
 * Gets the illustration of an exam question part from the fast model, once: it is saved. One the app can't draw (an
 * unknown name, a broken expression) is asked for again, then given up.
 */
export class IllustrationProvider {
  constructor(private readonly services: IllustrationServices) {}

  /** Keyed by the answer too: a corrected solution gets a new drawing. */
  static key(groupText: string, label: string, answer = ""): Promise<string> {
    return cacheKey(IllustrationPrompt.version, groupText, label, answer);
  }

  async illustration(options: {
    groupText: string;
    part: Part;
    figure: string | null;
    images?: readonly Uint8Array[];
    topicText?: string | null;
    language: string;
    signal?: AbortSignal;
  }): Promise<Illustration> {
    const { groupText, part, figure, language } = options;
    const topicText = options.topicText ?? groupText;
    const circuitImages = isCircuit(topicText) ? (options.images ?? []) : [];
    const key = await IllustrationProvider.key(groupText, part.label, part.answer.text);
    const fetched = await this.services.cache.script(key, async () => {
      if (this.services.mock) return this.services.mock;
      const client = this.services.client(wants3D(topicText));
      let note: string | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const { content } = await client.complete({
          system: IllustrationPrompt.system(language),
          user: IllustrationPrompt.user(groupText, part, figure) + (note ? "\n\n" + note : ""),
          images: circuitImages,
          schemaName: "illustration",
          schema: IllustrationPrompt.schema,
          maxTokens: IllustrationPrompt.maxTokens,
          signal: options.signal,
        });
        const reply = decodeFromContent(content, (json) => {
          const decoded = decodeIllustration(json);
          if (!decoded) throw new IllustrationFailure();
          return decoded;
        });
        const prepared = prepareFigure(reply, language, true, reply.needsFigure === true || part.figureTopic !== null);
        if (prepared.outcome === "withheld" && reply.elements.length > 0 && !isAllowedFreeForm(reply)) {
          if (attempt === 0) {
            note =
              "Your last reply drew free-form elements, which this question can't use: reply again with " +
              '"premade" {"type", "params"} or the template that fits (function, series, geometry, …) ' +
              'and "elements": []. For a graph, use premade "functionGraph" or template "function" with f in x.';
            continue;
          }
          return IllustrationFallback.scene(groupText, part, language) ?? prepared.illustration;
        }
        if (attempt === 0 && decodeTemplate(reply.template)?.kind !== "series" && hasDataTable(groupText)) {
          note =
            'The question gives a table of measurements: reply with the "series" template holding ' +
            'the table\'s points and "fit" ("linear" or "throughOrigin"), and "elements": [].';
          continue;
        }
        if (
          attempt === 0 &&
          reply.premade &&
          !reply.template &&
          prepared.outcome !== "premade" &&
          prepared.illustration.elements.length === 0
        ) {
          note =
            'Your "premade" figure could not be drawn (unknown type or invalid params). Reply again with a ' +
            '"template" or, where it is allowed, free-form elements, and "premade": null.';
          continue;
        }
        if (new CompiledIllustration(prepared.illustration).isDrawable) return prepared.illustration;
        if (attempt === 1) {
          const fallback = IllustrationFallback.scene(groupText, part, language);
          if (fallback) return fallback;
        }
      }
      const fallback = IllustrationFallback.scene(groupText, part, language);
      if (fallback) return fallback;
      throw new IllustrationFailure();
    });
    // Laid out again on every read, so a saved template follows the app's layout.
    return compilingTemplate(plottingAuxiliarySum(fetched, part), language);
  }
}
