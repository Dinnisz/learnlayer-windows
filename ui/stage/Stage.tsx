// Port of LearnLayer/Problems/QuestionOverlay.swift, SolutionSteps.swift, StatementUnderlines.swift and
// EvidenceAnswerView.swift @ ref 2026-11-04 (the reader's stage). The page behind dims and blurs, the question is
// lifted off it, and a menu asks what the student wants: 1–4 choose, Enter opens the solution, Esc closes.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { failureMessage, offersUpgrade } from "@core/ai/modelClient";
import { linesOf, Rects, type PageText, type Rect } from "@core/pdf/page";
import { passageLinesOfPages } from "@core/pdf/passageLines";
import { ChoiceCheck } from "@core/problems/choiceCheck";
import { formulasFor, type Card, type Part } from "@core/problems/problemSolution";
import { Variant } from "@core/problems/problemVariant";
import { QuestionPages } from "@core/problems/questionPages";
import { QuestionSession, type Mode } from "@core/problems/questionSession";
import { StatementQuotes } from "@core/problems/statementQuotes";
import { describePart, TextHelpContext } from "@core/problems/textHelp";
import { solutionProvider, textHelpProvider } from "../ai/solver";
import { Icon } from "../components/Icon";
import { MathText, MathView } from "../components/Math";
import { useT } from "../i18n";
import { showMain } from "../native";
import type { ReaderDocument } from "../reader/readerDocument";
import type { OpenedQuestion } from "../windows/reader/ReaderWindow";

const base64Bytes = (text: string) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0));

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
  const session = new QuestionSession(
    {
      question,
      images,
      passageLines: passageLinesOfPages(pages),
      sendsMaterial: QuestionPages.sendsMaterial(pages, question),
    },
    {
      provider: solutionProvider(),
      config: () => solutionProvider().services.config(),
      help: async ({ passage, context, image }) => (await textHelpProvider().help(passage, context, image)).explanation,
    },
  );
  void session.openQuietly();
  return { session, page };
}

function useSession(session: QuestionSession | null): number {
  return useSyncExternalStore(
    useCallback((listener: () => void) => session?.subscribe(listener) ?? (() => {}), [session]),
    () => session?.version ?? -1,
  );
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Stage({
  document,
  opened,
  close,
}: {
  document: ReaderDocument;
  opened: OpenedQuestion;
  close: () => void;
}) {
  const t = useT();
  const [prepared, setPrepared] = useState<{ session: QuestionSession; page: PageText } | null>(null);
  const pendingChoice = useRef<Mode | null>(null);
  const session = prepared?.session ?? null;
  useSession(session);

  useEffect(() => {
    let cancelled = false;
    let made: QuestionSession | null = null;
    void prepare(document, opened).then((ready) => {
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
  }, [document, opened]);

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
  }, [session, choose, close]);

  const mode = session?.mode ?? null;
  const compact = mode === "solution" || mode === "followUp";

  return (
    <div
      className="stage"
      role="dialog"
      aria-modal="true"
      aria-label={t("What do you want to do?")}
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div className={`stage-column${compact ? " stage-compact" : ""}`}>
        <QuestionCrop
          document={document}
          opened={opened}
          page={prepared?.page ?? null}
          session={session}
          compact={compact}
        />
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
    </div>
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
}: {
  document: ReaderDocument;
  pageIndex: number;
  region: Rect;
  scale: number;
  ready: boolean;
  page: PageText | null;
  session: QuestionSession | null;
  label?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current || !ready) return;
    void document.renderRegion(pageIndex, canvas.current, region, scale, window.devicePixelRatio || 1);
  }, [document, pageIndex, region, scale, ready]);
  const version = session?.version;
  const marks = useMemo(
    () => (page && session ? cropMarks(page, region, session) : { underlines: [], circles: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, region, session, version],
  );
  const toCrop = (rect: Rect) => ({
    left: (rect.x - region.x) * scale,
    top: (region.y + region.height - (rect.y + rect.height)) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  });
  return (
    <div className="stage-crop" style={{ width: region.width * scale, height: region.height * scale }}>
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
    </div>
  );
}

/** Where the open step's data stands in the crop (its printed lines), and the right option of a multiple choice. */
function cropMarks(page: PageText, region: Rect, session: QuestionSession): { underlines: Rect[]; circles: Rect[] } {
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
  return { underlines, circles };
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
  if (session.state.kind === "loading" || !part) return <Progress session={session} />;
  const count = session.stepCount;
  const shown = Math.min(session.revealedSteps, count);
  return (
    <div className="stage-panel">
      <p className="stage-hint">
        <Icon symbol="lightbulb" size={18} className="stage-hint-icon" />
        <MathText text={part.hint} />
      </p>
      {shown > 0 && <StepCard part={part} index={shown - 1} session={session} />}
      {session.showsAnswer && <AnswerBox part={part} />}
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
  return (
    <div className="stage-panel stage-solution">
      {solution.figure && (
        <details className="stage-figure-reading">
          <summary>{t("How I read the figure")}</summary>
          <MathText text={solution.figure} />
        </details>
      )}
      <AnswerBox part={part} />
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
        {formulas.length > 0 && (
          <aside className="stage-formulas" aria-label={t("Formulas")}>
            <h3>{t("Formulas")}</h3>
            {formulas.map((formula) => (
              <div key={formula.name + formula.latex} className="stage-formula">
                <span>{formula.name}</span>
                <MathView latex={formula.latex} />
              </div>
            ))}
          </aside>
        )}
      </div>
      <Actions session={session} />
    </div>
  );
}

function AnswerBox({ part }: { part: Part }) {
  const t = useT();
  return (
    <section className="stage-answer" aria-label={t("Answer")}>
      <span className="stage-answer-label">{t("Answer")}</span>
      <div className="stage-answer-value">
        {part.answerLatex ? <MathView latex={part.answerLatex} display /> : <MathText text={part.answer.text} />}
      </div>
    </section>
  );
}

function StepCard({
  part,
  index,
  session,
  interactive = false,
}: {
  part: Part;
  index: number;
  session: QuestionSession;
  interactive?: boolean;
}) {
  const card: Card | null = part.cards && part.cards.length > 0 ? (part.cards[index] ?? null) : null;
  const selected = session.selectedStep === index;
  return (
    <article
      className={`stage-step${selected ? " selected" : ""}${session.revealingStep === index ? " arriving" : ""}`}
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
            {card.latex.trim() !== "" && <MathView latex={card.latex} display className="stage-step-latex" />}
            {card.branches && card.branches.length > 0 && (
              <div className="stage-branches">
                {card.branches.map((branch, position) => (
                  <div key={position}>
                    <span>{branch.title}</span>
                    <MathView latex={branch.latex} />
                  </div>
                ))}
              </div>
            )}
            {card.note && (
              <p className="stage-step-note">
                <MathText text={card.note} />
              </p>
            )}
          </>
        ) : (
          <p className="stage-step-note">
            <MathText text={part.steps[index] ?? ""} />
          </p>
        )}
      </div>
    </article>
  );
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
    [t("Try a Similar One"), () => void session.tryVariant(), session.canPractiseVariant],
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
