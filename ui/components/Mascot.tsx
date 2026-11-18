// The mascot: a blue sphere with two eyes that never changes shape (CLAUDE.md §3.4). `Mascot` is its still frame;
// `AnimatedMascot` is the tutor at work, a port of VoiceMascotView's drawing (LearnLayer/Voice/VoiceMascotView.swift @
// ref 2026-11-04) on the body of the reference pictures (capturas/marketing/blue-mascot.png): it floats and breathes at
// rest, smaller; its size follows the voice; it blinks; listening it shows an equaliser and speaking voice bars in
// place of its eyes; thinking it glows with dots going round and glances up; pointing it glows softly and nudges; a
// right answer turns it green with a hop and confetti, a wrong one orange with a shake, a hint lights a bulb over it.
// With Reduce Motion it draws one pose.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MascotBodyState,
  MascotConfetti,
  MascotKinematics,
  VoiceMascot,
  type MascotFrame,
  type MascotLook,
  type MascotPresence,
  type MascotTransient,
} from "@core/voice/mascotMotion";

export const mascotColors = {
  Blue: ["#0a63e0", "#19b9f5"],
  Purple: ["#6d3be0", "#b58cff"],
  Pink: ["#d93a8a", "#ff9cc8"],
  Teal: ["#0b8f96", "#5fe3d6"],
  Graphite: ["#4a4d55", "#a3a8b3"],
} as const;
export type MascotColor = keyof typeof mascotColors;

export function Mascot({ size = 84, color = "Blue" }: { size?: number; color?: MascotColor }) {
  const [deep, light] = mascotColors[color];
  const id = `mascot-${color}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="mascot">
      <defs>
        <radialGradient id={id} cx="50%" cy="88%" r="75%">
          <stop offset="0%" stopColor={light} />
          <stop offset="55%" stopColor={deep} />
          <stop offset="100%" stopColor={deep} />
        </radialGradient>
      </defs>
      <circle cx="50" cy="52" r="42" fill={`url(#${id})`} />
      <ellipse cx="36" cy="46" rx="9" ry="8.5" fill="#fff" />
      <ellipse cx="64" cy="46" rx="9" ry="8.5" fill="#fff" />
    </svg>
  );
}

/** The Mac draws its body in units of a 28th of its side. */
const unit = 100 / 28;
/** The body's radius in the still frame, which the Mac's resting share (0.7 of the half-width) stands for. */
const stillRadius = 42;
const green = "#30d158";
const orange = "#ff9f0a";
const yellow = "#ffd60a";

const reducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

/**
 * The body's eased look and the time, 60 times a second while it animates: each frame advances the springs toward the
 * latest `frame` (`MascotBodyState`). With Reduce Motion, null: the pose is drawn as it is.
 */
