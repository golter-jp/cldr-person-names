import { describe, expect, test } from 'vitest'
import { burmeseWordBreaks, splitBurmeseWords } from '../src/burmese.js'

describe('Burmese dictionary segmentation', () => {
  test('does not seek a word break in a one-code-unit input', () => {
    expect(burmeseWordBreaks('က')).toEqual([])
  })

  test('returns internal dictionary word boundaries only', () => {
    expect(burmeseWordBreaks('မြန်မာစာ')).toEqual([6])
    expect(splitBurmeseWords('မြန်မာစာ')).toEqual(['မြန်မာ', 'စာ'])
  })

  test('keeps an unknown run together', () => {
    expect(splitBurmeseWords('႟႟ဢ')).toEqual(['႟႟ဢ'])
  })

  test('carries a combining mark onto the preceding word', () => {
    expect(splitBurmeseWords('ကား့က')).toEqual(['ကား့', 'က'])
  })
})
