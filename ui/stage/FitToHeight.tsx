// Port of LearnLayer/Problems/SolutionSteps.swift (FitToHeight)
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cssZoom } from "./stageScale";

/** How far the content may shrink before the stage scrolls instead (`FitToHeight.floor`). */
export const fitFloor = 0.78;

/** The scale that shows `natural` whole in `room`: 1 when it fits, never below `floor`. */
export function fitScale(natural: number, room: number, floor = fitFloor): number {
  if (!(natural > 0) || !(room > 0) || natural <= room) return 1;
  return Math.max(floor, room / natural);
}

/** A window no taller than this (in the stage's own points) is compact (`Stage.isCompact`). */
export const compactStageHeight = 420;

/**
 * The stage's floor (QuestionOverlay's `FitToHeight(floor:)`): the work never shrinks in a normal window, it scrolls;
 * in a compact one it may shrink to 0.83.
 */
export function stageFitFloor(height: number): number {
  return height <= compactStageHeight ? 0.83 : 1;
}

/**
 * Content shown whole in the window's height under it: at its own size when it fits, scaled down (to no less than
 * `floor`) when it doesn't, and scrolled with the stage only as a last resort. `bottom` is the stage's margin under it.
 */
export function FitToHeight({
  children,
  className,
  floor = fitFloor,
  bottom = 28,
  onNatural,
}: {
  children: ReactNode;
  className?: string;
  floor?: number;
  bottom?: number;
  /** Told the content's own height (the Mac's `panelHeight`), so the question above can make room for it. */
  onNatural?: (height: number) => void;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, natural: 0 });

  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    const measure = () => {
      const natural = content.offsetHeight;
      // The room from where the content starts on the stage (not where it is scrolled to) to the window's bottom.
      const stage = box.closest(".stage");
      const top = box.getBoundingClientRect().top + (stage?.scrollTop ?? 0);
      const room = window.innerHeight - top - bottom;
      // The window's pixels are larger than the content's own when the stage is zoomed (StageScale).
      const scale = fitScale(natural * cssZoom(content), room, floor);
      setFit((now) => (now.scale === scale && now.natural === natural ? now : { scale, natural }));
      onNatural?.(natural);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [floor, bottom, onNatural]);

  // Gone, it needs no room.
  useLayoutEffect(() => () => onNatural?.(0), [onNatural]);

  const scaled = fit.scale < 1;
  return (
    <div ref={outer} className={className} style={scaled ? { height: fit.natural * fit.scale } : undefined}>
      <div ref={inner} style={scaled ? { transform: `scale(${fit.scale})`, transformOrigin: "top left" } : undefined}>
        {children}
      </div>
    </div>
  );
}
