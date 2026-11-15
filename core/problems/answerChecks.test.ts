// Port of the ReadingAnswerCheck (SolutionProviderRouteTests), AnswerAudit (CostSavingsTests), FigureConsistency
// (LiveRunFixTests) and listening (ListeningQuestionTests) cases @ ref 2026-11-04.

import { describe, expect, it } from "vitest";
import type { Check } from "../math/verifier";
import { AnswerAudit, FigureConsistency, ListeningDetection, ReadingAnswerCheck } from "./answerChecks";

const escalates = (answer: string, hasOptions = false, question = "") =>
  ReadingAnswerCheck.needsEscalation(answer, hasOptions, question);

describe("ReadingAnswerCheck", () => {
  it("escalates a fast answer that only points at lines", () => {
    expect(escalates("devem comparar-se duas sensações identificadas nas linhas 23 a 27")).toBe(true);
    expect(escalates("Devem comparar-se o alívio de chegar a casa e a angústia do silêncio, nas linhas 23 a 27.")).toBe(
      false,
    );
    expect(escalates("«um frio na alma» e «o calor da casa» (linhas 23 a 27)")).toBe(false);
    expect(escalates("Não.")).toBe(true);
    expect(escalates("C", true)).toBe(false);
    expect(escalates("The writer presents loneliness as a chosen exile.")).toBe(false);
  });

  it("escalates a fast answer that tells the student to work", () => {
    expect(
      escalates(
        "O aluno deve identificar as sensações do sujeito nas linhas 23 a 27 e o modo como elas se transformam no final do excerto.",
      ),
    ).toBe(true);
    expect(
      escalates(
        "Deve comparar-se o que surge nas linhas 23 a 27 com o que o sujeito sente depois, ao longo de todo o excerto apresentado.",
      ),
    ).toBe(true);
    expect(escalates("Devem comparar-se o alívio de chegar a casa e a angústia do silêncio, nas linhas 23 a 27.")).toBe(
      false,
    );
    expect(escalates("The student should look at the contrast between arriving home and the anguish of silence.")).toBe(
      true,
    );
    expect(escalates("You should identify the two feelings in lines 23 to 27 and how they change by the end.")).toBe(
      true,
    );
    expect(escalates("El alumno debe señalar el contraste entre el alivio y la angustia a lo largo del texto.")).toBe(
      true,
    );
    expect(escalates("L'élève doit relever le contraste entre le soulagement et l'angoisse dans l'extrait.")).toBe(
      true,
    );
    expect(escalates("Der Schüler soll den Gegensatz zwischen Erleichterung und Angst im Text nennen.")).toBe(true);
    expect(escalates("C", true)).toBe(false);
  });

  it("needs as many items as an open question asks for", () => {
    const sensations = "Identifica duas sensações presentes nas linhas 23 a 27.";
    expect(escalates("O texto apresenta duas sensações.", false, sensations)).toBe(true);
    expect(escalates("O alívio de chegar a casa e a angústia do silêncio.", false, sensations)).toBe(false);
    expect(escalates("The poem uses imagery.", false, "Give three examples of imagery.")).toBe(true);
    expect(escalates("The cold, the house, and the silence.", false, "Give three examples of imagery.")).toBe(false);
    expect(escalates("The writer presents loneliness as a chosen exile.", false, "Explain the theme.")).toBe(false);
  });

  it("escalates a fast answer that says the excerpt is missing", () => {
    const dodge =
      "a comparação deve basear-se em duas sensações distintas captadas nessas linhas, que não se encontram no excerto fornecido para leitura nesta transcrição.";
    expect(escalates(dodge)).toBe(true);
    const asked =
      "Compare o ambiente do mercado do peixe em Memorial do Convento (linhas 11 a 16) com o ambiente do mercado da Praça da Figueira em O Ano da Morte de Ricardo Reis (linhas 23 a 27), com base em duas sensações distintas.";
    expect(escalates(dodge, false, asked)).toBe(true);
    const named =
      "No mercado do peixe as vendedeiras gritam e cheira a peixe; na Praça da Figueira ouve-se um estrondo e cheira a couve e a sangue.";
    expect(escalates(named, false, asked)).toBe(false);
    expect(
      escalates("The sensations are not in the excerpt the question names, so they cannot be listed from these lines."),
    ).toBe(true);
    expect(escalates("Those lines are not in the provided text, so the comparison cannot name either sensation.")).toBe(
      true,
    );
    expect(escalates("The description of the market is not available in the pages sent with this question.")).toBe(
      true,
    );
    expect(
      escalates("O excerto pedido não está disponível nesta transcrição, por isso as sensações ficam por identificar."),
    ).toBe(true);
    expect(escalates("El contraste no se encuentra en el fragmento enviado con la pregunta.")).toBe(true);
    expect(escalates("Le passage demandé ne figure pas dans l'extrait fourni pour cette question.")).toBe(true);
    expect(
      escalates("Die beschriebenen Sinneseindrücke stehen nicht im Text, der mit der Frage geschickt wurde."),
    ).toBe(true);
    expect(escalates("C", true)).toBe(false);
  });
});

const check = (kind: Check["kind"], left: string, right: string, variable: string | null = null): Check => ({
  kind,
  left,
  right,
  variable,
});

