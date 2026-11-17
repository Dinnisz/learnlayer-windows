// Port of LearnLayerTests/PremadeFigureOpticsTests.swift @ ref 2026-11-04 (the ray geometry, the image equations,
// Snell's law and the critical angle, the prism's deviation, the fringes and the spectrum, and the sentences the
// figures write). The figures' bounds and overlaps are checked with the gallery in animated.test.ts.

import { describe, expect, it } from "vitest";
import { CompiledIllustration, type Illustration } from "../illustration";
import { TemplateWords } from "../illustrationTemplate";
import { PremadeFigures } from "../premadeFigure";
import { sample } from "./animated";
import {
  ElectromagneticSpectrum,
  Interference,
  prismSide,
  PrismOptics,
  RayOptics,
  Refraction,
  type Point,
  type RaySegment,
} from "./optics";

const language = "Portuguese (Portugal)";
const pt = (value: number) => new TemplateWords(language).number(value);
const scene = (type: string, json: string, lang = language) => {
  const compiled = new PremadeFigures(sample(type, json)).compile("t", lang);
  if (!compiled) throw new Error(`${type} did not compile`);
  return compiled;
};
function finalLabels(figure: Illustration): string[] {
  const compiled = new CompiledIllustration(figure);
  const at = { t: 0.95 * (figure.duration ?? 0), revealed: 1, step: 1000 };
  return figure.elements
    .filter((e) => e.kind === "label" && (!e.visible || (compiled.value(e.visible, at) ?? 0) > 0))
    .map((e) => e.text ?? "");
}
/** Where the lines through two segments meet. */
function meet(a: RaySegment, b: RaySegment): Point | null {
  const dx1 = a.to.x - a.from.x;
  const dy1 = a.to.y - a.from.y;
  const dx2 = b.to.x - b.from.x;
  const dy2 = b.to.y - b.from.y;
  const denominator = dx1 * dy2 - dy1 * dx2;
  if (!(Math.abs(denominator) > 1e-12)) return null;
  const t = ((b.from.x - a.from.x) * dy2 - (b.from.y - a.from.y) * dx2) / denominator;
  return { x: a.from.x + t * dx1, y: a.from.y + t * dy1 };
}
const collinear = (a: Point, b: Point, c: Point, tolerance = 1e-9) =>
  Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < tolerance;
const direction = (segment: RaySegment) => ({ x: segment.to.x - segment.from.x, y: segment.to.y - segment.from.y });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const cases: [number, number][] = [
  [2, 5],
  [2, 3],
  [2, 1],
  [-2, 4],
  [-2, 1],
  [3, 7],
  [2, 4],
];

