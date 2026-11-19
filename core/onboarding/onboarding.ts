// Port of LearnLayer/Onboarding/OnboardingFlow.swift, OnboardingStore.swift and OnboardingCoordinator.swift
// @ ref 2026-11-04
//
// Windows asks for none of the Mac's three permissions (Accessibility, Screen Recording, Input Monitoring): the
// microphone is asked on its own screen. So the Windows path leaves out the permissions screen (docs/DECISOES.md).
// The relaunch events stay (a pure, tested part of the flow) though Windows never needs a relaunch.

import type { PlatformName } from "../platform";

export const onboardingSteps = [
  "welcome",
  "language",
  "mic",
  "talk",
  "permissions",
  "tryIt",
  "look",
  "plan",
  "done",
] as const;
export type OnboardingStep = (typeof onboardingSteps)[number];

/** The version that added each step. */
const addedIn: Record<OnboardingStep, number> = {
  welcome: 1,
  language: 1,
  mic: 1,
  talk: 1,
  permissions: 1,
  tryIt: 1,
  look: 1,
  plan: 1,
  done: 1,
};

export const onboardingVersion = 1;

/** The steps of this platform's flow, in order. */
export function platformSteps(platform: PlatformName): OnboardingStep[] {
  return onboardingSteps.filter((step) => platform !== "windows" || step !== "permissions");
}

/** The steps a student still has to see, given the version they last finished (0 = never). */
export function stepsSince(completedVersion: number, platform: PlatformName): OnboardingStep[] {
  const all = platformSteps(platform);
  const added = all.filter((step) => addedIn[step] > completedVersion);
  return added.length === 0 ? all : added;
}

export type StepStatus = "pending" | "done" | "skipped" | { blocked: string };
export type PermissionKind = "microphone" | "speech" | "accessibility" | "screenRecording" | "inputMonitoring";
export type PermissionStatus = "granted" | "grantedNeedsRelaunch" | "denied" | "notDetermined";
const isGranted = (status: PermissionStatus | undefined) => status === "granted" || status === "grantedNeedsRelaunch";

/** Everything the flow remembers. Saved as JSON after every transition. */
export interface OnboardingState {
  version: number;
  /** The path for this run: all steps, or only the ones added since the last finished version. */
  steps: OnboardingStep[];
  current: OnboardingStep;
  statuses: Partial<Record<OnboardingStep, StepStatus>>;
  permissions: Partial<Record<PermissionKind, PermissionStatus>>;
  skippedAll: boolean;
  finished: boolean;
  /** Times the student closed the card with Esc. Two is enough: it stops opening by itself. */
  dismissCount: number;
  /** Set just before a relaunch, cleared when the app is back. */
  resumeAfterRelaunch: boolean;
  startedAt: number | null;
}

export type OnboardingEvent =
  | { kind: "next" }
  | { kind: "back" }
  | { kind: "skip" }
  | { kind: "skipAll" }
  | { kind: "permissionChanged"; permission: PermissionKind; status: PermissionStatus }
  | { kind: "relaunchRequested" }
  | { kind: "relaunchResumed" }
  | { kind: "dismiss" }
  | { kind: "reset" };

export type OnboardingEffect =
  | { kind: "requestPermission"; permission: PermissionKind }
  | { kind: "relaunch" }
  | { kind: "complete" }
  | { kind: "close" };

export const sameStatus = (a: StepStatus, b: StepStatus) =>
  typeof a === "string" || typeof b === "string" ? a === b : a.blocked === b.blocked;

export function freshOnboarding(
  platform: PlatformName,
  completedVersion = 0,
  now: number | null = null,
): OnboardingState {
  const path = stepsSince(completedVersion, platform);
  return {
    version: onboardingVersion,
    steps: path,
    current: path[0]!,
    statuses: Object.fromEntries(path.map((step) => [step, "pending"])),
    permissions: {},
    skippedAll: false,
    finished: false,
    dismissCount: 0,
    resumeAfterRelaunch: false,
    startedAt: now,
  };
}

