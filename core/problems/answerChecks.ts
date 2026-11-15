// Port of LearnLayer/Problems/ReadingAnswerCheck.swift, AnswerAudit.swift, FigureConsistency.swift and
// ListeningDetection.swift @ ref 2026-11-04: what makes a first answer go to the stronger model, and a listening
// item wait for its transcript.

import type { Area } from "../ai/modelRouting";
import { tryParseExpression, variables } from "../math/expression";
import type { Check } from "../math/verifier";

/** Folded as Swift folds: no marks, lower case, curly apostrophes straight. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replaceAll("’", "'").replaceAll("‘", "'");
}

const isLetter = (character: string) => /\p{L}/u.test(character);
const letterRuns = (text: string) => text.split(/\P{L}+/u).filter((word) => word !== "");

/**
 * A fast answer that only points at lines, tells the student to do the work, says the excerpt is missing, or skips
 * items an open question asked for, is sent to the strong model once.
 */
export const ReadingAnswerCheck = {
  /** `hasOptions`: a multiple-choice part. `question`: what was asked; empty skips the item count. */
  needsEscalation(answer: string, hasOptions: boolean, question = ""): boolean {
    if (hasOptions) return false;
    const trimmed = answer.trim();
    if (trimmed === "") return false;
    if (delegatesToTheReader(trimmed)) return true;
    if (claimsTheSourceIsMissing(trimmed)) return true;
    if (citesLinesWithoutContent(trimmed)) return true;
    const words = trimmed.split(/[^\p{L}\p{N}]+/u).filter((word) => Array.from(word).some(isLetter));
    if (words.length < 4) return true;
    const requested = requestedCount(question);
    if (requested && concreteItemCount(trimmed, requested.category) < requested.count) return true;
    return false;
  },
};

function delegatesToTheReader(answer: string): boolean {
  const folded = fold(answer);
  const patterns = [
    /\bo aluno deve\b/,
    /\ba aluna deve\b/,
    /\bos alunos devem\b/,
    /\bas alunas devem\b/,
    /\bdeve identificar\b/,
    /\bdevem identificar\b/,
    /\bdeve comparar-se\b/,
    /\bthe student should\b/,
    /\byou should (identify|compare|find|name)\b/,
    /\bel alumno debe\b/,
    /\bla alumna debe\b/,
    /\blos alumnos deben\b/,
    /\bl'eleve doit\b/,
    /\bles eleves doivent\b/,
    /\bder schuler soll\b/,
    /\bdie schulerin soll\b/,
    /\bdeve basear-se\b/,
    /\bdevem basear-se\b/,
    /\bshould be based\b/,
    /\bmust be based\b/,
    /\bdebe basarse\b/,
    /\bdoit se baser\b/,
    /\bsoll basieren\b/,
  ];
  return patterns.some((pattern) => pattern.test(folded));
}

function claimsTheSourceIsMissing(answer: string): boolean {
  const folded = fold(answer);
  const patterns = [
    /\bnao se encontram? no (?:excerto|texto|documento|trecho|passage)\b/,
    /\bnao esta disponivel\b/,
    /\bnot in the (?:provided )?(?:excerpt|text|passage)\b/,
    /\bnot available\b/,
    /\bno se encuentra\b/,
    /\bno esta disponible\b/,
    /\bne figure pas\b/,
    /\bnicht im text\b/,
    /\bnicht verfugbar\b/,
  ];
  return patterns.some((pattern) => pattern.test(folded));
}

const lineWords = "linhas?|lines?|versos?|verses?|líneas?|lineas?|zeilen";

/** "nas linhas 23 a 27" with no quotation and almost no other words. */
function citesLinesWithoutContent(answer: string): boolean {
  if (!new RegExp(`(?<![\\p{L}\\p{N}_])(${lineWords})(?![\\p{L}\\p{N}_])`, "iu").test(answer) || !/\d/.test(answer))
    return false;
  if (hasQuotation(answer)) return false;
  const stripped = answer.replace(
    new RegExp(`(?<![\\p{L}\\p{N}_])(${lineWords})\\s*\\d+\\s*(?:\\s*(?:a|to|–|-|—)\\s*\\d+)?\\b`, "giu"),
    " ",
  );
  return letterRuns(stripped).filter((word) => Array.from(word).length > 2).length < 8;
}

