// Port of LearnLayerTests/PassageTests.swift @ ref 2026-11-04
// (`MascotClearanceTests` in the same file is a layout constant, ported with the answer view in phase 3.)

import { describe, expect, it } from "vitest";
import { charactersIn, evidenceAnswer, locate, passageChunk, splittingFootnotes, type PassageLine } from "./passage";
import { decodeProblemSolution } from "./problemSolution";

describe("Passage", () => {
  it("finds a quote across hyphenation and line breaks", () => {
    const source = "o mar desbo-\ncadamente alto naquela tarde";
    const range = locate("o mar desbocadamente alto", source);
    expect(range).not.toBeNull();
    expect(charactersIn(source, range!)).toContain("desbo");
  });

  it("an invented quote is not found", () => {
    expect(locate("a montanha nevada no inverno", "O narrador descreve a praia ao entardecer.")).toBeNull();
  });

  it("a passage chunk joins a hyphenated line", () => {
    const chunk = passageChunk([
      { number: 5, text: "desbo-" },
      { number: 6, text: "cadamente" },
    ]);
    expect(chunk.text).toBe("desbocadamente");
    expect(chunk.markers).toContainEqual({ number: 5, offset: 0 });
  });

  it("a footnote digit glued to a word is split off as a mark", () => {
    const chunk = passageChunk([{ number: null, text: "Reluz, viscoso, o rio; apressam-se as obreiras5; E num" }]);
    expect(chunk.text).toBe("Reluz, viscoso, o rio; apressam-se as obreiras; E num");
    expect(chunk.footnotes).toEqual([{ offset: "Reluz, viscoso, o rio; apressam-se as obreiras".length, number: 5 }]);
  });

  it("footnote offsets follow earlier lines", () => {
    const chunk = passageChunk([
      { number: null, text: "uma linha" },
      { number: null, text: "e as pilastras6 de ferro" },
    ]);
    expect(chunk.text).toBe("uma linha\ne as pilastras de ferro");
    expect(chunk.footnotes).toEqual([{ offset: "uma linha\ne as pilastras".length, number: 6 }]);
  });

  // Port of PassageTests.passageChunkKeepsOneVersePerLine @ 5701363: the «Texto de apoio» shows a poem as printed,
  // one verse per line, its numbers at the start of theirs.
  it("keeps one verse per line", () => {
    const chunk = passageChunk([
      { number: 10, text: "Reluz, viscoso, o rio; apressam-se as obreiras5;" },
      { number: 11, text: "E num cardume negro, hercúleas, galhofeiras," },
      { number: 12, text: "Correndo com firmeza, assomam as varinas." },
    ]);
    expect(chunk.text.split("\n")).toEqual([
      "Reluz, viscoso, o rio; apressam-se as obreiras;",
      "E num cardume negro, hercúleas, galhofeiras,",
      "Correndo com firmeza, assomam as varinas.",
    ]);
    expect(chunk.markers).toEqual([{ offset: 0, number: 10 }]);
    // A quote over two verses is still found.
    expect(locate("galhofeiras, Correndo com firmeza", chunk.text)).not.toBeNull();
  });

  it("digits inside words and separate numbers stay", () => {
    expect(splittingFootnotes("H2O em 1880 e 12 homens").text).toBe("H2O em 1880 e 12 homens");
  });

  it("an answer shows the numbered lines around its quotes and only the quotes that exist", () => {
    const source: PassageLine[] = [
      { number: null, text: "Texto A" },
      { number: 1, text: "Era uma vez um mar" },
      { number: 2, text: "desbo-" },
      { number: 3, text: "cadamente alto naquela tarde," },
      { number: 4, text: "e a praia calava-se." },
      { number: 5, text: "Ninguém sabia porquê." },
    ];
    const part = decodeProblemSolution({
      parts: [
        {
          label: "1",
          answer: { text: "O mar é exagerado." },
          evidence: [
            { quote: "mar desbocadamente alto", point: "hipérbole", why: "exagera" },
            { quote: "uma montanha que não existe", point: "x", why: "y" },
          ],
        },
      ],
    }).parts[0]!;
    const answer = evidenceAnswer(part, source);
    expect(answer).not.toBeNull();
    expect(answer!.chunks).toHaveLength(1);
    // One line of the exam per line (the Mac's `PassageChunk` @ 5701363), the word split at a line end joined again.
    expect(answer!.chunks[0]!.text).toBe(
      "Era uma vez um mar\ndesbocadamente alto naquela tarde,\ne a praia calava-se.",
    );
    expect(answer!.located.map((item) => item.index)).toEqual([0]);
    expect(charactersIn(answer!.chunks[0]!.text, answer!.located[0]!.range)).toBe("mar\ndesbocadamente alto");
    expect(answer!.paragraphs).toEqual([{ text: "O mar é exagerado.", uses: [0] }]);
    expect(evidenceAnswer({ ...part, evidence: [part.evidence![1]!] }, source)).toBeNull();
  });
});
