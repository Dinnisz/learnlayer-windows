// Port of LearnLayerTests/StatementQuotesTests.swift @ ref 2026-11-04 (the decoding and schema cases are in
// problemSolution.test.ts and prompts.test.ts; the colour case is moot: one accent).

import { describe, expect, it } from "vitest";
import { StatementQuotes, type TextRange } from "./statementQuotes";

const statement = "Um carro parte com v0 = 12 m/s e acelera com a = 2 m/s² durante t = 5 s.";
const text = (range: TextRange, source: string) => source.slice(range.start, range.end);
const ranges = StatementQuotes.ranges;
const c = (code: number) => String.fromCodePoint(code);

describe("StatementQuotes matching", () => {
  it("finds an exact quote", () => {
    const found = ranges("v0 = 12 m/s", statement);
    expect(found.length).toBe(1);
    expect(text(found[0]!, statement)).toBe("v0 = 12 m/s");
  });

  it("matches the ohm and micro signs the Symbol font gives out", () => {
    const sheet = "1 kW\n2 kW\nR1 = 15 kW e C = 100 F";
    expect(ranges("1 kΩ", sheet).map((range) => text(range, sheet))).toEqual(["1 kW"]);
    expect(ranges("15 kΩ", sheet).length).toBe(1);
    expect(ranges("100 µF", sheet).map((range) => text(range, sheet))).toEqual(["100 F"]);
    expect(ranges("100 µF", "C = 100 µF").length).toBe(1);
    expect(ranges("3 kΩ", sheet)).toEqual([]);
  });

  it("matches plain letters to the math italic ones a PDF prints", () => {
    const page = `A. ${c(0x1d445)}${c(0x1d447)}${c(0x210e)} = 3 ${c(0x1d458)}Ω ${c(0x1d452)} ${c(0x1d449)}${c(0x1d447)}${c(0x210e)} = 6 ${c(0x1d449)}\nB. other`;
    expect(ranges("RTℎ = 3 kΩ e VTℎ = 6 V", page).length).toBe(1);
    expect(ranges("RTℎ = 3", "RTℎ = 3").length).toBe(1);
    expect(ranges("XTℎ = 3", page)).toEqual([]);
  });

  it("does not find a quote that is not in the statement", () => {
    expect(ranges("v0 = 15 m/s", statement)).toEqual([]);
    expect(ranges("12 metros por segundo", statement)).toEqual([]);
    expect(ranges("", statement)).toEqual([]);
    expect(ranges("   ", statement)).toEqual([]);
    expect(ranges("v0", "")).toEqual([]);
  });

  it("does not find a quote inside a longer number or word", () => {
    expect(ranges("12", "a massa é 120 kg")).toEqual([]);
    expect(ranges("car", "o carro")).toEqual([]);
    expect(ranges("120 kg", "a massa é 120 kg.").length).toBe(1);
  });

  it("matches spaces and line breaks with any run of them", () => {
    const broken = "parte com v0 =\n12  m/s e";
    const found = ranges("v0 = 12 m/s", broken);
    expect(found.length).toBe(1);
    expect(text(found[0]!, broken)).toBe("v0 =\n12  m/s");
  });

  it("finds every occurrence but underlines only the first", () => {
    const source = "t = 2 s depois, e de novo t = 2 s depois.";
    const found = ranges("t = 2 s", source);
    expect(found.length).toBe(2);
    expect(found[0]!.start).toBeLessThan(found[1]!.start);
    const lines = StatementQuotes.underlines([["t = 2 s"]], 0, source);
    expect(lines.length).toBe(1);
    expect(lines[0]!.range).toEqual(found[0]);
  });

  it("keeps the UTF-16 ranges of Unicode quotes", () => {
    const v = c(0x1d463);
    const source = `Sabe-se que ${v}₀ = 3 m/s, θ = 30° e a = 2 m/s²; ângulo reto.`;
    for (const quote of [`${v}₀ = 3 m/s`, "θ = 30°", "a = 2 m/s²", "ângulo"]) {
      const found = ranges(quote, source);
      expect(found.length, quote).toBe(1);
      expect(text(found[0]!, source)).toBe(quote);
    }
    expect(ranges(v, source)).toEqual([]);
    expect(ranges("(x+1)", "seja f(x) = (x+1)^2").length).toBe(1);
  });

  it("matches doubled, Unicode or plain signs and superscripts with their digits", () => {
    const doubled = "1. Find the local maxima and minima of f(x) == x³ −− 3x² −− 9x ++ 5.";
    const plain = "1. Find the local maxima and minima of f(x) = x3 - 3x2 - 9x + 5.";
    const caret = "f(x) = x^3 − 3x^2 − 9x + 5";
    const tight = "f(x)=x³−3x²−9x+5";
    for (const quote of ["x³ −− 3x² −− 9x ++", "x³ − 3x² − 9x +"]) {
      for (const source of [doubled, plain, caret, tight])
        expect(ranges(quote, source).length, `${quote} in ${source}`).toBe(1);
    }
    for (const source of [doubled, plain, tight]) expect(ranges("x3 - 3x2 - 9x +", source).length, source).toBe(1);
    expect(ranges("x³ −− 3x² −− 9x ++", doubled).map((range) => text(range, doubled))).toEqual(["x³ −− 3x² −− 9x ++"]);
    expect(ranges("x³ − 3x²", plain).map((range) => text(range, plain))).toEqual(["x3 - 3x2"]);
    expect(ranges("f(x) == x³", plain).length).toBe(1);
    expect(ranges("−− 9x ++", doubled).map((range) => text(range, doubled))).toEqual(["−− 9x ++"]);
    expect(ranges("x³ + 3x²", plain)).toEqual([]);
    expect(ranges("x² − 3x²", plain)).toEqual([]);
    expect(ranges("9x − 5", plain)).toEqual([]);
    expect(ranges("−−", "   ")).toEqual([]);
  });
});

