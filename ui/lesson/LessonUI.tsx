// «Explica-me» on the stage (the Mac's QuestionSession+Lesson and LessonLayer, @ ref 2026-11-04): the mascot teaches
// the question from the written solution, beat by beat, with the voice; each beat lights its step of the solution and
// marks the question while it is said. With no lesson (no session, offline) the mascot walks the steps on screen
// instead, saying each while its data is underlined (the Mac's `readSteps`, `QuestionSession.mascotClicked`).

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { EquationMorph } from "@core/explanation/equationMorph";
import type { LessonBeat, LessonShow } from "@core/lesson/mascotLesson";
import type { LessonRequest } from "@core/lesson/mascotLessonProvider";
import { ChoiceCheck } from "@core/problems/choiceCheck";
import { circuitOf } from "@core/illustrations/circuit";
import { solidOf } from "@core/illustrations/solid";
import { GenericSolidBuilder } from "@core/illustrations/solidBuilder";
import { Space3D } from "@core/illustrations/spaceSteps";
import { LessonFigurePicker, LessonFigureText } from "@core/lesson/lessonFigure";
import { circuitHighlightPlan, solidStepPlan } from "@core/illustrations/figureSteps";
import type { QuestionSession } from "@core/problems/questionSession";
import { optionLinesOf, solutionWording, workContext } from "@core/voice/workContext";
import { lessonProvider } from "../ai/solver";
import { AnimatedMascot } from "../components/Mascot";
import { useT } from "../i18n";
import { speak, tutorLanguage, voiceEnabled } from "../voice/speaker";
import { questionPlan } from "../voice/VoiceUI";
import { idleLessonState, LessonPlayer, type LessonState, type Narrate } from "./lessonPlayer";
import { GuideSpots } from "./guideSpot";

export interface LessonContextValue {
  state: LessonState | null;
  player: LessonPlayer | null;
  /** «Explica-me», or stop the lesson that plays. */
  toggle(): void;
}

export const LessonContext = createContext<LessonContextValue>({ state: null, player: null, toggle: () => {} });

/** Starts or stops the lesson (the «Explica-me» button and the mascot). */
export const useLessonToggle = () => useContext(LessonContext).toggle;

/** What the lesson on screen is showing now (null when none plays). */
export const useLessonState = () => useContext(LessonContext).state;

/** The marks the beat being said puts on the question. */
export function useLessonShows(): readonly LessonShow[] {
  return useLessonState()?.shows ?? [];
}

/** About the time it takes to read a line: when no voice can say it, the words stay that long. */
const readingTime = (text: string) => Math.min(9_000, Math.max(1_800, Array.from(text).length * 55));

const narrate: Narrate = async (text, onLevel, signal, onProgress) => {
  // The voice began with its first word heard.
  let began: number | null = null;
  const result = await speak(text, {
    onLevel,
    signal,
    onProgress: (through, length) => {
      const now = performance.now();
      began ??= now;
      onProgress?.(length > 0 ? through / length : 0, (now - began) / 1000);
    },
  });
  if (!result.silent || signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, readingTime(text));
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      resolve();
    });
  });
};

/** The 3D figure on the stage as a lesson is told about it (`Figure3DSpec.lessonDescription`); null without one. */
function figureDescription(session: QuestionSession): string | null {
  const illustration = session.illustration;
  const circuit = illustration ? circuitOf(illustration) : null;
  if (circuit) return LessonFigureText.circuit(circuit);
  const solid = illustration ? solidOf(illustration) : null;
  if (solid) {
    const built = GenericSolidBuilder.build(solid);
    return built ? LessonFigureText.solid(illustration?.title ?? "", GenericSolidBuilder.order(built)) : null;
  }
  const figure = session.solutionFigure;
  if (figure?.kind === "space") {
    const parts = Space3D.parts(figure.figure);
    return parts ? LessonFigureText.space(parts) : null;
  }
  return null;
}

