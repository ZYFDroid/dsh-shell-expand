import { defineConfig } from 'vitest/config'

/**
 * The suite drives a real DOM and imports nothing from the harness: the client
 * half reads the markers the shipped rows publish, so the specs stand up their
 * own fixture rows. `environment: 'node'` is the shared default; the one DOM
 * spec opts into jsdom with its own `// @vitest-environment jsdom` pragma.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    pool: 'threads',
  },
})
