// Port of LearnLayer/Lesson/MascotLesson.swift @ ref 2026-11-04.
//
// What the mascot says and shows when the student taps «Explica-me»: a short script of beats. The model picks from a
// closed set of verbs and targets the app can find on the question; the app plays the script and draws everything
// (CLAUDE.md: the model never writes animation code). The guards here decide what the app is willing to play.

export interface LessonBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GraphPoint {
  x: number;
  y: number;
}

/** One thing drawn on the question while its beat is said. */
export interface LessonShow {
  /** zoom, highlight, underline, circle, crossOut, point, arrow, pitfall. */
  op: string;
  /** Where: an option letter, words copied from the question, a printed figure label, or a box on the picture. */
  option?: string | null;
  quote?: string | null;
  label?: string | null;
  box?: LessonBox | null;
  /** A label of a few words next to the mark. */
  note?: string | null;
  /** A line of the written solution on screen, by its number (from 1). */
  step?: number | null;
  /** "statement", "graph" or "figure3d". */
  on?: string | null;
  point?: GraphPoint | null;
  /** With op "pitfall": the wrong move students make at `step`, and why it is wrong. */
  mistake?: string | null;
  why?: string | null;
  assemble?: number | null;
  yaw?: number | null;
}

export interface LessonCalc {
  /** "6 ÷ 2 = 3 A": numbers the app can check. */
  line: string;
  /** Words copied from the question whose chip flies into the card. */
  fly?: string | null;
}

export interface LessonCheck {
  ask: string;
  options: string[];
  /** 0 or 1. */
  correct: number;
  right: string;
  wrong: string;
}

/** One spoken unit (one or two short sentences) and what is shown while it is said. */
export interface LessonBeat {
  /** "explain", "wrong", "check" or "play". */
  kind: string;
  say: string;
  show: LessonShow[];
  calc?: LessonCalc | null;
  check?: LessonCheck | null;
}

export interface LessonSummary {
  say: string;
  key?: string | null;
}

export interface MascotLesson {
  beats: LessonBeat[];
  summary: LessonSummary | null;
  /** What the model chose to teach and the mistake it builds on: not spoken, kept for the log. */
  angle?: string | null;
  mistake?: string | null;
}

/** A common mistake, tagged «Watch out» on the step of the written solution where students make it. */
export interface LessonPitfall {
  /** The line of the written solution, from 0. */
  step: number;
  mistake: string;
  why: string;
}

export const showOperations = new Set([
  "zoom",
  "highlight",
  "underline",
  "circle",
  "crossOut",
  "point",
  "arrow",
  "pitfall",
]);

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// MARK: Decoding (tolerant: a missing or odd field is its default, as Swift's `try?` decodes it)

const asString = (value: unknown) => (typeof value === "string" ? value : null);
const asNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const asRecord = (value: unknown) =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

function decodeShow(value: unknown): LessonShow | null {
  const record = asRecord(value);
  const op = asString(record?.["op"]);
  if (!record || op === null) return null;
  const boxRecord = asRecord(record["box"]);
  const box =
    boxRecord &&
    [boxRecord["x"], boxRecord["y"], boxRecord["w"], boxRecord["h"]].every((item) => asNumber(item) !== null)
      ? {
          x: boxRecord["x"] as number,
          y: boxRecord["y"] as number,
          w: boxRecord["w"] as number,
          h: boxRecord["h"] as number,
        }
      : null;
  const pointRecord = asRecord(record["point"]);
  const point =
    pointRecord && asNumber(pointRecord["x"]) !== null && asNumber(pointRecord["y"]) !== null
      ? { x: pointRecord["x"] as number, y: pointRecord["y"] as number }
      : null;
  const step = asNumber(record["step"]);
  return {
    op,
    option: asString(record["option"]),
    quote: asString(record["quote"]),
    label: asString(record["label"]),
    box,
    note: asString(record["note"]),
    step: step === null ? null : Math.trunc(step),
    on: asString(record["on"]),
    point,
    mistake: asString(record["mistake"]),
    why: asString(record["why"]),
    assemble: asNumber(record["assemble"]),
    yaw: asNumber(record["yaw"]),
  };
}

function decodeCalc(value: unknown): LessonCalc | null {
  const record = asRecord(value);
  const line = asString(record?.["line"]);
  return line === null ? null : { line, fly: asString(record?.["fly"]) };
}

