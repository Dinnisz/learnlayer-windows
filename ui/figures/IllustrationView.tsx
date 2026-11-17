// The Mac's IllustrationView @ ref 2026-11-04: a scene drawn in white on the dimmed page, its motion played, a slider
// for each parameter. The layout and the labels are the renderer's (core); this draws its display list as SVG. With
// "Show animations" off it stays still until the student presses Play.

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { CompiledIllustration, type Illustration } from "@core/illustrations/illustration";
import { applyingPremadeFigure, decodePremade, PremadeFigures } from "@core/illustrations/premadeFigure";
import { formatG } from "@core/math/printf";
import { IllustrationRenderer, type DrawOp, type Paint, type TextMeasurer } from "@core/illustrations/renderer";
import { Icon } from "../components/Icon";
import { useT } from "../i18n";
import "./figures.css";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Text measured as the stage draws it: Segoe UI Variable, at the weight asked. */
let measuringContext: CanvasRenderingContext2D | null = null;
export const measureText: TextMeasurer = (text, fontSize, weight, maxWidth) => {
  measuringContext ??= document.createElement("canvas").getContext("2d");
  const context = measuringContext!;
  context.font = `${weight} ${fontSize}px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`;
  const width = (line: string) => context.measureText(line).width;
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    let line = "";
    for (const word of raw.split(" ")) {
      const next = line === "" ? word : `${line} ${word}`;
      if (line !== "" && width(next) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return {
    width: Math.min(maxWidth, Math.max(...lines.map(width))) + 1,
    height: lines.length * fontSize * 1.25,
    lines,
  };
};

const colours: Record<string, string> = {
  white: "#ffffff",
  accent: "var(--figure-accent, #0a84ff)",
  second: "rgb(255, 158, 64)",
  red: "rgb(255, 69, 69)",
  orange: "rgb(255, 148, 51)",
  yellow: "rgb(255, 230, 64)",
  green: "rgb(77, 217, 102)",
  blue: "rgb(77, 140, 255)",
  violet: "rgb(166, 102, 255)",
  shadow: "#000000",
};
const colourOf = (paint: Paint) => colours[paint.color] ?? "#ffffff";

/** Draws a display list. Strokes marked `drawn` are traced in by hand the first time they appear. */
export function DisplayList({
  ops,
  width,
  height,
  label,
}: {
  ops: DrawOp[];
  width: number;
  height: number;
  label?: string;
}) {
  const holes = ops.filter((op): op is Extract<DrawOp, { op: "hole" }> => op.op === "hole");
  const lastHole = ops.reduce((last, op, index) => (op.op === "hole" ? index : last), -1);
  const maskID = `holes${useId().replace(/:/g, "")}`;
  const render = (op: DrawOp, index: number): ReactNode => {
    switch (op.op) {
      case "path":
        return (
          <path
            key={index}
            d={op.d}
            className={op.drawn ? "figure-drawn" : undefined}
            pathLength={op.drawn ? 1 : undefined}
            style={{
              fill: op.fill ? colourOf(op.fill) : "none",
              fillOpacity: op.fill?.opacity,
              stroke: op.stroke ? colourOf(op.stroke) : "none",
              strokeOpacity: op.stroke?.opacity,
              strokeWidth: op.width,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              // A dashed stroke keeps its dashes (it is not traced in).
              strokeDasharray: op.dash ? op.dash.join(" ") : undefined,
            }}
          />
        );
      case "text":
        return (
          <text
            key={index}
            className="figure-label"
            x={op.box.minX}
            y={op.box.minY}
            style={{
              fill: colourOf(op.paint),
              fillOpacity: op.paint.opacity,
              fontSize: op.size,
              fontWeight: op.weight,
            }}
          >
            {op.lines.map((line, row) => (
              <tspan key={row} x={op.box.minX} dy={row === 0 ? op.size : op.size * 1.25}>
                {line}
              </tspan>
            ))}
          </text>
        );
      case "glyph":
        return (
          <text
            key={index}
            x={op.x}
            y={op.y}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fill: colourOf(op.paint), fontSize: op.size, fontWeight: op.weight }}
          >
            {op.text}
          </text>
        );
      case "sphere":
        return (
          <g key={index}>
            <defs>
              <radialGradient id={`${maskID}-lit-${index}`} cx="0.32" cy="0.3" r="0.75">
                <stop offset="0" stopColor="#fff" stopOpacity={0.6 * op.amount} />
                <stop offset="1" stopColor="#fff" stopOpacity={0} />
              </radialGradient>
              <radialGradient id={`${maskID}-rim-${index}`} cx="0.32" cy="0.3" r="0.9">
                <stop offset="0.3" stopColor="#000" stopOpacity={0} />
                <stop offset="1" stopColor="#000" stopOpacity={0.45 * op.amount} />
              </radialGradient>
            </defs>
            <circle cx={op.cx} cy={op.cy} r={op.r} fill={`url(#${maskID}-lit-${index})`} />
            <circle cx={op.cx} cy={op.cy} r={op.r} fill={`url(#${maskID}-rim-${index})`} />
          </g>
        );
      case "hole":
        return null;
    }
  };
  return (
    <svg
      className="figure-svg"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={label}
    >
      {holes.length > 0 && (
        <mask id={maskID} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
          <rect width={width} height={height} fill="#fff" />
          {holes.map((hole, index) => (
            <circle key={index} cx={hole.cx} cy={hole.cy} r={hole.r} fill="#000" />
          ))}
        </mask>
      )}
      {/* An open end is hollow over whatever it lies on (the curve that ends in it too). */}
      <g mask={holes.length > 0 ? `url(#${maskID})` : undefined}>{ops.slice(0, lastHole + 1).map(render)}</g>
      {ops.slice(lastHole + 1).map((op, index) => render(op, lastHole + 1 + index))}
    </svg>
  );
}

