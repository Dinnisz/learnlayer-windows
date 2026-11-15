// Port of LearnLayer/Settings/DataPrivacySettingsTab.swift @ ref 2026-11-04: export or erase what LearnLayer
// remembers, the consents (sync, habits, anonymous usage), the habits noticed, and where the student's data goes.
// The study data of the Mac (review cards) is not ported (CLAUDE.md, section 8), so its reset is not here.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { MemoryConsent, MemoryStore } from "@core/memory/memory";
import {
  SettingsButton,
  SettingsGroup,
  SettingsPage,
  SettingsRow,
  SettingsToggle,
} from "../../../components/settings/SettingsKit";
import { useT } from "../../../i18n";
import { memoryStore } from "../../../memory/memory";
import { appConfig } from "../../../native";

/** Saves `text` as a file the student picks (the browser's save, the WebView2 download prompt in the app). */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function DataPane() {
  const t = useT();
  const [store, setStore] = useState<MemoryStore | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [version, setVersion] = useState("");
  useEffect(() => {
    void memoryStore().then(setStore);
    void appConfig().then((config) => setVersion(config.version));
  }, []);
  useSyncExternalStore(
    (listener) => store?.subscribe(listener) ?? (() => {}),
    () => store?.version ?? -1,
  );
  const consent: MemoryConsent = store?.consent ?? { memorySync: false, productAnalytics: false, adaptToHabits: true };
  const write = (change: Partial<MemoryConsent>) => store?.setConsent({ ...consent, ...change });
  const habits = store?.noticedHabits() ?? [];
  const habitLine = (key: string, area: string) => (key.includes("%@") && area !== "" ? t(key, area) : t(key));

  return (
    <SettingsPage title={t("Data & Privacy")} subtitle={t("What LearnLayer remembers and where it goes.")}>
      <SettingsGroup header={t("Memory")} footer={t("Memory leaves this Mac only if you turn on sync.")}>
        <SettingsRow title={t("Export memory")} detail={t("Save questions and explanations from this Mac.")}>
          <SettingsButton onClick={() => store && download("LearnLayer memory.json", store.exportData())}>
            {t("Export…")}
          </SettingsButton>
        </SettingsRow>
        <SettingsRow title={t("Reset memory")} detail={t("Delete questions and explanations on this Mac.")}>
          <SettingsButton kind="destructive" onClick={() => setConfirming(true)}>
            {t("Reset…")}
          </SettingsButton>
        </SettingsRow>
        {confirming && (
          <SettingsRow
            title={t("Reset memory?")}
            detail={t("This deletes questions and explanations on this Mac. It can’t be undone.")}
          >
            <SettingsButton onClick={() => setConfirming(false)}>{t("Cancel")}</SettingsButton>
            <SettingsButton
              kind="destructive"
              onClick={() => {
                store?.resetMemory();
                setConfirming(false);
              }}
            >
              {t("Reset memory")}
            </SettingsButton>
          </SettingsRow>
        )}
        <SettingsRow
          title={t("Sync memory across my devices")}
          detail={t("Encrypted on this Mac. The server cannot read it.")}
        >
          <SettingsToggle
            label={t("Sync memory across my devices")}
            checked={consent.memorySync}
            onChange={(on) => write({ memorySync: on })}
          />
        </SettingsRow>
        <SettingsRow
          title={t("Adapt explanations to my habits")}
          detail={t("Length and examples follow what you do. You can turn this off.")}
        >
          <SettingsToggle
            label={t("Adapt explanations to my habits")}
            checked={consent.adaptToHabits}
            onChange={(on) => write({ adaptToHabits: on })}
          />
        </SettingsRow>
        <SettingsRow
          title={t("Share anonymous usage")}
          detail={t("Counts only. Never the text of a question or an explanation.")}
        >
          <SettingsToggle
            label={t("Share anonymous usage")}
            checked={consent.productAnalytics}
            onChange={(on) => write({ productAnalytics: on })}
          />
        </SettingsRow>
        {habits.length === 0 ? (
          <SettingsRow title={t("Nothing noticed yet.")} plain />
        ) : (
          <>
            <SettingsRow title={t("Habits noticed")} plain />
            {habits.map((habit) => (
              <SettingsRow key={habit.id} title={habitLine(habit.phraseKey, habit.area)} plain>
                <SettingsButton onClick={() => store?.forgetHabit(habit.id)}>{t("Forget")}</SettingsButton>
              </SettingsRow>
            ))}
          </>
        )}
      </SettingsGroup>
      <SettingsGroup header={t("Privacy")}>
        <SettingsRow
          title={t("Exercise text and images are sent to OpenRouter to be explained.")}
          symbol="network"
          plain
        />
        <SettingsRow
          title={t("Spoken text is sent to ElevenLabs, through OpenRouter, to be read aloud.")}
          symbol="waveform"
          plain
        />
        <SettingsRow title={t("Your PDFs never leave this Mac.")} symbol="lock.doc" plain />
      </SettingsGroup>
      <SettingsGroup header={t("About")}>
        <SettingsRow title={t("Version")}>
          <span className="settings-version">{version}</span>
        </SettingsRow>
      </SettingsGroup>
    </SettingsPage>
  );
}
