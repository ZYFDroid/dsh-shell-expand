/**
 * Decode a dsh session log (`session.v4.jsonl.zstd`) to text.
 *
 * The file is a CONCATENATION of many small zstd frames — one per write flush —
 * so a single `zstdDecompressSync` call reads only the first (~220 bytes) and a
 * piped `createZstdDecompress` rejects the second frame with
 * `ZSTD_error_prefix_unknown`. This walks the frames itself: decompress from a
 * frame's magic number, then jump to the next magic number.
 *
 * Usage:
 *   node tools/zstd-frames.mjs <session.v4.jsonl.zstd>            # stats
 *   node tools/zstd-frames.mjs <session.v4.jsonl.zstd> --jsonl    # decoded log to stdout
 *   node tools/zstd-frames.mjs <session.v4.jsonl.zstd> --tool-calls
 */
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

/** The zstd frame magic, little-endian `0xFD2FB528`. */
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/**
 * Find every zstd frame start in a buffer.
 * @param buffer - the whole file.
 * @returns the byte offsets of each frame's magic number.
 */
function frameOffsets(buffer) {
  const offsets = []
  let at = buffer.indexOf(MAGIC)
  while (at !== -1) {
    offsets.push(at)
    at = buffer.indexOf(MAGIC, at + MAGIC.length)
  }
  return offsets
}

const [, , file, mode = '--stats'] = process.argv
if (file === undefined) {
  console.error('usage: node tools/zstd-frames.mjs <session.v4.jsonl.zstd> [--stats|--jsonl|--tool-calls]')
  process.exit(2)
}

const buffer = readFileSync(file)
const offsets = frameOffsets(buffer)
const chunks = []
let failed = 0
for (let index = 0; index < offsets.length; index += 1) {
  // Decompress only this frame's slice: the decoder stops at the frame end, and
  // slicing keeps a later corrupt frame from affecting an earlier good one.
  const end = index + 1 < offsets.length ? offsets[index + 1] : buffer.length
  try {
    chunks.push(zstdDecompressSync(buffer.subarray(offsets[index], end)))
  } catch {
    failed += 1
  }
}
const text = Buffer.concat(chunks).toString('utf8')

if (mode === '--stats') {
  console.log(`frames: ${offsets.length} (decoded ${chunks.length}, failed ${failed})`)
  console.log(`decoded bytes: ${text.length}`)
  console.log(`events: ${text.split('\n').filter(Boolean).length}`)
  process.exit(failed === 0 ? 0 : 1)
}

if (mode === '--jsonl') {
  process.stdout.write(text)
  process.exit(0)
}

// --tool-calls: one readable block per shell tool call, with the raw argument
// text exactly as the wire carries it.
for (const line of text.split('\n')) {
  if (line === '') continue
  let event
  try {
    event = JSON.parse(line)
  } catch {
    continue
  }
  if (event.type !== 'tool/call') continue
  const data = event.data ?? {}
  if (data.name !== 'pwsh' && data.name !== 'bash') continue
  // The call event carries the model's argument JSON as `arguments`; a result
  // event backfills the same payload as `call.argsRaw`.
  const raw = data.arguments ?? data.argsRaw ?? data.call?.argsRaw
  if (typeof raw !== 'string') continue
  let args
  try {
    args = JSON.parse(raw)
  } catch {
    console.log(`${data.name}: unparseable arguments ${JSON.stringify(raw.slice(0, 120))}`)
    continue
  }
  const command = typeof args.command === 'string' ? args.command : ''
  console.log('─'.repeat(70))
  console.log(`description: ${JSON.stringify(args.description)}`)
  console.log(`command lines: ${command.split('\n').length}  has \\n: ${command.includes('\n')}`)
  console.log(command)
}