/** The size of an element, followed as it changes. */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export function IllustrationView({
  scene,
  revealed = true,
  step = Number.MAX_SAFE_INTEGER,
  language = "Portuguese (Portugal)",
  maxHeight = 320,
}: {
  scene: Illustration;
  revealed?: boolean;
  step?: number;
  language?: string;
  maxHeight?: number;
}) {
  const t = useT();
  const [ref, available] = useWidth();
  // A premade figure whose sliders recompile it: the figure the student has made.
  const [active, setActive] = useState<Illustration | null>(null);
  const [values, setValues] = useState<Record<string, number>>({});
  const working = active ?? scene;
  const compiled = useMemo(() => new CompiledIllustration(working), [working]);
  const duration = working.duration ?? 0;
  const animated = duration > 0;
  const [playing, setPlaying] = useState(() => !reducedMotion());
  const [time, setTime] = useState(0);
  const started = useRef(0);
  const paused = useRef(0);

  useEffect(() => {
    if (!animated || !playing) return;
    started.current = performance.now() - paused.current * 1000;
    let frame = requestAnimationFrame(function tick(now) {
      setTime(((((now - started.current) / 1000) % duration) + duration) % duration);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [animated, playing, duration]);

  // Stepped playback (IllustrationStepPlayback): each boundary is the scene time when that step has finished.
  const boundaries = (working as { stepPlayback?: { boundaries: number[] } | null }).stepPlayback?.boundaries ?? null;
  const [stepped, setStepped] = useState<number | null>(null);
  const shownTime = stepped !== null && boundaries ? (boundaries[stepped] ?? 0) : time;
  /** The step the picture is at: the one picked, else the last one the running clock has passed. */
  const currentStep =
    stepped ??
    (boundaries
      ? Math.max(
          0,
          boundaries.reduce((last, end, index) => (time >= end ? index : last), 0),
        )
      : 0);
  const snapTo = (index: number) => {
    if (!boundaries) return;
    const next = Math.max(0, Math.min(boundaries.length - 1, index));
    setStepped(next);
    setPlaying(false);
    paused.current = boundaries[next] ?? 0;
  };
  const togglePlaying = () => {
    if (playing) {
      paused.current = time;
      setPlaying(false);
    } else {
      if (stepped !== null && boundaries) paused.current = boundaries[stepped] ?? 0;
      setStepped(null);
      setPlaying(true);
    }
  };

  const width = Math.max(120, available);
  const height = Math.min(maxHeight, (width * working.height) / Math.max(0.001, working.width));
  const drawnWidth = Math.min(width, (height * working.width) / Math.max(0.001, working.height));
  const valueOf = (name: string, fallback: number) => values[name] ?? fallback;
  const ops = useMemo(() => {
    if (available === 0) return [];
    const scope: Record<string, number> = {
      t: animated ? shownTime : 0,
      revealed: revealed ? 1 : 0,
      step: step === Number.MAX_SAFE_INTEGER ? 1000 : step,
    };
    for (const parameter of working.parameters ?? []) scope[parameter.name] = values[parameter.name] ?? parameter.value;
    return new IllustrationRenderer(compiled, scope, { width: drawnWidth, height }, scope.t!, measureText).draw();
  }, [available, animated, shownTime, revealed, step, working, values, compiled, drawnWidth, height]);

  const premade = decodePremade(working.premade ?? scene.premade);
  const recompiles = premade ? new PremadeFigures(premade).needsParameterRecompile : false;
  const change = (name: string, value: number) => {
    const next = { ...values, [name]: value };
    setValues(next);
    if (!premade || !recompiles) return;
    // A premade's slider recompiles the figure locally, with no model call.
    const merged = new PremadeFigures(premade).mergingParameters({ [name]: value });
    const built = new PremadeFigures(merged).compile(scene.title, language);
    if (!built || !new CompiledIllustration(built).isDrawable) return;
    setActive(applyingPremadeFigure({ ...built, premade: merged }, language));
  };

  return (
    <figure className="figure" ref={ref}>
      {working.title && <figcaption className="figure-title">{working.title}</figcaption>}
      <div className="figure-canvas" style={{ height }}>
        <DisplayList ops={ops} width={drawnWidth} height={height} label={working.title} />
      </div>
      {animated && boundaries && boundaries.length > 1 ? (
        // IllustrationStepControls: previous, play/pause, next and the step counter.
        <div className="figure-steps">
          <button
            type="button"
            className="figure-play"
            aria-label={t("Previous")}
            disabled={currentStep <= 0}
            onClick={() => snapTo(currentStep - 1)}
          >
            <Icon symbol="backward.frame.fill" size={14} />
          </button>
          <button type="button" className="figure-play" onClick={togglePlaying}>
            {playing ? t("Pause") : t("Play")}
          </button>
          <button
            type="button"
            className="figure-play"
            aria-label={t("Next")}
            disabled={currentStep >= boundaries.length - 1}
            onClick={() => snapTo(currentStep + 1)}
          >
            <Icon symbol="forward.frame.fill" size={14} />
          </button>
          <span className="figure-step-count">{t("Step %lld of %lld", currentStep + 1, boundaries.length)}</span>
        </div>
      ) : animated ? (
        <button type="button" className="figure-play" onClick={togglePlaying}>
          {playing ? t("Pause") : t("Play")}
        </button>
      ) : null}
      {(working.parameters ?? []).map((parameter) => (
        <label key={parameter.name} className="figure-slider">
          <span>
            <span>{parameter.label ?? parameter.name}</span>
            <span className="figure-slider-value">{formatG(valueOf(parameter.name, parameter.value), 3)}</span>
          </span>
          <input
            type="range"
            min={parameter.min}
            max={Math.max(parameter.min + 0.0001, parameter.max)}
            step={(parameter.max - parameter.min) / 400 || 0.001}
            value={valueOf(parameter.name, parameter.value)}
            onChange={(event) => change(parameter.name, Number(event.target.value))}
          />
        </label>
      ))}
    </figure>
  );
}
