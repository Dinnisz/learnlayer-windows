// Port of SmoothValue, SmoothPoint, MascotKinematics and MascotConfetti (LearnLayer/Voice/MascotMotion.swift), of
// VoiceMascot's presence, expression, radiusFactor and bodyScale (LearnLayer/Voice/VoiceMascot.swift) and of
// MascotBodyState (LearnLayer/Voice/VoiceMascotView.swift) @ ref 2026-11-04: how the tutor's sphere moves. It never
// changes shape: it breathes at rest, its size follows the voice without jumping, it blinks, glows while it thinks,
// and a right answer, a wrong one or a hint is a colour and a small movement.
//
// The pen and arrow shapes of MascotMotion (morphs, outlines) are not ported: the body is always the sphere
// (`VoiceMascot.bodyShape`), and the Mac's own tests say so.

export interface MascotPoint {
  x: number;
  y: number;
}

/** A value that eases toward its target with no overshoot: a critically damped spring, so it speeds up, then slows
 * down, and its peak speed grows with the distance. */
export class SmoothValue {
  value: number;
  velocity = 0;

  constructor(value: number) {
    this.value = value;
  }

  advance(target: number, smoothTime: number, dt: number): void {
    if (dt <= 0) return;
    const omega = 2 / Math.max(smoothTime, 0.0001);
    const x = omega * dt;
    const damping = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = this.value - target;
    const carried = (this.velocity + omega * change) * dt;
    this.velocity = (this.velocity - omega * carried) * damping;
    const next = target + (change + carried) * damping;
    // Never past the target.
    if (target - this.value > 0 === next > target) {
      this.value = target;
      this.velocity = 0;
    } else {
      this.value = next;
    }
  }
}

/** A point that follows its target through two such springs in a row, so it also eases in. */
export class SmoothPoint {
  private readonly firstX: SmoothValue;
  private readonly firstY: SmoothValue;
  private readonly secondX: SmoothValue;
  private readonly secondY: SmoothValue;

  constructor(point: MascotPoint) {
    this.firstX = new SmoothValue(point.x);
    this.firstY = new SmoothValue(point.y);
    this.secondX = new SmoothValue(point.x);
    this.secondY = new SmoothValue(point.y);
  }

  get position(): MascotPoint {
    return { x: this.secondX.value, y: this.secondY.value };
  }

  /** Points per second. */
  get speed(): number {
    return Math.hypot(this.secondX.velocity, this.secondY.velocity);
  }

  advance(target: MascotPoint, smoothTime: number, dt: number): void {
    this.firstX.advance(target.x, smoothTime, dt);
    this.firstY.advance(target.y, smoothTime, dt);
    this.secondX.advance(this.firstX.value, smoothTime, dt);
    this.secondY.advance(this.firstY.value, smoothTime, dt);
  }
}

export const MascotKinematics = {
  /** How long each spring takes to close the gap, for a trip of `distance` points. Slow on purpose: a trip across the
   * page takes more than a second. */
  travelSmoothTime(distance: number, returning = false): number {
    const far = Number.isFinite(distance) ? Math.max(0, distance) : 0;
    const base = Math.min(0.44, 0.26 + far / 2200);
    return returning ? base * 1.35 : base;
  },

  /** Smooth start and end, 0…1 to 0…1. */
  ease(progress: number): number {
    const t = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
    return t * t * (3 - 2 * t);
  },

  /** 0 open … 1 shut. A blink every few seconds that takes under a fifth of a second. */
  blink(time: number): number {
    const period = 4.6;
    const closing = 0.18;
    const phase = time % period;
    if (phase < 0 || phase >= closing) return 0;
    return Math.sin((phase / closing) * Math.PI);
  },

  /** Points up from rest, `age` seconds after a right answer: a hop, and a smaller one. */
  hop(age: number): number {
    const length = 0.9;
    if (age < 0 || age >= length) return 0;
    const t = age / length;
    return Math.abs(Math.sin(t * 2 * Math.PI)) * 7 * (1 - t);
  },

  /** Points sideways from rest, `age` seconds after a wrong answer: a gentle shake that dies away. */
  shake(age: number): number {
    if (age < 0 || age >= 1.2) return 0;
    return Math.sin(age * 24) * 3 * Math.exp(-age * 3.5);
  },

  /** 0…1: the bulb popping up over the head for a hint. */
  bulb(age: number): number {
    const t = Math.min(1, Math.max(0, age / 0.3));
    return 1 - (1 - t) * (1 - t) * (1 - t);
  },

  /** Smaller when it has nothing to do. */
  restScale: 0.8,
};

