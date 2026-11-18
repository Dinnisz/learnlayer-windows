// Port of the formula cases of LearnLayerTests/VoiceFlowTests.swift (aQuestionAboutAFormulaUnderlinesItWhen…,
// explainingASymbolDrawsTheFormulaThatHoldsIt, the Δt/ω/√ equations) and VoiceTutorTests.swift (the formula drawn
// from the reply, the question, or none for prose) @ ref 2026-11-04. The marks' layout on the formula is the drawing's.

import { describe, expect, it } from "vitest";
import { holdsSymbol, VoiceFormula } from "./voiceFormula";
import { VoiceTutorReplies } from "./voiceTutorReply";

const R = String.raw;
const kinematics = R`x(t) = x_{0} + v_{0} t + \frac{1}{2} a t^{2}`;
const samplePage = `A car starts from position x₀ with initial velocity v₀ and speeds up with a constant
acceleration a. Its position at time t is given by the equation below. The term in t² is
what makes the graph of position against time a parabola rather than a straight line.
x(t) = x₀ + v₀t + ½at²
When a is positive the car speeds up and the curve bends upwards; when a is negative it
slows down and the curve bends the other way. Doubling a doubles the extra distance
covered at every instant.`;

describe("the formula a spoken answer is drawn on", () => {
  it("an equation inside a question is found without its words", () => {
    expect(VoiceFormula.inlineEquation("explica a fórmula F = ma")).toBe("F = ma");
    expect(VoiceFormula.inlineEquation("F=ma por favor")).toBe("F=ma");
    expect(VoiceFormula.inlineEquation("explica isto")).toBeNull();
  });

  it("a question about a formula underlines it when the answer names it", () => {
    const asked = "explica a fórmula F = ma";
    const raw =
      "A fórmula diz que a força resultante sobre um corpo é igual à massa vezes a aceleração. [[1]]F é a força total, [[2]]m é a massa e [[3]]a é a aceleração. Com a mesma força, quanto maior a massa, menor a aceleração. Na tua página, o [[4]]a aparece na equação da posição, e é esta força que o produz. Queres que ligue as duas ideias com um exemplo?";
    const reply = VoiceFormula.namingTheFormula(
      VoiceTutorReplies.decode(
        JSON.stringify({
          spoken: raw,
          drawing: [
            { op: "formula", term: null, latex: "F = ma", segment: 0, anchor: "A fórmula diz", point: null },
            { op: "circle", term: "F", segment: null, anchor: null, point: null },
            { op: "circle", term: "m", segment: null, anchor: null, point: null },
            { op: "circle", term: "a", segment: null, anchor: null, point: null },
          ],
        }),
      ),
      asked,
    );
    const opening = VoiceFormula.formulaWord(reply.spoken)!;
    expect(reply.spoken.slice(opening, opening + 7)).toBe("fórmula");
    expect(reply.drawing).toHaveLength(4);
    expect(reply.drawing[0]!.mentionsUTF16).toEqual([opening]);
    expect(VoiceFormula.namingTheFormula(reply, asked)).toEqual(reply);

    const circlesOnly = VoiceTutorReplies.decode(
      '{"spoken":"Esta fórmula liga a força à massa: o [[0]]F e o [[1]]m.","drawing":[' +
        '{"op":"circle","term":"F","segment":null,"anchor":null,"point":null},' +
        '{"op":"circle","term":"m","segment":null,"anchor":null,"point":null}]}',
    );
    const named = VoiceFormula.namingTheFormula(circlesOnly, asked);
    expect(named.drawing).toHaveLength(3);
    expect(named.drawing[2]!.kind).toEqual({ op: "formula", latex: "F = ma" });
    expect(named.drawing[2]!.mentionsUTF16).toEqual([VoiceFormula.formulaWord(named.spoken)]);
    expect(VoiceFormula.namingTheFormula(circlesOnly, "o que é a força?")).toEqual(circlesOnly);

    const marked = VoiceTutorReplies.decode(
      '{"spoken":"A [[0]]fórmula diz que a força é a massa vezes o [[1]]a.","drawing":[' +
        '{"op":"formula","term":null,"latex":"F = ma","segment":0,"anchor":null,"point":null},' +
        '{"op":"circle","term":"a","segment":null,"anchor":null,"point":null}]}',
    );
    expect(VoiceFormula.namingTheFormula(marked, asked)).toEqual(marked);
  });

  it("explaining a symbol draws the formula that holds it", () => {
    const reply = VoiceTutorReplies.decode(
      '{"spoken":"Na tua página, o [[0]]a é a aceleração do carro. Diz-nos com que rapidez a velocidade muda em cada segundo. Quando o [[0]]a é positivo, o carro acelera e a curva sobe. Quando é negativo, o carro trava. Queres que vejamos o que acontece ao termo com [[1]]a na fórmula?","drawing":[' +
        '{"op":"circle","term":"a","segment":null,"anchor":null,"point":null},' +
        '{"op":"highlight","term":"a","segment":null,"anchor":null,"point":null}]}',
    );
    expect(VoiceFormula.presentedFormula(reply.drawing, "", reply.spoken)).toBeNull();
    const context = VoiceFormula.holdingTheSymbol(reply, "", samplePage);
    expect(context).toBe(kinematics);
    expect(VoiceFormula.presentedFormula(reply.drawing, "", reply.spoken, context)).toBe(kinematics);
    expect(holdsSymbol("a", kinematics)).toBe(true);

    const question = "x(t) = x₀ + v₀t + ½at²";
    const fromQuestion = VoiceFormula.holdingTheSymbol(reply, question, "");
    expect(VoiceFormula.presentedFormula(reply.drawing, question, reply.spoken, fromQuestion)).toBe(kinematics);
    const runOn = samplePage.replace("line.\nx(t)", "line. x(t)").replace("at²\nWhen", "at² When");
    expect(VoiceFormula.holdingTheSymbol(reply, "", runOn)).toBe(kinematics);
    expect(VoiceFormula.holdingTheSymbol(reply, "", "No formula on this page.")).toBeNull();
    expect(VoiceFormula.holdingTheSymbol(reply, "", "Newton: F = m·g")).toBeNull();

    const written = VoiceTutorReplies.decode(
      '{"spoken":"O [[0]]a é a aceleração.","drawing":[' +
        '{"op":"circle","term":"a","segment":null,"anchor":null,"point":null},' +
        '{"op":"formula","term":null,"latex":"v = v_0 + a t","segment":0,"anchor":null,"point":null}]}',
    );
    expect(VoiceFormula.holdingTheSymbol(written, "", samplePage)).toBeNull();
    expect(VoiceFormula.presentedFormula(written.drawing, "", written.spoken)).toBe("v = v_0 + a t");

    expect(VoiceFormula.writtenEquations("Se v = v₀ − 9.8t, então\ns = ½gt² quando cai")).toEqual([
      "v = v_{0} - 9.8 t",
      R`s = \frac{1}{2} g t^{2}`,
    ]);
  });

  it("Greek letters, increments and roots are written as commands", () => {
    expect(VoiceFormula.writtenEquations("o que é Δt em v = Δx/Δt")).toEqual([R`v = \Delta x/\Delta t`]);
    expect(VoiceFormula.writtenEquations("e em ω = 2π/T")).toEqual([R`\omega = 2 \pi /T`]);
    expect(VoiceFormula.writtenEquations("o y em d = √(x² + y²)")).toEqual([R`d = \sqrt{x^{2} + y^{2}}`]);
  });

  it("the formula comes from the reply, then the question, and prose has none", () => {
    const circles = VoiceTutorReplies.decode(
      '{"spoken":"A [[0]]força e o [[1]]a.","drawing":[' +
        '{"op":"circle","term":"F","segment":null,"anchor":"força","point":null},' +
        '{"op":"circle","term":"a","segment":null,"anchor":"a","point":null}]}',
    );
    const question = "Segunda lei de Newton.\nF = ma\nA força é o produto da massa pela aceleração.";
    expect(VoiceFormula.presentedFormula(circles.drawing, question, circles.spoken)).toBe("F = ma");
    expect(
      VoiceFormula.presentedFormula(circles.drawing, "Explica a segunda lei de Newton.", circles.spoken),
    ).toBeNull();
    const equationTerm = VoiceTutorReplies.decode(
      '{"spoken":"A [[0]]força é igual à massa vezes a [[1]]a.","drawing":[' +
        '{"op":"circle","term":"F","segment":null,"anchor":"força","point":null},' +
        '{"op":"circle","term":"a","segment":null,"anchor":"a","point":null},' +
        '{"op":"highlight","term":"F = ma","segment":null,"anchor":null,"point":null}]}',
    );
    expect(
      VoiceFormula.presentedFormula(equationTerm.drawing, "Explica a segunda lei de Newton.", equationTerm.spoken),
    ).toBe("F = ma");
  });

  it("a symbol is held by a formula as written, scripted or Greek", () => {
    expect(holdsSymbol("v0", kinematics)).toBe(true);
    expect(holdsSymbol("v₀", kinematics)).toBe(true);
    expect(holdsSymbol("v_0", kinematics)).toBe(true);
    // A bare letter is not the same letter with a subscript, nor inside a command.
    expect(holdsSymbol("v", kinematics)).toBe(false);
    expect(holdsSymbol("a", R`\alpha = 2`)).toBe(false);
    expect(holdsSymbol("ω", R`\omega = 2 \pi /T`)).toBe(true);
    expect(holdsSymbol("ómega", R`\omega = 2 \pi /T`)).toBe(true);
    expect(holdsSymbol("\\omega", R`\omega = 2 \pi /T`)).toBe(true);
    expect(holdsSymbol("T", R`\omega = 2 \pi /T`)).toBe(true);
    expect(holdsSymbol("t", R`\omega = 2 \pi /T`)).toBe(false);
  });
});
