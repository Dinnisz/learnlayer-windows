// Port of LearnLayer/Problems/SelectionSession.swift @ ref 2026-11-04: a selected passage the student asked about
// (Alt-click on selected text, or "Explain selected text" in the pill): what it asks, a hint, or an explanation,
// whichever they pick. The first choice makes the one request (TextHelp v5); opening it makes none.
// The curve TextHelp may send is drawn under the answer ("Graph"), with its parameter to drag.

import { decodeGraph, Graphs, type Graph } from "../illustrations/graph";
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
  showsGraph = false;
  parameterValue = 0;
  areaEnd: number | null = null;
  runID = 0;
  /** Every mark of the curve shows: a passage has no steps. */
  readonly graphStep = Number.MAX_SAFE_INTEGER;
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
      const graph = this.graph;
      this.parameterValue = graph ? (Graphs.draggableParameter(graph)?.value ?? 0) : 0;
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

  /** The curve TextHelp sent, when it can be drawn. */
  get graph(): Graph | null {
    const graph = this.help ? decodeGraph(this.help.graph) : null;
    return graph && Graphs.isDrawable(graph) ? graph : null;
  }

  toggleGraph(): void {
    this.showsGraph = !this.showsGraph;
    this.changed();
  }

  setParameterValue(value: number): void {
    const graph = this.graph;
    const parameter = graph ? Graphs.draggableParameter(graph) : null;
    if (!parameter) return;
    this.parameterValue = Math.min(parameter.max, Math.max(parameter.min, value));
    this.changed();
  }

  setAreaEnd(value: number): void {
    this.areaEnd = value;
    this.changed();
  }

  replayCar(): void {
    this.runID += 1;
    this.changed();
  }

  /** What the chosen mode shows: the explanation's paragraphs, what it asks, or the hint. */
  get shown(): string[] {
    const help = this.help;
    if (!help || this.mode === null) return [];
    if (this.mode === "explain") return help.explanation;
    return [this.mode === "asks" ? help.asks : help.hint].filter((text) => text.trim() !== "");
  }
}
