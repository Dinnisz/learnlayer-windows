// The formula a spoken answer is drawn on, with the symbol being said tinted blue and ringed (the Mac's HighlightPlan:
// a single letter or symbol is circled, never the whole formula). The Mac measures the typeset ink to place the ring
// (FormulaTerms, TypesetInk, PenRing); here KaTeX draws each symbol in its own element, so the ring goes round the
// element whose text is that symbol. A symbol not found is left unmarked (docs/DECISOES.md).

import { useLayoutEffect, useRef, useState } from "react";
import { latexToUnicode } from "@core/math/latexText";
import { MathView } from "../components/Math";

const plainDigits: Record<string, string> = Object.fromEntries([
  ...Array.from("₀₁₂₃₄₅₆₇₈₉").map((ch, index) => [ch, String(index)]),
  ...Array.from("⁰¹²³⁴⁵⁶⁷⁸⁹").map((ch, index) => [ch, String(index)]),
]);

/** A symbol as KaTeX's elements spell it: "v_0" and "v₀" are "v0", "\omega" is "ω". */
export function symbolText(term: string): string {
  return Array.from(latexToUnicode(term.trim()))
    .map((ch) => plainDigits[ch] ?? ch)
    .join("")
    .replace(/[\s_{}^]/g, "");
}

/** The first element of the typeset formula whose text is the symbol, the innermost one. */
function findSymbol(root: HTMLElement, symbol: string): HTMLElement | null {
  if (symbol === "" || Array.from(symbol).length > 4) return null;
  const html = root.querySelector(".katex-html");
  if (!html) return null;
  const zeroWidth = String.fromCharCode(0x200b);
  const text = (element: Element) => (element.textContent ?? "").split(zeroWidth).join("").replace(/\s/g, "");
  const matches = [...html.querySelectorAll<HTMLElement>("span")].filter((element) => text(element) === symbol);
  return matches.find((element) => !matches.some((other) => other !== element && element.contains(other))) ?? null;
}

interface Ring {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function VoiceFormulaView({ latex, symbols }: { latex: string; symbols: readonly string[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [rings, setRings] = useState<Ring[]>([]);
  const key = symbols.join("\u0001");

  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    for (const tinted of root.querySelectorAll(".voice-symbol")) tinted.classList.remove("voice-symbol");
    const origin = root.getBoundingClientRect();
    const found: Ring[] = [];
    for (const symbol of key === "" ? [] : key.split("\u0001")) {
      const element = findSymbol(root, symbolText(symbol));
      if (!element) continue;
      element.classList.add("voice-symbol");
      const rect = element.getBoundingClientRect();
      // A ring a little wider than the glyph, clear of it.
      const padX = Math.max(4, rect.width * 0.35);
      const padY = Math.max(3, rect.height * 0.2);
      found.push({
        left: rect.left - origin.left - padX,
        top: rect.top - origin.top - padY,
        width: rect.width + padX * 2,
        height: rect.height + padY * 2,
      });
    }
    setRings(found);
  }, [latex, key]);

  return (
    <div className="voice-formula" ref={box}>
      <MathView latex={latex} display />
      {rings.map((ring, index) => (
        <span key={index} className="voice-ring" aria-hidden="true" style={ring} />
      ))}
    </div>
  );
}
