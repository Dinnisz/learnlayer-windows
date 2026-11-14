import { createContext, useContext, useMemo, type ReactNode } from "react";
import { resolveLanguage, translatorFor, type Language, type Translator } from "@core/i18n";

interface Localization {
  language: Language;
  t: Translator;
}

const LocalizationContext = createContext<Localization>({ language: "en", t: translatorFor("en") });

/** The language Windows is set to, unless the student picked one in Settings › General. */
export function systemLanguage(stored?: string | null): Language {
  return resolveLanguage(navigator.languages?.length ? navigator.languages : [navigator.language], stored);
}

export function LocalizationProvider({ language, children }: { language: Language; children: ReactNode }) {
  const value = useMemo(() => ({ language, t: translatorFor(language) }), [language]);
  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

/** Every visible string goes through this (CLAUDE.md, rule 10). */
export function useT(): Translator {
  return useContext(LocalizationContext).t;
}

export function useLanguage(): Language {
  return useContext(LocalizationContext).language;
}
