// Port of LearnLayer/Illustrations/SpaceFigureView.swift @ ref 2026-11-04: the figure in orthographic 3D as textbooks
// draw Oxyz (x towards the reader, y right, z up). Dragging turns it within limits; the line and plane come with the
// step that brings them in.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  spaceDrawing,
  stillPitch,
  stillYaw,
  viewFrame,
  type NameRole,
  type SpaceFigure,
} from "@core/illustrations/spaceFigure";
import { useT } from "../i18n";
import { measureText } from "./IllustrationView";
import "./figures.css";

const yawRange: [number, number] = [0.05, 0.95];
const pitchRange: [number, number] = [0.12, 0.75];
const clamp = (value: number, [low, high]: [number, number]) => Math.min(high, Math.max(low, value));

const fontFor = (role: NameRole, size: number) =>
  role === "axis"
    ? { size, weight: 400, colour: "rgba(255,255,255,0.4)" }
    : role === "vertex"
      ? { size, weight: 500, colour: "#fff" }
      : role === "origin"
        ? { size: size * 0.86, weight: 400, colour: "rgba(255,255,255,0.4)" }
        : { size: size * 0.93, weight: 600, colour: "var(--accent, #0a84ff)" };

export function SpaceFigureView({ figure, step = Number.MAX_SAFE_INTEGER }: { figure: SpaceFigure; step?: number }) {
  const t = useT();
  const holder = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [turn, setTurn] = useState({ yaw: stillYaw, pitch: stillPitch });
  const dragStart = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.min(520, Math.floor(entry!.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const height = width / 1.15;
  const drawing = useMemo(() => {
    if (width === 0) return null;
    const frame = viewFrame(width, height);
    return spaceDrawing(
      figure,
      turn.yaw,
      turn.pitch,
      frame,
      (text, role) => {
        const font = fontFor(role, frame.textSize);
        const measured = measureText(text, font.size, font.weight, 400);
        return { width: measured.width, height: measured.height };
      },
      step,
    );
  }, [figure, turn, width, height, step]);
  const textSize = viewFrame(width, height).textSize;

  return (
    <div className="space-figure" ref={holder} title={t("Drag to turn the figure")}>
      {drawing && (
        <svg
          width={width}
          height={height}
          className="space-figure-svg"
          role="img"
          aria-label={drawing.dots.map((dot) => dot.name).join(", ")}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragStart.current = { x: event.clientX, y: event.clientY, ...turn };
          }}
          onPointerMove={(event) => {
            const start = dragStart.current;
            if (!start) return;
            setTurn({
              yaw: clamp(start.yaw - (event.clientX - start.x) / 250, yawRange),
              pitch: clamp(start.pitch + (event.clientY - start.y) / 250, pitchRange),
            });
          }}
          onPointerUp={() => (dragStart.current = null)}
        >
          {drawing.section.length >= 3 && (
            <polygon points={drawing.section.map((p) => `${p.x},${p.y}`).join(" ")} className="space-section" />
          )}
          {drawing.strokes.map((stroke, index) => (
            <line
              key={index}
              x1={stroke.from.x}
              y1={stroke.from.y}
              x2={stroke.to.x}
              y2={stroke.to.y}
              className={`space-${stroke.role}`}
              strokeDasharray={stroke.dashed ? "4 3" : undefined}
            />
          ))}
          {drawing.strokes
            .filter((stroke) => stroke.role === "axis")
            .map((stroke, index) => {
              const angle = Math.atan2(stroke.to.y - stroke.from.y, stroke.to.x - stroke.from.x);
              const head = (side: number) =>
                `${stroke.to.x - 8 * Math.cos(angle + side * 0.4)},${stroke.to.y - 8 * Math.sin(angle + side * 0.4)}`;
              return (
                <polyline
                  key={`h${index}`}
                  points={`${head(-1)} ${stroke.to.x},${stroke.to.y} ${head(1)}`}
                  className="space-axis"
                />
              );
            })}
          {drawing.dots.map((dot) => (
            <circle key={dot.name} cx={dot.at.x} cy={dot.at.y} r={3} className="space-dot" />
          ))}
          {drawing.names.map((name, index) => {
            const font = fontFor(name.role, textSize);
            return (
              <text
                key={index}
                x={name.box.midX}
                y={name.box.midY}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fontSize: font.size, fontWeight: font.weight, fill: font.colour }}
              >
                {name.text}
              </text>
            );
          })}
        </svg>
      )}
    </div>
  );
}
