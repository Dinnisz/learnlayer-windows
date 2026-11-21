// Port of LearnLayer/Problems/QuestionTranscription.swift @ ref 2026-11-04 (the prompt rules are in
// core/prompts/problemPrompt.ts; `looksGarbled` is `transcriptionLooksGarbled` in textChecks.ts).
//
// The question as a model read it from the picture, in order: prose with inline maths, display formulas, and where
// the figures are. The app typesets it, so the student never sees the raw crop or the computer's own (garbled)
// reading of it.

import type { Rect } from "../pdf/page";
import { imagesFingerprint } from "../ai/diskCache";

export interface TranscriptionBlock {
  /** "text", "formula" or "figure". */
  type: string;
  /** Prose with `$…$` for typeset maths (text), or LaTeX (formula). */
  text: string | null;
  /** Where it is in the picture: x, y, width, height as shares (0 to 1) of the picture. */
  box: number[] | null;
  /** A figure's label ("A", "Figura 1"), shown under it. */
  caption: string | null;
}

export interface QuestionTranscription {
  blocks: TranscriptionBlock[];
}

const optionalString = (value: unknown) => (typeof value === "string" ? value : null);

/** One block as the model wrote it: a missing or odd field is empty, the type lower-cased ("text" by default). */
export function decodeBlock(value: unknown): TranscriptionBlock {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const box =
    Array.isArray(record["box"]) && record["box"].every((item) => typeof item === "number") ? record["box"] : null;
  return {
    type: (optionalString(record["type"]) ?? "text").toLowerCase(),
    text: optionalString(record["text"]),
    box: box as number[] | null,
    caption: optionalString(record["caption"]),
  };
}

/** A list of blocks, or null when it is not a list of objects. */
export function decodeBlocks(value: unknown): TranscriptionBlock[] | null {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "object" && item !== null && !Array.isArray(item))
  )
    return null;
  return value.map(decodeBlock);
}

const partLabelPattern = /^\s*(?:\d+\s*\.?\s*)?\(?([ivx]+|[a-z])\)(?=\s|$)/gmu;
const numberPattern = /\d+(?:[.,]\d+)?/gu;
const optionPattern = /^\s*\(?[A-Ha-h][.)]\s/u;

