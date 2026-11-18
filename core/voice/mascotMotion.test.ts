// Port of LearnLayerTests/MascotMotionTests.swift @ ref 2026-11-04 (the sphere's cases: easing, trips, the size that
// follows the voice, blinking, feedback, confetti, the resting frame). The pen and arrow cases are not ported: the
// body never takes those shapes.

import { describe, expect, it } from "vitest";
import {
  MascotBodyState,
  MascotConfetti,
  MascotKinematics,
  SmoothPoint,
  SmoothValue,
  VoiceMascot,
  type MascotPresence,
} from "./mascotMotion";

const settle = (point: SmoothPoint, goal: { x: number; y: number }, smoothTime: number, seconds: number) => {
  const speeds: number[] = [];
  for (let frame = 0; frame < seconds * 60; frame += 1) {
    point.advance(goal, smoothTime, 1 / 60);
    speeds.push(point.speed);
  }
  return speeds;
};

describe("how the mascot moves", () => {
  it("a value eases to its target and never passes it", () => {
    const value = new SmoothValue(0);
    let last = 0;
    for (let frame = 0; frame < 60 * 4; frame += 1) {
      value.advance(100, 0.3, 1 / 60);
      expect(value.value).toBeGreaterThanOrEqual(last - 1e-9);
      expect(value.value).toBeLessThanOrEqual(100 + 1e-9);
      last = value.value;
    }
    expect(Math.abs(value.value - 100)).toBeLessThan(0.5);
  });

  it("a point speeds up then slows down", () => {
    const point = new SmoothPoint({ x: 0, y: 0 });
    const speeds = settle(point, { x: 200, y: 0 }, 0.3, 5);
    const peak = Math.max(...speeds);
    expect(peak).toBeGreaterThan(0);
    expect(speeds[0]!).toBeLessThan(peak * 0.2);
    const peakAt = speeds.indexOf(peak);
    expect(peakAt).toBeGreaterThan(5);
    expect(peakAt).toBeLessThan(speeds.length - 5);
    expect(speeds[speeds.length - 1]!).toBeLessThan(0.5);
    expect(Math.abs(point.position.x - 200)).toBeLessThan(0.5);
    expect(Math.abs(point.position.y)).toBeLessThan(1e-9);
  });

  it("a trip across the page takes more than a second, and farther is faster but not much longer", () => {
    const seconds = (distance: number) => {
      const point = new SmoothPoint({ x: 0, y: 0 });
      const smooth = MascotKinematics.travelSmoothTime(distance);
      for (let frame = 1; frame <= 600; frame += 1) {
        point.advance({ x: distance, y: 0 }, smooth, 1 / 60);
        if (point.position.x >= distance * 0.95) return frame / 60;
      }
      return Infinity;
    };
    const near = seconds(80);
    const far = seconds(700);
    expect(far).toBeGreaterThan(1);
    expect(far).toBeLessThan(4);
    expect(far).toBeLessThan(near * 2);
    expect(MascotKinematics.travelSmoothTime(500)).toBeGreaterThan(MascotKinematics.travelSmoothTime(50));
    expect(MascotKinematics.travelSmoothTime(1e9)).toBeLessThanOrEqual(0.44);
    expect(MascotKinematics.travelSmoothTime(NaN)).toBe(MascotKinematics.travelSmoothTime(0));
  });

  it("the body size follows the voice without jumping", () => {
    const frame = (presence: MascotPresence, level: number) =>
      VoiceMascot.frame({ presence, level, reduceMotion: false });
    const state = new MascotBodyState();
    let time = 1000;
    state.advance(frame("idle", 0), time);
    let last = state.advance(frame("idle", 0), time + 1 / 60).radiusFactor;
    // Idle to a loud listening frame: the size glides, with no frame-to-frame jump.
    let biggest = 0;
    for (let index = 0; index < 120; index += 1) {
      time += 1 / 60;
      const look = state.advance(frame("listening", index % 2 === 0 ? 1 : 0), time);
      biggest = Math.max(biggest, Math.abs(look.radiusFactor - last));
      last = look.radiusFactor;
    }
    expect(biggest).toBeLessThan(0.05);
    expect(VoiceMascot.radiusFactor("listening", NaN, 0)).toBe(0.48);
    expect(VoiceMascot.radiusFactor("speaking", 9, 0)).toBe(0.8);

    const floating = new MascotBodyState();
    floating.advance(frame("idle", 0), 5);
    floating.advance(frame("thinking", 0), 5.02);
    const look = floating.advance(frame("thinking", 0), 5.04);
    expect(look.idle).toBeGreaterThan(0.8);
    expect(look.idle).toBeLessThan(1);
    expect(look.thinking).toBeGreaterThan(0);
    expect(look.thinking).toBeLessThan(0.2);
  });

  it("the body blinks often enough to be noticed and briefly enough to be natural", () => {
    expect(Math.abs(MascotKinematics.blink(0.09) - 1)).toBeLessThan(1e-9);
    expect(MascotKinematics.blink(1)).toBe(0);
    expect(Math.abs(MascotKinematics.blink(4.6 + 0.09) - 1)).toBeLessThan(1e-6);
    let shut = 0;
    for (let step = 0; step < 4600; step += 1) if (MascotKinematics.blink(step / 1000) > 0) shut += 1;
    expect(shut).toBeGreaterThan(100);
    expect(shut).toBeLessThan(300);
  });

  it("feedback moves once and settles", () => {
    expect(MascotKinematics.hop(-1)).toBe(0);
    expect(MascotKinematics.hop(0.225)).toBeGreaterThan(3);
    expect(MascotKinematics.hop(1)).toBe(0);
    let tallest = 0;
    for (let step = 0; step < 100; step += 1) tallest = Math.max(tallest, MascotKinematics.hop(step / 100));
    expect(tallest).toBeLessThanOrEqual(7);
    expect(tallest).toBeGreaterThan(3);

    let early = 0;
    let late = 0;
    for (let step = 0; step < 30; step += 1) early = Math.max(early, Math.abs(MascotKinematics.shake(step / 100)));
    for (let step = 80; step < 110; step += 1) late = Math.max(late, Math.abs(MascotKinematics.shake(step / 100)));
    expect(early).toBeGreaterThan(late);
    expect(early).toBeLessThanOrEqual(3);
    expect(MascotKinematics.shake(2)).toBe(0);

    expect(MascotKinematics.bulb(0)).toBe(0);
    expect(MascotKinematics.bulb(0.3)).toBe(1);
    expect(MascotKinematics.bulb(2)).toBe(1);
  });

  it("confetti is thrown up and fades out", () => {
    const fresh = MascotConfetti.particles(0);
    expect(fresh).toHaveLength(MascotConfetti.count);
    expect(fresh.every((piece) => piece.x === 0 && piece.y === 0 && piece.alpha === 1)).toBe(true);
    const later = MascotConfetti.particles(0.6);
    expect(later.every((piece) => piece.alpha < 1 && piece.alpha > 0)).toBe(true);
    expect(later.some((piece) => piece.y < 0)).toBe(true);
    expect(MascotConfetti.particles(MascotConfetti.lifetime)).toEqual([]);
    expect(MascotConfetti.particles(-1)).toEqual([]);
    expect(new Set(fresh.map((piece) => piece.tone)).size).toBe(4);
  });

  it("the frame rests small, and a cue or a pointing body is full size", () => {
    const idle = VoiceMascot.frame({ presence: "idle", level: 0, reduceMotion: false });
    expect(VoiceMascot.bodyScale(idle)).toBe(MascotKinematics.restScale);
    const speaking = VoiceMascot.frame({ presence: "speaking", level: 0.5, pointing: true, reduceMotion: false });
    expect(VoiceMascot.bodyScale(speaking)).toBe(1);
    expect(speaking.expression).toBe("focused");
    const cheering = VoiceMascot.frame({ presence: "idle", level: 0, transient: "correct", reduceMotion: false });
    expect(VoiceMascot.bodyScale(cheering)).toBe(1);
    expect(VoiceMascot.frame({ presence: "idle", level: 0, transient: "wrong", reduceMotion: true }).expression).toBe(
      "curious",
    );
    expect(VoiceMascot.frame({ presence: "idle", level: 0, reduceMotion: true }).animates).toBe(false);
  });
});
