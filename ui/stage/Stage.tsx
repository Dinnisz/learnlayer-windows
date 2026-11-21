// Port of LearnLayer/Problems/QuestionOverlay.swift, SolutionSteps.swift, StatementUnderlines.swift and
// EvidenceAnswerView.swift @ ref 2026-11-04 (the reader's stage). The page behind dims and blurs, the question is
// lifted off it, and a menu asks what the student wants: 1–4 choose, Enter opens the solution, Esc closes.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { failureMessage, offersUpgrade } from "@core/ai/modelClient";
import { compactStageHeight, FitToHeight, stageFitFloor } from "./FitToHeight";
import { questionScale, StageGeometry } from "./questionScale";
import { ExplanationLayout } from "@core/problems/explanationLayout";
import { LatexText } from "@core/math/latexText";
import { quoteRects } from "./typesetUnderlines";
import { springDuration, springEasing, Springs } from "../styles/springs";
import { bodyFontSize, linesOf, Rects, type PageText, type Rect } from "@core/pdf/page";
import { passageLinesOfPages } from "@core/pdf/passageLines";
import { ChoiceCheck } from "@core/problems/choiceCheck";
import { formulasFor, type Card, type Focus, type Part } from "@core/problems/problemSolution";
import { StepFocusGeometry, StepFocusMarks, type Box } from "@core/problems/stepFocus";
import { SelectionAsk } from "@core/problems/selectionAsk";
import { markup, partLabelLetters } from "@core/problems/markup";
import { FigureLabels } from "@core/voice/figureLabels";
import { SpeechMarkLayout } from "@core/voice/speechMarkLayout";
import { ExamNotation } from "@core/math/examNotation";
import { uprightUnits } from "@core/math/units";
import { CodeText } from "@core/code/codeText";
import { MascotGuide } from "@core/voice/mascotGuide";
import { GuideSpots } from "../lesson/guideSpot";
import { AnswerLines, AnswerTextLayout } from "@core/problems/answerTextLayout";
import { LessonEvidence } from "@core/lesson/lessonEvidence";
import { Variant } from "@core/problems/problemVariant";
import { FastTranscriptionReader } from "@core/problems/fastTranscription";
import type { ExamQuestion } from "@core/problems/questionDetector";
import { QuestionPages } from "@core/problems/questionPages";
import {
  Transcriptions,
  type QuestionTranscription,
  type TranscriptionBlock,
} from "@core/problems/questionTranscription";
import { isFigure3D, QuestionSession, type Mode, type SessionServices } from "@core/problems/questionSession";
import { FigureBoxSize } from "./figureBox";
import { CurveGraph, type GraphControlling } from "../figures/CurveGraph";
import { FunctionPlot } from "@core/illustrations/graph";
import { ConceptSlug } from "@core/memory/memory";
import { memoryStore } from "../memory/memory";
import { detectTimingDiagram, timingPath, TimingDiagrams, type GreyBitmap } from "@core/timing/timing";
import { IllustrationView } from "../figures/IllustrationView";
import { CircuitView } from "../figures/CircuitView";
import { SolidView } from "../figures/SolidView";
import { solidOf } from "@core/illustrations/solid";
import { circuitHighlightPlan, solidStepPlan } from "@core/illustrations/figureSteps";
import { circuitOf, CircuitMerges } from "@core/illustrations/circuit";
import { spaceParts } from "@core/illustrations/spaceSteps";
import { SignTableView } from "../figures/SignTableView";
import { SpaceFigureView } from "../figures/SpaceFigureView";
import { StatementQuotes } from "@core/problems/statementQuotes";
import { describePart, TextHelpContext } from "@core/problems/textHelp";
import {
  drawingLanguage,
  fastReader,
  illustrationProvider,
  solutionProvider,
  textHelpProvider,
  transcriptionRequests,
  visualAidProvider,
} from "../ai/solver";
import { Icon } from "../components/Icon";
import { MathText, MathView, NoteText, untypesetMath } from "../components/Math";
import { NoteMath } from "@core/math/noteMath";
import { MorphView } from "../components/MorphView";
import { useT } from "../i18n";
import {
  LessonContext,
  LessonOverlay,
  useLessonControl,
  useLessonShows,
  useLessonState,
  useLessonToggle,
} from "../lesson/LessonUI";
import { LessonGeometry } from "@core/lesson/lessonGeometry";
import { LessonShows, type LessonPitfall, type LessonShow } from "@core/lesson/mascotLesson";
import { questionPlan, useVoiceTutor, useVoiceState, VoiceContext, type VoiceState } from "../voice/VoiceUI";
import { VoiceFormulaView } from "../voice/VoiceFormulaView";
import { VoiceFormula } from "@core/voice/voiceFormula";
import { onIslandCommand, publishIsland } from "../island";
import { showMain } from "../native";
import type { ReaderDocument } from "../reader/readerDocument";
import { stageInk } from "./stageInk";
import { PageInk } from "@core/pdf/pageInk";
import { HandDrawnMark } from "../components/HandDrawnMark";
import { stageMascotSize } from "../components/Mascot";
import type { MascotPresence, MascotTransient } from "@core/voice/mascotMotion";
import type { OpenedQuestion } from "../windows/reader/ReaderWindow";
import { StageScale, cssZoom } from "./stageScale";

const base64Bytes = (text: string) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0));

/** A question read from the screen (an Alt-click in another app): its picture, and the session made for it. */
export interface PictureQuestion {
  kind: "picture";
  question: ExamQuestion;
  /** The region's picture (a JPEG's object URL) and its size on screen, in points; null when there is none. */
  picture: { url: string; width: number; height: number } | null;
  /** Where the figures are in the picture, as shares (for a typeset reading's figure blocks). */
  figureBoxes: readonly Rect[];
  /** Where the question was on the screen, in the stage's own pixels: it flies from there. Null: it only fades in. */
  from?: { left: number; top: number; width: number; height: number } | null;
  /** What the stage shows until the model's reading comes: the computer's own reading, typeset; null for bars. */
  draft: string | null;
  /** The model reads the picture and the stage shows that reading typeset; false: the question's text as it is. */
  transcribes: boolean;
  /** The numbers the computer read, a reading must keep them to be shown. */
  ocrText: string;
  session(): QuestionSession;
}

/** Where the stage's question comes from: a page of the reader's PDF, or a picture of the screen. */
export type StageSource = { kind: "pdf"; document: ReaderDocument; opened: OpenedQuestion } | PictureQuestion;

/** The services every session gets: the solver, the routing, the follow-up questions, the fast reading. */
export function sessionServices(): SessionServices {
  return {
    provider: solutionProvider(),
    config: () => solutionProvider().services.config(),
    help: async ({ passage, context, image }: { passage: string; context: string; image: Uint8Array | null }) =>
      (await textHelpProvider().help(passage, context, image)).explanation,
    fast: fastReader(),
    transcribing: (images: readonly Uint8Array[]) => transcriptionRequests.isRequested(images),
    // Settings › General › Default subject, for the route and the figures.
    subject: (() => {
      try {
        return localStorage.getItem("preferredSubject");
      } catch {
        return null;
      }
    })(),
    illustrate: (request) => illustrationProvider().illustration({ ...request, language: drawingLanguage() }),
    visualAid: ({ groupText, subject, part, signal }) => visualAidProvider().aid(groupText, subject, part, signal),
    language: drawingLanguage,
  };
}

async function prepareSource(source: StageSource): Promise<{ session: QuestionSession; page: PageText | null }> {
  if (source.kind === "pdf") return prepare(source.document, source.opened);
  const session = source.session();
  void session.openQuietly();
  return { session, page: null };
}

/** The page area the model was sent a picture of (`QuestionPages.region` on the question's own page); null when the
 * text alone went. */
function sentArea(page: PageText, question: ExamQuestion): Rect | null {
  if (QuestionPages.textSuffices(question, QuestionPages.pages(question, page))) return null;
  return QuestionPages.region(page, question, page);
}

/** The pages, pictures and source lines that go with the clicked question, then its session (no call yet). */
async function prepare(
  document: ReaderDocument,
  opened: OpenedQuestion,
): Promise<{ session: QuestionSession; page: PageText }> {
  const page = await document.text(opened.pageIndex);
  const question = opened.question;
  const pages = QuestionPages.pages(question, page);
  // A question the text layer already says all of goes without its picture.
  const images = QuestionPages.textSuffices(question, pages)
    ? []
    : (
        await Promise.all(
          pages.map((sent) => document.jpeg(sent.index, QuestionPages.region(sent, question, page), 1100)),
        )
      )
        .filter((jpeg): jpeg is string => jpeg !== null)
        .map(base64Bytes);
  // A printed timing diagram to fill in: found only where a clock's label stands near the question.
  const timing = await detectTimingDiagram(page, question.bounds, (region, scale) =>
    greyRegion(document, opened.pageIndex, region, scale),
  ).catch(() => null);
  const session = new QuestionSession(
    {
      question,
      images,
      passageLines: passageLinesOfPages(pages),
      sendsMaterial: QuestionPages.sendsMaterial(pages, question),
      timing,
    },
    sessionServices(),
  );
  // The question is remembered for the Memory map (the Mac's ReaderModel does the same on opening).
  void memoryStore().then((memory) =>
    memory.record({
      text: question.text,
      // The name may already end in .pdf (a Mac open dialog keeps it): never «.pdf.pdf» (Mac report P1).
      documentName: `${document.name.replace(/\.pdf$/i, "")}.pdf`,
      page: question.pageIndex,
      concepts: [ConceptSlug.make(question.text)],
      kind: "exercise",
      language: drawingLanguage(),
      explanationJSON: null,
      area: ConceptSlug.area(""),
    }),
  );
  void session.openQuietly();
  return { session, page };
}

/** A page region in grey, one byte per pixel, row 0 at the top: what the timing diagram is measured on. */
async function greyRegion(
  document: ReaderDocument,
  index: number,
  region: Rect,
  scale: number,
): Promise<GreyBitmap | null> {
  const canvas = window.document.createElement("canvas");
  await document.renderRegion(index, canvas, region, scale, 1);
  const context = canvas.getContext("2d");
  if (!context || canvas.width === 0 || canvas.height === 0) return null;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = new Uint8Array(canvas.width * canvas.height);
  for (let at = 0; at < pixels.length; at++) {
    const alpha = data[at * 4 + 3]! / 255;
    // Transparent is the white of the paper.
    const grey = 0.299 * data[at * 4]! + 0.587 * data[at * 4 + 1]! + 0.114 * data[at * 4 + 2]!;
    pixels[at] = Math.round(grey * alpha + 255 * (1 - alpha));
  }
  return { width: canvas.width, height: canvas.height, pixels };
}