export const Transcriptions = {
  isFigure: (block: TranscriptionBlock) => block.type === "figure",

  /**
   * The text or formula block a step's focus falls in, by index (`RenderedQuestion.focus` @ 5701363): the first one
   * whose band of the picture holds the focus's centre. Null when the centre is on a figure (`figures`, the figure
   * boxes as drawn: the figure has its own mark) or on no block with a box, so no mark is better than a wrong one.
   */
  focusedBlock(
    focus: { x: number; y: number; w: number; h: number },
    blocks: readonly TranscriptionBlock[],
    figures: readonly Rect[],
  ): number | null {
    const centre = { x: focus.x + focus.w / 2, y: focus.y + focus.h / 2 };
    if (![centre.x, centre.y].every(Number.isFinite)) return null;
    const onFigure = figures.some(
      (box) =>
        centre.x >= box.x - 0.01 &&
        centre.x <= box.x + box.width + 0.01 &&
        centre.y >= box.y - 0.01 &&
        centre.y <= box.y + box.height + 0.01,
    );
    if (onFigure) return null;
    const index = blocks.findIndex((block) => {
      if (block.type === "figure") return false;
      const box = Transcriptions.rect(block);
      return box !== null && centre.y >= box.y && centre.y <= box.y + box.height;
    });
    return index >= 0 ? index : null;
  },

  /** The box as a rectangle in the unit square, kept inside it; null when it is not one. */
  rect(block: TranscriptionBlock): Rect | null {
    const box = block.box;
    if (!box || box.length !== 4 || !box.every(Number.isFinite)) return null;
    const x = Math.min(Math.max(box[0]!, 0), 1);
    const y = Math.min(Math.max(box[1]!, 0), 1);
    const width = Math.min(Math.max(box[2]!, 0), 1 - x);
    const height = Math.min(Math.max(box[3]!, 0), 1 - y);
    if (width <= 0.01 || height <= 0.005) return null;
    return { x, y, width, height };
  },

  /** What is worth showing: at least one block with something in it. */
  isUsable(transcription: QuestionTranscription): boolean {
    return transcription.blocks.some((block) => block.type === "figure" || (block.text ?? "").trim() !== "");
  },

  /** A formula block left empty: the reader saw a formula there and wrote none (a Windows rule; see DECISOES). */
  dropsFormula(transcription: QuestionTranscription): boolean {
    return transcription.blocks.some((block) => block.type === "formula" && (block.text ?? "").trim() === "");
  },

  /** The text the highlights are looked up in: prose with the `$` marks dropped and formulas as their LaTeX. */
  plainText(transcription: QuestionTranscription): string {
    return transcription.blocks
      .filter((block) => block.type !== "figure" && block.text !== null)
      .map((block) => block.text!.replaceAll("$", ""))
      .join("\n");
  },

  numbers(text: string): string[] {
    return [...text.matchAll(numberPattern)].map((match) => match[0].replaceAll(",", "."));
  },

  /**
   * A transcription that drops or changes the numbers the computer read is not shown: a wrong digit stated with
   * confidence is worse than a clean crop. With too few numbers to judge by, the transcription stands.
   */
  agrees(transcription: QuestionTranscription, reading: string): boolean {
    const expected = Transcriptions.numbers(reading);
    if (expected.length < 3) return true;
    const shown = new Set(Transcriptions.numbers(texts(transcription)));
    const missing = expected.filter((number) => !shown.has(number)).length;
    return missing / expected.length <= 0.4;
  },

  /** The part labels ("(ii)", "b)", "3(iii)") that open a block or a line of one, as "ii", "b", "iii". */
  partLabels(transcription: QuestionTranscription): Set<string> {
    const found = new Set<string>();
    for (const block of transcription.blocks) {
      if (block.text === null) continue;
      for (const match of block.text.matchAll(partLabelPattern)) found.add(match[1]!);
    }
    return found;
  },

  /**
   * This reading of a part's own picture with `label` («l)», «(b)»), the label the PDF prints, at the start of its
   * first line: what the reader put there in its place («1)», «I)», «|)» for «l)», «9)» for «q)») is replaced, and
   * with nothing read there the label is put in front. Unchanged when it already carries that label alone
   * (`QuestionTranscription.withPartLabel` @ 5701363).
   */
  withPartLabel(transcription: QuestionTranscription, label: string): QuestionTranscription {
    const bare = label.replace(/^[()[\] ]+|[()[\] ]+$/g, "");
    const labels = Transcriptions.partLabels(transcription);
    if (!bare || (labels.size === 1 && labels.has(bare))) return transcription;
    const index = transcription.blocks.findIndex(
      (block) => block.type !== "figure" && (block.text ?? "").trim() !== "",
    );
    const text = index >= 0 ? transcription.blocks[index]!.text : null;
    if (text === null || text === undefined) return transcription;
    const match = /^(\s*)(\$\s*)?[([]?[0-9A-Za-z|]{1,4}[)\]](?:\s+|(?=\$)|$)/.exec(text);
    const blocks = [...transcription.blocks];
    blocks[index] = {
      ...blocks[index]!,
      text: match
        ? `${label} ${match[2] !== undefined ? "$" : ""}${text.slice(match[0].length)}`
        : `${label} ${text.trim()}`,
    };
    return { blocks };
  },

  /** The letters a reader takes a part's letter for, in a label («1)», «I)» or «|)» for «l)», «9)» for «q)»). */
  labelLookalikes: { l: "1I|", i: "1l|", q: "9", g: "9", o: "0", s: "5", z: "2", b: "6" } as Readonly<
    Record<string, string>
  >,

  /**
   * This reading with the clicked part's letter in its label where the reader wrote a lookalike («1) \ln…» for part
   * l): only when it carries no part label and exactly one line opens with such a label. Unchanged otherwise
   * (`QuestionTranscription.withLookalikeLabel` @ 5701363).
   */
  withLookalikeLabel(transcription: QuestionTranscription, part: string | null): QuestionTranscription {
    const letters = part !== null ? Transcriptions.labelLookalikes[part] : undefined;
    if (part === null || letters === undefined || Transcriptions.partLabels(transcription).size > 0)
      return transcription;
    const escaped = letters.replace(/[\\\]^|-]/g, (character) => `\\${character}`);
    const pattern = new RegExp(`^(\\s*(?:\\$\\s*)?\\(?)([${escaped}])(\\))(?=\\s|\\$|$)`, "gm");
    const hits = transcription.blocks.flatMap((block, index) =>
      Array.from((block.text ?? "").matchAll(pattern), () => index),
    );
    if (hits.length !== 1) return transcription;
    const index = hits[0]!;
    const blocks = [...transcription.blocks];
    blocks[index] = {
      ...blocks[index]!,
      text: (blocks[index]!.text ?? "").replace(pattern, (_, open: string, __, close: string) => open + part + close),
    };
    return { blocks };
  },

  /** A reading of the clicked part `part` ("ii"): it carries that part's label and no other. */
  isOf(transcription: QuestionTranscription, part: string | null): boolean {
    if (part === null) return true;
    const labels = Transcriptions.partLabels(transcription);
    return labels.size === 1 && labels.has(part);
  },

  /** Which check a reading fails, said for a log; null when it may be shown. `reading` is the text whose numbers it
   * must keep (null: no such check). */
  rejection(transcription: QuestionTranscription, part: string | null, reading: string | null): string | null {
    if (!Transcriptions.isUsable(transcription)) return "isUsable";
    // A formula block with nothing in it is a formula the reader saw and could not write: shown, the question would
    // lose its data (live test 2026-11-21: «f(x) = {4 − e^{3−x}… se x ≤ 3; …}» gone from MatA 2.2). The crop stays.
    if (Transcriptions.dropsFormula(transcription)) return "dropsFormula";
    if (!Transcriptions.isOf(transcription, part)) {
      const labels = [...Transcriptions.partLabels(transcription)].sort().join(", ");
      return `isOf(part: ${part ?? "-"}), labels [${labels}]`;
    }
    if (reading !== null && !Transcriptions.agrees(transcription, reading)) {
      const shown = new Set(Transcriptions.numbers(texts(transcription)));
      const all = Transcriptions.numbers(reading);
      const missing = all.filter((number) => !shown.has(number));
      return `agrees(withReading:), missing ${missing.join(" ")} of ${all.join(" ")}`;
    }
    return null;
  },

  /** The part a question's label names ("3(ii)" in group "3" is "ii"); null for a whole question. */
  part(label: string, group: string): string | null {
    if (label === group || !label.startsWith(group)) return null;
    const token = label
      .slice(group.length)
      .replace(/^[(). ]+|[(). ]+$/gu, "")
      .toLowerCase();
    return /^([ivx]+|[a-z])$/u.test(token) ? token : null;
  },

  /** This reading with `figures` in place of its own figure blocks: the i-th figure takes the i-th place, any left
   * over goes before the first option (or last), and a figure with no replacement is dropped. */
  replacingFigures(
    transcription: QuestionTranscription,
    figures: readonly TranscriptionBlock[],
  ): QuestionTranscription {
    const out: TranscriptionBlock[] = [];
    let next = 0;
    for (const block of transcription.blocks) {
      if (block.type !== "figure") {
        out.push(block);
        continue;
      }
      if (next < figures.length) out.push(figures[next++]!);
    }
    if (next < figures.length) {
      let at = out.findIndex((block) => optionPattern.test(block.text ?? ""));
      if (at < 0) at = out.length;
      out.splice(at, 0, ...figures.slice(next));
    }
    return { blocks: out };
  },

  /** Readings of pictures stacked one under the other as one question, each block's box brought to a share of the
   * whole from `share`, where its picture sits. A block with no box is given its picture's place. */
  stacked(pieces: readonly { transcription: QuestionTranscription; share: Rect }[]): QuestionTranscription {
    const blocks: TranscriptionBlock[] = [];
    for (const { transcription, share } of pieces) {
      for (const block of transcription.blocks) {
        const own = Transcriptions.rect(block) ?? { x: 0, y: 0, width: 1, height: 1 };
        blocks.push({
          ...block,
          box: [
            share.x + own.x * share.width,
            share.y + own.y * share.height,
            own.width * share.width,
            own.height * share.height,
          ],
        });
      }
    }
    return { blocks };
  },

  /** The question's own text as blocks, when nothing was read from a picture: one block per line. */
  fromPlainText(text: string): QuestionTranscription {
    const blocks = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => ({ type: "text", text: line.replaceAll("$", ""), box: null, caption: null }));
    return { blocks };
  },
};

function texts(transcription: QuestionTranscription): string {
  return transcription.blocks
    .map((block) => block.text)
    .filter((text): text is string => text !== null)
    .join(" ");
}

/**
 * Which picture sets are to be transcribed: the picture of a question shown by the app itself asks the model to
 * transcribe it; a question read from a PDF page, shown as the page, does not.
 */
export class TranscriptionRequests {
  private readonly requested = new Set<string>();

  async request(images: readonly Uint8Array[]): Promise<void> {
    if (images.length === 0) return;
    this.requested.add(await imagesFingerprint(images));
  }

  async isRequested(images: readonly Uint8Array[]): Promise<boolean> {
    if (images.length === 0) return false;
    return this.requested.has(await imagesFingerprint(images));
  }
}
