// Port of LearnLayer/Explanation/CurveGraphView.swift @ ref 2026-11-04: axes that draw themselves, then the curve traced
// from left to right. For motion graphs a car below it moves to the same position. Dragging the curve changes the
// draggable parameter; dragging near the x axis moves the end of the shaded area. Letting go replays the car.

import { useEffect, useMemo, useRef, useState } from "react";
import { Graphs, type Graph } from "@core/illustrations/graph";
import { useLanguage } from "../i18n";
import "./figures.css";

/** What the graph reads and changes: the explanation or the exam question it belongs to. */
export interface GraphControlling {
  parameterValue: number;
  areaEnd: number | null;
  runID: number;
  /** The 1-based step on screen. Marks from a later step stay hidden. */
  graphStep: number;
  setParameterValue(value: number): void;
  setAreaEnd(value: number): void;
  replayCar(): void;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const axesDuration = 0.6;
const curveDuration = 2.6;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The plot inside the drawing area, with room above for the y label and to the right for the x label. */
export const plotRect = (width: number, height: number): Rect => ({
  x: 14,
  y: 32,
  width: width - 52,
  height: height - 42,
});

/** Converts between graph values and points in the plot. */
export class PlotMapping {
  constructor(
    readonly graph: Graph,
    readonly yRange: [number, number],
    readonly plot: Rect,
  ) {}

  point(x: number, y: number) {
    const fx = (x - this.graph.xMin) / (this.graph.xMax - this.graph.xMin);
    const fy = (y - this.yRange[0]) / (this.yRange[1] - this.yRange[0]);
    return {
      x: this.plot.x + this.plot.width * fx,
      y: this.plot.y + this.plot.height - this.plot.height * Math.min(1, Math.max(0, fy)),
    };
  }

  value(point: { x: number; y: number }) {
    const fx = (point.x - this.plot.x) / this.plot.width;
    const fy = (this.plot.y + this.plot.height - point.y) / this.plot.height;
    return {
      x: this.graph.xMin + (this.graph.xMax - this.graph.xMin) * fx,
      y: this.yRange[0] + (this.yRange[1] - this.yRange[0]) * fy,
    };
  }
}

function step(span: number): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-12)));
  const fraction = raw / magnitude;
  return (fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10) * magnitude;
}

const f = (value: number) => Math.round(value * 100) / 100;

