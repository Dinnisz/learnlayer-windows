// "Capture an area" (AnywhereController.captureArea on the Mac, where `screencapture -i` draws the rectangle): the
// monitor frozen in a picture, a crosshair, and the rectangle the student drags. Its part of the picture becomes the
// question, read by the model as a picture, with the computer's OCR to check the reading against. Esc cancels.

import { useEffect, useRef, useState } from "react";
import { draftText } from "@core/anywhere/clickReading";
import { examQuestionFromScreen, ScreenQuestions } from "@core/anywhere/screenQuestion";
import type { Rect } from "@core/pdf/page";
import { QuestionSession } from "@core/problems/questionSession";
import { regionJPEG } from "../../ai/pictures";
import { transcriptionRequests } from "../../ai/solver";
import { useT } from "../../i18n";
import { captureText, type NativeCapture } from "../../native";
import { sessionServices, type PictureQuestion } from "../../stage/Stage";

/** The picture of the frozen monitor (object URL) and the bitmap its part is cut from. */
export interface FrozenScreen {
  capture: NativeCapture;
  url: string;
  bitmap: ImageBitmap;
}

/** The smallest rectangle that is a question, in points; anything smaller is a click, not a drag. */
const smallest = 12;

/** The dragged part, as the stage's question: its picture, the OCR's text, and a session that reads the picture. */
/**
 * `pixels`: the dragged part in the picture's own pixels; `shown`: its size on screen, in points (the size the stage
 * shows it at).
 */
export async function questionFromArea(
  frozen: FrozenScreen,
  pixels: Rect,
  shown: { width: number; height: number },
): Promise<PictureQuestion | null> {
  const scale = frozen.capture.scale || 1;
  const jpeg = await regionJPEG(frozen.bitmap, [pixels], 1);
  if (!jpeg) return null;
  const lines = await captureText(frozen.capture.id, pixels);
  const text = lines.map((line) => line.text).join("\n");
  const screen = ScreenQuestions.make({
    text,
    frame: {
      x: (frozen.capture.monitor.x + pixels.x) / scale,
      y: (frozen.capture.monitor.y + pixels.y) / scale,
      width: pixels.width / scale,
      height: pixels.height / scale,
    },
    appName: "Screen",
    hasImage: true,
    method: "capture",
  });
  const question = examQuestionFromScreen(screen);
  const images = [jpeg];
  await transcriptionRequests.request(images);
  return {
    kind: "picture",
    question,
    picture: {
      url: URL.createObjectURL(new Blob([jpeg as BlobPart], { type: "image/jpeg" })),
      width: shown.width,
      height: shown.height,
    },
    figureBoxes: [],
    draft: text.trim() === "" ? null : draftText(text),
    transcribes: true,
    ocrText: text,
    session: () => new QuestionSession({ question, images, isPicture: true }, sessionServices()),
  };
}

export function CaptureArea({
  frozen,
  onPick,
  onCancel,
}: {
  frozen: FrozenScreen;
  /** The dragged part: in the picture's pixels, and on screen (points). */
  onPick: (pixels: Rect, shown: Rect) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const start = useRef<{ x: number; y: number } | null>(null);
  const picture = useRef<HTMLImageElement>(null);
  const [area, setArea] = useState<Rect | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const rectFrom = (from: { x: number; y: number }, to: { x: number; y: number }): Rect => ({
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  });

  return (
    <div
      className="capture-area"
      role="application"
      aria-label={t("Capture an area")}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { x: event.clientX, y: event.clientY };
        setArea({ x: event.clientX, y: event.clientY, width: 0, height: 0 });
      }}
      onPointerMove={(event) => {
        if (start.current) setArea(rectFrom(start.current, { x: event.clientX, y: event.clientY }));
      }}
      onPointerUp={(event) => {
        const from = start.current;
        start.current = null;
        if (!from) return;
        const picked = rectFrom(from, { x: event.clientX, y: event.clientY });
        if (picked.width < smallest || picked.height < smallest) {
          setArea(null);
          return;
        }
        // The picture fills the monitor, so points times the scale are its pixels; measured, so a picture that is
        // shown at another size (the browser demo) is cut where the rectangle was drawn.
        const bounds = picture.current?.getBoundingClientRect();
        const across = bounds && bounds.width > 0 ? frozen.bitmap.width / bounds.width : 1;
        const down = bounds && bounds.height > 0 ? frozen.bitmap.height / bounds.height : 1;
        const left = bounds?.left ?? 0;
        const top = bounds?.top ?? 0;
        onPick(
          {
            x: (picked.x - left) * across,
            y: (picked.y - top) * down,
            width: picked.width * across,
            height: picked.height * down,
          },
          picked,
        );
      }}
    >
      <img ref={picture} className="capture-area-picture" src={frozen.url} alt="" draggable={false} />
      {area && area.width > 0 && area.height > 0 ? (
        <div
          className="capture-area-rect"
          style={{ left: area.x, top: area.y, width: area.width, height: area.height }}
          aria-hidden="true"
        />
      ) : (
        <div className="capture-area-dim" aria-hidden="true" />
      )}
      <p className="capture-area-hint" role="status">
        {t("Capture an area")}
      </p>
    </div>
  );
}
