/*
 * Portions adapted from ICU4J PersonNamePattern and FieldModifierImpl
 * (release 77.1).
 * Copyright © 2022 and later Unicode, Inc. and others.
 * SPDX-License-Identifier: Unicode-3.0
 */
import type { FieldModifier, NameField, PersonName } from './types.js'

/** Services a parsed pattern needs from its formatter. */
export interface PatternContext {
  /**
   * Effective formatting locale for case mapping and word segmentation.
   *
   * LDML Part 8, "Modifiers", directs the formatter's default modifier
   * algorithms to use the PersonName locale. A PersonName may instead consume
   * a modifier and return its own modified value.
   *
   * CLDR's el.txt conformance data supplies no monogram or allCaps override,
   * but expects Greek locale casing for its foreignFull PersonName even though
   * that PersonName's locale is ja_AQ. We intentionally follow the conformance
   * data.
   *
   * https://www.unicode.org/reports/tr35/tr35-personNames.html#Modifiers
   */
  locale: string
  initialPattern: string
  initialSequencePattern: string
  surnameFirstAllCaps: boolean
}

type Element = LiteralElement | FieldElement
type FieldValueSource = Pick<PersonName, 'getFieldValue'>

interface LiteralElement {
  literal: string
}

interface FieldElement {
  field: NameField
  modifiers: FieldModifier[]
}

function isLiteral (e: Element): e is LiteralElement {
  return 'literal' in e
}

/**
 * A single parsed name pattern (one `namePattern` element), with the
 * field-substitution and empty-field-elision behavior described in
 * UTS #35 Part 8 "Process a namePattern".
 */
export class NamePattern {
  private readonly elements: Element[]
  readonly text: string
  private readonly ctx: PatternContext

  constructor (text: string, ctx: PatternContext) {
    this.text = text
    this.ctx = ctx
    this.elements = parsePattern(text)
    if (ctx.surnameFirstAllCaps) {
      for (const el of this.elements) {
        if (!isLiteral(el) && (el.field === 'surname' || el.field === 'surname2') &&
            !el.modifiers.includes('allCaps')) {
          el.modifiers.push('allCaps')
        }
      }
    }
  }

  /** Number of pattern fields with a non-empty value in `name`. */
  numPopulatedFields (name: PersonName): number {
    let n = 0
    for (const el of this.elements) {
      if (!isLiteral(el) && this.formatField(el, name) !== '') n++
    }
    return n
  }

  /** Number of pattern fields with no value in `name`. */
  numEmptyFields (name: PersonName): number {
    let n = 0
    for (const el of this.elements) {
      if (!isLiteral(el) && this.formatField(el, name) === '') n++
    }
    return n
  }

  format (name: PersonName): string {
    const fieldSource = this.adjustNameForMissingSurname(name)

    let result = ''
    let seenLeadingField = false
    let seenEmptyLeadingField = false
    let seenEmptyField = false
    let textBefore = ''
    let textAfter = ''

    for (const el of this.elements) {
      if (isLiteral(el)) {
        if (seenEmptyLeadingField) {
          // discard literal text before the first populated field
        } else if (seenEmptyField) {
          textAfter += el.literal
        } else {
          textBefore += el.literal
        }
      } else {
        const fieldText = this.formatField(el, fieldSource)
        if (fieldText === '') {
          if (!seenLeadingField) {
            seenEmptyLeadingField = true
            textBefore = ''
          } else {
            seenEmptyField = true
            textAfter = ''
          }
        } else {
          seenLeadingField = true
          seenEmptyLeadingField = false
          if (seenEmptyField) {
            result += coalesce(textBefore, textAfter)
            textBefore = ''
            textAfter = ''
            result += fieldText
            seenEmptyField = false
          } else {
            result += textBefore
            textBefore = ''
            result += fieldText
          }
        }
      }
    }
    if (!seenEmptyField) result += textBefore
    return result
  }

  /**
   * UTS #35 Part 8 "Handle missing surname": when the name has no surname and
   * the pattern shows the given name at most as an initial, treat the given
   * name as the surname.
   */
  private adjustNameForMissingSurname (name: FieldValueSource): FieldValueSource {
    if (name.getFieldValue('surname', new Set()) !== undefined) return name
    for (const el of this.elements) {
      if (!isLiteral(el) && el.field === 'given' && !el.modifiers.includes('initial')) {
        return name
      }
    }
    return new GivenToSurnamePersonName(name)
  }

