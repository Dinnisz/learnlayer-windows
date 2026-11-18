// LaTeX on screen: KaTeX, after the Mac's own clean-up (`LatexText.normalized`). The commands the Mac's renderer
// knows and KaTeX doesn't are macros here (docs/DECISOES.md). A formula KaTeX can't read is shown as plain Unicode,
// never as an error.

import katex from "katex";
import { memo, useMemo } from "react";
import { latexToUnicode, normalized } from "@core/math/latexText";
import { CodeText } from "@core/code/codeText";
import { CodeBlockView } from "./CodeBlockView";

const macros: Record<string, string> = {
  "\\decimalcomma": "{,}",
  "\\sen": "\\operatorname{sen}",
  "\\tg": "\\operatorname{tg}",
  "\\cotg": "\\operatorname{cotg}",
  "\\arcsen": "\\operatorname{arcsen}",
  "\\arctg": "\\operatorname{arctg}",
  "\\cosec": "\\operatorname{cosec}",
};

/** HTML for `latex`, or null when KaTeX can't read it. */
export function typeset(latex: string, display = false): string | null {
  try {
    return katex.renderToString(normalized(latex), {
      displayMode: display,
      throwOnError: true,
      macros: { ...macros },
      strict: "ignore",
      output: "html",
    });
  } catch {
    return null;
  }
}

/**
 * HTML for `latex` set in display style but inline, so a piece of a line typesets at the size the whole line has and
 * sits on a baseline (the equation morph measures pieces this way); null when KaTeX can't read it.
 */
export function typesetInlineDisplay(latex: string): string | null {
  try {
    return katex.renderToString("\\displaystyle " + normalized(latex), {
      displayMode: false,
      throwOnError: true,
      macros: { ...macros },
      strict: "ignore",
      output: "html",
    });
  } catch {
    return null;
  }
}

/** The first piece of maths in a question's reading that KaTeX can't draw; null when everything typesets. A reading
 * with such a piece is never shown: it would come out as stripped LaTeX (`RenderedQuestion.untypesetMath`). */
export function untypesetMath(blocks: readonly { type: string; text: string | null }[]): string | null {
  for (const block of blocks) {
    const text = block.text ?? "";
    if (block.type === "formula") {
      if (text.trim() !== "" && typeset(text, true) === null) return text;
      continue;
    }
    if (block.type !== "text") continue;
    for (const match of text.matchAll(/\$\$([^$]+)\$\$|\$([^$\n]+)\$/g)) {
      const latex = match[1] ?? match[2] ?? "";
      if (typeset(latex) === null) return latex;
    }
  }
  return null;
}

export const MathView = memo(function MathView({
  latex,
  display = false,
  className,
}: {
  latex: string;
  display?: boolean;
  className?: string;
}) {
  const html = useMemo(() => typeset(latex, display), [latex, display]);
  if (html === null) return <span className={className}>{latexToUnicode(latex)}</span>;
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
});

/**
 * Text with inline maths between `$…$` or `\(…\)`, and programs kept line for line in their own block (the Mac's
 * `ProseAndCode`); everything else is plain text.
 */
export const MathText = memo(function MathText({ text, className }: { text: string; className?: string }) {
  const segments = useMemo(() => CodeText.segments(text), [text]);
  if (segments.some((segment) => segment.kind === "code"))
    return (
      <span className={`prose-and-code${className ? ` ${className}` : ""}`}>
        {segments.map((segment, index) =>
          segment.kind === "code" ? (
            <CodeBlockView key={index} block={segment.block} />
          ) : (
            <InlineMath key={index} text={segment.text} />
          ),
        )}
      </span>
    );
  return <InlineMath text={text} className={className} />;
});

const InlineMath = memo(function InlineMath({ text, className }: { text: string; className?: string }) {
  const pieces = useMemo(() => {
    const result: { math: boolean; value: string }[] = [];
    const pattern = /\$\$([^$]+)\$\$|\$([^$\n]+)\$|\\\((.+?)\\\)/g;
    let last = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > last) result.push({ math: false, value: text.slice(last, match.index) });
      result.push({ math: true, value: match[1] ?? match[2] ?? match[3] ?? "" });
      last = match.index + match[0].length;
    }
    if (last < text.length) result.push({ math: false, value: text.slice(last) });
    return result;
  }, [text]);
  return (
    <span className={className}>
      {pieces.map((piece, index) =>
        piece.math ? <MathView key={index} latex={piece.value} /> : <span key={index}>{piece.value}</span>,
      )}
    </span>
  );
});
