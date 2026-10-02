/**
 * Pure-derivation checks for the shell row model, run directly on the sources
 * with Node's own type stripping (no bundler, no vite).
 *
 * The model is the part of the row whose mistakes are silent: reading a
 * streamed argument prefix, deciding a call's lifecycle state, and recognizing
 * the spill-policy footer. `tests/shell-row.spec.tsx` covers the same ground
 * inside vitest for environments where that runner starts; this file covers it
 * where it does not, and is what `pnpm run check:model` executes.
 *
 * Usage: pnpm run check:model
 *    (equivalently: node --import ./tools/register-ts-resolve.mjs tools/run-model-checks.mjs)
 */
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

const model = await import(pathToFileURL(join(ROOT, 'src', 'client', 'model.ts')).href)
const {
  formatArguments, hasSpillNotice, partialString, parseObject, rowSummary, runningCallBlock,
  shellRowModel, shellState, terminalCardModel, toolTitleKey,
} = model
const { ELAPSED_TICK_MS, elapsedSince, formatElapsed, timeoutLabel } = await import(
  pathToFileURL(join(ROOT, 'src', 'client', 'running-time.ts')).href
)

const facts = { settled: false, argsRaw: '{}', preparing: false, isError: false, errorCode: undefined }

// ---- the streamed argument reader
is('a member reads from a payload whose object has not closed', partialString('{"command": "npm run build", "desc', 'command'), 'npm run build')
is('a complete streamed value is decoded', partialString('{"command": "echo \\"hi\\""}', 'command'), 'echo "hi"')
is(
  'an open string is not read: its escapes are still JSON-encoded',
  partialString('{"command": "npm run build', 'command'),
  undefined,
)
is('an incomplete escape is refused', partialString('{"command": "echo \\"hi', 'command'), undefined)
is('a longer key is not a prefix match', partialString('{"commandline": "nope", "command": "yes"}', 'command'), 'yes')
is('an absent member reads as undefined', partialString('{"desc', 'description'), undefined)

// ---- the payload parser
is('an object payload parses', JSON.stringify(parseObject('{"a":1}')), '{"a":1}')
is('a truncated payload is refused', parseObject('{"a":1'), undefined)
is('an array payload is refused', parseObject('[1,2]'), undefined)

// ---- the lifecycle state
is('preparing before any arguments', shellState({ ...facts, argsRaw: null, preparing: true }), 'preparing')
is('running once dispatched', shellState(facts), 'running')
is('stopped for an interruption', shellState({ ...facts, settled: true, errorCode: 'interrupted' }), 'stopped')
is('error for a failed result', shellState({ ...facts, settled: true, isError: true }), 'error')
is('ok for a clean result', shellState({ ...facts, settled: true }), 'ok')

// ---- the header model
const dispatched = shellRowModel({ ...facts, argsRaw: JSON.stringify({ command: 'ls', description: 'list' }) }, '')
is('the frozen command reaches the header', dispatched.command, 'ls')
is('the frozen description reaches the header', dispatched.description, 'list')
is('a blank command reads as absent', shellRowModel({ ...facts, argsRaw: JSON.stringify({ command: '  ' }) }, '').command, undefined)
is('a streamed command reaches the header once its value closes', shellRowModel({ ...facts, argsRaw: null, preparing: true }, '{"command": "git st", "descriptio').command, 'git st')

// ---- tool titles (the two keys this plugin claims)
is('bash titles as bash', toolTitleKey('bash'), 'tool.title.bash')
is('pwsh titles as pwsh', toolTitleKey('pwsh'), 'tool.title.pwsh')

// ---- the spill footer
const notice = '(Omitted 1048576 bytes. Full formatted result stored at: '
  + '/w/spill.txt. Read the spill file for the rest)'
is('the persisted spill footer is recognized', hasSpillNotice(`preview\n\n${notice}`), true)
is('ordinary output is not a spill footer', hasSpillNotice('preview\n[exit code: 0]'), false)
is('a malformed omission count is not a spill footer', hasSpillNotice('preview\n\n(Omitted many bytes. Full formatted result stored at: /w. go)'), false)

