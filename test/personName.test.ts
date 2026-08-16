import { describe, expect, test } from 'vitest'
import { PersonNameFormatter } from '../src/node.js'
import { adjustCoreAndPrefix, SimplePersonName } from '../src/personName.js'
import type { FieldModifier, PersonName } from '../src/types.js'

describe('SimplePersonName', () => {
  test('treats empty field values as absent', () => {
    const name = new SimplePersonName({ fields: { given: '' } })

    expect(name.getFieldValue('given', new Set())).toBeUndefined()
  })

  test('does not use given2 variants when resolving given', () => {
    const name = new SimplePersonName({
      fields: {
        given: 'Ada',
        'given2-informal': 'Byron'
      }
    })
    const modifiers = new Set<FieldModifier>(['informal', 'initial'])

    expect(name.getFieldValue('given', modifiers)).toBe('Ada')
    expect(modifiers).toEqual(new Set(['informal', 'initial']))
  })

  test.each([
    [{ 'surname-prefix': 'van', 'surname-core': 'Gogh' }, 'van Gogh'],
    [{ 'surname-core': 'Gogh' }, 'Gogh'],
    [{ 'surname-prefix': 'van' }, undefined]
  ])('derives only the plain surnames specified by LDML', (fields, expected) => {
    const name = new SimplePersonName({ fields })

    expect(name.getFieldValue('surname', new Set())).toBe(expected)
  })
})

describe('core and prefix adjustment', () => {
  const availabilityCases: Array<[
    { prefix?: string, core?: string, plain?: string },
    Array<string | undefined>
  ]> = [
    [{ prefix: 'van', core: 'Gogh', plain: 'van Gogh' }, ['van', 'Gogh', 'van Gogh']],
    [{ prefix: 'van', plain: 'van Gogh' }, ['', 'van Gogh', 'van Gogh']],
    [{ core: 'Gogh', plain: 'van Gogh' }, [undefined, 'van Gogh', 'van Gogh']],
    [{ plain: 'Gogh' }, [undefined, 'Gogh', 'Gogh']],
    [{ prefix: 'van', core: 'Gogh' }, ['van', 'Gogh', 'van Gogh']],
    [{ core: 'Gogh' }, [undefined, 'Gogh', 'Gogh']],
    [{ prefix: 'van' }, ['', undefined, undefined]],
    [{}, [undefined, undefined, undefined]]
  ]

  test.each(availabilityCases)('implements the LDML availability table for %o', (available, expected) => {
    const adjusted = adjustCoreAndPrefix(mapPersonName({
      ...(available.prefix === undefined ? {} : { 'surname-prefix': available.prefix }),
      ...(available.core === undefined ? {} : { 'surname-core': available.core }),
      ...(available.plain === undefined ? {} : { surname: available.plain })
    }))

    expect([
      adjusted.getFieldValue('surname', new Set(['prefix'])),
      adjusted.getFieldValue('surname', new Set(['core'])),
      adjusted.getFieldValue('surname', new Set())
    ]).toEqual(expected)
  })
})

describe('PersonNameFormatter surname fallback', () => {
  const formatter = new PersonNameFormatter({
    locale: 'en',
    length: 'medium',
    usage: 'referring',
    formality: 'formal',
    displayOrder: 'givenFirst'
  })

  test.each([
    [{ 'surname-prefix': 'van', 'surname-core': 'Gogh' }, 'Vincent van Gogh'],
    [{ 'surname-prefix': 'van' }, 'Vincent'],
    [{ 'surname-core': 'Gogh' }, 'Vincent Gogh']
  ])('derives a missing surname from custom PersonName components', (surnameFields, expected) => {
    expect(formatter.formatToString(mapPersonName({ given: 'Vincent', ...surnameFields })))
      .toBe(expected)
  })

  test('applies remaining pattern modifiers to a derived surname', () => {
    const monogram = new PersonNameFormatter({
      locale: 'en',
      length: 'medium',
      usage: 'monogram',
      formality: 'formal',
      displayOrder: 'givenFirst'
    })
    expect(monogram.formatToString(mapPersonName({
      given: 'Vincent',
      'surname-prefix': 'van',
      'surname-core': 'Gogh'
    }))).toBe('V')
  })

  test('prefers a supplied surname to its components', () => {
    expect(formatter.formatToString(mapPersonName({
      given: 'Vincent',
      surname: 'Willem',
      'surname-prefix': 'van',
      'surname-core': 'Gogh'
    }))).toBe('Vincent Willem')
  })
})

function mapPersonName (fields: Record<string, string>): PersonName {
  return {
    getNameLocale: () => 'en',
    getPreferredOrder: () => undefined,
    getFieldValue: (field, modifiers) => {
      const key = [field, ...modifiers].join('-')
      const value = fields[key]
      if (value !== undefined) modifiers.clear()
      return value ?? fields[field]
    }
  }
}
