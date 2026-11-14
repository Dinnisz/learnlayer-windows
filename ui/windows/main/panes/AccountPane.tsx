// Port of LearnLayer/Home/AccountPane.swift and Account/AccountDataViews.swift @ ref 2026-11-04

import { useEffect, useState } from "react";
import type { HomeRoute } from "@core/account/homeRoute";
import type { RemoteDevice } from "@core/ai/backendClient";
import { useAccount } from "../../../account/accountStore";
import { Icon } from "../../../components/Icon";
import {
  SettingsBadge,
  SettingsButton,
  SettingsGroup,
  SettingsPage,
  SettingsRow,
} from "../../../components/settings/SettingsKit";
import { Sheet } from "../../../components/Sheet";
import { useLanguage, usePlatform, useT } from "../../../i18n";
import { saveTextFile } from "../../../native";

/** Account: sign-in against the LearnLayer API, plus the data that stays on this computer. */
export function AccountPane({ onNavigate }: { onNavigate: (route: HomeRoute) => void }) {
  const t = useT();
  const { state, model } = useAccount();

  useEffect(() => {
    void model?.refresh();
  }, [model]);

  return (
    <SettingsPage title={t("Account")} subtitle={t("Who is using LearnLayer on this Mac.")}>
      <SettingsGroup header={t("Profile")}>
        <div className="account-profile">
          <span className="account-avatar">
            <Icon symbol="person.fill" size={20} />
          </span>
          <div className="settings-row-text">
            <strong>{t("This Mac")}</strong>
            <span className="settings-row-detail">{t("Everything you study stays on this Mac.")}</span>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup header={t("Sign in")} footer={t("Signing in will keep your plan and your topics on every Mac.")}>
        <SignInRow />
      </SettingsGroup>

      {state.isSignedIn ? <AccountDevicesGroup /> : null}
      {state.isSignedIn ? <AccountDataGroup /> : null}

      <SettingsGroup header={t("Your data")}>
        <SettingsRow
          title={t("Delete local data")}
          detail={t("Remove what LearnLayer saved on this Mac.")}
          symbol="trash"
        >
          <SettingsButton onClick={() => onNavigate("data")}>{t("Open Data & Privacy")}</SettingsButton>
        </SettingsRow>
      </SettingsGroup>
    </SettingsPage>
  );
}

/** The signed-in / not-signed-in row, shared by Account and Plan & usage. */
export function SignInRow() {
  const t = useT();
  const { state, model } = useAccount();
  if (state.isSignedIn) {
    return (
      <SettingsRow title={t("Signed in")} detail={state.email || null} symbol="person.crop.circle">
        <SettingsButton onClick={() => model?.openAccountSite()}>{t("Manage subscription")}</SettingsButton>
        <SettingsButton onClick={() => void model?.signOut()}>{t("Sign out")}</SettingsButton>
      </SettingsRow>
    );
  }
  return (
    <SettingsRow
      title={t("Not signed in")}
      detail={t("Sign in to keep your plan on every Mac.")}
      symbol="person.crop.circle"
    >
      <SettingsButton onClick={() => void model?.beginBrowserSignIn()}>
        {t("Sign in or create an account")}
      </SettingsButton>
      <SettingsButton onClick={() => model?.presentSignIn(true)}>{t("Use an email code")}</SettingsButton>
    </SettingsRow>
  );
}

