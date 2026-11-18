// `overlay.html?demo=circuit` in a browser: the circuits and the solids of the Mac's tests drawn as the stage draws them.

import { CircuitSpecs, type CircuitSpec } from "@core/illustrations/circuit";
import { CircuitView } from "../../figures/CircuitView";
import { SolidView } from "../../figures/SolidView";
import { GenericSolids } from "@core/illustrations/solid";
import { sweepHighlight } from "@core/illustrations/figureSteps";
import { useState } from "react";
import { animatedGallery } from "@core/illustrations/animated/animated";
import { PremadeFigures } from "@core/illustrations/premadeFigure";
import { IllustrationView } from "../../figures/IllustrationView";
import { decodeSpaceFigure } from "@core/illustrations/spaceFigure";
import { spaceParts } from "@core/illustrations/spaceSteps";
import { SpaceFigureView } from "../../figures/SpaceFigureView";

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

/** The pyramid of Space3DTests and its solution's steps, each lighting what it names. */
const pyramid = decodeSpaceFigure({
  points: [
    { name: "A", x: 2, y: 0, z: 0 },
    { name: "B", x: 2, y: 2, z: 0 },
    { name: "C", x: 0, y: 2, z: 0 },
    { name: "D", x: 0, y: 0, z: 0 },
    { name: "V", x: 1, y: 1, z: 3 },
  ],
  edges: ["AB", "BC", "CD", "DA", "VA", "VB", "VC", "VD"],
  line: { name: "r", point: [0, 2, 0], direction: [3, 0, 1], through: ["C"], step: null },
  plane: { name: "α", normal: [3, 0, 1], point: [2, 0, 0], through: ["A", "B", "V"], step: null },
});
const pyramidSteps: [string, string][] = [
  [String.raw`\vec{n} = \overrightarrow{AB} \times \overrightarrow{AV} = (6, 0, 2)`, "Vetor normal ao plano ABV"],
  [String.raw`(x, y, z) = (0, 2, 0) + k(3, 0, 1)`, "Reta r que passa em C"],
  [String.raw`3(3k) + k = 6 \Rightarrow k = 0{,}6`, "Interseção da reta com o plano"],
];

function SpaceDemo() {
  const [step, setStep] = useState(-1);
  if (!pyramid) return null;
  const highlight = step >= 0 ? spaceParts(pyramidSteps[step]![0], pyramidSteps[step]![1], pyramid) : null;
  return (
    <div style={{ width: 460 }}>
      <SpaceFigureView figure={pyramid} highlight={highlight} />
      {pyramidSteps.map(([, words], index) => (
        <button key={words} type="button" onClick={() => setStep(step === index ? -1 : index)}>
          {words}
        </button>
      ))}
    </div>
  );
}
export function CircuitDemo() {
  const [sweep, setSweep] = useState(0);
  const [assemble, setAssemble] = useState(0);
  const specs = netlists.flatMap(([name, params]): [string, CircuitSpec][] => {
    const spec = CircuitSpecs.fromPremade({ type: CircuitSpecs.generic, params: params as never });
    return spec ? [[name, spec]] : [];
  });
  return (
    <div className="stage" style={{ flexDirection: "column", alignItems: "center", gap: 32 }}>
      {specs.map(([name, spec]) => (
        <CircuitView key={name} spec={spec} caption={name} highlight={name === "ICSE Q1" ? ["R1", "R2"] : null} />
      ))}
      <SpaceDemo />
      {solids.map(([name, params], index) => {
        const solid = GenericSolids.fromParams(params as never);
        // The first solid as on the step that writes its volume's integral: the slice sent along [a, b].
        return solid ? (
          <div key={name} style={{ width: 460 }}>
            <SolidView
              solid={solid}
              caption={name}
              height={280}
              highlight={index === 0 ? (sweep % 2 === 0 ? sweepHighlight : null) : null}
              assembleStep={index === 1 && assemble > 0 ? assemble : null}
            />
            {index === 0 ? (
              <button type="button" onClick={() => setSweep((n) => n + 1)}>
                sweep
              </button>
            ) : index === 1 ? (
              <button type="button" onClick={() => setAssemble((n) => (n + 1) % 7)}>
                assemble
              </button>
            ) : null}
          </div>
        ) : null;
      })}
    </div>
  );
}

/** `overlay.html?demo=animated`: every animated premade drawn here, as the stage shows it. */
export function AnimatedDemo() {
  return (
    <div
      className="stage"
      style={{ flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: 24, overflow: "auto" }}
    >
      {animatedGallery.map((figure, index) => {
        const scene = new PremadeFigures(figure).compile(figure.type, "Portuguese (Portugal)");
        return scene ? (
          <div key={`${figure.type}-${index}`} style={{ width: 520 }} data-type={figure.type}>
            <IllustrationView scene={scene} />
          </div>
        ) : null;
      })}
    </div>
  );
}
