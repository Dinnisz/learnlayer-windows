// What the student said, as text (CLAUDE.md §4.5). The Mac listens on the device; on Windows the first version records
// the microphone while the talk key is held and asks `google/gemini-3.8-flash` (allowed on every plan) for the words,
// through the LearnLayer API. Windows' own recogniser (Windows.Media.SpeechRecognition) needs the pt-PT speech pack
// and comes later (docs/DECISOES.md). This prompt is the Windows app's own: the Mac has none.

import { ModelRouting } from "../ai/modelRouting";
import type { ModelClient } from "../ai/modelClient";
import type { JSONSchema } from "../prompts/swiftText";
import type { TutorLanguage } from "../problems/solutionRequest";

/** 16-bit PCM WAV, mono: what OpenRouter's `input_audio` takes. Samples are -1…1. */
export function encodeWAV(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const write = (at: number, text: string) =>
    [...text].forEach((character, index) => view.setUint8(at + index, character.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });
  return bytes;
}

/** `samples` at `from` Hz, at `to` Hz (averaging the samples each new one covers). */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let index = 0; index < out.length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(samples.length, Math.max(start + 1, Math.floor((index + 1) * ratio)));
    let sum = 0;
    for (let at = start; at < end; at += 1) sum += samples[at]!;
    out[index] = sum / (end - start);
  }
  return out;
}

export const SpeechToText = {
  model: ModelRouting.gemini,
  /** Speech is sent at 16 kHz: enough for words, a quarter of the bytes of 44.1 kHz. */
  sampleRate: 16_000,
  /** Shorter than this is a key tapped by mistake: nothing is sent. */
  shortestSeconds: 0.3,

  system(language: TutorLanguage): string {
    const spoken = language === "en" ? "English" : "European Portuguese (pt-PT)";
    return (
      "You transcribe what a student said aloud to a study tutor. The student usually speaks " +
      spoken +
      ', sometimes with words of another language, numbers, letters and symbol names ("x zero", "delta t"). ' +
      "Write exactly the words said, in the language they were said, with normal punctuation; " +
      "numbers as digits. Never answer the student, never add or fix anything. " +
      'Reply with one JSON object {"text": "..."}; an empty "text" when nothing was said.'
    );
  },

  user: "Transcribe the recording.",

  schema: {
    type: "object",
    additionalProperties: false,
    required: ["text"],
    properties: { text: { type: "string" } },
  } as JSONSchema,

  /** The words in a recording, or "" when nothing was said. */
  async transcribe(
    client: ModelClient,
    wav: Uint8Array,
    language: TutorLanguage,
    signal?: AbortSignal,
  ): Promise<string> {
    const completion = await client.complete({
      system: SpeechToText.system(language),
      user: SpeechToText.user,
      audio: { data: wav, format: "wav" },
      schemaName: "transcript",
      schema: SpeechToText.schema,
      maxTokens: 600,
      timeout: 20,
      ...(signal ? { signal } : {}),
    });
    return SpeechToText.text(completion.content);
  },

  text(content: string): string {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end <= start) return content.trim();
    try {
      const value = (JSON.parse(content.slice(start, end + 1)) as { text?: unknown }).text;
      return typeof value === "string" ? value.trim() : "";
    } catch {
      return "";
    }
  },
};
