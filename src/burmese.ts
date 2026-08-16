/*
 * Portions adapted from ICU4J BurmeseBreakEngine and
 * DictionaryBreakEngine.PossibleWord (release 77.1).
 * Copyright © 2016 and later Unicode, Inc. and others.
 * Copyright (C) 2014, International Business Machines Corporation and
 * others. All Rights Reserved.
 * SPDX-License-Identifier: Unicode-3.0
 */
/**
 * Dictionary-based Burmese word segmentation, ported from ICU4J's
 * `BurmeseBreakEngine`. Used to derive initials for Myanmar-script text
 * consistently with CLDR's person-name conformance data. JavaScript word
 * segmentation is implementation-dependent: for some Myanmar text,
 * ICU4C-backed runtimes produce different boundaries from the ICU4J
 * `BreakIterator` used by CLDR tooling. This dictionary engine agrees with
 * the boundaries expected by the conformance data.
 *
 * Importing this module registers the segmenter with the formatter core.
 * It carries ICU's Burmese break dictionary (~300 kB), so it is not part of
 * the core entry point; the Node.js entry point registers it automatically.
 */
import encodedDict from './generated/burmese-dict.js'
import { setMyanmarWordSplitter } from './pattern.js'

// How many words in a row are "good enough"?
const BURMESE_LOOKAHEAD = 3
// Will not combine a non-word with a preceding dictionary word longer than this.
const BURMESE_ROOT_COMBINE_THRESHOLD = 3
// Will not combine a non-word that shares at least this much prefix with a
// dictionary word with a preceding word.
const BURMESE_PREFIX_COMBINE_THRESHOLD = 3
// Minimum word size.
const BURMESE_MIN_WORD = 2
// Maximum number of dictionary-word candidates tracked per position.
const POSSIBLE_WORD_LIST_MAX = 20

/** Myanmar ∩ LineBreak=SA (the characters the break engine handles). */
const SA_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1000, 0x103F], [0x1050, 0x108F], [0x109A, 0x109F],
  [0xA9E0, 0xA9EF], [0xA9FA, 0xA9FE], [0xAA60, 0xAA7F]
]

function isSA (c: number): boolean {
  return SA_RANGES.some(([lo, hi]) => c >= lo && c <= hi)
}

/** Basic consonants and independent vowels. */
function isBeginWord (c: number): boolean {
  return c >= 0x1000 && c <= 0x102A
}

const MARK = /\p{M}/u

/** Myanmar ∩ LineBreak=SA ∩ Mark, plus SPACE. */
function isMark (c: number): boolean {
  return c === 0x20 || (isSA(c) && MARK.test(String.fromCharCode(c)))
}

interface TrieNode {
  children: Map<number, TrieNode>
  isWord: boolean
}

let root: TrieNode | undefined

function getDictionary (): TrieNode {
  if (root === undefined) {
    root = { children: new Map(), isWord: false }
    let previous = ''
    for (const line of encodedDict.split('\n')) {
      const prefixLength = line.charCodeAt(0) - 48
      const word = previous.slice(0, prefixLength) + line.slice(1)
      previous = word
      let node = root
      for (let i = 0; i < word.length; i++) {
        const c = word.charCodeAt(i)
        let child = node.children.get(c)
        if (child === undefined) {
          child = { children: new Map(), isWord: false }
          node.children.set(c, child)
        }
        node = child
      }
      node.isWord = true
    }
  }
  return root
}

interface MatchResult {
  /** Lengths of dictionary words starting at the position, increasing. */
  lengths: number[]
  /** Length of the longest prefix shared with any dictionary word. */
  prefix: number
}

function matches (text: string, start: number, rangeEnd: number): MatchResult {
  let node = getDictionary()
  const lengths: number[] = []
  let prefix = 0
  for (let i = start; i < rangeEnd; i++) {
    const next = node.children.get(text.charCodeAt(i))
    if (next === undefined) break
    node = next
    prefix = i + 1 - start
    if (next.isWord && lengths.length < POSSIBLE_WORD_LIST_MAX) {
      lengths.push(prefix)
    }
  }
  return { lengths, prefix }
}

interface Iter {
  i: number
}

/** Port of ICU4J's `DictionaryBreakEngine.PossibleWord`. */
class PossibleWord {
  private lengths: number[] = []
  private prefix = 0
  private offset = -1
  private mark = 0
  private current = 0

  candidates (iter: Iter, text: string, rangeEnd: number): number {
    const start = iter.i
    if (start !== this.offset) {
      this.offset = start
      const result = matches(text, start, rangeEnd)
      this.lengths = result.lengths
      this.prefix = result.prefix
    }
    if (this.lengths.length > 0) {
      iter.i = start + (this.lengths[this.lengths.length - 1] as number)
    } else {
      iter.i = start
    }
    this.current = this.lengths.length - 1
    this.mark = this.current
    return this.lengths.length
  }

  acceptMarked (iter: Iter): number {
    const length = this.lengths[this.mark] as number
    iter.i = this.offset + length
    return length
  }

  backUp (iter: Iter): boolean {
    if (this.current > 0) {
      iter.i = this.offset + (this.lengths[--this.current] as number)
      return true
    }
    return false
  }

