// Port of LearnLayer/Explanation/Expression.swift @ ref 2026-11-04

/**
 * A small maths expression the app evaluates itself, so curves, dragging and
 * checks need no model call. Supports + − * / ^, parentheses, implicit
 * multiplication (2x, 3(x+1)), the constants pi and e, and the functions
 * sin cos tan asin acos atan sinh cosh tanh exp ln log sqrt abs sign floor.
 */
export type Expression =
  | { kind: "number"; value: number }
  | { kind: "variable"; name: string }
  | { kind: "unary"; op: "-" | "+"; operand: Expression }
  | { kind: "binary"; op: "+" | "-" | "*" | "/" | "^"; left: Expression; right: Expression }
  | { kind: "function"; name: string; argument: Expression };

export class ExpressionParseError extends Error {
  constructor(description: string) {
    super(description);
    this.name = "ExpressionParseError";
  }
}

export const functionNames: ReadonlySet<string> = new Set([
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "sinh",
  "cosh",
  "tanh",
  "exp",
  "ln",
  "log",
  "sqrt",
  "abs",
  "sign",
  "sgn",
  "floor",
]);

/** Longest first, so "sinh" is tried before "sin". */
const functionNamesByLength = [...functionNames].sort((a, b) => b.length - a.length);

const subscripts = "₀₁₂₃₄₅₆₇₈₉";
const isLetter = (character: string | undefined) => character !== undefined && /\p{L}/u.test(character);
const isNumber = (character: string | undefined) => character !== undefined && /\p{N}/u.test(character);
const isSubscript = (character: string | undefined) => character !== undefined && subscripts.includes(character);
const isSpace = (character: string | undefined) => character !== undefined && /\s/u.test(character);

/** x₀ → x0, so names match whether written with subscripts or digits. */
export function asciiSubscripts(text: string): string {
  return Array.from(text, (character) => {
    const index = subscripts.indexOf(character);
    return index < 0 ? character : String(index);
  }).join("");
}

/**
 * `singleLetterNames` reads written maths (at² is a·t², mgh is m·g·h), as
 * in a solved line; otherwise whole words are names (eps0, sigma, phi), as
 * in the expressions the model writes for the app.
 */
export function parseExpression(text: string, singleLetterNames = false): Expression {
  return new Parser(text, singleLetterNames).parse();
}

/** The parsed expression, or null when the text can't be read (`try? Expression(text)`). */
export function tryParseExpression(text: string, singleLetterNames = false): Expression | null {
  try {
    return parseExpression(text, singleLetterNames);
  } catch {
    return null;
  }
}

/** Names that need a value: every identifier that isn't a function or constant. */
export function variables(expression: Expression): Set<string> {
  switch (expression.kind) {
    case "number":
      return new Set();
    case "variable":
      return ["pi", "π", "e"].includes(expression.name) ? new Set() : new Set([expression.name]);
    case "unary":
      return variables(expression.operand);
    case "binary":
      return new Set([...variables(expression.left), ...variables(expression.right)]);
    case "function":
      return variables(expression.argument);
  }
}

/** The value with the given variables; NaN when a variable is missing or the maths is undefined there. */
export function evaluate(expression: Expression, values: Readonly<Record<string, number>>): number {
  switch (expression.kind) {
    case "number":
      return expression.value;
    case "variable":
      switch (expression.name) {
        case "pi":
        case "π":
          return Math.PI;
        case "e":
          return values["e"] ?? Math.E;
        default:
          return values[expression.name] ?? Number.NaN;
      }
    case "unary": {
      const value = evaluate(expression.operand, values);
      return expression.op === "-" ? -value : value;
    }
    case "binary": {
      const a = evaluate(expression.left, values);
      const b = evaluate(expression.right, values);
      switch (expression.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "^":
          return Math.pow(a, b);
      }
      return Number.NaN;
    }
    case "function": {
      const x = evaluate(expression.argument, values);
      switch (expression.name) {
        case "sin":
          return Math.sin(x);
        case "cos":
          return Math.cos(x);
        case "tan":
          return Math.tan(x);
        case "asin":
          return Math.asin(x);
        case "acos":
          return Math.acos(x);
        case "atan":
          return Math.atan(x);
        case "sinh":
          return Math.sinh(x);
        case "cosh":
          return Math.cosh(x);
        case "tanh":
          return Math.tanh(x);
        case "exp":
          return Math.exp(x);
        case "ln":
          return Math.log(x);
        case "log":
          return Math.log10(x);
        case "sqrt":
          return Math.sqrt(x);
        case "abs":
          return Math.abs(x);
        case "sign":
        case "sgn":
          return x > 0 ? 1 : x < 0 ? -1 : 0;
        case "floor":
          return Math.floor(x);
        default:
          return Number.NaN;
      }
    }
  }
}

class Parser {
  private readonly characters: string[];
  private readonly singleLetterNames: boolean;
  private index = 0;

  constructor(text: string, singleLetterNames: boolean) {
    this.singleLetterNames = singleLetterNames;
    // Accept the Unicode the PDF or the model may use.
    const normalised = text
      .replaceAll("−", "-")
      .replaceAll("·", "*")
      .replaceAll("×", "*")
      .replaceAll("√", "sqrt")
      .replaceAll("²", "^2")
      .replaceAll("³", "^3")
      .replaceAll("**", "^");
    this.characters = Array.from(asciiSubscripts(normalised));
  }

