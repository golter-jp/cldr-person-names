import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  NamePattern, formatSimplePattern, setMyanmarWordSplitter, type PatternContext
} from '../src/pattern.js'
import { SimplePersonName } from '../src/personName.js'

const context: PatternContext = {
  locale: 'en',
  initialPattern: '{0}.',
  initialSequencePattern: '{0} {1}',
  surnameFirstAllCaps: false
}

function name (fields: Record<string, string>): SimplePersonName {
  return new SimplePersonName({ fields })
}

afterEach(() => {
  setMyanmarWordSplitter(undefined)
  vi.restoreAllMocks()
})

describe('NamePattern parsing', () => {
  test('rejects nested, unmatched closing, and empty fields', () => {
    expect(() => new NamePattern('{given{surname}}', context)).toThrow('Nested braces')
    expect(() => new NamePattern('given}', context)).toThrow('Unmatched closing brace')
    expect(() => new NamePattern('{}', context)).toThrow('Empty field')
  })

  test('supports escaped braces as literal text', () => {
    expect(new NamePattern('\\{literal\\} {given}', context).format(name({ given: 'Ada' })))
      .toBe('{literal} Ada')
  })
})

describe('NamePattern formatting', () => {
  test('injects all-caps into both surnames once when requested', () => {
    const allCaps = { ...context, surnameFirstAllCaps: true }
    expect(new NamePattern('{surname} {surname2}', allCaps).format(name({
      surname: 'van Gogh', surname2: 'de Boer'
    }))).toBe('VAN GOGH DE BOER')
    expect(new NamePattern('{surname-allCaps}', allCaps).format(name({ surname: 'van Gogh' })))
      .toBe('VAN GOGH')
    expect(new NamePattern('{surname-allCaps}', context).format(name({ surname: 'van Gogh' })))
      .toBe('VAN GOGH')
  })

  test('elides leading, internal, and trailing empty fields and their spacing', () => {
    const pattern = new NamePattern('{title} {given} {given2} {surname} {credentials}', context)
    expect(pattern.format(name({ given: 'Ada', surname: 'Lovelace' })))
      .toBe('Ada Lovelace')
  })

  test('counts populated and empty fields', () => {
    const pattern = new NamePattern('{given} {given2} {surname}', context)
    const ada = name({ given: 'Ada', surname: 'Lovelace' })
    expect(pattern.numPopulatedFields(ada)).toBe(2)
    expect(pattern.numEmptyFields(ada)).toBe(1)
  })

  test('returns an empty initial when a value has no letters', () => {
    const pattern = new NamePattern('{given-initial}', context)
    expect(pattern.format(name({ given: '123', surname: 'Example' }))).toBe('')
  })

  test('leaves initial-cap values without letters unchanged', () => {
    const pattern = new NamePattern('{given-initialCap}', context)
    expect(pattern.format(name({ given: '123', surname: 'Example' }))).toBe('123')
  })

  test('merges a Khmer coeng with the following grapheme for monograms', () => {
    vi.spyOn(Intl.Segmenter.prototype, 'segment').mockReturnValue([
      { segment: 'ក្', index: 0 },
      { segment: 'ខ', index: 2 },
      { segment: 'ា', index: 3 }
    ] as never)
    const pattern = new NamePattern('{given-monogram}', context)
    expect(pattern.format(name({ given: 'ក្ខា', surname: 'Example' }))).toBe('ក្ខ')
  })

  test('uses a registered splitter for each Myanmar run', () => {
    const splitter = vi.fn((run: string) => Array.from(run))
    setMyanmarWordSplitter(splitter)

    const formatted = new NamePattern('{given-initial}', context)
      .format(name({ given: 'ကခ၊ဂဃ', surname: 'Example' }))
    expect(splitter.mock.calls).toEqual([['ကခ'], ['ဂဃ']])
    expect(formatted).toBe('က. ခ. ဂ. ဃ.')
  })

  test('falls back to Myanmar syllables without splitting marks or asat clusters', () => {
    setMyanmarWordSplitter(undefined)

    expect(new NamePattern('{given-initial-retain}', context)
      .format(name({ given: 'ကာခ', surname: 'Example' }))).toBe('က.ခ.')
    expect(new NamePattern('{given-initial}', context)
      .format(name({ given: 'ကက်ခ', surname: 'Example' }))).toBe('က. ခ.')
    expect(new NamePattern('{given-initial-retain}', context)
      .format(name({ given: 'ကာ၊ခ', surname: 'Example' }))).toBe('က.၊ခ.')
  })
})

describe('formatSimplePattern', () => {
  test('substitutes repeated arguments and empties missing arguments', () => {
    expect(formatSimplePattern('{0}/{1}/{0}/{2}', 'a', 'b')).toBe('a/b/a/')
  })
})
