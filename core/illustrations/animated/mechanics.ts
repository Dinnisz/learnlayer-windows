// Port of LearnLayer/Illustrations/PremadeFigureBatch3Physics.swift and `growingArrow` (PremadeFigureBatch3.swift) @ ref
// 2026-11-04: a free-body diagram of a block on a floor, uniform circular motion, energy bars of a falling body, a
// collision before and after, a mass on a spring with its x–t graph, resistors in series or in parallel, and pulleys.
// Every number is worked out by the app from the params.

import type { IllustrationParameter } from "../illustration";
import { subscripted } from "./calculus";
import { Anim, FigureCanvas, Params, PremadeFrame, slider, type AnimatedIllustration } from "./figureCanvas";
import { Teach } from "./heating";
import type { Point } from "./optics";

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

/** An arrow that grows from `a` to `b` over `duration` seconds from `start`. */
export function growingArrow(
  canvas: FigureCanvas,
  a: Point,
  b: Point,
  start: number,
  color: string | null,
  duration = 0.8,
): void {
  const grow = Anim.ramp(start, start + duration);
  canvas.arrow(
    a.x,
    a.y,
    `${Anim.n(a.x)} + ${Anim.lit(b.x - a.x)}*${grow}`,
    `${Anim.n(a.y)} + ${Anim.lit(b.y - a.y)}*${grow}`,
    {
      color,
    },
  );
}

const within = (value: number, low: number, high: number) => value >= low && value <= high;
/** Time since `start`, zero before it. */
const since = (start: number) => `((t-${Anim.lit(start)}+abs(t-${Anim.lit(start)}))/2)`;

// MARK: Free-body diagram

/**
 * The forces on a block on a horizontal floor, pulled by F at an angle above the horizontal. One coefficient μ serves
 * as the limit of static friction and as the kinetic friction.
 */
export interface BlockForces {
  weight: number;
  normal: number;
  pullX: number;
  pullY: number;
  friction: number;
  acceleration: number;
  sliding: boolean;
}

export function blockForces(mass: number, pull: number, angleDegrees: number, mu: number, g = 9.8): BlockForces | null {
  if (!(mass > 0 && pull >= 0 && mu >= 0 && g > 0 && angleDegrees >= 0 && angleDegrees < 90)) return null;
  const angle = (angleDegrees * Math.PI) / 180;
  const weight = mass * g;
  const pullX = pull * Math.cos(angle);
  const pullY = pull * Math.sin(angle);
  const normal = weight - pullY;
  // A pull that lifts the block off the floor is not this diagram.
  if (!(normal > 1e-9)) return null;
  const limit = mu * normal;
  if (pullX <= limit + 1e-9) return { weight, normal, pullX, pullY, friction: pullX, acceleration: 0, sliding: false };
  return { weight, normal, pullX, pullY, friction: limit, acceleration: (pullX - limit) / mass, sliding: true };
}

const freeBody: Compiler = (params, title, language) => {
  const mass = params.number("m") ?? 5;
  const pull = params.number("F") ?? 20;
  const angle = params.number("angle") ?? 0;
  const mu = params.number("mu") ?? 0.2;
  const g = params.number("g") ?? 9.8;
  const forces = mass <= 1e4 && pull <= 1e5 ? blockForces(mass, pull, angle, mu, g) : null;
  if (!forces) return null;
  const canvas = new FigureCanvas(language);
  const n = (value: number) => canvas.number(value, 3);
  const pulling = pull > 1e-9;
  const steps = pulling ? 5 : 3;

  // Words first.
  canvas.caption(`N = mg − F·sin α = ${n(forces.weight)} − ${n(forces.pullY)} = ${n(forces.normal)} N`, {
    row: 0,
    color: "white",
    visible: Anim.after(Teach.start(1)),
  });
  const last = Teach.start(steps - 1);
  const bottomLine = !pulling
    ? canvas.say(
        "Sem força aplicada: ΣF = 0, o bloco fica em repouso",
        "No applied force: ΣF = 0, the block stays at rest",
      )
    : forces.sliding
      ? `ΣFₓ = F·cos α − Fₐ = m·a  ⇒  a = ${n(forces.acceleration)} m/s²`
      : canvas.say(
          "F·cos α ≤ μN: Fₐ = F·cos α, ΣF = 0, o bloco não desliza",
          "F·cos α ≤ μN: Fₐ = F·cos α, ΣF = 0, the block does not slide",
        );
  canvas.caption(bottomLine, { row: 1, color: "accent", visible: Anim.after(last) });

  // Arrows are drawn to one scale, so that their lengths compare the forces.
  const biggest = Math.max(forces.weight, forces.normal, pull, forces.friction, forces.acceleration * mass);
  const scale = 1.9 / biggest;
  const centre = { x: 4.4, y: 3.0 };
  canvas.box(centre.x - 0.25, centre.y - 0.2, 0.5, 0.4, { color: "muted" });
  const radians = (angle * Math.PI) / 180;

  // Step 1: the weight. Step 2: the normal force.
  const weightTip = { x: centre.x, y: centre.y - scale * forces.weight };
  growingArrow(canvas, centre, weightTip, Teach.start(0), "white");
  canvas.label(`P = ${n(forces.weight)} N`, centre.x + 0.15, weightTip.y, {
    anchor: "leading",
    color: "white",
    visible: Anim.after(Teach.start(0) + 0.8),
  });
  const normalTip = { x: centre.x, y: centre.y + scale * forces.normal };
  growingArrow(canvas, centre, normalTip, Teach.start(1), "accent");
  canvas.label(`N = ${n(forces.normal)} N`, centre.x + 0.15, normalTip.y, {
    anchor: "leading",
    color: "accent",
    visible: Anim.after(Teach.start(1) + 0.8),
  });
  if (pulling) {
    // Step 3: the applied force and its components. Step 4: friction. Step 5: the resultant.
    const tip = { x: centre.x + scale * pull * Math.cos(radians), y: centre.y + scale * pull * Math.sin(radians) };
    growingArrow(canvas, centre, tip, Teach.start(2), "white");
    canvas.label(`F = ${n(pull)} N`, tip.x + 0.15, tip.y + 0.2, {
      anchor: "leading",
      color: "white",
      visible: Anim.after(Teach.start(2) + 0.8),
    });
    if (angle > 1e-9) {
      const foot = { x: tip.x, y: centre.y };
      const shown = Anim.after(Teach.start(2) + 0.8);
      canvas.line(centre.x, centre.y, foot.x, foot.y, { color: "muted", dashed: true, visible: shown });
      canvas.line(foot.x, foot.y, tip.x, tip.y, { color: "muted", dashed: true, visible: shown });
    }
    const frictionTip = { x: centre.x - scale * forces.friction, y: centre.y };
    if (forces.friction > 1e-9) {
      growingArrow(canvas, centre, frictionTip, Teach.start(3), "second");
      canvas.label(`Fₐ = ${n(forces.friction)} N`, frictionTip.x - 0.12, centre.y, {
        anchor: "trailing",
        color: "second",
        visible: Anim.after(Teach.start(3) + 0.8),
      });
    }
    const resultant = forces.acceleration * mass;
    const from = { x: 7.2, y: 1.7 };
    if (forces.sliding) {
      growingArrow(canvas, from, { x: from.x + scale * resultant, y: from.y }, Teach.start(4), "accent");
      canvas.label(`ΣF = m·a = ${n(resultant)} N`, from.x, from.y + 0.35, {
        anchor: "leading",
        color: "accent",
        visible: Anim.after(Teach.start(4) + 0.8),
      });
    } else
      canvas.label("ΣF = 0", from.x, from.y, {
        anchor: "leading",
        color: "accent",
        visible: Anim.after(Teach.start(4)),
      });
  }
  canvas.recordSteps(Teach.boundaries(steps));
  return canvas.illustration(title, Anim.duration(Teach.finish(steps) + 0.6), [
    slider("m", "m (kg)", mass, 2, 10),
    slider("F", "F (N)", pull, 0, 30),
    slider("angle", "α (°)", angle, 0, 30),
    slider("mu", "μ", mu, 0, 0.8),
  ]);
};

