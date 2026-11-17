// Port of LearnLayer/Illustrations/PremadeFigureSyllogism.swift @ ref 2026-11-04: categorical syllogisms (mood and
// figure), their validity found by trying every way the seven regions of three sets can be empty or not, and the
// three-circle Venn diagram the method draws (universal premises shade, particular ones put a cross).

import { Premade } from "../premadeFigure";
import { charLimit, wrapped } from "./argument";
import { Anim, FigureCanvas, Params, slider, type AnimatedIllustration } from "./figureCanvas";
import { integerParam } from "./loops";

interface Point {
  x: number;
  y: number;
}

/** The three terms: the subject S and the predicate P of the conclusion, and the middle term M (bits 0, 1, 2). */
export type Term = 0 | 1 | 2;
export const S: Term = 0;
export const P: Term = 1;
export const M: Term = 2;

/** The four categorical propositions: A "all x are y", E "no x is y", I "some x is y", O "some x is not y". */
export type Kind = 0 | 1 | 2 | 3;
export const kindLetters = ["A", "E", "I", "O"];
const isUniversal = (kind: Kind) => kind === 0 || kind === 1;
const kindOf = (letter: string): Kind | null => {
  const index = kindLetters.indexOf(letter.toUpperCase());
  return index < 0 ? null : (index as Kind);
};

export interface Statement {
  kind: Kind;
  subject: Term;
  predicate: Term;
}

const regionHas = (region: number, term: Term) => ((region >> term) & 1) === 1;
const otherTerm = (statement: Statement) => (3 - statement.subject - statement.predicate) as Term;

/** Whether the statement is true when region r (bit 0: in S, bit 1: in P, bit 2: in M) is non-empty as `filled` says. */
export function holds(statement: Statement, filled: boolean[]): boolean {
  const regions = filled.map((_, r) => r).filter((r) => regionHas(r, statement.subject));
  switch (statement.kind) {
    case 0:
      return regions.filter((r) => !regionHas(r, statement.predicate)).every((r) => !filled[r]);
    case 1:
      return regions.filter((r) => regionHas(r, statement.predicate)).every((r) => !filled[r]);
    case 2:
      return regions.some((r) => regionHas(r, statement.predicate) && filled[r]);
    case 3:
      return regions.some((r) => !regionHas(r, statement.predicate) && filled[r]);
  }
}

/** The regions the statement is about (for A and E: the ones it empties). */
export function statementRegions(statement: Statement): number[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].filter((region) => {
    if (!regionHas(region, statement.subject)) return false;
    return statement.kind === 0 || statement.kind === 3
      ? !regionHas(region, statement.predicate)
      : regionHas(region, statement.predicate);
  });
}

export type Verdict = "valid" | "validWithImport" | "invalid" | "incompatiblePremises";

/** The traditional names of the 24 valid moods; the nine marked need the existential import. */
export const syllogismNames: Record<string, string> = {
  "AAA-1": "Barbara",
  "EAE-1": "Celarent",
  "AII-1": "Darii",
  "EIO-1": "Ferio",
  "AAI-1": "Barbari",
  "EAO-1": "Celaront",
  "EAE-2": "Cesare",
  "AEE-2": "Camestres",
  "EIO-2": "Festino",
  "AOO-2": "Baroco",
  "EAO-2": "Cesaro",
  "AEO-2": "Camestros",
  "IAI-3": "Disamis",
  "AII-3": "Datisi",
  "OAO-3": "Bocardo",
  "EIO-3": "Ferison",
  "AAI-3": "Darapti",
  "EAO-3": "Felapton",
  "AEE-4": "Camenes",
  "IAI-4": "Dimaris",
  "EIO-4": "Fresison",
  "AAI-4": "Bramantip",
  "AEO-4": "Camenos",
  "EAO-4": "Fesapo",
};

export class Syllogism {
  constructor(
    readonly major: Kind,
    readonly minor: Kind,
    readonly conclusion: Kind,
    /** 1 to 4: where the middle term stands in the two premises. */
    readonly figure: number,
  ) {}

