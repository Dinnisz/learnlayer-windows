// Port of LearnLayer/Voice/VoiceTutorGuard.swift @ ref 2026-11-04: cheap local checks on a spoken reply, against what
// is actually on screen. A curve is drawn only when the steps use that function, and a geometric relation is spoken
// only when the steps or the figure description state it. No network, no model.

import type { VoiceTutorReply } from "./voiceTutorReply";

/** Function names a plot expression can use, and the words a step uses for each. */
const functionWords: Record<string, string[]> = {
  sin: ["sin", "sen", "seno"],
  cos: ["cos", "coseno", "cosseno"],
  tan: ["tan", "tg", "tangente"],
  cot: ["cot", "cotg", "cotangente"],
  ln: ["ln", "log", "logaritmo"],
  exp: ["exp", "e^", "exponencial"],
  sqrt: ["sqrt", "raiz", "raiz quadrada", "√"],
  abs: ["abs", "módulo", "modulo", "|"],
};

/** Geometric relations the speech asserts (its words, and the sources' own words for them). */
const relations: { name: string; spoken: string[]; source: string[] }[] = [
  {
    name: "symmetric",
    spoken: ["simétric", "simetric", "simétrico"],
    source: ["simétric", "simetric", "symmetric", "reflet"],
  },
  {
    name: "midpoint",
    spoken: ["ponto médio", "ponto medio", "meio de"],
    source: ["médio", "medio", "midpoint", "metade"],
  },
  { name: "perpendicular", spoken: ["perpendicular"], source: ["perpendicular", "⊥", "perp", "90"] },
  { name: "parallel", spoken: ["paralel"], source: ["paralel", "parallel", "∥"] },
  { name: "bisector", spoken: ["bissetriz", "mediatriz"], source: ["bissetriz", "mediatriz", "bisector"] },
  {
    name: "collinear",
    spoken: [
      "alinhad",
      "colinear",
      "colineares",
      "esta entre",
      "estao entre",
      "entre eles",
      "entre elas",
      "fica entre",
    ],
    source: ["alinhad", "colinear", "collinear", "esta entre", "estao entre", "between", "entre eles", "entre elas"],
  },
  { name: "diameter", spoken: ["diametro", "diametralmente"], source: ["diametro", "diameter"] },
  {
    name: "right angle",
    spoken: ["ângulo reto", "angulo reto", "ângulo recto"],
    source: ["reto", "recto", "right angle", "90"],
  },
];

/** Spoken and written names of an angle, folded to one key. */
const angleNames: Record<string, string> = {
  alfa: "alfa",
  α: "alfa",
  alpha: "alfa",
  beta: "beta",
  β: "beta",
  gama: "gama",
  γ: "gama",
  gamma: "gama",
  teta: "teta",
  θ: "teta",
  theta: "teta",
  fi: "fi",
  φ: "fi",
  phi: "fi",
};

/** Phrases that mean the speech is correcting itself while talking. */
const corrections = [
  "alias,",
  "quer dizer",
  "na verdade",
  "ou melhor",
  "corrijo",
  "enganei-me",
  "perdao,",
  "i mean",
  "actually,",
];

/** Accents dropped, as `.diacriticInsensitive`. */
const withoutAccents = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
/** Accents and case dropped. */
const normalized = (text: string) => withoutAccents(text).toLowerCase();
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A word matched in either case, as ICU's `(?i:…)` (written out: JavaScript's inline flags are too new here). */
const anyCase = (word: string) =>
  Array.from(word)
    .map((ch) => (ch.toLowerCase() !== ch.toUpperCase() ? `[${ch.toLowerCase()}${ch.toUpperCase()}]` : escaped(ch)))
    .join("");
const containsWord = (text: string, word: string) => new RegExp(`\\b${escaped(word)}\\b`).test(text);

const angleNamePattern = [
  "alfa",
  "alpha",
  "beta",
  "gama",
  "gamma",
  "teta",
  "theta",
  "fi",
  "phi",
  "α",
  "β",
  "γ",
  "θ",
  "φ",
]
  .map(anyCase)
  .join("|");
const verbs = [
  "esta",
  "fica",
  "aparece",
  "situa-se",
  "e",
  "tem o vertice",
  "com vertice",
  "de vertice",
  "vertice",
  "is",
  "at",
  "sits",
]
  .map(anyCase)
  .join("|");
const places = ["em", "no ponto", "no vertice", "at"].map(anyCase).join("|");
const anglePattern = new RegExp(
  `(?<![A-Za-z])(${angleNamePattern})(?![A-Za-z])[^.;!?]{0,60}?` +
    `(?:\\b(?:${verbs})\\b)?` +
    `[^.;!?]{0,25}?(?:\\b(?:${places})\\s+)([A-Z])\\b`,
  "g",
);