function useSession(session: QuestionSession | null): number {
  return useSyncExternalStore(
    useCallback((listener: () => void) => session?.subscribe(listener) ?? (() => {}), [session]),
    () => session?.version ?? -1,
  );
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Stage({ source, close }: { source: StageSource; close: () => void }) {
  const t = useT();
  const [prepared, setPrepared] = useState<{ session: QuestionSession; page: PageText | null } | null>(null);
  const pendingChoice = useRef<Mode | null>(null);
  const session = prepared?.session ?? null;
  useSession(session);
  const lesson = useLessonControl(session);
  const stopLesson = lesson.stop;
  const voice = useVoiceTutor(session);
  const stopVoice = voice.stop;
  // The sphere's short reactions (MascotController.flash): a hint lights its bulb, a right answer to «Let me try» turns
  // it green with a hop, a wrong one orange with a shake, for 1.35 s.
  const [cue, setCue] = useState<{ cue: MascotTransient } | null>(null);
  // Larger on a tall screen, exactly as laid out on the laptop's (StageScale): the column is zoomed by it.
  const [stageScale, setStageScale] = useState(() => StageScale.factor(window.innerHeight));
  const [stageWidth, setStageWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const resize = () => {
      setStageScale(StageScale.factor(window.innerHeight));
      setStageWidth(window.innerWidth);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const cueKey = session
    ? session.mode === "hint"
      ? "hint"
      : session.attemptResult === "matches"
        ? "correct"
        : session.attemptResult === "differs"
          ? "wrong"
          : null
    : null;
  const [lastCueKey, setLastCueKey] = useState<string | null>(null);
  if (cueKey !== lastCueKey) {
    setLastCueKey(cueKey);
    if (cueKey) setCue({ cue: cueKey as MascotTransient });
  }
  useEffect(() => {
    if (!cue) return;
    const timer = window.setTimeout(() => setCue((now) => (now === cue ? null : now)), 1350);
    return () => window.clearTimeout(timer);
  }, [cue]);
  // What the sphere is doing: listening or speaking with the voice, thinking while the voice or the solution is worked
  // out, speaking with the lesson.
  // The voice decides first; the solution being worked out only makes it think while it is otherwise idle and silent
  // (VoiceMascotExerciseOverlay: `isThinking, phase == .idle, !speaking`).
  const speakingNow = voice.state.phase === "speaking" || (lesson.state?.speaking ?? false);
  const mascotPresence: MascotPresence =
    voice.state.phase === "listening"
      ? "listening"
      : voice.state.phase === "thinking"
        ? "thinking"
        : speakingNow
          ? "speaking"
          : (session?.isSolvingSolution ?? false)
            ? "thinking"
            : "idle";
  // A click on the sphere stops an explanation under way; otherwise it talks to the tutor: it listens, a second click
  // sends what was said, and one while the tutor answers stops it (VoiceMascotExerciseOverlay's onTap).
  const tapMascot = useCallback(() => {
    if (lesson.state?.playing || session?.isGuiding) {
      stopLesson();
      return;
    }
    const phase = voice.state.phase;
    if (phase === "listening") void voice.end();
    else if (phase === "idle") void voice.begin();
    else stopVoice();
  }, [lesson.state, session, stopLesson, voice, stopVoice]);
  const mascotOn = useMemo(() => {
    try {
      return localStorage.getItem("mascotEnabled") !== "0";
    } catch {
      return true;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let made: QuestionSession | null = null;
    void prepareSource(source).then((ready) => {
      if (cancelled) return;
      made = ready.session;
      setPrepared(ready);
      const pending = pendingChoice.current;
      if (pending) ready.session.choose(pending);
    });
    return () => {
      cancelled = true;
      made?.cancel();
    };
  }, [source]);

  // The pill (IslandState on the Mac): an exercise is open, with its suggested questions and subject, and what the
  // pill asks for happens here.
  const followUps = JSON.stringify(session?.followUps ?? []);
  const subject = session?.solution?.subject ?? null;
  useEffect(() => {
    if (!session) return;
    void publishIsland({ exerciseOpen: true, followUps: JSON.parse(followUps) as string[], subject });
  }, [session, followUps, subject]);
  useEffect(() => () => void publishIsland({ exerciseOpen: false, followUps: [], subject: null }), []);
  useEffect(() => {
    if (!session) return;
    const stop = onIslandCommand((command) => {
      if (command.kind === "askAboutExercise") {
        window.focus();
        session.startAsking();
      } else if (command.kind === "ask") {
        window.focus();
        session.ask(command.question, followUpContext(session, command.question));
      } else if (command.kind === "stopSpeaking") {
        stopLesson();
        stopVoice();
      } else if (command.kind === "toggleMute") {
        // Settings › General › Voice, as the Mac's SpeechActivity.toggleMute: muted, the next lines are shown, not said.
        const muted = readVoiceEnabled();
        writeVoiceEnabled(!muted);
        void publishIsland({ muted });
      }
    });
    return () => void stop.then((unlisten) => unlisten());
  }, [session, stopLesson, stopVoice]);

  const choose = useCallback(
    (mode: Mode) => {
      if (session) session.choose(mode);
      else pendingChoice.current = mode;
    },
    [session],
  );

  // Esc closes everything, always; 1–4 choose; Enter opens the solution; ← → walk the steps after a hint.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (event.key === "Escape") {
        event.preventDefault();
        // From a similar question, Esc goes back to the exam's own.
        if (session?.mode === "variant") {
          session.backToOriginal();
          return;
        }
        stopLesson();
        stopVoice();
        session?.cancel();
        close();
        return;
      }
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
      const menu: Record<string, Mode> = { "1": "hint", "2": "tryIt", "3": "solution", "4": "followUp" };
      if (session?.mode == null && menu[event.key]) {
        event.preventDefault();
        if (menu[event.key] !== "followUp") choose(menu[event.key]!);
        else if (session) session.startAsking();
        else pendingChoice.current = "followUp";
      } else if (event.key === "Enter" && session?.mode == null) {
        event.preventDefault();
        choose("solution");
      } else if (event.key === "ArrowRight") session?.nextStep();
      else if (event.key === "ArrowLeft") session?.previousStep();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [session, choose, close, stopLesson, stopVoice]);

  const [questionExpanded, setQuestionExpanded] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  // The work's own height (the Mac's `panelHeight`), for the compact question to make room for it.
  const [workHeight, setWorkHeight] = useState(0);
  const measuredWork = useCallback((height: number) => setWorkHeight(Math.round(height)), []);
  const panelHeight = useMemo(() => ({ height: workHeight, measured: measuredWork }), [workHeight, measuredWork]);

  const mode = session?.mode ?? null;
  const showsLesson = mode === "solution" && session?.part != null && session.state.kind === "ready";
  // Reading while the student works on it; compact once the solution is open, unless a click on the question opened
  // it to its reading size again (QuestionOverlay's `phase` and `questionExpanded`).
  const compact = mode === "solution" && !questionExpanded;
  const toggleQuestion = () => {
    if (mode !== "solution") return;
    // A click that ends a selection of the question's words keeps it as it is.
    if (!(window.getSelection()?.isCollapsed ?? true)) return;
    setQuestionExpanded((expanded) => !expanded);
  };
  // The stage's side column (`Stage.hasSide`): beside the question when the window is at least 1000 pt wide,
  // `min(440, 34 %)` of it, the question and the work in what is left (36 pt apart).
  const widthPoints = stageWidth / stageScale;
  const sideWidth = Math.min(440, 0.34 * widthPoints);
  const extrasAtSide = session !== null && hasStageExtras(session) && widthPoints >= 1000;

  return (
    <PanelHeight.Provider value={panelHeight}>
      <LessonContext.Provider value={{ state: lesson.state, player: lesson.player, toggle: lesson.toggle }}>
        <VoiceContext.Provider value={voice.state}>
          <TalkContext.Provider value={{ begin: () => void voice.begin(), end: () => void voice.end() }}>
            <div
              ref={stageRef}
              className="stage"
              style={{ "--stage-scale": stageScale } as React.CSSProperties}
              role="dialog"
              aria-modal="true"
              aria-label={t("What do you want to do?")}
              onMouseDown={(event) => event.target === event.currentTarget && close()}
            >
              <div
                className={`stage-column${compact ? " stage-compact" : ""}`}
                style={extrasAtSide ? { width: `min(1272px, calc(100% - ${sideWidth + 36}px))` } : undefined}
              >
                {/* A similar question is drawn where the exam's was; the exam's waits, hidden (`VariantStage`). */}
                {mode === "variant" && session && <VariantHeader session={session} />}
                {/* A click on the compact question opens it to its reading size, and back (`toggleQuestion`). */}
                <div className={`stage-question-toggle${mode === "variant" ? " away" : ""}`} onClick={toggleQuestion}>
                  {source.kind === "pdf" ? (
                    <QuestionCrop
                      document={source.document}
                      opened={source.opened}
                      page={prepared?.page ?? null}
                      session={session}
                      compact={compact}
                    />
                  ) : (
                    <ScreenQuestionView source={source} session={session} compact={compact} />
                  )}
                </div>
                {session === null || mode === null ? (
                  <Menu
                    explains={session?.explains ?? false}
                    onChoose={choose}
                    onAsk={() => (session ? session.startAsking() : (pendingChoice.current = "followUp"))}
                  />
                ) : (
                  <ModeView session={session} extrasAtSide={extrasAtSide} />
                )}
              </div>
              {extrasAtSide && session && (
                <aside
                  className="stage-side"
                  aria-label={t("Formulas")}
                  style={{ width: sideWidth, maxHeight: window.innerHeight / stageScale - 28 - 16 }}
                >
                  <StageExtras session={session} atSide />
                </aside>
              )}
              {/* Every stage has the tutor (QuestionOverlay): the sphere, when the mascot is on; the lesson's card. */}
              {(session && mascotOn) || showsLesson ? (
                <LessonOverlay
                  player={lesson.player}
                  state={lesson.state}
                  onTap={tapMascot}
                  voice={voice.state}
                  presence={mascotPresence}
                  transient={cue?.cue ?? null}
                  showsMascot={mascotOn && session !== null}
                  restsBeside={session?.mode === "solution" && (session.isGuiding || (lesson.state?.playing ?? false))}
                />
              ) : null}
              <VoiceCaption state={voice.state} onScreen={session?.onScreenText ?? []} />
              {session && <SelectionAskPill session={session} />}
              <ScrollCue stage={stageRef} />
            </div>
          </TalkContext.Provider>
        </VoiceContext.Provider>
      </LessonContext.Provider>
    </PanelHeight.Provider>
  );
}

/**
 * A quiet «more below» at the foot of the stage while what is on it goes past the window's bottom: the stage has no
 * scrollbar (base.css), and a long solution ran off the screen with nothing to say there was more (Mac report I10).
 * A click scrolls down most of a window; the cue leaves once the end is in view.
 */
function ScrollCue({ stage }: { stage: React.RefObject<HTMLDivElement | null> }) {
  const t = useT();
  const [more, setMore] = useState(false);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const check = () => setMore(element.scrollHeight - element.scrollTop - element.clientHeight > 24);
    check();
    element.addEventListener("scroll", check, { passive: true });
    const observer = new ResizeObserver(check);
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    // Steps arriving one by one change the height without resizing the stage itself.
    const timer = window.setInterval(check, 600);
    return () => {
      element.removeEventListener("scroll", check);
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [stage]);
  if (!more) return null;
  return (
    <button
      type="button"
      className="stage-scroll-cue"
      aria-label={t("More below")}
      onClick={() => stage.current?.scrollBy({ top: stage.current.clientHeight * 0.7, behavior: "smooth" })}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path d="M4 7l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function Menu({ explains, onChoose, onAsk }: { explains: boolean; onChoose: (mode: Mode) => void; onAsk: () => void }) {
  const t = useT();
  const items: [string, () => void][] = [
    [t("Give me a hint"), () => onChoose("hint")],
    [t("Let me try"), () => onChoose("tryIt")],
    [explains ? t("Show the explanation") : t("Show the solution"), () => onChoose("solution")],
    [t("Ask about this exercise"), onAsk],
  ];
  // The first choice takes the focus for the screen reader, but shows it only once the keyboard moves it (ChoiceRow
  // is plain white until the pointer or Tab reaches it).
  const [navigated, setNavigated] = useState(false);
  return (
    <nav
      className={`stage-menu${navigated ? " navigated" : ""}`}
      aria-label={t("What do you want to do?")}
      onKeyDown={(event) => {
        if (event.key === "Tab" || event.key.startsWith("Arrow")) setNavigated(true);
      }}
    >
      <p className="stage-menu-title">{t("What do you want to do?")}</p>
      <ol>
        {items.map(([label, action], index) => (
          <li key={index}>
            <button type="button" onClick={action} autoFocus={index === 0}>
              <span className="stage-menu-number">{index + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * The question's flight from the page to the stage (QuestionOverlay: `arrived`): it shows where it was clicked, waits
 * a beat (0.15 s), then slides to its place with the Mac's spring (0.5 / 0.86). Measured FLIP-style: the lifted crop is
 * laid out where it settles, a transform puts it back over its box on the page, and the spring takes the transform
 * away. It flies once its size is known (the page's letters set it); with Reduce Motion it only fades in.
 */
class QuestionFlight {
  private state: "waiting" | "holding" | "flying" | "done" = "waiting";
  private opened = 0;

  /** `pieces`: what flies, inside the holder (the PDF's crops, or the screen question's one view). */
  constructor(private readonly pieces: string) {}

  /**
   * Puts each lifted crop back over its own box on the page (the statement over the statement, the part over the
   * part, whatever lies between them there); the transforms, or null when they can't be measured.
   */
  private pin(element: HTMLElement, targets: readonly DOMRectReadOnly[]): string[] | null {
    const crops = [...element.querySelectorAll<HTMLElement>(this.pieces)];
    if (crops.length === 0 || crops.length !== targets.length) return null;
    for (const crop of crops) crop.style.transform = "";
    const transforms: string[] = [];
    for (const [index, crop] of crops.entries()) {
      const settled = crop.getBoundingClientRect();
      const target = targets[index]!;
      if (settled.width < 1 || target.width < 1) return null;
      // Fitted inside its box on the screen: a typeset reading need not have the picture's shape.
      const k = Math.min(target.width / settled.width, target.height / Math.max(1, settled.height));
      // In the crop's own pixels: the stage's column may be zoomed (StageScale).
      const zoom = cssZoom(crop);
      const dx = (target.left - settled.left) / zoom;
      const dy = (target.top - settled.top) / zoom;
      transforms.push(`translate(${dx}px, ${dy}px) scale(${k})`);
    }
    crops.forEach((crop, index) => {
      crop.style.transformOrigin = "0 0";
      crop.style.transform = transforms[index]!;
    });
    return transforms;
  }

  /** Laid out (or resized while it waits): over its box on the page, before the first paint. */
  laidOut(element: HTMLElement, targets: readonly DOMRectReadOnly[]) {
    if (this.state === "holding") {
      this.pin(element, targets);
      return;
    }
    if (this.state !== "waiting") return;
    if (reducedMotion()) {
      this.state = "done";
      return;
    }
    element.style.animation = "none";
    // Its size is final the moment it is known (no easing from the first guess), so the pin stays true.
    element.classList.add("stage-question-flying");
    this.opened = performance.now();
    if (this.pin(element, targets)) {
      this.state = "holding";
    } else {
      element.style.animation = "";
      element.classList.remove("stage-question-flying");
      this.state = "done";
    }
  }

  /** How long until it may fly: its beat on the page, longer while its size is not known. */
  delay(sized: boolean): number | null {
    if (this.state !== "holding") return null;
    const beat = Math.max(0, 150 - (performance.now() - this.opened));
    return sized ? beat : Math.max(beat, 400);
  }

  fly(element: HTMLElement, targets: readonly DOMRectReadOnly[]) {
    if (this.state !== "holding") return;
    const from = this.pin(element, targets);
    const crops = [...element.querySelectorAll<HTMLElement>(this.pieces)];
    for (const crop of crops) crop.style.transform = "";
    if (!from) {
      element.classList.remove("stage-question-flying");
      this.state = "done";
      return;
    }
    this.state = "flying";
    const timing = {
      duration: springDuration(Springs.arrive) * 1000,
      easing: CSS.supports("animation-timing-function", "linear(0, 1)")
        ? springEasing(Springs.arrive)
        : "cubic-bezier(0.2, 0.9, 0.3, 1.05)",
    };
    const flights = crops.map((crop, index) =>
      crop.animate([{ transform: from[index]! }, { transform: "none" }], timing),
    );
    const land = () => {
      element.classList.remove("stage-question-flying");
      this.state = "done";
    };
    void Promise.all(flights.map((flight) => flight.finished)).then(land, land);
  }
}

/** Where each lifted crop was on the page, in the window: the page's box for the part, scaled to every region. */
function sourceRects(frame: OpenedQuestion["frame"], bounds: Rect, regions: readonly Rect[]): DOMRectReadOnly[] {
  const perPoint = frame.width / Math.max(1e-6, bounds.width);
  return regions.map(
    (region) =>
      new DOMRectReadOnly(
        frame.left + (region.x - bounds.x) * perPoint,
        frame.top + (Rects.maxY(bounds) - Rects.maxY(region)) * perPoint,
        region.width * perPoint,
        region.height * perPoint,
      ),
  );
}

function useQuestionFlight(
  holder: React.RefObject<HTMLDivElement | null>,
  targets: readonly DOMRectReadOnly[],
  laidOut: boolean,
  sized: boolean,
  scale: number,
  pieces = ":scope > .stage-crop",
) {
  const [flight] = useState(() => new QuestionFlight(pieces));
  useLayoutEffect(() => {
    if (holder.current && laidOut) flight.laidOut(holder.current, targets);
  }, [flight, holder, targets, laidOut, scale]);
  useEffect(() => {
    const delay = flight.delay(sized);
    if (delay === null) return;
    const timer = window.setTimeout(() => {
      if (holder.current) flight.fly(holder.current, targets);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [flight, holder, targets, laidOut, sized]);
}

/** The stage's height in the column's own pixels, which StageScale enlarges. */
function stageHeight(): number {
  const windowHeight = window.innerHeight || 800;
  return windowHeight / StageScale.factor(windowHeight);
}

/**
 * The work's own height on this stage (the Mac's `panelHeight`), told by the solution as it measures itself, so the
 * compact question gives up only the room it needs.
 */
const PanelHeight = createContext<{ height: number; measured: (height: number) => void }>({
  height: 0,
  measured: () => {},
});

/** The question lifted off the page: drawn by pdf.js, white on the dark stage, with the open step's data underlined. */
function QuestionCrop({
  document,
  opened,
  page,
  session,
  compact,
}: {
  document: ReaderDocument;
  opened: OpenedQuestion;
  page: PageText | null;
  session: QuestionSession | null;
  compact: boolean;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const question = opened.question;
  // The group's statement printed above a part on the same page is lifted with it, as its own crop (the parts in
  // between stay on the page).
  const regions = useMemo(() => {
    const statement = question.statementBounds;
    if (!statement || question.statementPageIndex !== null) return [question.bounds];
    // The two crops' padding may touch: the statement ends where the part's crop begins.
    const top = Rects.maxY(question.bounds);
    const bottom = Math.max(statement.y, top);
    const clipped = { ...statement, y: bottom, height: Rects.maxY(statement) - bottom };
    return clipped.height > 4 ? [clipped, question.bounds] : [question.bounds];
  }, [question]);

  useLayoutEffect(() => {
    const element = holder.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Sized by its letters (QuestionOverlay's Stage): body text at 17 pt while it is read, 14 pt after «Solution»,
  // never wider than the column nor taller than its share of the window. One scale for both crops.
  const body = useMemo(() => (page ? bodyFontSize(page, question.bounds) : 11), [page, question]);
  const widest = Math.max(...regions.map((region) => region.width));
  const tall = regions.reduce((sum, region) => sum + region.height, 0);
  const panel = useContext(PanelHeight).height;
  const available = stageHeight();
  const scale =
    width === 0
      ? 1
      : questionScale({
          body,
          compact,
          fits: width / widest,
          height: tall,
          available,
          panel,
          compactWindow: available <= compactStageHeight,
        });

  const sources = useMemo(
    () => sourceRects(opened.frame, question.bounds, regions),
    [opened.frame, question.bounds, regions],
  );
  useQuestionFlight(holder, sources, width > 0, page !== null, scale);

  return (
    <div className="stage-question" ref={holder}>
      {regions.map((region, index) => (
        <CropPiece
          key={index}
          document={document}
          pageIndex={opened.pageIndex}
          region={region}
          scale={scale}
          ready={width > 0}
          page={page}
          session={session}
          label={index === regions.length - 1 ? question.text : undefined}
          role={index === regions.length - 1 ? "question" : "statement"}
          hasStatement={regions.length > 1}
        />
      ))}
    </div>
  );
}

function CropPiece({
  document,
  pageIndex,
  region,
  scale,
  ready,
  page,
  session,
  label,
  role = "question",
  hasStatement = false,
}: {
  document: ReaderDocument;
  pageIndex: number;
  region: Rect;
  scale: number;
  ready: boolean;
  page: PageText | null;
  session: QuestionSession | null;
  label?: string;
  /** Which lifted crop this is: the part's question, or its group's statement above it. */
  role?: "question" | "statement";
  hasStatement?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Bumped once the page is drawn, so the tinted letters are copied from the drawn crop.
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    if (!canvas.current || !ready) return;
    void document
      .renderRegion(
        pageIndex,
        canvas.current,
        region,
        scale,
        (window.devicePixelRatio || 1) * cssZoom(canvas.current),
        stageInk(canvas.current),
      )
      .then(() => setDrawn((count) => count + 1));
  }, [document, pageIndex, region, scale, ready]);
  const version = session?.version;
  const lessonShows = useLessonShows();
  const voice = useVoiceState();
  const voiceLit = voice.lit;
  // The formula the caption writes (not one already on screen): a mark on one of its symbols is drawn there, and only a
  // mark that names something else goes on the page (the Mac's FigureLabels.goesOnThePage).
  const written = session
    ? VoiceFormula.formulas(
        voiceLit,
        voice.formula,
        new Set(voiceLit.map((_, index) => index)),
        session.onScreenText,
      ).join(String.raw` \qquad `)
    : "";
  const spoken = voice.spoken ?? "";
  const shows = useMemo(
    () => [
      ...lessonShows,
      ...voiceLit.flatMap((command): LessonShow[] =>
        (command.kind.op === "highlight" || command.kind.op === "circle") &&
        (written === "" || SpeechMarkLayout.namesSomethingElse(command, written, spoken))
          ? [{ op: command.kind.op === "circle" ? "circle" : "underline", quote: command.kind.term, on: "voice" }]
          : [],
      ),
    ],
    [lessonShows, voiceLit, written, spoken],
  );
  const marks = useMemo(
    () =>
      page && session
        ? cropMarks(page, region, session, shows)
        : {
            underlines: [],
            penUnderlines: [],
            circles: [],
            answer: null,
            highlights: [],
            strikes: [],
            pointers: [],
            tints: [],
          },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, region, session, version, shows],
  );
  // The model's box is a share of the picture it was sent: the question's whole area on the page (the group, its
  // statement and the part, QuestionPages.region), whichever crop it names. Placed on the page, it is drawn on the crop
  // it falls in. With no picture sent, it is a share of the crop "on" names.
  const sent = useMemo(() => (page && session ? sentArea(page, session.question) : null), [page, session]);
  const focusOnCrop = useCallback(
    (focus: Focus): Box | null => {
      const size = { width: region.width * scale, height: region.height * scale };
      if (sent) return StepFocusGeometry.onCrop(focus, sent, region, size);
      const on = focus.on?.toLowerCase() === "statement" && hasStatement ? "statement" : "question";
      return on === role ? StepFocusGeometry.rect(focus, size) : null;
    },
    [sent, region, scale, hasStatement, role],
  );
  // While the mascot walks the steps, the step's datum magnified in a lens (QuoteLoupe): its spot on the crop, else
  // the first of its data underlined. Not with Reduce Motion.
  const lens = useMemo(() => {
    const width = region.width * scale;
    const height = region.height * scale;
    if (!session || session.mascotFocusStep === null || reducedMotion() || width <= 1 || height <= 1) return null;
    const crop = { width, height };
    const focus = session.part?.cards?.[session.mascotFocusStep]?.focus ?? null;
    const spot = focus ? focusOnCrop(focus) : null;
    const line = marks.underlines[0] ?? marks.penUnderlines[0];
    const target = spot ?? (line ? cropBox(line, region, scale) : null);
    if (!target) return null;
    const zoom = spot ? StepFocusGeometry.zoom(spot, crop) : QuoteLoupeScale;
    const box = StepFocusGeometry.lens(target, zoom, { x: 0, y: 0, width, height });
    return { box, zoom, anchor: StepFocusGeometry.zoomAnchor(target, box, zoom), target };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, version, marks, region, scale, role, hasStatement]);
  // The mascot waits beside the datum, level with it, past the crop's edge (MascotGuide.spot); not with Reduce Motion,
  // where the lens is not shown either.
  const cropElement = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = cropElement.current;
    if (!lens || !element) return;
    const crop = element.getBoundingClientRect();
    // The lens is in the crop's own pixels; the window's are larger when the stage is zoomed (StageScale).
    const zoom = cssZoom(element);
    const datum = {
      x: crop.left + lens.target.x * zoom,
      y: crop.top + lens.target.y * zoom,
      width: lens.target.width * zoom,
      height: lens.target.height * zoom,
    };
    const text = { x: crop.left, y: crop.top, width: crop.width, height: crop.height };
    GuideSpots.set(MascotGuide.spot(datum, text, { width: window.innerWidth, height: window.innerHeight }, mascotSize));
    return () => GuideSpots.set(null);
  }, [lens]);
  const toCrop = (rect: Rect) => ({
    left: (rect.x - region.x) * scale,
    top: (region.y + region.height - (rect.y + rect.height)) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  });
  return (
    <div
      className="stage-crop"
      ref={cropElement}
      style={{ width: region.width * scale, height: region.height * scale }}
    >
      <canvas
        ref={canvas}
        style={{ width: region.width * scale, height: region.height * scale }}
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      />
      {marks.underlines.map((rect, index) => {
        const box = toCrop(rect);
        return (
          <span
            key={`u${index}`}
            className="stage-underline"
            style={{ left: box.left, top: box.top + box.height - 2, width: box.width }}
          />
        );
      })}
      {marks.penUnderlines.map((rect) => {
        // The lesson's line under words, past their ends (LessonLayer: the words' box, 2 pt wider each side).
        const box = toCrop(rect);
        return (
          <HandDrawnMark
            key={`pu${rect.x},${rect.y}`}
            style="underline"
            rect={{ x: box.left - 2, y: box.top, width: box.width + 4, height: box.height }}
            delay={0.05}
          />
        );
      })}
      {marks.circles.map((rect) => {
        // The lesson's ring round a value or a part, clear of every letter (LessonEvidence.ringBox).
        const box = toCrop(rect);
        return (
          <HandDrawnMark
            key={`c${rect.x},${rect.y}`}
            style="circle"
            rect={LessonEvidence.ringBox({ x: box.left, y: box.top, width: box.width, height: box.height })}
            delay={0.1}
          />
        );
      })}
      {marks.answer &&
        (() => {
          // The option the answer names, circled on the question itself (QuestionOverlay.answerRing).
          const box = toCrop(marks.answer);
          return (
            <HandDrawnMark
              style="circle"
              rect={{ x: box.left - 4, y: box.top - 3, width: box.width + 8, height: box.height + 6 }}
              delay={0.35}
            />
          );
        })()}
      {session && (
        <StepFocusMark
          session={session}
          place={focusOnCrop}
          width={region.width * scale}
          height={region.height * scale}
          lens={lens?.box ?? null}
        />
      )}
      {lens && <LensLayer base={canvas} drawn={drawn} width={region.width * scale} lens={lens} />}
      {marks.tints.length > 0 && (
        <TintLayer
          base={canvas}
          drawn={drawn}
          width={region.width * scale}
          height={region.height * scale}
          boxes={marks.tints.map((rect) => toCrop(Rects.inset(rect, -1, -1)))}
        />
      )}
      {marks.highlights.map((rect, index) => (
        <span key={`h${index}`} className="stage-highlight" style={toCrop(Rects.inset(rect, -4, -2))} />
      ))}
      {marks.strikes.map((rect, index) => (
        <span key={`s${index}`} className="stage-strike" style={toCrop(Rects.inset(rect, -4, -2))} />
      ))}
      {marks.pointers.map((pointer, index) => {
        const box = toCrop(pointer.rect);
        return (
          <FocusPointer
            key={`p${index}`}
            region={{ x: box.left, y: box.top, width: box.width, height: box.height }}
            arrow={pointer.arrow}
            note={pointer.note}
            width={region.width * scale}
            height={region.height * scale}
            overshoot={60}
          />
        );
      })}
      {session?.showsTiming && session.timing && session.timingLevels && (
        // The filled-in rows, in blue exactly on the printed diagram, one row after another like a pen.
        <svg className="stage-timing" width={region.width * scale} height={region.height * scale} aria-hidden="true">
          {TimingDiagrams.rowsToFill(session.timing).map((row, index) => {
            const levels = session.timingLevels?.[row.name];
            if (!levels) return null;
            const points = timingPath(session.timing!, row, levels).map(
              (point) => `${(point.x - region.x) * scale},${(region.y + region.height - point.y) * scale}`,
            );
            return (
              <polyline
                key={row.name}
                points={points.join(" ")}
                pathLength={1}
                className="stage-timing-row"
                style={{ animationDelay: `${index * 0.7}s` }}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** Where the open step's data stands in the crop (its printed lines), and the right option of a multiple choice. */
/** The mascot's side, as the lesson draws it (`AnimatedMascot`'s size). */
const mascotSize = stageMascotSize;

/** How far a quoted datum is magnified in the lens (`QuoteLoupe.scale`). */
const QuoteLoupeScale = 1.7;

/** A page rectangle (PDF points, y up) as a box of the crop drawn at `scale` (pixels, y down). */
function cropBox(rect: Rect, region: Rect, scale: number): Box {
  return {
    x: (rect.x - region.x) * scale,
    y: (region.y + region.height - (rect.y + rect.height)) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

/**
 * The datum magnified in a lens over the crop (the Mac's QuoteLoupe): a dark ground hides the ink under it, so the datum
 * shows once, larger, scaled about the point that carries it to the lens' centre.
 */
function LensLayer({
  base,
  drawn,
  width,
  lens,
}: {
  base: React.RefObject<HTMLCanvasElement | null>;
  drawn: number;
  width: number;
  lens: { box: Box; zoom: number; anchor: { x: number; y: number } };
}) {
  const layer = useRef<HTMLCanvasElement>(null);
  const { box, zoom, anchor } = lens;
  useEffect(() => {
    const source = base.current;
    const target = layer.current;
    if (!source || !target || source.width === 0 || width <= 0) return;
    const ratio = source.width / width;
    target.width = Math.max(1, Math.round(box.width * ratio));
    target.height = Math.max(1, Math.round(box.height * ratio));
    const context = target.getContext("2d");
    if (!context) return;
    // A point x of the crop is drawn at anchor + zoom·(x − anchor): the lens shows the crop from there.
    const sx = anchor.x + (box.x - anchor.x) / zoom;
    const sy = anchor.y + (box.y - anchor.y) / zoom;
    context.clearRect(0, 0, target.width, target.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(
      source,
      sx * ratio,
      sy * ratio,
      (box.width / zoom) * ratio,
      (box.height / zoom) * ratio,
      0,
      0,
      target.width,
      target.height,
    );
  }, [base, drawn, width, box, zoom, anchor]);
  return (
    <div
      className="stage-lens"
      aria-hidden="true"
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
    >
      <canvas ref={layer} style={{ width: box.width, height: box.height }} />
    </div>
  );
}

/**
 * Quoted words coloured in place (the Mac's QuoteTint): the crop's own letters inside each box are copied and
 * recoloured, so exactly the glyphs turn blue, crisp, with nothing drawn round them.
 */
function TintLayer({
  base,
  drawn,
  width,
  height,
  boxes,
}: {
  base: React.RefObject<HTMLCanvasElement | null>;
  drawn: number;
  width: number;
  height: number;
  boxes: { left: number; top: number; width: number; height: number }[];
}) {
  const layer = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(boxes);
  useEffect(() => {
    const source = base.current;
    const target = layer.current;
    if (!source || !target || source.width === 0 || width <= 0) return;
    target.width = source.width;
    target.height = source.height;
    const context = target.getContext("2d");
    if (!context) return;
    const ratio = source.width / width;
    context.clearRect(0, 0, target.width, target.height);
    for (const box of JSON.parse(key) as typeof boxes) {
      const x = Math.max(0, box.left * ratio);
      const y = Math.max(0, box.top * ratio);
      const w = Math.min(target.width - x, box.width * ratio);
      const h = Math.min(target.height - y, box.height * ratio);
      if (w > 0 && h > 0) context.drawImage(source, x, y, w, h, x, y, w, h);
    }
    const accent = getComputedStyle(target).getPropertyValue("--stage-accent").trim() || "#0a84ff";
    context.globalCompositeOperation = "source-atop";
    context.fillStyle = accent;
    context.fillRect(0, 0, target.width, target.height);
    context.globalCompositeOperation = "source-over";
  }, [base, drawn, width, key]);
  return <canvas ref={layer} className="stage-tint" style={{ width, height }} aria-hidden="true" />;
}

/**
 * The spot the open step is about (`StepFocusMarks`), on the crop the model placed it in: a ring or an arrow that draws
 * itself, and a few words beside it, on the side where they are out of the way.
 */
function StepFocusMark({
  session,
  place,
  width,
  height,
  lens = null,
}: {
  session: QuestionSession;
  /** Where a step's spot is on this crop, or null when it is on another one. */
  place: (focus: Focus) => Box | null;
  width: number;
  height: number;
  /** The lens showing the spot magnified: it is the spot's one mark, and the label keeps clear of it. */
  lens?: Box | null;
}) {
  const step = session.underlinedStep;
  const focus = step !== null ? (session.part?.cards?.[step]?.focus ?? null) : null;
  if (!focus) return null;
  const region = place(focus);
  if (!region) return null;
  const note = focus.note?.trim() ? focus.note.trim() : null;
  return (
    <FocusPointer
      region={lens ?? region}
      arrow={StepFocusGeometry.isArrow(focus)}
      note={note}
      width={width}
      height={height}
      showsMark={lens === null}
      avoiding={lens}
    />
  );
}

/** A ring or a self-drawing arrow on a spot of the crop (crop pixels), and its note where it is out of the way. */
function FocusPointer({
  region,
  arrow,
  note,
  width,
  height,
  overshoot = 0,
  showsMark = true,
  avoiding = null,
}: {
  region: Box;
  arrow: boolean;
  note: string | null;
  width: number;
  height: number;
  /** How far past the crop's bottom the label may reach (the lesson's 60: the room under a question is free). */
  overshoot?: number;
  /** False when the spot is already shown in a lens: only the label is drawn. */
  showsMark?: boolean;
  /** A lens the label must never cover. */
  avoiding?: Box | null;
}) {
  const place = StepFocusMarks.placement(
    note,
    arrow && showsMark,
    region,
    { x: 0, y: 0, width, height },
    overshoot,
    avoiding,
  );
  return (
    <>
      {!showsMark ? null : arrow ? (
        <svg className="stage-focus-arrow" width={width} height={height} aria-hidden="true">
          <path d={StepFocusMarks.arrowPath(place.tail, StepFocusMarks.arrowTip(place.tail, region))} pathLength={1} />
        </svg>
      ) : (
        <HandDrawnMark
          key={`${region.x},${region.y}`}
          style="circle"
          rect={{ x: region.x - 6, y: region.y - 6, width: region.width + 12, height: region.height + 12 }}
          delay={0.1}
        />
      )}
      {note && (
        <span className="stage-focus-note" style={{ left: place.label.x, top: place.label.y }}>
          {note}
        </span>
      )}
    </>
  );
}

/** The marks on the question's crop, by kind (`LessonLayer`'s marks). */
interface CropMarks {
  /** The open step's data, each under a straight line (`StatementUnderlines`). */
  underlines: Rect[];
  /** The lesson's words, under a pen's line. */
  penUnderlines: Rect[];
  /** The lesson's values and parts, in a pen's loop. */
  circles: Rect[];
  /** The option the answer names, circled once the answer is shown. */
  answer: Rect | null;
  /** Filled in the blue, with a blue edge. */
  highlights: Rect[];
  /** Dimmed, one line drawn through: a part that does not hold. */
  strikes: Rect[];
  /** An arrow to a spot, or a ring with a note (`StepFocusMarks`): the lesson's "arrow", and "circle" with a note. */
  pointers: { rect: Rect; arrow: boolean; note: string | null }[];
  /** Quoted words with their own letters coloured in the blue. */
  tints: Rect[];
}

function cropMarks(
  page: PageText,
  region: Rect,
  session: QuestionSession,
  lessonShows: readonly LessonShow[] = [],
): CropMarks {
  const inside = (rect: Rect) => Rects.contains(region, { x: Rects.midX(rect), y: Rects.midY(rect) });
  const firstInside = (quote: string) =>
    StatementQuotes.ranges(quote, page.text).find((range) => {
      const lines = linesOf(page, range.start, range.end - range.start);
      return lines.length > 0 && lines.every((line) => inside(line.bounds));
    });
  const underlines: Rect[] = [];
  const step = session.underlinedStep;
  if (step !== null) {
    for (const { quote } of session.verifiedQuotes(step)) {
      const range = firstInside(quote);
      if (range) underlines.push(...linesOf(page, range.start, range.end - range.start).map((line) => line.bounds));
    }
  }
  // The right option, circled on the question itself, once the answer is shown.
  const circles: Rect[] = [];
  const penUnderlines: Rect[] = [];
  let answer: Rect | null = null;
  const part = session.part;
  const answerShown = session.mode === "solution" || session.showsAnswer;
  if (part && answerShown && session.isConfirmed) {
    const options = ChoiceCheck.options(part.label, session.question.groupText, session.partLabels);
    const letters = [...ChoiceCheck.letters(part.answer.text)].filter((letter) => options.has(letter));
    if (letters.length === 1) {
      const letter = letters[0]!;
      for (const match of page.text.matchAll(new RegExp(`\\(?${letter}\\)`, "g"))) {
        const lines = linesOf(page, match.index, match[0].length);
        if (lines.length === 1 && inside(lines[0]!.bounds)) {
          answer = lines[0]!.bounds;
          break;
        }
      }
    }
  }
  const highlights: Rect[] = [];
  const strikes: Rect[] = [];
  /** Where a beat's mark goes, by its op: a ring, a line through, a fill, or a line under. */
  const pointers: CropMarks["pointers"] = [];
  const tints: Rect[] = [];
  const place = (op: string, rects: Rect[], note: string | null = null) => {
    if ((op === "arrow" || (op === "circle" && note)) && rects.length > 0) {
      pointers.push({
        rect: rects.reduce<Rect>((all, rect) => Rects.union(all, rect) ?? all, rects[0]!),
        arrow: op === "arrow",
        note,
      });
      return;
    }
    if (op === "tint") tints.push(...rects);
    else if (op === "crossOut") strikes.push(...rects);
    else if (op === "highlight") highlights.push(...rects);
    else if (op === "circle" || op === "zoom") circles.push(...rects);
    else penUnderlines.push(...rects);
  };
  // The beat being said marks the words it talks about, and rings the option it names, or strikes it out.
  for (const show of lessonShows) {
    // A ring on the side graph is the graph's to draw (`LessonRun.pictureMarks`).
    if (LessonShows.isOnGraph(show)) continue;
    // As LessonGeometry.region on a PDF page: the option it names, else a word printed in a figure (found in the page's
    // text), else the words it quotes, else a box the model drew. No mark is better than a wrong one.
    const optionLine = (() => {
      if (!show.option) return null;
      for (const match of page.text.matchAll(new RegExp(`\\(?${show.option.toUpperCase()}[.)]`, "g"))) {
        const lines = linesOf(page, match.index, match[0].length);
        if (lines.length === 1 && inside(lines[0]!.bounds)) return lines[0]!.bounds;
      }
      return null;
    })();
    if (optionLine) {
      place(
        show.op === "crossOut" || show.op === "arrow" ? show.op : "circle",
        [optionLine],
        show.note?.trim() || null,
      );
      continue;
    }
    const labelRange = show.label?.trim() ? firstInside(show.label.trim()) : undefined;
    // The voice tutor's mark goes on the printed label (FigureLabels): a label on its own wins over the same letters
    // inside a word, and it is written the ways a page writes it (H⁺, SO₄, (B)).
    const voiceRange =
      show.on === "voice" && show.quote?.trim()
        ? FigureLabels.range(show.quote.trim(), page.text, (start, end) => {
            const lines = linesOf(page, start, end - start);
            return lines.length > 0 && lines.every((line) => inside(line.bounds));
          })
        : null;
    const range =
      labelRange ??
      (voiceRange ? { start: voiceRange[0], end: voiceRange[1] } : undefined) ??
      (show.quote?.trim() ? firstInside(show.quote.trim()) : undefined);
    // Marked in place as the Mac's LessonEvidence does on a question that reads clearly (a PDF does): words tinted,
    // a lone value or a part of a figure ringed. The voice's own marks keep their verb.
    const inPlace = (quote: string | null, onFigure: boolean) =>
      show.on === "voice"
        ? show.op
        : LessonEvidence.inPlaceOp({ op: show.op, quote, note: show.note?.trim() || null, onFigure }, true);
    if (range) {
      const onFigure = labelRange !== undefined;
      place(
        inPlace(onFigure ? show.label!.trim() : (show.quote?.trim() ?? null), onFigure),
        linesOf(page, range.start, range.end - range.start).map((line) => line.bounds),
        show.note?.trim() || null,
      );
      continue;
    }
    const box = show.box ? LessonGeometry.box(show.box) : null;
    if (box)
      // As shares of the question's picture, from its top-left corner.
      place(
        inPlace(null, false),
        [
          {
            x: region.x + box.x * region.width,
            y: region.y + region.height - (box.y + box.height) * region.height,
            width: box.width * region.width,
            height: box.height * region.height,
          },
        ],
        show.note?.trim() || null,
      );
  }
  return { underlines, penUnderlines, circles, answer, highlights, strikes, pointers, tints };
}

/** Content scaled down (never up) to the width it is given, keeping its top left (the Mac's `scaledToFit` formulas). */
function FitWidth({ children }: { children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    // Both in their own pixels, which the content's zoom does not change: no loop.
    const measure = () => {
      const natural = content.offsetWidth;
      const room = box.clientWidth;
      const next = natural > room && room > 0 ? room / natural : 1;
      setScale((now) => (Math.abs(now - next) < 0.005 ? now : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={outer} className="stage-fit-width">
      <div ref={inner} className="stage-fit-width-content" style={scale < 1 ? { zoom: scale } : undefined}>
        {children}
      </div>
    </div>
  );
}

/**
 * The formulas the solution uses (`FormulaList`): «Formulas», then each one's name small and its formula under it,
 * made smaller to fit the column, never cut or slid sideways.
 */
function FormulaList({ formulas }: { formulas: readonly { name: string; latex: string }[] }) {
  const t = useT();
  if (formulas.length === 0) return null;
  return (
    <>
      <h3 className="stage-formulas-title">{t("Formulas")}</h3>
      {formulas.map((formula) => (
        <div key={formula.name + formula.latex} className="stage-formula">
          <span>{formula.name}</span>
          <FitWidth>
            <MathView latex={formula.latex} display />
          </FitWidth>
        </div>
      ))}
    </>
  );
}

/** The formulas at hand once a mode is chosen (`formulasAtHand`): none for a similar question. */
function formulasAtHand(session: QuestionSession) {
  const solution = session.solution;
  const part = session.part;
  if (!solution || !part || session.mode === null || session.mode === "variant") return [];
  return formulasFor(solution, part);
}

/**
 * What goes beside the question before the solution is open (QuestionOverlay's `hasSideContent` and `sideColumn`):
 * the drawing, the formulas at hand and the curve. The solution lays these out in its own columns.
 */
function hasStageExtras(session: QuestionSession | null): boolean {
  if (!session || session.mode === null || session.mode === "solution" || session.mode === "variant") return false;
  return (
    (session.showsGraph && Boolean(session.sideGraph) && session.hasGraph) ||
    session.showsIllustrationPanel ||
    formulasAtHand(session).length > 0
  );
}

/** The stage's side column (`sideColumn`), or the same under the work when the window has no room for it. */
function StageExtras({ session, atSide }: { session: QuestionSession; atSide: boolean }) {
  const graph = session.sideGraph;
  return (
    <>
      {session.showsIllustrationPanel && <IllustrationPanel session={session} />}
      <div className="stage-formulas">
        <FormulaList formulas={formulasAtHand(session)} />
      </div>
      {session.showsGraph && graph && session.hasGraph && (
        <div className={atSide ? "stage-side-graph" : undefined}>
          <CurveGraph graph={graph} session={session} height={atSide ? 280 : 260} />
        </div>
      )}
    </>
  );
}

function ModeView({ session, extrasAtSide = false }: { session: QuestionSession; extrasAtSide?: boolean }) {
  const extras = hasStageExtras(session) && !extrasAtSide;
  const view = <ModeContent session={session} />;
  if (!extras) return view;
  return (
    <>
      {view}
      <StageExtras session={session} atSide={false} />
    </>
  );
}

function ModeContent({ session }: { session: QuestionSession }) {
  const t = useT();
  const state = session.state;
  if (session.needsTranscript) return <TranscriptRequest session={session} />;
  if (state.kind === "needsKey") {
    return (
      <div className="stage-notice">
        <p>{t("Sign in to LearnLayer in Settings to get explanations.")}</p>
        <button type="button" className="stage-button" onClick={() => void showMain("account")}>
          {t("Sign in")}
        </button>
        <Actions session={session} />
      </div>
    );
  }
  if (state.kind === "failed") {
    const message = failureMessage(state.error);
    return (
      <div className="stage-notice" role="alert">
        <p>{t(message.key, ...message.args)}</p>
        {offersUpgrade(state.error) ? (
          <button type="button" className="stage-button" onClick={() => void showMain("plan")}>
            {t("Upgrade")}
          </button>
        ) : (
          <button type="button" className="stage-button" onClick={() => void session.load()}>
            {t("Try Again")}
          </button>
        )}
        <Actions session={session} />
      </div>
    );
  }
  switch (session.mode) {
    case "hint":
      return <HintView session={session} />;
    case "tryIt":
      return <TryView session={session} />;
    case "followUp":
      return <FollowUpView session={session} />;
    case "variant":
      return <VariantView session={session} />;
    default:
      return <SolutionView session={session} />;
  }
}

/** The progress line while the solve is on its way: phrases only for stages that really started. */
function Progress({ session }: { session: QuestionSession }) {
  const t = useT();
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 500);
    return () => clearInterval(timer);
  }, []);
  const phrase =
    session.isSlowToStart && session.streamed === null ? "Thinking…" : (session.progressPhrase() ?? "Reading…");
  return (
    <p className="stage-progress" role="status" aria-live="polite">
      <span className="stage-progress-dot" aria-hidden="true" />
      {t(phrase)}
    </p>
  );
}

function HintView({ session }: { session: QuestionSession }) {
  const t = useT();
  const part = session.part;
  const count = session.stepCount;
  const shown = Math.min(session.revealedSteps, count);
  // One step on: its formula morphs from the one before. Any other move shows it as it is.
  const [moved, setMoved] = useState({ shown, forward: false });
  if (moved.shown !== shown) setMoved({ shown, forward: shown === moved.shown + 1 && shown >= 2 });
  if (session.state.kind === "loading" || !part) return <Progress session={session} />;
  return (
    <div className="stage-panel">
      <p className="stage-hint">
        <Icon symbol="lightbulb" size={18} className="stage-hint-icon" />
        <MathText text={part.hint} />
      </p>
      {shown > 0 && <StepCard part={part} index={shown - 1} session={session} advanced={moved.forward} />}
      {session.showsAnswer && <AnswerBox part={part} language={session.notationLanguage} />}
      <div className="stage-stepper">
        <span className="stage-dots" aria-hidden="true">
          {Array.from({ length: count + 1 }, (_, index) => (
            <span key={index} className={index < session.revealedSteps ? "on" : ""} />
          ))}
        </span>
        {session.hasMoreSolution && (
          <button type="button" className="stage-link" onClick={() => session.nextStep()}>
            {t("Next")}
          </button>
        )}
      </div>
      <Actions session={session} />
    </div>
  );
}

function TryView({ session }: { session: QuestionSession }) {
  const t = useT();
  const [attempt, setAttempt] = useState("");
  const part = session.part;
  const result = session.attemptResult;
  // QuestionPanel.tryIt: what is asked, the field, the names it may use, then what the check found.
  const messages: Record<string, string> = {
    matches: t("That matches."),
    differs: t("Not yet: it differs from the expected result."),
    unreadable: t("I couldn’t read that expression."),
    checking: t("Checking the expected result…"),
  };
  if (part && session.state.kind !== "loading" && !session.canTry) {
    return (
      <div className="stage-panel">
        <p className="stage-asks">
          {t("This part has no formula to check. Try writing your answer, then compare with the solution.")}
        </p>
        <Actions session={session} />
      </div>
    );
  }
  return (
    <div className="stage-panel">
      {part && (
        <p className="stage-asks">
          <MathText text={part.asks} />
        </p>
      )}
      <form
        className="stage-try"
        onSubmit={(event) => {
          event.preventDefault();
          if (attempt.trim() !== "") session.check(attempt);
        }}
      >
        <input
          autoFocus
          value={attempt}
          onChange={(event) => setAttempt(event.target.value)}
          placeholder={t("Your answer")}
          aria-label={t("Your answer")}
        />
      </form>
      {session.answerNames.length > 0 && (
        <p className="stage-try-help">
          {t("Use %@; * for ×, ^ for powers, sqrt(), abs().", session.answerNames.join(", "))}
        </p>
      )}
      {session.state.kind === "loading" && <Progress session={session} />}
      {result && (
        <p className={`stage-result stage-result-${result}`} role="status">
          {result === "matches" && <Icon symbol="checkmark.circle.fill" size={15} />}
          {messages[result]}
        </p>
      )}
      <Actions session={session} />
    </div>
  );
}

/** An element's width in its own pixels, kept as it changes (0 until it is laid out). */
function useWidth<T extends HTMLElement>(): [(element: T | null) => void, number] {
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((element: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!element) return;
    const measure = () => setWidth(Math.round(element.clientWidth));
    observer.current = new ResizeObserver(measure);
    observer.current.observe(element);
    measure();
  }, []);
  return [ref, width];
}

/**
 * The solution's columns (QuestionOverlay with ExplanationLayout): words and figures side by side only when there is
 * a figure, a graph or a drawing, by the Mac's sums; without one, the formulas go in the stage's side column when the
 * window has room for it (≥ 1000 pt, `min(440, 34 %)`, the work at most 720 beside it), else after the steps.
 */
function solutionColumns(
  width: number,
  hasFigure: boolean,
  hasFormulas: boolean,
): { style: React.CSSProperties | undefined; figureColumn: boolean; compactWindow: boolean } {
  const compactWindow = stageHeight() <= compactStageHeight;
  const style = columnsStyle(width, hasFigure, hasFormulas);
  const figureColumn = style !== undefined && hasFigure;
  return { style, figureColumn, compactWindow };
}

/**
 * The answer on top, the whole width (`answerIsAbove`): in one column it heads it anyway; beside a figure (or in a
 * compact window) only a typeset answer longer than 36 characters goes above; otherwise it heads the column of words.
 */
function answerIsAbove(part: Part, columns: ReturnType<typeof solutionColumns>): boolean {
  if (!columns.style) return true;
  if (!columns.figureColumn && !columns.compactWindow) return false;
  const latex = part.answerLatex;
  if (!latex || LatexText.isProse(latex)) return false;
  return [...LatexText.unicode(latex)].length > 36;
}

function columnsStyle(width: number, hasFigure: boolean, hasFormulas: boolean): React.CSSProperties | undefined {
  if (width <= 0) return undefined;
  const compactWindow = stageHeight() <= compactStageHeight;
  const margin = StageGeometry.edge(compactWindow);
  const windowWidth = width + 2 * margin;
  const columns = ExplanationLayout.make({
    windowWidth,
    margin,
    stackedWidth: width,
    hasFigure,
    compact: compactWindow,
  });
  if (columns.arrangement === "sideBySide" && columns.figureWidth !== null) {
    return {
      gridTemplateColumns: `${columns.textWidth}px ${columns.figureWidth}px`,
      columnGap: columns.gutter,
    };
  }
  if (!hasFigure && hasFormulas && windowWidth >= 1000) {
    const side = Math.min(440, 0.34 * windowWidth);
    const work = Math.min(720, width - side - 36);
    return { gridTemplateColumns: `${work}px ${side}px`, columnGap: 36, justifyContent: "space-between" };
  }
  return undefined;
}

function SolutionView({ session }: { session: QuestionSession }) {
  const t = useT();
  const part = session.part;
  const solution = session.solution;
  const panelHeight = useContext(PanelHeight);
  const [bodyRef, bodyWidth] = useWidth<HTMLDivElement>();

  // The steps come in one after another the first time the solution is shown.
  useEffect(() => {
    if (session.mode !== "solution" || !part) return;
    const controller = new AbortController();
    void session.runCascade({ reduceMotion: reducedMotion(), signal: controller.signal });
    return () => controller.abort();
  }, [session, part, session.solutionKey]);

  if (!part || !solution) {
    // A text answer shows its passage at once, while the answer comes.
    return (
      <div className="stage-panel">
        {session.expectsTextAnswer && <p className="stage-passage">{session.streamedPassage.text}</p>}
        <Progress session={session} />
      </div>
    );
  }
  const evidence = session.evidenceAnswer;
  const formulas = formulasFor(solution, part);
  const visible = session.visibleSolutionSteps;
  // The figure, the curve and the drawing go in the right column, under the formulas.
  const side =
    !evidence &&
    (session.solutionFigure !== null ||
      session.expectsFigure ||
      (session.showsGraph && session.hasGraph) ||
      session.showsIllustrationPanel);
  // A short window (`compactSolution`): beside the steps only the figure, at most 200 tall; the formulas and the
  // graph (150) under them.
  const shortWindow = stageHeight() <= compactStageHeight && evidence === null;
  const columns = solutionColumns(bodyWidth, side, formulas.length > 0 && !shortWindow);
  const above = evidence !== null || answerIsAbove(part, columns);
  const answer = <AnswerBox part={part} language={session.notationLanguage} />;
  // One column with a figure (a narrow window): the figure above the steps, small; the graph and the drawing after
  // the work, then the formulas.
  const stacked = side && bodyWidth > 0 && !columns.figureColumn;
  const compactSide = shortWindow && side && !stacked;
  return (
    <FitToHeight floor={stageFitFloor(stageHeight())} onNatural={panelHeight.measured}>
      <div className="stage-panel stage-solution">
        {solution.figure && (
          <details className="stage-figure-reading">
            <summary>{t("How I read the figure")}</summary>
            <MathText text={solution.figure} />
          </details>
        )}
        {above && answer}
        <ExplainEntry session={session} />
        {!session.isConfirmed && !session.isConfirming && session.state.kind === "ready" && (
          <p className="stage-caution">{t("I couldn’t check every step of this. Double-check it.")}</p>
        )}
        {session.isConfirming && <p className="stage-progress">{t("Checking the result…")}</p>}
        {stacked && <SideFigures session={session} show="figure" />}
        <div className="stage-solution-body" ref={bodyRef} style={columns.style}>
          <div className="stage-steps">
            {!above && answer}
            {evidence ? (
              <EvidenceView evidence={evidence} />
            ) : (
              Array.from({ length: session.stepCount }, (_, index) => index)
                .filter((index) => index < visible)
                .map((index) => (
                  <StepCard
                    key={index}
                    part={part}
                    index={index}
                    session={session}
                    interactive
                    compact={columns.compactWindow}
                  />
                ))
            )}
          </div>
          {shortWindow
            ? compactSide && (
                <aside className="stage-formulas stage-compact-figure">
                  <SideFigures session={session} show="figure" />
                </aside>
              )
            : (formulas.length > 0 || side) && (
                <aside className="stage-formulas" aria-label={t("Formulas")}>
                  {stacked && <SideFigures session={session} show="rest" />}
                  <FormulaList formulas={formulas} />
                  {side && !stacked && <SideFigures session={session} />}
                </aside>
              )}
        </div>
        {shortWindow && (formulas.length > 0 || side) && (
          <div className="stage-compact-extras">
            {formulas.length > 0 && (
              <aside className="stage-formulas" aria-label={t("Formulas")}>
                <FormulaList formulas={formulas} />
              </aside>
            )}
            {side && <SideFigures session={session} show="rest" graphHeight={150} />}
          </div>
        )}
        <Actions session={session} />
      </div>
    </FitToHeight>
  );
}

/** What the step in focus names in a space figure (Figure3DSteps.spaceParts): the card's own figureHighlight first. */
function spaceStepHighlight(session: QuestionSession): string | null {
  const figure = session.solutionFigure;
  const step = session.selectedStep;
  const card = step !== null ? session.part?.cards?.[step] : undefined;
  if (figure?.kind !== "space" || !card) return null;
  return card.figureHighlight ?? spaceParts(card.latex, `${card.title} ${card.note ?? ""}`, figure.figure);
}

/** The right column's figures: the one beside the steps (or the drawing on its way), and the solution's curve. */
function SideFigures({
  session,
  show = "all",
  graphHeight = 260,
}: {
  session: QuestionSession;
  /** In one column the figure goes above the steps and the rest after them. */
  show?: "all" | "figure" | "rest";
  graphHeight?: number;
}) {
  const lessonFigure3D = useLessonState()?.figure3D ?? null;
  // The point the beat being said rings on the graph (`LessonRun.graphRing`).
  const lessonGraphRing = useLessonState()?.shows.find((show) => LessonShows.isOnGraph(show))?.point ?? null;
  const figure = session.solutionFigure;
  const graph = session.sideGraph;
  // The step the mascot is walking (MascotFigureFocus): the body waits above what it adds to the figure; with the plan
  // pointing at figures, a step that adds nothing points at the figure as a whole.
  const guided = session.mascotFocusStep;
  const pointer = guided !== null && (questionPlan(session)?.pointer ?? false);
  // The 3D figure and the graph share one box of a fixed size, one at a time (QuestionPanel.figureBox).
  if (session.figureIsBoxed) {
    if (show === "rest") return session.showsIllustrationPanel ? <IllustrationPanel session={session} /> : null;
    return (
      <div className={`stage-figures${show === "figure" ? " stage-figures-above" : ""}`}>
        <FigureBox session={session} graphRing={lessonGraphRing} />
        {show === "all" && session.showsIllustrationPanel && <IllustrationPanel session={session} />}
      </div>
    );
  }
  return (
    <div className={`stage-figures${show === "figure" ? " stage-figures-above" : ""}`}>
      {show === "rest" ? null : figure?.kind === "drawing" &&
        session.drawingIsBesideSteps &&
        isFigure3D(figure.scene) ? (
        // A solid or a circuit beside the steps is drawn by its own view, once.
        <IllustrationPanel session={session} />
      ) : figure?.kind === "table" ? (
        <div className="stage-figure-fit">
          {/* Drawn at its own size, often wider than the column: made smaller to fit, never larger. */}
          <FitWidth>
            <SignTableView table={figure.table} />
          </FitWidth>
        </div>
      ) : figure?.kind === "space" ? (
        <SpaceFigureView
          figure={figure.figure}
          step={session.figureStep}
          highlight={lessonFigure3D?.highlight ?? spaceStepHighlight(session)}
        />
      ) : figure?.kind === "drawing" ? (
        <IllustrationView
          scene={figure.scene}
          revealed={session.figureRevealed}
          step={session.figureStep}
          focus={guided === null ? null : { step: guided, text: session.stepText(guided), wholeFigure: pointer }}
          bodySize={mascotSize}
        />
      ) : session.expectsFigure && !session.showsIllustrationPanel ? (
        // The drawing on its way, or why it isn't there (the drawing's own item shows it otherwise).
        <IllustrationPanel session={session} />
      ) : null}
      {show !== "figure" && session.showsGraph && graph && session.hasGraph && (
        <CurveGraph graph={graph} session={session} height={graphHeight} ring={lessonGraphRing} />
      )}
      {show !== "figure" && session.showsIllustrationPanel && <IllustrationPanel session={session} />}
    </div>
  );
}

/** The box's fixed height for this window (`FigureBoxSize`): the work is what is left under the stage's margins. */
function figureBoxHeight(): number {
  const overlay = stageHeight();
  return FigureBoxSize.height(overlay, overlay - 2 * StageGeometry.edge(overlay <= compactStageHeight));
}

/**
 * The 3D figure and the graph, one at a time, in a box of a fixed size under the formulas, with a «3D | Graph» selector
 * when there are both (QuestionPanel.figureBox). A step about the solid shows the solid, so the mascot points into it.
 */
function FigureBox({ session, graphRing }: { session: QuestionSession; graphRing: { x: number; y: number } | null }) {
  const t = useT();
  const height = figureBoxHeight();
  const tabs = session.figureTabs;
  const active = session.activeFigureTab ?? "figure";
  const figure = session.solutionFigure;
  const graph = session.sideGraph;
  // Windows draws a circuit as a flat schematic, so only a solid or a space figure is called «3D».
  const flatCircuit = figure?.kind === "drawing" && circuitOf(figure.scene) !== null;
  const figureName = session.figureIs3D && !flatCircuit ? t("3D") : t("Figure");
  const explaining = session.mascotFocusStep !== null;
  useEffect(() => {
    if (explaining && tabs.includes("figure") && active !== "figure") session.selectFigureTab("figure");
  }, [explaining, tabs, active, session]);
  return (
    <div className="stage-figure-box">
      {tabs.length > 1 && (
        <div className="stage-figure-tabs" role="tablist">
          {(["figure", "graph"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active === tab}
              className={active === tab ? "selected" : undefined}
              onClick={() => session.selectFigureTab(tab)}
            >
              {tab === "figure" ? figureName : t("Graph")}
            </button>
          ))}
        </div>
      )}
      <div className="stage-figure-box-body" style={{ height }}>
        {active === "graph" && graph ? (
          <CurveGraph graph={graph} session={session} height={height} ring={graphRing} />
        ) : figure?.kind === "space" ? (
          <SpaceFigureView figure={figure.figure} step={session.figureStep} highlight={spaceStepHighlight(session)} />
        ) : figure?.kind === "drawing" && !isFigure3D(figure.scene) ? (
          <IllustrationView scene={figure.scene} revealed={session.figureRevealed} step={session.figureStep} />
        ) : figure?.kind === "table" ? (
          <FitWidth>
            <SignTableView table={figure.table} />
          </FitWidth>
        ) : (
          <IllustrationPanel session={session} height={height - FigureBoxSize.titleRoom} />
        )}
      </div>
    </div>
  );
}

/** The question's drawing, or what is happening with it: never a spinner with nothing behind it. */
function IllustrationPanel({ session, height }: { session: QuestionSession; height?: number }) {
  const t = useT();
  const lessonFigure3D = useLessonState()?.figure3D ?? null;
  switch (session.illustrationState) {
    case "ready": {
      if (!session.illustration) return null;
      const circuit = circuitOf(session.illustration);
      const solid = solidOf(session.illustration);
      // The step in focus drives the figure (Figure3DSteps): the resistors it joins, the solid's part it names.
      const cards = session.part?.cards ?? [];
      const steps = cards.map((card) => ({
        formula: card.latex,
        words: `${card.title} ${card.note ?? ""}`,
      }));
      // A clicked step keeps what it does to the figure even when the step before did the same (unlike the mascot's
      // walk through the steps, `stepFigureHooks`); the card's own figureHighlight and assembleStep come first.
      const step = session.selectedStep;
      const card = step !== null ? cards[step] : undefined;
      const plan = circuit ? circuitHighlightPlan(circuit, steps) : solid ? solidStepPlan(solid, steps) : [];
      // The lesson's beat asks for a part or an assembly: it wins while it is said (LessonFigure3D).
      const asked = lessonFigure3D;
      const lit = asked?.highlight ?? (step !== null && card ? (card.figureHighlight ?? plan[step] ?? null) : null);
      const assembleStep = asked?.assemble ?? card?.assembleStep ?? null;
      return circuit ? (
        <CircuitView
          spec={circuit}
          caption={session.illustration.title || undefined}
          highlight={lit ? CircuitMerges.ids(lit) : null}
          joined={asked?.join != null ? CircuitMerges.ids(asked.join) : null}
        />
      ) : solid ? (
        <SolidView
          solid={solid}
          caption={session.illustration.title || undefined}
          highlight={lit}
          assembleStep={assembleStep}
          yaw={asked?.yaw ?? null}
          height={height}
        />
      ) : (
        <IllustrationView scene={session.illustration} revealed={session.sawSolution} />
      );
    }
    case "empty":
      return <p className="figure-status">{t("Nothing worth drawing for this one.")}</p>;
    case "failed":
      return (
        <p className="figure-status">
          {t("Couldn’t draw this one.")}
          <button type="button" onClick={() => session.retryIllustration()}>
            {t("Try Again")}
          </button>
        </p>
      );
    default:
      return (
        <p className="figure-status" role="status">
          <span className="stage-spinner" aria-hidden="true" />
          {t("Drawing…")}
        </p>
      );
  }
}

/** «Explain It to Me» right under the answer (QuestionOverlay.explainEntry), not in the footer under every step. */
function ExplainEntry({ session }: { session: QuestionSession }) {
  const t = useT();
  const lesson = useLessonState();
  const toggleLesson = useLessonToggle();
  if (session.mode !== "solution" || session.part === null || session.state.kind !== "ready") return null;
  return (
    <button type="button" className="stage-explain" onClick={toggleLesson}>
      {lesson?.playing ? t("Stop Explaining") : t("Explain It to Me")}
    </button>
  );
}

function AnswerBox({ part, language }: { part: Part; language: string }) {
  const t = useT();
  // While a lesson plays, the answer waits for the lesson to work it out (`QuestionSession.showsFinalAnswer`).
  const hidden = useLessonState()?.hidesAnswer === true;
  // A long answer on lines of its own (AnswerBodyView): clauses first, then each written out in words or typeset. Code
  // in a written answer keeps its lines; it is never split at `;`.
  const pieces = useMemo(() => {
    const latex = part.answerLatex;
    if (latex) return AnswerLines.clauses(latex).flatMap((clause) => AnswerTextLayout.pieces(clause));
    return CodeText.containsCode(part.answer.text) ? null : AnswerTextLayout.pieces(part.answer.text);
  }, [part.answerLatex, part.answer.text]);
  return (
    <section
      className={`stage-answer${hidden ? " waiting" : ""}`}
      aria-label={t("Answer")}
      aria-hidden={hidden || undefined}
    >
      <span className="stage-answer-label">{t("Answer")}</span>
      <div className="stage-answer-value">
        {pieces ? (
          pieces.map((piece, index) =>
            piece.kind === "latex" ? (
              <MathView key={index} latex={uprightUnits(ExamNotation.trigInLatex(piece.line, language))} display />
            ) : (
              <div
                key={index}
                className={`stage-answer-line${AnswerTextLayout.isProseLine(piece.line) ? " prose" : ""}`}
              >
                <MathText text={piece.line} />
              </div>
            ),
          )
        ) : (
          <MathText text={part.answer.text} />
        )}
      </div>
    </section>
  );
}

function StepCard({
  part,
  index,
  session,
  interactive = false,
  advanced = false,
  compact = false,
}: {
  part: Part;
  index: number;
  session: QuestionSession;
  interactive?: boolean;
  /** The student has just moved one step on to this one: its formula grows out of the last. */
  advanced?: boolean;
  /** A short window (`SolutionOverview.compact`): the step shows its title until it is opened. */
  compact?: boolean;
}) {
  const card: Card | null = part.cards && part.cards.length > 0 ? (part.cards[index] ?? null) : null;
  const selected = session.selectedStep === index;
  const lesson = useLessonState();
  const lit = lesson?.step === index;
  const pitfall = lesson?.pitfall?.step === index ? lesson.pitfall : null;
  const [pitfallOpen, setPitfallOpen] = useState(false);
  // SolutionOverview.row: the step the lesson teaches is open too; the one just come in, or the one the mascot is on,
  // has its number lit; while a lesson is on another step, this one is dimmed (all but its «Watch out» tag).
  const open = selected || lit;
  const numberLit = open || session.revealingStep === index || session.mascotFocusStep === index;
  const faded = lesson?.step != null && !lit;
  const quotes = open ? session.verifiedQuotes(index).map((found) => found.quote) : [];
  // In a short window the formula and the note wait until the step is opened, unless they are all the step says.
  const untitled = (card?.title ?? "").trim() === "";
  const detailed = !compact || open || untitled;
  const classes = [
    "stage-step",
    compact ? "compact" : "",
    open ? "selected" : "",
    numberLit ? "number-lit" : "",
    lit ? "lesson-lit" : "",
    faded ? "faded" : "",
  ].filter((name) => name !== "");
  return (
    <article
      className={classes.join(" ")}
      onMouseEnter={() => session.hover(index, true)}
      onMouseLeave={() => session.hover(index, false)}
      onClick={interactive ? () => session.select(index) : undefined}
    >
      <span className="stage-step-number" aria-hidden="true">
        {index + 1}
      </span>
      <div className="stage-step-body">
        {card ? (
          <>
            <h4>
              <MathText text={card.title} />
            </h4>
            {detailed && card.latex.trim() !== "" && !NoteMath.formulaRepeats(card.latex, card.note ?? "") && (
              <StepFormula
                part={part}
                index={index}
                latex={ExamNotation.trigInLatex(card.latex, session.notationLanguage)}
                advanced={advanced}
                language={session.notationLanguage}
              />
            )}
            {open && card.branches && card.branches.length > 0 && (
              <div className="stage-branches">
                {card.branches.map((branch, position) => (
                  <div key={position}>
                    <span>{branch.title}</span>
                    <MathView latex={ExamNotation.trigInLatex(branch.latex, session.notationLanguage)} display />
                  </div>
                ))}
              </div>
            )}
            {detailed && card.note && (
              <p className="stage-step-note">
                <NoteText
                  text={CodeText.mapProse(card.note, (prose) =>
                    ExamNotation.trigInProse(prose, session.notationLanguage),
                  )}
                />
              </p>
            )}
          </>
        ) : (
          <p className="stage-step-note">
            <NoteText text={part.steps[index] ?? ""} />
          </p>
        )}
        {quotes.length > 0 && (
          // The data it uses, in the exam's type and the blue, as they stand in the statement (`StepQuotes`).
          <p className="stage-step-quotes">
            {quotes.map((quote) => (
              <span key={quote}>{quote}</span>
            ))}
          </p>
        )}
        {pitfall && (
          // Not dimmed with its step: the tag is there to be found while the lesson is elsewhere.
          <PitfallTag
            pitfall={pitfall}
            open={lesson?.pitfallIsActive === true || pitfallOpen}
            toggle={() => setPitfallOpen((open) => !open)}
          />
        )}
      </div>
    </article>
  );
}

/**
 * The «Watch out» tag a lesson hangs on a step (`PitfallTag`): folded to its chip until its beat is said, then the
 * mistake and, quieter, why it is wrong; a tap opens or folds it.
 */
function PitfallTag({ pitfall, open, toggle }: { pitfall: LessonPitfall; open: boolean; toggle(): void }) {
  const t = useT();
  return (
    <button
      type="button"
      className={`stage-pitfall${open ? " open" : ""}`}
      aria-expanded={open}
      aria-description={t("Common mistake")}
      onClick={(event) => {
        event.stopPropagation();
        toggle();
      }}
    >
      <span className="stage-pitfall-chip">
        <Icon symbol="exclamationmark.triangle.fill" size={11} />
        {t("Watch out")}
      </span>
      {open && (
        <span className="stage-pitfall-body">
          <span className="stage-pitfall-mistake">{pitfall.mistake}</span>
          <span className="stage-pitfall-why">{pitfall.why}</span>
        </span>
      )}
    </button>
  );
}

/** One step on, the step's formula morphs from the one before (`SolutionSteps.morphSeconds`). */
const stepMorphSeconds = 1.2;

/**
 * A step's formula. The lesson moved here from another line: that line becomes this one, paced to its voice. Just
 * moved on to, one step at a time: it grows out of the step before's. Otherwise it is drawn as it is.
 */
function StepFormula({
  part,
  index,
  latex,
  advanced,
  language,
}: {
  part: Part;
  index: number;
  latex: string;
  advanced: boolean;
  /** The exam's notation ("sen" in Portuguese) the line before is written in too. */
  language: string;
}) {
  const morph = useLessonState()?.morph ?? null;
  const cards = part.cards ?? [];
  if (morph && morph.to === index && morph.from < cards.length)
    return (
      <MorphView
        key={`lesson-${morph.beat}`}
        from={ExamNotation.trigInLatex(cards[morph.from]!.latex, language)}
        to={latex}
        started={morph.started}
        duration={morph.duration}
        pacing={morph.pacing}
        frozen={morph.frozen}
        className="stage-step-latex"
      />
    );
  const previous = index >= 1 ? ExamNotation.trigInLatex(cards[index - 1]?.latex ?? "", language) : "";
  if (advanced && previous.trim() !== "")
    return (
      <MorphView
        key={`step-${index}`}
        from={previous}
        to={latex}
        duration={stepMorphSeconds}
        className="stage-step-latex"
      />
    );
  return <MathView latex={latex} display className="stage-step-latex" />;
}

function EvidenceView({ evidence }: { evidence: NonNullable<QuestionSession["evidenceAnswer"]> }) {
  const t = useT();
  return (
    <div className="stage-evidence">
      {evidence.chunks.map((chunk, chunkIndex) => {
        const located = evidence.located
          .filter((item) => item.chunk === chunkIndex)
          .sort((a, b) => a.range.start - b.range.start);
        const characters = Array.from(chunk.text);
        const pieces: { text: string; quoted: boolean }[] = [];
        let cursor = 0;
        for (const item of located) {
          if (item.range.start < cursor) continue;
          pieces.push({ text: characters.slice(cursor, item.range.start).join(""), quoted: false });
          pieces.push({ text: characters.slice(item.range.start, item.range.end).join(""), quoted: true });
          cursor = item.range.end;
        }
        pieces.push({ text: characters.slice(cursor).join(""), quoted: false });
        return (
          <p key={chunkIndex} className="stage-passage">
            {pieces.map((piece, index) =>
              piece.quoted ? <mark key={index}>{piece.text}</mark> : <span key={index}>{piece.text}</span>,
            )}
          </p>
        );
      })}
      {evidence.located.length > 0 && (
        <>
          <h3>{t("Key points")}</h3>
          <ol className="stage-points">
            {evidence.located.map((item) => (
              <li key={item.index}>
                <strong>{item.evidence.point}</strong> {item.evidence.why}
              </li>
            ))}
          </ol>
        </>
      )}
      {evidence.paragraphs.map((paragraph, index) => (
        <p key={index} className="stage-paragraph">
          <MathText text={paragraph.text} />
        </p>
      ))}
    </div>
  );
}

function FollowUpView({ session }: { session: QuestionSession }) {
  const t = useT();
  return (
    <div className="stage-panel">
      {session.followUpQuestion && <p className="stage-asks">{session.followUpQuestion}</p>}
      {session.isAnsweringFollowUp && <p className="stage-progress">{t("Thinking…")}</p>}
      {session.followUpAnswer?.map((paragraph, index) => (
        <p key={index} className="stage-paragraph">
          <MathText text={t(paragraph)} />
        </p>
      ))}
      {!session.followUpQuestion && session.followUps.length > 0 && (
        <ul className="stage-suggestions">
          {session.followUps.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                className="stage-link"
                onClick={() => session.ask(suggestion, followUpContext(session, suggestion))}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Actions session={session} />
    </div>
  );
}

/** The context a question about the exercise goes with: this exercise, its open part and its written solution. */
/** Settings › General › Voice: on unless set to "0". */
function readVoiceEnabled(): boolean {
  try {
    return localStorage.getItem("voiceEnabled") !== "0";
  } catch {
    return true;
  }
}

function writeVoiceEnabled(on: boolean): void {
  try {
    localStorage.setItem("voiceEnabled", on ? "1" : "0");
  } catch {
    // Kept for this launch only.
  }
}

function followUpContext(session: QuestionSession, asked: string): string {
  const part = session.part;
  return TextHelpContext.followUp({
    studentQuestion: asked,
    exercise: session.exerciseWithSource,
    partLabel: part?.label ?? "",
    partAsks: part?.asks ?? "",
    partAnswer: part?.answer.text ?? "",
    solution: part ? describePart(part).join("\n") : "",
  });
}

/** The same question with new numbers: the app wrote the numbers in and knows the answer. */
/**
 * A similar question drawn where the exam's was (`VariantStage`): the blue «Similar question» capsule and «Original»
 * (or Esc), which brings the exam's question back.
 */
function VariantHeader({ session }: { session: QuestionSession }) {
  const t = useT();
  return (
    <div className="stage-variant-header">
      <span className="stage-variant-badge">{t("Similar question")}</span>
      <button
        type="button"
        className="stage-variant-original"
        title={t("Back to the exam’s question (Esc)")}
        onClick={() => session.backToOriginal()}
      >
        <Icon symbol="arrow.uturn.backward" size={12} />
        {t("Original")}
      </button>
    </div>
  );
}

function VariantView({ session }: { session: QuestionSession }) {
  const t = useT();
  const [typed, setTyped] = useState("");
  const variant = session.variant;
  if (session.variantState === "failed") {
    return (
      <div className="stage-panel">
        <p className="stage-step-note">{t("Couldn’t make a similar question this time.")}</p>
        <button type="button" className="stage-button" onClick={() => void session.tryVariant()}>
          {t("Try Again")}
        </button>
        <button type="button" className="stage-link quiet" onClick={() => session.backToOriginal()}>
          {t("Back to the exam’s question (Esc)")}
        </button>
      </div>
    );
  }
  if (session.variantState !== "ready" || !variant) {
    return (
      <p className="stage-progress" role="status">
        <span className="stage-progress-dot" aria-hidden="true" />
        {t("Writing a similar question…")}
      </p>
    );
  }
  const result = session.variantResult;
  const answer =
    variant.kind === "function"
      ? session.variantExample
      : session.variantAnswer === null
        ? null
        : Variant.format(session.variantAnswer);
  const unreadable = variant.kind === "function" ? t("I couldn’t read that expression.") : t("Type just the number.");
  return (
    <div className="stage-panel stage-variant">
      <p className="stage-variant-question">
        <MathText text={session.variantText} />
      </p>
      <form
        className={`stage-try stage-variant-answer${result === "matches" ? " matches" : ""}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (typed.trim() !== "") session.checkVariant(typed);
        }}
      >
        <input
          autoFocus
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={variant.unit === "" ? t("Your answer") : t("Your answer in %@", variant.unit)}
          aria-label={t("Your answer")}
        />
      </form>
      <div className="stage-variant-help">
        <span>
          {variant.kind === "function"
            ? t("A function of %@, like exp(-t)*cos(3*t).", variant.variable ?? "t")
            : t("A number; 2.5e-3 for 2.5 × 10⁻³.")}
        </span>
        {result && (
          <span className={`stage-result stage-result-${result}`} role="status">
            {result === "matches" ? t("That’s right.") : result === "differs" ? t("Not yet.") : unreadable}
          </span>
        )}
      </div>
      {session.showsVariantHint && variant.hint !== "" && (
        <p className="stage-step-note">
          <MathText text={variant.hint} />
        </p>
      )}
      {session.showsVariantAnswer && answer !== null && (
        <section className="stage-answer">
          <span className="stage-answer-label">{variant.kind === "function" ? t("One answer") : t("Answer")}</span>
          <div className="stage-answer-value">{answer + (variant.unit === "" ? "" : " " + variant.unit)}</div>
          <span className="stage-step-note">{t("Same steps as the solution, with these numbers.")}</span>
        </section>
      )}
      <div className="stage-action-row">
        {!session.showsVariantHint && (
          <button type="button" className="stage-link quiet" onClick={() => session.revealVariantHint()}>
            {t("Hint")}
          </button>
        )}
        {!session.showsVariantAnswer ? (
          <button type="button" className="stage-link quiet" onClick={() => session.revealVariantAnswer()}>
            {t("Show Answer")}
          </button>
        ) : (
          <button
            type="button"
            className="stage-link quiet"
            onClick={() => {
              session.backToOriginal();
              session.choose("solution");
            }}
          >
            {t("Show the Method")}
          </button>
        )}
        <button type="button" className="stage-link quiet" onClick={() => void session.tryVariant()}>
          {t("Another One")}
        </button>
        <button type="button" className="stage-link quiet" onClick={() => session.backToOriginal()}>
          {t("Back to the exam’s question (Esc)")}
        </button>
      </div>
    </div>
  );
}

function TranscriptRequest({ session }: { session: QuestionSession }) {
  const t = useT();
  const [text, setText] = useState("");
  return (
    <div className="stage-panel">
      <p className="stage-asks">{t("Audio needed")}</p>
      <p className="stage-step-note">{t(QuestionSessionDetail)}</p>
      <textarea
        className="stage-transcript"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("Paste the transcript…")}
        rows={5}
      />
      <button
        type="button"
        className="stage-button"
        disabled={text.trim() === ""}
        onClick={() => session.provideTranscript(text)}
      >
        {t("Answer from this transcript")}
      </button>
    </div>
  );
}

const QuestionSessionDetail =
  "This question comes from a recording I can’t hear. Paste the transcript and I’ll answer from it.";

/** The field to ask about the exercise and the other ways in, under every mode. */
function Actions({ session }: { session: QuestionSession }) {
  const t = useT();
  const [asked, setAsked] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (session.mode === "followUp") input.current?.focus();
  }, [session.askFocusID, session.mode]);
  const actions: [string, () => void, boolean][] = [
    [t("Hint"), () => session.showFirstStep(), session.mode !== "hint"],
    [t("Let me try"), () => session.choose("tryIt"), session.mode !== "tryIt"],
    // QuestionOverlay.footerButtons, in its order.
    [session.explains ? t("Explain") : t("Solution"), () => session.choose("solution"), session.mode !== "solution"],
    [t("Try a Similar One"), () => void session.tryVariant(), session.canPractiseVariant && session.mode !== "variant"],
    [
      session.drawingVisible ? t("Hide Drawing") : t("Draw It"),
      () => session.toggleIllustration(),
      session.canDraw && session.part !== null,
    ],
    [
      session.showsGraph ? t("Hide Graph") : t("Show the graph"),
      () => session.toggleGraph(),
      session.hasGraph && session.mode !== null,
    ],
    [
      session.showsTiming ? t("Hide Waveforms") : t("Draw Waveforms"),
      () => session.toggleTiming(),
      session.canDrawTiming,
    ],
    [
      t("Explain Better"),
      () => session.solveWithStrongerModel(),
      session.part !== null && !session.solvedByStrongerModel && !session.isConfirming,
    ],
  ];
  return (
    <footer className="stage-actions">
      <form
        className="stage-ask"
        onSubmit={(event) => {
          event.preventDefault();
          if (asked.trim() === "") return;
          session.ask(asked, followUpContext(session, asked));
          setAsked("");
        }}
      >
        <Icon symbol="questionmark.bubble" size={16} />
        <input
          ref={input}
          value={asked}
          onChange={(event) => setAsked(event.target.value)}
          placeholder={t("Ask about this exercise…")}
          aria-label={t("Ask about this exercise")}
        />
        <TalkButton />
      </form>
      <div className="stage-action-row">
        {actions
          .filter(([, , shown]) => shown)
          .map(([label, action]) => (
            <button key={label} type="button" className="stage-link quiet" onClick={action}>
              {label}
            </button>
          ))}
      </div>
    </footer>
  );
}

type Shown = { kind: "waiting" } | { kind: "crop" } | { kind: "typeset"; transcription: QuestionTranscription };

/**
 * A question read from the screen (`AnywhereController.opened`): its text typeset when it can be trusted; while the
 * model reads the picture, the crop itself (with no picture, the computer's own reading or soft bars), then the
 * model's reading typeset. If that reading fails or drops the numbers the computer read, the crop stays; a reading
 * accepted later still replaces it.
 */
function ScreenQuestionView({
  source,
  session,
  compact,
}: {
  source: PictureQuestion;
  session: QuestionSession | null;
  compact: boolean;
}) {
  const t = useT();
  const [shown, setShown] = useState<Shown>(() => {
    // While the model reads the picture, the picture itself: the question at once, and never wrong. The computer's
    // own reading drops what OCR can't see (an exponent, «m/s²» read «m/s»), so it is shown only when there is no
    // picture (Mac report I6, I7).
    if (source.transcribes) return source.picture ? { kind: "crop" } : { kind: "waiting" };
    const plain = Transcriptions.fromPlainText(source.question.text);
    if (Transcriptions.isUsable(plain) && untypesetMath(plain.blocks) === null)
      return { kind: "typeset", transcription: plain };
    return source.picture ? { kind: "crop" } : { kind: "typeset", transcription: plain };
  });

  useEffect(() => {
    if (!session) return;
    if (shown.kind === "typeset") session.showStatement(Transcriptions.plainText(shown.transcription));
  }, [session, shown]);

  useEffect(() => {
    if (!session || !source.transcribes) return;
    const settle = (found: QuestionTranscription | null) => {
      const usable =
        found &&
        Transcriptions.isUsable(found) &&
        Transcriptions.agrees(found, source.ocrText) &&
        untypesetMath(found.blocks) === null;
      // The crop is shown once; after that only a typeset reading replaces what is there.
      setShown((now) =>
        usable ? { kind: "typeset", transcription: found } : now.kind === "waiting" ? { kind: "crop" } : now,
      );
    };
    // The fast reading is shown only if it keeps the numbers the computer read; else the crop, until the solve's.
    const stop = session.awaitTranscription({
      rejects: (found) => Transcriptions.rejection(found, null, source.ocrText),
      missed: () => settle(null),
      settled: settle,
    });
    // A reply that never comes (no key, offline), or a stream that is slow or stuck: the crop, not bars for ever.
    const start = performance.now();
    const timer = window.setInterval(() => {
      const ended = session.state.kind === "failed" || session.state.kind === "needsKey";
      if (FastTranscriptionReader.placeholderGivesWay((performance.now() - start) / 1000, ended)) {
        window.clearInterval(timer);
        setShown((now) => (now.kind === "waiting" ? { kind: "crop" } : now));
      }
    }, 250);
    return () => {
      window.clearInterval(timer);
      stop();
    };
  }, [session, source]);

  // Lifted from where it was clicked on the screen, like the PDF's crop from its page.
  const holder = useRef<HTMLDivElement>(null);
  const from = source.from ?? null;
  const targets = useMemo(
    () => (from ? [new DOMRectReadOnly(from.left, from.top, from.width, from.height)] : []),
    [from],
  );
  // Sized as the PDF's crop is (Stage.init), its body text taken as 13 pt on the screen (the Mac's `softened` crop):
  // 17 pt to read, 14 once the solution is open, giving the work only the room it needs.
  const picture = source.picture;
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = holder.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const panel = useContext(PanelHeight).height;
  const available = stageHeight();
  const scale =
    picture && width > 0
      ? questionScale({
          body: 13,
          compact,
          fits: width / Math.max(1, picture.width),
          height: picture.height,
          available,
          panel,
          compactWindow: available <= compactStageHeight,
        })
      : 1;
  useQuestionFlight(holder, targets, from !== null, true, scale, ":scope > *");
  return (
    <div className="stage-question stage-screen-question" aria-live="polite" ref={holder}>
      {shown.kind === "typeset" ? (
        <TypesetQuestion
          transcription={shown.transcription}
          source={source}
          session={session}
          compact={compact}
          columnWidth={width}
        />
      ) : shown.kind === "crop" && picture ? (
        <InkPicture
          className="stage-screen-crop"
          picture={picture}
          label={source.question.text}
          width={picture.width * scale}
          height={picture.height * scale}
        />
      ) : source.draft ? (
        <div className="stage-typeset stage-draft">
          {source.draft.split("\n").map((line, index) => (
            <p key={index}>
              <MathText text={line} />
            </p>
          ))}
        </div>
      ) : (
        <div
          className="stage-placeholder"
          role="img"
          aria-label={t("Reading…")}
          style={
            picture
              ? { width: Math.min(picture.width, 640), height: Math.max(48, Math.min(picture.height, 260)) }
              : undefined
          }
        >
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  );
}

/**
 * Part of a picture of the screen drawn in the stage's ink (the Mac's white-ink image): white letters on nothing, the
 * same as a question lifted from a PDF, never a white plate. A dark page, or a picture that can't be read back, is shown
 * as it is.
 */
function InkPicture({
  picture,
  label,
  width,
  height,
  region,
  className,
}: {
  picture: { url: string; width: number; height: number };
  label: string;
  width: number;
  height: number;
  /** The part to draw, in the picture's points; all of it when absent. */
  region?: Rect;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const area = region ?? { x: 0, y: 0, width: picture.width, height: picture.height };
  const { x, y, width: areaWidth, height: areaHeight } = area;
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const ratio = (window.devicePixelRatio || 1) * cssZoom(target);
      target.width = Math.max(1, Math.round(width * ratio));
      target.height = Math.max(1, Math.round(height * ratio));
      const context = target.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      // The picture's pixels per point.
      const sx = image.naturalWidth / Math.max(1, picture.width);
      const sy = image.naturalHeight / Math.max(1, picture.height);
      context.drawImage(image, x * sx, y * sy, areaWidth * sx, areaHeight * sy, 0, 0, target.width, target.height);
      try {
        const pixels = context.getImageData(0, 0, target.width, target.height);
        if (PageInk.recolourPicture(pixels.data, stageInk(target))) context.putImageData(pixels, 0, 0);
      } catch {
        // A picture the canvas can't read back stays as it was taken.
      }
    };
    image.src = picture.url;
    return () => {
      cancelled = true;
    };
  }, [picture, width, height, x, y, areaWidth, areaHeight]);
  return (
    <canvas
      ref={canvas}
      className={className}
      role="img"
      aria-label={label}
      style={{ width, height: "auto", aspectRatio: `${width} / ${height}` }}
    />
  );
}

/** Between a step's quotes in one key: a quote's key never holds a line break (`StatementQuotes.key`). */
const quoteSeparator = String.fromCharCode(10);

/** One line under a datum, and the datum's own box, in the typeset question's pixels. */
interface TypesetLine {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Which of the step's quotes it is under, in the step's order. */
  quote: number;
}

/**
 * The open step's data under the typeset question's words (`RenderedUnderlines`): the same blue line, fading in. While
 * the mascot walks the steps, the step's first datum is magnified in place instead (`QuoteLoupe`), and is not
 * underlined as well.
 */
function TypesetUnderlines({
  session,
  container,
}: {
  session: QuestionSession | null;
  container: React.RefObject<HTMLDivElement | null>;
}) {
  const step = session?.underlinedStep ?? null;
  const quotes = step !== null && session ? session.verifiedQuotes(step).map((found) => found.quote) : [];
  const key = quotes.join(quoteSeparator);
  // Measured for one set of quotes: lines of another set (or of none) are never drawn.
  const [measured, setMeasured] = useState<{ key: string; lines: TypesetLine[]; width: number; height: number }>({
    key: "",
    lines: [],
    width: 0,
    height: 0,
  });
  const lines = measured.key === key ? measured.lines : [];
  useLayoutEffect(() => {
    const element = container.current;
    if (!element || key === "") return;
    const measure = () => {
      const origin = element.getBoundingClientRect();
      const zoom = cssZoom(element) || 1;
      const found = key
        .split(quoteSeparator)
        .flatMap((quote, index) => quoteRects(element, quote).map((rect) => ({ rect, quote: index })));
      setMeasured({
        key,
        width: element.offsetWidth,
        height: element.offsetHeight,
        lines: found.map(({ rect, quote }) => ({
          left: (rect.left - origin.left) / zoom,
          top: (rect.top - origin.top) / zoom,
          width: Math.max(4, rect.width / zoom),
          height: rect.height / zoom,
          quote,
        })),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [container, key]);
  const first = lines[0] ?? null;
  const loupe =
    first && session?.mascotFocusStep !== null && session?.mascotFocusStep === step && !reducedMotion()
      ? (() => {
          const target = { x: first.left, y: first.top, width: first.width, height: first.height };
          const box = StepFocusGeometry.lens(target, QuoteLoupeScale, {
            x: 0,
            y: 0,
            width: measured.width,
            height: measured.height,
          });
          return { box, anchor: StepFocusGeometry.zoomAnchor(target, box, QuoteLoupeScale) };
        })()
      : null;
  return (
    <>
      {lines
        .filter((line) => !(loupe && line.quote === first?.quote))
        .map((line, index) => (
          <span
            key={`${key}-${index}`}
            className="stage-underline"
            data-underline-skip=""
            data-overlay=""
            aria-hidden="true"
            // 2 pt under the letters (the glyphs' box without the line's leading).
            style={{ left: line.left, top: line.top + line.height * 0.88 + 2 - 1.25, width: line.width }}
          />
        ))}
      {loupe && <TypesetLoupe container={container} box={loupe.box} anchor={loupe.anchor} />}
    </>
  );
}

/**
 * The datum magnified in a lens over the typeset question (the Mac's QuoteLoupe): a copy of the question's words,
 * scaled about the point that carries the datum to the lens' centre, on a dark ground that hides the words under it.
 */
function TypesetLoupe({
  container,
  box,
  anchor,
}: {
  container: React.RefObject<HTMLDivElement | null>;
  box: Box;
  anchor: { x: number; y: number };
}) {
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const source = container.current;
    const target = inner.current;
    if (!source || !target) return;
    const copy = source.cloneNode(true) as HTMLElement;
    for (const overlay of copy.querySelectorAll("[data-overlay]")) overlay.remove();
    copy.removeAttribute("style");
    copy.style.width = `${source.offsetWidth}px`;
    target.replaceChildren(copy);
  }, [container, box]);
  // A point x of the question is drawn at anchor + zoom·(x − anchor), less the lens' own corner.
  const transform = `translate(${-box.x}px, ${-box.y}px) translate(${anchor.x}px, ${anchor.y}px) scale(${QuoteLoupeScale}) translate(${-anchor.x}px, ${-anchor.y}px)`;
  return (
    <div
      className="stage-lens"
      data-underline-skip=""
      data-overlay=""
      aria-hidden="true"
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
    >
      <div ref={inner} className="stage-lens-copy" style={{ transform }} />
    </div>
  );
}

/**
 * A step's spot on a figure of the typeset question (`RenderedQuestion.focus`): the model's box, a share of the
 * picture it saw, carried into the figure drawn here when it falls on that figure; nothing when it falls elsewhere
 * (no mark is better than a wrong one).
 */
function TypesetFigureFocus({
  session,
  box,
  width,
  height,
}: {
  session: QuestionSession | null;
  box: { x: number; y: number; width: number; height: number };
  width: number;
  height: number;
}) {
  const step = session?.underlinedStep ?? null;
  const focus = step !== null ? (session?.part?.cards?.[step]?.focus ?? null) : null;
  if (!focus || box.width <= 0 || box.height <= 0) return null;
  const centre = { x: focus.x + focus.w / 2, y: focus.y + focus.h / 2 };
  if (centre.x < box.x || centre.x > box.x + box.width || centre.y < box.y || centre.y > box.y + box.height)
    return null;
  // In the figure's own share, at least 0.08 of it on each side and inside it.
  const share = (value: number, from: number, size: number) => (value - from) / size;
  let w = Math.max(0.08, focus.w / box.width);
  let h = Math.max(0.08, focus.h / box.height);
  w = Math.min(1, w);
  h = Math.min(1, h);
  const x = Math.min(1 - w, Math.max(0, share(centre.x, box.x, box.width) - w / 2));
  const y = Math.min(1 - h, Math.max(0, share(centre.y, box.y, box.height) - h / 2));
  const note = focus.note?.trim() ? focus.note.trim() : null;
  return (
    <FocusPointer
      region={{ x: x * width, y: y * height, width: w * width, height: h * height }}
      arrow={StepFocusGeometry.isArrow(focus)}
      note={note}
      width={width}
      height={height}
    />
  );
}

/**
 * A step's spot on a text or formula block of the typeset question (`RenderedQuestion.focus` @ 5701363): the model's
 * box, on the picture it read, carried to the block drawn from that band of the picture. A line of text is marked
 * across the column, a formula with a little room round it; on a figure the figure's own mark is drawn
 * (`TypesetFigureFocus`), elsewhere nothing.
 */
function TypesetBlockFocus({
  session,
  container,
  blocks,
  figures,
}: {
  session: QuestionSession | null;
  container: React.RefObject<HTMLDivElement | null>;
  blocks: readonly TranscriptionBlock[];
  figures: readonly Rect[];
}) {
  const step = session?.underlinedStep ?? null;
  const focus = step !== null ? (session?.part?.cards?.[step]?.focus ?? null) : null;
  const index = focus ? Transcriptions.focusedBlock(focus, blocks, figures) : null;
  const [spot, setSpot] = useState<{ index: number; region: Box; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element || index === null) return;
    const measure = () => {
      const target = element.querySelector<HTMLElement>(`[data-typeset-block="${index}"]`);
      if (!target) return setSpot(null);
      const zoom = cssZoom(element) || 1;
      const origin = element.getBoundingClientRect();
      const inner = (target.querySelector(".stage-typeset-formula .katex") as HTMLElement | null) ?? target;
      const rect = inner.getBoundingClientRect();
      const top = (rect.top - origin.top) / zoom;
      const height = rect.height / zoom;
      const region =
        target.dataset.kind === "formula"
          ? { x: (rect.left - origin.left) / zoom - 4, y: top - 3, width: rect.width / zoom + 8, height: height + 6 }
          : { x: 0, y: top - 2, width: element.offsetWidth, height: height + 4 };
      setSpot({ index, region, width: element.offsetWidth, height: element.offsetHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [container, index]);
  if (!focus || index === null || spot?.index !== index) return null;
  const note = focus.note?.trim() ? focus.note.trim() : null;
  return (
    <div
      className="stage-typeset-focus"
      data-underline-skip=""
      data-overlay=""
      aria-hidden="true"
      style={{ width: spot.width, height: spot.height }}
    >
      <FocusPointer
        region={spot.region}
        arrow={StepFocusGeometry.isArrow(focus)}
        note={note}
        width={spot.width}
        height={spot.height}
      />
    </div>
  );
}

/** The question typeset from a reading of its picture: prose with inline maths, display formulas, and the figures
 * cut from the picture where the reading says they are. */
function TypesetQuestion({
  transcription,
  source,
  session,
  compact,
  columnWidth,
}: {
  transcription: QuestionTranscription;
  source: PictureQuestion;
  session: QuestionSession | null;
  compact: boolean;
  /** The column's width in its own pixels; 0 before it is laid out. */
  columnWidth: number;
}) {
  const picture = source.picture;
  const container = useRef<HTMLDivElement>(null);
  // Typeset at 17 pt, then sized as the lifted crop is (RenderedQuestion is an image the stage scales): never taller
  // than its share of the stage, 14 pt once the solution is open, ceding to the work down to 11.
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    // In its own pixels, which its zoom does not change: no loop.
    const measure = () =>
      setNatural((now) =>
        now.width === element.offsetWidth && now.height === element.offsetHeight
          ? now
          : { width: element.offsetWidth, height: element.offsetHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const panel = useContext(PanelHeight).height;
  const available = stageHeight();
  const scale =
    natural.height > 0 && columnWidth > 0
      ? questionScale({
          body: 17,
          compact,
          fits: columnWidth / Math.max(1, natural.width),
          height: natural.height,
          available,
          panel,
          compactWindow: available <= compactStageHeight,
        })
      : compact
        ? 14 / 17
        : 1;
  // The i-th figure block without a box of its own takes the i-th figure found on the picture.
  const figureOrder = transcription.blocks.map(
    (_, index) => transcription.blocks.slice(0, index).filter((block) => block.type === "figure").length,
  );
  const figureBoxes = transcription.blocks.flatMap((block, index) => {
    if (block.type !== "figure") return [];
    const box = Transcriptions.rect(block) ?? source.figureBoxes[figureOrder[index]!] ?? null;
    return box ? [box] : [];
  });
  return (
    <div className="stage-typeset" ref={container} style={{ zoom: scale }}>
      {transcription.blocks.map((block, index) => {
        if (block.type === "figure") {
          const box = Transcriptions.rect(block) ?? source.figureBoxes[figureOrder[index]!] ?? null;
          if (!picture || !box) return null;
          const width = box.width * picture.width;
          const height = box.height * picture.height;
          return (
            <figure key={index} className="stage-figure" data-underline-skip="">
              <div className="stage-figure-marks" style={{ width, height }}>
                <InkPicture
                  picture={picture}
                  label={block.caption ?? ""}
                  width={width}
                  height={height}
                  region={{ x: box.x * picture.width, y: box.y * picture.height, width, height }}
                />
                <TypesetFigureFocus session={session} box={box} width={width} height={height} />
              </div>
              {block.caption ? <figcaption>{block.caption}</figcaption> : null}
            </figure>
          );
        }
        const text = block.text ?? "";
        if (text.trim() === "") return null;
        return (
          <div key={index} data-typeset-block={index} data-kind={block.type}>
            {block.type === "formula" ? (
              <MathView latex={text} display className="stage-typeset-formula" />
            ) : (
              <MarkupText text={text} />
            )}
          </div>
        );
      })}
      <TypesetUnderlines session={session} container={container} />
      <TypesetBlockFocus session={session} container={container} blocks={transcription.blocks} figures={figureBoxes} />
    </div>
  );
}

/** Begins and ends a spoken turn; given by the stage that owns the voice. */
const TalkContext = createContext<{ begin(): void; end(): void }>({ begin: () => {}, end: () => {} });

/** Hold to talk to the tutor (the talk key does the same, from any app). */
function TalkButton() {
  const t = useT();
  const talk = useContext(TalkContext);
  const state = useVoiceState();
  return (
    <button
      type="button"
      className={`stage-talk${state.phase === "listening" ? " listening" : ""}`}
      aria-label={t("Talk to the Tutor")}
      title={t("Talk to the Tutor")}
      onPointerDown={(event) => {
        event.preventDefault();
        talk.begin();
      }}
      onPointerUp={() => talk.end()}
      onPointerLeave={() => state.phase === "listening" && talk.end()}
    >
      <Icon symbol="mic.fill" size={16} />
    </button>
  );
}

/**
 * Text selected on the stage, in the question or the explanation, can be asked about (`SelectableText` and
 * `SelectionAskButton`): a small "Ask" pill at the end of the selection; the answer comes as a follow-up about it.
 */
function SelectionAskPill({ session }: { session: QuestionSession }) {
  const t = useT();
  const [picked, setPicked] = useState<{ ask: SelectionAsk; x: number; y: number } | null>(null);
  useEffect(() => {
    const read = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return setPicked(null);
      const range = selection.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const element = node instanceof Element ? node : node.parentElement;
      if (!element || element.closest("input, textarea, button")) return setPicked(null);
      const source = element.closest(".stage-panel")
        ? "explanation"
        : element.closest(".stage-question, .stage-typeset, .stage-screen-question")
          ? "question"
          : null;
      const ask = source ? SelectionAsk.make(selection.toString(), source) : null;
      if (!ask) return setPicked(null);
      const rects = range.getClientRects();
      const last = rects[rects.length - 1] ?? range.getBoundingClientRect();
      setPicked({ ask, x: last.right, y: last.bottom });
    };
    const settle = () => window.setTimeout(read, 0);
    document.addEventListener("mouseup", settle);
    document.addEventListener("keyup", settle);
    return () => {
      document.removeEventListener("mouseup", settle);
      document.removeEventListener("keyup", settle);
    };
  }, []);
  if (!picked) return null;
  const ask = () => {
    const part = session.part;
    const request = picked.ask.helpRequest({
      exercise: session.exerciseWithSource,
      partLabel: part?.label ?? "",
      partAsks: part?.asks ?? "",
      partAnswer: part?.answer.text ?? "",
      solution: part ? describePart(part).join("\n") : "",
    });
    window.getSelection()?.removeAllRanges();
    setPicked(null);
    session.ask(t("About “%@”", picked.ask.preview), request.context, request.passage);
  };
  return (
    <button
      type="button"
      className="stage-selection-ask"
      style={{ left: picked.x + 6, top: picked.y + 4 }}
      title={t("Ask about the selected text")}
      // Kept from taking the focus, so the selection stays while it is pressed.
      onMouseDown={(event) => event.preventDefault()}
      onClick={ask}
    >
      <Icon symbol="questionmark.bubble" size={12} />
      {t("Ask")}
    </button>
  );
}

/** A curve shown as it is: nothing to drag, no car. */
const stillGraph: GraphControlling = {
  parameterValue: 0,
  areaEnd: null,
  runID: 0,
  graphStep: Number.MAX_SAFE_INTEGER,
  setParameterValue: () => {},
  setAreaEnd: () => {},
  replayCar: () => {},
};

/** What the voice is doing, and the formula of the answer while it is said. */
function VoiceCaption({ state, onScreen }: { state: VoiceState; onScreen: readonly string[] }) {
  const t = useT();
  // Written once the first mark lights, unless it already reads on screen (then the marks go on the question there);
  // the symbols lit on it are ringed.
  const formulas = VoiceFormula.formulas(
    state.lit,
    state.formula,
    new Set(state.lit.map((_, index) => index)),
    onScreen,
  );
  const formula = formulas.length > 0 ? formulas.join(String.raw` \qquad `) : null;
  // A curve the tutor asks for, once it is said; one that does not plot is dropped.
  const asked = state.lit.find((command) => command.kind.op === "plot")?.kind;
  const curve = asked && asked.op === "plot" ? asked : null;
  const plotKey = curve ? JSON.stringify([curve.expression, curve.variable, curve.xMin, curve.xMax]) : "";
  const plot = useMemo(() => {
    if (plotKey === "") return null;
    const [expression, variable, xMin, xMax] = JSON.parse(plotKey) as [string, string, number, number];
    return FunctionPlot.make(expression, variable, xMin, xMax);
  }, [plotKey]);
  // A formula mark, or one on a whole equation, a phrase or a word that is no symbol of it, underlines the formula
  // (FormulaTerms.marks); a symbol is ringed.
  const underlined = state.lit.some(
    (command) =>
      command.kind.op === "formula" ||
      ((command.kind.op === "highlight" || command.kind.op === "circle") &&
        (VoiceFormula.equationLine(command.kind.term) !== null ||
          (formula !== null && SpeechMarkLayout.underlinesTheFormula(command, formula, state.spoken ?? "")))),
  );
  // A figure label the formula does not hold (H⁺, (B), the point D) is not ringed on it: no look-alike letter, as the
  // Mac's SpeechMarkLayout.namesSomethingElse.
  const symbols = state.lit.flatMap((command) =>
    (command.kind.op === "circle" || command.kind.op === "highlight") &&
    !(formula && SpeechMarkLayout.namesSomethingElse(command, formula, state.spoken ?? ""))
      ? [command.kind.term]
      : [],
  );
  const phase =
    state.phase === "listening"
      ? t("Listening…")
      : state.phase === "thinking"
        ? t("Thinking…")
        : state.phase === "speaking"
          ? t("Speaking…")
          : null;
  if (!phase && !state.notice && !formula && !plot && !state.shown) return null;
  return (
    <div className="voice-caption" role="status" aria-live="polite">
      {phase ? <span className="voice-phase">{phase}</span> : null}
      {state.heard && state.phase !== "listening" ? <span className="voice-heard">«{state.heard}»</span> : null}
      {formula ? <VoiceFormulaView latex={formula} symbols={symbols} underlined={underlined} /> : null}
      {plot ? <CurveGraph graph={plot} session={stillGraph} height={200} /> : null}
      {state.shown ? <p className="voice-shown">{state.shown}</p> : null}
      {state.notice ? <span className="voice-notice">{t(state.notice)}</span> : null}
    </div>
  );
}

/**
 * A block of the question as the model transcribed it, its Markdown never shown as marks (`RenderedQuestion.markup`):
 * `**…**` set bold, a pipe table's rows laid out as cells.
 */
function MarkupText({ text }: { text: string }) {
  const found = useMemo(() => markup(text), [text]);
  // Each line with where it starts in the whole text, which the bold stretches count in.
  const split = found.text.split("\n");
  const lines = split.map((line, index) => ({
    line,
    start: split.slice(0, index).reduce((sum, before) => sum + before.length + 1, 0),
  }));
  // The letters of a leading part label, in italic so «l)» is not read as «1)» (`italicizePartLabel`).
  const italic = partLabelLetters(found.text);
  // The line cut at its bold stretches (and the label's letters), each piece typeset with its maths.
  const pieces = (line: string, start: number) => {
    const cuts = new Set([0, line.length]);
    for (const [from, to] of italic ? [...found.bold, italic] : found.bold) {
      if (to > start && from < start + line.length) {
        cuts.add(Math.max(0, from - start));
        cuts.add(Math.min(line.length, to - start));
      }
    }
    const points = [...cuts].sort((a, b) => a - b);
    return points.slice(0, -1).map((at, index) => {
      const piece = line.slice(at, points[index + 1]);
      const bold = found.bold.some(([from, to]) => start + at >= from && start + at < to);
      const slanted = italic !== null && start + at >= italic[0] && start + at < italic[1];
      const typeset = slanted ? <em className="stage-part-letter">{piece}</em> : <MathText text={piece} />;
      return bold ? <strong key={index}>{typeset}</strong> : <span key={index}>{typeset}</span>;
    });
  };
  if (!found.hasTable && !found.text.includes("\n")) return <p>{pieces(found.text, 0)}</p>;
  return (
    <div className="stage-markup">
      {lines.map(({ line, start }, index) =>
        line.includes("\t") ? (
          <div
            key={index}
            className="stage-table-row"
            style={{ gridTemplateColumns: `repeat(${line.split("\t").length}, auto)` }}
          >
            {line.split("\t").map((cell, column) => (
              <span key={column}>
                <MathText text={cell} />
              </span>
            ))}
          </div>
        ) : (
          <p key={index}>{pieces(line, start)}</p>
        ),
      )}
    </div>
  );
}
