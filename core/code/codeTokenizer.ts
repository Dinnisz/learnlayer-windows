// Port of LearnLayer/Code/CodeTokenizer.swift @ ref 2026-11-04

/** The language a code block is coloured as. C-like languages without their own list use `generic`; output `plain`. */
export const codeLanguages = ["swift", "python", "javascript", "c", "cpp", "java", "generic", "plain"] as const;
export type CodeLanguage = (typeof codeLanguages)[number];

export const CodeLanguages = {
  /** The language a fence names ("```py"), or null when the tag is unknown or absent. */
  fromFenceTag(tag: string): CodeLanguage | null {
    switch (tag.trim().toLowerCase()) {
      case "swift":
        return "swift";
      case "py":
      case "python":
      case "python3":
      case "py3":
        return "python";
      case "js":
      case "javascript":
      case "jsx":
      case "mjs":
      case "node":
      case "ts":
      case "typescript":
      case "tsx":
        return "javascript";
      case "c":
      case "h":
        return "c";
      case "cpp":
      case "c++":
      case "cc":
      case "cxx":
      case "hpp":
      case "hh":
        return "cpp";
      case "java":
        return "java";
      case "cs":
      case "csharp":
      case "c#":
      case "kotlin":
      case "kt":
      case "go":
      case "rust":
      case "rs":
      case "php":
      case "ruby":
      case "rb":
      case "pseudo":
      case "pseudocode":
      case "code":
        return "generic";
      case "text":
      case "txt":
      case "plaintext":
      case "output":
      case "console":
      case "shell-session":
        return "plain";
      default:
        return null;
    }
  },

  /** A guess from the code itself, for a block without a known tag. */
  guess(code: string): CodeLanguage {
    const has = (pattern: RegExp) => pattern.test(code);
    if (has(/System\.out\.|public\s+static\s+void\s+main|(public|private)\s+class\s+\w+/)) return "java";
    if (has(/#include\s*<(iostream|vector|string|map)>|std::|\bcout\s*<<|\bcin\s*>>/)) return "cpp";
    if (has(/#include\s*[<"]|\bprintf\s*\(|\bscanf\s*\(|\bint\s+main\s*\(/)) return "c";
    if (has(/\bfunction\s*\w*\s*\(|\bconsole\.\w+\s*\(|=>/)) return "javascript";
    // Swift before Python: both write `print(x)`, only Swift has `func` and `let x = 1` without `;`.
    if (
      has(
        /^\s*(func\s+\w+|guard\s|import\s+(Foundation|SwiftUI|UIKit)|(let|var)\s+\w+(\s*:\s*[\w[\]?]+)?\s*=[^;\n]*$)/m,
      )
    )
      return "swift";
    if (
      has(/^\s*(def\s+\w+\s*\(|elif\b|from\s+\w+(\.\w+)*\s+import\b)/m) ||
      has(/\bprint\s*\(.*\)\s*$/m) ||
      has(/^\s*(for|while|if)\b[^\n{;]*:\s*$/m)
    )
      return "python";
    if (has(/^\s*(const|let|var)\s+\w+\s*=/m)) return "javascript";
    return "generic";
  },
};

export const tokenKinds = ["plain", "keyword", "string", "number", "comment", "type", "function"] as const;
export type TokenKind = (typeof tokenKinds)[number];

/** One coloured run of a code block. Joining every token's text gives the code back exactly. */
export interface CodeToken {
  kind: TokenKind;
  text: string;
}

const isLetter = (c: string | undefined) => c !== undefined && /\p{L}/u.test(c);
const isNumber = (c: string | undefined) => c !== undefined && /\p{N}/u.test(c);
const isWordChar = (c: string | undefined) => isLetter(c) || isNumber(c) || c === "_";
const isHexDigit = (c: string | undefined) => c !== undefined && /[0-9a-fA-F]/.test(c);
const isWhitespace = (c: string) => /\s/u.test(c);

interface Rules {
  keywords: Set<string>;
  types: Set<string>;
  lineComments: string[];
  blockComment: { open: string; close: string } | null;
  quotes: Set<string>;
  tripleQuotes: string[];
  preprocessor: boolean;
  dollarIdentifiers: boolean;
  attributeKind: TokenKind;
  functionIntroducers: Set<string>;
  typeIntroducers: Set<string>;
}

function rulesFor(language: CodeLanguage): Rules {
  const rules: Rules = {
    keywords: new Set(),
    types: new Set(),
    lineComments: ["//"],
    blockComment: { open: "/*", close: "*/" },
    quotes: new Set(['"', "'"]),
    tripleQuotes: [],
    preprocessor: false,
    dollarIdentifiers: false,
    attributeKind: "keyword",
    functionIntroducers: new Set(),
    typeIntroducers: new Set(["class", "struct", "enum", "interface", "protocol", "extension"]),
  };
  const words = (text: string) => new Set(text.split(" "));
  switch (language) {
    case "swift":
      rules.keywords = words(
        "func let var if else guard return for in while repeat switch case default break continue struct class enum protocol extension import init deinit self Self super nil true false throws throw try catch do where as is inout static private fileprivate public internal open final override mutating lazy weak some any async await defer typealias subscript operator fallthrough",
      );
      rules.types = words("Int Double Float String Bool Character Array Dictionary Set Void Any");
      rules.quotes = new Set(['"']);
      rules.tripleQuotes = ['"""'];
      rules.functionIntroducers = words("func");
      break;
    case "python":
      rules.keywords = words(
        "def class return if elif else for while in not and or is import from as try except finally raise with pass break continue lambda yield global nonlocal del assert async await True False None self match case",
      );
      rules.types = words("int float str bool list dict set tuple object bytes");
      rules.lineComments = ["#"];
      rules.blockComment = null;
      rules.tripleQuotes = ['"""', "'''"];
      rules.attributeKind = "function";
      rules.functionIntroducers = words("def");
      rules.typeIntroducers = words("class");
      break;
    case "javascript":
      rules.keywords = words(
        "function return if else for while do switch case default break continue const let var new this class extends import export from as of in instanceof typeof try catch finally throw async await yield null undefined true false delete void static get set super interface type enum implements public private protected readonly",
      );
      rules.types = words("number string boolean any unknown never object");
      rules.quotes = new Set(['"', "'", "`"]);
      rules.dollarIdentifiers = true;
      rules.functionIntroducers = words("function");
      rules.typeIntroducers = words("class interface type enum extends implements new");
      break;
    case "c":
    case "cpp":
      // Built-in types are keywords in VS Code's C colours; named ones (size_t) are types.
      rules.keywords = words(
        "if else for while do switch case default break continue return struct union enum typedef static const extern sizeof goto volatile unsigned signed NULL true false int char float double long short void bool",
      );
      rules.types = words("size_t FILE");
      if (language === "cpp") {
        for (const word of "class public private protected virtual override namespace using new delete this template typename try catch throw nullptr auto friend operator inline constexpr".split(
          " ",
        ))
          rules.keywords.add(word);
        for (const word of ["string", "vector", "map", "set"]) rules.types.add(word);
      }
      rules.preprocessor = true;
      rules.typeIntroducers = words("struct class enum union");
      break;
    case "java":
      rules.keywords = words(
        "public private protected static final abstract class interface enum extends implements new return if else for while do switch case default break continue try catch finally throw throws import package this super null true false instanceof synchronized var int long short byte char float double boolean void",
      );
      rules.attributeKind = "type";
      rules.typeIntroducers = words("class interface enum extends implements new");
      break;
    case "generic":
    case "plain":
      rules.keywords = words(
        "if else elif for while do return function def func fn class struct import from let var const new true false null nil None True False and or not in switch case break continue public private static void end then begin repeat until int float double char bool boolean",
      );
      rules.types = words("string String");
      rules.lineComments = ["//", "#"];
      rules.quotes = new Set(['"', "'", "`"]);
      rules.functionIntroducers = words("function def func fn");
      break;
  }
  return rules;
}

function classify(word: string, previous: string | null, next: string | null, rules: Rules): TokenKind {
  if (rules.keywords.has(word)) return "keyword";
  if (previous !== null && rules.functionIntroducers.has(previous)) return "function";
  if (previous !== null && rules.typeIntroducers.has(previous)) return "type";
  if (rules.types.has(word)) return "type";
  // `Point`, `ArrayList`: a capitalised name is a type. `MAX_SIZE` is a constant.
  if (/^\p{Lu}/u.test(word) && /\p{Ll}/u.test(word)) return "type";
  if (next === "(") return "function";
  return "plain";
}

/** 42, 3.14, 1e-9, 0xFF, 1_000, 2.5f, 10L. A range `1..<5` stops at the dots. */
function numberEnd(chars: string[], start: number): number {
  let end = start;
  const digits = (allowed: (c: string) => boolean) => {
    while (end < chars.length && (allowed(chars[end]!) || chars[end] === "_")) end += 1;
  };
  if (chars[end] === "0" && end + 1 < chars.length && "xXbBoO".includes(chars[end + 1]!)) {
    end += 2;
    digits(isHexDigit);
  } else {
    digits(isNumber);
    if (end + 1 < chars.length && chars[end] === "." && isNumber(chars[end + 1])) {
      end += 1;
      digits(isNumber);
    }
    if (end < chars.length && "eE".includes(chars[end]!)) {
      let exponent = end + 1;
      if (exponent < chars.length && "+-".includes(chars[exponent]!)) exponent += 1;
      if (exponent < chars.length && isNumber(chars[exponent])) {
        end = exponent;
        digits(isNumber);
      }
    }
  }
  while (end < chars.length && isLetter(chars[end])) end += 1;
  return end;
}

/**
 * A small hand-written tokenizer, enough to colour the short programs of a study sheet the way VS Code does:
 * keywords, strings, numbers, comments, type names and function names.
 */
export function codeTokens(code: string, language: CodeLanguage): CodeToken[] {
  if (language === "plain") return code === "" ? [] : [{ kind: "plain", text: code }];
  const rules = rulesFor(language);
  const chars = Array.from(code);
  const tokens: CodeToken[] = [];
  let index = 0;
  let lastWord: string | null = null;

  const emit = (kind: TokenKind, end: number) => {
    if (end <= index) return;
    const text = chars.slice(index, end).join("");
    const last = tokens[tokens.length - 1];
    if (kind === "plain" && last?.kind === "plain") last.text += text;
    else tokens.push({ kind, text });
    index = end;
  };
  const starts = (prefix: string, position: number) => {
    const wanted = Array.from(prefix);
    if (position + wanted.length > chars.length) return false;
    return wanted.every((character, offset) => chars[position + offset] === character);
  };
  const lineEnd = (position: number) => {
    let end = position;
    while (end < chars.length && chars[end] !== "\n") end += 1;
    return end;
  };
  const stringEnd = (position: number, quote: string) => {
    let end = position + 1;
    while (end < chars.length) {
      const char = chars[end]!;
      if (char === "\\") {
        end += 2;
        continue;
      }
      if (char === quote) return end + 1;
      // Only a template literal runs over a line break.
      if (char === "\n" && quote !== "`") return end;
      end += 1;
    }
    return chars.length;
  };
  const blockEnd = (position: number, opening: string, closing: string) => {
    let end = position + Array.from(opening).length;
    while (end < chars.length) {
      if (chars[end] === "\\" && (closing.startsWith('"') || closing.startsWith("'"))) {
        end += 2;
        continue;
      }
      if (starts(closing, end)) return end + Array.from(closing).length;
      end += 1;
    }
    return chars.length;
  };
  const atLineStart = (position: number) => {
    let back = position - 1;
    while (back >= 0 && (chars[back] === " " || chars[back] === "\t")) back -= 1;
    return back < 0 || chars[back] === "\n";
  };
  const nextNonSpace = (position: number) => {
    let next = position;
    while (next < chars.length && (chars[next] === " " || chars[next] === "\t")) next += 1;
    return next < chars.length ? chars[next]! : null;
  };

  while (index < chars.length) {
    const char = chars[index]!;
    if (rules.lineComments.some((comment) => starts(comment, index))) {
      emit("comment", lineEnd(index));
      continue;
    }
    if (rules.blockComment && starts(rules.blockComment.open, index)) {
      emit("comment", blockEnd(index, rules.blockComment.open, rules.blockComment.close));
      continue;
    }
    const triple = rules.tripleQuotes.find((quote) => starts(quote, index));
    if (triple) {
      emit("string", blockEnd(index, triple, triple));
      continue;
    }
    if (rules.quotes.has(char)) {
      emit("string", stringEnd(index, char));
      continue;
    }
    if (char === "#" && rules.preprocessor && atLineStart(index)) {
      let end = index + 1;
      while (end < chars.length && isLetter(chars[end])) end += 1;
      const directive = chars.slice(index, end).join("");
      emit("keyword", end);
      // `#include <stdio.h>`: the header reads as a string.
      if (directive === "#include") {
        let space = index;
        while (space < chars.length && chars[space] === " ") space += 1;
        emit("plain", space);
        if (index < chars.length && chars[index] === "<") {
          let close = index;
          while (close < chars.length && chars[close] !== ">" && chars[close] !== "\n") close += 1;
          emit("string", Math.min(close + 1, chars.length));
        }
      }
      continue;
    }
    if (char === "@" && index + 1 < chars.length && isLetter(chars[index + 1])) {
      let end = index + 1;
      while (end < chars.length && isWordChar(chars[end])) end += 1;
      emit(rules.attributeKind, end);
      continue;
    }
    if (
      isNumber(char) ||
      (char === "." &&
        index + 1 < chars.length &&
        isNumber(chars[index + 1]) &&
        (index === 0 || !isWordChar(chars[index - 1])))
    ) {
      emit("number", numberEnd(chars, index));
      continue;
    }
    if (isLetter(char) || char === "_" || (char === "$" && rules.dollarIdentifiers)) {
      let end = index + 1;
      while (end < chars.length && (isWordChar(chars[end]) || (chars[end] === "$" && rules.dollarIdentifiers)))
        end += 1;
      const word = chars.slice(index, end).join("");
      // Python's f"…", r'…', b"…": the prefix is part of the string.
      if (
        language === "python" &&
        end < chars.length &&
        (chars[end] === '"' || chars[end] === "'") &&
        ["f", "r", "b", "u", "rb", "br", "fr", "rf"].includes(word.toLowerCase())
      ) {
        const quote = chars[end]!;
        const tripled = quote.repeat(3);
        emit("string", starts(tripled, end) ? blockEnd(end, tripled, tripled) : stringEnd(end, quote));
        continue;
      }
      emit(classify(word, lastWord, nextNonSpace(end), rules), end);
      lastWord = word;
      continue;
    }
    if (!isWhitespace(char)) lastWord = null;
    emit("plain", index + 1);
  }
  return tokens;
}