  private formatField (el: FieldElement, name: FieldValueSource): string {
    const remaining = new Set<FieldModifier>(el.modifiers)
    let value = name.getFieldValue(el.field, remaining)
    if (value === undefined) return ''
    for (const modifier of MODIFIER_APPLICATION_ORDER) {
      if (!remaining.has(modifier)) continue
      value = applyModifier(value, modifier, remaining.has('retain'), this.ctx)
    }
    return value
  }
}

/** Field-value adapter that presents the given name as the surname. */
class GivenToSurnamePersonName implements FieldValueSource {
  private readonly inner: FieldValueSource

  constructor (inner: FieldValueSource) {
    this.inner = inner
  }

  getFieldValue (field: NameField, modifiers: Set<FieldModifier>): string | undefined {
    if (field === 'surname') return this.inner.getFieldValue('given', modifiers)
    if (field === 'given') return undefined
    return this.inner.getFieldValue(field, modifiers)
  }
}

function parsePattern (text: string): Element[] {
  const elements: Element[] = []
  let working = ''
  let inField = false
  let inEscape = false
  for (const c of text) {
    if (inEscape) {
      working += c
      inEscape = false
    } else if (c === '\\') {
      inEscape = true
    } else if (c === '{') {
      if (inField) throw new Error(`Nested braces in name pattern: ${text}`)
      if (working !== '') {
        elements.push({ literal: working })
        working = ''
      }
      inField = true
    } else if (c === '}') {
      if (!inField) throw new Error(`Unmatched closing brace in name pattern: ${text}`)
      if (working === '') throw new Error(`Empty field in name pattern: ${text}`)
      const [field, ...modifiers] = working.split('-')
      elements.push({
        field: field as NameField,
        modifiers: modifiers as FieldModifier[]
      })
      working = ''
      inField = false
    } else {
      working += c
    }
  }
  if (working !== '') elements.push({ literal: working })
  return elements
}

/**
 * Stitches together the literal text on either side of an omitted field,
 * keeping the leading non-whitespace of the text before, the trailing
 * non-whitespace of the text after, and at most one whitespace character
 * between them.
 */
function coalesce (before: string, after: string): string {
  if (before.endsWith(after)) after = ''

  let p1 = 0
  while (p1 < before.length && !isWhitespace(before[p1] as string)) p1++

  let p2 = after.length - 1
  while (p2 >= 0 && !isWhitespace(after[p2] as string)) p2--

  if (p1 < before.length) {
    p1++
  } else if (p2 >= 0) {
    p2--
  }
  return before.slice(0, p1) + after.slice(p2 + 1)
}

function isWhitespace (c: string): boolean {
  return /\s/.test(c)
}

/* ------------------------------------------------------------------ */
/* Field modifiers                                                    */
/* ------------------------------------------------------------------ */

/**
 * The order in which default modifier behavior is applied: structural
 * modifiers first, then case modifiers.
 */
const MODIFIER_APPLICATION_ORDER = [
  'prefix', 'initial', 'monogram', 'allCaps', 'initialCap'
] as const

type DefaultModifier = typeof MODIFIER_APPLICATION_ORDER[number]

function applyModifier (
  value: string,
  modifier: DefaultModifier,
  retain: boolean,
  ctx: PatternContext
): string {
  switch (modifier) {
    case 'prefix':
      // A prefix variant must come from the name object itself.
      return ''
    case 'allCaps':
      return value.toLocaleUpperCase(canonicalLocale(ctx.locale))
    case 'initialCap':
      return initialCap(value, ctx.locale)
    case 'initial':
      return initials(value, retain, ctx)
    case 'monogram':
      return firstGrapheme(value)
  }
}

function canonicalLocale (locale: string): string {
  return Intl.getCanonicalLocales(locale.replace(/_/g, '-'))[0] as string
}

