// Port of LearnLayer/Illustrations/PremadeFigureBatch3Chemistry.swift @ ref 2026-11-04: Lewis structures built step by
// step, the energy profile of a reaction (with a catalyst), a titration curve from the exact charge balance, an ICE
// table solved for x and checked against Kc, periodic trends from measured values, [A] against t for orders 0, 1 and 2,
// and a Punnett square. Every number is worked out by the app.

import type { IllustrationParameter } from "../illustration";
import { TemplateBuilder } from "../illustrationTemplate";
import { Premade } from "../premadeFigure";
import { growingPolyline, PlaneGeometry, polylineLength } from "./electromagnetism";
import {
  Anim,
  FigureCanvas,
  Params,
  PlottedFunction,
  PremadeFrame,
  slider,
  type AnimatedIllustration,
} from "./figureCanvas";
import { Teach } from "./heating";
import { growingArrow } from "./mechanics";
import { growingLine, type Point } from "./optics";

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

const within = (value: number, low: number, high: number) => value >= low && value <= high;
const characters = (text: string) => Array.from(text).length;

// MARK: Lewis structures

export interface LewisAtom {
  symbol: string;
  /** Where the atom sits in the sketch, in bond lengths. */
  x: number;
  y: number;
  /** Lone pairs once every bond is drawn, and while the bonds are still all single. */
  finalPairs: number;
  skeletonPairs: number;
}

export interface LewisBond {
  a: number;
  b: number;
  order: number;
}

export const valenceElectrons: Record<string, number> = {
  H: 1,
  B: 3,
  C: 4,
  N: 5,
  O: 6,
  F: 7,
  P: 5,
  S: 6,
  Cl: 7,
  Br: 7,
  I: 7,
};

export class LewisMolecule {
  constructor(
    readonly formula: string,
    readonly namePT: string,
    readonly nameEN: string,
    readonly atoms: LewisAtom[],
    readonly bonds: LewisBond[],
  ) {}

  /** Electrons that must be placed: the valence electrons of all the atoms. */
  get valenceElectrons(): number {
    return this.atoms.reduce((sum, atom) => sum + (valenceElectrons[atom.symbol] ?? 0), 0);
  }
  /** The electrons drawn once every bond has its final order. */
  get drawnElectrons(): number {
    return (
      2 * this.bonds.reduce((sum, bond) => sum + bond.order, 0) +
      2 * this.atoms.reduce((sum, atom) => sum + atom.finalPairs, 0)
    );
  }
  /** The electrons drawn while every bond is still single. */
  get skeletonElectrons(): number {
    return 2 * this.bonds.length + 2 * this.atoms.reduce((sum, atom) => sum + atom.skeletonPairs, 0);
  }
  /** Electrons an atom has round it: its lone pairs, and every pair it shares. */
  electronsAround(index: number, final = true): number {
    const shared = this.bonds
      .filter((bond) => bond.a === index || bond.b === index)
      .reduce((sum, bond) => sum + (final ? bond.order : 1), 0);
    return 2 * (final ? this.atoms[index]!.finalPairs : this.atoms[index]!.skeletonPairs) + 2 * shared;
  }
  /** valence electrons − electrons the atom keeps (its lone pairs and one of every shared pair). */
  formalCharge(index: number): number {
    const shared = this.bonds
      .filter((bond) => bond.a === index || bond.b === index)
      .reduce((sum, bond) => sum + bond.order, 0);
    return (valenceElectrons[this.atoms[index]!.symbol] ?? 0) - 2 * this.atoms[index]!.finalPairs - shared;
  }
}

const atom = (symbol: string, x: number, y: number, final: number, skeleton?: number): LewisAtom => ({
  symbol,
  x,
  y,
  finalPairs: final,
  skeletonPairs: skeleton ?? final,
});
const bond = (a: number, b: number, order = 1): LewisBond => ({ a, b, order });

/**
 * Molecules a student draws by the octet rule. The lone pairs are those of the correct Lewis structure; the skeleton
 * column is what is left to place when every bond is single (it differs where a bond is multiple).
 */
export const lewisMolecules: LewisMolecule[] = (() => {
  const s = 0.79; // a 104.5° bend: sin 52.25°, cos 52.25°
  const c = 0.616;
  const m = (formula: string, pt: string, en: string, atoms: LewisAtom[], bonds: LewisBond[]) =>
    new LewisMolecule(formula, pt, en, atoms, bonds);
  return [
    m("H₂", "hidrogénio", "hydrogen", [atom("H", -0.5, 0, 0), atom("H", 0.5, 0, 0)], [bond(0, 1)]),
    m("F₂", "flúor", "fluorine", [atom("F", -0.6, 0, 3), atom("F", 0.6, 0, 3)], [bond(0, 1)]),
    m("Cl₂", "cloro", "chlorine", [atom("Cl", -0.6, 0, 3), atom("Cl", 0.6, 0, 3)], [bond(0, 1)]),
    m("O₂", "oxigénio", "oxygen", [atom("O", -0.6, 0, 2, 3), atom("O", 0.6, 0, 2, 2)], [bond(0, 1, 2)]),
    m("N₂", "azoto", "nitrogen", [atom("N", -0.6, 0, 1, 3), atom("N", 0.6, 0, 1, 1)], [bond(0, 1, 3)]),
    m("HF", "fluoreto de hidrogénio", "hydrogen fluoride", [atom("H", -0.8, 0, 0), atom("F", 0.8, 0, 3)], [bond(0, 1)]),
    m(
      "HCl",
      "cloreto de hidrogénio",
      "hydrogen chloride",
      [atom("H", -0.8, 0, 0), atom("Cl", 0.8, 0, 3)],
      [bond(0, 1)],
    ),
    m(
      "H₂O",
      "água",
      "water",
      [atom("O", 0, 0, 2), atom("H", -s, -c, 0), atom("H", s, -c, 0)],
      [bond(0, 1), bond(0, 2)],
    ),
    m(
      "H₂S",
      "sulfureto de hidrogénio",
      "hydrogen sulfide",
      [atom("S", 0, 0, 2), atom("H", -s, -c, 0), atom("H", s, -c, 0)],
      [bond(0, 1), bond(0, 2)],
    ),
    m(
      "NH₃",
      "amoníaco",
      "ammonia",
      [atom("N", 0, 0, 1), atom("H", -0.95, -0.3, 0), atom("H", 0.95, -0.3, 0), atom("H", 0, -1.0, 0)],
      [bond(0, 1), bond(0, 2), bond(0, 3)],
    ),
    m(
      "PH₃",
      "fosfina",
      "phosphine",
      [atom("P", 0, 0, 1), atom("H", -0.95, -0.3, 0), atom("H", 0.95, -0.3, 0), atom("H", 0, -1.0, 0)],
      [bond(0, 1), bond(0, 2), bond(0, 3)],
    ),
    m(
      "CH₄",
      "metano",
      "methane",
      [atom("C", 0, 0, 0), atom("H", -1, 0, 0), atom("H", 1, 0, 0), atom("H", 0, 1, 0), atom("H", 0, -1, 0)],
      [bond(0, 1), bond(0, 2), bond(0, 3), bond(0, 4)],
    ),
    m(
      "CCl₄",
      "tetraclorometano",
      "carbon tetrachloride",
      [
        atom("C", 0, 0, 0),
        atom("Cl", -0.8, 0.8, 3),
        atom("Cl", 0.8, 0.8, 3),
        atom("Cl", -0.8, -0.8, 3),
        atom("Cl", 0.8, -0.8, 3),
      ],
      [bond(0, 1), bond(0, 2), bond(0, 3), bond(0, 4)],
    ),
    m(
      "CO₂",
      "dióxido de carbono",
      "carbon dioxide",
      [atom("O", -1.2, 0, 2, 3), atom("C", 0, 0, 0), atom("O", 1.2, 0, 2, 3)],
      [bond(0, 1, 2), bond(1, 2, 2)],
    ),
    m(
      "HCN",
      "cianeto de hidrogénio",
      "hydrogen cyanide",
      [atom("H", -1.1, 0, 0), atom("C", 0, 0, 0), atom("N", 1.15, 0, 1, 3)],
      [bond(0, 1), bond(1, 2, 3)],
    ),
    m(
      "CH₂O",
      "metanal",
      "formaldehyde",
      [atom("C", 0, 0, 0), atom("O", 0, 1.15, 2, 3), atom("H", -0.95, -0.6, 0), atom("H", 0.95, -0.6, 0)],
      [bond(0, 1, 2), bond(0, 2), bond(0, 3)],
    ),
    m(
      "C₂H₄",
      "eteno",
      "ethene",
      [
        atom("C", -0.7, 0, 0, 1),
        atom("C", 0.7, 0, 0, 0),
        atom("H", -1.35, 0.9, 0),
        atom("H", -1.35, -0.9, 0),
        atom("H", 1.35, 0.9, 0),
        atom("H", 1.35, -0.9, 0),
      ],
      [bond(0, 1, 2), bond(0, 2), bond(0, 3), bond(1, 4), bond(1, 5)],
    ),
    m(
      "C₂H₂",
      "etino",
      "ethyne",
      [atom("H", -1.9, 0, 0), atom("C", -0.65, 0, 0, 1), atom("C", 0.65, 0, 0, 1), atom("H", 1.9, 0, 0)],
      [bond(0, 1), bond(1, 2, 3), bond(2, 3)],
    ),
    m(
      "BF₃",
      "trifluoreto de boro",
      "boron trifluoride",
      [atom("B", 0, 0, 0), atom("F", 0, 1.15, 3), atom("F", -1.0, -0.6, 3), atom("F", 1.0, -0.6, 3)],
      [bond(0, 1), bond(0, 2), bond(0, 3)],
    ),
  ];
})();

/** A formula as the model may write it ("H2O", "h2o", "H₂O") to the key used in the table. */
export function lewisMolecule(text: string): LewisMolecule | null {
  const key = (value: string) =>
    Array.from(value.replace(/ /g, ""))
      .map((ch) => {
        const code = ch.codePointAt(0)!;
        return code >= 0x2080 && code <= 0x2089 ? String(code - 0x2080) : ch;
      })
      .join("")
      .toLowerCase();
  const wanted = key(text);
  return lewisMolecules.find((molecule) => key(molecule.formula) === wanted) ?? null;
}