describe("AnswerAudit", () => {
  // The one check Gemini wrote for MatA635 item 8 (wrong answer, kept).
  const item8 = check("equal", "cos(a)*(1 + sin(a))/(2*sin(a))", "(1/tan(a))*(1 + sin(a))/2", "a");

  it("does not count a restated formula as a test", () => {
    expect(AnswerAudit.restatesItself(item8)).toBe(true);
    expect(AnswerAudit.needsStrongerModel([item8], "math", false, false)).toBe(true);
  });

  it("still counts a numeric check", () => {
    const numeric = check("equal", "(6-3)^2+(3-0)^2", "45");
    expect(AnswerAudit.restatesItself(numeric)).toBe(false);
    expect(AnswerAudit.needsStrongerModel([numeric], "math", false, false)).toBe(false);
    expect(AnswerAudit.needsStrongerModel([item8, numeric], "math", false, false)).toBe(false);
  });

  it("counts calculus checks as tests of values", () => {
    for (const kind of ["derivative", "integral", "limit", "jump"] as const) {
      expect(AnswerAudit.restatesItself(check(kind, "x^2", "2*x", "x"))).toBe(false);
    }
  });

  it("takes an unreadable check for no proof", () => {
    expect(AnswerAudit.restatesItself(check("equal", "((", "x"))).toBe(true);
  });

  it("never asks the strong model to confirm itself, nor audits reading", () => {
    expect(AnswerAudit.needsStrongerModel([item8], "math", true, true)).toBe(false);
    expect(AnswerAudit.needsStrongerModel([item8], "reading", false, true)).toBe(false);
    expect(AnswerAudit.needsStrongerModel([], "biologyGeology", false, true)).toBe(false);
  });

  it("escalates no checks at all only when the flag is on", () => {
    expect(AnswerAudit.needsStrongerModel([], "math", false, false)).toBe(false);
    expect(AnswerAudit.needsStrongerModel([], "math", false, true)).toBe(true);
    expect(AnswerAudit.needsStrongerModel([], "physicsChemistry", false, true)).toBe(false);
  });
});

describe("FigureConsistency", () => {
  it("finds a figure that only touches next to an answer that changes sign", () => {
    const figure = "f' touches the x-axis at -1 and stays below until the origin";
    const answer = "f' changes sign at -1";
    expect(FigureConsistency.disagreement(figure, answer)).not.toBeNull();
    expect(
      FigureConsistency.disagreement(
        "f' toca o eixo dos xx em −1 e permanece abaixo até à origem",
        "f' muda de sinal em −1",
      ),
    ).not.toBeNull();
    expect(
      FigureConsistency.disagreement("f' crosses the x-axis at -1, changing sign from negative to positive", answer),
    ).toBeNull();
    expect(FigureConsistency.disagreement(figure, "o mínimo é f(0)")).toBeNull();
  });
});

describe("ListeningDetection", () => {
  const without = (text: string, subject: string | null = null) => ListeningDetection.isWithoutSource(text, subject);

  it("does not answer a listening item with no transcript", () => {
    expect(
      without(
        "You will hear a conversation about a school trip.\n1. The speaker is calling to\n(A) cancel a booking\n(B) change a date",
      ),
    ).toBe(true);
    expect(without("Compreensão do oral\nVai ouvir um texto duas vezes.\n2.1. Qual é o tema principal?")).toBe(true);
    expect(without("Vous allez entendre un document sonore. Choisissez la bonne réponse.")).toBe(true);
    expect(without("Compréhension de l’oral. Répondez aux questions.")).toBe(true);
  });

  it("takes a printed transcript or dialogue for the source", () => {
    expect(without("You will hear a conversation.\nTranscript\nAnna: We leave at eight.\nBen: I'll be there.")).toBe(
      false,
    );
    const dialogue =
      "You will hear this dialogue.\nAnna: Hello, is that the station?\nBen: Yes, how can I help?\nAnna: I'd like the time of the next train.\nBen: It leaves at six.";
    expect(without(dialogue)).toBe(false);
  });

  it("does not take a passage that mentions listening for one", () => {
    expect(without("She was listening to music when the letter arrived, and she read it twice.")).toBe(false);
    expect(without("No fim da história ele vai ouvir a verdade.")).toBe(false);
    expect(without("1. The speaker of the poem is\n(A) a child\n(B) a teacher", "English")).toBe(false);
  });

  it("reads the listening paper from the subject or the page heading", () => {
    const questionsOnly =
      "1. The speaker is calling to\n(A) cancel a booking\n(B) change a date\n2. What time is the train?\n(A) six\n(B) eight";
    expect(without(questionsOnly, "English listening")).toBe(true);
    expect(without("English listening\n" + questionsOnly)).toBe(true);
    expect(without("Listening\n" + questionsOnly)).toBe(true);
    expect(without("Compreensão oral\n1. Qual é o tema?")).toBe(true);
  });

  it("takes an instruction to play audio for listening", () => {
    expect(without("Listen to the conversation.\n1. Where are they?")).toBe(true);
    expect(without("You will listen to a text.\n1. What?")).toBe(true);
    expect(without("The recording is played twice.\n1. Choose.\n(A) yes\n(B) no")).toBe(true);
  });
});
