// Ports @ ref 2026-11-04 of the ProblemSolution cases in LearnLayerTests: NeedsFigureTests, SolveScopeTests
// (the label parts), SolutionJSONRepairTests, the decoding cases of PartialJSONTests, and the formula cases of
// LiveRunFixTests (`aFormulaUsedByAnotherPartStaysOffThisOne`, `unusedFormulasStayOffTheStage`).

import { describe, expect, it } from "vitest";
import mockSolution from "../mocks/MockSolution.json";
import { decodeFromContent, UnreadableReply } from "../ai/replyDecoding";
import { SolutionJSON } from "../ai/partialJSON";
import {
  decodeProblemSolution,
  formulasFor,
  FormulaUse,
  ignoresMissingFigure,
  partLabelled,
  restrictedTo,
  type ProblemSolution,
} from "./problemSolution";

const decodeContent = (content: string) => decodeFromContent(content, decodeProblemSolution);
const decodeJSON = (json: string) => decodeProblemSolution(JSON.parse(json));

describe("ProblemSolution decoding (PartialJSONTests)", () => {
  it("parameters of a tool call become the solution", () => {
    const xml = [
      '<invoke name="respond">',
      '<parameter name="subject">see {fig}</parameter>',
      '<parameter name="parts">[{"label":"1.1","answer":{"text":"2 m/s"}}]</parameter>',
      "</invoke>",
    ].join("\n");
    const solution = decodeContent(xml);
    expect(solution.subject).toBe("see {fig}");
    expect(partLabelled(solution, "1.1")?.answer.text).toBe("2 m/s");
  });

  it("a wrapped object is the solution itself", () => {
    const xml =
      '<INVOKE name="respond"><parameter name="response">{"subject":"Math","parts":[{"label":"2","answer":{"text":"B"}}]}</parameter></INVOKE>';
    const solution = decodeContent(xml);
    expect(solution.subject).toBe("Math");
    expect(partLabelled(solution, "2")?.answer.text).toBe("B");
  });

  it("plain and fenced JSON still decode", () => {
    const json = '{"subject":"Physics","parts":[{"label":"1","answer":{"text":"2"}}]}';
    expect(partLabelled(decodeContent(json), "1")?.answer.text).toBe("2");
    expect(partLabelled(decodeContent("```json\n" + json + "\n```"), "1")?.answer.text).toBe("2");
  });

  it("a plain string answer decodes", () => {
    const solution = decodeContent(
      '{"subject":"Biology","parts":[{"label":"1","answer":"A mitocôndria produz ATP."}]}',
    );
    expect(partLabelled(solution, "1")?.answer.text).toBe("A mitocôndria produz ATP.");
    expect(partLabelled(solution, "1")?.answer.expression).toBeNull();
  });

  it("a missing latex value keeps the other cards", () => {
    const json =
      '{"subject":"Biology","parts":[{"label":"1","answer":{"text":"(A) osmose"},"cards":[{"title":"Keep","latex":"H_2O"},{"title":"Broken","latex":},{"title":"Also","latex":"Na+"}]}]}';
    const solution = decodeContent(json);
    expect(partLabelled(solution, "1")?.answer.text).toBe("(A) osmose");
    const titles = partLabelled(solution, "1")?.cards?.map((card) => card.title) ?? [];
    expect(titles).toEqual(expect.arrayContaining(["Keep", "Also", "Broken"]));
  });

  it("an unparseable card is dropped", () => {
    const json =
      '{"subject":"BG","parts":[{"label":"11","answer":{"text":"(C) osmose"},"cards":[{"title":"Keep","latex":"H_2O"},{"title":"bad","latex":@@@},{"title":"Also","latex":"Na+"}]}]}';
    const solution = decodeContent(json);
    expect(partLabelled(solution, "11")?.answer.text).toBe("(C) osmose");
    expect(partLabelled(solution, "11")?.cards?.map((card) => card.title)).toEqual(["Keep", "Also"]);
  });

  it("a card that is not an object is dropped", () => {
    const json =
      '{"subject":"BG","parts":[{"label":"1","answer":{"text":"B"},"cards":[{"title":"Keep","latex":"x"},"nope",{"title":"Also","latex":"y"}]}]}';
    expect(partLabelled(decodeContent(json), "1")?.cards?.map((card) => card.title)).toEqual(["Keep", "Also"]);
  });

  it("an unreadable reply keeps the whole body", () => {
    const body = "{" + "y".repeat(1800);
    const failure = (() => {
      try {
        decodeContent(body);
        return null;
      } catch (error) {
        return error;
      }
    })();
    expect(failure).toBeInstanceOf(UnreadableReply);
    expect((failure as UnreadableReply).raw.length).toBeGreaterThan(1500);
  });
});

