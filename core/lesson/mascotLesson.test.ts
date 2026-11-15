// MascotLessonTests.swift, the decoding and guard cases: what the app accepts from the model before it plays a lesson.

import { describe, expect, it } from "vitest";
import { MascotLessonPrompt } from "./mascotLessonPrompt";
import {
  CalcCheck,
  LessonStream,
  MascotLessons,
  RepeatGuard,
  type LessonBeat,
  type MascotLesson,
} from "./mascotLesson";

const reply = `Here you go:
{"beats":[
  {"kind":"wrong","say":"Quase toda a gente pensa que a corrente se divide ao meio.","show":[{"op":"crossOut","option":"C","quote":null,"box":null,"note":null},{"op":"zoom","option":"C","quote":null,"box":null,"note":null}],"calc":null,"check":null},
  {"kind":"explain","say":"Imagina dois canos lado a lado.","show":[{"op":"wiggle","option":null,"quote":"12 V","box":null,"note":null}],"calc":null,"check":null},
  {"kind":"play","say":"Com números pequenos fica claro.","show":[],"calc":{"line":"6 ÷ 2 = 4 A","fly":"12 V"},"check":null},
  {"kind":"play","say":"Agora com a fonte a doze volts.","show":[],"calc":{"line":"12 ÷ 3 = 4 A","fly":null},"check":null},
  {"kind":"check","say":"Antes de continuarmos, diz-me:","show":[],"calc":null,"check":{"ask":"Mais resistência dá mais corrente?","options":["Sim","Não"],"correct":1,"right":"Isso mesmo.","wrong":"Não, dá menos."}},
  {"kind":"explain","say":"Por isso a resposta é a B.","show":[{"op":"circle","option":"B","quote":null,"box":null,"note":null}],"calc":null,"check":null}
],
"summary":{"say":"Mais resistência, menos corrente.","key":"menos corrente"}}`;

const beat = (say: string, extra: Partial<LessonBeat> = {}): LessonBeat => ({
  kind: "explain",
  say,
  show: [],
  ...extra,
});
const lesson = (beats: LessonBeat[], summary: MascotLesson["summary"] = null): MascotLesson => ({ beats, summary });

