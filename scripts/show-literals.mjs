// Prints the extracted literals of one prompt file, for porting the code around them:
//   node scripts/show-literals.mjs ProblemPrompt [key-prefix] [max-characters]
import { readFileSync } from "node:fs";

const [name, prefix = "", max = "160"] = process.argv.slice(2);
const literals = JSON.parse(readFileSync(new URL(`../core/prompts/swift/${name}.json`, import.meta.url), "utf8"));
for (const [key, segments] of Object.entries(literals)) {
  if (!key.startsWith(prefix)) continue;
  const text = segments.map((segment) => ("expr" in segment ? `{{${segment.expr}}}` : segment.text)).join("");
  const shown = text.length > Number(max) ? text.slice(0, Number(max)) + ` …(${text.length})` : text;
  console.log(`${key}: ${JSON.stringify(shown)}`);
}