/** The directions (degrees) of the lone pairs of one atom: spread evenly over the widest gap between its bonds. */
export function lonePairAngles(index: number, pairs: number, molecule: LewisMolecule): number[] {
  if (pairs <= 0) return [];
  const here = molecule.atoms[index]!;
  const bonded: number[] = [];
  for (const b of molecule.bonds)
    if (b.a === index || b.b === index) {
      const other = molecule.atoms[b.a === index ? b.b : b.a]!;
      bonded.push((Math.atan2(other.y - here.y, other.x - here.x) * 180) / Math.PI);
    }
  const sorted = [...bonded].sort((a, b) => a - b);
  if (sorted.length === 0) return Array.from({ length: pairs }, (_, k) => (360 * k) / pairs);
  // The widest arc between neighbouring bonds, going round.
  let best = { start: sorted[0]!, gap: 0 };
  sorted.forEach((angle, offset) => {
    const next = offset + 1 < sorted.length ? sorted[offset + 1]! : sorted[0]! + 360;
    if (next - angle > best.gap) best = { start: angle, gap: next - angle };
  });
  const spacing = best.gap / (pairs + 1);
  return Array.from({ length: pairs }, (_, k) => best.start + spacing * (k + 1));
}

/** The angles of the pairs kept in the final structure: the skeleton's positions nearest to where the final pairs would go. */
export function finalPairIndices(index: number, molecule: LewisMolecule): number[] {
  const here = molecule.atoms[index]!;
  const skeleton = lonePairAngles(index, here.skeletonPairs, molecule);
  if (!(here.finalPairs < here.skeletonPairs)) return skeleton.map((_, i) => i);
  const wanted = lonePairAngles(index, here.finalPairs, molecule);
  const taken = new Set<number>();
  const gap = (angle: number, other: number) => {
    const d = Math.abs(angle - other) % 360;
    return Math.min(d, 360 - d);
  };
  for (const angle of wanted) {
    let nearest: number | null = null;
    for (let i = 0; i < skeleton.length; i++) {
      if (taken.has(i)) continue;
      if (nearest === null || gap(angle, skeleton[i]!) < gap(angle, skeleton[nearest]!)) nearest = i;
    }
    if (nearest !== null) taken.add(nearest);
  }
  return [...taken].sort((a, b) => a - b);
}

/** The octet circle round an atom (a duet for hydrogen), in world units; the lone pairs sit well inside it. */
export const lewisRingRadius = (symbol: string) => (symbol === "H" ? 0.5 : 0.8);
/** How far from its atom the two dots of a lone pair sit: clear of the symbol and of the circle. */
export const lewisPairDistance = 0.5;

const lewisStructure: Compiler = (params, title, language) => {
  const name = params.text("molecule") ?? params.text("formula");
  const molecule = name === null ? null : lewisMolecule(name);
  if (!molecule) return null;
  const canvas = new FigureCanvas(language);
  const steps = 4;
  const total = molecule.valenceElectrons;
  const bondCount = molecule.bonds.length;
  const skeletonPairs = molecule.atoms.reduce((sum, a) => sum + a.skeletonPairs, 0);
  const multiple = molecule.bonds.some((b) => b.order > 1);

  // Words first: one line that changes with each step, and the name of the molecule.
  const symbols: string[] = [];
  for (const a of molecule.atoms) if (!symbols.includes(a.symbol)) symbols.push(a.symbol);
  const composition = symbols
    .map((symbol) => {
      const count = molecule.atoms.filter((a) => a.symbol === symbol).length;
      const value = valenceElectrons[symbol] ?? 0;
      return count === 1 ? `${value}` : `${count}×${value}`;
    })
    .join(" + ");
  const bondWord =
    bondCount === 1 ? canvas.say("ligação simples", "single bond") : canvas.say("ligações simples", "single bonds");
  const pairWord =
    skeletonPairs === 1 ? canvas.say("par isolado", "lone pair") : canvas.say("pares isolados", "lone pairs");
  const notes = [
    canvas.say(`Eletrões de valência: ${composition} = ${total} e⁻`, `Valence electrons: ${composition} = ${total} e⁻`),
    canvas.say(
      `Esqueleto: ${bondCount} ${bondWord} (${2 * bondCount} e⁻), restam ${total - 2 * bondCount} e⁻`,
      `Skeleton: ${bondCount} ${bondWord} (${2 * bondCount} e⁻), ${total - 2 * bondCount} e⁻ left`,
    ),
    canvas.say(
      `${skeletonPairs} ${pairWord} (${2 * skeletonPairs} e⁻): restam ${total - 2 * bondCount - 2 * skeletonPairs} e⁻`,
      `${skeletonPairs} ${pairWord} (${2 * skeletonPairs} e⁻): ${total - 2 * bondCount - 2 * skeletonPairs} e⁻ left`,
    ),
    multiple
      ? canvas.say(
          "Faltam eletrões: partilham-se mais pares (ligações múltiplas)",
          "Electrons are short: more pairs are shared (multiple bonds)",
        )
      : molecule.formula === "BF₃"
        ? canvas.say(
            "O boro fica com 6 e⁻: exceção à regra do octeto",
            "Boron keeps 6 e⁻: an exception to the octet rule",
          )
        : canvas.say(
            "Todos os átomos têm octeto (o H, dueto): estrutura completa",
            "Every atom has an octet (H a duet): the structure is complete",
          ),
  ];
  notes.forEach((text, index) => {
    const visible =
      index === steps - 1 ? Anim.after(Teach.start(index)) : Anim.window(Teach.start(index), Teach.start(index + 1));
    canvas.caption(text, { row: 0, color: index === 3 ? "accent" : "white", visible, claim: index === 0 });
  });
  canvas.caption(`${molecule.formula}: ` + canvas.say(molecule.namePT, molecule.nameEN), {
    row: 1,
    color: "white",
    visible: Anim.after(Teach.start(0)),
  });

  // Layout: the sketch scaled to the room (a bond never longer than 2), so that every atom's octet circle stays inside
  // the picture, clear of the captions, and no two circles overlap.
  const xs = molecule.atoms.map((a) => a.x);
  const ys = molecule.atoms.map((a) => a.y);
  const midX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const midY = (Math.max(...ys) + Math.min(...ys)) / 2;
  let scale = 2.0;
  for (const a of molecule.atoms) {
    const radius = lewisRingRadius(a.symbol);
    if (Math.abs(a.x - midX) > 1e-9) scale = Math.min(scale, (4.6 - radius) / Math.abs(a.x - midX));
    if (Math.abs(a.y - midY) > 1e-9) scale = Math.min(scale, (2.1 - radius) / Math.abs(a.y - midY));
  }
  const centre = { x: 5.0, y: 3.0 };
  const spots = molecule.atoms.map((a) => ({ x: centre.x + scale * (a.x - midX), y: centre.y + scale * (a.y - midY) }));

  // Step 1: the atoms.
  const atomsShown = Anim.after(Teach.start(0));
  molecule.atoms.forEach((a, index) =>
    canvas.label(a.symbol, spots[index]!.x, spots[index]!.y, { anchor: "center", color: "white", visible: atomsShown }),
  );
  // Step 2: single bonds.
  const bondsShown = Anim.after(Teach.start(1));
  const reach = 0.3;
  const bondLine = (b: LewisBond, offset: number, visible: string, color: string) => {
    const p = spots[b.a]!;
    const q = spots[b.b]!;
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    const ux = (q.x - p.x) / length;
    const uy = (q.y - p.y) / length;
    const nx = -uy * offset;
    const ny = ux * offset;
    canvas.line(p.x + ux * reach + nx, p.y + uy * reach + ny, q.x - ux * reach + nx, q.y - uy * reach + ny, {
      color,
      visible,
    });
  };
  // A bond that will be multiple is drawn single first, and replaced when its order is completed.
  for (const b of molecule.bonds)
    bondLine(b, 0, b.order > 1 ? Anim.window(Teach.start(1), Teach.start(3)) : bondsShown, "white");
  // Step 3: the lone pairs of the skeleton, two dots each; step 4: the pairs that become bonds leave, the bonds are completed.
  const pairs = Anim.after(Teach.start(2));
  const converting = Anim.window(Teach.start(2), Teach.start(3));
  molecule.atoms.forEach((a, index) => {
    if (a.skeletonPairs <= 0) return;
    const angles = lonePairAngles(index, a.skeletonPairs, molecule);
    const kept = new Set(finalPairIndices(index, molecule));
    angles.forEach((degrees, slot) => {
      const radians = (degrees * Math.PI) / 180;
      const visible = kept.has(slot) ? pairs : converting;
      const cx = spots[index]!.x + lewisPairDistance * Math.cos(radians);
      const cy = spots[index]!.y + lewisPairDistance * Math.sin(radians);
      const sx = -Math.sin(radians) * 0.1;
      const sy = Math.cos(radians) * 0.1;
      canvas.dot(cx + sx, cy + sy, { color: "second", visible });
      canvas.dot(cx - sx, cy - sy, { color: "second", visible });
    });
  });
  const completed = Anim.after(Teach.start(3));
  for (const b of molecule.bonds) {
    if (b.order <= 1) continue;
    // The single line becomes the middle one of an odd number, or one of two beside it.
    const offsets = b.order === 2 ? [-0.09, 0.09] : [-0.14, 0, 0.14];
    for (const offset of offsets) bondLine(b, offset, completed, "accent");
  }
  // The octet of every atom (a duet for hydrogen), drawn once the structure is complete.
  molecule.atoms.forEach((a, index) => {
    const exception = molecule.formula === "BF₃" && a.symbol === "B";
    canvas.ring(spots[index]!.x, spots[index]!.y, lewisRingRadius(a.symbol), {
      color: exception ? "second" : "accent",
      dashed: true,
      visible: Anim.after(Teach.start(3) + 0.5),
    });
  });
  canvas.recordSteps(Teach.boundaries(steps));
  return canvas.illustration(title, Anim.duration(Teach.finish(steps) + 1.0));
};

// MARK: Reaction energy profile

