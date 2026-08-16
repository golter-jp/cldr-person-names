/**
 * Browser entry point: the core API with root person-name data and CLDR parent
 * locales registered automatically. Applications supply a likely-subtags map
 * and register the formatting locales they use.
 */
import parentLocalesJson from 'cldr-core/supplemental/parentLocales.json' with { type: 'json' }
import rootJson from 'cldr-person-names-full/main/und/personNames.json' with { type: 'json' }
import type { LikelySubtags } from './types.js'
import { PersonNamesDataRegistry, type CldrLikelySubtagsJson } from './data.js'
import { registerData, registerParentLocales } from './registry.js'

export * from './index.js'

export interface CldrDataRegistryOptions {
  likelySubtags: LikelySubtags | CldrLikelySubtagsJson
}

/** Creates an explicit registry with root and parent-locale defaults. */
export function createCldrDataRegistry (
  options: CldrDataRegistryOptions
): PersonNamesDataRegistry {
  const registry = new PersonNamesDataRegistry()
  registry.addCldrJson(rootJson)
  registry.setParentLocales(parentLocalesJson)
  registry.setLikelySubtags(options.likelySubtags)
  return registry
}

registerParentLocales(parentLocalesJson)
registerData(rootJson)
