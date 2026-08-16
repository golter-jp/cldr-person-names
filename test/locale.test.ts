import { describe, expect, test } from 'vitest'
import {
  addLikelySubtags, likelyScript, localeToString, nameOrderLocaleChain, parseLocale
} from '../src/locale.js'

describe('locale identifiers', () => {
  test('parses language, script, alphabetic region, and numeric region subtags', () => {
    expect(parseLocale('EN_latn_gb_variant')).toEqual({
      language: 'en', script: 'Latn', region: 'GB'
    })
    expect(parseLocale('es-419')).toEqual({ language: 'es', region: '419' })
  })

  test('normalizes root, undetermined, empty, and malformed leading subtags', () => {
    expect(parseLocale('root')).toEqual({ language: 'und' })
    expect(parseLocale('UND-Cyrl')).toEqual({ language: 'und', script: 'Cyrl' })
    expect(parseLocale('')).toEqual({ language: 'und' })
    expect(parseLocale('invalid-Latn-US')).toEqual({ language: 'und' })
  })

  test('serializes every supported locale component', () => {
    expect(localeToString({ language: 'sr', script: 'Latn', region: 'RS' }))
      .toBe('sr-Latn-RS')
    expect(localeToString({ language: 'de' })).toBe('de')
  })

  test('canonicalizes deprecated language aliases', () => {
    expect(parseLocale('iw_IL')).toEqual({ language: 'he', region: 'IL' })
  })
})

describe('name-order parent locales', () => {
  const likely = {
    de: 'de-Latn-DE',
    en: 'en-Latn-US',
    ja: 'ja-Jpan-JP'
  }
  const parents = {
    parents: { 'en-GB': 'en-001', qaa: 'de-Latn-DE' },
    nonlikelyScriptParent: 'und'
  }

  test('keeps the standard language/script/region lookup sequence', () => {
    expect(nameOrderLocaleChain(parseLocale('de-Latn-DE'), likely, parents))
      .toEqual(['de-Latn-DE', 'de-Latn', 'de-DE', 'de', 'und'])
    expect(nameOrderLocaleChain(parseLocale('und'), likely, parents)).toEqual(['und'])
  })

  test('follows explicit parents and the nonlikely-script rule', () => {
    expect(nameOrderLocaleChain(parseLocale('en-GB'), likely, parents))
      .toEqual(['en-GB', 'en-001', 'en', 'und'])
    expect(nameOrderLocaleChain(parseLocale('ja-Latn'), likely, parents))
      .toEqual(['ja-Latn', 'ja', 'und'])
    expect(nameOrderLocaleChain(parseLocale('qaa'), likely, parents))
      .toEqual(['qaa', 'de-Latn-DE', 'de-Latn', 'de', 'und'])
  })
})

describe('likely subtags', () => {
  const likely = {
    'en-GB': 'en-Latn-GB',
    en: 'en-Latn-US',
    'und-Cyrl': 'ru-Cyrl-RU',
    'und-CA': 'en-Latn-CA',
    und: 'en-Latn-US'
  }

  test('returns an already complete locale unchanged', () => {
    const complete = { language: 'en', script: 'Latn', region: 'GB' }
    expect(addLikelySubtags(complete, likely)).toBe(complete)
  })

  test('prefers the most specific candidate and preserves supplied subtags', () => {
    expect(addLikelySubtags({ language: 'en', region: 'GB' }, likely)).toEqual({
      language: 'en', script: 'Latn', region: 'GB'
    })
    expect(addLikelySubtags({ language: 'und', script: 'Cyrl' }, likely)).toEqual({
      language: 'ru', script: 'Cyrl', region: 'RU'
    })
    expect(addLikelySubtags({ language: 'und', region: 'CA' }, likely)).toEqual({
      language: 'en', script: 'Latn', region: 'CA'
    })
  })

  test('retains a partial match and returns the input when nothing matches', () => {
    expect(addLikelySubtags({ language: 'en' }, { en: 'en' }))
      .toEqual({ language: 'en' })
    const unknown = { language: 'qaa' }
    expect(addLikelySubtags(unknown, {})).toBe(unknown)
  })

  test('derives a likely script without retaining an explicit script', () => {
    expect(likelyScript({ language: 'en', script: 'Cyrl', region: 'GB' }, likely))
      .toBe('Latn')
  })
})