describe("lenses", () => {
  it("the thin lens equation and the magnification", () => {
    for (const [f, d] of cases) {
      const image = RayOptics.lensImage(f, d, 1);
      const di = image.distance!;
      expect(Math.abs(1 / f - (1 / d + 1 / di)), `f = ${f}, d = ${d}`).toBeLessThan(1e-12);
      expect(Math.abs(image.magnification! - -di / d)).toBeLessThan(1e-12);
      expect(Math.abs(image.height! - -di / d)).toBeLessThan(1e-12);
      expect(image.real).toBe(di > 0);
      expect(image.upright).toBe(image.magnification! > 0);
    }
    const beyond = RayOptics.lensImage(2, 5, 1);
    expect(beyond.real && !beyond.upright && Math.abs(beyond.magnification!) < 1).toBe(true);
    const between = RayOptics.lensImage(2, 3, 1);
    expect(between.real && !between.upright && Math.abs(between.magnification!) > 1).toBe(true);
    const twice = RayOptics.lensImage(2, 4, 1);
    expect(Math.abs(twice.magnification! + 1) < 1e-12 && Math.abs(twice.distance! - 4) < 1e-12).toBe(true);
    const inside = RayOptics.lensImage(2, 1, 1);
    expect(!inside.real && inside.upright && inside.magnification! > 1).toBe(true);
    const diverging = RayOptics.lensImage(-2, 4, 1);
    expect(!diverging.real && diverging.upright && Math.abs(diverging.magnification!) < 1).toBe(true);
    const atFocus = RayOptics.lensImage(2, 2, 1);
    expect(atFocus.x === null && atFocus.distance === null).toBe(true);
  });

  it("the three principal rays all meet at the image", () => {
    for (const [f, d] of cases) {
      const rays = RayOptics.lensRays(f, d, 1, 12);
      expect(rays).toHaveLength(3);
      const image = RayOptics.lensImage(f, d, 1);
      const tip = { x: image.x!, y: image.height! };
      const refracted = rays.map((ray) => ray[1]!);
      for (const [a, b] of [
        [0, 1],
        [0, 2],
        [1, 2],
      ] as const)
        expect(distance(meet(refracted[a]!, refracted[b]!)!, tip), `f = ${f}, d = ${d}`).toBeLessThan(1e-9);
      // A virtual image is reached by the dashed extensions, a real one by the rays themselves.
      for (const ray of rays)
        if (image.real) expect(ray).toHaveLength(2);
        else expect(ray.length === 3 && ray[2]!.virtual && distance(ray[2]!.to, tip) < 1e-9).toBe(true);
    }
  });

  it("each principal ray follows its rule", () => {
    for (const [f, d] of cases) {
      const rays = RayOptics.lensRays(f, d, 1, 12);
      const tip = { x: -d, y: 1 };
      expect(rays[0]![0]!.from.y === 1 && rays[0]![0]!.to.y === 1).toBe(true);
      expect(collinear(rays[0]![1]!.from, rays[0]![1]!.to, { x: f, y: 0 })).toBe(true);
      expect(rays[1]![0]!.to).toEqual({ x: 0, y: 0 });
      expect(collinear(tip, { x: 0, y: 0 }, rays[1]![1]!.to)).toBe(true);
      expect(collinear(tip, rays[2]![0]!.to, { x: -f, y: 0 })).toBe(true);
      expect(Math.abs(rays[2]![1]!.from.y - rays[2]![1]!.to.y)).toBeLessThan(1e-12);
      for (const ray of rays) {
        expect(ray[0]!.from).toEqual(tip);
        expect(ray[0]!.to.x).toBe(0);
        expect(ray[1]!.to.x).toBe(12);
      }
    }
  });

  it("an object at the focus sends parallel rays and no image", () => {
    const rays = RayOptics.lensRays(2, 2, 1, 12);
    expect(rays).toHaveLength(2);
    const first = direction(rays[0]![1]!);
    const second = direction(rays[1]![1]!);
    expect(Math.abs(first.x * second.y - first.y * second.x)).toBeLessThan(1e-12);
  });

  it("the lens figure states the image", () => {
    const m1 = -(10 / 3) / 5;
    for (const [json, sentence, di] of [
      [
        '{"kind": "converging", "focal": 2, "objectDistance": 5}',
        `Imagem real, invertida, reduzida (m = ${pt(m1)})`,
        10 / 3,
      ],
      ['{"kind": "converging", "focal": 2, "objectDistance": 3}', "Imagem real, invertida, ampliada (m = −2)", 6],
      ['{"kind": "converging", "focal": 2, "objectDistance": 1}', "Imagem virtual, direita, ampliada (m = 2)", -2],
      [
        '{"kind": "diverging", "focal": 2, "objectDistance": 4}',
        `Imagem virtual, direita, reduzida (m = ${pt(1 / 3)})`,
        -4 / 3,
      ],
    ] as const) {
      const labels = finalLabels(scene("lensRays", json));
      expect(labels, json).toContain(sentence);
      expect(labels.some((text) => text.includes(`dᵢ = ${pt(di)} cm`))).toBe(true);
    }
  });
});

