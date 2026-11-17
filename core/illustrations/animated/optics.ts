// Port of LearnLayer/Illustrations/PremadeFigureOptics.swift and the optics of PremadeFigurePhysicsCore.swift
// (PlaneGeometry.clip, RayOptics, Refraction, PrismOptics, Interference, ElectromagneticSpectrum) @ ref 2026-11-04:
// thin lenses and mirrors with their principal rays and the image the app works out, Snell's law with the critical
// angle, a prism's dispersion, Young's double slit and the electromagnetic spectrum.

import { TemplateWords } from "../illustrationTemplate";
import { Anim, FigureCanvas, Params, slider, type AnimatedIllustration } from "./figureCanvas";

export interface Point {
  x: number;
  y: number;
}
interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface Direction {
  x: number;
  y: number;
}

// MARK: Plane geometry

/** The part of the segment inside the box, null when none of it is. */
export function clip(segment: Segment, minX: number, maxX: number, minY: number, maxY: number): Segment | null {
  let low = 0;
  let high = 1;
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const checks: [number, number][] = [
    [-dx, segment.x1 - minX],
    [dx, maxX - segment.x1],
    [-dy, segment.y1 - minY],
    [dy, maxY - segment.y1],
  ];
  for (const [direction, distance] of checks) {
    if (Math.abs(direction) < 1e-12) {
      if (distance < 0) return null;
      continue;
    }
    const ratio = distance / direction;
    if (direction < 0) {
      if (ratio > high) return null;
      low = Math.max(low, ratio);
    } else {
      if (ratio < low) return null;
      high = Math.min(high, ratio);
    }
  }
  return {
    x1: segment.x1 + low * dx,
    y1: segment.y1 + low * dy,
    x2: segment.x1 + high * dx,
    y2: segment.y1 + high * dy,
  };
}

// MARK: Ray optics

export interface RaySegment {
  from: Point;
  to: Point;
  /** A construction line: the backward extension of a diverging ray. */
  virtual: boolean;
}

export interface OpticalImage {
  /** The image distance dᵢ of 1/f = 1/d₀ + 1/dᵢ: positive for a real image, negative for a virtual one. */
  distance: number | null;
  /** Where the image is on the page's axis; null when it is at infinity. */
  x: number | null;
  height: number | null;
  real: boolean;
  upright: boolean;
  magnification: number | null;
}

const atInfinity: OpticalImage = {
  distance: null,
  x: null,
  height: null,
  real: false,
  upright: false,
  magnification: null,
};

/** Thin lens and mirror in the paraxial picture: the lens or mirror at x = 0, light first travelling toward +x, the
 * object at x = −d with its tip at height h. */
export const RayOptics = {
  degenerate: 1e-9,

  /** Lens: f > 0 converging, f < 0 diverging. */
  lensImage(f: number, d: number, h: number): OpticalImage {
    if (Math.abs(d - f) < RayOptics.degenerate && f > 0) return atInfinity;
    const di = (f * d) / (d - f);
    const m = -di / d;
    return { distance: di, x: di, height: m * h, real: di > 0, upright: m > 0, magnification: m };
  },

  /** The principal rays of a lens: parallel to the axis, through the centre, through the object-side focus. */
  lensRays(f: number, d: number, h: number, reach: number): RaySegment[][] {
    const tip = { x: -d, y: h };
    const image = RayOptics.lensImage(f, d, h);
    const finish = (hit: Point, direction: Direction): RaySegment[] => {
      const segments: RaySegment[] = [{ from: tip, to: hit, virtual: false }];
      if (!(direction.x > 1e-12)) return segments;
      const t = (reach - hit.x) / direction.x;
      segments.push({ from: hit, to: { x: reach, y: hit.y + direction.y * t }, virtual: false });
      if (image.x !== null && image.height !== null && !image.real)
        segments.push({ from: hit, to: { x: image.x, y: image.height }, virtual: true });
      return segments;
    };
    const rays: RaySegment[][] = [];
    // 1. Parallel to the axis, then through the image-side focus (or as if from it).
    rays.push(finish({ x: 0, y: h }, f > 0 ? { x: f, y: -h } : { x: -f, y: h }));
    // 2. Through the centre, undeviated.
    rays.push(finish({ x: 0, y: 0 }, { x: d, y: -h }));
    // 3. Aimed at the object-side focus, then parallel to the axis.
    if (Math.abs(d - f) > RayOptics.degenerate) rays.push(finish({ x: 0, y: (-h * f) / (d - f) }, { x: 1, y: 0 }));
    return rays;
  },

  /** Spherical mirror: f > 0 concave, f < 0 convex. */
  mirrorImage(f: number, d: number, h: number): OpticalImage {
    if (Math.abs(d - f) < RayOptics.degenerate && f > 0) return atInfinity;
    const di = (f * d) / (d - f);
    const m = -di / d;
    // A real image is in front of the mirror, at x = −di; a virtual one behind, at x = +|di|.
    return { distance: di, x: -di, height: m * h, real: di > 0, upright: m > 0, magnification: m };
  },

  /** Parallel, focal and centre-of-curvature rays; each ends at x = `reach` (negative, in front). */
  mirrorRays(f: number, d: number, h: number, reach: number): RaySegment[][] {
    const tip = { x: -d, y: h };
    const image = RayOptics.mirrorImage(f, d, h);
    const finish = (hit: Point, direction: Direction): RaySegment[] => {
      const segments: RaySegment[] = [{ from: tip, to: hit, virtual: false }];
      if (!(direction.x < -1e-12)) return segments;
      const t = (reach - hit.x) / direction.x;
      segments.push({ from: hit, to: { x: reach, y: hit.y + direction.y * t }, virtual: false });
      if (image.x !== null && image.height !== null && !image.real)
        segments.push({ from: hit, to: { x: image.x, y: image.height }, virtual: true });
      return segments;
    };
    const rays: RaySegment[][] = [];
    // 1. Parallel to the axis, reflected through the focus (or as if from it).
    let away = { x: -f, y: -h };
    if (away.x > 0) away = { x: -away.x, y: -away.y };
    rays.push(finish({ x: 0, y: h }, away));
    // 2. Aimed at the focus, reflected parallel to the axis.
    if (Math.abs(d - f) > RayOptics.degenerate) rays.push(finish({ x: 0, y: (-h * f) / (d - f) }, { x: -1, y: 0 }));
    // 3. Aimed at the centre of curvature, reflected back along itself.
    if (Math.abs(d - 2 * f) > RayOptics.degenerate) {
      const hit = { x: 0, y: (-2 * h * f) / (d - 2 * f) };
      rays.push(finish(hit, { x: -(hit.x - tip.x), y: -(hit.y - tip.y) }));
    }
    return rays;
  },

  /** A ray from `source` to the plane mirror at x = 0, height `hitHeight`, and its reflection (equal angles to the
   * normal), ending at x = `reach`. */
  planeMirrorRay(source: Point, hitHeight: number, reach: number): RaySegment[] {
    const hit = { x: 0, y: hitHeight };
    const dx = hit.x - source.x;
    const dy = hit.y - source.y;
    // Reflection keeps the component along the mirror and flips the one across it.
    const t = (reach - hit.x) / -dx;
    return [
      { from: source, to: hit, virtual: false },
      { from: hit, to: { x: reach, y: hit.y + dy * t }, virtual: false },
      // Where the reflected ray, extended behind the mirror, lines up with the image.
      { from: hit, to: { x: -source.x, y: source.y }, virtual: true },
    ];
  },
};

