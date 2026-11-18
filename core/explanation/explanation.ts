// Port of LearnLayer/Explanation/ExplanationScript.swift (all but the Graph, in core/illustrations/graph.ts),
// AI/ExplanationPrompt.swift (v14), AI/ExplanationProvider.swift, Explanation/EquationDetector.swift and
// Explanation/ExplanationSession.swift @ ref 2026-11-04.
//
// The study menu of a clicked function (EquationStudyAction) is in studyAction.ts. Not here yet (docs/DECISOES.md): the
// equation morph animation.

import { cacheKey, type DiskCache } from "../ai/diskCache";
import type { ModelClient } from "../ai/modelClient";
import { AISettings } from "../ai/modelRouting";
import { decodeFromContent } from "../ai/replyDecoding";
import { decodeGraph, Graphs, type Graph } from "../illustrations/graph";
import { Verifier, type Check, type SolvingLine } from "../math/verifier";
import type { PageText, Rect } from "../pdf/page";
import { swiftSchema, swiftText, type JSONSchema } from "../prompts/swiftText";
import { normalizeText as normalize } from "../problems/textNormalizer";
import { EquationStudyActions, ParsedStandaloneMath, type EquationStudyAction } from "./studyAction";

export type StepKind = "question" | "hint" | "step" | "animation";

export interface ExplanationMark {
  style: "circle" | "underline";
  /** The piece of the equation to mark, copied exactly, e.g. "a" or "½at²". */
  target: string;
}

export interface ExplanationStep {
  kind: StepKind;
  text: string | null;
  /** For a question: the piece of the equation that answers it. */
  answer: string | null;
  marks: ExplanationMark[] | null;
  /** Draw the graph (and the car, if it has one). */
  showsGraph: boolean | null;
}

export interface ExplanationScript {
  subject: string | null;
  equation: string;
  steps: ExplanationStep[];
  graph: Graph | null;
  checks: Check[] | null;
  /** What each symbol or term means, shown when the pointer rests on it. */
  symbols: { target: string; meaning: string }[] | null;
  /** The equation solved line by line, like a worked solution on paper. */
  solving: SolvingLine[] | null;
  premade: { type: string; params: Record<string, unknown> } | null;
  needsFigure: boolean | null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown) => (typeof value === "string" ? value : null);

export class ExplanationDecodingError extends Error {}

function decodeStep(value: unknown): ExplanationStep {
  if (!isObject(value) || !["question", "hint", "step", "animation"].includes(value.kind as string))
    throw new ExplanationDecodingError("step");
  const marks = Array.isArray(value.marks)
    ? value.marks.flatMap((mark) =>
        isObject(mark) && (mark.style === "circle" || mark.style === "underline") && typeof mark.target === "string"
          ? [{ style: mark.style, target: mark.target } as ExplanationMark]
          : [],
      )
    : null;
  return {
    kind: value.kind as StepKind,
    text: str(value.text),
    answer: str(value.answer),
    marks,
    showsGraph: typeof value.showsGraph === "boolean" ? value.showsGraph : null,
  };
}

export function decodeExplanationScript(value: unknown): ExplanationScript {
  if (!isObject(value) || typeof value.equation !== "string" || !Array.isArray(value.steps))
    throw new ExplanationDecodingError("script");
  const checks = Array.isArray(value.checks)
    ? value.checks.flatMap((check): Check[] =>
        isObject(check) &&
        typeof check.kind === "string" &&
        typeof check.left === "string" &&
        typeof check.right === "string"
          ? [
              {
                kind: check.kind as Check["kind"],
                left: check.left,
                right: check.right,
                variable: str(check.variable),
                from: str(check.from),
                to: str(check.to),
                domain: (str(check.domain) as Check["domain"]) ?? null,
              } as Check,
            ]
          : [],
      )
    : null;
  return {
    subject: str(value.subject),
    equation: value.equation,
    steps: value.steps.map(decodeStep),
    graph: decodeGraph(value.graph),
    checks,
    symbols: Array.isArray(value.symbols)
      ? value.symbols.flatMap((symbol) =>
          isObject(symbol) && typeof symbol.target === "string" && typeof symbol.meaning === "string"
            ? [{ target: symbol.target, meaning: symbol.meaning }]
            : [],
        )
      : null,
    solving: Array.isArray(value.solving)
      ? value.solving.flatMap((line) =>
          isObject(line) && typeof line.line === "string" ? [{ line: line.line, move: str(line.move) ?? "" }] : [],
        )
      : null,
    premade:
      isObject(value.premade) && typeof value.premade.type === "string"
        ? { type: value.premade.type, params: isObject(value.premade.params) ? value.premade.params : {} }
        : null,
    needsFigure: typeof value.needsFigure === "boolean" ? value.needsFigure : null,
  };
}

