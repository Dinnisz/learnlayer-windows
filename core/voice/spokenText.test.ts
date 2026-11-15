// VoiceTutorTests.spokenTextDropsMarkdownAndLatexBeforeSpeech and StepReadoutLatencyTests.narrationIsCutIntoSentences.

import { describe, expect, it } from "vitest";
import { NarrationSentences, SpeechMarkers, SpokenText } from "./spokenText";

describe("SpokenText", () => {
  it("drops Markdown and LaTeX before speech", () => {
    const formula = "x igual a x zero mais v zero vezes t";
    expect(SpokenText.sanitize(formula)).toBe(formula);
    expect(SpokenText.sanitize("The slope is the acceleration.")).toBe("The slope is the acceleration.");
    expect(SpokenText.sanitize("isn't twelve metres per second.")).toBe("isn't twelve metres per second.");
    expect(SpokenText.sanitize("**Listen**: the slope is the acceleration.")).toBe(
      "Listen: the slope is the acceleration.",
    );
    expect(SpokenText.sanitize("_one_ idea and __two__ more")).toBe("one idea and two more");
    expect(SpokenText.sanitize("# Title\n\n- first idea\n- second idea")).toBe("Title first idea second idea");
    expect(SpokenText.sanitize("| speed | time |\n| --- | --- |\n| twelve | three |")).toBe("speed time twelve three");
    expect(SpokenText.sanitize("See [the notes](https://example.com/a).")).toBe("See the notes.");
    expect(SpokenText.sanitize("the value is $x^2$ now")).toBe("the value is now");
    expect(SpokenText.sanitize("$x^2$")).toBe("");
    expect(SpokenText.sanitize("the value \\frac{1}{2} here")).toBe("the value here");
    expect(SpokenText.sanitize("\\sqrt{\\frac{1}{2}}")).toBe("");
    expect(SpokenText.sanitize("\\(x = x_0 + v_0 t\\) metres")).toBe("metres");
    expect(SpokenText.sanitize("```\nx^2\n``` then stop")).toBe("then stop");
    const mixed = `The formula is ${formula}. **Then** we stop.`;
    expect(SpokenText.sanitize(mixed)).toBe(`The formula is ${formula}. Then we stop.`);
    const once = SpokenText.sanitize(mixed + "\n- and $a^2$ plus \\frac{1}{2}");
    expect(SpokenText.sanitize(once)).toBe(once);
    expect(SpokenText.sanitize("O mesmo [[1]]a aparece.")).toBe("O mesmo [[1]]a aparece.");
    expect(SpokenText.forSpeech("O mesmo [[1]]a aparece.")).toBe("O mesmo a aparece.");
    for (const mark of ["$", "\\", "*"]) expect(once).not.toContain(mark);
    expect(once).toContain(formula);
    const spoken = SpokenText.forSpeech("**hi** ".repeat(5_000));
    expect(Array.from(spoken)).toHaveLength(10_000);
    expect(spoken).not.toContain("*");
    expect(SpokenText.forSpeech(spoken)).toBe(spoken);
  });

  it("cuts the markers out and keeps where each one stood", () => {
    const marked = SpeechMarkers.extract("o [[0]]a e o mesmo [[0]]a, e [[1]]F");
    expect(marked.spoken).toBe("o a e o mesmo a, e F");
    expect(marked.count).toBe(3);
    expect(marked.mentions.get(0)).toEqual([2, 14]);
    expect(marked.offsets.get(1)).toBe(19);
  });

  it("cuts a narration into sentences", () => {
    const text =
      "Primeiro, escrevemos a segunda lei de Newton. A força resultante é igual a massa vezes aceleração! Fica 2. Depois isolamos a.";
    const pieces = NarrationSentences.split(text);
    expect(pieces).toEqual([
      "Primeiro, escrevemos a segunda lei de Newton.",
      "A força resultante é igual a massa vezes aceleração!",
      "Fica 2. Depois isolamos a.",
    ]);
    expect(pieces.join(" ")).toBe(text);
    expect(NarrationSentences.split("Vale 9.8 metros por segundo.")).toEqual(["Vale 9.8 metros por segundo."]);
    expect(NarrationSentences.split("")).toEqual([]);
  });
});
