// Port of LearnLayer/Voice/StepRequest.swift (with VoiceTutorDirective.stepDetail) and
// LearnLayer/Voice/VoiceTutorOpener.swift @ ref 2026-11-04.
//
// The few words said the moment a voice turn is sent, chosen from what the student asked (no model call), so the wait
// for the reply is not silent. Only for a request clearly about the exercise; small talk gets no opener. The lines are
// recorded once in the premium pt-PT voice (Joana) and shipped with the app: nothing is bought to say them.

import type { TutorLanguage } from "../problems/solutionRequest";

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** The student asks for one step of the solution on screen ("explica o ponto 1", "não percebi o passo dois"). */
export type StepRequest = { kind: "number"; number: number } | { kind: "last" };

const numberWords: Record<string, number> = {
  um: 1,
  uma: 1,
  one: 1,
  dois: 2,
  duas: 2,
  two: 2,
  tres: 3,
  three: 3,
  quatro: 4,
  four: 4,
  cinco: 5,
  five: 5,
  seis: 6,
  six: 6,
  sete: 7,
  seven: 7,
  oito: 8,
  eight: 8,
  nove: 9,
  nine: 9,
  dez: 10,
  ten: 10,
};
const ordinals: Record<string, number> = {
  primeiro: 1,
  primeira: 1,
  first: 1,
  segundo: 2,
  segunda: 2,
  second: 2,
  terceiro: 3,
  terceira: 3,
  third: 3,
  quarto: 4,
  quarta: 4,
  fourth: 4,
  quinto: 5,
  quinta: 5,
  fifth: 5,
  sexto: 6,
  sexta: 6,
  sixth: 6,
  setimo: 7,
  setima: 7,
  seventh: 7,
  oitavo: 8,
  oitava: 8,
  eighth: 8,
  nono: 9,
  nona: 9,
  ninth: 9,
  decimo: 10,
  decima: 10,
  tenth: 10,
};
const nouns = "(?:ponto|passo|etapa|step|point)";

const lookup = (found: string, table: Record<string, number>) => {
  const number = /^\d+$/u.test(found) ? Number(found) : (table[found] ?? null);
  return number !== null && number > 0 ? number : null;
};

export const StepRequests = {
  /** The step the words ask for, or null. "passo a passo" and "step by step" are not requests. */
  parse(transcript: string): StepRequest | null {
    const text = fold(transcript).replaceAll("º", "").replaceAll("ª", "");
    if (new RegExp(`\\b(?:ultimo|ultima|last|final)\\s+${nouns}\\b`).test(text)) return { kind: "last" };
    // "passo 2", "ponto dois", "step three", "passo n.º 2"
    const after = new RegExp(`\\b${nouns}\\s+(?:n\\.?\\s*)?(\\d{1,2}|[a-z]+)\\b`).exec(text);
    const named = after ? lookup(after[1]!, numberWords) : null;
    if (named !== null) return { kind: "number", number: named };
    // "o segundo passo", "second step", "2.º passo", "2o passo"
    const before = new RegExp(`\\b(\\d{1,2}|[a-z]+)\\.?\\s*o?\\s+${nouns}\\b`).exec(text);
    const ordinal = before ? lookup(before[1]!, ordinals) : null;
    return ordinal !== null ? { kind: "number", number: ordinal } : null;
  },

  /** The step from 0, when it is one of the `count` there are. */
  index(request: StepRequest, count: number): number | null {
    if (request.kind === "last") return count > 0 ? count - 1 : null;
    return count > 0 && request.number >= 1 && request.number <= count ? request.number - 1 : null;
  },
};

/** Expand only this step (`number` counts from 1, as the student says it): the directive of the voice turn. */
export function stepDetail(number: number, total: number, text: string, hasFigure: boolean): string {
  let note =
    `Step to expand: the student asked about step ${number} of ${total} only. Explain ` +
    `ONLY that step, in more detail than the solution shows: why it is done, what each ` +
    `symbol in it stands for, and a tiny numeric example only if it helps (short round ` +
    `numbers, never long scientific notation read aloud). Do not go on to other steps ` +
    `and do not repeat the final result. About four to six short sentences in "spoken", ` +
    `then offer to continue. Order: first, in one sentence, what this step does and what ` +
    `it gives; then why it is done here; then each symbol and where its numbers come ` +
    `from (the question or an earlier step); last, how it leads to the next step. Use the ` +
    `numbers and formulas the step already has; never redo it differently. Stay consistent with the figure description and the steps ` +
    `about where each point and angle is: if the step says α is at B, it is at B in every ` +
    `sentence. Never place it somewhere else first and then correct yourself; work it out ` +
    `before speaking and say it once. Step ${number} reads: ${text}`;
  note += hasFigure
    ? "\nA figure is on screen: tie the explanation to it with a mark, and when a number or " +
      'a point on the curve matters, draw a "plot" with a "label" on its "point" ' +
      "only if the step uses that function."
    : "\nNo figure is on screen: if a quick picture helps, sketch it with arrows between the labels that matter, or draw a " +
      '"plot" only when the step uses that function, ' +
      'with a "label" on its "point".';
  return note;
}

