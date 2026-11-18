// Port of LearnLayer/Voice/VoiceTutorReply.swift (decoding, the opening, the markers, unlit marks) and of the word
// helpers of LearnLayer/Voice/SpeechSync.swift @ ref 2026-11-04. What the tutor says, and the marks drawn while it is
// said: each mark lights on the word its `[[n]]` stood before. The reply is checked against the page in
// `voiceTutorGuard.ts`; the Mac also fills in the formula a symbol belongs to (VoiceCheckPlan), not ported yet.

import { PartialJSON } from "../ai/partialJSON";
import { SpeechMarkers, SpokenText } from "./spokenText";

export type DrawingKind =
  | { op: "highlight"; term: string }
  | { op: "circle"; term: string }
  | { op: "arrow"; from: string; to: string }
  | { op: "formula"; latex: string }
  | { op: "plot"; expression: string; variable: string; xMin: number; xMax: number };

export interface DrawingCommand {
  kind: DrawingKind;
  /** Sentence index in `spoken`, from 0. */
  segment: number | null;
  /** A word or phrase copied from `spoken`. */
  anchor: string | null;
  /** An x value on a plot, and a short note there. */
  point: number | null;
  label: string | null;
  /** UTF-16 offset of the word its first `[[n]]` stood before, in the spoken text. */
  mentionUTF16: number | null;
  /** That word. */
  mentioned: string | null;
  /** Every place the item is said. */
  mentionsUTF16: number[];
}

export interface VoiceTutorReply {
  /** What is spoken; marker tokens removed. */
  spoken: string;
  drawing: DrawingCommand[];
  /** The model's `spoken`, markers included. */
  modelSpoken: string;
  markerCount: number;
  markerOffsets: number[];
  /** A few words the model chose to start with, said first (`speakingTheOpening`). */
  opening: string | null;
}

export class VoiceTutorDecodeError extends Error {
  constructor(readonly reason: "unreadable" | "emptySpoken" | "degenerate") {
    super(reason);
  }
}

// MARK: Words (SpeechSync)

const isWordUnit = (unit: string) => /[\p{L}\p{N}_]/u.test(unit);
const articles = new Set([
  "o",
  "a",
  "os",
  "as",
  "um",
  "uma",
  "uns",
  "umas",
  "the",
  "an",
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
]);

export const SpeechWords = {
  isArticle: (word: string) => articles.has(word.trim().toLowerCase()),

  /** The end of the word that starts at `start`, or one unit when it is not a letter. */
  wordEnd(start: number, text: string): number {
    let index = start;
    while (index < text.length && isWordUnit(text[index]!)) index += 1;
    return index === start ? Math.min(text.length, start + 1) : index;
  },

  /** The word at a UTF-16 offset. */
  word(at: number, text: string): string | null {
    if (at < 0 || at >= text.length) return null;
    const end = SpeechWords.wordEnd(at, text);
    return end > at ? text.slice(at, end) : null;
  },

  /** Every whole-word match of `term`, in order: "a" does not match inside "acceleration". */
  wordRanges(term: string, text: string): { start: number; length: number }[] {
    const needle = term.trim();
    if (needle === "") return [];
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
    return [...text.matchAll(pattern)].map((match) => ({ start: match.index, length: match[0].length }));
  },

  /** The sentences of the spoken text, as UTF-16 ranges (".", "!", "?", "。" or a new line ends one). */
  segmentRanges(text: string): { start: number; end: number }[] {
    const ranges: { start: number; end: number }[] = [];
    let start = 0;
    let index = 0;
    while (index < text.length) {
      if (".!?。\n".includes(text[index]!)) {
        const end = index + 1;
        if (end > start) ranges.push({ start, end });
        start = end;
        while (start < text.length && /\s/u.test(text[start]!)) start += 1;
        index = start;
        continue;
      }
      index += 1;
    }
    if (start < text.length) ranges.push({ start, end: text.length });
    return ranges;
  },
};

// MARK: Decoding

const asString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};
const asNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};
const asIndex = (value: unknown) => {
  const number = asNumber(value);
  return number !== null && number >= 0 ? Math.trunc(number) : null;
};
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replaceAll(" ", "");

