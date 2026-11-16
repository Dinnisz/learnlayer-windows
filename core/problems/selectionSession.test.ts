import { describe, expect, it } from "vitest";
import { SelectionSession } from "./selectionSession";
import type { TextHelp } from "./textHelp";

const help: TextHelp = {
  subject: "Português",
  asks: "Pede o sentido da metáfora.",
  hint: "Repara no que é comparado.",
  explanation: ["O mar é a vida.", "A viagem é o tempo."],
  graph: null,
  followUps: null,
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("SelectionSession", () => {
  it("opening makes no request; the first choice makes the one request and every choice reuses it", async () => {
    let calls = 0;
    const session = new SelectionSession("O mar salgado", "", {
      help: async () => {
        calls += 1;
        return help;
      },
      isSignedOut: () => false,
    });
    expect(calls).toBe(0);
    session.choose("asks");
    await settle();
    expect(calls).toBe(1);
    expect(session.state).toEqual({ kind: "ready" });
    expect(session.shown).toEqual(["Pede o sentido da metáfora."]);
    session.choose("explain");
    session.choose("hint");
    await settle();
    expect(calls).toBe(1);
    expect(session.shown).toEqual(["Repara no que é comparado."]);
  });

  it("a signed-out failure asks to sign in; any other can be tried again", async () => {
    let signedOut = true;
    let fail = true;
    const session = new SelectionSession("passagem", "", {
      help: async () => {
        if (fail) throw new Error(signedOut ? "401" : "502");
        return help;
      },
      isSignedOut: (error) => (error as Error).message === "401",
    });
    session.choose("explain");
    await settle();
    expect(session.state).toEqual({ kind: "needsKey" });
    signedOut = false;
    await session.load();
    expect(session.state.kind).toBe("failed");
    fail = false;
    await session.load();
    expect(session.shown).toEqual(["O mar é a vida.", "A viagem é o tempo."]);
  });

  it("a cancelled request never lands", async () => {
    let finish: (value: TextHelp) => void = () => {};
    const session = new SelectionSession("passagem", "", {
      help: () => new Promise<TextHelp>((resolve) => (finish = resolve)),
      isSignedOut: () => false,
    });
    session.choose("hint");
    session.cancel();
    finish(help);
    await settle();
    expect(session.state).toEqual({ kind: "loading" });
    expect(session.help).toBeNull();
  });

  it("draws the curve TextHelp sends, with its parameter kept inside its range", async () => {
    const withGraph: TextHelp = {
      ...help,
      graph: {
        xLabel: "t",
        yLabel: "x",
        variable: "t",
        expression: "a*t^2/2",
        xMin: 0,
        xMax: 5,
        parameters: [{ name: "a", value: 2, min: 1, max: 4 }],
        draggable: "a",
        area: null,
        showsCar: false,
      },
    };
    const session = new SelectionSession("passagem", "", { help: async () => withGraph, isSignedOut: () => false });
    session.choose("explain");
    await settle();
    expect(session.graph).not.toBeNull();
    expect(session.parameterValue).toBe(2);
    session.setParameterValue(10);
    expect(session.parameterValue).toBe(4);
    session.toggleGraph();
    expect(session.showsGraph).toBe(true);
    const without = new SelectionSession("passagem", "", { help: async () => help, isSignedOut: () => false });
    without.choose("explain");
    await settle();
    expect(without.graph).toBeNull();
  });
});
