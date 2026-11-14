// The tables the app reads. The Mac String Catalog (generated, same keys) is the base. In front of it
// sits the wording of the platform the app runs on:
//   `windows/<language>.json`        rewords the catalog strings that name the Mac, ⌥, the Keychain or the notch;
//   `windows/added.<language>.json`  holds strings only Windows needs.
// The Mac needs neither: the catalog already is its wording.

import type { PlatformName } from "../platform";
import { makeTranslator, type Language, type LocaleTable, type Translator } from "./format";
import en from "./locales/en.json";
import pt from "./locales/pt-PT.json";
import addedEn from "./windows/added.en.json";
import addedPt from "./windows/added.pt-PT.json";
import windowsEn from "./windows/en.json";
import windowsPt from "./windows/pt-PT.json";

export * from "./format";

type Tables = Record<Language, LocaleTable>;

export const catalog: Tables = { en: en as LocaleTable, "pt-PT": pt as LocaleTable };

const none: Tables = { en: {}, "pt-PT": {} };

/** Catalog strings reworded for a platform. */
export const platformWording: Record<PlatformName, Tables> = {
  windows: { en: windowsEn, "pt-PT": windowsPt },
  macos: none,
};

/** Strings that exist only on a platform. */
export const platformAdditions: Record<PlatformName, Tables> = {
  windows: { en: addedEn, "pt-PT": addedPt },
  macos: none,
};

/** Platform wording first, then the catalog in the chosen language, then English, then the key itself. */
export function translatorFor(language: Language, platform: PlatformName): Translator {
  const wording = platformWording[platform];
  const additions = platformAdditions[platform];
  return makeTranslator(
    language,
    wording[language],
    additions[language],
    catalog[language],
    wording.en,
    additions.en,
    catalog.en,
  );
}