/**
 * A question that says α when the equation (and the answer symbol) use a. The Greek letter is rewritten to the symbol
 * copied from the equation. Left alone when the equation itself uses the Greek letter.
 */
export function aligningParameterSymbol(text: string, equation: string, symbol: string | null): string {
  const pairs: [string, string][] = [
    ["α", "a"],
    ["β", "b"],
    ["γ", "g"],
    ["θ", "t"],
    ["λ", "l"],
    ["μ", "m"],
    ["ω", "w"],
    ["φ", "f"],
    ["ρ", "r"],
    ["δ", "d"],
  ];
  if (!symbol) return text;
  let result = text;
  for (const [greek, latin] of pairs) {
    if (symbol !== latin || !equation.includes(latin) || equation.includes(greek)) continue;
    result = result.split(greek).join(latin);
  }
  return result;
}

/** Drops anything that points at text the equation doesn't have, and a graph the app can't draw. */
export function checkedScript(
  script: ExplanationScript,
  equation: { text: string; has(target: string): boolean },
): ExplanationScript {
  const symbol = script.steps.find((step) => step.kind === "question")?.answer ?? script.graph?.draggable ?? null;
  const steps = script.steps.map((step) => ({
    ...step,
    text: step.text === null ? null : aligningParameterSymbol(step.text, equation.text, step.answer ?? symbol),
    marks: step.marks?.filter((mark) => equation.has(mark.target)) ?? null,
    answer: step.answer !== null && !equation.has(step.answer) ? null : step.answer,
  }));
  let graph: Graph | null = null;
  if (script.graph) {
    const readable = Graphs.withReadableCurve(script.graph);
    graph = Graphs.isDrawable(readable) ? readable : null;
  }
  return {
    ...script,
    steps,
    graph,
    symbols: script.symbols?.filter((entry) => equation.has(entry.target)) ?? null,
  };
}

// MARK: The prompt

/** From LearnLayer/Explanation/ExplanationStepTemplates.swift (`promptSummary`), word for word. */
const explanationTemplateIDs = [
  "solveEquation",
  "ruffini",
  "limit",
  "derivativeMonotonicity",
  "integral",
  "forcesNewton",
  "electronConfig",
];
export const explanationTemplateSummary =
  '"explanationTemplate": optional structured steps instead of free-form cards. ' +
  `{"id": one of ${explanationTemplateIDs.join(", ")}, "values": {…}}. ` +
  "solveEquation: equation, unknown, steps[{line, operation}]. " +
  "ruffini: coefficients[], root, quotient[], remainder. " +
  "limit: expression, variable, point, side(left|right|both), steps[]. " +
  "derivativeMonotonicity: function, interval, criticalPoints[], signIntervals[]. " +
  "integral: integrand, variable, from, to, technique, steps[]. " +
  "forcesNewton: body, forces[{name, magnitude, direction}], equation, unknown. " +
  "electronConfig: element, config string, orbitalBoxes[].";

