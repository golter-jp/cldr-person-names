/*
 * Portions adapted from ICU4J PersonNameFormatterImpl (release 77.1).
 * Copyright © 2022 and later Unicode, Inc. and others.
 * SPDX-License-Identifier: Unicode-3.0
 */
import type {
  DisplayOrder, Formality, Length, PersonName, PersonNamesData, PatternOrder, Usage
} from './types.js'
import { NamePattern } from './pattern.js'
import { detectNameScript, scriptsMatch } from './scripts.js'
import {
  addLikelySubtags, likelyScript, localeToString, nameOrderLocaleChain,
  parseLocale, type LocaleId
} from './locale.js'
import {
  hasFormattingData, normalizeTag, resolveData, type PersonNamesDataProvider
} from './data.js'
import { getDefaultDataProvider } from './registry.js'
import type { SimplePersonNameInit } from './personName.js'
import { adjustCoreAndPrefix, SimplePersonName } from './personName.js'

/** Options accepted by {@link PersonNameFormatter}. */
export interface PersonNameFormatterOptions {
  /** The formatting locale, e.g. `'en'`, `'ja'`, `'sr-Latn'`. */
  locale: string
  /** Defaults to `'default'`, i.e. the locale's own default length. */
  length?: Length
  /** Defaults to `'referring'`. */
  usage?: Usage
  /** Defaults to `'default'`, i.e. the locale's own default formality. */
  formality?: Formality
  /** Defaults to `'default'`, i.e. derived from the name. */
  displayOrder?: DisplayOrder
  /** Renders surname fields in all caps when using surname-first order. Defaults to `false`. */
  surnameFirstAllCaps?: boolean
  /** Data source; defaults to the globally registered provider. */
  dataProvider?: PersonNamesDataProvider
}

/**
 * Languages that count as matching for space-replacement purposes. UTS #35
 * Part 8, "Setting the spaceReplacement", treats two base languages as matching
 * when they are identical "or if both are in {ja, zh, yue}"; ICU4J hardcodes
 * only ja and zh. The spec notes these languages are planned to become
 * data-driven.
 */
const SPACE_REPLACEMENT_PEERS = new Set(['ja', 'zh', 'yue'])

/**
 * Formats {@link PersonName} objects according to UTS #35 Part 8, using CLDR
 * person-name formatting data. Modeled on ICU4J's `PersonNameFormatter`.
 */
export class PersonNameFormatter {
  private readonly provider: PersonNamesDataProvider
  private readonly options: Required<Pick<PersonNameFormatterOptions,
    'length' | 'usage' | 'formality' | 'displayOrder' | 'surnameFirstAllCaps'>> &
    { locale: string }

  private readonly locale: LocaleId
  private readonly localeTag: string
  private readonly data: PersonNamesData
  private readonly rootData: PersonNamesData | undefined
  private readonly formattingScript: string | undefined

  /**
   * Creates a formatter. The locale's data is resolved here, so an
   * unavailable data provider throws now rather than at format time.
   */
  constructor (options: PersonNameFormatterOptions) {
    const provider = options.dataProvider ?? getDefaultDataProvider()
    if (provider === undefined) {
      throw new Error(
        'No person-name data provider is available. In Node.js, import from ' +
        '"cldr-person-names"; in other environments, register data with ' +
        'registerData()/setDefaultDataProvider() or pass options.dataProvider.'
      )
    }
    this.provider = provider
    this.options = {
      locale: options.locale,
      length: options.length ?? 'default',
      usage: options.usage ?? 'referring',
      formality: options.formality ?? 'default',
      displayOrder: options.displayOrder ?? 'default',
      surnameFirstAllCaps: options.surnameFirstAllCaps ?? false
    }
    this.localeTag = normalizeTag(options.locale)
    this.locale = parseLocale(this.localeTag)
    this.data = resolveData(provider, this.localeTag).data
    this.rootData = provider.getData('und')
    this.formattingScript = addLikelySubtags(this.locale, provider.getLikelySubtags()).script
  }

  /** Creates a builder for the given formatting locale. */
  static builder (locale: string): PersonNameFormatterBuilder {
    return new PersonNameFormatterBuilder(locale)
  }

  /**
   * Formats a name. Accepts any {@link PersonName} implementation or the
   * plain-object initializer accepted by {@link SimplePersonName}.
   */
  formatToString (name: PersonName | SimplePersonNameInit): string {
    const personName: PersonName =
      'getFieldValue' in name ? name : new SimplePersonName(name)
    return this.formatImpl(adjustCoreAndPrefix(personName), true)
  }

