// Port of LearnLayer/Illustrations/PremadeFigureArgument.swift @ ref 2026-11-04 (and the text wrapping of
// PremadeFigureBatch4.swift): an argument as premises and a conclusion, its validity checked by a truth table (the
// rows where every premise is true decide it; the first where the conclusion is false is the counterexample), and
// whether it is also sound. The classic forms come with everyday examples in pt-PT.

import type { IllustrationParameter } from "../illustration";
import { Premade } from "../premadeFigure";
import { choiceIndex } from "./flowchart";
import { Anim, FigureCanvas, Params, slider, type AnimatedIllustration } from "./figureCanvas";
import { Prop, type PropFormula } from "./logic";

/** Width of one character of label text as it is drawn (Batch4 `textCharWidth`). */
export const textCharWidth = 0.165;

/** How many characters of label text fit in `width` world units once `padding` is kept clear on each side. */
export const charLimit = (width: number, padding: number) => Math.trunc((width - 2 * padding) / textCharWidth);

/** Words broken into lines of at most `limit` characters (a longer word keeps its own line). */
export function wrapped(text: string, limit: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ").filter((w) => w !== "")) {
    const next = current === "" ? word : current + " " + word;
    if (Array.from(next).length > limit && current !== "") {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current !== "") lines.push(current);
  return lines;
}

/** An argument in propositional logic: valid when no row makes every premise true and the conclusion false. */
export class ArgumentCheck {
  readonly names: string[];
  readonly rows: Record<string, boolean>[];

  constructor(
    readonly premises: PropFormula[],
    readonly conclusion: PropFormula,
  ) {
    const found = new Set(Prop.variables(conclusion));
    for (const premise of premises) for (const name of Prop.variables(premise)) found.add(name);
    this.names = [...found].sort();
    this.rows = Prop.assignments(this.names);
  }

  premisesHold(row: number): boolean {
    return this.premises.every((premise) => Prop.evaluate(premise, this.rows[row]!));
  }

  /** The rows where every premise is true: the only ones that decide validity. */
  get criticalRows(): number[] {
    return this.rows.map((_, row) => row).filter((row) => this.premisesHold(row));
  }

  /** The first row where the premises are true and the conclusion false. */
  get counterexample(): number | null {
    return this.criticalRows.find((row) => !Prop.evaluate(this.conclusion, this.rows[row]!)) ?? null;
  }

  get isValid(): boolean {
    return this.counterexample === null;
  }
}

interface ArgumentForm {
  key: string;
  name: [string, string];
  premises: string[];
  conclusion: string;
  premiseTexts: [string, string][];
  conclusionText: [string, string];
  /** Whether each premise is true of the world in the example. */
  premisesTrue: boolean[];
}

const rain: [string, string] = ["Se chove, a rua fica molhada.", "If it rains, the street is wet."];

/** Classic forms, each with an everyday example. */
export const argumentForms: ArgumentForm[] = [
  {
    key: "modusPonens",
    name: ["Modus ponens", "Modus ponens"],
    premises: ["p -> q", "p"],
    conclusion: "q",
    premiseTexts: [rain, ["Chove.", "It is raining."]],
    conclusionText: ["Logo, a rua fica molhada.", "So the street gets wet."],
    premisesTrue: [true, true],
  },
  {
    key: "modusTollens",
    name: ["Modus tollens", "Modus tollens"],
    premises: ["p -> q", "!q"],
    conclusion: "!p",
    premiseTexts: [rain, ["A rua não está molhada.", "The street is not wet."]],
    conclusionText: ["Logo, não chove.", "So it is not raining."],
    premisesTrue: [true, true],
  },
  {
    key: "hypotheticalSyllogism",
    name: ["Silogismo hipotético", "Hypothetical syllogism"],
    premises: ["p -> q", "q -> r"],
    conclusion: "p -> r",
    premiseTexts: [
      ["Se estudo, aprendo.", "If I study, I learn."],
      ["Se aprendo, passo no teste.", "If I learn, I pass the test."],
    ],
    conclusionText: ["Logo, se estudo, passo no teste.", "So if I study, I pass the test."],
    premisesTrue: [true, true],
  },
  {
    key: "disjunctiveSyllogism",
    name: ["Silogismo disjuntivo", "Disjunctive syllogism"],
    premises: ["p | q", "!p"],
    conclusion: "q",
    premiseTexts: [
      ["Vamos ao cinema ou ficamos em casa.", "We go to the cinema or we stay in."],
      ["Não vamos ao cinema.", "We are not going to the cinema."],
    ],
    conclusionText: ["Logo, ficamos em casa.", "So we stay in."],
    premisesTrue: [true, true],
  },
  {
    key: "affirmingConsequent",
    name: ["Afirmação do consequente: inválido", "Affirming the consequent: invalid"],
    premises: ["p -> q", "q"],
    conclusion: "p",
    premiseTexts: [rain, ["A rua está molhada.", "The street is wet."]],
    conclusionText: ["Logo, choveu.", "So it rained."],
    premisesTrue: [true, true],
  },
  {
    key: "denyingAntecedent",
    name: ["Negação do antecedente: inválido", "Denying the antecedent: invalid"],
    premises: ["p -> q", "!p"],
    conclusion: "!q",
    premiseTexts: [rain, ["Não choveu.", "It did not rain."]],
    conclusionText: ["Logo, a rua não está molhada.", "So the street is not wet."],
    premisesTrue: [true, true],
  },
  {
    key: "validButUnsound",
    name: ["Válido, mas não sólido", "Valid but not sound"],
    premises: ["p -> q", "p"],
    conclusion: "q",
    premiseTexts: [
      ["Se um animal tem asas, é uma ave.", "If it has wings, it is a bird."],
      ["O morcego tem asas.", "The bat has wings."],
    ],
    conclusionText: ["Logo, o morcego é uma ave.", "So the bat is a bird."],
    premisesTrue: [false, true],
  },
];

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

