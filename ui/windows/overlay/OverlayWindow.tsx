// Port of AnywhereController's stage (LearnLayer/Anywhere/AnywhereController.swift @ ref 2026-11-04): a borderless
// window over the monitor of an Alt-click, the app below dimmed and blurred by the system (acrylic), and the same
// stage as the reader's. Nothing shows before the click; a word near the cursor says «Reading…» only if reading
// takes a while, or «Couldn’t read this here.».

import { useCallback, useEffect, useRef, useState } from "react";
import { readClick, draftText, type ClickRead } from "@core/anywhere/clickReading";
import { greyImage, type LocatorLine } from "@core/anywhere/questionRegion";
import { screenQuestionFromUIA } from "@core/anywhere/uiaQuestion";
import {
  anywhereLogEntry,
  examQuestionFromScreen,
  ScreenQuestions,
  type ScreenQuestion,
} from "@core/anywhere/screenQuestion";
import type { PageText, Rect } from "@core/pdf/page";
import { QuestionSession } from "@core/problems/questionSession";
import { bitmapOf, regionJPEG, type WindowPicture } from "../../ai/pictures";
import { transcriptionRequests } from "../../ai/solver";
import { useT } from "../../i18n";
import {
  anywherePDF,
  anywherePicture,
  closeOverlay,
  dataFiles,
  onAnywhere,
  setOverlayInteractive,
  type NativeCapture,
  type NativeClickRead,
  type PixelRect,
} from "../../native";
import { ReaderDocument } from "../../reader/readerDocument";
import { sessionServices, Stage, type StageSource } from "../../stage/Stage";
import { PassageStage, type PassageSource } from "../../stage/PassageStage";
import { normalizeText } from "@core/problems/textNormalizer";
import { CaptureArea, questionFromArea, type FrozenScreen } from "./CaptureArea";
import { demoClick } from "./demo";

interface Notice {
  key: string;
  /** Where, in the overlay's CSS pixels. */
  at: { x: number; y: number };
}

/** Points, from physical pixels: what the locator and the stage work in. */
const points = (rect: PixelRect, scale: number): Rect => ({
  x: rect.x / scale,
  y: rect.y / scale,
  width: rect.width / scale,
  height: rect.height / scale,
});

/** The PDF last opened behind a window, kept so the next click on it reads nothing again. */
let lastPDF: { path: string; document: ReaderDocument; pages: PageText[] } | null = null;

async function pdfPages(read: NativeClickRead, bytes: (id: number) => Promise<ArrayBuffer>) {
  if (!read.pdfPath) return null;
  if (lastPDF?.path === read.pdfPath) return lastPDF;
  try {
    const name = read.pdfPath.split(/[\\/]/u).pop() ?? "document.pdf";
    const document = await ReaderDocument.open(await bytes(read.id), name);
    // A book is not read whole for one click: the first 60 pages are where a test's questions are.
    const count = Math.min(document.pageCount, 60);
    const pages = await Promise.all(Array.from({ length: count }, (_, index) => document.text(index)));
    lastPDF?.document.destroy();
    lastPDF = { path: read.pdfPath, document, pages };
    return lastPDF;
  } catch {
    return null;
  }
}

async function appendLog(found: ScreenQuestion | null, appName: string) {
  try {
    const before = (await dataFiles.read("anywhere-log.jsonl")) ?? "";
    // Only counts and app names; the last 2000 clicks.
    const lines = (before + anywhereLogEntry(found, appName)).split("\n").filter((line) => line !== "");
    await dataFiles.write("anywhere-log.jsonl", lines.slice(-2000).join("\n") + "\n");
  } catch {
    // The log is for counting, never in the way.
  }
}

/** Everything a click's reading needs from outside: the native side, or the demo's stand-ins in a browser. */
interface ClickSources {
  picture(read: NativeClickRead): Promise<WindowPicture | null>;
  pdf(id: number): Promise<ArrayBuffer>;
}

const nativeSources: ClickSources = {
  async picture(read) {
    if (!read.window) return null;
    try {
      return { width: read.window.pixelWidth, height: read.window.pixelHeight, bgra: await anywherePicture(read.id) };
    } catch {
      return null;
    }
  },
  pdf: anywherePDF,
};

/** What the stage over the other app shows: a question, or a selected passage. */
type OverlaySource = StageSource | PassageSource;

