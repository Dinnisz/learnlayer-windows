// A circuit as exams draw it: a 2D schematic with the usual symbols, from the netlist the app checked against the
// answer (core/illustrations/circuit.ts) and laid out on the Mac's grid (circuitLayout.ts). The Mac shows the same
// layout as a 3D board (Circuit3D.swift); Windows draws it flat (docs/DECISOES.md). White on the stage, the one blue for
// the terminals; reduced motion only fades it in.

import { useMemo } from "react";
import { CircuitMerges, CircuitSpecs, type CircuitComponent, type CircuitSpec } from "@core/illustrations/circuit";
import { CircuitLayouts, type Vec } from "@core/illustrations/circuitLayout";
import "./figures.css";

/** Pixels per grid unit: the nodes are 2.4 units apart, a part's body 1 unit long. */
const unit = 46;

function valueLabel(item: CircuitComponent): string | null {
  if (item.value === null || !Number.isFinite(item.value)) return null;
  const units: Partial<Record<CircuitComponent["kind"], string>> = {
    battery: "V",
    resistor: "Ω",
    capacitor: "F",
    inductor: "H",
    currentsource: "A",
  };
  const symbol = units[item.kind];
  return symbol ? CircuitSpecs.engineering(item.value, symbol) : null;
}

/** The symbol of one part, drawn along +x around the origin, `length` long (one grid unit). */
function Symbol({ item }: { item: CircuitComponent }) {
  const half = unit / 2;
  switch (item.kind) {
    case "resistor":
      // The IEC rectangle Portuguese exams use.
      return <rect x={-half} y={-8} width={unit} height={16} rx={1.5} className="circuit-body" />;
    case "lamp":
      return (
        <g className="circuit-body">
          <circle r={13} />
          <path d="M -9 -9 L 9 9 M -9 9 L 9 -9" />
          <path d={`M ${-half} 0 L -13 0 M 13 0 L ${half} 0`} />
        </g>
      );
    case "capacitor":
      return (
        <g className="circuit-body">
          <path d={`M ${-half} 0 L -5 0 M 5 0 L ${half} 0`} />
          <path d="M -5 -14 L -5 14 M 5 -14 L 5 14" className="circuit-plate" />
        </g>
      );
    case "battery":
      // `to` is +: the long thin plate on its side, the short thick one on `from`'s.
      return (
        <g className="circuit-body">
          <path d={`M ${-half} 0 L -5 0 M 5 0 L ${half} 0`} />
          <path d="M -5 -8 L -5 8" className="circuit-plate thick" />
          <path d="M 5 -15 L 5 15" className="circuit-plate" />
        </g>
      );
    case "inductor": {
      const bumps = 4;
      const width = unit / bumps;
      const path = Array.from({ length: bumps }, (_, index) => {
        const x = -half + index * width;
        return `M ${x} 0 A ${width / 2} ${width / 2} 0 0 1 ${x + width} 0`;
      }).join(" ");
      return <path d={path} className="circuit-body" />;
    }
    case "switch":
      return item.isClosed ? (
        <g className="circuit-body">
          <path d={`M ${-half} 0 L ${half} 0`} />
          <circle cx={-half + 3} r={2.5} className="circuit-dot" />
          <circle cx={half - 3} r={2.5} className="circuit-dot" />
        </g>
      ) : (
        <g className="circuit-body">
          <path d={`M ${-half + 3} 0 L ${half - 6} -14`} />
          <circle cx={-half + 3} r={2.5} className="circuit-dot" />
          <circle cx={half - 3} r={2.5} className="circuit-dot" />
        </g>
      );
    case "currentsource":
      return (
        <g className="circuit-body">
          <circle r={14} />
          <path d="M -8 0 L 8 0 M 3 -5 L 8 0 L 3 5" />
          <path d={`M ${-half} 0 L -14 0 M 14 0 L ${half} 0`} />
        </g>
      );
    case "wire":
      return null;
  }
}

export function CircuitView({
  spec,
  caption,
  highlight = null,
  joined = null,
}: {
  spec: CircuitSpec;
  caption?: string;
  /** The resistors the step in focus joins (Figure3DSteps): lit in the blue, with their equivalent written. */
  highlight?: readonly string[] | null;
  /** The ones joined so far, when the join waits for the voice (`LessonFigure3D.join`); null joins all that are lit. */
  joined?: readonly string[] | null;
}) {
  const lit = new Set(highlight ?? []);
  const merging = joined ?? highlight;
  const merge = merging && merging.length >= 2 ? CircuitMerges.make(spec, merging) : null;
  const layout = useMemo(() => CircuitLayouts.make(spec), [spec]);
  const bounds = CircuitLayouts.bounds(layout);
  // Room for the labels: a vertical part's sits on its right ("R1 = 1 kΩ"), a terminal's on the left.
  const margin = { left: 1.1, right: 2.6, top: 1.1, bottom: 0.9 };
  const width = (bounds.max.x - bounds.min.x + margin.left + margin.right) * unit;
  const height = (bounds.max.y - bounds.min.y + margin.top + margin.bottom) * unit;
  const point = (p: Vec) => ({
    x: (p.x - bounds.min.x + margin.left) * unit,
    y: (p.y - bounds.min.y + margin.top) * unit,
  });
  const degree = (node: string) =>
    spec.components.reduce((sum, item) => sum + (item.from === node ? 1 : 0) + (item.to === node ? 1 : 0), 0);
  const terminals = new Set(spec.terminals ?? []);

  return (
    <figure className="circuit-figure">
      <svg
        className="circuit"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={caption ?? spec.components.map((item) => valueLabel(item) ?? item.id).join(", ")}
      >
        {spec.components.flatMap((item) =>
          CircuitLayouts.wires(layout, item.id).map(([start, end], index) => {
            const a = point(start);
            const b = point(end);
            return <line key={`${item.id}-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="circuit-wire" />;
          }),
        )}
        {spec.components.map((item) => {
          const body = layout.bodies.get(item.id);
          if (!body) return null;
          const centre = point(body.center);
          const angle = (Math.atan2(body.direction.y, body.direction.x) * 180) / Math.PI;
          const vertical = Math.abs(body.direction.x) < 0.5;
          const label = [item.id, valueLabel(item)].filter(Boolean).join(" = ");
          return (
            <g key={item.id}>
              <g
                transform={`translate(${centre.x} ${centre.y}) rotate(${angle})`}
                className={lit.has(item.id) ? "circuit-lit" : undefined}
              >
                <Symbol item={item} />
              </g>
              <text
                x={centre.x + (vertical ? 22 : 0)}
                y={centre.y + (vertical ? 4 : -22)}
                textAnchor={vertical ? "start" : "middle"}
                className="circuit-label"
              >
                {label}
              </text>
            </g>
          );
        })}
        {[...layout.nodes.entries()].map(([node, at]) => {
          const p = point(at);
          if (terminals.has(node))
            return (
              <g key={node}>
                <circle cx={p.x} cy={p.y} r={4.5} className="circuit-terminal" />
                <text x={p.x - 10} y={p.y + 5} textAnchor="end" className="circuit-terminal-label">
                  {node}
                </text>
              </g>
            );
          return degree(node) >= 3 ? <circle key={node} cx={p.x} cy={p.y} r={3.5} className="circuit-node" /> : null;
        })}
      </svg>
      {merge ? (
        <p className="circuit-merge" role="status">
          {`${merge.ids.join(" + ")} = ${CircuitSpecs.engineering(merge.ohms, "Ω")}`}
        </p>
      ) : null}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
