// Port of LearnLayer/Illustrations/PremadeFigureAnimatedPhysics.swift @ ref 2026-11-04: the physics scenes the mascot
// walks into (pt-PT labels, stepped playback). A car on a road with x(t), v(t) and a(t) drawn on the same clock; a ball
// thrown up with y(t) and v(t); a block on an incline with its free-body diagram. The app works out every value.

import {
  Anim,
  FigureCanvas,
  Params,
  PlottedFunction,
  PremadeFrame,
  slider,
  type AnimatedIllustration,
} from "./figureCanvas";
import {
  arc,
  CarArt,
  ellipsePoints,
  mascotBody,
  mascotFace,
  MascotTrip,
  rotatedBox,
  shape,
  softShadow,
} from "./mascot";

// MARK: Shared kinematics (tests and compilers)

export const kinematicPosition = (x0: number, v0: number, a: number, t: number) => x0 + v0 * t + 0.5 * a * t * t;
export const kinematicVelocity = (v0: number, a: number, t: number) => v0 + a * t;
export const verticalThrowApexTime = (v0: number, g: number) => (v0 > 0 && g > 0 ? v0 / g : 0);
export const verticalThrowFlightTime = (v0: number, g: number) => (v0 > 0 && g > 0 ? (2 * v0) / g : 0);
export const verticalThrowHeight = (v0: number, g: number, t: number) => v0 * t - 0.5 * g * t * t;
export const verticalThrowVelocity = (v0: number, g: number, t: number) => v0 - g * t;

export function inclineAcceleration(angleDegrees: number, mu: number, g = 9.8): number {
  const rad = (angleDegrees * Math.PI) / 180;
  return g * (Math.sin(rad) - mu * Math.cos(rad));
}

/** Eased simulation clock used by physics scenes (matches `Anim.calmTime`). */
export function easedSimTime(t: number, tMax: number, from: number, to: number): number {
  const u = Math.max(0, Math.min(1, (t - from) / Math.max(to - from, 0.001)));
  return tMax * (0.5 - 0.5 * Math.cos(Math.PI * u));
}

/** The range of x(t) over [0, tMax], with room around it; an extreme inside the interval counts. */
export function motionRange(x0: number, v0: number, a: number, tMax: number): { low: number; high: number } {
  const values = [x0, kinematicPosition(x0, v0, a, tMax)];
  if (Math.abs(a) > 1e-9) {
    const turn = -v0 / a;
    if (turn > 0 && turn < tMax) values.push(kinematicPosition(x0, v0, a, turn));
  }
  let low = Math.min(...values) - 0.4;
  let high = Math.max(...values) + 0.4;
  if (high - low < 1) {
    low -= 0.5;
    high += 0.5;
  }
  return { low, high };
}

/** Lower corner of the incline and its length along the slope, kept inside the left half of the picture. */
export function inclineLayout(angle: number): { ax: number; ay: number; length: number } {
  const rad = (angle * Math.PI) / 180;
  return { ax: 0.8, ay: 1.2, length: Math.min(4.2, 3.0 / Math.sin(rad), 4.0 / Math.cos(rad)) };
}

export const MotionLayout = { carLeft: 1.45, carSpan: 2.35, roadY: 3.0, playStart: 5.2, playEnd: 12.0 };
export const ThrowLayout = { ground: 1.2, ballX: 2.0, rise: 3.4, radius: 0.3, playStart: 5.2, playEnd: 11.0 };

/** Params with none of the scene's own keys (a typo, a wrong figure type) are not a request for the defaults. */
const hasAnyNumber = (params: Params, keys: string[]) => keys.some((key) => params.number(key) !== null);

/** A figure whose sphere is the tutor's body on a trip: the stage keeps its own body out of the way until then. */
const withTrip = (scene: AnimatedIllustration, trip: MascotTrip): AnimatedIllustration => ({
  ...scene,
  mascotHoldsUntil: trip.holdsUntil,
});

type Compiler = (params: Params, title: string, language: string) => AnimatedIllustration | null;

