// Port of LearnLayerTests/NegatedRelationsTests.swift and the reading checks of AlineaGridTests.swift
// (aReadingThatLostARelationOrARootIsNotShown) @ 5701363. LaTeX PDFs set ≠, ∉, ⊄ … as a long solidus (U+0338) over
// the sign, which the text layer keeps apart, often before the sign: read as the one symbol, so the relation check does
// not count a second «=» (CDI3 1(a) «(t̸= 0)»). The solidus is built from its code, so no tool can drop it.

import { describe, expect, it } from "vitest";
import { negatedRelations, normalizeText } from "../problems/textNormalizer";
import { PDFQuestionReading } from "./pdfQuestionRead";

const slash = String.fromCharCode(0x0338);
/** CDI3 (1.º teste 2025/26) 1(a), as PDFKit reads its text layer. */
const cdi3Line = `(a) (5,0 val.)\ny′\n=\n1\nt y−tcos t+ t2 (t${slash}= 0)`;
/** Its reading (fast-questions.json), the one the check set aside as «relation lost (=)». */
const cdi3Reading = "$y^{\\prime}=\\frac{1}{t}y-t\\cos t+t^{2}$\n$(t\\neq0)$";

describe("negated relations", () => {
  it("compose the slash before or after its sign into the negated sign", () => {
    expect(negatedRelations(`(t${slash}= 0)`)).toBe("(t≠ 0)");
    expect(negatedRelations(`(t =${slash} 0)`)).toBe("(t ≠ 0)");
    expect(negatedRelations(`t ${slash} = 0`)).toBe("t ≠ 0");
    expect(negatedRelations(`a${slash}<b, a>${slash}b`)).toBe("a≮b, a≯b");
    expect(negatedRelations(`x${slash}≤1, x${slash}≥1`)).toBe("x≰1, x≱1");
    expect(negatedRelations(`x${slash}∈A, A${slash}⊂B, A⊆${slash}B, a${slash}≡b`)).toBe("x∉A, A⊄B, A⊈B, a≢b");
    // Nothing to compose: left as it is.
    expect(negatedRelations("x = 1, ã")).toBe("x = 1, ã");
    expect(negatedRelations(`a${slash}b`)).toBe(`a${slash}b`);
  });

  it("are composed by the normalizer too", () => {
    expect(normalizeText(`(t${slash}= 0)`)).toBe("(t≠ 0)");
    expect(normalizeText(cdi3Line)).not.toContain(slash);
  });

  it("keep CDI3 1(a)'s relations once composed", () => {
    // Raw, «t̸=» counted as a second «=»: every reading was set aside and the crop shown.
    const composed = normalizeText(cdi3Line);
    expect(composed).toContain("(t≠ 0)");
    expect(PDFQuestionReading.lostRelation(composed, cdi3Reading)).toBeNull();
    // The check composes the text it is given as well.
    expect(PDFQuestionReading.lostRelation(cdi3Line, cdi3Reading)).toBeNull();
    // «≠» read as «=» is still lost.
    expect(PDFQuestionReading.lostRelation(composed, "$y'=\\frac{1}{t}y-t\\cos t+t^2$ $(t=0)$")).toBe("≠");
  });

  it("take one relation short of several for a slip, but not a lost or swapped sign", () => {
    // Two «=» on the page, one read: a slip, shown rather than the crop.
    expect(PDFQuestionReading.isMinorRelationShortfall("x = 1 e y = 2", "$x = 1$, $y 2$")).toBe(true);
    expect(PDFQuestionReading.isMinorRelationShortfall("a ≤ b ≤ c", "$a \\leq b, c$")).toBe(true);
    // The only relation lost (CDI 1(e) «x < 1/x» read as «1/x»): a side of the formula gone.
    expect(PDFQuestionReading.isMinorRelationShortfall("e) x <, ⏎ x", "e) $\\frac{1}{x}$,")).toBe(false);
    // «≠» read as «=»: wrong maths, never shown.
    expect(PDFQuestionReading.isMinorRelationShortfall("y = 1 (t ≠ 0)", "$y = 1$ $(t = 0)$")).toBe(false);
    // «≤» read as «=» (CDI 1(o)).
    expect(PDFQuestionReading.isMinorRelationShortfall("o) |x|≤|x−2|, a = b", "o) $|x| = |x-2|$, $a = b$")).toBe(false);
    // Two lost.
    expect(PDFQuestionReading.isMinorRelationShortfall("a = b = c = d", "$a = b c d$")).toBe(false);
    // Nothing lost is no shortfall at all.
    expect(PDFQuestionReading.isMinorRelationShortfall("a = b", "$a = b$")).toBe(false);
  });
});

describe("a reading that lost a relation or a root", () => {
  it("is told apart", () => {
    expect(PDFQuestionReading.lostRelation("e) x <, ⏎ x", "e) $\\frac{1}{x}$,")).toBe("<");
    expect(PDFQuestionReading.lostRelation("e) x <, ⏎ x", "e) $x < \\frac{1}{x}$,")).toBeNull();
    expect(PDFQuestionReading.lostRelation("b) x2 ≤2−x4,", "b) $x^{2} \\leq 2 - x^{4}$,")).toBeNull();
    expect(PDFQuestionReading.lostRelation("d) x−1 ⏎ x2 ⏎ −1 ≤1,", "d) $\\frac{x-1}{x^2-1} \\le 1$,")).toBeNull();
    expect(PDFQuestionReading.lostRelation("o) |x|≤|x−2|,", "o) $|x| = |x-2|$")).toBe("≤");
    expect(PDFQuestionReading.readsRootIndex("g) $\\sqrt[3]{x-1} = \\sqrt{x-1}$")).toBe(true);
    expect(PDFQuestionReading.readsRootIndex("g) $\\sqrt{x-1} = \\sqrt{x-1}$")).toBe(false);
  });
});