describe("SolutionJSONRepair", () => {
  const wellFormed =
    '{"subject": "Física", "parts": [{"label": "1", "asks": "a", "hint": "h", "steps": ["um", "dois"], "uses": [], "answer": {"text": "B", "expression": null}}], "checks": []}';

  it("an array that was never closed before the next key is repaired", () => {
    const broken =
      '{"subject": "Física", "parts": [{"label": "1", "asks": "a", "hint": "h", "steps": ["um", "dois", "uses": [], "answer": {"text": "B", "expression": null}}], "checks": []}';
    expect(() => JSON.parse(broken)).toThrow();
    const decoded = decodeContent(broken);
    expect(decoded.parts).toHaveLength(1);
    expect(decoded.parts[0]?.steps).toEqual(["um", "dois"]);
    expect(decoded.parts[0]?.answer.text).toBe("B");
  });

  it("a mismatched bracket is repaired", () => {
    const objectClosedWithABracket =
      '{"subject": "Física", "parts": [{"label": "1", "asks": "a", "hint": "h", "steps": ["um"], "answer": {"text": "C", "expression": null]}], "checks": []}';
    expect(decodeContent(objectClosedWithABracket).parts[0]?.answer.text).toBe("C");
    const arrayClosedWithABrace =
      '{"subject": "Física", "parts": [{"label": "1", "asks": "a", "hint": "h", "steps": ["um", "dois"}, "answer": {"text": "D", "expression": null}}], "checks": []}';
    const second = decodeContent(arrayClosedWithABrace);
    expect(second.parts[0]?.steps).toEqual(["um", "dois"]);
    expect(second.parts[0]?.answer.text).toBe("D");
  });

  it("valid JSON and text inside strings are left alone", () => {
    expect(SolutionJSON.closingSlippedBrackets(wellFormed)).toBe(wellFormed);
    const tricky = '{"a": ["x: y", "]", "}"], "b": {"c": "[{"}}';
    expect(SolutionJSON.closingSlippedBrackets(tricky)).toBe(tricky);
    expect(decodeContent(wellFormed).parts[0]?.steps).toEqual(["um", "dois"]);
  });
});

describe("NeedsFigure", () => {
  const solution = (subject: string, parts: string) =>
    decodeJSON(`{"subject":"${subject}","needsFigure":true,"parts":[${parts}]}`);
  const prose = (asks: string) => `{"label":"3.2","asks":"${asks}","answer":{"text":"A metáfora organiza o texto."}}`;

  it("language and philosophy never depend on a missing figure", () => {
    for (const subject of ["Português", "Francês", "French", "Inglês", "English", "Filosofia", "Philosophy"]) {
      const diagram = solution(subject, prose("Comente a figure de style."));
      expect(ignoresMissingFigure(diagram, "Comente a figure de style dominante."), subject).toBe(true);
    }
  });

  it("a written answer from a document does not", () => {
    const part =
      '{"label":"20","asks":"Explique o processo.","answer":{"text":"A erosão recua a arriba."},"evidence":[{"quote":"a arriba recua","point":"erosão","why":"mostra o recuo"}]}';
    expect(ignoresMissingFigure(solution("Biologia e Geologia", part), "Com base no documento 1, explique.")).toBe(
      true,
    );
  });

  it("a document item that is not a diagram does not", () => {
    const diagram = solution("Biologia e Geologia", prose("Explique."));
    expect(ignoresMissingFigure(diagram, "Leia o texto e explique o processo descrito.")).toBe(true);
    expect(ignoresMissingFigure(diagram, "No contexto da teoria, explique.")).toBe(false);
  });

  it("a diagram the model could not read still counts", () => {
    const diagram = solution("Biologia e Geologia", prose("Identifique."));
    expect(ignoresMissingFigure(diagram, "Observe a figura e identifique a estrutura.")).toBe(false);
    expect(ignoresMissingFigure(diagram, "Leia o documento e observe a figura.")).toBe(false);
    const physics = solution(
      "Física e Química A",
      '{"label":"8.1","asks":"Calcule.","answer":{"text":"2,4","expression":"2.4"}}',
    );
    expect(ignoresMissingFigure(physics, "Na figura, calcule a energia.")).toBe(false);
  });
});