const motionScene: Compiler = (params, title, language) => {
  if (!hasAnyNumber(params, ["x0", "v0", "a", "tMax"])) return null;
  const x0 = params.number("x0") ?? 0;
  const v0 = params.number("v0") ?? 2;
  const a = params.number("a") ?? 0;
  const tMax = params.number("tMax") ?? 4;
  if (!(tMax > 0.2) || tMax > 12 || Math.abs(a) > 40 || Math.abs(v0) > 60) return null;
  const layout = MotionLayout;
  const { low: xLow, high: xHigh } = motionRange(x0, v0, a, tMax);
  const span = Math.max(xHigh - xLow, 1e-6);
  const vEnd = kinematicVelocity(v0, a, tMax);
  let vLow = Math.min(v0, vEnd, 0) - 0.5;
  let vHigh = Math.max(v0, vEnd, 0) + 0.5;
  if (vHigh - vLow < 1) {
    vLow -= 0.5;
    vHigh += 0.5;
  }
  const aLow = Math.min(a, 0) - 1;
  const aHigh = Math.max(a, 0) + 1;

  const play = layout.playStart;
  const end = layout.playEnd;
  const roadY = layout.roadY;
  const tau = Anim.calmTime(tMax, play, end);
  const cursor = Anim.clamp(tau, 0, tMax);
  const shift = `(${Anim.lit(v0)}*(${tau})+${Anim.lit(0.5 * a)}*(${tau})*(${tau}))`;
  const drive = `${shift}/${Anim.lit(span)}*${Anim.lit(layout.carSpan)}`;
  const targetX = layout.carLeft + ((x0 - xLow) / span) * layout.carSpan;
  const trip = new MascotTrip({ x: targetX, y: roadY + CarArt.halfHeight }, 0.3);
  const centreX = `${trip.x}+${drive}`;
  const fixedX = `${Anim.lit(targetX)}+${drive}`;

  const canvas = new FigureCanvas(language);
  canvas.caption(canvas.say("Movimento retilíneo", "Straight-line motion"), {
    row: 0,
    color: "white",
    visible: Anim.after(0.2),
  });

  // Road: a soft band with a surface line; the car's shadow lies on it.
  const roadShown = Anim.after(trip.moveStart);
  shape(
    canvas,
    [
      { x: 0.25, y: roadY },
      { x: 5.0, y: roadY },
      { x: 5.0, y: roadY - 0.34 },
      { x: 0.25, y: roadY - 0.34 },
    ],
    "0",
    "0",
    { color: "white", fill: 0.07, stroke: false, visible: roadShown },
  );
  canvas.line(0.25, roadY, 5.0, roadY, { color: "muted", visible: roadShown });
  const bloom = Anim.smootherRamp(trip.morphStart + 1.4, trip.morphEnd + 0.8);
  softShadow(canvas, fixedX, Anim.n(roadY - 0.04), `${Anim.lit(0.98 * CarArt.k)}*${bloom}`, 0.075, {
    visible: Anim.after(trip.morphStart + 1.4),
  });

  // The mascot glides in and its outline flows into the car's silhouette.
  mascotBody(canvas, trip, centreX, trip.y, CarArt.centred());
  mascotFace(canvas, trip, centreX, trip.y);

  const shown = Anim.after(trip.morphEnd);
  for (const window of CarArt.windows())
    shape(canvas, window, fixedX, Anim.n(roadY), { color: "white", fill: 0.8, stroke: false, visible: shown });
  const doorX = Anim.lit(-0.01 * CarArt.k);
  canvas.line(
    `(${fixedX})+${doorX}`,
    Anim.n(roadY + 0.57 * CarArt.k),
    `(${fixedX})+${doorX}`,
    Anim.n(roadY + 0.26 * CarArt.k),
    {
      color: "muted",
      visible: shown,
    },
  );
  shape(canvas, ellipsePoints(CarArt.p(0.8, 0.41), 0.045 * CarArt.k, 0.032 * CarArt.k), fixedX, Anim.n(roadY), {
    color: "white",
    fill: 0.9,
    visible: shown,
  });

  // Round wheels spring out of the body and turn exactly as far as the car has driven.
  const wheel = CarArt.wheelRadius;
  const growStart = trip.morphStart + 0.8;
  const grow = Anim.springRamp(growStart, trip.morphEnd + 0.5);
  const rolled = `(-(${drive})/${Anim.lit(wheel)})`;
  for (const wheelX of CarArt.wheelXs) {
    const cx = `(${fixedX})+${Anim.lit(wheelX)}`;
    const cy = Anim.n(roadY + wheel);
    canvas.ring(cx, cy, `${Anim.lit(wheel)}*${grow}`, { color: "white", fill: 0.2, visible: Anim.after(growStart) });
    canvas.ring(cx, cy, `${Anim.lit(wheel * 0.58)}*${grow}`, { color: "muted", visible: Anim.after(growStart + 0.2) });
    const spokesShown = Anim.after(trip.morphEnd + 0.4);
    for (let spoke = 0; spoke < 5; spoke++) {
      const turn = `${rolled}+${Anim.n((spoke * 2 * Math.PI) / 5)}`;
      canvas.line(
        cx,
        cy,
        `${cx}+${Anim.lit(wheel * 0.58)}*cos(${turn})`,
        `${cy}+${Anim.lit(wheel * 0.58)}*sin(${turn})`,
        {
          color: "white",
          visible: spokesShown,
        },
      );
    }
  }

  // x(t), v(t), a(t): drawn with the same clock as the car; a cursor and a dot ride along.
  const frameXT = new PremadeFrame(0, tMax, xLow, xHigh, 5.25, 9.35, 3.85, 5.0);
  const frameVT = new PremadeFrame(0, tMax, vLow, vHigh, 5.25, 9.35, 2.4, 3.55);
  const frameAT = new PremadeFrame(0, tMax, aLow, aHigh, 5.25, 9.35, 0.95, 2.1);
  const series: [PremadeFrame, string, string, string][] = [
    [frameXT, "x(t)", `${Anim.lit(x0)}+${Anim.lit(v0)}*x+${Anim.lit(0.5 * a)}*x^2`, `${Anim.lit(x0)}+${shift}`],
    [frameVT, "v(t)", `${Anim.lit(v0)}+${Anim.lit(a)}*x`, `${Anim.lit(v0)}+${Anim.lit(a)}*(${tau})`],
    [frameAT, "a", Anim.lit(a), Anim.lit(a)],
  ];
  for (const [frame, name, text, value] of series) {
    const f = PlottedFunction.make(text);
    if (!f) return null;
    canvas.axes(frame, { xName: "t", yName: name, ticks: false, visible: shown, nameBeyondArrow: true });
    canvas.plot(f, frame, 0, tMax, { color: "white", start: play, end, eased: true });
    canvas.line(frame.xText(cursor), frame.bottom, frame.xText(cursor), frame.top, {
      color: "muted",
      dashed: true,
      visible: shown,
    });
    canvas.dot(frame.xText(cursor), frame.yText(value), { color: "accent", visible: shown });
  }

  const still = Math.abs(a) < 1e-6;
  const law = still ? "x = x₀ + vt" : "x = x₀ + v₀t + ½at²";
  const mode = still ? canvas.say("MRU", "uniform motion") : canvas.say("MRUA", "uniformly accelerated motion");
  const facts = `v₀ = ${canvas.number(v0)} m/s` + (still ? "" : ` · a = ${canvas.number(a)} m/s²`);
  canvas.label(mode, 2.6, 1.95, { color: "white", visible: Anim.after(play - 0.6) });
  canvas.label(law, 2.6, 1.45, { color: "muted", visible: Anim.after(play - 0.3) });
  canvas.label(facts, 2.6, 0.95, { color: "muted", visible: Anim.after(play) });

  const parameters = [slider("v0", "v₀", v0, -8, 12), slider("a", "a", a, -4, 4), slider("tMax", "t", tMax, 2, 10)];
  canvas.recordSteps([0, trip.moveEnd, play, end, end + 0.8]);
  return withTrip(canvas.illustration(title, Anim.duration(end + 1.2), parameters), trip);
};