// MARK: Uniform circular motion

export class CircularMotion {
  constructor(
    readonly radius: number,
    readonly speed: number,
  ) {}
  get angularSpeed(): number {
    return this.speed / this.radius;
  }
  get period(): number {
    return (2 * Math.PI * this.radius) / this.speed;
  }
  get frequency(): number {
    return this.speed / (2 * Math.PI * this.radius);
  }
  /** Centripetal acceleration v²/r, which is also ω²r. */
  get centripetal(): number {
    return (this.speed * this.speed) / this.radius;
  }
}

/** The radius, and the speed given directly, or through the period or the angular speed. */
export function circularMotion(params: Params): CircularMotion | null {
  const r = params.number("r") ?? params.number("radius");
  if (r === null || !(r > 0.05 && r <= 1e3)) return null;
  let v: number;
  const speed = params.number("v");
  const period = params.number("T");
  const omega = params.number("omega");
  if (speed !== null) v = speed;
  else if (period !== null && period > 0) v = (2 * Math.PI * r) / period;
  else if (omega !== null && omega > 0) v = omega * r;
  else return null;
  if (!(v > 0.05 && v <= 1e4)) return null;
  return new CircularMotion(r, v);
}

const circularMotionFigure: Compiler = (params, title, language) => {
  const motion = circularMotion(params);
  if (!motion) return null;
  const mass = params.number("m");
  if (mass !== null && (mass <= 0 || mass > 1e6)) return null;
  const canvas = new FigureCanvas(language);
  const n = (value: number) => canvas.number(value, 3);
  const steps = 3;

  // Words first.
  canvas.caption(`v = ωr  ·  ω = v/r = ${n(motion.angularSpeed)} rad/s  ·  T = 2πr/v = ${n(motion.period)} s`, {
    row: 0,
    color: "white",
    visible: Anim.after(Teach.start(1)),
  });
  const force = mass !== null ? `  ·  F = m·aₙ = ${n(mass * motion.centripetal)} N` : "";
  canvas.caption(
    canvas.say(
      `aₙ = v²/r = ${n(motion.centripetal)} m/s², para o centro${force}`,
      `aₙ = v²/r = ${n(motion.centripetal)} m/s², towards the centre${force}`,
    ),
    { row: 1, color: "accent", visible: Anim.after(Teach.start(2)) },
  );

  // The picture is drawn in proportion to nothing but the order of size: a bigger r, v or aₙ gives a bigger circle or arrow.
  const centre = { x: 4.6, y: 3.0 };
  const radius = Math.min(1.5, Math.max(0.8, 0.55 + 0.25 * motion.radius));
  const velocityLength = Math.min(0.8, Math.max(0.5, 0.45 + 0.08 * motion.speed));
  const accelerationLength = Math.max(
    0.35,
    Math.min(0.4 + (0.9 * motion.centripetal) / (motion.centripetal + 10), 0.6 * radius),
  );
  const start = Teach.start(1);
  const angle = `1.4*${since(start)}`;
  const px = `${Anim.n(centre.x)} + ${Anim.n(radius)}*cos(${angle})`;
  const py = `${Anim.n(centre.y)} + ${Anim.n(radius)}*sin(${angle})`;
  const first = Anim.after(Teach.start(0));
  canvas.ring(centre.x, centre.y, radius, { color: "muted", dashed: true, visible: first });
  canvas.dot(centre.x, centre.y, { color: "white", visible: first });
  canvas.line(centre.x, centre.y, px, py, { color: "muted", dashed: true, visible: first });
  canvas.elements.push({ kind: "point", x: px, y: py, color: "accent", visible: first });
  // Counter-clockwise: v is tangent, aₙ points at the centre.
  const vx = `-${Anim.n(velocityLength)}*sin(${angle})`;
  const vy = `${Anim.n(velocityLength)}*cos(${angle})`;
  canvas.arrow(px, py, `(${px}) + ${vx}`, `(${py}) + ${vy}`, { color: "second", visible: Anim.after(start) });
  canvas.movingLabel(
    "v",
    `(${px}) + ${Anim.n(velocityLength + 0.3)}*(-sin(${angle}))`,
    `(${py}) + ${Anim.n(velocityLength + 0.3)}*cos(${angle})`,
    { color: "second", visible: Anim.after(start) },
  );
  const second = Teach.start(2);
  const ax = `-${Anim.n(accelerationLength)}*cos(${angle})`;
  const ay = `-${Anim.n(accelerationLength)}*sin(${angle})`;
  canvas.arrow(px, py, `(${px}) + ${ax}`, `(${py}) + ${ay}`, { color: "accent", visible: Anim.after(second) });
  // The name of aₙ sits beside the middle of its arrow, on the side v points to, clear of the centre.
  const half = Anim.n(accelerationLength / 2);
  canvas.movingLabel(
    "aₙ",
    `(${px}) - ${half}*cos(${angle}) - 0.32*sin(${angle})`,
    `(${py}) - ${half}*sin(${angle}) + 0.32*cos(${angle})`,
    { color: "accent", visible: Anim.after(second) },
  );
  canvas.recordSteps(Teach.boundaries(steps));
  return canvas.illustration(title, Anim.duration(Teach.finish(steps) + 4.0), [
    slider("r", "r (m)", motion.radius, Math.min(0.5, motion.radius), Math.max(5, motion.radius)),
    slider("v", "v (m/s)", motion.speed, Math.min(1, motion.speed), Math.max(10, motion.speed)),
  ]);
};

// MARK: Energy bars

export interface EnergyState {
  height: number;
  speed: number;
  kinetic: number;
  potential: number;
  total: number;
}

/** A body launched straight up at `upSpeed` from `height` (0 for a body that is dropped), no air resistance. */
export function energyState(mass: number, height: number, upSpeed: number, g: number, time: number): EnergyState {
  const y = height + upSpeed * time - 0.5 * g * time * time;
  const v = upSpeed - g * time;
  return {
    height: y,
    speed: v,
    kinetic: 0.5 * mass * v * v,
    potential: mass * g * y,
    total: mass * g * height + 0.5 * mass * upSpeed * upSpeed,
  };
}

