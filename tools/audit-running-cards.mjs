/**
 * Dry-run the running-call derivation over the real argument payloads recorded
 * in a dsh session log.
 *
 * The running card is derived from the dispatcher's arguments alone, so every
 * call that actually ran is a regression case for it. This reports any payload
 * that would NOT produce a terminal card while running — which is exactly what a
 * "running shows JSON" report means at the model layer.
 *
 * Usage: node --import ./tools/register-ts-resolve.mjs tools/audit-running-cards.mjs <session.v4.jsonl.zstd>
 */
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'
import { runningCallBlock, terminalCardModel } from '../src/client/model.ts'

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/**
 * Decode every zstd frame in the log.
 * @param file - the log path.
 * @returns the decoded text.
 */
function decode(file) {
  const buffer = readFileSync(file)
  const offsets = []
  let at = buffer.indexOf(MAGIC)
  while (at !== -1) {
    offsets.push(at)
    at = buffer.indexOf(MAGIC, at + MAGIC.length)
  }
  const parts = []
  for (let index = 0; index < offsets.length; index += 1) {
    const end = index + 1 < offsets.length ? offsets[index + 1] : buffer.length
    try {
      parts.push(zstdDecompressSync(buffer.subarray(offsets[index], end)))
    } catch {
      // Skip a frame this decoder cannot read; the rest still decode.
    }
  }
  return Buffer.concat(parts).toString('utf8')
}

const [, , file] = process.argv
if (file === undefined) {
  console.error('usage: node --import ./tools/register-ts-resolve.mjs tools/audit-running-cards.mjs <session.v4.jsonl.zstd>')
  process.exit(2)
}

let total = 0
let withCard = 0
const failures = []
for (const line of decode(file).split('\n')) {
  if (line === '') continue
  let event
  try {
    event = JSON.parse(line)
  } catch {
    continue
  }
  const data = event.data ?? {}
  if (event.type !== 'tool/call') continue
  if (data.name !== 'pwsh' && data.name !== 'bash') continue
  if (typeof data.arguments !== 'string') continue
  total += 1
  const card = terminalCardModel(runningCallBlock(data.arguments))
  if (card !== null) {
    withCard += 1
    continue
  }
  let parsed
  try {
    parsed = JSON.parse(data.arguments)
  } catch {
    parsed = null
  }
  failures.push({
    description: String(parsed?.description ?? '?'),
    background: parsed?.run_in_background === true,
    hasCommand: typeof parsed?.command === 'string' && parsed.command !== '',
    hasDescription: typeof parsed?.description === 'string' && parsed.description !== '',
    timeoutMs: parsed?.timeoutMs,
  })
}

console.log(`${total} shell calls, ${withCard} produce a running terminal card, ${failures.length} do not`)
if (failures.length > 0) {
  const reasons = new Map()
  for (const failure of failures) {
    const reason = failure.background
      ? 'run_in_background: true (card refused by design)'
      : failure.hasDescription
        ? 'no command text in the arguments'
        : 'no description (persistent-shell schema)'
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1)
  }
  console.log('')
  for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${reason}`)
  }
  console.log('')
  console.log('first few:')
  for (const failure of failures.slice(0, 5)) console.log(`  ${JSON.stringify(failure)}`)
}
