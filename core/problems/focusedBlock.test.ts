// A step's focus on the typeset question (`RenderedQuestion.focus` @ 5701363): the model's box, on the picture it read,
// carried to the block drawn from that band of the picture; on a figure, the figure's own mark; elsewhere, nothing.
import { describe, expect, it } from "vitest";
import { Transcriptions, type TranscriptionBlock } from "./questionTranscription";

const block = (type: string, box: number[] | null, text: string | null = "x"): TranscriptionBlock => ({
  type,
  text,
  box,
  caption: null,
});

const blocks: TranscriptionBlock[] = [
  block("text", [0.05, 0.02, 0.9, 0.12], "3. Considere a função f definida por"),
  block("formula", [0.3, 0.16, 0.4, 0.1], "f(x) = x^2 - 4"),
  block("figure", [0.6, 0.3, 0.35, 0.4], null),
  block("text", [0.05, 0.75, 0.9, 0.1], "Determine os zeros de f."),
  block("text", null, "(sem caixa)"),
];
const figures = [{ x: 0.6, y: 0.3, width: 0.35, height: 0.4 }];

describe("a step's focus on the typeset question", () => {
  it("falls on the block drawn from that band of the picture", () => {
    expect(Transcriptions.focusedBlock({ x: 0.4, y: 0.18, w: 0.1, h: 0.04 }, blocks, figures)).toBe(1);
    expect(Transcriptions.focusedBlock({ x: 0.1, y: 0.78, w: 0.2, h: 0.04 }, blocks, figures)).toBe(3);
    // The band, not the box: a centre beside a short line is still that line's.
    expect(Transcriptions.focusedBlock({ x: 0.92, y: 0.04, w: 0.04, h: 0.04 }, blocks, figures)).toBe(0);
  });

  it("leaves a figure to its own mark, and marks nothing elsewhere", () => {
    expect(Transcriptions.focusedBlock({ x: 0.7, y: 0.4, w: 0.1, h: 0.1 }, blocks, figures)).toBeNull();
    // Between the blocks, or past the last one.
    expect(Transcriptions.focusedBlock({ x: 0.1, y: 0.5, w: 0.1, h: 0.04 }, blocks, figures)).toBeNull();
    expect(Transcriptions.focusedBlock({ x: 0.1, y: 0.95, w: 0.1, h: 0.03 }, blocks, figures)).toBeNull();
    expect(Transcriptions.focusedBlock({ x: Number.NaN, y: 0.1, w: 0.1, h: 0.1 }, blocks, figures)).toBeNull();
  });
});
