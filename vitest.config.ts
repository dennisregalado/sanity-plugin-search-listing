import {fileURLToPath} from 'node:url'

import {defineConfig} from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Skill reference code imports the published entry; test it against the source.
      'sanity-plugin-search-listing/slug': fileURLToPath(
        new URL('./src/exports/slug.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'skills/**/*.test.ts'],
  },
})