/** When the body reaches the ground. */
export function timeToGround(height: number, upSpeed: number, g: number): number {
  return (upSpeed + Math.sqrt(upSpeed * upSpeed + 2 * g * height)) / g;
}

const energyBars: Compiler = (params, title, language) => {
  const mass = params.number("m") ?? 2;
  const height = params.number("h") ?? 10;
  const launch = params.number("v0") ?? 0;
  const g = params.number("g") ?? 9.8;
  if (!(within(mass, 0.001, 1e4) && within(height, 0.1, 1e3) && within(launch, 0, 200) && g > 0 && g <= 30))
    return null;
  const flight = timeToGround(height, launch, g);
  const total = mass * g * height + 0.5 * mass * launch * launch;
  const peak = height + (launch * launch) / (2 * g);
  const canvas = new FigureCanvas(language);
  const n = (value: number) => canvas.number(value, 3);

  // Words first.
  const formula =
    launch > 0
      ? `Em = mgh + ½mv₀² = ${n(mass)}·${n(g)}·${n(height)} + ½·${n(mass)}·${n(launch)}² = ${n(total)} J`
      : `Em = mgh = ${n(mass)}·${n(g)}·${n(height)} = ${n(total)} J`;
  canvas.caption(formula, { row: 0, color: "white", visible: Anim.after(Teach.start(1)) });
  const motionStart = Teach.start(2);
  const motionEnd = motionStart + 4.0;
  canvas.caption(
    canvas.say(
      `Ec + Ep = Em em cada instante · no solo: Ec = Em = ${n(total)} J, Ep = 0`,
      `KE + PE = E at every moment · at the ground: KE = E = ${n(total)} J, PE = 0`,
    ),
    { row: 1, color: "accent", visible: Anim.after(motionEnd + 0.2) },
  );

  // The body on its track: ground, a ruler for the height, and the ball.
  const ground = 1.3;
  const top = 4.9;
  const worldY = (y: string) => `${Anim.n(ground)} + ${Anim.n((top - ground) / peak)}*(${y})`;
  canvas.line(1.0, ground, 3.4, ground, { color: "muted" });
  canvas.line(1.7, ground, 1.7, ground + ((top - ground) * height) / peak, {
    color: "muted",
    dashed: true,
    visible: Anim.after(Teach.start(0)),
  });
  canvas.label(`h = ${n(height)} m`, 1.58, ground + ((top - ground) * height) / peak / 2, {
    anchor: "trailing",
    color: "muted",
    visible: Anim.after(Teach.start(0)),
  });
  const tau = Anim.simTime(flight, motionStart, motionEnd);
  const y = `${Anim.lit(height)} + ${Anim.lit(launch)}*(${tau}) - ${Anim.lit(0.5 * g)}*(${tau})*(${tau})`;
  canvas.elements.push({ kind: "point", x: "2.4", y: worldY(y), text: null, color: "white", visible: null });

  // The three bars grow from the same base: Ec, Ep, and their sum Em, which does not change.
  const barBase = ground;
  const barMax = 3.4;
  const speedText = `(${Anim.lit(launch)} - ${Anim.lit(g)}*(${tau}))`;
  const kineticFraction = `0.5*${speedText}*${speedText}/${Anim.n(total / mass)}`;
  const potentialFraction = `${Anim.lit(g)}*(${y})/${Anim.n(total / mass)}`;
  const bars = [
    { name: canvas.say("Ec", "KE"), x: 5.0, color: "accent", fraction: kineticFraction },
    { name: canvas.say("Ep", "PE"), x: 6.5, color: "second", fraction: potentialFraction },
    { name: canvas.say("Em", "E"), x: 8.0, color: "white", fraction: "1" },
  ];
  canvas.line(4.6, barBase, 9.2, barBase, { color: "muted", visible: Anim.after(Teach.start(1)) });
  for (const bar of bars) {
    canvas.elements.push({
      kind: "rect",
      x: Anim.n(bar.x),
      y: Anim.n(barBase),
      w: "0.9",
      h: `${Anim.n(barMax)}*(${bar.fraction})`,
      color: bar.color,
      visible: Anim.after(Teach.start(1)),
    });
    canvas.label(bar.name, bar.x + 0.45, barBase - 0.3, {
      anchor: "center",
      color: bar.color,
      visible: Anim.after(Teach.start(1)),
    });
  }
  canvas.recordSteps([0, Teach.start(0) + 0.95, Teach.start(1) + 0.95, motionEnd + 0.05, motionEnd + 0.4]);
  return canvas.illustration(title, Anim.duration(motionEnd + 1.0), [
    slider("h", "h (m)", height, Math.min(2, height), Math.max(30, height)),
    slider("v0", "v₀ (m/s)", launch, 0, Math.max(15, launch)),
    slider("m", "m (kg)", mass, Math.min(1, mass), Math.max(10, mass)),
  ]);
};

// MARK: Collision before and after

export class Collision {
  constructor(
    readonly m1: number,
    readonly m2: number,
    readonly v1: number,
    readonly v2: number,
    /** Coefficient of restitution: 1 elastic, 0 perfectly inelastic. */
    readonly restitution: number,
  ) {}
  /** The velocities after the collision, from momentum conservation and v₂′ − v₁′ = −e(v₂ − v₁). */
  get v1After(): number {
    const { m1, m2, v1, v2, restitution: e } = this;
    return ((m1 - e * m2) * v1 + (1 + e) * m2 * v2) / (m1 + m2);
  }
  get v2After(): number {
    const { m1, m2, v1, v2, restitution: e } = this;
    return ((m2 - e * m1) * v2 + (1 + e) * m1 * v1) / (m1 + m2);
  }
  get momentumBefore(): number {
    return this.m1 * this.v1 + this.m2 * this.v2;
  }
  get momentumAfter(): number {
    return this.m1 * this.v1After + this.m2 * this.v2After;
  }
  get kineticBefore(): number {
    return 0.5 * this.m1 * this.v1 * this.v1 + 0.5 * this.m2 * this.v2 * this.v2;
  }
  get kineticAfter(): number {
    return 0.5 * this.m1 * this.v1After * this.v1After + 0.5 * this.m2 * this.v2After * this.v2After;
  }
}

export function collision(params: Params): Collision | null {
  const m1 = params.number("m1");
  const m2 = params.number("m2");
  const v1 = params.number("v1");
  if (m1 === null || m2 === null || v1 === null) return null;
  const v2 = params.number("v2") ?? 0;
  let restitution = 1;
  const given = params.number("e");
  const kind = params.text("kind");
  if (given !== null) restitution = given;
  else if (kind !== null) {
    if (kind === "elastic") restitution = 1;
    else if (kind === "inelastic") restitution = 0;
    else return null;
  }
  // Block 1 is on the left and must be catching up with block 2.
  if (!(
    within(m1, 0.01, 1e3) &&
    within(m2, 0.01, 1e3) &&
    Math.abs(v1) <= 100 &&
    Math.abs(v2) <= 100 &&
    v1 > v2 &&
    within(restitution, 0, 1)
  ))
    return null;
  return new Collision(m1, m2, v1, v2, restitution);
}

