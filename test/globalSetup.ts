// Downloads the CLDR conformance test data (pinned tag) before tests run.
import { fetchTestData } from '../scripts/fetch-test-data.js'

export default function setup (): void {
  fetchTestData()
}