/** "duas sensações", "three examples", "2 causas". Line numbers are not a request. */
function requestedCount(question: string): { count: number; category: string } | null {
  const folded = fold(question);
  if (folded === "") return null;
  const words = "duas|dois|two|deux|zwei|tres|three|trois|drei|quatro|four|quatre|vier|cinco|five|cinq|funf";
  for (const match of folded.matchAll(new RegExp(`\\b(${words}|[2-5])\\s+([a-z]{4,})\\b`, "g"))) {
    const noun = match[2]!;
    if (["linha", "line", "linea", "zeile", "verso", "verse"].some((prefix) => noun.startsWith(prefix))) continue;
    const count = numberValue(match[1]!);
    if (count !== null) return { count, category: noun };
  }
  return null;
}

function numberValue(token: string): number | null {
  if (/^\d+$/.test(token)) {
    const value = Number(token);
    return value >= 2 && value <= 5 ? value : null;
  }
  const values: Record<string, number> = {
    duas: 2,
    dois: 2,
    two: 2,
    deux: 2,
    zwei: 2,
    tres: 3,
    three: 3,
    trois: 3,
    drei: 3,
    quatro: 4,
    four: 4,
    quatre: 4,
    vier: 4,
    cinco: 5,
    five: 5,
    cinq: 5,
    funf: 5,
  };
  return values[token] ?? null;
}

const ignoredWords = new Set([
  "aluno",
  "aluna",
  "alunos",
  "alunas",
  "student",
  "students",
  "eleve",
  "eleves",
  "schuler",
  "schulerin",
  "reader",
  "lecteur",
  "deve",
  "devem",
  "debe",
  "deben",
  "should",
  "must",
  "soll",
  "sollen",
  "doit",
  "doivent",
  "identificar",
  "identifique",
  "identify",
  "identifier",
  "identifizieren",
  "comparar",
  "compare",
  "comparer",
  "linhas",
  "linha",
  "lines",
  "line",
  "lineas",
  "zeilen",
  "versos",
  "verso",
  "verses",
  "texto",
  "text",
  "texte",
  "passage",
  "excerto",
  "excerpt",
  "seguintes",
  "seguinte",
  "following",
  "identificadas",
  "identificada",
  "identified",
  "duas",
  "dois",
  "tres",
  "two",
  "three",
  "four",
  "five",
  "quatro",
  "cinco",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "zwei",
  "drei",
  "vier",
  "funf",
  "presentes",
  "presente",
  "present",
]);

/** Pieces separated by "e" / "and" / "y" / "et" / "und" or a comma, ignoring the asked-for category. */
function concreteItemCount(answer: string, category: string): number {
  let text = fold(answer);
  text = text.replace(/\b(linhas?|lines?|versos?|verses?|lineas?|zeilen)\s*\d+\s*(?:\s*(?:a|to|–|-|—)\s*\d+)?/gi, " ");
  for (const separator of [/\s*,\s*/g, /\s*;\s*/g, /\s+e\s+/g, /\s+and\s+/g, /\s+y\s+/g, /\s+et\s+/g, /\s+und\s+/g]) {
    text = text.replace(separator, " | ");
  }
  return text.split(" | ").filter((chunk) =>
    letterRuns(chunk)
      .filter((word) => Array.from(word).length >= 4)
      .some((word) => !ignoredWords.has(word) && !isCategory(word, category)),
  ).length;
}

function isCategory(word: string, category: string): boolean {
  if (category.length < 4 || word.length < 4) return false;
  return word.startsWith(category.slice(0, 5)) || category.startsWith(word.slice(0, 5));
}

function hasQuotation(answer: string): boolean {
  return [/«[^»]{8,}»/u, /“[^”]{8,}”/u, /"[^"]{8,}"/, /'[^']{8,}'/].some((pattern) => pattern.test(answer));
}

/**
 * Whether a cheaper model's maths or physics answer was really tested. A check that only restates the model's own
 * formula (the same names on both sides) passes whatever the figure said, so it proves nothing about the setup.
 */
export const AnswerAudit = {
  /** True when the check can only confirm algebra the model wrote itself, or cannot be read. */
  restatesItself(check: Check): boolean {
    if (check.kind !== "equal") return false;
    const left = tryParseExpression(check.left);
    const right = tryParseExpression(check.right);
    if (!left || !right) return true;
    const leftNames = variables(left);
    const rightNames = variables(right);
    const all = new Set([...leftNames, ...rightNames]);
    return all.size > 0 && leftNames.size === rightNames.size && [...leftNames].every((name) => rightNames.has(name));
  },

  /** `firstModelIsStrong`: nobody to escalate to. Only a quantitative subject is audited. */
  needsStrongerModel(
    checks: readonly Check[],
    area: Area,
    firstModelIsStrong: boolean,
    requiresCheckForMath = true,
  ): boolean {
    if (firstModelIsStrong || !(area === "math" || area === "physicsChemistry")) return false;
    if (checks.length === 0) return requiresCheckForMath && area === "math";
    return checks.every(AnswerAudit.restatesItself);
  },
};

