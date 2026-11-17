// Port of the square of opposition of LearnLayer/Illustrations/PremadeFigureFallacies.swift @ ref 2026-11-04: given one
// of A, E, I, O as true or false, what the square says of the other three (true, false or undetermined), worked out by
// the app from every way the regions can be empty, with or without the existential import.

import { Premade } from "../premadeFigure";
import { charLimit, wrapped } from "./argument";
import { Anim, FigureCanvas, Params, slider, type AnimatedIllustration } from "./figureCanvas";
import { kindLetters, type Kind } from "./syllogism";

export type Status = "isTrue" | "isFalse" | "open";
export type Relation = "contradictory" | "contrary" | "subcontrary" | "subalternation";

/** The four propositions about S and P, with the regions S∧P, S∧¬P, ¬S∧P, ¬S∧¬P possibly empty. */
export function statementHolds(kind: Kind, filled: boolean[]): boolean {
  switch (kind) {
    case 0:
      return !filled[1];
    case 1:
      return !filled[0];
    case 2:
      return filled[0]!;
    case 3:
      return filled[1]!;
  }
}

/** For A, E, I, O (in that order): must be true, must be false, or left open, given that `given` is `value`. */
export function squareStatuses(given: Kind, value: boolean, existentialImport: boolean): Status[] | null {
  const results: Set<boolean>[] = [new Set(), new Set(), new Set(), new Set()];
  let consistent = false;
  for (let pattern = 0; pattern < 16; pattern++) {
    const filled = [0, 1, 2, 3].map((r) => ((pattern >> r) & 1) === 1);
    // Regions 0 and 1 are the ones inside S: with the import, S has at least one member.
    if (existentialImport && !(filled[0] || filled[1])) continue;
    if (statementHolds(given, filled) !== value) continue;
    consistent = true;
    for (const kind of [0, 1, 2, 3] as Kind[]) results[kind]!.add(statementHolds(kind, filled));
  }
  if (!consistent) return null;
  return results.map((set) => (set.size === 1 ? (set.has(true) ? "isTrue" : "isFalse") : "open"));
}

/** How two propositions stand to each other on the square. */
export function squareRelation(a: Kind, b: Kind): Relation | null {
  const pair = [a, b].sort().join("");
  if (pair === "03" || pair === "12") return "contradictory";
  if (pair === "01") return "contrary";
  if (pair === "23") return "subcontrary";
  if (pair === "02" || pair === "13") return "subalternation";
  return null;
}

const flag = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  const number = Premade.number(value as never);
  return number === null || !Number.isFinite(number) ? null : number !== 0;
};

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

