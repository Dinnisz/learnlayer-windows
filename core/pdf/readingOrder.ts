// Port of LearnLayer/Problems/PDFReadingOrder.swift @ ref 2026-11-04: the part that puts a line's glyphs back in
// reading order. (`restoringOptions`, `ExamFont` and `TextMachine` decode the page's content stream because PDFKit's
// text drops some glyphs; pdf.js reads the content stream itself, so they are not ported — see DECISOES.md.)

export interface Glyph {
  x: number;
  y: number;
  character: string;
}

const signs = "+−–-=≠≈<>≤≥×·";
const isLetterChar = (character: string | undefined) => character !== undefined && /\p{L}/u.test(character);
const isNumberChar = (character: string | undefined) => character !== undefined && /\p{N}/u.test(character);
const isLineBreak = (glyph: Glyph) => glyph.character === "\n" || glyph.character === "\r";
const joined = (glyphs: readonly Glyph[]) => glyphs.map((glyph) => glyph.character).join("");

/** A glyph sits to the left of one that was stored before it. */
function isOutOfOrder(glyphs: readonly Glyph[]): boolean {
  let last = -Number.MAX_VALUE;
  for (const glyph of glyphs) {
    if (glyph.character === " ") continue;
    if (glyph.x + 0.4 < last) return true;
    last = Math.max(last, glyph.x);
  }
  return false;
}

/** Share of pairs whose x goes backwards. A reversed equation is near 1; one bad bound is near 0. */
function inversionShare(glyphs: readonly Glyph[]): number {
  const items = glyphs.filter((glyph) => glyph.character !== " ");
  if (items.length < 2) return 0;
  let inversions = 0;
  let pairs = 0;
  for (let index = 0; index < items.length; index += 1) {
    for (let later = index + 1; later < items.length; later += 1) {
      pairs += 1;
      if (items[later]!.x + 0.4 < items[index]!.x) inversions += 1;
    }
  }
  return inversions / Math.max(pairs, 1);
}

function shouldSort(glyphs: readonly Glyph[]): boolean {
  if (glyphs.filter((glyph) => glyph.character !== " ").length <= 16) return true;
  return inversionShare(glyphs) >= 0.2;
}

/** An equation or a bracket run: no word of three letters, and a digit or a sign. */
function isMathLine(glyphs: readonly Glyph[]): boolean {
  const text = joined(glyphs);
  if (/\p{L}{3,}/u.test(text)) return false;
  return Array.from(text).some((character) => isNumberChar(character) || "+−–-=<>[]()".includes(character));
}

const isBracketCharacter = (character: string) =>
  Array.from(character).length === 1 && "[]()0123456789,.; −-+∞".includes(character);

/** A backwards interval inside a sentence (" ]0 ,1-[ ") is sorted on its own. The words around it stay. */
function restoringBrackets(input: readonly Glyph[]): string {
  const glyphs = [...input];
  let index = 0;
  while (index < glyphs.length) {
    if (!isBracketCharacter(glyphs[index]!.character)) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < glyphs.length && isBracketCharacter(glyphs[end]!.character)) end += 1;
    const span = glyphs.slice(index, end);
    if (span.some((glyph) => glyph.character === "[" || glyph.character === "]") && isOutOfOrder(span)) {
      [...span].sort((a, b) => a.x - b.x).forEach((glyph, offset) => (glyphs[index + offset] = glyph));
    }
    index = end;
  }
  return joined(glyphs);
}

/**
 * The constant 0 of "= 0" when its glyph was given a position in the middle of the equation, immediately before a
 * variable ("3x 0y"): it moves to the right, with "=" in front of it when the line already has another sign.
 */
