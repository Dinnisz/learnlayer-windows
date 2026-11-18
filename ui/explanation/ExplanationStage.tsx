// The Mac's ExplanationOverlay and QuestionBubble @ ref 2026-11-04: a loose equation clicked in the reader, lifted
// in white over the dimmed page, with what the student wants to do; then the steps, the marks on the equation, the
// pieces to click for "Let me try", the worked lines, and the draggable graph. Esc closes it. A click on a function or
// an equation gets the Mac's study menu (EquationStudyAction) and the figure the app builds for the task.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  EquationDetector,
  ExplanationProvider,
  ExplanationSession,
  decodeExplanationScript,
  type EquationMatch,
  type ExplanationIntent,
  type ExplanationScript,
} from "@core/explanation/explanation";
import { DiskCache } from "@core/ai/diskCache";
import {
  EquationStudyActions,
  ExplanationFigure,
  ParsedStandaloneMath,
  type EquationStudyAction,
} from "@core/explanation/studyAction";
import { IllustrationView } from "../figures/IllustrationView";
import { ConceptSlug, Plans, type MemoryStore } from "@core/memory/memory";
import { memoryStore } from "../memory/memory";
import { isSignedOut } from "@core/ai/modelClient";
import mockExplanation from "@core/mocks/MockExplanation.json";
import type { PageText, Rect } from "@core/pdf/page";
import { drawingLanguage, modelClient, usesMock } from "../ai/solver";
import { CurveGraph } from "../figures/CurveGraph";
import { MathText } from "../components/Math";
import { dataFiles } from "../native";
import { useT } from "../i18n";
import type { ReaderDocument } from "../reader/readerDocument";
import { stageInk } from "../stage/stageInk";
import { HandDrawnMark } from "../components/HandDrawnMark";
import "../stage/stage.css";
import "./explanation.css";

let provider: ExplanationProvider | null = null;
let memory: MemoryStore | null = null;
void memoryStore().then((store) => (memory = store));

/** The explanations, saved in `explanations.json`. With mocks, the Mac's sample. */
function explanationProvider(): ExplanationProvider {
  provider ??= new ExplanationProvider({
    cache: new DiskCache<ExplanationScript>("explanations.json", 100, dataFiles),
    client: (model) => modelClient({ model }),
    language: drawingLanguage,
    mock: usesMock() ? () => decodeExplanationScript(mockExplanation) : null,
    // The memory reads the plan; the model fills it in (ExplanationPlanner).
    plan: (equation) => {
      if (!memory) return null;
      const plan = memory.plan({
        question: equation,
        kind: "formula",
        area: "math",
        concept: ConceptSlug.make(equation),
      });
      return { block: Plans.promptBlock(plan), token: Plans.cacheToken(plan) };
    },
    remember: (equation, script) =>
      memory?.record({
        text: equation,
        documentName: null,
        page: null,
        concepts: [ConceptSlug.make(equation)],
        kind: "formula",
        language: drawingLanguage(),
        explanationJSON: JSON.stringify(script),
        area: "math",
      }),
  });
  return provider;
}

const intents: [ExplanationIntent, string][] = [
  ["explain", "Explain it"],
  ["graph", "Show the graph"],
  ["tryIt", "Let me try"],
  ["solve", "Solve it step by step"],
];