/**
 * Which 3D figure a lesson's beat raises: the step's change to the figure first (the app's reading of the solution),
 * then a part the beat names, each once (`LessonFigurePicker`). Null without a figure.
 */
function figurePicker(session: QuestionSession) {
  const illustration = session.illustration;
  const circuit = illustration ? circuitOf(illustration) : null;
  const solid = illustration ? solidOf(illustration) : null;
  const figure = session.solutionFigure;
  const steps = (session.part?.cards ?? []).map((card) => ({
    formula: card.latex,
    words: `${card.title} ${card.note ?? ""}`,
  }));
  let plan: (string | null)[] = [];
  let parts: string[];
  if (circuit) {
    plan = circuitHighlightPlan(circuit, steps);
    parts = circuit.components.map((part) => part.id);
  } else if (solid) {
    plan = solidStepPlan(solid, steps);
    const built = GenericSolidBuilder.build(solid);
    parts = built ? GenericSolidBuilder.order(built) : [];
  } else if (figure?.kind === "space") parts = Space3D.parts(figure.figure) ?? [];
  else return null;
  const picker = new LessonFigurePicker(plan, new Set(parts));
  return (beat: LessonBeat, step: number | null) => picker.figure(beat, step);
}

/** What the lesson is told about the question and what the student already read (`lessonRequest`). */
function lessonRequest(session: QuestionSession): LessonRequest {
  const part = session.part;
  const question = session.question;
  const work = workContext({
    label: question.label,
    groupLabels: question.groupLabels,
    solution: session.solution,
    part,
    figureNote: session.figureNote,
  });
  const letters = part ? [...ChoiceCheck.options(part.label, question.groupText, session.partLabels)].sort() : [];
  return {
    doubt: null,
    questionText: session.statementText,
    optionLines: optionLinesOf(question.text),
    optionLetters: letters,
    subject: session.routeSubject,
    work,
    solutionTexts: solutionWording(part),
    picture: session.images[0] ?? null,
    language: tutorLanguage(),
    needsStrongModel: session.route === "strong",
    // The answer is written on screen: the lesson may reach it, so nothing is held back.
    correctOption: null,
    // The 3D figure beside the steps, part by part, so a beat can name what it shows.
    figure3D: figureDescription(session),
  };
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Owns the lesson of one stage: started by «Explica-me», stopped by a second press, by Esc or by closing. */
export function useLessonControl(session: QuestionSession | null) {
  const [player, setPlayer] = useState<LessonPlayer | null>(null);
  const current = useRef<LessonPlayer | null>(null);
  const played = useSyncExternalStore(
    useCallback((listener: () => void) => player?.subscribe(listener) ?? (() => {}), [player]),
    () => player?.state ?? null,
  );
  // The mascot walking the steps: its voice, for the mascot and the pill.
  const [voice, setVoice] = useState({ speaking: false, level: 0 });
  const guiding = session?.isGuiding === true;
  const state: LessonState | null =
    played ?? (guiding ? { ...idleLessonState, playing: true, step: session.mascotFocusStep, ...voice } : null);

  const stop = useCallback(() => {
    current.current?.stop();
    current.current = null;
    setPlayer(null);
    session?.stopGuide();
  }, [session]);

  /** Each step on screen said while the mascot is on it and its data is underlined; a second press stops it. */
  const readSteps = useCallback(() => {
    if (!session) return;
    const english = tutorLanguage().startsWith("en");
    const hasFigure = session.solution?.figure != null;
    // The plan says whether the student learns from figures: then each step starts at the figure.
    const pointer = questionPlan(session)?.pointer ?? false;
    session.mascotClicked(reducedMotion(), async (step, signal) => {
      const text = session.narratedStep(step, pointer, hasFigure, english);
      if (!text) return;
      setVoice({ speaking: true, level: 0 });
      await narrate(text, (level) => setVoice({ speaking: true, level }), signal);
      setVoice({ speaking: false, level: 0 });
    });
  }, [session]);

  const start = useCallback(() => {
    if (!session?.part) return;
    stop();
    const next = new LessonPlayer();
    const cards = session.part.cards ?? [];
    next.morphStages = (from, to) => EquationMorph.stages(cards[from]?.latex ?? "", cards[to]?.latex ?? "");
    next.answerStep = cards.length > 0 ? cards.length - 1 : null;
    next.voiceIsOn = voiceEnabled();
    next.figureForBeat = figurePicker(session);
    current.current = next;
    setPlayer(next);
    const request = lessonRequest(session);
    void (async () => {
      const feed = lessonProvider().feed(request);
      while (feed.beats.length === 0 && !feed.isFinished && !next.stopped) await feed.changed();
      if (next.stopped) return;
      // No lesson could be made: the mascot walks the steps on screen instead.
      if (feed.beats.length === 0) {
        if (current.current === next) {
          current.current = null;
          setPlayer(null);
        }
        readSteps();
        return;
      }
      await next.play(feed, narrate);
      if (current.current === next) {
        current.current = null;
        setPlayer(null);
      }
    })();
  }, [session, stop, readSteps]);

  useEffect(() => stop, [session, stop]);

  const toggle = useCallback(() => (current.current || session?.isGuiding ? stop() : start()), [start, stop, session]);

  return { player, state, start, stop, toggle };
}

/**
 * The tutor on the stage (VoiceMascotExerciseOverlay), and what the beat being said brings: its calculation, its check,
 * the closing. The sphere rests in its corner and breathes; a click stops an explanation under way, else talks to the
 * tutor (`onTap`). It goes beside the step's datum while it walks the steps, and just above the voice's mark while that
 * is said. With the mascot off in Settings, only what the lesson brings is shown.
 */
export function LessonOverlay({
  player,
  state,
  onTap,
  voice = null,
  showsMascot = true,
}: {
  player: LessonPlayer | null;
  state: LessonState | null;
  onTap(): void;
  /** The voice tutor's turn: the sphere listens, and speaks with its level. */
  voice?: { phase: string; level: number } | null;
  showsMascot?: boolean;
}) {
  const t = useT();
  // While it walks the steps, the sphere waits beside the step's datum (MascotGuide.spot).
  const spot = useSyncExternalStore(GuideSpots.subscribe, GuideSpots.get);
  const voiceSpeaks = voice?.phase === "speaking";
  const speaking = voiceSpeaks || (state?.speaking ?? false);
  const level = voiceSpeaks ? voice.level : (state?.level ?? 0);
  const listening = voice?.phase === "listening";
  const label = state?.playing ? t("Stop Explaining") : t("Talk to the Tutor");
  return (
    <aside className="lesson-overlay" aria-live="polite">
      {showsMascot ? (
        <button
          type="button"
          className={`lesson-mascot${speaking ? " speaking" : ""}${spot ? " beside" : ""}${listening ? " listening" : ""}`}
          style={spot ? { left: spot.x - 28, top: spot.y - 28 } : undefined}
          onClick={onTap}
          aria-label={label}
          title={label}
        >
          {/* Listening for the student's question: a brief word over the sphere. */}
          {listening ? <span className="lesson-tell">{t("Tell me")}</span> : null}
          <AnimatedMascot level={level} speaking={speaking} />
        </button>
      ) : null}
      {state?.calc ? <div className="lesson-calc">{state.calc}</div> : null}
      {state?.check && player ? (
        <div className="lesson-check" role="group" aria-label={state.check.ask}>
          <p>{state.check.ask}</p>
          <div>
            {state.check.options.map((option, index) => (
              <button key={index} type="button" className="stage-button" onClick={() => player.answer(index)}>
                {option}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {state?.closing ? <p className="lesson-closing">{state.closing.say}</p> : null}
    </aside>
  );
}
