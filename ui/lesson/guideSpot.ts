// Where the mascot waits while it walks the steps (the Mac's `MascotGuide.spot` reported by StatementUnderlines): beside
// the datum of the step it is on, level with it, covering no words. Set by the question's crop, read by the mascot.

export interface GuideSpot {
  /** The sphere's centre, in the window's pixels. */
  x: number;
  y: number;
}

let spot: GuideSpot | null = null;
const listeners = new Set<() => void>();

export const GuideSpots = {
  get: () => spot,
  set(next: GuideSpot | null): void {
    if (spot?.x === next?.x && spot?.y === next?.y) return;
    spot = next;
    for (const listener of [...listeners]) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
