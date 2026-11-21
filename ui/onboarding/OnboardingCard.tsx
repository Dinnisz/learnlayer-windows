// Port of LearnLayer/Onboarding/OnboardingView.swift, OnboardingScreens.swift and OnboardingModel.swift
// @ ref 2026-11-04: the first-run card, one idea per screen, one big button. On Windows it sits over the main window
// (the window opens at launch); the permissions screen is only on a Mac (core/onboarding), where the keycaps are
// ⌃ and ⌥ instead of Ctrl, Win and Alt (Mac report M5).

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { PlanDefaults } from "@core/account/accountModel";
import { examQuestionFromScreen, ScreenQuestions } from "@core/anywhere/screenQuestion";
import type { Language } from "@core/i18n";
import {
  onboardingChoiceKeys,
  onboardingClip,
  OnboardingPresentation,
  type OnboardingCoordinator,
  type OnboardingStep,
} from "@core/onboarding/onboarding";
import { QuestionSession } from "@core/problems/questionSession";
import { useAccount } from "../account/accountStore";
import {
  AnimatedMascot,
  mascotColorKey,
  mascotColors,
  storedMascotColor,
  type MascotColor,
} from "../components/Mascot";
import { LocalizationProvider, useLanguage, usePlatformName, useT } from "../i18n";
import {
  onTalkKey,
  openMicrophoneSettings,
  requestPermission,
  systemPermissions,
  type SystemPermissions,
} from "../native";
import { sessionServices, Stage, type StageSource } from "../stage/Stage";
import { Recorder } from "../voice/recorder";
import { playClip } from "../voice/speaker";

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Kept for this launch only.
  }
};

export const onboardingMutedKey = "onboarding.muted";
export const sampleQuestion = "A car goes from 0 to 20 m/s in 5 s. What is its acceleration?";

interface Voice {
  level: number;
  speaking: boolean;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  play: (clip: OnboardingStep | "talkReply", delay?: number) => void;
}

/** The screen's recorded line, its loudness for the mascot, and the mute that is remembered (OnboardingVoice). */
function useVoice(language: "pt" | "en"): Voice {
  const platform = usePlatformName();
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMutedState] = useState(() => read(onboardingMutedKey) === "1");
  const playing = useRef<AbortController | null>(null);
  const stop = useCallback(() => {
    playing.current?.abort();
    playing.current = null;
    setSpeaking(false);
    setLevel(0);
  }, []);
  const play = useCallback(
    (clip: OnboardingStep | "talkReply", delay = 0) => {
      stop();
      const path = onboardingClip(clip, language, platform);
      if (!path || read(onboardingMutedKey) === "1") return;
      const controller = new AbortController();
      playing.current = controller;
      window.setTimeout(() => {
        if (controller.signal.aborted) return;
        setSpeaking(true);
        void playClip(path, { onLevel: setLevel, signal: controller.signal }).finally(() => {
          if (playing.current === controller) {
            setSpeaking(false);
            setLevel(0);
          }
        });
      }, delay);
    },
    [language, platform, stop],
  );
  useEffect(() => stop, [stop]);
  return {
    level,
    speaking,
    muted,
    setMuted: (next) => {
      write(onboardingMutedKey, next ? "1" : "0");
      setMutedState(next);
      if (next) stop();
    },
    play,
  };
}

export function OnboardingCard({ coordinator }: { coordinator: OnboardingCoordinator }) {
  const state = useSyncExternalStore(
    (listener) => coordinator.subscribe(listener),
    () => coordinator.state,
  );
  const appLanguage = useLanguage();
  const [language, setLanguage] = useState<"pt" | "en">(() => {
    const stored = read("appLanguage");
    if (stored) return stored.startsWith("pt") ? "pt" : "en";
    return appLanguage === "pt-PT" ? "pt" : OnboardingPresentation.initialLanguage(navigator.languages ?? []);
  });
  const shown: Language = language === "pt" ? "pt-PT" : "en";
  const platform = usePlatformName();
  return (
    <LocalizationProvider language={shown} platform={platform}>
      <CardBody coordinator={coordinator} step={state.current} language={language} setLanguage={setLanguage} />
    </LocalizationProvider>
  );
}

