/**
 * Bundle smoke checks for dsh-shell-expand.
 *
 * Loads the REAL production client bundle (`lib/client.js`) through the same
 * facade the dsh web shell uses — `window.__ModuleLoader__.load({ id, factory })`
 * — and checks the two contracts a plugin can break without any type error:
 *
 * 1. **Registration.** The bundle registers under the plugin id, exports the
 *    `slots` injection, and claims the `bash` / `pwsh` toolview keys at a
 *    priority that shadows the shipped `bash` row.
 * 2. **The bundle actually loads.** Its factory runs to completion against a
 *    minimal module table and requests no platform module the shell does not
 *    seed, and the CSS it injects carries the wrapping rules that are the whole
 *    point of the plugin.
 *
 * Rendered-DOM coverage lives in `tests/shell-row.spec.tsx` (vitest). That suite
 * cannot start under a restricted Windows sandbox — vite probes mapped network
 * drives with a piped child process on startup, which the sandbox denies — so
 * this file is the check that works everywhere, and it verifies the shipped
 * artifact rather than the sources.
 *
 * Usage: node tools/run-bundle-smoke.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Assertion counter and failure list. */
let checks = 0
const failures = []

/**
 * Record one assertion.
 * @param {string} label - what was asserted.
 * @param {unknown} actual - the observed value.
 * @param {unknown} expected - the expected value.
 */
function is(label, actual, expected) {
  checks += 1
  if (actual !== expected) failures.push(`${label}\n    expected: ${String(expected)}\n    actual:   ${String(actual)}`)
}

/**
 * Record one truthiness assertion.
 * @param {string} label - what was asserted.
 * @param {unknown} actual - the observed value.
 */
function ok(label, actual) {
  checks += 1
  if (!actual) failures.push(`${label}\n    expected a truthy value\n    actual:   ${String(actual)}`)
}

/**
 * Record one regular-expression assertion.
 * @param {string} label - what was asserted.
 * @param {string} text - the text to search.
 * @param {RegExp} pattern - the pattern the text must match.
 */
function matches(label, text, pattern) {
  checks += 1
  if (!pattern.test(text)) failures.push(`${label}\n    pattern: ${String(pattern)}\n    text:    ${text.slice(0, 400)}`)
}

// ------------------------------------------------------------------- the shell
/** Injected `<style>` tags, keyed the way the shell keys them. */
const styleTags = new Map()
/** Minimal `document.head` stand-in for the bundle's style injection. */
const head = {
  appendChild(node) {
    styleTags.set(node.dataset.pluginCss, node.textContent)
  },
}
const documentStub = {
  head,
  querySelector: () => null,
  createElement: () => ({ dataset: {}, textContent: '' }),
}

/**
 * Minimal `react/jsx-runtime` stand-in. Element creation runs at the bundle's
 * module scope (the row's icon constant), so the factory cannot execute without
 * these two exports; nothing here renders, so a descriptor is enough.
 */
const jsxRuntime = {
  jsx: (type, props, key) => ({ type, props, key }),
  jsxs: (type, props, key) => ({ type, props, key }),
  Fragment: Symbol('Fragment'),
}

/** The module table the shell seeds into every dynamic client bundle. */
const platformModules = {
  'react': {},
  'react/jsx-runtime': jsxRuntime,
  'react-dom': {},
  'react-dom/client': {},
  '@deepseek-ai/dsh-client-store': {},
  '@deepseek-ai/dsh-client-ui-slots': {},
  '@deepseek-ai/dsh-client-ui-primitives': {},
  '@deepseek-ai/dsh-client-ui-dockkit': {},
}

/** Registrations handed to the loader facade, keyed by plugin id. */
const registered = new Map()
const windowStub = {
  __ModuleLoader__: { load({ id, factory }) { registered.set(id, factory) } },
  document: documentStub,
}

const bundle = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8')
// One indirect eval with the shell's own globals in scope: the bundle's
// top-level `window.__ModuleLoader__.load(...)` call and its CSS injection both
// need to reach the stand-ins above.
const run = new Function('window', 'document', 'globalThis', bundle)
run(windowStub, documentStub, globalThis)

const PLUGIN_ID = '@dsh-external/dsh-shell-expand'
ok(`the bundle registers itself as ${PLUGIN_ID}`, registered.has(PLUGIN_ID))
const factory = registered.get(PLUGIN_ID)
is('the registration carries a factory', typeof factory, 'function')

/** Module specifiers the factory actually requested. */
const requested = []
const plugin = factory((specifier) => {
  requested.push(specifier)
  const module = platformModules[specifier]
  if (module === undefined) throw new Error(`unknown platform module requested: ${specifier}`)
  return module
})

ok('the factory returned the plugin namespace', plugin !== undefined && plugin !== null)
is('the client half exports apply', typeof plugin.apply, 'function')
is('the client half injects the slots service', JSON.stringify(plugin.inject), JSON.stringify(['slots']))
is(
  'the bundle requests only seeded platform modules',
  requested.filter(specifier => !(specifier in platformModules)).join(', '),
  '',
)