export const Refraction = {
  /** The angle of the refracted ray from the normal, in radians; null on total internal reflection. */
  refractedAngle(n1: number, n2: number, incidence: number): number | null {
    const s = (n1 * Math.sin(incidence)) / n2;
    return Math.abs(s) <= 1 ? Math.asin(s) : null;
  },
  /** The critical angle in radians, only from the denser to the rarer medium. */
  criticalAngle(n1: number, n2: number): number | null {
    return n1 > n2 && n2 > 0 ? Math.asin(n2 / n1) : null;
  },
};

export interface PrismColor {
  name: string;
  element: string;
  /** Refractive index of dense flint glass at this colour. */
  index: number;
}

export interface PrismPassage {
  enter: Point;
  exit: Point;
  exitDirection: Direction;
  /** Total deviation in radians from the incoming direction. */
  deviation: number;
}

type Vertices = { left: Point; right: Point; apex: Point };

export const PrismOptics = {
  /** Dense flint glass: n grows from red to violet, so violet bends more. */
  colors: [
    { name: "vermelho", element: "red", index: 1.7608 },
    { name: "laranja", element: "orange", index: 1.7655 },
    { name: "amarelo", element: "yellow", index: 1.77 },
    { name: "verde", element: "green", index: 1.779 },
    { name: "azul", element: "blue", index: 1.7919 },
    { name: "violeta", element: "violet", index: 1.8075 },
  ] as PrismColor[],

  /** Vertices of an equilateral prism with the apex up: left, right, apex. */
  vertices(centreX: number, baseY: number, side: number): Vertices {
    const height = (side * Math.sqrt(3)) / 2;
    return {
      left: { x: centreX - side / 2, y: baseY },
      right: { x: centreX + side / 2, y: baseY },
      apex: { x: centreX, y: baseY + height },
    };
  },

  /** Direction of a ray meeting the left face with angle `incidence` (radians) to its normal. */
  incomingDirection(incidence: number): Direction {
    const normalAngle = Math.atan2(0.5, -Math.sqrt(3) / 2);
    const angle = normalAngle + Math.PI + incidence;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  },

  /** A ray meeting the left face with angle `incidence` to its normal, through the prism and out of the right face;
   * null on total internal reflection. */
  trace(index: number, incidence: number, v: Vertices, aim: Point): PrismPassage | null {
    const intersect = (origin: Point, direction: Direction, a: Point, b: Point): Point | null => {
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const denominator = direction.x * ey - direction.y * ex;
      if (!(Math.abs(denominator) > 1e-12)) return null;
      const t = ((a.x - origin.x) * ey - (a.y - origin.y) * ex) / denominator;
      const u = ((a.x - origin.x) * direction.y - (a.y - origin.y) * direction.x) / denominator;
      if (!(t > 1e-9) || u < -1e-9 || u > 1 + 1e-9) return null;
      return { x: origin.x + direction.x * t, y: origin.y + direction.y * t };
    };
    /** Snell's law in vector form; `normal` points against the incoming ray. */
    const refract = (d: Direction, n: Direction, n1: number, n2: number): Direction | null => {
      const eta = n1 / n2;
      const cosI = -(d.x * n.x + d.y * n.y);
      const k = 1 - eta * eta * (1 - cosI * cosI);
      if (k < 0) return null;
      const factor = eta * cosI - Math.sqrt(k);
      return { x: eta * d.x + factor * n.x, y: eta * d.y + factor * n.y };
    };
    const leftNormal = { x: -Math.sqrt(3) / 2, y: 0.5 };
    const rightNormal = { x: Math.sqrt(3) / 2, y: 0.5 };
    const incoming = PrismOptics.incomingDirection(incidence);
    const origin = { x: aim.x - incoming.x * 10, y: aim.y - incoming.y * 10 };
    const enter = intersect(origin, incoming, v.left, v.apex);
    const inside = enter && refract(incoming, leftNormal, 1, index);
    const exit = enter && inside && intersect(enter, inside, v.apex, v.right);
    const out = exit && inside && refract(inside, { x: -rightNormal.x, y: -rightNormal.y }, index, 1);
    if (!enter || !inside || !exit || !out) return null;
    return {
      enter,
      exit,
      exitDirection: out,
      deviation: Math.atan2(out.y, out.x) - Math.atan2(incoming.y, incoming.x),
    };
  },
};