function CardBody({
  coordinator,
  step,
  language,
  setLanguage,
}: {
  coordinator: OnboardingCoordinator;
  step: OnboardingStep;
  language: "pt" | "en";
  setLanguage: (language: "pt" | "en") => void;
}) {
  const t = useT();
  const state = coordinator.state;
  const voice = useVoice(language);
  const [confirmingSkipAll, setConfirmingSkipAll] = useState(false);
  const [stage, setStage] = useState<StageSource | null>(null);
  const [name, setNameState] = useState(() => read(onboardingChoiceKeys.name) ?? "");
  const setName = (value: string) => {
    write(onboardingChoiceKeys.name, value);
    setNameState(value);
  };
  const { play } = voice;

  // This screen's line, when it appears (and again when the language changes).
  useEffect(() => {
    play(step);
  }, [step, play]);

  const next = () => coordinator.send({ kind: "next" });
  const back = () => coordinator.send({ kind: "back" });
  const skip = () => {
    if (OnboardingPresentation.skipEndsFlow(state)) setConfirmingSkipAll(true);
    else coordinator.send({ kind: "skip" });
  };

  // Enter is the big button, Esc closes the card (counted: twice and it stops opening by itself). The stage over
  // the card has its own keys.
  useEffect(() => {
    if (stage) return;
    const onKey = (event: KeyboardEvent) => {
      // A key the stage already took (its Esc closed it, and this listener came back while the key was on its way).
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (confirmingSkipAll) setConfirmingSkipAll(false);
        else coordinator.send({ kind: "dismiss" });
      } else if (event.key === "Enter" && !confirmingSkipAll && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        coordinator.send({ kind: "next" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [coordinator, confirmingSkipAll, stage]);

  const openSample = () => {
    const screen = ScreenQuestions.make({
      text: t(sampleQuestion),
      frame: { x: 0, y: 0, width: 400, height: 60 },
      appName: "LearnLayer",
      hasImage: false,
      method: "selection",
    });
    const question = examQuestionFromScreen(screen);
    setStage({
      kind: "picture",
      question,
      picture: null,
      figureBoxes: [],
      draft: null,
      transcribes: false,
      ocrText: "",
      session: () => new QuestionSession({ question }, sessionServices()),
    });
  };

  const position = OnboardingPresentation.position(state);
  const muteLabel = voice.muted ? t("Unmute") : t("Mute");

  return (
    <div className="onboarding-backdrop">
      <section className="onboarding-card" role="dialog" aria-modal="true" aria-label="LearnLayer">
        <header className="onboarding-top">
          <div className="onboarding-top-side">
            {OnboardingPresentation.canGoBack(state) && (
              <button type="button" className="onboarding-quiet" onClick={back}>
                <span aria-hidden="true">‹</span> {t("Back")}
              </button>
            )}
          </div>
          <div
            className="onboarding-dots"
            role="progressbar"
            aria-label={t("Step %lld of %lld", position.index, position.total)}
            aria-valuemin={1}
            aria-valuemax={position.total}
            aria-valuenow={position.index}
          >
            {OnboardingPresentation.dots(state).map((dot) => (
              <span key={dot.step} className={dot.isCurrent ? "current" : dot.isPast ? "past" : undefined} />
            ))}
          </div>
          <div className="onboarding-top-side end">
            {OnboardingPresentation.canSkip(state) && (
              <button type="button" className="onboarding-quiet" onClick={skip}>
                {t("Skip")}
              </button>
            )}
          </div>
        </header>

        <div className="onboarding-screen" key={step}>
          <Screen
            step={step}
            voice={voice}
            language={language}
            name={name}
            setName={setName}
            chooseLanguage={(chosen) => {
              setLanguage(chosen);
              write("appLanguage", chosen === "pt" ? "pt-PT" : "en");
            }}
            openSample={openSample}
          />
        </div>

        <footer className="onboarding-bottom">
          <button
            type="button"
            className="onboarding-quiet onboarding-mute"
            onClick={() => voice.setMuted(!voice.muted)}
            aria-label={muteLabel}
            title={muteLabel}
          >
            <SpeakerIcon muted={voice.muted} />
          </button>
          <button type="button" className="onboarding-primary" onClick={next}>
            {t(OnboardingPresentation.primaryTitle(step))}
          </button>
          <span className="onboarding-mute" aria-hidden="true" />
        </footer>

        {confirmingSkipAll && (
          <div className="onboarding-confirm" role="alertdialog" aria-label={t("Skip the introduction?")}>
            <h2>{t("Skip the introduction?")}</h2>
            <p>{t("You can do this again in Settings › General.")}</p>
            <div>
              <button type="button" className="onboarding-quiet" onClick={() => setConfirmingSkipAll(false)}>
                {t("Cancel")}
              </button>
              <button
                type="button"
                className="onboarding-primary small"
                onClick={() => {
                  setConfirmingSkipAll(false);
                  coordinator.send({ kind: "skipAll" });
                }}
              >
                {t("Skip")}
              </button>
            </div>
          </div>
        )}
      </section>
      {stage && (
        <div className="onboarding-stage">
          <Stage source={stage} close={() => setStage(null)} />
        </div>
      )}
    </div>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 6h3l4-3v10L5 10H2z" fill="currentColor" />
      {muted ? (
        <path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      ) : (
        <path
          d="M11 5.5a3.5 3.5 0 0 1 0 5M12.6 3.6a6 6 0 0 1 0 8.8"
          stroke="currentColor"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function Header({
  voice,
  title,
  subtitle,
  scale = 1,
}: {
  voice: Voice;
  title: string;
  subtitle?: string;
  scale?: number;
}) {
  return (
    <div className="onboarding-header">
      <div className="onboarding-mascot" style={{ height: 84 * scale }} aria-hidden="true">
        <AnimatedMascot size={Math.round(64 * scale)} level={voice.level} speaking={voice.speaking} />
      </div>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

function Layout({ children, ...header }: Parameters<typeof Header>[0] & { children?: ReactNode }) {
  return (
    <div className="onboarding-layout">
      <Header {...header} />
      {children}
    </div>
  );
}

function Chip({ text, selected = false }: { text: string; selected?: boolean }) {
  return <span className={`onboarding-chip${selected ? " selected" : ""}`}>{text}</span>;
}

function Status({ text, positive = false }: { text: string; positive?: boolean }) {
  return <span className={`onboarding-status${positive ? " positive" : ""}`}>{text}</span>;
}

interface ScreenProps {
  step: OnboardingStep;
  voice: Voice;
  language: "pt" | "en";
  name: string;
  setName: (name: string) => void;
  chooseLanguage: (language: "pt" | "en") => void;
  openSample: () => void;
}

function Screen(props: ScreenProps) {
  switch (props.step) {
    case "welcome":
      return <Welcome {...props} />;
    case "language":
      return <LanguageChoice {...props} />;
    case "mic":
      return <Mic {...props} />;
    case "talk":
      return <Talk {...props} />;
    case "permissions":
      // Only on a Mac's path (Windows asks for none of these).
      return <Permissions {...props} />;
    case "tryIt":
      return <TryIt {...props} />;
    case "look":
      return <Look {...props} />;
    case "plan":
      return <Plan {...props} />;
    case "done":
      return <Done {...props} />;
  }
}

function Welcome({ voice, name, setName }: ScreenProps) {
  const t = useT();
  return (
    <Layout
      voice={voice}
      title={t("Hi! I’m LearnLayer.")}
      subtitle={t("I explain any question step by step, with voice and strokes. Takes 2 minutes.")}
      scale={1.35}
    >
      <div className="onboarding-row">
        <input
          className="onboarding-field"
          placeholder={t("Your name (optional)")}
          aria-label={t("Your name (optional)")}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          type="button"
          className="onboarding-round"
          onClick={() => voice.play("welcome")}
          title={t("Hear it again")}
          aria-label={t("Hear it again")}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
            <path d="M3 1.5v10l8.5-5z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </Layout>
  );
}

function LanguageChoice({ voice, language, chooseLanguage }: ScreenProps) {
  const t = useT();
  const card = (value: "pt" | "en", title: string, detail: string) => (
    <button
      type="button"
      className={`onboarding-language${language === value ? " selected" : ""}`}
      aria-pressed={language === value}
      onClick={() => chooseLanguage(value)}
    >
      <strong>{title}</strong>
      <span>{detail}</span>
    </button>
  );
  return (
    <Layout voice={voice} title={t("Which language should we use?")} subtitle={t("You can change this later.")}>
      <div className="onboarding-row">
        {card("pt", "Português (Portugal)", "Voz e texto em português europeu")}
        {card("en", "English", "Voice and text in English")}
      </div>
    </Layout>
  );
}

function LevelBars({ level }: { level: number }) {
  const count = 15;
  return (
    <div className="onboarding-bars" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className={level > index / count ? "on" : undefined}
          style={{ height: 12 + 22 * Math.sin((index / (count - 1)) * Math.PI) }}
        />
      ))}
    </div>
  );
}

function Mic({ voice }: ScreenProps) {
  const t = useT();
  const [status, setStatus] = useState<"waiting" | "allowed" | "denied">("waiting");
  const [level, setLevel] = useState(0);
  useEffect(() => {
    // Asking for the microphone is what shows Windows' (or WebView2's) prompt; the samples only move the bars.
    const recorder = new Recorder();
    let live = true;
    void recorder
      .start((value) => live && setLevel(value))
      .then((started) => {
        if (!live) {
          if (started) void recorder.stop();
          return;
        }
        setStatus(started ? "allowed" : "denied");
      });
    return () => {
      live = false;
      void recorder.stop();
    };
  }, []);
  return (
    <Layout
      voice={voice}
      title={t("First, can I hear you?")}
      subtitle={t(
        "Say anything out loud. If the bars move, your mic works. Built-in or wired mics work best; Bluetooth ones can be flaky.",
      )}
    >
      <div className="onboarding-stack">
        <LevelBars level={level} />
        <Chip text={t("“Testing, one, two, three”")} />
        {status === "denied" ? (
          <div className="onboarding-stack tight">
            <Status text={t("The microphone is off")} />
            <button type="button" className="onboarding-quiet" onClick={() => void openMicrophoneSettings()}>
              {t("Open System Settings")}
            </button>
          </div>
        ) : status === "allowed" ? (
          <Status text={t("Allowed")} positive />
        ) : (
          <Status text={t("Waiting for your permission…")} />
        )}
      </div>
    </Layout>
  );
}

function Keycap({ symbol, label, down = false }: { symbol: string; label?: string; down?: boolean }) {
  return (
    <span className={`onboarding-keycap${down ? " down" : ""}`}>
      <span>{symbol}</span>
      {label && <small>{label}</small>}
    </span>
  );
}

function Talk({ voice }: ScreenProps) {
  const t = useT();
  const mac = usePlatformName() === "macos";
  const [phase, setPhase] = useState<"waiting" | "listening" | "speaking">("waiting");
  const phaseRef = useRef(phase);
  const { play } = voice;
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    let timer = 0;
    const held = (down: boolean) => {
      if (down && phaseRef.current === "waiting") setPhase("listening");
      else if (!down && phaseRef.current === "listening") {
        setPhase("speaking");
        play("talkReply", 150);
        timer = window.setTimeout(() => setPhase("waiting"), 2400);
      }
    };
    // The global talk key (the hook), and the same keys pressed in this window (where the browser sees them):
    // Ctrl + Win, or Control + Option on a Mac.
    const stop = onTalkKey(held);
    const second = mac ? "Alt" : "Meta";
    const onKey = (event: KeyboardEvent) => {
      const chord = mac
        ? event.ctrlKey && event.altKey && !event.metaKey && !event.shiftKey
        : event.ctrlKey && event.metaKey && !event.altKey && !event.shiftKey;
      if (event.type === "keydown" && chord) held(true);
      if (event.type === "keyup" && (event.key === "Control" || event.key === second)) held(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      void stop.then((unlisten) => unlisten());
    };
  }, [play, mac]);
  const listening = phase === "listening";
  return (
    <Layout
      voice={voice}
      title={t("This is how you talk to me")}
      subtitle={t(
        "Hold Control and Option together, say hi, then let go. I’m listening the whole time you hold them. Once you allow it in the next step, it works in any app.",
      )}
    >
      <div className="onboarding-stack">
        <div className="onboarding-row">
          {mac ? (
            <Keycap symbol="⌃" label={t("control")} down={listening} />
          ) : (
            <Keycap symbol="Ctrl" down={listening} />
          )}
          <span className="onboarding-dim">{t("and")}</span>
          {mac ? <Keycap symbol="⌥" label={t("option")} down={listening} /> : <Keycap symbol="Win" down={listening} />}
        </div>
        <Chip text={t("“Hi, what is a derivative?”")} />
        {phase === "waiting" ? (
          <Status text={t("waiting for you…")} />
        ) : phase === "listening" ? (
          <Status text={t("listening…")} positive />
        ) : (
          <Status text={t("speaking…")} positive />
        )}
      </div>
    </Layout>
  );
}

/**
 * The Swift app's OnboardingPermissions, on a Mac: Accessibility (⌥-click, the talk key) and Screen Recording (the
 * window picture), each with its state, read again every second, and a button that asks for it. Each is optional.
 */
function Permissions({ voice }: ScreenProps) {
  const t = useT();
  const [state, setState] = useState<SystemPermissions | null>(null);
  useEffect(() => {
    let live = true;
    const read = () => void systemPermissions().then((found) => live && setState(found));
    read();
    const timer = window.setInterval(read, 1000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);
  const row = (title: string, purpose: string, granted: boolean | undefined, ask: () => void) => (
    <div className="onboarding-permission">
      <div>
        <strong>{t(title)}</strong>
        <small>{t(purpose)}</small>
      </div>
      {granted ? (
        <Status text={t("Allowed")} positive />
      ) : (
        <button type="button" className="onboarding-secondary" onClick={ask}>
          {t("Open")}
        </button>
      )}
    </div>
  );
  return (
    <Layout
      voice={voice}
      title={t("Permissions")}
      subtitle={t("One at a time. Each one is optional, and you can change it later in Settings.")}
    >
      <div className="onboarding-stack">
        {row(
          "Accessibility",
          "This lets me read the question you’re looking at.",
          state?.accessibility,
          () => void requestPermission("accessibility"),
        )}
        {row(
          "Screen Recording",
          "This lets me see the part of the screen you choose.",
          state?.screenRecording,
          () => void requestPermission("screenRecording"),
        )}
        <span className="onboarding-dim">{t("Restart LearnLayer so macOS applies it.")}</span>
      </div>
    </Layout>
  );
}

function TryIt({ voice, openSample }: ScreenProps) {
  const t = useT();
  const mac = usePlatformName() === "macos";
  return (
    <Layout
      voice={voice}
      title={t("Try it on a question")}
      subtitle={t("Hold ⌥ and click the question below. I’ll explain it step by step.")}
    >
      <div className="onboarding-stack">
        {/* A click in LearnLayer's own window is never taken by the hook: the card answers Alt-click (and a plain
            click, so nobody is stuck) itself. */}
        <button type="button" className="onboarding-sample" onClick={openSample}>
          <small>{t("Sample question")}</small>
          <span>{t(sampleQuestion)}</span>
        </button>
        <div className="onboarding-row">
          {mac ? <Keycap symbol="⌥" label={t("option")} /> : <Keycap symbol="Alt" />}
          <span className="onboarding-dim">+</span>
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <path d="M8 4l12 9-5.5 1 3 6-2.4 1.1-3-6L8 19z" fill="currentColor" />
          </svg>
        </div>
      </div>
    </Layout>
  );
}

function Look({ voice }: ScreenProps) {
  const t = useT();
  const [colour, setColour] = useState<MascotColor>(storedMascotColor());
  const [open, setOpen] = useState(false);
  const [attribution, setAttribution] = useState(() => read(onboardingChoiceKeys.attribution));
  return (
    <Layout
      voice={voice}
      title={t("Pick a colour")}
      subtitle={t("This only changes my colour. The rest of the app stays the same.")}
    >
      <div className="onboarding-stack">
        <div className="onboarding-row" role="radiogroup" aria-label={t("Mascot colour")}>
          {(Object.keys(mascotColors) as MascotColor[]).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={colour === option}
              className={`onboarding-swatch${colour === option ? " selected" : ""}`}
              onClick={() => {
                write(mascotColorKey, option);
                setColour(option);
              }}
            >
              <span
                style={{
                  background: `linear-gradient(135deg, ${mascotColors[option][1]}, ${mascotColors[option][0]})`,
                }}
              />
              <small>{t(option)}</small>
            </button>
          ))}
        </div>
        <div className="onboarding-disclosure">
          <button type="button" className="onboarding-quiet" aria-expanded={open} onClick={() => setOpen(!open)}>
            {t("How did you hear about us? (optional)")} <span aria-hidden="true">{open ? "▾" : "▸"}</span>
          </button>
          {open && (
            <div className="onboarding-chips">
              {OnboardingPresentation.attributionChoices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  aria-pressed={attribution === choice}
                  onClick={() => {
                    const value = attribution === choice ? null : choice;
                    write(onboardingChoiceKeys.attribution, value);
                    setAttribution(value);
                  }}
                >
                  <Chip text={t(choice)} selected={attribution === choice} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function Plan({ voice }: ScreenProps) {
  const t = useT();
  const language = useLanguage();
  const { state } = useAccount();
  useEffect(() => write(onboardingChoiceKeys.plan, "free"), []);
  const offer = (...ids: string[]) => state.plans.find((plan) => ids.includes(plan.id));
  const free = offer("free");
  const plus = offer("plus", "paid");
  const pro = offer("pro");
  const price = useMemo(
    () => (cents: number) =>
      new Intl.NumberFormat(language, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
        cents / 100,
      ),
    [language],
  );
  const card = (title: string, cents: number, monthly: boolean, count: number, available: boolean, note: string) => (
    <div className={`onboarding-plan${available ? " available" : ""}`}>
      <strong>{t(title)}</strong>
      <div className="onboarding-price">
        <span>{price(cents)}</span>
        {monthly && <small>{t("/ month")}</small>}
      </div>
      <p>{t("%lld credits a month.", count)}</p>
      <em>{t(note)}</em>
    </div>
  );
  return (
    <Layout voice={voice} title={t("Choose your plan")} subtitle={t("Start free. Change any time.")}>
      <div className="onboarding-plans">
        {card(
          "Free",
          free?.monthlyPriceCents ?? 0,
          false,
          free?.monthlyCreditLimit ?? PlanDefaults.freeMonthlyCredits,
          true,
          "No card needed.",
        )}
        {card(
          "Plus",
          plus?.monthlyPriceCents ?? PlanDefaults.paidMonthlyCents,
          true,
          plus?.monthlyCreditLimit ?? PlanDefaults.paidMonthlyCredits,
          false,
          "Upgrade in Settings",
        )}
        {card(
          "Pro",
          pro?.monthlyPriceCents ?? PlanDefaults.proMonthlyCents,
          true,
          pro?.monthlyCreditLimit ?? PlanDefaults.proMonthlyCredits,
          false,
          "Upgrade in Settings",
        )}
      </div>
    </Layout>
  );
}

function Done({ voice, name }: ScreenProps) {
  const t = useT();
  const trimmed = name.trim();
  const tip = (icon: ReactNode, text: string) => (
    <li>
      <span className="onboarding-tip-icon" aria-hidden="true">
        {icon}
      </span>
      {text}
    </li>
  );
  return (
    <Layout voice={voice} title={trimmed === "" ? t("You’re all set.") : t("You’re all set, %@.", trimmed)} scale={1.2}>
      <ul className="onboarding-tips">
        {tip(
          <svg width="18" height="18" viewBox="0 0 26 26">
            <path d="M8 4l12 9-5.5 1 3 6-2.4 1.1-3-6L8 19z" fill="currentColor" />
          </svg>,
          t("Hold ⌥ and click any question."),
        )}
        {tip(
          <svg width="18" height="18" viewBox="0 0 18 18">
            <rect x="6" y="2" width="6" height="10" rx="3" fill="currentColor" />
            <path d="M3.5 8.5a5.5 5.5 0 0 0 11 0M9 14v2.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
          </svg>,
          t("Hold Control + Option to talk to me."),
        )}
        {tip(
          <svg width="18" height="18" viewBox="0 0 18 18">
            <rect x="3" y="2" width="12" height="5" rx="2.5" fill="currentColor" />
            <path d="M9 9v6M6.5 12.5L9 15l2.5-2.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
          </svg>,
          t("Hover the notch for documents and memory."),
        )}
      </ul>
    </Layout>
  );
}