describe("SolveScope (labels)", () => {
  const solution = (labels: string[]): ProblemSolution =>
    decodeJSON(
      `{"subject": "Biologia e Geologia", "parts": [${labels
        .map(
          (label) =>
            `{"label": "${label}", "asks": "a", "hint": "h", "steps": [], "answer": {"text": "A", "expression": null}}`,
        )
        .join(",")}]}`,
    );

  it("a solution keeps only the asked question", () => {
    const answered = solution(["1", "2", "3", "4"]);
    expect(restrictedTo(answered, ["1"]).parts.map((part) => part.label)).toEqual(["1"]);
    expect(restrictedTo(answered, ["2", "3"]).parts.map((part) => part.label)).toEqual(["2", "3"]);
    // Brackets are not part of the identity of a label.
    expect(restrictedTo(solution(["2(a)", "2(b)", "3"]), ["2(a)", "2(b)"]).parts).toHaveLength(2);
    expect(restrictedTo(solution(["a)", "b)"]), ["(b)"]).parts.map((part) => part.label)).toEqual(["b)"]);
  });

  it("a reply that matches no label is left whole", () => {
    const answered = solution(["x", "y"]);
    expect(restrictedTo(answered, ["1"]).parts).toHaveLength(2);
    expect(restrictedTo(answered, []).parts).toHaveLength(2);
  });
});

describe("FormulaUse (LiveRunFixTests)", () => {
  it("a formula used by another part stays off this one", () => {
    const json = String.raw`{"subject":"Matemática","formulas":[
      {"name":"Limite notável","latex":"\\lim_{x\\to0}\\frac{e^{x}-1}{x}=1"},
      {"name":"Superfície esférica","latex":"(x-x_0)^2+(y-y_0)^2+(z-z_0)^2=r^2"}
    ],"parts":[
      {"label":"2.3","asks":"Mostre que g tem um zero.","hint":"","steps":[],"answer":{"text":"existe"},
       "cards":[{"title":"Sinal","note":"g(-1) > 0 e g(0) < 0.","latex":"g(x)=4-e^{3(x+1)}+x/2"}]},
      {"label":"4.1","asks":"Qual é o plano?","hint":"","steps":[],"answer":{"text":"(B)"},
       "cards":[{"title":"Normal","note":"O plano perpendicular à reta tem o vetor diretor como normal.","latex":"x+3y-33=0"}]},
      {"label":"4.2","asks":"A esfera.","hint":"","steps":[],"answer":{"text":"r"},
       "cards":[{"title":"Esfera","note":"A superfície esférica.","latex":"(x-x_0)^2+(y-y_0)^2+(z-z_0)^2=r^2"}]}
    ]}`;
    const solution = decodeJSON(json);
    const names = (index: number) => formulasFor(solution, solution.parts[index]!).map((item) => item.name);
    expect(names(0)).not.toContain("Limite notável");
    expect(names(0)).not.toContain("Superfície esférica");
    expect(names(1)).not.toContain("Superfície esférica");
    expect(names(1)).not.toContain("Limite notável");
    expect(names(2)).toContain("Superfície esférica");
  });

  it("unused formulas stay off the stage", () => {
    const limit = String.raw`\lim_{x\to0}\frac{e^{x}-1}{x}=1`;
    expect(
      FormulaUse.isReferenced("Limite notável", limit, "Deriva-se o primeiro ramo e estuda-se o sinal de f'."),
    ).toBe(false);
    expect(FormulaUse.isReferenced("Regra do produto", "(uv)'=u'v+uv'", "A soma das derivadas dá o declive.")).toBe(
      false,
    );
    expect(FormulaUse.isReferenced("Regra do produto", "(uv)'=u'v+uv'", "Deriva-se com a regra do produto.")).toBe(
      true,
    );
    expect(FormulaUse.isReferenced("Limite notável", limit, "Usa-se o limite notável com y = x − 3.")).toBe(true);
  });
});

describe("the mock solution", () => {
  it("decodes with its three parts and checks", () => {
    const solution = decodeProblemSolution(mockSolution);
    expect(solution.parts.map((part) => part.label)).toEqual(["I.1", "I.2", "I.3"]);
    expect(solution.parts[0]?.answer.expression).toBe("sigma/(2*eps0)*(sqrt(R^2+z^2)-abs(z))");
    expect(partLabelled(solution, "i.1")).toBe(solution.parts[0]);
  });

  it("a model that writes the word null wrote no formula, and yaw and steps read numbers", () => {
    const solution = decodeJSON(
      '{"parts":[{"label":"1","answer":{"text":"curve","expression":"null"},"cards":[{"title":"t","yaw":"90","assembleStep":2.5,"figureHighlight":"  R1 "}]}]}',
    );
    expect(solution.parts[0]?.answer.expression).toBeNull();
    expect(solution.parts[0]?.cards?.[0]?.yaw).toBe(90);
    expect(solution.parts[0]?.cards?.[0]?.assembleStep).toBeNull();
    expect(solution.parts[0]?.cards?.[0]?.figureHighlight).toBe("R1");
    expect(() => decodeJSON('{"subject":"x"}')).toThrow();
  });
});
