// SF Symbol names (what the Swift code asks for) drawn as the app's own line icons, in SVG. A font of icons is only
// on Windows (Segoe Fluent Icons) and would leave the pill and the sidebar empty on the Mac and in a browser; these
// look the same everywhere and take the text colour. Drawn on a 24-point grid and shown edge to edge (its middle 20
// points fill the size, as a symbol fills its em box), 1.6-point rounded strokes, as SF Symbols' regular
// weight. A shape marked "F:" is painted, not stroked; "E:" is painted with its inner shapes cut out; "D:" is dotted.

/** A circle as path data, for icons written as one list of paths. */
const ring = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** A gear's outline with `teeth` teeth between radii `inner` and `outer`, round the centre of the grid. */
function gear(teeth: number, inner: number, outer: number): string {
  const points: string[] = [];
  const step = (2 * Math.PI) / teeth;
  for (let tooth = 0; tooth < teeth; tooth++) {
    const at = tooth * step - Math.PI / 2;
    for (const [angle, radius] of [
      [at - step * 0.36, inner],
      [at - step * 0.2, outer],
      [at + step * 0.2, outer],
      [at + step * 0.36, inner],
    ] as const) {
      points.push(`${(12 + radius * Math.cos(angle)).toFixed(2)} ${(12 + radius * Math.sin(angle)).toFixed(2)}`);
    }
  }
  return `M${points.join("L")}Z`;
}

const corners = "M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3";
const person = `${ring(12, 9.5, 3.2)}M6.3 18.6c1.3-2.3 3.3-3.5 5.7-3.5s4.4 1.2 5.7 3.5`;
const speaker = "M4 9.5h3l5-4v13l-5-4H4z";
const document = "M6.5 3h7.5l4.5 4.5V21h-12zM14 3v4.5h4.5";
const magnifier = `${ring(10.5, 10.5, 6.5)}M15.3 15.3L20 20`;
const microphone = "M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6";