export const Interference = {
  /** Relative intensity of two ideal narrow slits for a path difference of `m` wavelengths. */
  intensity(m: number): number {
    const c = Math.cos(Math.PI * m);
    return c * c;
  },
  /** Fringe spacing λL/d in metres (small angles). */
  fringeSpacing(wavelength: number, distance: number, separation: number): number {
    return (wavelength * distance) / separation;
  },
};

export const ElectromagneticSpectrum = {
  lightSpeed: 299_792_458,
  /** From long waves to short waves; neighbouring bands share their limit. */
  bands: [
    { pt: "Rádio", en: "Radio", longest: 1e5, shortest: 1 },
    { pt: "Micro-ondas", en: "Microwaves", longest: 1, shortest: 1e-3 },
    { pt: "Infravermelho", en: "Infrared", longest: 1e-3, shortest: 700e-9 },
    { pt: "Visível", en: "Visible", longest: 700e-9, shortest: 400e-9 },
    { pt: "Ultravioleta", en: "Ultraviolet", longest: 400e-9, shortest: 10e-9 },
    { pt: "Raios X", en: "X-rays", longest: 10e-9, shortest: 10e-12 },
    { pt: "Raios gama", en: "Gamma rays", longest: 10e-12, shortest: 1e-14 },
  ],
  frequency(wavelength: number): number {
    return ElectromagneticSpectrum.lightSpeed / wavelength;
  },
};

// MARK: Canvas pieces shared with the electromagnetism figures

/** A line that grows from `a` to `b` between the times. */
export function growingLine(
  canvas: FigureCanvas,
  a: Point,
  b: Point,
  start: number,
  end: number,
  options: { color?: string | null; dashed?: boolean } = {},
): void {
  const grow = Anim.ramp(start, end);
  canvas.line(
    a.x,
    a.y,
    `${Anim.n(a.x)} + ${Anim.lit(b.x - a.x)}*${grow}`,
    `${Anim.n(a.y)} + ${Anim.lit(b.y - a.y)}*${grow}`,
    options,
  );
}

/** An arrow whose name is written beside its tip. */
export function namedArrow(
  canvas: FigureCanvas,
  x: number | string,
  y: number | string,
  x2: number | string,
  y2: number | string,
  text: string | null,
  options: { color?: string | null; visible?: string | null } = {},
): void {
  const world = (value: number | string) => (typeof value === "number" ? Anim.n(value) : value);
  canvas.elements.push({
    kind: "arrow",
    x: world(x),
    y: world(y),
    x2: world(x2),
    y2: world(y2),
    text,
    color: options.color ?? null,
    visible: options.visible ?? null,
  });
}

// MARK: Layout shared by lenses and mirrors

/** One scale for x and y, so angles in the rays are the angles on the page, and the x of the lens or mirror. */
export function opticsLayout(xs: number[], ys: number[]): { scale: number; centre: number } | null {
  const left = Math.max(-Math.min(...xs), 0);
  const right = Math.max(Math.max(...xs), 0);
  const height = Math.max(Math.max(...ys.map(Math.abs)), 1e-6);
  const span = Math.max(left + right, 1e-6);
  const scale = Math.min(8.6 / span, 2.0 / height, 2.4);
  if (!Number.isFinite(scale) || !(scale > 0)) return null;
  const slack = (8.6 - span * scale) / 2;
  return { scale, centre: 0.7 + slack + left * scale };
}

const opticsBox = { minX: 0.4, maxX: 9.6, minY: 0.9, maxY: 5.1 };

/** Draws the segments one after the other from `start`, each ray taking `perRay` seconds. */
function drawRays(
  rays: RaySegment[][],
  toWorld: (p: Point) => Point,
  canvas: FigureCanvas,
  start: number,
  perRay: number,
): number {
  const colors = ["white", "accent", "second"];
  let clock = start;
  rays.forEach((ray, index) => {
    const color = colors[index % colors.length]!;
    let local = clock;
    ray.forEach((segment, position) => {
      const a = toWorld(segment.from);
      const b = toWorld(segment.to);
      const piece = clip(
        { x1: a.x, y1: a.y, x2: b.x, y2: b.y },
        opticsBox.minX,
        opticsBox.maxX,
        opticsBox.minY,
        opticsBox.maxY,
      );
      if (!piece || !(Math.hypot(piece.x2 - piece.x1, piece.y2 - piece.y1) > 1e-6)) return;
      const take = [0.6, 0.8, 0.4][Math.min(position, 2)]!;
      growingLine(canvas, { x: piece.x1, y: piece.y1 }, { x: piece.x2, y: piece.y2 }, local, local + take, {
        color: segment.virtual ? "muted" : color,
        dashed: segment.virtual,
      });
      local += take;
    });
    clock += perRay;
  });
  return clock;
}