const smoothStep = (x: number) => {
  const u = Math.min(Math.max((x - 0.2) / 0.6, 0), 1);
  return u * u * (3 - 2 * u);
};
const profileEnergy = (deltaH: number, bump: number, x: number) =>
  deltaH * smoothStep(x) + bump * Math.exp(-Math.pow((x - 0.5) / 0.14, 2));

/** The top of the curve: the best of a fine sampling, then refined round it. */
function profileHighest(deltaH: number, bump: number): number {
  const samples = Array.from({ length: 401 }, (_, i) => profileEnergy(deltaH, bump, i / 400));
  let best = 0;
  samples.forEach((value, index) => {
    if (value > samples[best]!) best = index;
  });
  let low = Math.max(best - 1, 0) / 400;
  let high = Math.min(best + 1, 400) / 400;
  for (let i = 0; i < 40; i++) {
    const first = low + (high - low) / 3;
    const second = high - (high - low) / 3;
    if (profileEnergy(deltaH, bump, first) < profileEnergy(deltaH, bump, second)) low = first;
    else high = second;
  }
  return profileEnergy(deltaH, bump, (low + high) / 2);
}

/** The energy of a reaction along its coordinate x in [0, 1]: reactants at 0, products at ΔH, a smooth peak at 0.5. */
export class ReactionProfile {
  /** How tall the Gaussian bump over the step is, so that the highest point is exactly the activation energy. */
  readonly bumpHeight: number;

  constructor(
    readonly deltaH: number,
    readonly activation: number,
  ) {
    let low = 0;
    let high = 10 * Math.max(activation, 1);
    for (let i = 0; i < 60; i++) {
      const middle = (low + high) / 2;
      if (profileHighest(deltaH, middle) < activation) low = middle;
      else high = middle;
    }
    this.bumpHeight = (low + high) / 2;
  }

  static highest = profileHighest;
  energy(x: number): number {
    return profileEnergy(this.deltaH, this.bumpHeight, x);
  }
  /** The activation energy of the reverse reaction: from the products up to the peak. */
  get reverseActivation(): number {
    return this.activation - this.deltaH;
  }
  get exothermic(): boolean {
    return this.deltaH < 0;
  }
}

/** The curve as an expression in x (for the renderer), with the step written out with `abs` as `Anim.clamp01` does. */
export function profileExpression(deltaH: number, bump: number): string {
  const u = Anim.clamp01("((x-0.2)/0.6)");
  return `${Anim.lit(deltaH)}*(${u}*${u}*(3-2*${u})) + ${Anim.n(bump)}*exp(-((x-0.5)/0.14)^2)`;
}

const reactionProfile: Compiler = (params, title, language) => {
  const activation = params.number("Ea");
  const deltaH = params.number("deltaH") ?? params.number("dH");
  if (activation === null || deltaH === null) return null;
  const catalysed = params.number("catalystEa");
  if (!(
    within(activation, 0, 1000) &&
    Math.abs(deltaH) <= 1000 &&
    activation > 0 &&
    // The peak must stand above both levels, or there is no barrier in one direction.
    activation - Math.max(deltaH, 0) >= 10 &&
    activation - deltaH >= 10
  ))
    return null;
  if (
    catalysed !== null &&
    !(catalysed < activation && catalysed - Math.max(deltaH, 0) >= 5 && catalysed - deltaH >= 5)
  )
    return null;
  const profile = new ReactionProfile(deltaH, activation);
  const lowCurve = catalysed !== null ? new ReactionProfile(deltaH, catalysed) : null;
  const canvas = new FigureCanvas(language);
  const n = (value: number) => canvas.number(value, 3);
  const steps = catalysed === null ? 4 : 5;

  // Words first: the definitions, then the line that goes with each step.
  canvas.caption("Ea = " + canvas.say("energia de ativação", "activation energy") + "  ·  ΔH = Hₚ − Hᵣ", {
    row: 0,
    color: "white",
    visible: Anim.after(Teach.start(0)),
  });
  const reverse = profile.reverseActivation;
  const barrier = canvas.say(
    `Ea (direta) = ${n(activation)} kJ/mol  ·  Ea (inversa) = Ea − ΔH = ${n(reverse)} kJ/mol`,
    `Ea (forward) = ${n(activation)} kJ/mol  ·  Ea (reverse) = Ea − ΔH = ${n(reverse)} kJ/mol`,
  );
  const nature = profile.exothermic
    ? canvas.say(
        `ΔH = ${n(deltaH)} kJ/mol < 0: exotérmica, os produtos têm menos energia`,
        `ΔH = ${n(deltaH)} kJ/mol < 0: exothermic, the products have less energy`,
      )
    : deltaH > 0
      ? canvas.say(
          `ΔH = ${n(deltaH)} kJ/mol > 0: endotérmica, os produtos têm mais energia`,
          `ΔH = ${n(deltaH)} kJ/mol > 0: endothermic, the products have more energy`,
        )
      : canvas.say("ΔH = 0: os produtos têm a mesma energia", "ΔH = 0: the products have the same energy");
  // Steps: 0 the curve, 1 the two levels, 2 the activation energy, 3 ΔH, 4 the catalyst.
  canvas.caption(canvas.say("Energia ao longo da reação", "Energy along the reaction"), {
    row: 1,
    color: "white",
    visible: Anim.window(Teach.start(0), Teach.start(2)),
  });
  canvas.caption(barrier, {
    row: 1,
    color: "white",
    visible: Anim.window(Teach.start(2), Teach.start(3)),
    claim: false,
  });
  canvas.caption(nature, {
    row: 1,
    color: "accent",
    visible: catalysed === null ? Anim.after(Teach.start(3)) : Anim.window(Teach.start(3), Teach.start(4)),
    claim: false,
  });
  if (catalysed !== null)
    canvas.caption(
      canvas.say(
        `Com catalisador: Ea baixa para ${n(catalysed)} kJ/mol, ΔH não muda`,
        `With a catalyst: Ea drops to ${n(catalysed)} kJ/mol, ΔH is unchanged`,
      ),
      { row: 1, color: "accent", visible: Anim.after(Teach.start(4)), claim: false },
    );

  // The picture: energy up, reaction coordinate to the right, the reactants' level at height 0.
  const top = Math.max(activation, 0) * 1.12;
  const bottom = Math.min(deltaH, 0) - 0.18 * (top - Math.min(deltaH, 0));
  const frame = new PremadeFrame(0, 1, bottom, top, 1.6, 8.6, 1.5, 4.65);
  canvas.arrow(frame.left, frame.bottom, frame.right + 0.5, frame.bottom, { color: "muted" });
  canvas.arrow(frame.left, frame.bottom, frame.left, frame.top + 0.3, { color: "muted" });
  canvas.label(canvas.say("coordenada de reação", "reaction coordinate"), frame.right + 0.4, frame.bottom - 0.3, {
    anchor: "trailing",
    color: "muted",
  });
  canvas.label(canvas.say("energia (kJ/mol)", "energy (kJ/mol)"), frame.left + 0.15, frame.top + 0.25, {
    anchor: "leading",
    color: "muted",
  });
  const curve = PlottedFunction.make(profileExpression(deltaH, profile.bumpHeight));
  if (curve) canvas.plot(curve, frame, 0, 1, { color: "white", start: Teach.start(0), end: Teach.start(0) + 1.0 });
  // Everything drawn as a line, sampled, so that the labels of the barriers can keep clear of it.
  const drawn: Point[] = Array.from({ length: 201 }, (_, i) => ({
    x: frame.x(i / 200),
    y: frame.y(profile.energy(i / 200)),
  }));
  const remember = (x1: number, y1: number, x2: number, y2: number) => {
    const count = Math.max(2, Math.trunc(Math.hypot(x2 - x1, y2 - y1) / 0.05));
    for (let step = 0; step <= count; step++)
      drawn.push({ x: x1 + ((x2 - x1) * step) / count, y: y1 + ((y2 - y1) * step) / count });
  };
  /** The first spot whose text stays 0.1 clear of every line, and of the other labels; the first spot if none does. */
  const placeLabel = (
    text: string,
    color: string,
    visible: string,
    leading: boolean,
    spots: { x: number; y: number }[],
    fallback = true,
  ): boolean => {
    const width = characters(text) * 0.14;
    for (const spot of spots) {
      const minX = leading ? spot.x : spot.x - width;
      const near = drawn.some(
        (p) => p.x > minX - 0.1 && p.x < minX + width + 0.1 && Math.abs(p.y - spot.y) < 0.17 + 0.1,
      );
      if (near) continue;
      if (canvas.label(text, spot.x, spot.y, { anchor: leading ? "leading" : "trailing", color, visible })) return true;
    }
    const first = spots[0];
    if (!fallback || !first) return false;
    canvas.label(text, first.x, first.y, { anchor: leading ? "leading" : "trailing", color, visible, claim: false });
    return true;
  };
  // The two levels.
  const levels = Anim.after(Teach.start(1));
  canvas.line(frame.left, frame.y(0), frame.x(0.5), frame.y(0), { color: "muted", dashed: true, visible: levels });
  canvas.line(frame.x(0.5), frame.y(deltaH), frame.right, frame.y(deltaH), {
    color: "muted",
    dashed: true,
    visible: levels,
  });
  remember(frame.left, frame.y(0), frame.x(0.5), frame.y(0));
  remember(frame.x(0.5), frame.y(deltaH), frame.right, frame.y(deltaH));
  canvas.label(canvas.say("reagentes", "reactants"), frame.x(0.1), frame.y(0) + 0.28, {
    anchor: "center",
    color: "white",
    visible: levels,
  });
  canvas.label(canvas.say("produtos", "products"), frame.x(0.9), frame.y(deltaH) + (deltaH >= 0 ? 0.28 : -0.28), {
    anchor: "center",
    color: "white",
    visible: levels,
  });
  // The activation energy, from the reactants' level to the top of the peak, comes with the levels.
  const eaX = frame.x(0.3);
  canvas.line(eaX, frame.y(activation), frame.x(0.5), frame.y(activation), {
    color: "muted",
    dashed: true,
    visible: Anim.after(Teach.start(2)),
  });
  growingArrow(canvas, { x: eaX, y: frame.y(0) }, { x: eaX, y: frame.y(activation) }, Teach.start(2), "accent");
  remember(eaX, frame.y(0), eaX, frame.y(activation));
  remember(eaX, frame.y(activation), frame.x(0.5), frame.y(activation));
  // The enthalpy change, from the reactants level to the products level.
  const dhX = frame.x(0.78);
  if (Math.abs(deltaH) > 1e-9) {
    growingArrow(canvas, { x: dhX, y: frame.y(0) }, { x: dhX, y: frame.y(deltaH) }, Teach.start(3), "second");
    remember(dhX, frame.y(0), dhX, frame.y(deltaH));
    canvas.label(`ΔH = ${n(deltaH)} kJ/mol`, dhX + 0.12, frame.y(deltaH / 2), {
      anchor: "leading",
      color: "second",
      visible: Anim.after(Teach.start(3) + 0.8),
    });
  } else
    canvas.label("ΔH = 0", dhX + 0.12, frame.y(0) + 0.28, {
      anchor: "leading",
      color: "second",
      visible: Anim.after(Teach.start(3)),
    });
  // Ea: above the dashed line of the peak, to the right of the arrow's tip, else beside the arrow.
  placeLabel(`Ea = ${n(activation)} kJ/mol`, "accent", Anim.after(Teach.start(2) + 0.8), true, [
    { x: eaX + 0.3, y: frame.y(activation) + 0.33 },
    { x: eaX + 0.3, y: frame.y(activation) + 0.5 },
    { x: eaX + 0.3, y: frame.y(activation) - 0.5 },
  ]);
  // A catalyst opens a lower peak between the same two levels.
  const lowFunction = lowCurve ? PlottedFunction.make(profileExpression(deltaH, lowCurve.bumpHeight)) : null;
  if (lowCurve && catalysed !== null && lowFunction) {
    canvas.plot(lowFunction, frame, 0, 1, {
      color: "accent",
      dashed: true,
      start: Teach.start(4),
      end: Teach.start(4) + 1.0,
    });
    // The arrow stands where the uncatalysed curve does not cross it, and clear of the other two arrows.
    const lowArrowTop = frame.y(catalysed);
    const lowArrowBase = frame.y(0);
    const plainCurve = drawn.slice(0, 201);
    let lowX = frame.x(0.62);
    let nearest = Infinity;
    for (let percent = 36; percent <= 96; percent++) {
      const x = frame.x(percent / 100);
      if (Math.abs(x - eaX) < 0.5 || (Math.abs(deltaH) > 1e-9 && Math.abs(x - dhX) < 0.5)) continue;
      const crossed = plainCurve.some(
        (p) => Math.abs(p.x - x) < 0.12 && p.y > lowArrowBase - 0.12 && p.y < lowArrowTop + 0.12,
      );
      const distance = Math.abs(x - frame.x(0.62));
      if (!crossed && distance < nearest) {
        lowX = x;
        nearest = distance;
      }
    }
    canvas.line(frame.x(0.5), frame.y(catalysed), lowX, frame.y(catalysed), {
      color: "accent",
      dashed: true,
      visible: Anim.after(Teach.start(4)),
    });
    growingArrow(canvas, { x: lowX, y: frame.y(0) }, { x: lowX, y: frame.y(catalysed) }, Teach.start(4), "accent");
    for (let step = 0; step <= 200; step++)
      drawn.push({ x: frame.x(step / 200), y: frame.y(lowCurve.energy(step / 200)) });
    remember(frame.x(0.5), frame.y(catalysed), lowX, frame.y(catalysed));
    remember(lowX, frame.y(0), lowX, frame.y(catalysed));
    // To the right of the arrow, as high as there is room, clear of both curves; beside the arrow, else a little above its top.
    const heights = [0.8, 0.65, 0.5, 0.35, 0.2, 0.9, 1.1];
    const catalystText = `Ea = ${n(catalysed)}`;
    const catalystVisible = Anim.after(Teach.start(4) + 0.8);
    const ys = [...heights.map((h) => frame.y(catalysed * h)), lowArrowTop + 0.4, lowArrowTop + 0.8, lowArrowTop + 1.2];
    const rightSpots = ys.map((y) => ({ x: lowX + 0.25, y }));
    const leftSpots = ys.map((y) => ({ x: lowX - 0.25, y }));
    if (
      !placeLabel(catalystText, "accent", catalystVisible, true, rightSpots, false) &&
      !placeLabel(catalystText, "accent", catalystVisible, false, leftSpots, false)
    )
      placeLabel(catalystText, "accent", catalystVisible, true, rightSpots);
  }
  canvas.recordSteps(Teach.boundaries(steps, 0.4, 2.1, 1.1));
  const parameters: IllustrationParameter[] = [];
  const highestEnthalpy = Math.max(50, deltaH);
  if (catalysed !== null)
    parameters.push(slider("catalystEa", "Ea (cat.)", catalysed, Math.max(0, deltaH) + 10, activation - 10));
  else if (activation >= highestEnthalpy + 20) {
    // Ea ≥ 70 and ΔH ≤ 50 hold together at every setting of the sliders.
    parameters.push(slider("Ea", "Ea (kJ/mol)", activation, highestEnthalpy + 20, Math.max(200, activation)));
    parameters.push(slider("deltaH", "ΔH (kJ/mol)", deltaH, Math.min(-100, deltaH), highestEnthalpy));
  }
  return canvas.illustration(title, Anim.duration(Teach.finish(steps, 0.4, 2.1, 1.1) + 0.8), parameters);
};

