// Regenerates core/prompts/swift/*.json from the Mac sources: every string literal of the prompt files, as
// Swift builds it, and the JSON schemas of section 6, as Swift's dictionaries hold them. The reference copy is
// not in git, so the generated files are committed; with --check it only compares (exit 1 when they differ),
// which the test suite does whenever the reference copy is there.
//   node scripts/extract-prompts.mjs [--check]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SchemaEvaluator } from "./swift-schema.mjs";
import { swiftStrings } from "./swift-strings.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reference = join(root, "referencia-mac/LearnLayer");
const outDir = join(root, "core/prompts/swift");

/** The prompts of CLAUDE.md section 6, and the files whose text they pull in. */
export const promptSources = [
  "Problems/ProblemPrompt.swift",
  "Problems/QuestionClassifier.swift",
  "Problems/FastTranscription.swift",
  "Problems/QuestionTranscription.swift",
  "AI/ExplanationPrompt.swift",
  "Illustrations/IllustrationPrompt.swift",
  "Problems/TextHelp.swift",
  "Problems/ProblemVariant.swift",
  "Lesson/MascotLessonPrompt.swift",
  "Voice/VoiceTutorPrompt.swift",
  "Memory/ExplanationPlanner.swift",
  "Problems/FigureTranscription.swift",
  "Problems/OptionFigures.swift",
  "Problems/VisualAid.swift",
  "AI/OpenRouterClient.swift",
];

/** The schemas sent as `response_format` (or described in the prompt when too large), by Swift name. */
export const schemaNames = [
  "ProblemPrompt.schema",
  "QuestionClassifier.schema",
  "FastTranscription.schema",
  "ExplanationPrompt.schema",
  "IllustrationPrompt.schema",
  "TextHelpPrompt.schema",
  "VariantPrompt.schema",
  "MascotLessonPrompt.schema",
  "VoiceTutorPrompt.schema",
  "FigureTranscription.schema",
  "VisualAidPrompt.schema",
];

/**
 * The two statements the evaluator does not read. Both are
 *   var graph = (ExplanationPrompt.schema["properties"] as? [String: Any])?["graph"] ?? ["type": "null"]
 *   if !(graph is [String: Any]) { graph = ["type": "null"] }
 * that is: the explanation schema's "graph" property, which is a dictionary, so the `if` changes nothing.
 */
const explanationGraph = (evaluator) => {
  const graph = evaluator.value("ExplanationPrompt", "schema").properties?.graph;
  return graph && typeof graph === "object" && !Array.isArray(graph) ? graph : { type: "null" };
};
export const schemaOverrides = {
  "ProblemPrompt.schema/graph": { value: explanationGraph },
  "ProblemPrompt.schema/if": { value: null },
  "TextHelpPrompt.schema/graph": { value: explanationGraph },
  "TextHelpPrompt.schema/if": { value: null },
};

export const outputName = (file) => basename(file, ".swift") + ".json";

/** What the generator writes: file name → text. */
export function generated() {
  const files = {};
  for (const file of promptSources) {
    files[outputName(file)] = JSON.stringify(swiftStrings(readFileSync(join(reference, file), "utf8")), null, 2) + "\n";
  }
  const evaluator = new SchemaEvaluator(reference, schemaOverrides);
  const schemas = {};
  for (const name of schemaNames) {
    const [type, member] = name.split(".");
    schemas[name] = evaluator.value(type, member);
  }
  files["schemas.json"] = JSON.stringify(schemas, null, 2) + "\n";
  return files;
}

export const referenceAvailable = () => existsSync(reference);
export const generatedDirectory = outDir;

const main = () => {
  const check = process.argv.includes("--check");
  if (!referenceAvailable()) {
    console.error("No reference copy at " + reference);
    process.exitCode = 1;
    return;
  }
  mkdirSync(outDir, { recursive: true });
  for (const [name, text] of Object.entries(generated())) {
    const target = join(outDir, name);
    if (check) {
      const current = existsSync(target) ? readFileSync(target, "utf8") : "";
      if (current !== text) {
        console.error("differs: " + target);
        process.exitCode = 1;
      }
    } else {
      writeFileSync(target, text, "utf8");
      console.log(`${name}: ${Object.keys(JSON.parse(text)).length} entries`);
    }
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
