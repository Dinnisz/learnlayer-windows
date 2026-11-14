// Port of LearnLayer/Account/SignInView.swift and the ConsentSheet of Account/AccountDataViews.swift
// @ ref 2026-11-04

import { useState } from "react";
import { sitePage } from "@core/ai/aiGateway";
import { useAccount } from "../../../account/accountStore";
import { Mascot } from "../../../components/Mascot";
import { SettingsButton } from "../../../components/settings/SettingsKit";
import { Sheet } from "../../../components/Sheet";
import { useT } from "../../../i18n";
import { appConfig, openExternal } from "../../../native";

/** Email code sign-in, in the same dark card as the introduction. */
export function SignInSheet() {
  const t = useT();
  const { state, model } = useAccount();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const close = () => {
    model?.presentSignIn(false);
    setSent(false);
    setCode("");
    setMessage(null);
  };

  const send = async () => {
    const address = email.trim();
    if (!model || !address.includes("@")) return;
    setBusy(true);
    setMessage(null);
    const failure = await model.startEmailCode(address);
    if (failure) setMessage(t(failure));
    else setSent(true);
    setBusy(false);
  };

  const verify = async () => {
    if (!model) return;
    setBusy(true);
    setMessage(null);
    const failure = await model.verifyEmailCode(email, code);
    setBusy(false);
    if (failure) setMessage(t(failure));
    else close();
  };

  return (
    <Sheet open={state.isPresentingSignIn} onClose={close} dark width={460} label={t("Sign in")}>
      <form
        className="signin"
        onSubmit={(event) => {
          event.preventDefault();
          void (sent ? verify() : send());
        }}
      >
        <Mascot size={84} />
        <h2>{sent ? t("Enter the code") : t("Sign in")}</h2>
        <p>
          {sent
            ? t("We sent a 6-digit code to %@.", email.trim())
            : t("Sign in with your email. We’ll send a short code.")}
        </p>
        {sent ? (
          <>
            <input
              className="signin-field"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              placeholder="123456"
              aria-label={t("Email code")}
              disabled={busy}
              autoFocus
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            />
            <button type="submit" className="signin-action" disabled={code.length !== 6 || busy}>
              {t("Sign in")}
            </button>
            <button type="button" className="signin-link" disabled={busy} onClick={() => void send()}>
              {t("Resend code")}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="signin-action"
              onClick={() => {
                void model?.beginBrowserSignIn();
                close();
              }}
            >
              {t("Sign in or create an account")}
            </button>
            <input
              className="signin-field"
              type="email"
              autoComplete="email"
              value={email}
              placeholder="you@school.pt"
              aria-label={t("Your email")}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button type="submit" className="signin-action" disabled={!email.includes("@") || busy}>
              {t("Send code")}
            </button>
          </>
        )}
        {message ? <p className="signin-message">{message}</p> : null}
      </form>
    </Sheet>
  );
}

/** Shown when the server has newer terms than this account accepted. It can't be dismissed. */
export function ConsentSheet() {
  const t = useT();
  const { state, model } = useAccount();
  const [busy, setBusy] = useState(false);

  const openPage = async (path: string) => {
    const config = await appConfig();
    await openExternal(sitePage(path, {}, { LEARNLAYER_SITE_BASE: config.siteBase }));
  };

  return (
    <Sheet
      open={state.pendingConsent !== null && !state.isPresentingSignIn}
      width={440}
      label={t("Before you continue")}
    >
      <div className="sheet-body">
        <h2>{t("Before you continue")}</h2>
        <p>{t("To use your LearnLayer account, accept the Terms of Use and the Privacy Policy.")}</p>
        <div className="sheet-links">
          <button type="button" onClick={() => void openPage("/termos")}>
            {t("Read the Terms of Use")}
          </button>
          <button type="button" onClick={() => void openPage("/privacidade")}>
            {t("Read the Privacy Policy")}
          </button>
        </div>
        <div className="sheet-actions">
          <SettingsButton onClick={() => void model?.declineConsent()}>{t("Sign out")}</SettingsButton>
          <SettingsButton
            kind="prominent"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await model?.acceptConsent();
              setBusy(false);
            }}
          >
            {t("Accept and continue")}
          </SettingsButton>
        </div>
      </div>
    </Sheet>
  );
}
