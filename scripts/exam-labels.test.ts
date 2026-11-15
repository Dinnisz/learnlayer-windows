// A report, not a check: the labels found on each exam in exames/, with the time each page took.
// Run with EXAM_LABELS=1 npx vitest run scripts/exam-labels.test.ts
import { it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { pdfPages } from "../core/testing/testPages";
import { questionsOn } from "../core/problems/questionDetector";

it.runIf(process.env.EXAM_LABELS === "1" && existsSync("exames"))(
  "lists the labels of every exam",
  async () => {
    for (const name of readdirSync("exames").filter((file) => file.endsWith(".pdf"))) {
      const pages = await pdfPages(`exames/${name}`);
      let slowest = 0;
      const labels = pages.flatMap((page) => {
        const started = performance.now();
        const found = questionsOn(page).map((q) => q.label);
        slowest = Math.max(slowest, performance.now() - started);
        return found;
      });
      console.log(`${name} (${pages.length} pages, slowest ${slowest.toFixed(0)} ms): ${labels.join(" ")}`);
    }
  },
  300000,
);
