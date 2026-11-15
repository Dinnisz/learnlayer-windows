// Port of `Passage.lines(of:)` (LearnLayer/Problems/Passage.swift @ ref 2026-11-04): a page's lines, numbered where
// the exam numbers them.

import type { PassageLine } from "../problems/passage";
import { lineRange, Rects, selectionBounds, type PageText } from "./page";

const isLineBreak = (unit: string) => unit === "\n" || unit === "\r";

/**
 * The page's lines, numbered where the exam numbers them: margin numbers ("5", "10") sit level with a line of text;
 * the lines between are counted from them.
 */
export function passageLinesOf(page: PageText): PassageLine[] {
  const raw = page.text;
  const lines: { text: string; midY: number | null; isNumber: boolean }[] = [];
  let location = 0;
  while (location < raw.length) {
    const range = lineRange(raw, location);
    let text = raw.slice(range.start, range.end);
    while (text !== "" && isLineBreak(text[text.length - 1]!)) text = text.slice(0, -1);
    while (text !== "" && isLineBreak(text[0]!)) text = text.slice(1);
    const bounds = selectionBounds(page, range.start, Math.max(1, text.length));
    lines.push({
      text,
      midY: bounds ? Rects.midY(bounds) : null,
      isNumber: /^\d{1,3}$/.test(text.replace(/^[ \t]+|[ \t]+$/g, "")),
    });
    location = range.end;
  }
  const numbers = lines
    .filter((line) => line.isNumber && line.midY !== null)
    .map((line) => ({ number: Number(line.text.trim()), midY: line.midY! }));
  const text = lines.filter((line) => !line.isNumber);
  // A text line level with a margin number takes it.
  const numbered = new Map<number, number>();
  text.forEach((line, position) => {
    if (line.midY === null) return;
    const match = numbers.find((entry) => Math.abs(entry.midY - line.midY!) < 5);
    if (match) numbered.set(position, match.number);
  });
  const result: PassageLine[] = text.map((line) => ({ number: null, text: line.text }));
  const anchors = [...numbered.keys()].sort((a, b) => a - b);
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (first === undefined || last === undefined || numbers.length < 2) return result;
  for (let position = Math.max(0, first - 4); position <= Math.min(result.length - 1, last + 4); position += 1) {
    // The nearest anchor; the first of two as near.
    const anchor = anchors.reduce(
      (best, candidate) => (Math.abs(candidate - position) < Math.abs(best - position) ? candidate : best),
      anchors[0]!,
    );
    const number = (numbered.get(anchor) ?? 0) + (position - anchor);
    if (number > 0) result[position]!.number = number;
  }
  return result;
}

/** The lines of the pages a question was sent with, in order. */
export function passageLinesOfPages(pages: readonly PageText[]): PassageLine[] {
  return pages.flatMap(passageLinesOf);
}
