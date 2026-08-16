import type { LikelySubtags, ParentLocales, PersonNamesData } from './types.js'
import {
  PersonNamesDataRegistry, type CldrLikelySubtagsJson,
  type CldrParentLocalesJson, type PersonNamesDataProvider
} from './data.js'

let defaultProvider: PersonNamesDataProvider | undefined

/** Returns the globally registered data provider, if any. */
export function getDefaultDataProvider (): PersonNamesDataProvider | undefined {
  return defaultProvider
}

/** Replaces the globally registered data provider. */
export function setDefaultDataProvider (provider: PersonNamesDataProvider | undefined): void {
  defaultProvider = provider
}

function defaultRegistry (): PersonNamesDataRegistry {
  if (!(defaultProvider instanceof PersonNamesDataRegistry)) {
    defaultProvider = new PersonNamesDataRegistry()
  }
  return defaultProvider as PersonNamesDataRegistry
}

/**
 * Registers person-name data with the global registry. Accepts either
 * {@link PersonNamesData} or any cldr-json personNames document, whatever its
 * source — for example
 * `import enData from 'cldr-person-names-full/main/en/personNames.json'`.
 */
export function registerData (
  ...datas: Array<PersonNamesData | { main: Record<string, unknown> }>
): void {
  const registry = defaultRegistry()
  for (const data of datas) {
    if ('main' in data) {
      registry.addCldrJson(data)
    } else {
      registry.addData(data)
    }
  }
}

/**
 * Registers likely-subtags data with the global registry. Accepts the raw
 * cldr-json form (`import likely from 'cldr-core/supplemental/likelySubtags.json'`).
 */
export function registerLikelySubtags (
  likely: LikelySubtags | CldrLikelySubtagsJson
): void {
  defaultRegistry().setLikelySubtags(likely)
}

/** Registers CLDR parent-locale supplemental data with the global registry. */
export function registerParentLocales (
  parentLocales: ParentLocales | CldrParentLocalesJson
): void {
  defaultRegistry().setParentLocales(parentLocales)
}