export type OpenerIntent =
  | { kind: "step"; step: StepRequest }
  | { kind: "hint" }
  | { kind: "explainAgain" }
  | { kind: "explain" }
  | { kind: "question" };

const hintWords = ["pista", "dica", "hint", "so uma ajuda", "um empurrao"];
const againWords = [
  "explica melhor",
  "explicar melhor",
  "explique melhor",
  "nao percebi",
  "nao entendi",
  "nao estou a perceber",
  "nao percebo",
  "outra forma",
  "outra maneira",
  "explica outra vez",
  "explica de novo",
  "explain better",
];
const explainWords = ["explica", "explique", "explicar", "explain"];
const interrogatives = [
  "porque",
  "porquê",
  "como",
  "o que",
  "que e",
  "qual",
  "quais",
  "quanto",
  "quanta",
  "onde",
  "quando",
  "e se",
  "sera que",
  "why",
  "how",
  "what",
].map((word) => openerFold(word));
const exerciseWords = [
  "exercicio",
  "pergunta",
  "questao",
  "alinea",
  "resolucao",
  "resposta",
  "formula",
  "equacao",
  "passo",
  "ponto",
  "grafico",
  "figura",
  "angulo",
  "opcao",
  "calcul",
  "valor",
  "resultado",
  "conta",
  "sinal",
  "derivada",
  "funcao",
  "limite",
  "vetor",
  "forca",
  "velocidade",
  "aceleracao",
  "massa",
  "energia",
  "reacao",
  "ioes",
  "iao",
  "concentracao",
  "soluto",
  "triangulo",
  "area",
  "volume",
  "unidade",
  "solucao",
];
const stopWords = new Set([
  "para",
  "como",
  "porque",
  "quando",
  "onde",
  "qual",
  "quais",
  "isto",
  "isso",
  "aquilo",
  "esta",
  "este",
  "essa",
  "esse",
  "teu",
  "tua",
  "nome",
  "voce",
  "tens",
  "estas",
  "sobre",
  "entao",
  "mais",
  "menos",
  "muito",
  "pouco",
  "fazer",
  "dizer",
  "ser",
  "estar",
  "temos",
  "tenho",
  "pode",
  "podes",
  "sabes",
  "gostas",
]);
const enHintWords = ["hint", "clue", "nudge"];
const enAgainWords = [
  "explain better",
  "explain it better",
  "don't understand",
  "dont understand",
  "didn't get",
  "didnt get",
  "don't get",
  "dont get",
  "another way",
  "explain again",
  "explain it again",
  "differently",
  "still confused",
];
const enInterrogatives = ["why", "how", "what", "which", "where", "when", "what if", "is it", "does", "do i", "can i"];
const enExerciseWords = [
  "exercise",
  "question",
  "answer",
  "solution",
  "formula",
  "equation",
  "step",
  "point",
  "graph",
  "figure",
  "angle",
  "option",
  "calculat",
  "value",
  "result",
  "function",
  "derivative",
  "limit",
  "vector",
  "force",
  "velocity",
  "speed",
  "acceleration",
  "mass",
  "energy",
  "reaction",
  "ion",
  "concentration",
  "triangle",
  "area",
  "volume",
  "unit",
  "sign",
  "slope",
  "term",
  "minus",
  "plus",
];
const enStopWords = new Set([
  "what",
  "your",
  "name",
  "this",
  "that",
  "with",
  "from",
  "have",
  "about",
  "they",
  "there",
  "where",
  "which",
  "when",
  "doing",
  "today",
  "like",
  "favourite",
  "favorite",
  "time",
  "weather",
  "are",
  "you",
]);

function openerFold(text: string): string {
  return fold(text).replaceAll("-", " ");
}

const containsAny = (text: string, words: readonly string[]) => words.some((word) => text.includes(openerFold(word)));

const isQuestion = (text: string, words: readonly string[]) =>
  text.includes("?") || words.some((word) => text.startsWith(word + " ") || text.includes(" " + word + " "));

const contentWords = (text: string, stop: ReadonlySet<string>) =>
  new Set(text.split(/[^\p{L}\p{N}]+/u).filter((word) => Array.from(word).length >= 4 && !stop.has(word)));

function aboutExercise(
  text: string,
  questionText: string,
  words: readonly string[],
  stop: ReadonlySet<string>,
): boolean {
  if (words.some((word) => text.includes(word))) return true;
  // A symbol or number from the exercise: "o que é o x0?", "porque 9,8?"
  if (/\d/u.test(text) && questionText !== "") return true;
  const theirs = contentWords(openerFold(questionText), stop);
  return [...contentWords(text, stop)].some((word) => theirs.has(word));
}