export const VoiceTutorGuard = {
  /** Whether the plot's function is one the sources talk about. With no sources there is nothing to judge by. */
  plotIsUsed(expression: string, variable: string, sources: string): boolean {
    const text = normalized(sources);
    if (text === "") return true;
    const expr = expression.toLowerCase();
    let named = false;
    for (const [name, words] of Object.entries(functionWords)) {
      if (!containsWord(expr, name)) continue;
      named = true;
      if (!words.some((word) => text.includes(word))) return false;
    }
    // a^x: an exponential only when the steps write one.
    const flat = expr.replace(/ /g, "");
    const power = variable.toLowerCase();
    if (flat.includes(`^${power}`) || flat.includes(`^(${power})`)) {
      if (!text.includes("^") && !text.includes("exponencial") && !text.includes("exp")) return false;
    }
    if (named) return true;
    // A plain polynomial or ratio: every number it carries (besides 0, 1, 2) is in the text.
    const numbers = expr.split(/[^0-9.]+/).filter((number) => number !== "");
    return numbers.every((number) => ["0", "1", "2"].includes(number) || text.includes(number));
  },

  /** The reply without plots of a function the steps never use. Marks keep their own offsets. */
  droppingUnusedPlots(reply: VoiceTutorReply, sources: string): VoiceTutorReply {
    return {
      ...reply,
      drawing: reply.drawing.filter(
        (command) =>
          command.kind.op !== "plot" ||
          VoiceTutorGuard.plotIsUsed(command.kind.expression, command.kind.variable, sources),
      ),
    };
  },

  /** Relations the spoken text states that neither the steps, the question nor the figure description mention. */
  unsupportedRelations(spoken: string, sources: string): string[] {
    const said = normalized(spoken);
    const known = normalized(sources);
    if (known === "") return [];
    return relations
      .filter((relation) => relation.spoken.some((word) => said.includes(normalized(word))))
      .filter((relation) => !relation.source.some((word) => known.includes(normalized(word))))
      .map((relation) => relation.name);
  },

  /**
   * (angle, vertex) claims such as "o ângulo alfa está em O", "α aparece em B", "alfa, com vértice em C". The vertex is
   * one capital letter, as figures label points.
   */
  angleLocations(text: string): { angle: string; point: string }[] {
    const found: { angle: string; point: string }[] = [];
    for (const match of withoutAccents(text).matchAll(anglePattern)) {
      const angle = angleNames[match[1]!.toLowerCase()];
      if (angle) found.push({ angle, point: match[2]! });
    }
    return found;
  },

  /** Angles the speech puts at two different vertices ("alfa: O, B"): the model correcting itself mid-answer. */
  conflictingAngleLocations(spoken: string): string[] {
    const seen = new Map<string, string[]>();
    for (const claim of VoiceTutorGuard.angleLocations(spoken)) {
      const points = seen.get(claim.angle) ?? [];
      if (!points.includes(claim.point)) points.push(claim.point);
      seen.set(claim.angle, points);
    }
    return [...seen]
      .filter(([, points]) => points.length > 1)
      .map(([angle, points]) => `${angle}: ${points.join(", ")}`);
  },

  /**
   * Angle positions the speech states that the steps and figure description never give. A source supports "alfa at B"
   * when it states the same, or names the angle with B close by ("α, em B", "ângulo OBC = α").
   */
  unsupportedAngleLocations(spoken: string, sources: string): string[] {
    const known = withoutAccents(sources);
    if (known.trim() === "") return [];
    const stated = new Set(VoiceTutorGuard.angleLocations(known).map((claim) => `${claim.angle}@${claim.point}`));
    const flagged: string[] = [];
    for (const claim of VoiceTutorGuard.angleLocations(spoken)) {
      const key = `${claim.angle}@${claim.point}`;
      if (stated.has(key) || flagged.includes(key)) continue;
      if (mentionsNear(claim.angle, claim.point, known)) continue;
      flagged.push(key);
    }
    return flagged.map((key) => key.replace("@", " at "));
  },

  selfCorrections(spoken: string): string[] {
    const said = normalized(spoken);
    return corrections.filter((phrase) => said.includes(phrase));
  },

  /** Everything that looks wrong in a spoken reply against its sources. Empty when clean. Nothing here calls a model. */
  issues(spoken: string, sources: string): string[] {
    return [
      ...VoiceTutorGuard.unsupportedRelations(spoken, sources).map((name) => `relation: ${name}`),
      ...VoiceTutorGuard.conflictingAngleLocations(spoken).map((angle) => `angle moves: ${angle}`),
      ...VoiceTutorGuard.unsupportedAngleLocations(spoken, sources).map((angle) => `angle not in sources: ${angle}`),
      ...VoiceTutorGuard.selfCorrections(spoken).map((phrase) => `self-correction: ${phrase}`),
    ];
  },
};

function mentionsNear(angle: string, point: string, text: string): boolean {
  const names = Object.entries(angleNames)
    .filter(([, value]) => value === angle)
    .map(([key]) => anyCase(key))
    .join("|");
  // The angle within 12 characters of the point, either way round, or a three-letter angle name with the point in the
  // middle ("OBC") next to the symbol.
  const patterns = [
    `(?:${names})[^.;\\n]{0,12}\\b${point}\\b`,
    `\\b${point}\\b[^.;\\n]{0,12}(?:${names})`,
    `\\b[A-Z]${point}[A-Z]\\b[^.;\\n]{0,8}(?:${names})`,
  ];
  return patterns.some((pattern) => new RegExp(pattern).test(text));
}