export function CurveGraph({
  graph,
  session,
  height = 260,
  ring = null,
}: {
  graph: Graph;
  session: GraphControlling;
  height?: number;
  /** The point a lesson's beat rings on the plot, in the graph's own x and y (`LessonRun.graphRing`). */
  ring?: { x: number; y: number } | null;
}) {
  const locale = useLanguage();
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [elapsed, setElapsed] = useState(() => (reducedMotion() ? Infinity : 0));
  const [carElapsed, setCarElapsed] = useState(() => (reducedMotion() ? Infinity : 0));
  const [dragging, setDragging] = useState(false);
  // While the student drags, the value lives here, so only the graph is drawn again (60 fps); the session hears it on release.
  const [held, setHeld] = useState<{ parameter: number | null; areaEnd: number | null } | null>(null);
  const start = useRef(0);
  const carStart = useRef(0);
  const expression = useMemo(() => Graphs.parsed(graph), [graph]);
  const yRange = useMemo(() => Graphs.yRange(graph), [graph]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The axes, the curve and the car, frame by frame until they are drawn.
  useEffect(() => {
    if (reducedMotion()) return;
    const now = performance.now();
    start.current = now;
    carStart.current = now;
    let frame = requestAnimationFrame(function tick(time) {
      const seconds = (time - start.current) / 1000;
      setElapsed(seconds);
      setCarElapsed((time - carStart.current) / 1000);
      if (
        seconds < axesDuration + curveDuration + 0.2 ||
        (time - carStart.current) / 1000 < axesDuration + curveDuration + 0.2
      )
        frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [graph, session.runID]);

  const axesProgress = Math.min(1, Math.max(0, elapsed / axesDuration));
  const curveProgress = Math.min(1, Math.max(0, (elapsed - axesDuration) / curveDuration));
  const carProgress = dragging ? 1 : Math.min(1, Math.max(0, (carElapsed - axesDuration) / curveDuration));
  const drawn = curveProgress >= 1;

  const plotHeight = graph.showsCar ? height - 56 : height;
  const plot = plotRect(Math.max(120, width), plotHeight);
  const mapping = new PlotMapping(graph, yRange, plot);
  const parameter = held?.parameter ?? session.parameterValue;
  const y = (x: number) => Graphs.y(graph, x, parameter, expression);
  const axisY = mapping.point(graph.xMin, 0).y;

  // The curve from xMin up to the drawn share of the domain, skipping undefined points.
  let curve = "";
  let pen = false;
  for (let index = 0; index <= 160 && curveProgress > 0; index++) {
    const x = graph.xMin + ((graph.xMax - graph.xMin) * curveProgress * index) / 160;
    const value = y(x);
    if (!Number.isFinite(value)) {
      pen = false;
      continue;
    }
    const p = mapping.point(x, value);
    curve += `${pen ? "L" : "M"}${f(p.x)} ${f(p.y)}`;
    pen = true;
  }

  let area = "";
  const areaTo = held?.areaEnd ?? session.areaEnd ?? graph.area?.to ?? 0;
  if (graph.area) {
    const low = Math.min(graph.area.from, areaTo);
    const high = Math.max(graph.area.from, areaTo);
    if (high > low) {
      const first = mapping.point(low, 0);
      area = `M${f(first.x)} ${f(first.y)}`;
      for (let index = 0; index <= 100; index++) {
        const x = low + ((high - low) * index) / 100;
        const value = y(x);
        const p = mapping.point(x, Number.isFinite(value) ? value : 0);
        area += `L${f(p.x)} ${f(p.y)}`;
      }
      const last = mapping.point(high, 0);
      area += `L${f(last.x)} ${f(last.y)}Z`;
    }
  }

  // Both axes with arrowheads, as one path so it draws in order: up the y axis, then along the x axis.
  const head = 7;
  const axes =
    `M${plot.x} ${plot.y + plot.height}L${plot.x} ${plot.y - 6}` +
    `M${plot.x - head * 0.7} ${plot.y - 6 + head}L${plot.x} ${plot.y - 6}L${plot.x + head * 0.7} ${plot.y - 6 + head}` +
    `M${plot.x} ${f(axisY)}L${plot.x + plot.width + 14} ${f(axisY)}` +
    `M${plot.x + plot.width + 14 - head} ${f(axisY - head * 0.7)}L${plot.x + plot.width + 14} ${f(axisY)}L${plot.x + plot.width + 14 - head} ${f(axisY + head * 0.7)}`;

  let ticks = "";
  const xStep = step(graph.xMax - graph.xMin);
  for (let x = Math.ceil(graph.xMin / xStep) * xStep; x <= graph.xMax + 1e-9; x += xStep) {
    const at = mapping.point(x, 0);
    ticks += `M${f(at.x)} ${f(axisY - 4)}L${f(at.x)} ${f(axisY + 4)}`;
  }
  const yStep = step(yRange[1] - yRange[0]);
  for (let value = Math.ceil(yRange[0] / yStep) * yStep; value <= yRange[1] + 1e-9; value += yStep) {
    const at = mapping.point(graph.xMin, value);
    ticks += `M${plot.x - 4} ${f(at.y)}L${plot.x + 4} ${f(at.y)}`;
  }

  const showsCurve = graph.curveStep === null || session.graphStep >= graph.curveStep;
  const visible = graph.marks.filter((mark) => mark.step === null || mark.step <= session.graphStep);
  const crossing = visible.find((mark) => mark.role === "crossing");
  const values = visible.filter((mark) => mark.role === "value");

  const format = (value: number) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: Math.abs(value) < 10 ? 2 : 1,
      maximumFractionDigits: Math.abs(value) < 10 ? 2 : 1,
    }).format(value);
  const canDrag = (Graphs.draggableParameter(graph) !== null || graph.area?.draggableBound === true) && drawn;

  /** Near the x axis a drag moves the end of the area; elsewhere it moves the curve so it passes under the pointer. */
  const dragTo = (event: React.PointerEvent<SVGSVGElement>, startY: number) => {
    const box = event.currentTarget.getBoundingClientRect();
    const point = mapping.value({ x: event.clientX - box.left, y: event.clientY - box.top });
    const nearAxis = Math.abs(startY - axisY) < 28;
    if (graph.area?.draggableBound === true && (nearAxis || Graphs.draggableParameter(graph) === null)) {
      const end = Math.min(graph.xMax, Math.max(graph.xMin, point.x));
      setHeld((current) => ({ parameter: current?.parameter ?? null, areaEnd: end }));
      return;
    }
    // Near the start many curves pass through the same point: read the drag a little way along.
    const x = Math.max(point.x, graph.xMin + (graph.xMax - graph.xMin) * 0.35);
    const next = Graphs.parameterValue(graph, x, point.y);
    const range = Graphs.draggableParameter(graph);
    if (next !== null && range)
      setHeld((current) => ({
        parameter: Math.min(range.max, Math.max(range.min, next)),
        areaEnd: current?.areaEnd ?? null,
      }));
  };
  const dragStart = useRef(0);

  const carFraction = (y(graph.xMin + (graph.xMax - graph.xMin) * carProgress) - yRange[0]) / (yRange[1] - yRange[0]);

  return (
    <div className="curve-graph" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg
          className={`curve-graph-plot${canDrag ? " draggable" : ""}`}
          width={width}
          height={plotHeight}
          onPointerDown={(event) => {
            if (!canDrag) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            dragStart.current = event.clientY - event.currentTarget.getBoundingClientRect().top;
            setDragging(true);
            dragTo(event, dragStart.current);
          }}
          onPointerMove={(event) => {
            if (dragging) dragTo(event, dragStart.current);
          }}
          onPointerUp={() => {
            if (!dragging) return;
            setDragging(false);
            if (held?.parameter != null) session.setParameterValue(held.parameter);
            if (held?.areaEnd != null) session.setAreaEnd(held.areaEnd);
            setHeld(null);
            session.replayCar();
          }}
          role="img"
          aria-label={`${graph.yLabel}, ${graph.xLabel}`}
        >
          {area && drawn && <path d={area} className="curve-graph-area" />}
          <path
            d={axes}
            className="curve-graph-axes"
            pathLength={1}
            style={{ strokeDasharray: 1, strokeDashoffset: 1 - axesProgress }}
          />
          <path d={ticks} className="curve-graph-ticks" style={{ opacity: axesProgress }} />
          {showsCurve && <path d={curve} className="curve-graph-curve" />}
          {drawn && crossing && (
            <g>
              {Math.abs(crossing.y) > 1e-6 && (
                <path
                  d={`M${f(mapping.point(graph.xMin, crossing.y).x)} ${f(mapping.point(graph.xMin, crossing.y).y)}L${f(mapping.point(graph.xMax, crossing.y).x)} ${f(mapping.point(graph.xMax, crossing.y).y)}`}
                  className="curve-graph-level"
                />
              )}
              {values.length >= 2 &&
                (() => {
                  const low = Math.min(...values.map((mark) => mark.x));
                  const high = Math.max(...values.map((mark) => mark.x));
                  if (!(high > low)) return null;
                  const a = mapping.point(low, 0);
                  const b = mapping.point(high, 0);
                  return <path d={`M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}`} className="curve-graph-interval" />;
                })()}
            </g>
          )}
          {drawn &&
            ring &&
            Number.isFinite(ring.x) &&
            Number.isFinite(ring.y) &&
            (() => {
              const p = mapping.point(ring.x, ring.y);
              return <circle key="lesson-ring" cx={p.x} cy={p.y} r={14} className="curve-graph-ring" />;
            })()}
          {drawn &&
            visible.map((mark, index) => {
              const p = mapping.point(mark.x, mark.y);
              const crossingMark = mark.role === "crossing";
              const labelY = p.y - (crossingMark ? -18 : 16);
              // A label at the top of the plot moves aside from the y axis's title.
              const labelWidth = [...mark.label].length * 7 + 4;
              const titleWidth = Math.max(1, [...graph.yLabel].length) * 10 + 4;
              const title = {
                minX: plot.x - titleWidth / 2,
                maxX: plot.x + titleWidth / 2,
                minY: plot.y - 31,
                maxY: plot.y - 5,
              };
              const box = {
                minX: p.x - labelWidth / 2,
                maxX: p.x + labelWidth / 2,
                minY: labelY - 8.5,
                maxY: labelY + 8.5,
              };
              const hits =
                box.minX < title.maxX + 3 &&
                box.maxX > title.minX - 3 &&
                box.minY < title.maxY + 3 &&
                box.maxY > title.minY - 3;
              const labelX = hits ? title.maxX + 6 + labelWidth / 2 : p.x;
              return (
                <g key={index}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={crossingMark ? 5.5 : 4}
                    className={crossingMark ? "curve-graph-crossing" : "curve-graph-value"}
                  />
                  <text
                    x={labelX}
                    y={labelY}
                    className="curve-graph-mark"
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {mark.label}
                  </text>
                </g>
              );
            })}
          <text
            x={plot.x}
            y={plot.y - 18}
            className="curve-graph-name"
            textAnchor="middle"
            dominantBaseline="central"
            style={{ opacity: axesProgress }}
          >
            {graph.yLabel}
          </text>
          <text
            x={plot.x + plot.width + 22}
            y={axisY}
            className="curve-graph-name"
            textAnchor="middle"
            dominantBaseline="hanging"
            dy={6}
            style={{ opacity: axesProgress }}
          >
            {graph.xLabel}
          </text>
          {drawn && (
            <text x={plot.x + 20} y={plot.y + 8} className="curve-graph-readout">
              {graph.draggable && <tspan x={plot.x + 20}>{`${graph.draggable} = ${format(parameter)}`}</tspan>}
              {graph.area && (
                <tspan x={plot.x + 20} dy={graph.draggable ? 20 : 0}>
                  {`∫ = ${format(Graphs.integral(graph, graph.area.from, areaTo, parameter))}`}
                </tspan>
              )}
            </text>
          )}
        </svg>
      )}
      {graph.showsCar && width > 0 && (
        <div className="curve-graph-road" style={{ opacity: axesProgress }}>
          <div
            className={`curve-graph-car${carProgress > 0 && carProgress < 1 ? " moving" : ""}`}
            style={{ transform: `translateX(${(width - 40) * Math.min(1, Math.max(0, carFraction)) - 24}px)` }}
            aria-hidden="true"
          >
            <span className="curve-graph-speed" />
            <svg width="40" height="22" viewBox="0 0 40 22">
              <path
                d="M3 15h34v-3l-6-2-5-6H13L8 10l-5 2z"
                fill="none"
                stroke="#fff"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <circle cx="11" cy="16" r="3" fill="none" stroke="#fff" strokeWidth="1.4" />
              <circle cx="29" cy="16" r="3" fill="none" stroke="#fff" strokeWidth="1.4" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}
