// Port of LearnLayerTests/NotchGlyphTests.swift @ ref 2026-11-04
// (`theIslandPicksOneModeFromTheLiveActivity`, `theSpeechActivityKeepsTheLastFiveLevels` and
// `muteFlipsTheVoiceSwitchInSettings` need SpeechActivity, ported with the voice code in phase 5.)

import { describe, expect, it } from "vitest";
import pt from "../i18n/locales/pt-PT.json";
import { notchCatalog } from "./notchAction";
import { barCount, NotchLayout, WaveformLevels } from "./notchLayout";

const strings: Record<string, unknown> = pt;

describe("glyph catalog", () => {
  it("the glyph row is six glyphs in the agreed order", () => {
    const rows = notchCatalog({ offersAnywhere: false });
    expect(rows.map((row) => row.id)).toEqual([
      "captureScreen",
      "openWindow",
      "captureArea",
      "explainSelection",
      "documents",
      "memory",
    ]);
    expect(rows.map((row) => row.symbol)).toEqual([
      "camera.viewfinder",
      "macwindow",
      "viewfinder",
      "text.cursor",
      "folder",
      "point.3.connected.trianglepath.dotted",
    ]);
  });

  it("open window is among the glyphs", () => {
    expect(notchCatalog().find((row) => row.id === "openWindow")?.labelKey).toBe("Open window");
    expect(notchCatalog().at(-1)?.id).toBe("memory");
  });

  it("every glyph label is in both languages without Brazilian forms", () => {
    const rows = [
      ...notchCatalog(),
      ...notchCatalog({ offersAnywhere: false }),
      ...notchCatalog({ exerciseOpen: true }),
    ];
    const keys = new Set([...rows.map((row) => row.labelKey), "Mute", "Unmute", "Stop", "Speaking…", "Listening…"]);
    const brazilian = ["tela", "você", "usuário", "arquivo", "salvar", "configurações", "mouse", "celular", "deletar"];
    for (const key of keys) {
      const value = strings[key];
      expect(typeof value, `“${key}” is missing from the String Catalog`).toBe("string");
      const text = value as string;
      expect(text !== "" && (text !== key || key === "Stop"), `“${key}” is not translated`).toBe(true);
      for (const word of brazilian) {
        expect(text.toLowerCase().includes(word), `“${key}” reads Brazilian: ${word}`).toBe(false);
      }
    }
  });

  it("the notch words are European Portuguese", () => {
    expect(strings["Speaking…"]).toBe("A falar…");
    expect(strings["Listening…"]).toBe("A ouvir…");
    expect(strings["Open window"]).toBe("Abrir janela");
    expect(strings["Stop"]).toBe("Parar");
    expect(strings["Mute"]).toBe("Silenciar");
    expect(strings["Documents"]).toBe("Documentos");
    expect(strings["Memory"]).toBe("Memória");
    expect(strings["Capture the screen"]).toBe("Capturar o ecrã");
  });
});

describe("layout", () => {
  it("the open row is one compact row", () => {
    expect(NotchLayout.expandedDepth("hover", 0)).toBe(40);
    expect(NotchLayout.expandedDepth("exercise", 0)).toBe(40);
    expect(NotchLayout.expandedDepth("speaking", 0)).toBe(40);
    expect(NotchLayout.expandedDepth("listening", 0)).toBe(0);
    expect(NotchLayout.expandedDepth("idle", 0)).toBe(0);
  });

  it("follow-ups add up to three text rows below the glyph row", () => {
    expect(NotchLayout.expandedDepth("exercise", 1)).toBe(78);
    expect(NotchLayout.expandedDepth("exercise", 3)).toBe(134);
    expect(NotchLayout.expandedDepth("exercise", 9)).toBe(NotchLayout.expandedDepth("exercise", 3));
    expect(NotchLayout.expandedDepth("speaking", 3)).toBe(40);
  });
});

describe("waveform", () => {
  it("silence is the shortest bar and loud is the tallest", () => {
    expect(WaveformLevels.height(0)).toBe(WaveformLevels.minHeight);
    expect(WaveformLevels.height(1)).toBe(WaveformLevels.maxHeight);
    expect(WaveformLevels.height(5)).toBe(WaveformLevels.maxHeight);
    expect(WaveformLevels.height(-1)).toBe(WaveformLevels.minHeight);
    expect(WaveformLevels.height(Number.NaN)).toBe(WaveformLevels.minHeight);
  });

  it("the meter band is stretched over the bar height", () => {
    // 0.15 and below is the floor, 0.9 and above is full, in between is linear.
    expect(WaveformLevels.height(0.15)).toBe(WaveformLevels.minHeight);
    expect(WaveformLevels.height(0.9)).toBe(WaveformLevels.maxHeight);
    expect(WaveformLevels.height(0.525)).toBeCloseTo(11, 10);
    expect(WaveformLevels.height(0.4)).toBeLessThan(WaveformLevels.height(0.7));
  });

  it("the waveform is bigger than before and fits the pill", () => {
    expect(WaveformLevels.maxHeight).toBeGreaterThanOrEqual(16);
    expect(WaveformLevels.maxHeight).toBeLessThanOrEqual(18);
    expect(WaveformLevels.barSpacing).toBeGreaterThan(2);
    expect(WaveformLevels.barWidth).toBeGreaterThan(3);
    const width = WaveformLevels.totalWidth();
    expect(width).toBe(32);
    expect(width / 23).toBeGreaterThanOrEqual(1.3);
    expect(width / 23).toBeLessThanOrEqual(1.6);
    expect(Math.max(...WaveformLevels.frozenHeights)).toBe(WaveformLevels.maxHeight);
    expect(WaveformLevels.frozenHeights).toHaveLength(barCount);
  });

  it("heights are five bars, oldest first, padded with silence", () => {
    const heights = WaveformLevels.heights([0, 0.525, 1]);
    expect(heights).toHaveLength(5);
    expect(heights.map((height) => Math.round(height * 1e9) / 1e9)).toEqual([4, 4, 4, 11, 18]);
    expect(WaveformLevels.heights([1, 1, 1, 1, 1, 0])).toEqual([18, 18, 18, 18, 4]);
  });

  it("reduced-motion bars keep a fixed shape and pulse in opacity", () => {
    expect(WaveformLevels.frozenHeights).toHaveLength(barCount);
    expect(WaveformLevels.opacity(0)).toBe(0.45);
    expect(WaveformLevels.opacity(1)).toBe(1);
  });
});
