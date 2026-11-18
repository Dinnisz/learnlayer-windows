// Port of kiloOhmAndSubscriptsAreRepairedInACircuitQuestion (LearnLayerTests/LocalTranscriberTests.swift @ ref
// 2026-11-04), with the other rules of `Repair` each shown on a case.

import { describe, expect, it } from "vitest";
import { optionLabel, Repair, RepairContexts, repairedDraft } from "./localRepair";

const R = String.raw;

describe("the computer's own reading, repaired by rule", () => {
  it("a kilo-ohm and subscripts are repaired in a circuit question", () => {
    const context = RepairContexts.of("No circuito, a resistência R1 = 4 kQ");
    const fixed = Repair.apply("R1 = 4 kQ", context, false);
    expect(fixed.includes(R`\Omega`) || fixed.includes("kΩ")).toBe(true);
    expect(fixed).toContain("R_{1}");
    expect(fixed).toBe(R`$R_{1} = 4\,\mathrm{k}\Omega$`);
  });

  it("only a circuit question reads a mass-like unit as ohms", () => {
    expect(Repair.ohms("m = 5 kg", false)).toBe("m = 5 kg");
    expect(Repair.ohms("R = 5 kg", true)).toBe("R = 5 kΩ");
    expect(Repair.ohms("R = 5kD", false)).toBe("R = 5 kΩ");
    expect(Repair.ohms("10 KΩ", false)).toBe("10 kΩ");
  });

  it("an equation with glued units is set as maths, prose is left alone", () => {
    const context = RepairContexts.of("Considere o circuito.");
    expect(Repair.apply("Sabe-se que V5 = 20V no ramo.", context, false)).toBe(
      R`Sabe-se que $V_{5} = 20\,\mathrm{V}$ no ramo.`,
    );
    expect(Repair.apply("A tensão aumenta.", context, false)).toBe("A tensão aumenta.");
    // Maths already marked is kept as it is.
    expect(Repair.apply("$R_1$ = 3", context, false)).toBe("$R_1$ = 3");
  });

  it("a multiple-choice option that is a formula is set as maths", () => {
    const context = RepairContexts.of("Qual é o domínio?");
    expect(optionLabel("(A) x2 + 1")).toBe("(A)");
    expect(optionLabel("Análise")).toBeNull();
    expect(Repair.apply("(A) x2 + 1", context, true)).toBe("(A) $x^{2} + 1$");
    expect(Repair.apply("(B) 2x E R", context, true)).toBe(R`(B) $2x \in \mathbb{R}$`);
    // No digit and no operator: words, as the Mac leaves them.
    expect(Repair.apply("(D) x E R", context, true)).toBe("(D) x E R");
    expect(Repair.apply("(C) Nenhuma das anteriores", context, true)).toBe("(C) Nenhuma das anteriores");
  });

  it("look-alike letters and the item's badge are cleaned", () => {
    expect(Repair.cleaned("★ Оuestão")).toBe("Questão");
    expect(Repair.cleaned("0uestão 2")).toBe("Questão 2");
    expect(Repair.cleaned("Il. A afirmação")).toBe("II. A afirmação");
    expect(Repair.lookalikes("Рх")).toBe("Px");
  });

  it("a draft is repaired line by line, with the whole text deciding the subject", () => {
    expect(repairedDraft("No circuito da figura,\nR1 = 4 kQ\n(A) 2 kQ")).toBe(
      R`No circuito da figura,` + "\n" + R`$R_{1} = 4\,\mathrm{k}\Omega$` + "\n(A) 2 kΩ",
    );
  });
});