const collisionFigure: Compiler = (params, title, language) => {
  const hit = collision(params);
  if (!hit) return null;
  const canvas = new FigureCanvas(language);
  const n = (value: number) => canvas.number(value, 3);
  const after1 = hit.v1After;
  const after2 = hit.v2After;

  // Timing: the blocks wait, then travel for `approach` seconds to touch at the contact time, then separate (or not).
  const wait = 0.9;
  const approach = 2.2;
  const tail = 2.4;
  const contact = wait + approach;
  const end = contact + tail;
  const kindText =
    Math.abs(hit.restitution - 1) < 1e-9
      ? canvas.say("elástica", "elastic")
      : hit.restitution < 1e-9
        ? canvas.say("inelástica", "perfectly inelastic")
        : canvas.say(`parcial, e = ${n(hit.restitution)}`, `partial, e = ${n(hit.restitution)}`);

  // Words first: momentum above, energy below; the "after" lines replace the "before" ones.
  canvas.caption(
    canvas.say(
      `Antes: p = m₁v₁ + m₂v₂ = ${n(hit.m1)}·${n(hit.v1)} + ${n(hit.m2)}·${n(hit.v2)} = ${n(hit.momentumBefore)} kg·m/s`,
      `Before: p = m₁v₁ + m₂v₂ = ${n(hit.m1)}·${n(hit.v1)} + ${n(hit.m2)}·${n(hit.v2)} = ${n(hit.momentumBefore)} kg·m/s`,
    ),
    { row: 0, color: "white", visible: Anim.window(0.3, contact) },
  );
  canvas.caption(
    canvas.say(
      `Depois: p′ = ${n(hit.m1)}·${n(after1)} + ${n(hit.m2)}·${n(after2)} = ${n(hit.momentumAfter)} kg·m/s (conservada)`,
      `After: p′ = ${n(hit.m1)}·${n(after1)} + ${n(hit.m2)}·${n(after2)} = ${n(hit.momentumAfter)} kg·m/s (conserved)`,
    ),
    { row: 0, color: "white", visible: Anim.after(contact), claim: false },
  );
  canvas.caption(`Ec = ½m₁v₁² + ½m₂v₂² = ${n(hit.kineticBefore)} J`, {
    row: 1,
    color: "accent",
    visible: Anim.window(0.3, contact),
  });
  const lost = hit.kineticBefore - hit.kineticAfter;
  const energyAfter =
    lost < 1e-9 * Math.max(1, hit.kineticBefore)
      ? canvas.say(
          `Ec′ = ${n(hit.kineticAfter)} J: conserva-se (${kindText})`,
          `KE′ = ${n(hit.kineticAfter)} J: conserved (${kindText})`,
        )
      : canvas.say(
          `Ec′ = ${n(hit.kineticAfter)} J: perdem-se ${n(lost)} J (${kindText})`,
          `KE′ = ${n(hit.kineticAfter)} J: ${n(lost)} J lost (${kindText})`,
        );
  canvas.caption(energyAfter, { row: 1, color: "accent", visible: Anim.after(contact), claim: false });

  // Block sizes grow with the mass; both sit on the floor, and meet at the contact point.
  const floor = 2.2;
  const width1 = Math.min(1.6, Math.max(0.7, 0.6 + 0.1 * hit.m1));
  const width2 = Math.min(1.6, Math.max(0.7, 0.6 + 0.1 * hit.m2));
  const height1 = Math.min(1.1, Math.max(0.6, 0.5 + 0.06 * hit.m1));
  const height2 = Math.min(1.1, Math.max(0.6, 0.5 + 0.06 * hit.m2));
  const lower = 1.9;
  const upper = 8.1;
  const meeting = (lower + width1 + upper - width2) / 2;
  // The picture's speed scale k: world units per (m/s · s), as large as keeps both blocks inside [lower, upper] all the time.
  let scale = 0.6;
  const limit = (base: number, coefficient: number) => {
    if (coefficient > 1e-12) scale = Math.min(scale, (upper - base) / coefficient);
    if (coefficient < -1e-12) scale = Math.min(scale, (lower - base) / coefficient);
  };
  // Positions of the right face of block 1 and the left face of block 2 at the start and at the end.
  limit(meeting, -hit.v1 * approach);
  limit(meeting - width1, -hit.v1 * approach);
  limit(meeting - width1, hit.v1After * tail);
  limit(meeting, -hit.v2 * approach);
  limit(meeting + width2, -hit.v2 * approach);
  limit(meeting + width2, hit.v2After * tail);
  limit(meeting, hit.v2After * tail);
  limit(meeting, hit.v1After * tail);
  scale = Math.max(scale, 0.01);
  const u = since(wait);
  const capped = `((${u}+${Anim.n(approach + tail)}-abs(${u}-${Anim.n(approach + tail)}))/2)`;
  const before = `((${capped}+${Anim.n(approach)}-abs(${capped}-${Anim.n(approach)}))/2)`;
  const afterContact = `((${capped}-${Anim.n(approach)}+abs(${capped}-${Anim.n(approach)}))/2)`;
  const face = (v: number, vAfter: number) =>
    `${Anim.n(meeting)} + ${Anim.lit(scale)}*(${Anim.lit(v)}*(${before}-${Anim.n(approach)}) + ${Anim.lit(vAfter)}*${afterContact})`;
  const right1 = face(hit.v1, after1);
  const left2 = face(hit.v2, after2);
  canvas.line(0.7, floor, 9.3, floor, { color: "muted" });
  canvas.elements.push({
    kind: "rect",
    x: `(${right1}) - ${Anim.n(width1)}`,
    y: Anim.n(floor),
    w: Anim.n(width1),
    h: Anim.n(height1),
    text: "m₁",
    color: "accent",
    visible: null,
  });
  canvas.elements.push({
    kind: "rect",
    x: left2,
    y: Anim.n(floor),
    w: Anim.n(width2),
    h: Anim.n(height2),
    text: "m₂",
    color: "second",
    visible: null,
  });

  // Velocity arrows over each block, at two heights so that their names never meet; a velocity of zero draws none.
  const arrowLength = 0.2;
  const velocityArrow = (centre: string, y: number, speed: number, name: string, color: string, visible: string) => {
    if (!(Math.abs(speed) > 1e-9)) return;
    const length = Math.max(-1, Math.min(1, arrowLength * speed));
    canvas.arrow(centre, Anim.n(y), `(${centre}) + ${Anim.lit(length)}`, Anim.n(y), { color, visible });
    const reach = length + (length > 0 ? 0.32 : -0.32);
    canvas.movingLabel(name, `(${centre}) + ${Anim.lit(reach)}`, Anim.n(y), { color, visible });
  };
  const centre1 = `(${right1}) - ${Anim.n(width1 / 2)}`;
  const centre2 = `(${left2}) + ${Anim.n(width2 / 2)}`;
  const row1 = 3.7;
  const row2 = 4.4;
  const beforeShown = Anim.window(0.3, contact);
  const afterShown = Anim.after(contact);
  velocityArrow(centre1, row1, hit.v1, "v₁", "accent", beforeShown);
  velocityArrow(centre2, row2, hit.v2, "v₂", "second", beforeShown);
  velocityArrow(centre1, row1, after1, "v₁′", "accent", afterShown);
  velocityArrow(centre2, row2, after2, "v₂′", "second", afterShown);
  canvas.recordSteps([0, 0.6, contact + 0.3, end + 0.1]);
  return canvas.illustration(title, Anim.duration(end + 0.8), [
    slider("m1", "m₁ (kg)", hit.m1, Math.min(0.5, hit.m1), Math.max(5, hit.m1)),
    slider("m2", "m₂ (kg)", hit.m2, Math.min(0.5, hit.m2), Math.max(5, hit.m2)),
    slider("e", "e", hit.restitution, 0, 1),
    slider("v1", "v₁ (m/s)", hit.v1, Math.min(hit.v2 + 0.5, hit.v1), Math.max(8, hit.v1)),
  ]);
};

