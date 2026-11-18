// The formula a spoken answer is drawn on, with the symbol being said tinted blue and ringed (the Mac's HighlightPlan:
// a single letter or symbol is circled, never the whole formula). The Mac measures the typeset ink to place the ring
// (FormulaTerms, TypesetInk, PenRing); here KaTeX draws each symbol in its own element, so the pen's ring (PenRing.ring)
// goes round the box of the element whose text is that symbol. A symbol not found is left unmarked (docs/DECISOES.md).

import { useLayoutEffect, useRef, useState } from "react";
import { latexToUnicode } from "@core/math/latexText";
import { spokenAtoms } from "@core/voice/voiceFormula";
import { PenRing, type MarkRect } from "@core/explanation/handDrawn";
import { HandDrawnMark } from "../components/HandDrawnMark";
import { MathView } from "../components/Math";

/** The mark shows a moment after its word starts, so the body has reached the symbol (HighlightTiming.lead). */
const HighlightLead = 0.2;

const plainDigits: Record<string, string> = Object.fromEntries([
  ...Array.from("₀₁₂₃₄₅₆₇₈₉").map((ch, index) => [ch, String(index)]),
  ...Array.from("⁰¹²³⁴⁵⁶⁷⁸⁹").map((ch, index) => [ch, String(index)]),
]);

/** How KaTeX draws an atom said by name (`spokenAtoms`): `\int` is "∫", `\sin` is "sin" (or "sen" in Portuguese). */
const atomGlyphs: Record<string, string[]> = {
  sin: ["sin", "sen"],
  cos: ["cos"],
  tan: ["tan", "tg"],
  log: ["log"],
  ln: ["ln"],
  int: ["∫"],
  oint: ["∮"],
  sum: ["∑"],
  lim: ["lim"],
  infty: ["∞"],
  cdot: ["⋅"],
  times: ["×"],
  partial: ["∂"],
  nabla: ["∇"],
};

/** The spellings a symbol may have among KaTeX's elements: its own, or those of the operator or number it names. */
export function symbolTexts(term: string): string[] {
  const said = spokenAtoms(term);
  if (said) return said.flatMap((atom) => atomGlyphs[atom] ?? [atom]);
  return [symbolText(term)];
}

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
  const found = matches.find((element) => !matches.some((other) => other !== element && element.contains(other)));
  if (found || Array.from(symbol).length !== 1) return found ?? null;
  // KaTeX writes letters side by side in one element ("ma" for m·a): the letter is given an element of its own.
  const walker = document.createTreeWalker(html, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const at = (node.textContent ?? "").indexOf(symbol);
    if (at < 0 || !node.parentElement?.className.includes("mathnormal")) continue;
    const letter = (node as Text).splitText(at);
    letter.splitText(symbol.length);
    const wrap = document.createElement("span");
    letter.replaceWith(wrap);
    wrap.appendChild(letter);
    return wrap;
  }
  return null;
}

export function VoiceFormulaView({
  latex,
  symbols,
  underlined = false,
}: {
  latex: string;
  symbols: readonly string[];
  /** The whole formula is being said: a line under it. */
  underlined?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [rings, setRings] = useState<MarkRect[]>([]);
  const [underline, setUnderline] = useState<MarkRect | null>(null);
  const key = symbols.join("\u0001");

  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    for (const tinted of root.querySelectorAll(".voice-symbol")) tinted.classList.remove("voice-symbol");
    const origin = root.getBoundingClientRect();
    const found: MarkRect[] = [];
    for (const symbol of key === "" ? [] : key.split("\u0001")) {
      const element = symbolTexts(symbol).reduce<HTMLElement | null>(
        (found, spelling) => found ?? findSymbol(root, spelling),
        null,
      );
      if (!element) continue;
      element.classList.add("voice-symbol");
      const rect = element.getBoundingClientRect();
      // The smallest round loop that keeps clear of the glyph all the way round.
      found.push(
        PenRing.ring({ x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height }),
      );
    }
    setRings(found);
    const bases = [...root.querySelectorAll(".katex-html > .katex-base, .katex-html > .base")].map((base) =>
      base.getBoundingClientRect(),
    );
    if (underlined && bases.length > 0) {
      const left = Math.min(...bases.map((rect) => rect.left));
      const right = Math.max(...bases.map((rect) => rect.right));
      const bottom = Math.max(...bases.map((rect) => rect.bottom));
      setUnderline({ x: left - origin.left, y: bottom - origin.top, width: right - left, height: 0 });
    } else setUnderline(null);
  }, [latex, key, underlined]);

  return (
    <div className="voice-formula" ref={box}>
      <MathView latex={latex} display />
      {underline ? <HandDrawnMark style="underline" rect={underline} delay={HighlightLead} fades /> : null}
      {rings.map((ring) => (
        <HandDrawnMark key={`${ring.x},${ring.y}`} style="circle" rect={ring} delay={HighlightLead} fades />
      ))}
    </div>
  );
}
