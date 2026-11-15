// Port of LearnLayer/Code/CodeBlockView.swift @ ref 2026-11-04: a program as an editor shows it, monospaced, every line
// and indent kept, coloured by token in VS Code's Dark+ (or Light+ on a light surface). A long line scrolls sideways
// rather than wrapping, so the indentation always reads true. The stage is always dark.

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { CodeBlocks, CodeTheme, type CodeBlock } from "@core/code/codeText";

function useDark(element: React.RefObject<HTMLElement | null>): boolean {
  const [dark, setDark] = useState(true);
  useLayoutEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const update = () => setDark(!query.matches || element.current?.closest(".stage") !== null);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [element]);
  return dark;
}

export function CodeBlockView({ block, fontSize = 13 }: { block: CodeBlock; fontSize?: number }) {
  const ref = useRef<HTMLElement | null>(null);
  const dark = useDark(ref);
  const tokens = useMemo(() => CodeBlocks.tokens(block), [block]);
  return (
    <pre
      ref={ref as React.RefObject<HTMLPreElement>}
      className="code-block"
      style={{
        fontSize,
        lineHeight: 1.25 + 0.25,
        background: CodeTheme.background(dark),
        borderColor: dark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.12)",
      }}
      aria-label={block.tag || block.language}
    >
      <code>
        {tokens.map((token, index) => (
          <span key={index} style={{ color: CodeTheme.hex(token.kind, dark) }}>
            {token.text.replace(/\t/g, "    ")}
          </span>
        ))}
      </code>
    </pre>
  );
}
