// Port of LearnLayer/Problems/ProblemSolution.swift and LearnLayer/Problems/FormulaUse.swift @ ref 2026-11-04
//
// The decoder is as tolerant as the Swift one: a missing or malformed optional field becomes empty instead of
// failing the whole answer, one bad card is dropped and the others stay. Fields whose types arrive in later
// phases (graph, timing, the transcribed question, differential equations, complex and space figures) are kept
// as the JSON the model wrote, and typed where they are drawn.

import { tightConnectives } from "../math/latexText";
import type { Check } from "../math/verifier";
import type { Continuity, SignTable } from "./signTable";

export interface Formula {
  name: string;
  latex: string;
}

/** A region of the question's crop and how to point at it, normalised to 0…1 from the crop's top-left. */
export interface Focus {
  x: number;
  y: number;
  w: number;
  h: number;
  /** "circle" or "arrow"; anything else is a circle. */
  mark?: string | null;
  /** A short label for what is there ("v₀ = 12 m/s", "the slope"), a few words. */
  note?: string | null;
  /** "question" (the default) or "statement": which lifted crop the box is in. */
  on?: string | null;
}

export interface Branch {
  title: string;
  latex: string;
}

/**
 * One step of a worked solution: a short title, a sentence or two on why the step is taken, its formula
 * (empty for a step in words), and optional side-by-side sub-results.
 */
export interface Card {
  title: string;
  /** Why: the justification the marking scheme asks for. */
  note: string | null;
  latex: string;
  branches: Branch[] | null;
  /** The data this step uses, copied word for word from the statement, underlined there while the step is open. */
  quotes: string[] | null;
  /** What the mascot says for this step, in spoken words. */
  say: string | null;
  /** Key words of the question, copied word for word, underlined while the step is explained. */
  highlight: string[] | null;
  /** The spot in the question's crop the step is about. */
  focus: Focus | null;
  /** For a 3D figure: the turn to show it at, in degrees about the vertical. */
  yaw: number | null;
  /** For a 3D figure built in parts: the part this step is about, by id. */
  figureHighlight: string | null;
  /** For a 3D figure built in parts: how many of them are on the board. */
  assembleStep: number | null;
}

/** A passage the answer rests on: the exact words, where they are, the point they make and why it matters. */
export interface Evidence {
  /** An exact excerpt of the source, at most about 25 words. */
  quote: string;
  /** "Texto A", "Documento 1", "linhas 3-5". */
  source: string | null;
  /** The point, in at most about 12 words. */
  point: string;
  /** Why it answers the question, in one sentence. */
  why: string;
}

export interface AnswerParagraph {
  text: string;
  /** Indices into `evidence` of the points this paragraph uses. */
  uses: number[];
}

export interface Answer {
  /** The result as the student would write it, in Unicode. */
  text: string;
  /** The same result in ASCII for checking, or null when it is not a formula. */
  expression: string | null;
}

export interface Part {
  /** The label as printed: "I.1". */
  label: string;
  /** The topic it tests ("Lei de Gauss"). */
  topic: string | null;
  /** What the part asks, in one sentence. */
  asks: string;
  /** One hint that doesn't give the answer away. */
  hint: string;
  steps: string[];
  answer: Answer;
  /** Labels of earlier parts whose results this one uses. */
  uses: string[];
  /** Questions a student might ask next. */
  followUps: string[] | null;
  /** The same solution as typeset step cards (LaTeX). */
  cards: Card[] | null;
  /** The final answer in LaTeX, shown boxed. */
  answerLatex: string | null;
  /** The differential equation a function answer must solve (typed in phase 6). */
  equation: unknown;
  /** The sign or variation table, checked by the app. */
  signTable: SignTable | null;
  /** Continuity at a point: the two branches, drawn by the app. */
  continuity: Continuity | null;
  /** For a question answered from a text or document: the passages it rests on. */
  evidence: Evidence[] | null;
  /** The written answer, paragraph by paragraph, each with the evidence it uses. */
  paragraphs: AnswerParagraph[] | null;
  /** What the figure should show ("complex", "space"…), when the question's words don't say. */
  figureTopic: string | null;
  /** For complex numbers: z and the power asked (typed in phase 6). */
  complex: unknown;
  /** For an Oxyz frame: the points, line and plane (typed in phase 6). */
  space: unknown;
}

