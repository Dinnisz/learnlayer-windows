// Port of LearnLayer/Reader/TextNormalizer.swift @ ref 2026-11-04

/**
 * Repairs text read from LaTeX PDFs, whose text layer often stores accents
 * as separate characters before the letter ("Dura¸c˜ao", "el´ectrica",
 * "´\nE"), so the model and the student see "Duração", "eléctrica", "É".
 */

/** Spacing accents and the combining marks they stand for. */
const accents: Readonly<Record<string, string>> = {
  "´": "\u0301",
  "`": "\u0300",
  "˜": "\u0303",
  ˆ: "\u0302",
  "¸": "\u0327",
  "¨": "\u0308",
  "˚": "\u030A",
  ˇ: "\u030C",
};

/**
 * Accented letters that occur in Portuguese (and common European
 * languages). A dangling accent that would make anything else (Ś, Ć, P\u0303)
 * belongs to another letter we can't locate, so it is dropped instead.
 */
const validAccented = new Set(Array.from("áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ"));

const isWhitespace = (character: string | undefined) => character !== undefined && /\s/u.test(character);
const isLetter = (character: string | undefined) => character !== undefined && /\p{L}/u.test(character);

/**
 * Word and Equation-editor PDFs use "mathematical italic" letters
 * (𝑅𝑎𝑏, 𝑓(𝐴, 𝐵)); read them as plain letters. Only that Unicode block is
 * changed, so x², ½ and subscripts stay as they are.
 */
export function mathLettersToPlain(text: string): string {
  let output = "";
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (code >= 0x1d400 && code <= 0x1d7ff) {
      const plain = character.normalize("NFKC");
      output += plain === "" ? character : String.fromCodePoint(plain.codePointAt(0)!);
    } else {
      output += character;
    }
  }
  return output;
}

/** T1 (Cork) codes 0x15–0x17 and 0x1B–0x1F, and the Unicode ligature block, by code point. */
const ligatures: ReadonlyMap<number, string> = new Map([
  [0x15, "–"],
  [0x16, "—"],
  [0x17, ""],
  [0x1b, "ff"],
  [0x1c, "fi"],
  [0x1d, "fl"],
  [0x1e, "ffi"],
  [0x1f, "ffl"],
  [0xfb00, "ff"],
  [0xfb01, "fi"],
  [0xfb02, "fl"],
  [0xfb03, "ffi"],
  [0xfb04, "ffl"],
]);

/**
 * pdfTeX papers set in T1-encoded Type 3 fonts with no ToUnicode map store a ligature as its font code,
 * a control character: «Justi\u{1C}que» is «Justifique», «um \u{1C}o» is «um fio». Those codes (and the
 * Unicode ligatures \uFB01, \uFB02…) are spelled out; the dashes of the same fonts become dashes.
 */
export function withLigaturesSpelled(text: string): string {
  const spelled = (character: string) => ligatures.get(character.codePointAt(0)!);
  if (!Array.from(text).some((character) => spelled(character) !== undefined)) return text;
  return Array.from(text, (character) => spelled(character) ?? character).join("");
}

const folded = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Circuit figures set in the Symbol font write Ω with the "W" key, so the PDF reader reads
 * "1 kΩ" as "1 kW". In a statement about resistances (and not about power), a value
 * followed by W, kW or MW is read back as ohms.
 */
export function symbolFontOhms(text: string): string {
  const plain = folded(text);
  const aboutResistance = ["resist", "ω", "ohm", "terminais", "terminals", "thevenin", "norton"].some((word) =>
    plain.includes(word),
  );
  const aboutPower = [
    "potencia",
    "power",
    "watt",
    "energia",
    "energy",
    "consumo",
    "lampada de",
    "kwh",
    "dissip",
    "aquec",
    "heat",
    "calor",
    "rendimento",
    "efficien",
  ].some((word) => plain.includes(word));
  if (!aboutResistance || aboutPower) return text;
  return text.replace(/(\d)(\s*)([kKmM]?)W\b/g, "$1$2$3Ω");
}

