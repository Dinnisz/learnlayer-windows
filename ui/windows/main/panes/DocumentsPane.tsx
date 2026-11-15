// The Documents section until phase 7 brings the Mac's FoldersScreen (Brain/): a door to the PDF reader.

import { SettingsButton, SettingsGroup, SettingsPage, SettingsRow } from "../../../components/settings/SettingsKit";
import { useT } from "../../../i18n";
import { openReader } from "../../../native";

export function DocumentsPane() {
  const t = useT();
  return (
    <SettingsPage title={t("Documents")} subtitle={t("Open a PDF and click an equation or an exercise.")}>
      <SettingsGroup>
        <SettingsRow title={t("Open a PDF to get started")}>
          <SettingsButton kind="prominent" onClick={() => void openReader()}>
            {t("Open…")}
          </SettingsButton>
        </SettingsRow>
      </SettingsGroup>
    </SettingsPage>
  );
}