describe("MascotLesson", () => {
  it("is read from the model's reply even with words around it", () => {
    const read = MascotLessons.decode(reply);
    expect(read.beats).toHaveLength(6);
    expect(read.beats[0]!.show.map((show) => show.op)).toEqual(["crossOut", "zoom"]);
    expect(read.summary?.key).toBe("menos corrente");
    expect(() => MascotLessons.decode("no json here")).toThrow();
    expect(() => MascotLessons.decode('{"beats":[{"say":"  "}],"summary":null}')).toThrow();
  });

  it("drops what it cannot draw or trust", () => {
    const read = MascotLessons.sanitized(MascotLessons.decode(reply));
    // "wiggle" is not a verb the app draws.
    expect(read.beats[1]!.show).toEqual([]);
    // 6 ÷ 2 is not 4: the line is not shown. 12 ÷ 3 = 4 is.
    expect(read.beats[2]!.calc).toBeNull();
    expect(read.beats[3]!.calc?.line).toBe("12 ÷ 3 = 4 A");
    // Six beats: the check stays.
    expect(read.beats[4]!.check?.options).toHaveLength(2);
  });

  it("keeps a check only in long lessons, and only one", () => {
    const short = MascotLessons.decode(reply);
    short.beats.splice(-2, 2);
    expect(MascotLessons.sanitized(short).beats.every((item) => !item.check)).toBe(true);
    const twice = MascotLessons.decode(reply);
    twice.beats.splice(5, 0, twice.beats[4]!);
    expect(MascotLessons.sanitized(twice).beats.filter((item) => item.check).length).toBe(1);
    const broken = MascotLessons.decode(reply);
    broken.beats[4]!.check!.options = ["só uma"];
    const cleaned = MascotLessons.sanitized(broken);
    expect(cleaned.beats[4]!.check).toBeNull();
    expect(cleaned.beats[4]!.kind).toBe("explain");
  });

  it("keeps the closing key only when it is in the closing sentence", () => {
    const read = MascotLessons.sanitized(lesson([beat("Olá.")], { say: "A ideia é simples.", key: "outra coisa" }));
    expect(read.summary?.key).toBeNull();
  });

  it("drops a beat that retells the solution", () => {
    const solution = [
      "Associamos as resistências em paralelo e calculamos a resistência equivalente total do circuito",
    ];
    const retold = "Associamos as resistências em paralelo e calculamos a resistência equivalente do circuito";
    expect(RepeatGuard.overlap(retold, solution)).toBeGreaterThan(RepeatGuard.limit);
    expect(
      RepeatGuard.overlap("Imagina dois canos lado a lado, a água escolhe o caminho mais fácil.", solution),
    ).toBeLessThan(0.3);
    const read = MascotLessons.sanitized(
      lesson([
        beat(retold),
        beat("Imagina dois canos lado a lado, a água escolhe o caminho mais fácil."),
        beat("Se uma das resistências fosse zero, a corrente fugia toda por ali."),
        beat("Por isso o total é sempre menor do que a mais pequena."),
      ]),
      { solutionTexts: solution },
    );
    expect(read.beats).toHaveLength(3);
    expect(read.beats.some((item) => item.say === retold)).toBe(false);
  });

  it("checks a calculation before it is shown", () => {
    expect(CalcCheck.isSound("6 ÷ 2 = 3 A")).toBe(true);
    expect(CalcCheck.isSound("I = 12 / 4 = 3 A")).toBe(true);
    expect(CalcCheck.isSound("2 × (3 + 1) = 8")).toBe(true);
    expect(CalcCheck.isSound("1,5 + 1,5 = 3 kΩ")).toBe(true);
    expect(CalcCheck.isSound("6 ÷ 2 = 4 A")).toBe(false);
    expect(CalcCheck.isSound("2 + 2 = 5")).toBe(false);
    expect(CalcCheck.isSound("R = 2 Ω")).toBe(true);
  });

  it("lets the streamed guards keep what the whole lesson keeps", () => {
    const raw = MascotLessons.decode(reply);
    for (const texts of [[], ["Quase toda a gente pensa que a corrente se divide ao meio."]]) {
      for (const count of [2, 4, 5, 6]) {
        const whole = lesson(raw.beats.slice(0, count), raw.summary);
        const stream = new LessonStream(texts);
        const streamed = [...whole.beats.flatMap((item) => stream.add(item)), ...stream.finish()];
        expect(streamed, `${count} beats, solution ${texts.length}`).toEqual(
          MascotLessons.sanitized(whole, { solutionTexts: texts }).beats,
        );
      }
    }
    // A plain first beat is let through at once, before the rest has arrived.
    expect(new LessonStream(["outra coisa"]).add(raw.beats[0]!)).toHaveLength(1);
  });

  it("doesn't drop a beat about a step for sharing words with it", () => {
    const solution = [
      "Substituir valores: usam-se as percentagens como massas relativas e as massas molares do hidrogénio e do oxigénio.",
    ];
    const line = "Usam-se as percentagens como massas relativas e as massas molares do hidrogénio e do oxigénio.";
    const pointing = beat(line, { show: [{ op: "highlight", step: 1 }] });
    const others = [0, 1, 2].map((index) => beat(`Outra ideia diferente número ${index} sobre pesos e bolas.`));
    const kept = MascotLessons.sanitized(lesson([pointing, beat(line), ...others]), { solutionTexts: solution });
    expect(kept.beats.some((item) => item.say === line && item.show.length > 0)).toBe(true);
    expect(kept.beats.some((item) => item.say === line && item.show.length === 0)).toBe(false);
  });

  it("never marks the correct option, and an invented unit drops the calculation", () => {
    const wrong = beat("Olha para as duas.", {
      show: [
        { op: "zoom", option: "B" },
        { op: "zoom", option: "C" },
      ],
      calc: { line: "65 ÷ 16 ≈ 4 átomos por grama", fly: null },
    });
    const cleaned = MascotLessons.sanitized(lesson([wrong]), { withholding: "B" });
    expect(cleaned.beats[0]!.show.map((show) => show.option)).toEqual(["C"]);
    expect(cleaned.beats[0]!.calc).toBeNull();
    expect(MascotLessons.sanitized(lesson([wrong])).beats[0]!.show).toHaveLength(2);
  });

  it("cuts a long quote to its first six words", () => {
    const long = "átomos de hidrogénio e o número de átomos de oxigénio";
    const cleaned = MascotLessons.sanitized(lesson([beat("Repara.", { show: [{ op: "zoom", quote: long }] })]));
    expect(cleaned.beats[0]!.show[0]!.quote).toBe("átomos de hidrogénio e o número");
  });

  it("drops beats about options when the question has none, and LaTeX quotes", () => {
    const beats = [
      beat("Repara no termo A barra B.", {
        show: [
          { op: "zoom", quote: "AB\\bar{C}" },
          { op: "underline", quote: "ABC" },
        ],
      }),
      beat("A opção B tem um C negado.", { show: [{ op: "crossOut", option: "B" }] }),
      beat("Imagina B desligado."),
    ];
    const cleaned = MascotLessons.sanitized(lesson(beats), { hasOptions: false });
    expect(cleaned.beats.map((item) => item.say)).toEqual(["Repara no termo A barra B.", "Imagina B desligado."]);
    expect(cleaned.beats[0]!.show.map((show) => show.quote)).toEqual(["ABC"]);
    expect(MascotLessons.sanitized(lesson(beats)).beats).toHaveLength(3);
  });

  it("never lets the voice read LaTeX", () => {
    expect(MascotLessons.spokenWithoutLatex("o termo A\\bar{B}, e o que sobra?")).toBe(
      "o termo A B negado, e o que sobra?",
    );
    expect(MascotLessons.spokenWithoutLatex("sem comandos")).toBe("sem comandos");
  });
});

