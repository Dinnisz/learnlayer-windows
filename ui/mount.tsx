import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { LocalizationProvider, systemLanguage } from "./i18n";
import { appConfig } from "./native";

/** Settings › General › Language, when the student picked one. */
function storedLanguage(): string | null {
  try {
    return localStorage.getItem("appLanguage");
  } catch {
    return null;
  }
}

/** Every window starts the same way: ask the native side which platform this is, then draw. */
export async function mount(content: ReactNode): Promise<void> {
  // Settings › General › Language, else the system's (the new one shows after a restart, as on the Mac).
  const language = systemLanguage(storedLanguage());
  document.documentElement.lang = language;
  const { platform } = await appConfig();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <LocalizationProvider language={language} platform={platform}>
        {content}
      </LocalizationProvider>
    </StrictMode>,
  );
}