// MARK: Titration curve

/** A monoprotic acid (strong, or weak with a pKa) titrated with a strong base. */
export class Titration {
  static readonly kw = 1e-14;

  constructor(
    /** Null for a strong acid. */
    readonly pKa: number | null,
    /** Acid concentration in mol/L and volume in mL; base concentration in mol/L. */
    readonly acidConcentration: number,
    readonly acidVolume: number,
    readonly baseConcentration: number,
  ) {}

  /** Volume of base at the equivalence point, in mL. */
  get equivalenceVolume(): number {
    return (this.acidConcentration * this.acidVolume) / this.baseConcentration;
  }

  /** The pH after `base` mL of base, from the charge balance [H⁺] + [Na⁺] = [OH⁻] + [A⁻], solved exactly. */
  pH(base: number): number {
    const total = (this.acidVolume + base) / 1000;
    const acid = (this.acidConcentration * this.acidVolume) / 1000 / total;
    const sodium = (this.baseConcentration * base) / 1000 / total;
    const ka = this.pKa === null ? null : Math.pow(10, -this.pKa);
    // f(pH) falls as pH rises; the root is the pH of the solution.
    const balance = (pH: number) => {
      const h = Math.pow(10, -pH);
      const anion = ka === null ? acid : (acid * ka) / (ka + h);
      return h + sodium - Titration.kw / h - anion;
    };
    let low = -2;
    let high = 16;
    for (let i = 0; i < 100; i++) {
      const middle = (low + high) / 2;
      if (balance(middle) > 0) low = middle;
      else high = middle;
    }
    return (low + high) / 2;
  }
}

export function titration(params: Params): Titration | null {
  const kind = params.text("acid") ?? "strong";
  const concentration = params.number("Ca") ?? 0.1;
  const volume = params.number("Va") ?? 25;
  const base = params.number("Cb") ?? params.number("Ca") ?? 0.1;
  if (kind !== "strong" && kind !== "weak") return null;
  if (!(within(concentration, 1e-3, 5) && within(volume, 1, 1000) && within(base, 1e-3, 5))) return null;
  let pKa: number | null = null;
  if (kind === "weak") {
    const value = params.number("pKa") ?? 4.76;
    // A weak acid with a pKa this low or this high is not one a titration curve can show.
    if (!within(value, 2, 12)) return null;
    pKa = value;
  }
  return new Titration(pKa, concentration, volume, base);
}

