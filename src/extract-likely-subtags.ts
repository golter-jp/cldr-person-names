#!/usr/bin/env node
import likelySubtagsJson from 'cldr-core/supplemental/likelySubtags.json' with { type: 'json' }
import parentLocalesJson from 'cldr-core/supplemental/parentLocales.json' with { type: 'json' }
import { convertParentLocales, type CldrLikelySubtagsJson } from './data.js'
import { extractLikelySubtags } from './likelySubtags.js'

const locales = process.argv.slice(2)
if (locales.length === 0) {
  console.error('Usage: cldr-person-names-extract-likely-subtags <locale>...')
  process.exitCode = 1
} else {
  const full = (likelySubtagsJson as CldrLikelySubtagsJson).supplemental.likelySubtags
  const parents = convertParentLocales(parentLocalesJson)
  const output: CldrLikelySubtagsJson = {
    supplemental: { likelySubtags: extractLikelySubtags(full, locales, parents) }
  }
  process.stdout.write(JSON.stringify(output, null, 2) + '\n')
}
