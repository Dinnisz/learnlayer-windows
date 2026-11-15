// The prompt texts as the Mac app builds them, extracted from its Swift sources by scripts/extract-prompts.mjs
// (CLAUDE.md, section 6: ported word for word, with the same version numbers). A literal is a list of segments:
// text, or an interpolation whose Swift expression is kept so the port can fill it in.

import ExplanationPlanner from "./swift/ExplanationPlanner.json";
import ExplanationPrompt from "./swift/ExplanationPrompt.json";
import FastTranscription from "./swift/FastTranscription.json";
import FigureTranscription from "./swift/FigureTranscription.json";
import IllustrationPrompt from "./swift/IllustrationPrompt.json";
import MascotLessonPrompt from "./swift/MascotLessonPrompt.json";
import OpenRouterClient from "./swift/OpenRouterClient.json";
import OptionFigures from "./swift/OptionFigures.json";
import ProblemPrompt from "./swift/ProblemPrompt.json";
import ProblemVariant from "./swift/ProblemVariant.json";
import QuestionClassifier from "./swift/QuestionClassifier.json";
import QuestionTranscription from "./swift/QuestionTranscription.json";
import schemas from "./swift/schemas.json";
import TextHelp from "./swift/TextHelp.json";
import VisualAid from "./swift/VisualAid.json";
import VoiceTutorPrompt from "./swift/VoiceTutorPrompt.json";

export type Segment = { text: string } | { expr: string };
type Literals = Record<string, Segment[]>;

const files: Record<string, Literals> = {
  ExplanationPlanner,
  ExplanationPrompt,
  FastTranscription,
  FigureTranscription,
  IllustrationPrompt,
  MascotLessonPrompt,
  OpenRouterClient,
  OptionFigures,
  ProblemPrompt,
  ProblemVariant,
  QuestionClassifier,
  QuestionTranscription,
  TextHelp,
  VisualAid,
  VoiceTutorPrompt,
};

export type SwiftFile = keyof typeof files;

/**
 * The literal `key` ("system#0") of `file`, with every interpolation filled from `values` by its Swift
 * expression. A missing value is an error, never an empty string: the prompt would silently change.
 */
export function swiftText(file: SwiftFile, key: string, values: Readonly<Record<string, string>> = {}): string {
  const segments = files[file]?.[key];
  if (!segments) throw new Error(`No literal ${key} in ${file}.swift`);
  return segments
    .map((segment) => {
      if ("text" in segment) return segment.text;
      const value = values[segment.expr];
      if (value === undefined) throw new Error(`${file}.swift ${key}: no value for \\(${segment.expr})`);
      return value;
    })
    .join("");
}

/** The interpolations of a literal, so a test can check every one is filled. */
export function interpolations(file: SwiftFile, key: string): string[] {
  return (files[file]?.[key] ?? []).flatMap((segment) => ("expr" in segment ? [segment.expr] : []));
}

export type JSONSchema = Record<string, unknown>;

/** A schema by its Swift name ("ProblemPrompt.schema"), as the Mac's dictionaries hold it. */
export function swiftSchema(name: keyof typeof schemas): JSONSchema {
  return schemas[name] as JSONSchema;
}

/**
 * `JSONSerialization.data(withJSONObject:options: [.sortedKeys])` as text: compact, keys sorted at every depth,
 * and "/" written as "\/" as Foundation does. What the Mac sends, and what it writes into a prompt when a schema
 * is too large to enforce.
 */
export function foundationJSON(value: unknown): string {
  const write = (item: unknown): string => {
    if (item === null || item === undefined) return "null";
    if (Array.isArray(item)) return `[${item.map(write).join(",")}]`;
    if (typeof item === "object") {
      const entries = Object.keys(item as Record<string, unknown>)
        .sort()
        .filter((key) => (item as Record<string, unknown>)[key] !== undefined)
        .map((key) => `${write(key)}:${write((item as Record<string, unknown>)[key])}`);
      return `{${entries.join(",")}}`;
    }
    if (typeof item === "string") return JSON.stringify(item).replaceAll("/", "\\/");
    return JSON.stringify(item);
  };
  return write(value);
}
