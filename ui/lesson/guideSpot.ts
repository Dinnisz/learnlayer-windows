// Where the mascot waits while it walks the steps (the Mac's `MascotGuide.spot` reported by StatementUnderlines): beside
// the datum of the step it is on, level with it, covering no words. Set by the question's crop, read by the mascot.
// The figure can set a spot too (MascotFigureFocus): just above the part of the figure the step adds. That one wins
// while it is set, as the Mac's `stepTarget` takes the figure focus first; it is a place for the one body to go, never
// a second body. A voice mark being said wins over both (VoiceMascotExerciseOverlay: the voice's perch is the active
// target, the step's only shows while no voice mark calls it): just above the ring or the line on the spoken formula.

export interface GuideSpot {
  /** The sphere's centre, in the window's pixels. */
  x: number;
  y: number;
}

let crop: GuideSpot | null = null;
let figure: GuideSpot | null = null;
let voice: GuideSpot | null = null;
let spot: GuideSpot | null = null;
const listeners = new Set<() => void>();

function update(): void {
  const next = voice ?? figure ?? crop;
  if (spot?.x === next?.x && spot?.y === next?.y) return;
  spot = next;
  for (const listener of [...listeners]) listener();
}

export const GuideSpots = {
  get: () => spot,
  /** The spot beside the step's datum in the question. */
  set(next: GuideSpot | null): void {
    crop = next;
    update();
  },
  /** The spot above the step's part of the figure; null when the step has nothing in it. */
  setFigure(next: GuideSpot | null): void {
    figure = next;
    update();
  },
  /** The spot above the voice's mark on the formula it writes (`OrbAim`); null when no mark is lit. */
  setVoice(next: GuideSpot | null): void {
    voice = next;
    update();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
