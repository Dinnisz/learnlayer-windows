// Port of LearnLayerTests/PrintedSpellingTests.swift and the label cases of AlineaGridTests.swift
// (aPartsLabelReadAsALookalikeIsSetRight) @ 5701363.
import { describe, expect, it } from "vitest";
import { keepingSpelling, PrintedSpelling } from "./printedSpelling";
import { Transcriptions, type QuestionTranscription, type TranscriptionBlock } from "./questionTranscription";

const block = (type: string, text: string): TranscriptionBlock => ({ type, text, box: null, caption: null });
const reading = (...texts: string[]): QuestionTranscription => ({ blocks: texts.map((text) => block("text", text)) });

describe("PrintedSpelling", () => {
  /** MAP2 Q5 as Preview gives it: words glued, accents read through the wrong code page. */
  const map2 =
    "5) (2.0)SejaA2M3 3(R)talquepA( )=(2 )(3 )2. EscrevaA 1 comocombinaÁ„olineardas matrizesA2;AeI,ecalculeopolinÛmiocaracterÌsticodeA 1";

  it("repairs the code page", () => {
    expect(PrintedSpelling.repairedCodePage(map2)).toContain("combinaçãolineardas");
    expect(PrintedSpelling.repairedCodePage(map2)).toContain("polinómiocaracterístico");
    expect(PrintedSpelling.repairedCodePage("polinómio característico")).toBe("polinómio característico");
  });

  it("gives Brazilian spelling the page's accents", () => {
    const read = "e calcule o polinômio característico de $A^{-1}$.";
    expect(PrintedSpelling.keeping(read, map2)).toBe("e calcule o polinómio característico de $A^{-1}$.");
    expect(PrintedSpelling.keeping("o polinômio de $A$", "calcule o polinómio de A")).toBe("o polinómio de $A$");
  });

  it("leaves words as printed, or not on the page, alone", () => {
    expect(PrintedSpelling.keeping("o polinômio", "o polinômio")).toBe("o polinômio");
    expect(PrintedSpelling.keeping("o polinômio", "o polinOmio")).toBe("o polinômio");
    expect(PrintedSpelling.keeping("está bem", "o estado")).toBe("está bem");
    expect(PrintedSpelling.keeping("$\\text{polinômio}$", "polinómio")).toBe("$\\text{polinômio}$");
  });

  it("changes only prose blocks", () => {
    const found: QuestionTranscription = {
      blocks: [block("text", "Calcule o polinômio característico."), block("formula", "p_A(\\lambda)")],
    };
    const kept = keepingSpelling(found, map2);
    expect(kept.blocks[0]!.text).toBe("Calcule o polinómio característico.");
    expect(kept.blocks[1]).toEqual(found.blocks[1]);
    expect(keepingSpelling(kept, map2)).toEqual(kept);
  });
});

describe("a part's label read as a lookalike", () => {
  it("is set right", () => {
    const stem = block("text", "1. Resolva as seguintes equações e inequações:");
    const one: QuestionTranscription = {
      blocks: [stem, block("text", "1) $\\ln \\left(\\frac{1}{x}\\right) \\geq 0$")],
    };
    const fixed = Transcriptions.withLookalikeLabel(one, "l");
    expect([...Transcriptions.partLabels(fixed)]).toEqual(["l"]);
    expect(fixed.blocks[0]!.text).toBe(stem.text);
    // Already right, or not a lookalike: unchanged.
    expect(Transcriptions.withLookalikeLabel(reading("l) $x$"), "l").blocks[0]!.text).toBe("l) $x$");
    expect([...Transcriptions.partLabels(Transcriptions.withLookalikeLabel(reading("9) $x^4$"), "q"))]).toEqual(["q"]);
    expect(Transcriptions.partLabels(Transcriptions.withLookalikeLabel(reading("7) $x$"), "l")).size).toBe(0);
    // The app's reading of the part's own picture takes the PDF's label.
    const local = Transcriptions.withPartLabel(reading("I) $\\ln x$"), "l)");
    expect(local.blocks[0]!.text).toBe("l) $\\ln x$");
    const none = Transcriptions.withPartLabel(reading("$\\ln x \\geq 0$"), "l)");
    expect([...Transcriptions.partLabels(none)]).toEqual(["l"]);
  });
});
