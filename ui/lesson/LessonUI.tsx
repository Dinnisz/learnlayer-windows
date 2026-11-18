// «Explica-me» on the stage (the Mac's QuestionSession+Lesson and LessonLayer, @ ref 2026-11-04): the mascot teaches
// the question from the written solution, beat by beat, with the voice; each beat lights its step of the solution and
// marks the question while it is said. With no lesson (no session, offline) the mascot walks the steps on screen
// instead, saying each while its data is underlined (the Mac's `readSteps`, `QuestionSession.mascotClicked`).

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { EquationMorph } from "@core/explanation/equationMorph";
import type { LessonShow } from "@core/lesson/mascotLesson";
import type { LessonRequest } from "@core/lesson/mascotLessonProvider";
import { ChoiceCheck } from "@core/problems/choiceCheck";
import { circuitOf } from "@core/illustrations/circuit";
import { solidOf } from "@core/illustrations/solid";
import { GenericSolidBuilder } from "@core/illustrations/solidBuilder";
import { Space3D } from "@core/illustrations/spaceSteps";
import { LessonFigureText } from "@core/lesson/lessonFigure";
import type { QuestionSession } from "@core/problems/questionSession";
import { optionLinesOf, solutionWording, workContext } from "@core/voice/workContext";
import { lessonProvider } from "../ai/solver";
import { AnimatedMascot } from "../components/Mascot";
import { useT } from "../i18n";
import { speak, tutorLanguage, voiceEnabled } from "../voice/speaker";
import { questionPlan } from "../voice/VoiceUI";
import { idleLessonState, LessonPlayer, type LessonState, type Narrate } from "./lessonPlayer";

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

/** The mascot beside the stage, and what the beat being said brings: its calculation, its check, the closing. */
export function LessonOverlay({
  player,
  state,
  onTap,
}: {
  player: LessonPlayer | null;
  state: LessonState | null;
  onTap(): void;
}) {
  const t = useT();
  return (
    <aside className="lesson-overlay" aria-live="polite">
      <button
        type="button"
        className={`lesson-mascot${state?.speaking ? " speaking" : ""}`}
        onClick={onTap}
        aria-label={state?.playing ? t("Stop Explaining") : t("Explain It to Me")}
        title={state?.playing ? t("Stop Explaining") : t("Explain It to Me")}
      >
        <AnimatedMascot level={state?.level ?? 0} speaking={state?.speaking ?? false} />
      </button>
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
