// Port of the colour cases of LearnLayerTests/VectorFigureTests.swift @ ref 2026-11-04
// (themeMapsPaperToNothingAndColoursToTheSmallPalette, coloursKeepTheirMeaningInASmallPalette,
// drawsInTheAppsInkWithNoBackground), on the pixels pdf.js draws instead of the paths the Mac redraws.

import { describe, expect, it } from "vitest";
import { InkThemes, PageInk } from "./pageInk";

const theme = InkThemes.dark();

describe("the page's colours on the dark stage", () => {
  it("maps paper to nothing and colours to the small palette", () => {
    expect(PageInk.paint({ r: 1, g: 1, b: 1 }, true, 0.5, theme)).toBeNull();
    expect(PageInk.paint({ r: 0, g: 0, b: 0 }, false, 0, theme)?.alpha).toBe(1);
    const red = PageInk.paint({ r: 0.9, g: 0.1, b: 0.1 }, false, 0, theme);
    expect(red?.alpha).toBe(1);
    expect(red && { r: red.r, g: red.g, b: red.b }).not.toEqual(theme.ink);
    // A big dark area is a tint, a small dark mark is ink.
    expect(PageInk.paint({ r: 0, g: 0, b: 0 }, true, 0.5, theme)?.alpha ?? 1).toBeLessThan(0.3);
    expect(PageInk.paint({ r: 0, g: 0, b: 0 }, true, 0.01, theme)?.alpha).toBe(1);
  });

  it("colours keep their meaning in a small palette", () => {
    const red = PageInk.tint({ r: 0.9, g: 0.1, b: 0.1 }, theme);
    const green = PageInk.tint({ r: 0.1, g: 0.7, b: 0.2 }, theme);
    const blue = PageInk.tint({ r: 0.1, g: 0.2, b: 0.9 }, theme);
    const orange = PageInk.tint({ r: 1, g: 0.55, b: 0.05 }, theme);
    expect([red, green, blue, orange]).toEqual([theme.red, theme.green, theme.accent, theme.orange]);
    expect(new Set([red, green, blue, orange].map((c) => `${c.r},${c.g},${c.b}`)).size).toBe(4);
    // Painted through the theme, a red wire and a green wire stay different colours, neither is ink.
    const wire = PageInk.paint({ r: 0.9, g: 0.1, b: 0.1 }, false, 0, theme)!;
    const other = PageInk.paint({ r: 0.1, g: 0.7, b: 0.2 }, false, 0, theme)!;
    const key = (p: { r: number; g: number; b: number }) => `${p.r},${p.g},${p.b}`;
    expect(key(wire)).not.toBe(key(other));
    expect(key(wire)).not.toBe(key(theme.ink));
    expect(key(other)).not.toBe(key(theme.ink));
  });

  it("draws the page in the app's ink with no background", () => {
    // A white page, a black line with an anti-aliased edge, a red wire and a light grey shading.
    const pixels = new Uint8ClampedArray([
      ...[255, 255, 255, 255],
      ...[0, 0, 0, 255],
      ...[0, 0, 0, 96],
      ...[230, 25, 25, 255],
      ...[217, 217, 217, 255],
      ...[0, 0, 0, 0],
    ]);
    PageInk.recolour(pixels, theme);
    const at = (index: number) => Array.from(pixels.slice(index * 4, index * 4 + 4));
    // Paper: nothing.
    expect(at(0)[3]).toBe(0);
    // Ink: white, as opaque as the page drew it.
    expect(at(1)).toEqual([255, 255, 255, 255]);
    expect(at(2)).toEqual([255, 255, 255, 96]);
    // The wire in the palette's red.
    expect(at(3)).toEqual([theme.red.r, theme.red.g, theme.red.b, 255]);
    // A light shading only a faint tint; nothing drawn stays nothing.
    expect(at(4)[3]).toBeGreaterThan(0);
    expect(at(4)[3]).toBeLessThan(0.25 * 255);
    expect(at(5)[3]).toBe(0);
  });

  it("a mid grey stroke is half ink", () => {
    expect(PageInk.pixel({ r: 0.4, g: 0.4, b: 0.4 }, theme)?.alpha).toBeCloseTo(0.5, 2);
    expect(PageInk.pixel({ r: 0.2, g: 0.2, b: 0.2 }, theme)?.alpha).toBe(1);
    expect(InkThemes.dark("#007aff").accent).toEqual({ r: 0, g: 122, b: 255 });
  });
});

describe("a picture of the screen in the stage's ink", () => {
  const pixels = (...colours: [number, number, number][]) =>
    new Uint8ClampedArray(colours.flatMap(([r, g, b]) => [r, g, b, 255]));

  it("clears the paper and turns black text white, its edges by their darkness", () => {
    const data = pixels([255, 255, 255], [255, 255, 255], [255, 255, 255], [0, 0, 0], [160, 160, 160]);
    expect(PageInk.recolourPicture(data, theme)).toBe(true);
    expect(data[3]).toBe(0);
    expect([...data.slice(12, 16)]).toEqual([255, 255, 255, 255]);
    expect(data[16]).toBe(255);
    expect(data[19]).toBeGreaterThan(40);
    expect(data[19]).toBeLessThan(255);
  });

  it("keeps a coloured mark in the palette", () => {
    const data = pixels([255, 255, 255], [255, 255, 255], [220, 20, 20]);
    PageInk.recolourPicture(data, theme);
    expect([data[8], data[9], data[10]]).toEqual([theme.red.r, theme.red.g, theme.red.b]);
  });

  it("leaves a dark page as it is", () => {
    const data = pixels([20, 20, 20], [20, 20, 20], [255, 255, 255]);
    const before = [...data];
    expect(PageInk.recolourPicture(data, theme)).toBe(false);
    expect([...data]).toEqual(before);
  });
});
