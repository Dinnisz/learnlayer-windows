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
import { linesOf, Rects, type PageText, type Rect } from "@core/pdf/page";
import { passageLinesOfPages } from "@core/pdf/passageLines";
import { ChoiceCheck } from "@core/problems/choiceCheck";
import { formulasFor, type Card, type Part } from "@core/problems/problemSolution";
import { StepFocusGeometry, StepFocusMarks, type Box } from "@core/problems/stepFocus";
import { SelectionAsk } from "@core/problems/selectionAsk";
import { markup } from "@core/problems/markup";
import { FigureLabels } from "@core/voice/figureLabels";
import { SpeechMarkLayout } from "@core/voice/speechMarkLayout";
import { ExamNotation } from "@core/math/examNotation";
import { CodeText } from "@core/code/codeText";
import { MascotGuide } from "@core/voice/mascotGuide";
import { GuideSpots } from "../lesson/guideSpot";
import { AnswerLines, AnswerTextLayout } from "@core/problems/answerTextLayout";
import { LessonEvidence } from "@core/lesson/lessonEvidence";
import { Variant } from "@core/problems/problemVariant";
import { FastTranscriptionReader } from "@core/problems/fastTranscription";
import type { ExamQuestion } from "@core/problems/questionDetector";
import { QuestionPages } from "@core/problems/questionPages";
import { Transcriptions, type QuestionTranscription } from "@core/problems/questionTranscription";
import { QuestionSession, type Mode, type SessionServices } from "@core/problems/questionSession";
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
import type { OpenedQuestion } from "../windows/reader/ReaderWindow";

const base64Bytes = (text: string) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0));

/** A question read from the screen (an Alt-click in another app): its picture, and the session made for it. */
export interface PictureQuestion {
  kind: "picture";
  question: ExamQuestion;
  /** The region's picture (a JPEG's object URL) and its size on screen, in points; null when there is none. */
  picture: { url: string; width: number; height: number } | null;
  /** Where the figures are in the picture, as shares (for a typeset reading's figure blocks). */
  figureBoxes: readonly Rect[];
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
      documentName: `${document.name}.pdf`,
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

  const mode = session?.mode ?? null;
  const showsLesson = mode === "solution" && session?.part != null && session.state.kind === "ready";
  const compact = mode === "solution" || mode === "followUp";

