// Port of LearnLayer/Voice/MascotGuide.swift @ ref 2026-11-04. The mascot explaining the steps, and only once the
// student clicks it. Asking for the solution or a hint never moves it: the steps come in on their own, the sphere stays
// where it rests. A click sends it through the steps one at a time, with each step's data underlined in blue the
// moment the step uses it. A second click stops it and it goes back to rest.

export interface GuideRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MascotGuide = {
  /** The shortest and longest the mascot stays on one step: time to get there, and to read the underlined data. */
  minimumBeat: 2.2,
  maximumBeat: 4.5,
  /** Reading time for what the step says, per character. */
  secondsPerCharacter: 0.015,
  /** Time to look at each datum underlined in the statement. */
  secondsPerQuote: 0.35,
  /** With Reduce Motion it does not travel, so each step is a little shorter. */
  reducedMotionScale: 0.8,

  /** How long the mascot stays on a step that says `characters` and uses `quotes` data. */
  beat(characters: number, quotes: number, reduceMotion = false): number {
    const raw =
      MascotGuide.minimumBeat +
      Math.max(0, characters) * MascotGuide.secondsPerCharacter +
      Math.max(0, quotes) * MascotGuide.secondsPerQuote;
    const beat = Math.min(MascotGuide.maximumBeat, Math.max(MascotGuide.minimumBeat, raw));
    return reduceMotion ? beat * MascotGuide.reducedMotionScale : beat;
  },

  /**
   * The steps a click walks through, from 0: in the whole solution, from the step open (or the first) to the last;
   * after a hint, the step reached. None outside those.
   */
  steps(isSolution: boolean, isHint: boolean, selected: number | null, current: number, count: number): number[] {
    if (count <= 0) return [];
    if (isSolution) {
      const from = selected === null ? 0 : Math.min(Math.max(selected, 0), count - 1);
      return Array.from({ length: count - from }, (_, index) => from + index);
    }
    if (isHint && current >= 1 && current <= count) return [current - 1];
    return [];
  },

  /**
   * Where the sphere waits beside a datum in the statement: level with it, just past the text's right edge (or its
   * left one when there is no room), so it covers no words.
   */
  spot(datum: GuideRect, text: GuideRect, bounds: { width: number; height: number }, bodySize: number) {
    const half = bodySize / 2;
    const gap = 10;
    const right = text.x + text.width + gap + half;
    const x = right + half <= bounds.width ? right : Math.max(half, text.x - gap - half);
    const y = Math.min(Math.max(datum.y + datum.height / 2, half), Math.max(half, bounds.height - half));
    return { x, y };
  },

  /**
   * What the mascot says for a step: a cue to what to look at, then the step. It points at the figure when the plan
   * wants a visual explanation (`pointer`), else at the data the step uses in the statement, so it never just reads
   * the question back.
   */
  narration(step: string, quotes: readonly string[], hasFigure: boolean, pointer: boolean, english = false): string {
    const body = step.trim();
    let cue: string | null;
    if (pointer && hasFigure) cue = english ? "Look at the figure." : "Olha para a figura.";
    else {
      const shown = quotes
        .map((quote) => quote.trim())
        .filter((quote) => quote !== "" && Array.from(quote).length <= 40)
        .slice(0, 2);
      cue =
        shown.length === 0
          ? null
          : english
            ? "Notice " + shown.map((quote) => `“${quote}”`).join(" and ") + "."
            : "Repara em " + shown.map((quote) => `«${quote}»`).join(" e ") + ".";
    }
    return [cue, body === "" ? null : body].filter((piece): piece is string => piece !== null).join(" ");
  },
};
