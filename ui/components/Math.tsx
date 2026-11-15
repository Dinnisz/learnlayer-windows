// LaTeX on screen: KaTeX, after the Mac's own clean-up (`LatexText.normalized`). The commands the Mac's renderer
// knows and KaTeX doesn't are macros here (docs/DECISOES.md). A formula KaTeX can't read is shown as plain Unicode,
// never as an error.

import katex from "katex";
import { memo, useMemo } from "react";
import { latexToUnicode, normalized } from "@core/math/latexText";

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

/** Text with inline maths between `$…$` or `\(…\)`; everything else is plain text. */
export const MathText = memo(function MathText({ text, className }: { text: string; className?: string }) {
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
