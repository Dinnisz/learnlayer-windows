// What the pill knows about the rest of the app (IslandState.swift): whether an exercise is open,
// whether the tutor is speaking or listening, and the latest audio levels. The windows are separate
// pages, so the state travels as an event: Tauri's between windows, a BroadcastChannel in a browser.

import { isTauri } from "./native";

export interface IslandSnapshot {
  /** An exam question is open: the pill offers to ask about it. */
  exerciseOpen: boolean;
  /** Up to three suggested questions from the model. */
  followUps: string[];
  /** The subject of the open document, shown at the left of the pill. */
  subject: string | null;
  speaking: boolean;
  listening: boolean;
  muted: boolean;
  /** The last five audio levels, oldest first (0…1). */
  levels: number[];
  /** Alt-click in other apps is off: the pill offers to turn it on. */
  offersAnywhere: boolean;
  hasReaderSelection: boolean;
}

export const emptyIsland: IslandSnapshot = {
  exerciseOpen: false,
  followUps: [],
  subject: null,
  speaking: false,
  listening: false,
  muted: false,
  levels: [],
  offersAnywhere: false,
  hasReaderSelection: false,
};

/** What a window asks another one to do, through the pill or towards it. */
export type IslandCommand =
  | { kind: "askAboutExercise" }
  | { kind: "ask"; question: string }
  | { kind: "toggleMute" }
  | { kind: "stopSpeaking" }
  | { kind: "captureScreen" }
  | { kind: "captureArea" }
  | { kind: "explainSelection" };

const stateEvent = "island-state";
const commandEvent = "island-command";
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("learnlayer-island");

async function send(event: string, payload: unknown): Promise<void> {
  if (isTauri) {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(event, payload);
  } else {
    channel?.postMessage({ event, payload });
  }
}

async function receive<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  if (isTauri) {
    const { listen } = await import("@tauri-apps/api/event");
    return listen<T>(event, (message) => handler(message.payload));
  }
  const onMessage = (message: MessageEvent<{ event: string; payload: T }>) => {
    if (message.data.event === event) handler(message.data.payload);
  };
  channel?.addEventListener("message", onMessage);
  return () => channel?.removeEventListener("message", onMessage);
}

export const publishIsland = (change: Partial<IslandSnapshot>) => send(stateEvent, change);
export const onIsland = (handler: (change: Partial<IslandSnapshot>) => void) => receive(stateEvent, handler);
export const sendIslandCommand = (command: IslandCommand) => send(commandEvent, command);
export const onIslandCommand = (handler: (command: IslandCommand) => void) => receive(commandEvent, handler);
