// Port of LearnLayer/Settings/GeneralSettingsTab.swift @ ref 2026-11-04: subject and exam, the voice and the mascot,
// the language, the introduction, and how to use the app. On Windows also the talk key and Alt-click (CLAUDE.md 3.1,
// 4.3), which the Mac keeps in AI & usage and Permissions.

import { useEffect, useState } from "react";
import { mascotColorKey, mascotColors, storedMascotColor, type MascotColor } from "../../../components/Mascot";
import {
  SettingsButton,
  SettingsGroup,
  SettingsPage,
  SettingsRow,
  SettingsSelect,
  SettingsToggle,
} from "../../../components/settings/SettingsKit";
import { useT } from "../../../i18n";
import {
  anywhereEnabled,
  isTauri,
  setAnywhereEnabled,
  setStartsWithSystem,
  setTalkKey,
  startsWithSystem,
  talkKeyChoice,
  type TalkKeyChoice,
} from "../../../native";
import { premiumVoiceKey } from "../../../voice/speaker";

export const examSubjects = [
  "Mathematics A",
  "Mathematics B",
  "MACS",
  "Physics and Chemistry A",
  "Biology and Geology",
  "Portuguese",
  "Philosophy",
  "History A",
  "Geography A",
  "English",
  "French",
  "Descriptive Geometry A",
  "Economics A",
] as const;

export const preferences = {
  subject: "preferredSubject",
  examDate: "examDate",
  voice: "voiceEnabled",
  mascot: "mascotEnabled",
  language: "appLanguage",
  onboarding: "onboardingRestart",
};

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Kept for this launch only.
  }
};

/** A boolean preference, on unless set to "0" (as the Mac's @AppStorage defaults). */
function useFlag(key: string): [boolean, (on: boolean) => void] {
  const [value, setValue] = useState(() => read(key) !== "0");
  return [
    value,
    (on) => {
      write(key, on ? "1" : "0");
      setValue(on);
    },
  ];
}

