/**
 * tsdown preset for dsh-shell-expand: a node-half stub with declarations plus
 * a browser half (lib/client.js) wrapped for the harness client-plugin loader.
 *
 * The browser half imports nothing at all: it reads the DOM markers the shipped
 * Tool rows publish and clicks a disclosure, so it requests no module from the
 * loader's platform table and ships no stylesheet. The purity gate below stays
 * as the guard against a future cross-plugin value import, which would either
 * inline a duplicate instance or request a module-table key the shell never
 * seeded.
 */
import type { UserConfig } from 'tsdown'

const PLUGIN_ID = 'dsh-shell-expand'

/** Module specifiers the dsh web shell shares into its frozen module table
 *  (packages/client/web/src/platform.ts, the upstream single source of truth).
 *  A bundle may request only these: anything else must be inlined or the
 *  factory throws at materialization. */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
] as const

const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES]

export default [
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: true,
    clean: true,
    deps: {
      neverBundle: ['schemastery', 'cordis'],
    },
  },
  {
    // Browser bundle: lib/client.js, served by the harness at /plugins/<id>/client.js.
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    clean: false,
    deps: {
      neverBundle: [...CLIENT_EXTERNALS],
      alwaysBundle: (id: string) => !CLIENT_EXTERNALS.includes(id),
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
    plugins: [{
      // Bundle purity gate: platform seed entries stay external, every other
      // @deepseek-ai value import is a build error (a cross-plugin value
      // import would either inline a duplicate instance or request a module
      // table key the shell never seeded).
      name: 'dsh-client-bundle-purity',
      resolveId(source: string) {
        if (!source.startsWith('@deepseek-ai/')) return null
        if (CLIENT_EXTERNALS.includes(source)) return null
        throw new Error(
          `client bundle purity: "${source}" is not a platform module (CLIENT_EXTERNALS) — `
          + 'cross-plugin value imports are forbidden; collaborate through cordis services',
        )
      },
    }],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      footer: `return module.exports; } });`,
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
] satisfies UserConfig[]
