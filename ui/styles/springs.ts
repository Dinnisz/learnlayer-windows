// The Mac's SwiftUI springs (`.spring(response:dampingFraction:)`) as CSS easings. A cubic Bézier is not a spring: it
// overshoots by a fixed amount and stops at a fixed time. `linear(…)` samples the real curve, so each motion keeps the
// Mac's own feel, in WebView2 and in WebKit alike.

/** A spring as SwiftUI names it: the period of its undamped swing, in seconds, and how much of its swing is damped. */
export interface Spring {
  response: number;
  damping: number;
}

/** The springs the stage and the pill use, with the Mac's numbers. */
export const Springs = {
  /** The question flying from the page to the stage (QuestionOverlay: 0.5 / 0.86). */
  arrive: { response: 0.5, damping: 0.86 },
  /** The question stepping back when the solution opens, and the stage changing phase (0.45 / 0.88). */
  phase: { response: 0.45, damping: 0.88 },
  /** The step under way (0.4 / 0.88). */
  step: { response: 0.4, damping: 0.88 },
  /** Opening a step (0.35 / 0.9). */
  select: { response: 0.35, damping: 0.9 },
  /** The steps coming in one after another (0.45 / 0.86). */
  cascade: { response: 0.45, damping: 0.86 },
  /** The pill opening and closing (NotchPillView: 0.3 / 0.85). */
  pill: { response: 0.3, damping: 0.85 },
} satisfies Record<string, Spring>;

/** How far along the spring is at `t` seconds, from 0 at rest to 1 at the target (it may pass 1 and come back). */
export function springValue({ response, damping }: Spring, t: number): number {
  const omega = (2 * Math.PI) / response;
  const zeta = Math.min(damping, 0.999);
  const decay = Math.exp(-zeta * omega * t);
  const swing = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - decay * (Math.cos(swing * t) + ((zeta * omega) / swing) * Math.sin(swing * t));
}

/** How long until the spring stays within `tolerance` of its target, in seconds. */
export function springDuration(spring: Spring, tolerance = 0.001): number {
  const omega = (2 * Math.PI) / spring.response;
  const zeta = Math.min(spring.damping, 0.999);
  // The envelope e^(−ζωt)/√(1−ζ²) bounds the distance from the target.
  return Math.log(1 / (tolerance * Math.sqrt(1 - zeta * zeta))) / (zeta * omega);
}

/** The spring as a CSS `linear(…)` easing over its duration, sampled finely enough that no corner shows. */
export function springEasing(spring: Spring, samples = 40): string {
  const duration = springDuration(spring);
  const points: string[] = [];
  for (let index = 0; index <= samples; index++) {
    const value = index === samples ? 1 : springValue(spring, (duration * index) / samples);
    points.push(String(Math.round(value * 10000) / 10000));
  }
  return `linear(${points.join(", ")})`;
}

/** Writes each spring as `--spring-<name>` (its easing) and `--spring-<name>-duration` on the document. */
export function installSprings(root: HTMLElement = document.documentElement): void {
  if (typeof CSS !== "undefined" && !CSS.supports("animation-timing-function", "linear(0, 1)")) return;
  for (const [name, spring] of Object.entries(Springs)) {
    root.style.setProperty(`--spring-${name}`, springEasing(spring));
    root.style.setProperty(`--spring-${name}-duration`, `${Math.round(springDuration(spring) * 1000)}ms`);
  }
}
