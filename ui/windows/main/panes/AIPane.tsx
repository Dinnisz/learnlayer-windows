// Port of LearnLayer/Settings/AIUsageSettingsTab.swift @ ref 2026-11-04, as the sold app shows it: what the server
// counted today and this month for the plan. The model is the server's choice (CLAUDE.md 5.3); the developer key and
// model fields are for evaluation builds and stay in the Credential Manager. The talk key is in General on Windows.

import { useEffect } from "react";
import { useAccount } from "../../../account/accountStore";
import {
  SettingsGroup,
  SettingsPage,
  SettingsProgressBar,
  SettingsRow,
} from "../../../components/settings/SettingsKit";
import { useT } from "../../../i18n";

export function AIPane() {
  const t = useT();
  const { state, model } = useAccount();
  useEffect(() => {
    void model?.refresh();
  }, [model]);
  const usage = state.snapshot?.usage;
  return (
    <SettingsPage title={t("AI & Usage")} subtitle={t("The key, the voice and what the month has cost.")}>
      <SettingsGroup header={t("Your plan")}>
        {usage ? (
          <>
            <SettingsRow title={t("Requests today")}>
              <span className="settings-row-detail">{`${usage.dailyRequests} / ${usage.dailyLimit}`}</span>
            </SettingsRow>
            <SettingsProgressBar fraction={usage.dailyLimit === 0 ? 0 : usage.dailyRequests / usage.dailyLimit} />
            <SettingsRow title={t("Requests this month")}>
              <span className="settings-row-detail">{`${usage.monthlyRequests} / ${usage.monthlyLimit}`}</span>
            </SettingsRow>
            <SettingsProgressBar fraction={usage.monthlyLimit === 0 ? 0 : usage.monthlyRequests / usage.monthlyLimit} />
          </>
        ) : (
          <SettingsRow title={t("Sign in or create an account")} plain />
        )}
      </SettingsGroup>
      <SettingsGroup header={t("Voice")}>
        <SettingsRow
          title={t("Explanations read by the premium voice. They are not part of your explanation count.")}
          plain
        />
      </SettingsGroup>
    </SettingsPage>
  );
}
