// Reads the string literals of a Swift source file exactly as Swift would build them, so the prompts reach the
// Windows app word for word (CLAUDE.md, section 6). Each literal is a list of segments: text, or an
// interpolation `\(expr)` kept as the expression's source for the TypeScript port to fill in.
//
// Handles "…", """…""" (indentation stripped to the closing delimiter, a line ending in a backslash joined to the
// next), raw strings #"…"# and #"""…"""#, the escapes \0 \\ \t \n \r \" \' and \u{…}, and nested
// interpolations. Comments are skipped. Each literal is keyed by the declaration it sits in.
//
// No escape sequence is written as such below: special characters are built from their codes.

const BACKSLASH = String.fromCharCode(92);
const QUOTE = '"';
const HASH = "#";
const NEWLINE = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const TAB = String.fromCharCode(9);

const simpleEscapes = {
  0: String.fromCharCode(0),
  [BACKSLASH]: BACKSLASH,
  t: TAB,
  n: NEWLINE,
  r: CR,
  [QUOTE]: QUOTE,
  "'": "'",
};

class SwiftLexer {
  constructor(source) {
    this.source = source.split(CR + NEWLINE).join(NEWLINE);
    this.index = 0;
  }

  get done() {
    return this.index >= this.source.length;
  }

  peek(offset = 0) {
    return this.source[this.index + offset];
  }

  startsWith(text) {
    return this.source.startsWith(text, this.index);
  }

  lineAt(index) {
    let line = 1;
    for (let i = 0; i < index; i += 1) if (this.source[i] === NEWLINE) line += 1;
    return line;
  }

  /** Skips a // or /* comment at the cursor. True when one was skipped. */
  skipComment() {
    if (this.startsWith("//")) {
      const end = this.source.indexOf(NEWLINE, this.index);
      this.index = end < 0 ? this.source.length : end;
      return true;
    }
    if (this.startsWith("/*")) {
      let depth = 0;
      while (!this.done) {
        if (this.startsWith("/*")) {
          depth += 1;
          this.index += 2;
        } else if (this.startsWith("*/")) {
          depth -= 1;
          this.index += 2;
          if (depth === 0) return true;
        } else {
          this.index += 1;
        }
      }
      return true;
    }
    return false;
  }

  /** At a string literal's opening (any number of #, then " or """): reads it. Null when not at one. */
  readLiteral() {
    let hashes = 0;
    while (this.peek(hashes) === HASH) hashes += 1;
    if (this.peek(hashes) !== QUOTE) return null;
    const start = this.index;
    this.index += hashes;
    const multiline = this.startsWith(QUOTE.repeat(3));
    if (multiline) return { start, ...this.readMultiline(hashes) };
    this.index += 1;
    return { start, segments: this.readBody(hashes, QUOTE + HASH.repeat(hashes)) };
  }

  /** The escape introducer inside this literal: a backslash followed by as many # as opened it. */
  escapeAt(hashes) {
    return (
      this.peek() === BACKSLASH && this.source.slice(this.index + 1, this.index + 1 + hashes) === HASH.repeat(hashes)
    );
  }

  /** Reads characters, escapes and interpolations up to `closing`; returns segments. */
  readBody(hashes, closing) {
    const segments = [];
    let text = "";
    const flush = () => {
      if (text !== "") segments.push({ text });
      text = "";
    };
    while (!this.done) {
      if (this.startsWith(closing)) {
        this.index += closing.length;
        flush();
        return segments;
      }
      if (this.escapeAt(hashes)) {
        this.index += 1 + hashes;
        const next = this.peek();
        if (next === "(") {
          flush();
          segments.push({ expr: this.readInterpolation() });
          continue;
        }
        if (next === "u" && this.peek(1) === "{") {
          const end = this.source.indexOf("}", this.index);
          text += String.fromCodePoint(parseInt(this.source.slice(this.index + 2, end), 16));
          this.index = end + 1;
          continue;
        }
        if (next in simpleEscapes) {
          text += simpleEscapes[next];
          this.index += 1;
          continue;
        }
        throw new Error(`Unknown escape ${BACKSLASH}${next} at line ${this.lineAt(this.index)}`);
      }
      text += this.peek();
      this.index += 1;
    }
    throw new Error("Unterminated string literal");
  }

