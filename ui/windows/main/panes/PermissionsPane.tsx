// Settings › Permissions on Windows (the Mac's PermissionsSettingsTab asks for Accessibility, Input Monitoring and
// Screen Recording; Windows needs none of these): the microphone, and the state of the Alt-click hook and of reading
// other apps (CLAUDE.md 3.6).

import { useEffect, useState } from "react";
import { SettingsButton, SettingsGroup, SettingsPage, SettingsRow } from "../../../components/settings/SettingsKit";
import { useT } from "../../../i18n";
import { anywhereEnabled, onAnywhereHookRemoved, openMicrophoneSettings } from "../../../native";

type MicrophoneState = "granted" | "denied" | "prompt" | "unknown";

export function PermissionsPane() {
  const t = useT();
  const [microphone, setMicrophone] = useState<MicrophoneState>("unknown");
  const [hookRemoved, setHookRemoved] = useState(false);
  useEffect(() => {
    let stop = () => {};
    void navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((status) => {
        setMicrophone(status.state);
        status.onchange = () => setMicrophone(status.state);
      })
      .catch(() => setMicrophone("unknown"));
    void onAnywhereHookRemoved(() => setHookRemoved(true)).then((unlisten) => (stop = unlisten));
    return () => stop();
  }, []);
  const hook = !anywhereEnabled()
    ? t("Off")
    : hookRemoved
      ? t("Windows removed it; LearnLayer puts it back by itself.")
      : t("Running");

  return (
    <SettingsPage title={t("Permissions")} subtitle="">
      <SettingsGroup>
        <SettingsRow
          title={t("Microphone")}
          detail={t(
            "Windows asks the first time you hold the talk key. If you said no, allow it in Settings › Privacy & security › Microphone.",
          )}
          symbol="mic"
        >
          {microphone === "granted" ? (
            <span className="settings-row-detail">{t("Running")}</span>
          ) : (
            <SettingsButton onClick={() => void openMicrophoneSettings()}>
              {t("Open microphone settings")}
            </SettingsButton>
          )}
        </SettingsRow>
        <SettingsRow title={t("The Alt-click hook")} detail={hook} symbol="cursorarrow.click.2" />
        <SettingsRow
          title={t("Reading other apps")}
          detail={t(
            "Text is read through Windows UI Automation; never from password fields, secure exam browsers or banking apps.",
          )}
          symbol="text.viewfinder"
        />
      </SettingsGroup>
    </SettingsPage>
  );
}
