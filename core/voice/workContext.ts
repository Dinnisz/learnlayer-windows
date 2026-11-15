// Port of LearnLayer/Problems/VoiceTutorWorkContext.swift (`build`) @ ref 2026-11-04: the work on screen (the solution's
// steps, the figure as the model read it) that the spoken tutor and the mascot's lesson refer to. The descriptions of
// the app's own figures (sign tables, drawings, 3D, timing) join it with the figures in phase 6.

import type { Part, ProblemSolution } from "../problems/problemSolution";
import { describePart } from "../problems/textHelp";

export function workContext(options: {
  label: string;
  groupLabels: readonly string[];
  solution: ProblemSolution | null;
  part: Part | null;
  figureNote: string | null;
}): string {
  const lines = [`Alínea (question label): ${options.label}`];
  if (options.groupLabels.length > 0) lines.push("Group items: " + options.groupLabels.join(", "));
  const figure = options.solution?.figure ?? "";
  if (figure.trim() !== "") lines.push("Figure description from the solution:\n" + figure);
  if (options.figureNote) lines.push("Student note about the figure:\n" + options.figureNote);
  const solution = options.solution;
  if (solution) {
    if (solution.subject !== "") lines.push(`Subject: ${solution.subject}`);
    const graph = solution.graph as { yLabel?: unknown; xLabel?: unknown; expression?: unknown } | null;
    if (graph && typeof graph.expression === "string") {
      lines.push(`Graph: ${String(graph.yLabel ?? "")} vs ${String(graph.xLabel ?? "")}, ${graph.expression}`);
    }
    for (const item of options.part ? [options.part] : solution.parts) lines.push(...describePart(item));
  }
  return lines.join("\n").trim();
}

/** The words of the written solution, to keep the mascot from saying them again (`solutionWording`). */
export function solutionWording(part: Part | null): string[] {
  if (!part) return [];
  const texts: string[] = [];
  for (const card of part.cards ?? []) texts.push(card.title, card.note ?? "", card.say ?? "");
  texts.push(...part.steps, part.answer.text);
  return texts.filter((text) => text.trim() !== "");
}

/** "(B) 2,4" → "B"; null when the answer is not a lettered option. */
export function optionLetter(answer: string | null): string | null {
  const match = answer ? /^\s*\(?([A-Ea-e])\)/u.exec(answer) : null;
  return match ? match[1]!.toUpperCase() : null;
}

/** The options printed in a question's text, by letter: "(A) 2 mA" or "A. 2 mA" at the start of a line. */
export function optionLinesOf(text: string): Record<string, string> {
  const options: Record<string, string> = {};
  for (const match of text.matchAll(/^\s*\(?([A-E])[.)]\s+(.+?)\s*$/gmu)) {
    if (options[match[1]!] === undefined) options[match[1]!] = match[2]!;
  }
  return options;
}
