/*
 * Portions adapted from ICU4J PersonNameFormatterImpl (release 77.1).
 * Copyright © 2022 and later Unicode, Inc. and others.
 * SPDX-License-Identifier: Unicode-3.0
 */
/**
 * Character-script detection and script matching, per UTS #35 Part 8
 * "Derive the name locale" and "Switch the formatting locale if necessary".
 */

/**
 * Unicode script codes recognized when detecting the script of a name from
 * its characters. Ordered so that frequently seen scripts are tried first.
 * Codes are the short (ISO 15924) aliases accepted by `\p{sc=...}`.
 *
 * Every entry must be a Unicode script property value, not merely a valid
 * ISO 15924 code: one the engine does not know throws when its regex is
 * built. All of these are Unicode 12 or older, and requiring `Intl.Segmenter`
 * already rules out any engine below Unicode 13.
 */
const DETECTABLE_SCRIPTS: readonly string[] = [
  'Latn', 'Cyrl', 'Arab', 'Deva', 'Hani', 'Hira', 'Kana', 'Hang',
  'Grek', 'Hebr', 'Thai', 'Beng', 'Guru', 'Gujr', 'Orya', 'Taml',
  'Telu', 'Knda', 'Mlym', 'Sinh', 'Mymr', 'Khmr', 'Laoo', 'Tibt',
  'Ethi', 'Geor', 'Armn', 'Cher', 'Cans', 'Nkoo', 'Adlm', 'Tfng',
  'Vaii', 'Olck', 'Mtei', 'Cakm', 'Lana', 'Thaa', 'Yiii', 'Mong',
  'Syrc', 'Copt', 'Bopo', 'Java', 'Bali', 'Sund', 'Batk', 'Bugi',
  'Cham', 'Tale', 'Talu', 'Kali', 'Lepc', 'Limb', 'Saur', 'Sylo',
  'Tavt', 'Rjng', 'Osge', 'Rohg', 'Wcho', 'Gong', 'Gonm', 'Hmnp',
  'Newa', 'Tirh', 'Bamu', 'Bass', 'Mend', 'Medf', 'Osma', 'Orkh',
  'Ogam', 'Runr', 'Glag', 'Dsrt', 'Shaw', 'Plrd', 'Lisu'
]

const scriptRegexCache = new Map<string, RegExp>()

function scriptRegex (code: string): RegExp {
  let re = scriptRegexCache.get(code)
  if (re === undefined) {
    re = new RegExp(`\\p{sc=${code}}`, 'u')
    scriptRegexCache.set(code, re)
  }
  return re
}

const NOT_COMMON = /[^\p{sc=Zyyy}\p{scx=Zinh}\p{sc=Zzzz}]/u

/** Returns the script code of a single character, or undefined. */
export function scriptOfChar (ch: string): string | undefined {
  if (!NOT_COMMON.test(ch)) return undefined
  for (const code of DETECTABLE_SCRIPTS) {
    if (scriptRegex(code).test(ch)) return code
  }
  return undefined
}

/**
 * Determines the "name script": the script of the first character (searching
 * the surname then the given name) that is not Common, Inherited, or
 * Unknown. Returns `'Zzzz'` if no such character exists.
 */
export function detectNameScript (surname: string, given: string): string {
  for (const ch of surname + given) {
    const script = scriptOfChar(ch)
    if (script !== undefined) return script
  }
  return 'Zzzz'
}

/**
 * Script codes that denote sets of Unicode scripts. Used when matching a
 * detected character script against a locale's (likely) script.
 */
const SCRIPT_SETS: Record<string, readonly string[]> = {
  Jpan: ['Hani', 'Hira', 'Kana'],
  Kore: ['Hang', 'Hani'],
  Hanb: ['Hani', 'Bopo'],
  Hrkt: ['Hira', 'Kana'],
  Hans: ['Hani'],
  Hant: ['Hani']
}

function scriptSet (code: string): readonly string[] {
  return SCRIPT_SETS[code] ?? [code]
}

/**
 * Two script codes match when identical, when one denotes a set containing
 * the other, or when both denote intersecting sets.
 */
export function scriptsMatch (a: string, b: string): boolean {
  if (a === b) return true
  const setA = scriptSet(a)
  const setB = scriptSet(b)
  return setA.some((s) => setB.includes(s)) || setA.includes(b) || setB.includes(a)
}