  private formatImpl (name: PersonName, allowLocaleSwitch: boolean): string {
    const nameScript = this.getNameScript(name)
    const nameLocale = this.getNameLocale(name, nameScript)

    // Switch the formatting locale if the name's script doesn't match ours.
    if (allowLocaleSwitch && nameScript !== 'Zzzz' &&
        this.formattingScript !== undefined &&
        !scriptsMatch(nameScript, this.formattingScript)) {
      const newLocale = hasFormattingData(this.provider, localeToString(nameLocale))
        ? nameLocale
        : this.localeForScript(nameScript, nameLocale.region)
      const switched = new PersonNameFormatter({
        ...this.options,
        locale: localeToString(newLocale),
        dataProvider: this.provider
      })
      return switched.formatImpl(name, false)
    }

    // Resolve parameters and choose the pattern set.
    const length = this.options.length === 'default'
      ? this.data.defaultLength
      : this.options.length
    const formality = this.options.formality === 'default'
      ? this.data.defaultFormality
      : this.options.formality
    const usage = this.options.usage
    let order: PatternOrder
    // TR35-8 has a requested sorting order always be used, but CLDR defines no
    // sorting monogram patterns, so obeying it would fall back to sorting
    // referring and answer a monogram request with a full sorted name.
    if (this.options.displayOrder === 'sorting' && usage !== 'monogram') {
      order = 'sorting'
    } else if (this.options.displayOrder === 'givenFirst' ||
        this.options.displayOrder === 'surnameFirst') {
      order = this.options.displayOrder
    } else {
      order = this.nameIsGivenFirst(name, nameLocale) ? 'givenFirst' : 'surnameFirst'
    }

    const patterns = this.getPatterns(order, length, usage, formality)
    const best = this.getBestPattern(patterns, name)
    let result = best.format(name)

    // Space replacement for languages that don't separate words with spaces.
    const { nativeSpaceReplacement, foreignSpaceReplacement } = this.data
    if (nativeSpaceReplacement !== ' ' || foreignSpaceReplacement !== ' ') {
      const replacement = this.languagesMatch(nameLocale.language)
        ? nativeSpaceReplacement
        : foreignSpaceReplacement
      // The spec replaces "sequences of space"; ICU4J replaces each space.
      result = result.replace(/ +/g, replacement)
    }
    return result
  }

  private getNameScript (name: PersonName): string {
    const surname = name.getFieldValue('surname', new Set()) ?? ''
    const given = name.getFieldValue('given', new Set()) ?? ''
    return detectNameScript(surname, given)
  }

  /**
   * UTS #35 Part 8 "Derive the name locale": the name's declared locale with
   * its script replaced by the detected name script (canonicalized to the
   * locale's default script when they match), or a locale guessed from the
   * name script alone.
   */
  private getNameLocale (name: PersonName, nameScript: string): LocaleId {
    const likely = this.provider.getLikelySubtags()
    const declared = name.getNameLocale()
    if (declared !== undefined) {
      const loc = parseLocale(declared)
      if (nameScript === 'Zzzz') return loc
      const defaultScript = likelyScript(loc, likely)
      const script = defaultScript !== undefined && scriptsMatch(nameScript, defaultScript)
        ? defaultScript
        : nameScript
      const result: LocaleId = { language: loc.language, script }
      if (loc.region !== undefined) result.region = loc.region
      return result
    }
    if (nameScript === 'Zzzz') return { language: 'und' }
    return this.localeForScript(nameScript, undefined)
  }

  /** Builds a locale for a bare script code, via likely subtags. */
  private localeForScript (script: string, region: string | undefined): LocaleId {
    const likely = this.provider.getLikelySubtags()
    const guessed = addLikelySubtags({ language: 'und', script }, likely)
    const language = guessed.language
    const defaultScript = likelyScript({ language }, likely)
    const canonical = defaultScript !== undefined && script !== defaultScript &&
      scriptsMatch(script, defaultScript)
      ? defaultScript
      : script
    const result: LocaleId = { language, script: canonical }
    if (region !== undefined) result.region = region
    return result
  }

  /**
   * UTS #35 Part 8 "Derive the name order": preferred order from the name,
   * else the formatting locale's nameOrderLocales matched against the name's
   * locale (walking a truncation chain, trying an `und` substitution at each
   * step).
   */
  private nameIsGivenFirst (name: PersonName, derivedNameLocale: LocaleId): boolean {
    const preferred = name.getPreferredOrder()
    if (preferred === 'givenFirst') return true
    if (preferred === 'surnameFirst') return false

    const likely = this.provider.getLikelySubtags()
    const declared = name.getNameLocale()
    const loc = declared !== undefined ? parseLocale(declared) : derivedNameLocale

    const givenFirst = new Set(this.data.givenFirstLocales.map(normalizeTag))
    const surnameFirst = new Set(this.data.surnameFirstLocales.map(normalizeTag))
    const chain = nameOrderLocaleChain(loc, likely, this.provider.getParentLocales())
    for (const tag of chain) {
      if (givenFirst.has(tag)) return true
      if (surnameFirst.has(tag)) return false
      const tagLocale = parseLocale(tag)
      const undLocale: LocaleId = { language: 'und' }
      if (tagLocale.script !== undefined) undLocale.script = tagLocale.script
      if (tagLocale.region !== undefined) undLocale.region = tagLocale.region
      const undTag = localeToString(undLocale)
      if (givenFirst.has(undTag)) return true
      if (surnameFirst.has(undTag)) return false
    }
    return true
  }

