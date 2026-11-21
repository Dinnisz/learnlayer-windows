import { describe, expect, it } from "vitest";
import { questionScale } from "./questionScale";

// A question set in 10 pt body text, 400 pt wide and 200 pt tall on its page, on a 956 pt stage.
const base = { body: 10, fits: 3, height: 200, available: 956 };

describe("questionScale (Stage.init)", () => {
  it("reads at 17 pt, within its width and 45 % of the height", () => {
    expect(questionScale({ ...base, compact: false })).toBeCloseTo(1.7);
    expect(questionScale({ ...base, compact: false, fits: 1.2 })).toBeCloseTo(1.2);
    expect(questionScale({ ...base, compact: false, height: 600 })).toBeCloseTo((956 * 0.45) / 600);
  });

  it("drops to 14 pt and 30 % once the solution is open", () => {
    expect(questionScale({ ...base, compact: true })).toBeCloseTo(1.4);
    expect(questionScale({ ...base, compact: true, height: 400 })).toBeCloseTo((956 * 0.3) / 400);
  });

  it("keeps 14 pt while the work fits under it", () => {
    expect(questionScale({ ...base, compact: true, panel: 500 })).toBeCloseTo(1.4);
  });

  it("gives up only the room the work needs", () => {
    // 956 − 2·28 − 16 − 650 = 234 pt for a question 200 tall: 11.7 pt.
    expect(questionScale({ ...base, compact: true, panel: 650 })).toBeCloseTo(234 / 200);
  });

  it("never goes below 11 pt", () => {
    expect(questionScale({ ...base, compact: true, panel: 900 })).toBeCloseTo(1.1);
  });

  it("is never made larger by the floor when it was already smaller", () => {
    // Too wide for 11 pt already: the floor is the width's scale.
    expect(questionScale({ ...base, compact: true, fits: 0.8, panel: 900 })).toBeCloseTo(0.8);
  });

  it("uses the compact window's margins", () => {
    // 400 − 2·12 − 8 − 300 = 68 pt for a question 100 tall; 11 pt with a 20 pt body is 0.55.
    const scale = questionScale({
      body: 20,
      fits: 3,
      height: 100,
      available: 400,
      compact: true,
      panel: 300,
      compactWindow: true,
    });
    expect(scale).toBeCloseTo(0.68);
  });
});
