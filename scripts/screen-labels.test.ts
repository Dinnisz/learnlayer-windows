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
import { draftText } from "../core/anywhere/clickReading";
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

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const centre = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
const contains = (box: Box, point: { x: number; y: number }) =>
  point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;

const grown = (box: Box, by: number): Box => ({
  x: box.x - by,
  y: box.y - by,
  width: box.width + 2 * by,
  height: box.height + 2 * by,
});

/** The scale `scripts/render-page.mjs` was run with: PDF points to the picture's pixels. */
const scale = Number(process.env.SCREEN_SCALE ?? "1.5");

it.runIf(folder !== "" && existsSync(folder) && existsSync("exames"))(
  "clicks every question the PDF's own text has, on the screen's reading",
  async () => {
    const exams = new Map(readdirSync("exames").map((file) => [file.split("-F1")[0]!, `exames/${file}`]));
    let clicks = 0;
    let right = 0;
    const missed: string[] = [];
    const cut: string[] = [];
    const leaks: string[] = [];
    const drafts: string[] = [];
    let elsewhereClicks = 0;
    let elsewhereRight = 0;
    const elsewhereMissed: string[] = [];
    for (const name of readdirSync(folder).filter((file) => file.endsWith(".lines.json"))) {
      const page = name.replace(/\.lines\.json$/u, "");
      // "EX-FQA715-p4", or a browser window around it ("EX-FQA715-p4-s300", `scripts/browser-window.mjs`).
      const [exam, number] = [page.replace(/-p\d+(?:-s\d+)?$/u, ""), Number(/-p(\d+)(?:-s\d+)?$/u.exec(page)![1])];
      const path = exams.get(exam);
      if (!path) continue;
      const text = (await pdfPages(path))[number - 1]!;
      const base = join(folder, page);
      const [width, height] = readFileSync(`${base}.txt`, "utf8").trim().split(/\s+/u).map(Number) as [number, number];
      const image = greyImage(new Uint8Array(readFileSync(`${base}.bgra`)), width, height, width, height);
      const lines = JSON.parse(readFileSync(`${base}.lines.json`, "utf8")) as LocatorLine[];
      const top = text.mediaBox.y + text.mediaBox.height;
      // Where the page's top-left is in the picture: (0, 0) unless the page is in a browser window, under its toolbar.
      const windowed = existsSync(`${base}.offset`);
      const [dx, dy] = windowed
        ? (readFileSync(`${base}.offset`, "utf8").trim().split(/\s+/u).map(Number) as [number, number])
        : [0, 0];
      const seenTop = windowed ? 41 : 0;
      // A rectangle in PDF points (origin bottom left) in the picture's pixels (origin top left).
      const onPicture = (rect: { x: number; y: number; width: number; height: number }) => ({
        x: (rect.x - text.mediaBox.x) * scale + dx,
        y: (top - rect.y - rect.height) * scale + dy,
        width: rect.width * scale,
        height: rect.height * scale,
      });
      const questions = questionsOn(text);
      for (const question of questions) {
        // On the words just past its label.
        const label = onPicture(question.labelBounds);
        // A question whose label is scrolled out of sight is not clicked on it.
        if (label.y < seenTop || label.y + label.height > height) continue;
        const point = { x: label.x + label.width + 30 * scale, y: label.y + label.height / 2 };
        const region = QuestionLocator.locate({ image, window: { x: 0, y: 0, width, height }, point, lines });
        clicks += 1;
        const found = region ? bare(region.part ?? region.label ?? "—") : "nothing";
        if (found === bare(question.label) || found === ungrouped(question.label)) right += 1;
        else
          missed.push(
            `  ${page}: ${question.label} → ${region ? `${region.label ?? "—"} ${region.part ?? ""}` : "nothing"}`,
          );
        if (!region) continue;
        // `SCREEN_DRAFTS=1`: the draft the stage shows while the model reads the picture, under the PDF's own text.
        if (process.env.SCREEN_DRAFTS === "1")
          drafts.push(
            `── ${page} ${question.label}\n${draftText(region.text, region.lines) ?? "(no draft)"}\n·· PDF\n${question.text.trim()}`,
          );
        // What it shows: the question's own area on the page, and no other question's label.
        // Each line read inside the question's area is in the crop (its middle, give or take a few pixels).
        const bounds = onPicture(question.bounds);
        const left = lines.filter(
          (line) =>
            contains(bounds, centre(line.rect)) &&
            !region.crops.some((crop) => contains(grown(crop, 6), centre(line.rect))),
        );
        if (left.length > 0)
          cut.push(
            `  ${page}: ${question.label} leaves out ${left.map((line) => `«${line.text.slice(0, 40)}»`).join(", ")}`,
          );
        // Elsewhere in it: the middle of its area (a figure, often) and its last line of text.
        const inside = lines.filter(
          (line) =>
            contains(bounds, centre(line.rect)) && centre(line.rect).y >= seenTop && centre(line.rect).y <= height,
        );
        const last = inside.reduce<LocatorLine | null>(
          (lowest, line) => (!lowest || line.rect.y > lowest.rect.y ? line : lowest),
          null,
        );
        const middle = centre(bounds);
        const elsewhere = [
          ...(middle.y >= seenTop && middle.y <= height ? [{ where: "middle", point: middle }] : []),
          ...(last ? [{ where: "last line", point: centre(last.rect) }] : []),
        ];
        for (const { where, point: at } of elsewhere) {
          const there = QuestionLocator.locate({ image, window: { x: 0, y: 0, width, height }, point: at, lines });
          elsewhereClicks += 1;
          const label = there ? bare(there.part ?? there.label ?? "—") : "nothing";
          if (label === bare(question.label) || label === ungrouped(question.label)) elsewhereRight += 1;
          else elsewhereMissed.push(`  ${page}: ${question.label}, ${where} (y ${Math.round(at.y)}) → ${label}`);
        }
        const others = questions.filter(
          (other) =>
            other !== question &&
            !question.groupLabels.some(
              (own) =>
                own === other.label ||
                ungrouped(own) === ungrouped(other.label) ||
                ungrouped(question.label).startsWith(`${ungrouped(other.label)}.`),
            ) &&
            region.crops.some((crop) => contains(crop, centre(onPicture(other.labelBounds)))),
        );
        if (others.length > 0)
          leaks.push(`  ${page}: ${question.label} takes in ${others.map((other) => other.label).join(", ")}`);
      }
    }
    console.log(`${right} of ${clicks} questions of the PDF found from the screen\n${missed.join("\n")}`);
    console.log(`${cut.length} crops short of their question\n${cut.join("\n")}`);
    console.log(
      `${elsewhereRight} of ${elsewhereClicks} clicks elsewhere in a question found it\n${elsewhereMissed.join("\n")}`,
    );
    console.log(`${leaks.length} crops taking in another question\n${leaks.join("\n")}`);
    if (drafts.length > 0) console.log(drafts.join("\n"));
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
