// Evaluates the JSON schemas the Mac app writes as Swift dictionary literals (`[String: Any]`), so the Windows
// app sends the same schemas. Reads: dictionary and array literals, strings, numbers, true/false, NSNull(),
// `as [String: Any]` casts, references to other statics (in the same type or `Type.member` in another file), and
// closures `{ let a = …; return … }()`. An expression it does not read must be listed in `overrides` by
// "Type.member/variable", with the value to use and the reason; anything else unknown is an error.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { swiftStrings } from "./swift-strings.mjs";

const QUOTE = '"';
const HASH = "#";

function swiftFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? swiftFiles(path) : name.endsWith(".swift") ? [path] : [];
  });
}

/** Splits Swift source into the tokens the evaluator needs. String literals become one token with their value. */
function tokenize(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const character = source[index];
    if (/^\s/.test(character)) {
      index += 1;
      continue;
    }
    if (rest.startsWith("//")) {
      const end = source.indexOf(String.fromCharCode(10), index);
      index = end < 0 ? source.length : end;
      continue;
    }
    if (rest.startsWith("/*")) {
      index = source.indexOf("*/", index) + 2;
      continue;
    }
    if (character === QUOTE || (character === HASH && /^#+"/.test(rest))) {
      // Reuse the literal reader: wrap the literal so swiftStrings reads exactly one.
      const { value, interpolated, length } = readOneLiteral(source, index);
      tokens.push({ kind: "string", value, interpolated });
      index += length;
      continue;
    }
    const number = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(rest);
    if (number && !/[A-Za-z_]/.test(source[index - 1] ?? "")) {
      tokens.push({ kind: "number", value: Number(number[0].replaceAll("_", "")) });
      index += number[0].length;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (word) {
      tokens.push({ kind: "word", value: word[0] });
      index += word[0].length;
      continue;
    }
    const operator = /^(\?\?|\?\.|as\?|==|->|&&|\|\|)/.exec(rest);
    if (operator) {
      tokens.push({ kind: "punct", value: operator[0] });
      index += operator[0].length;
      continue;
    }
    tokens.push({ kind: "punct", value: character });
    index += 1;
  }
  return tokens;
}

/** The value and source length of the string literal starting at `index`. */
function readOneLiteral(source, index) {
  // Find the literal's end by scanning with the same rules as the extractor: try growing slices.
  let hashes = 0;
  while (source[index + hashes] === HASH) hashes += 1;
  const multiline = source.startsWith(QUOTE.repeat(3), index + hashes);
  const closing = (multiline ? QUOTE.repeat(3) : QUOTE) + HASH.repeat(hashes);
  let search = index + hashes + (multiline ? 3 : 1);
  for (;;) {
    const end = source.indexOf(closing, search);
    if (end < 0) throw new Error("Unterminated literal in schema");
    const slice = source.slice(index, end + closing.length);
    try {
      const strings = swiftStrings("let x = " + slice);
      const segments = strings["x#0"];
      if (segments && Object.keys(strings).length === 1) {
        const interpolated = segments.some((segment) => "expr" in segment);
        return { value: segments.map((segment) => segment.text ?? "").join(""), interpolated, length: slice.length };
      }
    } catch (error) {}
    search = end + 1;
  }
}

export class SchemaEvaluator {
  constructor(referenceDirectory, overrides = {}) {
    this.files = swiftFiles(referenceDirectory);
    this.overrides = overrides;
    this.cache = new Map();
    this.typeFiles = new Map();
    for (const file of this.files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /^\s*(?:(?:nonisolated|public|private|fileprivate|internal|final|@MainActor)\s+)*(?:enum|struct|extension|class)\s+([A-Z][A-Za-z0-9_]*)/gm,
      )) {
        if (!this.typeFiles.has(match[1])) this.typeFiles.set(match[1], []);
        this.typeFiles.get(match[1]).push(file);
      }
    }
  }

  /** Calls `static func name(_ a: T, …) -> R { expression }` of `type` with `args`. */
  callFunction(type, name, args) {
    for (const file of this.typeFiles.get(type) ?? []) {
      const source = readFileSync(file, "utf8");
      const declaration = new RegExp(`static\\s+func\\s+${name}\\s*\\(([^)]*)\\)\\s*->[^{]*\\{`).exec(source);
      if (!declaration) continue;
      const names = declaration[1]
        .split(",")
        .map((parameter) => parameter.trim())
        .filter(Boolean)
        .map((parameter) => parameter.split(":")[0].trim().split(/\s+/).pop());
      const tokens = tokenize(source.slice(declaration.index + declaration[0].length));
      const parser = new Parser(tokens, this, type, `${type}.${name}()`);
      names.forEach((parameter, index) => parser.scopes[0].set(parameter, args[index]));
      if (parser.is("return")) parser.take();
      const value = parser.expression();
      parser.take("}");
      return value;
    }
    throw new Error(`No static func ${name} in ${type}`);
  }

  /** The value of `static let member` in `type`. */
  value(type, member) {
    const key = `${type}.${member}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const files = this.typeFiles.get(type) ?? [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const declaration = new RegExp(`static\\s+(?:let|var)\\s+${member}\\s*(?::[^=]*)?=`).exec(source);
      if (!declaration) continue;
      const tokens = tokenize(source.slice(declaration.index + declaration[0].length));
      const parser = new Parser(tokens, this, type, key);
      const value = parser.expression();
      this.cache.set(key, value);
      return value;
    }
    throw new Error(`No static ${member} in ${type}`);
  }
}

class Parser {
  constructor(tokens, evaluator, type, owner) {
    this.tokens = tokens;
    this.position = 0;
    this.evaluator = evaluator;
    this.type = type;
    this.owner = owner;
    this.scopes = [new Map()];
  }

  peek(offset = 0) {
    return this.tokens[this.position + offset];
  }

  take(value) {
    const token = this.tokens[this.position];
    if (value !== undefined && token?.value !== value) {
      throw new Error(`${this.owner}: expected ${value}, found ${token?.value} (${this.context()})`);
    }
    this.position += 1;
    return token;
  }

  is(value, offset = 0) {
    return this.peek(offset)?.value === value;
  }

  context() {
    return this.tokens
      .slice(Math.max(0, this.position - 6), this.position + 6)
      .map((token) => (token.kind === "string" ? JSON.stringify(token.value) : token.value))
      .join(" ");
  }

  /** `as [String: Any]`, `as [[String: Any]]`, `as? …`: a cast changes nothing here. */
  skipCasts() {
    while (this.is("as") || this.is("as?")) {
      this.take();
      this.skipType();
    }
  }

  skipType() {
    if (this.is("[")) {
      let depth = 0;
      do {
        if (this.is("[")) depth += 1;
        if (this.is("]")) depth -= 1;
        this.take();
      } while (depth > 0);
    } else {
      this.take();
      while (this.is(".")) {
        this.take();
        this.take();
      }
    }
    if (this.is("?")) this.take();
  }

  expression() {
    const value = this.primary();
    this.skipCasts();
    return value;
  }

  primary() {
    const token = this.peek();
    if (!token) throw new Error(`${this.owner}: expression ends early`);
    if (token.kind === "string" && token.interpolated) {
      throw new Error(`${this.owner}: a schema string with an interpolation (${this.context()})`);
    }
    if (token.kind === "string" || token.kind === "number") {
      this.take();
      return token.value;
    }
    if (token.value === "[") return this.collection();
    if (token.value === "{") return this.closure();
    if (token.kind === "word") {
      if (token.value === "true" || token.value === "false") {
        this.take();
        return token.value === "true";
      }
      if (token.value === "NSNull" && this.is("(", 1)) {
        this.take();
        this.take("(");
        this.take(")");
        return null;
      }
      return this.reference();
    }
    throw new Error(`${this.owner}: cannot read "${token.value}" (${this.context()})`);
  }

  reference() {
    if (this.is("Array") && this.is("(", 1)) return this.sortedKeys();
    if (this.peek(1)?.value === "(") return this.call(this.take().value);
    const parts = [this.take().value];
    while (this.is(".") && this.peek(1)?.kind === "word") {
      this.take();
      parts.push(this.take().value);
    }
    if (parts[0] === "Self") parts[0] = this.type;
    if (parts.length === 1) {
      for (const scope of [...this.scopes].reverse()) if (scope.has(parts[0])) return scope.get(parts[0]);
      return this.evaluator.value(this.type, parts[0]);
    }
    if (parts.length === 2) return this.evaluator.value(parts[0], parts[1]);
    throw new Error(`${this.owner}: cannot resolve ${parts.join(".")}`);
  }

  /** `Array(dictionary.keys).sorted()`: the keys in Swift's string order (code points, as JS sorts ASCII). */
  sortedKeys() {
    this.take("Array");
    this.take("(");
    const name = this.take().value;
    const scope = [...this.scopes].reverse().find((candidate) => candidate.has(name));
    const dictionary = scope ? scope.get(name) : this.evaluator.value(this.type, name);
    this.take(".");
    this.take("keys");
    this.take(")");
    this.take(".");
    this.take("sorted");
    this.take("(");
    this.take(")");
    return Object.keys(dictionary).sort();
  }

  /** A call to a static func of this type whose body is one expression of its parameters. */
  call(name) {
    this.take("(");
    const args = [];
    while (!this.is(")")) {
      args.push(this.expression());
      if (this.is(",")) this.take(",");
    }
    this.take(")");
    return this.evaluator.callFunction(this.type, name, args);
  }

  collection() {
    this.take("[");
    if (this.is(":")) {
      this.take(":");
      this.take("]");
      return {};
    }
    if (this.is("]")) {
      this.take("]");
      return [];
    }
    const first = this.expression();
    if (this.is(":")) {
      const dictionary = {};
      this.take(":");
      dictionary[first] = this.expression();
      while (this.is(",")) {
        this.take(",");
        if (this.is("]")) break;
        const key = this.expression();
        this.take(":");
        dictionary[key] = this.expression();
      }
      this.take("]");
      return dictionary;
    }
    const array = [first];
    while (this.is(",")) {
      this.take(",");
      if (this.is("]")) break;
      array.push(this.expression());
    }
    this.take("]");
    return array;
  }

  /** `{ let a: T = …; var b = …; if … { … }; return … }()` */
  closure() {
    this.take("{");
    this.scopes.push(new Map());
    let result;
    while (!this.is("}")) {
      const keyword = this.peek().value;
      if (keyword === "let" || keyword === "var") {
        this.take();
        const name = this.take().value;
        if (this.is(":")) {
          this.take(":");
          this.skipType();
        }
        this.take("=");
        const override = this.evaluator.overrides[`${this.owner}/${name}`];
        if (override) {
          this.skipStatement();
          const value = typeof override.value === "function" ? override.value(this.evaluator) : override.value;
          this.scopes[this.scopes.length - 1].set(name, value);
        } else {
          this.scopes[this.scopes.length - 1].set(name, this.expression());
        }
        continue;
      }
      if (keyword === "if") {
        const override = this.evaluator.overrides[`${this.owner}/if`];
        if (!override) throw new Error(`${this.owner}: an if statement needs an override (${this.context()})`);
        this.skipStatement();
        continue;
      }
      if (keyword === "return") {
        this.take();
        result = this.expression();
        continue;
      }
      throw new Error(`${this.owner}: cannot read statement "${keyword}" (${this.context()})`);
    }
    this.take("}");
    this.scopes.pop();
    this.take("(");
    this.take(")");
    return result;
  }

  /** Skips to the end of a statement the overrides stand for: balanced brackets, then a new statement. */
  skipStatement() {
    let depth = 0;
    let started = false;
    while (this.position < this.tokens.length) {
      const value = this.peek().value;
      if (["(", "[", "{"].includes(value)) depth += 1;
      if ([")", "]", "}"].includes(value)) {
        if (depth === 0) return;
        depth -= 1;
        this.take();
        // An if's block ends the statement.
        if (depth === 0 && value === "}" && started) return;
        continue;
      }
      if (depth === 0 && started && ["let", "var", "return", "if"].includes(value)) return;
      started = true;
      this.take();
    }
  }
}
