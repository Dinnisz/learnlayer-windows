// Port of LearnLayer/Problems/ProblemVariant.swift @ ref 2026-11-04: the same exam question with new numbers. The
// model only writes the question; the app decides what is right, so a variant can't come with a wrong answer.

import { evaluate, parseExpression, tryParseExpression, variables, type Expression } from "../math/expression";
import { swiftSchema, swiftText } from "../prompts/swiftText";

export interface VariantValue {
  name: string;
  value: number;
  unit: string | null;
}

export interface ProblemVariant {
  kind: "number" | "function";
  /** The question, self-contained, with the new givens as placeholders ({R}, {equation}). */
  statement: string;
  /** For a number: the values of the formula's names, in SI units. */
  values: VariantValue[];
  /** The SI unit the answer comes out in; empty when it has none. */
  unit: string;
  hint: string;
  variable: string | null;
  left: string | null;
  right: string | null;
  nonZero: boolean | null;
  example: string | null;
}

/** Names that need no value in the statement (the student knows them). */
const constants = new Set(["eps0", "mu0", "g", "k", "c", "h", "G", "e"]);

const optionalString = (value: unknown) => (typeof value === "string" ? value : null);

/** The model's JSON, or an error when it isn't a variant. */
export function decodeVariant(value: unknown): ProblemVariant {
  if (typeof value !== "object" || value === null) throw new Error("variant is not an object");
  const record = value as Record<string, unknown>;
  const kind = record["kind"];
  if (kind !== "number" && kind !== "function") throw new Error("variant kind");
  if (typeof record["statement"] !== "string") throw new Error("variant statement");
  const values = Array.isArray(record["values"])
    ? record["values"].flatMap((item): VariantValue[] => {
        if (typeof item !== "object" || item === null) return [];
        const entry = item as Record<string, unknown>;
        if (typeof entry["name"] !== "string" || typeof entry["value"] !== "number") return [];
        return [{ name: entry["name"], value: entry["value"], unit: optionalString(entry["unit"]) }];
      })
    : [];
  return {
    kind,
    statement: record["statement"],
    values,
    unit: optionalString(record["unit"]) ?? "",
    hint: optionalString(record["hint"]) ?? "",
    variable: optionalString(record["variable"]),
    left: optionalString(record["left"]),
    right: optionalString(record["right"]),
    nonZero: typeof record["nonZero"] === "boolean" ? record["nonZero"] : null,
    example: optionalString(record["example"]),
  };
}

const replaceWord = (text: string, word: string, replacement: string) =>
  text.replace(new RegExp(`\\b${word}\\b`, "g"), replacement);

