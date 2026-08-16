import { defineConfig } from 'eslint/config'
import { neostandard, plugins } from 'neostandard'

export default defineConfig([
  ...neostandard({ ts: true }),
  {
    files: ['src/**/*.ts', 'test/**/*.ts', 'scripts/**/*.ts'],
    extends: [plugins['typescript-eslint'].configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true }
    }
  },
  {
    ignores: ['dist/**', 'test/data/**', 'node_modules/**', 'src/generated/**']
  }
])
