import { afterEach, describe, expect, test, vi } from 'vitest'

const originalArgv = process.argv
const originalExitCode = process.exitCode

afterEach(() => {
  process.argv = originalArgv
  process.exitCode = originalExitCode
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('likely-subtags CLI', { concurrent: false }, () => {
  test('prints usage and fails when no locales are supplied', async () => {
    process.argv = ['node', 'extract-likely-subtags.js']
    process.exitCode = undefined
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await import('../src/extract-likely-subtags.js')

    expect(error).toHaveBeenCalledWith(
      'Usage: cldr-person-names-extract-likely-subtags <locale>...'
    )
    expect(process.exitCode).toBe(1)
  })

  test('writes a raw CLDR JSON subset for the supplied locales', async () => {
    process.argv = ['node', 'extract-likely-subtags.js', 'de', 'ja']
    process.exitCode = undefined
    let written = ''
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written += String(chunk)
      return true
    })

    await import('../src/extract-likely-subtags.js')

    const output = JSON.parse(written) as {
      supplemental: { likelySubtags: Record<string, string> }
    }
    expect(output.supplemental.likelySubtags).toMatchObject({
      de: 'de-Latn-DE',
      ja: 'ja-Jpan-JP',
      'und-Jpan': 'ja-Jpan-JP'
    })
    expect(process.exitCode).toBeUndefined()
  })
})
