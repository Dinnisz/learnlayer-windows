// The mascot at rest: a blue sphere with two eyes that never changes shape (CLAUDE.md §3.4).
// The moving one (breathing, looking, nodding, glowing) arrives with the voice code in phase 5
// (Voice/VoiceMascot*.swift, MascotMotion.swift); this is its idle frame.

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

/**
 * The mascot at work (VoiceMascot / MascotMotion on the Mac): it breathes at rest, swells a little with the voice
 * while it speaks and glows then. It never changes shape. Reduced motion: still, only the glow.
 */
export function AnimatedMascot({
  size = 56,
  color,
  level,
  speaking,
}: {
  size?: number;
  color?: MascotColor;
  level: number;
  speaking: boolean;
}) {
  const chosen = color ?? storedMascotColor();
  const scale = 1 + Math.min(1, Math.max(0, level)) * 0.08;
  return (
    <span
      className={`mascot-alive${speaking ? " speaking" : ""}`}
      style={{ width: size, height: size, ["--mascot-scale" as string]: String(scale) }}
    >
      <Mascot size={size} color={chosen} />
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
