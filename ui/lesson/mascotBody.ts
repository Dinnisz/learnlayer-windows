// The stage's one mascot body, as the Mac's MascotController shares it: where it rests (`restingCenter`, in the
// window's pixels), so a figure's sphere sets off from there (MascotStart), and whether a figure's sphere is that body
// out on its trip (`figureHoldsBody`), while which the stage keeps its own body hidden.

export interface BodyPoint {
  x: number;
  y: number;
}

let resting: BodyPoint | null = null;
/** The figures whose sphere is the body on a trip now: the body is held while any is. */
const holders = new Set<string>();
let held = false;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of [...listeners]) listener();
};

export const MascotBody = {
  resting: () => resting,
  held: () => held,
  setResting(next: BodyPoint | null): void {
    if (next?.x === resting?.x && next?.y === resting?.y) return;
    resting = next;
    notify();
  },
  /** `holder` (a figure) has the body on a trip, or no longer has it. */
  hold(holder: string, holds: boolean): void {
    if (holds) holders.add(holder);
    else holders.delete(holder);
    const next = holders.size > 0;
    if (next === held) return;
    held = next;
    notify();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
