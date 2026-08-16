import { describe, expect, test } from 'vitest'
import {
  createFullCldrDataRegistry, getDefaultDataProvider
} from '../src/browser-full.js'

describe('full browser defaults', () => {
  test('registers and supplies the complete likely-subtags table', () => {
    const provider = getDefaultDataProvider()
    expect(provider?.getLikelySubtags().de).toBe('de-Latn-DE')

    const registry = createFullCldrDataRegistry()
    expect(registry.getLikelySubtags().de).toBe('de-Latn-DE')
    expect(registry.getData('und')).toMatchObject({ locale: 'und' })
  })
})
