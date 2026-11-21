// Port of LearnLayer/Explanation/EquationStudyAction.swift (with ParsedStandaloneMath) and
// Explanation/ExplanationFigure.swift @ ref 2026-11-04: what the student asks for when they click a standalone function
// or equation (graph, zeros, monotonicity, derivative, integral, domain and asymptotes, sign chart, solve), the short
// note that tells the model, and the premade figure the app builds locally from the click and the model's graph.

import { FunctionGraph } from "../illustrations/functionGraph";
import { Graphs } from "../illustrations/graph";
import { applyingPremadeFigure } from "../illustrations/premadeFigure";
import { CompiledIllustration, swiftDouble, type Illustration } from "../illustrations/illustration";
import { PremadeFigures, type PremadeFigure } from "../illustrations/premadeFigure";
import { tryParseExpression, variables } from "../math/expression";
import type { ExplanationScript } from "./explanation";

export type EquationStudyAction =
  "graph" | "zeros" | "monotonicity" | "derivative" | "integral" | "domainAsymptotes" | "signChart" | "solveEquation";

/** A plottable function or equation read from the clicked line. */
export interface ParsedStandaloneMath {
  functionName: string;
  variable: string;
  expression: string;
  isEquation: boolean;
  raw: string;
}

export const ParsedStandaloneMath = {
  parse(text: string): ParsedStandaloneMath | null {
    const raw = text.trim();
    if (raw === "") return null;
    // Half an equation (the left side was on another line, «= n(n+1)/4») or a statement about whole numbers (a sum,
    // n ∈ ℕ, an induction) has no function to graph: the function menu would make no sense (Mac report I8).
    if (/^[=≠<>≤≥]/.test(raw) || /[∑Σ∏∈ℕℤ]|\\(?:sum|prod|in|mathbb)\b/.test(raw)) return null;
    const spec = FunctionGraph.spec([{ text: raw, step: null }]);
    if (spec)
      return { functionName: spec.name, variable: spec.variable, expression: spec.expression, isEquation: false, raw };
    if (raw.includes("=")) {
      const name = (raw.split("=").find((piece) => piece !== "") ?? "f").trim();
      const variable = Array.from(name).find((ch) => /^\p{L}$/u.test(ch)) ?? "x";
      return { functionName: name, variable, expression: raw, isEquation: true, raw };
    }
    return null;
  },
};

export const EquationStudyActions = {
  all: [
    "graph",
    "zeros",
    "monotonicity",
    "derivative",
    "integral",
    "domainAsymptotes",
    "signChart",
    "solveEquation",
  ] as EquationStudyAction[],

  /** The menu's words, as keys of the string catalog (the Mac writes them in Portuguese). */
  title(action: EquationStudyAction): string {
    switch (action) {
      case "graph":
        return "Graph";
      case "zeros":
        return "Zeros";
      case "monotonicity":
        return "Maxima and minima / monotonicity";
      case "derivative":
        return "Derivative";
      case "integral":
        return "Integral / area";
      case "domainAsymptotes":
        return "Domain and asymptotes";
      case "signChart":
        return "Sign chart";
      case "solveEquation":
        return "Solve";
    }
  },

  /** Menu entries for a parsed click; equations also get Solve. */
  menuOptions(parsed: ParsedStandaloneMath | null): EquationStudyAction[] {
    const options: EquationStudyAction[] = [
      "graph",
      "zeros",
      "monotonicity",
      "derivative",
      "integral",
      "domainAsymptotes",
      "signChart",
    ];
    if (parsed?.isEquation === true) options.push("solveEquation");
    return options;
  },

  requiresFunction: (action: EquationStudyAction) => action !== "solveEquation",

  explanationTemplate(action: EquationStudyAction): string | null {
    switch (action) {
      case "monotonicity":
        return "derivativeMonotonicity";
      case "integral":
        return "integral";
      case "solveEquation":
        return "solveEquation";
      default:
        return null;
    }
  },

  premadeFigure(action: EquationStudyAction): string {
    switch (action) {
      case "integral":
        return "integralArea";
      case "solveEquation":
        return "equationSteps";
      default:
        return "functionGraph";
    }
  },

  /** Short note for the model: structured values only, app draws the figure. */
  promptAddendum(action: EquationStudyAction, parsed: ParsedStandaloneMath | null): string {
    const premade = EquationStudyActions.premadeFigure(action);
    const template = EquationStudyActions.explanationTemplate(action) ?? "none";
    const lines = [
      `Study task: ${action}.`,
      `Use premade figure "${premade}" with numeric params only; do not draw free-form elements.`,
      `Prefer explanationTemplate id "${template}" with values only when it applies.`,
      `Put the worked answer in "solving" (line by line). Leave "steps" empty unless the student asked to try it themselves.`,
      `Include "graph" when a curve helps (expression in ASCII, one variable).`,
    ];
    if (parsed) {
      lines.push(`Parsed function: ${parsed.functionName}(${parsed.variable}) = ${parsed.expression}.`);
      if (parsed.isEquation) lines.push("Treat the click as an equation to solve.");
    }
    return lines.join(" ");
  },
};