/**
 * The model's worked solution for one group of exam questions (I.1, I.2, I.3…), solved together so later parts
 * build on earlier results.
 */
export interface ProblemSolution {
  subject: string;
  parts: Part[];
  /** Physics checks the app evaluates before trusting the answers. */
  checks: Check[];
  /** A curve worth drawing, or null (typed in phase 6). */
  graph: unknown;
  /** Some part depends on a figure the model could not read. */
  needsFigure: boolean;
  /** For a timing diagram to fill in (typed in phase 6). */
  timing: unknown;
  /** How the model read the figure, shown so the student can check it. */
  figure: string | null;
  /** Formulas the solution relies on, kept at hand beside it. */
  formulas: Formula[] | null;
  /** The question as read from its picture, as the blocks the model wrote (see QuestionTranscription). */
  question: unknown[] | null;
  /** A drawing would help. Decides "Draw It". */
  drawing: boolean;
  /** Kept so a reply that still includes it can be read. It does not choose the model. */
  confidence: number | null;
}

// MARK: Tolerant decoding

export class SolutionDecodingError extends Error {
  constructor(what: string) {
    super(`The solution has no readable ${what}`);
    this.name = "SolutionDecodingError";
  }
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isInteger = (value: unknown): value is number => isNumber(value) && Number.isInteger(value);

/** `try? decodeIfPresent(String.self)`: the string, or null for anything else. */
const optionalString = (value: unknown): string | null => (isString(value) ? value : null);
/** `try? decodeIfPresent([T].self)`: every element must decode, or the whole array is null. */
function optionalArray<T>(value: unknown, read: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const items: T[] = [];
  for (const item of value) {
    const decoded = read(item);
    if (decoded === null) return null;
    items.push(decoded);
  }
  return items;
}
const stringArray = (value: unknown) => optionalArray(value, (item) => (isString(item) ? item : null));

/** A number or a numeric string ("90"), as `PremadeFigure.PremadeValue.number`. */
function premadeNumber(value: unknown): number | null {
  if (isNumber(value)) return value;
  if (isString(value)) {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const number = Number(trimmed.replace(",", "."));
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function readCheck(value: unknown): Check | null {
  if (!isObject(value)) return null;
  const kinds = ["equal", "derivative", "integral", "limit", "jump"] as const;
  const kind = kinds.find((candidate) => candidate === value.kind);
  if (!kind || !isString(value.left) || !isString(value.right)) return null;
  const optional = (field: unknown) =>
    field === undefined || field === null ? null : isString(field) ? field : undefined;
  const variable = optional(value.variable);
  const from = optional(value.from);
  const to = optional(value.to);
  if (variable === undefined || from === undefined || to === undefined) return null;
  let domain: Check["domain"] = null;
  if (value.domain !== undefined && value.domain !== null) {
    if (value.domain !== "positive" && value.domain !== "any") return null;
    domain = value.domain;
  }
  return { kind, left: value.left, right: value.right, variable, from, to, domain };
}

function readSignTable(value: unknown): SignTable | null {
  if (!isObject(value) || !isString(value.variable)) return null;
  const points = optionalArray(value.points, (point) => {
    if (!isObject(point) || !isString(point.text)) return null;
    if (point.value !== undefined && point.value !== null && !isNumber(point.value)) return null;
    return { text: point.text, value: isNumber(point.value) ? point.value : null };
  });
  const readRow = (row: unknown) => {
    if (!isObject(row) || !isString(row.name)) return null;
    if (row.expression !== undefined && row.expression !== null && !isString(row.expression)) return null;
    const cells = stringArray(row.cells);
    if (!cells) return null;
    return { name: row.name, expression: isString(row.expression) ? row.expression : null, cells };
  };
  const rows = optionalArray(value.rows, readRow);
  if (!points || !rows) return null;
  let variation = null;
  if (value.variation !== undefined && value.variation !== null) {
    variation = readRow(value.variation);
    if (!variation) return null;
  }
  return { variable: value.variable, points, rows, variation };
}

function readContinuity(value: unknown): Continuity | null {
  if (!isObject(value) || !isNumber(value.point) || !isString(value.left) || !isString(value.right)) return null;
  const optionalOf = <T>(field: unknown, test: (item: unknown) => item is T): T | null | undefined =>
    field === undefined || field === null ? null : test(field) ? field : undefined;
  const pointText = optionalOf(value.pointText, isString);
  const result = optionalOf(value.value, isNumber);
  const closedSide = optionalOf(value.closedSide, isString);
  if (pointText === undefined || result === undefined || closedSide === undefined) return null;
  return { point: value.point, pointText, left: value.left, right: value.right, value: result, closedSide };
}

function readEvidence(value: unknown): Evidence | null {
  if (!isObject(value) || !isString(value.quote) || !isString(value.point) || !isString(value.why)) return null;
  if (value.source !== undefined && value.source !== null && !isString(value.source)) return null;
  return { quote: value.quote, source: optionalString(value.source), point: value.point, why: value.why };
}

function readParagraph(value: unknown): AnswerParagraph | null {
  if (!isObject(value)) return null;
  if (value.text !== undefined && value.text !== null && !isString(value.text)) return null;
  const uses = optionalArray(value.uses, (item) => (isInteger(item) ? item : null)) ?? [];
  return { text: isString(value.text) ? value.text : "", uses };
}

function readFocus(value: unknown): Focus | null {
  if (!isObject(value) || ![value.x, value.y, value.w, value.h].every(isNumber)) return null;
  for (const field of [value.mark, value.note, value.on]) {
    if (field !== undefined && field !== null && !isString(field)) return null;
  }
  return {
    x: value.x as number,
    y: value.y as number,
    w: value.w as number,
    h: value.h as number,
    mark: optionalString(value.mark),
    note: optionalString(value.note),
    on: optionalString(value.on),
  };
}

function readCard(value: unknown): Card | null {
  if (!isObject(value)) return null;
  if (value.title !== undefined && value.title !== null && !isString(value.title)) return null;
  const yaw = premadeNumber(value.yaw);
  const figureHighlight = optionalString(value.figureHighlight)?.trim() || null;
  const steps = premadeNumber(value.assembleStep);
  const assembleStep = steps !== null && steps >= 0 && steps <= 1000 && Number.isInteger(steps) ? steps : null;
  return {
    title: isString(value.title) ? value.title : "",
    note: optionalString(value.note),
    // Written as the morph and the typeset line both lay it out.
    latex: tightConnectives(optionalString(value.latex) ?? ""),
    branches: optionalArray(value.branches, (branch) =>
      isObject(branch) && isString(branch.title) && isString(branch.latex)
        ? { title: branch.title, latex: branch.latex }
        : null,
    ),
    quotes: stringArray(value.quotes),
    say: optionalString(value.say),
    highlight: stringArray(value.highlight),
    focus: readFocus(value.focus),
    yaw,
    figureHighlight,
    assembleStep,
  };
}

/** One bad card is dropped. The cards around it stay. */
function lossyCards(value: unknown): Card[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((item) => {
    const card = readCard(item);
    return card ? [card] : [];
  });
}

/** A model that cannot write JSON null writes the word: that is no formula. */
function formula(raw: unknown): string | null {
  if (!isString(raw)) return null;
  const trimmed = raw.trim();
  if (trimmed === "" || ["null", "none", "nil", "n/a", "-"].includes(trimmed.toLowerCase())) return null;
  return trimmed;
}

function readAnswer(value: unknown): Answer {
  if (isString(value)) return { text: value, expression: null };
  if (isObject(value) && isString(value.text)) {
    if (value.expression !== undefined && value.expression !== null && !isString(value.expression)) {
      return { text: "", expression: null };
    }
    return { text: value.text, expression: formula(value.expression) };
  }
  return { text: "", expression: null };
}

function readPart(value: unknown): Part {
  if (!isObject(value) || !isString(value.label)) throw new SolutionDecodingError("part label");
  const requiredOptional = (field: unknown, what: string): string => {
    if (field === undefined || field === null) return "";
    if (!isString(field)) throw new SolutionDecodingError(what);
    return field;
  };
  let steps: string[] = [];
  if (value.steps !== undefined && value.steps !== null) {
    const read = stringArray(value.steps);
    if (!read) throw new SolutionDecodingError("steps");
    steps = read;
  }
  const present = (field: unknown) => (field === undefined || field === null ? null : field);
  return {
    label: value.label,
    topic: optionalString(value.topic),
    asks: requiredOptional(value.asks, "asks"),
    hint: requiredOptional(value.hint, "hint"),
    steps,
    answer: readAnswer(value.answer),
    uses: stringArray(value.uses) ?? [],
    followUps: stringArray(value.followUps),
    cards: lossyCards(value.cards),
    answerLatex: optionalString(value.answerLatex),
    equation: present(value.equation),
    signTable: readSignTable(value.signTable),
    continuity: readContinuity(value.continuity),
    evidence: optionalArray(value.evidence, readEvidence),
    paragraphs: optionalArray(value.paragraphs, readParagraph),
    figureTopic: optionalString(value.figureTopic),
    complex: present(value.complex),
    space: present(value.space),
  };
}

/** Reads a parsed solution reply. Throws only when there are no parts to show. */
export function decodeProblemSolution(value: unknown): ProblemSolution {
  if (!isObject(value)) throw new SolutionDecodingError("object");
  if (value.subject !== undefined && value.subject !== null && !isString(value.subject)) {
    throw new SolutionDecodingError("subject");
  }
  if (!Array.isArray(value.parts)) throw new SolutionDecodingError("parts");
  return {
    subject: isString(value.subject) ? value.subject : "",
    parts: value.parts.map(readPart),
    checks: optionalArray(value.checks, readCheck) ?? [],
    graph: isObject(value.graph) ? value.graph : null,
    needsFigure: value.needsFigure === true,
    timing: isObject(value.timing) ? value.timing : null,
    figure: optionalString(value.figure),
    formulas: optionalArray(value.formulas, (item) =>
      isObject(item) && isString(item.name) && isString(item.latex) ? { name: item.name, latex: item.latex } : null,
    ),
    question: Array.isArray(value.question) ? value.question : null,
    drawing: value.drawing === true,
    confidence: isNumber(value.confidence) ? value.confidence : null,
  };
}

// MARK: Reading a solution

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Which course formulas belong beside the steps. A name or algebra the steps never use stays off the stage. */
export const FormulaUse = {
  isReferenced(name: string, latex: string, haystack: string): boolean {
    const hay = fold(haystack);
    const title = fold(name).trim();
    if (Array.from(title).length >= 8 && hay.includes(title)) return true;
    const words = title.split(/[^\p{L}]+/u).filter((word) => Array.from(word).length >= 5 && !genericWords.has(word));
    if (words.some((word) => hay.includes(word))) return true;
    const chunk = compact(latex);
    const body = compact(haystack);
    // The whole formula, not an 8-character slice: a slice of one identity shows up inside unrelated algebra.
    return Array.from(chunk).length >= 4 && body.includes(chunk);
  },
};

const genericWords = new Set([
  "limite",
  "limites",
  "notavel",
  "notable",
  "regra",
  "produto",
  "product",
  "rule",
  "formula",
  "formulas",
  "derivada",
  "derivative",
  "teorema",
  "theorem",
]);

/** Structural TeX, dropped so two different formulas don't match on `\frac`. */
function compact(latex: string): string {
  let text = latex.toLowerCase();
  for (const word of [
    "dfrac",
    "tfrac",
    "frac",
    "left",
    "right",
    "color",
    "text",
    "mathrm",
    "mathbf",
    "displaystyle",
    "begin",
    "end",
    "aligned",
    "qquad",
    "quad",
  ]) {
    text = text.replaceAll("\\" + word, " ");
  }
  return Array.from(text)
    .filter((character) => /[\p{L}\p{N}]/u.test(character))
    .join("");
}

function partHaystack(part: Part): string {
  return [
    part.asks,
    part.hint,
    part.answer.text,
    part.answerLatex ?? "",
    ...part.steps,
    ...(part.cards ?? []).flatMap((card) => [card.title, card.note ?? "", card.latex]),
  ].join("\n");
}

/** Formulas a step of this part actually names or writes. */
export function formulasFor(solution: ProblemSolution, part: Part): Formula[] {
  const haystack = partHaystack(part);
  return (solution.formulas ?? []).filter((item) => FormulaUse.isReferenced(item.name, item.latex, haystack));
}

/** Formulas a step of any part actually names or writes. The rest stay off the stage. */
export function formulasAtHand(solution: ProblemSolution): Formula[] {
  const haystack = solution.parts.map(partHaystack).join("\n");
  return (solution.formulas ?? []).filter((item) => FormulaUse.isReferenced(item.name, item.latex, haystack));
}

/** Languages, literature and philosophy are never drawn, whatever the model says. */
export function subjectAllowsDrawing(subject: string): boolean {
  const lower = subject.toLowerCase();
  // prettier-ignore
  const neverDrawn = ["portugu", "english", "inglês", "ingles", "french", "francês", "frances", "français", "german", "alemão",
    "spanish", "espanhol", "español", "latin", "latim", "língua", "lingua", "language", "literat", "filosof", "philosoph"];
  return !neverDrawn.some((stem) => lower.includes(stem));
}

export function canDraw(solution: ProblemSolution): boolean {
  return solution.drawing && subjectAllowsDrawing(solution.subject);
}

/** Portuguese and English names of the same subject. */
function isLanguageOrPhilosophy(subject: string): boolean {
  const name = fold(subject);
  return ["portugu", "ingles", "english", "franc", "french", "filosof", "philosoph"].some((stem) =>
    name.includes(stem),
  );
}

/** "o texto", "le document" — not "contexto", which only contains the letters. */
function isDocumentQuestion(text: string): boolean {
  return /\b(textos?|textes?|excertos?|extraits?|documentos?|documents?|poemas?|poemes?|cantigas?|passages?|extracts?)\b/.test(
    fold(text),
  );
}

/** The stem sends the student to a printed diagram, so a missing figure is real. */
function isDiagramLed(text: string): boolean {
  let folded = fold(text);
  for (const phrase of [
    "figura de estilo",
    "figura de retorica",
    "figure de style",
    "figure of speech",
    "rhetorical figure",
  ]) {
    folded = folded.replaceAll(phrase, " ");
  }
  if (["figura seguinte", "figure below", "figura abaixo"].some((phrase) => folded.includes(phrase))) return true;
  return /\b(observe|observa|na|da|a partir da|from the|in the|see the)\s+(?:(?:a|o|the)\s+)?(figura|figure|grafico|diagrama|diagram)\b/.test(
    folded,
  );
}

/**
 * The model said a figure is missing, but the question does not depend on one: Portuguese, French, English or
 * Philosophy, or a written answer from a text that is not led by a diagram.
 */
export function ignoresMissingFigure(solution: ProblemSolution, questionText: string): boolean {
  if (isLanguageOrPhilosophy(solution.subject)) return true;
  const calculates = solution.parts.some(
    (part) =>
      part.answer.expression !== null ||
      part.equation !== null ||
      part.signTable !== null ||
      part.complex !== null ||
      part.space !== null,
  );
  if (calculates) return false;
  if (solution.parts.some((part) => (part.evidence?.length ?? 0) > 0 || (part.paragraphs?.length ?? 0) > 0)) {
    return true;
  }
  return isDocumentQuestion(questionText) && !isDiagramLed(questionText);
}

const plainLabel = (text: string) =>
  Array.from(text.toLowerCase())
    .filter((character) => !"()[]. ".includes(character))
    .join("");

/** The part with this label, however the brackets are written ("c)", "(c)", "c"). */
export function partLabelled(solution: ProblemSolution, label: string): Part | null {
  return (
    solution.parts.find((part) => part.label === label) ??
    solution.parts.find((part) => plainLabel(part.label) === plainLabel(label)) ??
    null
  );
}

/**
 * Only the parts that were asked for. A picture of a whole page can show other questions, and the model may
 * answer those too; they are dropped. Left whole when none of the labels match, so a relabelled answer survives.
 */
export function restrictedTo(solution: ProblemSolution, labels: readonly string[]): ProblemSolution {
  if (labels.length === 0) return solution;
  const kept = solution.parts.filter((part) =>
    labels.some((label) => label === part.label || plainLabel(label) === plainLabel(part.label)),
  );
  if (kept.length === 0 || kept.length >= solution.parts.length) return solution;
  return { ...solution, parts: kept };
}