export const ExplanationPrompt = {
  version: swiftText("ExplanationPrompt", "version#0"),

  system(language: string): string {
    return swiftText("ExplanationPrompt", "system#0", {
      language,
      "ExplanationStepTemplate.promptSummary": explanationTemplateSummary,
    });
  },

  /** With a plan from the memory, its block replaces "what the student studied recently". */
  user(
    equation: string,
    context: string,
    history = "",
    plan: string | null = null,
    study: EquationStudyAction | null = null,
  ): string {
    let message = swiftText("ExplanationPrompt", "message#0", { equation, context });
    // A task from the study menu, with the function read from the click.
    if (study) message += "\n\n" + EquationStudyActions.promptAddendum(study, ParsedStandaloneMath.parse(equation));
    if (plan) message += swiftText("ExplanationPrompt", "plan#0") + plan;
    else if (history !== "") message += swiftText("ExplanationPrompt", "plan#1") + history;
    return message;
  },

  schema: swiftSchema("ExplanationPrompt.schema") as JSONSchema,
};

export interface ExplanationServices {
  cache: DiskCache<ExplanationScript>;
  client(model: string): ModelClient;
  language(): string;
  /** Working without the API: the sample explanation. */
  mock?: (() => ExplanationScript) | null;
  /** The plan the memory reads for this equation: its prompt block and its cache token. */
  plan?: (equation: string) => { block: string; token: string } | null;
  /** Remembers the equation and its explanation (MemoryStore). */
  remember?: (equation: string, script: ExplanationScript) => void;
}

/** Gets the steps for an equation from the model, once: they are saved (`explanations.json`). */
export class ExplanationProvider {
  constructor(readonly services: ExplanationServices) {}

  private key(equation: string, context: string, model: string, study: EquationStudyAction | null): Promise<string> {
    const token = this.services.mock ? "" : (this.services.plan?.(equation)?.token ?? "");
    return cacheKey(
      (this.services.mock ? "mock-" : "") + ExplanationPrompt.version,
      model,
      this.services.language(),
      study ?? "",
      token,
      equation,
      context,
    );
  }

  async cached(
    equation: string,
    context: string,
    model: string,
    study: EquationStudyAction | null = null,
  ): Promise<ExplanationScript | null> {
    return this.services.cache.cached(await this.key(equation, context, model, study));
  }

  async script(
    equation: string,
    context: string,
    model: string,
    signal?: AbortSignal,
    study: EquationStudyAction | null = null,
  ): Promise<ExplanationScript> {
    const key = await this.key(equation, context, model, study);
    return this.services.cache.script(key, async () => {
      if (this.services.mock) return this.services.mock();
      const plan = this.services.plan?.(equation) ?? null;
      const { content } = await this.services.client(model).complete({
        system: ExplanationPrompt.system(this.services.language()),
        user: ExplanationPrompt.user(equation, context, "", plan?.block ?? null, study),
        schemaName: "explanation",
        schema: ExplanationPrompt.schema,
        signal,
      });
      const script = decodeFromContent(content, decodeExplanationScript);
      this.services.remember?.(equation, script);
      return script;
    });
  }
}

// MARK: Finding the equation on the page

export interface EquationMatch {
  bounds: Rect;
  text: string;
}

const relationCharacters = new Set("=<>≤≥≈≠∝→⇒⇔≡∼");
const mathCharacters = new Set(
  "=<>≤≥≈≠∝→⇒⇔≡∼+−-×·÷/^√∑∏∫∂∆∇∞±()[]{}|′″½⅓¼²³⁴⁵⁶⁷⁸⁹⁰¹₀₁₂₃₄₅₆₇₈₉αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΦΨΩ",
);

const clean = (text: string) => normalize(text).trim();

/**
 * Prose has several real words; a displayed equation has almost none. The Mac also counts a maths font (CMMI, STIX…)
 * as a sign; pdf.js does not say which font a glyph is in, so that rule is left out here.
 */
export function looksLikeMath(raw: string): boolean {
  const text = clean(raw);
  if ([...text].length < 3) return false;
  const words = text.split(/[^\p{L}]+/u).filter((word) => [...word].length >= 4);
  const symbols = [...text].filter((character) => mathCharacters.has(character)).length;
  const hasRelation = [...text].some((character) => relationCharacters.has(character));
  if (words.length > 3) return false;
  return hasRelation && (symbols >= 2 || words.length === 0);
}

interface PageLine {
  text: string;
  bounds: Rect;
}

