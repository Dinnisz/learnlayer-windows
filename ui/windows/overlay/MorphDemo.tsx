// `overlay.html?demo=morph` in a browser: the line-to-line morphs of the Mac's tests, held at a few moments and played
// in a loop (`&t=0.5` holds every one at that share), as a step of the stage draws them.

import { useEffect, useState } from "react";
import { MorphView } from "../../components/MorphView";

const R = String.raw;

export const morphPairs: [string, string][] = [
  ["6x - 6 = 0", "6(x - 1) = 0"],
  ["3x^2 - 6x - 9", "3(x^2 - 2x - 3)"],
  ["a = 5 + k - k + 2", "a = 7"],
  ["y = -1 - 3 + 9 + 5", "y = 10"],
  [R`C_{n}=C_{0}\,(1+r)^{n}`, R`C_{10}=1000\,(1+0{,}05)^{10}`],
  ["3(x-3)(x+1) = 0", "3(x+1)(x-3) = 0"],
  ["x + 1 = 0 \\vee x - 3 = 0", "x = -1 \\vee x = 3"],
  [
    "f'(x) = 3x^2 - 6x - 9",
    R`\begin{aligned} 3x^2 - 6x - 9 &= 0 \\ 3(x^2 - 2x - 3) &= 0 \\ 3(x - 3)(x + 1) &= 0 \end{aligned}`,
  ],
  ["v = v_0 + a t", R`\begin{aligned} v &= v_0 + a t \\ v &= 5 + 2 \cdot 3 \\ v &= 11 \end{aligned}`],
  [R`\begin{aligned} r &= 0{,}05 \\ C &= C_0(1 + r) \end{aligned}`, R`C = C_0(1 + 0{,}05)`],
  ["a+b+c", R`\sqrt{y}\approx 7`],
];

const held = new URLSearchParams(window.location.search).get("t");
const moments = held !== null ? [Number(held)] : [0.25, 0.5, 0.75];

export function MorphDemo() {
  // Played again every three seconds.
  const [started, setStarted] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setStarted(Date.now()), 3000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="stage" style={{ flexDirection: "column", gap: 18, overflow: "auto", padding: 24 }}>
      {morphPairs.map(([from, to], index) => (
        <div key={index} data-pair={index} style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
          {moments.map((moment) => (
            <div key={moment} style={{ width: 300 }} data-moment={moment}>
              <MorphView from={from} to={to} started={0} duration={1.2} frozen={moment} className="stage-step-latex" />
            </div>
          ))}
          <div style={{ width: 300 }} data-live>
            <MorphView
              key={started}
              from={from}
              to={to}
              started={started}
              duration={1.2}
              className="stage-step-latex"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
