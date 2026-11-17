// Port of SelectionSource and SelectionAsk (cleaning, capping, what is sent) in
// LearnLayer/Problems/SelectionAsk.swift @ ref 2026-11-04: a selection the student asked about, cleaned and capped.

/** Where the student selected the text they ask about. */
export type SelectionSource = "question" | "statement" | "explanation";

const characters = (text: string) => Array.from(text);
// Built from code points, so the source holds no invisible characters: soft hyphen, zero-width space, non-joiner,
// joiner, byte-order mark; the no-break space; the line and paragraph separators.
const set = (...codes: number[]) => String.fromCodePoint(...codes);
const invisible = new RegExp(`[${set(0xad, 0x200b, 0x200c, 0x200d, 0xfeff)}]`, "gu");
const blanks = new RegExp(`[ \\t${set(0xa0)}]+`, "gu");
const lineBreaks = new RegExp(`[\\n\\r${set(0x2028, 0x2029)}]`, "u");

export class SelectionAsk {
  /** Longer selections are cut, so one drag over a page doesn't become a huge prompt. */
  static readonly maximumCharacters = 800;
  /** What the heading over the answer quotes. */
  static readonly previewCharacters = 80;

  private constructor(
    readonly source: SelectionSource,
    /** The selection as sent: cleaned, capped. */
    readonly text: string,
    /** The selection was longer than `maximumCharacters` and was cut. */
    readonly isShortened: boolean,
  ) {}

  /** Null when nothing worth asking about is selected (blank, or only punctuation). */
  static make(raw: string, source: SelectionSource): SelectionAsk | null {
    const cleaned = SelectionAsk.cleaned(raw);
    if (!SelectionAsk.isMeaningful(cleaned)) return null;
    const capped = SelectionAsk.capped(cleaned, SelectionAsk.maximumCharacters);
    return new SelectionAsk(source, capped.text, capped.shortened);
  }

  /** Invisible characters out, words hyphenated across a line joined, spaces collapsed, blank lines dropped. Line
   * breaks between lines are kept. */
  static cleaned(raw: string): string {
    let text = raw.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n");
    text = text.replace(invisible, "");
    // "deriva-\nda" → "derivada"; a minus before a new line of maths stays.
    text = text.replace(/(\p{Ll})-[ \t]*\n[ \t]*(\p{Ll})/gu, "$1$2");
    return text
      .split("\n")
      .map((line) => line.replace(blanks, " ").trim())
      .filter((line) => line !== "")
      .join("\n");
  }

  /** At least one letter, digit or symbol: "x" or "∫" is worth asking about, "." is not. */
  static isMeaningful(text: string): boolean {
    return /[\p{L}\p{Nd}\p{S}]/u.test(text);
  }

  /** Cut to `limit` characters, at a space when one is near the end, with "…". */
  static capped(text: string, limit: number): { text: string; shortened: boolean } {
    const all = characters(text);
    if (limit <= 0 || all.length <= limit) return { text, shortened: false };
    const hard = all.slice(0, limit);
    // Back to the last space within the final quarter, so a word isn't cut in half.
    const floor = Math.floor((limit * 3) / 4);
    let space = -1;
    for (let index = hard.length - 1; index >= floor; index -= 1)
      if (/\s/u.test(hard[index]!)) {
        space = index;
        break;
      }
    const cut = space >= 0 ? hard.slice(0, space) : hard;
    return { text: cut.join("").trim() + "…", shortened: true };
  }

  /** The selection on one line, for a question that quotes it. */
  get oneLine(): string {
    return this.text
      .split(lineBreaks)
      .filter((line) => line !== "")
      .join(" ");
  }

  /** What the heading over the answer quotes. */
  get preview(): string {
    return SelectionAsk.capped(this.oneLine, SelectionAsk.previewCharacters).text;
  }

  /** The student's question, in the prompt's words, on one line. */
  get studentQuestion(): string {
    return `What does this selected text from the ${this.source} mean here, and why does it matter for this part: "${this.oneLine}"?`;
  }

  /** What a voice turn says it heard. The tutor always speaks pt-PT. */
  get voiceTranscript(): string {
    return `Explica-me só esta parte que selecionei: «${this.oneLine}»`;
  }
}
