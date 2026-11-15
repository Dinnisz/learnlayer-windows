// Port of LearnLayerTests/CodeHighlightingTests.swift @ ref 2026-11-04

import { describe, expect, test } from "vitest";
import { CodeBlocks, CodeText, CodeTheme, type CodeBlock } from "./codeText";
import {
  CodeLanguages,
  codeTokens,
  tokenKinds,
  type CodeLanguage,
  type CodeToken,
  type TokenKind,
} from "./codeTokenizer";

/** The coloured runs of a program, spaces left out: what the eye sees. */
const coloured = (code: string, language: CodeLanguage) =>
  codeTokens(code, language).filter((token) => token.kind !== "plain");
const token = (kind: TokenKind, text: string): CodeToken => ({ kind, text });
const codeBlocks = (text: string): CodeBlock[] =>
  CodeText.segments(text).flatMap((segment) => (segment.kind === "code" ? [segment.block] : []));

describe("CodeTokenizer", () => {
  test("a Python function with a comment and numbers", () => {
    expect(coloured("def area(r):\n    # circle\n    return 3.14 * r ** 2\n", "python")).toEqual([
      token("keyword", "def"),
      token("function", "area"),
      token("comment", "# circle"),
      token("keyword", "return"),
      token("number", "3.14"),
      token("number", "2"),
    ]);
  });

  test("Python prefixed strings and built-in calls", () => {
    expect(coloured('print(f"x = {x}")  # show', "python")).toEqual([
      token("function", "print"),
      token("string", 'f"x = {x}"'),
      token("comment", "# show"),
    ]);
    expect(coloured('s = """two\nlines"""', "python")).toEqual([token("string", '"""two\nlines"""')]);
  });

  test("a keyword inside a string or a comment is not a keyword", () => {
    expect(coloured("x = 'if' # return", "python")).toEqual([token("string", "'if'"), token("comment", "# return")]);
    expect(coloured('let s = "for" // while', "swift")).toEqual([
      token("keyword", "let"),
      token("string", '"for"'),
      token("comment", "// while"),
    ]);
  });

  test("Swift types and function names", () => {
    expect(coloured("func greet(_ person: Person) -> Int {", "swift")).toEqual([
      token("keyword", "func"),
      token("function", "greet"),
      token("type", "Person"),
      token("type", "Int"),
    ]);
    expect(coloured('let name: String = "Ana" // who', "swift")).toEqual([
      token("keyword", "let"),
      token("type", "String"),
      token("string", '"Ana"'),
      token("comment", "// who"),
    ]);
  });

  test("C includes, escapes and block comments", () => {
    const code = '#include <stdio.h>\nint main(void) {\n    printf("%d\\n", 42); /* done */\n    return 0;\n}';
    expect(coloured(code, "c")).toEqual([
      token("keyword", "#include"),
      token("string", "<stdio.h>"),
      token("keyword", "int"),
      token("function", "main"),
      token("keyword", "void"),
      token("function", "printf"),
      token("string", '"%d\\n"'),
      token("number", "42"),
      token("comment", "/* done */"),
      token("keyword", "return"),
      token("number", "0"),
    ]);
  });

  test("Java classes and calls", () => {
    expect(coloured("public class Main {", "java")).toEqual([
      token("keyword", "public"),
      token("keyword", "class"),
      token("type", "Main"),
    ]);
    expect(coloured('System.out.println("hi");', "java")).toEqual([
      token("type", "System"),
      token("function", "println"),
      token("string", '"hi"'),
    ]);
  });

  test("JavaScript arrows and templates", () => {
    expect(coloured("const add = (a, b) => a + b; // sum", "javascript")).toEqual([
      token("keyword", "const"),
      token("comment", "// sum"),
    ]);
    expect(coloured("console.log(`hi ${name}`)", "javascript")).toEqual([
      token("function", "log"),
      token("string", "`hi ${name}`"),
    ]);
  });

  test("0xFF, 1_000 and 2.5e-3 are one number each; 1..<10 is two", () => {
    const numbers = coloured("for i in 1..<10 { x = 0xFF + 1_000 + 2.5e-3 }", "swift").filter(
      (t) => t.kind === "number",
    );
    expect(numbers.map((t) => t.text)).toEqual(["1", "10", "0xFF", "1_000", "2.5e-3"]);
  });

  test("the runs put back together are the program, character for character", () => {
    const samples: [string, CodeLanguage][] = [
      ["def f(n):\n\tif n:\n\t\treturn 'a\\'b'\n", "python"],
      ["struct P {\n    var x = 1.5 /* unclosed", "swift"],
      ["int a[3] = {1, 2, 3}; // é ç\n", "c"],
      ['const s = "open string\nlet y = 2', "javascript"],
      ['@Override\npublic String toString() { return ""; }', "java"],
      ["x := 3 # généric\n", "generic"],
      ["output 1\n  output 2", "plain"],
    ];
    for (const [code, language] of samples)
      expect(
        codeTokens(code, language)
          .map((t) => t.text)
          .join(""),
      ).toBe(code);
  });

  test("program output is not coloured", () => {
    expect(codeTokens("if 1 then 2", "plain")).toEqual([token("plain", "if 1 then 2")]);
  });

  test("fence tags name languages", () => {
    expect(CodeLanguages.fromFenceTag("py")).toBe("python");
    expect(CodeLanguages.fromFenceTag("TS")).toBe("javascript");
    expect(CodeLanguages.fromFenceTag("c++")).toBe("cpp");
    expect(CodeLanguages.fromFenceTag("java")).toBe("java");
    expect(CodeLanguages.fromFenceTag("text")).toBe("plain");
    expect(CodeLanguages.fromFenceTag("nonsense")).toBeNull();
  });

  test("the language is guessed without a tag", () => {
    expect(CodeLanguages.guess("func add(a: Int, b: Int) -> Int {\n    return a + b\n}")).toBe("swift");
    expect(CodeLanguages.guess("let total = 5\nprint(total)")).toBe("swift");
    expect(CodeLanguages.guess("for i in range(3):\n    print(i)")).toBe("python");
    expect(CodeLanguages.guess("#include <iostream>\nint main() { std::cout << 1; }")).toBe("cpp");
    expect(CodeLanguages.guess("#include <stdio.h>\nint main(void) { return 0; }")).toBe("c");
    expect(CodeLanguages.guess("public static void main(String[] args) {}")).toBe("java");
    expect(CodeLanguages.guess("const xs = [1, 2].map(x => x * 2);")).toBe("javascript");
  });
});

