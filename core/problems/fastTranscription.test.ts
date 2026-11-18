// FastTranscriptionTests.swift, the reader's cases (the race with the solve is in questionSession.test.ts): the
// reply is read as the Mac reads it, one call per picture, a failed call is not repeated, a reading set aside is
// asked for once more. The fast model's reply is scripted, so nothing is spent.
// It also holds the clock cases of QuestionReadingLatencyTests.swift: the deadline that waits for the first words, the
// stalled call given up on time, the placeholder giving way, and the first accepted reading.

import { describe, expect, it } from "vitest";
import { DiskCache, type DataFiles } from "../ai/diskCache";
import { FastTranscription } from "../prompts/problemPrompt";
import {
  closedQuestion,
  FastDeadline,
  FastTranscriptionReader,
  firstWholeQuestion,
  shareOfCorners,
  transcriptionFromContent,
} from "./fastTranscription";
import { Transcriptions, type QuestionTranscription } from "./questionTranscription";

const fastReply = JSON.stringify({
  question: [
    { type: "text", text: "Calcula 12 e 30 e 4 e 7 no circuito (fast).", box: [40, 20, 960, 180], caption: null },
    { type: "figure", text: "stray", box: [500, 200, 900, 700], caption: "Figura 1" },
  ],
});
const ocr = "Calcula 12 e 30 e 4 e 7 no circuito";

function memoryFiles(): DataFiles {
  const files = new Map<string, string>();
  return {
    read: async (name) => files.get(name) ?? null,
    write: async (name, contents) => void files.set(name, contents),
  };
}

let counter = 0;
/** A picture no other test has used. */
const picture = () => [new TextEncoder().encode(`picture-${(counter += 1)}-${Math.random()}`)];

