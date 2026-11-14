// Port of LearnLayer/Problems/SignTable.swift @ ref 2026-11-04

import { evaluate, tryParseExpression, variables } from "../math/expression";

export interface SignTablePoint {
  /** As printed: "−∞", "0", "√2". */
  text: string;
  /** Its number; null for an infinite end. */
  value?: number | null;
}

export interface SignTableRow {
  name: string;
  /** The row's function in ASCII in `variable` ("exp(3-x)*x - x"), to check its signs. */
  expression?: string | null;
  cells: string[];
}

/**
 * A sign or variation table, exam style: the x row with the critical points
 * (ends included), a row of signs for each factor or derivative, and the
 * function's variation. The solver fills it; the app checks every sign by
 * evaluating the row's own expression before showing it.
 */
export interface SignTable {
  /** The variable, "x". */
  variable: string;
  /** The columns' values in order, ends included: "−∞", "0", "3". */
  points: SignTablePoint[];
  /**
   * Sign rows ("f'(x)", or each factor). `cells` alternate point, interval,
   * point…: 2 × points − 1 of them; "+", "−", "0", "n.d." or "".
   */
  rows: SignTableRow[];
  /** The function's row: "↗" or "↘" in the intervals, its values (exact text, "4 − e³") at the points. */
  variation?: SignTableRow | null;
}

/**
 * Continuity at a point: the two branches near it, with the lateral limits
 * as open dots and the value as a closed one, drawn from the solution.
 */
export interface Continuity {
  /** The point, as a number and as printed ("3"). */
  point: number;
  pointText?: string | null;
  /** The branches in ASCII in x, left of the point and right of it. */
  left: string;
  right: string;
  /** f(point), when the function is defined there. */
  value?: number | null;
  /** Which branch holds the point: "left", "right" or null. */
  closedSide?: string | null;
}

const isBlank = (cell: string | undefined) => (cell ?? "").trim() === "";

export function columnCount(table: SignTable): number {
  return Math.max(0, 2 * table.points.length - 1);
}

/** The number at column `index` of the points: −∞ or +∞ for an open end. */
function valueAt(table: SignTable, index: number): number {
  const value = table.points[index]?.value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return index === 0 ? -Infinity : Infinity;
}

/** A point well inside ]a, b[, which may be infinite at either end. */
export function testPoint(a: number, b: number): number {
  const finiteA = Number.isFinite(a);
  const finiteB = Number.isFinite(b);
  if (finiteA && finiteB) return (a + b) / 2;
  if (!finiteA && finiteB) return b - Math.max(1, Math.abs(b));
  if (finiteA && !finiteB) return a + Math.max(1, Math.abs(a));
  return 0;
}

/** +1, −1, 0, or null for a cell that isn't a sign. */
export function signOf(cell: string): 1 | -1 | 0 | null {
  const trimmed = cell.trim();
  if (trimmed === "+") return 1;
  if (trimmed === "−" || trimmed === "-" || trimmed === "–") return -1;
  if (trimmed === "0") return 0;
  return null;
}

export function isUndefinedCell(cell: string): boolean {
  const compact = cell.toLowerCase().replaceAll(" ", "");
  return ["n.d.", "nd", "n.d", "s.s.", "∄"].includes(compact);
}

/**
 * Every sign it can check, checked: an empty list when the table holds.
 * A row without an expression is checked only for its shape.
 */
export function signTableProblems(table: SignTable): string[] {
  const problems: string[] = [];
  const { points, rows, variable } = table;
  const variation = table.variation ?? null;
  const columns = columnCount(table);
  if (points.length < 2) return ["fewer than two points"];
  for (let index = 1; index < points.length; index += 1) {
    if (!(valueAt(table, index) > valueAt(table, index - 1))) {
      problems.push(`points out of order at ${points[index]!.text}`);
    }
  }
  for (const row of [...rows, ...(variation ? [variation] : [])]) {
    if (row.cells.length !== columns) problems.push(`${row.name}: ${row.cells.length} cells for ${columns} columns`);
  }
  if (problems.length > 0) return problems;

  for (const row of rows) {
    const expression = row.expression ? tryParseExpression(row.expression) : null;
    if (!expression || ![...variables(expression)].every((name) => name === variable)) continue;
    const f = (x: number) => evaluate(expression, { [variable]: x });
    row.cells.forEach((cell, column) => {
      const sign = signOf(cell);
      if (column % 2 === 0) {
        // At a point: 0, undefined, or a sign.
        const index = column / 2;
        const x = valueAt(table, index);
        if (!Number.isFinite(x) || isBlank(cell)) return;
        const y = f(x);
        const scale = Math.max(1, Math.abs(f(x - 0.1)), Math.abs(f(x + 0.1)));
        const at = `${row.name} at ${points[index]!.text}: ${y}`;
        if (sign === 0 && !(Number.isFinite(y) && Math.abs(y) <= 1e-6 * scale)) {
          problems.push(`${at}, not 0`);
        } else if (isUndefinedCell(cell) && Number.isFinite(y)) {
          problems.push(`${at}, not undefined`);
        } else if (sign !== null && sign !== 0 && !(Number.isFinite(y) && y * sign > 0)) {
          problems.push(`${at}, not ${cell}`);
        }
      } else {
        // Inside an interval: the sign at a point well inside it.
        const left = (column - 1) / 2;
        const x = testPoint(valueAt(table, left), valueAt(table, left + 1));
        const y = f(x);
        if (sign === null || sign === 0) return;
        if (!(Number.isFinite(y) && y * sign > 0)) {
          problems.push(`${row.name} on ]${points[left]!.text}, ${points[left + 1]!.text}[: ${y} at ${x}, not ${cell}`);
        }
      }
    });
  }
  // The arrows follow the derivative's row (the one named with a prime).
  const derivative = rows.find((row) => row.name.includes("'") || row.name.includes("′"));
  if (variation && derivative) {
    for (let column = 1; column < columns; column += 2) {
      const arrow = variation.cells[column] ?? "";
      const cell = derivative.cells[column] ?? "";
      const sign = signOf(cell);
      if (arrow.includes("↗") && sign !== 1) problems.push(`↗ where ${derivative.name} is ${cell}`);
      if (arrow.includes("↘") && sign !== -1) problems.push(`↘ where ${derivative.name} is ${cell}`);
    }
  }
  return problems;
}

/**
 * The table with its cells moved one column right, when the solver left
 * out the cell under an open left end ("−∞") and every sign then checks
 * out; else the table as it was.
 */
export function realigned(table: SignTable): SignTable {
  const firstValue = table.points[0]?.value;
  if (signTableProblems(table).length === 0 || (firstValue !== null && firstValue !== undefined)) return table;
  const columns = columnCount(table);
  const shifted = (row: SignTableRow): SignTableRow | null => {
    if (row.cells.length !== columns || !isBlank(row.cells[row.cells.length - 1]) || row.cells.length === 0)
      return null;
    return { ...row, cells: ["", ...row.cells.slice(0, -1)] };
  };
  const rows = table.rows.map(shifted);
  if (rows.some((row) => row === null)) return table;
  const moved: SignTable = { ...table, rows: rows as SignTableRow[] };
  if (table.variation) {
    const variation = shifted(table.variation);
    if (!variation) return table;
    moved.variation = variation;
  }
  return signTableProblems(moved).length === 0 ? moved : table;
}
