// Port of LearnLayer/Problems/SelectionPanel.swift @ ref 2026-11-04: a selected passage on the stage, white on the
// dimmed screen, with the choices (explain it, what it asks, a hint), then the answer and the other two as links.
// 1–3 choose, Esc closes.

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { isSignedOut } from "@core/ai/modelClient";
import { SelectionSession, type SelectionMode } from "@core/problems/selectionSession";
import { textHelpProvider } from "../ai/solver";
import { MathText } from "../components/Math";
import { useT } from "../i18n";
import { showMain } from "../native";

/** A passage to ask about: the selected text and, when known, the text around it. */
export interface PassageSource {
  kind: "passage";
  text: string;
  context: string;
}

const choices: [SelectionMode, string][] = [
  ["explain", "Explain it"],
  ["asks", "What is it asking?"],
  ["hint", "Give me a hint"],
];

const links: [SelectionMode, string][] = [
  ["explain", "Explain"],
  ["asks", "What it asks"],
  ["hint", "Hint"],
];

export function PassageStage({ source, close }: { source: PassageSource; close: () => void }) {
  const t = useT();
  const session = useMemo(
    () =>
      new SelectionSession(source.text, source.context, {
        help: (passage, context, image) => textHelpProvider().help(passage, context, image),
        isSignedOut,
      }),
    [source],
  );
  useSyncExternalStore(session.subscribe, () => session.version);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        session.cancel();
        close();
        return;
      }
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (typing || event.ctrlKey || event.metaKey || event.altKey || session.mode !== null) return;
      const chosen = choices[Number(event.key) - 1];
      if (chosen) {
        event.preventDefault();
        session.choose(chosen[0]);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      session.cancel();
    };
  }, [session, close]);

  const state = session.state;
  let body;
  if (session.mode === null) {
    body = (
      <nav className="stage-menu" aria-label={t("What do you want to do?")}>
        <p className="stage-menu-title">{t("What do you want to do?")}</p>
        <ol>
          {choices.map(([mode, label], index) => (
            <li key={mode}>
              <button type="button" onClick={() => session.choose(mode)} autoFocus={index === 0}>
                <span className="stage-menu-number">{index + 1}</span>
                {t(label)}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    );
  } else if (state.kind === "loading") {
    body = (
      <p className="stage-progress" role="status" aria-live="polite">
        <span className="stage-progress-dot" aria-hidden="true" />
        {t("Thinking…")}
      </p>
    );
  } else if (state.kind === "needsKey") {
    body = (
      <div className="stage-panel">
        <p className="stage-paragraph">{t("Sign in to LearnLayer in Settings to get explanations.")}</p>
        <button type="button" className="stage-link" onClick={() => void showMain("account")}>
          {t("Settings")}
        </button>
      </div>
    );
  } else if (state.kind === "failed") {
    body = (
      <div className="stage-panel">
        <p className="stage-paragraph">{t("Couldn’t get an explanation.")}</p>
        <button type="button" className="stage-link" onClick={() => void session.load()}>
          {t("Try Again")}
        </button>
      </div>
    );
  } else {
    body = (
      <div className="stage-panel" aria-live="polite">
        {session.shown.map((paragraph, index) => (
          <p key={index} className="stage-paragraph">
            <MathText text={paragraph} />
          </p>
        ))}
        <div className="stage-action-row">
          {links
            .filter(([mode]) => mode !== session.mode)
            .map(([mode, label]) => (
              <button key={mode} type="button" className="stage-link quiet" onClick={() => session.choose(mode)}>
                {t(label)}
              </button>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="stage" role="dialog" aria-modal="true" aria-label={t("Explain selected text")}>
      <div className="stage-column">
        <div className="stage-question stage-passage">
          <MathText text={source.text} />
        </div>
        {body}
      </div>
    </div>
  );
}