  return (
    <LessonContext.Provider value={{ state: lesson.state, player: lesson.player, toggle: lesson.toggle }}>
      <VoiceContext.Provider value={voice.state}>
        <TalkContext.Provider value={{ begin: () => void voice.begin(), end: () => void voice.end() }}>
          <div
            className="stage"
            role="dialog"
            aria-modal="true"
            aria-label={t("What do you want to do?")}
            onMouseDown={(event) => event.target === event.currentTarget && close()}
          >
            <div className={`stage-column${compact ? " stage-compact" : ""}`}>
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
              {session === null || mode === null ? (
                <Menu
                  explains={session?.explains ?? false}
                  onChoose={choose}
                  onAsk={() => (session ? session.startAsking() : (pendingChoice.current = "followUp"))}
                />
              ) : (
                <ModeView session={session} />
              )}
            </div>
            {showsLesson ? <LessonOverlay player={lesson.player} state={lesson.state} onTap={lesson.toggle} /> : null}
            <VoiceCaption state={voice.state} onScreen={session?.onScreenText ?? []} />
            {session && <SelectionAskPill session={session} />}
          </div>
        </TalkContext.Provider>
      </VoiceContext.Provider>
    </LessonContext.Provider>
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
  return (
    <nav className="stage-menu" aria-label={t("What do you want to do?")}>
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

  // Lifted large; after «Solution» it steps back to the size of print. One scale for both crops.
  const widest = Math.max(...regions.map((region) => region.width));
  const scale = width === 0 ? 1 : Math.min(compact ? 1.1 : 1.7, width / widest);

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
      .renderRegion(pageIndex, canvas.current, region, scale, window.devicePixelRatio || 1)
      .then(() => setDrawn((count) => count + 1));
  }, [document, pageIndex, region, scale, ready]);
  const version = session?.version;
  const lessonShows = useLessonShows();
  const voiceLit = useVoiceState().lit;
  const shows = useMemo(
    () => [
      ...lessonShows,
      ...voiceLit.flatMap((command): LessonShow[] =>
        command.kind.op === "highlight" || command.kind.op === "circle"
          ? [{ op: command.kind.op === "circle" ? "circle" : "underline", quote: command.kind.term, on: "voice" }]
          : [],
      ),
    ],
    [lessonShows, voiceLit],
  );
  const marks = useMemo(
    () =>
      page && session
        ? cropMarks(page, region, session, shows)
        : { underlines: [], circles: [], highlights: [], strikes: [], pointers: [], tints: [] },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, region, session, version, shows],
  );
  // While the mascot walks the steps, the step's datum magnified in a lens (QuoteLoupe): its spot on the crop, else
  // the first of its data underlined. Not with Reduce Motion.
  const lens = useMemo(() => {
    const width = region.width * scale;
    const height = region.height * scale;
    if (!session || session.mascotFocusStep === null || reducedMotion() || width <= 1 || height <= 1) return null;
    const crop = { width, height };
    const focus = session.part?.cards?.[session.mascotFocusStep]?.focus ?? null;
    const on = focus?.on?.toLowerCase() === "statement" && hasStatement ? "statement" : "question";
    const spot = focus && on === role ? StepFocusGeometry.rect(focus, crop) : null;
    const line = marks.underlines[0];
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
    const datum = {
      x: crop.left + lens.target.x,
      y: crop.top + lens.target.y,
      width: lens.target.width,
      height: lens.target.height,
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
      {marks.circles.map((rect, index) => {
        const box = toCrop(Rects.inset(rect, -4, -3));
        return <span key={`c${index}`} className="stage-circle" style={box} />;
      })}
      {session && (
        <StepFocusMark
          session={session}
          role={role}
          hasStatement={hasStatement}
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
const mascotSize = 56;

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
 * recoloured, so exactly the glyphs turn blue, crisp, with nothing drawn round them. The crop is drawn as dark ink and
 * inverted on screen, so the letters are painted the colour the inversion turns into the blue.
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
    context.fillStyle = invertedColour(accent);
    context.fillRect(0, 0, target.width, target.height);
    context.globalCompositeOperation = "source-over";
  }, [base, drawn, width, key]);
  return <canvas ref={layer} className="stage-tint" style={{ width, height }} aria-hidden="true" />;
}

/** The colour that `filter: invert(1)` turns into `colour` (a hex colour; anything else is the system blue's). */
function invertedColour(colour: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour)?.[1] ?? "0a84ff";
  const [r, g, b] = [0, 2, 4].map((at) => 255 - parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${r} ${g} ${b})`;
}

/**
 * The spot the open step is about (`StepFocusMarks`), on the crop the model placed it in: a ring or an arrow that draws
 * itself, and a few words beside it, on the side where they are out of the way.
 */
function StepFocusMark({
  session,
  role,
  hasStatement,
  width,
  height,
  lens = null,
}: {
  session: QuestionSession;
  role: "question" | "statement";
  hasStatement: boolean;
  width: number;
  height: number;
  /** The lens showing the spot magnified: it is the spot's one mark, and the label keeps clear of it. */
  lens?: Box | null;
}) {
  const step = session.underlinedStep;
  const focus = step !== null ? (session.part?.cards?.[step]?.focus ?? null) : null;
  if (!focus) return null;
  const on = focus.on?.toLowerCase() === "statement" && hasStatement ? "statement" : "question";
  if (on !== role) return null;
  const region = StepFocusGeometry.rect(focus, { width, height });
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
        <span
          className="stage-circle"
          aria-hidden="true"
          style={{ left: region.x - 6, top: region.y - 6, width: region.width + 12, height: region.height + 12 }}
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
  underlines: Rect[];
  circles: Rect[];
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
          circles.push(lines[0]!.bounds);
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
    else underlines.push(...rects);
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
  return { underlines, circles, highlights, strikes, pointers, tints };
}

function ModeView({ session }: { session: QuestionSession }) {
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
  const messages: Record<string, string> = {
    matches: t("That’s right."),
    differs: t("Not yet: it differs from the expected result."),
    unreadable: t("I couldn’t read that expression."),
    checking: t("Checking the expected result…"),
  };
  return (
    <div className="stage-panel">
      {part && <p className="stage-asks">{part.asks}</p>}
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
        <p className="stage-step-note">
          {t("Use %@; * for ×, ^ for powers, sqrt(), abs().", session.answerNames.join(", "))}
        </p>
      )}
      {session.state.kind === "loading" && <Progress session={session} />}
      {result && (
        <p className={`stage-result stage-result-${result}`} role="status">
          {messages[result]}
        </p>
      )}
      <Actions session={session} />
    </div>
  );
}

function SolutionView({ session }: { session: QuestionSession }) {
  const t = useT();
  const part = session.part;
  const solution = session.solution;

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
      session.showsIllustration);
  return (
    <div className="stage-panel stage-solution">
      {solution.figure && (
        <details className="stage-figure-reading">
          <summary>{t("How I read the figure")}</summary>
          <MathText text={solution.figure} />
        </details>
      )}
      <AnswerBox part={part} language={session.notationLanguage} />
      {!session.isConfirmed && !session.isConfirming && session.state.kind === "ready" && (
        <p className="stage-caution">{t("I couldn’t check every step of this. Double-check it.")}</p>
      )}
      {session.isConfirming && <p className="stage-progress">{t("Checking the result…")}</p>}
      <div className="stage-solution-body">
        <div className="stage-steps">
          {evidence ? (
            <EvidenceView evidence={evidence} />
          ) : (
            Array.from({ length: session.stepCount }, (_, index) => index)
              .filter((index) => index < visible)
              .map((index) => <StepCard key={index} part={part} index={index} session={session} interactive />)
          )}
        </div>
        {(formulas.length > 0 || side) && (
          <aside className="stage-formulas" aria-label={t("Formulas")}>
            {formulas.length > 0 && <h3>{t("Formulas")}</h3>}
            {formulas.map((formula) => (
              <div key={formula.name + formula.latex} className="stage-formula">
                <span>{formula.name}</span>
                <MathView latex={formula.latex} />
              </div>
            ))}
            {side && <SideFigures session={session} />}
          </aside>
        )}
      </div>
      <Actions session={session} />
    </div>
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
function SideFigures({ session }: { session: QuestionSession }) {
  const lessonFigure3D = useLessonState()?.figure3D ?? null;
  // The point the beat being said rings on the graph (`LessonRun.graphRing`).
  const lessonGraphRing = useLessonState()?.shows.find((show) => LessonShows.isOnGraph(show))?.point ?? null;
  const figure = session.solutionFigure;
  const graph = session.sideGraph;
  // The step the mascot is walking (MascotFigureFocus): the body waits above what it adds to the figure; with the plan
  // pointing at figures, a step that adds nothing points at the figure as a whole.
  const guided = session.mascotFocusStep;
  const pointer = guided !== null && (questionPlan(session)?.pointer ?? false);
  return (
    <div className="stage-figures">
      {figure?.kind === "table" ? (
        <div className="stage-figure-fit">
          <SignTableView table={figure.table} />
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
      ) : session.expectsFigure && !session.showsIllustration ? (
        // The drawing on its way, or why it isn't there (the drawing's own item shows it otherwise).
        <IllustrationPanel session={session} />
      ) : null}
      {session.showsGraph && graph && session.hasGraph && (
        <CurveGraph graph={graph} session={session} height={220} ring={lessonGraphRing} />
      )}
      {session.showsIllustration && <IllustrationPanel session={session} />}
    </div>
  );
}

/** The question's drawing, or what is happening with it: never a spinner with nothing behind it. */
function IllustrationPanel({ session }: { session: QuestionSession }) {
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
              <MathView key={index} latex={ExamNotation.trigInLatex(piece.line, language)} display />
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
}: {
  part: Part;
  index: number;
  session: QuestionSession;
  interactive?: boolean;
  /** The student has just moved one step on to this one: its formula grows out of the last. */
  advanced?: boolean;
}) {
  const card: Card | null = part.cards && part.cards.length > 0 ? (part.cards[index] ?? null) : null;
  const selected = session.selectedStep === index;
  const lesson = useLessonState();
  const lit = lesson?.step === index;
  const pitfall = lesson?.pitfall?.step === index ? lesson.pitfall : null;
  const [pitfallOpen, setPitfallOpen] = useState(false);
  return (
    <article
      className={`stage-step${selected ? " selected" : ""}${session.revealingStep === index ? " arriving" : ""}${lit ? " lesson-lit" : ""}`}
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
            {card.latex.trim() !== "" && !NoteMath.formulaRepeats(card.latex, card.note ?? "") && (
              <StepFormula
                part={part}
                index={index}
                latex={ExamNotation.trigInLatex(card.latex, session.notationLanguage)}
                advanced={advanced}
                language={session.notationLanguage}
              />
            )}
            {card.branches && card.branches.length > 0 && (
              <div className="stage-branches">
                {card.branches.map((branch, position) => (
                  <div key={position}>
                    <span>{branch.title}</span>
                    <MathView latex={ExamNotation.trigInLatex(branch.latex, session.notationLanguage)} />
                  </div>
                ))}
              </div>
            )}
            {card.note && (
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
    exercise: session.question.groupText,
    partLabel: part?.label ?? "",
    partAsks: part?.asks ?? "",
    partAnswer: part?.answer.text ?? "",
    solution: part ? describePart(part).join("\n") : "",
  });
}

/** The same question with new numbers: the app wrote the numbers in and knows the answer. */
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
    <div className="stage-panel">
      <p className="stage-menu-title">{t("Similar question")}</p>
      <p className="stage-hint">
        <MathText text={session.variantText} />
      </p>
      <form
        className="stage-try"
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
      {result && (
        <p className={`stage-result stage-result-${result}`} role="status">
          {result === "matches" ? t("That’s right.") : result === "differs" ? t("Not yet.") : unreadable}
        </p>
      )}
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
  const lesson = useLessonState();
  const toggleLesson = useLessonToggle();
  const [asked, setAsked] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (session.mode === "followUp") input.current?.focus();
  }, [session.askFocusID, session.mode]);
  const actions: [string, () => void, boolean][] = [
    [t("Hint"), () => session.showFirstStep(), session.mode !== "hint"],
    [t("Let me try"), () => session.choose("tryIt"), session.mode !== "tryIt"],
    [
      session.explains ? t("Show the explanation") : t("Solution"),
      () => session.choose("solution"),
      session.mode !== "solution",
    ],
    [
      lesson?.playing ? t("Stop Explaining") : t("Explain It to Me"),
      toggleLesson,
      session.mode === "solution" && session.part !== null && session.state.kind === "ready",
    ],
    [t("Try a Similar One"), () => void session.tryVariant(), session.canPractiseVariant],
    [
      session.showsIllustration ? t("Hide Drawing") : t("Draw It"),
      () => session.toggleIllustration(),
      session.canDraw && session.part !== null,
    ],
    [
      session.showsTiming ? t("Hide Waveforms") : t("Draw Waveforms"),
      () => session.toggleTiming(),
      session.canDrawTiming,
    ],
    [
      session.showsGraph ? t("Hide Graph") : t("Show the graph"),
      () => session.toggleGraph(),
      session.hasGraph && session.mode !== null,
    ],
    [
      t("Explain Better"),
      () => session.solveWithStrongerModel(),
      session.mode === "solution" && session.part !== null && !session.solvedByStrongerModel,
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
 * model reads the picture, the computer's own reading (or soft bars), then the model's reading typeset. If that
 * reading fails, drops the numbers the computer read, or takes longer than `placeholderLimit`, the crop itself is
 * shown; a reading accepted later still replaces it.
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
    if (source.transcribes) return { kind: "waiting" };
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

  const picture = source.picture;
  const scale = compact ? 0.85 : 1;
  return (
    <div className="stage-question stage-screen-question" aria-live="polite">
      {shown.kind === "typeset" ? (
        <TypesetQuestion transcription={shown.transcription} source={source} />
      ) : shown.kind === "crop" && picture ? (
        <img
          className="stage-screen-crop"
          src={picture.url}
          alt={source.question.text}
          style={{ width: picture.width * scale, height: picture.height * scale }}
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

/** The question typeset from a reading of its picture: prose with inline maths, display formulas, and the figures
 * cut from the picture where the reading says they are. */
function TypesetQuestion({ transcription, source }: { transcription: QuestionTranscription; source: PictureQuestion }) {
  const picture = source.picture;
  // The i-th figure block without a box of its own takes the i-th figure found on the picture.
  const figureOrder = transcription.blocks.map(
    (_, index) => transcription.blocks.slice(0, index).filter((block) => block.type === "figure").length,
  );
  return (
    <div className="stage-typeset">
      {transcription.blocks.map((block, index) => {
        if (block.type === "figure") {
          const box = Transcriptions.rect(block) ?? source.figureBoxes[figureOrder[index]!] ?? null;
          if (!picture || !box) return null;
          const width = box.width * picture.width;
          const height = box.height * picture.height;
          return (
            <figure key={index} className="stage-figure">
              <div
                role="img"
                aria-label={block.caption ?? ""}
                style={{
                  width,
                  height,
                  backgroundImage: `url(${picture.url})`,
                  backgroundSize: `${picture.width}px ${picture.height}px`,
                  backgroundPosition: `${-box.x * picture.width}px ${-box.y * picture.height}px`,
                }}
              />
              {block.caption ? <figcaption>{block.caption}</figcaption> : null}
            </figure>
          );
        }
        const text = block.text ?? "";
        if (text.trim() === "") return null;
        if (block.type === "formula") return <MathView key={index} latex={text} display className="stage-formula" />;
        return <MarkupText key={index} text={text} />;
      })}
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
      exercise: session.question.groupText,
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
  // A formula mark, or one on a whole equation, underlines the formula; a symbol is ringed.
  const underlined = state.lit.some(
    (command) =>
      command.kind.op === "formula" ||
      ((command.kind.op === "highlight" || command.kind.op === "circle") &&
        VoiceFormula.equationLine(command.kind.term) !== null),
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
  // The line cut at its bold stretches, each piece typeset with its maths.
  const pieces = (line: string, start: number) => {
    const cuts = new Set([0, line.length]);
    for (const [from, to] of found.bold) {
      if (to > start && from < start + line.length) {
        cuts.add(Math.max(0, from - start));
        cuts.add(Math.min(line.length, to - start));
      }
    }
    const points = [...cuts].sort((a, b) => a - b);
    return points.slice(0, -1).map((at, index) => {
      const piece = line.slice(at, points[index + 1]);
      const bold = found.bold.some(([from, to]) => start + at >= from && start + at < to);
      return bold ? (
        <strong key={index}>
          <MathText text={piece} />
        </strong>
      ) : (
        <MathText key={index} text={piece} />
      );
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
