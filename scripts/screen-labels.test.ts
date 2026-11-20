// A report, not a check: exam pages read as a screen is (Windows' OCR, then the question's region in TypeScript),
// clicked on the words of every numbered item. For each click, the label and part the region finds against the ones
// written at the start of the item's line. Pages come from a folder of `<page>.bgra`, `<page>.txt` and
// `<page>.lines.json`, made with `scripts/render-page.mjs` and the Rust measurement `ocr_on_a_saved_page` run with
// LEARNLAYER_OCR_JSON=1.
// Run with SCREEN_LABELS=<folder> npx vitest run scripts/screen-labels.test.ts
import { it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { QuestionBand } from "../core/anywhere/questionBand";
import { QuestionLocator, greyImage, type LocatorLine } from "../core/anywhere/questionRegion";
import { questionsOn } from "../core/problems/questionDetector";
import { pdfPages } from "../core/testing/testPages";

const folder = process.env.SCREEN_LABELS ?? "";

/** The item a line starts: its part ("2.1") when it numbers one, else its label ("3."), else null. A "(2)" is an
 * item of a list inside a question (the columns to match), not a question of its own. */
function written(text: string): { label: string; part: string | null } | null {
  const part = QuestionBand.anyPart(text);
  if (part !== null) return { label: `${part.split(".")[0]}.`, part };
  const label = QuestionBand.label(text);
  return label === null || label.startsWith("(") ? null : { label, part: null };
}

/** "1.", "1.1", "5.(AE2018)", "I.2" without a closing dot: the detector's labels and the region's compared. */
const bare = (label: string) => label.replace(/[.)]+$/u, "");

/** Without its group ("I.1" → "1"): the screen does not know which group a page is in. */
const ungrouped = (label: string) => bare(label).replace(/^(?:[IVX]+|[A-D])./u, "");

/** The scale `scripts/render-page.mjs` was run with: PDF points to the picture's pixels. */
const scale = Number(process.env.SCREEN_SCALE ?? "1.5");

it.runIf(folder !== "" && existsSync(folder) && existsSync("exames"))(
  "clicks every question the PDF's own text has, on the screen's reading",
  async () => {
    const exams = new Map(readdirSync("exames").map((file) => [file.split("-F1")[0]!, `exames/${file}`]));
    let clicks = 0;
    let right = 0;
    const missed: string[] = [];
    for (const name of readdirSync(folder).filter((file) => file.endsWith(".lines.json"))) {
      const page = name.replace(/\.lines\.json$/u, "");
      const [exam, number] = [page.replace(/-p\d+$/u, ""), Number(/-p(\d+)$/u.exec(page)![1])];
      const path = exams.get(exam);
      if (!path) continue;
      const text = (await pdfPages(path))[number - 1]!;
      const base = join(folder, page);
      const [width, height] = readFileSync(`${base}.txt`, "utf8").trim().split(/\s+/u).map(Number) as [number, number];
      const image = greyImage(new Uint8Array(readFileSync(`${base}.bgra`)), width, height, width, height);
      const lines = JSON.parse(readFileSync(`${base}.lines.json`, "utf8")) as LocatorLine[];
      const top = text.mediaBox.y + text.mediaBox.height;
      for (const question of questionsOn(text)) {
        // On the words just past its label, in the picture's pixels (PDF points have their origin bottom left).
        const label = question.labelBounds;
        const point = {
          x: (label.x + label.width + 30 - text.mediaBox.x) * scale,
          y: (top - (label.y + label.height / 2)) * scale,
        };
        const region = QuestionLocator.locate({ image, window: { x: 0, y: 0, width, height }, point, lines });
        clicks += 1;
        const found = region ? bare(region.part ?? region.label ?? "—") : "nothing";
        if (found === bare(question.label) || found === ungrouped(question.label)) right += 1;
        else
          missed.push(
            `  ${page}: ${question.label} → ${region ? `${region.label ?? "—"} ${region.part ?? ""}` : "nothing"}`,
          );
      }
    }
    console.log(`${right} of ${clicks} questions of the PDF found from the screen\n${missed.join("\n")}`);
  },
  600000,
);

it.runIf(folder !== "" && existsSync(folder))(
  "clicks every numbered item of every page",
  () => {
    let clicks = 0;
    let right = 0;
    for (const name of readdirSync(folder).filter((file) => file.endsWith(".lines.json"))) {
      const base = join(folder, name.replace(/\.lines\.json$/u, ""));
      const [width, height] = readFileSync(`${base}.txt`, "utf8").trim().split(/\s+/u).map(Number) as [number, number];
      const bgra = new Uint8Array(readFileSync(`${base}.bgra`));
      const image = greyImage(bgra, width, height, width, height);
      const lines = JSON.parse(readFileSync(`${base}.lines.json`, "utf8")) as LocatorLine[];
      const report: string[] = [];
      for (const line of lines) {
        const expected = written(line.text);
        if (!expected) continue;
        // On the item's words, past its number.
        const point = { x: line.rect.x + line.rect.width * 0.6, y: line.rect.y + line.rect.height / 2 };
        const region = QuestionLocator.locate({ image, window: { x: 0, y: 0, width, height }, point, lines });
        clicks += 1;
        const found = region ? `${region.label ?? "—"}${region.part ? ` ${region.part}` : ""}` : "nothing";
        const wanted = `${expected.label}${expected.part ? ` ${expected.part}` : ""}`;
        // On a page that goes on with a question begun before, its parts are the labels ("1.3", no part).
        const same =
          region !== null &&
          ((region.label === expected.label && region.part === expected.part) ||
            (expected.part !== null && region.label === expected.part && region.part === null));
        if (same) right += 1;
        const frame = region
          ? `y ${Math.round(region.frame.y)}–${Math.round(region.frame.y + region.frame.height)}`
          : "";
        report.push(`  ${same ? "ok " : "!! "} ${wanted.padEnd(10)} → ${found.padEnd(12)} ${frame}`);
      }
      console.log(`${name.replace(/\.lines\.json$/u, "")}\n${report.join("\n")}`);
    }
    console.log(`${right} of ${clicks} clicks found the item they were on`);
  },
  300000,
);
