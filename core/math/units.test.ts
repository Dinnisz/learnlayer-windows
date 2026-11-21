import { describe, expect, it } from "vitest";
import { isUnitWord, uprightUnits } from "./units";

describe("units", () => {
  it("knows units with and without a prefix", () => {
    for (const unit of ["m", "kg", "km", "µs", "kΩ", "mol", "°C", "Hz", "kWh"])
      expect(isUnitWord(unit), unit).toBe(true);
    for (const name of ["x", "t", "v", "n", "sen", "ab"]) expect(isUnitWord(name), name).toBe(false);
  });

  it("sets a unit after a number upright (Mac report P5)", () => {
    expect(uprightUnits("9 J")).toBe(String.raw`9 \mathrm{J}`);
    expect(uprightUnits(String.raw`v = 3\,m/s`)).toBe(String.raw`v = 3\,\mathrm{m}/\mathrm{s}`);
    expect(uprightUnits(String.raw`a = 2\ m/s^2`)).toBe(String.raw`a = 2\ \mathrm{m}/\mathrm{s}^2`);
    expect(uprightUnits(String.raw`p = 1{,}2 \times 10^{3}\,kg \cdot m/s`)).toBe(
      String.raw`p = 1{,}2 \times 10^{3}\,\mathrm{kg} \cdot \mathrm{m}/\mathrm{s}`,
    );
    expect(uprightUnits(String.raw`R = 3\,k\Omega`)).toBe(String.raw`R = 3\,k\Omega`);
    expect(uprightUnits(String.raw`R = 3\,\Omega`)).toBe(String.raw`R = 3\,\mathrm{\Omega}`);
    expect(uprightUnits(String.raw`t = 4\,\mus`)).toBe(String.raw`t = 4\,\mathrm{\mu s}`);
  });

  it("leaves names and text alone", () => {
    for (const latex of [
      "2 x",
      "3 g t",
      String.raw`9\,\text{J}`,
      String.raw`9\,\mathrm{J}`,
      String.raw`2 \sin x`,
      String.raw`\frac{1}{2} m v^2`,
      "x = 2 n + 1",
    ])
      expect(uprightUnits(latex), latex).toBe(latex);
  });
});
