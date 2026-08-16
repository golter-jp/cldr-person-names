/*
 * Portions adapted from ICU4J SimplePersonName (release 77.1).
 * Copyright © 2022 and later Unicode, Inc. and others.
 * SPDX-License-Identifier: Unicode-3.0
 */
import type { FieldModifier, NameField, PersonName, PreferredOrder } from './types.js'

/** Input to {@link SimplePersonName}: field values keyed by (modified) field name. */
export interface SimplePersonNameInit {
  /** The name's locale, e.g. `'de'`, `'ja-JP'`, `'sr_Latn'`. */
  locale?: string
  /** The name's own field-order preference. */
  preferredOrder?: PreferredOrder
  /**
   * Field values, keyed by field name with optional hyphen-separated
   * modifiers, e.g. `given`, `given-informal`, `surname-prefix`,
   * `surname-core`. Only `''` is absent; whitespace is preserved, so trim first.
   */
  fields: Record<string, string>
}

/**
 * A concrete {@link PersonName} backed by a simple map of field values,
 * modeled on ICU4J's `SimplePersonName`.
 */
export class SimplePersonName implements PersonName {
  private readonly locale: string | undefined
  private readonly preferredOrder: PreferredOrder | undefined
  private readonly fieldValues: Map<string, string>

  /**
   * Creates a name from `init`, dropping empty-string field values and deriving
   * `surname` from `surname-prefix` and `surname-core` if it is absent.
   */
  constructor (init: SimplePersonNameInit) {
    this.locale = init.locale
    this.preferredOrder = init.preferredOrder
    this.fieldValues = new Map()
    for (const [key, value] of Object.entries(init.fields)) {
      if (value !== '') this.fieldValues.set(key, value)
    }
    if (!this.fieldValues.has('surname')) {
      const surname = combineCoreAndPrefix(
        this.fieldValues.get('surname-prefix'),
        this.fieldValues.get('surname-core')
      )
      if (surname !== undefined) this.fieldValues.set('surname', surname)
    }
  }

  /** The locale passed to the constructor, if any. */
  getNameLocale (): string | undefined {
    return this.locale
  }

  /** The field-order preference passed to the constructor, if any. */
  getPreferredOrder (): PreferredOrder | undefined {
    return this.preferredOrder
  }

  /**
   * Looks up the best stored value for `field` given `modifiers`, removing
   * from `modifiers` those consumed by the lookup. The formatter applies
   * default behavior for the modifiers that remain.
   */
  getFieldValue (field: NameField, modifiers: Set<FieldModifier>): string | undefined {
    // 1. Exact match for the fully modified field name.
    const fullKey = [field, ...[...modifiers].sort()].join('-')
    let result = this.fieldValues.get(fullKey)
    if (result !== undefined) {
      modifiers.clear()
      return result
    }

    // 2. The unmodified field is the fallback when no partial variant matches.
    result = this.fieldValues.get(field)
    if (modifiers.size <= 1) return result

    // 3. With several modifiers, find the stored key consuming the most of them.
    let winningKey = field as string
    let winningScore = 0
    for (const key of this.fieldValues.keys()) {
      if (key !== field && !key.startsWith(`${field}-`)) continue
      const keyModifiers = key.split('-').slice(1) as FieldModifier[]
      if (key !== field && keyModifiers.some((m) => !modifiers.has(m))) continue
      if (keyModifiers.length > winningScore ||
          (keyModifiers.length === winningScore && key < winningKey)) {
        winningKey = key
        winningScore = keyModifiers.length
      }
    }
    result = this.fieldValues.get(winningKey)
    for (const m of winningKey.split('-').slice(1)) {
      modifiers.delete(m as FieldModifier)
    }
    return result
  }
}

/**
 * Applies UTS #35 Part 8 "Handle core and prefix" to all field access made by
 * the formatter. This is deliberately separate from SimplePersonName so that
 * custom PersonName implementations receive the same adjustment.
 */
export function adjustCoreAndPrefix (name: PersonName): PersonName {
  return new CorePrefixPersonName(name)
}

class CorePrefixPersonName implements PersonName {
  private readonly inner: PersonName

  constructor (inner: PersonName) {
    this.inner = inner
  }

  getNameLocale (): string | undefined {
    return this.inner.getNameLocale()
  }

  getPreferredOrder (): PreferredOrder | undefined {
    return this.inner.getPreferredOrder()
  }

  getFieldValue (field: NameField, modifiers: Set<FieldModifier>): string | undefined {
    if (field !== 'surname' || (!modifiers.has('prefix') && !modifiers.has('core'))) {
      const direct = this.read(field, modifiers)
      if (direct !== undefined || field !== 'surname') return direct

      const prefix = this.variant('prefix')
      const core = this.variant('core')
      return combineCoreAndPrefix(prefix, core)
    }

    const plain = this.inner.getFieldValue('surname', new Set())
    const prefix = this.variant('prefix')
    const core = this.variant('core')

    if (modifiers.has('prefix')) {
      if (prefix === undefined || core === undefined) {
        modifiers.delete('prefix')
        return prefix === undefined ? undefined : ''
      }
      return this.readVariant('prefix', modifiers)
    }

    if (core !== undefined && (prefix !== undefined || plain === undefined)) {
      return this.readVariant('core', modifiers)
    }
    if (plain !== undefined) return this.readPlainForCore(modifiers)
    return undefined
  }

  private read (field: NameField, modifiers: Set<FieldModifier>): string | undefined {
    const remaining = new Set(modifiers)
    const value = this.inner.getFieldValue(field, remaining)
    if (value !== undefined) replaceModifiers(modifiers, remaining)
    return value
  }

  private variant (modifier: 'prefix' | 'core'): string | undefined {
    const remaining = new Set<FieldModifier>([modifier])
    const value = this.inner.getFieldValue('surname', remaining)
    return value !== undefined && value !== '' && !remaining.has(modifier) ? value : undefined
  }

  private readVariant (
    modifier: 'prefix' | 'core',
    modifiers: Set<FieldModifier>
  ): string {
    const remaining = new Set(modifiers)
    const value = this.inner.getFieldValue('surname', remaining)
    // variant() already established that the inner name handles this modifier.
    // PersonName requires handled modifiers to be consumed even when requested
    // alongside modifiers that the implementation leaves for the formatter.
    replaceModifiers(modifiers, remaining)
    return value as string
  }

  private readPlainForCore (modifiers: Set<FieldModifier>): string {
    const remaining = new Set(modifiers)
    remaining.delete('core')
    const value = this.inner.getFieldValue('surname', remaining)
    // The caller established that the plain field exists. Unsupported
    // modifiers remain in the set; they do not make an existing field absent.
    replaceModifiers(modifiers, remaining)
    return value as string
  }
}

function combineCoreAndPrefix (
  prefix: string | undefined,
  core: string | undefined
): string | undefined {
  if (core === undefined || core === '') return undefined
  return prefix === undefined || prefix === '' ? core : `${prefix} ${core}`
}

function replaceModifiers (target: Set<FieldModifier>, replacement: Set<FieldModifier>): void {
  target.clear()
  for (const modifier of replacement) target.add(modifier)
}
