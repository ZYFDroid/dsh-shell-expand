/**
 * Pair shell tool calls with their results in a dsh session log and report how
 * long each one actually took, plus the shape of the command that was sent.
 *
 * The log is a concatenation of zstd frames (see tools/zstd-frames.mjs). The two
 * events name the call differently: `tool/call` carries `data.callId` beside the
 * arguments, while `tool/result` nests the same id at `data.message.toolCallId`
 * (mirrored at `data.message.source.callId`).
 *
 * Usage: node tools/pair-shell-calls.mjs <session.v4.jsonl.zstd> [count]
 */
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/**
 * Decode every zstd frame in a buffer.
 * @param buffer - the whole log file.
 * @returns the decoded text.
 */
function decode(buffer) {
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
      // A frame this decoder cannot read is skipped; the rest still decode.
    }
  }
  return Buffer.concat(parts).toString('utf8')
}

const [, , file, count = '8'] = process.argv
if (file === undefined) {
  console.error('usage: node tools/pair-shell-calls.mjs <session.v4.jsonl.zstd> [count]')
  process.exit(2)
}

const calls = new Map()
const paired = []
let callEvents = 0
let resultEvents = 0

for (const line of decode(readFileSync(file)).split('\n')) {
  if (line === '') continue
  let event
  try {
    event = JSON.parse(line)
  } catch {
    continue
  }
  const data = event.data ?? {}
  if (event.type === 'tool/call') {
    callEvents += 1
    if (data.name !== 'pwsh' && data.name !== 'bash') continue
    if (typeof data.arguments !== 'string') continue
    let args
    try {
      args = JSON.parse(data.arguments)
    } catch {
      continue
    }
    calls.set(data.callId, {
      tool: data.name,
      description: String(args.description ?? ''),
      command: typeof args.command === 'string' ? args.command : '',
      requestedTimeoutMs: args.timeoutMs,
      startedAt: event.time,
    })
  } else if (event.type === 'tool/result') {
    resultEvents += 1
    const call = calls.get(data.message?.toolCallId)
    if (call !== undefined) paired.push({ ...call, settledAt: event.time, isError: data.isError === true })
  }
}

console.log(`events: ${callEvents} tool/call, ${resultEvents} tool/result, ${paired.length} paired shell calls`)
console.log('')
for (const call of paired.slice(-Number(count))) {
  const seconds = ((call.settledAt - call.startedAt) / 1000).toFixed(1)
  const lines = call.command.split('\n').length
  const longest = call.command.split('\n').reduce((max, line) => Math.max(max, line.length), 0)
  console.log(`${call.tool}  ${seconds.padStart(6)}s  ${call.isError ? 'ERROR' : 'ok   '}  ${lines} line(s), longest ${longest} chars${call.requestedTimeoutMs === undefined ? '' : `, requested timeout ${call.requestedTimeoutMs}ms`}`)
  console.log(`      ${call.description}`)
}
