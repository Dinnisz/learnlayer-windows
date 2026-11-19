// Port of LearnLayer/Settings/AIUsageSettingsTab.swift @ ref 2026-11-04, as the sold app shows it: what the server
// counted today, this week and this month for the plan, in credits ($0.01 of API cost each). The model is the server's choice (CLAUDE.md 5.3); the developer key and
// model fields are for evaluation builds and stay in the Credential Manager. The talk key is in General on Windows.

import { useEffect, useState } from "react";
import { voiceMeter } from "../../../voice/speaker";
import { useAccount } from "../../../account/accountStore";
import {
  SettingsGroup,
  SettingsPage,
  SettingsProgressBar,
  SettingsRow,
} from "../../../components/settings/SettingsKit";
import { useT } from "../../../i18n";
import { credits, type UsageWindow } from "@core/ai/backendClient";

/** One credit window ($0.01 of API cost per credit). A window the plan does not have (Free has no week) is left out. */
function creditRow(title: string, window: UsageWindow | undefined) {
  if (!window || window.limitUsdMicros == null || window.limitUsdMicros <= 0) return null;
  const used = credits(window.usedUsdMicros);
  const limit = credits(window.limitUsdMicros);
  return (
    <>
      <SettingsRow title={title}>
        <span className="settings-row-detail">{`${used} / ${limit}`}</span>
      </SettingsRow>
      <SettingsProgressBar fraction={Math.min(1, used / limit)} />
    </>
  );
}

export function AIPane() {
  const t = useT();
  const { state, model } = useAccount();
  useEffect(() => {
    void model?.refresh();
  }, [model]);
  const usage = state.snapshot?.usage;
  const [voiced] = useState(() => voiceMeter.voicedExplanations());
  return (
    <SettingsPage title={t("AI & Usage")} subtitle={t("The key, the voice and what the month has cost.")}>
      <SettingsGroup header={t("Your plan")}>
        {usage ? (
          <>
            {creditRow(t("Credits today"), usage.daily)}
            {creditRow(t("Credits this week"), usage.weekly)}
            {creditRow(t("Credits this month"), usage.monthly)}
          </>
        ) : (
          <SettingsRow title={t("Sign in or create an account")} plain />
        )}
      </SettingsGroup>
      <SettingsGroup header={t("Voice")}>
        <SettingsRow
          title={t("Voiced this month")}
          detail={t("Explanations read by the premium voice. They are not part of your explanation count.")}
        >
          <span className="settings-row-detail">{voiced}</span>
        </SettingsRow>
      </SettingsGroup>
    </SettingsPage>
  );
}