  longestPrefix (): number {
    return this.prefix
  }

  markCurrent (): void {
    this.mark = this.current
  }
}

/**
 * Port of ICU4J's `BurmeseBreakEngine.divideUpDictionaryRange`, applied to
 * the whole string (which must consist of Myanmar LineBreak=SA characters).
 * Returns the internal word-break offsets, exclusive of 0 and `text.length`.
 */
export function burmeseWordBreaks (text: string): number[] {
  const rangeStart = 0
  const rangeEnd = text.length
  const foundBreaks: number[] = []
  if (rangeEnd - rangeStart < BURMESE_MIN_WORD) return foundBreaks

  let wordsFound = 0
  const words: PossibleWord[] = []
  for (let i = 0; i < BURMESE_LOOKAHEAD; i++) words.push(new PossibleWord())
  const iter: Iter = { i: rangeStart }
  let current: number

  while ((current = iter.i) < rangeEnd) {
    let wordLength = 0

    // Look for candidate words at the current position.
    let candidates = (words[wordsFound % BURMESE_LOOKAHEAD] as PossibleWord)
      .candidates(iter, text, rangeEnd)

    if (candidates === 1) {
      // If we found exactly one, use it.
      wordLength = (words[wordsFound % BURMESE_LOOKAHEAD] as PossibleWord).acceptMarked(iter)
      wordsFound += 1
    } else if (candidates > 1) {
      // See which candidate can take us forward the most words.
      let foundBest = false
      if (iter.i < rangeEnd) {
        do {
          if ((words[(wordsFound + 1) % BURMESE_LOOKAHEAD] as PossibleWord)
            .candidates(iter, text, rangeEnd) > 0) {
            // Followed by another dictionary word; mark first as good.
            (words[wordsFound % BURMESE_LOOKAHEAD] as PossibleWord).markCurrent()
            if (iter.i >= rangeEnd) break
            // See if any of the possible second words is followed by a third.
            do {
              if ((words[(wordsFound + 2) % BURMESE_LOOKAHEAD] as PossibleWord)
                .candidates(iter, text, rangeEnd) > 0) {
                (words[wordsFound % BURMESE_LOOKAHEAD] as PossibleWord).markCurrent()
                foundBest = true
                break
              }
            } while ((words[(wordsFound + 1) % BURMESE_LOOKAHEAD] as PossibleWord).backUp(iter))
          }
        } while ((words[wordsFound % BURMESE_LOOKAHEAD] as PossibleWord).backUp(iter) && !foundBest)
      }
      wordLength = (words[wordsFound % BURMESE_LOOKAHEAD] as PossibleWord).acceptMarked(iter)
      wordsFound += 1
    }

    // Look ahead: if the next chunk is not a dictionary word, combine it with
    // the word we just found (if the preceding word is under the threshold).
    if (iter.i < rangeEnd && wordLength < BURMESE_ROOT_COMBINE_THRESHOLD) {
      candidates = (words[wordsFound % BURMESE_LOOKAHEAD] as PossibleWord)
        .candidates(iter, text, rangeEnd)
      if (candidates <= 0 &&
          (wordLength === 0 ||
            (words[wordsFound % BURMESE_LOOKAHEAD] as PossibleWord).longestPrefix() <
              BURMESE_PREFIX_COMBINE_THRESHOLD)) {
        // Scan forward to a plausible word boundary.
        let remaining = rangeEnd - (current + wordLength)
        let pc = text.charCodeAt(iter.i)
        let chars = 0
        for (;;) {
          iter.i++
          const uc = text.charCodeAt(iter.i)
          chars += 1
          if (--remaining <= 0) break
          if (isSA(pc) && isBeginWord(uc)) {
            // Maybe. See if it's in the dictionary.
            const candidate = (words[(wordsFound + 1) % BURMESE_LOOKAHEAD] as PossibleWord)
              .candidates(iter, text, rangeEnd)
            iter.i = current + wordLength + chars
            if (candidate > 0) break
          }
          pc = uc
        }
        if (wordLength <= 0) wordsFound += 1
        wordLength += chars
      } else {
        // Back up to where we were for the next iteration.
        iter.i = current + wordLength
      }
    }

    // Never stop before a combining mark.
    while (iter.i < rangeEnd && isMark(text.charCodeAt(iter.i))) {
      iter.i++
      wordLength += 1
    }

    // Each iteration either accepts a dictionary word or consumes at least
    // one code unit while scanning an unknown run.
    foundBreaks.push(current + wordLength)
  }

  // The loop terminates at rangeEnd, so its final break is the range end.
  foundBreaks.pop()
  return foundBreaks
}

/** Splits a run of Myanmar text into words using ICU's break dictionary. */
export function splitBurmeseWords (run: string): string[] {
  const breaks = burmeseWordBreaks(run)
  const result: string[] = []
  let start = 0
  for (const b of breaks) {
    result.push(run.slice(start, b))
    start = b
  }
  result.push(run.slice(start))
  return result
}

setMyanmarWordSplitter(splitBurmeseWords)