function imageSentence(image: OpticalImage, canvas: FigureCanvas): string {
  const m = image.magnification;
  if (m === null)
    return canvas.say("Imagem no infinito: os raios saem paralelos", "Image at infinity: the rays leave parallel");
  const size =
    Math.abs(Math.abs(m) - 1) < 5e-4
      ? canvas.say("do mesmo tamanho", "same size")
      : Math.abs(m) > 1
        ? canvas.say("ampliada", "magnified")
        : canvas.say("reduzida", "reduced");
  const kind = image.real ? "real" : "virtual";
  const way = image.upright ? canvas.say("direita", "upright") : canvas.say("invertida", "inverted");
  const capitalized = kind[0]!.toUpperCase() + kind.slice(1);
  return canvas.say(
    `Imagem ${kind}, ${way}, ${size} (m = ${canvas.number(m)})`,
    `${capitalized} image, ${way}, ${size} (m = ${canvas.number(m)})`,
  );
}

/** The image as the figure draws it: a growing arrow when real, a dashed line when virtual, words at infinity. */
function drawImage(
  canvas: FigureCanvas,
  image: OpticalImage,
  axisX: number,
  scale: number,
  clock: number,
  atInfinityLabel: Point,
): void {
  if (image.x !== null && image.height !== null) {
    const x = axisX + scale * image.x;
    const tip = 3 + scale * image.height;
    const name = image.real ? canvas.say("imagem real", "real image") : canvas.say("imagem virtual", "virtual image");
    if (image.real)
      namedArrow(
        canvas,
        x,
        3,
        x,
        `${Anim.n(3)} + ${Anim.lit(scale * image.height)}*${Anim.ramp(clock, clock + 0.5)}`,
        name,
        {
          color: "second",
          visible: Anim.after(clock),
        },
      );
    else
      canvas.elements.push({
        kind: "line",
        x: Anim.n(x),
        y: Anim.n(3),
        x2: Anim.n(x),
        y2: Anim.n(tip),
        text: name,
        color: "second",
        dashed: true,
        visible: Anim.after(clock),
      });
  } else
    canvas.label(canvas.say("imagem no infinito", "image at infinity"), atInfinityLabel.x, atInfinityLabel.y, {
      anchor: "center",
      color: "second",
      visible: Anim.after(clock),
    });
}

function distancesCaption(canvas: FigureCanvas, params: Params, focal: number, distance: number, image: OpticalImage) {
  const unit = params.text("unit") ?? "cm";
  let numbers = `f = ${canvas.number(focal)} ${unit} · d₀ = ${canvas.number(distance)} ${unit}`;
  numbers += image.distance !== null ? ` · dᵢ = ${canvas.number(image.distance)} ${unit}` : " · dᵢ → ∞";
  canvas.caption(numbers, { row: 0, color: "white", visible: Anim.after(0.3) });
}

// MARK: The figures

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

const lensRays: Compiler = (params, title, language) => {
  const kind = params.text("kind") ?? "converging";
  const magnitude = params.number("focal");
  if ((kind !== "converging" && kind !== "diverging") || magnitude === null || !(magnitude > 0)) return null;
  const distance = params.number("objectDistance") ?? 2.5 * magnitude;
  const height = params.number("objectHeight") ?? 0.4 * magnitude;
  if (!(distance > 0) || !(height > 0)) return null;
  const focal = kind === "converging" ? magnitude : -magnitude;
  const image = RayOptics.lensImage(focal, distance, height);
  const probe = RayOptics.lensRays(focal, distance, height, 0);
  const xs = [-distance, -magnitude, magnitude, 0];
  const ys = [height];
  if (image.x !== null && image.height !== null) {
    xs.push(image.x);
    ys.push(image.height);
  }
  for (const ray of probe) if (ray[0]) ys.push(ray[0].to.y);
  const layout = opticsLayout(xs, ys);
  if (!layout || !(layout.scale * magnitude >= 0.4)) return null;
  const s = layout.scale;
  const cx = layout.centre;
  const world = (p: Point) => ({ x: cx + s * p.x, y: 3 + s * p.y });
  const rays = RayOptics.lensRays(focal, distance, height, (9.3 - cx) / s);
  const canvas = new FigureCanvas(language);
  // Axis, lens and its focal points.
  canvas.line(0.6, 3, 9.4, 3, { color: "muted" });
  const half = Math.min(2.1, Math.max(1.4, 1.15 * s * Math.max(...ys.map(Math.abs))));
  canvas.line(cx, 3 - half, cx, 3 + half, { color: "white" });
  for (const sign of [1, -1]) {
    const end = 3 + sign * half;
    const tilt = kind === "converging" ? -sign * 0.22 : sign * 0.22;
    canvas.line(cx - 0.17, end + tilt, cx, end, { color: "white" });
    canvas.line(cx + 0.17, end + tilt, cx, end, { color: "white" });
  }
  const leftName = kind === "converging" ? "F" : "F′";
  const rightName = kind === "converging" ? "F′" : "F";
  for (const [x, name] of [
    [cx - s * magnitude, leftName],
    [cx + s * magnitude, rightName],
  ] as const) {
    canvas.dot(x, 3, { color: "muted" });
    canvas.label(name, x, 3 - 0.38, { anchor: "center", color: "muted" });
  }
  // The object.
  const objectX = cx - s * distance;
  namedArrow(canvas, objectX, 3, objectX, 3 + s * height, canvas.say("objeto", "object"), { color: "accent" });
  const clock = drawRays(rays, world, canvas, 0.8, 1.8);
  drawImage(canvas, image, cx, s, clock, { x: 7.6, y: 2.5 });
  distancesCaption(canvas, params, focal, distance, image);
  canvas.caption(imageSentence(image, canvas), { row: 1, color: "second", visible: Anim.after(clock) });
  const parameters = [slider("objectDistance", "d₀", distance, Math.max(magnitude * 0.55, 0.5), magnitude * 4)];
  return canvas.illustration(title, Anim.duration(clock + 0.8), parameters);
};

