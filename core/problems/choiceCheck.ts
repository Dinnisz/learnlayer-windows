// Port of LearnLayer/Problems/ChoiceCheck.swift @ ref 2026-11-04

const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");

/** The first group of every match. */
function groups(pattern: RegExp, text: string): string[] {
  return Array.from(text.matchAll(pattern), (match) => match[1] ?? "");
}

/** The first character of the first group of every match. */
function letters(pattern: RegExp, text: string): string[] {
  return groups(pattern, text).flatMap((group) => (group === "" ? [] : [Array.from(group)[0]!]));
}

const option = /\(([A-H])\)/g;

/**
 * Multiple-choice answers must name exactly one of the listed options. A
 * reply that hedges ("the closest is (C)"), names several letters or one
 * that isn't offered can't be trusted and goes to the stronger model.
 */
export const ChoiceCheck = {
  /**
   * The option letters printed for the part `label` ("(A)"…"(D)"), from the
   * group's text: its statement up to the next part. Empty when the part
   * isn't multiple choice.
   */
  options(label: string, text: string, labels: readonly string[]): Set<string> {
    const start = (of: string): number | null => {
      const match = new RegExp(`^[ \\t]*${escapePattern(of)}[.)]?(?=[ \\t\\n])`, "m").exec(text);
      return match ? match.index : null;
    };
    let segment = text;
    const begin = start(label);
    if (begin !== null) {
      const later = labels
        .filter((other) => other !== label)
        .map(start)
        .filter((at): at is number => at !== null && at > begin);
      segment = text.slice(begin, later.length > 0 ? Math.min(...later) : text.length);
    } else if (labels.length > 1) {
      return new Set();
    }
    // Multiple choice when options start lines: "(A) …" or a row "(A) (B)
    // (C) (D)" (not "praia do Barril (B)" inside a sentence). Two columns
    // put the others mid-line, so all of them count then.
    const rows = groups(/^[ \t]*((?:\([A-H]\)[ \t]*)+)/gm, segment);
    if (new Set(rows.flatMap((row) => letters(option, row))).size < 2) return new Set();
    return new Set(letters(option, segment));
  },

  /**
   * The option letters an answer names: "(B)", "Opção B", "B — …", and
   * letters joined by "e", "and" or a comma ("B e C", "B, C", "A and D").
   */
  letters(answer: string): Set<string> {
    return new Set([
      ...letters(option, answer),
      ...letters(
        /(?:[Oo]p[çc][ãa]o|[Oo]ption|[Dd]iagrama?|[Aa]lternativa|[Rr]esposta|[Aa]nswer)\s*:?\s*\(?([A-H])\b/g,
        answer,
      ),
      ...letters(/^\s*\(?([A-H])\)?(?=[\s.,:;—–-]|$)/g, answer),
      ...joinedLetters(answer),
    ]);
  },

  /** "The closest is…", "none of the options…". */
  isHedged(answer: string): boolean {
    return /closest|none of the|none exactly|not exactly|mais próxim|aproxima-se mais|nenhuma das|nenhum dos|nenhuma opção|la plus proche|aucune des/iu.test(
      answer,
    );
  },

  /** Exactly one of the offered letters, without hedging (or not multiple choice). */
  isUsable(answer: string, options: ReadonlySet<string>): boolean {
    if (options.size === 0) return true;
    const named = ChoiceCheck.letters(answer);
    return !ChoiceCheck.isHedged(answer) && named.size === 1 && [...named].every((letter) => options.has(letter));
  },
};

/**
 * Every option letter in a run such as "B e C" or "A, B and D".
 * The conjunction "e" is lowercase, so it is not read as option E.
 */
function joinedLetters(answer: string): string[] {
  const run = /(?<![A-Za-z])\(?[A-Ha-h]\)?(?:\s*(?:,|\be\b|\b[Aa][Nn][Dd]\b)\s*\(?[A-Ha-h]\)?)+/g;
  return Array.from(answer.matchAll(run)).flatMap((match) => optionRun(match[0]));
}

/** Letters of one run, in order. The conjunctions between them are not letters. */
function optionRun(phrase: string): string[] {
  const take = (pattern: RegExp, at: number): { length: number; letter: string | null } | null => {
    const sticky = new RegExp(pattern.source, "y");
    sticky.lastIndex = at;
    const found = sticky.exec(phrase);
    if (!found) return null;
    return { length: found[0].length, letter: found[1] ? found[1].toUpperCase() : null };
  };
  const letter = /\(?([A-Ha-h])\)?/;
  const separator = /\s*(?:,|\be\b|\b[Aa][Nn][Dd]\b)\s*/;
  const first = take(letter, 0);
  if (!first?.letter) return [];
  const found = [first.letter];
  let index = first.length;
  for (;;) {
    const between = take(separator, index);
    if (!between) break;
    const next = take(letter, index + between.length);
    if (!next?.letter) break;
    found.push(next.letter);
    index += between.length + next.length;
  }
  return found.length >= 2 ? found : [];
}