const titrationCurve: Compiler = (params, title, language) => {
  const t = titration(params);
  if (!t) return null;
  const canvas = new FigureCanvas(language);
  const n = (value: number, digits = 3) => canvas.number(value, digits);
  const weak = t.pKa !== null;
  const steps = weak ? 4 : 3;
  const equivalence = t.equivalenceVolume;
  const initial = t.pH(0);
  const atEquivalence = t.pH(equivalence);
  const halfway = t.pH(equivalence / 2);

  // Words first.
  const heading = weak
    ? canvas.say(
        `Ácido fraco (pKa = ${n(t.pKa ?? 0)}, ${n(t.acidConcentration)} mol/L, ${n(t.acidVolume)} mL) + base forte ${n(t.baseConcentration)} mol/L`,
        `Weak acid (pKa = ${n(t.pKa ?? 0)}, ${n(t.acidConcentration)} mol/L, ${n(t.acidVolume)} mL) + strong base ${n(t.baseConcentration)} mol/L`,
      )
    : canvas.say(
        `Ácido forte (${n(t.acidConcentration)} mol/L, ${n(t.acidVolume)} mL) + base forte ${n(t.baseConcentration)} mol/L`,
        `Strong acid (${n(t.acidConcentration)} mol/L, ${n(t.acidVolume)} mL) + strong base ${n(t.baseConcentration)} mol/L`,
      );
  canvas.caption(heading, { row: 0, color: "white", visible: Anim.after(Teach.start(0)) });
  const equivalenceLine = `Ve = Ca·Va/Cb = ${n(equivalence)} mL  ·  pH = ${n(atEquivalence, 3)}`;
  if (weak) {
    canvas.caption(
      canvas.say(
        `Meia-equivalência: [HA] = [A⁻], logo pH = pKa = ${n(halfway, 3)}`,
        `Half-equivalence: [HA] = [A⁻], so pH = pKa = ${n(halfway, 3)}`,
      ),
      { row: 1, color: "second", visible: Anim.after(Teach.start(3)) },
    );
    canvas.caption(equivalenceLine + canvas.say("  (> 7: base fraca A⁻)", "  (> 7: the weak base A⁻)"), {
      row: 1,
      color: "accent",
      visible: Anim.window(Teach.start(2), Teach.start(3)),
      claim: false,
    });
  } else
    canvas.caption(equivalenceLine + canvas.say("  (= 7: sal neutro)", "  (= 7: a neutral salt)"), {
      row: 1,
      color: "accent",
      visible: Anim.after(Teach.start(2)),
    });

  // The graph: volume of base along x up to twice the equivalence volume, pH from 0 to 14.
  const frame = new PremadeFrame(0, 2 * equivalence, 0, 14, 1.7, 9.0, 1.5, 4.85);
  canvas.axes(frame, { xName: "V (mL)", yName: "pH" });
  canvas.line(frame.left, frame.y(7), frame.right, frame.y(7), { color: "muted", dashed: true });
  // Step 1: where the titration starts.
  const start = Anim.after(Teach.start(0));
  canvas.dot(frame.x(0), frame.y(initial), { color: "white", visible: start });
  // Step 2: the curve, from many small steps of the exact pH, laid out by length along it.
  const raw = Array.from({ length: 401 }, (_, i) => ({
    x: frame.x((2 * equivalence * i) / 400),
    y: frame.y(t.pH((2 * equivalence * i) / 400)),
  }));
  const curve = PlaneGeometry.resample(raw, 0.08);
  const speed = 6.0;
  growingPolyline(canvas, curve, Teach.start(1), speed, { color: "white" });
  const curveEnd = Teach.start(1) + polylineLength(curve) / speed;
  // The label of the start is placed once the curve is on the board, so that it keeps off it.
  canvas.labelBeside(`pH₀ = ${n(initial, 3)}`, frame.x(0), frame.y(initial), { color: "white", visible: start });
  // Step 3: the equivalence point, where the pH climbs fastest.
  const marked = Anim.after(Math.max(Teach.start(2), curveEnd + 0.1));
  canvas.line(frame.x(equivalence), frame.axisY, frame.x(equivalence), frame.y(atEquivalence), {
    color: "accent",
    dashed: true,
    visible: marked,
  });
  canvas.dot(frame.x(equivalence), frame.y(atEquivalence), { color: "accent", visible: marked });
  canvas.labelBeside(`pH = ${n(atEquivalence, 3)}`, frame.x(equivalence), frame.y(atEquivalence), {
    color: "accent",
    visible: marked,
  });
  // Step 4 (weak acids): half-way to equivalence, where pH = pKa.
  if (weak) {
    const half = Anim.after(Math.max(Teach.start(3), curveEnd + 0.1));
    canvas.line(frame.x(equivalence / 2), frame.axisY, frame.x(equivalence / 2), frame.y(halfway), {
      color: "second",
      dashed: true,
      visible: half,
    });
    canvas.line(frame.left, frame.y(halfway), frame.x(equivalence / 2), frame.y(halfway), {
      color: "second",
      dashed: true,
      visible: half,
    });
    canvas.dot(frame.x(equivalence / 2), frame.y(halfway), { color: "second", visible: half });
    canvas.labelBeside("pH = pKa", frame.x(equivalence / 2), frame.y(halfway), { color: "second", visible: half });
  }
  // The steps end when the pen has finished the curve and the points are on it.
  const boundaries = [0, Teach.start(0) + 0.1, curveEnd + 0.05, Math.max(Teach.start(2), curveEnd + 0.1) + 0.2];
  if (weak) boundaries.push(Math.max(Teach.start(3), curveEnd + 0.1) + 0.3);
  canvas.recordSteps(boundaries);
  const parameters = [
    slider(
      "Ca",
      "Ca (mol/L)",
      t.acidConcentration,
      Math.min(0.05, t.acidConcentration),
      Math.max(0.5, t.acidConcentration),
    ),
  ];
  if (t.pKa !== null) parameters.push(slider("pKa", "pKa", t.pKa, Math.min(3, t.pKa), Math.max(9, t.pKa)));
  const end = Math.max(boundaries.at(-1) ?? 0, Teach.start(steps - 1)) + 1.0;
  return canvas.illustration(title, Anim.duration(end), parameters);
};

// MARK: ICE table

export interface Species {
  name: string;
  coefficient: number;
  initial: number;
}

/** aA + bB ⇌ cC + dD with initial concentrations: the extent x that brings the reaction quotient to K. */
export class Equilibrium {
  constructor(
    readonly reactants: Species[],
    readonly products: Species[],
    readonly k: number,
  ) {}

  /** The concentration of a species after x mol/L of reaction (negative x: the reverse way). */
  concentration(species: Species, isReactant: boolean, x: number): number {
    return species.initial + (isReactant ? -1 : 1) * species.coefficient * x;
  }

  /** Q at extent x. Infinite when a reactant is used up; zero when a product is. */
  quotient(x: number): number {
    let numerator = 1;
    let denominator = 1;
    for (const p of this.products) numerator *= Math.pow(Math.max(this.concentration(p, false, x), 0), p.coefficient);
    for (const r of this.reactants) denominator *= Math.pow(Math.max(this.concentration(r, true, x), 0), r.coefficient);
    if (denominator === 0) return numerator === 0 ? NaN : Infinity;
    return numerator / denominator;
  }

  /** The allowed extents: no concentration may go negative. */
  get bounds(): { low: number; high: number } {
    const high = Math.min(...this.reactants.map((r) => r.initial / r.coefficient));
    const low = -Math.min(...this.products.map((p) => p.initial / p.coefficient));
    return { low, high };
  }

  /** The extent at equilibrium: Q rises with x, so one bisection finds where it equals K. */
  get extent(): number | null {
    const range = this.bounds;
    if (!(range.high > range.low)) return null;
    let low = range.low;
    let high = range.high;
    for (let i = 0; i < 200; i++) {
      const middle = (low + high) / 2;
      const q = this.quotient(middle);
      if (Number.isNaN(q)) return null;
      if (q < this.k) low = middle;
      else high = middle;
    }
    return (low + high) / 2;
  }
}

function speciesList(params: Params, key: string): Species[] | null {
  const entries = params.objects(key);
  if (!entries || entries.length < 1 || entries.length > 2) return null;
  const list: Species[] = [];
  for (const entry of entries) {
    const coefficient = Premade.number(entry["coeff"]) ?? 1;
    const initial = Premade.number(entry["c0"]) ?? 0;
    const name = Premade.string(entry["name"])?.trim() ?? "";
    if (
      name === "" ||
      characters(name) > 6 ||
      coefficient !== Math.sign(coefficient) * Math.round(Math.abs(coefficient)) ||
      !within(coefficient, 1, 4) ||
      !(initial >= 0 && initial <= 1000)
    )
      return null;
    list.push({ name, coefficient, initial });
  }
  return list;
}

export function equilibrium(params: Params): Equilibrium | null {
  const reactants = speciesList(params, "reactants");
  const products = speciesList(params, "products");
  const k = params.number("K");
  if (!reactants || !products || k === null || !within(k, 1e-6, 1e6)) return null;
  const names = [...reactants, ...products].map((s) => s.name);
  if (new Set(names).size !== names.length) return null;
  return new Equilibrium(reactants, products, k);
}

const superscriptDigits: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴" };
const power = (name: string, coefficient: number) =>
  coefficient === 1
    ? `[${name}]`
    : `[${name}]` +
      Array.from(String(coefficient))
        .map((c) => superscriptDigits[c] ?? "^")
        .join("");

const iceTable: Compiler = (params, title, language) => {
  const system = equilibrium(params);
  const x = system?.extent ?? null;
  if (!system || x === null) return null;
  const all = [
    ...system.reactants.map((s) => ({ species: s, isReactant: true })),
    ...system.products.map((s) => ({ species: s, isReactant: false })),
  ];
  const equilibria = all.map((entry) => system.concentration(entry.species, entry.isReactant, x));
  if (!equilibria.every((c) => c >= -1e-9)) return null;
  // The solution must satisfy Kc: a check on the arithmetic before it is shown.
  const quotient = system.quotient(x);
  if (!(Math.abs(quotient - system.k) <= 1e-6 * system.k)) return null;
  const canvas = new FigureCanvas(language);
  const n = (value: number) => canvas.number(value, 3);
  const steps = 5;

  // Words: the reaction, then what each step is doing.
  const side = (list: Species[]) =>
    list.map((s) => (s.coefficient === 1 ? "" : `${s.coefficient}`) + s.name).join(" + ");
  canvas.caption(`${side(system.reactants)} ⇌ ${side(system.products)}`, {
    row: 0,
    color: "white",
    visible: Anim.after(Teach.start(0)),
  });
  const numerator = system.products.map((s) => power(s.name, s.coefficient)).join("");
  const denominator = system.reactants.map((s) => power(s.name, s.coefficient)).join("");
  const expression =
    "Kc = " + (system.reactants.length > 1 ? `${numerator}/(${denominator})` : `${numerator}/${denominator}`);
  canvas.caption(
    canvas.say(
      "Tabela I-V-E: concentrações iniciais, variação (em x) e equilíbrio",
      "ICE table: initial concentrations, change (in x) and equilibrium",
    ),
    { row: 1, color: "white", visible: Anim.window(Teach.start(0), Teach.start(3)) },
  );
  canvas.caption(`${expression} = ${n(system.k)}`, {
    row: 1,
    color: "accent",
    visible: Anim.window(Teach.start(3), Teach.start(4)),
    claim: false,
  });
  const direction =
    x >= 0
      ? ""
      : canvas.say("  (x < 0: a reação evolui no sentido inverso)", "  (x < 0: the reaction runs in reverse)");
  canvas.caption(`x = ${n(x)} mol/L` + direction + `  ·  Kc = ${n(quotient)}`, {
    row: 1,
    color: "accent",
    visible: Anim.after(Teach.start(4)),
    claim: false,
  });

  // The table: a column for each species, a row for each stage.
  const columns = all.length;
  const first = 3.6 + (4 - columns) * 0.75;
  const columnX = (index: number) => first + 1.5 * index + 0.75;
  const rows = [
    { name: canvas.say("Início", "Initial"), y: 3.9 },
    { name: canvas.say("Variação", "Change"), y: 3.2 },
    { name: canvas.say("Equilíbrio", "Equilibrium"), y: 2.5 },
    { name: canvas.say("Valores", "Values"), y: 1.8 },
  ];
  canvas.line(0.7, 4.25, 9.3, 4.25, { color: "muted" });
  canvas.line(first, 4.95, first, 1.45, { color: "muted" });
  all.forEach((entry, index) =>
    canvas.label(`[${entry.species.name}]`, columnX(index), 4.6, {
      anchor: "center",
      color: entry.isReactant ? "accent" : "second",
      visible: Anim.after(Teach.start(0)),
    }),
  );
  const writeRow = (row: number, step: number, texts: string[], color: string) => {
    const shown = Anim.after(Teach.start(step));
    canvas.label(rows[row]!.name, first - 0.2, rows[row]!.y, { anchor: "trailing", color: "muted", visible: shown });
    texts.forEach((text, index) =>
      canvas.label(text, columnX(index), rows[row]!.y, { anchor: "center", color, visible: shown }),
    );
  };
  const coefficientText = (coefficient: number) => (coefficient === 1 ? "x" : `${coefficient}x`);
  writeRow(
    0,
    0,
    all.map((entry) => n(entry.species.initial)),
    "white",
  );
  writeRow(
    1,
    1,
    all.map((entry) => (entry.isReactant ? "−" : "+") + coefficientText(entry.species.coefficient)),
    "second",
  );
  writeRow(
    2,
    2,
    all.map(({ species, isReactant }) => {
      if (species.initial === 0)
        return isReactant ? "−" + coefficientText(species.coefficient) : coefficientText(species.coefficient);
      return `${n(species.initial)} ` + (isReactant ? "−" : "+") + " " + coefficientText(species.coefficient);
    }),
    "white",
  );
  writeRow(3, 4, equilibria.map(n), "accent");
  canvas.recordSteps(Teach.boundaries(steps));
  return canvas.illustration(title, Anim.duration(Teach.finish(steps) + 1.0), [
    slider("K", "Kc", system.k, system.k * 0.2, system.k * 5),
  ]);
};