// MARK: Mass on a spring

export class Oscillator {
  constructor(
    readonly mass: number,
    readonly stiffness: number,
    readonly amplitude: number,
  ) {}
  get omega(): number {
    return Math.sqrt(this.stiffness / this.mass);
  }
  get period(): number {
    return (2 * Math.PI) / this.omega;
  }
  get frequency(): number {
    return 1 / this.period;
  }
  get maxSpeed(): number {
    return this.amplitude * this.omega;
  }
  get maxAcceleration(): number {
    return this.amplitude * this.omega * this.omega;
  }
  /** ½kA², which is also ½mv²ₘₐₓ and the potential energy at the turning points. */
  get energy(): number {
    return 0.5 * this.stiffness * this.amplitude * this.amplitude;
  }
  /** x(t) = A cos ωt: released from rest at x = A. */
  position(time: number): number {
    return this.amplitude * Math.cos(this.omega * time);
  }
  velocity(time: number): number {
    return -this.amplitude * this.omega * Math.sin(this.omega * time);
  }
}

/** The seconds one period of the oscillator takes on the screen: slower oscillators look slower, within reason. */
export function screenPeriod(period: number): number {
  return Math.min(4, Math.max(1.5, 1.2 + 0.7 * period));
}

export function oscillator(params: Params): Oscillator | null {
  const mass = params.number("m") ?? 0.5;
  const stiffness = params.number("k") ?? 20;
  const amplitude = params.number("A") ?? 0.2;
  if (!(within(mass, 0.001, 1e3) && within(stiffness, 0.01, 1e5) && within(amplitude, 0.001, 100))) return null;
  return new Oscillator(mass, stiffness, amplitude);
}

const springOscillator: Compiler = (params, title, language) => {
  const motion = oscillator(params);
  if (!motion) return null;
  const canvas = new FigureCanvas(language);
  const n = (value: number) => canvas.number(value, 3);
  const pull = Teach.start(1);
  const release = Teach.start(2);
  const shownPeriod = screenPeriod(motion.period);
  const oscillationEnd = release + 2 * shownPeriod;

  // Words first.
  canvas.caption(
    `ω = √(k/m) = ${n(motion.omega)} rad/s  ·  T = 2π/ω = ${n(motion.period)} s  ·  f = 1/T = ${n(motion.frequency)} Hz`,
    { row: 0, color: "white", visible: Anim.after(release) },
  );
  const fastest = canvas.say("vmáx", "vmax");
  canvas.caption(
    `x(t) = A·cos ωt  ·  ${fastest} = Aω = ${n(motion.maxSpeed)} m/s  ·  aₘₐₓ = Aω² = ${n(motion.maxAcceleration)} m/s²`,
    { row: 1, color: "accent", visible: Anim.after(Teach.start(3)) },
  );

  // The block on its spring: the picture's amplitude grows with A, within the room there is.
  const equilibrium = 3.1;
  const wall = 0.9;
  const floor = 2.6;
  const visual = 0.5 + 0.9 * Math.min(1, Math.max(0, (motion.amplitude - 0.05) / 0.45));
  canvas.line(wall, floor, 4.95, floor, { color: "muted" });
  canvas.line(wall, 2.3, wall, 3.9, { color: "white" });
  canvas.line(equilibrium, 2.3, equilibrium, 3.9, {
    color: "muted",
    dashed: true,
    visible: Anim.after(Teach.start(0)),
  });
  canvas.label("0", equilibrium, 2.1, { anchor: "center", color: "muted", visible: Anim.after(Teach.start(0)) });
  for (const [name, sign] of [
    ["−A", -1],
    ["+A", 1],
  ] as const) {
    const shown = Anim.after(pull + 0.8);
    canvas.line(equilibrium + sign * visual, 2.3, equilibrium + sign * visual, 3.9, {
      color: "muted",
      dashed: true,
      visible: shown,
    });
    canvas.label(name, equilibrium + sign * visual, 2.1, { anchor: "center", color: "muted", visible: shown });
  }
  const osc = since(release);
  const phase = `2*pi*${osc}/${Anim.n(shownPeriod)}`;
  const centre = `${Anim.n(equilibrium)} + ${Anim.n(visual)}*${Anim.ramp(pull, pull + 0.8)}*cos(${phase})`;
  canvas.elements.push({
    kind: "rect",
    x: `(${centre}) - 0.4`,
    y: Anim.n(floor),
    w: "0.8",
    h: "0.8",
    text: "m",
    color: "accent",
    visible: null,
  });
  canvas.elements.push({
    kind: "spring",
    x: Anim.n(wall),
    y: "3.0",
    x2: `(${centre}) - 0.4`,
    y2: "3.0",
    color: "white",
    visible: null,
  });

  // The graph of x against t over two periods, drawn as the block moves.
  const frame = new PremadeFrame(
    0,
    2 * motion.period,
    -1.3 * motion.amplitude,
    1.3 * motion.amplitude,
    5.7,
    8.7,
    2.0,
    4.4,
  );
  // The curve ends at the right edge, so "t (s)" stands past the arrow's tip, clear of it.
  canvas.axes(frame, { xName: "t (s)", yName: "x (m)", ticks: false, xNameBeyond: true });
  canvas.reserveStrokes(
    Array.from({ length: 121 }, (_, step) => {
      const time = (2 * motion.period * step) / 120;
      return { x: frame.x(time), y: frame.y(motion.amplitude * Math.cos((2 * Math.PI * time) / motion.period)) };
    }),
  );
  canvas.axisTicks(frame);
  const head = `${Anim.n(2 * motion.period)}*${Anim.clamp01(`(${osc}/${Anim.n(2 * shownPeriod)})`)}`;
  const wave = `${Anim.n(motion.amplitude)}*cos(2*pi*s/${Anim.n(motion.period)})`;
  canvas.curve(frame.xText("s"), frame.yText(wave), "0", head, { color: "accent", visible: Anim.after(release) });
  const headWave = `${Anim.n(motion.amplitude)}*cos(2*pi*(${head})/${Anim.n(motion.period)})`;
  canvas.elements.push({
    kind: "point",
    x: frame.xText(head),
    y: frame.yText(headWave),
    color: "white",
    visible: Anim.after(release),
  });
  canvas.line(frame.xText(head), frame.axisY, frame.xText(head), frame.yText(headWave), {
    color: "muted",
    dashed: true,
    visible: Anim.after(release),
  });
  // One period is marked once the block has been round once.
  const periodMarked = Anim.after(release + shownPeriod);
  const bracketY = frame.y(-1.15 * motion.amplitude);
  canvas.arrow(frame.x(0), bracketY, frame.x(motion.period), bracketY, { color: "second", visible: periodMarked });
  canvas.label(`T = ${n(motion.period)} s`, frame.x(motion.period / 2), bracketY - 0.28, {
    anchor: "center",
    color: "second",
    visible: periodMarked,
  });
  canvas.recordSteps([0, Teach.start(0) + 0.95, pull + 0.95, oscillationEnd + 0.1, oscillationEnd + 0.6]);
  return canvas.illustration(title, Anim.duration(oscillationEnd + 1.2), [
    slider("m", "m (kg)", motion.mass, Math.min(0.1, motion.mass), Math.max(5, motion.mass)),
    slider("k", "k (N/m)", motion.stiffness, Math.min(5, motion.stiffness), Math.max(200, motion.stiffness)),
    slider("A", "A (m)", motion.amplitude, Math.min(0.05, motion.amplitude), Math.max(0.5, motion.amplitude)),
  ]);
};

