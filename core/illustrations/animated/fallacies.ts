// Port of the fallacies of LearnLayer/Illustrations/PremadeFigureFallacies.swift @ ref 2026-11-04: a common mistake of
// reasoning, with an everyday example in pt-PT, the leap that does not follow struck out, why it fails, and for the
// formal ones the counterexample a truth table finds. (The square of opposition in the same file comes next.)

import { ArgumentCheck, charLimit, wrapped } from "./argument";
import { choiceIndex } from "./flowchart";
import { Anim, FigureCanvas, Params, slider, type AnimatedIllustration } from "./figureCanvas";
import { Prop, type PropFormula } from "./logic";

type Words = [string, string];

export interface Fallacy {
  key: string;
  name: Words;
  premises: Words[];
  conclusion: Words;
  flaw: Words;
  /** For formal fallacies: the form in propositional logic, checked by truth table. */
  formal: { premises: string[]; conclusion: string } | null;
}

const rain: Words = ["Se chove, a rua fica molhada.", "If it rains, the street gets wet."];

export const fallacies: Fallacy[] = [
  {
    key: "adHominem",
    name: ["Ataque à pessoa (ad hominem)", "Attack on the person (ad hominem)"],
    premises: [
      ["O Pedro quer poupar na cantina.", "Pedro wants to save in the canteen."],
      ["O Pedro reprovou a Matemática.", "Pedro failed Maths."],
    ],
    conclusion: ["Logo, a proposta é má.", "So the proposal is bad."],
    flaw: [
      "Uma proposta avalia-se pelas suas razões, não por quem a faz. Reprovar a Matemática não diz nada sobre a cantina.",
      "A proposal is judged by its reasons, not by who makes it. Failing Maths says nothing about the canteen.",
    ],
    formal: null,
  },
  {
    key: "strawMan",
    name: ["Boneco de palha", "Straw man"],
    premises: [
      ["A Ana quer mais uma aula de Educação Física.", "Ana wants one more PE lesson."],
      ["O Rui diz que ela quer acabar com as outras disciplinas.", "Rui says she wants to abolish the other subjects."],
    ],
    conclusion: ["Logo, a Ana está errada.", "So Ana is wrong."],
    flaw: [
      "O Rui ataca uma caricatura da posição da Ana, não a posição que ela defendeu.",
      "Rui attacks a caricature of Ana's position, not the position she actually held.",
    ],
    formal: null,
  },
  {
    key: "appealToAuthority",
    name: ["Apelo à autoridade falaciosa", "Appeal to a false authority"],
    premises: [["Um famoso ator diz que esta dieta funciona.", "A famous actor says this diet works."]],
    conclusion: ["Logo, a dieta funciona.", "So the diet works."],
    flaw: [
      "O ator não é especialista em nutrição. Só a opinião de especialistas na matéria dá apoio sério a uma conclusão.",
      "The actor is no expert in nutrition. Only the opinion of experts in the field gives real support.",
    ],
    formal: null,
  },
  {
    key: "appealToPopularity",
    name: ["Apelo ao povo", "Appeal to the crowd (ad populum)"],
    premises: [["Toda a gente usa esta aplicação.", "Everybody uses this app."]],
    conclusion: ["Logo, a aplicação é segura.", "So the app is safe."],
    flaw: [
      "Muita gente acreditar ou fazer algo não prova que seja verdade ou seguro: popularidade não é prova.",
      "Many people believing or doing something does not make it true or safe: popularity is not proof.",
    ],
    formal: null,
  },
  {
    key: "falseDilemma",
    name: ["Falso dilema", "False dilemma"],
    premises: [
      ["Ou aprovas esta lei, ou és contra a segurança.", "Either you pass this law, or you are against safety."],
    ],
    conclusion: ["Logo, quem a recusa é contra a segurança.", "So whoever refuses it is against safety."],
    flaw: [
      "Só apresenta duas opções, quando há outras: pode-se apoiar a segurança e recusar esta lei.",
      "It offers only two options when there are others: one can support safety and still refuse this law.",
    ],
    formal: null,
  },
  {
    key: "slipperySlope",
    name: ["Derrapagem", "Slippery slope"],
    premises: [
      ["Com telemóveis no intervalo, vão usá-los nas aulas.", "With phones at break, they will be used in class."],
      ["Depois ninguém estuda e a escola fecha.", "Then nobody studies and the school closes."],
    ],
    conclusion: ["Logo, proíbe-se o telemóvel.", "So phones must be banned."],
    flaw: [
      "Passa de um primeiro passo a consequências extremas sem mostrar que cada passo tem de acontecer.",
      "It jumps from a first step to extreme results without showing that each step must happen.",
    ],
    formal: null,
  },
  {
    key: "hastyGeneralization",
    name: ["Generalização apressada", "Hasty generalisation"],
    premises: [["Dois alunos da turma B fizeram barulho.", "Two pupils of class B made noise."]],
    conclusion: ["Logo, a turma B é toda barulhenta.", "So all of class B is noisy."],
    flaw: [
      "Dois casos, escolhidos ao acaso, são uma amostra demasiado pequena para falar de todos os alunos.",
      "Two cases, picked at random, are too small a sample to speak of every pupil.",
    ],
    formal: null,
  },
  {
    key: "circularReasoning",
    name: ["Petição de princípio", "Begging the question (circular reasoning)"],
    premises: [
      ["O jornal diz sempre a verdade.", "The paper never lies."],
      ["Sabemo-lo porque o jornal o diz.", "We know: the paper says so."],
    ],
    conclusion: ["Logo, o jornal diz a verdade.", "So the paper tells the truth."],
    flaw: [
      "A conclusão já está nas premissas: o argumento dá voltas e não apresenta razões independentes.",
      "The conclusion is already in the premises: the argument goes round in circles with no independent reasons.",
    ],
    formal: null,
  },
  {
    key: "falseCause",
    name: ["Falsa causa (post hoc)", "False cause (post hoc)"],
    premises: [
      ["Vesti a camisola da sorte.", "I wore my lucky shirt."],
      ["Depois ganhámos o jogo.", "Then we won the match."],
    ],
    conclusion: ["Logo, a camisola fez-nos ganhar.", "So the shirt made us win."],
    flaw: [
      "Acontecer depois não é ser causado por: uma coincidência no tempo não prova uma causa.",
      "Coming after is not being caused by: a coincidence in time does not prove a cause.",
    ],
    formal: null,
  },
  {
    key: "affirmingConsequent",
    name: ["Afirmação do consequente", "Affirming the consequent"],
    premises: [rain, ["A rua está molhada.", "The street is wet."]],
    conclusion: ["Logo, choveu.", "So it rained."],
    flaw: [
      "A forma p → q, q ⊢ p é inválida: a rua pode estar molhada por outra razão.",
      "The form p → q, q ⊢ p is invalid: the street may be wet for another reason.",
    ],
    formal: { premises: ["p -> q", "q"], conclusion: "p" },
  },
  {
    key: "denyingAntecedent",
    name: ["Negação do antecedente", "Denying the antecedent"],
    premises: [rain, ["Não choveu.", "It did not rain."]],
    conclusion: ["Logo, a rua não está molhada.", "So the street is not wet."],
    flaw: [
      "A forma p → q, ¬p ⊢ ¬q é inválida: a rua pode estar molhada sem ter chovido.",
      "The form p → q, ¬p ⊢ ¬q is invalid: the street may be wet without rain.",
    ],
    formal: { premises: ["p -> q", "!p"], conclusion: "!q" },
  },
];

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

