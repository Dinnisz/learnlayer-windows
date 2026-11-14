// Port of LearnLayer/Notch/NotchMode.swift @ ref 2026-11-04

/** What the pill shows. One at a time (CLAUDE.md: at most one element open). */
export const notchModes = ["idle", "hover", "exercise", "toast", "speaking", "listening", "prompt"] as const;
export type NotchMode = (typeof notchModes)[number];

export interface NotchModeInputs {
  /** The compact permission prompt of onboarding. */
  permissionPrompt?: boolean;
  /** Push-to-talk is held. */
  listening?: boolean;
  /** The tutor's voice is playing. */
  speaking?: boolean;
  /** A one-line transient message (a capture error). */
  toast?: boolean;
  /** An exam question is open. */
  exerciseOpen?: boolean;
  /** The pointer is over the pill. */
  hovering?: boolean;
}

/**
 * The locale key a screen reader is told when the pill enters this mode (once per change). The pill draws the
 * same words, but the waveform beside them is hidden from Narrator, so this is how a blind user hears the state.
 */
export function announcementKey(mode: NotchMode): string | null {
  switch (mode) {
    case "listening":
      return "Listening…";
    case "speaking":
      return "Speaking…";
    default:
      return null;
  }
}

/**
 * Priority, highest first: permission prompt, listening, speaking, toast, exercise open,
 * hover, idle. A hover never replaces an open exercise: the exercise's own options show.
 */
export function resolveNotchMode(inputs: NotchModeInputs): NotchMode {
  if (inputs.permissionPrompt) return "prompt";
  if (inputs.listening) return "listening";
  if (inputs.speaking) return "speaking";
  if (inputs.toast) return "toast";
  if (inputs.exerciseOpen) return "exercise";
  if (inputs.hovering) return "hover";
  return "idle";
}