// MARK: Resistors in series or in parallel

export class ResistorNetwork {
  constructor(
    readonly parallel: boolean,
    readonly emf: number,
    readonly resistances: number[],
  ) {}
  get equivalent(): number {
    return this.parallel
      ? 1 / this.resistances.reduce((sum, r) => sum + 1 / r, 0)
      : this.resistances.reduce((sum, r) => sum + r, 0);
  }
  /** The current the source delivers. */
  get current(): number {
    return this.emf / this.equivalent;
  }
  /** The current in each resistor: the same in series, ε/Rᵢ in parallel. */
  get branchCurrents(): number[] {
    return this.parallel ? this.resistances.map((r) => this.emf / r) : this.resistances.map(() => this.current);
  }
  /** The voltage across each resistor: the same ε in parallel, I·Rᵢ in series. */
  get voltages(): number[] {
    return this.parallel ? this.resistances.map(() => this.emf) : this.resistances.map((r) => this.current * r);
  }
}

export function resistorNetwork(params: Params): ResistorNetwork | null {
  const kind = params.text("kind") ?? "series";
  const emf = params.number("V") ?? params.number("emf") ?? 12;
  if (!((kind === "series" || kind === "parallel") && within(emf, 0.001, 1e4))) return null;
  let resistances: number[];
  const first = params.number("R1");
  const second = params.number("R2");
  const list = params.numbers("R");
  if (first !== null && second !== null) {
    const third = params.number("R3");
    resistances = third !== null ? [first, second, third] : [first, second];
  } else if (list) {
    // A slider moves one resistor at a time: it overrides the list.
    resistances = list.map((value, index) => params.number(`R${index + 1}`) ?? value);
  } else return null;
  if (resistances.length < 2 || resistances.length > 3 || !resistances.every((r) => within(r, 0.01, 1e6))) return null;
  return new ResistorNetwork(kind === "parallel", emf, resistances);
}

const resistorNetworkFigure: Compiler = (params, title, language) => {
  const network = resistorNetwork(params);
  if (!network) return null;
  const canvas = new FigureCanvas(language);
  const n = (value: number) => canvas.number(value, 3);
  const count = network.resistances.length;
  const names = network.resistances.map((_, index) => "R" + subscripted(index + 1));
  const steps = 4;
  const drawn = Teach.start(1);
  const solved = Teach.start(2);
  const shown = Teach.start(3);
  const currents = network.branchCurrents;
  const voltages = network.voltages;

  // Words first.
  if (network.parallel) {
    const reciprocal = network.resistances.map((r) => `1/${n(r)}`).join(" + ");
    canvas.caption(
      `1/Req = ${names.map((name) => `1/${name}`).join(" + ")} = ${reciprocal}  ⇒  Req = ${n(network.equivalent)} Ω`,
      { row: 0, color: "white", visible: Anim.after(solved) },
    );
    const sum = currents.map(n).join(" + ");
    canvas.caption(
      `I = ε/Req = ${n(network.current)} A = ` +
        names.map((_, index) => "I" + subscripted(index + 1)).join(" + ") +
        ` = ${sum} A`,
      { row: 1, color: "accent", visible: Anim.after(shown) },
    );
  } else {
    canvas.caption(
      `Req = ${names.join(" + ")} = ${network.resistances.map(n).join(" + ")} = ${n(network.equivalent)} Ω`,
      { row: 0, color: "white", visible: Anim.after(solved) },
    );
    canvas.caption(
      `I = ε/Req = ${n(network.emf)}/${n(network.equivalent)} = ${n(network.current)} A  ·  ΣU = ${n(voltages.reduce((s, v) => s + v, 0))} V = ε`,
      { row: 1, color: "accent", visible: Anim.after(shown) },
    );
  }

  // The loop: the source on the left, wires round, the resistors in their place.
  const top = 4.2;
  const bottom = 1.8;
  const left = 1.4;
  const right = 8.6;
  const flowing = (value: number) => `${Anim.n(value)}*${Anim.ramp(shown, shown + 0.3)}`;
  const wire = (x: number, y: number, x2: number, y2: number, current: number, visible: string | null = null) =>
    canvas.elements.push({
      kind: "line",
      x: Anim.n(x),
      y: Anim.n(y),
      x2: Anim.n(x2),
      y2: Anim.n(y2),
      current: flowing(current),
      visible: visible ?? Anim.after(Teach.start(0)),
    });
  const part = (name: string, x: number, y: number, x2: number, y2: number, current: number, visible: string | null) =>
    canvas.elements.push({
      kind: "component",
      x: Anim.n(x),
      y: Anim.n(y),
      x2: Anim.n(x2),
      y2: Anim.n(y2),
      color: null,
      component: name,
      current: flowing(current),
      visible,
    });
  // The wires and the source come first; where a resistor will go, a plain wire stands until it is drawn.
  const first = Teach.start(0);
  const wired = Anim.after(first);
  const beforeResistors = Anim.window(first, drawn);
  part("battery", left, bottom, left, top, network.current, wired);
  canvas.label(`ε = ${n(network.emf)} V`, left - 0.15, 3.0, { anchor: "trailing", color: "white", visible: wired });
  if (network.parallel) {
    const xs = count === 2 ? [4.4, 6.8] : [3.6, 5.5, 7.4];
    // What each stretch of the rails carries: everything, then what the branches before it did not take.
    let carried = network.current;
    let previousX = left;
    xs.forEach((x, index) => {
      wire(previousX, top, x, top, carried);
      wire(x, bottom, previousX, bottom, carried);
      carried -= currents[index]!;
      previousX = x;
    });
    xs.forEach((x, index) => {
      wire(x, top, x, bottom, currents[index]!, beforeResistors);
      part("resistor", x, top, x, bottom, currents[index]!, Anim.after(drawn));
      canvas.dot(x, top, { color: "white", visible: wired });
      canvas.dot(x, bottom, { color: "white", visible: wired });
      canvas.label(`${names[index]} = ${n(network.resistances[index]!)} Ω`, x - 0.35, 3.45, {
        anchor: "trailing",
        color: "white",
        visible: Anim.after(drawn),
      });
      canvas.label(`I${subscripted(index + 1)} = ${n(currents[index]!)} A`, x - 0.35, 2.75, {
        anchor: "trailing",
        color: "accent",
        visible: Anim.after(shown),
      });
    });
  } else {
    const length = 1.4;
    const gap = (right - left - count * length) / (count + 1);
    let x = left;
    for (let index = 0; index < count; index++) {
      const start = left + gap * (index + 1) + length * index;
      const end = start + length;
      wire(x, top, start, top, network.current);
      wire(start, top, end, top, network.current, beforeResistors);
      part("resistor", start, top, end, top, network.current, Anim.after(drawn));
      canvas.label(`${names[index]} = ${n(network.resistances[index]!)} Ω`, (start + end) / 2, top + 0.55, {
        anchor: "center",
        color: "white",
        visible: Anim.after(drawn),
      });
      canvas.label(`U${subscripted(index + 1)} = ${n(voltages[index]!)} V`, (start + end) / 2, top - 0.55, {
        anchor: "center",
        color: "accent",
        visible: Anim.after(shown),
      });
      x = end;
    }
    wire(x, top, right, top, network.current);
    wire(right, top, right, bottom, network.current);
    wire(right, bottom, left, bottom, network.current);
    canvas.label(`I = ${n(network.current)} A`, right - 0.15, 3.0, {
      anchor: "trailing",
      color: "accent",
      visible: Anim.after(shown),
    });
  }
  canvas.recordSteps(Teach.boundaries(steps));
  const parameters: IllustrationParameter[] = [
    slider("V", "ε (V)", network.emf, Math.min(1, network.emf), Math.max(24, network.emf)),
  ];
  network.resistances.forEach((value, index) =>
    parameters.push(
      slider(`R${index + 1}`, `R${subscripted(index + 1)} (Ω)`, value, Math.min(5, value), Math.max(60, value)),
    ),
  );
  return canvas.illustration(title, Anim.duration(Teach.finish(steps) + 1.0), parameters);
};