// ------------------------------------------------------- Hook-order structure
// React error #300 ("Rendered fewer hooks than expected") fires when one mounted
// component changes how many Hooks it calls between two renders. A keyed row's
// component instance survives the `preparing → start → result` transitions, and
// `useToolCallArgumentsPartial` is only valid while preparing, so the preparing
// phase must be a component of its own that the started phase replaces as a
// different element type (which unmounts it and resets the Hook list). The
// rendered proof is `tests/shell-row.spec.tsx`; these are the artifact-level
// signals that the split is still in place.
ok('the preparing row is its own component in the bundle', bundle.includes('PreparingShellRow'))
ok('the started row is its own component in the bundle', bundle.includes('StartedShellRow'))
// Settlement must come from the framework's `phase`, never from the block's own
// discriminant. Inferring it from `'kind' in block` read a start-phase block that
// carried a `kind` as settled, which took the arguments from the absent result
// call head: an empty payload, no terminal card, and the bare-arguments fallback
// where the command should be.
ok('the row does not infer settlement from the block discriminant', !bundle.includes('"kind" in'))
// The phase dispatcher is the ONLY thing ShellRow may do: it must not reach for
// the preparing-only Hook out here.
const shellRowBody = /function ShellRow\([^)]*\)\s*\{([^}]*)\}/.exec(bundle)?.[1] ?? ''
ok('the row dispatcher itself calls no Hook', shellRowBody !== '' && !shellRowBody.includes('use'))

// -------------------------------------------------------------- registration
/** The registered toolviews, keyed by the tool name they claim. */
const registrations = new Map()
const ctx = {
  slots: {
    inject(name, run) {
      is('the contribution waits on the toolview slot', name, 'tool.call.toolview')
      for (const _ of run()) { /* drain: registrations land in the map below */ }
    },
    register(options, component) {
      registrations.set(options.key, { options, component })
      return () => {}
    },
  },
}
plugin.apply(ctx)

is('both shell keys are claimed', [...registrations.keys()].join(','), 'bash,pwsh')
is('bash shadows the shipped row', registrations.get('bash')?.options.priority, -1)
is('pwsh shadows the shipped row', registrations.get('pwsh')?.options.priority, -1)
is('the row declares the conversation namespace', registrations.get('bash')?.options.locale, 'conversation')
is('the row is a React component', typeof registrations.get('bash')?.component, 'function')

// ---------------------------------------------------------------------- styles
is('the bundle injected one stylesheet', styleTags.size, 1)
const css = [...styleTags.values()][0] ?? ''
matches('the header summary stays a single truncated line', css, /text-overflow:\s*ellipsis/)
// lightningcss lowers `flex: 1 1 auto` to its `flex: auto` equivalent.
matches('the summary is the element that shrinks', css, /flex:\s*auto/)
matches('a long unbroken token still breaks', css, /word-break:\s*break-word/)
matches('the terminal banner wraps the command', css, /--dsl-terminal-command-whitespace:\s*pre-wrap/)
matches('the terminal output wraps too', css, /--dsl-terminal-line-whitespace:\s*pre-wrap/)
matches('the disclosure row stops clipping', css, /overflow:\s*visible/)
// The header must never re-render the command: doing so duplicated a long command
// into both the summary row and the banner, which is the second reported defect.
ok('the row has no header-command rule of its own', !/\.shell-row-module_command/.test(css))
// A running call must show the command it is running, even when the terminal card
// refuses to draw it (a backgrounded or persistent shell). The marker is that
// banner's own body.
ok('the bundle carries the running-command body marker', bundle.includes('data-shell-running-body'))
matches('the running-command body lays out as a column', css, /\.shell-row-module_syntheticBody\{/)
// The elapsed clock: a running call reports how long it has been going, in ONE
// place. Rendering the same readout twice (once in the header, once above the
// card) is the defect this pins — it read as "one time became two" on remount.
ok('the bundle carries the elapsed-label class', /\.shell-row-module_elapsed\{/.test(css))
matches('the elapsed label uses tabular figures so it does not jitter', css, /font-variant-numeric:\s*tabular-nums/)
is('the elapsed readout has exactly one stylesheet rule', (css.match(/shell-row-module_elapsed/g) ?? []).length, 1)
ok('the bundle no longer carries a second readout site', !bundle.includes('data-shell-running-meta'))
// The paired form `elapsed / timeout` is composed in the row, and the timeout
// side comes from the call's own argument rather than the stylesheet.
matches('the readout composes elapsed over timeout', bundle, /`\$\{elapsed\} \/ \$\{timeout\}`/)

// ------------------------------------------------------------------- reporting
for (const failure of failures) console.error(`FAIL  ${failure}`)
console.log(`\n${checks - failures.length}/${checks} checks passed`)
if (failures.length > 0) process.exitCode = 1
