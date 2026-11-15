// The C formats Swift's `String(format:)` uses for numbers in figures: `%g`, `%.Ng`, `%.Nf` and `%.Ne`, written the
// way the Mac writes them, so labels and cache keys read the same on both.

/** `%.Ne`: one digit, the point, N digits, then e±XX (at least two exponent digits). */
export function formatE(value: number, digits = 6): string {
  if (!Number.isFinite(value)) return nonFinite(value);
  const [mantissa, exponent] = value.toExponential(digits).split("e");
  const power = Number(exponent);
  const sign = power < 0 ? "-" : "+";
  return `${mantissa}e${sign}${String(Math.abs(power)).padStart(2, "0")}`;
}

/** `%.Nf`. */
export function formatF(value: number, digits = 6): string {
  if (!Number.isFinite(value)) return nonFinite(value);
  const text = value.toFixed(digits);
  // `toFixed` writes "-0.00" as C does; keep it.
  return text;
}

/** `%.Ng`: N significant digits, fixed or exponential as C chooses, trailing zeros dropped. */
export function formatG(value: number, precision = 6): string {
  if (!Number.isFinite(value)) return nonFinite(value);
  const p = precision === 0 ? 1 : precision;
  if (value === 0) return Object.is(value, -0) ? "-0" : "0";
  // The exponent C uses to choose: that of the value rounded to p significant digits.
  const exponent = Number(value.toExponential(p - 1).split("e")[1]);
  if (exponent < -4 || exponent >= p) {
    const [mantissa, power] = formatE(value, p - 1).split("e");
    return `${trimZeros(mantissa!)}e${power}`;
  }
  return trimZeros(value.toFixed(Math.max(0, p - 1 - exponent)));
}

function trimZeros(text: string): string {
  if (!text.includes(".")) return text;
  return text.replace(/0+$/, "").replace(/\.$/, "");
}

function nonFinite(value: number): string {
  if (Number.isNaN(value)) return "nan";
  return value > 0 ? "inf" : "-inf";
}
