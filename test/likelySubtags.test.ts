import { describe, expect, test } from 'vitest'
import {
  addLikelySubtags, likelyScript, nameOrderLocaleChain, parseLocale
} from '../src/locale.js'
import { extractLikelySubtags } from '../src/likelySubtags.js'

describe('likely-subtags extraction', () => {
  const full = {
    de: 'de-Latn-DE',
    en: 'en-Latn-US',
    ja: 'ja-Jpan-JP',
    ar: 'ar-Arab-EG',
    'und-Latn': 'en-Latn-US',
    'und-Jpan': 'ja-Jpan-JP',
    'und-Arab': 'ar-Arab-EG',
    'und-AT': 'de-Latn-AT',
    und: 'en-Latn-US'
  }

  test('retains locale, likely-script, and inferred-language lookups', () => {
    const subset = extractLikelySubtags(full, ['de', 'ja', 'und-Arab', 'und-AT'])

    expect(subset).toEqual({
      de: 'de-Latn-DE',
      'und-Latn': 'en-Latn-US',
      en: 'en-Latn-US',
      ja: 'ja-Jpan-JP',
      'und-Jpan': 'ja-Jpan-JP',
      'und-Arab': 'ar-Arab-EG',
      ar: 'ar-Arab-EG',
      'und-AT': 'de-Latn-AT',
      und: 'en-Latn-US'
    })
  })

  test('preserves maximization and likely-script results for requested locales', () => {
    const locales = ['de', 'ja', 'und-Arab', 'und-AT']
    const subset = extractLikelySubtags(full, locales)

    for (const locale of locales) {
      const parsed = parseLocale(locale)
      expect(addLikelySubtags(parsed, subset)).toEqual(addLikelySubtags(parsed, full))
      expect(likelyScript(parsed, subset)).toBe(likelyScript(parsed, full))
    }
  })

  test('retains likely-script lookups introduced by explicit parent locales', () => {
    const likely = {
      zh: 'zh-Hans-CN',
      'zh-MO': 'zh-Hant-MO',
      'zh-HK': 'zh-Hant-HK',
      'und-Hant': 'zh-Hant-TW',
      und: 'en-Latn-US'
    }
    const parents = {
      parents: { 'zh-Hant-MO': 'zh-Hant-HK' },
      nonlikelyScriptParent: 'und'
    }
    const locale = parseLocale('zh-Hant-MO')
    const subset = extractLikelySubtags(likely, ['zh-Hant-MO'], parents)

    expect(subset['zh-HK']).toBe('zh-Hant-HK')
    expect(nameOrderLocaleChain(locale, subset, parents))
      .toEqual(nameOrderLocaleChain(locale, likely, parents))
  })

  test('needs no entries when neither locale nor script has a likely mapping', () => {
    expect(extractLikelySubtags({}, ['qaa', 'und-Geok'])).toEqual({})
  })
})
