// Port of LearnLayer/Illustrations/FigureTopic.swift (the `FigureTopic` rules) @ ref 2026-11-04
// (`ComplexFigure` and the template drawing in the same file come with the figures in phase 6.)

/**
 * What a maths question is about, as far as its figure goes: read from the question's words by cheap local
 * rules, else from the solver's "topic" field. It decides which figure the app draws beside the solution, with
 * no separate request for a drawing.
 */
export const figureTopics = [
  /** Complex numbers: the plane with z and its power. */
  "complex",
  /** Points, lines and planes in an Oxyz frame. */
  "space",
  /** Monotony and extrema: the sign table. */
  "monotony",
  /** Continuity at a point: both branches. */
  "continuity",
  /** Trigonometry: the unit circle. */
  "unitCircle",
  /** Forces on a body on a slope. */
  "inclinedPlane",
  /** A function whose graph (zeros, extrema, a tangent) is the picture. */
  "function",
  "other",
] as const;
export type FigureTopic = (typeof figureTopics)[number];

/** Diacritics off, then lower case, as `folding(options: .diacriticInsensitive)` then `lowercased()`. */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .normalize("NFC")
    .toLowerCase();

const containsAny = (text: string, words: readonly string[]) => words.some((word) => text.includes(word));

/** Topics the app can draw from a template, beside the steps. */
export function drawsFromTemplate(topic: FigureTopic): boolean {
  return ["complex", "space", "unitCircle", "inclinedPlane", "function"].includes(topic);
}

/** The topic the question's own words name, or null when no rule matches. */
export function detectFigureTopic(text: string): FigureTopic | null {
  const lower = text.toLowerCase();
  const folded = fold(text);
  if (
    text.includes("ℂ") ||
    containsAny(lower, [
      "número complexo",
      "números complexos",
      "plano complexo",
      "afixo",
      "complex number",
      "complex plane",
    ]) ||
    /e\s*\^?\s*\{?\s*i\s*[θα\\]/u.test(lower)
  ) {
    return "complex";
  }
  if (
    containsAny(folded, ["plano inclinado", "inclined plane", "plan incline", "rampa"]) ||
    (folded.includes("atrito") && (folded.includes("plano") || folded.includes("encosta")))
  ) {
    return "inclinedPlane";
  }
  if (
    lower.includes("oxyz") ||
    containsAny(lower, ["referencial o.n. oxyz", "no espaço", "in space"]) ||
    (containsAny(lower, ["plano", "reta ", "recta ", "plane", "line "]) &&
      /\(\s*-?\d+\s*[,;]\s*-?\d+\s*[,;]\s*-?\d+\s*\)/.test(lower))
  ) {
    return "space";
  }
  if (containsAny(folded, ["circulo trigonometrico", "unit circle", "cercle trigonometrique", "trigonometr"])) {
    return "unitCircle";
  }
  const angle = folded.includes("angulo") || folded.includes("radiano");
  const ratio = /\b(seno|cosseno|coseno)\b/.test(folded);
  if (angle && ratio) return "unitCircle";
  if (
    containsAny(lower, ["monotonia", "extremos relativos", "extremo relativo", "monotony", "increasing", "decreasing"])
  ) {
    return "monotony";
  }
  if (containsAny(lower, ["contínua", "continuidade", "continuous", "continuity"])) return "continuity";
  const namesFunction = /\b(funcao|function|fonction)\b/.test(folded);
  const hasFormula = /\b[fg]\s*\(\s*[a-z]\s*\)/.test(folded);
  if (namesFunction && (hasFormula || containsAny(folded, ["grafico", "esboc", "parabola"]))) return "function";
  return null;
}

/** The exam already prints the curve, so a second copy of it adds nothing. */
export function examPrintsCurve(text: string): boolean {
  const folded = fold(text);
  const printed =
    containsAny(folded, [
      "na figura",
      "a figura mostra",
      "a figura representa",
      "esta representad",
      "the figure shows",
      "shown in the figure",
      "grafico seguinte",
      "grafico da figura",
    ]) || /representad\w* (na|pela) figura/.test(folded);
  if (!printed) return false;
  return containsAny(folded, ["parabola", "grafico de", "grafico da funcao", "graph of", "a curva"]);
}

/**
 * Whether a drawing belongs beside the steps. A topic with a template is drawn even when the model said no; a
 * curve the exam already prints is not.
 */
export function shouldDraw(options: {
  topic: FigureTopic | null;
  modelAsked: boolean;
  questionText: string;
  subjectAllows: boolean;
  diagramAid: boolean;
}): boolean {
  const { topic, modelAsked, questionText, subjectAllows, diagramAid } = options;
  if (!subjectAllows) return false;
  if (wants3D(questionText)) return true;
  if (examPrintsCurve(questionText) && (topic === null || topic === "function" || topic === "other")) return false;
  if (topic !== null && drawsFromTemplate(topic)) return true;
  return modelAsked || diagramAid;
}

/**
 * The text that decides a question's figure: its group's shared statement (the lines before the first numbered
 * item) and its own text. A group of separate questions must not make the spheres a circuit. A group with no item
 * line found, or a lone question, is read whole.
 */
export function topicText(groupText: string, ownText: string, groupLabels: readonly string[]): string {
  const own = ownText.trim();
  if (groupLabels.length <= 1 || own === "") return groupText;
  const lines = groupText.split(/\r\n|\r|\n/);
  const item = /^\s*(?:\d{1,2}\s*[.)]|\(?[a-z]\)|\([ivx]+\)|[IVX]+\.\d{1,2})\s/;
  const first = lines.findIndex((line) => item.test(line));
  if (first < 0) return groupText;
  const statement = lines.slice(0, first).join("\n");
  return statement === "" ? own : statement + "\n" + own;
}

