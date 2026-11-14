// Port of LearnLayer/Explanation/Verifier.swift @ ref 2026-11-04
// (`Check` and `SolvingLine` are the ones of Explanation/ExplanationScript.swift.)

import { evaluate, tryParseExpression, variables, type Expression } from "./expression";

/** A claim the model made, in ASCII, for the app to test numerically before showing anything. */
export interface Check {
  kind: "equal" | "derivative" | "integral" | "limit" | "jump";
  left: string;
  right: string;
  /** For derivative and integral: the variable. */
  variable?: string | null;
  /** For integral: the bounds, as expressions. */
  from?: string | null;
  to?: string | null;
  /** Which values to try: "any" includes negatives (below a plane, σ < 0). */
  domain?: "positive" | "any" | null;
}

export interface SolvingLine {
  /** The equation at this point, in Unicode ("2x = 4"). */
  line: string;
  /** What was done to get here ("Subtract 3 from both sides"); empty for the first line. */
  move: string;
}

/** `unreadable`: the check could not be evaluated (unreadable or undefined everywhere). */
export type Outcome = "passed" | "unreadable" | "failed";

/** Uniform in [low, high]; replaceable in tests. */
export type Random = (low: number, high: number) => number;
const uniform: Random = (low, high) => low + Math.random() * (high - low);

const union = (...sets: Set<string>[]) => new Set(sets.flatMap((set) => [...set]));
const sameNames = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((name) => b.has(name));

/**
 * Checks the model's maths numerically before it is shown: each claim is
 * evaluated at several random points. A wrong sign or a bad derivative shows
 * up as a mismatch; nothing is solved symbolically.
 */
export const Verifier = {
  outcomes(checks: readonly Check[] | null | undefined, random: Random = uniform): Outcome[] {
    return (checks ?? []).map((check) => Verifier.outcome(check, random));
  },

  /** True when no check failed; unreadable checks don't count against it. */
  passes(
    script: { checks?: readonly Check[] | null; solving?: readonly SolvingLine[] | null },
    random: Random = uniform,
  ): boolean {
    return (
      !Verifier.outcomes(script.checks, random).includes("failed") &&
      Verifier.solvingOutcome(script.solving ?? [], random) !== "failed"
    );
  },

  /**
   * Puts the final "x = value" back into the first line and checks both
   * sides agree, at random values of any other names.
   */
  solvingOutcome(lines: readonly SolvingLine[], random: Random = uniform): Outcome {
    if (lines.length < 2) return "unreadable";
    const first = sides(lines[0]!.line);
    const last = sides(lines[lines.length - 1]!.line);
    if (!first || !last || last.left.kind !== "variable") return "unreadable";
    const unknown = last.left.name;
    let compared = 0;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const values: Record<string, number> = {};
      for (const name of union(variables(first.left), variables(first.right), variables(last.right))) {
        if (name !== unknown) values[name] = random(0.3, 2.7);
      }
      const solution = evaluate(last.right, values);
      if (!Number.isFinite(solution)) continue;
      values[unknown] = solution;
      const left = evaluate(first.left, values);
      const right = evaluate(first.right, values);
      if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
      compared += 1;
      if (Math.abs(left - right) > 1e-6 * Math.max(1, Math.abs(left), Math.abs(right))) return "failed";
    }
    return compared > 0 ? "passed" : "unreadable";
  },

  outcome(check: Check, random: Random = uniform): Outcome {
    const left = tryParseExpression(check.left);
    const right = tryParseExpression(check.right);
    if (!left || !right) return "unreadable";
    // An equality whose sides use different names ("F" == "m*a",
    // "(y-b)/m" == "x") restates the equation rather than stating an
    // identity; random values can't test it, so it neither passes nor fails.
    const relatesDifferentNames = !sameNames(variables(left), variables(right));
    // A definite integral's value can't depend on its own variable.
    if (check.kind === "integral" && check.variable && variables(right).has(check.variable)) return "unreadable";
    let compared = 0;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const values: Record<string, number> = {};
      // Moderate values keep ln, √ and divisions defined; "any" also
      // tries negatives, where sign and |z| mistakes show up.
      for (const name of union(variables(left), variables(right))) {
        const magnitude = random(0.3, 2.7);
        values[name] = check.domain === "any" && random(0, 1) < 0.5 ? -magnitude : magnitude;
      }
      let expected: number;
      let actual: number;
      switch (check.kind) {
        case "equal":
          expected = evaluate(left, values);
          actual = evaluate(right, values);
          break;
        case "derivative": {
          const x = check.variable ? values[check.variable] : undefined;
          if (!check.variable || x === undefined) return "unreadable";
          const h = 1e-5 * Math.max(1, Math.abs(x));
          expected =
            (evaluate(left, { ...values, [check.variable]: x + h }) -
              evaluate(left, { ...values, [check.variable]: x - h })) /
            (2 * h);
          actual = evaluate(right, values);
          break;
        }
        case "limit": {
          // Compare far out, as a ratio, at two growing distances.
          if (!check.variable) return "unreadable";
          const direction = check.domain === "any" && (values[check.variable] ?? 1) < 0 ? -1 : 1;
          const far = { ...values, [check.variable]: 1e4 * direction };
          const a = evaluate(left, far);
          const b = evaluate(right, far);
          if (!Number.isFinite(a) || !Number.isFinite(b) || !(Math.abs(b) > 1e-300)) continue;
          compared += 1;
          if (Math.abs(a / b - 1) > 1e-2) return "failed";
          continue;
        }
        case "jump": {
          if (!check.variable) return "unreadable";
          expected =
            evaluate(left, { ...values, [check.variable]: 1e-7 }) -
            evaluate(left, { ...values, [check.variable]: -1e-7 });
          actual = evaluate(right, values);
          break;
        }
        case "integral": {
          const from = check.from ? tryParseExpression(check.from) : null;
          const to = check.to ? tryParseExpression(check.to) : null;
          if (!check.variable || !from || !to) return "unreadable";
          expected = simpson(left, check.variable, evaluate(from, values), evaluate(to, values), values);
          actual = evaluate(right, values);
          break;
        }
      }
      if (!Number.isFinite(expected) || !Number.isFinite(actual)) continue;
      compared += 1;
      const tolerance = 1e-4 * Math.max(1, Math.abs(expected), Math.abs(actual));
      if (Math.abs(expected - actual) > tolerance) {
        return check.kind === "equal" && relatesDifferentNames ? "unreadable" : "failed";
      }
    }
    return compared > 0 ? "passed" : "unreadable";
  },
};

function sides(line: string): { left: Expression; right: Expression } | null {
  // "x(t) = …" names a function of t; for checking it is just x.
  const plain = line.replaceAll("½", "(1/2)").replace(/\b([A-Za-z])\(([A-Za-z])\)\s*=/g, "$1 =");
  const parts = plain.split("=");
  if (parts.length !== 2) return null;
  const left = tryParseExpression(parts[0]!, true);
  const right = tryParseExpression(parts[1]!, true);
  return left && right ? { left, right } : null;
}

function simpson(
  f: Expression,
  variable: string,
  a: number,
  b: number,
  values: Readonly<Record<string, number>>,
): number {
  const n = 400;
  const h = (b - a) / n;
  const y = (x: number) => evaluate(f, { ...values, [variable]: x });
  let sum = y(a) + y(b);
  for (let i = 1; i < n; i += 1) sum += (i % 2 === 0 ? 2 : 4) * y(a + i * h);
  return (sum * h) / 3;
}