/** `op`, `type` or `kind`; unknown names and empty targets are null (one bad item never loses the spoken line). */
export function decodeDrawing(value: unknown): DrawingCommand | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  const name = fold(asString(object["op"]) ?? asString(object["type"]) ?? asString(object["kind"]) ?? "");
  let kind: DrawingKind | null = null;
  let label: string | null = null;
  const point = asNumber(object["point"]);
  switch (name) {
    case "highlight":
    case "underline":
    case "destaque":
    case "sublinhar": {
      const term = asString(object["term"]);
      if (term) kind = { op: "highlight", term };
      break;
    }
    case "circle":
    case "circulo": {
      const term = asString(object["term"]);
      if (term) kind = { op: "circle", term };
      break;
    }
    case "arrow":
    case "seta": {
      const from = asString(object["from"]) ?? asString(object["de"]);
      const to = asString(object["to"]) ?? asString(object["para"]);
      if (from && to) kind = { op: "arrow", from, to };
      break;
    }
    case "formula":
    case "equacao":
    case "equation":
    case "write": {
      let latex: string | null = null;
      for (const [key, field] of Object.entries(object)) {
        if (["latex", "formula", "equacao", "equation"].includes(fold(key)) && asString(field)) {
          latex = asString(field);
          break;
        }
      }
      if (latex) kind = { op: "formula", latex };
      break;
    }
    case "plot":
    case "graph":
    case "function": {
      const expression = asString(object["expression"]);
      const xMin = asNumber(object["xMin"]) ?? -5;
      const xMax = asNumber(object["xMax"]) ?? 5;
      if (expression && xMax > xMin) {
        kind = { op: "plot", expression, variable: asString(object["variable"]) ?? "x", xMin, xMax };
        // Only a mark on the curve can carry a note.
        if (point !== null) label = asString(object["label"])?.slice(0, 40) ?? null;
      }
      break;
    }
  }
  if (!kind) return null;
  return {
    kind,
    segment: asIndex(object["segment"]),
    anchor: asString(object["anchor"]),
    point,
    label,
    mentionUTF16: null,
    mentioned: null,
    mentionsUTF16: [],
  };
}

const termOf = (command: DrawingCommand) =>
  command.kind.op === "highlight" || command.kind.op === "circle" ? command.kind.term : null;

/** Keeps an anchor only when it is actually in `spoken`; the spoken term replaces a placeholder one. */
function repaired(command: DrawingCommand, spoken: string): DrawingCommand {
  if (!command.anchor || SpeechWords.wordRanges(command.anchor, spoken).length > 0) return command;
  const term = termOf(command);
  return { ...command, anchor: term && SpeechWords.wordRanges(term, spoken).length > 0 ? term : null };
}

/** The word a marker stands on, or the word after it when that is an article other than "a" ("o a" is the symbol). */
function markedSymbol(at: number, spoken: string): string | null {
  const word = SpeechWords.word(at, spoken);
  if (!word) return null;
  if (!SpeechWords.isArticle(word) || word.toLowerCase() === "a") return word;
  const rest = spoken.slice(at + word.length).trimStart();
  const next = SpeechWords.word(0, rest);
  return next ?? word;
}

