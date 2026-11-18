// Port of voicedExplanationsAreCountedPerMonth (LearnLayerTests/CostSavingsTests.swift @ ref 2026-11-04).

import { describe, expect, it } from "vitest";
import { VoiceMeter, type MeterStore } from "./voiceMeter";

const memory = (): MeterStore => {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) };
};

describe("the voiced explanations", () => {
  it("are counted per month", () => {
    const meter = new VoiceMeter(memory());
    const october = new Date(1_792_000_000 * 1000);
    const november = new Date(october.getTime() + 40 * 86_400_000);
    expect(meter.voicedExplanations(october)).toBe(0);
    meter.recordVoicedExplanation(october);
    meter.recordVoicedExplanation(october);
    meter.recordVoicedExplanation(november);
    expect(meter.voicedExplanations(october)).toBe(2);
    expect(meter.voicedExplanations(november)).toBe(1);
    expect(meter.monthKey(october)).toBe("2026-10");
  });

  it("keep a year, and a damaged store counts nothing", () => {
    const store = memory();
    const meter = new VoiceMeter(store);
    for (let month = 0; month < 14; month += 1) meter.recordVoicedExplanation(new Date(Date.UTC(2025, month, 15)));
    expect(Object.keys(JSON.parse(store.getItem(VoiceMeter.storageKey)!) as object)).toHaveLength(12);
    expect(meter.voicedExplanations(new Date(Date.UTC(2025, 0, 15)))).toBe(0);
    store.setItem(VoiceMeter.storageKey, "not json");
    expect(meter.voicedExplanations()).toBe(0);
  });
});