function planeMirror(params: Params, title: string, language: string, distance: number, height: number) {
  const hits = [0.4 * height, 1.6 * height];
  const layout = opticsLayout([-distance, distance, 0], [height, ...hits]);
  if (!layout) return null;
  const s = layout.scale;
  const mx = layout.centre;
  const world = (p: Point) => ({ x: mx + s * p.x, y: 3 + s * p.y });
  const reach = -(mx - 0.7) / s;
  const tip = { x: -distance, y: height };
  const rays = hits.map((hit) => RayOptics.planeMirrorRay(tip, hit, reach));
  const canvas = new FigureCanvas(language);
  canvas.line(0.6, 3, 9.4, 3, { color: "muted" });
  const half = Math.min(2.1, Math.max(1.4, 1.15 * s * Math.max(...hits.map(Math.abs))));
  canvas.line(mx, 3 - half, mx, 3 + half, { color: "white" });
  for (let offset = -half; offset <= half + 1e-9; offset += 0.3)
    canvas.line(mx, 3 + offset, mx + 0.2, 3 + offset - 0.2, { color: "muted" });
  const objectX = mx - s * distance;
  namedArrow(canvas, objectX, 3, objectX, 3 + s * height, canvas.say("objeto", "object"), { color: "accent" });
  // The normal at the first point of incidence: both angles are measured from it.
  const normalY = world({ x: 0, y: hits[0]! }).y;
  canvas.line(mx - 1.3, normalY, mx, normalY, { color: "muted", dashed: true, visible: Anim.after(0.6) });
  const clock = drawRays(rays, world, canvas, 0.8, 1.8);
  const imageX = mx + s * distance;
  canvas.elements.push({
    kind: "line",
    x: Anim.n(imageX),
    y: Anim.n(3),
    x2: Anim.n(imageX),
    y2: Anim.n(3 + s * height),
    text: canvas.say("imagem virtual", "virtual image"),
    color: "second",
    dashed: true,
    visible: Anim.after(clock),
  });
  canvas.caption(
    canvas.say("Lei da reflexão: θᵢ = θᵣ (medidos a partir da normal)", "Law of reflection: θᵢ = θᵣ (from the normal)"),
    { row: 0, color: "white", visible: Anim.after(0.3) },
  );
  const summary = canvas.say(
    "Imagem virtual, direita, do mesmo tamanho, à mesma distância do espelho",
    "Virtual image, upright, same size, as far behind the mirror",
  );
  const summaryVisible = Anim.after(0.3);
  let placed = false;
  for (const [sx, sy] of [
    [0.28, 0.58],
    [0.28, 0.88],
    [8.6, 0.58],
    [5.0, 0.72],
  ] as const)
    if (!placed) placed = canvas.labelBeside(summary, sx, sy, { color: "second", visible: summaryVisible });
  if (!placed)
    canvas.label(summary, 0.22, 0.55, { anchor: "leading", color: "second", visible: summaryVisible, claim: false });
  void params;
  return canvas.illustration(title, Anim.duration(clock + 0.8), [slider("objectDistance", "d₀", distance, 0.5, 5)]);
}

const mirrorRays: Compiler = (params, title, language) => {
  const kind = params.text("kind") ?? "concave";
  if (!["plane", "concave", "convex"].includes(kind)) return null;
  const distance = params.number("objectDistance") ?? 3;
  const magnitude = params.number("focal") ?? 2;
  const height = params.number("objectHeight") ?? 0.4 * (kind === "plane" ? 3 : magnitude);
  if (!(distance > 0) || !(height > 0) || !(kind === "plane" || magnitude > 0)) return null;
  if (kind === "plane") return planeMirror(params, title, language, distance, height);
  const focal = kind === "concave" ? magnitude : -magnitude;
  const image = RayOptics.mirrorImage(focal, distance, height);
  const probe = RayOptics.mirrorRays(focal, distance, height, -1);
  const xs = [-distance, -focal, -2 * focal, 0];
  const ys = [height];
  if (image.x !== null && image.height !== null) {
    xs.push(image.x);
    ys.push(image.height);
  }
  for (const ray of probe) if (ray[0]) ys.push(ray[0].to.y);
  const layout = opticsLayout(xs, ys);
  if (!layout || !(layout.scale * magnitude >= 0.4)) return null;
  const s = layout.scale;
  const mx = layout.centre;
  const world = (p: Point) => ({ x: mx + s * p.x, y: 3 + s * p.y });
  const rays = RayOptics.mirrorRays(focal, distance, height, -(mx - 0.7) / s);
  const canvas = new FigureCanvas(language);
  canvas.line(0.6, 3, 9.4, 3, { color: "muted" });
  // The mirror, with its back hatched; the curve is exaggerated for the eye, the rays are paraxial.
  const half = Math.min(2.1, Math.max(1.4, 1.15 * s * Math.max(...ys.map(Math.abs))));
  const bulge = kind === "concave" ? -0.28 : 0.28;
  canvas.curve(
    `${Anim.n(mx)} + ${Anim.lit(bulge)}*((s-3)/${Anim.n(half)})^2`,
    "s",
    Anim.n(3 - half),
    Anim.n(3 + half),
    {
      color: "white",
    },
  );
  for (let offset = -half; offset <= half + 1e-9; offset += 0.3) {
    const x = mx + bulge * (offset / half) * (offset / half);
    const y = 3 + offset;
    canvas.line(x, y, x + 0.2, y - 0.2, { color: "muted" });
  }
  for (const [x, name] of [
    [mx - s * focal, "F"],
    [mx - 2 * s * focal, "C"],
  ] as const) {
    canvas.dot(x, 3, { color: "muted" });
    canvas.label(name, x, 3 - 0.38, { anchor: "center", color: "muted" });
  }
  const objectX = mx - s * distance;
  namedArrow(canvas, objectX, 3, objectX, 3 + s * height, canvas.say("objeto", "object"), { color: "accent" });
  const clock = drawRays(rays, world, canvas, 0.8, 1.8);
  drawImage(canvas, image, mx, s, clock, { x: 3.0, y: 2.4 });
  distancesCaption(canvas, params, focal, distance, image);
  canvas.caption(imageSentence(image, canvas), { row: 1, color: "second", visible: Anim.after(clock) });
  const parameters = [slider("objectDistance", "d₀", distance, Math.max(magnitude * 0.55, 0.5), magnitude * 4)];
  return canvas.illustration(title, Anim.duration(clock + 0.8), parameters);
};