const verticalThrow: Compiler = (params, title, language) => {
  if (!hasAnyNumber(params, ["v0", "g"])) return null;
  const v0 = params.number("v0") ?? 10;
  const g = params.number("g") ?? 9.8;
  if (!(v0 > 0) || v0 > 40 || !(g > 0) || g > 20) return null;
  const layout = ThrowLayout;
  const flight = verticalThrowFlightTime(v0, g);
  const hMax = (v0 * v0) / (2 * g);
  const play = layout.playStart;
  const end = layout.playEnd;
  const ground = layout.ground;
  const ballX = layout.ballX;
  const radius = layout.radius;
  const trip = new MascotTrip({ x: ballX, y: ground + radius }, radius);
  const scale = layout.rise / Math.max(hMax, 0.5);
  const tau = Anim.calmTime(flight, play, end);
  const cursor = Anim.clamp(tau, 0, flight);
  // τ stops at the flight time, so the height ends on the ground and never goes below it.
  const height = `(${Anim.lit(v0)}*(${tau})-${Anim.lit(0.5 * g)}*(${tau})*(${tau}))`;
  const velocity = `(${Anim.lit(v0)}-${Anim.lit(g)}*(${tau}))`;
  const centreX = trip.x;
  const centreY = `${trip.y}+${Anim.lit(scale)}*(${height})`;
  const arrowScale = 0.55 / v0;

  const canvas = new FigureCanvas(language);
  canvas.caption(canvas.say("Lançamento vertical", "Vertical throw"), {
    row: 0,
    color: "white",
    visible: Anim.after(0.2),
  });
  const groundShown = Anim.after(trip.moveStart);
  shape(
    canvas,
    [
      { x: 1.3, y: ground },
      { x: 2.7, y: ground },
      { x: 2.7, y: ground - 0.3 },
      { x: 1.3, y: ground - 0.3 },
    ],
    "0",
    "0",
    { color: "white", fill: 0.07, stroke: false, visible: groundShown },
  );
  canvas.line(1.3, ground, 2.7, ground, { color: "muted", visible: groundShown });
  // The shadow shrinks and fades a little as the ball climbs.
  softShadow(
    canvas,
    Anim.n(ballX),
    Anim.n(ground - 0.04),
    `0.42*(1-0.45*(${height})/${Anim.lit(hMax)})*${Anim.smootherRamp(trip.morphStart, trip.morphEnd)}`,
    0.07,
    { visible: Anim.after(trip.morphStart) },
  );
  const rulerTop = ground + radius + layout.rise;
  for (const y of [ground, rulerTop])
    canvas.line(0.9, y, 1.1, y, { color: "muted", visible: Anim.after(trip.moveEnd) });
  canvas.line(1.0, ground, 1.0, rulerTop, { color: "muted", visible: Anim.after(trip.moveEnd) });
  canvas.label(canvas.say("altura", "height"), 1.0, ground + radius + layout.rise + 0.4, {
    color: "muted",
    visible: Anim.after(trip.moveEnd),
  });

  // The mascot glides to the launch point and shades itself into a ball.
  canvas.ring(centreX, centreY, radius, {
    color: "accent",
    fill: 0.92,
    stroke: false,
    shading: Anim.smootherRamp(trip.morphStart, trip.morphEnd),
  });
  mascotFace(canvas, trip, centreX, centreY);

  const armed = Anim.after(play - 0.5);
  canvas.arrow(ballX + 0.6, centreY, ballX + 0.6, `${centreY}+${Anim.lit(arrowScale)}*${velocity}`, {
    color: "white",
    visible: armed,
  });
  canvas.movingLabel("v", Anim.n(ballX + 0.88), `${centreY}+${Anim.lit(0.5 * arrowScale)}*${velocity}`, {
    color: "white",
    visible: armed,
  });
  canvas.arrow(ballX + 1.5, 3.7, ballX + 1.5, 2.7, { color: "muted", visible: armed });
  canvas.label("g", ballX + 1.8, 3.2, { color: "muted", visible: armed });

  // y(t) stays on or above its axis; v(t) crosses zero at the apex. Both share the ball's clock.
  const frameYT = new PremadeFrame(0, flight, -0.03 * hMax, 1.3 * hMax, 5.25, 9.35, 3.35, 5.0);
  const frameVT = new PremadeFrame(0, flight, -1.15 * v0, 1.15 * v0, 5.25, 9.35, 1.05, 2.85);
  const heightPlot = PlottedFunction.make(`${Anim.lit(v0)}*x-${Anim.lit(0.5 * g)}*x^2`);
  const velocityPlot = PlottedFunction.make(`${Anim.lit(v0)}-${Anim.lit(g)}*x`);
  if (!heightPlot || !velocityPlot) return null;
  const shown = Anim.after(trip.morphEnd);
  for (const [frame, name, f, value] of [
    [frameYT, "y(t)", heightPlot, height],
    [frameVT, "v(t)", velocityPlot, velocity],
  ] as const) {
    canvas.axes(frame, { xName: "t", yName: name, ticks: false, visible: shown, nameBeyondArrow: true });
    canvas.plot(f, frame, 0, flight, { color: "white", start: play, end, eased: true });
    canvas.line(frame.xText(cursor), frame.bottom, frame.xText(cursor), frame.top, {
      color: "muted",
      dashed: true,
      visible: shown,
    });
    canvas.dot(frame.xText(cursor), frame.yText(value), { color: "accent", visible: shown });
  }
  const late = Anim.after(play + (end - play) * 0.45);
  // Values named outside the graphs, so the sweeping cursor never crosses them.
  canvas.line(frameYT.left, frameYT.y(hMax), frameYT.x(flight / 2), frameYT.y(hMax), {
    color: "muted",
    dashed: true,
    visible: late,
  });
  canvas.label(`${canvas.say("hmáx", "hmax")} = ${canvas.number(hMax, 2)} m`, ballX, 0.55, {
    color: "muted",
    visible: late,
  });
  canvas.line(frameVT.x(flight / 2), frameVT.axisY - 0.1, frameVT.x(flight / 2), frameVT.axisY + 0.1, {
    color: "muted",
    visible: late,
  });
  canvas.label("t = v₀/g", frameVT.left - 0.1, frameVT.axisY, { anchor: "trailing", color: "muted", visible: late });

  canvas.recordSteps([0, trip.moveEnd, trip.morphEnd + 0.2, play, (play + end) / 2, end, end + 0.6]);
  return withTrip(canvas.illustration(title, Anim.duration(end + 1), [slider("v0", "v₀", v0, 4, 24)]), trip);
};

