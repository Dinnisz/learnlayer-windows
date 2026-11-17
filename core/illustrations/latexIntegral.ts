// Port of LearnLayer/Explanation/LatexIntegral.swift @ ref 2026-11-04: the first integral a solution step writes in
// LaTeX ("V = \pi \int_{0}^{4} (\sqrt{x})^2 \, dx"), read and worked out by the app, so the step that writes the volume's
// integral can be matched against the drawn solid's volume.

import { SafeFormula } from "./solid";

export interface LatexIntegral {
  coefficient: number;
  low: number;
  high: number;
  variable: string;
  integrand: SafeFormula;
}

function cleaned(latex: string): string {
  let text = latex;
  const replacements: [string, string][] = [
    ["\\left", ""],
    ["\\right", ""],
    ["\\,", " "],
    ["\\!", ""],
    ["\\;", " "],
    ["\\displaystyle", ""],
    ["\\limits", ""],
    ["\\cdot", "*"],
    ["\\times", "*"],
    ["{,}", "."],
    ["\\mathrm{d}", "d"],
    ["\\, d", " d"],
  ];
  for (const [from, to] of replacements) text = text.split(from).join(to);
  return text.replace(/(\d),(\d)/gu, "$1.$2");
}

/** The text of a {…} group at the start of `text` and what follows it. */
function braced(text: string): [string, string] | null {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) return [text.slice(1, index), text.slice(index + 1)];
    }
  }
  return null;
}

/** The limit after "_" or "^": a braced group or a single character. */
function bound(mark: string, text: string): [string, string] | null {
  const trimmed = text.replace(/^ +/u, "");
  if (trimmed[0] !== mark) return null;
  const rest = trimmed.slice(1).replace(/^ +/u, "");
  if (rest[0] === "{") return braced(rest);
  if (rest.length === 0) return null;
  // "\pi" as a bare limit.
  if (rest[0] === "\\") {
    const name = /^[A-Za-z]*/u.exec(rest.slice(1))![0];
    return ["\\" + name, rest.slice(1 + name.length)];
  }
  return [rest[0]!, rest.slice(1)];
}

/** LaTeX maths → the formula reader's ASCII: \frac{a}{b}, \sqrt{x}, \sqrt[3]{x}, ^{…}, \pi, \sin… */
export function latexExpression(latex: string): string {
  let text = latex;
  // \frac and \sqrt, innermost first, until none is left.
  for (let round = 0; round < 12; round += 1) {
    let changed = false;
    const fraction = /\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/u.exec(text);
    if (fraction) {
      text =
        text.slice(0, fraction.index) +
        `((${fraction[1]})/(${fraction[2]}))` +
        text.slice(fraction.index + fraction[0].length);
      changed = true;
    }
    const root = /\\sqrt\[([^\]]*)\]\{([^{}]*)\}/u.exec(text);
    if (root) {
      text = text.slice(0, root.index) + `((${root[2]})^(1/(${root[1]})))` + text.slice(root.index + root[0].length);
      changed = true;
    }
    const square = /\\sqrt\{([^{}]*)\}/u.exec(text);
    if (square) {
      text = text.slice(0, square.index) + `sqrt(${square[1]})` + text.slice(square.index + square[0].length);
      changed = true;
    }
    const power = /\^\{([^{}]*)\}/u.exec(text);
    if (power) {
      text = text.slice(0, power.index) + `^(${power[1]})` + text.slice(power.index + power[0].length);
      changed = true;
    }
    if (!changed) break;
  }
  const replacements: [string, string][] = [
    ["\\pi", "pi"],
    ["\\sin", "sin"],
    ["\\cos", "cos"],
    ["\\tan", "tan"],
    ["\\ln", "ln"],
    ["\\log", "log"],
    ["\\exp", "exp"],
    ["{", "("],
    ["}", ")"],
    ["[", "("],
    ["]", ")"],
    ["\\", ""],
  ];
  for (const [from, to] of replacements) text = text.split(from).join(to);
  return text.trim();
}

export const LatexIntegrals = {
  /** The first integral of the step, read; null when there is none or a part can't be read. */
  read(latex: string): LatexIntegral | null {
    const text = cleaned(latex);
    const start = text.indexOf("\\int");
    if (start < 0) return null;
    // The coefficient: the factor written just before \int in its term (π, 2π, \frac{1}{3}π…).
    let before = text.slice(0, start);
    const cut = Math.max(before.lastIndexOf("="), before.lastIndexOf("+"), before.lastIndexOf("-"));
    if (cut >= 0) before = before.slice(cut + 1);
    before = before.trim();
    const lowBound = bound("_", text.slice(start + 4));
    if (!lowBound) return null;
    const highBound = bound("^", lowBound[1]);
    if (!highBound) return null;
    const rest = highBound[1];
    // The integrand runs to the differential.
    const differential = /\s*d\s*([xyt])\b/u.exec(rest);
    if (!differential) return null;
    const variable = differential[1]!;
    const body = rest.slice(0, differential.index);
    const low = SafeFormula.make(latexExpression(lowBound[0]), [])?.value({});
    const high = SafeFormula.make(latexExpression(highBound[0]), [])?.value({});
    if (low === undefined || high === undefined || !Number.isFinite(low) || !Number.isFinite(high) || high <= low)
      return null;
    const integrand = SafeFormula.make(latexExpression(body), [variable]);
    if (!integrand) return null;
    const factor = before === "" ? "1" : latexExpression(before);
    const coefficient = SafeFormula.make(factor === "" ? "1" : factor, [])?.value({});
    if (coefficient === undefined || !Number.isFinite(coefficient)) return null;
    return { coefficient, low, high, variable, integrand };
  },

  /** coefficient × ∫ integrand, by Simpson's rule; null when undefined inside. */
  value(integral: LatexIntegral): number | null {
    const n = 400;
    const h = (integral.high - integral.low) / n;
    let sum = 0;
    for (let i = 0; i <= n; i += 1) {
      const v = integral.integrand.value({ [integral.variable]: integral.low + i * h });
      if (!Number.isFinite(v)) return null;
      sum += v * (i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2);
    }
    return (integral.coefficient * sum * h) / 3;
  },
};