  parse(): Expression {
    const expression = this.parseSum();
    this.skipSpaces();
    if (this.index !== this.characters.length) {
      throw new ExpressionParseError(`Unexpected “${this.characters[this.index]}”`);
    }
    return expression;
  }

  private parseSum(): Expression {
    let result = this.parseProduct();
    for (;;) {
      const op = this.peek();
      if (op !== "+" && op !== "-") return result;
      this.index += 1;
      result = { kind: "binary", op, left: result, right: this.parseProduct() };
    }
  }

  private parseProduct(): Expression {
    let result = this.parseUnary();
    for (;;) {
      const next = this.peek();
      if (next === "*" || next === "/") {
        this.index += 1;
        result = { kind: "binary", op: next, left: result, right: this.parseUnary() };
      } else if (next !== undefined && (next === "(" || isLetter(next) || isNumber(next) || next === ".")) {
        // Implicit multiplication: 2x, 3(x + 1), a sin(x).
        result = { kind: "binary", op: "*", left: result, right: this.parsePower() };
      } else {
        return result;
      }
    }
  }

  private parseUnary(): Expression {
    const op = this.peek();
    if (op === "-" || op === "+") {
      this.index += 1;
      return { kind: "unary", op, operand: this.parseUnary() };
    }
    return this.parsePower();
  }

  private parsePower(): Expression {
    const base = this.parseAtom();
    if (this.peek() === "^") {
      this.index += 1;
      // Right-associative, and allows a sign: x^-1.
      return { kind: "binary", op: "^", left: base, right: this.parseUnary() };
    }
    return base;
  }

  private parseAtom(): Expression {
    const next = this.peek();
    if (next === undefined) throw new ExpressionParseError("Expression ends too early");
    if (next === "(") {
      this.index += 1;
      const inner = this.parseSum();
      if (this.peek() !== ")") throw new ExpressionParseError("Missing “)”");
      this.index += 1;
      return inner;
    }
    if (isNumber(next) || next === ".") return { kind: "number", value: this.parseNumber() };
    if (isLetter(next) || next === "_") {
      const name = this.parseName();
      if (functionNames.has(name)) {
        const argument = this.peek() === "(" ? this.parseAtom() : this.parsePower();
        return { kind: "function", name, argument };
      }
      return { kind: "variable", name };
    }
    throw new ExpressionParseError(`Unexpected “${next}”`);
  }

  private parseNumber(): number {
    const { characters } = this;
    const start = this.index;
    while (this.index < characters.length && (isNumber(characters[this.index]) || characters[this.index] === ".")) {
      this.index += 1;
    }
    // Scientific notation: 1e-3, but not the constant e on its own.
    const mark = characters[this.index];
    const after = characters[this.index + 1];
    if (
      this.index + 1 < characters.length &&
      (mark === "e" || mark === "E") &&
      (isNumber(after) ||
        ((after === "-" || after === "+") &&
          this.index + 2 < characters.length &&
          isNumber(characters[this.index + 2])))
    ) {
      this.index += 2;
      while (this.index < characters.length && isNumber(characters[this.index])) this.index += 1;
    }
    const text = characters.slice(start, this.index).join("");
    const value = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text) ? Number(text) : Number.NaN;
    if (Number.isNaN(value)) throw new ExpressionParseError("Bad number");
    return value;
  }

  /**
   * A function name, or a variable: one letter plus optional digits,
   * subscripts or an underscore part (x0, v₀, t_1). Function names are
   * matched first so "sinx" reads as sin(x).
   */
  private parseName(): string {
    const { characters } = this;
    const startsWith = (at: number, name: string) => characters.slice(at, at + name.length).join("") === name;
    for (const name of functionNamesByLength) {
      if (!startsWith(this.index, name)) continue;
      const after = this.index + name.length;
      const following = characters[after];
      if (after >= characters.length || !(isLetter(following) && !isSubscript(following)) || name.length > 2) {
        this.index = after;
        return name;
      }
    }
    if (startsWith(this.index, "pi")) {
      this.index += 2;
      return "pi";
    }
    // Whole words are one name (phi, omega, dx, v0, t_1): the model
    // writes multiplication explicitly. A single letter followed by a
    // function name (xsin) still splits.
    // After a subscript or digit, a letter starts a new name: v0t is v0·t.
    let name = characters[this.index]!;
    this.index += 1;
    let sawDigit = false;
    while (this.index < characters.length) {
      const character = characters[this.index]!;
      if (!(isLetter(character) || isNumber(character) || isSubscript(character) || character === "_")) break;
      if (
        isLetter(character) &&
        (this.singleLetterNames ||
          sawDigit ||
          functionNamesByLength.some((candidate) => startsWith(this.index, candidate)))
      ) {
        break;
      }
      if (isNumber(character) || isSubscript(character)) sawDigit = true;
      name += character;
      this.index += 1;
    }
    return name;
  }

  private skipSpaces() {
    while (this.index < this.characters.length && isSpace(this.characters[this.index])) this.index += 1;
  }

  private peek(): string | undefined {
    this.skipSpaces();
    return this.characters[this.index];
  }
}