function reader(fetcher: (images: readonly Uint8Array[]) => Promise<string>, files: DataFiles = memoryFiles()) {
  const calls = { value: 0 };
  const cache = new DiskCache<QuestionTranscription>("fast-questions.json", 200, files);
  const made = new FastTranscriptionReader({
    cache,
    isAvailable: () => true,
    client: () => {
      throw new Error("no network in tests");
    },
    fetcher: (images) => {
      calls.value += 1;
      return fetcher(images);
    },
    untypesetMath: (found) => (Transcriptions.plainText(found).includes("\\undrawable") ? "\\undrawable" : null),
  });
  return { reader: made, calls, files };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("FastTranscription", () => {
  it("reads the object, the bare array and a fenced reply", () => {
    const object = transcriptionFromContent(fastReply)!;
    expect(object.blocks).toHaveLength(2);
    const bare = transcriptionFromContent('[{"type":"text","text":"A) 5 Ω","box":null,"caption":null}]')!;
    expect(Transcriptions.plainText(bare)).toBe("A) 5 Ω");
    expect(transcriptionFromContent("```json\n" + fastReply + "\n```")).toEqual(object);
  });

  it("brings boxes from corners on a thousand scale to shares", () => {
    const found = transcriptionFromContent(fastReply)!;
    const box = found.blocks[0]!.box!;
    [0.04, 0.02, 0.92, 0.16].forEach((value, index) => expect(box[index]).toBeCloseTo(value, 9));
    // A figure carries no text, whatever the model put there, and its box is a usable rectangle.
    expect(found.blocks[1]!.text).toBeNull();
    expect(Transcriptions.rect(found.blocks[1]!)).not.toBeNull();
    // Shares are tolerated; an empty or inverted box is no box.
    const shares = shareOfCorners([0.1, 0.2, 0.5, 0.6])!;
    [0.1, 0.2, 0.4, 0.4].forEach((value, index) => expect(shares[index]).toBeCloseTo(value, 9));
    expect(shareOfCorners([500, 500, 400, 600])).toBeNull();
    expect(shareOfCorners([1, 2, 3])).toBeNull();
  });

  it("marks a line in bare LaTeX as maths", () => {
    const formula = transcriptionFromContent(
      JSON.stringify({ question: [{ type: "formula", text: "\\frac{1}{x}", box: null, caption: null }] }),
    )!;
    expect(formula.blocks[0]!.text).toBe("\\frac{1}{x}");
    const lines = transcriptionFromContent(
      JSON.stringify([
        { type: "text", text: "g(x) = \\frac{x}{1+x^2}", box: null, caption: null },
        { type: "text", text: "Seja \\alpha o ângulo", box: null, caption: null },
      ]),
    )!;
    expect(lines.blocks[0]!.text).toBe("$g(x) = \\frac{x}{1+x^2}$");
    expect(lines.blocks[1]!.text).toBe("Seja \\alpha o ângulo");
  });

  it("finds nothing in a reply with no question in it", () => {
    expect(transcriptionFromContent("I cannot help with that.")).toBeNull();
    expect(transcriptionFromContent('{"answer":"42"}')).toBeNull();
    expect(Transcriptions.isUsable(transcriptionFromContent('{"question":[]}')!)).toBe(false);
  });

  it("tells the fast model to read only the picture, in its own words", () => {
    const prompt = FastTranscription.system;
    expect(prompt).toContain("Transcribe only what is in the picture");
    expect(prompt).toContain("never add a part");
    expect(prompt).toContain('"arcsen"');
    expect(prompt).toContain('never "sin", "arcsin" or "arcsec"');
    expect(prompt).toContain("Transcribe only the question");
    expect(prompt).toContain("No Markdown");
    expect(FastTranscription.promptVersion).toBe("fq5");
  });

  it("never keeps or accepts maths the renderer can't draw", async () => {
    const undrawable = JSON.stringify({
      question: [{ type: "text", text: "$\\undrawable{x}$", box: null, caption: null }],
    });
    const { reader: fast, calls } = reader(async () => undrawable);
    const images = picture();
    expect(await fast.transcription(images)).toBeNull();
    expect(await fast.cachedTranscription(images)).toBeNull();
    expect(calls.value).toBe(1);
    const ahead = picture();
    await fast.store(transcriptionFromContent(undrawable)!, ahead);
    expect(await fast.cachedTranscription(ahead)).toBeNull();
    expect(await fast.read(picture(), () => null)).toBeNull();
  });

  it("reads a question once however often it is opened, and keeps it on disk", async () => {
    const files = memoryFiles();
    const { reader: fast, calls } = reader(async () => fastReply, files);
    const images = picture();
    for (let round = 0; round < 3; round += 1) expect(await fast.read(images, () => null)).not.toBeNull();
    expect(calls.value).toBe(1);
    // A new launch: memory is gone, the saved reading is not.
    const again = reader(async () => fastReply, files);
    expect(await again.reader.transcription(images)).not.toBeNull();
    expect(again.calls.value).toBe(0);
    // Another picture is another question.
    await fast.transcription(picture());
    expect(calls.value).toBe(2);
  });

  it("shares one call between two openings at once", async () => {
    const { reader: fast, calls } = reader(async () => {
      await sleep(50);
      return fastReply;
    });
    const images = picture();
    const both = await Promise.all([fast.transcription(images), fast.transcription(images)]);
    expect(both.every((found) => found !== null && Transcriptions.isUsable(found))).toBe(true);
    expect(calls.value).toBe(1);
  });

  it("doesn't repeat a failed call for the same question", async () => {
    const { reader: fast, calls } = reader(async () => {
      throw new Error("offline");
    });
    const images = picture();
    for (let round = 0; round < 3; round += 1) expect(await fast.transcription(images)).toBeNull();
    expect(calls.value).toBe(1);
  });

  it("still lets a click ask after a reading ahead failed", async () => {
    let offline = true;
    const { reader: fast, calls } = reader(async () => {
      if (offline) throw new Error("offline");
      return fastReply;
    });
    const images = picture();
    await fast.transcription(images, true);
    expect(calls.value).toBe(1);
    // Read ahead again: not asked.
    await fast.prefetch([images]);
    await fast.transcription(images, true);
    expect(calls.value).toBe(1);
    // The click asks once, and its reading is kept for the next.
    offline = false;
    expect(await fast.transcription(images)).not.toBeNull();
    expect(await fast.cachedTranscription(images)).not.toBeNull();
    expect(calls.value).toBe(2);
  });

  it("reads only the part whose label it carries", () => {
    const stem = { type: "text", text: "3. Considere a função f definida por", box: [0, 0, 1000, 300], caption: null };
    const three = transcriptionFromContent(
      JSON.stringify({
        question: [
          stem,
          { type: "text", text: "(iii) Averigue a existência de extremos locais.", box: null, caption: null },
        ],
      }),
    )!;
    const two = transcriptionFromContent(
      JSON.stringify({
        question: [stem, { type: "text", text: "(ii) A função f é diferenciável?", box: null, caption: null }],
      }),
    )!;
    expect([...Transcriptions.partLabels(three)]).toEqual(["iii"]);
    expect(Transcriptions.isOf(two, "ii")).toBe(true);
    expect(Transcriptions.isOf(three, "ii")).toBe(false);
    expect(Transcriptions.isOf(three, null)).toBe(true);
    const text = (value: string): QuestionTranscription => ({
      blocks: [{ type: "text", text: value, box: null, caption: null }],
    });
    expect(Transcriptions.isOf({ blocks: [...two.blocks, ...text("(iii) Averigue.").blocks] }, "ii")).toBe(false);
    expect(Transcriptions.isOf(text("A função f é diferenciável?"), "ii")).toBe(false);
    expect([...Transcriptions.partLabels(text("3(ii) Determine f'."))]).toEqual(["ii"]);
    expect([...Transcriptions.partLabels(text("ii) Determine f'."))]).toEqual(["ii"]);
    expect(Transcriptions.partLabels(text("f (x) = x, se x > 0\nA) 2\nUse o resultado de (i).")).size).toBe(0);
    expect(Transcriptions.part("3(ii)", "3")).toBe("ii");
    expect(Transcriptions.part("3", "3")).toBeNull();
  });

  it("asks once more for a reading of another part and keeps the right one", async () => {
    const readsThree = JSON.stringify({
      question: [{ type: "text", text: "(iii) Averigue.", box: null, caption: null }],
    });
    const readsTwo = JSON.stringify({
      question: [{ type: "text", text: "(ii) Determine.", box: null, caption: null }],
    });
    let round = 0;
    const { reader: fast, calls } = reader(async () => ((round += 1) === 1 ? readsThree : readsTwo));
    const images = picture();
    const found = await fast.accepted(images, (reading) => Transcriptions.isOf(reading, "ii"));
    expect([...Transcriptions.partLabels(found!)]).toEqual(["ii"]);
    expect(calls.value).toBe(2);
    // The accepted retry is saved in place of the reading set aside.
    expect([...Transcriptions.partLabels((await fast.transcription(images))!)]).toEqual(["ii"]);
    expect(calls.value).toBe(2);
    // Another part twice is nothing.
    const { reader: wrong, calls: wrongCalls } = reader(async () => readsThree);
    expect(await wrong.accepted(picture(), (reading) => Transcriptions.isOf(reading, "ii"))).toBeNull();
    expect(wrongCalls.value).toBe(2);
  });

  it("keeps the numbers the computer read, or asks once more", async () => {
    const stemOnly = JSON.stringify({
      question: [{ type: "text", text: "Calcula no circuito (fast).", box: null, caption: null }],
    });
    let round = 0;
    const { reader: fast, calls } = reader(async () => ((round += 1) === 1 ? stemOnly : fastReply));
    const found = await fast.read(picture(), (reading) => Transcriptions.rejection(reading, null, ocr));
    expect(Transcriptions.plainText(found!)).toContain("12");
    expect(calls.value).toBe(2);
  });

  it("reads the reply as soon as its question array closes", async () => {
    const closed = '{"question":[{"type":"text","text":"Calcula 12.","box":null,"caption":null}]';
    expect(closedQuestion('{"question":[{"type":"text","text":"Calcula')).toBeNull();
    expect(closedQuestion('{"question":[{"type":"text","text":"Calcula 12.","box":[1,2,3,4]')).toBeNull();
    expect(closedQuestion('{"question":[{"type":"text","text":"Calcula 12.","box":null,"caption":null}')).toBeNull();
    expect(closedQuestion(closed)).not.toBeNull();
    const start = Date.now();
    const content = await firstWholeQuestion(async (onContent) => {
      onContent(closed);
      await sleep(1500);
      return closed + "}";
    });
    expect(Date.now() - start).toBeLessThan(1000);
    expect(Transcriptions.plainText(transcriptionFromContent(content)!)).toBe("Calcula 12.");
  });

  it("reads a page ahead two at a time, once each, and a click joins it", async () => {
    let running = 0;
    let most = 0;
    const { reader: fast, calls } = reader(async () => {
      running += 1;
      most = Math.max(most, running);
      await sleep(60);
      running -= 1;
      return fastReply;
    });
    const [a, b, c] = [picture(), picture(), picture()];
    const ahead = fast.prefetch([a, b, c, a]);
    await sleep(20);
    expect(await fast.read(a, () => null)).not.toBeNull();
    await ahead;
    expect(calls.value).toBe(3);
    expect(most).toBeLessThanOrEqual(FastTranscription.prefetchWidth);
    for (const images of [a, b, c]) expect(await fast.transcription(images)).not.toBeNull();
    await fast.prefetch([a, b, c]);
    expect(calls.value).toBe(3);
  });

  it("gives up by the clock: no word in time, or the whole limit", async () => {
    expect(FastDeadline.expired(7, false, 12, 6)).toBe(true);
    expect(FastDeadline.expired(7, true, 12, 6)).toBe(false);
    expect(FastDeadline.expired(12, true, 12, 6)).toBe(true);
    expect(FastDeadline.expired(5, false, 12, null)).toBe(false);
    let aborted = false;
    await expect(
      FastDeadline.run(
        0.05,
        null,
        (_, signal) =>
          new Promise<string>((resolve) => {
            signal.addEventListener("abort", () => (aborted = true));
            setTimeout(() => resolve("late"), 1000);
          }),
        { tick: 0.01 },
      ),
    ).rejects.toThrow();
    expect(aborted).toBe(true);
    expect(FastTranscriptionReader.placeholderGivesWay(12, false)).toBe(true);
    expect(FastTranscriptionReader.placeholderGivesWay(1, true)).toBe(true);
    expect(FastTranscriptionReader.placeholderGivesWay(1, false)).toBe(false);
  });
});
