// Port of LearnLayer/Notch/NotchPillView.swift and the hover logic of NotchPillController.swift
// @ ref 2026-11-04. On Windows there is no notch: the pill is the whole shape. On a Mac with a notch the pill wraps
// it: black ears either side of the notch, flush with the screen's top edge (`NotchPillController.earWidth`).

import { useEffect, useMemo, useRef, useState } from "react";
import { notchCatalog, type NotchAction } from "@core/notch/notchAction";
import { NotchLayout, WaveformLevels } from "@core/notch/notchLayout";
import { announcementKey, resolveNotchMode } from "@core/notch/notchMode";
import { Icon } from "../../components/Icon";
import { useT } from "../../i18n";
import { emptyIsland, onIsland, sendIslandCommand, type IslandSnapshot } from "../../island";
import {
  anywhereEnabled,
  captureArea,
  explainSelectionInFront,
  onAnywhereHookRemoved,
  pillNotch,
  resizePill,
  type PillNotch,
  setAnywhereEnabled,
  setTalkKey,
  showMain,
  talkKeyChoice,
} from "../../native";

/** Settings › General › Voice off: the pill shows the speaker struck through. */
function voiceMuted(): boolean {
  try {
    return localStorage.getItem("voiceEnabled") === "0";
  } catch {
    return false;
  }
}

/** At rest (CLAUDE.md §7). The window is this size plus a small gap above, so it reads as a pill. */
export const pillMetrics = { width: 180, height: 32, topGap: 4, openWidth: 264 };

/** Each ear beside a Mac's notch (`NotchPillController.earWidth`). */
export const notchEarWidth = 110;

