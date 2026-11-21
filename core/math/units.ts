// Units as exams write them, for answers typed with one (`typedAnswer.ts`) and drawn upright (`uprightUnits`).

/** Base units and the few non-SI ones exams use. A prefix (k, c, m, µ…) may come before most of them. */
const units = new Set(
  (
    "m g s N J W V A Ω ohm ohms Hz Pa K C mol L l h min rad sr T F H Wb S eV cal atm bar M u Da lx cd Bq Gy Sv dB " +
    "° º °C ºC % ‰ € km kg cm mm dm ms kJ kW kWh Wh mL ml dL cL kPa hPa MPa mA kV kΩ MΩ µs µm nm mmol kcal rpm " +
    "graus metros segundos"
  ).split(" "),
);
const prefixes = ["k", "c", "m", "µ", "μ", "u", "n", "M", "G", "d", "p", "h"];

/** «m», «kg», «µs», «kΩ», «°C»: a unit, with or without a prefix. */
export function isUnitWord(word: string): boolean {
  if (units.has(word)) return true;
  for (const prefix of prefixes) {
    if (word.length > prefix.length && word.startsWith(prefix) && units.has(word.slice(prefix.length))) return true;
  }
  return false;
}

const power = String.raw`(?:\^\{?-?\d+\}?|\^\\circ)?`;
const word = String.raw`(?:\\Omega|\\mu[A-Za-z]*|\\%|[A-Za-zΩµ°%]+)`;
const joiner = String.raw`(?:\s*(?:/|\\cdot|\\,|·)\s*|\s+)`;
const space = String.raw`(?:\\[,;: ]|~|\s)+`;
const unitAfterNumber = new RegExp(
  String.raw`(\d\}?)(${space})(${word}${power}(?:${joiner}${word}${power})*)(?![A-Za-z{(])`,
  "g",
);

/**
 * A unit after a number in LaTeX, set upright as SI writes it: «9 J» → «9 \mathrm{J}», «3\,m/s^2» →
 * «3\,\mathrm{m}/\mathrm{s}^2». Only a run whose every word is a unit is changed, so «2 x» or «3 g t» stay as they are
 * (Mac report P5: «9 *J*» in italics).
 */
export function uprightUnits(latex: string): string {
  return latex.replace(unitAfterNumber, (whole, number: string, gap: string, tail: string) => {
    const words = tail.match(/\\[A-Za-z]+|[A-Za-zΩµ°%]+/g) ?? [];
    const spelled = words.map((found) => found.replace(/^\\Omega$/, "Ω").replace(/^\\mu/, "µ"));
    if (
      spelled.length === 0 ||
      !spelled.every((found) => found === "\\circ" || found === "\\cdot" || isUnitWord(found))
    )
      return whole;
    const upright = tail.replace(/(\\[A-Za-z]+)|([A-Za-zΩµ°]+)/g, (letters: string, command?: string) => {
      if (!command) return `\\mathrm{${letters}}`;
      if (command === "\\Omega") return String.raw`\mathrm{\Omega}`;
      if (command.startsWith("\\mu")) return String.raw`\mathrm{\mu ${command.slice(3)}}`.replace(" }", "}");
      return command;
    });
    return number + gap + upright;
  });
}
