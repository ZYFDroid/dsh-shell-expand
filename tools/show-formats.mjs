/**
 * Print the running-time formatter's output across its ranges, so the elapsed
 * side and the optional timeout side can be compared at a glance. Both call the
 * same `formatElapsed`, so every row's two columns are identical by construction.
 *
 * Usage: node --import ./tools/register-ts-resolve.mjs tools/show-formats.mjs
 */
import { formatElapsed } from '../src/client/running-time.ts'

const CASES = [3_000, 12_000, 30_000, 59_000, 60_000, 90_000, 119_000, 121_000, 300_000, 3_600_000, 3_725_000]

console.log('毫秒        已运行显示     超时显示（若调用声明该值）')
for (const ms of CASES) {
  const label = formatElapsed(ms)
  console.log(`${String(ms).padStart(8)}    ${label.padEnd(12)}  ${label}`)
}

console.log('')
console.log(`组合：已运行 19s + 声明超时 30000    => "${formatElapsed(19_000)} / ${formatElapsed(30_000)}"`)
console.log(`组合：已运行 65s + 声明超时 120000   => "${formatElapsed(65_000)} / ${formatElapsed(120_000)}"`)
console.log(`组合：已运行 65s + 未声明超时        => "${formatElapsed(65_000)}"`)