  /** "AAA-1": three letters and the figure. */
  static fromMood(text: string): Syllogism | null {
    const characters = Array.from(text.trim());
    if (characters.length !== 5 || (characters[3] !== "-" && characters[3] !== " ")) return null;
    const a = kindOf(characters[0]!);
    const b = kindOf(characters[1]!);
    const c = kindOf(characters[2]!);
    const figure = Number(characters[4]);
    if (a === null || b === null || c === null || !Number.isInteger(figure) || figure < 1 || figure > 4) return null;
    return new Syllogism(a, b, c, figure);
  }

  get majorStatement(): Statement {
    const middleFirst = this.figure === 1 || this.figure === 3;
    return { kind: this.major, subject: middleFirst ? M : P, predicate: middleFirst ? P : M };
  }

  get minorStatement(): Statement {
    const middleLast = this.figure === 1 || this.figure === 2;
    return { kind: this.minor, subject: middleLast ? S : M, predicate: middleLast ? M : S };
  }

  get conclusionStatement(): Statement {
    return { kind: this.conclusion, subject: S, predicate: P };
  }

  get mood(): string {
    return kindLetters[this.major]! + kindLetters[this.minor]! + kindLetters[this.conclusion]! + `-${this.figure}`;
  }

  /** Looks at every way the seven regions of three overlapping sets can be empty or not. */
  get verdict(): Verdict {
    let premisesCan = false;
    let failsAnywhere = false;
    let failsWithImport = false;
    for (let pattern = 0; pattern < 256; pattern++) {
      const filled = Array.from({ length: 8 }, (_, r) => ((pattern >> r) & 1) === 1);
      if (!holds(this.majorStatement, filled) || !holds(this.minorStatement, filled)) continue;
      premisesCan = true;
      if (holds(this.conclusionStatement, filled)) continue;
      failsAnywhere = true;
      const nonEmpty = [S, P, M].every((term) => filled.some((on, r) => regionHas(r, term) && on));
      if (nonEmpty) failsWithImport = true;
    }
    if (!premisesCan) return "incompatiblePremises";
    if (!failsAnywhere) return "valid";
    return failsWithImport ? "invalid" : "validWithImport";
  }

  /** Premises in the order they are put on the diagram: the universal ones first, as the method asks. */
  get drawingOrder(): Statement[] {
    const premises = [this.majorStatement, this.minorStatement];
    return [...premises.filter((p) => isUniversal(p.kind)), ...premises.filter((p) => !isUniversal(p.kind))];
  }

  /** The diagram after each premise in `drawingOrder`. */
  vennMarks(): VennMarks[] {
    const marks: VennMarks = { shaded: new Set(), crosses: [], inconsistent: false };
    const steps: VennMarks[] = [];
    for (const statement of this.drawingOrder) {
      if (isUniversal(statement.kind)) for (const region of statementRegions(statement)) marks.shaded.add(region);
      else {
        // Candidates differ only in the third term. One left unshaded takes the cross; two put it on the edge between.
        const open = statementRegions(statement).filter((r) => !marks.shaded.has(r) && r !== 0);
        const pole = open.length === 1 ? Venn.poles().get(open[0]!) : undefined;
        if (open.length === 1 && pole)
          marks.crosses.push({ point: pole.point, clearance: pole.clearance, regions: open });
        else if (open.length === 2) {
          const spot = Venn.edgePoint(
            otherTerm(statement),
            statement.subject,
            statement.predicate,
            statement.kind === 2,
          );
          if (spot) marks.crosses.push({ point: spot.point, clearance: spot.clearance, regions: open });
        } else marks.inconsistent = true;
      }
      steps.push({ shaded: new Set(marks.shaded), crosses: [...marks.crosses], inconsistent: marks.inconsistent });
    }
    return steps;
  }

  /** Whether the diagram of the premises already shows the conclusion. This is the method taught; `verdict` is the
   * proof. */
  get diagramShowsConclusion(): boolean {
    const marks = this.vennMarks().at(-1);
    if (!marks) return false;
    const regions = statementRegions(this.conclusionStatement);
    if (isUniversal(this.conclusion)) return regions.every((r) => marks.shaded.has(r));
    return marks.crosses.some((cross) => cross.regions.length > 0 && cross.regions.every((r) => regions.includes(r)));
  }
}