export function GeneralPane({ onRestartIntroduction }: { onRestartIntroduction?: () => void }) {
  const t = useT();
  const stored = read(preferences.subject) ?? "";
  const isListed = (examSubjects as readonly string[]).includes(stored);
  const [subject, setSubject] = useState(stored === "" ? "" : isListed ? stored : "other");
  const [custom, setCustom] = useState(isListed ? "" : stored);
  const [examDate, setExamDate] = useState(read(preferences.examDate) ?? "");
  const [hasExam, setHasExam] = useState(examDate !== "");
  const [voice, setVoice] = useFlag(preferences.voice);
  const [premium, setPremium] = useFlag(premiumVoiceKey);
  const [mascot, setMascot] = useFlag(preferences.mascot);
  const [colour, setColour] = useState<MascotColor>(storedMascotColor());
  const shownLanguage = useState(() => read(preferences.language) ?? "")[0];
  const [language, setLanguage] = useState(shownLanguage);
  const [talk, setTalk] = useState<TalkKeyChoice>(talkKeyChoice());
  const [anywhere, setAnywhere] = useState(anywhereEnabled());
  const [startsWithWindows, setStartsWithWindows] = useState(false);
  useEffect(() => {
    void startsWithSystem().then(setStartsWithWindows);
  }, []);

  const applySubject = (choice: string, text: string) => {
    write(preferences.subject, choice === "" ? null : choice === "other" ? text.trim() || null : choice);
  };

  return (
    <SettingsPage title={t("General")} subtitle={t("Subject, voice and language.")}>
      <SettingsGroup header={t("Study")}>
        <SettingsRow title={t("Default subject")}>
          <SettingsSelect
            label={t("Default subject")}
            value={subject}
            options={[
              { value: "", title: t("Not set") },
              ...examSubjects.map((name) => ({ value: name, title: t(name) })),
              { value: "other", title: t("Other") },
            ]}
            onChange={(value) => {
              setSubject(value);
              applySubject(value, custom);
            }}
          />
        </SettingsRow>
        {subject === "other" && (
          <SettingsRow title={t("Add a subject")}>
            <input
              className="settings-field"
              value={custom}
              aria-label={t("Add a subject")}
              onChange={(event) => {
                setCustom(event.target.value);
                applySubject("other", event.target.value);
              }}
            />
          </SettingsRow>
        )}
        <SettingsRow title={t("I have an exam")} detail={t("Explanations stay shorter the day before.")}>
          <SettingsToggle
            label={t("I have an exam")}
            checked={hasExam}
            onChange={(on) => {
              setHasExam(on);
              const date = on ? examDate || new Date().toISOString().slice(0, 10) : "";
              setExamDate(date);
              write(preferences.examDate, on ? date : null);
            }}
          />
        </SettingsRow>
        {hasExam && (
          <SettingsRow title={t("Exam date")}>
            <input
              type="date"
              className="settings-field"
              value={examDate}
              aria-label={t("Exam date")}
              onChange={(event) => {
                setExamDate(event.target.value);
                write(preferences.examDate, event.target.value || null);
              }}
            />
          </SettingsRow>
        )}
      </SettingsGroup>

      <SettingsGroup header={t("Tutor")}>
        <SettingsRow title={t("Voice")} detail={t("Read explanations aloud.")}>
          <SettingsToggle label={t("Voice")} checked={voice} onChange={setVoice} />
        </SettingsRow>
        <SettingsRow
          title={t("Premium voice")}
          detail={t(
            "A studio-quality Portuguese voice. It is counted apart from explanations. Off, your Mac reads aloud for free.",
          )}
        >
          <SettingsToggle label={t("Premium voice")} checked={premium} onChange={setPremium} />
        </SettingsRow>
        <SettingsRow title={t("Mascot")} detail={t("Show the animated mascot while it explains.")}>
          <SettingsToggle label={t("Mascot")} checked={mascot} onChange={setMascot} />
        </SettingsRow>
        <SettingsRow title={t("Mascot colour")}>
          <div className="mascot-swatches" role="radiogroup" aria-label={t("Mascot colour")}>
            {(Object.keys(mascotColors) as MascotColor[]).map((name) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={colour === name}
                aria-label={t(name)}
                title={t(name)}
                className={colour === name ? "selected" : undefined}
                style={{ background: `linear-gradient(135deg, ${mascotColors[name][1]}, ${mascotColors[name][0]})` }}
                onClick={() => {
                  write(mascotColorKey, name);
                  setColour(name);
                }}
              />
            ))}
          </div>
        </SettingsRow>
        <SettingsRow
          title={t("Talk key")}
          detail={t("Hold the key to talk, then release to send. The microphone button does the same.")}
        >
          <SettingsSelect<TalkKeyChoice>
            label={t("Talk key")}
            value={talk}
            options={[
              { value: "controlWindows", title: t("Ctrl + Win") },
              { value: "copilot", title: t("Copilot key") },
              { value: "rightControl", title: t("Right Ctrl") },
              { value: "none", title: t("Microphone button only") },
            ]}
            onChange={(choice) => {
              setTalk(choice);
              void setTalkKey(choice);
            }}
          />
        </SettingsRow>
        <SettingsRow
          title={t("⌥-click in any app")}
          detail={`${t("Lets Alt-click read the question under the pointer in other apps.")} ${t("Ctrl + Shift + Space reads the question under the pointer, too.")}`}
        >
          <SettingsToggle
            label={t("⌥-click in any app")}
            checked={anywhere}
            onChange={(on) => {
              setAnywhere(on);
              void setAnywhereEnabled(on);
            }}
          />
        </SettingsRow>
      </SettingsGroup>

      {isTauri && (
        <SettingsGroup>
          <SettingsRow
            title={t("Start with Windows")}
            detail={t("Opens LearnLayer in the background when you sign in to Windows.")}
          >
            <SettingsToggle
              label={t("Start with Windows")}
              checked={startsWithWindows}
              onChange={(on) => {
                setStartsWithWindows(on);
                void setStartsWithSystem(on).catch(() => setStartsWithWindows(!on));
              }}
            />
          </SettingsRow>
        </SettingsGroup>
      )}

      <SettingsGroup>
        <SettingsRow title={t("Language")}>
          <SettingsSelect
            label={t("Language")}
            value={language}
            options={[
              { value: "", title: t("Same as the Mac") },
              { value: "en", title: "English" },
              { value: "pt-PT", title: "Português (Portugal)" },
            ]}
            onChange={(value) => {
              setLanguage(value);
              write(preferences.language, value === "" ? null : value);
            }}
          />
        </SettingsRow>
        {language !== shownLanguage && (
          <SettingsRow title={t("The new language shows after LearnLayer restarts.")}>
            <SettingsButton kind="prominent" onClick={() => window.location.reload()}>
              {t("Restart")}
            </SettingsButton>
          </SettingsRow>
        )}
      </SettingsGroup>

      <SettingsGroup header={t("Introduction")}>
        <SettingsRow title={t("Show the introduction again")}>
          <SettingsButton onClick={() => onRestartIntroduction?.()}>{t("Show")}</SettingsButton>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup header={t("How to use")}>
        <SettingsRow title={t("Open a PDF and click an equation or an exercise.")} plain>
          <kbd>{t("Click")}</kbd>
        </SettingsRow>
        <SettingsRow title={t("Hold ⌥ and click in any other app to explain what is under the pointer.")} plain>
          <kbd>Alt</kbd> + <kbd>{t("Click")}</kbd>
        </SettingsRow>
        <SettingsRow title={t("Press Esc to close everything.")} plain>
          <kbd>Esc</kbd>
        </SettingsRow>
      </SettingsGroup>
    </SettingsPage>
  );
}