function parkingStrayZero(glyphs: readonly Glyph[]): Glyph[] {
  const text = joined(glyphs);
  if (Array.from(text).some((character) => "=≠".includes(character))) return [...glyphs];
  const order = glyphs
    .map((_, index) => index)
    .filter((index) => glyphs[index]!.character !== " ")
    .sort((a, b) => glyphs[a]!.x - glyphs[b]!.x);
  const stray = order.findIndex((glyphIndex, listIndex) => {
    if (glyphs[glyphIndex]!.character !== "0" || listIndex + 1 >= order.length) return false;
    if (listIndex > 0 && Array.from(glyphs[order[listIndex - 1]!]!.character).every(isNumberChar)) return false;
    return Array.from(glyphs[order[listIndex + 1]!]!.character).some(isLetterChar);
  });
  if (stray < 0) return [...glyphs];
  const copy = glyphs.map((glyph) => ({ ...glyph }));
  const index = order[stray]!;
  const maxX = Math.max(...copy.map((glyph) => glyph.x));
  copy[index]!.x = maxX + 8;
  if (Array.from(text).some((character) => "+−–<>".includes(character))) {
    copy.push({ x: maxX + 4, y: copy[index]!.y, character: "=" });
  }
  return copy;
}

/** A maths line with no + or =, and a gap wide enough to have held one: before a final 0 it is "=", else "+". */
function fillingOperators(glyphs: readonly Glyph[]): Glyph[] {
  const text = joined(glyphs);
  if (Array.from(text).some((character) => "+−–-=<>".includes(character))) return [...glyphs];
  if (!Array.from(text).some((character) => "xyz".includes(character)) || !Array.from(text).some(isNumberChar)) {
    return [...glyphs];
  }
  const sorted = [...glyphs].sort((a, b) => a.x - b.x);
  const items = sorted.map((glyph, offset) => ({ glyph, offset })).filter((item) => item.glyph.character !== " ");
  if (items.length < 3) return [...glyphs];
  const gaps = items.slice(1).map((item, index) => item.glyph.x - items[index]!.glyph.x);
  const typical = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 3)]!;
  const threshold = Math.max(typical * 2.8, 16);
  const inserted = [...sorted];
  for (let pair = items.length - 2; pair >= 0; pair -= 1) {
    const left = items[pair]!;
    const right = items[pair + 1]!;
    const gap = right.glyph.x - left.glyph.x;
    if (!(gap > threshold)) continue;
    const isLast = right.offset === items[items.length - 1]!.offset;
    const sign = isLast && right.glyph.character === "0" ? "=" : "+";
    inserted.splice(right.offset, 0, { x: (left.glyph.x + right.glyph.x) / 2, y: left.glyph.y, character: sign });
  }
  return inserted;
}

function reorderBand(glyphs: readonly Glyph[]): string {
  if (!isMathLine(glyphs)) return isOutOfOrder(glyphs) ? restoringBrackets(glyphs) : joined(glyphs);
  const prepared = parkingStrayZero(glyphs);
  const ordered = isOutOfOrder(prepared) && shouldSort(prepared) ? [...prepared].sort((a, b) => a.x - b.x) : prepared;
  return joined(fillingOperators(ordered));
}

/** Glyphs that share a baseline. A sign that sits a little off the line joins the nearest line. */
function baselines(glyphs: readonly Glyph[]): Glyph[][] {
  const isSign = (glyph: Glyph) => Array.from(glyph.character).length === 1 && signs.includes(glyph.character);
  const bands: { glyph: Glyph; index: number }[][] = [];
  const bandY: number[] = [];
  const loose: { glyph: Glyph; index: number }[] = [];
  glyphs.forEach((glyph, index) => {
    if (isSign(glyph)) {
      loose.push({ glyph, index });
      return;
    }
    const found = bandY.findIndex((y) => Math.abs(y - glyph.y) < 4);
    if (found >= 0) bands[found]!.push({ glyph, index });
    else {
      bands.push([{ glyph, index }]);
      bandY.push(glyph.y);
    }
  });
  if (bands.length === 0) return glyphs.length === 0 ? [] : [[...glyphs]];
  for (const item of loose) {
    let nearest = 0;
    bandY.forEach((y, index) => {
      if (Math.abs(y - item.glyph.y) < Math.abs(bandY[nearest]! - item.glyph.y)) nearest = index;
    });
    if (Math.abs(bandY[nearest]! - item.glyph.y) < 14) {
      const band = bands[nearest]!;
      const place = band.findIndex((other) => other.index > item.index);
      band.splice(place < 0 ? band.length : place, 0, item);
    } else {
      bands.push([item]);
      bandY.push(item.glyph.y);
    }
  }
  return bands.map((band) => band.map((item) => item.glyph));
}

function isOperatorLine(glyphs: readonly Glyph[]): boolean {
  const characters = Array.from(joined(glyphs)).filter((character) => !/\s/u.test(character));
  return characters.length > 0 && characters.every((character) => signs.includes(character));
}

