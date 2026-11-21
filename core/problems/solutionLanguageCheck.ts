// Port of LearnLayer/Problems/SolutionLanguageCheck.swift @ 5701363
//
// An answer written partly in another language than the tutor's (Settings): a cheaper model sometimes titles its
// steps in Portuguese, Brazilian at that ("Área da arruela"), under English notes. Read by the app from the words
// themselves; such an answer goes to the stronger model.

import type { Part, ProblemSolution } from "./problemSolution";
import { TutorLanguage } from "./solutionRequest";

/** The tutor's language from the name the prompts use ("Portuguese (Portugal)", "English"). */
export const tutorLanguageOf = (promptName: string): TutorLanguage => TutorLanguage.fromPromptName(promptName);

/** Portuguese words that are not English ("do", "no", "a", "e" are both, or maths). */
const portugueseWords = new Set([
  "da", "das", "de", "dos", "na", "nas", "nos", "em", "ou", "para", "por", "que", "com", "uma", "não", "são",
  "é", "entre", "qual", "quando", "então", "como", "pelo", "pela", "também", "sobre", "isso", "este", "esta",
  "temos", "onde", "porque", "cada", "logo", "seja", "dado", "valor", "calcular", "calcula-se",
]); // prettier-ignore

/** English words that are not Portuguese ("for" is: "se x for positivo"). */
const englishWords = new Set([
  "the", "of", "and", "is", "are", "to", "with", "from", "this", "that", "we", "by", "then", "which", "into",
  "its", "be", "find", "use", "gives", "where",
]); // prettier-ignore

const isUpper = (character: string | undefined) =>
  character !== undefined && character !== character.toLowerCase() && character === character.toUpperCase();
const isLower = (character: string | undefined) =>
  character !== undefined && character !== character.toUpperCase() && character === character.toLowerCase();

/** The words outside quotations ("…", “…”, «…») and maths ($…$, \(…\), \text{…}). */
function words(text: string): string[] {
  let plain = text;
  for (const pattern of [/"[^"]*"/g, /“[^”]*”/g, /«[^»]*»/g, /\$[^$]*\$/g, /\\\(.*?\\\)/g, /\\[a-zA-Z]+\{[^}]*\}/g])
    plain = plain.replace(pattern, " ");
  return plain
    .split(/[^\p{L}\-']+/u)
    .map((word) => word.replace(/^[-']+|[-']+$/g, ""))
    .filter((word) => word !== "");
}

export const SolutionLanguageCheck = {
  /** Fields in the other language before the answer is sent on (one stray title is tolerated). */
  minimumFlagged: 2,

  /** True when at least `minimumFlagged` of the texts the student reads are in the other language. */
  mismatch(solution: ProblemSolution, language: TutorLanguage): boolean {
    let flagged = 0;
    for (const part of solution.parts)
      for (const text of SolutionLanguageCheck.texts(part))
        if (SolutionLanguageCheck.isOtherLanguage(text, language)) {
          flagged += 1;
          if (flagged >= SolutionLanguageCheck.minimumFlagged) return true;
        }
    return false;
  },

  /** What the student reads in a part; not `asks`, which may restate the exam in its own language. */
  texts(part: Part): string[] {
    const texts = [part.topic ?? "", part.hint, part.answer.text, ...part.steps, ...(part.followUps ?? [])];
    for (const card of part.cards ?? []) texts.push(card.title, card.note ?? "", card.say ?? "");
    return texts.filter((text) => text.trim() !== "");
  },

  /** A field mostly in the other language: two of its words give it away. */
  isOtherLanguage(text: string, tutor: TutorLanguage): boolean {
    const found = words(text);
    let score = 0;
    for (const [index, word] of found.entries()) {
      const lower = word.toLowerCase();
      if (tutor === "en") {
        // "de Moivre", "de Morgan": a name, not Portuguese.
        if (lower === "de" && isUpper(found[index + 1]?.[0])) continue;
        if (portugueseWords.has(lower)) score += 1;
        else if (/[ãõç]/.test(lower) || ((index === 0 || isLower(word[0])) && /[áéíóúâêôà]/.test(lower)))
          // An accented word, not a name inside a sentence ("l'Hôpital", "Poincaré").
          score += 1;
      } else if (englishWords.has(lower)) score += 1;
      if (score >= 2) return true;
    }
    return false;
  },
};
