// Port of `WaveformLevels` and `NotchLayout` in LearnLayer/Notch/SpeechActivity.swift @ ref 2026-11-04

import type { NotchMode } from "./notchMode";

/** `SpeechActivity.barCount`. */
export const barCount = 5;

/** Pure numbers behind the waveform, so they can be tested. */
export const WaveformLevels = {
  minHeight: 4,
  maxHeight: 18,
  barWidth: 4,
  barSpacing: 3,

  /** Width of the whole waveform for `count` bars. */
  totalWidth(count: number = barCount): number {
    return count * this.barWidth + Math.max(0, count - 1) * this.barSpacing;
  },

  /**
   * Speech playback sits between about 0.4 and 0.9 on the meter and silence at 0, so the curve stretches
   * that band over the whole bar height: otherwise every bar of a loud clip looks full.
   */
  shaped(level: number): number {
    if (!Number.isFinite(level)) return 0;
    return Math.min(1, Math.max(0, (level - 0.15) / 0.75));
  },

  height(level: number): number {
    return this.minHeight + (this.maxHeight - this.minHeight) * this.shaped(level);
  },

  /** One height per bar, oldest level on the left. */
  heights(history: readonly number[], count: number = barCount): number[] {
    return this.padded(history, count).map((level) => this.height(level));
  },

  padded(history: readonly number[], count: number = barCount): number[] {
    const kept = count > 0 ? history.slice(-count) : [];
    return [...new Array<number>(Math.max(0, count - history.length)).fill(0), ...kept];
  },

  /** With reduced motion the bars keep a fixed shape and only their opacity follows the level. */
  frozenHeights: [8, 13, 18, 13, 8] as readonly number[],

  opacity(level: number): number {
    return 0.45 + 0.55 * this.shaped(level);
  },
};

/** How tall the open pill is, for each thing it can show. */
export const NotchLayout = {
  rowHeight: 40,
  followUpHeight: 28,
  followUpPadding: 10,

  /** The part that opens below the pill. Listening stays in the pill itself. */
  expandedDepth(mode: NotchMode, followUps: number): number {
    switch (mode) {
      case "hover":
      case "exercise": {
        const extra = Math.min(3, Math.max(0, followUps));
        return this.rowHeight + (extra > 0 ? this.followUpPadding + extra * this.followUpHeight : 0);
      }
      case "speaking":
        return this.rowHeight;
      default:
        return 0;
    }
  },
};
