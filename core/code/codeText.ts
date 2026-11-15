// Port of LearnLayer/Code/CodeText.swift and the colours of CodeBlockView.swift (`CodeTheme`) @ ref 2026-11-04

import { CodeLanguages, codeTokens, type CodeLanguage, type CodeToken, type TokenKind } from "./codeTokenizer";

/** A program inside a question, a step or an answer, kept line for line. */
export interface CodeBlock {
  language: CodeLanguage;
  code: string;
  /** The fence's own tag ("py"), so the block can be written back as it came. */
  tag: string;
}

export type Segment = { kind: "prose"; text: string } | { kind: "code"; block: CodeBlock };

export const CodeBlocks = {
  tokens(block: CodeBlock): CodeToken[] {
    return codeTokens(block.code, block.language);
  },
  /** The lines as drawn: tabs become four spaces, so indentation keeps its width. */
  displayCode(block: CodeBlock): string {
    return block.code.replace(/\t/g, "    ");
  },
};

const prose = (text: string): Segment => ({ kind: "prose", text });
const isBlank = (line: string) => line.replace(/[\p{Zs}\t]/gu, "") === "";
const trimSpaces = (text: string) => text.replace(/^[\p{Zs}\t]+|[\p{Zs}\t]+$/gu, "");
const tagPattern = /^[A-Za-z0-9+#._-]*$/;

function trailingTrimmed(line: string): string {
  return line.replace(/[ \t\r]+$/, "");
}

function trimmingBlankEdges(text: string): string {
  const lines = text.split("\n");
  while (lines.length > 0 && isBlank(lines[0]!)) lines.shift();
  while (lines.length > 0 && isBlank(lines[lines.length - 1]!)) lines.pop();
  return lines.join("\n");
}

function indentation(line: string): number {
  let width = 0;
  for (const character of line) {
    if (character === " ") width += 1;
    else if (character === "\t") width += 4;
    else break;
  }
  return width;
}

/** The indentation every line shares is dropped (a fence inside a list); each line keeps its own relative indent. */
export function dedented(text: string): string {
  const lines = text.split("\n");
  const shared = lines.filter((line) => !isBlank(line)).map((line) => /^[ \t]*/.exec(line)![0].length);
  const common = shared.length > 0 ? Math.min(...shared) : 0;
  if (common === 0) return lines.map(trailingTrimmed).join("\n");
  return lines.map((line) => (isBlank(line) ? "" : trailingTrimmed(line.slice(common)))).join("\n");
}

/** ```lang\n…``` blocks. A fence closed on its own line or on the code's last line; one never closed runs to the end. */
function fenced(text: string): Segment[] {
  if (!text.includes("```")) return [prose(text)];
  const marks: number[] = [];
  for (let at = text.indexOf("```"); at >= 0; at = text.indexOf("```", at + 3)) marks.push(at);
  const segments: Segment[] = [];
  let cursor = 0;
  for (let index = 0; index < marks.length; index += 2) {
    const open = marks[index]!;
    if (open > cursor) segments.push(prose(text.slice(cursor, open)));
    const bodyStart = open + 3;
    const close = index + 1 < marks.length ? marks[index + 1]! : text.length;
    let body = text.slice(bodyStart, close);
    let tag = "";
    const newline = body.indexOf("\n");
    if (newline >= 0) {
      const first = trimSpaces(body.slice(0, newline));
      if (tagPattern.test(first)) {
        tag = first;
        body = body.slice(newline + 1);
      }
    } else if (close === text.length && tagPattern.test(body)) {
      // "```py" with nothing after it yet.
      tag = body;
      body = "";
    }
    const code = dedented(trimmingBlankEdges(body));
    if (code !== "") {
      const language = CodeLanguages.fromFenceTag(tag) ?? CodeLanguages.guess(code);
      segments.push({ kind: "code", block: { language, code, tag } });
    }
    cursor = Math.min(close + 3, text.length);
  }
  if (cursor < text.length) segments.push(prose(text.slice(cursor)));
  return segments;
}

const strongPattern = new RegExp(
  "^\\s*(?:" +
    [
      String.raw`(?:def|class|func|function|fn)\s+[A-Za-z_]\w*\s*[(:<{]`,
      String.raw`(?:if|elif|while|for|switch|catch)\s*\(.*\)\s*\{?\s*$`,
      String.raw`(?:if|elif|while|for|with|try|else|except|finally)\b[^\n]*:\s*$`,
      String.raw`\#\s*(?:include|define|import)\b`,
      String.raw`(?:import|from)\s+[\w.]+(?:\s+import\s+[\w.*,\x20]+)?;?\s*$`,
      String.raw`(?:let|var|const|int|float|double|char|bool|long|String|auto)\s+[A-Za-z_]\w*(?:\[\])?\s*(?:=|;|:)`,
      String.raw`(?:public|private|protected|static)\s+[\w<>\[\]]+\s+[\w<>\[\]]*`,
      String.raw`return\b[^\n]*;\s*$`,
      String.raw`(?:print|printf|println|console\.log|System\.out\.\w+|std::cout|cout)\s*(?:\(|<<)`,
      String.raw`[}\])]+\s*(?:else\b.*)?;?\s*$`,
      String.raw`[A-Za-z_][\w.\[\]]*\s*(?:(?:\+=|-=|\*=|/=)|(?:\+\+|--)\s*;?\s*$)`,
    ].join("|") +
    ")",
);

const latexPattern =
  /\\(?:frac|dfrac|sqrt|int|sum|lim|text|mathrm|left|right|cdot|times|alpha|beta|pi|theta|infty)\b|\$/;

export function isStrongCode(line: string): boolean {
  return strongPattern.test(line) && !latexPattern.test(line);
}

/**
 * A line that could belong to a program: strong code, a comment, a line ending in `;`, `{` or `}`, a call or
 * assignment, or one indented under a line that opened a block (`:` or `{`).
 */
export function isCodeLike(line: string, previous: string | null): boolean {
  const trimmed = trimSpaces(line);
  if (trimmed === "" || latexPattern.test(line)) return false;
  if (isStrongCode(line)) return true;
  if (trimmed.startsWith("//") || trimmed.startsWith("# ") || trimmed.startsWith("/*") || trimmed.startsWith("*"))
    return true;
  if (";{}".includes(trimmed[trimmed.length - 1]!)) return true;
  if (/^[A-Za-z_][\w.[\]]*\s*=\s*\S/.test(trimmed) && /[;()[\]"']|^\w+\s*=\s*\w+$/.test(trimmed)) return true;
  if (/^[A-Za-z_][\w.]*\([^)]*\)$/.test(trimmed)) return true;
  if (previous !== null && (line.startsWith(" ") || line.startsWith("\t"))) {
    const opener = trimSpaces(previous);
    if (opener.endsWith(":") || opener.endsWith("{")) return true;
    return indentation(line) >= indentation(previous) && indentation(line) > 0;
  }
  return false;
}

/**
 * Runs of at least two lines that are each code-like, one of them unmistakably code (`def f(x):`, `#include`). Two
 * lines of algebra ("f(x) = 2x + 1") stay prose.
 */
function unfenced(text: string): Segment[] {
  const lines = text.split("\n");
  if (lines.length < 2) return [prose(text)];
  const segments: Segment[] = [];
  let pending: string[] = [];
  const flush = () => {
    if (pending.length > 0) segments.push(prose(pending.join("\n")));
    pending = [];
  };
  let index = 0;
  while (index < lines.length) {
    let end = index;
    let lastCode = index - 1;
    let strong = false;
    let previous: string | null = null;
    while (end < lines.length) {
      const line = lines[end]!;
      if (isBlank(line)) {
        end += 1;
        continue;
      }
      if (!isCodeLike(line, previous)) break;
      strong = strong || isStrongCode(line);
      previous = line;
      lastCode = end;
      end += 1;
    }
    const codeLines = lastCode >= index ? lines.slice(index, lastCode + 1).filter((line) => !isBlank(line)).length : 0;
    if (codeLines >= 2 && strong) {
      flush();
      const code = dedented(trimmingBlankEdges(lines.slice(index, lastCode + 1).join("\n")));
      segments.push({ kind: "code", block: { language: CodeLanguages.guess(code), code, tag: "" } });
      index = lastCode + 1;
    } else {
      pending.push(lines[index]!);
      index += 1;
    }
  }
  flush();
  return segments;
}

/**
 * Finds the code in a text: Markdown fences (also one not yet closed while the answer streams in) and, without a
 * fence, two or more lines that are plainly a program. Everything else stays prose.
 */
export const CodeText = {
  segments(text: string): Segment[] {
    if (!text.includes("\n") && !text.includes("```")) return [prose(text)];
    const segments: Segment[] = [];
    for (const part of fenced(text)) {
      if (part.kind === "prose") segments.push(...unfenced(part.text));
      else segments.push(part);
    }
    if (!segments.some((segment) => segment.kind === "code")) return [prose(text)];
    return segments.flatMap((segment) => {
      if (segment.kind !== "prose") return [segment];
      const trimmed = segment.text.trim();
      return trimmed === "" ? [] : [prose(trimmed)];
    });
  },

  containsCode(text: string): boolean {
    return CodeText.segments(text).some((segment) => segment.kind === "code");
  },

  /** Changes only the prose ("sen" → "sin", LaTeX → Unicode); code comes back fenced, so it is found again. */
  mapProse(text: string, transform: (prose: string) => string): string {
    const parts = CodeText.segments(text);
    if (!parts.some((segment) => segment.kind === "code")) return transform(text);
    return parts
      .map((segment) =>
        segment.kind === "prose"
          ? transform(segment.text)
          : "```" + segment.block.tag + "\n" + segment.block.code + "\n```",
      )
      .join("\n");
  },

  /** One line for a folded step: the fences dropped, line breaks as spaces. */
  oneLine(text: string): string {
    if (!text.includes("```") && !text.includes("\n")) return text;
    return CodeText.segments(text)
      .map((segment) => (segment.kind === "prose" ? segment.text : segment.block.code))
      .join(" ")
      .split(/\s+/)
      .filter((word) => word !== "")
      .join(" ");
  },
};

/**
 * Syntax colours for code blocks: VS Code's Dark+ and Light+ themes. The one exception to the white/black + blue
 * rule (CLAUDE.md, rule 8): the colours stay inside a code block.
 */
export const CodeTheme = {
  hex(kind: TokenKind, dark: boolean): string {
    const colours: Record<TokenKind, [string, string]> = {
      plain: ["#D4D4D4", "#1F1F1F"],
      keyword: ["#569CD6", "#0000FF"],
      string: ["#CE9178", "#A31515"],
      number: ["#B5CEA8", "#098658"],
      comment: ["#6A9955", "#008000"],
      type: ["#4EC9B0", "#267F99"],
      function: ["#DCDCAA", "#795E26"],
    };
    return colours[kind][dark ? 0 : 1];
  },

  background(dark: boolean): string {
    return dark ? "#1E1E1E" : "#FFFFFF";
  },

  /** WCAG relative luminance of "#RRGGBB". */
  luminance(hex: string): number {
    const value = Number.parseInt(hex.slice(1), 16);
    const channel = (part: number) => {
      const c = part / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return (
      0.2126 * channel((value >> 16) & 0xff) + 0.7152 * channel((value >> 8) & 0xff) + 0.0722 * channel(value & 0xff)
    );
  },

  contrast(a: string, b: string): number {
    const [light, dark] = [CodeTheme.luminance(a), CodeTheme.luminance(b)].sort((x, y) => y - x);
    return (light! + 0.05) / (dark! + 0.05);
  },
};
