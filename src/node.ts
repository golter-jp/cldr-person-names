/**
 * Node.js entry point: everything from the core module, plus a data provider
 * that lazily loads CLDR data from the `cldr-person-names-full` and
 * `cldr-core` packages (published from cldr-json by Unicode). Importing this
 * module registers that provider as the global default, so formatters work
 * out of the box.
 */
import { createRequire } from 'node:module'
import type { LikelySubtags, ParentLocales, PersonNamesData } from './types.js'
import {
  convertCldrJson, convertParentLocales, type CldrParentLocalesJson,
  type PersonNamesDataProvider
} from './data.js'
import { setDefaultDataProvider } from './registry.js'

// Register ICU-compatible dictionary-based Burmese word segmentation.
import './burmese.js'

export * from './index.js'

const require = createRequire(import.meta.url)

/** Loads person-name data on demand from the cldr-json npm packages. */
export class CldrJsonDataProvider implements PersonNamesDataProvider {
  private readonly cache = new Map<string, PersonNamesData | undefined>()
  private likelySubtags: LikelySubtags | undefined
  private parentLocales: ParentLocales | undefined

  getData (locale: string): PersonNamesData | undefined {
    if (this.cache.has(locale)) return this.cache.get(locale)
    let data: PersonNamesData | undefined
    if (/^[a-zA-Z0-9-]+$/.test(locale)) {
      try {
        const json: unknown = require(`cldr-person-names-full/main/${locale}/personNames.json`)
        data = convertCldrJson(json)[0]
      } catch {
        data = undefined
      }
    }
    this.cache.set(locale, data)
    return data
  }

  getLikelySubtags (): LikelySubtags {
    if (this.likelySubtags === undefined) {
      const json = require('cldr-core/supplemental/likelySubtags.json') as {
        supplemental: { likelySubtags: LikelySubtags }
      }
      this.likelySubtags = json.supplemental.likelySubtags
    }
    return this.likelySubtags
  }

  getParentLocales (): ParentLocales {
    if (this.parentLocales === undefined) {
      const json = require('cldr-core/supplemental/parentLocales.json') as CldrParentLocalesJson
      this.parentLocales = convertParentLocales(json)
    }
    return this.parentLocales
  }
}

setDefaultDataProvider(new CldrJsonDataProvider())
