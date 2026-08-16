import { describe, expect, test } from 'vitest'
import {
  createCldrDataRegistry, getDefaultDataProvider
} from '../src/browser.js'

describe('browser defaults', () => {
  test('registers root and parent locales without the full likely-subtags table', () => {
    const provider = getDefaultDataProvider()
    expect(provider?.getData('und')).toMatchObject({ locale: 'und' })
    expect(provider?.getParentLocales()).toMatchObject({
      nonlikelyScriptParent: 'und'
    })
    expect(provider?.getLikelySubtags()).toEqual({})
  })

  test('creates an explicit registry with defaults and a supplied subset', () => {
    const registry = createCldrDataRegistry({
      likelySubtags: { de: 'de-Latn-DE' }
    })
    expect(registry.getData('und')).toMatchObject({ locale: 'und' })
    expect(registry.getParentLocales().parents['en-GB']).toBe('en-001')
    expect(registry.getLikelySubtags()).toEqual({ de: 'de-Latn-DE' })
  })
})