function decodeCheck(value: unknown): LessonCheck | null {
  const record = asRecord(value);
  if (!record) return null;
  const ask = asString(record["ask"]);
  const options = Array.isArray(record["options"]) && record["options"].every((item) => typeof item === "string");
  const correct = asNumber(record["correct"]);
  const right = asString(record["right"]);
  const wrong = asString(record["wrong"]);
  if (ask === null || !options || correct === null || right === null || wrong === null) return null;
  return { ask, options: record["options"] as string[], correct: Math.trunc(correct), right, wrong };
}

export function decodeBeat(value: unknown): LessonBeat | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    kind: asString(record["kind"]) ?? "explain",
    say: asString(record["say"]) ?? "",
    show: Array.isArray(record["show"]) ? record["show"].map(decodeShow).filter((show) => show !== null) : [],
    calc: decodeCalc(record["calc"]),
    check: decodeCheck(record["check"]),
  };
}

export class LessonFailure extends Error {}

export const MascotLessons = {
  maximumBeats: 7,
  maximumShowsPerBeat: 3,
  /** A lesson shorter than this has no check. */
  minimumBeatsForCheck: 5,
  /** Fewer beats than this is a hollow reply; the provider asks again once. */
  minimumBeats: 3,
  maximumQuoteWords: 6,
  /** A beat of more than this many words is said in two. */
  longBeatWords: 30,

  decode(content: string): MascotLesson {
    const text = content.trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new LessonFailure("unreadable");
    let object: Record<string, unknown> | null;
    try {
      object = asRecord(JSON.parse(text.slice(start, end + 1)));
    } catch {
      throw new LessonFailure("unreadable");
    }
    if (!object) throw new LessonFailure("unreadable");
    const beats = (Array.isArray(object["beats"]) ? object["beats"].map(decodeBeat) : [])
      .filter((beat): beat is LessonBeat => beat !== null)
      .filter((beat) => beat.say.trim() !== "");
    if (beats.length === 0) throw new LessonFailure("empty");
    const summaryRecord = asRecord(object["summary"]);
    const summarySay = asString(summaryRecord?.["say"]);
    return {
      beats,
      summary: summarySay === null ? null : { say: summarySay, key: asString(summaryRecord?.["key"]) },
      angle: asString(object["angle"]),
      mistake: asString(object["mistake"]),
    };
  },

  /** The script the app is willing to play. Unknown verbs go, so do arithmetic lines that are wrong, a check that is
   * not a clean two-way question and beats that only say again what the written solution says. */
  sanitized(
    lesson: MascotLesson,
    options: { solutionTexts?: readonly string[]; withholding?: string | null; hasOptions?: boolean } = {},
  ): MascotLesson {
    const solutionTexts = options.solutionTexts ?? [];
    const counters = { checks: 0, pitfalls: 0 };
    let kept: LessonBeat[] = [];
    for (const beat of lesson.beats.slice(0, MascotLessons.maximumBeats + 3).flatMap(MascotLessons.splittingLong)) {
      const cleaned = MascotLessons.cleaned(beat, options.withholding ?? null, options.hasOptions ?? true, counters);
      if (cleaned) kept.push(cleaned);
    }
    // A beat that repeats the solution is dropped, but never so many that the lesson is hollow.
    if (solutionTexts.length > 0) {
      const fresh = kept.filter((beat) => !MascotLessons.repeats(beat, solutionTexts));
      if (fresh.length >= Math.min(3, kept.length)) kept = fresh;
    }
    kept = kept.slice(0, MascotLessons.maximumBeats);
    // A check is only worth it after a few beats.
    if (kept.length < MascotLessons.minimumBeatsForCheck)
      kept = kept.map((beat) => (beat.check ? MascotLessons.withoutCheck(beat) : beat));
    return MascotLessons.finished(lesson, kept);
  },

  /** This lesson's closing and notes around `beats`, the closing sentence cleaned. */
  finished(lesson: MascotLesson, beats: LessonBeat[]): MascotLesson {
    let summary = lesson.summary ? { ...lesson.summary } : null;
    if (summary) {
      summary.say = summary.say.trim();
      if (summary.say === "") summary = null;
      else if (summary.key && !fold(summary.say).includes(fold(summary.key))) summary.key = null;
    }
    return { beats, summary, angle: lesson.angle ?? null, mistake: lesson.mistake ?? null };
  },

  /** The guards that need only the beat itself; null when nothing in it can be played. `counters` counts the checks
   * and «Watch out» tags kept so far: only the first usable one of each stays. */
  cleaned(
    input: LessonBeat,
    correctOption: string | null,
    hasOptions: boolean,
    counters: { checks: number; pitfalls: number },
  ): LessonBeat | null {
    const beat: LessonBeat = { ...input, show: input.show.map((show) => ({ ...show })) };
    beat.say = MascotLessons.spokenWithoutLatex(beat.say).trim();
    if (beat.say === "") return null;
    // A question without options has none to talk about: a beat that does is the model making them up.
    if (!hasOptions && MascotLessons.speaksOfOptions(beat.say)) return null;
    // A quote longer than six words is cut to its first six (still verbatim).
    for (const show of beat.show) {
      if (!show.quote) continue;
      const words = show.quote.split(" ").filter((word) => word !== "");
      if (words.length > MascotLessons.maximumQuoteWords)
        show.quote = words.slice(0, MascotLessons.maximumQuoteWords).join(" ");
    }
    // The right option is the student's to find: nothing in the lesson enlarges or marks it.
    beat.show = beat.show
      .filter(
        (show) =>
          showOperations.has(show.op) &&
          LessonShows.hasTarget(show) &&
          !(show.quote ?? "").includes("\\") &&
          (correctOption === null || show.option?.toUpperCase() !== correctOption),
      )
      .slice(0, MascotLessons.maximumShowsPerBeat);
    // A «Watch out» tag needs its step, the mistake and the reason, and a lesson has one at most.
    beat.show = beat.show.flatMap((show) => {
      if (show.op !== "pitfall") return [show];
      const pitfall = LessonShows.pitfall(show);
      if (!pitfall || counters.pitfalls > 0) return [];
      counters.pitfalls += 1;
      return [{ ...show, mistake: pitfall.mistake, why: pitfall.why }];
    });
    if (beat.calc && (!CalcCheck.isSound(beat.calc.line) || MascotLessons.hasInventedWords(beat.calc.line)))
      beat.calc = null;
    if (beat.check) {
      const check = beat.check;
      const usable =
        check.options.length === 2 &&
        (check.correct === 0 || check.correct === 1) &&
        check.ask !== "" &&
        check.right !== "" &&
        check.wrong !== "";
      if (usable && counters.checks === 0) counters.checks += 1;
      else beat.check = null;
    }
    if (!beat.check && beat.kind === "check") beat.kind = "explain";
    return beat;
  },

  /** The beat only says again what the written solution says (one that points at a solution line is about it). */
  repeats(beat: LessonBeat, solutionTexts: readonly string[]): boolean {
    return (
      solutionTexts.length > 0 &&
      !beat.show.some((show) => show.step != null) &&
      RepeatGuard.overlap(beat.say, solutionTexts) >= RepeatGuard.limit
    );
  },

  withoutCheck(beat: LessonBeat): LessonBeat {
    return { ...beat, check: null, kind: beat.kind === "check" ? "explain" : beat.kind };
  },

  /** The voice must never read a backslash: "A\bar{B}" is said "A B negado", any other command is dropped. */
  spokenWithoutLatex(text: string): string {
    if (!text.includes("\\")) return text;
    let spoken = text.replace(/\\(?:bar|overline|neg)\{([^}]*)\}/gu, " $1 negado ");
    spoken = spoken.replace(/\\[A-Za-z]+/gu, " ");
    spoken = spoken.replaceAll("{", "").replaceAll("}", "");
    return spoken.replace(/\s{2,}/gu, " ").replace(/\s+([,.;:?!])/gu, "$1");
  },

  speaksOfOptions(text: string): boolean {
    // Folded, "opção" is "opcao" and "opções" is "opcoes" (the Mac's match ignores the accents).
    return /\bopc[ao][oe]s?\b|\boptions?\b/u.test(fold(text));
  },

  /** A calculation line is numbers and short units; a long word is the model inventing a unit. */
  hasInventedWords(line: string): boolean {
    return line.split(/[^\p{L}]+/u).some((word) => Array.from(word).length > 4);
  },

  /** A beat of more than `longBeatWords` words is said in two: its marks, then the rest. The calculation and the
   * check stay with the last part. */
  splittingLong(beat: LessonBeat): LessonBeat[] {
    const words = beat.say.split(/\s+/u).filter((word) => word !== "").length;
    if (words <= MascotLessons.longBeatWords) return [beat];
    const sentences = sentencesOf(beat.say);
    if (sentences.length < 2) return [beat];
    let count = 0;
    let cut = sentences.length - 1;
    for (let index = 0; index < sentences.length; index += 1) {
      count += sentences[index]!.split(/\s+/u).filter((word) => word !== "").length;
      if (count * 2 >= words) {
        cut = Math.min(index + 1, sentences.length - 1);
        break;
      }
    }
    const first = sentences.slice(0, cut).join(" ");
    const rest = sentences.slice(cut).join(" ");
    if (first === "" || rest === "") return [beat];
    return [
      { kind: beat.kind === "check" ? "explain" : beat.kind, say: first, show: beat.show, calc: null, check: null },
      { kind: beat.kind, say: rest, show: [], calc: beat.calc ?? null, check: beat.check ?? null },
    ];
  },

  /** Everything said aloud, in order: the beats, then the closing sentence. */
  spokenUnits(lesson: MascotLesson): string[] {
    return [...lesson.beats.map((beat) => beat.say), ...(lesson.summary ? [lesson.summary.say] : [])];
  },
};