/**
 * A volume or solid of revolution, or an electric circuit: the 3D premade figure explains it better than a plot
 * of the curve.
 */
export function wants3D(questionText: string): boolean {
  const folded = fold(questionText);
  const revolution =
    containsAny(folded, ["solido de revolucao", "solid of revolution", "volume of revolution"]) ||
    (folded.includes("volume") &&
      (folded.includes("rotacao") ||
        folded.includes("rotation") ||
        folded.includes("revolution") ||
        (folded.includes("rotating") && folded.includes("about") && folded.includes("axis"))));
  return revolution || isSolid(questionText) || isCircuit(questionText);
}

/** A solid's volume, a triple integral or a surface z = f(x, y): drawn by the generic 3D figure. */
export function isSolid(questionText: string): boolean {
  const folded = fold(questionText);
  const volumeOfSolid = folded.includes("volume") && containsAny(folded, ["solido", "solid "]);
  const triple = containsAny(folded, ["integral tripla", "triple integral", "integrais triplos", "integral triplo"]);
  const surface = (folded.includes("superficie") || folded.includes("surface")) && /\bz\s*=\s*[^=]/.test(folded);
  return volumeOfSolid || triple || surface;
}

/**
 * An electric circuit, from the words, the units or the parts, even when the PDF's text is scrambled (labels and
 * values loose between the options, Ω read as "W").
 */
export function isCircuit(questionText: string): boolean {
  const folded = fold(questionText);
  // prettier-ignore
  if (containsAny(folded, ["circuito eletrico", "circuito electrico", "electric circuit", "electrical circuit",
      "resistencia equivalente", "equivalent resistance", "equivalente de thevenin", "equivalente de norton",
      "thevenin equivalent", "norton equivalent", "lei de ohm", "ohm's law", "leis de kirchhoff", "kirchhoff"])) {
    return true;
  }
  // prettier-ignore
  const parts = ["resistencia", "resistor", "condensador", "capacitor", "bobina", "indutor", "inductor", "fonte de tensao",
    "fonte de corrente", "voltage source", "current source", "gerador de tensao", "pilha", "bateria", "battery",
    "amperimetro", "voltimetro", "ammeter", "voltmeter", "lampada", "interruptor"];
  // Values with electrical units: 2 kΩ, 1,5 kW (Ω in the Symbol font), 10 mH, 3 mA, 12 V, 4 μF.
  // W counts only when the statement is not about power or energy (there it is watts).
  const aboutPower = containsAny(folded, ["potencia", "power", "energia", "energy", "consum", "kwh", "dissip"]);
  const unitPattern = aboutPower
    ? /\d\s*(k|m|μ|u|n|p|M)?\s*(Ω|ohm|H\b|A\b|V\b|F\b)/gu
    : /\d\s*(k|m|μ|u|n|p|M)?\s*(Ω|ohm|W\b|H\b|A\b|V\b|F\b)/gu;
  const units = Array.from(questionText.matchAll(unitPattern)).length;
  const ohms = Array.from(questionText).filter((character) => character === "Ω").length;
  const namesPart = containsAny(folded, parts);
  // prettier-ignore
  const wiring = containsAny(folded, ["serie", "paralelo", "series", "parallel", "terminais", "terminals", "visto dos",
    "seen from", "malha", "mesh"]);
  const saysCircuit = /\b(circuito|circuit|circuits|circuitos)\b/.test(folded);
  if (saysCircuit && (namesPart || units > 0 || wiring)) return true;
  if (namesPart && (units > 0 || wiring)) return true;
  return ohms >= 2;
}

/** The rules first; the solver's word when they say nothing. */
export function figureTopicOf(questionText: string, solverTopic: string | null): FigureTopic | null {
  const detected = detectFigureTopic(questionText);
  if (detected !== null) return detected;
  return (figureTopics as readonly string[]).includes(solverTopic ?? "") ? (solverTopic as FigureTopic) : null;
}
