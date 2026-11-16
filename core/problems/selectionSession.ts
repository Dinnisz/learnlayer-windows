// Port of LearnLayer/Problems/SelectionSession.swift @ ref 2026-11-04: a selected passage the student asked about
// (Alt-click on selected text, or "Explain selected text" in the pill): what it asks, a hint, or an explanation,
// whichever they pick. The first choice makes the one request (TextHelp v5); opening it makes none.
// The Mac also draws the curve TextHelp may send ("Graph"); here the passage panel has no graph yet (PROGRESSO.md).

import type { TextHelp } from "./textHelp";

export type SelectionMode = "explain" | "asks" | "hint";
export type SelectionState =
  { kind: "loading" } | { kind: "needsKey" } | { kind: "failed"; error: unknown } | { kind: "ready" };

export interface SelectionServices {
  help(passage: string, context: string, image: Uint8Array | null): Promise<TextHelp>;
  isSignedOut(error: unknown): boolean;
}

export class SelectionSession {
  state: SelectionState = { kind: "loading" };
  help: TextHelp | null = null;
  mode: SelectionMode | null = null;
  /** The first choice starts the request; opening the panel makes none. */
  hasStartedLoading = false;
  version = 0;
  private run = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly passage: string,
    readonly context: string,
    private readonly services: SelectionServices,
    readonly image: Uint8Array | null = null,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private changed() {
    this.version += 1;
    for (const listener of [...this.listeners]) listener();
  }

  async load(): Promise<void> {
    this.hasStartedLoading = true;
    const run = (this.run += 1);
    this.state = { kind: "loading" };
    this.changed();
    try {
      const help = await this.services.help(this.passage, this.context, this.image);
      if (run !== this.run) return;
      this.help = help;
      this.state = { kind: "ready" };
    } catch (error) {
      if (run !== this.run) return;
      this.state = this.services.isSignedOut(error) ? { kind: "needsKey" } : { kind: "failed", error };
    }
    this.changed();
  }

  /** Esc, or a new selection: whatever is on its way is dropped. */
  cancel(): void {
    this.run += 1;
  }

  choose(mode: SelectionMode): void {
    this.mode = mode;
    this.changed();
    if (!this.hasStartedLoading) void this.load();
  }

  /** What the chosen mode shows: the explanation's paragraphs, what it asks, or the hint. */
  get shown(): string[] {
    const help = this.help;
    if (!help || this.mode === null) return [];
    if (this.mode === "explain") return help.explanation;
    return [this.mode === "asks" ? help.asks : help.hint].filter((text) => text.trim() !== "");
  }
}