export const stepIndex = (state: OnboardingState) => Math.max(0, state.steps.indexOf(state.current));
export const isLastStep = (state: OnboardingState) => state.current === state.steps[state.steps.length - 1];
export const stepStatus = (state: OnboardingState, step: OnboardingStep): StepStatus =>
  state.statuses[step] ?? "pending";

/** The permissions step is done once these are allowed (the global talk key is optional). */
export const requiredOnPermissionsStep: PermissionKind[] = ["accessibility", "screenRecording", "inputMonitoring"];

export const OnboardingFlow = {
  reduce(
    previous: OnboardingState,
    event: OnboardingEvent,
    platform: PlatformName,
    now: number | null = null,
  ): [OnboardingState, OnboardingEffect[]] {
    const state: OnboardingState = {
      ...previous,
      steps: [...previous.steps],
      statuses: { ...previous.statuses },
      permissions: { ...previous.permissions },
    };
    if (state.startedAt === null) state.startedAt = now;
    switch (event.kind) {
      case "next":
        return advance(state, "done");
      case "skip":
        return advance(state, "skipped");
      case "back": {
        const index = stepIndex(state);
        if (index <= 0) return [previous, []];
        state.current = state.steps[index - 1]!;
        return [state, []];
      }
      case "skipAll":
        for (const step of state.steps) if (stepStatus(state, step) === "pending") state.statuses[step] = "skipped";
        state.skippedAll = true;
        return [state, [{ kind: "complete" }]];
      case "permissionChanged":
        state.permissions[event.permission] = event.status;
        if (
          state.current === "permissions" &&
          requiredOnPermissionsStep.every((kind) => isGranted(state.permissions[kind]))
        ) {
          state.statuses.permissions = "done";
        }
        return [state, []];
      case "relaunchRequested": {
        state.resumeAfterRelaunch = true;
        if (state.current === "permissions") {
          if (stepStatus(state, "permissions") === "pending") state.statuses.permissions = "done";
          const next = nextStep("permissions", state);
          if (next) state.current = next;
        }
        return [state, [{ kind: "relaunch" }]];
      }
      case "relaunchResumed":
        state.resumeAfterRelaunch = false;
        return [state, []];
      case "dismiss":
        state.dismissCount += 1;
        return [state, [{ kind: "close" }]];
      case "reset":
        return [freshOnboarding(platform, 0, now), []];
    }
  },
};

function nextStep(step: OnboardingStep, state: OnboardingState): OnboardingStep | null {
  const index = state.steps.indexOf(step);
  return index >= 0 && index + 1 < state.steps.length ? state.steps[index + 1]! : null;
}

function advance(state: OnboardingState, mark: StepStatus): [OnboardingState, OnboardingEffect[]] {
  // A step already marked (a permission arrived, or a blocked reason) keeps its mark when Next is pressed.
  const status = stepStatus(state, state.current);
  if (status === "pending" || (mark === "skipped" && status !== "done")) state.statuses[state.current] = mark;
  const next = nextStep(state.current, state);
  if (!next) {
    state.finished = true;
    return [state, [{ kind: "complete" }]];
  }
  state.current = next;
  return [state, entryEffects(next)];
}

/** Permission prompts with a visible reason: asked when their screen appears. */
function entryEffects(step: OnboardingStep): OnboardingEffect[] {
  if (step === "mic") return [{ kind: "requestPermission", permission: "microphone" }];
  if (step === "talk") return [{ kind: "requestPermission", permission: "speech" }];
  return [];
}

/** What the app already knows about the student when the flow first runs, to tell a new install from an update. */
export interface ExistingUserSignals {
  hasStudyData: boolean;
  hasAPIKey: boolean;
}

export type LaunchDecision =
  { kind: "show"; state: OnboardingState } | { kind: "none" } | { kind: "migratedExistingUser" };

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string | null): void;
}

export function memoryKeyValueStore(): KeyValueStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      if (value === null) values.delete(key);
      else values.set(key, value);
    },
  };
}