/** What the premises put on the diagram: the regions they empty, and where each "some" is marked. */
export interface VennMarks {
  shaded: Set<number>;
  crosses: { point: Point; clearance: number; regions: number[] }[];
  /** A premise that wants a cross where every candidate region is already empty. */
  inconsistent: boolean;
}

let polesCache: Map<number, { point: Point; clearance: number }> | null = null;

export const Venn = {
  /** S, P and M, in the order of the terms. */
  circles: [
    { centre: { x: 1.9, y: 3.6 }, radius: 1.0 },
    { centre: { x: 3.3, y: 3.6 }, radius: 1.0 },
    { centre: { x: 2.6, y: 2.4 }, radius: 1.0 },
  ],

  contains(circle: { centre: Point; radius: number }, point: Point): boolean {
    return Math.hypot(point.x - circle.centre.x, point.y - circle.centre.y) < circle.radius;
  },

  edgeDistance(circle: { centre: Point; radius: number }, point: Point): number {
    return Math.abs(Math.hypot(point.x - circle.centre.x, point.y - circle.centre.y) - circle.radius);
  },

  /** Bit 0: in S, bit 1: in P, bit 2: in M. */
  region(point: Point): number {
    let region = 0;
    Venn.circles.forEach((circle, index) => {
      if (Venn.contains(circle, point)) region |= 1 << index;
    });
    return region;
  },

  /** For each region inside at least one circle, the point farthest from every edge, found on a fine grid. */
  poles(): Map<number, { point: Point; clearance: number }> {
    if (polesCache) return polesCache;
    const best = new Map<number, { point: Point; clearance: number }>();
    for (let y = 1.3; y <= 4.7; y += 0.02)
      for (let x = 0.8; x <= 4.4; x += 0.02) {
        const point = { x, y };
        const region = Venn.region(point);
        if (region === 0) continue;
        const clearance = Math.min(...Venn.circles.map((circle) => Venn.edgeDistance(circle, point)));
        if (clearance > (best.get(region)?.clearance ?? -1)) best.set(region, { point, clearance });
      }
    polesCache = best;
    return best;
  },

  /** A point on the edge of circle `edge` lying inside `inside` and, as asked, inside or outside `other`. */
  edgePoint(edge: Term, inside: Term, other: Term, otherInside: boolean): { point: Point; clearance: number } | null {
    const ring = Venn.circles[edge]!;
    let best: { point: Point; clearance: number } | null = null;
    for (let step = 0; step < 720; step++) {
      const angle = (step * Math.PI) / 360;
      const point = {
        x: ring.centre.x + ring.radius * Math.cos(angle),
        y: ring.centre.y + ring.radius * Math.sin(angle),
      };
      if (!Venn.contains(Venn.circles[inside]!, point) || Venn.contains(Venn.circles[other]!, point) !== otherInside)
        continue;
      const clearance = Math.min(
        Venn.edgeDistance(Venn.circles[inside]!, point),
        Venn.edgeDistance(Venn.circles[other]!, point),
      );
      if (clearance > (best?.clearance ?? -1)) best = { point, clearance };
    }
    return best;
  },
};

// MARK: The figure

function statementText(statement: Statement, terms: string[], canvas: FigureCanvas): string {
  const x = terms[statement.subject]!;
  const y = terms[statement.predicate]!;
  switch (statement.kind) {
    case 0:
      return canvas.say(`Tudo o que é ${x} é ${y}`, `Everything that is ${x} is ${y}`);
    case 1:
      return canvas.say(`Nada do que é ${x} é ${y}`, `Nothing that is ${x} is ${y}`);
    case 2:
      return canvas.say(`Existe algo que é ${x} e é ${y}`, `Something is both ${x} and ${y}`);
    case 3:
      return canvas.say(`Existe algo que é ${x} e não é ${y}`, `Something is ${x} and is not ${y}`);
  }
}