export const VoiceTutorReplies = {
  /** Longer than this is not an opening but part of the answer. */
  openingLimit: 160,

  /** The JSON object in a model reply; a fence or a sentence around it is ignored, a cut-off one is closed. */
  decode(content: string): VoiceTutorReply {
    const start = content.indexOf("{");
    if (start < 0) throw new VoiceTutorDecodeError("unreadable");
    const end = content.lastIndexOf("}");
    const candidates = [end > start ? content.slice(start, end + 1) : null, PartialJSON.repaired(content.slice(start))];
    let object: Record<string, unknown> | null = null;
    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        const parsed = JSON.parse(candidate) as unknown;
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          object = parsed as Record<string, unknown>;
          break;
        }
      } catch {
        // The next candidate.
      }
    }
    const modelSpoken = object?.["spoken"];
    if (!object || typeof modelSpoken !== "string") throw new VoiceTutorDecodeError("unreadable");
    const markerCount = SpeechMarkers.extract(modelSpoken).count;
    const marked = SpeechMarkers.extract(SpokenText.sanitize(modelSpoken));
    if (marked.spoken === "") throw new VoiceTutorDecodeError("emptySpoken");
    const raw = Array.isArray(object["drawing"]) ? object["drawing"] : [];
    const drawing: DrawingCommand[] = [];
    const position = new Map<number, number>();
    raw.forEach((item, index) => {
      const command = decodeDrawing(item);
      if (!command) return;
      position.set(index, drawing.length);
      drawing.push(repaired(command, marked.spoken));
    });
    // Each [[n]] lights item n (its index in the model's list); a marker with no item joins the item for the symbol it
    // stands on, or becomes a highlight of that word, so every marker lights.
    const markers = new Map<number, number[]>();
    const orphans: number[] = [];
    for (const [item, offsets] of marked.mentions) {
      const index = position.get(item);
      if (index === undefined) orphans.push(...offsets);
      else markers.set(index, [...(markers.get(index) ?? []), ...offsets]);
    }
    for (const at of orphans.sort((a, b) => a - b)) {
      const word = markedSymbol(at, marked.spoken);
      if (!word) continue;
      const owner = drawing.findIndex((command) => {
        const term = termOf(command);
        return term !== null && (term === word || (term.length > 1 && term.toLowerCase() === word.toLowerCase()));
      });
      if (owner >= 0) markers.set(owner, [...(markers.get(owner) ?? []), at]);
      else {
        markers.set(drawing.length, [at]);
        drawing.push({
          kind: { op: "highlight", term: word },
          segment: null,
          anchor: null,
          point: null,
          label: null,
          mentionUTF16: null,
          mentioned: null,
          mentionsUTF16: [],
        });
      }
    }
    for (const [index, offsets] of markers) {
      const sorted = [...new Set(offsets)].sort((a, b) => a - b);
      const command = drawing[index]!;
      command.mentionUTF16 = sorted[0] ?? null;
      command.mentioned = command.mentionUTF16 === null ? null : SpeechWords.word(command.mentionUTF16, marked.spoken);
      command.mentionsUTF16 = sorted;
    }
    return {
      spoken: marked.spoken,
      drawing,
      modelSpoken,
      markerCount,
      markerOffsets: [...new Set([...marked.mentions.values()].flat())].sort((a, b) => a - b),
      opening: VoiceTutorReplies.opening(object["opening"], marked.spoken),
    };
  },

  /** The model's opening, cleaned like `spoken`; null when missing, empty, too long, or already how `spoken` starts. */
  opening(value: unknown, spoken: string): string | null {
    if (typeof value !== "string") return null;
    const text = SpeechMarkers.extract(SpokenText.sanitize(value)).spoken.trim();
    if (!/\p{L}/u.test(text) || Array.from(text).length > VoiceTutorReplies.openingLimit) return null;
    const plain = (input: string) =>
      input
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N} ]/gu, "");
    const start = plain(text).trim();
    if (start !== "" && plain(spoken).startsWith(start)) return null;
    return text;
  },

  /** The opening said first, in the same text (one voice, one utterance); every offset and sentence moves past it. */
  speakingTheOpening(reply: VoiceTutorReply): VoiceTutorReply {
    const opening = reply.opening;
    if (!opening) return reply;
    const ends = ".!?…:;,".includes(opening[opening.length - 1]!);
    const lead = (ends ? opening : opening + ".") + " ";
    const shift = lead.length;
    const spoken = lead + reply.spoken;
    const sentences = Math.max(
      0,
      SpeechWords.segmentRanges(spoken).length - SpeechWords.segmentRanges(reply.spoken).length,
    );
    return {
      ...reply,
      opening: null,
      spoken,
      modelSpoken: reply.modelSpoken === "" ? "" : lead + reply.modelSpoken,
      markerOffsets: reply.markerOffsets.map((offset) => offset + shift),
      drawing: reply.drawing.map((command) => ({
        ...command,
        mentionUTF16: command.mentionUTF16 === null ? null : command.mentionUTF16 + shift,
        mentionsUTF16: command.mentionsUTF16.map((offset) => offset + shift),
        segment: command.segment === null ? null : command.segment + sentences,
      })),
    };
  },

  /** A mark without a `[[n]]` is never lit: dropped, except a formula, which the app draws on its own. */
  droppingUnlitMarks(reply: VoiceTutorReply): VoiceTutorReply {
    return {
      ...reply,
      drawing: reply.drawing.filter((command) => command.kind.op === "formula" || command.mentionUTF16 !== null),
    };
  },

  /** Too short to be an answer ("x" left when the model wrote its line in LaTeX): never spoken. */
  isDegenerate(spoken: string): boolean {
    const words = spoken.split(/[^\p{L}\p{N}]+/u).filter((word) => /\p{L}/u.test(word));
    const letters = [...spoken].filter((character) => /\p{L}/u.test(character)).length;
    return words.length < 3 || letters < 10;
  },

  /** The marks on screen when the speech has reached `through` (UTF-16 offset): each mark from where it is said, for
   * `hold` characters or until the same mark is said again. */
  lit(reply: VoiceTutorReply, through: number, hold = 60): number[] {
    return reply.drawing.flatMap((command, index) =>
      command.mentionsUTF16.some((at) => through >= at && through < at + hold) ? [index] : [],
    );
  },
};