// MARK: Periodic trends

/**
 * Measured values of the first three periods and two groups. Radius: calculated atomic radius (Clementi), pm.
 * Ionization: first ionization energy, kJ/mol. Electronegativity: Pauling scale (none for the noble gases).
 */
// prettier-ignore
export const PeriodicData = {
  radius: {
    Li: 167, Be: 112, B: 87, C: 67, N: 56, O: 48, F: 42, Ne: 38,
    Na: 190, Mg: 145, Al: 118, Si: 111, P: 98, S: 88, Cl: 79, Ar: 71,
    K: 243, Rb: 265, Cs: 298, Br: 94, I: 115,
  } as Record<string, number>,
  ionization: {
    Li: 520.2, Be: 899.5, B: 800.6, C: 1086.5, N: 1402.3, O: 1313.9, F: 1681.0, Ne: 2080.7,
    Na: 495.8, Mg: 737.7, Al: 577.5, Si: 786.5, P: 1011.8, S: 999.6, Cl: 1251.2, Ar: 1520.6,
    K: 418.8, Rb: 403.0, Cs: 375.7, Br: 1139.9, I: 1008.4,
  } as Record<string, number>,
  electronegativity: {
    Li: 0.98, Be: 1.57, B: 2.04, C: 2.55, N: 3.04, O: 3.44, F: 3.98,
    Na: 0.93, Mg: 1.31, Al: 1.61, Si: 1.90, P: 2.19, S: 2.58, Cl: 3.16,
    K: 0.82, Rb: 0.82, Cs: 0.79, Br: 2.96, I: 2.66,
  } as Record<string, number>,
  series: {
    period2: ["Li", "Be", "B", "C", "N", "O", "F", "Ne"],
    period3: ["Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar"],
    group1: ["Li", "Na", "K", "Rb", "Cs"],
    group17: ["F", "Cl", "Br", "I"],
  } as Record<string, string[]>,
  /** The F, Cl, Br, I of group 17 are listed with F first, so the order is down the group (increasing period). */
  acrossPeriod: new Set(["period2", "period3"]),

  values(property: string): Record<string, number> | null {
    switch (property) {
      case "radius":
        return PeriodicData.radius;
      case "ionization":
        return PeriodicData.ionization;
      case "electronegativity":
        return PeriodicData.electronegativity;
      default:
        return null;
    }
  },
};

export interface PeriodicTrend {
  symbols: string[];
  values: number[];
  /** The elements where the value goes against the overall trend. */
  exceptions: number[];
  rises: boolean;
}

/** The elements of a series that have the property, with the overall direction and the elements against it. */
export function periodicTrend(series: string, property: string): PeriodicTrend | null {
  const symbols = PeriodicData.series[series];
  const table = PeriodicData.values(property);
  if (!symbols || !table) return null;
  const present = symbols.filter((symbol) => table[symbol] !== undefined);
  const values = present.map((symbol) => table[symbol]!);
  const first = values[0];
  const last = values.at(-1);
  if (values.length < 3 || first === undefined || last === undefined || first === last) return null;
  const rises = last > first;
  const exceptions: number[] = [];
  for (let index = 1; index < values.length; index++)
    if (rises ? values[index]! < values[index - 1]! : values[index]! > values[index - 1]!) exceptions.push(index);
  return { symbols: present, values, exceptions, rises };
}

const periodicTrends: Compiler = (params, title, language) => {
  const series = params.text("series") ?? "period2";
  let property = params.text("property") ?? "ionization";
  if (property === "ionisation") property = "ionization";
  const trend = periodicTrend(series, property);
  if (!trend) return null;
  const canvas = new FigureCanvas(language);
  const n = (value: number) => canvas.number(value, 4);
  const acrossPeriod = PeriodicData.acrossPeriod.has(series);
  const hasExceptions = trend.exceptions.length > 0;

  // Words first.
  let propertyName: string;
  let unit: string;
  if (property === "radius") {
    propertyName = canvas.say("raio atómico", "atomic radius");
    unit = "pm";
  } else if (property === "ionization") {
    propertyName = canvas.say("1.ª energia de ionização", "first ionization energy");
    unit = "kJ/mol";
  } else {
    propertyName = canvas.say("eletronegatividade (Pauling)", "electronegativity (Pauling)");
    unit = "";
  }
  const place = acrossPeriod
    ? canvas.say("ao longo do período", "across the period")
    : canvas.say("ao longo do grupo", "down the group");
  const [initial = "", ...rest] = Array.from(propertyName);
  canvas.caption(`${initial.toUpperCase()}${rest.join("")} ${place}`, {
    row: 0,
    color: "white",
    visible: Anim.after(Teach.start(0)),
  });
  let reason: string;
  if (property === "radius")
    reason = acrossPeriod
      ? canvas.say(
          "diminui: a carga nuclear efetiva aumenta e atrai mais os eletrões",
          "decreases: the effective nuclear charge grows and pulls electrons in",
        )
      : canvas.say("aumenta: há mais níveis de energia ocupados", "increases: more energy levels are occupied");
  else if (property === "ionization")
    reason = acrossPeriod
      ? canvas.say(
          "aumenta: é mais difícil arrancar um eletrão de um átomo mais pequeno",
          "increases: an electron is harder to remove from a smaller atom",
        )
      : canvas.say(
          "diminui: o eletrão exterior está mais longe do núcleo",
          "decreases: the outer electron is farther from the nucleus",
        );
  else
    reason = acrossPeriod
      ? canvas.say(
          "aumenta: o átomo atrai mais os eletrões da ligação",
          "increases: the atom pulls bonding electrons harder",
        )
      : canvas.say(
          "diminui: o núcleo atrai menos os eletrões da ligação",
          "decreases: the nucleus pulls bonding electrons less",
        );
  canvas.caption(reason, {
    row: 1,
    color: "accent",
    visible: hasExceptions ? Anim.window(Teach.start(2), Teach.start(3)) : Anim.after(Teach.start(2)),
  });
  if (hasExceptions)
    canvas.caption(
      canvas.say(
        "Quedas (círculos): sai um eletrão p (B, Al) ou de um par (O, S)",
        "Dips (circles): a p electron (B, Al) or one of a pair (O, S)",
      ),
      { row: 1, color: "second", visible: Anim.after(Teach.start(3)), claim: false },
    );

  // The chart: a point per element, heights in proportion to the values from zero.
  const count = trend.symbols.length;
  const top = Math.max(...trend.values) * 1.15;
  const frame = new PremadeFrame(0.4, count + 0.6, 0, top, 1.7, 9.1, 1.6, 4.85);
  canvas.arrow(frame.left, frame.bottom, frame.right + 0.2, frame.bottom, { color: "muted" });
  canvas.arrow(frame.left, frame.bottom, frame.left, frame.top + 0.25, { color: "muted" });
  canvas.label(unit === "" ? propertyName : `${propertyName} (${unit})`, frame.left + 0.15, frame.top + 0.1, {
    anchor: "leading",
    color: "muted",
  });
  const tickStep = TemplateBuilder.step(top);
  for (let tick = tickStep; tick < top - tickStep * 0.1; tick += tickStep)
    if (canvas.label(n(tick), frame.left - 0.12, frame.y(tick), { anchor: "trailing", color: "muted" }))
      canvas.line(frame.left - 0.06, frame.y(tick), frame.left + 0.06, frame.y(tick), { color: "muted" });
  trend.symbols.forEach((symbol, index) =>
    canvas.label(symbol, frame.x(index + 1), frame.bottom - 0.3, {
      anchor: "center",
      color: "white",
      visible: Anim.after(Teach.start(0)),
    }),
  );
  // Step 2: the points appear one after the other, joined by a line.
  const spacing = 0.45;
  const points = trend.values.map((value, index) => ({ x: frame.x(index + 1), y: frame.y(value) }));
  points.forEach((point, index) => {
    const when = Teach.start(1) + spacing * index;
    if (index > 0) growingLine(canvas, points[index - 1]!, point, when - spacing, when, { color: "white" });
    canvas.dot(point.x, point.y, { color: "accent", visible: Anim.after(when) });
    canvas.label(n(trend.values[index]!), point.x, point.y + 0.32, {
      anchor: "center",
      color: "white",
      visible: Anim.after(when),
    });
  });
  const drawn = Teach.start(1) + spacing * (count - 1);
  // Step 3: the overall direction, from the first element to the last.
  const firstPoint = points[0];
  const lastPoint = points.at(-1);
  if (firstPoint && lastPoint) {
    const start = Math.max(Teach.start(2), drawn + 0.2);
    growingArrow(
      canvas,
      { x: firstPoint.x, y: frame.bottom + 0.35 },
      { x: lastPoint.x, y: frame.bottom + 0.35 },
      start,
      "accent",
    );
    canvas.label(
      canvas.say("número atómico crescente", "increasing atomic number"),
      (firstPoint.x + lastPoint.x) / 2,
      frame.bottom + 0.68,
      { anchor: "center", color: "accent", visible: Anim.after(start + 0.8), avoidStrokes: true },
    );
  }
  // Step 4: the elements that go against the trend.
  for (const index of trend.exceptions)
    canvas.ring(points[index]!.x, points[index]!.y, 0.2, {
      color: "second",
      visible: Anim.after(Math.max(Teach.start(3), drawn + 1.2)),
    });
  const boundaries = [0, Teach.start(0) + 0.1, drawn + 0.15, Math.max(Teach.start(2), drawn + 0.2) + 0.95];
  if (hasExceptions) boundaries.push(Math.max(Teach.start(3), drawn + 1.2) + 0.3);
  canvas.recordSteps(boundaries);
  return canvas.illustration(title, Anim.duration((boundaries.at(-1) ?? 0) + 1.0));
};