export function ExplanationStage({
  document,
  page,
  pageIndex,
  match,
  close,
  context = null,
}: {
  document: ReaderDocument;
  page: PageText;
  pageIndex: number;
  match: EquationMatch;
  close: () => void;
  /** What is sent with it, when not the lines around it on the page (a selected step of a worked solution). */
  context?: string | null;
}) {
  const t = useT();
  const session = useMemo(
    () =>
      new ExplanationSession(
        {
          text: match.text,
          context: context ?? EquationDetector.context(page, match.bounds),
          has: (target) => EquationDetector.rectOnPage(page, match.bounds, target) !== null,
        },
        explanationProvider(),
        null,
        isSignedOut,
      ),
    [match, page, context],
  );
  useSyncExternalStore(
    useCallback((listener: () => void) => session.subscribe(listener), [session]),
    () => session.version,
  );
  useEffect(() => () => session.cancel(), [session]);
  // A function or an equation gets the study menu; any other formula the four ways to look at it.
  const parsed = useMemo(() => ParsedStandaloneMath.parse(match.text), [match]);
  const studies: EquationStudyAction[] = parsed ? EquationStudyActions.menuOptions(parsed) : [];
  const options = studies.length;

  // Esc closes; 1–4 choose while the menu is up.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (session.intent !== null) return;
      const index = Number(event.key) - 1;
      if (studies.length > 0 && index >= 0 && index < studies.length) {
        event.preventDefault();
        session.chooseStudy(studies[index]!, parsed);
      } else if (studies.length === 0 && index >= 0 && index < intents.length) {
        event.preventDefault();
        session.choose(intents[index]![0]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, close, parsed, options]);

  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = holder.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);
  const region = match.bounds;
  const scale = width === 0 ? 1 : Math.min(2.4, width / region.width);
  useEffect(() => {
    if (!canvas.current || width === 0) return;
    void document.renderRegion(
      pageIndex,
      canvas.current,
      region,
      scale,
      window.devicePixelRatio || 1,
      stageInk(canvas.current),
    );
  }, [document, pageIndex, region, scale, width]);
  const toCrop = (rect: Rect) => ({
    left: (rect.x - region.x) * scale,
    top: (region.y + region.height - (rect.y + rect.height)) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  });
  const rectOf = (target: string) => EquationDetector.rectOnPage(page, region, target);

  const state = session.state;
  const graph = session.script?.graph ?? null;
  // The figure for a task of the study menu (or the graph asked for), built by the app (ExplanationFigure).
  const figure =
    state.kind === "ready"
      ? ExplanationFigure.compiled(
          session.script,
          session.studyAction,
          match.text,
          drawingLanguage(),
          session.studyAction !== null || session.intent === "graph",
        )
      : null;
  const showsFigure =
    figure !== null &&
    (session.studyAction !== null ||
      session.intent === "graph" ||
      (session.script?.steps ?? []).some((step) => step.showsGraph === true || step.kind === "animation"));
  return (
    <div
      className="stage explanation-stage"
      role="dialog"
      aria-modal="true"
      aria-label={match.text}
      onClick={(event) => {
        // A click beside the card, on the dimmed page, closes it.
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="explanation-card">
        <div className="explanation-equation" ref={holder}>
          <div className="explanation-crop" style={{ width: region.width * scale, height: region.height * scale }}>
            <canvas
              ref={canvas}
              style={{ width: region.width * scale, height: region.height * scale }}
              aria-hidden="true"
            />
            {session.marks.map((mark, index) => {
              const rect = rectOf(mark.target);
              if (!rect) return null;
              const box = toCrop(rect);
              // New marks are drawn one after another, like a pen.
              return (
                <HandDrawnMark
                  key={`${mark.style}\n${mark.target}`}
                  style={mark.style === "circle" ? "circle" : "underline"}
                  rect={{ x: box.left, y: box.top, width: box.width, height: box.height }}
                  delay={Math.max(0, index - session.marksBeforeGroup) * 0.45}
                />
              );
            })}
            {session.hasMoreSteps &&
              session.clickableTargets.map((target) => {
                const rect = rectOf(target);
                if (!rect) return null;
                return (
                  <button
                    key={target}
                    type="button"
                    className="explanation-target"
                    style={toCrop(rect)}
                    aria-label={target}
                    onClick={() => session.answer(target)}
                  />
                );
              })}
            {session.symbols.map((symbol) => {
              const rect = rectOf(symbol.target);
              return rect ? (
                <span key={symbol.target} className="explanation-symbol" style={toCrop(rect)} title={symbol.meaning} />
              ) : null;
            })}
          </div>
        </div>

        {session.intent === null && studies.length > 0 ? (
          <nav className="stage-menu" aria-label={t("What would you like to do?")}>
            <p className="stage-menu-title">{t("What would you like to do?")}</p>
            <ol>
              {studies.map((action, index) => (
                <li key={action}>
                  <button type="button" onClick={() => session.chooseStudy(action, parsed)} autoFocus={index === 0}>
                    <span className="stage-menu-number">{index + 1}</span>
                    {t(EquationStudyActions.title(action))}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        ) : session.intent === null ? (
          <nav className="stage-menu" aria-label={t("What do you want to do?")}>
            <p className="stage-menu-title">{t("What do you want to do?")}</p>
            <ol>
              {intents.map(([intent, title], index) => (
                <li key={intent}>
                  <button type="button" onClick={() => session.choose(intent)} autoFocus={index === 0}>
                    <span className="stage-menu-number">{index + 1}</span>
                    {t(title)}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        ) : state.kind === "loading" ? (
          <p className="stage-progress" role="status">
            {t("Thinking…")}
          </p>
        ) : state.kind === "needsKey" ? (
          <p className="stage-caution">{t("Sign in to LearnLayer in Settings to get explanations.")}</p>
        ) : state.kind === "failed" ? (
          <p className="stage-caution">
            {t("Couldn’t get an explanation.")}{" "}
            <button type="button" className="stage-link" onClick={() => void session.load()}>
              {t("Try Again")}
            </button>
          </p>
        ) : (
          <div className="explanation-body">
            {session.solvingLines.length > 0 ? (
              <ol className="explanation-solving">
                {session.solvingLines.map((line, index) => (
                  <li key={index}>
                    {line.move && <span className="explanation-move">{line.move}</span>}
                    <MathText text={line.line} />
                  </li>
                ))}
              </ol>
            ) : (
              <div className="explanation-bubble">
                {session.currentGroup.map((step, index) => (
                  <p key={index} className={step.kind === "question" ? "explanation-question" : undefined}>
                    <MathText text={step.text ?? ""} />
                  </p>
                ))}
                {session.feedback === "correct" && (
                  <p className="stage-result stage-result-matches">{t("That’s it!")}</p>
                )}
                {session.feedback === "notQuite" && (
                  <p className="stage-result stage-result-differs">
                    {t("Not quite. Try another part, or ask for a hint.")}
                  </p>
                )}
              </div>
            )}
            {session.isUnverified && (
              <p className="stage-caution">{t("I couldn’t check every step of this. Double-check it.")}</p>
            )}
            {showsFigure && figure ? (
              <IllustrationView scene={figure} language={drawingLanguage()} maxHeight={260} />
            ) : (
              session.showsGraph && graph && <CurveGraph graph={graph} session={session} height={240} />
            )}
            <footer className="explanation-actions">
              {session.canShowHint && (
                <button type="button" onClick={() => session.showHint()}>
                  {t("Hint")}
                </button>
              )}
              {session.hasMoreSteps && (
                <button type="button" onClick={() => session.showAll()}>
                  {t("Show me")}
                </button>
              )}
              {session.canExplainBetter && (
                <button type="button" onClick={() => session.explainBetter()}>
                  {t("Explain Better")}
                </button>
              )}
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
