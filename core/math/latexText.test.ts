// Port of LearnLayerTests/LatexTextTests.swift @ ref 2026-11-04
// (`everyStageFormulaTypesets` checks the mock formulas against KaTeX in ui/math/typeset.test.ts.)

import { describe, expect, it } from "vitest";
import { LatexText, withAccents } from "./latexText";

const asciiDigitsSorted = (text: string) =>
  Array.from(text)
    .filter((character) => /^[0-9]$/.test(character))
    .sort()
    .join("");

describe("LatexText", () => {
  it("a frac without braces becomes Unicode", () => {
    expect(LatexText.unicode(String.raw`-\frac92`)).toBe("−9/2");
    expect(LatexText.normalized(String.raw`\frac92`)).toContain(String.raw`\frac{9}{2}`);
  });

  it("left-hand limit", () => {
    const text = LatexText.unicode(String.raw`\lim_{x\to3^-}`);
    for (const piece of ["lim", "x", "→", "3", "⁻"]) expect(text).toContain(piece);
  });

  it("accented text is split out of maths", () => {
    const pieces = LatexText.accentedTextPieces(withAccents(String.raw`f \text{ é contínua } em 0`));
    expect(pieces).not.toBeNull();
    expect(pieces?.some((piece) => piece.isText && piece.content.includes("contínua"))).toBe(true);
  });

  it("spacing before a binary operator does not reach the typesetter", () => {
    const crashing = String.raw`5\times 4!,\,\times 4!`;
    expect(LatexText.wouldTripTypesetter(crashing)).toBe(true);
    const safe = LatexText.normalized(crashing);
    expect(LatexText.wouldTripTypesetter(safe)).toBe(false);
    expect(safe).toContain(String.raw`\times`);
    expect(safe).not.toContain(String.raw`\,`);
    expect(safe).toContain("!");

    const factorial = String.raw`5\times 4!\times 4!`;
    expect(LatexText.wouldTripTypesetter(factorial)).toBe(false);
    expect(LatexText.normalized(factorial)).toBe(factorial);

    for (const formula of [String.raw`n;\ \times m`, String.raw`f\colon\;\times g`]) {
      expect(LatexText.wouldTripTypesetter(formula)).toBe(true);
      expect(LatexText.wouldTripTypesetter(LatexText.normalized(formula))).toBe(false);
    }

    const sign = String.raw`x=3:\; -\frac92`;
    expect(LatexText.wouldTripTypesetter(sign)).toBe(true);
    const normalizedSign = LatexText.normalized(sign);
    expect(LatexText.wouldTripTypesetter(normalizedSign)).toBe(false);
    expect(normalizedSign).toContain(String.raw`\frac{9}{2}`);
    expect(normalizedSign).not.toContain(String.raw`\;`);

    expect(LatexText.wouldTripTypesetter(String.raw`a\;\times b`)).toBe(false);
    expect(LatexText.wouldTripTypesetter(LatexText.normalized(String.raw`a\;\times b`))).toBe(false);
    expect(LatexText.wouldTripTypesetter(String.raw`g\,\frac{h}{1{,}50}`)).toBe(false);
  });

  it("a relation then spacing then a binary operator trips until normalized", () => {
    const formula = String.raw`i^{37}=i^{36}\cdot i=i\;\Rightarrow\;-\sqrt{3}+i=2\,e^{i\frac{5\pi}{6}}`;
    expect(LatexText.wouldTripTypesetter(formula)).toBe(true);
    expect(LatexText.wouldTripTypesetter(LatexText.normalized(formula))).toBe(false);
    expect(LatexText.wouldTripTypesetter(String.raw`a\Rightarrow -b`)).toBe(false);
    const pairs = [
      String.raw`a\leq\;\times b`,
      String.raw`a\geq\,-b`,
      String.raw`a\approx\;+b`,
      String.raw`a\in\;\cdot b`,
      String.raw`a\longrightarrow\;-b`,
      String.raw`a\neq\;\pm y`,
      String.raw`a\to\;-b`,
      String.raw`a\implies\;-b`,
    ];
    for (const pair of pairs) {
      expect(LatexText.wouldTripTypesetter(pair), pair).toBe(true);
      expect(LatexText.wouldTripTypesetter(LatexText.normalized(pair)), pair).toBe(false);
    }
  });

  it("unsupported commands become ones the renderer reads", () => {
    expect(LatexText.normalized(String.raw`\implies`)).toContain(String.raw`\Rightarrow`);
    const greater = LatexText.normalized(String.raw`\geqslant`);
    expect(greater).toContain(String.raw`\geq`);
    expect(greater).not.toContain("geqslant");
    const arrow = LatexText.normalized(String.raw`\xrightarrow{2}`);
    expect(arrow).toContain(String.raw`\longrightarrow`);
    expect(arrow).not.toContain("stackrel");
    expect(LatexText.normalized(String.raw`\:`)).toContain(String.raw`\;`);
    const modulus = LatexText.normalized(String.raw`\pmod{5}`);
    expect(modulus).toContain("mod");
    expect(modulus).toContain("5");
    expect(LatexText.normalized(String.raw`\begin{array}{cc}1&2\end{array}`)).not.toContain("begin{array}");
    const rowBreak = LatexText.normalized(String.raw`x=1 \\ y=2`);
    expect(rowBreak).not.toContain(String.raw`\;`);
    expect(rowBreak).toContain("\\\\");
  });

  it("Unicode keeps every digit when a mark would fuse with it", () => {
    for (const latex of [String.raw`\overline{10}`, String.raw`\vec{10}`, String.raw`\overrightarrow{12}`]) {
      expect(asciiDigitsSorted(LatexText.unicode(latex))).toBe(asciiDigitsSorted(latex));
    }
  });

  it("prose is detected when the words carry the content", () => {
    expect(LatexText.isProse(String.raw`\text{A função é contínua à esquerda e crescente no intervalo dado.}`)).toBe(
      true,
    );
    expect(LatexText.isProse(String.raw`\frac{9}{2}`)).toBe(false);
  });

  it("symbols become the commands that draw them", () => {
    expect(LatexText.normalized("d = ½ a t²")).toBe(String.raw`d = \frac{1}{2} a t^{2}`);
    expect(LatexText.normalized("sen θ = h")).toBe(String.raw`sen \theta  = h`);
    expect(LatexText.normalized("e³⁻ˣ → 1, x₁ ≤ ∞")).toBe(String.raw`e^{3-x} \to  1, x_{1} \leq  \infty `);
    expect(LatexText.normalized(String.raw`x \in ℝ`)).toContain(String.raw`\mathbb{R}`);
    for (const sample of ["d = ½ a t²", "sen θ = h/1,50", "e³⁻ˣ → 1", "f′(x) ≥ 0", "x ∈ ]−1, 0[", "α + β = 90°"]) {
      expect(/^[\x00-\x7F]*$/.test(LatexText.normalized(sample)), sample).toBe(true);
    }
    expect(LatexText.normalized(String.raw`x\dots`)).toBe(String.raw`x\ldots`);
  });

  it("a braced comma is a decimal comma", () => {
    expect(LatexText.normalized(String.raw`g\approx 9{,}1`)).toBe(String.raw`g\approx 9\decimalcomma 1`);
    expect(LatexText.normalized(String.raw`\frac{h}{1{,}50}`)).toBe(String.raw`\frac{h}{1\decimalcomma 50}`);
    expect(LatexText.normalized("(1, 3, 0)")).toBe("(1, 3, 0)");
    expect(LatexText.unicode(String.raw`20\decimalcomma 09`)).toBe("20,09");
  });

  it("an interval open on either side is one group", () => {
    expect(LatexText.normalized("]-1,0[")).toBe(String.raw`\left]-1,0\right[`);
    expect(LatexText.normalized(String.raw`]-\infty,0]`)).toBe(String.raw`\left]-\infty,0\right]`);
    expect(LatexText.normalized(String.raw`[0,3]\cup]4,5[`)).toBe(String.raw`[0,3]\cup\left]4,5\right[`);
    expect(LatexText.normalized(String.raw`\exists c\in]-1,0[:\ f(c)=-c`)).toBe(
      String.raw`\exists c\in\left]-1,0\right[:\; f(c)=-c`,
    );
    expect(LatexText.normalized("[0,3]")).toBe("[0,3]");
    expect(LatexText.normalized(String.raw`\left[0,1\right]`)).toBe(String.raw`\left[0,1\right]`);
    expect(LatexText.normalized("[x]")).toBe("[x]");
  });

  it("\\nexists is not split before \\lim", () => {
    const latex = String.raw`\nexists \lim_{x\to3} f(x)`;
    expect(LatexText.normalized(latex)).toContain(String.raw`\nexists`);
    const plain = LatexText.unicode(latex);
    expect(plain).toContain("∄");
    expect(plain).not.toContain("nexistslim");
    expect(plain).toContain("lim");
  });

  it("function names stay operators", () => {
    expect(LatexText.normalized(String.raw`a=g\mathrm{sen}\theta`)).toBe(String.raw`a=g\sen \theta`);
    expect(LatexText.normalized(String.raw`\operatorname{tg}x`)).toBe(String.raw`\tg x`);
    expect(LatexText.normalized(String.raw`\mathrm{m}`)).toBe(String.raw`\mathrm{m}`);
    expect(LatexText.unicode(String.raw`g\sen \theta`)).toContain("sen θ");
  });

  it("or between solutions is spaced evenly", () => {
    expect(LatexText.tightConnectives(String.raw`x = -1 \quad \vee \quad x = 3`)).toBe(String.raw`x = -1 \vee x = 3`);
    expect(LatexText.tightConnectives(String.raw`x=-1\ \lor\ x=3`)).toBe(String.raw`x=-1 \vee x=3`);
    expect(LatexText.tightConnectives(String.raw`a \qquad\vee~b`)).toBe(String.raw`a \vee b`);
    expect(LatexText.tightConnectives(String.raw`a \\ \vee b`)).toBe(String.raw`a \\ \vee b`);
    expect(LatexText.tightConnectives(String.raw`p \veebar q`)).toBe(String.raw`p \veebar q`);
    expect(LatexText.normalized(String.raw`x = -1 \quad \vee \quad x = 3`)).toBe(String.raw`x = -1 \vee x = 3`);
  });

  it("a prime is a superscript prime", () => {
    expect(LatexText.normalized("f'(x)")).toBe(String.raw`f^{\prime}(x)`);
    expect(LatexText.normalized("f''(x)")).toBe(String.raw`f^{\prime\prime}(x)`);
    expect(LatexText.normalized("f′(x)")).toBe(String.raw`f^{\prime}(x)`);
    expect(LatexText.normalized(String.raw`\text{d'água}`)).toBe(String.raw`\text{d'água}`);
    expect(LatexText.normalized(String.raw`\'e`)).toBe(String.raw`\'e`);
    const answer = LatexText.normalized(String.raw`g(0)=4-3e^{3}<0 \Rightarrow c\in]-1,0[`);
    expect(answer).toContain(String.raw`\Rightarrow`);
    expect(answer.endsWith("\\")).toBe(false);
    expect(LatexText.normalized(String.raw`g(0)=4-3e^{3}<0\ `.trimEnd()).endsWith("\\")).toBe(false);
  });

  it("reads tables, cases and accents", () => {
    expect(LatexText.tableRows(String.raw`\begin{array}{c|ccc} x & 0 & & 1 \\ \hline f' & 0 & + \end{array}`)).toEqual([
      ["x", "0", "", "1"],
      ["f'", "0", "+", ""],
    ]);
    expect(LatexText.tableRows(String.raw`\frac{1}{2}`)).toBeNull();
    expect(
      LatexText.casesFromArray(String.raw`f(x)=\left\{ \begin{array}{ll} x & x<0 \\ 1 & x\geq 0 \end{array} \right.`),
    ).toBe(String.raw`f(x)=\begin{cases} x & x<0 \\ 1 & x\geq 0 \end{cases}`);
    expect(withAccents(String.raw`Fun\c{c}\~ao cont\'{\i}nua \'e`)).toContain("Função");
    expect(LatexText.unicode(String.raw`\sqrt{x+1} + x^{2} - \frac{a+b}{2}`)).toBe("√(x+1) + x² − (a+b)/2");
    expect(LatexText.mendedInline("Vdelta(c), delta > 0")).toBe(String.raw`V_{\delta}(c), \delta > 0`);
  });
});