/** Keys under `onboarding.*`. The state JSON is the truth; the other keys mirror parts of it. */
export class OnboardingStore {
  static readonly versionKey = "onboarding.version";
  static readonly completedVersionKey = "onboarding.completedVersion";
  static readonly stateKey = "onboarding.state";
  static readonly resumeAfterRelaunchKey = "onboarding.resumeAfterRelaunch";
  static readonly dismissCountKey = "onboarding.dismissCount";
  /** Stops dismissCount from hiding the flow forever: two Esc presses end the automatic opening. */
  static readonly maxAutomaticDismissals = 2;

  constructor(
    readonly values: KeyValueStore,
    readonly platform: PlatformName,
  ) {}

  get completedVersion(): number {
    return Number(this.values.get(OnboardingStore.completedVersionKey) ?? 0) || 0;
  }

  get savedState(): OnboardingState | null {
    const text = this.values.get(OnboardingStore.stateKey);
    if (!text) return null;
    try {
      const state = JSON.parse(text) as OnboardingState;
      if (!Array.isArray(state.steps) || !state.steps.includes(state.current)) return null;
      return {
        ...state,
        permissions: state.permissions ?? {},
        resumeAfterRelaunch: state.resumeAfterRelaunch ?? false,
      };
    } catch {
      return null;
    }
  }

  save(state: OnboardingState): void {
    this.values.set(OnboardingStore.stateKey, JSON.stringify(state));
    this.values.set(OnboardingStore.versionKey, String(onboardingVersion));
    this.values.set(OnboardingStore.resumeAfterRelaunchKey, state.resumeAfterRelaunch ? "1" : "0");
    this.values.set(OnboardingStore.dismissCountKey, String(state.dismissCount));
    if (state.finished) this.values.set(OnboardingStore.completedVersionKey, String(state.version));
  }

  clear(): void {
    for (const key of [
      OnboardingStore.versionKey,
      OnboardingStore.completedVersionKey,
      OnboardingStore.stateKey,
      OnboardingStore.resumeAfterRelaunchKey,
      OnboardingStore.dismissCountKey,
    ]) {
      this.values.set(key, null);
    }
  }

  /**
   * The rule at launch: finished the current version, nothing; skipped everything for this version, nothing; never
   * saw onboarding but already uses the app, counts as finished (once); a relaunch was requested, resume; closed with
   * Esc twice, stop opening by itself; otherwise the saved state, or a fresh one.
   */
  launchDecision(existingUser: ExistingUserSignals, now: number | null = null): LaunchDecision {
    const completed = this.completedVersion;
    if (completed >= onboardingVersion) return { kind: "none" };
    const saved = this.savedState;
    if (!saved && completed === 0 && (existingUser.hasStudyData || existingUser.hasAPIKey)) {
      this.values.set(OnboardingStore.completedVersionKey, String(onboardingVersion));
      this.values.set(OnboardingStore.versionKey, String(onboardingVersion));
      return { kind: "migratedExistingUser" };
    }
    if (saved) {
      if (saved.skippedAll && saved.version >= onboardingVersion) return { kind: "none" };
      if (saved.resumeAfterRelaunch) return { kind: "show", state: saved };
      if (saved.dismissCount >= OnboardingStore.maxAutomaticDismissals) return { kind: "none" };
      if (saved.version >= onboardingVersion && !saved.finished) return { kind: "show", state: saved };
    }
    return { kind: "show", state: freshOnboarding(this.platform, completed, now) };
  }
}

export interface OnboardingActions {
  requestPermission?: (permission: PermissionKind) => void;
  relaunch?: () => void;
  complete?: () => void;
  close?: () => void;
}

/** Runs the flow's effects and saves every step. */
export class OnboardingCoordinator {
  state: OnboardingState;
  isActive = false;
  private listeners = new Set<() => void>();