describe("Code block detection", () => {
  test("a fenced block with its language", () => {
    const text = "Use this loop:\n```python\nfor i in range(3):\n    print(i)\n```\nIt prints 0, 1, 2.";
    expect(CodeText.segments(text)).toEqual([
      { kind: "prose", text: "Use this loop:" },
      { kind: "code", block: { language: "python", code: "for i in range(3):\n    print(i)", tag: "python" } },
      { kind: "prose", text: "It prints 0, 1, 2." },
    ]);
  });

  test("a fence without a tag guesses the language", () => {
    expect(codeBlocks("```\n#include <stdio.h>\nint main(void) { return 0; }\n```").map((b) => b.language)).toEqual([
      "c",
    ]);
  });

  test("an unclosed fence runs to the end", () => {
    expect(codeBlocks("Code:\n```js\nconst x = 1;\nconsole.log(x);")).toEqual([
      { language: "javascript", code: "const x = 1;\nconsole.log(x);", tag: "js" },
    ]);
  });

  test("a one-line fence", () => {
    expect(codeBlocks("Write ```x = 1``` first.").map((b) => b.code)).toEqual(["x = 1"]);
  });

  test("unfenced code is found", () => {
    const text = "The function:\ndef double(n):\n    return n * 2\nCall it with double(4).";
    expect(CodeText.segments(text)).toEqual([
      { kind: "prose", text: "The function:" },
      { kind: "code", block: { language: "python", code: "def double(n):\n    return n * 2", tag: "" } },
      { kind: "prose", text: "Call it with double(4)." },
    ]);
  });

  test("unfenced braces code is found", () => {
    const text = "for (int i = 0; i < n; i++) {\n    sum += a[i];\n}";
    expect(codeBlocks(text).map((b) => b.code)).toEqual([text]);
  });

  test("maths and prose over two lines are not a program", () => {
    const texts = [
      "f(x) = 2x + 1\nf(3) = 7",
      "x = 3;\ny = 4;",
      "Para x ≤ 3:\n  a função é dada pelo primeiro ramo.",
      "If the rate is high: the curve rises.\nOtherwise it falls.",
      "\\frac{a}{b} = c;\nreturn \\sqrt{x};",
      "One line with def f(x): in it",
    ];
    for (const text of texts) {
      expect(CodeText.containsCode(text), text).toBe(false);
      expect(CodeText.segments(text)).toEqual([{ kind: "prose", text }]);
    }
  });

  test("prose mapping leaves code alone", () => {
    const text = "sin here\n```python\nimport math\nprint(math.sin(1))\n```";
    const mapped = CodeText.mapProse(text, (prose) => prose.replace(/sin/g, "sen"));
    expect(CodeText.segments(mapped)).toEqual([
      { kind: "prose", text: "sen here" },
      { kind: "code", block: { language: "python", code: "import math\nprint(math.sin(1))", tag: "python" } },
    ]);
    expect(CodeText.mapProse("sin x", (prose) => prose.toUpperCase())).toBe("SIN X");
  });

  test("a folded step shows one line", () => {
    expect(CodeText.oneLine("Loop:\n```py\nfor i in x:\n    f(i)\n```")).toBe("Loop: for i in x: f(i)");
    expect(CodeText.oneLine("plain note")).toBe("plain note");
  });
});