const refraction: Compiler = (params, title, language) => {
  const n1 = params.number("n1") ?? 1;
  const n2 = params.number("n2") ?? 1.5;
  const degrees = params.number("angle") ?? 40;
  if (!(n1 >= 1) || !(n2 >= 1) || n1 > 4 || n2 > 4 || !(degrees > 0) || !(degrees < 90)) return null;
  const theta1 = (degrees * Math.PI) / 180;
  const theta2 = Refraction.refractedAngle(n1, n2, theta1);
  const critical = Refraction.criticalAngle(n1, n2);
  const canvas = new FigureCanvas(language);
  const o = { x: 5, y: 3 };
  const length = 2.1;
  const words = new TemplateWords(language);
  const deg = (radians: number) => words.number((radians * 180) / Math.PI) + "°";
  canvas.box(1.2, 0.95, 7.6, 2.05, { color: "muted" });
  canvas.line(1.2, 3, 8.8, 3, { color: "white" });
  canvas.line(5, 0.95, 5, 5.05, { color: "muted", dashed: true });
  canvas.label(canvas.say("normal", "normal"), 5.45, 4.9, { anchor: "leading", color: "muted" });
  canvas.label(`n₁ = ${canvas.number(n1)}`, 1.4, 3.35, { anchor: "leading", color: "white" });
  canvas.label(`n₂ = ${canvas.number(n2)}`, 1.4, 2.65, { anchor: "leading", color: "white" });
  // The incident ray arrives from the upper left.
  const from = { x: o.x - length * Math.sin(theta1), y: o.y + length * Math.cos(theta1) };
  growingLine(canvas, from, o, 0.5, 1.5, { color: "white" });
  let end = 2.6;
  const reflectedTo = { x: o.x + length * Math.sin(theta1), y: o.y + length * Math.cos(theta1) };
  if (theta2 !== null) {
    const refractedTo = { x: o.x + length * Math.sin(theta2), y: o.y - length * Math.cos(theta2) };
    growingLine(canvas, o, refractedTo, 1.5, 2.5, { color: "accent" });
    growingLine(canvas, o, reflectedTo, 1.5, 2.5, { color: "muted", dashed: true });
    canvas.curve("5 + 0.8*sin(s)", "3 - 0.8*cos(s)", "0", Anim.n(theta2), {
      color: "accent",
      visible: Anim.after(2.5),
    });
    canvas.label(`θ₂ = ${deg(theta2)}`, o.x + 1.15 * Math.sin(theta2 / 2) + 0.12, o.y - 1.15 * Math.cos(theta2 / 2), {
      anchor: "leading",
      color: "accent",
      visible: Anim.after(2.5),
    });
  } else {
    growingLine(canvas, o, reflectedTo, 1.5, 2.5, { color: "white" });
    canvas.label(canvas.say("reflexão total interna", "total internal reflection"), 6.9, 1.8, {
      anchor: "center",
      color: "accent",
      visible: Anim.after(2.5),
    });
  }
  canvas.curve("5 - 0.8*sin(s)", "3 + 0.8*cos(s)", "0", Anim.n(theta1), { color: "white", visible: Anim.after(1.5) });
  canvas.label(`θ₁ = ${deg(theta1)}`, o.x - 1.15 * Math.sin(theta1 / 2) - 0.12, o.y + 1.15 * Math.cos(theta1 / 2), {
    anchor: "trailing",
    color: "white",
    visible: Anim.after(1.5),
  });
  if (critical !== null) {
    // The incidence at which the refracted ray would just graze the surface.
    const tip = { x: o.x - length * Math.sin(critical), y: o.y + length * Math.cos(critical) };
    growingLine(canvas, o, tip, 2.6, 3.2, { color: "second", dashed: true });
    canvas.label(`θc = ${deg(critical)}`, tip.x - 0.1, tip.y + 0.3, {
      anchor: "trailing",
      color: "second",
      visible: Anim.after(3.2),
    });
    end = 3.4;
  }
  if (theta2 !== null) {
    const ratio = canvas.number((n1 * Math.sin(theta1)) / n2);
    canvas.caption(canvas.say(`sen θ₂ = ${ratio} → θ₂ = ${deg(theta2)}`, `sin θ₂ = ${ratio} → θ₂ = ${deg(theta2)}`), {
      row: 0,
      color: "white",
      visible: Anim.after(1.5),
    });
  } else if (critical !== null)
    canvas.caption(
      canvas.say(
        `θ₁ = ${deg(theta1)} > θc = ${deg(critical)}: não há raio refratado`,
        `θ₁ = ${deg(theta1)} > θc = ${deg(critical)}: no refracted ray`,
      ),
      { row: 0, color: "white", visible: Anim.after(1.5) },
    );
  canvas.caption(canvas.say("n₁ sen θ₁ = n₂ sen θ₂", "n₁ sin θ₁ = n₂ sin θ₂"), {
    row: 1,
    color: "white",
    visible: Anim.after(0.3),
  });
  const parameters = [slider("angle", "θ₁", degrees, 10, 85), slider("n2", "n₂", n2, 1, 4)];
  return canvas.illustration(title, Anim.duration(end + 0.6), parameters);
};