describe("mirrors", () => {
  it("the mirror equation and the image's nature", () => {
    for (const [f, d] of cases) {
      const image = RayOptics.mirrorImage(f, d, 1);
      const di = image.distance!;
      expect(Math.abs(1 / f - (1 / d + 1 / di))).toBeLessThan(1e-12);
      expect(Math.abs(image.magnification! + di / d)).toBeLessThan(1e-12);
      // Real images are in front of the mirror (x < 0), virtual ones behind it.
      expect(image.real).toBe(image.x! < 0);
    }
    const far = RayOptics.mirrorImage(2, 5, 1);
    expect(far.real && !far.upright && Math.abs(far.magnification!) < 1).toBe(true);
    const close = RayOptics.mirrorImage(2, 1, 1);
    expect(!close.real && close.upright && close.magnification! > 1).toBe(true);
    const convex = RayOptics.mirrorImage(-2, 4, 1);
    expect(!convex.real && convex.upright && Math.abs(convex.magnification!) < 1).toBe(true);
    expect(RayOptics.mirrorImage(2, 2, 1).x).toBeNull();
  });

  it("principal rays reflect as the rules say", () => {
    for (const [f, d] of cases) {
      const rays = RayOptics.mirrorRays(f, d, 1, -12);
      const image = RayOptics.mirrorImage(f, d, 1);
      const tip = { x: image.x!, y: image.height! };
      expect(rays.length, `f = ${f}, d = ${d}`).toBe(Math.abs(d - 2 * f) < 1e-9 ? 2 : 3);
      const [first, second] = rays;
      expect(first![0]!.from.y === 1 && first![0]!.to.y === 1).toBe(true);
      expect(collinear(first![1]!.from, first![1]!.to, { x: -f, y: 0 })).toBe(true);
      expect(collinear(second![0]!.from, second![0]!.to, { x: -f, y: 0 })).toBe(true);
      expect(Math.abs(second![1]!.from.y - second![1]!.to.y)).toBeLessThan(1e-12);
      for (const ray of rays) expect(ray[1]!.to.x).toBeLessThan(ray[1]!.from.x);
      expect(distance(meet(first![1]!, second![1]!)!, tip), `f = ${f}, d = ${d}`).toBeLessThan(1e-9);
      if (rays.length === 3) {
        const third = rays[2]!;
        expect(collinear(third[0]!.from, third[0]!.to, { x: -2 * f, y: 0 })).toBe(true);
        const incoming = direction(third[0]!);
        const outgoing = direction(third[1]!);
        expect(Math.abs(incoming.x * outgoing.y - incoming.y * outgoing.x)).toBeLessThan(1e-9);
        expect(incoming.x * outgoing.x + incoming.y * outgoing.y).toBeLessThan(0);
      }
    }
  });

  it("a plane mirror follows the law of reflection", () => {
    const tip = { x: -3, y: 1 };
    for (const hit of [-0.5, 0.4, 1.6, 3.0]) {
      const ray = RayOptics.planeMirrorRay(tip, hit, -6);
      const incident = direction(ray[0]!);
      const reflected = direction(ray[1]!);
      expect(Math.abs(Math.atan(incident.y / incident.x) - Math.atan(reflected.y / -reflected.x))).toBeLessThan(1e-12);
      expect(reflected.x < 0 && incident.x > 0).toBe(true);
      expect(ray[2]!.virtual).toBe(true);
      expect(ray[2]!.to).toEqual({ x: 3, y: 1 });
      expect(collinear(ray[1]!.from, ray[1]!.to, ray[2]!.to)).toBe(true);
    }
  });
});

describe("refraction", () => {
  it("Snell's law and the critical angle", () => {
    for (const [n1, n2, degrees] of [
      [1.0, 1.5, 40.0],
      [1.5, 1.0, 30.0],
      [1.33, 1.0, 20.0],
      [1.0, 2.4, 70.0],
      [1.5, 1.33, 50.0],
    ] as const) {
      const theta1 = (degrees * Math.PI) / 180;
      const theta2 = Refraction.refractedAngle(n1, n2, theta1)!;
      expect(Math.abs(n1 * Math.sin(theta1) - n2 * Math.sin(theta2))).toBeLessThan(1e-12);
      expect(n2 > n1 ? theta2 < theta1 : theta2 > theta1).toBe(true);
    }
    const critical = Refraction.criticalAngle(1.5, 1)!;
    expect(Math.abs((critical * 180) / Math.PI - 41.81)).toBeLessThan(0.01);
    expect(Math.abs(Math.sin(critical) - 1 / 1.5)).toBeLessThan(1e-12);
    expect(Refraction.criticalAngle(1, 1.5)).toBeNull();
    expect(Refraction.refractedAngle(1.5, 1, critical + 0.01)).toBeNull();
    expect(Refraction.refractedAngle(1.5, 1, critical - 0.001)!).toBeGreaterThan((80 * Math.PI) / 180);
    expect(Refraction.refractedAngle(1, 1.5, (89.9 * Math.PI) / 180)).not.toBeNull();
  });

  it("past the critical angle the light is totally reflected", () => {
    const figure = scene("refraction", '{"n1": 1.5, "n2": 1, "angle": 60}');
    expect(figure.elements.some((e) => e.kind === "line" && e.color === "accent")).toBe(false);
    const labels = finalLabels(figure);
    expect(labels).toContain("reflexão total interna");
    expect(
      labels.some(
        (text) => text.includes("θ₁ = 60°") && text.includes("θc = 41,8°") && text.includes("não há raio refratado"),
      ),
    ).toBe(true);
    expect(labels.some((text) => text.startsWith("θ₂"))).toBe(false);
  });

  it("English uses the decimal point", () => {
    const labels = finalLabels(scene("refraction", '{"n1": 1, "n2": 1.5, "angle": 40}', "English"));
    expect(labels).toContain("θ₂ = 25.4°");
    expect(labels).toContain("n₂ = 1.5");
  });
});