describe("StatementQuotes colours", () => {
  it("follows first use and skips quotes not in the statement", () => {
    const steps = [["v0 = 12 m/s", "não existe"], ["a = 2 m/s²", "v0 = 12 m/s"], ["t = 5 s"]];
    expect(Object.fromEntries(StatementQuotes.palette(steps, statement))).toEqual({
      "v0 = 12 m/s": 0,
      "a = 2 m/s²": 1,
      "t = 5 s": 2,
    });
  });

  it("is stable across calls and spacing", () => {
    const steps = [["a = 2 m/s²"], ["v0  =  12 m/s"], ["t = 5 s", "a = 2 m/s²"]];
    const first = StatementQuotes.palette(steps, statement);
    expect([...StatementQuotes.palette(steps, statement)]).toEqual([...first]);
    expect(first.get("v0 = 12 m/s")).toBe(1);
    const fromStep0 = StatementQuotes.underlines(steps, 0, statement);
    const fromStep2 = StatementQuotes.underlines(steps, 2, statement);
    expect(fromStep0.find((line) => line.quote === "a = 2 m/s²")?.color).toBe(
      fromStep2.find((line) => line.quote === "a = 2 m/s²")?.color,
    );
  });

  it("keeps every datum in its own place", () => {
    const quotes = Array.from({ length: 8 }, (_, index) => `x${index} = ${index}`);
    const colors = StatementQuotes.palette([quotes], quotes.join(", "));
    expect(colors.get("x0 = 0")).toBe(0);
    expect(colors.get("x5 = 5")).toBe(5);
    expect(colors.get("x6 = 6")).toBe(6);
    expect(new Set(colors.values()).size).toBe(8);
  });
});

