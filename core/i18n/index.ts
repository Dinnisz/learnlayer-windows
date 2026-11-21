// The tables the app reads. The Mac String Catalog (generated, same keys) is the base. In front of it
// sits the wording of the platform the app runs on:
//   `windows/<language>.json`        rewords, on Windows, the catalog strings that name the Mac, ⌥, the Keychain or
//                                    the notch;
//   `macos/<language>.json`          rewords, on a Mac, the added strings written for Windows (Ctrl + Win, Alt,
//                                    «Start with Windows»);
//   `shared/<language>.json`         fixes to catalog strings on both (plural forms the catalog lacks);
//   `windows/added.<language>.json`  strings the Swift app never had (subjects, credits, the study menu): both
//                                    platforms read them, so the Mac build isn't left with English keys.

import type { PlatformName } from "../platform";
import { makeTranslator, type Language, type LocaleTable, type Translator } from "./format";
import en from "./locales/en.json";
import pt from "./locales/pt-PT.json";
import macosEn from "./macos/en.json";
import macosPt from "./macos/pt-PT.json";
import sharedEn from "./shared/en.json";
import sharedPt from "./shared/pt-PT.json";
import addedEn from "./windows/added.en.json";
import addedPt from "./windows/added.pt-PT.json";
import windowsEn from "./windows/en.json";
import windowsPt from "./windows/pt-PT.json";

export * from "./format";

type Tables = Record<Language, LocaleTable>;

export const catalog: Tables = { en: en as LocaleTable, "pt-PT": pt as LocaleTable };

/** Strings the Swift app never had, read on both platforms. */
export const additions: Tables = { en: addedEn, "pt-PT": addedPt };

/** Catalog fixes read on both platforms. */
export const sharedWording: Tables = { en: sharedEn as LocaleTable, "pt-PT": sharedPt as LocaleTable };

/** Strings reworded for a platform: catalog strings on Windows, added ones on a Mac. */
export const platformWording: Record<PlatformName, Tables> = {
  windows: { en: windowsEn, "pt-PT": windowsPt },
  macos: { en: macosEn, "pt-PT": macosPt },
};

/** Platform wording first, then the shared fixes, the additions and the catalog in the chosen language, then English. */
export function translatorFor(language: Language, platform: PlatformName): Translator {
  const wording = platformWording[platform];
  return makeTranslator(
    language,
    wording[language],
    sharedWording[language],
    additions[language],
    catalog[language],
    wording.en,
    sharedWording.en,
    additions.en,
    catalog.en,
  );
}
