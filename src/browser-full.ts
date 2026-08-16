/** Browser entry point with the complete pinned CLDR likely-subtags table. */
import likelySubtagsJson from 'cldr-core/supplemental/likelySubtags.json' with { type: 'json' }
import { createCldrDataRegistry as createRegistry } from './browser.js'
import type { PersonNamesDataRegistry } from './data.js'
import { registerLikelySubtags } from './registry.js'

export * from './browser.js'

/** Creates an explicit registry with all pinned supplemental defaults. */
export function createFullCldrDataRegistry (): PersonNamesDataRegistry {
  return createRegistry({ likelySubtags: likelySubtagsJson })
}

registerLikelySubtags(likelySubtagsJson)
