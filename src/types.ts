/**
 * Core types for CLDR person name formatting, following Unicode UTS #35
 * (LDML) Part 8: Person Names.
 *
 * Naming broadly follows ICU4J's `PersonNameFormatter` API; UTS #35 Part 8 is
 * the authority for behaviour.
 */

/** A name field in a PersonName object (UTS #35 Part 8, "Fields"). */
export type NameField =
  | 'title'
  | 'given'
  | 'given2'
  | 'surname'
  | 'surname2'
  | 'generation'
  | 'credentials'

/** Every {@link NameField}, for iterating or validating field names. */
export const NAME_FIELDS: readonly NameField[] = [
  'title', 'given', 'given2', 'surname', 'surname2', 'generation', 'credentials'
]

/** A modifier applied to a name field (UTS #35 Part 8, "Modifiers"). */
export type FieldModifier =
  | 'informal'
  | 'allCaps'
  | 'initialCap'
  | 'initial'
  | 'monogram'
  | 'prefix'
  | 'core'
  | 'retain'
  | 'vocative'
  | 'genitive'

/** Every {@link FieldModifier}, for iterating or validating modifier names. */
export const FIELD_MODIFIERS: readonly FieldModifier[] = [
  'informal', 'allCaps', 'initialCap', 'initial', 'monogram',
  'prefix', 'core', 'retain', 'vocative', 'genitive'
]

/**
 * Requested relative length of a formatted name.
 *
 * - `'long'` / `'medium'` / `'short'`: how much of the name the pattern
 *   includes, from most to least.
 * - `'default'`: take the length from the formatting locale's data.
 */
export type Length = 'long' | 'medium' | 'short' | 'default'

/**
 * What the formatted name will be used for.
 *
 * - `'referring'`: naming the person in running text.
 * - `'addressing'`: speaking or writing to the person.
 * - `'monogram'`: initials alone, e.g. for an avatar.
 */
export type Usage = 'addressing' | 'referring' | 'monogram'

/**
 * Requested formality of a formatted name.
 *
 * - `'formal'` / `'informal'`: use the patterns of that formality.
 * - `'default'`: take the formality from the formatting locale's data.
 */
export type Formality = 'formal' | 'informal' | 'default'

/**
 * The order in which name fields are laid out.
 *
 * - `'default'`: derive the order from the name itself (its `preferredOrder`
 *   property, or its locale matched against the formatting locale's
 *   `nameOrderLocales` data).
 * - `'sorting'`: use the patterns designed for sorted lists ("Smith, John").
 * - `'givenFirst'` / `'surnameFirst'`: force that order, overriding the
 *   name's own preferences.
 */
export type DisplayOrder = 'default' | 'sorting' | 'givenFirst' | 'surnameFirst'

/** The order preference a PersonName object itself can declare. */
export type PreferredOrder = 'givenFirst' | 'surnameFirst'

/** Concrete pattern-table order keys present in CLDR data. */
export type PatternOrder = 'givenFirst' | 'surnameFirst' | 'sorting'

/**
 * Person-name formatting data for one locale, in resolved (fully inherited)
 * form. This mirrors the `<personNames>` LDML element.
 */
export interface PersonNamesData {
  /** The locale this data describes, e.g. `'en'`, `'zh-Hant'`, `'und'` (root). */
  locale: string
  /** `nameOrderLocales order="givenFirst"`, e.g. `['und', 'en']`. */
  givenFirstLocales: string[]
  /** `nameOrderLocales order="surnameFirst"`, e.g. `['ja', 'ko', 'zh']`. */
  surnameFirstLocales: string[]
  /** `parameterDefault parameter="length"`. */
  defaultLength: 'long' | 'medium' | 'short'
  /** `parameterDefault parameter="formality"`. */
  defaultFormality: 'formal' | 'informal'
  /** Replacement for spaces when the name is in the formatting language. */
  nativeSpaceReplacement: string
  /** Replacement for spaces when the name is in a foreign language. */
  foreignSpaceReplacement: string
  /** `initialPattern type="initial"`, e.g. `'{0}.'`. */
  initialPattern: string
  /** `initialPattern type="initialSequence"`, e.g. `'{0} {1}'`. */
  initialSequencePattern: string
  /**
   * Name patterns indexed by order/length/usage/formality. Each cell is the
   * list of alternative patterns (primary first). Any cell may be absent —
   * CLDR itself defines no sorting/addressing patterns — and the formatter
   * falls back on the other formality, then referring, then root.
   */
  patterns: {
    [order in PatternOrder]?: {
      [length in 'long' | 'medium' | 'short']?: {
        [usage in Usage]?: {
          [formality in 'formal' | 'informal']?: string[]
        }
      }
    }
  }
}

/** Likely-subtags map, e.g. `{ 'und-Kana': 'ja-Kana-JP' }`. */
export type LikelySubtags = Record<string, string>

/** CLDR parent-locale mappings used when deriving a name's field order. */
export interface ParentLocales {
  /** Explicit child-to-parent locale mappings. */
  parents: Record<string, string>
  /** Parent selected by CLDR's `nonlikelyScript` rule, normally `und`. */
  nonlikelyScriptParent?: string
}

/**
 * The interface the formatter uses to pull data out of a name to be
 * formatted. Modeled on ICU4J's `com.ibm.icu.text.PersonName`.
 */
export interface PersonName {
  /** The name's locale (BCP 47 or underscore-separated), if known. */
  getNameLocale(): string | undefined
  /** The name's own field-order preference, if any. */
  getPreferredOrder(): PreferredOrder | undefined
  /**
   * Returns the value of `field`, applying/consuming any of `modifiers` the
   * name object itself can handle. Handled modifiers must be removed from
   * `modifiers` (a mutable set); the formatter applies default behavior for
   * whatever remains. Returns `undefined` when the name has no value for the
   * field at all.
   */
  getFieldValue(field: NameField, modifiers: Set<FieldModifier>): string | undefined
}