/**
 * Zero-width spaces and joiners, Word's invisible maths operators (function application, invisible times),
 * the byte-order mark. The soft hyphen goes after broken lines are joined.
 */
const invisible = new Set([0x200b, 0x200c, 0x200d, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0xfeff]);

/** The Symbol font's codes, at U+F000 + code, and what they show. */
const symbolCodes: ReadonlyMap<number, number> = new Map([
  [0xf061, 0x3b1],
  [0xf062, 0x3b2],
  [0xf067, 0x3b3],
  [0xf064, 0x3b4],
  [0xf065, 0x3b5],
  [0xf06c, 0x3bb],
  [0xf06d, 0x3bc],
  [0xf070, 0x3c0],
  [0xf071, 0x3b8],
  [0xf072, 0x3c1],
  [0xf073, 0x3c3],
  [0xf074, 0x3c4],
  [0xf066, 0x3c6],
  [0xf077, 0x3c9],
  [0xf057, 0x3a9],
  [0xf044, 0x394],
  [0xf046, 0x3a6],
  [0xf053, 0x3a3],
  [0xf0b0, 0xb0],
  [0xf0b1, 0xb1],
  [0xf0b4, 0xd7],
  [0xf0a3, 0x2264],
  [0xf0b3, 0x2265],
  [0xf0b9, 0x2260],
  [0xf0bb, 0x2248],
  [0xf0a5, 0x221e],
  [0xf0d6, 0x221a],
  [0xf0b6, 0x2202],
  [0xf0ae, 0x2192],
  [0xf02d, 0x2212],
]);

/**
 * Word papers that set Greek letters and signs in the Symbol font store them as its Private Use codes
 * (U+F06D is µ, U+F02C a comma): each is spelled as what the Symbol font shows there. Soft hyphens,
 * zero-width spaces and byte-order marks carry nothing and go.
 */
export function withSymbolCodesSpelled(text: string): string {
  const codes = Array.from(text, (character) => character.codePointAt(0)!);
  if (!codes.some((code) => (code >= 0xf020 && code <= 0xf0ff) || invisible.has(code))) return text;
  let output = "";
  for (const code of codes) {
    if (invisible.has(code)) continue;
    if (code >= 0xf020 && code <= 0xf0ff) {
      const symbol = symbolCodes.get(code);
      if (symbol !== undefined) {
        output += String.fromCodePoint(symbol);
        continue;
      }
      if (code <= 0xf07e) {
        output += String.fromCodePoint(code - 0xf000);
        continue;
      }
    }
    output += String.fromCodePoint(code);
  }
  return output;
}

/**
 * Characters a text can't stand for on its own (checked on normalized text): control codes other than line
 * breaks and tabs, Private Use and unassigned codes, invisible format characters, the replacement character,
 * and combining marks. Portuguese accents are precomposed by `normalize`, so a mark left over (an overline
 * U+0305, a vector arrow U+20D7, a hat U+0302 on a maths letter) is maths that plain text can't carry.
 */
export function unsafeCharacters(text: string): string[] {
  return Array.from(text).filter((character) => {
    if (character === "�") return true;
    if (/\p{Cc}/u.test(character)) return !["\n", "\r", "\t"].includes(character);
    return /[\p{Co}\p{Cf}\p{Cs}\p{Cn}\p{M}]/u.test(character);
  });
}

/** The long solidus (U+0338) LaTeX sets over a sign to negate it. */
const solidus = String.fromCharCode(0x0338);

/** The signs a long solidus is set over to negate them: ≠ ≮ ≯ ≰ ≱ ∉ ∌ ⊄ ⊅ ⊈ ⊉ ≢ ∄ ≁ ≄ ≇ ≉ ∤ ∦ … */
const negatable = new Set(
  [
    0x3d, 0x3c, 0x3e, 0x2264, 0x2265, 0x2208, 0x220b, 0x2282, 0x2283, 0x2286, 0x2287, 0x2261, 0x2203, 0x223c, 0x2243,
    0x2245, 0x2248, 0x2223, 0x2225, 0x227a, 0x227b, 0x2272, 0x2273, 0x2276, 0x2277, 0x2291, 0x2292, 0x22a2, 0x22b2,
    0x22b3, 0x22b4, 0x22b5,
  ].map((code) => String.fromCodePoint(code)),
);