const squareOfOpposition: Compiler = (params, title, language) => {
  const canvas = new FigureCanvas(language);
  const subject = params.text("S");
  const predicate = params.text("P");
  if (!subject || !predicate || Array.from(subject).length > 8 || Array.from(predicate).length > 8) return null;
  const givenValue = params.figure.params["given"];
  if (givenValue === undefined) return null;
  let given: Kind | null = null;
  if (typeof givenValue === "string" && Array.from(givenValue).length === 1) {
    const index = kindLetters.indexOf(givenValue.toUpperCase());
    if (index >= 0) given = index as Kind;
  }
  if (given === null) {
    const number = Premade.number(givenValue);
    if (number === null || !Number.isFinite(number) || !(Math.abs(number) < 100)) return null;
    const index = Math.sign(number) * Math.round(Math.abs(number));
    if (index < 0 || index > 3) return null;
    given = index as Kind;
  }
  const value = params.has("value") ? flag(params.figure.params["value"]) : null;
  if (value === null) return null;
  let existentialImport = true;
  if (params.has("existentialImport")) {
    const parsed = flag(params.figure.params["existentialImport"]);
    if (parsed === null) return null;
    existentialImport = parsed;
  }
  const statuses = squareStatuses(given, value, existentialImport);
  if (!statuses) return null;
  const g = given;

  const texts = [
    canvas.say(`A: Tudo o que é ${subject} é ${predicate}`, `A: Everything that is ${subject} is ${predicate}`),
    canvas.say(`E: Nada do que é ${subject} é ${predicate}`, `E: Nothing that is ${subject} is ${predicate}`),
    canvas.say(`I: Existe algo que é ${subject} e é ${predicate}`, `I: Something is both ${subject} and ${predicate}`),
    canvas.say(
      `O: Existe algo que é ${subject} e não é ${predicate}`,
      `O: Something is ${subject} and is not ${predicate}`,
    ),
  ];
  // Two columns of boxes with a gap wide enough for the names of the relations written across it.
  const boxWidth = 3.7;
  const lineLimit = charLimit(boxWidth, 0.15);
  const pitch = 0.47;
  const leftEdge = 0.15;
  const rightEdge = 10 - 0.15 - boxWidth;
  const mostLines = Math.max(1, ...texts.map((text) => wrapped(text, lineLimit).length));
  if (mostLines > 3) return null;
  // Each box has its lines of text and one more row for what is known of it.
  const boxHeight = (mostLines + 1) * pitch + 0.1;
  const topY = 5.2 - boxHeight / 2;
  const bottomY = 0.8 + boxHeight / 2;
  const centres = [
    { x: leftEdge + boxWidth / 2, y: topY },
    { x: rightEdge + boxWidth / 2, y: topY },
    { x: leftEdge + boxWidth / 2, y: bottomY },
    { x: rightEdge + boxWidth / 2, y: bottomY },
  ];
  const innerLeft = leftEdge + boxWidth;
  const innerRight = rightEdge;
  const middleX = 5.0;
  const upperBottom = topY - boxHeight / 2;
  const lowerTop = bottomY + boxHeight / 2;
  const bandY = (upperBottom + lowerTop) / 2;

  canvas.caption(
    existentialImport
      ? canvas.say("Quadrado da oposição", "Square of opposition")
      : canvas.say(
          "Quadrado da oposição, sem pressuposto existencial",
          "Square of opposition, without existential import",
        ),
    { row: 0, color: "white", visible: Anim.after(0.1) },
  );
  const word = (status: Status) =>
    status === "isTrue"
      ? canvas.say("verdadeira", "true")
      : status === "isFalse"
        ? canvas.say("falsa", "false")
        : canvas.say("indeterminada", "undetermined");

  // The four propositions.
  for (const kind of [0, 1, 2, 3] as Kind[]) {
    const centre = centres[kind]!;
    const lines = wrapped(texts[kind]!, lineLimit);
    if (lines.length < 1 || lines.length > 3) return null;
    canvas.box(centre.x - boxWidth / 2, centre.y - boxHeight / 2, boxWidth, boxHeight, {
      color: kind === g ? "accent" : "white",
      visible: Anim.after(0.3),
    });
    const rows = lines.length + 1;
    lines.forEach((line, lineIndex) =>
      canvas.label(line, centre.x, centre.y + ((rows - 1) * pitch) / 2 - lineIndex * pitch, {
        anchor: "center",
        color: "white",
        visible: Anim.after(0.3),
      }),
    );
  }

  // The relations of the square, as arrows (a pair with an arrow at each end is two arrows from its middle).
  type Segment = [number, number, number, number];
  const sideLeftX = 1.0;
  const sideRightX = 9.0;
  const connectors: { pair: [Kind, Kind]; segments: Segment[] }[] = [
    {
      pair: [0, 3],
      segments: [
        [middleX, bandY, innerLeft, upperBottom],
        [middleX, bandY, innerRight, lowerTop],
      ],
    },
    {
      pair: [1, 2],
      segments: [
        [middleX, bandY, innerRight, upperBottom],
        [middleX, bandY, innerLeft, lowerTop],
      ],
    },
    {
      pair: [0, 1],
      segments: [
        [middleX, topY, innerLeft, topY],
        [middleX, topY, innerRight, topY],
      ],
    },
    {
      pair: [2, 3],
      segments: [
        [middleX, bottomY, innerLeft, bottomY],
        [middleX, bottomY, innerRight, bottomY],
      ],
    },
    { pair: [0, 2], segments: [[sideLeftX, upperBottom, sideLeftX, lowerTop]] },
    { pair: [1, 3], segments: [[sideRightX, upperBottom, sideRightX, lowerTop]] },
  ];
  const structureAt = Anim.after(0.8);
  for (const connector of connectors)
    for (const [ax, ay, bx, by] of connector.segments)
      canvas.arrow(ax, ay, bx, by, { color: "muted", visible: structureAt });
  // The names sit where nothing else is: across the band, or above the arrow in the gap between two boxes.
  const muted = { anchor: "center", color: "muted", visible: structureAt };
  canvas.label(canvas.say("contraditórias", "contradictories"), middleX, bandY, muted);
  canvas.label(canvas.say("contrárias", "contraries"), middleX, topY + 0.32, muted);
  canvas.label(canvas.say("subcontrárias", "subcontraries"), middleX, bottomY + 0.32, muted);
  canvas.label(canvas.say("subalternas", "subalterns"), sideLeftX + 0.15, bandY, { ...muted, anchor: "leading" });
  canvas.label(canvas.say("subalternas", "subalterns"), sideRightX - 0.15, bandY, { ...muted, anchor: "trailing" });

  // The proposition taken as given, then what follows for each of the others, the strongest relation first.
  const givenAt = 1.8;
  const statusY = (kind: Kind) => centres[kind]!.y - (wrapped(texts[kind]!, lineLimit).length * pitch) / 2;
  canvas.label(
    value ? canvas.say("dada verdadeira", "given true") : canvas.say("dada falsa", "given false"),
    centres[g]!.x,
    statusY(g),
    {
      anchor: "center",
      color: "accent",
      visible: Anim.after(givenAt),
      claim: false,
    },
  );
  const priority: Relation[] = ["contradictory", "contrary", "subcontrary", "subalternation"];
  const rank = (kind: Kind) => priority.indexOf(squareRelation(g, kind) ?? "subalternation");
  const others = ([0, 1, 2, 3] as Kind[]).filter((kind) => kind !== g).sort((a, b) => rank(a) - rank(b));
  const times: number[] = [];
  others.forEach((kind, position) => {
    const at = givenAt + 1.5 * (position + 1);
    times.push(at);
    const status = statuses[kind]!;
    const color = status === "isTrue" ? "accent" : status === "isFalse" ? "second" : "muted";
    canvas.label(word(status), centres[kind]!.x, statusY(kind), {
      anchor: "center",
      color,
      visible: Anim.after(at),
      claim: false,
    });
    // The relation that gives the answer lights up.
    const connector = connectors.find(
      (c) => (c.pair[0] === g && c.pair[1] === kind) || (c.pair[0] === kind && c.pair[1] === g),
    );
    if (connector)
      for (const [ax, ay, bx, by] of connector.segments)
        canvas.arrow(ax, ay, bx, by, { color: status === "open" ? "muted" : color, visible: Anim.after(at) });
  });
  const end = (times[times.length - 1] ?? givenAt) + 1.5;
  const summary = ([0, 1, 2, 3] as Kind[])
    .filter((kind) => kind !== g)
    .map((kind) => `${kindLetters[kind]} ${word(statuses[kind]!)}`);
  const givenName = kindLetters[g] + " " + (value ? canvas.say("verdadeira", "true") : canvas.say("falsa", "false"));
  canvas.caption(canvas.say(`Dada ${givenName}: `, `Given ${givenName}: `) + summary.join(", "), {
    row: 1,
    color: "accent",
    visible: Anim.after(end),
  });

  const parameters = [
    slider("given", canvas.say("dada (0A 1E 2I 3O)", "given (0A 1E 2I 3O)"), g, 0, 3),
    slider("value", canvas.say("valor (0 falsa, 1 verdadeira)", "value (0 false, 1 true)"), value ? 1 : 0, 0, 1),
    slider(
      "existentialImport",
      canvas.say("pressuposto existencial (0 não, 1 sim)", "existential import (0 no, 1 yes)"),
      existentialImport ? 1 : 0,
      0,
      1,
    ),
  ];
  canvas.recordSteps([0, 0.7, 1.3, givenAt + 0.6, ...times.map((t) => t + 0.6), end + 0.8]);
  return canvas.illustration(title, Anim.duration(end + 1.2), parameters);
};

/** The square of opposition, by premade type. */
export const squareFigures: Record<string, Compiler> = { squareOfOpposition };
