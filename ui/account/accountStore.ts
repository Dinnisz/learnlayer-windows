import { useSyncExternalStore } from "react";
import { AccountModel, type AccountState } from "@core/account/accountModel";
import { BackendClient } from "@core/ai/backendClient";
import { deviceNameFor } from "@core/platform";
import { appConfig, nativeFetch, openExternal, preferences, session } from "../native";
import { demoFetch, demoSession, isDemo } from "./demo";

let shared: Promise<AccountModel> | null = null;

/** One account model per window, built once the native side has said where the API is. */
export function accountModel(): Promise<AccountModel> {
  shared ??= appConfig().then(
    (config) =>
      new AccountModel({
        client: new BackendClient(config.apiBase, isDemo ? demoFetch : nativeFetch),
        session: isDemo ? demoSession() : session,
        preferences,
        environment: { ...config.environment, LEARNLAYER_SITE_BASE: config.siteBase },
        open: (url) => void openExternal(url),
        deviceName: () => deviceNameFor(config.computerName, config.platform),
        // The account is gone: its memory-sync keys on this computer go too.
        forgetSyncKeys: (userID) =>
          void import("../memory/sync").then(({ memorySync }) => memorySync().then((sync) => sync.forget(userID))),
      }),
  );
  return shared;
}

const signedOut: AccountState = {
  snapshot: null,
  plans: [],
  isSignedIn: false,
  email: "",
  isPresentingSignIn: false,
  banner: null,
  pendingConsent: null,
  devices: [],
};

let loaded: AccountModel | null = null;
const waiting = new Set<() => void>();
void accountModel().then((model) => {
  loaded = model;
  model.subscribe(() => waiting.forEach((listener) => listener()));
  waiting.forEach((listener) => listener());
});

/** The account as the views read it; the model itself for the actions. */
export function useAccount(): { state: AccountState; model: AccountModel | null } {
  const state = useSyncExternalStore(
    (listener) => {
      waiting.add(listener);
      return () => waiting.delete(listener);
    },
    () => loaded?.getState() ?? signedOut,
  );
  return { state, model: loaded };
}
