// Port of LearnLayer/Reader/PDFReaderView.swift and ReaderModel.swift @ ref 2026-11-04 (the reader part; the stage
// that opens over it is ui/stage/). Open a PDF, scroll, zoom, drag a PDF in; a click on a question's label opens it.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EquationDetector, looksLikeMath, type EquationMatch } from "@core/explanation/explanation";
import { SelectionAsk } from "@core/problems/selectionAsk";
import { normalizeText } from "@core/problems/textNormalizer";
import { PassageStage, type PassageSource } from "../../stage/PassageStage";
import { Rects, type PageText, type Rect } from "@core/pdf/page";
import { questionWithLabelAt, type ExamQuestion } from "@core/problems/questionDetector";
import { Icon } from "../../components/Icon";
import { usePlatform, useT } from "../../i18n";
import { PageGeometry, ReaderDocument } from "../../reader/readerDocument";
import { ExplanationStage } from "../../explanation/ExplanationStage";
import { onIslandCommand, publishIsland } from "../../island";

/** `?open=` is read once, not again when StrictMode runs the effect twice. */
let openedFromQuery = false;

/** Space between pages and around them, in CSS pixels. */
const gap = 16;
const minScale = 0.4;
const maxScale = 4;

/** A question the student clicked, with where it is on screen when it was clicked. */
export interface OpenedQuestion {
  question: ExamQuestion;
  pageIndex: number;
  /** The question's box in the window, CSS pixels. */
  frame: { left: number; top: number; width: number; height: number };
}

interface ReaderWindowProps {
  /** What opens over the reader (the stage), given the document and the clicked question. */
  renderOverlay?: (document: ReaderDocument, opened: OpenedQuestion, close: () => void) => ReactNode;
}