  /**
   * Finds the pattern texts for one parameter combination, falling back on
   * the other formality, then on referring, then on root. Order and length do
   * not fall back.
   *
   * Registered data may omit any cell, so every step is live; even complete
   * CLDR data needs the usage step, since no locale defines sorting/addressing
   * patterns and a sorting-order addressing request resolves through
   * sorting/referring.
   */
  private getPatterns (
    order: PatternOrder,
    length: 'long' | 'medium' | 'short',
    usage: Usage,
    formality: 'formal' | 'informal'
  ): NamePattern[] {
    const pick = (
      cell: { formal?: string[], informal?: string[] } | undefined
    ): string[] | undefined =>
      cell?.[formality] ?? cell?.[formality === 'formal' ? 'informal' : 'formal']

    const lookup = (data: PersonNamesData | undefined): string[] | undefined => {
      if (data === undefined) return undefined
      const byUsage = data.patterns[order]?.[length]
      return pick(byUsage?.[usage]) ?? pick(byUsage?.referring)
    }
    const texts = lookup(this.data) ?? lookup(this.rootData)
    if (texts === undefined || texts.length === 0) {
      throw new Error(
        `No name pattern for ${order}-${length}-${usage}-${formality} in locale ` +
        `"${this.localeTag}"`
      )
    }
    const ctx = {
      locale: this.localeTag,
      initialPattern: this.data.initialPattern,
      initialSequencePattern: this.data.initialSequencePattern,
      surnameFirstAllCaps: this.options.surnameFirstAllCaps && order === 'surnameFirst'
    }
    return texts.map((text) => new NamePattern(text, ctx))
  }

  /**
   * UTS #35 Part 8 "Choose a namePattern": most populated fields wins;
   * ties broken by fewest unpopulated fields, then least pattern text.
   *
   * The last of those is the spec's "take the pattern that is alphabetically
   * least"; ICU4J compares only the empty-field counts and keeps the first
   * pattern it saw.
   */
  private getBestPattern (patterns: NamePattern[], name: PersonName): NamePattern {
    const first = patterns[0] as NamePattern
    if (patterns.length === 1) return first
    let best = first
    let maxPopulated = 0
    let minEmpty = Number.MAX_SAFE_INTEGER
    for (const pattern of patterns) {
      const populated = pattern.numPopulatedFields(name)
      const empty = pattern.numEmptyFields(name)
      if (populated > maxPopulated) {
        maxPopulated = populated
        minEmpty = empty
        best = pattern
      } else if (populated === maxPopulated &&
          (empty < minEmpty || (empty === minEmpty && pattern.text < best.text))) {
        minEmpty = empty
        best = pattern
      }
    }
    return best
  }

  private languagesMatch (nameLanguage: string): boolean {
    const formatterLanguage = this.locale.language
    if (nameLanguage === formatterLanguage) return true
    return SPACE_REPLACEMENT_PEERS.has(nameLanguage) &&
      SPACE_REPLACEMENT_PEERS.has(formatterLanguage)
  }
}

/** Fluent builder for {@link PersonNameFormatter}. */
export class PersonNameFormatterBuilder {
  private readonly options: PersonNameFormatterOptions

  /** Equivalent to {@link PersonNameFormatter.builder}. */
  constructor (locale: string) {
    this.options = { locale }
  }

  setLength (length: Length): this {
    this.options.length = length
    return this
  }

  setUsage (usage: Usage): this {
    this.options.usage = usage
    return this
  }

  setFormality (formality: Formality): this {
    this.options.formality = formality
    return this
  }

  setDisplayOrder (displayOrder: DisplayOrder): this {
    this.options.displayOrder = displayOrder
    return this
  }

  setSurnameFirstAllCaps (surnameFirstAllCaps: boolean): this {
    this.options.surnameFirstAllCaps = surnameFirstAllCaps
    return this
  }

  setDataProvider (dataProvider: PersonNamesDataProvider): this {
    this.options.dataProvider = dataProvider
    return this
  }

  /** Builds a formatter from the options set so far. */
  build (): PersonNameFormatter {
    return new PersonNameFormatter(this.options)
  }
}
