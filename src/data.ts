import type {
  LikelySubtags, ParentLocales, PersonNamesData, PatternOrder, Usage
} from './types.js'
import { parseLocale, localeToString, likelyScript, type LocaleId } from './locale.js'

/**
 * A source of person-name formatting data. Implement this to serve data from
 * somewhere other than {@link PersonNamesDataRegistry}.
 */
export interface PersonNamesDataProvider {
  /**
   * Returns resolved data for exactly `locale` — a normalized tag,
   * hyphen-separated and `'und'` for root — or `undefined` if there is none.
   * The formatter walks the fallback chain itself.
   */
  getData(locale: string): PersonNamesData | undefined
  /** Returns the likely-subtags map used to infer scripts and regions. */
  getLikelySubtags(): LikelySubtags
  /** Returns the parent-locale mappings used when deriving name order. */
  getParentLocales(): ParentLocales
}

/** A parsed cldr-json likely-subtags document, e.g. `cldr-core/supplemental/likelySubtags.json`. */
export interface CldrLikelySubtagsJson {
  supplemental: { likelySubtags: LikelySubtags }
}

/** A simple in-memory data registry, usable in any environment. */
export class PersonNamesDataRegistry implements PersonNamesDataProvider {
  private readonly data = new Map<string, PersonNamesData>()
  private likelySubtags: LikelySubtags = {}
  private parentLocales: ParentLocales = { parents: {} }

  /** Registers resolved data for one locale, replacing any already held. */
  addData (data: PersonNamesData): void {
    this.data.set(normalizeTag(data.locale), data)
  }

  /** Registers locale data from a cldr-json personNames document. */
  addCldrJson (json: unknown): void {
    for (const data of convertCldrJson(json)) this.addData(data)
  }

  /** Registers likely-subtags data; accepts the raw cldr-json form too. */
  setLikelySubtags (likely: LikelySubtags | CldrLikelySubtagsJson): void {
    if ('supplemental' in likely && typeof likely.supplemental === 'object') {
      this.likelySubtags = (likely as { supplemental: { likelySubtags: LikelySubtags } })
        .supplemental.likelySubtags
    } else {
      this.likelySubtags = likely as LikelySubtags
    }
  }

  /** Returns the data registered for exactly `locale`, or undefined. */
  getData (locale: string): PersonNamesData | undefined {
    return this.data.get(locale)
  }

  /** Returns the registered likely subtags, or an empty map if none were set. */
  getLikelySubtags (): LikelySubtags {
    return this.likelySubtags
  }

  /** Registers parent-locale data; accepts the raw cldr-json form too. */
  setParentLocales (parentLocales: ParentLocales | CldrParentLocalesJson): void {
    this.parentLocales = convertParentLocales(parentLocales)
  }

  /** Returns the registered parent locales, or an empty set if none were set. */
  getParentLocales (): ParentLocales {
    return this.parentLocales
  }
}

/** A parsed cldr-json parent-locales document, e.g. `cldr-core/supplemental/parentLocales.json`. */
export interface CldrParentLocalesJson {
  supplemental: {
    parentLocales: {
      parentLocale: Record<string, string>
      _localeRules?: { parentLocale?: { nonlikelyScript?: string } }
    }
  }
}

/** Converts and normalizes CLDR parent-locale supplemental data. */
export function convertParentLocales (
  input: ParentLocales | CldrParentLocalesJson
): ParentLocales {
  const raw = 'supplemental' in input
    ? input.supplemental.parentLocales
    : {
        parentLocale: input.parents,
        _localeRules: {
          parentLocale: { nonlikelyScript: input.nonlikelyScriptParent }
        }
      }
  const parents: Record<string, string> = {}
  for (const [child, parent] of Object.entries(raw.parentLocale)) {
    parents[normalizeTag(child)] = normalizeTag(parent)
  }
  const nonlikelyScript = raw._localeRules?.parentLocale?.nonlikelyScript
  const result: ParentLocales = { parents }
  if (nonlikelyScript !== undefined) {
    result.nonlikelyScriptParent = normalizeTag(nonlikelyScript)
  }
  return result
}

export function normalizeTag (tag: string): string {
  return localeToString(parseLocale(tag))
}

/**
 * The locale chain searched for a locale's data file:
 * lang-script-region, lang-script, lang-region, lang — except that when the
 * locale carries a script other than the language's likely script, fallback
 * never crosses the script boundary (mirroring CLDR locale inheritance,
 * where e.g. `ja-Latn` inherits from root, not `ja`).
 */
export function dataLocaleChain (loc: LocaleId, likely: LikelySubtags): string[] {
  const { language, script, region } = loc
  const chain: string[] = []
  const push = (l: LocaleId): void => {
    chain.push(localeToString(l))
  }
  const crossScript = script !== undefined && script !== likelyScript(loc, likely)
  if (script !== undefined && region !== undefined) push({ language, script, region })
  if (script !== undefined) push({ language, script })
  if (!crossScript) {
    if (region !== undefined) push({ language, region })
    push({ language })
  }
  return chain
}

interface Resolved {
  data: PersonNamesData
  /** True when the data came from the requested language (not root). */
  ownLanguage: boolean
}

