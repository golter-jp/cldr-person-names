import {
  addLikelySubtags, likelyScript, likelySubtagCandidates,
  nameOrderLocaleChain, parseLocale, type LocaleId
} from './locale.js'
import type { LikelySubtags, ParentLocales } from './types.js'

/**
 * Extracts the likely-subtag mappings needed for the supplied formatting and
 * name locales, including script-based name-locale inference.
 */
export function extractLikelySubtags (
  full: LikelySubtags,
  locales: Iterable<string>,
  parentLocales: ParentLocales = { parents: {} }
): LikelySubtags {
  const parsedLocales = [...locales].map(parseLocale)
  const result: LikelySubtags = {}

  for (const locale of parsedLocales) {
    copyLookup(full, result, locale)

    const stripped: LocaleId = { language: locale.language }
    if (locale.region !== undefined) stripped.region = locale.region
    copyLookup(full, result, stripped)

    const script = locale.script ?? likelyScript(locale, full)
    if (script !== undefined) {
      const scriptLocale = { language: 'und', script }
      copyLookup(full, result, scriptLocale)
      const inferred = addLikelySubtags(scriptLocale, full)
      if (inferred.language !== 'und') {
        copyLookup(full, result, { language: inferred.language })
      }
    }

    // Explicit parents may introduce a language/script/region combination
    // whose likely script is needed by CLDR's nonlikelyScript parent rule.
    for (const tag of nameOrderLocaleChain(locale, full, parentLocales)) {
      const parent = parseLocale(tag)
      if (parent.script === undefined) continue
      const parentWithoutScript: LocaleId = { language: parent.language }
      if (parent.region !== undefined) parentWithoutScript.region = parent.region
      copyLookup(full, result, parentWithoutScript)
    }
  }
  return result
}

function copyLookup (full: LikelySubtags, result: LikelySubtags, locale: LocaleId): void {
  for (const candidate of likelySubtagCandidates(locale)) {
    const value = full[candidate]
    if (value !== undefined) {
      result[candidate] = value
      return
    }
  }
}
