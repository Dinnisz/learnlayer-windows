// Port of the decisions in LearnLayer/Anywhere/AccessibilityReader.swift @ ref 2026-11-04 (questionInLongText and
// questionBlock's widening): the native side gathers what UI Automation exposes under the point, and this decides
// which part of it is the question.

import type { Rect } from "../pdf/page";
import { characterCount } from "./questionBand";
import { paragraphRange, ScreenQuestions, topLabel, type ScreenQuestion } from "./screenQuestion";

/** A document's text (a PDF in a viewer that exposes it, Word, a long page) and where the point falls in it. */
export interface UIALongText {
  text: string;
  /** UTF-16 units from the start. */
  index: number;
  frame: Rect;
}

export interface UIANode {
  text: string;
  frame: Rect;
  kind: "text" | "image" | "link" | "button" | "group";
  hasImage: boolean;
}

/** The element around the point that reads like a question (`index` in `nodes`) and its siblings, in order. */
export interface UIABlock {
  index: number;
  nodes: UIANode[];
}

export interface UIAReading {
  longText: UIALongText | null;
  block: UIABlock | null;
  /** The text right under the pointer. */
  focus: string;
}

/** The start of a whole question in the first 40 characters of a text. */
const startsQuestion = (text: string) => {
  const head = text.slice(0, 40);
  return new RegExp(topLabel.source, topLabel.flags.replace("g", "")).test(head);
};

const midY = (rect: Rect) => rect.y + rect.height / 2;

/** The question in a long text: from the label before the point to the next one (`questionRange`), at least 12
 * characters; the paragraph at the point is its focus. */
export function questionInLongText(long: UIALongText): { text: string; focus: string } | null {
  if (characterCount(long.text) <= 200) return null;
  const index = Math.min(Math.max(0, long.index), long.text.length - 1);
  const range = ScreenQuestions.questionRange(long.text, index);
  const question = long.text.slice(range.start, range.start + range.length).trim();
  const paragraph = paragraphRange(long.text, index);
  const focus = long.text.slice(paragraph.start, paragraph.end);
  return characterCount(question) >= 12 ? { text: question, focus } : null;
}

/**
 * The block around the point, widened to its siblings when a web page lays a question out as siblings (its number,
 * its paragraphs, its figure, its options): from the question's number to the next one; with no number, only to the
 * short lines right after it (the options), never the whole page.
 */
export function questionInBlock(block: UIABlock): { text: string; frame: Rect; hasImage: boolean } | null {
  const node = block.nodes[block.index];
  if (!node || characterCount(node.text) < 12) return null;
  let found = { text: node.text, frame: node.frame, hasImage: node.hasImage };
  const siblings = block.nodes;
  if (siblings.length <= 1) return found;
  const nearby = (other: UIANode) =>
    other.frame.width > 0 && other.frame.height > 0 && Math.abs(midY(other.frame) - midY(node.frame)) < 700;
  const index = block.index;
  let first = index;
  let last = index;
  let label: number | null = null;
  for (let at = index; at >= Math.max(0, index - 15); at -= 1) {
    if (startsQuestion(siblings[at]!.text)) {
      label = at;
      break;
    }
  }
  if (label !== null) {
    first = label;
    while (
      last + 1 < siblings.length &&
      last - index < 15 &&
      nearby(siblings[last + 1]!) &&
      !startsQuestion(siblings[last + 1]!.text)
    ) {
      last += 1;
    }
  } else {
    while (last + 1 < siblings.length && last - index < 6 && nearby(siblings[last + 1]!)) {
      const next = siblings[last + 1]!.text;
      if (characterCount(next) > 140 || next.endsWith("?")) break;
      last += 1;
    }
  }
  if (first === index && last === index) return found;
  const texts: { text: string; frame: Rect }[] = [];
  let frame: Rect | null = null;
  let hasImage = false;
  for (let at = first; at <= last; at += 1) {
    const sibling = siblings[at]!;
    if (!nearby(sibling) && at !== index) continue;
    // A lone link or button next to the question ("Ver Resposta") isn't part of it.
    if (sibling.kind === "link" || sibling.kind === "button") continue;
    if (sibling.text !== "") texts.push({ text: sibling.text, frame: sibling.frame });
    if (sibling.hasImage || (sibling.kind === "image" && sibling.text === "")) hasImage = true;
    if (sibling.frame.width > 0) {
      frame = frame
        ? {
            x: Math.min(frame.x, sibling.frame.x),
            y: Math.min(frame.y, sibling.frame.y),
            width:
              Math.max(frame.x + frame.width, sibling.frame.x + sibling.frame.width) -
              Math.min(frame.x, sibling.frame.x),
            height:
              Math.max(frame.y + frame.height, sibling.frame.y + sibling.frame.height) -
              Math.min(frame.y, sibling.frame.y),
          }
        : sibling.frame;
    }
  }
  const text = joinedLines(texts);
  if (characterCount(text) >= characterCount(found.text) && characterCount(text) <= 4000 && frame) {
    found = { text, frame, hasImage: hasImage || found.hasImage };
  }
  return found;
}

