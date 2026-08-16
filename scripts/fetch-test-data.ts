/**
 * Fetches the CLDR person-name conformance test data
 * (common/testData/personNameTest) from unicode-org/cldr at a pinned commit,
 * into test/data/personNameTest.
 *
 * The test data is NOT vendored into this repository; it is downloaded on
 * demand and cached locally (test/data is gitignored). The pinned commit must
 * match the CLDR version of the cldr-json packages in package.json.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CLDR_TAG = 'release-48-2'
// release-48-2 is an annotated tag, so this is the commit it peels to. A tag
// can be moved; fetching the commit directly is what makes the suite pinned.
const CLDR_COMMIT = '11299982335beb974c1c63c45265184e759c0f41'
const CLDR_REPO = 'https://github.com/unicode-org/cldr.git'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const targetDir = join(root, 'test', 'data', 'personNameTest')
const stampFile = join(root, 'test', 'data', '.cldr-tag')
const stamp = `${CLDR_TAG} ${CLDR_COMMIT}`

export function fetchTestData ({ force = false } = {}) {
  if (!force && existsSync(targetDir) && existsSync(stampFile) &&
      readFileSync(stampFile, 'utf8').trim() === stamp) {
    return targetDir
  }

  console.log(`Fetching CLDR person-name test data (${CLDR_TAG})...`)
  const tmpDir = join(root, 'test', 'data', '.cldr-tmp')
  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })
  const git = (...args: string[]): void => {
    execFileSync('git', ['-C', tmpDir, ...args], { stdio: 'inherit' })
  }
  git('init', '--quiet')
  git('remote', 'add', 'origin', CLDR_REPO)
  git('sparse-checkout', 'init', '--cone')
  git('sparse-checkout', 'set', 'common/testData/personNameTest')
  git('fetch', '--depth', '1', '--filter=blob:none', '--no-tags', '--quiet',
    'origin', CLDR_COMMIT)
  git('checkout', '--quiet', 'FETCH_HEAD')

  rmSync(targetDir, { recursive: true, force: true })
  cpSync(join(tmpDir, 'common', 'testData', 'personNameTest'), targetDir, {
    recursive: true
  })
  rmSync(tmpDir, { recursive: true, force: true })
  writeFileSync(stampFile, stamp + '\n')
  console.log(`Test data ready in ${targetDir}`)
  return targetDir
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fetchTestData({ force: process.argv.includes('--force') })
}
