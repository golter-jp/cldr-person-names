import { afterEach, describe, expect, test } from 'vitest'
import { PersonNamesDataRegistry } from '../src/data.js'
import {
  PersonNameFormatter, type PersonNameFormatterOptions
} from '../src/formatter.js'
import {
  getDefaultDataProvider, setDefaultDataProvider
} from '../src/registry.js'
import type { LikelySubtags, PersonNamesData } from '../src/types.js'

const originalProvider = getDefaultDataProvider()

afterEach(() => { setDefaultDataProvider(originalProvider) })

function data (
  locale: string,
  overrides: Partial<Omit<PersonNamesData, 'locale'>> = {}
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
    patterns: {
      givenFirst: {
        medium: { referring: { formal: ['{given} {surname}'] } }
      },
      surnameFirst: {
        medium: { referring: { formal: ['{surname} {given}'] } }
      },
      sorting: {
        medium: { referring: { formal: ['{surname}, {given}'] } }
      }
    },
    ...overrides
  }
}

function registry (
  datas: PersonNamesData[],
  likelySubtags: LikelySubtags = {}
): PersonNamesDataRegistry {
  const result = new PersonNamesDataRegistry()
  for (const localeData of datas) result.addData(localeData)
  result.setLikelySubtags(likelySubtags)
  return result
}

function formatter (
  dataProvider: PersonNamesDataRegistry,
  options: Partial<PersonNameFormatterOptions> = {}
): PersonNameFormatter {
  return new PersonNameFormatter({
    locale: 'en',
    dataProvider,
    ...options
  })
}