const inclinedBlock: Compiler = (params, title, language) => {
  if (!hasAnyNumber(params, ["angle", "mu", "μ", "g"])) return null;
  const angle = params.number("angle") ?? 30;
  const mu = params.number("mu") ?? params.number("μ") ?? 0.2;
  const g = params.number("g") ?? 9.8;
  if (!(angle > 0) || !(angle < 89) || !(mu >= 0) || mu > 1.2 || !(g > 0)) return null;
  const rad = (angle * Math.PI) / 180;
  const accel = inclineAcceleration(angle, mu, g);
  const showMotion = accel > 1e-6;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad); // up the slope
  const nx = -uy;
  const ny = ux; // out of the slope
  const { ax, ay, length } = inclineLayout(angle);
  const bx = ax + length * ux;
  const by = ay + length * uy;
  const blockW = 0.78;
  const blockH = 0.52;
  const startAlong = length - 0.65;
  const stopAlong = 0.7;

  const moveTimes = { play: 8.0, end: 12.5 };
  const forceTimes = [4.9, 5.8, 6.7];
  const slideTime = showMotion ? Math.min(3.5, Math.sqrt((2 * (startAlong - stopAlong)) / accel)) : 0;
  const tau = Anim.calmTime(slideTime, moveTimes.play, moveTimes.end);
  const slide = showMotion ? `(${Anim.lit(0.5 * accel)}*(${tau})*(${tau}))` : "0";

  const trip = new MascotTrip(
    { x: ax + startAlong * ux + (blockH / 2) * nx, y: ay + startAlong * uy + (blockH / 2) * ny },
    blockH / 2,
  );
  const centreX = `${trip.x}-${Anim.lit(ux)}*${slide}`;
  const centreY = `${trip.y}-${Anim.lit(uy)}*${slide}`;

  const canvas = new FigureCanvas(language);
  canvas.caption(canvas.say("Plano inclinado", "Inclined plane"), { row: 0, color: "white", visible: Anim.after(0.2) });
  const drawn = Anim.after(trip.moveStart);
  shape(
    canvas,
    [
      { x: ax - 0.3, y: ay },
      { x: bx + 0.3, y: ay },
      { x: bx + 0.3, y: ay - 0.3 },
      { x: ax - 0.3, y: ay - 0.3 },
    ],
    "0",
    "0",
    { color: "white", fill: 0.07, stroke: false, visible: drawn },
  );
  shape(
    canvas,
    [
      { x: ax, y: ay },
      { x: bx, y: ay },
      { x: bx, y: by },
    ],
    "0",
    "0",
    { color: "white", fill: 0.05, stroke: false, visible: drawn },
  );
  canvas.line(bx, ay, bx, by, { color: "muted", visible: drawn });
  canvas.line(ax - 0.3, ay, bx + 0.3, ay, { color: "muted", visible: drawn });
  canvas.line(ax, ay, bx, by, { color: "white", visible: drawn });
  canvas.line(bx - 0.18, ay, bx - 0.18, ay + 0.18, { color: "muted", visible: drawn });
  canvas.line(bx - 0.18, ay + 0.18, bx, ay + 0.18, { color: "muted", visible: drawn });
  arc(canvas, Anim.n(ax), Anim.n(ay), 0.7, 0, rad, { color: "white", visible: drawn });
  canvas.label("θ", ax + 0.98, ay + 0.2, { color: "white", visible: drawn });

  // The mascot glides to the top of the slope and its outline flows into the block, flush on the surface.
  mascotBody(canvas, trip, centreX, centreY, rotatedBox(blockW, blockH, rad));
  mascotFace(canvas, trip, centreX, centreY);

  // Free-body diagram on the right, so no force label can touch the incline or another label.
  const fx = 7.6;
  const fy = 3.95;
  const reach = 1.3;
  const tilted = rotatedBox(0.64, 0.38, rad, 0.06);
  shape(canvas, tilted, Anim.n(fx), Anim.n(fy), {
    color: "accent",
    fill: 0.92,
    stroke: false,
    visible: Anim.after(trip.morphEnd),
  });
  const surfaceX = fx - 0.19 * nx;
  const surfaceY = fy - 0.19 * ny;
  canvas.line(surfaceX - 0.8 * ux, surfaceY - 0.8 * uy, surfaceX + 0.8 * ux, surfaceY + 0.8 * uy, {
    color: "muted",
    visible: Anim.after(trip.morphEnd),
  });
  const frictionLength = reach * (showMotion ? mu * ux : uy);
  const forces: { name: string; dx: number; dy: number; color: string; time: number }[] = [
    { name: canvas.say("P", "W"), dx: 0, dy: -reach, color: "white", time: forceTimes[0]! },
    { name: "N", dx: nx * reach * ux, dy: ny * reach * ux, color: "white", time: forceTimes[1]! },
  ];
  if (frictionLength > 0.1)
    forces.push({
      name: canvas.say("Fa", "Ff"),
      dx: ux * frictionLength,
      dy: uy * frictionLength,
      color: "second",
      time: forceTimes[2]!,
    });
  for (const force of forces) {
    const size = Math.hypot(force.dx, force.dy);
    canvas.arrow(fx, fy, fx + force.dx, fy + force.dy, { color: force.color, visible: Anim.after(force.time) });
    canvas.label(force.name, fx + force.dx * (1 + 0.3 / size), fy + force.dy * (1 + 0.3 / size), {
      color: force.color,
      visible: Anim.after(force.time),
    });
  }

  const infoTime = forceTimes[2]! + 0.6;
  canvas.label("a = g(sinθ − μcosθ)", 7.6, 1.75, { color: "white", visible: Anim.after(infoTime) });
  canvas.label(`θ = ${Math.round(angle)}°`, 7.6, 1.28, { color: "muted", visible: Anim.after(infoTime) });
  if (showMotion)
    canvas.label(`a ≈ ${canvas.number(accel)} m/s²`, 7.6, 0.8, {
      color: "accent",
      visible: Anim.after(moveTimes.play),
    });
  else
    canvas.label(canvas.say("sem movimento (a ≤ 0)", "no motion (a ≤ 0)"), 7.6, 0.8, {
      color: "second",
      visible: Anim.after(infoTime),
    });

  const parameters = [slider("angle", "θ°", angle, 10, 60), slider("mu", "μ", mu, 0, 0.9)];
  canvas.recordSteps([0, trip.moveEnd, ...forceTimes, showMotion ? moveTimes.play : infoTime, moveTimes.end]);
  return withTrip(canvas.illustration(title, Anim.duration(moveTimes.end + 1), parameters), trip);
};

/** The physics scenes this port draws, by premade type. */
export const physicsFigures: Record<string, Compiler> = { motionScene, verticalThrow, inclinedBlock };