function useBodyLook(frame: MascotFrame): { time: number; look: MascotLook } | null {
  const latest = useRef(frame);
  useEffect(() => {
    latest.current = frame;
  });
  const [scene, setScene] = useState<{ time: number; look: MascotLook } | null>(null);
  const animates = frame.animates;
  useEffect(() => {
    if (!animates) return;
    const body = new MascotBodyState();
    let id = 0;
    const tick = () => {
      const time = performance.now() / 1000;
      setScene({ time, look: body.advance(latest.current, time) });
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [animates]);
  return animates ? scene : null;
}

export function AnimatedMascot({
  size = 56,
  color,
  level,
  speaking,
  presence,
  pointing = false,
  transient = null,
}: {
  size?: number;
  color?: MascotColor;
  level: number;
  speaking: boolean;
  /** What it is doing; speaking or idle when not given. */
  presence?: MascotPresence;
  /** It shows something (a datum, a part of the figure, a mark being said): a soft glow and a nudge. */
  pointing?: boolean;
  transient?: MascotTransient | null;
}) {
  const chosen = color ?? storedMascotColor();
  const [deep, light] = mascotColors[chosen];
  const still = useMemo(() => reducedMotion(), []);
  const frame = VoiceMascot.frame({
    presence: presence ?? (speaking ? "speaking" : "idle"),
    level,
    pointing,
    transient,
    reduceMotion: still,
  });
  const scene = useBodyLook(frame);
  // Before the first frame, and with Reduce Motion: the pose itself, unsmoothed.
  const time = scene?.time ?? 0;
  const look = scene?.look ?? new MascotBodyState().advance(frame, 0);
  const animates = frame.animates;
  const gradient = `mascot-alive-${chosen}`;

  const floatY = animates ? Math.sin(time * 0.9) * look.idle * 1.5 * unit : 0;
  const radius = stillRadius * (look.radiusFactor / 0.7) * look.scale;
  const age = look.cueAge;
  const hop = age !== null ? MascotKinematics.hop(age) * unit : 0;
  const shake = age !== null ? MascotKinematics.shake(age) * unit : 0;
  // Pointing: a small, slow nudge down toward what it is about.
  const nudge = pointing && animates ? MascotKinematics.ease(0.5 + 0.5 * Math.sin(time * 2.2)) * 2 * unit : 0;
  const cx = 50 + shake;
  const cy = 52 + floatY - hop + nudge;

  const shown = frame.presence === "listening" || frame.presence === "speaking";
  const parts: React.ReactNode[] = [];
  if (pointing) {
    // A soft halo in the body's colour: the sphere is showing something, not just resting.
    const pulse = animates ? 0.85 + 0.15 * Math.sin(time * 2.2) : 1;
    parts.push(
      <circle
        key="halo"
        cx={cx}
        cy={cy}
        r={radius * 1.5 * pulse}
        fill={deep}
        opacity={0.28}
        filter="url(#mascot-soft)"
      />,
    );
  }
  if (look.thinking > 0.01) {
    const glow = radius * (1.35 + 0.08 * Math.sin(time * 2.4));
    parts.push(<circle key="think" cx={cx} cy={cy} r={glow} fill={deep} opacity={0.18 * look.thinking} />);
    for (let index = 0; index < 4; index += 1) {
      const angle = time * 1.8 + (index * Math.PI) / 2;
      parts.push(
        <circle
          key={`dot${index}`}
          cx={cx + Math.cos(angle) * radius * 1.55}
          cy={cy + Math.sin(angle) * radius * 1.55}
          r={2 * unit}
          fill={deep}
          opacity={0.85 * look.thinking}
        />,
      );
    }
  }
  if (frame.transient === "correct" && age !== null) {
    const tones = [deep, green, yellow, "#ffffff"];
    for (const [index, piece] of MascotConfetti.particles(age).entries()) {
      parts.push(
        <rect
          key={`c${index}`}
          x={-2 * unit}
          y={-3.5 * unit}
          width={4 * unit}
          height={7 * unit}
          rx={unit}
          fill={tones[piece.tone % tones.length]}
          opacity={piece.alpha}
          transform={`translate(${cx + piece.x * unit} ${cy + piece.y * unit}) rotate(${(piece.rotation * 180) / Math.PI})`}
        />,
      );
    }
  }
  parts.push(<circle key="body" cx={cx} cy={cy} r={radius} fill={`url(#${gradient})`} />);
  if (look.good > 0.001)
    parts.push(<circle key="good" cx={cx} cy={cy} r={radius} fill={green} opacity={0.88 * look.good} />);
  if (look.bad > 0.001)
    parts.push(<circle key="bad" cx={cx} cy={cy} r={radius} fill={orange} opacity={0.92 * look.bad} />);

  const share = radius / stillRadius;
  if (!shown) {
    // Blinks every few seconds. While thinking the eyes glance up and about.
    const shut = animates ? MascotKinematics.blink(time) : 0;
    const thinking = frame.presence === "thinking";
    const glanceX = thinking && animates ? Math.sin(time * 1.1) * 1.2 * unit : 0;
    const glanceY = thinking ? -1.4 * unit : 0;
    const open = frame.expression === "focused" ? 2.8 / 3.2 : 1;
    const wide = frame.expression === "happy" ? 1 : 2.8 / 3.4;
    for (const side of [-1, 1]) {
      parts.push(
        <ellipse
          key={`eye${side}`}
          cx={cx + side * 14 * share + glanceX}
          cy={cy - 6 * share + glanceY}
          rx={9 * share * wide}
          ry={Math.max(unit / 2, 8.5 * share * open * (1 - 0.92 * shut))}
          fill="#fff"
        />,
      );
    }
  } else {
    // An equaliser while it listens, the voice's bars while it speaks.
    const listening = frame.presence === "listening";
    const loud = Math.max(frame.level, 0.12);
    const spread = (listening ? 2.6 : 2.8) * unit * share;
    const tallest = radius * 0.42;
    for (let index = 0; index < 5; index += 1) {
      const wave = Math.abs(Math.sin(time * (listening ? 10 : 9) + index * 0.45));
      const height = tallest * (listening ? 0.35 + loud * 0.65 * wave : 0.3 + loud * 0.55 * (0.45 + 0.55 * wave));
      const x = cx + (index - 2) * spread;
      parts.push(
        <line
          key={`bar${index}`}
          x1={x}
          x2={x}
          y1={cy - height / 2}
          y2={cy + height / 2}
          stroke="#fff"
          strokeOpacity={listening ? 0.78 : 0.9}
          strokeWidth={(listening ? 1 : 1.1) * unit * share}
          strokeLinecap="round"
        />,
      );
    }
  }
  if (frame.transient === "hint" && age !== null) {
    const pop = MascotKinematics.bulb(age);
    if (pop > 0.01) {
      const glow = animates ? 0.8 + 0.2 * Math.sin(time * 5) : 1;
      const bx = cx;
      const by = cy - radius - 9 * unit * pop;
      const glass = 4.6 * unit * pop;
      parts.push(
        <g key="bulb" opacity={pop}>
          <circle cx={bx} cy={by} r={glass * 2.1} fill={yellow} opacity={0.22 * glow} />
          <circle cx={bx} cy={by} r={glass} fill={yellow} opacity={0.95} />
          <rect
            x={bx - glass * 0.55}
            y={by + glass * 0.85}
            width={glass * 1.1}
            height={glass * 0.6}
            rx={unit * 0.6}
            fill="#fff"
            opacity={0.85}
          />
          {[0, 1, 2, 3, 4].map((step) => {
            const angle = ((-150 + step * 30) * Math.PI) / 180;
            return (
              <line
                key={step}
                x1={bx + Math.cos(angle) * glass * 1.5}
                y1={by + Math.sin(angle) * glass * 1.5}
                x2={bx + Math.cos(angle) * glass * 2}
                y2={by + Math.sin(angle) * glass * 2}
                stroke={yellow}
                strokeOpacity={0.8 * glow}
                strokeWidth={1.1 * unit}
                strokeLinecap="round"
              />
            );
          })}
        </g>,
      );
    }
  }

  return (
    <span className="mascot-alive" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 100 100" overflow="visible" aria-hidden="true" className="mascot">
        <defs>
          <radialGradient id={gradient} cx="50%" cy="88%" r="75%">
            <stop offset="0%" stopColor={light} />
            <stop offset="55%" stopColor={deep} />
            <stop offset="100%" stopColor={deep} />
          </radialGradient>
          <filter id="mascot-soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={6 * unit * 0.5} />
          </filter>
        </defs>
        {parts}
      </svg>
    </span>
  );
}

export const mascotColorKey = "mascotColor";

/** The colour the student chose (Settings › General), blue by default. */
export function storedMascotColor(): MascotColor {
  try {
    const stored = localStorage.getItem(mascotColorKey);
    return stored && stored in mascotColors ? (stored as MascotColor) : "Blue";
  } catch {
    return "Blue";
  }
}
