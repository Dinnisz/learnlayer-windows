// Port of LearnLayer/Voice/VoiceMeter.swift @ ref 2026-11-04: how many explanations the premium voice read, by month,
// for Settings › AI & Usage ("Voiced this month"). They are not part of the plan's explanation count. A year is kept.

/** Where the counts are kept: `localStorage` in the app, a map in the tests. */
export interface MeterStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class VoiceMeter {
  static readonly storageKey = "voicedExplanationsByMonth";

  constructor(private readonly store: MeterStore) {}

  /** "2026-10", in UTC (Gregorian, so a month never splits in two). */
  monthKey(date: Date): string {
    return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  voicedExplanations(date: Date = new Date()): number {
    return this.counts()[this.monthKey(date)] ?? 0;
  }

  recordVoicedExplanation(date: Date = new Date()): void {
    const counts = this.counts();
    const key = this.monthKey(date);
    counts[key] = (counts[key] ?? 0) + 1;
    // Keep a year, so the store cannot grow without end.
    for (const old of Object.keys(counts).sort().slice(0, -12)) delete counts[old];
    try {
      this.store.setItem(VoiceMeter.storageKey, JSON.stringify(counts));
    } catch {
      // Not counted when nothing can be kept.
    }
  }

  private counts(): Record<string, number> {
    try {
      const parsed: unknown = JSON.parse(this.store.getItem(VoiceMeter.storageKey) ?? "{}");
      if (!parsed || typeof parsed !== "object") return {};
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(
          (entry): entry is [string, number] => typeof entry[1] === "number",
        ),
      );
    } catch {
      return {};
    }
  }
}