function linesOf(page: PageText): PageLine[] {
  const lines: PageLine[] = [];
  let start = 0;
  for (const line of page.text.split("\n")) {
    let bounds: Rect | null = null;
    for (let at = start; at < start + line.length; at++) {
      const box = page.boxes[at];
      if (!box) continue;
      if (!bounds) bounds = { ...box };
      else {
        const x = Math.min(bounds.x, box.x);
        const y = Math.min(bounds.y, box.y);
        bounds = {
          x,
          y,
          width: Math.max(bounds.x + bounds.width, box.x + box.width) - x,
          height: Math.max(bounds.y + bounds.height, box.y + box.height) - y,
        };
      }
    }
    if (bounds && line.trim() !== "") lines.push({ text: line, bounds });
    start += line.length + 1;
  }
  return lines;
}

const contains = (rect: Rect, x: number, y: number) =>
  x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

export const EquationDetector = {
  /** The equation under `point` (PDF points, y up), with close maths lines above and below; null over prose. */
  equation(page: PageText, point: { x: number; y: number }): EquationMatch | null {
    const lines = linesOf(page);
    const mathLine = (x: number, y: number): PageLine | null => {
      const line = lines.find((candidate) =>
        contains(
          {
            x: candidate.bounds.x - 4,
            y: candidate.bounds.y - 4,
            width: candidate.bounds.width + 8,
            height: candidate.bounds.height + 8,
          },
          x,
          y,
        ),
      );
      if (!line) return null;
      // A symbol from another run (∫, Σ) on the same line belongs to it.
      const row = lines.filter(
        (other) =>
          Math.abs(other.bounds.y + other.bounds.height / 2 - (line.bounds.y + line.bounds.height / 2)) <
            line.bounds.height / 2 &&
          other.bounds.x < line.bounds.x + line.bounds.width + 80 &&
          other.bounds.x + other.bounds.width > line.bounds.x - 80,
      );
      const widened: PageLine =
        row.length > 1
          ? {
              text: row
                .sort((a, b) => a.bounds.x - b.bounds.x)
                .map((other) => other.text)
                .join(" "),
              bounds: row.reduce((box, other) => {
                const x0 = Math.min(box.x, other.bounds.x);
                const y0 = Math.min(box.y, other.bounds.y);
                return {
                  x: x0,
                  y: y0,
                  width: Math.max(box.x + box.width, other.bounds.x + other.bounds.width) - x0,
                  height: Math.max(box.y + box.height, other.bounds.y + other.bounds.height) - y0,
                };
              }, line.bounds),
            }
          : line;
      return looksLikeMath(widened.text) ? widened : null;
    };
    const first = mathLine(point.x, point.y);
    if (!first) return null;
    let bounds = { ...first.bounds };
    let text = clean(first.text);
    for (const direction of [1, -1]) {
      let edge = { ...bounds };
      for (let step = 0; step < 2; step++) {
        const probeY = direction > 0 ? edge.y + edge.height + edge.height * 0.5 : edge.y - edge.height * 0.5;
        const neighbour = mathLine(point.x, probeY);
        if (!neighbour) break;
        const gap =
          direction > 0
            ? neighbour.bounds.y - (edge.y + edge.height)
            : edge.y - (neighbour.bounds.y + neighbour.bounds.height);
        const overlaps =
          neighbour.bounds.x < bounds.x + bounds.width &&
          neighbour.bounds.x + neighbour.bounds.width > bounds.x &&
          neighbour.bounds.y < bounds.y + bounds.height &&
          neighbour.bounds.y + neighbour.bounds.height > bounds.y;
        if (!(gap < edge.height * 0.6) || overlaps) break;
        const x0 = Math.min(bounds.x, neighbour.bounds.x);
        const y0 = Math.min(bounds.y, neighbour.bounds.y);
        bounds = {
          x: x0,
          y: y0,
          width: Math.max(bounds.x + bounds.width, neighbour.bounds.x + neighbour.bounds.width) - x0,
          height: Math.max(bounds.y + bounds.height, neighbour.bounds.y + neighbour.bounds.height) - y0,
        };
        text = direction > 0 ? clean(neighbour.text) + "\n" + text : text + "\n" + clean(neighbour.text);
        edge = neighbour.bounds;
      }
    }
    const media = page.mediaBox;
    const grown = { x: bounds.x - 6, y: bounds.y - 4, width: bounds.width + 12, height: bounds.height + 8 };
    const x = Math.max(grown.x, media.x);
    const y = Math.max(grown.y, media.y);
    return {
      bounds: {
        x,
        y,
        width: Math.min(grown.x + grown.width, media.x + media.width) - x,
        height: Math.min(grown.y + grown.height, media.y + media.height) - y,
      },
      text,
    };
  },

  /** About a paragraph of text around the equation, for context. */
  context(page: PageText, bounds: Rect): string {
    const area = { y: bounds.y - 140, height: bounds.height + 280 };
    const text = linesOf(page)
      .filter((line) => line.bounds.y < area.y + area.height && line.bounds.y + line.bounds.height > area.y)
      .map((line) => line.text)
      .join("\n");
    return [...normalize(text)].slice(0, 1200).join("");
  },

  /** Where `target` sits inside the equation's bounds on the page, trimmed to the glyphs' height; null when absent. */
  rectOnPage(page: PageText, equationBounds: Rect, target: string): Rect | null {
    if (target === "") return null;
    for (
      let found = page.text.indexOf(target);
      found >= 0;
      found = page.text.indexOf(target, found + Math.max(target.length, 1))
    ) {
      let box: Rect | null = null;
      for (let at = found; at < found + target.length; at++) {
        const glyph = page.boxes[at];
        if (!glyph) continue;
        if (!box) box = { ...glyph };
        else {
          const x0 = Math.min(box.x, glyph.x);
          const y0 = Math.min(box.y, glyph.y);
          box = {
            x: x0,
            y: y0,
            width: Math.max(box.x + box.width, glyph.x + glyph.width) - x0,
            height: Math.max(box.y + box.height, glyph.y + glyph.height) - y0,
          };
        }
      }
      if (!box) continue;
      const inside =
        box.x < equationBounds.x + equationBounds.width &&
        box.x + box.width > equationBounds.x &&
        box.y < equationBounds.y + equationBounds.height &&
        box.y + box.height > equationBounds.y;
      if (inside) return { x: box.x, y: box.y + box.height * 0.2, width: box.width, height: box.height * 0.62 };
    }
    return null;
  },
};

