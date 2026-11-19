// Port of LearnLayerTests/OnboardingTests.swift @ ref 2026-11-04. The Mac's cases run on the "macos" path; the
// Windows path (no permissions screen) has its own cases at the end.

import { describe, expect, it } from "vitest";
import {
  freshOnboarding,
  memoryKeyValueStore,
  onboardingClip,
  OnboardingCoordinator,
  OnboardingFlow,
  OnboardingPresentation,
  onboardingSteps,
  OnboardingStore,
  platformSteps,
  stepsSince,
  stepStatus,
  type ExistingUserSignals,
  type OnboardingEffect,
  type OnboardingEvent,
  type OnboardingState,
  type PermissionKind,
} from "./onboarding";

const mac = "macos" as const;

function reduce(state: OnboardingState, ...events: OnboardingEvent[]): [OnboardingState, OnboardingEffect[]] {
  let current = state;
  const effects: OnboardingEffect[] = [];
  for (const event of events) {
    const [next, more] = OnboardingFlow.reduce(current, event, mac);
    current = next;
    effects.push(...more);
  }
  return [current, effects];
}

const next = { kind: "next" } as const;
const back = { kind: "back" } as const;
const skip = { kind: "skip" } as const;
const skipAll = { kind: "skipAll" } as const;
const dismiss = { kind: "dismiss" } as const;
const fresh = () => freshOnboarding(mac);
const newUser: ExistingUserSignals = { hasStudyData: false, hasAPIKey: false };

