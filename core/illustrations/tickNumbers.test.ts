// Port of LayoutFixTests.continuityTickNumbersStayOffTheBranches @ 5701363 (0f76bd7, 9574a07): the exam's
// arcsen(x/(1+x²)) / (cosh x)^(1/x) at 0. The left branch dips under the x axis, where the tick "−2" used to sit on
// it; no axis number lies on a drawn branch.
import { describe, expect, it } from "vitest";
import { evaluate, parseExpression } from "../math/expression";
import { continuityIllustration, TemplateBuilder } from "./illustrationTemplate";

describe("tick numbers", () => {
  it("stay off the branches of a continuity picture", () => {
    const drawing = continuityIllustration(
      {
        point: 0,
        pointText: "0",
        left: "asin(x/(1+x^2))",
        right: "cosh(x)^(1/x)",
        value: null,
        closedSide: null,
      },
      "f",
      "Portuguese (Portugal)",
    );
    expect(drawing).not.toBeNull();
    const numbers = drawing!.elements.flatMap((element) => {
      const text = element.text;
      if (element.color !== "muted" || !text || !Number.isFinite(Number(text.replace("−", "-").replace(",", "."))))
        return [];
      const box = TemplateBuilder.labelBoxOf(element, 0.58);
      return box ? [{ text, box }] : [];
    });
    expect(numbers.length).toBeGreaterThanOrEqual(4);
    const curves = drawing!.elements.filter((element) => element.kind === "curve");
    expect(curves).toHaveLength(2);
    for (const curve of curves) {
      const x = parseExpression(curve.curveX!);
      const y = parseExpression(curve.curveY!);
      const from = Number(curve.from);
      const to = Number(curve.to);
      for (let index = 0; index <= 400; index++) {
        const s = from + ((to - from) * index) / 400;
        const px = evaluate(x, { s });
        const py = evaluate(y, { s });
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
        for (const { text, box } of numbers) {
          const inside = px >= box.minX && px <= box.maxX && py >= box.minY && py <= box.maxY;
          expect(inside, `the tick ${text} sits on the curve at s = ${s}`).toBe(false);
        }
      }
    }
  });
});
