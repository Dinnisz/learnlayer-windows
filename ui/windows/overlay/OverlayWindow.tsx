// Port of AnywhereController's stage (LearnLayer/Anywhere/AnywhereController.swift @ ref 2026-11-04): a borderless
// window over the monitor of an Alt-click, the app below dimmed and blurred by the system (acrylic), and the same
// stage as the reader's. Nothing shows before the click; a word near the cursor says «Reading…» only if reading
// takes a while, or «Couldn’t read this here.».

import { useCallback, useEffect, useRef, useState } from "react";
import { readClick, draftText, type ClickRead } from "@core/anywhere/clickReading";
import { greyImage, type LocatorLine } from "@core/anywhere/questionRegion";
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
  type NativeClickRead,
  type PixelRect,
} from "../../native";
import { ReaderDocument } from "../../reader/readerDocument";
import { sessionServices, Stage, type StageSource } from "../../stage/Stage";
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

/** What a click opens: the stage's source, or nothing (with the app's name for the log). */
async function sourceFor(read: NativeClickRead, sources: ClickSources): Promise<StageSource | null> {
  const scale = read.scale || 1;
  const point = { x: read.point.x / scale, y: read.point.y / scale };
  const found = read.found
    ? ScreenQuestions.make({
        text: read.found.text,
        frame: points(read.found.frame, scale),
        appName: read.appName,
        hasImage: read.found.hasImage,
        method: read.found.method,
        focus: read.found.focus,
      })
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
  const [source, setSource] = useState<StageSource | null>(null);
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

  useEffect(() => {
    // In a browser, `?demo=anywhere` opens a made-up click on a made-up window (no native side, no cost).
    const demo = new URLSearchParams(window.location.search).get("demo") === "anywhere";
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
    });
    return () => void stop.then((unlisten) => unlisten());
  }, [open, say, local]);

  // Esc with only a word showing: close.
  useEffect(() => {
    if (source) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && hide();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [source, hide]);

  return (
    <div className={`overlay${source ? " overlay-open" : ""}`}>
      {source ? <Stage source={source} close={hide} /> : null}
      {notice ? (
        <div className="overlay-notice" role="status" style={{ left: notice.at.x + 40, top: notice.at.y - 18 }}>
          {t(notice.key)}
        </div>
      ) : null}
    </div>
  );
}
