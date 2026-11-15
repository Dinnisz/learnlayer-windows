// The recording sent to be transcribed: a 16-bit mono WAV the model takes, and the words read back from its reply.

import { describe, expect, it } from "vitest";
import { userContent } from "../ai/modelClient";
import { encodeWAV, resample, SpeechToText } from "./speechToText";

describe("SpeechToText", () => {
  it("writes a 16-bit mono WAV", () => {
    const wav = encodeWAV(new Float32Array([0, 1, -1, 0.5]), 16_000);
    const view = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(wav.slice(8, 12))).toBe("WAVE");
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x8000);
    expect(wav).toHaveLength(52);
  });

  it("brings 48 kHz down to 16 kHz", () => {
    const samples = Float32Array.from({ length: 48 }, (_, index) => (index % 3 === 0 ? 0.3 : 0));
    const out = resample(samples, 48_000, 16_000);
    expect(out).toHaveLength(16);
    expect(out[0]).toBeCloseTo(0.1);
  });

  it("sends the recording as OpenRouter's audio input and reads the words back", () => {
    const content = userContent("Transcribe the recording.", [], {
      data: new Uint8Array([1, 2, 3]),
      format: "wav",
    }) as {
      type: string;
      input_audio?: { data: string; format: string };
    }[];
    expect(content[1]).toEqual({ type: "input_audio", input_audio: { data: "AQID", format: "wav" } });
    expect(SpeechToText.text('{"text":" não percebi o passo 2 "}')).toBe("não percebi o passo 2");
    expect(SpeechToText.text("not json")).toBe("not json");
    expect(SpeechToText.system("pt")).toContain("European Portuguese (pt-PT)");
    expect(SpeechToText.model).toBe("google/gemini-3.8-flash");
  });
});