// MARK: ExplanationFigure

const parses = (expression: string) => tryParseExpression(expression) !== null;

/**
 * A number written against a name or a bracket ("4x", "2(x + 1)") as an explicit product ("4*x"). The figures put the
 * curve variable in by name, and "4x" would keep its x (on the Mac too, docs/DECISOES.md); the value is the same.
 */
export function explicitProducts(expression: string): string {
  // A number that is not the end of a name ("log10") and not a power of ten ("1e5").
  return expression.replace(/(?<![A-Za-z_\d.])(\d+(?:\.\d+)?)\s*(?=[A-Za-z(])(?!e[+-]?\d)/g, "$1*");
}

function functionGraphPremade(
  parsed: ParsedStandaloneMath | null,
  script: ExplanationScript | null,
): PremadeFigure | null {
  const graph = script?.graph ?? null;
  const read = parsed?.expression ?? graph?.expression ?? null;
  const expression = read === null ? null : explicitProducts(read);
  if (expression === null || !parses(expression)) return null;
  const xMin = graph?.xMin ?? -5;
  const xMax = graph?.xMax ?? 5;
  if (!(xMax > xMin)) return null;
  const params: PremadeFigure["params"] = { f: expression, xMin, xMax };
  if (graph && graph.marks.length > 0)
    params["marks"] = graph.marks.map((mark) => ({ x: swiftDouble(mark.x), text: mark.label }));
  return { type: "functionGraph", params };
}

function integralPremade(parsed: ParsedStandaloneMath | null, script: ExplanationScript | null): PremadeFigure | null {
  const read = parsed?.expression ?? script?.graph?.expression ?? null;
  const expression = read === null ? null : explicitProducts(read);
  if (expression === null || !parses(expression)) return null;
  const area = script?.graph?.area ?? null;
  const a = area?.from ?? script?.graph?.xMin ?? 0;
  const b = area?.to ?? script?.graph?.xMax ?? 1;
  if (!(b > a)) return null;
  return { type: "integralArea", params: { f: expression, a, b } };
}

function equationStepsPremade(script: ExplanationScript | null, equation: string | null): PremadeFigure | null {
  const lines = script?.solving ?? [];
  if (lines.length === 0) {
    if (!equation) return null;
    return { type: "equationSteps", params: { steps: [{ line: equation }] } };
  }
  return {
    type: "equationSteps",
    params: {
      steps: lines.map((line): Record<string, string> =>
        line.move === "" ? { line: line.line } : { line: line.line, highlight: line.move },
      ),
    },
  };
}

/** Local premade figures for a clicked equation, before or after the model returns numeric params. */
export const ExplanationFigure = {
  /** The figure to show beside the explanation, or null when none was asked for or it does not draw. */
  compiled(
    script: ExplanationScript | null,
    studyAction: EquationStudyAction | null,
    equationText: string,
    language: string,
    userRequestedFigure: boolean,
  ): Illustration | null {
    if (!userRequestedFigure && script?.needsFigure !== true) return null;
    const premade = ExplanationFigure.choosePremade(script, studyAction, equationText, language);
    if (!premade) return null;
    const scene = applyingPremadeFigure(
      { title: script?.subject ?? "Figure", width: 10, height: 6, parameters: [], elements: [], premade },
      language,
    );
    return new CompiledIllustration(scene).isDrawable && scene.elements.length > 0 ? scene : null;
  },

  localPremade(
    action: EquationStudyAction,
    parsed: ParsedStandaloneMath | null,
    script: ExplanationScript | null,
  ): PremadeFigure | null {
    if (action === "solveEquation") return equationStepsPremade(script, parsed?.raw ?? null);
    if (action === "integral") return integralPremade(parsed, script);
    return functionGraphPremade(parsed, script);
  },

  /** Premade from the model's JSON when it compiles; otherwise built locally from the study menu and graph. */
  choosePremade(
    script: ExplanationScript | null,
    studyAction: EquationStudyAction | null,
    equationText: string,
    language: string,
  ): PremadeFigure | null {
    const model = script?.premade as PremadeFigure | null | undefined;
    if (model && new PremadeFigures(model).compile("Figure", language) !== null) return model;
    const parsed = ParsedStandaloneMath.parse(equationText);
    if (studyAction) {
      const local = ExplanationFigure.localPremade(studyAction, parsed, script);
      if (local) return local;
    }
    const graph = script?.graph ?? null;
    if (graph && Graphs.isDrawable(graph)) {
      const expression = tryParseExpression(graph.expression);
      if (expression && [...variables(expression)].every((name) => name === graph.variable))
        return { type: "functionGraph", params: { f: graph.expression, xMin: graph.xMin, xMax: graph.xMax } };
    }
    return null;
  },
};