// ---- the RUNNING call's card (the reported defect)
// A dispatched shell has no result yet. Its card must still come from the
// terminal-card derivation, or the row shows no command banner at all and falls
// back to a bare argument list that used to omit the command.
const dispatchedArgs = JSON.stringify({ command: 'npm run build', description: 'build the client', timeoutMs: 120000 })
const runningBlock = runningCallBlock(dispatchedArgs)
is('a dispatched call produces a card source', runningBlock !== null, true)
const runningCard = terminalCardModel(runningBlock)
is('the running call has a terminal card', runningCard !== null, true)
is('the running card is marked as still running', runningCard?.card.running, true)
is('the running card carries the command', runningCard?.copy.command, 'npm run build')
is('the running card carries no exit status', runningCard?.card.exitCode, undefined)
is('a call with no arguments has no card source', runningCallBlock(null), null)
is('a call with empty arguments has no card source', runningCallBlock(''), null)
// A backgrounded shell is refused a card, and is exactly the case the generic
// fallback must cover WITH the command in it.
const background = terminalCardModel(runningCallBlock(JSON.stringify({ command: 'sleep 60', description: 'bg', run_in_background: true })))
is('a backgrounded call is refused a terminal card', background, null)

// ---- the generic fallback body
const body = formatArguments(dispatchedArgs)
is('the fallback body keeps the command', body.includes('"command": "npm run build"'), true)
is('the fallback body keeps the description', body.includes('"description": "build the client"'), true)
is('the fallback body keeps the timeout', body.includes('"timeoutMs": 120000'), true)
is('unparseable arguments pass through verbatim', formatArguments('{"command": "oops'), '{"command": "oops')

// ---- the header summary
is('a path summary is relativized to the workspace', rowSummary('bash', JSON.stringify({ workdir: '/w/sub' }), '/w'), 'sub')

// ---- the running clock (elapsed only; no timeout is reported, because the
// effective deadline is resolved below this layer and would be misstated)
is('sub-minute durations read in whole seconds', formatElapsed(0), '0s')
is('a few seconds round down', formatElapsed(12_400), '12s')
is('a round minute reads as minutes', formatElapsed(60_000), '1m 0s')
is('a minute and a half reads as both', formatElapsed(92_000), '1m 32s')
is('just past two minutes reads as minutes and seconds', formatElapsed(121_000), '2m 1s')
is('an hour reads as hours and minutes', formatElapsed(3_725_000), '1h 2m')
is('a clock skew cannot render a negative age', formatElapsed(-5_000), '0s')
is('a non-finite duration reads as zero', formatElapsed(Number.NaN), '0s')
is('elapsed is measured from the call stamp', elapsedSince(1_000, 13_000), 12_000)
is('a missing call stamp reads as zero', elapsedSince(undefined, 13_000), 0)
is('a stamp in the future reads as zero', elapsedSince(20_000, 13_000), 0)
is('the tick is one second', ELAPSED_TICK_MS, 1000)

// ---- the timeout side of the readout
// Only a timeout the command itself states is reported; the executor's default
// is resolved below this layer and would be a fabricated number here.
is('a stated timeout is formatted', timeoutLabel(JSON.stringify({ command: 'x', timeoutMs: 30_000 })), '30s')
is('a shorter stated timeout is formatted', timeoutLabel(JSON.stringify({ command: 'x', timeoutMs: 250 })), '0s')
is('a two-minute stated timeout is formatted', timeoutLabel(JSON.stringify({ command: 'x', timeoutMs: 120_000 })), '2m 0s')
is('no stated timeout reads as none', timeoutLabel(JSON.stringify({ command: 'x' })), null)
is('an absent payload reads as none', timeoutLabel(null), null)
is('an empty payload reads as none', timeoutLabel(''), null)
is('unparseable arguments read as none', timeoutLabel('{"command": "x"'), null)
is('a string timeout is not a number', timeoutLabel(JSON.stringify({ command: 'x', timeoutMs: '30s' })), null)
is('a non-positive timeout is not a deadline', timeoutLabel(JSON.stringify({ command: 'x', timeoutMs: 0 })), null)
is('a non-finite timeout is not a deadline', timeoutLabel(JSON.stringify({ command: 'x', timeoutMs: Number.NaN })), null)
// The composed pair, as the row renders it.
const pair = (elapsed, timeout) => timeout === null ? elapsed : `${elapsed} / ${timeout}`
is('the pair reads elapsed over timeout', pair(formatElapsed(19_000), timeoutLabel(JSON.stringify({ timeoutMs: 30_000 }))), '19s / 30s')
is('the pair collapses to elapsed alone', pair(formatElapsed(19_000), timeoutLabel(JSON.stringify({}))), '19s')

for (const failure of failures) console.error(`FAIL  ${failure}`)
console.log(`\n${checks - failures.length}/${checks} checks passed`)
if (failures.length > 0) process.exitCode = 1
