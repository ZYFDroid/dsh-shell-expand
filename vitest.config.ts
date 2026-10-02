import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** DSH fork sources: the linked packages' published `exports` point at built
 *  `lib/` bundles (browser bundles for the `./client` faces), which a
 *  plugin-only checkout does not necessarily have. Tests resolve the same
 *  src entries the monorepo's own tsconfig paths select. */
const fork = fileURLToPath(new URL('../deepseek-harness/packages/client', import.meta.url))

/** React must be ONE instance: the fork's primitives call react hooks from
 *  inside this plugin's components, and two React copies break the hook
 *  dispatcher. The production bundle keeps react external (a platform
 *  module), so this is a test-only concern. */
const require = createRequire(import.meta.url)

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    environment: 'node',
    pool: 'threads',
  },
  resolve: {
    alias: [
      { find: 'react/jsx-dev-runtime', replacement: require.resolve('react/jsx-dev-runtime') },
      { find: 'react/jsx-runtime', replacement: require.resolve('react/jsx-runtime') },
      { find: 'react-dom', replacement: require.resolve('react-dom') },
      { find: 'react', replacement: require.resolve('react') },
      { find: '@deepseek-ai/dsh-client-ui-chat/client', replacement: `${fork}/ui-chat/src/client/index.ts` },
      { find: '@deepseek-ai/dsh-client-ui-renderer/client', replacement: `${fork}/ui-renderer/src/client/index.ts` },
      { find: '@deepseek-ai/dsh-client-ui-slots', replacement: `${fork}/ui-slots/src/index.ts` },
      { find: '@deepseek-ai/dsh-client-ui-primitives', replacement: `${fork}/ui-primitives/src/index.ts` },
      { find: '@deepseek-ai/dsh-client-ui-tool/client', replacement: `${fork}/ui-tool/src/client/index.ts` },
      { find: '@deepseek-ai/dsh-client-locale/client', replacement: `${fork}/locale/src/client/index.ts` },
      // Source-internal workspace edges of the packages aliased above.
      { find: '@deepseek-ai/dsh-client-store', replacement: `${fork}/store/src/index.ts` },
      { find: '@deepseek-ai/dsh-util-workspace-path', replacement: `${fork}/../util/workspace-path/src/index.ts` },
    ],
  },
})
