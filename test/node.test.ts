import { describe, expect, test } from 'vitest'
import { CldrJsonDataProvider } from '../src/node.js'

describe('CldrJsonDataProvider', () => {
  test('loads and caches available locale and likely-subtag data', () => {
    const provider = new CldrJsonDataProvider()
    const en = provider.getData('en')
    expect(en).toMatchObject({ locale: 'en' })
    expect(provider.getData('en')).toBe(en)

    const likely = provider.getLikelySubtags()
    expect(likely.en).toBeDefined()
    expect(provider.getLikelySubtags()).toBe(likely)

    const parents = provider.getParentLocales()
    expect(parents.parents['en-GB']).toBe('en-001')
    expect(parents.nonlikelyScriptParent).toBe('und')
    expect(provider.getParentLocales()).toBe(parents)
  })

  test('rejects unsafe locale paths and caches absent valid locales', () => {
    const provider = new CldrJsonDataProvider()
    expect(provider.getData('../en')).toBeUndefined()
    expect(provider.getData('zzzz')).toBeUndefined()
    expect(provider.getData('zzzz')).toBeUndefined()
  })
})
