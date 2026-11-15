import { describe, expect, it } from "vitest";
import { swiftStrings } from "./swift-strings.mjs";

const B = String.fromCharCode(92);
const NL = String.fromCharCode(10);
const Q3 = '"""';

describe("swiftStrings", () => {
  it("reads a single-line literal with escapes and an interpolation", () => {
    const source = `static let a = "one${B}ttwo ${B}(name) ${B}"three${B}" ${B}${B}x"`;
    expect(swiftStrings(source)).toEqual({
      "a#0": [{ text: "one" + String.fromCharCode(9) + "two " }, { expr: "name" }, { text: ' "three" ' + B + "x" }],
    });
  });

  it("strips a multi-line literal's indentation and joins continued lines", () => {
    const source = [
      "    static func system(language: String) -> String {",
      `        ${Q3}`,
      `        First line ${B}`,
      "        continued.",
      "",
      `        In ${B}(language), keep ${B}${B}frac.`,
      `        ${Q3}`,
      "    }",
    ].join(NL);
    expect(swiftStrings(source)).toEqual({
      "system#0": [
        { text: "First line continued." + NL + NL + "In " },
        { expr: "language" },
        { text: ", keep " + B + "frac." },
      ],
    });
  });

  it("keeps a raw string's backslashes and reads its own escapes", () => {
    const source = `static let pattern = #"${B}d+ ${B}#(x) ${B}("#`;
    expect(swiftStrings(source)).toEqual({
      "pattern#0": [{ text: B + "d+ " }, { expr: "x" }, { text: " " + B + "(" }],
    });
  });

  it("keeps the blank lines a literal starts with, and skips comments", () => {
    const source = ['// let ignored = "no"', `static let rule = ${Q3}`, "", "", "The rule.", `${Q3}`].join(NL);
    expect(swiftStrings(source)).toEqual({ "rule#0": [{ text: NL + NL + "The rule." }] });
  });

  it("reads nested literals inside an interpolation as part of the expression", () => {
    const source = `static let x = "a ${B}(names.joined(separator: ", ")) b"`;
    expect(swiftStrings(source)).toEqual({
      "x#0": [{ text: "a " }, { expr: 'names.joined(separator: ", ")' }, { text: " b" }],
    });
  });
});
