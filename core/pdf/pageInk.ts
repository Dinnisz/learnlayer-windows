// Port of VectorFigure.Theme, VectorFigure.paint and VectorFigure.isAccent (LearnLayer/Problems/VectorFigure.swift @ ref
// 2026-11-04): the page's colours on the app's dark ground. Dark ink becomes the ink (white), anything saturated the
// nearest hue of a small palette (red, orange, green, blue, purple), and paper nothing: a red wire stays red, a blue
// curve blue, and there is no white plate.
//
// The Mac redraws the page's paths with these colours. On Windows pdf.js draws the page (from the same paths), on a
// transparent canvas, and `recolour` maps its pixels with the same rules: each pixel's colour is the colour the page
// printed there (its coverage is the alpha), so the rule for a stroke applies to it. What pdf.js can't say per pixel is
// whether paint was a fill and how big: a grey between dark ink and paper fades from the half ink of a grey stroke to
// the faint tint of a light fill (see docs/DECISOES.md).

export interface PageColor {
  r: number;
  g: number;
  b: number;
}

/** A colour of the palette, 0–255 per channel, and how opaque it is (0–1). */
export interface InkPaint {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

export interface InkTheme {
  ink: PageColor;
  accent: PageColor;
  red: PageColor;
  orange: PageColor;
  green: PageColor;
  purple: PageColor;
}

const hex = (value: string): PageColor => {
  const digits = /^#?([0-9a-f]{6})$/iu.exec(value.trim())?.[1] ?? "0a84ff";
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16));
  return { r: r!, g: g!, b: b! };
};

export const InkThemes = {
  /** The stage's: white ink, the system blue, and the system's other hues as they are on a dark ground. */
  dark(accent = "#0a84ff"): InkTheme {
    return {
      ink: { r: 255, g: 255, b: 255 },
      accent: hex(accent),
      red: hex("#ff453a"),
      orange: hex("#ff9f0a"),
      green: hex("#30d158"),
      purple: hex("#bf5af2"),
    };
  },
  hex,
};

const luminanceOf = (c: PageColor) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
const saturationOf = (c: PageColor) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);

/** The hue of a colour in degrees (0–360), as NSColor's `getHue` gives it. */
function hueOf(c: PageColor): number {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue: number;
  if (max === c.r) hue = ((c.g - c.b) / delta) % 6;
  else if (max === c.g) hue = (c.b - c.r) / delta + 2;
  else hue = (c.r - c.g) / delta + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

const paint = (color: PageColor, alpha: number): InkPaint => ({ ...color, alpha });

export const PageInk = {
  /** The palette colour nearest in hue to a saturated page colour (components 0–1). */
  tint(color: PageColor, theme: InkTheme): PageColor {
    const degrees = hueOf(color);
    if (degrees < 18 || degrees >= 335) return theme.red;
    if (degrees < 70) return theme.orange;
    if (degrees < 170) return theme.green;
    if (degrees < 255) return theme.accent;
    return theme.purple;
  },

  isAccent(color: PageColor): boolean {
    return saturationOf(color) > 0.35;
  },

  /**
   * The theme's colour for a page colour (components 0–1), or null where the paper's colour would have been (the app
   * draws no background). `share` is the part of the figure a fill covers.
   */
  paint(color: PageColor, filled: boolean, share: number, theme: InkTheme): InkPaint | null {
    const luminance = luminanceOf(color);
    const saturation = saturationOf(color);
    if (luminance > 0.93 && saturation < 0.15) return null;
    if (saturation > 0.35) return paint(PageInk.tint(color, theme), filled ? 0.28 : 1);
    if (filled) {
      // Small solid marks (arrowheads, junction dots) are ink; big areas only a tint.
      if (luminance < 0.35) return paint(theme.ink, share < 0.04 ? 1 : 0.16);
      return paint(theme.ink, 0.12);
    }
    return paint(theme.ink, luminance < 0.4 ? 1 : 0.5);
  },

  /**
   * The paint for one pixel pdf.js drew (components 0–1): a stroke's (`paint` with `filled: false`), except that a grey
   * lighter than the stroke's half ink fades towards a light fill's tint, since a pixel doesn't say which it was.
   */
  pixel(color: PageColor, theme: InkTheme): InkPaint | null {
    const luminance = luminanceOf(color);
    const saturation = saturationOf(color);
    if (luminance > 0.93 && saturation < 0.15) return null;
    if (saturation > 0.35) return paint(PageInk.tint(color, theme), 1);
    if (luminance < 0.4) return paint(theme.ink, 1);
    const along = Math.min(1, (luminance - 0.4) / (0.93 - 0.4));
    return paint(theme.ink, 0.5 + (0.12 - 0.5) * along);
  },

  /** Maps the pixels of a canvas pdf.js drew on a transparent ground (RGBA, not premultiplied), in place. */
  recolour(data: Uint8ClampedArray, theme: InkTheme): void {
    const known = new Map<number, InkPaint | null>();
    for (let at = 0; at + 3 < data.length; at += 4) {
      const alpha = data[at + 3]!;
      if (alpha === 0) continue;
      const key = (data[at]! << 16) | (data[at + 1]! << 8) | data[at + 2]!;
      let found = known.get(key);
      if (found === undefined) {
        found = PageInk.pixel({ r: data[at]! / 255, g: data[at + 1]! / 255, b: data[at + 2]! / 255 }, theme);
        known.set(key, found);
      }
      if (!found) {
        data[at + 3] = 0;
        continue;
      }
      data[at] = found.r;
      data[at + 1] = found.g;
      data[at + 2] = found.b;
      data[at + 3] = Math.round(alpha * found.alpha);
    }
  },
};
