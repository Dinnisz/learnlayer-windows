// Port of LearnLayer/Settings/PlanSettingsTab.swift @ ref 2026-11-04

import { useEffect } from "react";
import { PlanDefaults } from "@core/account/accountModel";
import { credits, nearestWindow } from "@core/ai/backendClient";
import { useAccount } from "../../../account/accountStore";
import {
  SettingsButton,
  SettingsGroup,
  SettingsPage,
  SettingsProgressBar,
  SettingsSurface,
} from "../../../components/settings/SettingsKit";
import { useLanguage, useT } from "../../../i18n";
import { SignInRow } from "./AccountPane";

/** The plan the server enforces. Upgrade opens the website checkout, which asks you to sign in there. */
export function PlanPane() {
  const t = useT();
  const language = useLanguage();
  const { state, model } = useAccount();

  useEffect(() => {
    void model?.refresh();
  }, [model]);

  const offer = (...ids: string[]) => state.plans.find((plan) => ids.includes(plan.id));
  const free = offer("free");
  const plus = offer("plus", "paid");
  const pro = offer("pro");
  // "free", "plus" or "pro". An older server's "paid" is Plus.
  const planID = state.snapshot?.plan.id ?? "free";
  const currentID = planID === "paid" ? "plus" : planID;

  const price = (cents: number) =>
    new Intl.NumberFormat(language, { style: "currency", currency: plus?.currency ?? "EUR" }).format(cents / 100);
  const perk = (count: number) => t("%lld credits a month.", count);

  // One bar: the credit window closest to full (PlanSettingsTab.swift `currentPlan`).
  const usage = state.snapshot?.usage;
  const nearest = usage ? nearestWindow(usage) : null;
  const used = nearest ? credits(nearest.used) : credits(usage?.monthlyCostUsdMicros ?? 0);
  const allowance = nearest ? credits(nearest.limit) : (free?.monthlyCreditLimit ?? PlanDefaults.freeMonthlyCredits);
  const monthlyCredits = usage?.monthly?.limitUsdMicros
    ? credits(usage.monthly.limitUsdMicros)
    : (free?.monthlyCreditLimit ?? PlanDefaults.freeMonthlyCredits);
  const usedLine =
    nearest?.name === "day"
      ? "%lld of %lld credits used today"
      : nearest?.name === "week"
        ? "%lld of %lld credits used this week"
        : "%lld of %lld credits used this month";
  const resetsAt = nearest?.resetsAt ?? usage?.resetsMonthlyAt;

  return (
    <SettingsPage title={t("Plan & usage")} subtitle={t("Your plan, what you’ve used and what’s next.")}>
      {state.banner ? <p className="plan-banner">{t(state.banner)}</p> : null}

      <SettingsGroup header={t("Your plan")}>
        <div className="plan-current">
          <div className="plan-current-head">
            <div className="settings-row-text">
              <strong className="plan-current-name">
                {currentID === "pro" ? t("Pro") : currentID === "plus" ? t("Plus") : t("Free")}
              </strong>
              <span className="settings-row-detail">{perk(monthlyCredits)}</span>
            </div>
            {currentID === "free" ? (
              <SettingsButton onClick={() => model?.upgradeMonthly()}>{t("Upgrade")}</SettingsButton>
            ) : null}
          </div>
          {state.isSignedIn ? (
            <div className="plan-usage">
              <div className="plan-usage-line">
                <span className="plan-usage-count">{t(usedLine, used, allowance)}</span>
                {resetsAt ? (
                  <span className="settings-row-detail">
                    {t(
                      "Resets %@",
                      new Intl.DateTimeFormat(language, {
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(resetsAt),
                    )}
                  </span>
                ) : null}
              </div>
              <SettingsProgressBar fraction={allowance === 0 ? 0 : used / allowance} />
            </div>
          ) : null}
        </div>
      </SettingsGroup>

      <section className="settings-group">
        <h2>{t("Plans")}</h2>
        <div className="plan-cards">
          <PlanCard
            name={t("Free")}
            price={price(free?.monthlyPriceCents ?? 0)}
            perk={perk(free?.monthlyCreditLimit ?? PlanDefaults.freeMonthlyCredits)}
            isCurrent={currentID === "free"}
          />
          <PlanCard
            name={t("Plus")}
            price={price(plus?.monthlyPriceCents ?? PlanDefaults.paidMonthlyCents)}
            period={t("/ month")}
            perk={perk(plus?.monthlyCreditLimit ?? PlanDefaults.paidMonthlyCredits)}
            isCurrent={currentID === "plus"}
            isProminent={currentID === "free"}
            onUpgrade={() => model?.upgrade("plus")}
          />
          <PlanCard
            name={t("Pro")}
            price={price(pro?.monthlyPriceCents ?? PlanDefaults.proMonthlyCents)}
            period={t("/ month")}
            perk={perk(pro?.monthlyCreditLimit ?? PlanDefaults.proMonthlyCredits)}
            isCurrent={currentID === "pro"}
            isProminent={currentID !== "pro"}
            // Plus to Pro is a plan change on the existing subscription, done in the Paddle portal.
            onUpgrade={() => (currentID === "plus" ? model?.openAccountSite() : model?.upgrade("pro"))}
          />
        </div>
      </section>

      <SettingsGroup header={t("Account")} footer={t("Billed by Paddle. Tax is included.")}>
        <SignInRow />
      </SettingsGroup>
    </SettingsPage>
  );
}

function PlanCard({
  name,
  price,
  period,
  perk,
  isCurrent = false,
  isProminent = false,
  onUpgrade,
}: {
  name: string;
  price: string;
  period?: string;
  perk: string;
  isCurrent?: boolean;
  isProminent?: boolean;
  onUpgrade?: () => void;
}) {
  const t = useT();
  return (
    <SettingsSurface highlighted={isCurrent}>
      <div className="plan-card">
        <strong className="plan-card-name">{name}</strong>
        <div className="plan-card-price">
          <span className={price.length > 8 ? "small" : undefined}>{price}</span>
          {period ? <span className="settings-row-detail">{period}</span> : null}
        </div>
        <p className="plan-card-perk">{perk}</p>
        {isCurrent ? (
          <SettingsButton fillsWidth disabled>
            {t("Current plan")}
          </SettingsButton>
        ) : isProminent ? (
          <SettingsButton kind="prominent" fillsWidth onClick={onUpgrade}>
            {t("Upgrade")}
          </SettingsButton>
        ) : (
          <div className="plan-card-spacer" />
        )}
      </div>
    </SettingsSurface>
  );
}
