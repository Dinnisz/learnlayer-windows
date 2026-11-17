// The C formats Swift's `String(format:)` uses for numbers in figures: `%g`, `%.Ng`, `%.Nf` and `%.Ne`, written the
// way the Mac writes them, so labels and cache keys read the same on both.
//
// C rounds the exact binary value to the nearest decimal, and a value exactly halfway (1086.5, 2.5, 0.125) to the even
// digit; JavaScript's `toFixed` and `toExponential` take the larger one. So 1086.5 with four significant digits is
// "1086" on the Mac, and the ties are settled here the C way.

/** The digits after `kept` places of an exact expansion: "5" then only zeros means the value is exactly halfway. */
const isTie = (fraction: string, kept: number) => /^50*$/.test(fraction.slice(kept));

/** `value.toFixed(digits)`, with an exact tie rounded to the even digit. */
function fixed(value: number, digits: number): string {
  const rounded = value.toFixed(digits);
  if (Math.abs(value) >= 1e21) return rounded;
  // `toFixed` is exact up to 100 places, and a double that is a tie has a short expansion.
  const exact = Math.abs(value).toFixed(Math.min(100, digits + 40));
  const [whole = "", fraction = ""] = exact.split(".");
  if (!isTie(fraction, digits)) return rounded;
  const truncated = digits === 0 ? whole : `${whole}.${fraction.slice(0, digits)}`;
  if (Number(truncated.at(-1)) % 2 !== 0) return rounded;
  return (value < 0 || Object.is(value, -0) ? "-" : "") + truncated;
}

/** `value.toExponential(digits)`, with an exact tie rounded to the even digit. */
function exponential(value: number, digits: number): string {
  const rounded = value.toExponential(digits);
  const [mantissa = "", power = ""] = Math.abs(value)
    .toExponential(Math.min(100, digits + 40))
    .split("e");
  const [lead = "", fraction = ""] = mantissa.split(".");
  if (!isTie(fraction, digits)) return rounded;
  const truncated = digits === 0 ? lead : `${lead}.${fraction.slice(0, digits)}`;
  if (Number(truncated.at(-1)) % 2 !== 0) return rounded;
  return (value < 0 ? "-" : "") + `${truncated}e${power}`;
}

/** `%.Ne`: one digit, the point, N digits, then e±XX (at least two exponent digits). */
export function formatE(value: number, digits = 6): string {
  if (!Number.isFinite(value)) return nonFinite(value);
  const [mantissa, exponent] = exponential(value, digits).split("e");
  const power = Number(exponent);
  const sign = power < 0 ? "-" : "+";
  return `${mantissa}e${sign}${String(Math.abs(power)).padStart(2, "0")}`;
}

/** `%.Nf`. */
export function formatF(value: number, digits = 6): string {
  if (!Number.isFinite(value)) return nonFinite(value);
  // `toFixed` writes "-0.00" as C does; keep it.
  return fixed(value, digits);
}

/** `%.Ng`: N significant digits, fixed or exponential as C chooses, trailing zeros dropped. */
export function formatG(value: number, precision = 6): string {
  if (!Number.isFinite(value)) return nonFinite(value);
  const p = precision === 0 ? 1 : precision;
  if (value === 0) return Object.is(value, -0) ? "-0" : "0";
  // The exponent C uses to choose: that of the value rounded to p significant digits.
  const exponent = Number(exponential(value, p - 1).split("e")[1]);
  if (exponent < -4 || exponent >= p) {
    const [mantissa, power] = formatE(value, p - 1).split("e");
    return `${trimZeros(mantissa!)}e${power}`;
  }
  return trimZeros(fixed(value, Math.max(0, p - 1 - exponent)));
}

function trimZeros(text: string): string {
  if (!text.includes(".")) return text;
  return text.replace(/0+$/, "").replace(/\.$/, "");
}

function nonFinite(value: number): string {
  if (Number.isNaN(value)) return "nan";
  return value > 0 ? "inf" : "-inf";
}
