// Port of the RouteDecision, PassagePages, QuestionText and TextLayerMath cases of LearnLayerTests
// (SolutionProviderRouteTests, BiologyRoutingTests, KnownSubjectRouteTests, LiveRunFixTests, TextLayerMathTests)
// @ ref 2026-11-04. The cases that go through SolutionProvider.classifiedRoute are ported with it.

import { describe, expect, it } from "vitest";
import { RouteDecision, type Classification } from "./routeDecision";
import { PassagePages, QuestionText, TextLayerMath } from "./textChecks";

const classification = (kind: string, needsStrong = false, reason = "", raw = ""): Classification => ({
  kind,
  needsStrong,
  reason,
  raw,
});
const reading = (reason = "commentary") => classification("reading", false, reason);

describe("RouteDecision", () => {
  it("is fast only when the classifier says reading", () => {
    const essay = "Explica o impacto da revolução de 1820, a partir do documento n.º 2.";
    const fast = RouteDecision.decide(reading("commentary on a text"), "História A");
    expect(fast.needsStrongModel).toBe(false);
    expect(fast.kind).toBe("reading");
    expect(fast.reason).toBe("commentary on a text");
    expect(RouteDecision.decide(reading(), "Filosofia").needsStrongModel).toBe(false);
    expect(RouteDecision.decide(null, "História A").needsStrongModel).toBe(true);
    expect(RouteDecision.decide(null, "História A").reason).toBe("classifier failed");
    const calculation = classification("calculation", true, "a numeric result");
    expect(RouteDecision.decide(calculation, "História A").needsStrongModel).toBe(true);
    expect(RouteDecision.decide(calculation, "História A").kind).toBe("calculation");
    expect(RouteDecision.decide(classification("figure_data", true, "read the graph")).kind).toBe("figure_data");
    expect(RouteDecision.decide(classification("mixed", false, "both")).needsStrongModel).toBe(true);
    expect(RouteDecision.decide(classification("reading", true, "unsure"), "Filosofia").needsStrongModel).toBe(false);
    expect(
      RouteDecision.decide(classification("reading", true, "afirmações I a V sobre o texto"), "Português")
        .needsStrongModel,
    ).toBe(false);
    expect(
      RouteDecision.decide(classification("reading", true, "a calculation is required"), "Filosofia").needsStrongModel,
    ).toBe(true);
    expect(RouteDecision.decide(classification("reading", true, "ler o gráfico")).needsStrongModel).toBe(true);
    expect(RouteDecision.hardOverride(essay)).toBeNull();
    expect(RouteDecision.decide(reading(), null).needsStrongModel).toBe(false);
  });

  it("sends an equation or a unit to the strong model without the classifier", () => {
    const reason = (text: string) => RouteDecision.hardOverride(text)?.reason;
    expect(reason("Resolve 2x + 5 = 11.")).toBe("equation");
    expect(reason("计算 \\int_0^1 x^2 \\, dx")).toBe("equation");
    expect(reason("Simplifica x² + 1.")).toBe("equation");
    expect(reason("Explain how plants use CO₂.")).toBe("equation");
    expect(reason("On donne P(A) = 0,3.")).toBe("equation");
    expect(RouteDecision.hardOverride("On donne P(A).")).toBeNull();
    expect(reason("f(x)")).toBe("equation");
    expect(reason("Estuda f'(x) = 0.")).toBe("equation");
    expect(reason("Calcula x^2 + 1.")).toBe("equation");
    expect(reason("Resolve 2x.")).toBe("equation");
    expect(reason("Simplifica x2 + 1.")).toBe("equation");
    expect(reason("Determine a distância, 5 km.")).toBe("unit");
    expect(reason("Calcule a energia libertada, em kJ.")).toBe("unit");
    expect(reason("A temperatura é 20 °C.")).toBe("unit");
    expect(
      RouteDecision.hardOverride(
        "Decreto-Lei n.º 55/2018. Prova 623/1.ª Fase. Linhas 23 a 27. O valor da moeda em 1820.",
      ),
    ).toBeNull();
  });

  it("lets a subject force strong, never fast", () => {
    const commentary = reading();
    expect(RouteDecision.decide(commentary, "Mathematics").needsStrongModel).toBe(true);
    expect(RouteDecision.decide(commentary, "Matemática A").reason).toBe("quantitative subject");
    expect(RouteDecision.decide(commentary, "数学").needsStrongModel).toBe(true);
    expect(RouteDecision.decide(commentary, "Física").needsStrongModel).toBe(true);
    expect(RouteDecision.decide(commentary, "Química").needsStrongModel).toBe(true);
    expect(RouteDecision.decide(commentary, "Biology and Geology").needsStrongModel).toBe(false);
    expect(RouteDecision.decide(commentary, "Biologia e Geologia").reason).not.toBe("quantitative subject");
    expect(RouteDecision.decide(commentary, "Geologia").needsStrongModel).toBe(false);
    expect(
      RouteDecision.decide(classification("calculation", true, "numeric"), "Biologia e Geologia").needsStrongModel,
    ).toBe(true);
    expect(RouteDecision.decide(null, "Biologia e Geologia").needsStrongModel).toBe(true);
    expect(RouteDecision.decide(commentary, "História A").needsStrongModel).toBe(false);
    expect(RouteDecision.decide(commentary, "Filosofia").needsStrongModel).toBe(false);
    expect(RouteDecision.decide(null, "History A").needsStrongModel).toBe(true);
  });

  it("sends biology and geology reading to the fast model", () => {
    for (const subject of ["Biologia e Geologia", "Biology and Geology", "Geologia", "Biologia"]) {
      const route = RouteDecision.decide(classification("reading", false, "commentary on a text"), subject);
      expect(route.needsStrongModel).toBe(false);
      expect(route.kind).toBe("reading");
      expect(route.reason).not.toBe("quantitative subject");
    }
    const subject = "Biologia e Geologia";
    expect(RouteDecision.decide(classification("figure_data", true), subject).needsStrongModel).toBe(true);
    expect(RouteDecision.decide(classification("reading"), "Física e Química A").reason).toBe("quantitative subject");
  });

  it("reads the classifier's JSON strictly", () => {
    const raw = '{"kind":"reading","needs_strong":false,"reason":"commentary"}';
    const parsed = RouteDecision.parseClassifier(raw)!;
    expect(parsed).toEqual({ kind: "reading", needsStrong: false, reason: "commentary", raw });
    expect(RouteDecision.parseClassifier("not json")).toBeNull();
    expect(RouteDecision.parseClassifier('{"kind":"essay","needs_strong":false,"reason":"x"}')).toBeNull();
    expect(RouteDecision.parseClassifier('{"kind":"reading","reason":"x"}')).toBeNull();
    expect(
      RouteDecision.parseClassifier('```json\n{"kind":"figure_data","needs_strong":true,"reason":"graph"}\n```')?.kind,
    ).toBe("figure_data");
  });

  it("knows the subjects that need no classifier", () => {
    expect(RouteDecision.knownSubject("Matemática A")?.needsStrongModel).toBe(true);
    expect(RouteDecision.knownSubject("Physics and Chemistry A")?.needsStrongModel).toBe(true);
    expect(RouteDecision.knownSubject("FQA")?.needsStrongModel).toBe(true);
    expect(RouteDecision.knownSubject("Biologia e Geologia")?.needsStrongModel).toBe(false);
    expect(RouteDecision.knownSubject("Português")?.needsStrongModel).toBe(false);
    expect(RouteDecision.knownSubject("História A")?.kind).toBe("reading");
    expect(RouteDecision.knownSubject(null)).toBeNull();
    expect(RouteDecision.knownSubject("")).toBeNull();
    expect(RouteDecision.knownSubject("Underwater basket weaving")).toBeNull();
  });

  it("does not take choice markers, plural suffixes or degree marks for equations", () => {
    const samples = [
      "g (A)",
      "g(A)",
      "desde que essa ação (A) seja",
      "Estado (A)",
      "Estado(A)",
      "nomeadamente (A)",
      "nomeadamente(A)",
      "ocorre (A) (B) (C) (D)",
      "o(s)",
      "gráfico(s)",
      "função(ões)",
      "aluno(es)",
      "carta(as)",
      "livro(os)",
      "20o N",
      "latitude 20º N",
      "Prova 623/1.ª Fase",
      "f(s)",
    ];
    for (const sample of samples) expect(RouteDecision.hardOverride(sample), sample).toBeNull();
    for (const formula of ["f(x)", "Resolve 2x + 1.", "Calcula x^2.", "Simplifica x² + 1."]) {
      expect(RouteDecision.hardOverride(formula)?.reason, formula).toBe("equation");
    }
  });

  it("sends a comparison across two texts to the strong model with both pages", () => {
    const port2 =
      "Na descrição dos ambientes representados nos dois excertos, ganham relevo os estímulos sensoriais. Compare o ambiente do mercado do peixe em Memorial do Convento (linhas 11 a 16) com o ambiente do mercado da Praça da Figueira em O Ano da Morte de Ricardo Reis (linhas 23 a 27), com base em duas sensações distintas captadas pelos sentidos, relativamente a cada um desses ambientes.";
    expect(RouteDecision.hardOverride(port2)?.needsStrongModel).toBe(true);
    expect(RouteDecision.hardOverride(port2)?.reason).toBe("two texts");
    expect(PassagePages.indexesToSend(2, 16, port2)).toEqual([1, 2]);
    expect(RouteDecision.hardOverride("Compare Text A (lines 1 to 4) with Text B (lines 10 to 14).")?.reason).toBe(
      "two texts",
    );
    expect(
      RouteDecision.hardOverride("Comparez le texte A (lignes 1 à 4) avec le texte B (lignes 10 à 14).")?.reason,
    ).toBe("two texts");
    const oneExcerpt =
      "Releia o primeiro parágrafo do excerto extraído de Memorial do Convento. Explicite o dilema com o qual Baltasar se debate, tendo em conta tanto a sua condição física como a sua condição económica.";
    expect(RouteDecision.hardOverride(oneExcerpt)).toBeNull();
    expect(PassagePages.indexesToSend(2, 16, oneExcerpt)).toEqual([2]);
    const sameText =
      "No excerto compreendido entre «Ricardo Reis rodeou a praça» (linha 27) e «sombra e humidade» (linha 34), o narrador privilegia o ponto de vista de Ricardo Reis.";
    expect(RouteDecision.hardOverride(sameText)).toBeNull();
    expect(RouteDecision.hardOverride("Compare as linhas 11 a 16 com as linhas 23 a 27 do mesmo excerto.")).toBeNull();
    expect(PassagePages.referencedPageNumbers("Leia as páginas 2 e 3 antes de responder.")).toEqual([2, 3]);
    expect(PassagePages.indexesToSend(2, 16, "Veja as páginas 2 e 3.")).toEqual([1, 2]);
    expect(PassagePages.referencedPageNumbers("Duração da Prova: 120 minutos. 14 Páginas")).toEqual([]);
    expect(PassagePages.referencedPageNumbers("linhas 11 a 16 e linhas 23 a 27")).toEqual([]);
  });
});

