/**
 * Packs the package, installs the tarball into a throwaway consumer, and
 * loads every export subpath by both `import` and `require`.
 *
 * The test suite imports src/*.ts directly, so nothing else exercises the
 * exports map, the emitted declarations, the bin shebang, or the fact that an
 * ESM-only package still has to be require()-able.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Every export subpath, with named exports it must provide. */
const SUBPATHS = {
  '': ['PersonNameFormatter', 'SimplePersonName'],
  '/core': ['PersonNameFormatter', 'registerData'],
  '/node': ['PersonNameFormatter', 'CldrJsonDataProvider'],
  '/browser': ['PersonNameFormatter', 'createCldrDataRegistry'],
  '/browser/full': ['PersonNameFormatter', 'createFullCldrDataRegistry'],
  '/burmese': ['splitBurmeseWords', 'burmeseWordBreaks']
}

const ADA = "{ locale: 'en', fields: { given: 'Ada', surname: 'Lovelace' } }"
const OPTIONS = "locale: 'en', length: 'medium', usage: 'referring', formality: 'formal'"

// Loading /browser registers root data with the global registry, displacing
// the Node data provider, so the two checks need separate processes.
const CHECKS = {
  subpaths: `
for (const [subpath, names] of Object.entries(${JSON.stringify(SUBPATHS)})) {
  const mod = await load('cldr-person-names' + subpath)
  for (const name of names) {
    assert.equal(typeof mod[name], 'function', (subpath || '.') + ' is missing ' + name)
  }
}
const full = await load('cldr-person-names/browser/full')
const formatter = new full.PersonNameFormatter({
  ${OPTIONS}, dataProvider: full.createFullCldrDataRegistry()
})
assert.equal(formatter.formatToString(${ADA}), 'Ada Lovelace')
`,
  entry: `
const { PersonNameFormatter } = await load('cldr-person-names')
assert.equal(new PersonNameFormatter({ ${OPTIONS} }).formatToString(${ADA}), 'Ada Lovelace')
`
}

const PRELUDE = {
  mjs: "import assert from 'node:assert/strict'\nconst load = (s) => import(s)\n",
  cjs: "const assert = require('node:assert/strict')\nconst load = (s) => require(s)\n"
}

const work = mkdtempSync(join(tmpdir(), 'cldr-person-names-smoke-'))
try {
  execFileSync('pnpm', ['pack', '--pack-destination', work], { cwd: root, stdio: 'inherit' })
  const tarball = readdirSync(work).find((name) => name.endsWith('.tgz'))
  if (tarball === undefined) throw new Error('pnpm pack produced no tarball')

  writeFileSync(join(work, 'package.json'),
    '{ "name": "smoke", "version": "0.0.0", "private": true, "type": "module" }\n')
  execFileSync('pnpm', ['add', join(work, tarball)], { cwd: work, stdio: 'inherit' })

  for (const [label, body] of Object.entries(CHECKS)) {
    for (const ext of ['mjs', 'cjs'] as const) {
      const file = `${label}.${ext}`
      writeFileSync(join(work, file), `${PRELUDE[ext]}void (async () => {${body}})()\n`)
      execFileSync('node', [file], { cwd: work, stdio: 'inherit' })
      console.log(`  ok  ${file}`)
    }
  }

  const runCli = (command: string): void => {
    const output = execFileSync(command, ['en'], { encoding: 'utf8' })
    const json = JSON.parse(output) as {
      supplemental: { likelySubtags: Record<string, string> }
    }
    if (json.supplemental.likelySubtags.en !== 'en-Latn-US') {
      throw new Error(`${command} produced unexpected output: ${output.slice(0, 200)}`)
    }
  }

  // pnpm's .bin entry is a shell wrapper that invokes node, so only running
  // the installed file itself exercises the shebang and the executable bit.
  runCli(join(work, 'node_modules', '.bin', 'cldr-person-names-extract-likely-subtags'))
  console.log('  ok  bin mapping')
  runCli(join(work, 'node_modules', 'cldr-person-names', 'dist', 'extract-likely-subtags.js'))
  console.log('  ok  bin shebang')
} finally {
  rmSync(work, { recursive: true, force: true })
}
