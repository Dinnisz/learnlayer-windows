import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { LocalizationProvider, systemLanguage } from "./i18n";
import { appConfig } from "./native";

/** Every window starts the same way: ask the native side which platform this is, then draw. */
export async function mount(content: ReactNode): Promise<void> {
  const language = systemLanguage();
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