export interface ConfettiParticle {
  x: number;
  y: number;
  rotation: number;
  alpha: number;
  tone: number;
}

const unitOf = (seed: number) => {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};

export const MascotConfetti = {
  count: 20,
  lifetime: 1.3,

  /** The pieces `age` seconds into a burst: thrown up and out, then falling, fading. */
  particles(age: number): ConfettiParticle[] {
    if (age < 0 || age >= MascotConfetti.lifetime) return [];
    return Array.from({ length: MascotConfetti.count }, (_, index) => {
      const seed = index + 1;
      const angle = -Math.PI / 2 + (unitOf(seed * 1.7) - 0.5) * 2.6;
      const speed = 50 + 40 * unitOf(seed * 3.1);
      return {
        x: Math.cos(angle) * speed * age,
        y: Math.sin(angle) * speed * age + 0.5 * 140 * age * age,
        rotation: age * (4 + 8 * unitOf(seed * 5.3)),
        alpha: 1 - age / MascotConfetti.lifetime,
        tone: index % 4,
      };
    });
  },
};

export type MascotPresence = "idle" | "listening" | "thinking" | "speaking";
export type MascotExpression = "happy" | "curious" | "focused";
/** Short-lived reactions: a right answer, a wrong one, a hint. */
export type MascotTransient = "correct" | "wrong" | "hint";

export interface MascotFrame {
  presence: MascotPresence;
  level: number;
  /** Showing something: a mark being said, a part of the figure, a datum. It glows and nudges. */
  pointing: boolean;
  expression: MascotExpression;
  transient: MascotTransient | null;
  /** False with Reduce Motion: one pose, no gliding. */
  animates: boolean;
}

export const VoiceMascot = {
  frame(input: {
    presence: MascotPresence;
    level: number;
    pointing?: boolean;
    transient?: MascotTransient | null;
    reduceMotion: boolean;
  }): MascotFrame {
    const level = Math.min(1, Math.max(0, Number.isFinite(input.level) ? input.level : 0));
    const pointing = input.pointing ?? false;
    const transient = input.transient ?? null;
    return {
      presence: input.presence,
      level,
      pointing,
      expression: VoiceMascot.expression(input.presence, pointing, transient),
      transient,
      animates: !input.reduceMotion,
    };
  },

  expression(presence: MascotPresence, pointing: boolean, transient: MascotTransient | null): MascotExpression {
    if (transient === "wrong") return "curious";
    if (pointing) return "focused";
    switch (presence) {
      case "idle":
        return "happy";
      case "listening":
      case "thinking":
        return "curious";
      case "speaking":
        return "focused";
    }
  },

  /** The orb's radius as a share of the body's half-width, before it is smoothed: each presence has its own size, and
   * the voice's level (jumpy) swells it. */
  radiusFactor(presence: MascotPresence, level: number, breathe: number): number {
    const loud = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0));
    const swing = Number.isFinite(breathe) ? breathe : 0;
    switch (presence) {
      case "idle":
        return 0.62 + 0.08 * (swing * 0.5 + 0.5);
      case "listening":
        return 0.48 + 0.4 * loud;
      case "thinking":
        return 0.56 + 0.04 * Math.sin(swing);
      case "speaking":
        return 0.46 + 0.34 * loud;
    }
  },

  /** How big the body is drawn: smaller when it is idle and has nothing to point at. */
  bodyScale(frame: MascotFrame): number {
    const resting = frame.presence === "idle" && !frame.pointing && frame.transient === null;
    return resting ? MascotKinematics.restScale : 1;
  },
};