export const Variant = {
  /**
   * The statement as the student reads it: the app writes the numbers and the equation into the placeholders, so
   * they are exactly the ones it checks against. Null when a value the formula needs, or the equation, is missing.
   */
  text(variant: ProblemVariant, formula: Expression | null): string | null {
    let text = variant.statement;
    if (variant.kind === "number") {
      for (const value of variant.values) {
        const shown = Variant.format(value.value) + (value.unit ? " " + value.unit : "");
        text = text.replaceAll(`{${value.name}}`, shown);
      }
      const needed = [...(formula ? variables(formula) : [])].filter((name) => !constants.has(name));
      if (!needed.every((name) => variant.statement.includes(`{${name}}`))) return null;
    } else {
      if (variant.left === null || variant.right === null || !variant.statement.includes("{equation}")) return null;
      text = text.replaceAll("{equation}", Variant.pretty(variant.left) + " = " + Variant.pretty(variant.right));
    }
    // The model's ASCII names, as the exam writes them.
    for (const [ascii, symbol] of [
      ["eps0", "ε₀"],
      ["mu0", "μ₀"],
      ["sigma", "σ"],
      ["lambda", "λ"],
      ["rho", "ρ"],
      ["omega", "ω"],
      ["theta", "θ"],
    ] as const) {
      text = replaceWord(text, ascii, symbol);
    }
    // A placeholder left over has no value: don't show it half filled.
    return text.includes("{") ? null : text;
  },

  /** ASCII maths as a student writes it: y2 → y″, exp(t) → e^(t), 4*y → 4y. */
  pretty(ascii: string): string {
    let text = ascii;
    for (const [name, primes] of [
      ["y4", "y⁗"],
      ["y3", "y‴"],
      ["y2", "y″"],
      ["y1", "y′"],
    ] as const) {
      text = replaceWord(text, name, primes);
    }
    text = text.replaceAll("exp(", "e^(");
    text = text.replace(/(\d)\s*\*\s*(?=[A-Za-z(])/g, "$1");
    return text.replaceAll("*", "·").replaceAll("-", "−");
  },

  /** The answer, from the original formula with these values; null when they don't cover it or it is undefined there. */
  answer(variant: ProblemVariant, formula: Expression): number | null {
    const given: Record<string, number> = {};
    for (const value of variant.values) if (!(value.name in given)) given[value.name] = value.value;
    if (![...variables(formula)].every((name) => name in given)) return null;
    try {
      const result = evaluate(formula, given);
      return Number.isFinite(result) ? result : null;
    } catch {
      return null;
    }
  },

  /** Whether `candidate` solves the variant's differential equation; null when it can't be told. */
  solves(variant: ProblemVariant, candidate: Expression, random: () => number = Math.random): boolean | null {
    if (variant.kind !== "function" || variant.variable === null || variant.left === null || variant.right === null)
      return null;
    return DifferentialEquation.solves(
      { variable: variant.variable, left: variant.left, right: variant.right, nonZero: variant.nonZero },
      candidate,
      random,
    );
  },

  /** A typed number agrees within 2% (rounding, g = 9.8 or 9.81). */
  agrees(typed: number, expected: number): boolean {
    if (expected === 0) return Math.abs(typed) < 1e-9;
    return Math.abs(typed - expected) <= 0.02 * Math.abs(expected);
  },

  /** 3.5 × 10⁻⁶ for a very small or large value (3 significant digits), else up to 4 significant digits. */
  format(value: number): string {
    const magnitude = Math.abs(value);
    if (magnitude !== 0 && (magnitude < 1e-3 || magnitude >= 1e5)) {
      const exponent = Math.floor(Math.log10(magnitude));
      const mantissa = significant(value / 10 ** exponent, 3);
      const digits = "⁰¹²³⁴⁵⁶⁷⁸⁹";
      const raised = Array.from(String(exponent), (character) =>
        character === "-" ? "⁻" : digits[Number(character)]!,
      ).join("");
      return `${mantissa} × 10${raised}`;
    }
    return significant(value, 4);
  },
};

/** `String(format: "%.Ng")`: N significant digits, trailing zeros dropped. */
function significant(value: number, digits: number): string {
  if (value === 0) return "0";
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  if (exponent < -4 || exponent >= digits) {
    const [mantissa, power] = value.toExponential(digits - 1).split("e");
    const trimmed = mantissa!.includes(".") ? mantissa!.replace(/\.?0+$/, "") : mantissa!;
    const sign = power!.startsWith("-") ? "-" : "+";
    const magnitude = power!.replace(/^[+-]/, "").padStart(2, "0");
    return `${trimmed}e${sign}${magnitude}`;
  }
  const fixed = value.toFixed(Math.max(0, digits - 1 - exponent));
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

/**
 * A differential equation in y, y1 = y′ … y4 and its variable. An answer is right when it satisfies it, tested
 * numerically at several points, so "a particular solution" accepts every correct one, and a general solution's
 * constants can take any value.
 */
export const DifferentialEquation = {
  solves(
    equation: { variable: string; left: string; right: string; nonZero: boolean | null },
    candidate: Expression,
    random: () => number = Math.random,
  ): boolean | null {
    const residual = tryParseExpression(`(${equation.left}) - (${equation.right})`);
    if (!residual) return null;
    const others = [...variables(candidate)].filter((name) => name !== equation.variable);
    let compared = 0;
    let isZero = true;
    for (let round = 0; round < 12; round += 1) {
      const values: Record<string, number> = {};
      for (const name of others) values[name] = 0.5 + random() * 1.5;
      const t = 0.2 + random() * 1.8;
      const h = 2e-3;
      const y = (x: number) => {
        values[equation.variable] = x;
        try {
          return evaluate(candidate, values);
        } catch {
          return Number.NaN;
        }
      };
      const [m2, m1, c, p1, p2] = [y(t - 2 * h), y(t - h), y(t), y(t + h), y(t + 2 * h)];
      // Central differences: y, y′, y″, y‴, y⁗.
      const derivatives = [
        c,
        (p1 - m1) / (2 * h),
        (p1 - 2 * c + m1) / (h * h),
        (p2 - 2 * p1 + 2 * m1 - m2) / (2 * h * h * h),
        (p2 - 4 * p1 + 6 * c - 4 * m1 + m2) / (h * h * h * h),
      ];
      if (!derivatives.every(Number.isFinite)) continue;
      values[equation.variable] = t;
      derivatives.forEach((value, order) => (values[order === 0 ? "y" : `y${order}`] = value));
      let result: number;
      try {
        result = evaluate(residual, values);
      } catch {
        continue;
      }
      if (!Number.isFinite(result)) continue;
      compared += 1;
      if (Math.abs(c) > 1e-9) isZero = false;
      const scale = Math.max(1, ...derivatives.map(Math.abs));
      if (Math.abs(result) > 1e-3 * scale) return false;
    }
    if (compared === 0) return null;
    return equation.nonZero === true ? !isZero : true;
  },
};

export const VariantPrompt = {
  system: (language: string) => swiftText("ProblemVariant", "system#0", { language }),
  user(groupText: string, label: string, asks: string, formula: string, avoiding: readonly string[]): string {
    let text = swiftText("ProblemVariant", "text#17", { groupText, label, asks, formula });
    if (avoiding.length > 0) {
      text +=
        swiftText("ProblemVariant", "text#18") +
        avoiding
          .map((earlier) => swiftText("ProblemVariant", "text#19") + earlier)
          .join(swiftText("ProblemVariant", "text#20"));
    }
    return text;
  },
  schema: swiftSchema("VariantPrompt.schema"),
};

/** `Expression(rightSide)` for a typed function ("y = …" or just the right-hand side). */
export function typedFunction(typed: string): Expression | null {
  const pieces = typed.split("=");
  return tryParseExpression(pieces[pieces.length - 1] ?? typed);
}

/** A typed number: commas as points, "×10^" and "x10^" as exponents. */
export function typedNumber(typed: string): number | null {
  const cleaned = typed.replaceAll(",", ".").replaceAll("×10^", "e").replaceAll("x10^", "e");
  try {
    const value = evaluate(parseExpression(cleaned), {});
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