/** What a click opens: the stage's source, or nothing (with the app's name for the log). */
async function sourceFor(read: NativeClickRead, sources: ClickSources): Promise<OverlaySource | null> {
  const scale = read.scale || 1;
  const point = { x: read.point.x / scale, y: read.point.y / scale };
  if (read.refused) return null;
  // Alt-click on selected text explains that text.
  if (read.selection) {
    const selected = ScreenQuestions.make({
      text: read.selection.text,
      frame: points(read.selection.frame, scale),
      appName: read.appName,
      hasImage: false,
      method: "selection",
    });
    void appendLog(selected, read.appName);
    // A passage of its own (SelectionSession on the Mac): explain it, what it asks, or a hint.
    return { kind: "passage", text: normalizeText(read.selection.text), context: "" };
  }
  const uia = read.found;
  const found = uia
    ? screenQuestionFromUIA(
        {
          longText: uia.longText ? { ...uia.longText, frame: points(uia.longText.frame, scale) } : null,
          block: uia.block
            ? {
                index: uia.block.index,
                nodes: uia.block.nodes.map((node) => ({ ...node, frame: points(node.frame, scale) })),
              }
            : null,
          focus: uia.focus,
        },
        read.appName,
      )
    : null;
  const picture = await sources.picture(read);
  const frame = read.window ? points(read.window, scale) : null;
  const pdf = await pdfPages(read, sources.pdf);
  const clickRead: ClickRead = {
    point,
    appName: read.appName,
    found,
    window:
      picture && frame
        ? {
            frame,
            image: greyImage(picture.bgra, picture.width, picture.height, frame.width, frame.height),
            lines: read.lines.map((line): LocatorLine => ({
              text: line.text,
              rect: points(line.rect, picture.width / frame.width),
            })),
          }
        : null,
    pdf: pdf ? { pages: pdf.pages } : null,
  };
  const outcome = readClick(clickRead);
  // Development builds: what was read and decided, to see why a click opened what it did. Never in a release build.
  if (import.meta.env.DEV) {
    void dataFiles.write(
      "anywhere-debug.json",
      JSON.stringify(
        {
          point,
          scale,
          app: read.appName,
          found: found ? { method: found.method, frame: found.frame, text: found.text.slice(0, 300) } : null,
          window: clickRead.window ? { frame: clickRead.window.frame, lines: clickRead.window.lines } : null,
          pdf: Boolean(clickRead.pdf),
          outcome:
            outcome.kind === "screen"
              ? { kind: outcome.kind, region: outcome.region?.frame ?? null, sendsPicture: outcome.sendsPicture }
              : { kind: outcome.kind },
        },
        null,
        2,
      ),
    );
  }
  void appendLog(outcome.kind === "nothing" ? null : outcome.found, read.appName);
  if (outcome.kind === "nothing") return null;
  if (outcome.kind === "pdf" && pdf) {
    const question = outcome.read.exam;
    return {
      kind: "pdf",
      document: pdf.document,
      opened: {
        question,
        pageIndex: outcome.read.page.index,
        frame: { left: 0, top: 0, width: outcome.read.screenFrame.width, height: outcome.read.screenFrame.height },
      },
    };
  }
  if (outcome.kind !== "screen") return null;
  const region = outcome.region;
  let jpeg: Uint8Array | null = null;
  if (region && picture && frame) {
    const bitmap = await bitmapOf(picture);
    jpeg = await regionJPEG(bitmap, region.crops, picture.width / frame.width);
    bitmap.close();
  }
  const images = outcome.sendsPicture && jpeg ? [jpeg] : [];
  if (outcome.transcribes && images.length > 0) await transcriptionRequests.request(images);
  const question = examQuestionFromScreen(outcome.found);
  const shown = region?.displayFrame ?? region?.frame ?? null;
  return {
    kind: "picture",
    question,
    picture:
      jpeg && shown
        ? {
            url: URL.createObjectURL(new Blob([jpeg as BlobPart], { type: "image/jpeg" })),
            width: shown.width,
            height: shown.height,
          }
        : null,
    figureBoxes: region?.figureBoxes ?? [],
    draft: outcome.transcribes ? draftText(region?.text ?? "") : null,
    transcribes: outcome.transcribes && images.length > 0,
    ocrText: region?.text ?? "",
    session: () =>
      new QuestionSession({ question, images, isPicture: outcome.isPicture && images.length > 0 }, sessionServices()),
  };
}

