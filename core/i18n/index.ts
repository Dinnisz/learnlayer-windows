// The tables the Windows app reads: the Mac String Catalog (generated, same keys) behind two small
// tables of Windows wording: `windows/<language>.json` rewords the catalog strings that name the Mac,
// ⌥, the Keychain or the notch; `windows/added.<language>.json` holds strings only Windows needs.

import { makeTranslator, type Language, type LocaleTable, type Translator } from "./format";
import en from "./locales/en.json";
import pt from "./locales/pt-PT.json";
import addedEn from "./windows/added.en.json";
import addedPt from "./windows/added.pt-PT.json";
import windowsEn from "./windows/en.json";
import windowsPt from "./windows/pt-PT.json";

export * from "./format";

export const catalog: Record<Language, LocaleTable> = { en: en as LocaleTable, "pt-PT": pt as LocaleTable };
export const windowsWording: Record<Language, LocaleTable> = { en: windowsEn, "pt-PT": windowsPt };
export const windowsAdditions: Record<Language, LocaleTable> = { en: addedEn, "pt-PT": addedPt };

/** Windows wording first, then the catalog in the chosen language, then English, then the key itself. */
export function translatorFor(language: Language): Translator {
  return makeTranslator(
    language,
    windowsWording[language],
    windowsAdditions[language],
    catalog[language],
    windowsWording.en,
    windowsAdditions.en,
    catalog.en,
  );
}
