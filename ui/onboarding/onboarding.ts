// The onboarding of this window: the flow saved in localStorage under `onboarding.*` (the Mac's UserDefaults keys),
// decided once at launch. Settings › General › Show starts it again.

import {
  OnboardingCoordinator,
  OnboardingStore,
  type ExistingUserSignals,
  type KeyValueStore,
} from "@core/onboarding/onboarding";
import type { PlatformName } from "@core/platform";

const localValues: KeyValueStore = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // Kept for this launch only.
    }
  },
};

let coordinator: OnboardingCoordinator | null = null;

/** The one coordinator of this window. The microphone is asked by its screen itself (getUserMedia). */
export function onboardingCoordinator(platform: PlatformName): OnboardingCoordinator {
  coordinator ??= new OnboardingCoordinator(new OnboardingStore(localValues, platform), {}, () => Date.now() / 1000);
  return coordinator;
}

/** A student who already has questions in the memory, or a session, is not new: they are not shown the card. */
export function existingUser(hasQuestions: boolean, signedIn: boolean): ExistingUserSignals {
  return { hasStudyData: hasQuestions, hasAPIKey: signedIn };
}