/** Uppercases the first cased letter of the string, leaving the rest alone. */
function initialCap (value: string, locale: string): string {
  const loc = canonicalLocale(locale)
  for (const segment of graphemes(value)) {
    if (/\p{L}/u.test(segment.segment)) {
      const upper = segment.segment.toLocaleUpperCase(loc)
      return value.slice(0, segment.index) + upper +
        value.slice(segment.index + segment.segment.length)
    }
  }
  return value
}

/**
 * Converts a value into initials: the first grapheme cluster of each word,
 * run through the locale's initial pattern, glued together with the
 * initial-sequence pattern (or, with `retain`, with the punctuation found
 * between the words).
 */
function initials (value: string, retain: boolean, ctx: PatternContext): string {
  const segmenter = new Intl.Segmenter(canonicalLocale(ctx.locale), { granularity: 'word' })
  let result: string | undefined
  let separator = ''
  for (const word of wordSegments(segmenter, value)) {
    if (/^\p{L}/u.test(word)) {
      const initial = formatSimplePattern(ctx.initialPattern, firstGrapheme(word))
      if (result === undefined) {
        result = initial
      } else if (retain) {
        result += separator + initial
        separator = ''
      } else {
        result = formatSimplePattern(ctx.initialSequencePattern, result, initial)
      }
    } else if (/^\s/.test(word)) {
      separator += word.slice(0, 1)
    } else {
      separator += word
    }
  }
  return result ?? ''
}

let myanmarWordSplitter: ((run: string) => string[]) | undefined

/**
 * Registers a word splitter for runs of Myanmar text. The `./burmese` module
 * registers ICU's dictionary-based segmentation (the Node.js entry point
 * loads it automatically); without it, a syllable-based approximation is
 * used. Platform `Intl.Segmenter` boundaries are implementation-dependent,
 * and observed ICU4C results can differ from the ICU4J-backed CLDR
 * conformance data.
 */
export function setMyanmarWordSplitter (splitter: ((run: string) => string[]) | undefined): void {
  myanmarWordSplitter = splitter
}

/** Runs of Myanmar characters handled as dictionary-segmented text. */
const MYANMAR_SA_RUN =
  /^[က-ဿၐ-ႏႚ-႟ꧠ-ꧯꧺ-ꧾꩠ-ꩿ]+$/

/**
 * Yields word segments for initial generation. Consecutive Myanmar-script
 * segments are joined back into runs and re-segmented (see
 * {@link setMyanmarWordSplitter}).
 */
function * wordSegments (segmenter: Intl.Segmenter, value: string): Generator<string> {
  let run = ''
  for (const seg of segmenter.segment(value)) {
    if (MYANMAR_SA_RUN.test(seg.segment)) {
      run += seg.segment
      continue
    }
    if (run !== '') {
      yield * (myanmarWordSplitter ?? splitMyanmarSyllables)(run)
      run = ''
    }
    yield seg.segment
  }
  if (run !== '') {
    yield * (myanmarWordSplitter ?? splitMyanmarSyllables)(run)
  }
}

/**
 * Splits a nonempty Myanmar run into syllables: a new syllable starts at
 * each grapheme cluster that begins with a letter and does not contain the
 * asat (U+103A), which marks a syllable-final consonant.
 */
function splitMyanmarSyllables (word: string): string[] {
  const parts: string[] = []
  let current = ''
  for (const seg of graphemes(word)) {
    const cluster = seg.segment
    if (current !== '' && /^\p{L}/u.test(cluster) && !cluster.includes('်')) {
      parts.push(current)
      current = cluster
    } else {
      current += cluster
    }
  }
  parts.push(current)
  return parts
}

/**
 * Returns the first grapheme cluster of the string. A cluster ending in the
 * Khmer coeng (U+17D2) is merged with the following cluster: current ICU
 * keeps such conjuncts in a single cluster, but segmenters based on older
 * Unicode versions split them.
 */
function firstGrapheme (value: string): string {
  let result = ''
  for (const seg of graphemes(value)) {
    result += seg.segment
    if (!result.endsWith('្')) break
  }
  return result
}

function graphemes (value: string): Iterable<{ segment: string, index: number }> {
  return new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)
}

/** Formats a `{0} {1}`-style simple pattern. */
export function formatSimplePattern (pattern: string, ...args: string[]): string {
  return pattern.replace(/\{(\d+)\}/g, (_, d: string) => args[Number.parseInt(d, 10)] ?? '')
}