describe("prism, double slit and spectrum", () => {
  it("the deviation follows the formula and grows with the index", () => {
    const vertices = PrismOptics.vertices(5, 1.5, prismSide);
    const aim = { x: (vertices.left.x + vertices.apex.x) / 2, y: (vertices.left.y + vertices.apex.y) / 2 };
    const apex = (60 * Math.PI) / 180;
    for (const degrees of [56, 60, 70]) {
      const theta1 = (degrees * Math.PI) / 180;
      const deviations: number[] = [];
      for (const color of PrismOptics.colors) {
        const passage = PrismOptics.trace(color.index, theta1, vertices, aim)!;
        const theta2 = Math.asin(Math.sin(theta1) / color.index);
        const theta4 = Math.asin(color.index * Math.sin(apex - theta2));
        expect(Math.abs(Math.abs(passage.deviation) - (theta1 + theta4 - apex))).toBeLessThan(1e-9);
        deviations.push(Math.abs(passage.deviation));
        expect(passage.enter.x < 5 && passage.exit.x > 5).toBe(true);
      }
      expect(deviations).toEqual([...deviations].sort((a, b) => a - b));
      expect(deviations[deviations.length - 1]! - deviations[0]!).toBeGreaterThan(0.05);
    }
    expect(PrismOptics.colors[0]!.element).toBe("red");
    expect(PrismOptics.colors[PrismOptics.colors.length - 1]!.element).toBe("violet");
  });

  it("too shallow a ray is totally reflected inside the prism", () => {
    const vertices = PrismOptics.vertices(5, 1.5, prismSide);
    const aim = { x: (vertices.left.x + vertices.apex.x) / 2, y: (vertices.left.y + vertices.apex.y) / 2 };
    expect(PrismOptics.trace(1.8075, (45 * Math.PI) / 180, vertices, aim)).toBeNull();
    expect(new PremadeFigures(sample("prismDispersion", '{"incidence": 45}')).compile("t", "English")).toBeNull();
  });

  it("the fringe spacing is λL/d and the intensity peaks at whole wavelengths", () => {
    expect(Math.abs(Interference.fringeSpacing(600e-9, 2, 0.5e-3) - 2.4e-3)).toBeLessThan(1e-12);
    const base = Interference.fringeSpacing(500e-9, 1, 1e-3);
    expect(Math.abs(Interference.fringeSpacing(500e-9, 1, 2e-3) - base / 2)).toBeLessThan(1e-15);
    expect(Math.abs(Interference.fringeSpacing(1000e-9, 1, 1e-3) - 2 * base)).toBeLessThan(1e-15);
    for (const m of [-3, -1, 0, 1, 2]) expect(Math.abs(Interference.intensity(m) - 1)).toBeLessThan(1e-12);
    for (const m of [-2.5, -0.5, 0.5, 1.5]) expect(Interference.intensity(m)).toBeLessThan(1e-12);
    expect(Math.abs(Interference.intensity(0.25) - 0.5)).toBeLessThan(1e-12);
    const figure = scene("doubleSlit", '{"wavelength": 500, "separation": 1, "screenDistance": 3}');
    // 500 nm × 3 m / 1 mm = 1.5 mm.
    expect(finalLabels(figure).some((text) => text.includes("Δy = λL/d = 1,5 mm"))).toBe(true);
  });

  it("the bands fill the spectrum and the bar lists them from radio to gamma", () => {
    const bands = ElectromagneticSpectrum.bands;
    expect(bands.map((band) => band.en)).toEqual([
      "Radio",
      "Microwaves",
      "Infrared",
      "Visible",
      "Ultraviolet",
      "X-rays",
      "Gamma rays",
    ]);
    for (let i = 1; i < bands.length; i++) expect(bands[i - 1]!.shortest).toBe(bands[i]!.longest);
    expect(Math.abs(ElectromagneticSpectrum.frequency(700e-9) - 4.28e14)).toBeLessThan(0.01e14);
    const figure = scene("emSpectrum", "{}");
    const names = ["Rádio", "Micro-ondas", "Infravermelho", "Visível", "Ultravioleta", "Raios X", "Raios gama"];
    const positions = names.map((name) =>
      Number(figure.elements.find((e) => e.kind === "label" && e.text === name)!.x),
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    const labels = finalLabels(figure);
    for (const text of ["1 m", "1 mm", "700 nm", "400 nm", "10 nm", "10 pm"]) expect(labels, text).toContain(text);
    expect(labels.includes("4,3×10¹⁴ Hz") && labels.includes("7,5×10¹⁴ Hz")).toBe(true);
    expect(labels.includes("3×10⁸ Hz") && labels.includes("3×10¹¹ Hz") && labels.includes("3×10¹⁹ Hz")).toBe(true);
  });
});
