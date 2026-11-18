// Port of LearnLayer/Voice/MascotFigureFocus.swift @ ref 2026-11-04. The tutor's one body going to the part of the
// figure the step it explains is about: it stays the sphere and waits just above that part, glowing, while the figure
// magnifies it a little, in place; it goes back to rest when the step has nothing in the figure. It only goes once the
// student clicks it (MascotGuide).

import type { CompiledIllustration, IllustrationElement } from "../illustrations/illustration";

export interface FocusRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface FocusPoint {
  x: number;
  y: number;
}
export interface FocusSize {
  width: number;
  height: number;
}

/** A magnification of the figure: by `scale`, about a point given as a share of its size. */
export interface FigureZoom {
  scale: number;
  anchorX: number;
  anchorY: number;
}

const identity: FigureZoom = { scale: 1, anchorX: 0.5, anchorY: 0.5 };

/** Where two rectangles overlap, an empty one when they only touch; null when they are apart (CGRect.intersection). */
function intersection(a: FocusRect, b: FocusRect): FocusRect | null {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right < left || bottom < top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function union(a: FocusRect, b: FocusRect): FocusRect {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  return {
    x: left,
    y: top,
    width: Math.max(a.x + a.width, b.x + b.width) - left,
    height: Math.max(a.y + a.height, b.y + b.height) - top,
  };
}

export const FigureFocusGeometry = {
  /** How far the figure magnifies a detail, at most. */
  maximumZoom: 2.0,
  /** A detail is magnified until it fills about this share of the figure. */
  targetShare: 0.3,
  /** A detail at least this big is shown as it is. */
  noZoomShare: 0.4,
  /** The magnifying starts this long after the body sets off, so it grows as the body arrives. */
  zoomDelay: 0.45,
  /** The point it shows sits this far inside the top of the detail, at most. */
  tipInset: 6,
  /** Between the bottom of the sphere and the detail it shows. */
  hoverGap: 4,

  identity,
  isIdentity: (zoom: FigureZoom) => Math.abs(zoom.scale - 1) < 1e-6,

  /**
   * A box in the figure's own units (x right, y up, from (0, 0) to (width, height)) in the view (y down), with the
   * picture fitted and centred as the renderer draws it.
   */
  canvasRect(world: FocusRect, canvas: FocusSize, sceneWidth: number, sceneHeight: number): FocusRect | null {
    if (!(canvas.width > 1 && canvas.height > 1 && sceneWidth > 0 && sceneHeight > 0)) return null;
    if (![world.x, world.y, world.width, world.height].every(Number.isFinite)) return null;
    const scale = Math.min(canvas.width / sceneWidth, canvas.height / sceneHeight);
    const offsetX = (canvas.width - sceneWidth * scale) / 2;
    const offsetY = (canvas.height - sceneHeight * scale) / 2;
    const rect = {
      x: offsetX + world.x * scale,
      y: canvas.height - offsetY - (world.y + world.height) * scale,
      width: world.width * scale,
      height: world.height * scale,
    };
    return intersection(rect, { x: 0, y: 0, width: canvas.width, height: canvas.height });
  },

  /** How far to magnify `region` (view points) and about which point, so it grows toward `targetShare` of the figure
   * and stays wholly inside it. */
  zoom(region: FocusRect, canvas: FocusSize): FigureZoom {
    if (!(canvas.width > 1 && canvas.height > 1 && region.width > 0 && region.height > 0)) return identity;
    const share = (region.width * region.height) / (canvas.width * canvas.height);
    if (share >= FigureFocusGeometry.noZoomShare) return identity;
    const wanted = Math.sqrt(FigureFocusGeometry.targetShare / Math.max(share, 1e-6));
    // Never so far that the detail would spill past the figure's edges.
    const fits = Math.min(canvas.width / region.width, canvas.height / region.height);
    const scale = Math.min(FigureFocusGeometry.maximumZoom, wanted, fits);
    if (scale <= 1.02) return identity;
    return {
      scale,
      anchorX: anchor(region.x, region.x + region.width, canvas.width, scale) / canvas.width,
      anchorY: anchor(region.y, region.y + region.height, canvas.height, scale) / canvas.height,
    };
  },

  /** Where `rect` is drawn once the figure is magnified by `zoom`. */
  zoomed(rect: FocusRect, zoom: FigureZoom, canvas: FocusSize): FocusRect {
    const ax = zoom.anchorX * canvas.width;
    const ay = zoom.anchorY * canvas.height;
    const s = zoom.scale;
    return { x: ax + (rect.x - ax) * s, y: ay + (rect.y - ay) * s, width: rect.width * s, height: rect.height * s };
  },

  /** The point the sphere shows: the middle of the detail's top edge, just inside. */
  pointerTip(region: FocusRect, canvas: FocusSize): FocusPoint {
    const x = Math.min(Math.max(region.x + region.width / 2, 0), canvas.width);
    const y = Math.min(
      Math.max(region.y + Math.min(FigureFocusGeometry.tipInset, region.height * 0.25), 0),
      canvas.height,
    );
    return { x, y };
  },

  /** Where the sphere's centre waits to show `tip`: straight above it, its bottom `hoverGap` clear of it, so it sits
   * above the detail instead of over it. Never an arrow. */
  hoverCenter(tip: FocusPoint, bodySize: number): FocusPoint {
    return { x: tip.x, y: tip.y - bodySize / 2 - FigureFocusGeometry.hoverGap };
  },

  /** A point in the figure's view in window coordinates, where the view is `frame` (which may be drawn scaled) and its
   * own size is `size`. */
  window(point: FocusPoint, frame: FocusRect, size: FocusSize): FocusPoint {
    const sx = size.width > 0 ? frame.width / size.width : 1;
    const sy = size.height > 0 ? frame.height / size.height : 1;
    return { x: frame.x + point.x * sx, y: frame.y + point.y * sy };
  },
};

/** The point to magnify about along one axis: the detail's centre when that keeps it in, else as near to it as keeps
 * the magnified detail between 0 and `length`. */
function anchor(low: number, high: number, length: number, scale: number): number {
  const centre = (low + high) / 2;
  // p' = a + s (p − a): the detail stays in when (s·high − length)/(s − 1) ≤ a ≤ s·low/(s − 1).
  const lowest = (scale * high - length) / (scale - 1);
  const highest = (scale * low) / (scale - 1);
  return Math.min(Math.max(centre, lowest), highest);
}

/** The part of a figure that a solution step is about, in the figure's own units. */
export const FigureFocusRegion = {
  /** The smallest side a detail is given, as a share of the figure, so a dot is a spot. */
  minimumShare: 0.06,

  /**
   * What step `step` (from 0) adds to the drawing: the parts that show from that step on and not before. When the
   * figure ties nothing to steps, the labels holding a value the step writes (`stepText`). Null when the step has
   * nothing in the figure. With `wholeFigureFallback` (the plan points at figures), a step that adds nothing of its own
   * points at the figure as a whole, which is shown as it is, not magnified.
   */
  region(
    compiled: CompiledIllustration,
    step: number,
    stepText: string | null = null,
    wholeFigureFallback = false,
  ): FocusRect | null {
    const own = ownRegion(compiled, step, stepText);
    if (own) return own;
    const scene = compiled.scene;
    if (!wholeFigureFallback || step < 0 || !(scene.width > 0 && scene.height > 0)) return null;
    return { x: 0, y: 0, width: scene.width, height: scene.height };
  },

  /** The numbers a text writes, as written: "12", "0,5", "9/2". */
  numbers(text: string): Set<string> {
    return new Set(Array.from(text.matchAll(/\d+(?:[.,]\d+)?(?:\/\d+)?/gu), (match) => match[0]));
  },
};

function ownRegion(compiled: CompiledIllustration, step: number, stepText: string | null): FocusRect | null {
  const scene = compiled.scene;
  if (step < 0 || !(scene.width > 0 && scene.height > 0)) return null;
  const now = values(compiled, step + 1);
  const before = values(compiled, step);
  let boxes = scene.elements
    .filter((element) => {
      const gate = element.visible;
      if (typeof gate !== "string") return false;
      return isVisible(gate, compiled, now) && !isVisible(gate, compiled, before);
    })
    .flatMap((element) => box(element, compiled, now) ?? []);
  if (boxes.length === 0 && stepText !== null) {
    const written = FigureFocusRegion.numbers(stepText);
    boxes = scene.elements
      .filter((element) => {
        if (element.kind !== "label" || typeof element.text !== "string") return false;
        // The value: what follows "=", else the whole label. A lone digit says too little.
        const value = FigureFocusRegion.numbers(element.text.split("=").at(-1) ?? element.text);
        return [...value].some((number) => number.length >= 2 && written.has(number));
      })
      .flatMap((element) => box(element, compiled, now) ?? []);
  }
  const first = boxes[0];
  if (!first) return null;
  return padded(boxes.slice(1).reduce(union, first), scene.width, scene.height);
}

function values(compiled: CompiledIllustration, step: number): Record<string, number> {
  const out: Record<string, number> = { t: 0, revealed: 0, step };
  for (const parameter of compiled.scene.parameters ?? []) out[parameter.name] = parameter.value;
  return out;
}

/** Drawn while its gate is above 0; a gate that can't be read doesn't hide it. */
function isVisible(gate: string, compiled: CompiledIllustration, at: Record<string, number>): boolean {
  const value = compiled.value(gate, at);
  if (value === null) return true;
  return Number.isFinite(value) && value > 0;
}

function span(points: readonly [number, number][]): FocusRect | null {
  const first = points[0];
  if (!first) return null;
  let [minX, minY] = first;
  let [maxX, maxY] = first;
  for (const [x, y] of points.slice(1)) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** The element's extent in the figure's units, roughly: enough to point at, not to draw. */
function box(
  element: IllustrationElement,
  compiled: CompiledIllustration,
  at: Record<string, number>,
): FocusRect | null {
  const scene = compiled.scene;
  const unit = Math.max(scene.width, scene.height);
  const number = (text: string | null | undefined) => {
    const value = compiled.value(text, at);
    return value !== null && Number.isFinite(value) ? value : null;
  };
  if (element.kind === "fieldLines") return null;
  if (element.kind === "curve") {
    const from = number(element.from) ?? 0;
    const to = number(element.to) ?? 1;
    const samples = 24;
    const points: [number, number][] = [];
    for (let index = 0; index <= samples; index += 1) {
      const there = { ...at, s: from + ((to - from) * index) / samples };
      const x = compiled.value(element.curveX, there);
      const y = compiled.value(element.curveY, there);
      if (x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y)) points.push([x, y]);
    }
    return span(points);
  }
  const x = number(element.x);
  const y = number(element.y);
  if (x === null || y === null) return null;
  switch (element.kind) {
    case "line":
    case "arrow":
    case "spring":
    case "component":
    case "transition": {
      const x2 = number(element.x2);
      const y2 = number(element.y2);
      return x2 === null || y2 === null
        ? span([[x, y]])
        : span([
            [x, y],
            [x2, y2],
          ]);
    }
    case "circle":
    case "charge":
    case "state": {
      const r = Math.abs(number(element.r) ?? unit * 0.03);
      return { x: x - r, y: y - r, width: 2 * r, height: 2 * r };
    }
    case "rect": {
      const w = number(element.w) ?? 0;
      const h = number(element.h) ?? 0;
      return span([
        [x, y],
        [x + w, y + h],
      ]);
    }
    case "shape": {
      const w = number(element.w) ?? 1;
      const h = number(element.h) ?? 1;
      if (element.points && element.points.length > 0) {
        return span(
          element.points.flatMap((point): [number, number][] =>
            point.length >= 2 ? [[x + point[0]! * w, y + point[1]! * h]] : [],
          ),
        );
      }
      const r = Math.abs(number(element.r) ?? unit * 0.03);
      return { x: x - r, y: y - r, width: 2 * r, height: 2 * r };
    }
    case "label": {
      const height = scene.height * 0.06;
      const width = Math.max(1, Array.from(element.text ?? "").length || 1) * height * 0.5;
      const left = element.anchor === "trailing" ? x - width : element.anchor === "center" ? x - width / 2 : x;
      return { x: left, y: y - height / 2, width, height };
    }
    default:
      return span([[x, y]]);
  }
}

/** At least `minimumShare` of the figure on each side, and kept inside it. */
function padded(rect: FocusRect, width: number, height: number): FocusRect | null {
  const minimumWidth = width * FigureFocusRegion.minimumShare;
  const minimumHeight = height * FigureFocusRegion.minimumShare;
  let box: FocusRect = {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
  if (box.width < minimumWidth) {
    const grow = (minimumWidth - box.width) / 2;
    box = { ...box, x: box.x - grow, width: minimumWidth };
  }
  if (box.height < minimumHeight) {
    const grow = (minimumHeight - box.height) / 2;
    box = { ...box, y: box.y - grow, height: minimumHeight };
  }
  const inside = intersection(box, { x: 0, y: 0, width, height });
  return !inside || inside.width <= 0 || inside.height <= 0 ? null : inside;
}