describe("MascotLessonPrompt", () => {
  it("forbids retelling and names Portugal's Portuguese", () => {
    const pt = MascotLessonPrompt.system("pt");
    expect(MascotLessonPrompt.version).toBe("14");
    expect(pt).toContain("European Portuguese (pt-PT)");
    expect(pt).toContain("TEACH THE WRITTEN SOLUTION, IN YOUR OWN WORDS");
    expect(pt).toContain('"step"');
    expect(pt).toContain("physically exact");
    expect(MascotLessons.minimumBeats).toBe(3);
    for (const word of ["crossOut", '"option"', '"quote"', '"box"']) expect(pt).toContain(word);
    const en = MascotLessonPrompt.system("en");
    expect(en).not.toContain("pt-PT");
    expect(en).not.toContain("você");
    const asked = MascotLessonPrompt.user({
      doubt: "porque não é a C?",
      question: "Q",
      options: { A: "2 mA" },
      optionLetters: ["A", "B"],
      subject: "Circuitos",
      work: "Step 1: parallel",
      hasPicture: true,
    });
    expect(asked).toContain("porque não é a C?");
    expect(asked).toContain("ON THE STUDENT'S SCREEN");
    expect(asked).toContain("A: 2 mA");
    const tap = MascotLessonPrompt.user({
      doubt: null,
      question: "Q",
      options: {},
      optionLetters: [],
      subject: null,
      work: null,
      hasPicture: false,
    });
    expect(tap).toContain("Explica-me");
    expect(tap).toContain("no written solution yet");
    expect(MascotLessonPrompt.schema["type"]).toBe("object");
  });
});
