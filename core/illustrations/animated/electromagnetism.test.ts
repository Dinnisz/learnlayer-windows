// Port of LearnLayerTests/PremadeFigureElectromagnetismTests.swift @ ref 2026-11-04 (the field lines and the
// equipotentials of point charges, the plates, the magnetic field of a wire, a loop and a solenoid, the Lorentz force,
// Faraday and Lenz, the RC curves and the alternating voltage). The figures' bounds and overlaps are checked with the
// gallery in animated.test.ts.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration, type IllustrationElement } from "../illustration";
import { TemplateWords } from "../illustrationTemplate";
import { PremadeFigures } from "../premadeFigure";
import { sample } from "./animated";
import {
  acFrame,
  CircuitSignals,
  ElectricField,
  equipotentialRadii,
  fieldCharges,
  Lenz,
  lorentzSpin,
  MagneticField,
  magneticLines,
  PlaneGeometry,
  plateColumns,
  rcFrame,
  segmentLength,
  wireRadii,
  type EquipotentialContour,
  type FieldCharge,
  type FieldLine,
  type Segment,
} from "./electromagnetism";
import type { Point } from "./optics";

const language = "Portuguese (Portugal)";
const pt = (value: number) => new TemplateWords(language).number(value);
const at = (time: number) => ({ t: time, revealed: 1, step: 1000 });
const scene = (type: string, json: string) => {
  const compiled = new PremadeFigures(sample(type, json)).compile("t", language);
  if (!compiled) throw new Error(`${type} did not compile`);
  return compiled;
};
function finalLabels(figure: Illustration): string[] {
  const compiled = new CompiledIllustration(figure);
  const values = at(0.95 * (figure.duration ?? 0));
  return figure.elements
    .filter((e) => e.kind === "label" && (!e.visible || (compiled.value(e.visible, values) ?? 0) > 0))
    .map((e) => e.text ?? "");
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// SceneReading: the scene read the way the renderer reads it.
const number = (text: string | null | undefined) => (text == null || text.trim() === "" ? NaN : Number(text));
const value = (text: string | null | undefined, figure: Illustration, time = 0) =>
  new CompiledIllustration(figure).value(text ?? "", at(time));
/** Both ends of a line or arrow at `time`, from its expressions. */
function ends(element: IllustrationElement, figure: Illustration, time = 0): [Point, Point] {
  const [x1, y1, x2, y2] = [element.x, element.y, element.x2, element.y2].map((t) => value(t, figure, time));
  if ([x1, y1, x2, y2].some((v) => v === null || v === undefined)) throw new Error("no ends");
  return [
    { x: x1!, y: y1! },
    { x: x2!, y: y2! },
  ];
}
/** "out" for a ring with a dot, "in" for a ring with a cross, at a given centre. */
function pageSymbol(figure: Illustration, centre: Point): string | null {
  const close = (x: string | null | undefined, y: string | null | undefined) =>
    Math.abs(number(x) - centre.x) < 0.01 && Math.abs(number(y) - centre.y) < 0.01;
  if (!figure.elements.some((e) => e.kind === "circle" && close(e.x, e.y))) return null;
  if (figure.elements.some((e) => e.kind === "point" && close(e.x, e.y))) return "out";
  const crossing = figure.elements.filter((e) => {
    if (e.kind !== "line") return false;
    const [x1, y1, x2, y2] = [e.x, e.y, e.x2, e.y2].map(number) as [number, number, number, number];
    if ([x1, y1, x2, y2].some((v) => !Number.isFinite(v))) return false;
    const middle = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
    return (
      Math.abs(middle.x - centre.x) < 0.01 &&
      Math.abs(middle.y - centre.y) < 0.01 &&
      Math.abs(x1 - x2) > 0.01 &&
      Math.abs(y1 - y2) > 0.01
    );
  });
  return crossing.length === 2 ? "in" : null;
}
function segmentsOf(lines: FieldLine[], spacing = 0.15): Segment[][] {
  return lines.map((line) => {
    const points = PlaneGeometry.resample(line.points, spacing);
    const result: Segment[] = [];
    for (let index = 1; index < points.length; index++)
      result.push({ x1: points[index - 1]!.x, y1: points[index - 1]!.y, x2: points[index]!.x, y2: points[index]!.y });
    return result;
  });
}
function curvePoints(element: IllustrationElement, figure: Illustration, time: number, samples = 60): Point[] {
  const compiled = new CompiledIllustration(figure);
  const values = at(time);
  const from = compiled.value(element.from ?? "", values);
  const to = compiled.value(element.to ?? "", values);
  if (from === null || to === null) return [];
  const points: Point[] = [];
  for (let step = 0; step <= samples; step++) {
    const local = { ...values, s: from + ((to - from) * step) / samples };
    const x = compiled.value(element.curveX ?? "", local);
    const y = compiled.value(element.curveY ?? "", local);
    if (x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
  }
  return points;
}
const charges = (kind: string, q: number | null = null, q2: number | null = null): FieldCharge[] => {
  const found = fieldCharges(kind, q, q2);
  if (!found) throw new Error(`no charges for ${kind}`);
  return found;
};
const position = (charge: FieldCharge): Point => ({ x: charge.x, y: charge.y });
const arrowsOf = (figure: Illustration) => figure.elements.filter((e) => e.kind === "arrow");
const first = (figure: Illustration, test: (e: IllustrationElement) => boolean) => {
  const found = figure.elements.find(test);
  if (!found) throw new Error("element not found");
  return found;
};

describe("electric field", () => {
  it("lines start on positive charges and end on negative ones", () => {
    const dipole = charges("dipole");
    const lines = ElectricField.lines(dipole);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const start = line.points[0]!;
      if (line.source !== null) {
        expect(dipole[line.source]!.q).toBeGreaterThan(0);
        expect(Math.abs(distance(start, position(dipole[line.source]!)) - ElectricField.chargeRadius)).toBeLessThan(
          1e-9,
        );
      } else {
        // Coming from far away: only into a negative charge.
        expect(Math.abs(start.x - 5) > 30 || Math.abs(start.y - 3) > 30).toBe(true);
        expect(line.sink).not.toBeNull();
      }
      if (line.sink !== null) {
        expect(dipole[line.sink]!.q).toBeLessThan(0);
        expect(distance(line.points.at(-1)!, position(dipole[line.sink]!))).toBeLessThan(
          ElectricField.chargeRadius + 1e-9,
        );
      }
    }
    // Equal and opposite charges: every line from + lands on −.
    const fromPositive = lines.filter((l) => l.source === 0);
    expect(fromPositive).toHaveLength(8);
    expect(fromPositive.every((l) => l.sink === 1)).toBe(true);
  });

  it("lines follow the field direction", () => {
    const dipole = charges("dipole");
    for (const line of ElectricField.lines(dipole)) {
      const points = PlaneGeometry.resample(line.points, 0.3);
      for (let index = 1; index < points.length; index++) {
        const a = points[index - 1]!;
        const b = points[index]!;
        const field = ElectricField.vector({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dipole);
        expect(field.x * (b.x - a.x) + field.y * (b.y - a.y)).toBeGreaterThan(0);
      }
    }
  });

  it("line count is proportional to the size of the charge", () => {
    const unequal = charges("dipole", 2, 1);
    expect(ElectricField.lineCounts(unequal)).toEqual([8, 4]);
    const lines = ElectricField.lines(unequal);
    expect(lines.filter((l) => l.source === 0)).toHaveLength(8);
    // Gauss: no more lines end on the small negative charge than its share, and the rest escape.
    const endingOnNegative = lines.filter((l) => l.sink === 1).length;
    expect(endingOnNegative >= 3 && endingOnNegative <= 5).toBe(true);
    const counts = ElectricField.lineCounts(charges("like", 3, 1));
    expect(Math.abs(counts[0]! / counts[1]! - 3)).toBeLessThan(0.5);
    // A negative charge twice the positive one takes in lines from far away as well.
    const heavyLines = ElectricField.lines(charges("dipole", 1, 2));
    expect(heavyLines.filter((l) => l.sink === 1).length).toBeGreaterThanOrEqual(7);
    expect(heavyLines.some((l) => l.source === null)).toBe(true);
  });

  it("field lines never cross", () => {
    for (const kind of ["dipole", "like", "negative"]) {
      const all = segmentsOf(ElectricField.lines(charges(kind)));
      let crossing: string | null = null;
      search: for (let a = 0; a < all.length; a++)
        for (let b = a + 1; b < all.length; b++)
          for (const s of all[a]!)
            for (const t of all[b]!)
              if (PlaneGeometry.properlyCross(s, t)) {
                crossing = `${kind}: lines ${a} and ${b} cross`;
                break search;
              }
      expect(crossing).toBeNull();
    }
    const all = segmentsOf(ElectricField.lines(charges("dipole", 2, 1)));
    let crossings = 0;
    for (let a = 0; a < all.length; a++)
      for (let b = a + 1; b < all.length; b++)
        for (const s of all[a]!) for (const t of all[b]!) if (PlaneGeometry.properlyCross(s, t)) crossings += 1;
    expect(crossings).toBe(0);
  });

  it("like charges repel and leave to infinity", () => {
    const pair = charges("like");
    const lines = ElectricField.lines(pair);
    expect(lines).toHaveLength(16);
    expect(lines.every((l) => l.sink === null)).toBe(true);
    // Midway between equal charges the field is zero, and the lines from each side stay on that side.
    const middle = ElectricField.vector({ x: 5, y: 3 }, pair);
    expect(Math.hypot(middle.x, middle.y)).toBeLessThan(1e-9);
    for (const line of lines.filter((l) => l.source === 0)) expect(line.points.every((p) => p.x < 5 + 1e-6)).toBe(true);
  });

  it("drawn arrows point the way the field does", () => {
    const dipole = charges("dipole");
    const figure = scene("electricFieldLines", '{"kind": "dipole"}');
    const arrows = arrowsOf(figure);
    expect(arrows.length).toBeGreaterThanOrEqual(8);
    for (const arrow of arrows) {
      const [a, b] = ends(arrow, figure);
      const field = ElectricField.vector({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dipole);
      expect(field.x * (b.x - a.x) + field.y * (b.y - a.y)).toBeGreaterThan(0);
    }
    // A lone positive charge: away from it. A lone negative one: towards it.
    for (const [kind, away] of [
      ["positive", true],
      ["negative", false],
    ] as const) {
      const single = scene("electricFieldLines", `{"kind": "${kind}"}`);
      for (const arrow of arrowsOf(single)) {
        const [a, b] = ends(arrow, single);
        const outward = (b.x - a.x) * ((a.x + b.x) / 2 - 5) + (b.y - a.y) * ((a.y + b.y) / 2 - 3);
        expect(away ? outward > 0 : outward < 0, kind).toBe(true);
      }
    }
  });

  it("charges are labelled with their signs", () => {
    const labels = finalLabels(scene("electricFieldLines", '{"kind": "dipole", "q": 2, "q2": 1}'));
    expect(labels).toContain("+2q");
    expect(labels).toContain("−q");
    expect(finalLabels(scene("electricFieldLines", '{"kind": "positive"}'))).toContain("+q");
  });
});

describe("equipotentials", () => {
  const contours = (set: FieldCharge[]): EquipotentialContour[] => {
    const step = 0.42 * Math.max(...set.map((c) => Math.abs(c.q)));
    return ElectricField.contours(
      set,
      Array.from({ length: 9 }, (_, i) => step * (i - 4)),
      0.6,
      9.4,
      1.0,
      5.0,
    );
  };
  const sets = () => [charges("dipole"), charges("like"), charges("dipole", 2, 1)];

  it("contours are level sets of the potential", () => {
    for (const set of sets()) {
      const found = contours(set);
      const scale = Math.max(...set.map((c) => Math.abs(c.q)));
      expect(found.some((c) => c.segments.length > 0)).toBe(true);
      for (const contour of found)
        for (const segment of contour.segments) {
          const middle = { x: (segment.x1 + segment.x2) / 2, y: (segment.y1 + segment.y2) / 2 };
          const potential = ElectricField.potential(middle, set);
          expect(Math.abs(potential - contour.level)).toBeLessThanOrEqual(
            0.06 * Math.max(Math.abs(contour.level), 0.3 * scale),
          );
        }
    }
  });

  it("contours meet the field at right angles", () => {
    for (const set of sets())
      for (const contour of contours(set))
        for (const segment of contour.segments) {
          if (!(segmentLength(segment) > 1e-9)) continue;
          const middle = { x: (segment.x1 + segment.x2) / 2, y: (segment.y1 + segment.y2) / 2 };
          const field = ElectricField.vector(middle, set);
          const size = Math.hypot(field.x, field.y);
          if (!(size > 0.25)) continue;
          const along = Math.abs((segment.x2 - segment.x1) * field.x + (segment.y2 - segment.y1) * field.y);
          expect(along / (size * segmentLength(segment))).toBeLessThan(0.4);
        }
  });

  it("zero potential of equal and opposite charges is their bisector", () => {
    const zero = contours(charges("dipole")).find((c) => Math.abs(c.level) < 1e-9)!;
    expect(zero.segments.length).toBeGreaterThan(20);
    for (const segment of zero.segments)
      expect(Math.abs(segment.x1 - 5) < 0.12 && Math.abs(segment.x2 - 5) < 0.12).toBe(true);
    // Same-sign charges never reach V = 0.
    const none = contours(charges("like")).find((c) => Math.abs(c.level) < 1e-9)!;
    expect(none.segments).toHaveLength(0);
  });

  it("circles round a single charge step V", () => {
    const radii = equipotentialRadii();
    expect(radii).toHaveLength(4);
    const charge = { x: 5, y: 3, q: 1 };
    const potentials = radii.map((r) => ElectricField.potential({ x: 5 + r, y: 3 }, [charge]));
    potentials.forEach((potential, index) =>
      expect(Math.abs(potential - (index + 1) * potentials[0]!)).toBeLessThan(1e-9),
    );
    const figure = scene("equipotentials", '{"kind": "positive"}');
    const drawn = figure.elements
      .filter((e) => e.kind === "circle")
      .map((e) => number(e.r))
      .filter((r) => r > 0.3);
    expect(drawn).toHaveLength(4);
    drawn.sort((a, b) => b - a).forEach((shown, index) => expect(Math.abs(shown - radii[index]!)).toBeLessThan(1e-4));
    // Negative charge: the same circles, in the other colour.
    const negative = scene("equipotentials", '{"kind": "negative"}');
    expect(negative.elements.some((e) => e.kind === "circle" && e.color === "second" && number(e.r) > 0.3)).toBe(true);
  });
});

describe("parallel plates", () => {
  const plates = (json: string) => scene("parallelPlates", json);

  it("the field is uniform from the positive to the negative plate", () => {
    const figure = plates('{"voltage": 100, "distance": 0.02}');
    const arrows = figure.elements.filter((e) => e.kind === "arrow" && e.color === "white");
    expect(arrows).toHaveLength(plateColumns.length);
    const vectors = arrows.map((arrow) => {
      const [a, b] = ends(arrow, figure);
      return { x: b.x - a.x, y: b.y - a.y, column: a.x };
    });
    // Parallel, equal, pointing down from the positive plate on top.
    expect(vectors.every((v) => Math.abs(v.x) < 1e-9 && v.y < 0)).toBe(true);
    expect(vectors.every((v) => Math.abs(v.y - vectors[0]!.y) < 1e-9)).toBe(true);
    const gaps = vectors.slice(1).map((v, index) => v.column - vectors[index]!.column);
    expect(gaps.every((gap) => Math.abs(gap - gaps[0]!) < 1e-9)).toBe(true);
    // E = V/d.
    expect(finalLabels(figure)).toContain(`E = V/d = ${pt(100)}/${pt(0.02)} = ${pt(5000)} V/m`);
  });

  it("the potential falls linearly across the gap", () => {
    const figure = plates('{"voltage": 100, "distance": 0.02}');
    const time = 0.95 * (figure.duration ?? 0);
    const height = (text: string) =>
      value(first(figure, (e) => e.kind === "label" && e.text === text).y, figure, time)!;
    const low = height("0 V");
    const high = height("100 V");
    expect(high).toBeGreaterThan(low);
    for (const volts of [25, 50, 75])
      expect(Math.abs((height(`${pt(volts)} V`) - low) / (high - low) - volts / 100)).toBeLessThan(1e-9);
  });

  it("the test charge starts from rest and accelerates uniformly", () => {
    const figure = plates('{"voltage": 100, "distance": 0.02}');
    const charge = first(figure, (e) => e.kind === "point" && e.text === "+q");
    const y = (time: number) => value(charge.y, figure, time) ?? NaN;
    // The motion runs from t = 1.6 s to t = 4.4 s: displacement grows as the square of the time.
    const start = y(1.0);
    const half = y(3.0);
    const end = y(4.4);
    expect(start).toBeGreaterThan(end);
    expect(Math.abs((start - half) / (start - end) - 0.25)).toBeLessThan(1e-9);
    expect(Math.abs(y(1.6) - start)).toBeLessThan(1e-9);
    // It moves with E (down), and F = qE points the same way.
    const force = first(figure, (e) => e.kind === "arrow" && e.text === "F");
    const [a, b] = ends(force, figure, 3.0);
    expect(b.y).toBeLessThan(a.y);
    // v grows with time while F stays the same.
    const speed = first(figure, (e) => e.kind === "arrow" && e.text === "v");
    const early = ends(speed, figure, 2.4);
    const late = ends(speed, figure, 4.0);
    expect(Math.abs(late[1].y - late[0].y)).toBeGreaterThan(Math.abs(early[1].y - early[0].y));
    const early2 = ends(force, figure, 2.4);
    const late2 = ends(force, figure, 4.0);
    expect(Math.abs(early2[1].y - early2[0].y - (late2[1].y - late2[0].y))).toBeLessThan(1e-9);
  });

  it("a negative charge is pushed against the field", () => {
    const figure = plates('{"voltage": 100, "distance": 0.02, "charge": "negative"}');
    const charge = first(figure, (e) => e.kind === "point" && e.text === "−q");
    expect(value(charge.y, figure, 4.4)!).toBeGreaterThan(value(charge.y, figure, 1.0)!);
    const [a, b] = ends(
      first(figure, (e) => e.kind === "arrow" && e.text === "F"),
      figure,
      3.0,
    );
    expect(b.y).toBeGreaterThan(a.y);
    // The field arrows still point down: only the force flipped.
    const [fa, fb] = ends(
      first(figure, (e) => e.kind === "arrow" && e.color === "white"),
      figure,
    );
    expect(fb.y).toBeLessThan(fa.y);
  });

  it("swapping the plates reverses the field", () => {
    const figure = plates('{"voltage": 100, "distance": 0.02, "positivePlate": "bottom"}');
    const [a, b] = ends(
      first(figure, (e) => e.kind === "arrow" && e.color === "white"),
      figure,
    );
    expect(b.y).toBeGreaterThan(a.y);
  });
});

describe("magnetic field", () => {
  it("the field round a wire is tangent and follows the right-hand rule", () => {
    for (const [current, counterClockwise] of [
      ["out", true],
      ["in", false],
    ] as const) {
      const figure = scene("magneticField", `{"kind": "wire", "current": "${current}"}`);
      const arrows = arrowsOf(figure);
      expect(arrows).toHaveLength(2 * wireRadii.length);
      const scales: number[] = [];
      for (const arrow of arrows) {
        const [a, b] = ends(arrow, figure);
        const middle = { x: (a.x + b.x) / 2 - 5, y: (a.y + b.y) / 2 - 3 };
        const field = { x: b.x - a.x, y: b.y - a.y };
        const radius = Math.hypot(middle.x, middle.y);
        // Tangent: no component along the radius.
        expect(
          Math.abs(middle.x * field.x + middle.y * field.y) / (radius * Math.hypot(field.x, field.y)),
        ).toBeLessThan(1e-5);
        // Right-hand rule: out of the page is counter-clockwise, into it clockwise.
        const turn = middle.x * field.y - middle.y * field.x;
        expect(counterClockwise ? turn > 0 : turn < 0).toBe(true);
        // |B| ∝ 1/r.
        scales.push(Math.hypot(field.x, field.y) * radius);
      }
      expect(scales.every((s) => Math.abs(s - scales[0]!) < 1e-4)).toBe(true);
      // The wire's own symbol.
      expect(pageSymbol(figure, { x: 5, y: 3 })).toBe(current);
    }
  });

  it("the wire function matches the figure", () => {
    const out = MagneticField.wire({ x: 2, y: 0 }, true);
    expect(Math.abs(out.x) === 0 && out.y > 0).toBe(true); // counter-clockwise: up on the right of the wire
    expect(MagneticField.wire({ x: 2, y: 0 }, false).y).toBeLessThan(0);
    const near = MagneticField.wire({ x: 1, y: 0 }, true);
    const far = MagneticField.wire({ x: 2, y: 0 }, true);
    expect(Math.abs(near.y / far.y - 2)).toBeLessThan(1e-12);
  });

  it("a loop makes μ₀I/2R at its centre", () => {
    const radius = 1.1;
    const centre = MagneticField.rings({ x: 0, y: 0 }, [0], radius, 64);
    expect(Math.abs(centre.x - (2 * Math.PI) / radius)).toBeLessThan(1e-9);
    expect(Math.abs(centre.y)).toBeLessThan(1e-9);
    // On the axis: B = 2πR²/(x² + R²)^{3/2}.
    for (const x of [0.5, 1.0, 2.5]) {
      const onAxis = MagneticField.rings({ x, y: 0 }, [0], radius, 64);
      const expected = (2 * Math.PI * radius * radius) / Math.pow(x * x + radius * radius, 1.5);
      expect(Math.abs(onAxis.x - expected)).toBeLessThan(1e-9);
    }
  });

  const nearestIndex = (line: Point[], seed: Point) =>
    line.reduce((best, point, index) => (distance(point, seed) < distance(line[best]!, seed) ? index : best), 0);

  it("the loop field runs one way inside and the other outside", () => {
    const lines = magneticLines("loop", 1, true);
    const heights = [0, 0.55, -0.55, 1.8, -1.8];
    expect(lines).toHaveLength(heights.length);
    lines.forEach((line, index) => {
      const height = heights[index]!;
      const nearest = nearestIndex(line, { x: 5, y: 3 + height });
      expect(nearest + 1, `line at ${height} is too short`).toBeLessThan(line.length);
      const step = line[nearest + 1]!.x - line[nearest]!.x;
      // Inside the loop B points along the axis (right), outside it returns the other way.
      expect(Math.abs(height) < 1.1 ? step > 0 : step < 0, `height ${height}`).toBe(true);
    });
    // Mirrored when the current is reversed.
    const flipped = magneticLines("loop", 1, false)[0]!;
    const nearest = nearestIndex(flipped, { x: 5, y: 3 });
    expect(nearest + 1).toBeLessThan(flipped.length);
    expect(flipped[nearest + 1]!.x).toBeLessThan(flipped[nearest]!.x);
  });

  it("the solenoid field is uniform inside and weak outside", () => {
    const radius = 0.75;
    const length = 3.6;
    const turns = 9;
    const positions = Array.from({ length: turns }, (_, i) => -length / 2 + (length * i) / (turns - 1));
    const centre = MagneticField.rings({ x: 0, y: 0 }, positions, radius, 32);
    expect(centre.x).toBeGreaterThan(0);
    for (const y of [0, 0.2, -0.2, 0.375, -0.375]) {
      const inside = MagneticField.rings({ x: 0, y }, positions, radius, 32);
      expect(Math.abs(inside.x / centre.x - 1)).toBeLessThan(0.03);
      expect(Math.abs(inside.y / centre.x)).toBeLessThan(0.01);
    }
    for (const x of [-0.5, 0.5])
      expect(Math.abs(MagneticField.rings({ x, y: 0 }, positions, radius, 32).x / centre.x - 1)).toBeLessThan(0.03);
    for (const y of [1.5, 2.0])
      expect(Math.abs(MagneticField.rings({ x: 0, y }, positions, radius, 32).x / centre.x)).toBeLessThan(0.06);
  });

  it("the solenoid lines inside are straight and parallel to the axis", () => {
    const lines = magneticLines("solenoid", 9, true);
    const heights = [0, 0.28, -0.28, 0.5, -0.5];
    for (let index = 0; index < 3; index++) {
      const inside = lines[index]!.filter((p) => Math.abs(p.x - 5) < 1.0);
      expect(inside.length).toBeGreaterThan(5);
      expect(inside.every((p) => Math.abs(p.y - (3 + heights[index]!)) < 0.03)).toBe(true);
      // And the direction is to the right.
      expect(inside.at(-1)!.x).toBeGreaterThan(inside[0]!.x);
    }
  });

  it("loop and solenoid symbols follow the right-hand rule", () => {
    // B to the right on the axis: the current comes out of the page on top, goes into it below.
    const loop = scene("magneticField", '{"kind": "loop"}');
    expect(pageSymbol(loop, { x: 5, y: 4.1 })).toBe("out");
    expect(pageSymbol(loop, { x: 5, y: 1.9 })).toBe("in");
    const left = scene("magneticField", '{"kind": "loop", "axis": "left"}');
    expect(pageSymbol(left, { x: 5, y: 4.1 })).toBe("in");
    const solenoid = scene("magneticField", '{"kind": "solenoid", "turns": 9}');
    expect(pageSymbol(solenoid, { x: 3.2, y: 3.75 })).toBe("out");
    expect(pageSymbol(solenoid, { x: 6.8, y: 2.25 })).toBe("in");
    // Field leaves the right end: that end is the north pole.
    const labels = finalLabels(solenoid);
    expect(labels.includes("N") && labels.includes("S")).toBe(true);
    const north = first(solenoid, (e) => e.kind === "label" && e.text === "N");
    expect(number(north.x)).toBeGreaterThan(5);
  });

  it("the solenoid's arrows follow the field direction", () => {
    const figure = scene("magneticField", '{"kind": "solenoid", "turns": 9}');
    const positions = Array.from({ length: 9 }, (_, i) => -1.8 + (3.6 * i) / 8);
    for (const arrow of arrowsOf(figure)) {
      const [a, b] = ends(arrow, figure);
      const middle = { x: (a.x + b.x) / 2 - 5, y: (a.y + b.y) / 2 - 3 };
      // Skip arrows that sit very close to a winding, where the field changes quickly.
      if (positions.some((p) => Math.hypot(middle.x - p, Math.abs(middle.y) - 0.75) < 0.3)) continue;
      const field = MagneticField.rings(middle, positions, 0.75, 32);
      expect(field.x * (b.x - a.x) + field.y * (b.y - a.y)).toBeGreaterThan(0);
    }
  });
});

describe("Lorentz force", () => {
  it("the force is perpendicular to the velocity and equals q v × B", () => {
    for (const [charge, field] of [
      ["positive", "into"],
      ["negative", "into"],
      ["positive", "out"],
      ["negative", "out"],
    ] as const) {
      const figure = scene("lorentzForce", `{"charge": "${charge}", "field": "${field}"}`);
      const velocity = first(figure, (e) => e.kind === "arrow" && e.text === "v");
      const force = first(figure, (e) => e.kind === "arrow" && e.text === "F");
      const q = charge === "positive" ? 1 : -1;
      const bz = field === "into" ? -1 : 1;
      for (const time of [0, 1.5, 2.5, 3.5, 5.0]) {
        const [va, vb] = ends(velocity, figure, time);
        const [fa, fb] = ends(force, figure, time);
        const v = { x: vb.x - va.x, y: vb.y - va.y };
        const f = { x: fb.x - fa.x, y: fb.y - fa.y };
        // F ⟂ v.
        expect(Math.abs(v.x * f.x + v.y * f.y) / (Math.hypot(v.x, v.y) * Math.hypot(f.x, f.y))).toBeLessThan(1e-9);
        // F ∥ q (v × B), with B along ±z: (vy·Bz, −vx·Bz).
        const expected = { x: q * v.y * bz, y: -q * v.x * bz };
        const cosine =
          (expected.x * f.x + expected.y * f.y) / (Math.hypot(expected.x, expected.y) * Math.hypot(f.x, f.y));
        expect(cosine, `${charge} ${field} t = ${time}`).toBeGreaterThan(1 - 1e-9);
        // F points to the centre of the path, and the charge stays on the circle.
        const toCentre = { x: 5 - va.x, y: 3 - va.y };
        expect(Math.abs(Math.hypot(toCentre.x, toCentre.y) - 1.5)).toBeLessThan(1e-6);
        expect(f.x * toCentre.x + f.y * toCentre.y).toBeGreaterThan(0);
      }
    }
  });

  it("the spin follows the sign of the charge and the field", () => {
    expect(lorentzSpin(true, true)).toBe(1);
    expect(lorentzSpin(false, true)).toBe(-1);
    expect(lorentzSpin(true, false)).toBe(-1);
    expect(lorentzSpin(false, false)).toBe(1);
  });

  it("the field symbols match the direction of B", () => {
    expect(pageSymbol(scene("lorentzForce", '{"field": "into"}'), { x: 1.0, y: 1.35 })).toBe("in");
    expect(pageSymbol(scene("lorentzForce", '{"field": "out"}'), { x: 1.0, y: 1.35 })).toBe("out");
  });
});

describe("Faraday and Lenz", () => {
  /**
   * The induced field from Faraday's law with signs, not from the rule of thumb: the flux along +x is Φ ∝ s / d³ (s =
   * +1 when the N pole faces the coil), ε = −dΦ/dt, and a positive ε drives a current whose field on the axis points
   * to +x.
   */
  const inducedFromFlux = (pole: string, approaching: boolean) => {
    const s = pole === "N" ? 1 : -1;
    const flux = (d: number) => s / Math.pow(d, 3);
    const before = approaching ? 2 : 1;
    const after = approaching ? 1 : 2;
    return -(flux(after) - flux(before)) > 0 ? 1 : -1;
  };

  it("the induced field opposes the change in flux", () => {
    for (const pole of ["N", "S"])
      for (const approaching of [true, false])
        expect(Lenz.inducedAxialDirection(pole, approaching), `${pole} ${approaching}`).toBe(
          inducedFromFlux(pole, approaching),
        );
    // The textbook cases: N pole coming in is repelled, so the coil's face towards it is also N.
    expect(Lenz.inducedAxialDirection("N", true)).toBe(-1);
    expect(Lenz.inducedAxialDirection("N", false)).toBe(1);
    expect(Lenz.inducedAxialDirection("S", true)).toBe(1);
  });

  it("a top wire out of the page gives a field along +x", () => {
    expect(MagneticField.rings({ x: 0, y: 0 }, [0], 1, 64).x).toBeGreaterThan(0);
  });

  it("the drawn current makes the induced field the figure shows", () => {
    for (const [pole, motion] of [
      ["N", "approach"],
      ["N", "recede"],
      ["S", "approach"],
      ["S", "recede"],
    ] as const) {
      const figure = scene("faradayLenz", `{"pole": "${pole}", "motion": "${motion}"}`);
      const induced = Lenz.inducedAxialDirection(pole, motion === "approach");
      const time = 3.0;
      // The current symbols at the top and bottom of the coil are drawn while the magnet moves.
      const rings = figure.elements.filter((e) => e.kind === "circle" && e.color === "second");
      expect(rings).toHaveLength(2);
      expect(rings.every((r) => (value(r.visible, figure, time) ?? 0) > 0)).toBe(true);
      // Top out of the page <=> B along +x inside the coil.
      expect(pageSymbol(figure, { x: 6.6, y: 4.25 }), `${pole} ${motion}`).toBe(induced > 0 ? "out" : "in");
      expect(pageSymbol(figure, { x: 6.6, y: 1.75 })).toBe(induced > 0 ? "in" : "out");
      // The arrow for B induced agrees with those wires.
      const [a, b] = ends(
        first(figure, (e) => e.kind === "arrow" && e.text === "B induzido"),
        figure,
        time,
      );
      expect((b.x - a.x) * induced).toBeGreaterThan(0);
      // The magnet's own field at the coil points away from N, towards S.
      const [ea, eb] = ends(
        first(figure, (e) => e.kind === "arrow" && e.text === "B"),
        figure,
        time,
      );
      expect((eb.x - ea.x) * (pole === "N" ? 1 : -1)).toBeGreaterThan(0);
    }
  });

  it("the magnet moves towards or away from the coil", () => {
    const coming = scene("faradayLenz", '{"pole": "N", "motion": "approach"}');
    const leaving = scene("faradayLenz", '{"pole": "N", "motion": "recede"}');
    const magnet = (figure: Illustration, text: string) => first(figure, (e) => e.kind === "rect" && e.text === text);
    expect(value(magnet(coming, "N").x, coming, 5.5)!).toBeGreaterThan(value(magnet(coming, "N").x, coming, 0.5)!);
    expect(value(magnet(leaving, "N").x, leaving, 5.5)!).toBeLessThan(value(magnet(leaving, "N").x, leaving, 0.5)!);
    // The magnet's N pole is the side facing the coil (to its right).
    expect(value(magnet(coming, "N").x, coming, 2)!).toBeGreaterThan(value(magnet(coming, "S").x, coming, 2)!);
  });

  it("no current is induced once the magnet stops", () => {
    const figure = scene("faradayLenz", '{"pole": "N", "motion": "approach"}');
    const ring = first(figure, (e) => e.kind === "circle" && e.color === "second");
    expect(value(ring.visible, figure, 3.0) ?? 0).toBeGreaterThan(0);
    expect(value(ring.visible, figure, 5.5) ?? 0).toBeLessThanOrEqual(0);
    expect(value(ring.visible, figure, 0.5) ?? 0).toBeLessThanOrEqual(0);
  });
});

describe("RC and AC", () => {
  it("the RC curves pass through the time-constant values", () => {
    expect(Math.abs(CircuitSignals.charging(2, 2) - (1 - Math.exp(-1)))).toBeLessThan(1e-12);
    expect(Math.abs(CircuitSignals.charging(2, 2) - 0.6321)).toBeLessThan(1e-4);
    expect(Math.abs(CircuitSignals.discharging(2, 2) - 0.3679)).toBeLessThan(1e-4);
    expect(CircuitSignals.charging(0, 3)).toBe(0);
    expect(CircuitSignals.discharging(0, 3)).toBe(1);
    expect(CircuitSignals.charging(5 * 3, 3)).toBeGreaterThan(0.99);
    // The two curves add to the supply at every time, and both obey dV/dt = ±(V₀ − V)/τ.
    for (const time of [0.3, 1.0, 4.0]) {
      expect(Math.abs(CircuitSignals.charging(time, 1.5) + CircuitSignals.discharging(time, 1.5) - 1)).toBeLessThan(
        1e-12,
      );
      const h = 1e-6;
      const slope = (CircuitSignals.charging(time + h, 1.5) - CircuitSignals.charging(time - h, 1.5)) / (2 * h);
      expect(Math.abs(slope - (1 - CircuitSignals.charging(time, 1.5)) / 1.5)).toBeLessThan(1e-6);
    }
  });

  it("the RC figure marks the values at one τ", () => {
    const figure = scene("rcCircuitCurve", '{"mode": "both"}');
    const frame = rcFrame(null, null);
    const charge = first(figure, (e) => e.kind === "point" && e.color === "accent");
    const discharge = first(figure, (e) => e.kind === "point" && e.color === "second");
    expect(Math.abs(number(charge.x) - frame.x(1))).toBeLessThan(1e-4);
    expect(Math.abs(number(charge.y) - frame.y(1 - Math.exp(-1)))).toBeLessThan(1e-4);
    expect(Math.abs(number(discharge.y) - frame.y(Math.exp(-1)))).toBeLessThan(1e-4);
    const labels = finalLabels(figure);
    expect(labels.includes("0,63 V₀") && labels.includes("0,37 V₀")).toBe(true);
    expect(labels).toContain("τ = RC");
    // The curves drawn go through those dots.
    const curves = figure.elements.filter((e) => e.kind === "curve" && e.color === "white");
    expect(curves).toHaveLength(2);
    const finish = 0.95 * (figure.duration ?? 0);
    const heights = curves.map((curve) => {
      const points = curvePoints(curve, figure, finish, 400);
      return points.reduce((best, p) => (Math.abs(p.x - frame.x(1)) < Math.abs(best.x - frame.x(1)) ? p : best)).y;
    });
    expect(heights.some((h) => Math.abs(h - frame.y(1 - Math.exp(-1))) < 0.02)).toBe(true);
    expect(heights.some((h) => Math.abs(h - frame.y(Math.exp(-1))) < 0.02)).toBe(true);
  });

  it("an RC figure with values states the time constant and the voltages", () => {
    const figure = scene("rcCircuitCurve", '{"mode": "charge", "tau": 2, "V0": 10}');
    const labels = finalLabels(figure);
    expect(labels.some((l) => l.includes("τ = RC") && l.includes("2 s"))).toBe(true);
    expect(labels).toContain("6,32 V");
    expect(labels).toContain("V₀ = 10 V");
    const frame = rcFrame(2, 10);
    const dot = first(figure, (e) => e.kind === "point");
    expect(Math.abs(number(dot.x) - frame.x(2))).toBeLessThan(1e-4);
    expect(Math.abs(number(dot.y) - frame.y(10 * (1 - Math.exp(-1))))).toBeLessThan(1e-4);
  });

  it("an alternating voltage has an RMS of the peak over √2", () => {
    const peak = 325;
    const period = 0.02;
    const samples = 20_000;
    let sumOfSquares = 0;
    for (let index = 0; index < samples; index++) {
      const v = CircuitSignals.alternating(peak, period, (period * (index + 0.5)) / samples);
      sumOfSquares += v * v;
    }
    const measured = Math.sqrt(sumOfSquares / samples);
    expect(Math.abs(measured - CircuitSignals.rms(peak))).toBeLessThan(1e-6 * peak);
    expect(Math.abs(CircuitSignals.rms(peak) - peak / Math.sqrt(2))).toBeLessThan(1e-12);
    expect(Math.abs(CircuitSignals.rms(325) - 229.8)).toBeLessThan(0.1);
  });

  it("the AC figure draws the peak and RMS levels at the right heights", () => {
    const figure = scene("acSignal", '{"peak": 325, "frequency": 50}');
    const frame = acFrame(325, 0.02);
    const peaks = figure.elements.filter((e) => e.kind === "line" && e.color === "accent" && e.dashed === true);
    const levels = figure.elements.filter((e) => e.kind === "line" && e.color === "second" && e.dashed === true);
    expect(peaks.length === 2 && levels.length === 2).toBe(true);
    const zero = frame.y(0);
    const top = Math.max(...peaks.map((e) => number(e.y)));
    const rms = Math.max(...levels.map((e) => number(e.y)));
    expect(Math.abs((rms - zero) / (top - zero) - 1 / Math.sqrt(2))).toBeLessThan(1e-5);
    expect(Math.abs(top - frame.y(325))).toBeLessThan(1e-5);
    // And below zero, symmetrically.
    const bottom = Math.min(...peaks.map((e) => number(e.y)));
    expect(Math.abs(zero - bottom - (top - zero))).toBeLessThan(1e-5);
    const labels = finalLabels(figure);
    expect(labels.some((l) => l.includes("CA"))).toBe(true);
    expect(labels).toContain("Vp = 325 V");
    expect(labels).toContain("Vef = Vp/√2 = 230 V");
    expect(labels).toContain("T = 20 ms");
    // The curve reaches the peak level and crosses zero.
    const wave = first(figure, (e) => e.kind === "curve" && e.color === "white");
    const points = curvePoints(wave, figure, 0.95 * (figure.duration ?? 0), 400);
    expect(Math.abs(Math.max(...points.map((p) => p.y)) - top)).toBeLessThan(0.01);
    expect(Math.abs(Math.min(...points.map((p) => p.y)) - bottom)).toBeLessThan(0.01);
    // Two periods are drawn: peaks a period apart, troughs half a period after them (t in ms).
    const height = (milliseconds: number) =>
      points.reduce((best, p) =>
        Math.abs(p.x - frame.x(milliseconds)) < Math.abs(best.x - frame.x(milliseconds)) ? p : best,
      ).y;
    for (const peakTime of [5, 25]) expect(Math.abs(height(peakTime) - top)).toBeLessThan(0.02);
    for (const troughTime of [15, 35]) expect(Math.abs(height(troughTime) - bottom)).toBeLessThan(0.02);
  });

  it("slow signals are labelled in seconds", () => {
    const labels = finalLabels(scene("acSignal", '{"peak": 5, "period": 4}'));
    expect(labels).toContain("T = 4 s");
    expect(labels).toContain("Vp = 5 V");
    expect(labels).toContain("t (s)");
  });
});

// The electromagnetism rows of invalidParamsFallBack (PremadeFigureBatch2Tests.swift).
describe("invalid electromagnetism params", () => {
  it("fall back", () => {
    for (const [type, json] of [
      ["electricFieldLines", '{"kind": "triangle"}'],
      ["electricFieldLines", '{"kind": "dipole", "q": 0}'],
      ["electricFieldLines", '{"kind": "dipole", "q": 50}'],
      ["equipotentials", '{"kind": "quadrupole"}'],
      ["parallelPlates", '{"voltage": -5}'],
      ["parallelPlates", '{"distance": 0}'],
      ["parallelPlates", '{"charge": "neutral"}'],
      ["parallelPlates", '{"positivePlate": "left"}'],
      ["magneticField", '{"kind": "toroid"}'],
      ["magneticField", '{"kind": "wire", "current": "sideways"}'],
      ["magneticField", '{"kind": "solenoid", "turns": 40}'],
      ["lorentzForce", '{"charge": "neutral"}'],
      ["lorentzForce", '{"field": "up"}'],
      ["faradayLenz", '{"pole": "X"}'],
      ["faradayLenz", '{"motion": "spin"}'],
      ["rcCircuitCurve", '{"mode": "sideways"}'],
      ["rcCircuitCurve", '{"tau": -1}'],
      ["acSignal", '{"peak": 0}'],
      ["acSignal", '{"frequency": -50}'],
    ] as const)
      expect(new PremadeFigures(sample(type, json)).compile("t", "English"), `${type} ${json}`).toBeNull();
  });
});
