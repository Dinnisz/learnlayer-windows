// Port of LearnLayerTests/PremadeFigureBatch4Tests.swift @ ref 2026-11-04 (`Batch4Check` and the general suite): what
// every batch 4 figure must satisfy — it draws, moves, stays inside the picture, keeps its labels apart, keeps its text
// inside its boxes and its loose labels clear of them, at every step, at the extremes and every stop of its sliders,
// and in English with no Portuguese left in it. The invalid params are checked with each family.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration } from "../illustration";
import { IllustrationPrompt } from "../illustrationPrompt";
import { applyingPremadeFigure, PremadeFigures, type PremadeFigure } from "../premadeFigure";
import { animatedGallery, sample } from "./animated";
import { argumentForms } from "./argument";
import { FigureCanvas, LabelBoard, withinBounds } from "./figureCanvas";
import { flowchartPrograms } from "./flowchart";
import { arrayLoopTasks } from "./loops";
import { animates, boundsProblems, isShown, overlapProblems, times, values } from "./sceneCheck";

const portuguese = "Portuguese (Portugal)";
/** `PremadeFigure.Batch4Kind.allCases` on the Mac. */
const batch4Kinds = [
  "truthTable",
  "logicGates",
  "flowchart",
  "arrayLoop",
  "recursionTree",
  "argumentMap",
  "syllogismVenn",
  "fallacies",
  "squareOfOpposition",
];
const gallery = animatedGallery.filter((figure) => batch4Kinds.includes(figure.type));
const compile = (figure: PremadeFigure, language = portuguese) => new PremadeFigures(figure).compile("t", language);
const merge = (figure: PremadeFigure, sliders: Record<string, number>) =>
  new PremadeFigures(figure).mergingParameters(sliders);
const name = (figure: PremadeFigure) => `${figure.type} ${JSON.stringify(figure.params)}`;

// MARK: Text in boxes, and labels between boxes

/** Width of one character as it is drawn: a little more than `LabelBoard.charWidth`, which real text exceeds. */
const drawnCharWidth = 0.14;
/** Clear space that text keeps from the sides of the box that holds it. */
const boxPadding = 0.05;

