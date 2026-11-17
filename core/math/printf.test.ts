// What C's printf (and so Swift's String(format:)) writes, for the formats the figures use. The expected strings are
// glibc's and Apple libc's outputs: both round the exact binary value, and an exact tie to the even digit.

import { describe, expect, it } from "vitest";
import { formatE, formatF, formatG } from "./printf";

describe("printf formats", () => {
  it("%.Nf rounds an exact tie to the even digit", () => {
    expect(formatF(0.5, 0)).toBe("0");
    expect(formatF(1.5, 0)).toBe("2");
    expect(formatF(2.5, 0)).toBe("2");
    expect(formatF(-2.5, 0)).toBe("-2");
    expect(formatF(-0.5, 0)).toBe("-0");
    expect(formatF(1086.5, 0)).toBe("1086");
    expect(formatF(1087.5, 0)).toBe("1088");
    expect(formatF(0.125, 2)).toBe("0.12");
    expect(formatF(0.375, 2)).toBe("0.38");
    expect(formatF(1.25, 1)).toBe("1.2");
  });

  it("%.Nf rounds a value that only looks like a tie to the nearest", () => {
    // 0.15 is a little below 0.15 in binary, 2.675 a little below 2.675, 1.005 a little below 1.005.
    expect(formatF(0.15, 1)).toBe("0.1");
    expect(formatF(2.675, 2)).toBe("2.67");
    expect(formatF(1.005, 2)).toBe("1.00");
    expect(formatF(0.35, 1)).toBe("0.3");
    expect(formatF(3.14159, 3)).toBe("3.142");
    expect(formatF(-0.001, 2)).toBe("-0.00");
  });

  it("%.Ne and %.Ng settle ties the same way", () => {
    expect(formatE(1086.5, 3)).toBe("1.086e+03");
    expect(formatE(2.5, 0)).toBe("2e+00");
    expect(formatE(12345, 2)).toBe("1.23e+04");
    // 0.000125 is a little above the tie in binary; 2⁻¹¹ = 0.00048828125 is exact.
    expect(formatE(0.000125, 1)).toBe("1.3e-04");
    expect(formatE(0.00048828125, 6)).toBe("4.882812e-04");
    expect(formatG(1086.5, 4)).toBe("1086");
    expect(formatG(1313.9, 4)).toBe("1314");
    expect(formatG(2080.7, 4)).toBe("2081");
    expect(formatG(0.125, 2)).toBe("0.12");
    expect(formatG(2.5, 1)).toBe("2");
    expect(formatG(3.5, 1)).toBe("4");
    expect(formatG(95, 1)).toBe("1e+02");
    expect(formatG(0.0001, 3)).toBe("0.0001");
    expect(formatG(0.00001, 3)).toBe("1e-05");
    expect(formatG(123456, 6)).toBe("123456");
    expect(formatG(1234567, 6)).toBe("1.23457e+06");
  });
});