// MARK: The session

export type ExplanationIntent = "explain" | "graph" | "tryIt" | "solve";
export type ExplanationState =
  { kind: "loading" } | { kind: "needsKey" } | { kind: "failed"; error: unknown } | { kind: "ready" };

export interface ClickedEquation {
  text: string;
  context: string;
  /** Whether the equation printed on the page holds this piece (marks and answers that point elsewhere are dropped). */
  has(target: string): boolean;
}

/** One explanation: the student chose how to be helped; the same steps from the model serve all of it. */
export class ExplanationSession {
  state: ExplanationState;
  intent: ExplanationIntent | null;
  /** A function-study task chosen from the menu, when any. */
  studyAction: EquationStudyAction | null = null;
  script: ExplanationScript | null = null;
  model: string = AISettings.defaultModel;
  /** Indices of the script's steps that are showing, in order. */
  visible: number[] = [];
  /** Where in `visible` the last group revealed together starts. */
  groupStart = 0;
  feedback: "correct" | "notQuite" | null = null;
  /** Some of the model's maths could not be confirmed, even after a retry. */
  isUnverified = false;
  parameterValue = 0;
  areaEnd: number | null = null;
  runID = 0;
  usedHint = false;
  answeredCorrectly = false;
  version = 0;
  readonly graphStep = Number.MAX_SAFE_INTEGER;
  private readonly listeners = new Set<() => void>();
  private controller: AbortController | null = null;