const splitsAWord = (previous: string, next: string) =>
  isLetterChar(Array.from(previous)[0]) && isLetterChar(Array.from(next)[0]);

export const ReadingOrder = {
  /** The line as stored: two baselines are kept apart, a maths line is sorted only when it is actually jumbled. */
  reorder(glyphs: readonly Glyph[]): string {
    const bands = baselines(glyphs.filter((glyph) => !isLineBreak(glyph)));
    if (bands.length === 0) return joined(glyphs);
    return bands.map(reorderBand).join(bands.length > 1 ? "\n" : "");
  },

  /** Lines from the glyphs. A line that is only operators joins the line above it, then ordered by x. */
  assemble(glyphs: readonly Glyph[]): string {
    const lines: Glyph[][] = [[]];
    for (const glyph of glyphs) {
      if (isLineBreak(glyph)) lines.push([]);
      else lines[lines.length - 1]!.push(glyph);
    }
    const merged: Glyph[][] = [];
    for (const line of lines) {
      if (line.length === 0 && merged.length > 0) continue;
      const last = merged[merged.length - 1];
      if (isOperatorLine(line) && last && last.length > 0) last.push(...line);
      else if (line.length > 0) merged.push(line);
    }
    return merged.map(ReadingOrder.reorder).join("\n");
  },

  /** "+" or "=" (and the other relation signs) when that is all the gap holds. */
  operatorText(raw: string): string | null {
    const trimmed = raw.trim();
    if (trimmed === "" || Array.from(trimmed).length > 3) return null;
    const found = Array.from(trimmed).filter((character) => signs.includes(character));
    return found.length === 0 ? null : found.join("");
  },

  /** Inserts operator glyphs a gap search found, between the tokens they sit in. */
  inserting(operators: readonly { x: number; y: number; text: string }[], glyphs: readonly Glyph[]): Glyph[] {
    const result = [...glyphs];
    for (const item of operators) {
      const text = ReadingOrder.operatorText(item.text);
      if (!text) continue;
      if (
        result.some(
          (glyph) => Math.abs(glyph.x - item.x) < 1.2 && Math.abs(glyph.y - item.y) < 3 && glyph.character === text,
        )
      ) {
        continue;
      }
      const glyph = { x: item.x, y: item.y, character: text };
      // Into the gap, by x, without moving the glyphs already there. Never between two letters.
      const index = result.findIndex(
        (other) => Math.abs(other.y - item.y) < 4 && other.x > item.x && !isLineBreak(other),
      );
      if (index >= 0) {
        const previous = index > 0 ? result[index - 1]!.character : "";
        if (!splitsAWord(previous, result[index]!.character)) result.splice(index, 0, glyph);
        continue;
      }
      let last = -1;
      result.forEach((other, position) => {
        if (Math.abs(other.y - item.y) < 4 && !isLineBreak(other)) last = position;
      });
      if (last >= 0) result.splice(last + 1, 0, glyph);
      else result.push(glyph);
    }
    return result;
  },

  /**
   * A multiple-choice stem whose last clause was stored after the options ("… à reta (A) … (D) … DH e que passa no
   * ponto G?") reads stem, then options.
   */
  stemBeforeOptions(text: string): string {
    const found = Array.from(text.matchAll(/\([A-Ea-e]\)/g));
    if (found.length < 2) return text;
    const first = found[0]!.index!;
    const last = found[found.length - 1]!;
    const stem = text.slice(0, first).trim();
    const end = stem[stem.length - 1];
    if (stem === "" || end === "?" || end === "." || end === "!") return text;
    const after = last.index! + last[0].length;
    const rest = text.slice(after);
    const match = /\s+(\p{L}{1,}(?:\s+\p{L}+)+\s*[?.!]?)\s*$/u.exec(rest);
    if (!match) return text;
    const clause = match[1]!.trim().replace(/\s+([?.!])$/, "$1");
    if (clause.startsWith("(")) return text;
    const bodyEnd = match.index + match[0].indexOf(match[1]!);
    const optionBody = (text.slice(first, after) + rest.slice(0, bodyEnd)).trim();
    return stem + " " + clause + "\n" + optionBody;
  },
};
