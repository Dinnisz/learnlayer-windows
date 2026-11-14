// Converts an Xcode String Catalog (`Localizable.xcstrings`) into one flat JSON table per language,
// keeping the catalog's keys exactly as they are (CLAUDE.md, rule 10).
//
// A value in the output is one of:
//   "text"                                          a plain string (may hold %@, %lld, %1$@ …)
//   { "plural": { "one": "…", "other": "…" } }      chosen by the first integer argument
//   { "value": "%#@exams@ · %#@exercises@",         named substitutions, each chosen by its own argument
//     "substitutions": { "exams": { "argNum": 1, "plural": { "one": "%arg exam", "other": "%arg exams" } } } }

/** @param {any} unit */
function pluralForms(unit) {
  const plural = unit?.variations?.plural;
  if (!plural) return null;
  /** @type {Record<string, string>} */
  const forms = {};
  for (const [category, form] of Object.entries(plural)) {
    const value = /** @type {any} */ (form)?.stringUnit?.value;
    if (typeof value !== "string") throw new Error(`plural form "${category}" has no value`);
    forms[category] = value;
  }
  if (!("other" in forms)) throw new Error('plural has no "other" form');
  return forms;
}

/**
 * One language of one entry, or `undefined` when the catalog has nothing for it.
 * @param {any} localization
 */
export function convertLocalization(localization) {
  if (!localization) return undefined;
  const known = new Set(["stringUnit", "variations", "substitutions"]);
  for (const field of Object.keys(localization)) {
    if (!known.has(field)) throw new Error(`unsupported localization field "${field}"`);
  }
  if (localization.variations) {
    const kinds = Object.keys(localization.variations);
    if (kinds.length !== 1 || kinds[0] !== "plural") {
      throw new Error(`unsupported variations: ${kinds.join(", ")}`);
    }
    return { plural: pluralForms(localization) };
  }
  const value = localization.stringUnit?.value;
  if (typeof value !== "string") throw new Error("localization has no value");
  if (!localization.substitutions) return value;
  /** @type {Record<string, { argNum: number, plural: Record<string, string> }>} */
  const substitutions = {};
  for (const [name, substitution] of Object.entries(localization.substitutions)) {
    const s = /** @type {any} */ (substitution);
    const forms = pluralForms(s);
    if (!forms) throw new Error(`substitution "${name}" has no plural forms`);
    substitutions[name] = { argNum: Number(s.argNum ?? 1), plural: forms };
  }
  return { value, substitutions };
}

/**
 * @param {{ sourceLanguage: string, strings: Record<string, any> }} catalog
 * @param {string[]} languages
 * @returns {{ tables: Record<string, Record<string, unknown>>, untranslated: Record<string, string[]> }}
 */
export function convertCatalog(catalog, languages) {
  const source = catalog.sourceLanguage;
  /** @type {Record<string, Record<string, unknown>>} */
  const tables = {};
  /** @type {Record<string, string[]>} */
  const untranslated = {};
  for (const language of languages) {
    tables[language] = {};
    untranslated[language] = [];
  }
  for (const key of Object.keys(catalog.strings)) {
    const entry = catalog.strings[key] ?? {};
    for (const language of languages) {
      let converted;
      try {
        converted = convertLocalization(entry.localizations?.[language]);
      } catch (error) {
        throw new Error(`"${key}" (${language}): ${/** @type {Error} */ (error).message}`, { cause: error });
      }
      if (converted === undefined) {
        // The source language shows its key; another language falls back to the key too, and is reported.
        converted = key;
        if (language !== source && key !== "" && entry.shouldTranslate !== false) untranslated[language].push(key);
      }
      tables[language][key] = converted;
    }
  }
  return { tables, untranslated };
}
