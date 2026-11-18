// Port of LearnLayerTests/NoteTextTests.swift (the NoteMath cases; NoteLayout is SwiftUI's own line layout, which the
// browser does itself) and the NoteMath cases of LayoutFixTests.swift and LiveRunFixTests.swift @ ref 2026-11-04.

import katex from "katex";
import { describe, expect, it } from "vitest";
import { latexToUnicode, normalized } from "./latexText";
import { NoteMath } from "./noteMath";

const R = String.raw;
const formulas = (note: string) =>
  NoteMath.pieces(note)
    .filter((piece) => piece.isMath)
    .map((piece) => piece.text);
const isAscii = (text: string) => Array.from(text).every((ch) => ch.charCodeAt(0) < 128);

describe("the step notes, as they must be set", () => {
  it("a note is split without losing a word", () => {
    const notes = [
      "Para x ≤ 3 a função é dada pelo primeiro ramo, por isso f(3) calcula-se nele.",
      "À direita surge 0/0: fatoriza-se x² − 9 e usa-se o limite notável (eʸ − 1)/y → 1, com y = x − 3.",
      "Sem atrito, a resultante é a componente do peso ao longo da tábua, P sen θ, e sen θ = h/1,50.",
      "Usa-se e³ > 4 (e³ ≈ 20,09), pois e > 2.",
      "É a equação da opção (B).",
    ];
    for (const note of notes)
      expect(
        NoteMath.pieces(note)
          .map((piece) => piece.text)
          .join(""),
      ).toBe(note);
  });

  it('a word after a formula stays a word ("x ≤ 3 a função" was set as "x ≤ 3a")', () => {
    expect(formulas("Para x ≤ 3 a função é dada pelo primeiro ramo")).toEqual(["x ≤ 3"]);
    expect(formulas("Em x = 0 a derivada muda de sinal de − para +, por isso")).toEqual(["x = 0"]);
    expect(formulas("não existe limite em x = 3 e f não é contínua")).toEqual(["x = 3", "f"]);
    expect(formulas("f' < 0 em ]−∞, 0[ e f' > 0 em ]0, 3[: f decresce")).toEqual([
      "f' < 0",
      "]−∞, 0[",
      "f' > 0",
      "]0, 3[",
      "f",
    ]);
    expect(formulas("g(x) = f(x) + x e procura-se um zero de g em ]−1, 0[.")).toEqual([
      "g(x) = f(x) + x",
      "g",
      "]−1, 0[.",
    ]);
  });

  it('a comma separates two formulas: "x < 3, 3 − x > 0" is two', () => {
    expect(formulas("Para x < 3, 3 − x > 0, logo e^{3−x} > 1 e o segundo fator")).toEqual([
      "x < 3,",
      "3 − x > 0,",
      "e^{3−x} > 1",
    ]);
    expect(formulas("Como g(0) < 0 < g(−1), o teorema")).toEqual(["g(0) < 0 < g(−1),"]);
  });

  it("a formula is read whole", () => {
    expect(formulas("fatoriza-se x² − 9 e usa-se o limite notável (eʸ − 1)/y → 1, com y = x − 3.")).toEqual([
      "x² − 9",
      "(eʸ − 1)/y → 1,",
      "y = x − 3.",
    ]);
    expect(formulas("À direita surge 0/0: fatoriza-se")).toEqual(["0/0"]);
  });

  it("an aside and an option letter keep their meaning", () => {
    expect(formulas("Usa-se e³ > 4 (e³ ≈ 20,09), pois e > 2.")).toEqual(["e³ > 4", "(e³ ≈ 20,09),", "e > 2."]);
    expect(formulas("É a equação da opção (B).")).toEqual([]);
    expect(formulas("que é contínuo (soma e produto de funções contínuas), logo o limite é f(3).")).toEqual(["f(3)."]);
    expect(formulas("por isso o vetor diretor (1, 3, 0) é normal")).toEqual(["(1, 3, 0)"]);
    expect(formulas("Substituindo G(6, 9, 0) obtém-se 6 + 27 + d = 0, logo d = −33.")).toEqual([
      "G(6, 9, 0)",
      "6 + 27 + d = 0,",
      "d = −33.",
    ]);
  });

  it('factors side by side stay one formula: "½ a t²", "P sen θ", "9,8 m/s²"', () => {
    expect(formulas("logo d = ½ a t².")).toEqual(["d = ½ a t²."]);
    expect(formulas("da tábua, P sen θ, e sen θ = h/1,50.")).toEqual(["P sen θ,", "sen θ = h/1,50."]);
    expect(formulas("A aceleração é 9,8 m/s² e a massa 2 kg.")).toEqual(["9,8 m/s²"]);
    expect(formulas("Distância em 1,0 s")).toEqual([]);
    expect(formulas("com t = 1,0 s, logo")).toEqual(["t = 1,0 s,"]);
    expect(formulas("A resultante é a componente do peso.")).toEqual([]);
  });

  it("the LaTeX keeps decimals and functions", () => {
    expect(NoteMath.latex("sen θ = h/1,50")).toBe(R`\sen  \theta  = h/1{,}50`);
    expect(NoteMath.latex("d = ½ a t²")).toBe(R`d = \frac{1}{2}\,a\,t^{2}`);
    expect(NoteMath.latex("[−1,0] ⊂ ]−∞,3]")).toBe(R`[-1,0] \subset  ]-\infty ,3]`);
    expect(NoteMath.latex("]−1; 2,5[")).toBe("]-1; 2{,}5[");
    expect(NoteMath.latex("√(x + 1) = 2")).toBe(R`\sqrt{x + 1} = 2`);
    for (const note of ["Usa-se e³ > 4 (e³ ≈ 20,09), pois e > 2.", "logo d = ½ a t².", "e sen θ = h/1,50."])
      for (const formula of formulas(note)) expect(isAscii(NoteMath.latex(formula)), formula).toBe(true);
  });

  const dollarNotes = [
    "Como $g'$ é contínua em $c$ e $g'(c) < 0$, existe uma vizinhança onde $g' < 0$.",
    R`Sejam $x_1, x_2 \in Vdelta(c)$ com $x_1 < x_2$.`,
    R`Sendo $\xi \in ]x_1,x_2[ \subset Vdelta(c)$, tem-se $g'(\xi) < 0$.`,
  ];

  it('notes that mark their maths with "$" read as Unicode', () => {
    const plain = dollarNotes.map((note) => NoteMath.plainText(note));
    for (const text of plain) {
      expect(text).not.toContain("$");
      expect(text).not.toContain("delta");
      expect(text).not.toContain("\\");
    }
    expect(plain[0]).toBe("Como g' é contínua em c e g'(c) < 0, existe uma vizinhança onde g' < 0.");
    expect(plain[1]).toContain("x₁, x₂ ∈ V_δ(c)");
    expect(plain[2]).toContain("ξ ∈ ]x₁,x₂[ ⊂ V_δ(c)");
    expect(plain[2]).toContain("g'(ξ) < 0");
  });

  it('"$" maths is typeset as written', () => {
    for (const note of dollarNotes) {
      const pieces = NoteMath.pieces(note);
      expect(pieces.some((piece) => piece.isMath)).toBe(true);
      expect(pieces.every((piece) => !piece.text.includes("$"))).toBe(true);
      expect(pieces.filter((piece) => piece.isMath).every((piece) => piece.isLatex)).toBe(true);
    }
    expect(formulas(dollarNotes[2]!)[0]).toBe(R`\xi \in ]x_1,x_2[ \subset V_{\delta}(c),`);
    expect(formulas(R`Sejam \(x_1 \in V\delta(c)\).`)).toEqual([R`x_1 \in V_{\delta}(c).`]);
  });

  it('a note without "$" is unchanged', () => {
    const note = "f' < 0 em ]−∞, 0[ e f' > 0 em ]0, 3[: f decresce";
    expect(NoteMath.delimited(note)).toBeNull();
    expect(NoteMath.plainText(note)).toBe(note);
    expect(NoteMath.pieces(note).every((piece) => !piece.isLatex)).toBe(true);
  });

  it("Unicode reads sets and glued neighbourhoods", () => {
    expect(latexToUnicode(R`\xi \in A \subset B`)).toBe("ξ ∈ A ⊂ B");
    expect(latexToUnicode(R`x \in V_\delta(c)`)).toBe("x ∈ V_δ(c)");
    expect(latexToUnicode(R`x \in V\delta(c)`)).toBe("x ∈ V_δ(c)");
    expect(latexToUnicode(R`\forall \varepsilon > 0`)).toBe("∀ ε > 0");
  });
});

