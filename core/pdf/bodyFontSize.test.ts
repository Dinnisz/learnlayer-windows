import { describe, expect, it } from "vitest";
import { bodyFontSize } from "./page";

const box = (x: number, size: number) => ({ x, y: 100, width: size * 0.5, height: size * 1.2 });

describe("bodyFontSize", () => {
  it("is the size most letters in the bounds are printed at", () => {
    const text = "abcdeXY";
    const boxes = [box(0, 11), box(5, 11), box(10, 11), box(15, 11), box(20, 11), box(25, 16), box(30, 16)];
    expect(bodyFontSize({ text, boxes }, { x: 0, y: 0, width: 200, height: 300 })).toBe(11);
  });

  it("counts only letters inside the bounds, to the half point", () => {
    const text = "ab cd";
    const boxes = [box(0, 9.5), box(5, 9.5), null, box(500, 12), box(505, 12)];
    expect(bodyFontSize({ text, boxes }, { x: 0, y: 0, width: 100, height: 300 })).toBe(9.5);
  });

  it("falls back to 11 when nothing readable is printed there", () => {
    expect(bodyFontSize({ text: "", boxes: [] }, { x: 0, y: 0, width: 10, height: 10 })).toBe(11);
    expect(bodyFontSize({ text: "a", boxes: [box(0, 60)] }, { x: 0, y: 0, width: 100, height: 300 })).toBe(11);
  });
});