/** Reads a one-letter option (A, E, I, O) written as a letter or as 0 to 3. */
function kindParam(params: Params, key: string): Kind | null {
  const value = params.figure.params[key];
  if (value === undefined) return null;
  if (typeof value === "string" && Array.from(value).length === 1) {
    const kind = kindOf(value);
    if (kind !== null) return kind;
  }
  const number = Premade.number(value);
  if (number === null || !Number.isFinite(number) || !(Math.abs(number) < 100)) return null;
  const index = Math.sign(number) * Math.round(Math.abs(number));
  return index >= 0 && index <= 3 ? (index as Kind) : null;
}

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

const syllogismVenn: Compiler = (params, title, language) => {
  const canvas = new FigureCanvas(language);
  let syllogism: Syllogism | null;
  if (params.has("major") || params.has("minor") || params.has("conclusion") || params.has("figure")) {
    const major = kindParam(params, "major");
    const minor = kindParam(params, "minor");
    const conclusion = kindParam(params, "conclusion");
    const figure = integerParam(params, "figure");
    if (major === null || minor === null || conclusion === null || figure === null || figure < 1 || figure > 4)
      return null;
    syllogism = new Syllogism(major, minor, conclusion, figure);
  } else {
    const mood = params.text("mood");
    syllogism = mood ? Syllogism.fromMood(mood) : null;
  }
  if (!syllogism) return null;
  const terms: string[] = [];
  for (const key of ["S", "P", "M"]) {
    const text = params.text(key);
    if (!text || Array.from(text).length > 10) return null;
    terms.push(text);
  }
  const verdict = syllogism.verdict;
  const marks = syllogism.vennMarks();
  const order = syllogism.drawingOrder;
  const statements = [syllogism.majorStatement, syllogism.minorStatement, syllogism.conclusionStatement];

  // What each proposition says, in words: the model's own, or the neutral wording.
  let lines = statements.map((statement) => statementText(statement, terms, canvas));
  const written = Premade.array(params.figure.params["texts"]);
  if (written) {
    const texts = written.filter((t): t is string => typeof t === "string");
    if (texts.length !== 3) return null;
    lines = texts;
  }
  const prefixes = ["P1: ", "P2: ", "C: "];
  const blocksText = lines.map((line, i) => wrapped(prefixes[i]! + line, charLimit(4.5, 0.1)));
  if (!blocksText.every((ls) => ls.length >= 1 && ls.length <= 3)) return null;

  // The right-hand column: the key to S, M and P, then the three propositions.
  const columnLeft = 5.3;
  const step = 0.48;
  const legendLines = [`S = ${terms[0]}  ·  M = ${terms[2]}`, `P = ${terms[1]}`];
  const legendTop = 5.0;
  const blockGap = 0.05;
  let cursor = legendTop - step * legendLines.length - blockGap;
  const blocks: { top: number; lines: string[] }[] = [];
  for (const blockLines of blocksText) {
    blocks.push({ top: cursor, lines: blockLines });
    cursor -= step * blockLines.length + blockGap;
  }
  // The last line must stay clear of the verdict below.
  if (cursor + blockGap + step < 0.98) return null;

  const name = syllogismNames[syllogism.mood];
  let heading = canvas.say(`Silogismo ${syllogism.mood}`, `Syllogism ${syllogism.mood}`);
  if (name) heading += `: ${name}`;
  canvas.caption(heading, { row: 0, color: "white", visible: Anim.after(0.1) });

  // The circles and their letters.
  const circlesAt = Anim.after(0.2);
  for (const circle of Venn.circles)
    canvas.ring(circle.centre.x, circle.centre.y, circle.radius, { color: "white", visible: circlesAt });
  canvas.label("S", 1.05, 4.45, { anchor: "center", color: "white", visible: circlesAt });
  canvas.label("P", 4.15, 4.45, { anchor: "center", color: "white", visible: circlesAt });
  canvas.label("M", 3.7, 1.35, { anchor: "center", color: "white", visible: circlesAt });
  legendLines.forEach((line, offset) =>
    canvas.label(line, columnLeft, legendTop - step * offset, {
      anchor: "leading",
      color: "muted",
      visible: circlesAt,
    }),
  );

  // The propositions, each lit while it is being put on the diagram (or checked, for the conclusion).
  const premiseTimes = [1.2, 2.8];
  const conclusionTime = 4.4;
  const end = 5.8;
  const sameStatement = (a: Statement, b: Statement) =>
    a.kind === b.kind && a.subject === b.subject && a.predicate === b.predicate;
  blocks.forEach((block, index) => {
    const height = step * block.lines.length;
    block.lines.forEach((line, lineIndex) =>
      canvas.label(line, columnLeft, block.top - step * lineIndex, {
        anchor: "leading",
        color: index === 2 ? "accent" : "white",
        visible: Anim.after(0.4),
      }),
    );
    const position = order.findIndex((statement) => sameStatement(statement, statements[index]!));
    const time = index === 2 ? conclusionTime : premiseTimes[position < 0 ? index : position]!;
    canvas.box(columnLeft - 0.1, block.top - height + step / 2 - 0.03, 4.5, height + 0.06, {
      color: index === 2 ? "accent" : "second",
      visible: Anim.window(time - 0.4, time + 1.2),
    });
  });

  // The marks the premises leave, in the order they are drawn: shading as slanted strokes, a cross for "some".
  let shadedSoFar = new Set<number>();
  let crossesSoFar = 0;
  marks.forEach((mark, index) => {
    const appears = Anim.after(premiseTimes[index]!);
    for (const region of [...mark.shaded].filter((r) => !shadedSoFar.has(r)).sort((a, b) => a - b)) {
      const pole = Venn.poles().get(region);
      if (!pole) continue;
      const size = Math.min(0.2, pole.clearance * 0.85);
      for (const offset of [-0.5, 0, 0.5]) {
        const shift = offset * size * 0.9;
        canvas.line(
          pole.point.x - size + shift,
          pole.point.y - size - shift,
          pole.point.x + size + shift,
          pole.point.y + size - shift,
          {
            color: "second",
            visible: appears,
          },
        );
      }
    }
    shadedSoFar = mark.shaded;
    for (const cross of mark.crosses.slice(crossesSoFar)) {
      const size = Math.min(0.13, Math.max(cross.clearance, 0.05) * 0.9);
      canvas.line(cross.point.x - size, cross.point.y - size, cross.point.x + size, cross.point.y + size, {
        color: "second",
        visible: appears,
      });
      canvas.line(cross.point.x - size, cross.point.y + size, cross.point.x + size, cross.point.y - size, {
        color: "second",
        visible: appears,
      });
    }
    crossesSoFar = mark.crosses.length;
  });

  // The verdict.
  const verdicts: Record<Verdict, [string, string, string]> = {
    valid: [
      "Válido: o diagrama das premissas contém a conclusão",
      "Valid: the premises' diagram already holds the conclusion",
      "accent",
    ],
    validWithImport: [
      "Válido só se nenhum termo for vazio (pressuposto existencial)",
      "Valid only if no term is empty (existential import)",
      "accent",
    ],
    invalid: [
      "Inválido: o diagrama das premissas não garante a conclusão",
      "Invalid: the premises' diagram does not guarantee the conclusion",
      "second",
    ],
    incompatiblePremises: [
      "Premissas incompatíveis: nenhuma situação as satisfaz",
      "Inconsistent premises: no situation satisfies them",
      "second",
    ],
  };
  const [pt, en, color] = verdicts[verdict];
  canvas.caption(canvas.say(pt, en), { row: 1, color, visible: Anim.after(end) });

  const kindLabel = "(0A 1E 2I 3O)";
  const parameters = [
    slider("major", canvas.say("premissa maior ", "major premise ") + kindLabel, syllogism.major, 0, 3),
    slider("minor", canvas.say("premissa menor ", "minor premise ") + kindLabel, syllogism.minor, 0, 3),
    slider("conclusion", canvas.say("conclusão ", "conclusion ") + kindLabel, syllogism.conclusion, 0, 3),
    slider("figure", canvas.say("figura (1 a 4)", "figure (1 to 4)"), syllogism.figure, 1, 4),
  ];
  canvas.recordSteps([0, 0.9, premiseTimes[0]! + 0.5, premiseTimes[1]! + 0.5, conclusionTime + 0.6, end + 0.8]);
  return canvas.illustration(title, Anim.duration(end + 1.2), parameters);
};

/** The syllogism figure, by premade type. */
export const syllogismFigures: Record<string, Compiler> = { syllogismVenn };