// MARK: Concentration against time

/** A reaction A → products of order 0, 1 or 2: [A] against t, with the successive half-lives. */
export class Kinetics {
  constructor(
    readonly order: number,
    readonly rate: number,
    readonly initial: number,
  ) {}

  concentration(t: number): number {
    if (this.order === 0) return Math.max(this.initial - this.rate * t, 0);
    if (this.order === 1) return this.initial * Math.exp(-this.rate * t);
    return 1 / (1 / this.initial + this.rate * t);
  }

  /** When [A] has fallen to [A]₀/2ⁿ. */
  timeWhenHalved(n: number): number {
    const factor = Math.pow(2, n);
    if (this.order === 0) return (this.initial * (1 - 1 / factor)) / this.rate;
    if (this.order === 1) return (n * Math.log(2)) / this.rate;
    return (factor - 1) / (this.rate * this.initial);
  }

  /** The n-th half-life: the time [A] takes to halve once more, from [A]₀/2ⁿ⁻¹ to [A]₀/2ⁿ. */
  halfLife(n: number): number {
    return this.timeWhenHalved(n) - (n > 1 ? this.timeWhenHalved(n - 1) : 0);
  }

  /** The quantity that is a straight line against t: [A], ln [A] or 1/[A]. */
  linearized(t: number): number {
    if (this.order === 0) return this.initial - this.rate * t;
    if (this.order === 1) return Math.log(this.initial) - this.rate * t;
    return 1 / this.initial + this.rate * t;
  }

  /** The slope of that line: −k, −k and +k. */
  get slope(): number {
    return this.order === 2 ? this.rate : -this.rate;
  }

  /** The time shown: for order 0 until [A] reaches zero, otherwise until it has halved four times. */
  get duration(): number {
    return this.order === 0 ? this.initial / this.rate : this.timeWhenHalved(4);
  }
}

export function kinetics(params: Params): Kinetics | null {
  const order = params.number("order");
  if (order !== 0 && order !== 1 && order !== 2) return null;
  const defaults: Record<number, number> = { 0: 0.05, 1: 0.1, 2: 0.1 };
  const initial = params.number("A0") ?? 1;
  const rate = params.number("k") ?? defaults[order] ?? 0.1;
  if (!(within(initial, 1e-3, 1e3) && within(rate, 1e-4, 1e3))) return null;
  return new Kinetics(order, rate, initial);
}

/** The two graphs: [A] on the left, its straight-line form on the right. */
export function kineticsFrames(k: Kinetics): { concentration: PremadeFrame; line: PremadeFrame } {
  const end = k.duration;
  const left = new PremadeFrame(0, end, -0.04 * k.initial, 1.1 * k.initial, 1.3, 4.6, 1.75, 4.6);
  const values = [k.linearized(0), k.linearized(end)];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = Math.max(high - low, 1e-6) * 0.12;
  const right = new PremadeFrame(0, end, low - pad, high + pad, 5.9, 9.2, 1.75, 4.6);
  return { concentration: left, line: right };
}

const concentrationTime: Compiler = (params, title, language) => {
  const k = kinetics(params);
  if (!k) return null;
  const canvas = new FigureCanvas(language);
  const n = (value: number) => canvas.number(value, 3);
  const order = k.order;
  const frames = kineticsFrames(k);
  const end = k.duration;

  // Words first.
  const rateLaw = order === 0 ? "v = k" : order === 1 ? "v = k[A]" : "v = k[A]²";
  const integrated = order === 0 ? "[A] = [A]₀ − kt" : order === 1 ? "[A] = [A]₀·e⁻ᵏᵗ" : "1/[A] = 1/[A]₀ + kt";
  canvas.caption(
    canvas.say(`Ordem ${order}: ${rateLaw}  ·  ${integrated}`, `Order ${order}: ${rateLaw}  ·  ${integrated}`),
    {
      row: 0,
      color: "white",
      visible: Anim.after(Teach.start(0)),
    },
  );
  const intervals = [1, 2, 3].map((i) => k.halfLife(i));
  const pattern =
    order === 0
      ? canvas.say("cada meia-vida é metade da anterior", "each half-life is half the last")
      : order === 1
        ? canvas.say("meias-vidas iguais", "equal half-lives")
        : canvas.say("cada meia-vida é o dobro da anterior", "each half-life is twice the last");
  const listed = canvas.list(intervals.map(n));
  canvas.caption(canvas.say(`Meias-vidas: ${listed} s (${pattern})`, `Half-lives: ${listed} s (${pattern})`), {
    row: 1,
    color: "second",
    visible: Anim.window(Teach.start(2), Teach.start(3)),
  });
  const unit = order === 0 ? "mol·L⁻¹·s⁻¹" : order === 1 ? "s⁻¹" : "L·mol⁻¹·s⁻¹";
  const lineName = order === 0 ? "[A]" : order === 1 ? "ln [A]" : "1/[A]";
  const signed = order === 2 ? "+k" : "−k";
  const sign = order === 2 ? "" : "−";
  canvas.caption(
    canvas.say(
      `${lineName} em função de t é uma reta de declive ${signed} = ${sign}${n(k.rate)} ${unit}`,
      `${lineName} against t is a straight line of slope ${signed} = ${sign}${n(k.rate)} ${unit}`,
    ),
    { row: 1, color: "accent", visible: Anim.after(Teach.start(3)), claim: false },
  );

  // Step 1: the concentration curve.
  canvas.axes(frames.concentration, { xName: "t (s)", yName: "[A] (mol/L)", ticks: false, titles: false });
  const curve =
    order === 0
      ? `${Anim.n(k.initial)} - ${Anim.n(k.rate)}*x`
      : order === 1
        ? `${Anim.n(k.initial)}*exp(-${Anim.n(k.rate)}*x)`
        : `1/(1/${Anim.n(k.initial)} + ${Anim.n(k.rate)}*x)`;
  const plotted = PlottedFunction.make(curve);
  if (plotted)
    canvas.plot(plotted, frames.concentration, 0, end, {
      color: "white",
      start: Teach.start(0),
      end: Teach.start(0) + 1.0,
    });
  // Step 2: the concentration halves, again and again: [A]₀/2, /4, /8.
  for (let index = 1; index <= 3; index++) {
    const when = Anim.after(Teach.start(2) + 0.4 * (index - 1));
    const t = k.timeWhenHalved(index);
    const value = k.initial / Math.pow(2, index);
    const f = frames.concentration;
    canvas.line(f.x(t), f.axisY, f.x(t), f.y(value), { color: "second", dashed: true, visible: when });
    canvas.line(f.left, f.y(value), f.x(t), f.y(value), { color: "second", dashed: true, visible: when });
    canvas.dot(f.x(t), f.y(value), { color: "second", visible: when });
  }
  // Step 3: the straight line that tells the order.
  canvas.axes(frames.line, { xName: "t (s)", yName: lineName, ticks: false, titles: false });
  const straight = PlottedFunction.make(
    order === 0
      ? curve
      : order === 1
        ? `ln(${Anim.n(k.initial)}) - ${Anim.n(k.rate)}*x`
        : `1/${Anim.n(k.initial)} + ${Anim.n(k.rate)}*x`,
  );
  if (straight)
    canvas.plot(straight, frames.line, 0, end, { color: "accent", start: Teach.start(3), end: Teach.start(3) + 1.0 });
  canvas.axisTitles(frames.concentration, "t (s)", "[A] (mol/L)");
  canvas.axisTitles(frames.line, "t (s)", lineName);
  canvas.axisTicks(frames.concentration);
  canvas.axisTicks(frames.line);
  canvas.recordSteps([0, Teach.start(0) + 1.05, Teach.start(2) + 1.3, Teach.start(3) + 1.05]);
  return canvas.illustration(title, Anim.duration(Teach.start(3) + 2.2), [
    slider("k", `k (${unit})`, k.rate, k.rate / 4, k.rate * 4),
    slider("A0", "[A]₀ (mol/L)", k.initial, k.initial / 2, k.initial * 2),
  ]);
};

// MARK: Punnett square

const isUpper = (ch: string) => ch !== ch.toLowerCase() && ch === ch.toUpperCase();
const isLetter = (ch: string) => /^\p{L}$/u.test(ch);

/** Sorting key: per gene, dominant homozygous (0), heterozygous (1), recessive homozygous (2); classes the same way. */
function rank(text: string): number[] {
  const letters = Array.from(text);
  const result: number[] = [];
  while (letters.length >= 2) {
    const first = letters.shift()!;
    const second = letters.shift()!;
    if (second === "_") result.push(0);
    else if (isUpper(first) && isUpper(second)) result.push(0);
    else if (isUpper(first) !== isUpper(second)) result.push(1);
    else result.push(2);
  }
  return result;
}
const lexicographic = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
};