/** The pill's size: Windows' (and a Mac screen without a notch), or wrapped around a real notch. */
export function pillShape(notch: PillNotch | null): typeof pillMetrics & { inNotch: boolean } {
  if (!notch?.real) return { ...pillMetrics, inNotch: false };
  const width = Math.round(notch.width + 2 * notchEarWidth);
  return {
    width,
    height: Math.round(notch.height),
    topGap: 0,
    openWidth: Math.max(width, pillMetrics.openWidth),
    inNotch: true,
  };
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Pill() {
  const t = useT();
  const [island, setIsland] = useState<IslandSnapshot>(() => ({
    ...emptyIsland,
    offersAnywhere: !anywhereEnabled(),
    muted: voiceMuted(),
  }));
  const [isExpanded, setExpanded] = useState(false);
  const [notch, setNotch] = useState<PillNotch | null>(null);
  const collapse = useRef<number | undefined>(undefined);
  const shape = pillShape(notch);

  useEffect(() => {
    let cancelled = false;
    void pillNotch().then((found) => {
      if (cancelled) return;
      setNotch(found);
      document.body.classList.toggle("in-notch", Boolean(found?.real));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    void onIsland((change) => setIsland((current) => ({ ...current, ...change }))).then((unlisten) =>
      cancelled ? unlisten() : (stop = unlisten),
    );
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  // Alt-click as Settings left it; if Windows takes the hook away, the pill offers to turn it on again.
  useEffect(() => {
    void setAnywhereEnabled(anywhereEnabled());
    void setTalkKey(talkKeyChoice());
    let stop = () => {};
    let cancelled = false;
    void onAnywhereHookRemoved(() => setIsland((current) => ({ ...current, offersAnywhere: true }))).then((unlisten) =>
      cancelled ? unlisten() : (stop = unlisten),
    );
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  const mode = resolveNotchMode({
    listening: island.listening,
    speaking: island.speaking,
    exerciseOpen: island.exerciseOpen,
    hovering: isExpanded,
  });
  const depth = isExpanded ? NotchLayout.expandedDepth(mode, island.followUps.length) : 0;
  const width = depth > 0 ? shape.openWidth : shape.width;

  // Grow the window first so the content has room; shrink it after the spring has settled.
  useEffect(() => {
    const size = { width, height: shape.topGap + shape.height + depth };
    if (depth > 0 || reducedMotion()) {
      void resizePill(size.width, size.height);
      return;
    }
    const timer = window.setTimeout(() => void resizePill(size.width, size.height), 380);
    return () => window.clearTimeout(timer);
  }, [width, depth, shape.topGap, shape.height]);

  /** Opens on hover; closes a moment after the pointer leaves, so moving down into the options doesn't close it. */
  const hover = (inside: boolean) => {
    window.clearTimeout(collapse.current);
    if (inside) setExpanded(true);
    else collapse.current = window.setTimeout(() => setExpanded(false), 350);
  };

  // On a Mac the web view sees no pointer while another app is in front; the window tells the page (NotchPill.swift).
  useEffect(() => {
    const onNativeHover = (event: Event) => {
      window.clearTimeout(collapse.current);
      if ((event as CustomEvent<boolean>).detail) setExpanded(true);
      else collapse.current = window.setTimeout(() => setExpanded(false), 350);
    };
    window.addEventListener("ll-pill-hover", onNativeHover);
    return () => window.removeEventListener("ll-pill-hover", onNativeHover);
  }, []);

  const close = () => {
    window.clearTimeout(collapse.current);
    setExpanded(false);
  };

  const actions = useMemo(
    () =>
      notchCatalog(
        {
          offersAnywhere: island.offersAnywhere,
          hasReaderSelection: island.hasReaderSelection,
          exerciseOpen: island.exerciseOpen,
        },
        {
          captureScreen: () => {
            // With Alt-click on, «Capture the screen» freezes the screen to drag the question's area on.
            if (!island.offersAnywhere) return void captureArea();
            // «Turn on Alt-click in any app»: the student asked for it, so a switch left off goes back on.
            void setAnywhereEnabled(true);
            setIsland((current) => ({ ...current, offersAnywhere: false }));
          },
          captureArea: () => void captureArea(),
          // The reader's own selection when it has one (it answers the command), else the app in front's.
          explainSelection: () =>
            void (island.hasReaderSelection
              ? sendIslandCommand({ kind: "explainSelection" })
              : explainSelectionInFront()),
          openWindow: () => void showMain(null),
          openDocuments: () => void showMain("documents"),
          openMemory: () => void showMain("memory"),
          askAboutExercise: () => void sendIslandCommand({ kind: "askAboutExercise" }),
        },
      ),
    [island.offersAnywhere, island.hasReaderSelection, island.exerciseOpen],
  );

  const announcement = announcementKey(mode);

  return (
    <div
      className={["pill", depth > 0 ? "open" : "", shape.inNotch ? "notch" : ""].filter(Boolean).join(" ")}
      style={{ width, height: shape.height + depth }}
      onMouseEnter={() => hover(true)}
      onMouseLeave={() => hover(false)}
    >
      <div className="pill-ears" style={{ height: shape.height }}>
        <div className="pill-ear left">
          {mode === "listening" ? (
            <>
              <Icon symbol="mic.fill" size={12} className="pill-accent" />
              <span className="pill-quiet">{t("Listening…")}</span>
            </>
          ) : mode === "speaking" ? (
            <span className="pill-quiet">{t("Speaking…")}</span>
          ) : (
            <>
              {island.exerciseOpen ? <span className="pill-dot" /> : null}
              {island.subject ? <span title={t("Subject: %@", island.subject)}>{island.subject}</span> : null}
            </>
          )}
        </div>
        <div className="pill-ear right">
          {mode === "listening" || mode === "speaking" ? <WaveformBars levels={island.levels} /> : null}
        </div>
      </div>

      {depth > 0 && (mode === "hover" || mode === "exercise") ? (
        <div className="pill-options">
          <div className="pill-glyphs" role="toolbar" aria-label={t("LearnLayer actions")}>
            {actions.map((action) => (
              <GlyphButton key={action.id} action={action} onDone={close} />
            ))}
          </div>
          {island.followUps.slice(0, 3).map((followUp) => (
            <button
              key={followUp}
              type="button"
              className="pill-follow-up"
              onClick={() => {
                void sendIslandCommand({ kind: "ask", question: followUp });
                close();
              }}
            >
              <Icon symbol="arrow.turn.down.right" size={12} />
              <span>{followUp}</span>
            </button>
          ))}
        </div>
      ) : null}

      {depth > 0 && mode === "speaking" ? (
        <div className="pill-options">
          <div className="pill-glyphs">
            <GlyphButton
              action={{
                id: "openWindow",
                symbol: island.muted ? "speaker.slash" : "speaker.wave.2",
                labelKey: island.muted ? "Unmute" : "Mute",
                isEnabled: true,
                isPrimary: false,
                perform: () => void sendIslandCommand({ kind: "toggleMute" }),
              }}
            />
            <GlyphButton
              action={{
                id: "openWindow",
                symbol: "stop.fill",
                labelKey: "Stop",
                isEnabled: true,
                isPrimary: false,
                perform: () => void sendIslandCommand({ kind: "stopSpeaking" }),
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Narrator hears the state the waveform only shows. */}
      <span className="visually-hidden" role="status" aria-live="polite">
        {announcement ? t(announcement) : ""}
      </span>
    </div>
  );
}

/** One glyph of the open pill: a small blue icon with a tooltip and a plate that answers the pointer. */
function GlyphButton({ action, onDone }: { action: NotchAction; onDone?: () => void }) {
  const t = useT();
  const label = t(action.labelKey);
  return (
    <>
      {action.id === "documents" ? <span className="pill-separator" aria-hidden="true" /> : null}
      <button
        type="button"
        className={action.isPrimary ? "pill-glyph primary" : "pill-glyph"}
        disabled={!action.isEnabled}
        title={label}
        aria-label={label}
        onClick={() => {
          action.perform();
          onDone?.();
        }}
      >
        <Icon symbol={action.symbol} size={16} />
      </button>
    </>
  );
}

/** Five rounded bars that follow the audio level. Reduced motion: fixed bars whose opacity pulses. */
export function WaveformBars({ levels }: { levels: readonly number[] }) {
  const still = reducedMotion();
  const heights = still ? WaveformLevels.frozenHeights : WaveformLevels.heights(levels);
  const padded = WaveformLevels.padded(levels, heights.length);
  return (
    <span
      className="waveform"
      style={{ height: WaveformLevels.maxHeight, gap: WaveformLevels.barSpacing }}
      aria-hidden="true"
    >
      {heights.map((height, index) => (
        <span
          key={index}
          style={{
            width: WaveformLevels.barWidth,
            height,
            opacity: still ? WaveformLevels.opacity(padded[index] ?? 0) : 1,
          }}
        />
      ))}
    </span>
  );
}