const superscripts: Record<string, string> = Object.fromEntries(
  [..."0123456789+-−=()nixyabcdefghjklmoprstuvwz"].map((ch, index) => [
    ch,
    [..."⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ⁿⁱˣʸᵃᵇᶜᵈᵉᶠᵍʰʲᵏˡᵐᵒᵖʳˢᵗᵘᵛʷᶻ"][index]!,
  ]),
);

/** A raised piece written as an exponent: in superscript letters when each has one ("−x" → "⁻ˣ"), primes as they are,
 * else after a caret. */
function asExponent(text: string): string {
  const trimmed = text.trim();
  if (/^[′″‴']+$/u.test(trimmed)) return trimmed;
  const letters = [...trimmed];
  if (letters.every((ch) => superscripts[ch] !== undefined)) return letters.map((ch) => superscripts[ch]).join("");
  return letters.length === 1 ? `^${trimmed}` : `^(${trimmed})`;
}

/**
 * The siblings' text in reading order. A page cuts a line into pieces around an inline element (`e<sup>−x</sup>.`):
 * a piece beside the one before, on the same line, goes on that line, a raised smaller one as its exponent, and a new
 * line only starts below.
 */
export function joinedLines(pieces: readonly { text: string; frame: Rect }[]): string {
  let out = "";
  // The line's own (unraised) box, and where the last piece ended.
  let line: Rect | null = null;
  let end = 0;
  for (const piece of pieces) {
    const box = piece.frame;
    if (!line || box.width <= 0 || box.height <= 0) {
      out += (out === "" ? "" : "\n") + piece.text;
      if (box.width > 0 && box.height > 0) {
        line = box;
        end = box.x + box.width;
      }
      continue;
    }
    const overlap = Math.min(line.y + line.height, box.y + box.height) - Math.max(line.y, box.y);
    const beside = box.x >= end - 2 && box.x - end < 2 * line.height;
    if (!beside || overlap < 0.3 * Math.min(line.height, box.height)) {
      out += "\n" + piece.text;
      line = box;
      end = box.x + box.width;
      continue;
    }
    const raised = midY(box) < midY(line) - 0.15 * line.height && box.height < 0.9 * line.height;
    // A piece's box takes in the space after its words, so the gap says nothing: words are always a space apart; an
    // exponent and punctuation go right after what they follow.
    const glued = raised || /^[.,;:!?)\]′″‴']/u.test(piece.text) || /\s$/u.test(out);
    out += (glued ? "" : " ") + (raised ? asExponent(piece.text) : piece.text);
    end = box.x + box.width;
  }
  // A typeset formula's text spells its primes apart ("y ‴ + 2 y ″"): they are the letter's.
  return out.replace(/(\p{L}) +([′″‴]+)/gu, "$1$2");
}

/** UI Automation's question under the point, as `AccessibilityReader.question` returns it; null when nothing reads. */
export function screenQuestionFromUIA(reading: UIAReading, appName: string): ScreenQuestion | null {
  if (reading.longText) {
    const found = questionInLongText(reading.longText);
    if (found) {
      return ScreenQuestions.make({
        text: found.text,
        frame: reading.longText.frame,
        appName,
        hasImage: false,
        method: "text-range",
        focus: found.focus,
      });
    }
  }
  if (reading.block) {
    const found = questionInBlock(reading.block);
    if (found) {
      return ScreenQuestions.make({
        text: found.text,
        frame: found.frame,
        appName,
        hasImage: found.hasImage,
        method: "block",
        focus: reading.focus,
      });
    }
  }
  return null;
}
