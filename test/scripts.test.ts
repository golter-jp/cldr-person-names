import { describe, expect, test } from 'vitest'
import { detectNameScript, scriptOfChar, scriptsMatch } from '../src/scripts.js'

describe('script detection', () => {
  test('ignores Common characters and recognizes early and late script aliases', () => {
    expect(scriptOfChar('!')).toBeUndefined()
    expect(scriptOfChar('A')).toBe('Latn')
    expect(scriptOfChar('A')).toBe('Latn')
    expect(scriptOfChar('ᐃ')).toBe('Cans')
    expect(scriptOfChar('⠁')).toBeUndefined()
  })

  test('searches surname before given name and handles punctuation-only names', () => {
    expect(detectNameScript('Жуков', 'Georgy')).toBe('Cyrl')
    expect(detectNameScript('123', '!?')).toBe('Zzzz')
  })
})

describe('script matching', () => {
  test('matches identical, contained, and intersecting script sets', () => {
    expect(scriptsMatch('Latn', 'Latn')).toBe(true)
    expect(scriptsMatch('Jpan', 'Hira')).toBe(true)
    expect(scriptsMatch('Hani', 'Jpan')).toBe(true)
    expect(scriptsMatch('Jpan', 'Hrkt')).toBe(true)
    expect(scriptsMatch('Latn', 'Cyrl')).toBe(false)
  })
})
