import type { LikelySubtags, ParentLocales } from './types.js'

/** A parsed Unicode locale identifier (language/script/region subset). */
export interface LocaleId {
  language: string
  script?: string
  region?: string
}

/** Parses a locale tag, accepting `-` or `_` separators. Variants are ignored. */
export function parseLocale (tag: string): LocaleId {
  const separated = tag.replace(/_/g, '-')
  let canonical = separated
  if (separated.toLowerCase() === 'root') {
    canonical = 'und'
  } else {
    try {
      canonical = Intl.getCanonicalLocales(separated)[0] as string
    } catch {
      // Preserve the existing forgiving parser behavior for malformed input.
    }
  }
  const sub = canonical.split('-').filter(Boolean)
  const result: LocaleId = { language: 'und' }
  let i = 0
  const first = sub[0]
  if (first !== undefined && /^[a-zA-Z]{2,3}$/.test(first)) {
    result.language = first.toLowerCase()
    i = 1
  }
  const second = sub[i]
  if (second !== undefined && /^[a-zA-Z]{4}$/.test(second)) {
    result.script = titleCaseScript(second)
    i++
  }
  const third = sub[i]
  if (third !== undefined && (/^[a-zA-Z]{2}$/.test(third) || /^[0-9]{3}$/.test(third))) {
    result.region = third.toUpperCase()
  }
  return result
}

function titleCaseScript (s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/** Renders a LocaleId as a hyphen-separated tag. */
export function localeToString (loc: LocaleId): string {
  let result = loc.language
  if (loc.script !== undefined) result += '-' + loc.script
  if (loc.region !== undefined) result += '-' + loc.region
  return result
}

/**
 * Implements "Add Likely Subtags" (UTS #35 Part 1) closely enough for
 * person-name formatting: fills in any missing language/script/region.
 */
export function addLikelySubtags (loc: LocaleId, likely: LikelySubtags): LocaleId {
  if (loc.language !== 'und' && loc.script !== undefined && loc.region !== undefined) {
    return loc
  }
  const { language, script, region } = loc
  for (const candidate of likelySubtagCandidates(loc)) {
    const match = likely[candidate]
    if (match !== undefined) {
      const max = parseLocale(match)
      const result: LocaleId = {
        language: language !== 'und' ? language : max.language
      }
      const resultScript = script ?? max.script
      const resultRegion = region ?? max.region
      if (resultScript !== undefined) result.script = resultScript
      if (resultRegion !== undefined) result.region = resultRegion
      return result
    }
  }
  return loc
}

/** Returns the CLDR likely-subtag lookup sequence for a parsed locale. */
export function likelySubtagCandidates (loc: LocaleId): string[] {
  const { language, script, region } = loc
  const parts: Array<Array<string | undefined>> = [
    [language, script, region],
    [language, region],
    [language, script],
    [language],
    ['und', script, region],
    ['und', script],
    ['und', region],
    ['und']
  ]
  const result: string[] = []
  for (const candidateParts of parts) {
    const candidate = candidateParts.filter((part) => part !== undefined).join('-')
    if (!result.includes(candidate)) result.push(candidate)
  }
  return result
}

/** Returns the likely (default) script for a locale, or undefined. */
export function likelyScript (loc: LocaleId, likely: LikelySubtags): string | undefined {
  const stripped: LocaleId = { language: loc.language }
  if (loc.region !== undefined) stripped.region = loc.region
  return addLikelySubtags(stripped, likely).script
}

/**
 * Builds the locale fallback sequence used by LDML name-order derivation,
 * including explicit parent locales and the `nonlikelyScript` parent rule.
 */
export function nameOrderLocaleChain (
  loc: LocaleId,
  likely: LikelySubtags,
  parentLocales: ParentLocales
): string[] {
  const { language, script, region } = loc
  const candidates: string[] = []
  if (script !== undefined && region !== undefined) {
    candidates.push(localeToString({ language, script, region }))
  }
  if (script !== undefined) candidates.push(localeToString({ language, script }))
  if (region !== undefined) candidates.push(localeToString({ language, region }))
  if (language !== 'und') candidates.push(language)

  const result: string[] = []
  for (const candidate of candidates) {
    result.push(candidate)
    const parent = specialParent(candidate, likely, parentLocales)
    if (parent !== undefined) {
      const candidateLocale = parseLocale(candidate)
      // ICU's name-order lookup retains the base language when a script
      // locale inherits directly from root. Resource inheritance must not mix
      // scripts, but field order is a property of the name's language: for
      // example, ja-Latn still uses Japanese surname-first order.
      const orderParent = parent === 'und' && candidateLocale.script !== undefined &&
        candidateLocale.language !== 'und'
        ? candidateLocale.language
        : parent
      appendParentChain(result, orderParent, likely, parentLocales)
      return result
    }
  }
  result.push('und')
  return result
}

function appendParentChain (
  result: string[],
  first: string,
  likely: LikelySubtags,
  parentLocales: ParentLocales
): void {
  let current = first
  while (current !== 'und') {
    result.push(current)
    current = specialParent(current, likely, parentLocales) ?? defaultParent(current)
  }
  result.push('und')
}

function specialParent (
  locale: string,
  likely: LikelySubtags,
  parentLocales: ParentLocales
): string | undefined {
  const explicit = parentLocales.parents[locale]
  if (explicit !== undefined) return explicit
  const loc = parseLocale(locale)
  if (loc.script !== undefined && parentLocales.nonlikelyScriptParent !== undefined &&
      loc.script !== likelyScript(loc, likely)) {
    return parentLocales.nonlikelyScriptParent
  }
  return undefined
}

function defaultParent (locale: string): string {
  const loc = parseLocale(locale)
  if (loc.region !== undefined) {
    const parent: LocaleId = { language: loc.language }
    if (loc.script !== undefined) parent.script = loc.script
    return localeToString(parent)
  }
  if (loc.script !== undefined) return loc.language
  return 'und'
}
