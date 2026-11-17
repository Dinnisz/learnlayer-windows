// `overlay.html?demo=circuit` in a browser: the circuits and the solids of the Mac's tests drawn as the stage draws them.

import { CircuitSpecs, type CircuitSpec } from "@core/illustrations/circuit";
import { CircuitView } from "../../figures/CircuitView";
import { SolidView } from "../../figures/SolidView";
import { GenericSolids } from "@core/illustrations/solid";

/** The round 10 solids of the Mac's tests: a washer about y = −1, a shell about Oy, semicircular sections. */
const solids: [string, object][] = [
  ["y = x, y = x², about y = −1", { kind: "revolution", f: "x", g: "x^2", axis: "x", k: -1, a: 0, b: 1 }],
  ["y = x² about Oy", { kind: "revolution", f: "x^2", axis: "y", a: 0, b: 2 }],
  ["semicircles on y = ±√x", { kind: "sections", f: "sqrt(x)", g: "-sqrt(x)", a: 0, b: 4, section: "semicircle" }],
];

const netlists: [string, object][] = [
  [
    "ICSE Q1",
    {
      netlist: {
        terminals: ["a", "b"],
        components: [
          { id: "R1", kind: "resistor", from: "a", to: "n1", value: 1000 },
          { id: "R2", kind: "resistor", from: "n1", to: "n2", value: 2000 },
          { id: "R3", kind: "resistor", from: "a", to: "n2", value: 1500 },
          { id: "R4", kind: "resistor", from: "n2", to: "b", value: 2000 },
        ],
      },
    },
  ],
  [
    "ICSE Q2",
    {
      netlist: {
        terminals: ["a", "b"],
        components: [
          { id: "R1", kind: "resistor", from: "t", to: "a", value: 1000 },
          { id: "R2", kind: "resistor", from: "t", to: "b", value: 2000 },
          { id: "I1", kind: "current_source", from: "t", to: "b", value: 0.003 },
          { id: "R3", kind: "resistor", from: "t", to: "b", value: 2000 },
        ],
      },
    },
  ],
  [
    "ICSE Q3",
    {
      components: [
        { id: "V1", kind: "battery", from: "0", to: "n1", value: 20 },
        { id: "R2", kind: "resistor", from: "n1", to: "n2", value: 75000 },
        { id: "R4", kind: "resistor", from: "n2", to: "0", value: 50000 },
        { id: "R3", kind: "resistor", from: "n2", to: "n3", value: 50000 },
        { id: "L5", kind: "inductor", from: "n3", to: "0", value: 0.01 },
      ],
    },
  ],
];

export function CircuitDemo() {
  const specs = netlists.flatMap(([name, params]): [string, CircuitSpec][] => {
    const spec = CircuitSpecs.fromPremade({ type: CircuitSpecs.generic, params: params as never });
    return spec ? [[name, spec]] : [];
  });
  return (
    <div className="stage" style={{ flexDirection: "column", alignItems: "center", gap: 32 }}>
      {specs.map(([name, spec]) => (
        <CircuitView key={name} spec={spec} caption={name} highlight={name === "ICSE Q1" ? ["R1", "R2"] : null} />
      ))}
      {solids.map(([name, params]) => {
        const solid = GenericSolids.fromParams(params as never);
        return solid ? (
          <div key={name} style={{ width: 460 }}>
            <SolidView solid={solid} caption={name} height={280} />
          </div>
        ) : null;
      })}
    </div>
  );
}
