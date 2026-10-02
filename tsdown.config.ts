/**
 * tsdown preset for dsh-shell-expand: a node-half stub with declarations plus
 * a browser half (lib/client.js) wrapped for the harness client-plugin loader.
 *
 * The browser half keeps the loader's platform module table external (react,
 * cordis, store, slots, primitives, dockkit) and inlines everything else, so
 * the model helpers it borrows from `ui-tool` travel inside this bundle
 * instead of asking the module table for an identity the shell does not seed.
 * That is the same posture `dsh-diff-viewer` uses for the same reason.
 *
 * CSS Modules compile through lightningcss into the class map plus one
 * `<style data-plugin-css>` tag injected when the factory runs (the official
 * client bundles' mechanism, so unload removes the stylesheet with the
 * plugin).
 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'lightningcss'
import type { UserConfig } from 'tsdown'

const require = createRequire(import.meta.url)
/** The plugin root; CSS virtual ids stay project-root-relative so the emitted
 *  bundle carries no machine-specific absolute path. */
const PROJECT_ROOT = dirname(fileURLToPath(import.meta.url))
const PLUGIN_ID = '@dsh-external/dsh-shell-expand'

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

const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

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
    entry: { client: 'src/client/index.tsx' },
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
    }, {
      // CSS Modules → hashed class map + one injected <style data-plugin-css> tag.
      name: 'dsh-css-modules-inline',
      resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.module.css')) return null
        const abs = source.startsWith('@')
          ? source
          : importer !== undefined ? resolve(dirname(importer), source) : source
        const display = source.startsWith('@')
          ? abs
          // Forward slashes on every platform keep a Windows build and a Linux
          // CI build byte-identical.
          : relative(PROJECT_ROOT, abs).replaceAll('\\', '/')
        return CSS_VIRTUAL_PREFIX + display + CSS_VIRTUAL_SUFFIX
      },
      async load(virtualId: string) {
        if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
        const raw = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
        const fileId = raw.startsWith('@') ? require.resolve(raw) : resolve(PROJECT_ROOT, raw)
        this.addWatchFile(fileId)
        const source = await readFile(fileId)
        const { code, exports: cssExports } = transform({
          filename: fileId,
          code: source,
          // `[hash]` derives from the resolved absolute path, so a build on a
          // different machine mints different class names; the basename is stable.
          cssModules: { pattern: '[name]_[local]' },
          minify: true,
        })
        const classMap: Record<string, string> = {}
        // lightningcss exports its class map in hash-table order, which is not
        // stable across builds — sort so the bundle is reproducible.
        for (const local of Object.keys(cssExports ?? {}).sort()) classMap[local] = cssExports![local]!.name
        const tagId = `${PLUGIN_ID}/${basename(fileId)}`
        return [
          `const css = ${JSON.stringify(code.toString())};`,
          `const tagId = ${JSON.stringify(tagId)};`,
          // `typeof document` keeps this a no-op outside a browser (a bundle
          // smoke harness that evaluates the file in a non-DOM context).
          `if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {`,
          `  const tag = document.createElement('style');`,
          `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
          `  tag.dataset.pluginCss = tagId;`,
          `  tag.textContent = css;`,
          `  document.head.appendChild(tag);`,
          `}`,
          `export default ${JSON.stringify(classMap)};`,
        ].join('\n')
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