describe("StatementQuotes active step", () => {
  it("takes the open step from the mode", () => {
    expect(StatementQuotes.openStep(true, false, 1, 4, 3)).toBe(1);
    expect(StatementQuotes.openStep(true, false, null, 4, 3)).toBeNull();
    expect(StatementQuotes.openStep(true, false, 7, 4, 3)).toBeNull();
    expect(StatementQuotes.openStep(false, true, null, 2, 3)).toBe(1);
    expect(StatementQuotes.openStep(false, true, null, 0, 3)).toBeNull();
    expect(StatementQuotes.openStep(false, true, null, 4, 3)).toBeNull();
    expect(StatementQuotes.openStep(false, false, 1, 2, 3)).toBeNull();
  });

  it("lets hover win over the open step", () => {
    expect(StatementQuotes.shownStep(0, 2)).toBe(2);
    expect(StatementQuotes.shownStep(0, null)).toBe(0);
    expect(StatementQuotes.shownStep(null, null)).toBeNull();
  });

  it("underlines only the active step's own data", () => {
    const steps = [["v0 = 12 m/s", "a = 2 m/s²"], ["t = 5 s"], []];
    const first = StatementQuotes.underlines(steps, 0, statement);
    expect(first.map((line) => line.quote)).toEqual(["v0 = 12 m/s", "a = 2 m/s²"]);
    expect(first.map((line) => line.color)).toEqual([0, 1]);
    expect(first.every((line) => text(line.range, statement) === line.quote)).toBe(true);
    const second = StatementQuotes.underlines(steps, 1, statement);
    expect(second.map((line) => line.quote)).toEqual(["t = 5 s"]);
    expect(second[0]?.color).toBe(2);
    expect(StatementQuotes.underlines(steps, 2, statement)).toEqual([]);
    expect(StatementQuotes.underlines(steps, null, statement)).toEqual([]);
    expect(StatementQuotes.underlines(steps, 9, statement)).toEqual([]);
  });

  it("skips an invented quote silently", () => {
    const lines = StatementQuotes.underlines([["v0 = 13 m/s", "a = 2 m/s²"]], 0, statement);
    expect(lines.map((line) => line.quote)).toEqual(["a = 2 m/s²"]);
    expect(lines[0]?.color).toBe(0);
  });

  it("gives the part and its group the group's colours", () => {
    const group = "Um carro parte com v0 = 12 m/s. 1.1 Ao fim de t = 5 s, qual é a velocidade?";
    const part = "1.1 Ao fim de t = 5 s, qual é a velocidade?";
    const steps = [["v0 = 12 m/s"], ["t = 5 s"]];
    const colors = StatementQuotes.palette(steps, group);
    const onPart = StatementQuotes.underlines(steps, 1, part, { colors });
    expect(onPart.map((line) => line.quote)).toEqual(["t = 5 s"]);
    expect(onPart[0]?.color).toBe(1);
    expect(StatementQuotes.underlines(steps, 0, part, { colors })).toEqual([]);
  });

  it("underlines the data the sentence being said names", () => {
    const steps = [["v0 = 12 m/s"], ["t = 5 s"]];
    const spoken = "Primeiro lemos os dados. A velocidade inicial é v0 = 12 m/s. Depois usamos o tempo.";
    const saying = StatementQuotes.sentence(40, spoken);
    expect(saying).toContain("v0 = 12 m/s");
    expect(StatementQuotes.underlines(steps, null, statement, { spoken: saying }).map((line) => line.quote)).toEqual([
      "v0 = 12 m/s",
    ]);
    expect(StatementQuotes.underlines(steps, 1, statement, { spoken: saying }).map((line) => line.quote)).toEqual([
      "t = 5 s",
      "v0 = 12 m/s",
    ]);
    const first = StatementQuotes.sentence(0, spoken);
    expect(StatementQuotes.underlines(steps, null, statement, { spoken: first })).toEqual([]);
    expect(StatementQuotes.sentence(500, spoken)).toBeNull();
    expect(StatementQuotes.sentence(-1, spoken)).toBeNull();
  });

  it("does not also underline a magnified quote", () => {
    const source = "Se eu investir 1000 € a 5% ao ano, com juros compostos anualmente, quanto terei ao fim de 10 anos?";
    const lines = StatementQuotes.underlines(
      [["1000 € a 5% ao ano,", "5% ao ano, com juros compostos", "10 anos"]],
      0,
      source,
    );
    expect(lines.map((line) => line.quote)).toEqual([
      "1000 € a 5% ao ano,",
      "5% ao ano, com juros compostos",
      "10 anos",
    ]);
    const lens = lines[0]!;
    const left = StatementQuotes.excluding(lens, lines);
    expect(left.map((line) => line.quote)).toEqual(["10 anos"]);
    expect(StatementQuotes.excluding(null, lines)).toEqual(lines);
  });
});