  constructor(
    private readonly store: OnboardingStore,
    private readonly actions: OnboardingActions = {},
    private readonly clock: () => number | null = () => null,
  ) {
    this.state = freshOnboarding(store.platform);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed() {
    for (const listener of this.listeners) listener();
  }

  /** Decides at launch. Returns the decision so the app can show a hint after a migration. */
  start(existingUser: ExistingUserSignals): LaunchDecision {
    const decision = this.store.launchDecision(existingUser, this.clock());
    if (decision.kind === "show") {
      this.state = decision.state;
      this.isActive = true;
      if (decision.state.resumeAfterRelaunch) this.send({ kind: "relaunchResumed" });
      else this.store.save(this.state);
    }
    this.changed();
    return decision;
  }

  /** A manual run (Settings › Show the introduction again): starts again, whatever was finished before. */
  begin(): void {
    this.state = freshOnboarding(this.store.platform, 0, this.clock());
    this.isActive = true;
    this.store.save(this.state);
    this.changed();
  }

  send(event: OnboardingEvent): void {
    const [next, effects] = OnboardingFlow.reduce(this.state, event, this.store.platform, this.clock());
    this.state = next;
    this.store.save(this.state);
    for (const effect of effects) {
      switch (effect.kind) {
        case "requestPermission":
          this.actions.requestPermission?.(effect.permission);
          break;
        case "relaunch":
          this.actions.relaunch?.();
          break;
        case "complete":
          this.isActive = false;
          this.actions.complete?.();
          break;
        case "close":
          this.isActive = false;
          this.actions.close?.();
          break;
      }
    }
    this.changed();
  }
}

/**
 * The Windows recordings of the lines that name a key (`scripts/onboarding-clips/lines.windows.json`: Ctrl + Win, Alt),
 * as `<step>_<language>`. Listed once `scripts/onboarding-clips/generate.py` has recorded them; until then those screens
 * show their text without the voice.
 */
export const windowsClips: ReadonlySet<string> = new Set<string>([]);

/** The recorded line of a screen (`ui/public/clips/onboarding/`), or null when its words name a Mac key or permission. */
export function onboardingClip(
  step: OnboardingStep | "talkReply",
  language: "pt" | "en",
  platform: PlatformName,
  recorded: ReadonlySet<string> = windowsClips,
): string | null {
  // These speak of Control + Option, ⌥-click and the Mac's permissions: Windows plays its own recording of the line
  // with its keys, when there is one (no permissions screen on Windows).
  if (platform === "windows" && (step === "talk" || step === "permissions" || step === "tryIt")) {
    return step !== "permissions" && recorded.has(`${step}_${language}`)
      ? `clips/onboarding/onboarding_${step}_windows_${language}.m4a`
      : null;
  }
  return `clips/onboarding/onboarding_${step}_${language}.m4a`;
}

// Port of LearnLayer/Onboarding/OnboardingPresentation.swift @ ref 2026-11-04: what the card shows around a screen.
export const OnboardingPresentation = {
  dots: (state: OnboardingState) =>
    state.steps.map((step, index) => ({
      step,
      isCurrent: index === stepIndex(state),
      isPast: index < stepIndex(state),
    })),
  /** Back is there on every step but the first. */
  canGoBack: (state: OnboardingState) => stepIndex(state) > 0,
  /** The last screen has nothing to skip. */
  canSkip: (state: OnboardingState) => !isLastStep(state),
  /** The first step's Skip ends the whole flow (after a confirmation); the others skip one step. */
  skipEndsFlow: (state: OnboardingState) => stepIndex(state) === 0,
  /** "Step 3 of 9", for the screen reader. */
  position: (state: OnboardingState) => ({ index: stepIndex(state) + 1, total: state.steps.length }),
  /** The big button's label key. Screens with a better verb say it. */
  primaryTitle(step: OnboardingStep): string {
    if (step === "welcome") return "Start";
    if (step === "plan") return "Use for free";
    if (step === "done") return "Start learning";
    return "Continue";
  },
  /** Steps whose own Skip-like secondary action says "Not now" instead of the top-right Skip. */
  hasNotNow: (step: OnboardingStep) => step === "mic",
  attributionChoices: ["Instagram", "TikTok", "YouTube", "Friend", "Teacher", "Google", "Other"] as const,
  /** The language the flow starts in: the first preferred language, Portuguese of any region → pt-PT. */
  initialLanguage: (preferred: readonly string[]): "pt" | "en" =>
    (preferred[0] ?? "en").toLowerCase().startsWith("pt") ? "pt" : "en",
};

/** Keys the card saves a choice under the moment it is made (OnboardingModel). */
export const onboardingChoiceKeys = { name: "profile.name", attribution: "profile.attribution", plan: "plan.selected" };