describe("Code indentation", () => {
  test("nested indentation is kept", () => {
    const code = "def f(n):\n    if n > 0:\n        return n\n\n    return 0";
    expect(codeBlocks("```python\n" + code + "\n```").map((b) => b.code)).toEqual([code]);
  });

  test("a fence inside a list is dedented", () => {
    const text = "Steps:\n  ```python\n  for i in range(2):\n      print(i)\n  ```";
    expect(codeBlocks(text).map((b) => b.code)).toEqual(["for i in range(2):\n    print(i)"]);
  });

  test("tabs keep their width", () => {
    const block: CodeBlock = { language: "c", code: "if (x) {\n\ty = 1;\n}", tag: "" };
    expect(CodeBlocks.displayCode(block)).toBe("if (x) {\n    y = 1;\n}");
    const drawn = CodeBlocks.tokens(block)
      .map((t) => t.text.replace(/\t/g, "    "))
      .join("");
    expect(drawn).toBe(CodeBlocks.displayCode(block));
  });

  test("leading spaces are their own run", () => {
    const tokens = codeTokens("if x:\n    y = 1", "python");
    expect(tokens.map((t) => t.text).join("")).toBe("if x:\n    y = 1");
    expect(tokens.some((t) => t.kind === "plain" && t.text.endsWith("\n    y = "))).toBe(true);
  });
});

describe("Code theme", () => {
  test("every kind has its own colour in both modes", () => {
    for (const dark of [true, false]) {
      const colours = tokenKinds.map((kind) => CodeTheme.hex(kind, dark));
      expect(new Set(colours).size).toBe(colours.length);
    }
  });

  test("light and dark differ", () => {
    for (const kind of tokenKinds) expect(CodeTheme.hex(kind, true)).not.toBe(CodeTheme.hex(kind, false));
    expect(CodeTheme.background(true)).not.toBe(CodeTheme.background(false));
  });

  test("every colour is readable (WCAG AA, 4.5:1)", () => {
    for (const dark of [true, false])
      for (const kind of tokenKinds)
        expect(
          CodeTheme.contrast(CodeTheme.hex(kind, dark), CodeTheme.background(dark)),
          `${kind} ${dark}`,
        ).toBeGreaterThanOrEqual(4.5);
  });
});