describe("OnboardingFlow", () => {
  it("has nine steps and no subject step", () => {
    expect([...onboardingSteps]).toEqual([
      "welcome",
      "language",
      "mic",
      "talk",
      "permissions",
      "tryIt",
      "look",
      "plan",
      "done",
    ]);
    expect(onboardingSteps).not.toContain("subject");
  });

  it("a later version shows only the new steps", () => {
    expect(stepsSince(0, mac)).toEqual([...onboardingSteps]);
    // Nothing was added after version 1, so a student who finished it sees the whole flow if asked again.
    expect(stepsSince(1, mac)).toEqual([...onboardingSteps]);
  });

  it("next walks every step in order and finishes", () => {
    let state = fresh();
    const visited = [state.current];
    let lastEffects: OnboardingEffect[] = [];
    while (!state.finished) {
      [state, lastEffects] = OnboardingFlow.reduce(state, next, mac);
      if (!state.finished) visited.push(state.current);
    }
    expect(visited).toEqual([...onboardingSteps]);
    expect(lastEffects).toEqual([{ kind: "complete" }]);
    expect(onboardingSteps.every((step) => stepStatus(state, step) === "done")).toBe(true);
  });

  it("entering the mic and talk screens asks for their permission", () => {
    const [state, all] = reduce(fresh(), next, next, next);
    expect(state.current).toBe("talk");
    expect(all).toEqual([
      { kind: "requestPermission", permission: "microphone" },
      { kind: "requestPermission", permission: "speech" },
    ]);
  });

  it("back goes to the previous step and keeps statuses", () => {
    const [state] = reduce(fresh(), next, next);
    const [previous, effects] = reduce(state, back);
    expect(previous.current).toBe("language");
    expect(stepStatus(previous, "welcome")).toBe("done");
    expect(stepStatus(previous, "language")).toBe("done");
    expect(effects).toEqual([]); // going back never asks a permission again
  });

  it("back on the first step does nothing", () => {
    const start = fresh();
    const [state, effects] = reduce(start, back);
    expect(state).toEqual(start);
    expect(effects).toEqual([]);
  });

  it("skip marks the step skipped and moves on", () => {
    const [state] = reduce(fresh(), next, next, skip);
    expect(state.current).toBe("talk");
    expect(stepStatus(state, "mic")).toBe("skipped");
  });

  it("skipping the last step still finishes", () => {
    const state = { ...fresh(), current: "done" as const };
    const [end, effects] = reduce(state, skip);
    expect(end.finished).toBe(true);
    expect(effects).toEqual([{ kind: "complete" }]);
  });

  it("skip all ends the flow without marking anything done", () => {
    const [state, effects] = reduce(fresh(), next, skipAll);
    expect(state.skippedAll).toBe(true);
    expect(state.finished).toBe(false);
    expect(effects).toEqual([{ kind: "complete" }]);
    expect(stepStatus(state, "welcome")).toBe("done");
    expect(stepStatus(state, "mic")).toBe("skipped");
    expect(stepStatus(state, "done")).toBe("skipped");
  });

  it("a blocked step keeps its mark on next but skip overrides it", () => {
    const state: OnboardingState = {
      ...fresh(),
      current: "mic",
      statuses: { ...fresh().statuses, mic: { blocked: "no microphone" } },
    };
    expect(stepStatus(reduce(state, next)[0], "mic")).toEqual({ blocked: "no microphone" });
    expect(stepStatus(reduce(state, skip)[0], "mic")).toBe("skipped");
  });

  it("permission changes are recorded", () => {
    const [state, effects] = reduce(fresh(), {
      kind: "permissionChanged",
      permission: "microphone",
      status: "granted",
    });
    expect(state.permissions.microphone).toBe("granted");
    expect(effects).toEqual([]);
  });

  it("the permissions step is done once all three are allowed", () => {
    const state = { ...fresh(), current: "permissions" as const };
    const [partial] = reduce(
      state,
      { kind: "permissionChanged", permission: "accessibility", status: "granted" },
      { kind: "permissionChanged", permission: "screenRecording", status: "grantedNeedsRelaunch" },
    );
    expect(stepStatus(partial, "permissions")).toBe("pending");
    const [all] = reduce(partial, { kind: "permissionChanged", permission: "inputMonitoring", status: "granted" });
    expect(stepStatus(all, "permissions")).toBe("done");
    expect(all.current).toBe("permissions");
  });

  it("a relaunch request saves the resume point and relaunches", () => {
    const state = { ...fresh(), current: "permissions" as const };
    const [after, effects] = reduce(state, { kind: "relaunchRequested" });
    expect(after.resumeAfterRelaunch).toBe(true);
    expect(after.current).toBe("tryIt");
    expect(stepStatus(after, "permissions")).toBe("done");
    expect(effects).toEqual([{ kind: "relaunch" }]);
  });

  it("relaunch resumed clears the flag", () => {
    const state = { ...fresh(), current: "tryIt" as const, resumeAfterRelaunch: true };
    const [after, effects] = reduce(state, { kind: "relaunchResumed" });
    expect(after.resumeAfterRelaunch).toBe(false);
    expect(after.current).toBe("tryIt");
    expect(effects).toEqual([]);
  });

  it("dismiss counts and closes but stays resumable", () => {
    const [state, effects] = reduce(fresh(), next, dismiss);
    expect(state.dismissCount).toBe(1);
    expect(state.finished || state.skippedAll).toBe(false);
    expect(effects).toEqual([{ kind: "close" }]);
  });

  it("reset starts over", () => {
    const state = { ...fresh(), finished: true, current: "done" as const, dismissCount: 2 };
    const [after] = reduce(state, { kind: "reset" });
    expect(after.current).toBe("welcome");
    expect(after.finished).toBe(false);
    expect(after.dismissCount).toBe(0);
    expect(after.steps.every((step) => stepStatus(after, step) === "pending")).toBe(true);
  });
});

