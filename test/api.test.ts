import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'
import {
  PersonNameFormatter, PersonNamesDataRegistry, SimplePersonName,
  type CldrLikelySubtagsJson
} from '../src/node.js'

const require = createRequire(import.meta.url)

describe('PersonNameFormatter (Node data provider)', () => {
  test('formats a simple English name', () => {
    const formatter = new PersonNameFormatter({
      locale: 'en',
      length: 'medium',
      usage: 'referring',
      formality: 'formal'
    })
    expect(formatter.formatToString({
      locale: 'en',
      fields: { given: 'Ada', surname: 'Lovelace' }
    })).toBe('Ada Lovelace')
  })

  test('builder API', () => {
    const formatter = PersonNameFormatter.builder('en')
      .setLength('short')
      .setUsage('addressing')
      .setFormality('formal')
      .build()
    const name = new SimplePersonName({
      locale: 'en',
      fields: { title: 'Dr.', given: 'Ada', surname: 'Lovelace' }
    })
    expect(formatter.formatToString(name)).toBe('Dr. Lovelace')
  })

  test('derives surname-first order from the name locale', () => {
    const formatter = new PersonNameFormatter({
      locale: 'ja',
      length: 'medium',
      usage: 'referring',
      formality: 'formal'
    })
    expect(formatter.formatToString({
      locale: 'ja',
      fields: { given: '駿', surname: '宮崎' }
    })).toBe('宮崎駿')
  })

  test('keeps Chinese names surname-first across script and region subtags', () => {
    const formatter = new PersonNameFormatter({ locale: 'en' })
    const locales = [undefined, 'zh', 'zh-Hans', 'zh-TW', 'zh-Hant', 'zh-Hant-TW']

    for (const locale of locales) {
      expect(formatter.formatToString({
        ...(locale !== undefined ? { locale } : {}),
        fields: { surname: '陳', given: '大文' }
      })).toBe('陳大文')
    }
  })

  test('foreign names in Japanese get the middle-dot space replacement', () => {
    const formatter = new PersonNameFormatter({
      locale: 'ja',
      length: 'long',
      usage: 'referring',
      formality: 'formal',
      displayOrder: 'givenFirst'
    })
    expect(formatter.formatToString({
      locale: 'de',
      fields: { given: 'アルベルト', surname: 'アインシュタイン' }
    })).toBe('アルベルト・アインシュタイン')
  })

  test('switches the formatting locale for foreign-script names', () => {
    // A Japanese-script name formatted with an English formatter should be
    // formatted with Japanese conventions (surname first, no space).
    const formatter = new PersonNameFormatter({
      locale: 'en',
      length: 'medium',
      usage: 'referring',
      formality: 'formal'
    })
    expect(formatter.formatToString({
      locale: 'ja',
      fields: { given: '駿', surname: '宮崎' }
    })).toBe('宮崎駿')
  })

  test('monograms', () => {
    const formatter = new PersonNameFormatter({
      locale: 'en',
      length: 'long',
      usage: 'monogram',
      formality: 'formal'
    })
    expect(formatter.formatToString({
      locale: 'en',
      fields: { given: 'Ada', given2: 'King', surname: 'Lovelace' }
    })).toBe('AKL')
  })

  test('initials', () => {
    const formatter = new PersonNameFormatter({
      locale: 'en',
      length: 'short',
      usage: 'referring',
      formality: 'formal'
    })
    expect(formatter.formatToString({
      locale: 'en',
      fields: { given: 'John', given2: 'Ronald Reuel', surname: 'Tolkien' }
    })).toBe('J.R.R. Tolkien')
  })

  test('sorting order', () => {
    const formatter = new PersonNameFormatter({
      locale: 'en',
      length: 'short',
      usage: 'referring',
      formality: 'informal',
      displayOrder: 'sorting'
    })
    expect(formatter.formatToString({
      locale: 'en',
      fields: { given: 'Ada', surname: 'Lovelace' }
    })).toBe('Lovelace, Ada')
  })

  test('mononym falls into the surname slot when needed', () => {
    const formatter = new PersonNameFormatter({
      locale: 'en',
      length: 'medium',
      usage: 'addressing',
      formality: 'formal'
    })
    expect(formatter.formatToString({
      locale: 'en',
      fields: { given: 'Zendaya' }
    })).toBe('Zendaya')
  })

  test('default length and formality come from locale data', () => {
    const formatter = new PersonNameFormatter({ locale: 'en' })
    expect(formatter.formatToString({
      locale: 'en',
      fields: { given: 'Ada', 'given-informal': 'Addie', surname: 'Lovelace' }
    })).toBe('Addie Lovelace')
  })

  test('canonicalizes deprecated locale aliases before loading CLDR data', () => {
    const format = (locale: string): string => new PersonNameFormatter({
      locale,
      length: 'long',
      usage: 'addressing',
      formality: 'formal',
      displayOrder: 'givenFirst'
    }).formatToString({
      locale: 'iw',
      fields: {
        title: 'ד״ר',
        given: 'עדה',
        given2: 'קינג',
        surname: 'לאבלייס',
        surname2: 'ביירון',
        credentials: 'PhD'
      }
    })

    expect(format('iw')).toBe('ד״ר לאבלייס')
    expect(format('iw')).toBe(format('he'))
  })

  test('retains the name language across a direct-root script parent', () => {
    const formatter = new PersonNameFormatter({
      locale: 'en',
      length: 'medium',
      usage: 'referring',
      formality: 'formal'
    })

    expect(formatter.formatToString({
      locale: 'ja-Latn',
      fields: { given: 'Hayao', surname: 'Miyazaki' }
    })).toBe('Miyazaki Hayao')
  })
})

describe('explicit data registration (browser-style)', () => {
  test('works with a standalone registry and raw cldr-json documents', () => {
    const registry = new PersonNamesDataRegistry()
    registry.addCldrJson(require('cldr-person-names-full/main/und/personNames.json'))
    registry.addCldrJson(require('cldr-person-names-full/main/de/personNames.json'))
    registry.setLikelySubtags(
      require('cldr-core/supplemental/likelySubtags.json') as CldrLikelySubtagsJson
    )

    const formatter = new PersonNameFormatter({
      locale: 'de',
      length: 'long',
      usage: 'referring',
      formality: 'formal',
      dataProvider: registry
    })
    expect(formatter.formatToString({
      locale: 'de',
      fields: { given: 'Johann', given2: 'Sebastian', surname: 'Bach' }
    })).toBe('Johann Sebastian Bach')
  })

  test('breaks fully tied patterns by alphabetical pattern text', () => {
    const registry = new PersonNamesDataRegistry()
    registry.addData({
      locale: 'und',
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
          medium: {
            referring: {
              formal: ['{given} Z', '{given} A', '{given} Y']
            }
          }
        }
      }
    })
    const formatter = new PersonNameFormatter({ locale: 'en', dataProvider: registry })

    expect(formatter.formatToString({
      locale: 'en',
      fields: { given: 'Ada' }
    })).toBe('Ada A')
  })
})
