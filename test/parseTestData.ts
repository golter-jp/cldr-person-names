import { readFileSync } from 'node:fs'

export interface TestParameters {
  order: 'givenFirst' | 'surnameFirst' | 'sorting'
  length: 'long' | 'medium' | 'short'
  usage: 'referring' | 'addressing' | 'monogram'
  formality: 'formal' | 'informal'
}

export interface TestCase {
  /** 1-based line number of the expectedResult line. */
  line: number
  fields: Record<string, string>
  nameLocale: string | undefined
  expected: string
  parameters: TestParameters[]
}

/** Parses one CLDR personNameTest data file. */
export function parseTestFile (path: string): TestCase[] {
  const cases: TestCase[] = []
  let fields: Record<string, string> = {}
  let nameLocale: string | undefined
  let current: TestCase | undefined

  const lines = readFileSync(path, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] as string).trim()
    if (line === '' || line.startsWith('#') || line.startsWith('enum ;')) continue
    if (line === 'endName') {
      fields = {}
      nameLocale = undefined
      current = undefined
      continue
    }
    const semi = line.indexOf(';')
    const keyword = line.slice(0, semi).trim()
    const rest = line.slice(semi + 1)
    if (keyword === 'name') {
      const semi2 = rest.indexOf(';')
      const field = rest.slice(0, semi2).trim()
      const value = rest.slice(semi2 + 1).trim()
      if (field === 'locale') {
        nameLocale = value
      } else if (value !== '') {
        fields[field] = value
      }
      current = undefined
    } else if (keyword === 'expectedResult') {
      current = {
        line: i + 1,
        fields: { ...fields },
        nameLocale,
        expected: rest.replace(/^ /, ''),
        parameters: []
      }
      cases.push(current)
    } else if (keyword === 'parameters') {
      if (current === undefined) {
        throw new Error(`${path}:${String(i + 1)}: parameters without expectedResult`)
      }
      const parts = rest.split(';').map((p) => p.trim())
      current.parameters.push({
        order: parts[0] as TestParameters['order'],
        length: parts[1] as TestParameters['length'],
        usage: parts[2] as TestParameters['usage'],
        formality: parts[3] as TestParameters['formality']
      })
    }
  }
  return cases
}