/** What the body looks like right now, eased between poses. */
export interface MascotLook {
  scale: number;
  /** The orb's radius as a share of the body's half-width, eased. */
  radiusFactor: number;
  /** 0…1: how much it is idle (floating) and how much thinking (glowing). */
  idle: number;
  thinking: number;
  /** 0…1: how green and how orange it is. */
  good: number;
  bad: number;
  /** Seconds since the feedback cue started, or null when there is none. */
  cueAge: number | null;
}

/** The smoothing behind `MascotLook`: the size and colour ease to their targets instead of snapping, and a feedback
 * cue's age is counted from when it first shows. */
export class MascotBodyState {
  private scale = new SmoothValue(1);
  private radius = new SmoothValue(0.7);
  private idle = new SmoothValue(0);
  private thinking = new SmoothValue(0);
  private good = new SmoothValue(0);
  private bad = new SmoothValue(0);
  private lastTime: number | null = null;
  private primed = false;
  private cue: MascotTransient | null = null;
  private cueStart = 0;

  advance(frame: MascotFrame, time: number): MascotLook {
    const scaleGoal = VoiceMascot.bodyScale(frame);
    const breathe = frame.animates ? Math.sin(time * 1.7) : 0;
    const radiusGoal = VoiceMascot.radiusFactor(frame.presence, frame.level, breathe);
    const idleGoal = frame.presence === "idle" ? 1 : 0;
    const thinkingGoal = frame.presence === "thinking" ? 1 : 0;
    const goodGoal = frame.transient === "correct" ? 1 : 0;
    const badGoal = frame.transient === "wrong" ? 1 : 0;
    if (frame.transient !== this.cue) {
      this.cue = frame.transient;
      this.cueStart = time;
    }
    const dt = this.lastTime === null ? 0 : Math.min(Math.max(time - this.lastTime, 0), 0.05);
    this.lastTime = time;
    if (!this.primed || !frame.animates) {
      this.primed = true;
      this.scale = new SmoothValue(scaleGoal);
      this.radius = new SmoothValue(radiusGoal);
      this.idle = new SmoothValue(idleGoal);
      this.thinking = new SmoothValue(thinkingGoal);
      this.good = new SmoothValue(goodGoal);
      this.bad = new SmoothValue(badGoal);
    } else if (dt > 0) {
      this.scale.advance(scaleGoal, 0.4, dt);
      // The voice level jitters and each presence has its own size: ease both.
      this.radius.advance(radiusGoal, 0.14, dt);
      this.idle.advance(idleGoal, 0.3, dt);
      this.thinking.advance(thinkingGoal, 0.25, dt);
      this.good.advance(goodGoal, 0.08, dt);
      this.bad.advance(badGoal, 0.08, dt);
    }
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    return {
      scale: this.scale.value,
      radiusFactor: this.radius.value,
      idle: clamp(this.idle.value),
      thinking: clamp(this.thinking.value),
      good: clamp(this.good.value),
      bad: clamp(this.bad.value),
      cueAge: frame.transient !== null && frame.animates ? Math.max(0, time - this.cueStart) : null,
    };
  }
}

/** Which corner of the stage the sphere rests in (the Mac's MascotCorner); the student drags it to another. */
export type MascotCorner = "bottomTrailing" | "bottomLeading" | "topTrailing" | "topLeading";

export const MascotCorners = {
  all: ["bottomTrailing", "bottomLeading", "topTrailing", "topLeading"] as const,
  /** The corner nearest where the sphere was dropped. */
  nearest(size: { width: number; height: number }, point: MascotPoint): MascotCorner {
    const right = point.x > size.width / 2;
    const below = point.y > size.height / 2;
    if (below) return right ? "bottomTrailing" : "bottomLeading";
    return right ? "topTrailing" : "topLeading";
  },
  /** A stored corner, or the bottom right. */
  parse(stored: string | null): MascotCorner {
    return (MascotCorners.all as readonly string[]).includes(stored ?? "")
      ? (stored as MascotCorner)
      : "bottomTrailing";
  },
};