export const prismSide = 2.6;

const prismDispersion: Compiler = (params, title, language) => {
  const degrees = params.number("incidence") ?? 60;
  if (degrees < 56 || degrees > 75) return null;
  const incidence = (degrees * Math.PI) / 180;
  const v = PrismOptics.vertices(5, 1.5, prismSide);
  const aim = { x: (v.left.x + v.apex.x) / 2, y: (v.left.y + v.apex.y) / 2 };
  const passages: [PrismColor, PrismPassage][] = [];
  for (const color of PrismOptics.colors) {
    const passage = PrismOptics.trace(color.index, incidence, v, aim);
    if (!passage) return null;
    passages.push([color, passage]);
  }
  const canvas = new FigureCanvas(language);
  const box = opticsBox;
  canvas.line(v.left.x, v.left.y, v.right.x, v.right.y, { color: "white" });
  canvas.line(v.left.x, v.left.y, v.apex.x, v.apex.y, { color: "white" });
  canvas.line(v.apex.x, v.apex.y, v.right.x, v.right.y, { color: "white" });
  // White light in: one ray towards the entry point.
  const first = passages[0]![1];
  const incoming = PrismOptics.incomingDirection(incidence);
  const backTo = { x: first.enter.x - incoming.x * 10, y: first.enter.y - incoming.y * 10 };
  const entering = clip(
    { x1: backTo.x, y1: backTo.y, x2: first.enter.x, y2: first.enter.y },
    box.minX,
    box.maxX,
    box.minY,
    box.maxY,
  );
  if (!entering) return null;
  const start = { x: entering.x1, y: entering.y1 };
  growingLine(canvas, start, first.enter, 0.4, 1.4, { color: "white" });
  canvas.label(canvas.say("luz branca", "white light"), start.x + 0.1, start.y + 0.4, {
    anchor: "leading",
    color: "white",
  });
  passages.forEach(([color, passage], index) => {
    const begin = 1.4 + 0.25 * index;
    growingLine(canvas, passage.enter, passage.exit, begin, begin + 0.4, { color: color.element });
    const far = { x: passage.exit.x + passage.exitDirection.x * 12, y: passage.exit.y + passage.exitDirection.y * 12 };
    const piece = clip(
      { x1: passage.exit.x, y1: passage.exit.y, x2: far.x, y2: far.y },
      box.minX,
      box.maxX,
      box.minY,
      box.maxY,
    );
    if (!piece) return;
    growingLine(canvas, { x: piece.x1, y: piece.y1 }, { x: piece.x2, y: piece.y2 }, begin + 0.4, begin + 1.2, {
      color: color.element,
    });
    if (index === 0 || index === passages.length - 1)
      canvas.labelBeside(canvas.say(color.name, color.element), piece.x2, piece.y2, {
        color: color.element,
        visible: Anim.after(begin + 1.2),
      });
  });
  canvas.caption(
    canvas.say("Dispersão: o índice de refração depende da cor", "Dispersion: the refractive index depends on colour"),
    { row: 0, color: "white", visible: Anim.after(0.3) },
  );
  canvas.caption(
    canvas.say("Violeta (n maior) desvia-se mais do que o vermelho", "Violet (larger n) is deviated more than red"),
    { row: 1, color: "white", visible: Anim.after(3.2) },
  );
  return canvas.illustration(title, Anim.duration(4.0), [slider("incidence", "θᵢ", degrees, 56, 75)]);
};

/** Screen distance between neighbouring fringes in the picture. */
export const fringeSpacingOnPage = 0.55;
export const slitScreenX = 6.4;
export const slitPlotWidth = 2.5;

