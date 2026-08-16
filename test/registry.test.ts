import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  getDefaultDataProvider, registerData, registerLikelySubtags, registerParentLocales,
  setDefaultDataProvider
} from '../src/registry.js'
import { PersonNamesDataRegistry, type PersonNamesDataProvider } from '../src/data.js'
import type { PersonNamesData } from '../src/types.js'

const root: PersonNamesData = {
  locale: 'und',
  givenFirstLocales: ['und'],
  surnameFirstLocales: [],
  defaultLength: 'medium',
  defaultFormality: 'formal',
  nativeSpaceReplacement: ' ',
  foreignSpaceReplacement: ' ',
  initialPattern: '{0}.',
  initialSequencePattern: '{0} {1}',
  patterns: {}
}

beforeEach(() => { setDefaultDataProvider(undefined) })
afterEach(() => { setDefaultDataProvider(undefined) })

describe('global data-provider registration', () => {
  test('sets, returns, and clears an explicit provider', () => {
    const provider: PersonNamesDataProvider = {
      getData: () => undefined,
      getLikelySubtags: () => ({}),
      getParentLocales: () => ({ parents: {} })
    }
    setDefaultDataProvider(provider)
    expect(getDefaultDataProvider()).toBe(provider)
    setDefaultDataProvider(undefined)
    expect(getDefaultDataProvider()).toBeUndefined()
  })

  test('creates one registry and reuses it for converted data', () => {
    registerData(root)
    const provider = getDefaultDataProvider()
    expect(provider).toBeInstanceOf(PersonNamesDataRegistry)
    expect(provider?.getData('und')).toBe(root)

    const en = { ...root, locale: 'en' }
    registerData(en)
    expect(getDefaultDataProvider()).toBe(provider)
    expect(provider?.getData('en')).toBe(en)
  })

  test('replaces a non-registry provider and accepts raw CLDR documents', () => {
    const oldProvider: PersonNamesDataProvider = {
      getData: () => undefined,
      getLikelySubtags: () => ({}),
      getParentLocales: () => ({ parents: {} })
    }
    setDefaultDataProvider(oldProvider)
    registerData({ main: { root: { personNames: {} } } })
    const provider = getDefaultDataProvider()
    expect(provider).toBeInstanceOf(PersonNamesDataRegistry)
    expect(provider).not.toBe(oldProvider)
    expect(provider?.getData('und')).toMatchObject({ locale: 'und' })
  })

  test('rejects a value that is neither form', () => {
    // @ts-expect-error a number is neither PersonNamesData nor a CLDR document
    expect(() => { registerData(42) }).toThrow()
  })

  test('registers plain and raw likely-subtag maps in the same registry', () => {
    registerLikelySubtags({ en: 'en-Latn-US' })
    const provider = getDefaultDataProvider()
    expect(provider?.getLikelySubtags()).toEqual({ en: 'en-Latn-US' })
    registerLikelySubtags({ supplemental: { likelySubtags: { ja: 'ja-Jpan-JP' } } })
    expect(getDefaultDataProvider()).toBe(provider)
    expect(provider?.getLikelySubtags()).toEqual({ ja: 'ja-Jpan-JP' })
  })

  test('registers raw parent-locale data in the same registry', () => {
    registerParentLocales({
      supplemental: {
        parentLocales: {
          parentLocale: { 'en-GB': 'en-001' },
          _localeRules: { parentLocale: { nonlikelyScript: 'root' } }
        }
      }
    })
    const provider = getDefaultDataProvider()
    expect(provider?.getParentLocales()).toEqual({
      parents: { 'en-GB': 'en-001' },
      nonlikelyScriptParent: 'und'
    })
  })
})