export class PunnettSquare {
  constructor(
    /** The letters of the genes, in order (one for a monohybrid cross, two for a dihybrid one). */
    readonly genes: string[],
    readonly gametes1: string[],
    readonly gametes2: string[],
    /** cells[row][column]: the genotype written dominant allele first. */
    readonly cells: string[][],
  ) {}

  private counted(key: (cell: string) => string): { text: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const row of this.cells) for (const cell of row) counts.set(key(cell), (counts.get(key(cell)) ?? 0) + 1);
    return [...counts.keys()]
      .sort((a, b) => lexicographic(rank(a), rank(b)))
      .map((text) => ({ text, count: counts.get(text) ?? 0 }));
  }

  /** The genotypes that occur, dominant homozygous first, with how many cells have each. */
  get genotypeCounts(): { genotype: string; count: number }[] {
    return this.counted((cell) => cell).map(({ text, count }) => ({ genotype: text, count }));
  }

  /** The phenotype classes (`A_B_`, `A_bb`, `aaB_`, `aabb`) with how many cells show each. */
  get phenotypeCounts(): { phenotype: string; count: number }[] {
    return this.counted((cell) => this.phenotype(cell)).map(({ text, count }) => ({ phenotype: text, count }));
  }

  /** A genotype's class: a dominant allele present means the dominant trait (`A_`), otherwise `aa`. */
  phenotype(genotype: string): string {
    const letters = Array.from(genotype);
    let text = "";
    for (let index = 0; index + 1 < letters.length; index += 2) {
      const pair = [letters[index]!, letters[index + 1]!];
      const dominant = pair.find(isUpper);
      text += dominant !== undefined ? `${dominant}_` : `${letters[index]}${letters[index]}`;
    }
    return text;
  }
}

/** The gametes of a genotype such as "Aa" or "AaBb": one allele of every gene, in all combinations. */
export function gametes(genotype: string): string[] | null {
  const letters = Array.from(genotype);
  if ((letters.length !== 2 && letters.length !== 4) || !letters.every(isLetter)) return null;
  let result = [""];
  for (let index = 0; index < letters.length; index += 2) {
    const pair = [letters[index]!, letters[index + 1]!];
    // The two alleles of a gene are the same letter, in either case.
    if (pair[0]!.toLowerCase() !== pair[1]!.toLowerCase()) return null;
    result = result.flatMap((prefix) => pair.map((allele) => prefix + allele));
  }
  return result;
}

export function punnettSquare(parent1: string, parent2: string): PunnettSquare | null {
  const first = gametes(parent1);
  const second = gametes(parent2);
  if (!first || !second) return null;
  const letters1 = Array.from(parent1);
  const letters2 = Array.from(parent2);
  const genes1 = letters1.filter((_, index) => index % 2 === 0);
  const genes2 = letters2.filter((_, index) => index % 2 === 0);
  // The same genes, in the same order, whatever the case.
  if (genes1.length !== genes2.length || !genes1.every((g, i) => g.toLowerCase() === genes2[i]!.toLowerCase()))
    return null;
  const cells = first.map((mother) =>
    second.map((father) => {
      let genotype = "";
      for (let gene = 0; gene < genes1.length; gene++) {
        const pair = [Array.from(mother)[gene]!, Array.from(father)[gene]!];
        // The dominant (capital) allele first.
        genotype += isUpper(pair[1]!) && !isUpper(pair[0]!) ? pair[1]! + pair[0]! : pair[0]! + pair[1]!;
      }
      return genotype;
    }),
  );
  return new PunnettSquare(
    genes1.map((g) => g.toLowerCase()),
    first,
    second,
    cells,
  );
}

const fraction = (count: number, total: number) => {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(count, total);
  const top = count / divisor;
  const bottom = total / divisor;
  return bottom === 1 ? `${top}` : `${top}/${bottom}`;
};

const punnettSquareFigure: Compiler = (params, title, language) => {
  const one = params.text("parent1");
  const two = params.text("parent2");
  const square = one !== null && two !== null ? punnettSquare(one, two) : null;
  if (!square || one === null || two === null) return null;
  const canvas = new FigureCanvas(language);
  const size = square.cells.length;
  const total = size * size;
  // Words first: the cross and its gametes; the lists of results are written at the right.
  const gameteText1 = square.gametes1.join(" ");
  const gameteText2 = square.gametes2.join(" ");
  canvas.caption(
    canvas.say(
      `Cruzamento ${one} × ${two}  ·  gâmetas ${gameteText1} × ${gameteText2}`,
      `Cross ${one} × ${two}  ·  gametes ${gameteText1} × ${gameteText2}`,
    ),
    { row: 0, color: "white", visible: Anim.after(Teach.start(0)) },
  );

  // The grid: the first parent's gametes down the side, the second's across the top.
  // A 4 × 4 grid is kept low and to the left, so that the two lists of results (one result a line) stand clear of it.
  const cellWidth = size === 2 ? 1.4 : 1.1;
  const cellHeight = size === 2 ? 1.0 : 0.6;
  const left = size === 2 ? 2.1 : 1.7;
  const top = size === 2 ? 3.9 : 4.35;
  const centre = (row: number, column: number) => ({
    x: left + cellWidth * (column + 0.5),
    y: top - cellHeight * (row + 0.5),
  });
  const bottom = top - cellHeight * size;
  const right = left + cellWidth * size;
  const frame = Anim.after(Teach.start(0));
  for (let index = 0; index <= size; index++) {
    canvas.line(left, top - cellHeight * index, right, top - cellHeight * index, { color: "muted", visible: frame });
    canvas.line(left + cellWidth * index, top, left + cellWidth * index, bottom, { color: "muted", visible: frame });
  }
  square.gametes2.forEach((gamete, column) =>
    canvas.label(gamete, centre(0, column).x, top + 0.35, { anchor: "center", color: "second", visible: frame }),
  );
  square.gametes1.forEach((gamete, row) =>
    canvas.label(gamete, left - 0.2, centre(row, 0).y, { anchor: "trailing", color: "accent", visible: frame }),
  );
  // Step 2: every cell gets the genotype its two gametes make, one after another.
  const delay = Math.min(0.3, 2.4 / total);
  for (let row = 0; row < size; row++)
    for (let column = 0; column < size; column++)
      canvas.label(square.cells[row]![column]!, centre(row, column).x, centre(row, column).y, {
        anchor: "center",
        color: "white",
        visible: Anim.after(Teach.start(1) + delay * (row * size + column)),
      });
  // Step 3: the genotypes, counted. Step 4: the phenotypes, counted, and the cells coloured by their class.
  const genotypes = square.genotypeCounts;
  const phenotypes = square.phenotypeCounts;
  const cellsEnd = Teach.start(1) + delay * total;
  const genotypesAt = cellsEnd + 0.4;
  const phenotypesAt = genotypesAt + 1.3;
  // The lists at the right, a row every 0.48 so that no two touch. A short cross has them in one block; the 4 × 4 grid has
  // the genotypes in one column and the phenotypes in another, each result on a line, in the order of the genotypes.
  const tall = size > 2;
  const genotypeX = tall ? 6.5 : 7.0;
  const phenotypeX = tall ? 8.3 : 7.0;
  const rowStep = tall ? 0.48 : 0.47;
  const list = (
    entries: [string, number][],
    heading: string,
    x: number,
    titleY: number,
    firstRow: number,
    rows: number,
    when: number,
    color: (text: string) => string,
  ) => {
    canvas.label(heading, x, titleY, { anchor: "leading", color: "muted", visible: Anim.after(when) });
    entries.forEach(([text, count], index) => {
      const column = Math.trunc(index / rows);
      const row = index % rows;
      canvas.label(`${fraction(count, total)} ${text}`, x + 1.55 * column, firstRow - rowStep * row, {
        anchor: "leading",
        color: color(text),
        visible: Anim.after(when),
      });
    });
  };
  list(
    genotypes.map((g) => [g.genotype, g.count]),
    canvas.say("Genótipos", "Genotypes"),
    genotypeX,
    tall ? 4.93 : 4.62,
    tall ? 4.42 : 4.12,
    tall ? Math.max(genotypes.length, 1) : genotypes.length > 5 ? 5 : Math.max(genotypes.length, 1),
    genotypesAt,
    () => "white",
  );
  // A class with every gene dominant is blue, every gene recessive orange, the others grey.
  const classColor = (phenotype: string) => {
    const genes = Array.from(phenotype).length / 2;
    const dominant = Array.from(phenotype).filter((c) => c === "_").length;
    return dominant === genes ? "accent" : dominant === 0 ? "second" : "muted";
  };
  const genotypeRows = genotypes.length > 5 ? 5 : genotypes.length;
  const phenotypeTitle = tall ? 4.93 : 4.12 - 0.47 * (genotypeRows - 1) - 0.55;
  list(
    phenotypes.map((p) => [p.phenotype, p.count]),
    canvas.say("Fenótipos", "Phenotypes"),
    phenotypeX,
    phenotypeTitle,
    tall ? 4.42 : phenotypeTitle - 0.5,
    tall ? Math.max(phenotypes.length, 1) : phenotypes.length > 3 ? 2 : Math.max(phenotypes.length, 1),
    phenotypesAt,
    classColor,
  );
  for (let row = 0; row < size; row++)
    for (let column = 0; column < size; column++) {
      const cellClass = square.phenotype(square.cells[row]![column]!);
      canvas.box(
        centre(row, column).x - cellWidth / 2 + 0.04,
        centre(row, column).y - cellHeight / 2 + 0.04,
        cellWidth - 0.08,
        cellHeight - 0.08,
        { color: classColor(cellClass), visible: Anim.after(phenotypesAt) },
      );
    }
  canvas.recordSteps([0, Teach.start(0) + 0.1, cellsEnd + 0.15, genotypesAt + 0.1, phenotypesAt + 0.1]);
  return canvas.illustration(title, Anim.duration(phenotypesAt + 1.2));
};

/** The chemistry and biology of batch 3, by premade type. */
export const chemistryFigures: Record<string, Compiler> = {
  lewisStructure,
  reactionProfile,
  titrationCurve,
  iceTable,
  periodicTrends,
  concentrationTime,
  punnettSquare: punnettSquareFigure,
};
