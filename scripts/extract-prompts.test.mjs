// The committed prompt texts and schemas are what the Mac sources build, word for word. Runs only where the
// reference copy exists (this computer); CI has the committed files and the TypeScript tests that use them.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generated, generatedDirectory, referenceAvailable } from "./extract-prompts.mjs";

describe.runIf(referenceAvailable())("prompt texts extracted from the Mac sources", () => {
  it("match the committed files", () => {
    for (const [name, text] of Object.entries(generated())) {
      expect(readFileSync(join(generatedDirectory, name), "utf8"), name).toBe(text);
    }
  });
});