describe("note maths in the live runs (LayoutFixTests, LiveRunFixTests)", () => {
  it("note maths is split out for typesetting", () => {
    const factor = NoteMath.pieces("Para x < 3, 3 − x > 0, logo e^{3−x} > 1 e o segundo fator é positivo");
    const math = factor.filter((piece) => piece.isMath).map((piece) => NoteMath.latex(piece.text));
    expect(math.some((text) => text.includes("x") && text.includes("<") && text.includes("3"))).toBe(true);
    expect(math.some((text) => text.includes("e^{3-x}") && text.includes(">"))).toBe(true);
    expect(factor.some((piece) => !piece.isMath && piece.text.includes("segundo fator"))).toBe(true);
    const monotony = NoteMath.pieces("f' < 0 em ]−∞, 0[ e f' > 0 em ]0, 3[");
    const rendered = monotony.filter((piece) => piece.isMath).map((piece) => NoteMath.latex(piece.text));
    expect(rendered.some((text) => text.includes("f'") && text.includes("<"))).toBe(true);
    expect(rendered.some((text) => text.includes(R`\infty`))).toBe(true);
    expect(monotony.some((piece) => !piece.isMath && piece.text.includes("em"))).toBe(true);
    expect(NoteMath.pieces("A resultante é a componente do peso.").some((piece) => piece.isMath)).toBe(false);
  });

  it("a subset stays inside the sentence", () => {
    const pieces = NoteMath.pieces("Em [−1,0] ⊂ ]−∞,3] a função é contínua em [−1,0].");
    const math = pieces.filter((piece) => piece.isMath).map((piece) => piece.text);
    expect(math.some((text) => text.includes("⊂") && text.includes("["))).toBe(true);
    expect(pieces.some((piece) => !piece.isMath && piece.text.includes("contínua"))).toBe(true);
  });

  it("punctuation stays on the formula it follows", () => {
    const continuity = NoteMath.pieces(
      "g é contínua em [−1, 0] ⊂ ]−∞, 3[, pois nesse intervalo é soma de funções contínuas.",
    );
    expect(continuity.some((piece) => piece.text.trim().startsWith(","))).toBe(false);
    expect(continuity.some((piece) => !piece.isMath && piece.text.includes("pois"))).toBe(true);
    const conclusion = NoteMath.pieces("Pelo teorema de Bolzano, g tem um zero em ]−1, 0[.");
    expect(conclusion.some((piece) => piece.text.trim() === ".")).toBe(false);
    expect(
      NoteMath.sameSentence(
        "g contínua em [−1,0]",
        "g é contínua em [−1,0] ⊂ ]−∞,3[, pois nesse intervalo é soma de funções contínuas.",
      ),
    ).toBe(true);
    expect(NoteMath.sameSentence("x+3y-33=0", "O plano tem equação x + 3y − 33 = 0.")).toBe(false);
  });

  it("an interval chain stays one piece and the constant stays in the formula", () => {
    const chain = NoteMath.pieces("Em [−1,0] ⊂ ]−∞,3] a função é contínua.");
    expect(
      chain.some(
        (piece) =>
          piece.isMath && piece.text.includes("[−1,0]") && piece.text.includes("⊂") && piece.text.includes("]−∞,3]"),
      ),
    ).toBe(true);
    expect(chain.some((piece) => !piece.isMath && piece.text.includes("Em"))).toBe(true);
    expect(chain.some((piece) => !piece.isMath && piece.text.includes("função"))).toBe(true);
    const used = NoteMath.pieces("usa-se e³ > 4, pois e > 2");
    expect(used.some((piece) => piece.isMath && piece.text.includes("e³") && piece.text.includes("4"))).toBe(true);
    expect(
      used.some(
        (piece) => piece.isMath && piece.text.includes(">") && piece.text.includes("2") && !piece.text.includes("³"),
      ),
    ).toBe(true);
    expect(used.some((piece) => !piece.isMath && piece.text.includes("pois"))).toBe(true);
    expect(used.some((piece) => !piece.isMath && piece.text.includes("usa-se"))).toBe(true);
  });

  it("the live notes keep the formulas beside the words", () => {
    const defined = NoteMath.pieces("significa que f(x) = −x. Define-se g(x) = f(x) + x e procura-se");
    expect(defined.some((piece) => piece.isMath && piece.text.includes("f(x)") && piece.text.includes("−x"))).toBe(
      true,
    );
    expect(
      defined.some(
        (piece) =>
          piece.isMath && piece.text.includes("g(x)") && piece.text.includes("f(x)") && piece.text.includes("+ x"),
      ),
    ).toBe(true);
    for (const word of ["significa", "Define-se", "procura-se"])
      expect(defined.some((piece) => !piece.isMath && piece.text.includes(word))).toBe(true);
    // Step 3 reads as written: the approximation is its own aside, whole, and 20,09 keeps its decimal comma.
    const used = "Usa-se e³ > 4 (e³ ≈ 20,09), pois e > 2";
    const pieces = NoteMath.pieces(used);
    expect(pieces.map((piece) => piece.text).join("")).toBe(used);
    expect(formulas(used)).toEqual(["e³ > 4", "(e³ ≈ 20,09),", "e > 2"]);
    expect(NoteMath.latex("(e³ ≈ 20,09),")).toContain("20{,}09");
    expect(normalized(NoteMath.latex("(e³ ≈ 20,09)"))).toContain(R`20\decimalcomma 09`);
    // A word is placed at its own width, so "Como" is never cut to "C…".
    expect(NoteMath.pieces("Como g(0) < 0 < g(−1), o teorema de Bolzano garante um zero.")[0]).toEqual({
      isMath: false,
      text: "Como ",
    });
  });

  it("a step's formula that only repeats its note, or an option's letter, is not drawn", () => {
    const note = "g é contínua em [−1,0] ⊂ ]−∞,3[, pois nesse intervalo é soma de funções contínuas.";
    expect(NoteMath.formulaRepeats(R`\text{g contínua em } [-1,0]`, note)).toBe(true);
    // A real equation stays, even when the note says it too.
    expect(NoteMath.formulaRepeats("x+3y-33=0", "O plano tem equação x + 3y − 33 = 0.")).toBe(false);
    expect(NoteMath.formulaRepeats("(C)", "")).toBe(true);
    expect(NoteMath.formulaRepeats("C.", "A opção certa.")).toBe(true);
    expect(NoteMath.formulaRepeats("C = 2", "")).toBe(false);
  });

  it("every formula of these notes typesets", () => {
    const notes = [
      "Para x < 3, 3 − x > 0, logo e^{3−x} > 1 e o segundo fator é positivo",
      "f' < 0 em ]−∞, 0[ e f' > 0 em ]0, 3[: f decresce",
      "Usa-se e³ > 4 (e³ ≈ 20,09), pois e > 2.",
      "logo d = ½ a t².",
      "Em [−1,0] ⊂ ]−∞,3] a função é contínua.",
      "fatoriza-se x² − 9 e usa-se o limite notável (eʸ − 1)/y → 1, com y = x − 3.",
      "√(x + 1) = 2",
    ];
    const macros = { "\\decimalcomma": "{,}", "\\sen": "\\operatorname{sen}" };
    for (const note of notes)
      for (const formula of formulas(note))
        expect(
          () => katex.renderToString(normalized(NoteMath.latex(formula)), { throwOnError: true, macros }),
          formula,
        ).not.toThrow();
  });
});