function sentencesOf(text: string): string[] {
  const segmenter = new Intl.Segmenter("pt", { granularity: "sentence" });
  return [...segmenter.segment(text)].map((piece) => piece.segment.trim()).filter((piece) => piece !== "");
}

export const LessonShows = {
  hasTarget(show: LessonShow): boolean {
    if (LessonShows.isOnFigure3D(show)) return true;
    if ((show.option ?? "").trim() !== "") return true;
    if ((show.quote ?? "").trim() !== "") return true;
    if ((show.label ?? "").trim() !== "") return true;
    return show.box != null || (show.step ?? 0) > 0 || LessonShows.isOnGraph(show);
  },
  isOnFigure3D: (show: LessonShow) => show.on === "figure3d",
  isOnStatement: (show: LessonShow) => show.on === "statement" && show.box != null,
  isOnGraph(show: LessonShow): boolean {
    return show.on === "graph" && show.point != null && Number.isFinite(show.point.x) && Number.isFinite(show.point.y);
  },
  /** A «Watch out» tag: the step (from 0) it hangs on, the mistake and why, cleaned; null when one is missing. */
  pitfall(show: LessonShow): LessonPitfall | null {
    if (show.op !== "pitfall" || show.step == null || show.step <= 0) return null;
    const mistake = MascotLessons.spokenWithoutLatex(show.mistake ?? "").trim();
    const why = MascotLessons.spokenWithoutLatex(show.why ?? "").trim();
    if (mistake === "" || why === "") return null;
    return { step: show.step - 1, mistake, why };
  },
  isStepOnly(show: LessonShow): boolean {
    return (
      (show.step ?? 0) > 0 &&
      show.option == null &&
      (show.quote ?? "") === "" &&
      (show.label ?? "") === "" &&
      show.box == null &&
      !LessonShows.isOnGraph(show)
    );
  },
};

