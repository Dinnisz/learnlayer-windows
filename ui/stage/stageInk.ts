// The stage's colours for a page drawn onto it (`PageInk`): white ink, and the stage's blue as the accent. With
// High Contrast (forced colours) the ink is the system's text colour, on the crop's Canvas ground.

import { InkThemes, type InkTheme, type PageColor } from "@core/pdf/pageInk";

/** An `rgb(…)` colour as the browser computes it; null for anything else. */
function computed(colour: string): PageColor | null {
  const match = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/u.exec(colour.trim());
  return match ? { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) } : null;
}

/** The ink for a crop drawn in `element`, its accent read from `--stage-accent` (the blue of light or dark mode). */
export function stageInk(element: Element): InkTheme {
  const style = getComputedStyle(element);
  const theme = InkThemes.dark(style.getPropertyValue("--stage-accent").trim() || "#0a84ff");
  if (window.matchMedia?.("(forced-colors: active)").matches) {
    const text = computed(style.color);
    if (text) return { ...theme, ink: text };
  }
  return theme;
}
