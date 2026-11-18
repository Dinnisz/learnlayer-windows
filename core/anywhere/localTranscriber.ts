// Port of the text layout of `LocalTranscriber.transcribe` (LearnLayer/Problems/LocalTranscriber.swift @ ref 2026-11-04):
// a question read on the computer alone, no model, its layout rebuilt from where the lines are: rows, the columns of a
// multiple choice, paragraphs that wrap. The Mac also cuts figures from the ink that is not text and reads formulas with
// a recogniser (Pix2Text); neither exists here, so the lines are the items, as the Mac's are when there is no formula.

import { optionLabel, Repair, RepairContexts, type RepairContext } from "./localRepair";

export interface LayoutLine {
  text: string;
  /** Top-left origin, y down, in any one unit for all the lines. */
  rect: { x: number; y: number; width: number; height: number };
}

export interface LayoutBlock {
  /** "text": a paragraph, or one option of a multiple choice. */
  type: "text";
  text: string;
  rect: LayoutLine["rect"];
}

type Rect = LayoutLine["rect"];
const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};
const unionAll = (rects: readonly Rect[]) => rects.slice(1).reduce(union, rects[0]!);

class Cell {
  constructor(public parts: LayoutLine[]) {}

  get rect(): Rect {
    return unionAll(this.parts.map((part) => part.rect));
  }

  get plain(): string {
    return this.parts.map((part) => part.text).join(" ");
  }

  get isOption(): boolean {
    return optionLabel(this.plain) !== null;
  }

  get startsNewParagraph(): boolean {
    return /^([•●·\-–*]\s|\(?[A-Da-d][).]\s|[IVX]+\.\s|\d+(\.\d+)*\.?\s)/u.test(this.plain.trim());
  }

  /** The letter of the option label this cell starts with. */
  get letter(): string | null {
    const label = optionLabel(this.plain);
    const letter = label ? Array.from(label).find((ch) => /\p{L}/u.test(ch)) : undefined;
    return letter ? letter.toUpperCase() : null;
  }

  /** Writes the letter over a label-shaped start the recogniser misread: "(0)" → "(C)". */
  relabel(letter: string): void {
    const first = this.parts[0];
    if (!first) return;
    const label = /^[([][A-Za-z0-9]{0,2}[)\]]/u.exec(first.text);
    if (!label) return;
    const open = label[0].startsWith("[") ? "[" : "(";
    const close = open === "[" ? "]" : ")";
    this.parts[0] = { ...first, text: open + letter + close + first.text.slice(label[0].length) };
  }

  /** The cell as a block's text, repaired by rule. */
  text(context: RepairContext): string {
    let out = "";
    for (const part of this.parts) {
      if (out !== "" && !",.;:".includes(part.text[0] ?? "x")) out += " ";
      out += part.text;
    }
    return Repair.apply(out, context, this.isOption);
  }
}

function overlap(a: [number, number], b: [number, number]): number {
  const shared = Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
  if (shared <= 0) return 0;
  return shared / Math.max(0.0001, Math.min(a[1] - a[0], b[1] - b[0]));
}

/** Items on one line of the page: those whose vertical extents overlap. Within a row, a wide gap starts a new cell. */
function rows(items: readonly LayoutLine[]): Cell[][] {
  const sorted = [...items].sort((a, b) => a.rect.y + a.rect.height / 2 - (b.rect.y + b.rect.height / 2));
  const groups: LayoutLine[][] = [];
  const extents: [number, number][] = [];
  for (const item of sorted) {
    const span: [number, number] = [item.rect.y, item.rect.y + item.rect.height];
    let index = -1;
    for (let at = extents.length - 1; at >= 0; at--)
      if (overlap(extents[at]!, span) >= 0.5) {
        index = at;
        break;
      }
    if (index >= 0) {
      groups[index]!.push(item);
      extents[index] = [Math.min(extents[index]![0], span[0]), Math.max(extents[index]![1], span[1])];
    } else {
      groups.push([item]);
      extents.push(span);
    }
  }
  const top = (group: LayoutLine[]) => Math.min(...group.map((item) => item.rect.y));
  return groups
    .sort((a, b) => top(a) - top(b))
    .map((group) => {
      const ordered = [...group].sort((a, b) => a.rect.x - b.rect.x);
      const heights = ordered.map((item) => item.rect.height).sort((a, b) => a - b);
      const lineHeight = heights[Math.floor(heights.length / 2)] ?? 20;
      let cells: Cell[] = [];
      for (const item of ordered) {
        const last = cells[cells.length - 1];
        if (last && item.rect.x - (last.rect.x + last.rect.width) <= 2.2 * lineHeight) last.parts.push(item);
        else cells.push(new Cell([item]));
      }
      // A row of several cells is a row of options only if more than one begins with a letter; otherwise it is one
      // line with wide gaps.
      if (cells.length > 1 && cells.filter((cell) => cell.isOption).length < 2)
        cells = [new Cell(cells.flatMap((cell) => cell.parts))];
      else if (cells.length > 1) {
        // The letters the recogniser misread in a row of options ("(0)", "()") continue the sequence.
        const first = Math.max(
          0,
          cells.findIndex((cell) => cell.isOption),
        );
        const letter = cells[first]!.letter;
        if (letter) {
          const base = letter.charCodeAt(0) - 65 - first;
          cells.forEach((cell, index) => {
            if (!cell.isOption) cell.relabel(String.fromCharCode(65 + base + index));
          });
        }
      }
      return cells;
    });
}

/** A line wraps the one above when it is not a new item, follows closely, and the line above has not ended a sentence. */
function continues(paragraph: Cell[], cell: Cell): boolean {
  const last = paragraph[paragraph.length - 1];
  if (!last || cell.startsNewParagraph) return false;
  const closely = cell.rect.y - (last.rect.y + last.rect.height) < last.rect.height * 0.9;
  const ended = /[.:;?!]\s*\$?$/u.test(last.plain.trim());
  return closely && !ended;
}

/** The question's blocks from its lines: paragraphs, and each option of a multiple choice on its own. */
export function transcribeLines(given: readonly LayoutLine[]): LayoutBlock[] {
  const lines = given
    .map((line) => {
      const words = line.text
        .split(" ")
        .filter((word) => word !== "")
        .map((word) => Repair.lookalikes(word));
      // A full stop the recogniser read as a bullet, at the end of a line.
      const last = words.length - 1;
      if (last > 0 && (words[last] === "•" || words[last] === "·")) words[last] = ".";
      return { text: words.join(" "), rect: line.rect };
    })
    .filter((line) => line.text !== "");
  if (lines.length === 0) return [];
  const context = RepairContexts.of(lines.map((line) => line.text).join(" "));
  const blocks: LayoutBlock[] = [];
  let paragraph: Cell[] | null = null;
  const close = () => {
    if (!paragraph) return;
    const text = paragraph.map((cell) => cell.text(context)).join(" ");
    blocks.push({ type: "text", text: Repair.joinWrapped(text), rect: unionAll(paragraph.map((cell) => cell.rect)) });
    paragraph = null;
  };
  for (const row of rows(lines)) {
    if (row.every((cell) => cell.isOption)) {
      close();
      for (const cell of row) blocks.push({ type: "text", text: cell.text(context), rect: cell.rect });
      continue;
    }
    const merged = new Cell(row.flatMap((cell) => cell.parts));
    if (paragraph && continues(paragraph, merged)) paragraph.push(merged);
    else {
      close();
      paragraph = [merged];
    }
  }
  close();
  return blocks;
}
