// Port of the decisions in AnywhereController.optionClick and .opened (LearnLayer/Anywhere/AnywhereController.swift
// @ ref 2026-11-04): from what was read at an Alt-click (the PDF behind the window, UI Automation's text, a picture of
// the window and its OCR lines), which question opens and how it is shown. Pure: the native side reads, the interface
// draws.

import { Rects, type PageText, type Rect } from "../pdf/page";
import { repairedDraft } from "./localRepair";
import { transcribeLines, type LayoutLine } from "./localTranscriber";
import { looksFlattened } from "../problems/flattenedMath";
import { transcriptionLooksGarbled } from "../problems/textChecks";
import { normalizeText, unsafeCharacters } from "../problems/textNormalizer";
import { PDFQuestionReading, type PDFQuestionRead } from "./pdfQuestionRead";
import { characterCount } from "./questionBand";
import { intersects, QuestionLocator, type GreyImage, type LocatorLine, type QuestionRegion } from "./questionRegion";
import { ScreenQuestions, type ScreenQuestion } from "./screenQuestion";

/** What the native side read at the click, in points (physical pixels divided by the monitor's scale). */
export interface ClickRead {
  point: { x: number; y: number };
  appName: string;
  /** UI Automation's question under the point, when the app exposes one. */
  found: ScreenQuestion | null;
  /** A picture of the window under the point, when it could be taken. */
  window: { frame: Rect; image: GreyImage; lines: LocatorLine[] } | null;
  /** The PDF the window shows, opened locally: its pages' text. */
  pdf: { pages: readonly PageText[] } | null;
}

export type ClickOutcome =
  /** Read from the PDF itself: opened as the reader opens it, from the page. */
  | { kind: "pdf"; read: PDFQuestionRead; found: ScreenQuestion }
  /**
   * Read from the screen: the question's text (UI Automation's, cut to the region, or the OCR's) and, when its text
   * isn't enough, the region's picture for the model; the picture is what the stage shows until a typeset reading
   * comes (`transcribes`).
   */
  | {
      kind: "screen";
      found: ScreenQuestion;
      region: QuestionRegion | null;
      /** The region's picture goes to the model. */
      sendsPicture: boolean;
      /** The model transcribes the picture, and the stage shows that reading typeset. */
      transcribes: boolean;
      isPicture: boolean;
    }
  | { kind: "nothing" };

/** Text with formulas run into stray symbols is not shown as it is: the model reads the picture. */
export function isGarbled(text: string): boolean {
  return transcriptionLooksGarbled(text) || looksFlattened(text) || unsafeCharacters(text.normalize("NFC")).length > 0;
}

export function readClick(read: ClickRead): ClickOutcome {
  let found = read.found;
  let region: QuestionRegion | null = null;
  let sendsPicture = false;
  let hasFigure = false;
  if (read.window) {
    const wantsFigure = (found?.hasImage ?? false) || ScreenQuestions.mentionsFigure(found?.text ?? "");
    // A PDF in the window: the question comes from the file itself, found from where the click fell.
    if (read.pdf) {
      const fromPDF = PDFQuestionReading.read(
        read.window.lines.map((line) => ({
          text: line.text,
          rect: { ...line.rect, x: line.rect.x + read.window!.frame.x, y: line.rect.y + read.window!.frame.y },
        })),
        read.point,
        read.pdf.pages,
      );
      if (fromPDF) {
        return {
          kind: "pdf",
          read: fromPDF,
          found: ScreenQuestions.make({
            text: fromPDF.exam.text,
            frame: fromPDF.screenFrame,
            appName: read.appName,
            hasImage: false,
            method: "pdf",
          }),
        };
      }
    }
    region = QuestionLocator.locate({
      image: read.window.image,
      window: read.window.frame,
      point: read.point,
      lines: read.window.lines,
      known: found?.frame ?? null,
      wantsFigure,
    });
    // Windows: text that came out garbled (formulas a web page draws, one symbol a line) and no region found (a page
    // whose headings the locator doesn't know): the picture where UI Automation says the text is, for the model to
    // read, rather than stray symbols on the stage.
    if (!region && found && isGarbled(found.text)) region = regionAround(found.frame, read.window);
    if (region) {
      hasFigure = region.hasFigure;
      if (found) {
        const trimmed = ScreenQuestions.trimmed(found, region);
        found = trimmed;
        // A figure, or text the app didn't expose (options drawn apart, a formula as a picture): the region too.
        const missesText =
          characterCount(region.text) > 80 && characterCount(trimmed.text) < characterCount(region.text) / 2;
        if (region.hasFigure || wantsFigure || missesText || isGarbled(trimmed.text)) sendsPicture = true;
      } else if (characterCount(region.text) >= 12) {
        // Nothing readable through UI Automation: the region's text, and its picture to check that text against.
        found = ScreenQuestions.make({
          text: region.text,
          frame: region.frame,
          appName: read.appName,
          hasImage: region.hasFigure,
          method: "region",
        });
        sendsPicture = true;
      }
    }
  }
  if (!found) return { kind: "nothing" };
  // The model reads the picture (a figure, or text it cannot trust), and its transcription is what is shown.
  const transcribes = sendsPicture && region !== null;
  return { kind: "screen", found, region, sendsPicture, transcribes, isPicture: hasFigure && sendsPicture };
}

/** The window's part under `frame` (global points), padded a little, as a region; null for nothing or the whole window. */
export function regionAround(
  frame: Rect,
  window: { frame: Rect; lines: readonly LocatorLine[] },
): QuestionRegion | null {
  const bounds = { x: 0, y: 0, width: window.frame.width, height: window.frame.height };
  const padded = {
    x: frame.x - window.frame.x - 8,
    y: frame.y - window.frame.y - 8,
    width: frame.width + 16,
    height: frame.height + 16,
  };
  const local = Rects.intersection(padded, bounds);
  if (!local || local.width < 12 || local.height < 12) return null;
  // The whole window says nothing about where the question is.
  if (local.width * local.height > 0.8 * bounds.width * bounds.height) return null;
  const inside = window.lines.filter((line) => intersects(line.rect, local));
  return {
    frame: { ...local, x: local.x + window.frame.x, y: local.y + window.frame.y },
    label: null,
    part: null,
    displayFrame: null,
    hasFigure: false,
    text: inside.map((line) => line.text).join("\n"),
    crops: [local],
    figureBoxes: [],
    lines: inside.map((line) => ({
      text: line.text,
      rect: { ...line.rect, x: line.rect.x + window.frame.x, y: line.rect.y + window.frame.y },
    })),
  };
}

/**
 * What the stage shows while the model reads the picture: the computer's own reading, when it is readable, with the
 * units and small formulas it garbles repaired by rule (`Repair`, the Mac's LocalTranscriptionRepair).
 */
export function draftText(ocrText: string, lines: readonly LayoutLine[] = []): string | null {
  const text = ocrText.trim();
  if (text === "" || transcriptionLooksGarbled(text) || looksFlattened(text)) return null;
  // With the lines' places, the layout is rebuilt as the Mac's LocalTranscriber does: wrapped lines joined into
  // paragraphs, each option of a multiple choice on its own line.
  const blocks = transcribeLines(lines);
  return blocks.length > 0 ? blocks.map((block) => block.text).join("\n") : repairedDraft(text);
}

/** The text as the stage shows it when nothing is to be read from a picture: normalised, never garbled. */
export function plainStatement(found: ScreenQuestion): string | null {
  const text = normalizeText(found.text).trim();
  return text === "" || isGarbled(text) ? null : text;
}