export function ReaderWindow({ renderOverlay }: ReaderWindowProps) {
  const t = useT();
  const { shortcutModifier } = usePlatform();
  const [document, setDocument] = useState<ReaderDocument | null>(null);
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [scale, setScale] = useState<number | "fit">("fit");
  const [opened, setOpened] = useState<OpenedQuestion | null>(null);
  /** A loose equation clicked (not a question): the formula explainer opens over it. */
  const [equation, setEquation] = useState<{
    page: PageText;
    pageIndex: number;
    match: EquationMatch;
    context?: string;
  } | null>(null);
  /** A selection the "Ask" button beside it can ask about, and a selected passage opened with its own choices. */
  const [selection, setSelection] = useState<PageSelection | null>(null);
  const [passage, setPassage] = useState<PassageSource | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const open = useCallback(async (file: File) => {
    try {
      const next = await ReaderDocument.open(await file.arrayBuffer(), file.name.replace(/\.pdf$/i, ""));
      setDocument((previous) => {
        previous?.destroy();
        return next;
      });
      setOpened(null);
      setFailed(false);
      setScale("fit");
      window.document.title = next.name;
      scroller.current?.scrollTo({ top: 0 });
    } catch {
      setFailed(true);
    }
  }, []);

  // Development only: `?open=<url>` opens a PDF the dev server can reach (the browser pane has no file picker).
  useEffect(() => {
    if (!import.meta.env.DEV || openedFromQuery) return;
    openedFromQuery = true;
    const url = new URLSearchParams(window.location.search).get("open");
    if (!url) return;
    void fetch(url)
      .then((response) => response.blob())
      .then((blob) => open(new File([blob], decodeURIComponent(url.split("/").pop() ?? "document.pdf"))));
  }, [open]);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () => {
      setViewportWidth(element.clientWidth);
      setViewportHeight(element.clientHeight);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  // "Fit" is the widest page across the window, never larger than twice its size.
  const resolvedScale = useMemo(() => {
    if (scale !== "fit") return scale;
    if (!document || viewportWidth === 0) return 1;
    const widest = Math.max(...document.sizes.map((size) => size.mediaBox.width));
    return Math.min(2, Math.max(minScale, (viewportWidth - 2 * gap) / widest));
  }, [scale, document, viewportWidth]);

  // The pages on screen and within a screen of it, from the scroll position and the pages' known heights.
  const nearPages = useMemo(() => {
    const near = new Set<number>();
    if (!document) return near;
    const reach = Math.max(viewportHeight, 600);
    let top = gap;
    document.sizes.forEach((size, index) => {
      const bottom = top + size.mediaBox.height * resolvedScale;
      if (bottom >= scrollTop - reach && top <= scrollTop + viewportHeight + reach) near.add(index);
      top = bottom + gap;
    });
    return near;
  }, [document, resolvedScale, scrollTop, viewportHeight]);

  const zoom = useCallback(
    (factor: number) => setScale(Math.min(maxScale, Math.max(minScale, resolvedScale * factor))),
    [resolvedScale],
  );

  // Ctrl+O opens, Ctrl+= and Ctrl+- zoom, Ctrl+0 fits (the platform's modifier).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event[shortcutModifier] || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "o") fileInput.current?.click();
      else if (key === "=" || key === "+") zoom(1.25);
      else if (key === "-") zoom(0.8);
      else if (key === "0") setScale("fit");
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcutModifier, zoom]);

  useEffect(() => () => document?.destroy(), [document]);

  /**
   * Asks about the selection (PDFReaderView.explainSelection): one line of maths opens like a clicked equation, with
   * the lines above as context so the tutor explains why this step follows; prose or several lines open as a passage
   * with its own choices.
   */
  const ask = useCallback(async () => {
    const chosen = selection;
    if (!document || !chosen) return;
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    const page = await document.text(chosen.pageIndex);
    const grown = Rects.inset(chosen.bounds, -6, -4);
    const bounds = Rects.intersection(grown, document.sizes[chosen.pageIndex]!.mediaBox) ?? grown;
    const isOneLineOfMaths = !chosen.text.includes("\n") && looksLikeMath(chosen.text);
    if (!isOneLineOfMaths) {
      // A long drag is cut to what a selection may send.
      const normalized = normalizeText(chosen.text);
      setPassage({
        kind: "passage",
        text: SelectionAsk.make(normalized, "statement")?.text ?? normalized,
        context: EquationDetector.context(page, bounds),
      });
      return;
    }
    const context =
      "The student selected this step of a worked solution and wants to know why it follows " +
      "from the lines before it.\n" +
      EquationDetector.context(page, bounds);
    setEquation({ page, pageIndex: chosen.pageIndex, match: { bounds, text: normalizeText(chosen.text) }, context });
  }, [document, selection]);

  // The pill's «Explain selected text» explains the reader's own selection while it has one (the Mac's
  // `hasReaderSelection: island.reader?.selectionEnd != nil`), and asks about it here when tapped.
  const hasSelection = selection !== null;
  useEffect(() => {
    void publishIsland({ hasReaderSelection: hasSelection });
  }, [hasSelection]);
  useEffect(() => () => void publishIsland({ hasReaderSelection: false }), []);
  useEffect(() => {
    const stop = onIslandCommand((command) => {
      if (command.kind === "explainSelection") void ask();
    });
    return () => void stop.then((unlisten) => unlisten());
  }, [ask]);

  // Enter asks about the selection, as the button's shortcut does on the Mac.
  useEffect(() => {
    if (!selection || opened || equation || passage) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.defaultPrevented) return;
      event.preventDefault();
      void ask();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, opened, equation, passage, ask]);

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = [...event.dataTransfer.files].find(
      (candidate) => /\.pdf$/i.test(candidate.name) || candidate.type === "application/pdf",
    );
    if (file) void open(file);
  };

  return (
    <div
      className={`reader${dragging ? " reader-dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <header className="reader-toolbar">
        <span className="reader-title">{document?.name ?? "LearnLayer"}</span>
        <div className="reader-tools">
          <ToolButton symbol="doc" label={t("Open…")} onClick={() => fileInput.current?.click()} />
          <ToolButton
            symbol="minus.magnifyingglass"
            label={t("Zoom Out")}
            onClick={() => zoom(0.8)}
            disabled={!document}
          />
          <ToolButton
            symbol="plus.magnifyingglass"
            label={t("Zoom In")}
            onClick={() => zoom(1.25)}
            disabled={!document}
          />
          <ToolButton
            symbol="arrow.up.left.and.arrow.down.right"
            label={t("Zoom to Fit")}
            onClick={() => setScale("fit")}
            disabled={!document}
          />
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void open(file);
            event.target.value = "";
          }}
        />
      </header>
      <div
        className="reader-scroller"
        ref={scroller}
        onScroll={(event) => {
          setScrollTop(event.currentTarget.scrollTop);
          setSelection(null);
        }}
      >
        {document ? (
          <div className="reader-pages" style={{ padding: gap, gap }}>
            {document.sizes.map((size, index) => (
              <PageView
                key={index}
                document={document}
                index={index}
                mediaBox={size.mediaBox}
                scale={resolvedScale}
                near={nearPages.has(index)}
                onQuestion={(question, frame) => setOpened({ question, pageIndex: index, frame })}
                onEquation={(page, match) => setEquation({ page, pageIndex: index, match })}
                onSelection={setSelection}
              />
            ))}
          </div>
        ) : (
          <div className="reader-empty">
            <p className="reader-empty-title">{t("Open a PDF to get started")}</p>
            {failed && (
              <p className="reader-empty-error" role="alert">
                {t("This file couldn’t be opened.")} {t("Make sure it’s a valid PDF.")}
              </p>
            )}
            <button type="button" className="reader-open" onClick={() => fileInput.current?.click()}>
              {t("Open…")}
            </button>
          </div>
        )}
      </div>
      {document && opened && renderOverlay?.(document, opened, () => setOpened(null))}
      {document && equation && !opened && (
        <ExplanationStage
          key={`${equation.pageIndex}:${equation.match.text}`}
          document={document}
          page={equation.page}
          pageIndex={equation.pageIndex}
          match={equation.match}
          context={equation.context ?? null}
          close={() => setEquation(null)}
        />
      )}
      {document && passage && !opened && !equation && <PassageStage source={passage} close={() => setPassage(null)} />}
      {selection && !opened && !equation && !passage && (
        <button
          type="button"
          className="reader-ask"
          style={{ left: selection.end.x - 20, top: selection.end.y + 8 }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void ask()}
        >
          {t("Ask")}
          <span className="reader-ask-key" aria-hidden="true">
            ↵
          </span>
        </button>
      )}
    </div>
  );
}

function ToolButton({
  symbol,
  label,
  onClick,
  disabled,
}: {
  symbol: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="reader-tool"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon symbol={symbol} size={16} />
    </button>
  );
}

/** A text selection on a page: what is selected, where on the page (PDF points) and where it ends in the window. */
export interface PageSelection {
  pageIndex: number;
  text: string;
  bounds: Rect;
  end: { x: number; y: number };
}

interface PageViewProps {
  document: ReaderDocument;
  index: number;
  mediaBox: Rect;
  scale: number;
  /** On screen or within a screen of it: drawn. */
  near: boolean;
  onQuestion: (question: ExamQuestion, frame: OpenedQuestion["frame"]) => void;
  /** A click on a line that reads as maths, not on a question. */
  onEquation: (page: PageText, match: EquationMatch) => void;
  /** A selection made (or cleared) on this page, for the "Ask" button beside it. */
  onSelection: (selection: PageSelection | null) => void;
}

/** A press that stays a click (PDFReaderView.isPlainClick): it barely moved, once, and selected nothing. */
export function isPlainClick(moved: number, clickCount: number, selection: string): boolean {
  return moved < 4 && clickCount <= 1 && selection === "";
}

/** One page: drawn when it comes near the screen, its text selectable, its question labels clickable. */
function PageView({ document, index, mediaBox, scale, near, onQuestion, onEquation, onSelection }: PageViewProps) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const rendering = useRef<{ document: ReaderDocument; done: Promise<void> } | null>(null);
  const pressed = useRef<{ x: number; y: number } | null>(null);
  const [hovering, setHovering] = useState(false);
  const width = mediaBox.width * scale;
  const height = mediaBox.height * scale;

  useEffect(() => {
    const element = canvas.current;
    if (!near || !element) return;
    let task: { cancel: () => void } | null = null;
    let cancelled = false;
    // pdf.js draws one render at a time into a canvas: each waits for the one before to finish or be cancelled.
    // A document closed mid-render never settles its renders, so a new document starts a new chain.
    const before = rendering.current?.document === document ? rendering.current.done : Promise.resolve();
    const done = before.then(async () => {
      if (cancelled) return;
      const started = await document.render(index, element, scale, window.devicePixelRatio || 1);
      task = started;
      if (cancelled) started.cancel();
      await started.promise.catch(() => {});
    });
    rendering.current = { document, done: done.catch(() => {}) };
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, document, index, scale]);

  // The page's text over the drawing, for selecting (laid again at a new zoom).
  useEffect(() => {
    const element = textLayer.current;
    if (!near || !element) return;
    let layer: { cancel: () => void } | null = null;
    let cancelled = false;
    void document.textLayer(index, element, scale).then((started) => {
      if (cancelled) started.cancel();
      else layer = started;
    });
    return () => {
      cancelled = true;
      layer?.cancel();
      element.replaceChildren();
    };
  }, [near, document, index, scale]);

  const pointOnPage = (event: React.MouseEvent) => {
    const box = holder.current!.getBoundingClientRect();
    return PageGeometry.toPage({ x: event.clientX - box.left, y: event.clientY - box.top }, mediaBox, scale);
  };

  const questionAt = (event: React.MouseEvent): ExamQuestion | null => {
    const text = document.textIfRead(index);
    return text ? questionWithLabelAt(pointOnPage(event), text) : null;
  };

  /** The selection inside this page's text, with its box on the page; null when there is none worth asking about. */
  const selectionHere = (): PageSelection | null => {
    const selection = window.getSelection();
    const layer = textLayer.current;
    const box = holder.current?.getBoundingClientRect();
    if (!selection || selection.rangeCount === 0 || !layer || !box) return null;
    const range = selection.getRangeAt(0);
    if (!layer.contains(range.commonAncestorContainer)) return null;
    const text = selection.toString().trim();
    if (Array.from(text).length < 2) return null;
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    if (rects.length === 0) return null;
    const left = Math.min(...rects.map((rect) => rect.left)) - box.left;
    const top = Math.min(...rects.map((rect) => rect.top)) - box.top;
    const right = Math.max(...rects.map((rect) => rect.right)) - box.left;
    const bottom = Math.max(...rects.map((rect) => rect.bottom)) - box.top;
    const low = PageGeometry.toPage({ x: left, y: bottom }, mediaBox, scale);
    const high = PageGeometry.toPage({ x: right, y: top }, mediaBox, scale);
    const last = rects[rects.length - 1]!;
    return {
      pageIndex: index,
      text,
      bounds: { x: low.x, y: low.y, width: high.x - low.x, height: high.y - low.y },
      end: { x: last.right, y: last.bottom },
    };
  };

  return (
    <div
      ref={holder}
      className={`reader-page${hovering ? " reader-page-link" : ""}`}
      style={{ width, height }}
      onMouseMove={(event) => setHovering(questionAt(event) !== null)}
      onMouseLeave={() => setHovering(false)}
      onMouseDown={(event) => (pressed.current = { x: event.clientX, y: event.clientY })}
      onMouseUp={() => onSelection(selectionHere())}
      onClick={(event) => {
        // A drag over text selects it, maths lines and question labels included; only a plain click opens.
        const start = pressed.current ?? { x: event.clientX, y: event.clientY };
        const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
        const selected = window.getSelection()?.toString().trim() ?? "";
        if (!isPlainClick(moved, event.detail, selected)) return;
        const question = questionAt(event);
        if (!question) {
          const text = document.textIfRead(index);
          const match = text ? EquationDetector.equation(text, pointOnPage(event)) : null;
          if (text && match) onEquation(text, match);
          return;
        }
        const box = holder.current!.getBoundingClientRect();
        const onPage = PageGeometry.rectToScreen(question.bounds, mediaBox, scale);
        const frame = {
          left: box.left + onPage.left,
          top: box.top + onPage.top,
          width: onPage.width,
          height: onPage.height,
        };
        if (!Rects.isEmpty(question.bounds)) onQuestion(question, frame);
      }}
    >
      <canvas ref={canvas} style={{ width, height }} aria-hidden="true" />
      <div ref={textLayer} className="textLayer" />
    </div>
  );
}