const argumentMap: Compiler = (params, title, language) => {
  const canvas = new FigureCanvas(language);

  // The argument: a classic form, or premises and a conclusion written as formulas.
  let heading: string;
  let formulas: string[];
  let conclusionFormula: string;
  let premiseTexts: string[];
  let conclusionText: string;
  let premisesTrue: boolean[] | null = null;
  let formChoice: number | null = null;
  if (params.has("form")) {
    const index = choiceIndex(
      params,
      "form",
      argumentForms.map((form) => form.key),
    );
    if (index === null) return null;
    const form = argumentForms[index]!;
    formChoice = index;
    heading = canvas.say(form.name[0], form.name[1]);
    formulas = form.premises;
    conclusionFormula = form.conclusion;
    premiseTexts = form.premiseTexts.map(([pt, en]) => canvas.say(pt, en));
    conclusionText = canvas.say(form.conclusionText[0], form.conclusionText[1]);
    premisesTrue = form.premisesTrue;
  } else {
    const entries = Premade.array(params.figure.params["premises"]);
    const conclusion = params.text("conclusion");
    if (!entries || entries.length < 1 || entries.length > 2 || !conclusion) return null;
    formulas = [];
    for (const entry of entries) {
      if (typeof entry !== "string") return null;
      formulas.push(entry);
    }
    conclusionFormula = conclusion;
    heading = canvas.say("Argumento: validade e solidez", "Argument: validity and soundness");
    const written = Premade.array(params.figure.params["premiseTexts"])?.filter(
      (t): t is string => typeof t === "string",
    );
    if (written && written.length !== formulas.length) return null;
    premiseTexts = written ?? [];
    conclusionText = params.text("conclusionText") ?? "";
    const flags = Premade.array(params.figure.params["premisesTrue"]);
    if (flags) {
      const values = flags.filter((f): f is boolean => typeof f === "boolean");
      if (values.length !== flags.length || values.length !== formulas.length) return null;
      premisesTrue = values;
    }
  }
  const parsedPremises: PropFormula[] = [];
  for (const text of formulas) {
    const formula = Prop.parse(text);
    if (!formula) return null;
    parsedPremises.push(formula);
  }
  const parsedConclusion = Prop.parse(conclusionFormula);
  if (!parsedConclusion) return null;
  const check = new ArgumentCheck(parsedPremises, parsedConclusion);
  if (check.names.length < 1 || check.names.length > 3) return null;
  // Without texts of their own, the boxes show the formulas.
  if (premiseTexts.length === 0) premiseTexts = parsedPremises.map(Prop.text);
  if (conclusionText === "") conclusionText = canvas.say("Logo, ", "So ") + Prop.text(parsedConclusion);

  // The verification table: the variables, the premises, then the conclusion.
  const headers = [...check.names, ...parsedPremises.map(Prop.text), Prop.text(parsedConclusion)];
  // Variables are one letter; a formula column keeps room on both sides of its text, so neighbours never touch.
  const widths = headers.map((header, column) =>
    column < check.names.length ? 0.4 : Math.max(0.5, Array.from(header).length * 0.168 + 0.28),
  );
  const total = widths.reduce((sum, w) => sum + w, 0);

  // The boxes of the argument, one under the other; a sentence needing more than two lines is refused.
  const texts = [...premiseTexts, conclusionText];
  const boxLeft = 0.9;
  const boxWidth = 4.1;
  const lineLimit = charLimit(boxWidth, 0.25);
  const lines = texts.map((text) => wrapped(text, lineLimit));
  if (!lines.every((ls) => ls.length >= 1 && ls.length <= 2 && ls.every((l) => Array.from(l).length <= lineLimit)))
    return null;
  const linePitch = 0.47;
  const boxLinePitch = 0.47;
  const heights = lines.map((ls) => (ls.length === 1 ? 0.56 : 1.0));
  // The gap holds the "+" or the arrow, so it is as tall as a line of text.
  const gap = 0.47;
  if (heights.reduce((sum, h) => sum + h, 0) + gap * (heights.length - 1) > 3.52) return null;
  const tops: number[] = [];
  let cursor = 5.22;
  for (const height of heights) {
    tops.push(cursor);
    cursor -= height + gap;
  }

  // The table takes what the boxes leave, from just right of them to the edge.
  const regionLeft = boxLeft + boxWidth + 0.2;
  const regionWidth = 9.8 - regionLeft;
  if (total > regionWidth) return null;
  const valid = check.isValid;
  const critical = check.criticalRows;
  const counterexample = check.counterexample;
  const trueText = canvas.say("V", "T");
  const falseText = canvas.say("F", "F");
  const tableLeft = regionLeft + (regionWidth - total) / 2;
  const lefts: number[] = [];
  let cell = tableLeft;
  for (const width of widths) {
    lefts.push(cell);
    cell += width;
  }
  const centre = (column: number) => lefts[column]! + widths[column]! / 2;
  const variableCount = check.names.length;
  const conclusionColumn = headers.length - 1;
  const rowCount = check.rows.length;
  const headerY = 4.95;
  const ruleY = 4.68;
  const pitch = 0.48;
  const rowBottom = (row: number) => ruleY - pitch * (row + 1);

  // Timing.
  const boxTimes = texts.map((_, index) => 0.3 + 1.0 * index);
  const tableAt = (boxTimes[boxTimes.length - 1] ?? 2.3) + 1.1;
  const rowStep = 0.8;
  const rowsStart = tableAt + 0.8;
  const tableEnd = rowsStart + rowStep * rowCount;

  canvas.caption(heading, { row: 0, color: "white", visible: Anim.after(0.1) });

  const tags = [...parsedPremises.map((_, i) => `P${i + 1}`), "C"];
  lines.forEach((boxLines, index) => {
    const isConclusion = index === texts.length - 1;
    const appears = Anim.after(boxTimes[index]!);
    const height = heights[index]!;
    const top = tops[index]!;
    canvas.box(boxLeft, top - height, boxWidth, height, { color: isConclusion ? "accent" : "white", visible: appears });
    canvas.label(tags[index]!, 0.45, top - height / 2, { anchor: "center", color: "muted", visible: appears });
    boxLines.forEach((line, lineIndex) => {
      const y = top - height / 2 + ((boxLines.length - 1) * boxLinePitch) / 2 - lineIndex * boxLinePitch;
      // The first line carries the whole sentence, so the label list still reads one sentence per box.
      canvas.label(line, boxLeft + boxWidth / 2, y, {
        anchor: "center",
        color: "white",
        visible: appears,
        sentence: lineIndex === 0 && boxLines.length > 1 ? texts[index]! : null,
      });
    });
    if (index > 0) {
      // A plus between the premises, an arrow down to the conclusion.
      const previousBottom = tops[index - 1]! - heights[index - 1]!;
      const x = boxLeft + boxWidth / 2;
      if (isConclusion) canvas.arrow(x, previousBottom, x, top, { color: "muted", visible: appears });
      else {
        canvas.line(x, previousBottom, x, top, { color: "muted", visible: appears });
        canvas.label("+", x + 0.25, (previousBottom + top) / 2, {
          anchor: "center",
          color: "muted",
          visible: appears,
          claim: false,
        });
      }
    }
  });

  // The table.
  const tableShown = Anim.after(tableAt);
  canvas.line(tableLeft, ruleY, tableLeft + total, ruleY, { color: "muted", visible: tableShown });
  const firstPremiseX = lefts[variableCount]!;
  const conclusionX = lefts[conclusionColumn]!;
  canvas.line(firstPremiseX, headerY + 0.25, firstPremiseX, rowBottom(rowCount - 1), {
    color: "muted",
    visible: tableShown,
  });
  canvas.line(conclusionX, headerY + 0.25, conclusionX, rowBottom(rowCount - 1), {
    color: "muted",
    visible: tableShown,
  });
  headers.forEach((header, column) =>
    canvas.label(header, centre(column), headerY, {
      anchor: "center",
      color: column === conclusionColumn ? "accent" : "white",
      visible: tableShown,
    }),
  );
  for (let row = 0; row < rowCount; row++) {
    const start = rowsStart + rowStep * row;
    const isCritical = critical.includes(row);
    const values = check.rows[row]!;
    headers.forEach((_, column) => {
      const value =
        column < variableCount
          ? (values[check.names[column]!] ?? false)
          : column < conclusionColumn
            ? Prop.evaluate(parsedPremises[column - variableCount]!, values)
            : Prop.evaluate(parsedConclusion, values);
      canvas.label(value ? trueText : falseText, centre(column), rowBottom(row) + pitch / 2, {
        anchor: "center",
        color: isCritical || column < variableCount ? "white" : "muted",
        visible: Anim.after(start + (column < variableCount ? 0 : 0.3)),
      });
    });
    // A row where every premise is true is marked: the conclusion must be true in it.
    if (isCritical)
      canvas.box(firstPremiseX + 0.03, rowBottom(row) + 0.03, cell - firstPremiseX - 0.06, pitch - 0.06, {
        color: row === counterexample ? "second" : "accent",
        visible: Anim.after(start + 0.3),
      });
  }

  // The verdict, and whether the argument is also sound.
  const verdictAt = Anim.after(tableEnd);
  let verdict = "";
  if (valid)
    verdict =
      critical.length === 0
        ? canvas.say("Válido, mas as premissas são incompatíveis", "Valid, but the premises are inconsistent")
        : canvas.say("Válido: premissas verdadeiras ⇒ conclusão verdadeira", "Valid: true premises ⇒ true conclusion");
  else if (counterexample !== null) {
    const assignment = check.names.map(
      (name) => `${name} = ${check.rows[counterexample]![name] ? trueText : falseText}`,
    );
    verdict = canvas.say("Inválido: contraexemplo com ", "Invalid: counterexample with ") + canvas.list(assignment);
  }
  canvas.caption(verdict, { row: 1, color: valid ? "accent" : "second", visible: verdictAt });
  const last = texts.length - 1;
  canvas.box(boxLeft, tops[last]! - heights[last]!, boxWidth, heights[last]!, {
    color: valid ? "accent" : "second",
    visible: verdictAt,
  });
  let soundness: string;
  if (!valid) soundness = canvas.say("Inválido: não pode ser sólido", "Invalid, so it cannot be sound");
  else if (premisesTrue) {
    const falseOnes = premisesTrue.map((flag, i) => (flag ? null : `P${i + 1}`)).filter((t): t is string => t !== null);
    soundness =
      falseOnes.length === 0
        ? canvas.say("Sólido: válido e premissas verdadeiras", "Sound: valid, with true premises")
        : canvas.say(
            `Válido, mas não sólido: ${falseOnes.join(" e ")} ${falseOnes.length > 1 ? "falsas" : "falsa"}`,
            `Valid but not sound: ${falseOnes.join(" and ")} false`,
          );
  } else soundness = canvas.say("Solidez: as premissas são verdadeiras?", "Sound only if the premises are true");
  // One line above the verdict, centred under the boxes, unless it would run into the bottom rows of the table: then
  // two lines in the space left of the table.
  const soundnessWidth = Array.from(soundness).length * textCharWidth;
  const tableBottom = rowBottom(rowCount - 1);
  if (2.85 + soundnessWidth / 2 > tableLeft - 0.15 && tableBottom < 1.35) {
    const room = tableLeft - 0.15 - 0.25;
    const soundLines = wrapped(soundness, Math.trunc(room / textCharWidth));
    if (soundLines.length < 1 || soundLines.length > 2) return null;
    soundLines.forEach((line, index) =>
      canvas.label(line, 0.25 + room / 2, 0.99 + linePitch * (soundLines.length - 1 - index), {
        anchor: "center",
        color: "white",
        visible: verdictAt,
        claim: false,
      }),
    );
  } else canvas.label(soundness, 2.85, 1.25, { anchor: "center", color: "white", visible: verdictAt, claim: false });

  const parameters: IllustrationParameter[] = [];
  if (formChoice !== null)
    parameters.push(
      slider("form", canvas.say("forma (0 a 6)", "form (0 to 6)"), formChoice, 0, argumentForms.length - 1),
    );
  canvas.recordSteps([
    0,
    ...boxTimes.map((t) => t + 0.4),
    tableAt + 0.4,
    ...check.rows.map((_, row) => rowsStart + rowStep * row + 0.5),
    tableEnd + 0.8,
  ]);
  return canvas.illustration(title, Anim.duration(tableEnd + 1.2), parameters);
};

/** The argument map, by premade type. */
export const argumentFigures: Record<string, Compiler> = { argumentMap };
