/**
 * Bundle smoke checks for dsh-shell-expand.
 *
 * Loads the REAL production client bundle (`lib/client.js`) through the same
 * facade the dsh web shell uses — `window.__ModuleLoader__.load({ id, factory })`
 * — inside jsdom, and checks the three contracts a plugin can break without any
 * type error:
 *
 * 1. **Identity.** The bundle registers under the manifest name, and the
 *    manifest, `dsh.plugin.json`, and the bundle patch all agree on it.
 * 2. **Loading.** The factory runs to completion and requests NO platform module
 *    (this half imports nothing), and the client half exports `apply` with an
 *    empty `inject` list — it needs no cordis service.
 * 3. **Behavior.** Applying it to a ctx double opens the shell rows present at
 *    load and the ones inserted later, leaves every other tool row alone, and
 *    stops observing when the fiber unloads.
 *
 * The rendered proof lives in `tests/auto-expand.spec.ts` (vitest). That suite
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
import { JSDOM } from 'jsdom'

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

/** Let the MutationObserver deliver its queued records. */
const settle = () => new Promise((resolve) => { setTimeout(resolve, 0) })

// ------------------------------------------------------------------- identity
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const PLUGIN_ID = manifest.name
// The plugin list shows this string verbatim, so an accidental scope makes the
// entry read `@scope/name` next to unscoped siblings. Pin the display form.
matches('the manifest name carries no npm scope', PLUGIN_ID, /^(?!@)[a-z0-9][a-z0-9._~-]*$/)
is('dsh.plugin.json agrees with the manifest name', JSON.parse(readFileSync(join(ROOT, 'dsh.plugin.json'), 'utf8')).id, PLUGIN_ID)
matches('the bundle patch inserts the same name', readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8'), new RegExp(`name:\\s*${PLUGIN_ID}\\s*$`, 'm'))
is('the manifest declares the runtime range the DOM markers need', manifest.engines?.dsh, '>=0.2.0-rc.2')

// -------------------------------------------------------------------- loading
const dom = new JSDOM('<!doctype html><html><body></body></html>')
const { window } = dom
const { document } = window

/** Registrations handed to the loader facade, keyed by plugin id. */
const registered = new Map()
window.__ModuleLoader__ = { load({ id, factory }) { registered.set(id, factory) } }

const bundle = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8')
/** Every module specifier the factory asks for. */
const requested = []
// One indirect eval with the shell's own globals in scope: the bundle's
// top-level `window.__ModuleLoader__.load(...)` call needs the stand-in above,
// and its DOM reads need jsdom's document and constructors rather than Node's
// (absent) globals.
const run = new Function('window', 'document', 'Element', 'MutationObserver', bundle)
run(window, document, window.Element, window.MutationObserver)

ok(`the bundle registers itself as ${PLUGIN_ID}`, registered.has(PLUGIN_ID))
const factory = registered.get(PLUGIN_ID)
is('the registration carries a factory', typeof factory, 'function')
const plugin = factory((specifier) => {
  requested.push(specifier)
  throw new Error(`unknown platform module requested: ${specifier}`)
})
ok('the factory returned the plugin namespace', plugin !== undefined && plugin !== null)
is('the client half exports apply', typeof plugin.apply, 'function')
is('the client half needs no cordis service', JSON.stringify(plugin.inject), '[]')
is('the bundle requests no platform module at all', requested.join(', '), '')

// ------------------------------------------------------------------- behavior
/**
 * Make one element the row's disclosure target, behaving like React's: a press
 * flips `aria-expanded` and grows or drops the body.
 * @param {object} row - the fixture row being wired.
 * @returns {object} the fixture row.
 */
function wire(row) {
  row.header.setAttribute('data-expandable', '')
  row.header.setAttribute('aria-expanded', 'false')
  row.header.addEventListener('click', () => {
    row.clicks += 1
    const open = row.header.getAttribute('aria-expanded') === 'true'
    row.header.setAttribute('aria-expanded', open ? 'false' : 'true')
    const body = row.root.querySelector('[data-body]')
    if (open) {
      body?.remove()
      return
    }
    const next = document.createElement('div')
    next.setAttribute('data-body', '')
    row.root.append(next)
  })
  return row
}

/**
 * A row whose header IS the row element: the shipped bash row's shape.
 * @param {Record<string, string>} attributes - the row's published markers.
 * @returns {object} the fixture row.
 */
function headerRow(attributes) {
  const root = document.createElement('div')
  for (const [name, value] of Object.entries(attributes)) root.setAttribute(name, value)
  return wire({ root, header: root, clicks: 0 })
}

/**
 * A row that nests its disclosure row: the generic Tool row's shape.
 * @param {Record<string, string>} attributes - the row's published markers.
 * @returns {object} the fixture row.
 */
function nestedRow(attributes) {
  const root = document.createElement('div')
  for (const [name, value] of Object.entries(attributes)) root.setAttribute(name, value)
  const header = document.createElement('div')
  header.setAttribute('data-disclosure-header', '')
  const disclosure = document.createElement('div')
  disclosure.setAttribute('data-disclosure-row', '')
  header.append(disclosure)
  root.append(header)
  return wire({ root, header: disclosure, clicks: 0 })
}

const bashRow = headerRow({ 'data-sample': 'bash', 'data-variant': 'bash', 'data-state': 'running' })
const pwshRow = nestedRow({ 'data-tool': 'pwsh', 'data-variant': 'pwsh', 'data-state': 'running' })
const editRow = nestedRow({ 'data-tool': 'edit', 'data-variant': 'edit', 'data-state': 'running' })
const historyRow = nestedRow({ 'data-tool': 'bash', 'data-variant': 'bash', 'data-state': 'ok' })
const foldedRow = nestedRow({ 'data-tool': 'pwsh', 'data-variant': 'pwsh', 'data-state': 'running' })
const foldedTurn = document.createElement('div')
foldedTurn.setAttribute('data-turn-process-hidden', '')
foldedTurn.append(foldedRow.root)
document.body.append(bashRow.root, pwshRow.root, editRow.root, historyRow.root, foldedTurn)

/** The effect disposer the client fiber would run on unload. */
let dispose = () => {}
plugin.apply({
  effect(effect) {
    const cleanup = effect()
    dispose = () => { cleanup?.() }
    return dispose
  },
})
await settle()

is('the running bash row already rendered at load opens', bashRow.clicks, 1)
is('the running pwsh row already rendered at load opens', pwshRow.clicks, 1)
is('a non-shell row is left alone', editRow.clicks, 0)
is('a settled row rendered at load stays collapsed', historyRow.clicks, 0)
is('a row inside a folded Turn is left alone', foldedRow.clicks, 0)
is('the opened row records what the plugin did', bashRow.root.getAttribute('data-shell-expand'), 'opened')
is('the expanded row renders its body', bashRow.root.querySelector('[data-body]') === null, false)

const laterRow = headerRow({ 'data-sample': 'bash', 'data-state': 'running' })
document.body.append(laterRow.root)
await settle()
is('a running shell row inserted later opens too', laterRow.clicks, 1)

const laterHistory = headerRow({ 'data-sample': 'bash', 'data-state': 'ok' })
document.body.append(laterHistory.root)
await settle()
is('a settled row inserted later stays collapsed', laterHistory.clicks, 0)

// A collapse the user performs must survive a later render.
bashRow.header.setAttribute('aria-expanded', 'false')
await settle()
is('a user collapse is not undone', bashRow.clicks, 1)

dispose()
const afterUnload = headerRow({ 'data-sample': 'bash', 'data-state': 'running' })
document.body.append(afterUnload.root)
await settle()
is('the observer stops when the fiber unloads', afterUnload.clicks, 0)

// ------------------------------------------------------------------- reporting
for (const failure of failures) console.error(`FAIL  ${failure}`)
console.log(`\n${checks - failures.length}/${checks} checks passed`)
if (failures.length > 0) process.exitCode = 1
