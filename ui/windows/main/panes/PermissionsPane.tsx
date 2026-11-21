// Settings › Permissions. On Windows (CLAUDE.md 3.6): the microphone, and the state of the Alt-click hook and of
// reading other apps; Windows asks for nothing else. On a Mac, as the Swift app's PermissionsSettingsTab: Accessibility
// (⌥-click, the talk key), Screen Recording (the window picture) and the microphone, each with its state and a way to
// allow it, read again while the page is open (Mac report M4).

import { useEffect, useState } from "react";
import { SettingsButton, SettingsGroup, SettingsPage, SettingsRow } from "../../../components/settings/SettingsKit";
import { usePlatformName, useT } from "../../../i18n";
import {
  anywhereEnabled,
  onAnywhereHookRemoved,
  openMicrophoneSettings,
  requestPermission,
  systemPermissions,
  type SystemPermissions,
} from "../../../native";

type MicrophoneState = "granted" | "denied" | "prompt" | "unknown";

function useMicrophone(): MicrophoneState {
  const [microphone, setMicrophone] = useState<MicrophoneState>("unknown");
  useEffect(() => {
    void navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((status) => {
        setMicrophone(status.state);
        status.onchange = () => setMicrophone(status.state);
      })
      .catch(() => setMicrophone("unknown"));
  }, []);
  return microphone;
}

export function PermissionsPane() {
  return usePlatformName() === "macos" ? <MacPermissions /> : <WindowsPermissions />;
}

function WindowsPermissions() {
  const t = useT();
  const microphone = useMicrophone();
  const [hookRemoved, setHookRemoved] = useState(false);
  useEffect(() => {
    let stop = () => {};
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

/** The system's own microphone request (macOS shows it once); when it was refused, its page in System Settings. */
async function askMicrophone(): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    await openMicrophoneSettings();
  }
}

/** The Swift app's `PermissionMonitor` polls while the tab is visible; so does this page. */
function useSystemPermissions(): SystemPermissions | null {
  const [state, setState] = useState<SystemPermissions | null>(null);
  useEffect(() => {
    let live = true;
    const read = () => void systemPermissions().then((found) => live && setState(found));
    read();
    const timer = window.setInterval(read, 1500);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);
  return state;
}

function MacPermissions() {
  const t = useT();
  const system = useSystemPermissions();
  const microphone = useMicrophone();
  const row = (
    title: string,
    purpose: string,
    symbol: string,
    granted: boolean | null,
    allow: () => void,
    asksFirst: boolean,
  ) => (
    <SettingsRow title={t(title)} detail={t(purpose)} symbol={symbol}>
      <span className={`settings-row-detail${granted ? " accent" : ""}`}>
        {granted === null ? "" : granted ? t("Allowed") : asksFirst ? t("Not asked yet") : t("Not allowed")}
      </span>
      {granted === false && (
        <SettingsButton onClick={allow}>{asksFirst ? t("Allow…") : t("Open System Settings")}</SettingsButton>
      )}
    </SettingsRow>
  );
  return (
    <SettingsPage
      title={t("Permissions")}
      subtitle={t("What macOS has to allow for ⌥-click, screen capture and talking.")}
    >
      <SettingsGroup>
        {row(
          "Accessibility",
          "Lets ⌥-click read the question under the pointer in other apps.",
          "cursorarrow.click.2",
          system?.accessibility ?? null,
          () => void requestPermission("accessibility"),
          false,
        )}
        {row(
          "Screen Recording",
          "Lets “Capture an area” see the part of the screen you choose.",
          "text.viewfinder",
          system?.screenRecording ?? null,
          () => void requestPermission("screenRecording"),
          false,
        )}
        {row(
          "Microphone",
          "Lets you talk to the tutor instead of typing.",
          "mic",
          microphone === "granted",
          microphone === "denied" ? () => void openMicrophoneSettings() : () => void askMicrophone(),
          microphone !== "denied",
        )}
        <SettingsRow title={t("After you allow one, restart LearnLayer so macOS applies it.")} />
      </SettingsGroup>
    </SettingsPage>
  );
}