/**
 * `sanitized`, for a lesson still arriving: each beat is let through as soon as the guards can tell it would be in
 * the whole lesson, so the first one is played while the rest is written. A beat whose fate depends on the beats
 * after it waits, and the beats after it wait behind it.
 */
export class LessonStream {
  private taken = 0;
  private readonly counters = { checks: 0, pitfalls: 0 };
  private fresh = 0;
  private emitted = 0;
  private waiting: LessonBeat[] = [];

  constructor(
    private readonly solutionTexts: readonly string[] = [],
    private readonly correctOption: string | null = null,
    private readonly hasOptions = true,
  ) {}

  /** One more beat from the reply, as the model wrote it; returns the beats now ready to play. */
  add(raw: LessonBeat): LessonBeat[] {
    if (this.taken >= MascotLessons.maximumBeats + 3) return [];
    this.taken += 1;
    for (const piece of MascotLessons.splittingLong(raw)) {
      const beat = MascotLessons.cleaned(piece, this.correctOption, this.hasOptions, this.counters);
      if (!beat) continue;
      if (!MascotLessons.repeats(beat, this.solutionTexts)) this.fresh += 1;
      this.waiting.push(beat);
    }
    return this.drain(false);
  }

  /** The reply is over: every beat still waiting is decided. */
  finish(): LessonBeat[] {
    return this.drain(true);
  }

  private drain(ended: boolean): LessonBeat[] {
    const ready: LessonBeat[] = [];
    while (this.waiting.length > 0) {
      let beat = this.waiting[0]!;
      if (this.emitted >= MascotLessons.maximumBeats) {
        this.waiting = [];
        break;
      }
      if (MascotLessons.repeats(beat, this.solutionTexts)) {
        // Three fresh beats make a lesson: from then on a repeat is dropped. Fewer, and only the end can tell.
        if (this.fresh >= 3) {
          this.waiting.shift();
          continue;
        }
        if (!ended) break;
      }
      if (beat.check) {
        const kept = this.waiting.filter(
          (item) => !MascotLessons.repeats(item, this.solutionTexts) || (ended && this.fresh < 3),
        ).length;
        if (Math.min(MascotLessons.maximumBeats, this.emitted + kept) < MascotLessons.minimumBeatsForCheck) {
          if (!ended) break;
          beat = MascotLessons.withoutCheck(beat);
        }
      }
      this.waiting.shift();
      ready.push(beat);
      this.emitted += 1;
    }
    return ready;
  }
}