export function OverlayWindow() {
  const t = useT();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [source, setSource] = useState<OverlaySource | null>(null);
  const [frozen, setFrozen] = useState<FrozenScreen | null>(null);
  const latest = useRef(0);
  const monitor = useRef<{ rect: PixelRect; scale: number } | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const local = useCallback((point: { x: number; y: number }) => {
    const shown = monitor.current;
    if (!shown) return point;
    return { x: (point.x - shown.rect.x) / shown.scale, y: (point.y - shown.rect.y) / shown.scale };
  }, []);

  const hide = useCallback(() => {
    setSource(null);
    setNotice(null);
    setFrozen((shown) => {
      if (shown) URL.revokeObjectURL(shown.url);
      return null;
    });
    void closeOverlay();
  }, []);

  const say = useCallback((key: string, at: { x: number; y: number }, seconds: number | null) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice({ key, at });
    void setOverlayInteractive(false);
    noticeTimer.current =
      seconds === null
        ? null
        : window.setTimeout(() => {
            setNotice(null);
            setSource((open) => {
              if (!open) void closeOverlay();
              return open;
            });
          }, seconds * 1000);
  }, []);

  const open = useCallback(
    async (read: NativeClickRead, sources: ClickSources) => {
      latest.current = read.id;
      monitor.current = { rect: read.monitor, scale: read.scale || 1 };
      // "Explain selected text" with nothing selected: the word, and nothing opens.
      if (read.notice) {
        say(read.notice, local(read.point), 2);
        return;
      }
      const made = await sourceFor(read, sources);
      // A second click meanwhile: only the latest one's reading is opened.
      if (read.id !== latest.current) return;
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
      if (!made) {
        say("Couldn’t read this here.", local(read.point), 2);
        return;
      }
      setNotice(null);
      void setOverlayInteractive(true);
      setSource(made);
    },
    [local, say],
  );

  /** "Capture an area": the frozen monitor, shown for the student to drag the question's rectangle on. */
  const freeze = useCallback(async (capture: NativeCapture, given?: Uint8Array) => {
    monitor.current = { rect: capture.monitor, scale: capture.scale || 1 };
    setSource(null);
    setNotice(null);
    const bgra = given ?? (await anywherePicture(capture.id).catch(() => null));
    if (!bgra) return void closeOverlay();
    const bitmap = await bitmapOf({ width: capture.pixelWidth, height: capture.pixelHeight, bgra });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return void closeOverlay();
    setFrozen({ capture, url: URL.createObjectURL(blob), bitmap });
  }, []);

  const pick = useCallback(
    async (pixels: Rect, area: Rect) => {
      const shown = frozen;
      if (!shown) return;
      const made = await questionFromArea(shown, pixels, area).catch(() => null);
      URL.revokeObjectURL(shown.url);
      setFrozen(null);
      if (!made) {
        say("Couldn’t read this here.", { x: area.x, y: area.y }, 2);
        return;
      }
      void setOverlayInteractive(true);
      setSource(made);
    },
    [frozen, say],
  );

  useEffect(() => {
    // In a browser, `?demo=anywhere` opens a made-up click on a made-up window (no native side, no cost).
    // `?demo=capture`: the same made-up window, frozen for a rectangle to be dragged on it.
    const demoKind = new URLSearchParams(window.location.search).get("demo");
    if (demoKind === "capture") {
      void demoClick().then(({ picture }) =>
        freeze(
          {
            id: 0,
            monitor: { x: 0, y: 0, width: picture.width, height: picture.height },
            scale: 1,
            pixelWidth: picture.width,
            pixelHeight: picture.height,
          },
          picture.bgra,
        ),
      );
      return;
    }
    // `?demo=selection`: an Alt-click on a selected passage in a made-up browser window.
    if (demoKind === "selection") {
      // After this render, as a real reading arrives.
      void Promise.resolve().then(() =>
        open(
          {
            id: 1,
            point: { x: 300, y: 180 },
            monitor: { x: 0, y: 0, width: 1280, height: 800 },
            scale: 1,
            appName: "msedge.exe",
            refused: null,
            found: null,
            selection: {
              text: "«Ó mar salgado, quanto do teu sal / São lágrimas de Portugal!» Explica o sentido destes versos.",
              frame: { x: 120, y: 160, width: 520, height: 48 },
            },
            window: null,
            lines: [],
            pdfPath: null,
          },
          { picture: async () => null, pdf: async () => new ArrayBuffer(0) },
        ),
      );
      return;
    }
    const demo = demoKind === "anywhere";
    if (demo) {
      void demoClick().then(({ read, picture }) =>
        open(read, { picture: async () => picture, pdf: async () => new ArrayBuffer(0) }),
      );
      return;
    }
    let reading = 0;
    const stop = onAnywhere({
      click(point, scale, rect) {
        monitor.current = { rect, scale };
        setSource(null);
        const clicked = (reading += 1);
        // «Reading…» only if it takes a while (a browser building its accessibility tree).
        window.setTimeout(() => {
          if (clicked === reading && latest.current < clicked) say("Reading…", local(point), null);
        }, 350);
      },
      read: (read) => void open(read, nativeSources),
      escape() {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      },
      capture: (capture) => void freeze(capture),
    });
    return () => void stop.then((unlisten) => unlisten());
  }, [open, say, local, freeze]);

  // Esc with only a word showing: close (the capture handles its own Esc).
  useEffect(() => {
    if (source || frozen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && hide();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [source, frozen, hide]);

  return (
    <div className={`overlay${source ? " overlay-open" : ""}`}>
      {source?.kind === "passage" ? (
        <PassageStage source={source} close={hide} />
      ) : source ? (
        <Stage source={source} close={hide} />
      ) : null}
      {frozen && !source ? (
        <CaptureArea frozen={frozen} onPick={(pixels, area) => void pick(pixels, area)} onCancel={hide} />
      ) : null}
      {notice ? (
        <div className="overlay-notice" role="status" style={{ left: notice.at.x + 40, top: notice.at.y - 18 }}>
          {t(notice.key)}
        </div>
      ) : null}
    </div>
  );
}
