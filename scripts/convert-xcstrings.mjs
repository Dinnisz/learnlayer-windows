// Regenerates core/i18n/locales/*.json from the Mac app's String Catalog.
//   node scripts/convert-xcstrings.mjs [path/to/Localizable.xcstrings]
// The reference copy is not in git, so the generated tables are committed.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { convertCatalog } from "./xcstrings.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = process.argv[2] ?? join(root, "referencia-mac/LearnLayer/Resources/Localizable.xcstrings");
const outDir = join(root, "core/i18n/locales");
const languages = ["en", "pt-PT"];

const catalog = JSON.parse(readFileSync(input, "utf8"));
const { tables, untranslated } = convertCatalog(catalog, languages);

mkdirSync(outDir, { recursive: true });
for (const language of languages) {
  const file = join(outDir, `${language}.json`);
  writeFileSync(file, JSON.stringify(tables[language], null, 2) + "\n", "utf8");
  const count = Object.keys(tables[language]).length;
  console.log(`${language}: ${count} keys → ${file}`);
  if (untranslated[language].length > 0) {
    console.error(`${language}: ${untranslated[language].length} untranslated keys:`);
    for (const key of untranslated[language]) console.error(`  ${JSON.stringify(key)}`);
    process.exitCode = 1;
  }
}
