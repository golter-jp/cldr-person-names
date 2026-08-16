import { describe, expect, test } from 'vitest'
import {
  PersonNamesDataRegistry, convertCldrJson, dataLocaleChain,
  hasFormattingData, normalizeTag, resolveData
} from '../src/data.js'
import type { PersonNamesData } from '../src/types.js'

function personNamesData (
  locale: string,
  overrides: Partial<PersonNamesData> = {}
): PersonNamesData {
  return {
    locale,
    givenFirstLocales: ['und'],
    surnameFirstLocales: [],
    defaultLength: 'medium',
    defaultFormality: 'formal',
    nativeSpaceReplacement: ' ',
    foreignSpaceReplacement: ' ',
    initialPattern: '{0}.',
    initialSequencePattern: '{0} {1}',
    patterns: {},
    ...overrides
  }
}

describe('PersonNamesDataRegistry', () => {
  test('normalizes registered locales and accepts both likely-subtag shapes', () => {
    const registry = new PersonNamesDataRegistry()
    const data = personNamesData('EN_gb')
    registry.addData(data)
    expect(registry.getData('en-GB')).toBe(data)

    registry.setLikelySubtags({ en: 'en-Latn-US' })
    expect(registry.getLikelySubtags()).toEqual({ en: 'en-Latn-US' })
    registry.setLikelySubtags({ supplemental: { likelySubtags: { ja: 'ja-Jpan-JP' } } })
    expect(registry.getLikelySubtags()).toEqual({ ja: 'ja-Jpan-JP' })
  })

  test('normalizes internal and raw parent-locale data', () => {
    const registry = new PersonNamesDataRegistry()
    registry.setParentLocales({
      parents: { EN_gb: 'EN_001' },
      nonlikelyScriptParent: 'root'
    })
    expect(registry.getParentLocales()).toEqual({
      parents: { 'en-GB': 'en-001' },
      nonlikelyScriptParent: 'und'
    })

    registry.setParentLocales({
      supplemental: {
        parentLocales: { parentLocale: { nb: 'no' } }
      }
    })
    expect(registry.getParentLocales()).toEqual({ parents: { nb: 'no' } })
  })

  test('converts and registers raw CLDR JSON', () => {
    const registry = new PersonNamesDataRegistry()
    registry.addCldrJson({ main: { root: { personNames: {} } } })
    expect(registry.getData('und')).toMatchObject({ locale: 'und' })
  })
})

describe('data locale resolution', () => {
  const likely = { en: 'en-Latn-US', ja: 'ja-Jpan-JP' }

  test('constructs ordinary and cross-script fallback chains', () => {
    expect(dataLocaleChain({ language: 'en', script: 'Latn', region: 'GB' }, likely))
      .toEqual(['en-Latn-GB', 'en-Latn', 'en-GB', 'en'])
    expect(dataLocaleChain({ language: 'ja', script: 'Latn', region: 'US' }, likely))
      .toEqual(['ja-Latn-US', 'ja-Latn'])
    expect(dataLocaleChain({ language: 'en', region: 'GB' }, likely))
      .toEqual(['en-GB', 'en'])
    expect(dataLocaleChain({ language: 'en' }, likely)).toEqual(['en'])
  })

  test('resolves exact language data before root', () => {
    const registry = new PersonNamesDataRegistry()
    const root = personNamesData('und')
    const en = personNamesData('en')
    registry.addData(root)
    registry.addData(en)
    registry.setLikelySubtags(likely)
    expect(resolveData(registry, 'en-GB')).toEqual({ data: en, ownLanguage: true })
    expect(resolveData(registry, 'fr')).toEqual({ data: root, ownLanguage: false })
    expect(resolveData(registry, 'und')).toEqual({ data: root, ownLanguage: false })
  })

  test('reports a missing root data set', () => {
    const registry = new PersonNamesDataRegistry()
    expect(() => resolveData(registry, 'fr')).toThrow(
      'No person-name data available for locale "fr" and no root ("und") data is registered'
    )
  })

  test('distinguishes inherited, absent-root, and locale-specific formatting data', () => {
    const root = personNamesData('und')

    const inherited = new PersonNamesDataRegistry()
    inherited.addData(root)
    inherited.addData(personNamesData('en'))
    expect(hasFormattingData(inherited, 'fr')).toBe(false)
    expect(hasFormattingData(inherited, 'en')).toBe(false)

    const withoutRoot = new PersonNamesDataRegistry()
    withoutRoot.addData(personNamesData('en'))
    expect(hasFormattingData(withoutRoot, 'en')).toBe(true)

    const givenFirstDiffers = new PersonNamesDataRegistry()
    givenFirstDiffers.addData(root)
    givenFirstDiffers.addData(personNamesData('de', { givenFirstLocales: ['de'] }))
    expect(hasFormattingData(givenFirstDiffers, 'de')).toBe(true)

    const surnameFirstDiffers = new PersonNamesDataRegistry()
    surnameFirstDiffers.addData(root)
    surnameFirstDiffers.addData(personNamesData('ja', { surnameFirstLocales: ['ja'] }))
    expect(hasFormattingData(surnameFirstDiffers, 'ja')).toBe(true)
  })
})

describe('CLDR JSON conversion', () => {
  test('rejects documents without main and ignores entries without personNames', () => {
    expect(() => convertCldrJson({})).toThrow('Not a cldr-json personNames document')
    expect(convertCldrJson({ main: { en: {} } })).toEqual([])
  })

  test('supplies defaults for a minimal document', () => {
    expect(convertCldrJson({ main: { root: { personNames: {} } } })).toEqual([
      personNamesData('und')
    ])
    expect(normalizeTag('root')).toBe('und')
  })

  test('converts sparse pattern tables and orders numeric alternates', () => {
    const [data] = convertCldrJson({
      main: {
        en: {
          personNames: {
            givenFirst: ['en'],
            surnameFirst: ['ja'],
            length: 'long',
            formality: 'informal',
            nativeSpaceReplacement: '_',
            foreignSpaceReplacement: '·',
            initial: '[{0}]',
            initialSequence: '{0}+{1}',
            personName: {
              givenFirst: {
                long: {
                  referring: {
                    formal: 'base',
                    'formal-alt-10': 'ten',
                    'formal-alt-2': 'two',
                    'formal-alt-word': 'ignored',
                    informal: 'informal'
                  },
                  addressing: {
                    'formal-alt-1': 'alternate only'
                  },
                  monogram: {
                    'formal-alt-word': 'ignored'
                  }
                },
                medium: undefined
              },
              surnameFirst: undefined
            }
          }
        }
      }
    })

    expect(data).toMatchObject({
      locale: 'en',
      givenFirstLocales: ['en'],
      surnameFirstLocales: ['ja'],
      defaultLength: 'long',
      defaultFormality: 'informal',
      nativeSpaceReplacement: '_',
      foreignSpaceReplacement: '·',
      initialPattern: '[{0}]',
      initialSequencePattern: '{0}+{1}'
    })
    expect(data?.patterns.givenFirst?.long?.referring).toEqual({
      formal: ['base', 'two', 'ten'],
      informal: ['informal']
    })
    expect(data?.patterns.givenFirst?.long?.addressing).toEqual({
      formal: ['alternate only']
    })
    expect(data?.patterns.givenFirst?.long?.monogram).toEqual({})
  })
})
