// The one door to the native side. Outside Tauri (a plain browser during interface work, or a test)
// every call answers with a harmless default, so the interface still renders.

import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { productionBase, productionSite, type Environment } from "@core/ai/aiGateway";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface AppConfig {
  apiBase: string;
  siteBase: string;
  debug: boolean;
  version: string;
  environment: Environment;
}

const browserConfig: AppConfig = {
  apiBase: productionBase,
  siteBase: productionSite,
  debug: true,
  version: "0.0.0",
  environment: {},
};

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return tauriInvoke<T>(command, args);
}

export async function appConfig(): Promise<AppConfig> {
  return isTauri ? invoke<AppConfig>("app_config") : browserConfig;
}