/** Finds data for a locale, walking the fallback chain and ending at root. */
export function resolveData (
  provider: PersonNamesDataProvider,
  locale: string
): Resolved {
  const likely = provider.getLikelySubtags()
  const loc = parseLocale(locale)
  if (loc.language !== 'und') {
    for (const tag of dataLocaleChain(loc, likely)) {
      const data = provider.getData(tag)
      if (data !== undefined) return { data, ownLanguage: true }
    }
  }
  const root = provider.getData('und')
  if (root === undefined) {
    throw new Error(
      `No person-name data available for locale "${locale}" and no root ("und") data ` +
      'is registered. In Node.js, import from "cldr-person-names" (which loads data ' +
      'from cldr-json automatically); in other environments, register data first.'
    )
  }
  return { data: root, ownLanguage: false }
}

/**
 * True when a locale has its own name formatting data, i.e. its
 * nameOrderLocales do not simply inherit from root (UTS #35 Part 8,
 * "Switch the formatting locale if necessary").
 *
 * The spec defines the test as those two paths not inheriting from root, and
 * it has to be made literally: cldr-json ships fully resolved data for every
 * locale, so the paths are always present.
 */
export function hasFormattingData (provider: PersonNamesDataProvider, locale: string): boolean {
  const resolved = resolveData(provider, locale)
  if (!resolved.ownLanguage) return false
  const root = provider.getData('und')
  if (root === undefined) return true
  return !sameStringArray(resolved.data.givenFirstLocales, root.givenFirstLocales) ||
    !sameStringArray(resolved.data.surnameFirstLocales, root.surnameFirstLocales)
}

function sameStringArray (a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/* ------------------------------------------------------------------ */
/* cldr-json conversion                                               */
/* ------------------------------------------------------------------ */

const LENGTHS = ['long', 'medium', 'short'] as const
const USAGES: readonly Usage[] = ['referring', 'addressing', 'monogram']
const FORMALITIES = ['formal', 'informal'] as const

/**
 * Converts one cldr-json personNames document (the parsed contents of a
 * `main/<locale>/personNames.json` file) into {@link PersonNamesData}.
 */
export function convertCldrJson (json: unknown): PersonNamesData[] {
  const doc = json as {
    main?: Record<string, { personNames?: Record<string, unknown> }>
  }
  if (doc.main === undefined) throw new Error('Not a cldr-json personNames document')
  const result: PersonNamesData[] = []
  for (const [locale, content] of Object.entries(doc.main)) {
    const pn = content.personNames
    if (pn === undefined) continue
    result.push(convertPersonNames(locale, pn))
  }
  return result
}

function convertPersonNames (locale: string, pn: Record<string, unknown>): PersonNamesData {
  const data: PersonNamesData = {
    locale: normalizeTag(locale),
    givenFirstLocales: (pn.givenFirst as string[] | undefined) ?? ['und'],
    surnameFirstLocales: (pn.surnameFirst as string[] | undefined) ?? [],
    defaultLength: (pn.length as PersonNamesData['defaultLength'] | undefined) ?? 'medium',
    defaultFormality: (pn.formality as PersonNamesData['defaultFormality'] | undefined) ?? 'formal',
    nativeSpaceReplacement: (pn.nativeSpaceReplacement as string | undefined) ?? ' ',
    foreignSpaceReplacement: (pn.foreignSpaceReplacement as string | undefined) ?? ' ',
    initialPattern: (pn.initial as string | undefined) ?? '{0}.',
    initialSequencePattern: (pn.initialSequence as string | undefined) ?? '{0} {1}',
    patterns: {}
  }
  const table = pn.personName as Record<string, Record<string, Record<string, Record<string, string>>>> | undefined
  if (table !== undefined) {
    for (const order of Object.keys(table) as PatternOrder[]) {
      const byLength = table[order]
      if (byLength === undefined) continue
      const orderOut: NonNullable<PersonNamesData['patterns']['givenFirst']> = {}
      for (const length of LENGTHS) {
        const byUsage = byLength[length]
        if (byUsage === undefined) continue
        const lengthOut: NonNullable<typeof orderOut['long']> = {}
        for (const usage of USAGES) {
          const byFormality = byUsage[usage]
          if (byFormality === undefined) continue
          const usageOut: NonNullable<typeof lengthOut['referring']> = {}
          for (const formality of FORMALITIES) {
            const patterns = collectAlternates(byFormality, formality)
            if (patterns.length > 0) usageOut[formality] = patterns
          }
          lengthOut[usage] = usageOut
        }
        orderOut[length] = lengthOut
      }
      data.patterns[order] = orderOut
    }
  }
  return data
}

/** Collects `key`, `key-alt-1`, `key-alt-2`, ... in order. */
function collectAlternates (cell: Record<string, string>, key: string): string[] {
  const result: string[] = []
  const base = cell[key]
  if (base !== undefined) result.push(base)
  const alts: Array<[number, string]> = []
  for (const [k, v] of Object.entries(cell)) {
    const m = /^(.+)-alt-([0-9]+)$/.exec(k)
    if (m !== null && m[1] === key) {
      alts.push([Number.parseInt(m[2] as string, 10), v])
    }
  }
  alts.sort((a, b) => a[0] - b[0])
  for (const [, v] of alts) result.push(v)
  return result
}