/** The sign with the solidus over it as one character, when Unicode has one. */
function negated(sign: string): string | null {
  const composed = (sign + solidus).normalize("NFC");
  return Array.from(composed).length === 1 ? composed : null;
}

/**
 * LaTeX PDFs set ≠, ∉, ⊄ … as a long solidus over the sign, and the text layer keeps the two apart, the slash often
 * before the sign («(t\u0338= 0)» for «(t ≠ 0)»): read as the one symbol, so the model sees «≠» and a check that counts
 * relations does not take it for a second «=» (`TextNormalizer.negatedRelations` @ 5701363).
 */
export function negatedRelations(text: string): string {
  if (!text.includes(solidus)) return text;
  const scalars = Array.from(text);
  let out = "";
  let index = 0;
  while (index < scalars.length) {
    const scalar = scalars[index]!;
    // The slash before its sign, perhaps a space apart: «\u0338=», «\u0338 =».
    if (scalar === solidus) {
      let next = index + 1;
      while (next < scalars.length && scalars[next] === " ") next += 1;
      const sign = next < scalars.length && negatable.has(scalars[next]!) ? negated(scalars[next]!) : null;
      if (sign !== null) {
        out += sign;
        index = next + 1;
        continue;
      }
    }
    // The sign, then its slash.
    if (negatable.has(scalar) && scalars[index + 1] === solidus) {
      const sign = negated(scalar);
      if (sign !== null) {
        out += sign;
        index += 2;
        continue;
      }
    }
    out += scalar;
    index += 1;
  }
  return out;
}

export function normalizeText(text: string): string {
  const characters = Array.from(
    mathLettersToPlain(withLigaturesSpelled(withSymbolCodesSpelled(negatedRelations(text)))),
  );
  let result = "";
  let index = 0;
  while (index < characters.length) {
    const character = characters[index]!;
    const mark = accents[character];
    if (mark !== undefined) {
      // The accented letter is next, sometimes after a line break.
      let next = index + 1;
      while (next < characters.length && isWhitespace(characters[next]) && next - index <= 2) next += 1;
      if (next < characters.length && isLetter(characters[next])) {
        let letter = characters[next]!;
        if (letter === "ı") letter = "i"; // dotless i under an accent
        const combined = (letter + mark).normalize("NFC");
        if (Array.from(combined).length !== 1 || !validAccented.has(combined)) {
          // Not a real accented letter here: drop the stray accent.
          index += 1;
          continue;
        }
        // Drop a line break that only separated the accent from its letter.
        const last = result[result.length - 1];
        if (next > index + 1 && result !== "" && !isWhitespace(last)) result += "\n";
        result += combined;
        index = next + 1;
        continue;
      }
      // An accent left over with no letter to sit on carries nothing: drop it.
      index += 1;
      continue;
    }
    result += character === "ı" ? "i" : character;
    index += 1;
  }
  return symbolFontOhms(joiningBrokenLines(result))
    .replaceAll("ϵ", "ε")
    .replaceAll("�", "")
    .replaceAll("\u00AD", "")
    .normalize("NFC");
}

/**
 * Lines that a typesetter broke inside a word or before a full stop: "automó-\nvel" is
 * "automóvel", and the "." that a superscript pushed onto a line of its own ("m/s2\n.")
 * goes back to the line it ends. A hyphen is only taken out between two lowercase
 * words' letters (two on each side), so "x -\ny" and a list dash stay.
 */
export function joiningBrokenLines(text: string): string {
  if (!text.includes("\n")) return text;
  return text
    .replace(/(?<=\p{Ll}{2})[-\u00AD‐‑][ \t]*\r?\n[ \t]*(?=\p{Ll}{2})/gu, "")
    .replace(/[ \t]*\r?\n[ \t]*(?=[.,;:!?]+(?:[ \t]|\r?\n|$))/gu, "");
}
