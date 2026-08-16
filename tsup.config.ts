import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/browser.ts',
    'src/browser-full.ts',
    'src/burmese.ts',
    'src/extract-likely-subtags.ts',
    'src/index.ts',
    'src/node.ts'
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  shims: true,
  esbuildOptions (options) {
    options.supported = {
      ...options.supported,
      'import-attributes': true
    }
  }
})