  constructor(
    readonly equation: ClickedEquation,
    private readonly provider: ExplanationProvider,
    intent: ExplanationIntent | null = null,
    private readonly isSignedOut: (error: unknown) => boolean = () => false,
  ) {
    this.intent = intent;
    this.state = intent === null ? { kind: "ready" } : { kind: "loading" };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private changed() {
    this.version += 1;
    for (const listener of [...this.listeners]) listener();
  }

  /** Loads the explanation; `model` asks a specific model (for "Explain better"). */
  async load(model: string | null = null): Promise<void> {
    if (this.intent === null) return;
    this.controller?.abort();
    const chosen: string = model ?? AISettings.defaultModel;
    const { text, context } = this.equation;
    // Explained before: shown at once. If the default model's maths didn't check out, its stronger retry was saved too.
    const study = this.studyAction;
    const cached = await this.provider.cached(text, context, chosen, study);
    if (cached) {
      if (Verifier.passes(cached)) return this.show(cached, chosen, true);
      const retried =
        chosen !== AISettings.strongModel
          ? await this.provider.cached(text, context, AISettings.strongModel, study)
          : null;
      if (retried) return this.show(retried, AISettings.strongModel, Verifier.passes(retried));
    }
    this.state = { kind: "loading" };
    this.changed();
    const controller = new AbortController();
    this.controller = controller;
    try {
      let script = await this.provider.script(text, context, chosen, controller.signal, study);
      let used = chosen;
      // Wrong maths is worse than slow maths: retry once on the stronger model.
      if (!Verifier.passes(script) && chosen !== AISettings.strongModel) {
        script = await this.provider.script(text, context, AISettings.strongModel, controller.signal, study);
        used = AISettings.strongModel;
      }
      if (controller.signal.aborted) return;
      this.show(script, used, Verifier.passes(script));
    } catch (error) {
      if (controller.signal.aborted) return;
      this.state = this.isSignedOut(error) ? { kind: "needsKey" } : { kind: "failed", error };
      this.changed();
    }
  }

  /** Asks the stronger model for a fresh explanation. */
  explainBetter(): void {
    void this.load(AISettings.strongModel);
  }

  get canExplainBetter(): boolean {
    return this.state.kind === "ready" && this.script !== null && this.model !== AISettings.strongModel;
  }

  cancel(): void {
    this.controller?.abort();
  }

  private show(script: ExplanationScript, model: string, verified: boolean) {
    this.script = checkedScript(script, this.equation);
    this.model = model;
    this.isUnverified = !verified;
    this.parameterValue = this.script.graph ? (Graphs.draggableParameter(this.script.graph)?.value ?? 0) : 0;
    this.areaEnd = null;
    this.applyIntent();
    this.state = { kind: "ready" };
    this.changed();
  }

  /** The student picked what they want from the options beside the equation. */
  choose(intent: ExplanationIntent): void {
    if (this.intent !== null) return;
    this.intent = intent;
    if (this.script === null) {
      this.state = { kind: "loading" };
      this.changed();
      void this.load();
    } else {
      this.applyIntent();
      this.changed();
    }
  }

  /**
   * The student picked a task from the study menu: it is solved with the task's note to the model. A task that needs a
   * function, on a click that is not one, is solved as it is.
   */
  chooseStudy(action: EquationStudyAction, parsed: ParsedStandaloneMath | null): void {
    if (this.intent !== null) return;
    this.studyAction = EquationStudyActions.requiresFunction(action) && parsed === null ? null : action;
    this.intent = "solve";
    this.script = null;
    this.state = { kind: "loading" };
    this.changed();
    void this.load();
  }

  private applyIntent() {
    this.feedback = null;
    this.groupStart = 0;
    const script = this.script;
    if (!script || !this.intent) {
      this.visible = [];
      return;
    }
    const indices = script.steps.map((_, index) => index);
    const question = indices.find((index) => script.steps[index]!.kind === "question");
    const explanation = indices.filter((index) => ["step", "animation"].includes(script.steps[index]!.kind));
    const animation = indices.filter((index) => script.steps[index]!.kind === "animation");
    switch (this.intent) {
      case "tryIt":
        this.visible = question !== undefined ? [question] : explanation;
        break;
      case "graph":
        this.visible = script.graph !== null && animation.length > 0 ? animation : explanation;
        break;
      case "explain":
        this.visible = explanation;
        break;
      case "solve":
        this.visible = (script.solving ?? []).length === 0 ? explanation : [];
        break;
    }
  }

  get solvingLines(): SolvingLine[] {
    return this.intent === "solve" ? (this.script?.solving ?? []) : [];
  }

  get symbols() {
    return this.script?.symbols ?? [];
  }

  get steps(): ExplanationStep[] {
    const script = this.script;
    return script ? this.visible.map((index) => script.steps[index]!) : [];
  }

  /** The steps revealed by the student's last action, shown together. */
  get currentGroup(): ExplanationStep[] {
    return this.steps.slice(this.groupStart);
  }

  get marks(): ExplanationMark[] {
    const seen = new Set<string>();
    return this.steps
      .flatMap((step) => step.marks ?? [])
      .filter((mark) => {
        const key = `${mark.style}\n${mark.target}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  /** Pieces of the equation the student can click to answer. */
  get clickableTargets(): string[] {
    const script = this.script;
    if (!script) return [];
    const answers = script.steps.flatMap((step) => (step.answer ? [step.answer] : []));
    const marked = script.steps.flatMap((step) => (step.marks ?? []).map((mark) => mark.target));
    return [...new Set([...answers, ...marked])];
  }

  /** Draggable graph with car or parameters. */
  get usesInteractiveGraph(): boolean {
    const graph = this.script?.graph;
    return (
      graph !== null &&
      graph !== undefined &&
      Graphs.isDrawable(graph) &&
      (graph.showsCar || Graphs.draggableParameter(graph) !== null)
    );
  }

  get showsGraph(): boolean {
    const graph = this.script?.graph;
    if (!graph || !Graphs.isDrawable(graph)) return false;
    if (this.intent === "graph") return true;
    return this.steps.some((step) => step.showsGraph === true || step.kind === "animation");
  }

  private get remainingExplanation(): number[] {
    const script = this.script;
    if (!script) return [];
    return script.steps
      .map((_, index) => index)
      .filter((index) => !this.visible.includes(index) && ["step", "animation"].includes(script.steps[index]!.kind));
  }

  get hasMoreSteps(): boolean {
    return this.intent === "tryIt" && this.remainingExplanation.length > 0;
  }

  private get unseenHint(): number | null {
    const script = this.script;
    if (!script) return null;
    const index = script.steps.findIndex((step, at) => step.kind === "hint" && !this.visible.includes(at));
    return index >= 0 ? index : null;
  }

  /** One hint, only while the student is trying it themselves. */
  get canShowHint(): boolean {
    return this.intent === "tryIt" && !this.usedHint && this.unseenHint !== null && this.hasMoreSteps;
  }

  showHint(): void {
    const hint = this.unseenHint;
    if (!this.canShowHint || hint === null) return;
    this.groupStart = this.visible.length;
    this.visible = [...this.visible, hint];
    this.feedback = null;
    this.usedHint = true;
    this.changed();
  }

  /** Everything else at once: the explanation, the marks and the graph. */
  showAll(): void {
    const rest = this.remainingExplanation;
    if (rest.length === 0) return;
    this.groupStart = this.visible.length;
    this.visible = [...this.visible, ...rest];
    this.changed();
  }

  /** The student answered the question by clicking part of the equation. */
  answer(target: string): void {
    const expected = this.script?.steps.find((step) => step.kind === "question")?.answer;
    if (this.intent !== "tryIt" || !this.hasMoreSteps || !expected) return;
    if (target === expected) {
      this.answeredCorrectly = !this.usedHint && this.feedback === null;
      this.showAll();
      this.feedback = "correct";
    } else this.feedback = "notQuite";
    this.changed();
  }

  setParameterValue(value: number): void {
    const parameter = this.script?.graph ? Graphs.draggableParameter(this.script.graph) : null;
    if (!parameter) return;
    this.parameterValue = Math.min(parameter.max, Math.max(parameter.min, value));
    this.changed();
  }

  setAreaEnd(value: number): void {
    this.areaEnd = value;
    this.changed();
  }

  replayCar(): void {
    this.runID += 1;
    this.changed();
  }
}