const doubleSlit: Compiler = (params, title, language) => {
  const wavelength = params.number("wavelength") ?? 600; // nm
  const separation = params.number("separation") ?? 0.5; // mm
  const screen = params.number("screenDistance") ?? 2; // m
  if (!(wavelength > 0) || !(separation > 0) || !(screen > 0)) return null;
  const spacingMillimetres = Interference.fringeSpacing(wavelength * 1e-9, screen, separation * 1e-3) * 1000;
  const canvas = new FigureCanvas(language);
  const barrierX = 2.4;
  const screenX = slitScreenX;
  canvas.line(barrierX, 0.85, barrierX, 2.45, { color: "white" });
  canvas.line(barrierX, 2.55, barrierX, 3.45, { color: "white" });
  canvas.line(barrierX, 3.55, barrierX, 5.15, { color: "white" });
  canvas.line(screenX, 0.85, screenX, 5.15, { color: "white" });
  // Plane wave arriving from the left.
  for (const y of [2.3, 3.0, 3.7]) canvas.arrow(0.8, y, 1.8, y, { color: "muted", visible: Anim.after(0.2) });
  canvas.label(canvas.say("fendas", "slits"), barrierX, 5.45, { anchor: "center", color: "white" });
  canvas.label(canvas.say("ecrã", "screen"), screenX, 5.45, { anchor: "center", color: "white" });
  // Rays from each slit to the first-order maximum (schematic, not to scale).
  const target = 3 + fringeSpacingOnPage;
  for (const slitY of [2.5, 3.5])
    growingLine(canvas, { x: barrierX, y: slitY }, { x: screenX, y: target }, 0.8, 1.8, { color: "accent" });
  // The pattern: I = I₀ cos²(π y / Δy).
  const k = fringeSpacingOnPage;
  canvas.curve(
    `${Anim.n(screenX)} + ${Anim.n(slitPlotWidth)}*cos(pi*(s-3)/${Anim.n(k)})^2`,
    "s",
    Anim.n(0.95),
    `${Anim.n(0.95)} + ${Anim.n(4.1)}*${Anim.ramp(1.8, 3.4)}`,
    { color: "second" },
  );
  for (let order = -3; order <= 3; order++) {
    const y = 3 + order * k;
    canvas.box(screenX - 0.12, y - 0.05, 0.12, 0.1, { color: "accent", visible: Anim.after(3.4) });
    canvas.label(order === 0 ? "0" : `${order < 0 ? "−" : ""}${Math.abs(order)}`, 9.2, y, {
      anchor: "center",
      color: "muted",
      visible: Anim.after(3.4),
    });
  }
  canvas.label("m", 9.2, 4.95, { anchor: "center", color: "muted", visible: Anim.after(3.4) });
  const setup = `λ = ${canvas.number(wavelength)} nm · d = ${canvas.number(separation)} mm · L = ${canvas.number(screen)} m`;
  canvas.caption(`${setup} → Δy = λL/d = ${canvas.number(spacingMillimetres)} mm`, {
    row: 1,
    color: "white",
    visible: Anim.after(0.3),
  });
  const parameters = [
    slider("wavelength", "λ (nm)", wavelength, 400, 700),
    slider("separation", "d (mm)", separation, 0.2, 2),
  ];
  return canvas.illustration(title, Anim.duration(4.0), parameters);
};

export function superscript(digits: number): string {
  const map: Record<string, string> = {
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
  };
  return Array.from(String(digits))
    .map((c) => map[c] ?? c)
    .join("");
}

export function wavelengthText(metres: number, canvas: FigureCanvas): string {
  if (metres >= 1) return `${canvas.number(metres)} m`;
  if (metres >= 1e-3) return `${canvas.number(metres * 1e3)} mm`;
  if (metres >= 1e-9) return `${canvas.number(metres * 1e9)} nm`;
  return `${canvas.number(metres * 1e12)} pm`;
}

export function frequencyText(wavelength: number, canvas: FigureCanvas): string {
  const frequency = ElectromagneticSpectrum.frequency(wavelength);
  let exponent = Math.floor(Math.log10(frequency));
  let mantissa = frequency / Math.pow(10, exponent);
  if (mantissa >= 9.95) {
    mantissa = 1;
    exponent += 1;
  }
  return `${canvas.number(mantissa, 2)}×10${superscript(exponent)} Hz`;
}

const visibleColors = ["red", "orange", "yellow", "green", "blue", "violet"];

const emSpectrum: Compiler = (_params, title, language) => {
  const canvas = new FigureCanvas(language);
  const bands = ElectromagneticSpectrum.bands;
  const left = 0.8;
  const width = 1.2;
  const barY = 2.9;
  const barHeight = 0.8;
  bands.forEach((band, index) => {
    const x = left + width * index;
    const shown = Anim.after(0.3 + 0.35 * index);
    if (band.en === "Visible") {
      const piece = width / visibleColors.length;
      visibleColors.forEach((color, shade) =>
        canvas.box(x + piece * shade, barY, piece, barHeight, { color, visible: shown }),
      );
    } else canvas.box(x, barY, width, barHeight, { color: "muted", visible: shown });
    canvas.label(canvas.say(band.pt, band.en), x + width / 2, index % 2 === 0 ? 4.15 : 4.7, {
      anchor: "center",
      color: "white",
      visible: shown,
    });
  });
  // Where one band ends and the next begins: the wavelength and the frequency c/λ.
  for (let index = 1; index < bands.length; index++) {
    const x = left + width * index;
    const limit = bands[index]!.longest;
    const shown = Anim.after(0.3 + 0.35 * bands.length);
    canvas.label(wavelengthText(limit, canvas), x, 2.5, { anchor: "center", color: "white", visible: shown });
    canvas.label(frequencyText(limit, canvas), x, index % 2 === 0 ? 1.95 : 1.45, {
      anchor: "center",
      color: "second",
      visible: shown,
    });
  }
  const after = Anim.after(0.3 + 0.35 * bands.length + 0.4);
  canvas.arrow(left, 1.05, left + width * bands.length, 1.05, { color: "muted", visible: after });
  canvas.caption(
    canvas.say(
      "frequência ↑ · energia ↑ · comprimento de onda ↓ · c = λf",
      "frequency ↑ · energy ↑ · wavelength ↓ · c = λf",
    ),
    { row: 1, color: "white", visible: after },
  );
  canvas.caption(canvas.say("Espectro eletromagnético", "Electromagnetic spectrum"), {
    row: 0,
    color: "white",
    visible: Anim.after(0.1),
  });
  return canvas.illustration(title, Anim.duration(0.3 + 0.35 * bands.length + 1.0));
};

/** The optics figures, by premade type. */
export const opticsFigures: Record<string, Compiler> = {
  lensRays,
  mirrorRays,
  refraction,
  prismDispersion,
  doubleSlit,
  emSpectrum,
};
