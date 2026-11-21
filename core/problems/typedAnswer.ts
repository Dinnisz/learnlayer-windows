// What a student types in «Let me try», made into an expression the app can compare.
//
// Students write answers the way the exam does: «25 m», «2,5 m/s²», «a = 4 m/s^2», «3 × 10^5 J». The expected
// answer (`answer.expression`) is the bare number or formula, so a unit read as a name (m, s, J) made a right answer
// differ (the Mac report, M3). Here a trailing unit is dropped when the expected answer has no such name, a decimal
// comma becomes a point, «×10^» an exponent and a superscript a power, and «name =» before the answer is ignored.

import { tryParseExpression, variables, type Expression } from "../math/expression";

/** Base units and the few non-SI ones exams use. A prefix (k, c, m, µ…) may come before most of them. */
const units = new Set([
  "m",
  "g",
  "s",
  "N",
  "J",
  "W",
  "V",
  "A",
  "Ω",
  "ohm",
  "ohms",
  "Hz",
  "Pa",
  "K",
  "C",
  "mol",
  "L",
  "l",
  "h",
  "min",
  "rad",
  "sr",
  "T",
  "F",
  "H",
  "Wb",
  "S",
  "eV",
  "cal",
  "atm",
  "bar",
  "M",
  "u",
  "Da",
  "lx",
  "cd",
  "Bq",
  "Gy",
  "Sv",
  "dB",
  "°",
  "º",
  "°C",
  "ºC",
  "%",
  "‰",
  "€",
  "km",
  "kg",
  "cm",
  "mm",
  "dm",
  "ms",
  "kJ",
  "kW",
  "kWh",
  "Wh",
  "mL",
  "ml",
  "dL",
  "cL",
  "kPa",
  "hPa",
  "MPa",
  "mA",
  "kV",
  "kΩ",
  "MΩ",
  "µs",
  "µm",
  "nm",
  "mmol",
  "kcal",
  "rpm",
  "graus",
  "metros",
  "segundos",
  "s⁻¹",
]);
const prefixes = ["k", "c", "m", "µ", "μ", "u", "n", "M", "G", "d", "p", "h"];

function isUnitWord(word: string): boolean {
  if (units.has(word)) return true;
  for (const prefix of prefixes) {
    if (word.length > prefix.length && word.startsWith(prefix) && units.has(word.slice(prefix.length))) return true;
  }
  return false;
}

const superscripts: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
  "⁻": "-",
};

/** Commas as points, ×/· as products, −/– as minus, superscripts as powers, «×10^» kept as a product of a power. */
export function normalizedAnswer(typed: string): string {
  let text = typed.trim().replace(/[−–]/g, "-");
  text = text.replace(/(\d),(\d)/g, "$1.$2");
  text = text.replace(/[×·⋅]/g, "*");
  text = text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (run) => `^(${Array.from(run, (c) => superscripts[c] ?? "").join("")})`);
  text = text.replace(/(\d)\s*[xX]\s*10\s*\^/g, "$1*10^");
  text = text.replace(/\.$/, "").trim();
  return text;
}

/** «a = 25», «v=3»: the side after the last «=». */
function rightSide(text: string): string {
  const pieces = text.split("=");
  return (pieces[pieces.length - 1] ?? text).trim();
}

/** The unit at the end of `text`, split off: «25 m/s^(2)» → ["25", "m/s^(2)"]; null when the tail isn't a unit. */
export function splitUnit(text: string): [string, string] | null {
  const match = /^(.*?[\d)π])\s*([^\d\s()+*.^/-][^+]*)$/u.exec(text);
  if (!match) return null;
  const [, value, tail] = match;
  const words = tail!.split(/(?:\^\(?-?\d+\)?|[\s*/^.\-]|\d)+/u).filter((word) => word.length > 0);
  if (words.length === 0 || !words.every(isUnitWord)) return null;
  return [value!.trim(), tail!.trim()];
}

/** The part's `equation` (kept as the model's JSON), when it has the fields `DifferentialEquation` needs. */
export function differentialEquation(
  value: unknown,
): { variable: string; left: string; right: string; nonZero: boolean | null } | null {
  if (typeof value !== "object" || value === null) return null;
  const { variable, left, right, nonZero } = value as Record<string, unknown>;
  if (typeof variable !== "string" || typeof left !== "string" || typeof right !== "string") return null;
  return { variable, left, right, nonZero: typeof nonZero === "boolean" ? nonZero : null };
}

/**
 * The typed answer as an expression whose names are among `allowed` (the expected answer's names), or null when it
 * can't be read. A unit is dropped only when keeping it would bring in a name the expected answer doesn't have, so
 * «25 m» against «m*g» still compares 25·m.
 */
export function typedExpression(typed: string, allowed: ReadonlySet<string>): Expression | null {
  const text = rightSide(normalizedAnswer(typed));
  if (text.length === 0) return null;
  const fits = (expression: Expression | null) =>
    expression !== null && [...variables(expression)].every((name) => allowed.has(name));
  const whole = tryParseExpression(text);
  if (fits(whole)) return whole;
  const split = splitUnit(text);
  if (split) {
    const value = tryParseExpression(split[0]);
    if (fits(value)) return value;
  }
  return whole;
}
