import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { PersonNameFormatter, SimplePersonName } from '../src/node.js'
import { parseTestFile } from './parseTestData.js'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data', 'personNameTest')

let files: string[] = []
try {
  files = readdirSync(dataDir).filter((f) => f.endsWith('.txt') && !f.startsWith('_'))
} catch {
  throw new Error(
    'CLDR person-name test data was not available after global test setup.'
  )
}

interface Failure {
  line: number
  parameters: string
  expected: string
  actual: string
  fields: Record<string, string>
  nameLocale: string | undefined
}

describe('CLDR personNameTest conformance', () => {
  test.for(files)('%s', (file) => {
    const locale = file.replace(/\.txt$/, '')
    const cases = parseTestFile(join(dataDir, file))
    expect(cases.length).toBeGreaterThan(0)

    const formatters = new Map<string, PersonNameFormatter>()
    const failures: Failure[] = []
    let total = 0

    for (const testCase of cases) {
      const name = new SimplePersonName({
        ...(testCase.nameLocale !== undefined ? { locale: testCase.nameLocale } : {}),
        fields: testCase.fields
      })
      for (const parameters of testCase.parameters) {
        total++
        const key = `${parameters.order}-${parameters.length}-${parameters.usage}-${parameters.formality}`
        let formatter = formatters.get(key)
        if (formatter === undefined) {
          formatter = new PersonNameFormatter({
            locale,
            displayOrder: parameters.order,
            length: parameters.length,
            usage: parameters.usage,
            formality: parameters.formality
          })
          formatters.set(key, formatter)
        }
        let actual: string
        try {
          actual = formatter.formatToString(name)
        } catch (e) {
          actual = `<threw: ${(e as Error).message}>`
        }
        if (actual !== testCase.expected) {
          failures.push({
            line: testCase.line,
            parameters: key,
            expected: testCase.expected,
            actual,
            fields: testCase.fields,
            nameLocale: testCase.nameLocale
          })
        }
      }
    }

    if (failures.length > 0) {
      const sample = failures.slice(0, 8).map((f) =>
        `  line ${String(f.line)} [${f.parameters}] name=${JSON.stringify(f.fields)} ` +
        `locale=${String(f.nameLocale)}\n` +
        `    expected: ${JSON.stringify(f.expected)}\n` +
        `    actual:   ${JSON.stringify(f.actual)}`
      ).join('\n')
      expect.fail(
        `${String(failures.length)}/${String(total)} cases failed in ${file}:\n${sample}` +
        (failures.length > 8 ? `\n  ... and ${String(failures.length - 8)} more` : '')
      )
    }
  })
})