const fallacyFigure: Compiler = (params, title, language) => {
  const canvas = new FigureCanvas(language);
  const index = choiceIndex(
    params,
    "fallacy",
    fallacies.map((f) => f.key),
  );
  if (index === null) return null;
  const fallacy = fallacies[index]!;
  const say = (words: Words) => canvas.say(words[0], words[1]);

  // The example, in boxes one under the other (the conclusion last).
  const boxLeft = 0.6;
  const boxWidth = 4.4;
  const linePitch = 0.47;
  const lineLimit = charLimit(boxWidth, 0.15);
  const texts = [...fallacy.premises.map(say), say(fallacy.conclusion)];
  const lines = texts.map((text) => wrapped(text, lineLimit));
  if (!lines.every((ls) => ls.length >= 1 && ls.length <= 3)) return null;
  const heights = lines.map((ls) => ls.length * linePitch + 0.1);
  // Room between boxes for the "+" or, before the conclusion, the struck-out leap and its words.
  const gaps = texts.slice(1).map((_, i) => (i + 1 === texts.length - 1 ? 0.55 : 0.5));
  if (heights.reduce((s, h) => s + h, 0) + gaps.reduce((s, g) => s + g, 0) > 4.7) return null;
  const tops: number[] = [];
  let cursor = 5.0;
  heights.forEach((height, position) => {
    tops.push(cursor);
    cursor -= height + (position < gaps.length ? gaps[position]! : 0);
  });
  const arrowX = boxLeft + 0.8;
  const columnLeft = boxLeft + boxWidth + 0.4;

  // Why it fails, on the right; for a formal fallacy, with the counterexample the truth table finds.
  const explanation = wrapped(say(fallacy.flaw), charLimit(9.9 - columnLeft, 0));
  let counterexample: string[] | null = null;
  if (fallacy.formal) {
    const premises: PropFormula[] = [];
    for (const text of fallacy.formal.premises) {
      const parsed = Prop.parse(text);
      if (!parsed) return null;
      premises.push(parsed);
    }
    const conclusion = Prop.parse(fallacy.formal.conclusion);
    if (!conclusion) return null;
    const check = new ArgumentCheck(premises, conclusion);
    const row = check.counterexample;
    if (row === null) return null;
    const values = check.names.map(
      (name) => `${name} = ${check.rows[row]![name] ? canvas.say("V", "T") : canvas.say("F", "F")}`,
    );
    counterexample = wrapped(
      canvas.say("Contraexemplo: ", "Counterexample: ") + canvas.list(values),
      charLimit(9.9 - columnLeft, 0),
    );
  }
  const step = 0.48;
  const explanationTop = 4.47;
  if (explanation.length > 8) return null;
  const counterexampleY = explanationTop - step * explanation.length - 0.2;

  canvas.caption(canvas.say("Falácia: ", "Fallacy: ") + say(fallacy.name), {
    row: 0,
    color: "white",
    visible: Anim.after(0.1),
  });

  const boxTimes = texts.map((_, i) => 0.4 + 1.0 * i);
  const tags = [...fallacy.premises.map((_, i) => `P${i + 1}`), "C"];
  lines.forEach((boxLines, position) => {
    const isConclusion = position === texts.length - 1;
    const appears = Anim.after(boxTimes[position]!);
    const height = heights[position]!;
    const top = tops[position]!;
    canvas.box(boxLeft, top - height, boxWidth, height, { color: isConclusion ? "accent" : "white", visible: appears });
    canvas.label(tags[position]!, 0.35, top - height / 2, { anchor: "center", color: "muted", visible: appears });
    boxLines.forEach((line, lineIndex) => {
      const y = top - height / 2 + ((boxLines.length - 1) * linePitch) / 2 - lineIndex * linePitch;
      canvas.label(line, boxLeft + boxWidth / 2, y, { anchor: "center", color: "white", visible: appears });
    });
    if (position > 0) {
      const previousBottom = tops[position - 1]! - heights[position - 1]!;
      if (isConclusion) canvas.arrow(arrowX, previousBottom, arrowX, top, { color: "muted", visible: appears });
      else {
        canvas.line(arrowX, previousBottom, arrowX, top, { color: "muted", visible: appears });
        canvas.label("+", arrowX + 0.25, (previousBottom + top) / 2, {
          anchor: "center",
          color: "muted",
          visible: appears,
          claim: false,
        });
      }
    }
  });

  // The leap that does not follow: the last arrow is struck out and named.
  const last = texts.length - 1;
  const leapAt = (boxTimes[boxTimes.length - 1] ?? 2.4) + 1.2;
  const leapFrom = tops[last - 1]! - heights[last - 1]!;
  const leapTo = tops[last]!;
  canvas.line(arrowX, leapFrom, arrowX, leapTo, { color: "second", dashed: true, visible: Anim.after(leapAt) });
  canvas.label(canvas.say("✗ não se segue", "✗ does not follow"), arrowX + 0.25, (leapFrom + leapTo) / 2, {
    anchor: "leading",
    color: "second",
    visible: Anim.after(leapAt),
    claim: false,
  });
  canvas.box(boxLeft, tops[last]! - heights[last]!, boxWidth, heights[last]!, {
    color: "second",
    visible: Anim.after(leapAt),
  });

  const whyAt = leapAt + 1.2;
  canvas.label(canvas.say("Porque falha", "Why it fails"), columnLeft, 4.95, {
    anchor: "leading",
    color: "second",
    visible: Anim.after(whyAt),
  });
  explanation.forEach((line, lineIndex) =>
    canvas.label(line, columnLeft, explanationTop - step * lineIndex, {
      anchor: "leading",
      color: "white",
      visible: Anim.after(whyAt),
    }),
  );
  const boundaries = [0, ...boxTimes.map((t) => t + 0.4), leapAt + 0.4, whyAt + 0.4];
  let end = whyAt;
  if (counterexample) {
    const proofAt = whyAt + 1.2;
    counterexample.forEach((line, lineIndex) =>
      canvas.label(line, columnLeft, counterexampleY - step * lineIndex, {
        anchor: "leading",
        color: "accent",
        visible: Anim.after(proofAt),
      }),
    );
    boundaries.push(proofAt + 0.4);
    end = proofAt;
  }
  canvas.recordSteps(boundaries);
  const parameters = [
    slider("fallacy", canvas.say("falácia (0 a 10)", "fallacy (0 to 10)"), index, 0, fallacies.length - 1),
  ];
  return canvas.illustration(title, Anim.duration(end + 1.2), parameters);
};

/** The fallacies, by premade type. */
export const fallacyFigures: Record<string, Compiler> = { fallacies: fallacyFigure };