describe("QuestionText", () => {
  it("uses the solver's ask for a garbled interval", () => {
    const extracted = "2.3. No intervalo , 1 0- 6@ , estude a função.";
    expect(QuestionText.isGarbledMath(extracted)).toBe(true);
    expect(QuestionText.isGarbledMath("2.2. Estude o sinal de f no intervalo ]−∞, 3[.")).toBe(false);
    expect(QuestionText.displayed(extracted, "Estude a função no intervalo [-1, 0].")).toBe(
      "2.3. Estude a função no intervalo [-1, 0].",
    );
    const clean = "2.2. Estude o sinal de f no intervalo ]−∞, 3[.";
    expect(QuestionText.displayed(clean, "Outra frase.")).toBe(clean);
    const glued = "2.3.@- 6 10, ,";
    expect(QuestionText.isGarbledMath(glued)).toBe(true);
    expect(QuestionText.isGarbledMath("@- 6 10, ,")).toBe(true);
    const transcribed = QuestionText.displayed(glued, "Mostre que a função h tem um zero no intervalo [-1, 0].");
    expect(transcribed).toBe("2.3. Mostre que a função h tem um zero no intervalo [-1, 0].");
    expect(transcribed).not.toContain("@");
  });

  it("lists glued decimal parts", () => {
    expect(
      QuestionText.decimalPartLabels("2.1. Determine o valor de a.\n2.2. Estude o sinal.\n2.3.@- 6 10, ,"),
    ).toEqual(["2.1", "2.2", "2.3"]);
    expect(QuestionText.decimalPartLabels("2.3.1 Isto não é um item.")).toEqual([]);
  });
});