  /** The source of `\(…)`, minding nested parentheses and nested string literals. */
  readInterpolation() {
    this.index += 1;
    const begin = this.index;
    let depth = 1;
    while (!this.done) {
      const literal = this.readLiteral();
      if (literal) continue;
      const character = this.peek();
      if (character === "(") depth += 1;
      if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          const expr = this.source.slice(begin, this.index).trim();
          this.index += 1;
          return expr;
        }
      }
      this.index += 1;
    }
    throw new Error("Unterminated interpolation");
  }

  /**
   * A multi-line literal: the lines between the delimiters, each with the closing delimiter's indentation
   * removed; a line that ends in an unescaped backslash is joined to the next without a line break.
   */
  readMultiline(hashes) {
    this.index += 3;
    // The opening delimiter is followed by a line break.
    const lineEnd = this.source.indexOf(NEWLINE, this.index);
    this.index = lineEnd + 1;
    const closing = QUOTE.repeat(3) + HASH.repeat(hashes);
    // Find the closing delimiter: the first line whose content, after whitespace, starts with it.
    let scan = this.index;
    let closeLineStart = -1;
    while (scan < this.source.length) {
      const end = this.source.indexOf(NEWLINE, scan);
      const line = this.source.slice(scan, end < 0 ? this.source.length : end);
      if (line.trimStart().startsWith(closing)) {
        closeLineStart = scan;
        break;
      }
      scan = end < 0 ? this.source.length : end + 1;
    }
    if (closeLineStart < 0) throw new Error("Unterminated multi-line string");
    const closeLine = this.source.slice(closeLineStart, this.source.indexOf(NEWLINE, closeLineStart));
    const indent = closeLine.slice(0, closeLine.length - closeLine.trimStart().length);
    const bodySource = this.source.slice(this.index, closeLineStart);
    this.index = closeLineStart + indent.length + closing.length;
    // Strip the indentation, then read the body as one literal. The last line break (before the closing
    // delimiter) is not part of the string.
    const lines = bodySource.split(NEWLINE);
    lines.pop();
    const stripped = lines
      .map((line) => {
        if (line.trim() === "") return "";
        if (!line.startsWith(indent)) throw new Error(`Line is not indented like the closing delimiter: ${line}`);
        return line.slice(indent.length);
      })
      .join(NEWLINE);
    const inner = new SwiftLexer(stripped + closing);
    const segments = inner.readMultilineBody(hashes, closing);
    return { segments };
  }

  /** Like `readBody`, but a backslash at a line's end (escape introducer, then a line break) joins the lines. */
  readMultilineBody(hashes, closing) {
    const segments = [];
    let text = "";
    const flush = () => {
      if (text !== "") segments.push({ text });
      text = "";
    };
    while (!this.done) {
      if (this.startsWith(closing)) {
        flush();
        return segments;
      }
      if (this.escapeAt(hashes)) {
        const after = this.source[this.index + 1 + hashes];
        // Trailing whitespace may sit between the backslash and the line break.
        const rest = this.source.slice(this.index + 1 + hashes);
        const continuation = /^[ \t]*\n/.exec(rest);
        if (continuation) {
          this.index += 1 + hashes + continuation[0].length;
          continue;
        }
        if (after === "(") {
          this.index += 1 + hashes;
          flush();
          segments.push({ expr: this.readInterpolation() });
          continue;
        }
        if (after === "u" && this.source[this.index + 2 + hashes] === "{") {
          this.index += 1 + hashes;
          const end = this.source.indexOf("}", this.index);
          text += String.fromCodePoint(parseInt(this.source.slice(this.index + 2, end), 16));
          this.index = end + 1;
          continue;
        }
        if (after in simpleEscapes) {
          text += simpleEscapes[after];
          this.index += 2 + hashes;
          continue;
        }
        throw new Error(`Unknown escape ${BACKSLASH}${after}`);
      }
      text += this.peek();
      this.index += 1;
    }
    throw new Error("Unterminated multi-line body");
  }
}

/** The name of the declaration a literal belongs to: the last `let`, `var`, `func` or `case` before it. */
function declarations(source) {
  const found = [];
  const pattern =
    /(?:static\s+|private\s+|fileprivate\s+|nonisolated\s+)*(?:let|var|func|case)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  for (const match of source.matchAll(pattern)) found.push({ index: match.index, name: match[1] });
  return found;
}

/** Every string literal in `source`, keyed `member#n` (n counts literals within that member from 0). */
export function swiftStrings(source) {
  const lexer = new SwiftLexer(source);
  const decls = declarations(lexer.source);
  const literals = [];
  while (!lexer.done) {
    if (lexer.skipComment()) continue;
    const literal = lexer.readLiteral();
    if (literal) {
      literals.push(literal);
      continue;
    }
    lexer.index += 1;
  }
  const counts = new Map();
  const result = {};
  for (const literal of literals) {
    let owner = "top";
    for (const decl of decls) {
      if (decl.index < literal.start) owner = decl.name;
      else break;
    }
    const n = counts.get(owner) ?? 0;
    counts.set(owner, n + 1);
    result[`${owner}#${n}`] = literal.segments;
  }
  return result;
}