// MARK: Pulleys: Atwood's machine and a block pulled over a table

export class PulleySystem {
  constructor(
    /** False: two masses hang over a pulley. True: m₁ on a smooth table pulled by the hanging m₂. */
    readonly onTable: boolean,
    readonly m1: number,
    readonly m2: number,
    readonly g: number,
  ) {}
  /** The size of the acceleration. For the hanging pair the heavier mass goes down. */
  get acceleration(): number {
    const { m1, m2, g } = this;
    return this.onTable ? (m2 * g) / (m1 + m2) : (Math.abs(m2 - m1) * g) / (m1 + m2);
  }
  /** The tension in the string, from Newton's second law on either mass. */
  get tension(): number {
    const { m1, m2, g } = this;
    return this.onTable ? (m1 * m2 * g) / (m1 + m2) : (2 * m1 * m2 * g) / (m1 + m2);
  }
  /** +1 when m₂ goes down, −1 when m₁ does, 0 when nothing moves. */
  get direction(): number {
    if (this.onTable) return 1;
    return this.m2 > this.m1 ? 1 : this.m1 > this.m2 ? -1 : 0;
  }
}

export function pulleySystem(params: Params): PulleySystem | null {
  const kind = params.text("kind") ?? "atwood";
  const m1 = params.number("m1");
  const m2 = params.number("m2");
  if (!(kind === "atwood" || kind === "table") || m1 === null || m2 === null) return null;
  const g = params.number("g") ?? 9.8;
  if (!(within(m1, 0.01, 1e3) && within(m2, 0.01, 1e3) && g > 0 && g <= 30)) return null;
  return new PulleySystem(kind === "table", m1, m2, g);
}

