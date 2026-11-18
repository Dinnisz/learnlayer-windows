// Port of LearnLayerTests/AnswerTextLayoutTests.swift @ ref 2026-11-04: a written answer in LaTeX rows reads as words,
// with no "text" left from \text{…}, and ∞, π and exponents kept. The sign table's cells are in SignTableView's own
// test (ui/figures).

import { describe, expect, it } from "vitest";
import { latexToUnicode, undoubledCommands } from "../math/latexText";
import { AnswerLines, AnswerTextLayout, type AnswerPiece } from "./answerTextLayout";

const proseLines = (pieces: AnswerPiece[]) => pieces.filter((piece) => piece.kind === "prose").map((p) => p.line);
const latexLines = (pieces: AnswerPiece[]) => pieces.filter((piece) => piece.kind === "latex").map((p) => p.line);
/** "text" only as the \text command a typeset line still draws. */
const hasTextLeftover = (line: string) => /(?<!\\)text/u.test(line);
const laidOut = (latex: string) => AnswerLines.clauses(latex).flatMap((clause) => AnswerTextLayout.pieces(clause));

describe("a written answer laid out in lines", () => {
  it("word rows are written out", () => {
    const pieces = laidOut(
      String.raw`\text{(i) Não}\\ \text{(iii) Mínimo local em } x=-1\text{, não monótona}\\ \text{(iv) } 0 \text{ e } +\infty`,
    );
    expect(proseLines(pieces)).toEqual(["(i) Não", "(iii) Mínimo local em x = −1, não monótona", "(iv) 0 e +∞"]);
    expect(latexLines(pieces)).toEqual([]);
    expect(proseLines(pieces).some(hasTextLeftover)).toBe(false);
  });

  it("an exponent row stays typeset", () => {
    const pieces = laidOut(String.raw`\text{(i) Não}\\ \text{(iv) } 0 \text{ e } e^{1/2}`);
    expect(proseLines(pieces)).toEqual(["(i) Não"]);
    const typeset = latexLines(pieces);
    expect(typeset).toHaveLength(1);
    expect(typeset[0]).toContain("e^{1/2}");
    expect(typeset.some(hasTextLeftover)).toBe(false);
  });

  it("double-escaped commands are commands", () => {
    // The model escaped every backslash twice: `\\text` is \text, not a line break.
    const pieces = AnswerTextLayout.pieces(String.raw`\\text{(i) Não}\\\\ \\text{(iv) } 0 \\text{ e } +\\infty`);
    expect(proseLines(pieces)).toEqual(["(i) Não", "(iv) 0 e +∞"]);
    expect(latexToUnicode(String.raw`\\text{(i) Não}`)).not.toContain("text");
    expect(latexToUnicode(String.raw`0 \\text{ e } +\\infty`)).toBe("0 e +∞");
  });

  it("quad-separated parts get one line each", () => {
    // Parts joined by "; \quad" instead of "\\", with ";" also inside \text{…}.
    const latex = String.raw`\text{(i) Não;} \quad \text{(ii) Sim, } f'(x) = \frac{1-x^2}{(1+x^2)\sqrt{x^4+x^2+1}}; \quad \text{(iii) Mínimo local em } x=-1, \text{ não monótona;} \quad \text{(iv) } 0 \text{ e } e`;
    const clauses = AnswerLines.clauses(latex);
    expect(clauses).toHaveLength(4);
    const pieces = clauses.flatMap((clause) => AnswerTextLayout.pieces(clause));
    expect(pieces).toHaveLength(4);
    expect(pieces[0]).toEqual({ kind: "prose", line: "(i) Não" });
    expect(pieces[3]).toEqual({ kind: "prose", line: "(iv) 0 e e" });
    expect(proseLines(pieces)).toEqual(["(i) Não", "(iii) Mínimo local em x = −1, não monótona", "(iv) 0 e e"]);
    const typeset = latexLines(pieces);
    expect(typeset).toHaveLength(1);
    expect(typeset[0]!.startsWith(String.raw`\text{(ii) Sim, }`)).toBe(true);
    expect(typeset[0]).toContain(String.raw`\frac{1-x^2}{(1+x^2)\sqrt{x^4+x^2+1}}`);
    expect(typeset.some((line) => line.includes(String.raw`\quad`))).toBe(false);
    expect(proseLines(pieces).some(hasTextLeftover)).toBe(false);
    expect(proseLines(pieces).every((line) => AnswerTextLayout.isProseLine(line))).toBe(true);
  });

  it("a semicolon inside text does not split a typeset line", () => {
    expect(AnswerTextLayout.pieces(String.raw`\text{(a) Sim;} \ f(x) = x^2`)).toEqual([
      { kind: "latex", line: String.raw`\text{(a) Sim;} \ f(x) = x^2` },
    ]);
  });

  it("real line breaks stay line breaks", () => {
    expect(undoubledCommands(String.raw`a\\ b`)).toBe(String.raw`a\\ b`);
    expect(undoubledCommands(String.raw`a\\\text{b}`)).toBe(String.raw`a\\\text{b}`);
    expect(undoubledCommands(String.raw`\\pi`)).toBe(String.raw`\pi`);
  });

  it("plain answers split at semicolons, arrows and a part label after a closing bracket", () => {
    expect(AnswerTextLayout.pieces("(a) f(3) (b) 5; x > 2 ⇒ y")).toEqual([
      { kind: "prose", line: "(a) f(3)" },
      { kind: "prose", line: "(b) 5" },
      { kind: "prose", line: "x > 2" },
      { kind: "prose", line: "y" },
    ]);
    expect(AnswerTextLayout.pieces("  ")).toEqual([]);
    expect(AnswerLines.clauses("[0,3]")).toEqual(["[0,3]"]);
  });
});
