// Port of LearnLayer/Problems/PrintedSpelling.swift @ 5701363
//
// A reading of the picture keeps the words as the page prints them: a model that writes «polinômio» (pt-BR) for the
// printed «polinómio» (pt-PT) has its accents put back from the page's own text. The text layer may have its words
// glued and its accents read through the wrong code page («ecalculeopolinÛmiocaracterÌstico»): both are undone
// before the words are looked up.

import type { QuestionTranscription } from "./questionTranscription";

/** Mac OS Roman's upper half (bytes 0x80–0xFF), as the characters it stands for. */
const macRoman =
  "ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ";
const macRomanByte = new Map(Array.from(macRoman).map((character, index) => [character, 0x80 + index]));

/** One character, lower case and without its accent; itself when that would not be one character. */
function fold(character: string): string {
  const plain = character.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return Array.from(plain).length === 1 ? plain : character;
}

const isASCII = (character: string) => character.charCodeAt(0) < 128 && character.length === 1;
const isUppercase = (character: string) =>
  character !== character.toLowerCase() && character === character.toUpperCase();

export const PrintedSpelling = {
  /**
   * `text` (prose with `$…$` maths) with each accented word spelled as `printed` spells it, when the page has that
   * word with other accents and nowhere as the reading writes it. Maths is left alone.
   */
  keeping(text: string, printed: string): string {
    const source = Array.from(PrintedSpelling.repairedCodePage(printed));
    const folded = source.map(fold);
    if (folded.length === 0) return text;
    const segments = text.split("$");
    for (let index = 0; index < segments.length; index += 2)
      segments[index] = respelled(segments[index]!, source, folded);
    return segments.join("$");
  },

  /**
   * A text layer whose accents were read as Mac OS Roman though the font gives them as Latin-1 («combinaÁ„o»,
   * «polinÛmio»), read back as Latin-1 («combinação», «polinómio»). Other text is unchanged.
   */
  repairedCodePage(text: string): string {
    if (!/\p{Ll}[ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÛ„]/u.test(text)) return text;
    return Array.from(text)
      .map((character) => {
        const byte = isASCII(character) ? undefined : macRomanByte.get(character);
        return byte === undefined ? character : String.fromCharCode(byte);
      })
      .join("");
  },
};

function respelled(prose: string, source: string[], folded: string[]): string {
  return prose.replace(/\p{L}{4,}/gu, (word) => {
    if (!Array.from(word).some((character) => !isASCII(character))) return word;
    return printedSpelling(word, source, folded) ?? word;
  });
}

/** How the page spells `word` with other accents (same letters, same case), when it never spells it as `word`. */
function printedSpelling(word: string, source: string[], folded: string[]): string | null {
  const letters = Array.from(word);
  const target = letters.map(fold);
  if (target.length > folded.length) return null;
  let found: string | null = null;
  for (let start = 0; start + target.length <= folded.length; start += 1) {
    if (!target.every((character, offset) => folded[start + offset] === character)) continue;
    const candidate = source.slice(start, start + target.length);
    if (candidate.every((character, offset) => character === letters[offset])) return null;
    if (
      found !== null ||
      !candidate.some((character) => !isASCII(character)) ||
      !candidate.every((character, offset) => isUppercase(character) === isUppercase(letters[offset]!))
    )
      continue;
    found = candidate.join("");
  }
  return found;
}

/** Its prose spelled as the page prints it (`PrintedSpelling`); formulas, figures and captions unchanged. */
export function keepingSpelling(transcription: QuestionTranscription, printed: string): QuestionTranscription {
  if (!printed) return transcription;
  return {
    ...transcription,
    blocks: transcription.blocks.map((block) =>
      block.type !== "text" || block.text === null || block.text === undefined
        ? block
        : { ...block, text: PrintedSpelling.keeping(block.text, printed) },
    ),
  };
}
