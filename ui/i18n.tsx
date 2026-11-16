import { createContext, useContext, useMemo, type ReactNode } from "react";
import { resolveLanguage, translatorFor, type Language, type Translator } from "@core/i18n";
import { platforms, type PlatformName, type PlatformTraits } from "@core/platform";

interface Localization {
  language: Language;
  platform: PlatformName;
  t: Translator;
}

const LocalizationContext = createContext<Localization>({
  language: "en",
  platform: "windows",
  t: translatorFor("en", "windows"),
});

/** The language the system is set to, unless the student picked one in Settings › General. */
export function systemLanguage(stored?: string | null): Language {
  return resolveLanguage(navigator.languages?.length ? navigator.languages : [navigator.language], stored);
}

export function LocalizationProvider({
  language,
  platform,
  children,
}: {
  language: Language;
  platform: PlatformName;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ language, platform, t: translatorFor(language, platform) }), [language, platform]);
  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

/** Every visible string goes through this (CLAUDE.md, rule 10). */
export function useT(): Translator {
  return useContext(LocalizationContext).t;
}

export function useLanguage(): Language {
  return useContext(LocalizationContext).language;
}

/** What differs between operating systems (shortcut names, device names): never test for an OS in a view. */
export function usePlatform(): PlatformTraits {
  return platforms[useContext(LocalizationContext).platform];
}

/** The platform's name, for core functions that take it (the onboarding path, its clips). */
export function usePlatformName(): PlatformName {
  return useContext(LocalizationContext).platform;
}
