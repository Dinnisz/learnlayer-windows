// Port of LearnLayer/Notch/NotchAction.swift @ ref 2026-11-04

/**
 * One thing the open pill offers. The list is data, so the view, the tooltips, the accessibility
 * labels and the tests all read the same rows. No counts and no badges.
 */
export const notchActionIDs = [
  "captureScreen",
  "captureArea",
  "explainSelection",
  "openWindow",
  "documents",
  "memory",
  "askAboutExercise",
] as const;
export type NotchActionID = (typeof notchActionIDs)[number];

export interface NotchAction {
  id: NotchActionID;
  /** The SF Symbol the Mac draws; the interface maps it to a Segoe Fluent glyph. */
  symbol: string;
  /** Key in the locale tables. */
  labelKey: string;
  isEnabled: boolean;
  /** The single most useful thing to do right now (drawn in blue). */
  isPrimary: boolean;
  perform: () => void;
}

/** What the pill needs to know to decide the rows. */
export interface NotchActionInputs {
  /** Alt-click in other apps isn't on yet. */
  offersAnywhere?: boolean;
  /** Text is selected in the reader. */
  hasReaderSelection?: boolean;
  exerciseOpen?: boolean;
}

export interface NotchActionHandlers {
  captureScreen?: () => void;
  captureArea?: () => void;
  explainSelection?: () => void;
  openWindow?: () => void;
  openDocuments?: () => void;
  openMemory?: () => void;
  askAboutExercise?: () => void;
}

const nothing = () => {};

/** Six glyphs: four ways to ask, then Documents and Memory. With an exercise open it is one row. */
export function notchCatalog(inputs: NotchActionInputs = {}, handlers: NotchActionHandlers = {}): NotchAction[] {
  const offersAnywhere = inputs.offersAnywhere ?? true;
  const hasReaderSelection = inputs.hasReaderSelection ?? false;
  if (inputs.exerciseOpen) {
    return [
      {
        id: "askAboutExercise",
        symbol: "questionmark.bubble",
        labelKey: "Ask about this exercise",
        isEnabled: true,
        isPrimary: true,
        perform: handlers.askAboutExercise ?? nothing,
      },
    ];
  }
  const row = (id: NotchActionID, symbol: string, labelKey: string, perform?: () => void, isEnabled = true) => ({
    id,
    symbol,
    labelKey,
    isEnabled,
    isPrimary: false,
    perform: perform ?? nothing,
  });
  return [
    row(
      "captureScreen",
      "camera.viewfinder",
      offersAnywhere ? "Turn on ⌥-click in any app" : "Capture the screen",
      handlers.captureScreen,
    ),
    row("openWindow", "macwindow", "Open window", handlers.openWindow),
    row("captureArea", "viewfinder", "Capture an area", handlers.captureArea),
    row(
      "explainSelection",
      "text.cursor",
      "Explain selected text",
      handlers.explainSelection,
      hasReaderSelection || !offersAnywhere,
    ),
    row("documents", "folder", "Documents", handlers.openDocuments),
    row("memory", "point.3.connected.trianglepath.dotted", "Memory", handlers.openMemory),
  ];
}
