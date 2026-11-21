// Port of LearnLayer/Problems/StatementUnderlines.swift (RenderedUnderlines, RenderedQuestion.rects(ofQuote:)) @ ref
// 2026-11-04: where a quoted piece of data stands in a question the app typeset itself. In words only the quote's own
// letters are underlined; a quote that runs into a formula underlines the whole formula.

import { StatementQuotes } from "@core/problems/statementQuotes";

interface Segment {
  /** A run of words, a typeset formula (underlined whole), or nothing (between blocks). */
  node: Text | Element | null;
  text: string;
  start: number;
}

/** The question's words and formulas in reading order, as one string with where each piece starts in it. */
function segments(container: HTMLElement): { text: string; pieces: Segment[] } {
  const pieces: Segment[] = [];
  let text = "";
  const push = (node: Segment["node"], own: string) => {
    pieces.push({ node, text: own, start: text.length });
    text += own;
  };
  const walk = (element: Element) => {
    for (const child of element.childNodes) {
      if (child instanceof Text) {
        push(child, child.data);
      } else if (child instanceof Element) {
        if (child.matches("[data-underline-skip]")) continue;
        if (child.classList.contains("katex")) {
          // The formula's own source, as the transcription wrote it.
          const source = child.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? "";
          push(child, source);
        } else {
          walk(child);
        }
      }
    }
  };
  for (const block of container.children) {
    if (block.matches("[data-underline-skip]")) continue;
    if (text !== "") push(null, "\n");
    walk(block);
  }
  return { text, pieces };
}

/** The boxes, in the window, of the first place `quote` stands in the typeset question; none when it isn't there. */
export function quoteRects(container: HTMLElement, quote: string): DOMRect[] {
  const { text, pieces } = segments(container);
  const range = StatementQuotes.ranges(quote, text)[0];
  if (!range) return [];
  const rects: DOMRect[] = [];
  for (const piece of pieces) {
    const end = piece.start + piece.text.length;
    if (!piece.node || end <= range.start || piece.start >= range.end) continue;
    if (piece.node instanceof Text) {
      const words = document.createRange();
      words.setStart(piece.node, Math.max(0, range.start - piece.start));
      words.setEnd(piece.node, Math.min(piece.text.length, range.end - piece.start));
      for (const rect of words.getClientRects()) if (rect.width > 0.5) rects.push(rect);
    } else {
      rects.push(piece.node.getBoundingClientRect());
    }
  }
  return rects;
}
