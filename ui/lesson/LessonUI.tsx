// «Explica-me» on the stage (the Mac's QuestionSession+Lesson and LessonLayer, @ ref 2026-11-04): the mascot teaches
// the question from the written solution, beat by beat, with the voice; each beat lights its step of the solution and
// marks the question while it is said. With no lesson (no session, offline) the steps on screen are said one by one.

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MascotLessons, type LessonShow } from "@core/lesson/mascotLesson";
import { LessonFeed, type LessonRequest } from "@core/lesson/mascotLessonProvider";
import { lessonFromWork } from "@core/lesson/readSteps";
import { ChoiceCheck } from "@core/problems/choiceCheck";
import type { QuestionSession } from "@core/problems/questionSession";
import { optionLinesOf, solutionWording, workContext } from "@core/voice/workContext";
import { lessonProvider } from "../ai/solver";
import { AnimatedMascot } from "../components/Mascot";
import { useT } from "../i18n";
import { speak, tutorLanguage } from "../voice/speaker";
import { LessonPlayer, type LessonState, type Narrate } from "./lessonPlayer";

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

const narrate: Narrate = async (text, onLevel, signal) => {
  const result = await speak(text, { onLevel, signal });
  if (!result.silent || signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, readingTime(text));
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      resolve();
    });
  });
};

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
  };
}

/** Owns the lesson of one stage: started by «Explica-me», stopped by a second press, by Esc or by closing. */
export function useLessonControl(session: QuestionSession | null) {
  const [player, setPlayer] = useState<LessonPlayer | null>(null);
  const current = useRef<LessonPlayer | null>(null);
  const state = useSyncExternalStore(
    useCallback((listener: () => void) => player?.subscribe(listener) ?? (() => {}), [player]),
    () => player?.state ?? null,
  );

  const stop = useCallback(() => {
    current.current?.stop();
    current.current = null;
    setPlayer(null);
  }, []);

  const start = useCallback(() => {
    if (!session?.part) return;
    stop();
    const next = new LessonPlayer();
    current.current = next;
    setPlayer(next);
    const request = lessonRequest(session);
    void (async () => {
      const feed = lessonProvider().feed(request);
      while (feed.beats.length === 0 && !feed.isFinished && !next.stopped) await feed.changed();
      if (next.stopped) return;
      // No lesson could be made: the steps on screen are said one by one instead.
      const played =
        feed.beats.length > 0
          ? feed
          : LessonFeed.of(
              MascotLessons.sanitized(lessonFromWork(request.work), { hasOptions: request.optionLetters.length > 0 }),
            );
      await next.play(played, narrate);
      if (current.current === next) {
        current.current = null;
        setPlayer(null);
      }
    })();
  }, [session, stop]);

  useEffect(() => stop, [session, stop]);

  const toggle = useCallback(() => (current.current ? stop() : start()), [start, stop]);

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
