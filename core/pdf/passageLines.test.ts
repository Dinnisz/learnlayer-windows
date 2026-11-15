import { describe, expect, it } from "vitest";
import { pageFromLines, sansAdvance } from "./page";
import { passageLinesOf } from "./passageLines";

describe("passageLinesOf", () => {
  it("numbers the lines from the margin numbers level with them", () => {
    const body = Array.from({ length: 12 }, (_, row) => ({
      text: `Linha ${row + 1} do texto`,
      x: 90,
      baseline: 700 - 16 * row,
      fontSize: 11,
      advance: sansAdvance,
    }));
    // The exam prints 5 and 10 in the margin; the text layer stores them after the text.
    const margin = [5, 10].map((number) => ({
      text: String(number),
      x: 60,
      baseline: 700 - 16 * (number - 1),
      fontSize: 9,
      advance: sansAdvance,
    }));
    const lines = passageLinesOf(pageFromLines([...body, ...margin]));
    expect(lines.length).toBe(12);
    expect(lines[0]).toEqual({ number: 1, text: "Linha 1 do texto" });
    expect(lines[4]!.number).toBe(5);
    expect(lines[9]!.number).toBe(10);
    expect(lines[11]!.number).toBe(12);
  });

  it("leaves an unnumbered page unnumbered", () => {
    const page = pageFromLines([
      { text: "Um texto sem números", x: 72, baseline: 700, fontSize: 11 },
      { text: "na margem.", x: 72, baseline: 684, fontSize: 11 },
    ]);
    expect(passageLinesOf(page)).toEqual([
      { number: null, text: "Um texto sem números" },
      { number: null, text: "na margem." },
    ]);
  });
});