describe('PersonNameFormatter contracts', () => {
  test('requires a data provider', () => {
    setDefaultDataProvider(undefined)
    expect(() => new PersonNameFormatter({ locale: 'en' }))
      .toThrow('No person-name data provider is available')
  })

  test('honors a sorting-addressing pattern when the data defines one', () => {
    const provider = registry([data('und', {
      patterns: {
        sorting: {
          medium: {
            referring: { formal: ['SORT-REF:{surname}, {given}'] },
            addressing: { formal: ['SORT-ADDR:{surname}!'] }
          }
        }
      }
    })])
    const format = formatter(provider, {
      usage: 'addressing',
      displayOrder: 'sorting'
    })

    expect(format.formatToString({
      fields: { given: 'Ada', surname: 'Lovelace' }
    })).toBe('SORT-ADDR:Lovelace!')
  })

  test('keeps monogram out of sorting order', () => {
    const provider = registry([data('und', {
      patterns: {
        givenFirst: {
          medium: { monogram: { formal: ['MONO:{given}'] } }
        },
        sorting: {
          medium: { referring: { formal: ['SORT-REF:{surname}, {given}'] } }
        }
      }
    })])
    const format = formatter(provider, {
      usage: 'monogram',
      displayOrder: 'sorting'
    })

    expect(format.formatToString({
      fields: { given: 'Ada', surname: 'Lovelace' }
    })).toBe('MONO:Ada')
  })

  test('infers a name locale and switches through both locale-selection paths', () => {
    const root = data('und', {
      givenFirstLocales: ['und'],
      patterns: {
        givenFirst: {
          medium: { referring: { formal: ['ROOT:{given} {surname}'] } }
        }
      }
    })
    const russian = data('ru', {
      givenFirstLocales: [],
      surnameFirstLocales: ['ru'],
      patterns: {
        givenFirst: {
          medium: { referring: { formal: ['RU-G:{given} {surname}'] } }
        },
        surnameFirst: {
          medium: { referring: { formal: ['RU-S:{surname} {given}'] } }
        }
      }
    })
    const provider = registry([root, russian], {
      en: 'en-Latn-US',
      ru: 'ru-Cyrl-RU',
      'und-Cyrl': 'ru-Cyrl-RU'
    })
    const format = formatter(provider)

    expect(format.formatToString({
      fields: { given: 'Иван', surname: 'Петров' }
    })).toBe('RU-S:Петров Иван')
    expect(format.formatToString({
      locale: 'qaa-RU',
      fields: { given: 'Иван', surname: 'Петров' }
    })).toBe('RU-G:Иван Петров')
  })

  test('canonicalizes a detected character script to its likely script set', () => {
    const root = data('und')
    const chinese = data('zh', {
      givenFirstLocales: ['zh'],
      patterns: {
        givenFirst: {
          medium: { referring: { formal: ['ZH:{given} {surname}'] } }
        }
      }
    })
    const provider = registry([root, chinese], {
      en: 'en-Latn-US',
      zh: 'zh-Hans-CN',
      'und-Hani': 'zh-Hans-CN'
    })

    expect(formatter(provider).formatToString({
      fields: { given: '小明', surname: '王' }
    })).toBe('ZH:小明 王')
  })

  test('handles declared and undeclared names with no detectable script', () => {
    const format = formatter(registry([data('und')], { en: 'en-Latn-US' }))

    expect(format.formatToString({ locale: 'en', fields: { given: '123' } })).toBe('123')
    expect(format.formatToString({ fields: { given: '456' } })).toBe('456')
  })

  test('handles a missing given name while detecting the name script', () => {
    const format = formatter(registry([data('und')], { en: 'en-Latn-US' }))
    expect(format.formatToString({
      locale: 'en',
      fields: { surname: 'Lovelace' }
    })).toBe('Lovelace')
  })

  test('honors both explicit name-order preferences', () => {
    const format = formatter(registry([data('und')]))
    const fields = { given: 'Ada', surname: 'Lovelace' }

    expect(format.formatToString({ preferredOrder: 'givenFirst', fields }))
      .toBe('Ada Lovelace')
    expect(format.formatToString({ preferredOrder: 'surnameFirst', fields }))
      .toBe('Lovelace Ada')
  })

  test('capitalizes both surnames only in surname-first order when requested', () => {
    const root = data('und', {
      surnameFirstLocales: ['ja'],
      patterns: {
        givenFirst: {
          medium: { referring: { formal: ['{given} {surname} {surname2}'] } }
        },
        surnameFirst: {
          medium: { referring: { formal: ['{surname} {surname2} {given}'] } }
        },
        sorting: {
          medium: { referring: { formal: ['{surname}, {given} {surname2}'] } }
        }
      }
    })
    const provider = registry([root])
    const fields = { given: 'Ada', surname: 'Lovelace', surname2: 'Byron' }
    const format = (displayOrder: 'givenFirst' | 'surnameFirst' | 'sorting'): string =>
      formatter(provider, { displayOrder, surnameFirstAllCaps: true }).formatToString({ fields })

    expect(format('givenFirst')).toBe('Ada Lovelace Byron')
    expect(format('surnameFirst')).toBe('LOVELACE BYRON Ada')
    expect(format('sorting')).toBe('Lovelace, Ada Byron')
    expect(formatter(provider, { surnameFirstAllCaps: true }).formatToString({
      locale: 'ja', fields
    })).toBe('LOVELACE BYRON Ada')
  })

  test('keeps Japanese character-script locales surname-first', () => {
    const japanese = data('ja', {
      givenFirstLocales: [],
      surnameFirstLocales: ['ja']
    })
    const provider = registry([data('und'), japanese], {
      ja: 'ja-Jpan-JP',
      'ja-JP': 'ja-Jpan-JP'
    })
    // Exercise the direct-root language fallback instead of ordinary truncation.
    provider.setParentLocales({ parents: {}, nonlikelyScriptParent: 'und' })

    expect(formatter(provider, { locale: 'ja' }).formatToString({
      locale: 'ja-Kana-JP',
      fields: { given: 'ハヤオ', surname: 'ミヤザキ' }
    })).toBe('ミヤザキ ハヤオ')
    expect(formatter(provider, { locale: 'ja' }).formatToString({
      locale: 'ja-Kana',
      fields: { given: 'ハヤオ', surname: 'ミヤザキ' }
    })).toBe('ミヤザキ ハヤオ')
  })

  test('retains language fallback across direct-root script parents', () => {
    const root = data('und', {
      givenFirstLocales: ['und'],
      surnameFirstLocales: ['ja', 'ko', 'yue', 'zh']
    })
    const provider = registry([root], {
      en: 'en-Latn-US',
      ja: 'ja-Jpan-JP',
      ko: 'ko-Kore-KR',
      yue: 'yue-Hant-HK',
      zh: 'zh-Hans-CN'
    })
    provider.setParentLocales({
      parents: { 'yue-Hans': 'und', 'zh-Hant': 'und' },
      nonlikelyScriptParent: 'und'
    })
    const format = formatter(provider)
    const fields = { given: 'Given', surname: 'Surname' }

    for (const locale of ['ja-Kana', 'ja-Latn', 'ko-Hang', 'yue-Hans', 'zh-Hant']) {
      expect(format.formatToString({ locale, fields })).toBe('Surname Given')
    }
    expect(format.formatToString({ locale: 'de-Jpan', fields })).toBe('Given Surname')
  })

  test('matches script-and-region und substitutions for either order', () => {
    const root = data('und', {
      givenFirstLocales: ['und-Latn-GB'],
      surnameFirstLocales: ['und-Cyrl']
    })
    const provider = registry([root], {
      en: 'en-Latn-US',
      ru: 'ru-Cyrl-RU'
    })
    const fields = { given: 'Ada', surname: 'Lovelace' }

    expect(formatter(provider).formatToString({ locale: 'en-Latn-GB', fields }))
      .toBe('Ada Lovelace')
    expect(formatter(provider, { locale: 'ru' }).formatToString({
      locale: 'ru-Cyrl',
      fields: { given: 'Иван', surname: 'Петров' }
    })).toBe('Петров Иван')
  })

  test('defaults to given-first when no name-order locale matches', () => {
    const root = data('und', { givenFirstLocales: [], surnameFirstLocales: [] })
    expect(formatter(registry([root])).formatToString({
      locale: 'qaa',
      fields: { given: 'Ada', surname: 'Lovelace' }
    })).toBe('Ada Lovelace')
  })

  test('falls back across locale, usage, and formality pattern dimensions', () => {
    const root = data('und', {
      patterns: {
        givenFirst: {
          medium: { referring: { informal: ['ROOT:{given} {surname}'] } }
        }
      }
    })
    const german = data('de', { patterns: {} })
    const format = formatter(registry([root, german]), {
      locale: 'de',
      usage: 'addressing',
      formality: 'formal'
    })

    expect(format.formatToString({
      locale: 'de',
      fields: { given: 'Ada', surname: 'Lovelace' }
    })).toBe('ROOT:Ada Lovelace')

    const formalOnly = formatter(registry([data('und')]), { formality: 'informal' })
    expect(formalOnly.formatToString({ fields: { given: 'Ada', surname: 'Lovelace' } }))
      .toBe('Ada Lovelace')
  })

  test('treats an empty usage cell as absent rather than falling through to root', () => {
    const root = data('und', {
      patterns: {
        givenFirst: {
          medium: {
            referring: { formal: ['ROOT-REF:{given}'] },
            monogram: { formal: ['ROOT-MONO:{given}'] }
          }
        }
      }
    })
    const german = data('de', {
      patterns: {
        givenFirst: {
          medium: {
            referring: { formal: ['DE-REF:{given}'] },
            monogram: {}
          }
        }
      }
    })
    const format = formatter(registry([root, german]), {
      locale: 'de',
      usage: 'monogram'
    })

    expect(format.formatToString({ fields: { given: 'Ada' } })).toBe('DE-REF:Ada')
  })

  test('rejects missing and explicitly empty pattern cells', () => {
    const missing = formatter(registry([data('de', { patterns: {} })]), { locale: 'de' })
    expect(() => missing.formatToString({ fields: { given: 'Ada' } }))
      .toThrow('No name pattern')

    const emptyData = data('de', {
      patterns: {
        givenFirst: {
          medium: { referring: { formal: [] } }
        }
      }
    })
    const empty = formatter(registry([emptyData]), { locale: 'de' })
    expect(() => empty.formatToString({ fields: { given: 'Ada' } }))
      .toThrow('No name pattern')
  })

  test('treats Japanese, Chinese, and Cantonese as space-replacement peers', () => {
    const japanese = data('ja', {
      nativeSpaceReplacement: '',
      foreignSpaceReplacement: '·'
    })
    const provider = registry([japanese], {
      ja: 'ja-Jpan-JP',
      zh: 'zh-Hans-CN',
      yue: 'yue-Hant-HK'
    })

    expect(formatter(provider, { locale: 'ja' }).formatToString({
      locale: 'zh',
      fields: { given: '小明', surname: '王' }
    })).toBe('小明王')
    expect(formatter(provider, { locale: 'ja' }).formatToString({
      locale: 'yue',
      fields: { given: '小明', surname: '王' }
    })).toBe('小明王')
  })

  test('builder requires a locale and exposes the remaining setters', () => {
    // @ts-expect-error the locale is required
    PersonNameFormatter.builder()

    const provider = registry([data('und')])
    const format = PersonNameFormatter.builder('en')
      .setLength('medium')
      .setUsage('referring')
      .setFormality('formal')
      .setDisplayOrder('surnameFirst')
      .setSurnameFirstAllCaps(true)
      .setDataProvider(provider)
      .build()

    expect(format.formatToString({
      locale: 'en',
      fields: { given: 'Ada', surname: 'Lovelace' }
    })).toBe('LOVELACE Ada')
  })
})