const atwood: Compiler = (params, title, language) => {
  const system = pulleySystem(params);
  if (!system) return null;
  const canvas = new FigureCanvas(language);
  const n = (value: number) => canvas.number(value, 3);
  const steps = system.acceleration > 1e-9 ? 4 : 3;
  const motion = Teach.start(2);
  const travel = 3.5;
  const after = Anim.ramp(motion, motion + travel);
  const drop = system.onTable ? 0.9 : 0.75;
  // Constant acceleration from rest: the distance grows with the square of the time.
  const distance = `${Anim.n(drop)}*${after}*${after}`;
  const sign = system.direction;

  // Words first.
  canvas.label(`m₁ = ${n(system.m1)} kg  ·  m₂ = ${n(system.m2)} kg`, 0.5, 4.9, { anchor: "leading", color: "muted" });
  if (system.onTable) {
    canvas.caption(`m₂g − T = m₂a  e  T = m₁a  ⇒  a = m₂g/(m₁ + m₂) = ${n(system.acceleration)} m/s²`, {
      row: 0,
      color: "white",
      visible: Anim.after(motion),
    });
    canvas.caption(`T = m₁m₂g/(m₁ + m₂) = ${n(system.tension)} N`, {
      row: 1,
      color: "accent",
      visible: Anim.after(Teach.start(1)),
    });
  } else {
    const line =
      system.acceleration > 1e-9
        ? `a = (m₂ − m₁)g/(m₁ + m₂) = ${n(system.acceleration)} m/s²`
        : canvas.say("m₁ = m₂: a = 0, o sistema fica em equilíbrio", "m₁ = m₂: a = 0, the system stays in balance");
    canvas.caption(line, { row: 0, color: "white", visible: Anim.after(motion) });
    canvas.caption(`T = 2m₁m₂g/(m₁ + m₂) = ${n(system.tension)} N`, {
      row: 1,
      color: "accent",
      visible: Anim.after(Teach.start(1)),
    });
  }

  // Arrows share one scale, so that P and T can be compared; the heavier pull wins.
  const strongest = Math.max(system.m1 * system.g, system.m2 * system.g, system.tension);
  const unit = (system.onTable ? 0.55 : 0.6) / strongest;
  const shown1 = Anim.after(Teach.start(0));
  const forces = Anim.after(Teach.start(1));
  const box = (centreX: string, top: string, width: number, height: number, name: string, color: string) =>
    canvas.elements.push({
      kind: "rect",
      x: `(${centreX}) - ${Anim.n(width / 2)}`,
      y: `(${top}) - ${Anim.n(height)}`,
      w: Anim.n(width),
      h: Anim.n(height),
      text: name,
      color,
      visible: shown1,
    });
  const vertical = (x: string, y: string, y2: string, color: string) =>
    canvas.elements.push({ kind: "line", x, y, x2: x, y2, color, dashed: null, visible: shown1 });
  if (!system.onTable) {
    const pulley = { x: 5.0, y: 4.5 };
    const radius = 0.35;
    const width1 = Math.min(0.6, 0.3 + 0.04 * system.m1);
    const width2 = Math.min(0.6, 0.3 + 0.04 * system.m2);
    const height1 = Math.min(0.7, 0.35 + 0.06 * system.m1);
    const height2 = Math.min(0.7, 0.35 + 0.06 * system.m2);
    const left = pulley.x - radius;
    const right = pulley.x + radius;
    canvas.line(4.3, 4.95, 5.7, 4.95, { color: "muted", visible: shown1 });
    canvas.line(pulley.x, 4.95, pulley.x, pulley.y, { color: "muted", visible: shown1 });
    canvas.ring(pulley.x, pulley.y, radius, { color: "white", visible: shown1 });
    canvas.dot(pulley.x, pulley.y, { color: "white", visible: shown1 });
    const start = 3.2;
    // m₂ goes down by `distance` when it is the heavier, m₁ goes up by as much, and the other way round.
    const top1 = `${Anim.n(start)} + ${Anim.lit(sign)}*(${distance})`;
    const top2 = `${Anim.n(start)} - ${Anim.lit(sign)}*(${distance})`;
    vertical(Anim.n(left), Anim.n(pulley.y), top1, "white");
    vertical(Anim.n(right), Anim.n(pulley.y), top2, "white");
    box(Anim.n(left), top1, width1, height1, "m₁", "accent");
    box(Anim.n(right), top2, width2, height2, "m₂", "second");
    // Forces on each mass, from its centre: T up, its weight down.
    const sides = [
      { x: left, top: top1, height: height1, mass: system.m1, color: "accent" },
      { x: right, top: top2, height: height2, mass: system.m2, color: "second" },
    ];
    sides.forEach(({ x, top, height, mass, color }, index) => {
      const centre = `(${top}) - ${Anim.n(height / 2)}`;
      const outward = index === 0 ? -1 : 1;
      const anchor = index === 0 ? "trailing" : "leading";
      const sub = subscripted(index + 1);
      canvas.arrow(Anim.n(x), centre, Anim.n(x), `(${centre}) + ${Anim.n(unit * system.tension)}`, {
        color: "white",
        visible: forces,
      });
      canvas.arrow(Anim.n(x), centre, Anim.n(x), `(${centre}) - ${Anim.n(unit * mass * system.g)}`, {
        color,
        visible: forces,
      });
      canvas.movingLabel(
        "T",
        `${Anim.n(x + outward * 0.15)}`,
        `(${centre}) + ${Anim.n(unit * system.tension + 0.15)}`,
        {
          anchor,
          color: "white",
          visible: forces,
        },
      );
      canvas.movingLabel(
        `P${sub}`,
        `${Anim.n(x + outward * 0.15)}`,
        `(${centre}) - ${Anim.n(unit * mass * system.g + 0.15)}`,
        { anchor, color, visible: forces },
      );
    });
  } else {
    const tableTop = 3.4;
    const blockWidth = Math.min(0.75, 0.35 + 0.05 * system.m1);
    const blockHeight = Math.min(0.6, 0.3 + 0.05 * system.m1);
    const hangWidth = Math.min(0.7, 0.35 + 0.05 * system.m2);
    const hangHeight = Math.min(0.6, 0.3 + 0.05 * system.m2);
    const ropeY = tableTop + blockHeight / 2;
    const pulley = { x: 6.1, y: ropeY - 0.3 };
    canvas.line(0.9, tableTop, 6.1, tableTop, { color: "muted", visible: shown1 });
    canvas.line(1.1, tableTop, 1.1, 1.7, { color: "muted", visible: shown1 });
    canvas.line(5.8, tableTop, 5.8, 1.7, { color: "muted", visible: shown1 });
    canvas.ring(pulley.x, pulley.y, 0.3, { color: "white", visible: shown1 });
    canvas.dot(pulley.x, pulley.y, { color: "white", visible: shown1 });
    const blockCentre = `3.3 + ${distance}`;
    const hangTop = `${Anim.n(pulley.y - 0.4)} - (${distance})`;
    canvas.elements.push({
      kind: "line",
      x: `(${blockCentre}) + ${Anim.n(blockWidth / 2)}`,
      y: Anim.n(ropeY),
      x2: Anim.n(pulley.x),
      y2: Anim.n(ropeY),
      color: "white",
      visible: shown1,
    });
    vertical(Anim.n(pulley.x + 0.3), Anim.n(pulley.y), hangTop, "white");
    box(blockCentre, Anim.n(tableTop + blockHeight), blockWidth, blockHeight, "m₁", "accent");
    box(Anim.n(pulley.x + 0.3), hangTop, hangWidth, hangHeight, "m₂", "second");
    // The block feels T alone along the table (its weight and the table cancel); the hanging mass feels T and P₂.
    const blockMid = Anim.n(tableTop + blockHeight / 2);
    canvas.arrow(blockCentre, blockMid, `(${blockCentre}) + ${Anim.n(unit * system.tension)}`, blockMid, {
      color: "white",
      visible: forces,
    });
    canvas.movingLabel(
      "T",
      `(${blockCentre}) + ${Anim.n(unit * system.tension + 0.2)}`,
      `${Anim.n(tableTop + blockHeight / 2 + 0.3)}`,
      { anchor: "leading", color: "white", visible: forces },
    );
    const hangCentre = `(${hangTop}) - ${Anim.n(hangHeight / 2)}`;
    const hangX = Anim.n(pulley.x + 0.3);
    canvas.arrow(hangX, hangCentre, hangX, `(${hangCentre}) + ${Anim.n(unit * system.tension)}`, {
      color: "white",
      visible: forces,
    });
    canvas.arrow(hangX, hangCentre, hangX, `(${hangCentre}) - ${Anim.n(unit * system.m2 * system.g)}`, {
      color: "second",
      visible: forces,
    });
    canvas.movingLabel("T", `${Anim.n(pulley.x + 0.45)}`, `(${hangCentre}) + ${Anim.n(unit * system.tension + 0.15)}`, {
      anchor: "leading",
      color: "white",
      visible: forces,
    });
    canvas.movingLabel(
      "P₂",
      `${Anim.n(pulley.x + 0.45)}`,
      `(${hangCentre}) - ${Anim.n(unit * system.m2 * system.g + 0.15)}`,
      { anchor: "leading", color: "second", visible: forces },
    );
  }
  const boundaries = [0, Teach.start(0) + 0.95, Teach.start(1) + 0.95, motion + 0.2];
  if (steps === 4) boundaries.push(motion + travel + 0.05);
  canvas.recordSteps(boundaries);
  return canvas.illustration(title, Anim.duration(motion + travel + 1.0), [
    slider("m1", "m₁ (kg)", system.m1, Math.min(0.5, system.m1), Math.max(8, system.m1)),
    slider("m2", "m₂ (kg)", system.m2, Math.min(0.5, system.m2), Math.max(8, system.m2)),
  ]);
};

/** The physics of batch 3, by premade type. */
export const mechanicsFigures: Record<string, Compiler> = {
  freeBody,
  circularMotion: circularMotionFigure,
  energyBars,
  collision: collisionFigure,
  springOscillator,
  resistorNetwork: resistorNetworkFigure,
  atwood,
};