describe("OnboardingStore", () => {
  it("the state round-trips through JSON", () => {
    const state: OnboardingState = {
      ...freshOnboarding(mac, 0, 1000),
      current: "look",
      statuses: { ...fresh().statuses, mic: { blocked: "denied" } },
      permissions: { speech: "denied" },
    };
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("saves the state and mirrors the keys", () => {
    const values = memoryKeyValueStore();
    const store = new OnboardingStore(values, mac);
    const state = { ...fresh(), resumeAfterRelaunch: true, dismissCount: 1 };
    store.save(state);
    expect(store.savedState).toEqual(state);
    expect(values.get("onboarding.version")).toBe("1");
    expect(values.get("onboarding.resumeAfterRelaunch")).toBe("1");
    expect(values.get("onboarding.dismissCount")).toBe("1");
    expect(store.completedVersion).toBe(0);
    store.save({ ...state, finished: true });
    expect(values.get("onboarding.completedVersion")).toBe("1");
  });

  it("a new student sees the flow from the start", () => {
    const decision = new OnboardingStore(memoryKeyValueStore(), mac).launchDecision(newUser);
    expect(decision.kind).toBe("show");
    if (decision.kind === "show") expect(decision.state.current).toBe("welcome");
  });

  it("an existing student is migrated once and never forced", () => {
    const values = memoryKeyValueStore();
    const store = new OnboardingStore(values, mac);
    const existing = { hasStudyData: true, hasAPIKey: false };
    expect(store.launchDecision(existing)).toEqual({ kind: "migratedExistingUser" });
    expect(values.get("onboarding.completedVersion")).toBe("1");
    expect(store.launchDecision(existing)).toEqual({ kind: "none" });
    const keyOnly = new OnboardingStore(memoryKeyValueStore(), mac);
    expect(keyOnly.launchDecision({ hasStudyData: false, hasAPIKey: true })).toEqual({ kind: "migratedExistingUser" });
  });

  it("a finished flow is not shown again", () => {
    const store = new OnboardingStore(memoryKeyValueStore(), mac);
    store.save({ ...fresh(), finished: true });
    expect(store.launchDecision(newUser)).toEqual({ kind: "none" });
  });

  it("a skipped flow is not shown again for that version", () => {
    const store = new OnboardingStore(memoryKeyValueStore(), mac);
    store.save(reduce(fresh(), skipAll)[0]);
    expect(store.launchDecision(newUser)).toEqual({ kind: "none" });
  });

  it("a killed flow resumes at the saved step", () => {
    const store = new OnboardingStore(memoryKeyValueStore(), mac);
    const state = reduce(fresh(), next, next, next)[0];
    store.save(state);
    expect(store.launchDecision(newUser)).toEqual({ kind: "show", state });
  });

  it("after two dismissals it stops opening by itself", () => {
    const store = new OnboardingStore(memoryKeyValueStore(), mac);
    const once = reduce(fresh(), next, dismiss)[0];
    store.save(once);
    expect(store.launchDecision(newUser)).toEqual({ kind: "show", state: once });
    const twice = reduce(once, dismiss)[0];
    store.save(twice);
    expect(store.launchDecision(newUser)).toEqual({ kind: "none" });
  });

  it("a relaunch resume beats the dismissal limit", () => {
    const store = new OnboardingStore(memoryKeyValueStore(), mac);
    const state = { ...fresh(), current: "tryIt" as const, dismissCount: 2, resumeAfterRelaunch: true };
    store.save(state);
    expect(store.launchDecision(newUser)).toEqual({ kind: "show", state });
  });

  it("a state from an older version starts fresh", () => {
    const store = new OnboardingStore(memoryKeyValueStore(), mac);
    store.save({ ...fresh(), version: 0, current: "look" });
    const decision = store.launchDecision(newUser);
    expect(decision.kind).toBe("show");
    if (decision.kind === "show") expect(decision.state.current).toBe("welcome");
  });
});

describe("OnboardingCoordinator", () => {
  it("runs effects and saves every step", () => {
    const values = memoryKeyValueStore();
    const store = new OnboardingStore(values, mac);
    const asked: PermissionKind[] = [];
    let relaunches = 0;
    let completes = 0;
    const coordinator = new OnboardingCoordinator(store, {
      requestPermission: (kind) => asked.push(kind),
      relaunch: () => (relaunches += 1),
      complete: () => (completes += 1),
    });
    coordinator.start(newUser);
    expect(coordinator.isActive).toBe(true);
    coordinator.send(next);
    coordinator.send(next);
    expect(asked).toEqual(["microphone"]);
    expect(store.savedState?.current).toBe("mic");
    coordinator.send(next);
    coordinator.send(next);
    expect(coordinator.state.current).toBe("permissions");
    coordinator.send({ kind: "relaunchRequested" });
    expect(relaunches).toBe(1);
    expect(values.get("onboarding.resumeAfterRelaunch")).toBe("1");
    coordinator.send(skipAll);
    expect(completes).toBe(1);
    expect(coordinator.isActive).toBe(false);
  });

  it("resumes after a relaunch", () => {
    const store = new OnboardingStore(memoryKeyValueStore(), mac);
    store.save({ ...fresh(), current: "tryIt", resumeAfterRelaunch: true });
    const coordinator = new OnboardingCoordinator(store);
    coordinator.start(newUser);
    expect(coordinator.state.current).toBe("tryIt");
    expect(coordinator.state.resumeAfterRelaunch).toBe(false);
    expect(store.savedState?.resumeAfterRelaunch).toBe(false);
  });
});

describe("Windows path", () => {
  it("leaves out the permissions screen and keeps the rest in order", () => {
    expect(platformSteps("windows")).toEqual(["welcome", "language", "mic", "talk", "tryIt", "look", "plan", "done"]);
    let state = freshOnboarding("windows");
    const visited = [state.current];
    while (!state.finished) {
      [state] = OnboardingFlow.reduce(state, next, "windows");
      if (!state.finished) visited.push(state.current);
    }
    expect(visited).toEqual(platformSteps("windows"));
  });

  it("starts again on the Windows path after a reset", () => {
    const [state] = OnboardingFlow.reduce(freshOnboarding("windows"), { kind: "reset" }, "windows");
    expect(state.steps).not.toContain("permissions");
  });

  it("plays no clip that names a Mac key", () => {
    expect(onboardingClip("welcome", "pt", "windows")).toBe("clips/onboarding/onboarding_welcome_pt.m4a");
    expect(onboardingClip("talk", "pt", "windows")).toBeNull();
    expect(onboardingClip("tryIt", "en", "windows")).toBeNull();
    expect(onboardingClip("talk", "en", mac)).toBe("clips/onboarding/onboarding_talk_en.m4a");
  });

  it("plays the Windows recording of a line that names a key, once it is recorded", () => {
    const recorded = new Set(["talk_pt", "tryIt_en"]);
    expect(onboardingClip("talk", "pt", "windows", recorded)).toBe("clips/onboarding/onboarding_talk_windows_pt.m4a");
    expect(onboardingClip("tryIt", "en", "windows", recorded)).toBe("clips/onboarding/onboarding_tryIt_windows_en.m4a");
    expect(onboardingClip("talk", "en", "windows", recorded)).toBeNull();
    expect(onboardingClip("permissions", "pt", "windows", new Set(["permissions_pt"]))).toBeNull();
  });
});

// Port of LearnLayerTests/OnboardingScreensTests.swift @ ref 2026-11-04 (the step mapping and language cases).
describe("OnboardingPresentation", () => {
  it("dots mark the current step and the past ones", () => {
    const [state] = reduce(fresh(), next, next);
    const dots = OnboardingPresentation.dots(state);
    expect(dots.length).toBe(9);
    expect(dots.map((dot) => dot.isCurrent)).toEqual([false, false, true, false, false, false, false, false, false]);
    expect(dots.filter((dot) => dot.isPast).length).toBe(2);
    expect(OnboardingPresentation.position(state)).toEqual({ index: 3, total: 9 });
  });

  it("back, skip and primary follow the step", () => {
    const first = fresh();
    expect(OnboardingPresentation.canGoBack(first)).toBe(false);
    expect(OnboardingPresentation.skipEndsFlow(first)).toBe(true);
    const middle = { ...first, current: "talk" as const };
    expect(OnboardingPresentation.canGoBack(middle)).toBe(true);
    expect(OnboardingPresentation.skipEndsFlow(middle)).toBe(false);
    expect(OnboardingPresentation.canSkip(middle)).toBe(true);
    expect(OnboardingPresentation.canSkip({ ...first, current: "done" })).toBe(false);
    expect(OnboardingPresentation.hasNotNow("mic")).toBe(true);
    expect(OnboardingPresentation.hasNotNow("talk")).toBe(false);
    expect(OnboardingPresentation.primaryTitle("welcome")).toBe("Start");
    expect(OnboardingPresentation.primaryTitle("look")).toBe("Continue");
  });

  it("Portuguese of any region starts in European Portuguese", () => {
    expect(OnboardingPresentation.initialLanguage(["pt-BR", "en"])).toBe("pt");
    expect(OnboardingPresentation.initialLanguage(["pt"])).toBe("pt");
    expect(OnboardingPresentation.initialLanguage(["en-GB"])).toBe("en");
    expect(OnboardingPresentation.initialLanguage([])).toBe("en");
  });

  it("the Windows card has eight dots", () => {
    expect(OnboardingPresentation.dots(freshOnboarding("windows")).length).toBe(8);
  });
});