export const VoiceTutorOpener = {
  locale: "pt-PT",

  /** The intent of `transcript`, or null when it is not confidently one of the explanation intents. */
  intent(transcript: string, questionText = "", language: TutorLanguage = "pt"): OpenerIntent | null {
    const text = openerFold(transcript);
    if (!/\p{L}/u.test(text)) return null;
    const step = StepRequests.parse(transcript);
    if (step) return { kind: "step", step };
    if (language === "en") {
      if (containsAny(text, enHintWords)) return { kind: "hint" };
      if (containsAny(text, enAgainWords)) return { kind: "explainAgain" };
      if (containsAny(text, ["explain"])) return { kind: "explain" };
      if (isQuestion(text, enInterrogatives) && aboutExercise(text, questionText, enExerciseWords, enStopWords))
        return { kind: "question" };
      return null;
    }
    if (containsAny(text, hintWords)) return { kind: "hint" };
    if (containsAny(text, againWords)) return { kind: "explainAgain" };
    if (containsAny(text, explainWords)) return { kind: "explain" };
    if (isQuestion(text, interrogatives) && aboutExercise(text, questionText, exerciseWords, stopWords))
      return { kind: "question" };
    return null;
  },

  /** The line to say for `transcript`, or null for no opener. `variant` rotates the wording. */
  lineFor(transcript: string, questionText = "", variant = 0, language: TutorLanguage = "pt"): string | null {
    const intent = VoiceTutorOpener.intent(transcript, questionText, language);
    return intent ? VoiceTutorOpener.line(intent, variant, language) : null;
  },

  line(intent: OpenerIntent, variant = 0, language: TutorLanguage = "pt"): string {
    let options: string[];
    if (language === "en") {
      switch (intent.kind) {
        case "step":
          options =
            intent.step.kind === "number"
              ? [
                  `Let's go to point ${intent.step.number}.`,
                  `Right, point ${intent.step.number}.`,
                  `OK, point ${intent.step.number}.`,
                ]
              : ["Let's go to the last point.", "Right, the last point.", "OK, the last point."];
          break;
        case "hint":
          options = ["Here's just a hint.", "Let me give you a hint.", "Just a hint, then."];
          break;
        case "explainAgain":
          options = ["Let me explain it another way.", "Let's try it another way.", "Let me put it differently."];
          break;
        case "explain":
          options = ["Let's take a look.", "Let's get into it.", "So, let's see."];
          break;
        case "question":
          options = ["Good question, let's see.", "Good question.", "Let's look at that."];
          break;
      }
    } else {
      switch (intent.kind) {
        case "step":
          options =
            intent.step.kind === "number"
              ? [
                  `Vamos ao ponto ${intent.step.number}.`,
                  `Certo, o ponto ${intent.step.number}.`,
                  `Olha, o ponto ${intent.step.number}.`,
                ]
              : ["Vamos ao último ponto.", "Certo, o último ponto.", "Olha, o último ponto."];
          break;
        case "hint":
          options = ["Dou-te só uma pista.", "Vou dar-te uma pista.", "Só uma pista, então."];
          break;
        case "explainAgain":
          options = [
            "Vou explicar de outra forma.",
            "Vamos tentar de outra maneira.",
            "Deixa-me explicar de outro jeito.",
          ];
          break;
        case "explain":
          options = ["Vamos lá ver isto.", "Vamos a isto.", "Então vamos ver."];
          break;
        case "question":
          options = ["Boa pergunta, vamos ver.", "Boa pergunta.", "Vamos ver isso."];
          break;
      }
    }
    return options[((variant % options.length) + options.length) % options.length]!;
  },

  allLines(intent: OpenerIntent, language: TutorLanguage = "pt"): string[] {
    return [0, 1, 2].map((variant) => VoiceTutorOpener.line(intent, variant, language));
  },

  /** Every opener line that ships as a recorded clip: each intent's three variants (steps 1 to 8). */
  recordedLines(language: TutorLanguage = "pt"): string[] {
    const intents: OpenerIntent[] = [
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((number): OpenerIntent => ({ kind: "step", step: { kind: "number", number } })),
      { kind: "step", step: { kind: "last" } },
      { kind: "hint" },
      { kind: "explainAgain" },
      { kind: "explain" },
      { kind: "question" },
    ];
    const seen = new Set<string>();
    return intents
      .flatMap((intent) => VoiceTutorOpener.allLines(intent, language))
      .filter((line) => !seen.has(line) && Boolean(seen.add(line)));
  },

  /** The recorded clip's file name (no extension): "opener-vamos-ao-ponto-2", "opener-en-let-s-take-a-look". */
  clipName(line: string, language: TutorLanguage = "pt"): string {
    const slug = Array.from(fold(line))
      .map((character) => (/^[a-z0-9]$/u.test(character) ? character : "-"))
      .join("");
    const name =
      "opener-" +
      slug
        .split("-")
        .filter((part) => part !== "")
        .join("-");
    return language === "pt" ? name : name.replace("opener-", `opener-${language}-`);
  },
};
