// The tables the Windows app reads: the Mac String Catalog (generated, same keys) behind a small table
// of Windows wording for the strings that name the Mac, ⌥, the Keychain or the notch.

import { makeTranslator, type Language, type LocaleTable, type Translator } from "./format";
import en from "./locales/en.json";
import pt from "./locales/pt-PT.json";
import windowsEn from "./windows/en.json";
import windowsPt from "./windows/pt-PT.json";

export * from "./format";

export const catalog: Record<Language, LocaleTable> = { en: en as LocaleTable, "pt-PT": pt as LocaleTable };
export const windowsWording: Record<Language, LocaleTable> = { en: windowsEn, "pt-PT": windowsPt };

/** Windows wording first, then the catalog in the chosen language, then English, then the key itself. */
export function translatorFor(language: Language): Translator {
  return makeTranslator(language, windowsWording[language], catalog[language], windowsWording.en, catalog.en);
}