/** The figure transcription and the answer have to describe the same curve. */
export const FigureConsistency = {
  /** A sentence naming the clash, or null when the two agree (or either is silent). */
  disagreement(figure: string, answer: string): string | null {
    const fig = figure.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    const ans = answer.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    if (!/\b(mud\w* de sinal|chang\w* sign|troc\w* de sinal)\b/.test(ans)) return null;
    if (/\b(mud\w* de sinal|chang\w* sign|troc\w* de sinal|cross\w*|atravess\w*|corta\w*)\b/.test(fig)) return null;
    const touches = /\b(touch\w*|toca\w*|tangenc\w*)\b/.test(fig);
    const stays =
      /\b(stays below|stays above|permanece abaixo|permanece acima|mantem-se abaixo|mantem-se acima)\b/.test(fig) ||
      fig.includes("until the origin") ||
      fig.includes("ate a origem") ||
      fig.includes("ate aa origem");
    if (!touches || !stays) return null;
    return "figure says the curve only touches and stays on one side, but the answer says it changes sign";
  },
};

/** A listening item whose recording is not printed on the page. */
export const ListeningDetection = {
  /** True when `text` (the question, plus its page) is a listening item and the spoken words are not printed. */
  isWithoutSource(text: string, subject: string | null = null): boolean {
    const folded = fold(text);
    if (subject !== null && isListeningLabel(fold(subject))) return !hasSpokenSource(folded, text);
    if (!isListeningItem(folded)) return false;
    return !hasSpokenSource(folded, text);
  },
};

function isListeningLabel(folded: string): boolean {
  if (/\blistening\b/.test(folded)) return true;
  if (folded.includes("compreensao") && folded.includes("oral")) return true;
  if (folded.includes("comprehension") && folded.includes("oral")) return true;
  return folded.includes("document sonore");
}

function isListeningItem(folded: string): boolean {
  if (hasListeningHeading(folded)) return true;
  const any = (...pieces: string[]) => pieces.some((piece) => folded.includes(piece));
  if (any("compreensao do oral", "compreensao oral", "listening comprehension", "oral comprehension")) return true;
  if (
    any(
      "you will hear",
      "you are going to hear",
      "you will listen",
      "you are going to listen",
      "you'll hear",
      "youll hear",
    )
  )
    return true;
  if (
    any(
      "vous allez entendre",
      "vous allez ecouter",
      "comprehension orale",
      "comprehension de l'oral",
      "document sonore",
    )
  )
    return true;
  // "listen to the", not "listening to" (a story about someone listening).
  if (/\blisten to (the|a|this)\b/.test(folded)) return true;
  if (/\b(the|this) recording\b/.test(folded)) return true;
  if (/\b(the audio|o audio|audio \d|faixa \d|track \d)\b/.test(folded)) return true;
  const aboutTheRecording = any("texto", "vezes", "gravac", "dialogo", "audio");
  if (any("vai ouvir", "vais ouvir", "ira ouvir", "vao ouvir") && aboutTheRecording) return true;
  if (/\b(ouca|oucam|escuta|escutem)\b/.test(folded) && aboutTheRecording) return true;
  // "écoutez" alone is an ordinary verb; with the recording it is the instruction.
  return /\becoutez\b/.test(folded) && any("document", "enregistrement", "dialogue", "texte");
}

/** A heading, not a word inside a sentence. */
function hasListeningHeading(folded: string): boolean {
  for (const raw of folded.split("\n")) {
    const line = raw.replace(/^[ \t]+|[ \t]+$/g, "");
    if (line === "listening" || line === "english listening" || line === "listening comprehension") return true;
    if (/(english|ingles)\s+listening/.test(line)) return true;
    if (/listening\s+(comprehension|section|paper|test)/.test(line)) return true;
    if (/^(part|parte|grupo|group|section)\b.*\blistening\b/.test(line)) return true;
    if (/^(part|parte|grupo|group|section)\b/.test(line) && line.includes("compreensao") && line.includes("oral"))
      return true;
  }
  return false;
}

/** A printed transcript or a dialogue with several speaker turns. */
function hasSpokenSource(folded: string, original: string): boolean {
  if (["transcri", "transcript", "tape script", "guiao"].some((piece) => folded.includes(piece))) return true;
  const turns = original.split("\n").filter((line) => /^\s*[A-Z][A-Za-zÀ-ÿ'’-]{1,20}\s*:/u.test(line));
  return turns.length >= 4;
}