function AccountDevicesGroup() {
  const t = useT();
  const language = useLanguage();
  const { unnamedDevice } = usePlatform();
  const { state, model } = useAccount();
  const [revoking, setRevoking] = useState<RemoteDevice | null>(null);

  useEffect(() => {
    void model?.loadDevices();
  }, [model]);

  const lastUsed = (device: RemoteDevice) =>
    t(
      "Last used %@",
      new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(device.lastSeenAt ?? device.createdAt),
    );

  return (
    <>
      <SettingsGroup
        header={t("Devices")}
        footer={t("Removing a device signs it out. Its memory key stops working there.")}
      >
        {state.devices.length === 0 ? (
          <SettingsRow title={t("No devices to show yet.")} symbol="laptopcomputer" plain />
        ) : null}
        {state.devices.map((device) => (
          <SettingsRow
            key={device.id}
            title={device.name || unnamedDevice}
            detail={lastUsed(device)}
            symbol="laptopcomputer"
          >
            {device.current ? (
              <SettingsBadge>{t("This Mac")}</SettingsBadge>
            ) : (
              <SettingsButton kind="destructive" onClick={() => setRevoking(device)}>
                {t("Remove")}
              </SettingsButton>
            )}
          </SettingsRow>
        ))}
      </SettingsGroup>
      <Sheet open={revoking !== null} onClose={() => setRevoking(null)} width={380} label={t("Remove this device?")}>
        <div className="sheet-body">
          <h2>{t("Remove this device?")}</h2>
          <p>{t("%@ will be signed out.", revoking?.name ?? "")}</p>
          <div className="sheet-actions">
            <SettingsButton onClick={() => setRevoking(null)}>{t("Cancel")}</SettingsButton>
            <SettingsButton
              kind="destructive"
              onClick={() => {
                if (revoking) void model?.revoke(revoking);
                setRevoking(null);
              }}
            >
              {t("Remove")}
            </SettingsButton>
          </div>
        </div>
      </Sheet>
    </>
  );
}

function AccountDataGroup() {
  const t = useT();
  const { model } = useAccount();
  const [isDeleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const exportData = async () => {
    setMessage(null);
    const data = await model?.exportData();
    if (!data) {
      setMessage(t("Couldn’t reach LearnLayer. Try again."));
      return;
    }
    const saved = await saveTextFile("learnlayer-account.json", data).catch(() => null);
    if (saved === null) setMessage(t("Couldn’t save the file."));
  };

  return (
    <>
      <SettingsGroup header={t("Account data")} footer={message}>
        <SettingsRow
          title={t("Download my data")}
          detail={t("A JSON file with what the server keeps about your account.")}
          symbol="square.and.arrow.down"
        >
          <SettingsButton onClick={() => void exportData()}>{t("Download…")}</SettingsButton>
        </SettingsRow>
        <SettingsRow
          title={t("Delete account")}
          detail={t("Deletes your account and everything the server keeps about it.")}
          symbol="person.crop.circle.badge.xmark"
        >
          <SettingsButton kind="destructive" onClick={() => setDeleting(true)}>
            {t("Delete account…")}
          </SettingsButton>
        </SettingsRow>
      </SettingsGroup>
      <DeleteAccountSheet open={isDeleting} onClose={() => setDeleting(false)} />
    </>
  );
}

function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { model } = useAccount();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const remove = async () => {
    if (!model) return;
    setBusy(true);
    setMessage(null);
    const result = await model.deleteAccount(typed);
    setBusy(false);
    if (result === "deleted") onClose();
    else if (result === "wrongEmail") setMessage(t("That isn’t the email of this account."));
    else if (result === "billing")
      setMessage(t("We couldn’t cancel your subscription. Nothing was deleted. Try again."));
    else setMessage(t("Couldn’t reach LearnLayer. Try again."));
  };

  return (
    <Sheet open={open} onClose={onClose} width={420} label={t("Delete your account?")}>
      <div className="sheet-body">
        <h2>{t("Delete your account?")}</h2>
        <p>
          {t(
            "This deletes your account, your devices, your synced memory and your subscription on the server. What is on this Mac stays until you delete it in Data & Privacy. This can’t be undone.",
          )}
        </p>
        <input
          className="sheet-field"
          type="email"
          value={typed}
          placeholder={t("Type your email to confirm")}
          aria-label={t("Type your email to confirm")}
          onChange={(event) => setTyped(event.target.value)}
        />
        {message ? <p className="sheet-error">{message}</p> : null}
        <div className="sheet-actions">
          <SettingsButton onClick={onClose}>{t("Cancel")}</SettingsButton>
          <SettingsButton kind="destructive" disabled={busy || typed.trim() === ""} onClick={() => void remove()}>
            {t("Delete account")}
          </SettingsButton>
        </div>
      </div>
    </Sheet>
  );
}