describe("TextLayerMath", () => {
  it.each([
    "0 2 0 (2) (2,5 val.) Para A= ( \\1 0−1 1 0−1 \\ ), determine eAt ... dx 0 dt= Ax ... condição inicial x(1) = ( \\0 1 \\ ).",
    "⌠ | { | ⌡ xux−xuy = u u(x,0) = x2, x>0",
    "X 1 CLK 1J 1K C1 Q1 0 Z Q0 1D 0 C1",
    "A= {x∈R : |x−2| (2−x2) ≥0} B= {(−1)n: n∈N } n ... ]−√2,√2[∪{2}",
    "Seja A= (2−x2) e indique o domínio.",
    "Considere B= {(−1)n: n∈N} e indique o supremo.",
    "Considere o conjunto {x∈R : x > 1} e indique o ínfimo.",
    "Mostre que C= ]0,1[∪{2} não é um intervalo.",
    "Mostre que o número √2 é irracional.",
    "Considere B= {1, 2, 3} n e indique o máximo.",
  ])("spots a garbled text layer: %s", (text) => {
    expect(TextLayerMath.looksGarbled(text)).toBe(true);
  });

  it.each([
    "Resolva a equação diferencial y'' + 2y = 0, com y(0) = 1 e y'(0) = 0.",
    "Determine a solução geral da equação y'' + 2y = 0 e indique o seu domínio.",
    "Considere a função f : R \\{0}→R definida por f(x) = 2x + 1.",
    "Qual é a resistência equivalente?\nA) 12 V\nB) 24 V\nC) 36 V",
    "Considere a função f(x) = x + 1 e o conjunto A = {1, 2, 3}.",
    "Calcule o valor de g(2) e de g(3), onde g(t) = 3t − 1.",
    "Seja x ∈ R tal que x > 0 e y = 2x + 1.",
  ])("leaves prose with simple maths alone: %s", (text) => {
    expect(TextLayerMath.looksGarbled(text)).toBe(false);
  });
});