interface Span {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
const centreX = (s: Span) => (s.minX + s.maxX) / 2;
const centreY = (s: Span) => (s.minY + s.maxY) / 2;
const contains = (s: Span, x: number, y: number) => x > s.minX && x < s.maxX && y > s.minY && y < s.maxY;
const intersects = (a: Span, b: Span) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

/** The boxes (rectangles) shown at `time`. */
function boxSpans(scene: Illustration, time: number): Span[] {
  const compiled = new CompiledIllustration(scene);
  const at = values(time);
  return scene.elements.flatMap((e) => {
    if (e.kind !== "rect" || !isShown(e, compiled, at)) return [];
    const [x, y, w, h] = [e.x, e.y, e.w, e.h].map((t) => compiled.value(t ?? "", at));
    if ([x, y, w, h].some((v) => v === null || !Number.isFinite(v))) return [];
    return [
      {
        minX: Math.min(x!, x! + w!),
        maxX: Math.max(x!, x! + w!),
        minY: Math.min(y!, y! + h!),
        maxY: Math.max(y!, y! + h!),
      },
    ];
  });
}

/** The text of every label shown at `time` with the room it takes, at the width it is drawn. */
function labelSpans(scene: Illustration, time: number): { text: string; span: Span }[] {
  const compiled = new CompiledIllustration(scene);
  const at = values(time);
  return scene.elements.flatMap((e) => {
    if (e.kind !== "label" || !e.text || !isShown(e, compiled, at)) return [];
    const x = compiled.value(e.x ?? "", at);
    const y = compiled.value(e.y ?? "", at);
    if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return [];
    const width = Array.from(e.text).length * drawnCharWidth;
    const anchor = e.anchor ?? "leading";
    const minX = anchor === "trailing" ? x - width : anchor === "center" ? x - width / 2 : x;
    return [
      {
        text: e.text,
        span: { minX, maxX: minX + width, minY: y - LabelBoard.labelHeight / 2, maxY: y + LabelBoard.labelHeight / 2 },
      },
    ];
  });
}

/**
 * Two kinds of problem at `time`. Text whose middle lies inside a box must fit between the box's sides with some
 * padding. A label that belongs to no box but sits between two of them (one on each side, or one above and one below)
 * must clear both boxes and every other label outside the boxes.
 */
function fitProblems(scene: Illustration, time: number): string[] {
  const boxes = boxSpans(scene, time);
  const labels = labelSpans(scene, time);
  const problems: string[] = [];
  const loose: { text: string; span: Span }[] = [];
  for (const label of labels) {
    const holders = boxes.filter((box) => contains(box, centreX(label.span), centreY(label.span)));
    if (holders.length === 0) loose.push(label);
    else if (holders.every((box) => label.span.minX < box.minX + boxPadding || label.span.maxX > box.maxX - boxPadding))
      problems.push(`“${label.text}” does not fit inside its box with padding when t = ${time}`);
  }
  const between = loose.filter((label) => {
    const x = centreX(label.span);
    const y = centreY(label.span);
    const acrossRow =
      boxes.some((b) => b.maxX <= x && b.minY < y && y < b.maxY) &&
      boxes.some((b) => b.minX >= x && b.minY < y && y < b.maxY);
    const acrossColumn =
      boxes.some((b) => b.maxY <= y && b.minX < x && x < b.maxX) &&
      boxes.some((b) => b.minY >= y && b.minX < x && x < b.maxX);
    return acrossRow || acrossColumn;
  });
  for (const label of between) {
    if (boxes.some((box) => intersects(box, label.span)))
      problems.push(`“${label.text}” runs into a box when t = ${time}`);
    for (const other of loose) {
      if (other === label) continue;
      const shrunk = {
        minX: other.span.minX + 0.02,
        maxX: other.span.maxX - 0.02,
        minY: other.span.minY + 0.02,
        maxY: other.span.maxY - 0.02,
      };
      if (intersects(label.span, shrunk)) problems.push(`“${label.text}” runs into “${other.text}” when t = ${time}`);
    }
  }
  return problems;
}

/** Problems with a compiled scene, at the sampled moments and at every step of the step-by-step playback. */
function problems(scene: Illustration, label: string): string[] {
  const found: string[] = [];
  if (!((scene.duration ?? 0) > 0)) found.push(`${label} has no duration`);
  if (!new CompiledIllustration(scene).isDrawable) found.push(`${label} is not drawable`);
  if (!animates(scene)) found.push(`${label} does not change over its duration`);
  if (!withinBounds(scene)) found.push(`${label} leaves the picture`);
  const moments = times(scene);
  const steps = (scene as { stepPlayback?: { boundaries: number[] } | null }).stepPlayback?.boundaries;
  if (steps) {
    if (steps.length < 2) found.push(`${label} has fewer than two steps`);
    steps.forEach((time, index) => {
      if (index > 0 && time <= steps[index - 1]!) found.push(`${label}: steps are not increasing at ${index}`);
      if (time > (scene.duration ?? 0)) found.push(`${label}: step ${index} is after the end`);
    });
    moments.push(...steps);
  } else found.push(`${label} has no step playback`);
  for (const time of moments) {
    found.push(
      ...boundsProblems(scene, time)
        .slice(0, 3)
        .map((p) => `${label}: ${p}`),
    );
    found.push(
      ...overlapProblems(scene, time)
        .slice(0, 3)
        .map((p) => `${label}: ${p}`),
    );
    found.push(
      ...fitProblems(scene, time)
        .slice(0, 3)
        .map((p) => `${label}: ${p}`),
    );
  }
  return found;
}

/** The figure with every slider moved to its lowest, or highest, value (and each alone). */
function extremes(figure: PremadeFigure, scene: Illustration): [string, PremadeFigure][] {
  const parameters = scene.parameters ?? [];
  if (parameters.length === 0) return [];
  const result: [string, PremadeFigure][] = [
    ["all low", merge(figure, Object.fromEntries(parameters.map((p) => [p.name, p.min])))],
    ["all high", merge(figure, Object.fromEntries(parameters.map((p) => [p.name, p.max])))],
  ];
  for (const p of parameters) {
    result.push([`${p.name} low`, merge(figure, { [p.name]: p.min })]);
    result.push([`${p.name} high`, merge(figure, { [p.name]: p.max })]);
  }
  return result;
}

/** Positions of each slider, one slider at a time: every integer stop when there are few, else eight spread from end to end. */
function everyStop(figure: PremadeFigure, scene: Illustration): [string, PremadeFigure][] {
  const result: [string, PremadeFigure][] = [];
  for (const p of scene.parameters ?? []) {
    const span = Math.round(p.max - p.min);
    const stops =
      span <= 8
        ? Array.from({ length: Math.max(span, 0) + 1 }, (_, i) => p.min + i)
        : Array.from({ length: 8 }, (_, i) => Math.round(p.min + (span * i) / 7));
    for (const value of stops) result.push([`${p.name} = ${value}`, merge(figure, { [p.name]: value })]);
  }
  return result;
}

describe("batch 4 figures", () => {
  it("the gallery has every batch 4 type, and the model is told about each", () => {
    expect(new Set(gallery.map((f) => f.type))).toEqual(new Set(batch4Kinds));
    const prompt = IllustrationPrompt.system("English");
    for (const kind of batch4Kinds) expect(prompt.includes(kind), `${kind} missing from the prompt`).toBe(true);
  });

  it.each(gallery.map((figure) => [name(figure), figure] as const))(
    "%s fits, draws and moves, at its slider extremes and at every stop",
    (label, figure) => {
      const scene = compile(figure);
      expect(scene, `${label} did not compile`).not.toBeNull();
      if (!scene) return;
      expect(problems(scene, label).slice(0, 4)).toEqual([]);
      for (const [setting, variant] of [...extremes(figure, scene), ...everyStop(figure, scene)]) {
        const where = `${label} with ${setting}`;
        const built = compile(variant);
        expect(built, `${where} did not compile`).not.toBeNull();
        if (built) expect(problems(built, where).slice(0, 4)).toEqual([]);
      }
    },
  );

  it.each(gallery.map((figure) => [name(figure), figure] as const))(
    "%s keeps its text in its boxes and its labels clear, at the end and at the extremes, in both languages",
    (label, figure) => {
      for (const language of [portuguese, "English"]) {
        const scene = compile(figure, language);
        expect(scene, `${label} did not compile in ${language}`).not.toBeNull();
        if (!scene) continue;
        const variants: [string, PremadeFigure][] = [["as given", figure], ...extremes(figure, scene)];
        for (const [setting, variant] of variants) {
          // The slider extremes are checked to compile in Portuguese above.
          const built = compile(variant, language);
          if (!built) continue;
          const end = built.duration ?? 0;
          for (const time of [0.95 * end, end])
            expect(fitProblems(built, time).slice(0, 4), `${label} with ${setting} in ${language}`).toEqual([]);
        }
      }
    },
  );

  it("the fit check sees text that spills out of its box and labels that touch boxes", () => {
    const spilling = new FigureCanvas("English");
    spilling.box(1, 1, 2, 1);
    spilling.box(6, 1, 2, 1);
    spilling.label("far too much text for this box", 2, 1.5, { anchor: "center", claim: false });
    spilling.label("a label that is much too wide for the gap", 5, 1.5, { anchor: "center", claim: false });
    const found = fitProblems(spilling.illustration("t", 1), 0.5);
    expect(found.some((p) => p.includes("far too much text") && p.includes("does not fit"))).toBe(true);
    expect(found.some((p) => p.includes("a label that is much too wide") && p.includes("runs into a box"))).toBe(true);

    const tidy = new FigureCanvas("English");
    tidy.box(1, 1, 2, 1);
    tidy.box(6, 1, 2, 1);
    tidy.label("fits", 2, 1.5, { anchor: "center", claim: false });
    tidy.label("between", 5, 1.5, { anchor: "center", claim: false });
    expect(fitProblems(tidy.illustration("t", 1), 0.5)).toEqual([]);
  });

  it("the sliders are offered and recompile locally", () => {
    for (const figure of gallery) {
      const scene = compile(figure);
      if (!scene || (scene.parameters ?? []).length === 0) continue;
      expect(
        new PremadeFigures(figure).needsParameterRecompile,
        `${figure.type} has sliders but never recompiles`,
      ).toBe(true);
      expect(scene.premade?.type, `${figure.type} is not tagged for recompiling`).toBe(figure.type);
    }
  });

  it("every batch 4 figure is also reachable through the model's illustration, and draws in English", () => {
    for (const figure of gallery) {
      const free: Illustration = { title: "t", width: 10, height: 6, parameters: [], elements: [], premade: figure };
      expect(applyingPremadeFigure(free, "English").elements.length, figure.type).toBeGreaterThan(0);
      const english = compile(figure, "English");
      expect(english, `${figure.type} in English`).not.toBeNull();
      if (english) expect(problems(english, `${figure.type} en`).slice(0, 4)).toEqual([]);
    }
  });

  it("English figures have no Portuguese in them", () => {
    // Terms given in the params are the model's own words; everything else is the figure's, and must be English.
    const accents = new Set(Array.from("áàâãçéêíóôõúü"));
    const figures = gallery.filter((f) => !["syllogismVenn", "squareOfOpposition", "argumentMap"].includes(f.type));
    figures.push(
      sample("syllogismVenn", '{"mood": "EIO-1", "S": "athlete", "M": "idler", "P": "champion"}'),
      sample("syllogismVenn", '{"mood": "AAI-3", "S": "cat", "M": "mammal", "P": "animal"}'),
      sample("squareOfOpposition", '{"S": "cat", "P": "black", "given": "O", "value": true}'),
      sample(
        "squareOfOpposition",
        '{"S": "cat", "P": "black", "given": "A", "value": false, "existentialImport": false}',
      ),
    );
    argumentForms.forEach((_, index) => figures.push(sample("argumentMap", `{"form": ${index}}`)));
    for (let index = 0; index < 11; index++) figures.push(sample("fallacies", `{"fallacy": ${index}}`));
    for (const program of flowchartPrograms) figures.push(sample("flowchart", `{"program": "${program}"}`));
    for (const task of arrayLoopTasks) figures.push(sample("arrayLoop", `{"task": "${task}", "values": [3, 8, 1, 6]}`));
    for (const figure of figures) {
      const scene = compile(figure, "English");
      expect(scene, `${name(figure)} did not compile in English`).not.toBeNull();
      if (!scene) continue;
      const labels = scene.elements.flatMap((e) => (e.text ? [e.text] : []));
      const sliders = (scene.parameters ?? []).flatMap((p) => (p.label ? [p.label] : []));
      for (const text of [...labels, ...sliders])
        expect(
          Array.from(text).some((c) => accents.has(c)),
          `${name(figure)}: “${text}” is not English`,
        ).toBe(false);
      // And the English words of the Portuguese ones are not left behind.
      for (const word of [
        "Passo",
        "Saída",
        "Início",
        "Logo",
        "Falácia",
        "Silogismo",
        "Válido",
        "Inválido",
        "Tautologia",
        "chamadas",
        "não",
        "verdadeira",
      ])
        expect(
          labels.some((l) => l.includes(word)),
          `${figure.type}: “${word}” left in English`,
        ).toBe(false);
    }
  });

  it("an invalid batch 4 figure falls back to the model's own drawing", () => {
    const free: Illustration = {
      title: "t",
      width: 10,
      height: 6,
      parameters: [],
      elements: [{ kind: "point", x: "1", y: "1" }],
      premade: sample("truthTable", '{"expression": "p ^^ q"}'),
    };
    expect(applyingPremadeFigure(free, "English").elements).toHaveLength(1);
  });
});