/** How much of a spoken line is only the written solution said again. */
export const RepeatGuard = {
  /** Share of a line's content words found in one solution text, from which it counts as a repeat. */
  limit: 0.7,
  filler: new Set([
    "the",
    "a",
    "an",
    "of",
    "to",
    "is",
    "and",
    "in",
    "it",
    "we",
    "that",
    "this",
    "so",
    "o",
    "os",
    "as",
    "de",
    "da",
    "do",
    "e",
    "que",
    "um",
    "uma",
    "em",
    "no",
    "na",
    "se",
    "por",
    "para",
    "com",
    "é",
    "são",
    "ao",
    "dos",
    "das",
    "nos",
    "nas",
  ]),

  words(text: string): string[] {
    return fold(text)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => Array.from(word).length > 1 && !RepeatGuard.filler.has(word));
  },

  /** The largest share (0…1) of `line`'s content words that one of `texts` also holds. */
  overlap(line: string, texts: readonly string[]): number {
    const mine = new Set(RepeatGuard.words(line));
    if (mine.size < 4) return 0;
    let best = 0;
    for (const text of texts) {
      const theirs = new Set(RepeatGuard.words(text));
      if (theirs.size === 0) continue;
      const shared = [...mine].filter((word) => theirs.has(word)).length;
      best = Math.max(best, shared / mine.size);
    }
    return best;
  },
};

/** "6 ÷ 2 = 3 A": a line of plain arithmetic is evaluated; if it does not add up it is not shown. A line with letters
 * on the left of "=" ("v = 6 ÷ 2") is read on its right-hand side only. */
export const CalcCheck = {
  isSound(line: string): boolean {
    const parts = line.split("=");
    if (parts.length < 2) return true;
    const values = parts.map(CalcCheck.evaluate).filter((value): value is number => value !== null);
    if (values.length < 2) return true;
    const first = values[0]!;
    return values.slice(1).every((value) => Math.abs(value - first) <= Math.max(1e-6, Math.abs(first) * 0.005));
  },

  /** The number a piece of text is worth, when all it holds is numbers, brackets and + − × ÷ ·, with an optional
   * trailing unit; null when it is not plain arithmetic. */
  evaluate(text: string): number | null {
    let cleaned = text
      .trim()
      .replaceAll("×", "*")
      .replaceAll("·", "*")
      .replaceAll("÷", "/")
      .replaceAll("−", "-")
      .replaceAll("–", "-")
      .replaceAll(",", ".");
    const unit = /^(.*[\d)])\s*[A-Za-zΩµμ°%/²³\s]*$/su.exec(cleaned);
    if (unit) cleaned = unit[1]!;
    if (cleaned === "" || ![...cleaned].every((character) => "0123456789.+-*/() ".includes(character))) return null;
    if (!/\d/u.test(cleaned)) return null;
    const characters = [...cleaned.replaceAll(" ", "")];
    let index = 0;
    const factor = (): number | null => {
      if (index >= characters.length) return null;
      if (characters[index] === "-") {
        index += 1;
        const value = factor();
        return value === null ? null : -value;
      }
      if (characters[index] === "(") {
        index += 1;
        const value = expression();
        if (value === null || characters[index] !== ")") return null;
        index += 1;
        return value;
      }
      const start = index;
      while (index < characters.length && /[\d.]/u.test(characters[index]!)) index += 1;
      if (index === start) return null;
      const value = Number(characters.slice(start, index).join(""));
      return Number.isNaN(value) ? null : value;
    };
    const term = (): number | null => {
      let value = factor();
      if (value === null) return null;
      while (characters[index] === "*" || characters[index] === "/") {
        const op = characters[index];
        index += 1;
        const next = factor();
        if (next === null) return null;
        if (op === "/") {
          if (next === 0) return null;
          value /= next;
        } else {
          value *= next;
        }
      }
      return value;
    };
    const expression = (): number | null => {
      let value = term();
      if (value === null) return null;
      while (characters[index] === "+" || characters[index] === "-") {
        const op = characters[index];
        index += 1;
        const next = term();
        if (next === null) return null;
        value = op === "+" ? value + next : value - next;
      }
      return value;
    };
    const value = expression();
    return value !== null && index >= characters.length && Number.isFinite(value) ? value : null;
  },
};