const shapes: Record<string, readonly string[]> = {
  "point.3.connected.trianglepath.dotted": [
    `F:${ring(12, 5, 2.3)}`,
    `F:${ring(5, 18.5, 2.3)}`,
    `F:${ring(19, 18.5, 2.3)}`,
    "D:M10.8 7.2L6.3 16M13.2 7.2l4.5 8.8M7.6 18.5h8.8",
  ],
  folder: [
    "M3 7.5A2.5 2.5 0 0 1 5.5 5H9.5l2 2.2h7A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z",
  ],
  "person.crop.circle": [ring(12, 12, 9), person],
  "person.fill": [`F:${ring(12, 8, 4)}`, "F:M4 20.5c0-4.2 3.6-6.5 8-6.5s8 2.3 8 6.5z"],
  "chart.bar.xaxis": ["M3 20.5h18M7 17v-5M12 17V6.5M17 17V9.5"],
  gearshape: [gear(8, 6.6, 8.8), ring(12, 12, 2.8)],
  "hand.raised": [
    "M8.5 12.5V6a1.5 1.5 0 0 1 3 0v5.5M11.5 11V4.5a1.5 1.5 0 0 1 3 0V11M14.5 11.5V6a1.5 1.5 0 0 1 3 0v7.5c0 4.4-2.6 7.5-6 7.5-2.4 0-3.9-1.1-5.3-3.2l-2.3-3.6a1.5 1.5 0 0 1 2.5-1.7l1.6 2.2",
  ],
  sparkles: [
    "M11 3.5l1.7 5.3 5.3 1.7-5.3 1.7L11 17.5l-1.7-5.3L4 10.5l5.3-1.7z",
    "M18 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z",
  ],
  "lock.shield": [
    "M12 3l7.5 3v5.2c0 4.6-3.1 8.2-7.5 9.8-4.4-1.6-7.5-5.2-7.5-9.8V6z",
    "M9.3 11.5h5.4v4H9.3zM10.3 11.5V10a1.7 1.7 0 0 1 3.4 0v1.5",
  ],
  laptopcomputer: ["M5.5 5h13A1.5 1.5 0 0 1 20 6.5V16H4V6.5A1.5 1.5 0 0 1 5.5 5zM2.5 19h19"],
  "square.and.arrow.down": ["M12 3.5v11M8 10.5l4 4 4-4M5 13.5v4.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4.5"],
  "person.crop.circle.badge.xmark": ["M20.6 10.5A9 9 0 1 0 13.5 20.9", person, "M16.5 16.5l4 4M20.5 16.5l-4 4"],
  trash: ["M4 7h16M9.5 7V4.5h5V7M6 7l1 13.5h10L18 7M10 11v6M14 11v6"],
  "camera.viewfinder": [
    corners,
    "M8.5 9.5h1.6l1-1.5h1.8l1 1.5h1.6a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z",
    ring(12, 13, 1.8),
  ],
  macwindow: ["M5 4.5h14A2 2 0 0 1 21 6.5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2zM3 9h18"],
  viewfinder: [corners],
  "text.viewfinder": [corners, "M8 9.5h8M8 12.5h8M8 15.5h5"],
  "text.cursor": ["M12 5v14M9 4.5c1.5 0 3 .5 3 1.5 0-1 1.5-1.5 3-1.5M9 19.5c1.5 0 3-.5 3-1.5 0 1 1.5 1.5 3 1.5"],
  "questionmark.bubble": [
    "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z",
    "M10 8.7a2 2 0 1 1 2.9 1.8c-.6.3-.9.7-.9 1.3v.4",
    `F:${ring(12, 14.3, 0.95)}`,
  ],
  "mic.fill": ["F:M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0z", microphone],
  mic: ["M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0z", microphone],
  "speaker.wave.2": [speaker, "M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8"],
  "speaker.slash": [speaker, "M3.5 3.5l17 17"],
  "stop.fill": ["F:M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"],
  "arrow.turn.down.right": ["M6 4.5V11a3 3 0 0 0 3 3h10M15 10l4 4-4 4"],
  "arrow.uturn.backward": ["M9 14L4.5 9.5 9 5M4.5 9.5H15a4.5 4.5 0 0 1 0 9h-3"],
  lightbulb: [
    "M9.2 18h5.6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .8 1.6V16h5.6v-.6c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z",
  ],
  // The mark is cut out of the filled triangle (even-odd), so it shows the ground on any background.
  "exclamationmark.triangle.fill": [
    `E:M10.3 4.3a2 2 0 0 1 3.4 0l7.6 13.2A2 2 0 0 1 19.6 20.5H4.4a2 2 0 0 1-1.7-3zM11.1 8.6h1.8l-.3 5.6h-1.2z${ring(12, 16.6, 1)}`,
  ],
  xmark: ["M6 6l12 12M18 6L6 18"],
  x: ["M6 6l12 12M18 6L6 18"],
  "plus.magnifyingglass": [magnifier, "M8 10.5h5M10.5 8v5"],
  "minus.magnifyingglass": [magnifier, "M8 10.5h5"],
  "arrow.up.left.and.arrow.down.right": ["M4 10V4h6M4 4l6 6M20 14v6h-6M20 20l-6-6"],
  doc: [document],
  checkmark: ["M5 12.5l4.5 4.5L19 7"],
  "arrow.triangle.2.circlepath": [
    "M19.5 10.5A7.7 7.7 0 0 0 6 6.8M4.5 13.5A7.7 7.7 0 0 0 18 17.2",
    "M5 3.5v3.8h3.8M19 20.5v-3.8h-3.8",
  ],
  network: [ring(12, 12, 9), "M3 12h18M12 3c2.6 2.5 3.8 5.5 3.8 9s-1.2 6.5-3.8 9c-2.6-2.5-3.8-5.5-3.8-9S9.4 5.5 12 3z"],
  waveform: ["M4.5 10.5v3M8 7.5v9M11.5 4.5v15M15 8v8M18.5 10v4"],
  "lock.doc": [document, "M9.5 13.5h5v4h-5zM10.5 13.5V12a1.5 1.5 0 0 1 3 0v1.5"],
  "backward.frame.fill": ["F:M18 6v12l-9-6z", "M6.5 6v12"],
  "forward.frame.fill": ["F:M6 6v12l9-6z", "M17.5 6v12"],
  "cursorarrow.click.2": ["M10 10l10 4.2-4.4 1.5-1.5 4.4z", "M4.5 4.5l2 2M10 3v2.6M3 10h2.6"],
};

/** Shown for a symbol the set doesn't have yet: a plain circle, so the row keeps its rhythm. */
const unknown = [ring(12, 12, 8)];

export const knownSymbols = Object.keys(shapes);

export function Icon({ symbol, size = 14, className }: { symbol: string; size?: number; className?: string }) {
  const paths = shapes[symbol] ?? unknown;
  return (
    <svg
      className={className ? `icon ${className}` : "icon"}
      width={size}
      height={size}
      viewBox="2 2 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((path, index) => {
        const kind = path.slice(0, 2);
        const d = kind === "F:" || kind === "D:" || kind === "E:" ? path.slice(2) : path;
        if (kind === "F:") return <path key={index} d={d} fill="currentColor" stroke="none" />;
        if (kind === "E:") return <path key={index} d={d} fill="currentColor" fillRule="evenodd" stroke="none" />;
        // A dotted line (the connected points).
        if (kind === "D:") return <path key={index} d={d} strokeDasharray="0.1 3" strokeWidth={1.6} />;
        return <path key={index} d={d} />;
      })}
    </svg>
  );
}
