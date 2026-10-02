/**
 * Running-call clock: how long the current command has been going, and the
 * deadline it was given.
 *
 * The start instant is the tool call's own `time` — the epoch milliseconds the
 * dispatch stage began, which the framework stamps on every call block. The tick
 * is a plain 1-second interval, owned by the row and stopped the moment the call
 * settles, so a finished command never keeps a timer alive.
 *
 * The timeout side reports only what the command itself states. See
 * {@link timeoutLabel} for why the executor's default is deliberately not
 * substituted.
 */

/** How often the elapsed label refreshes, in milliseconds. */
export const ELAPSED_TICK_MS = 1000

/**
 * Parse an argument payload into an object, or undefined when it is not one.
 * `JSON.parse` returns `any`, so the value is narrowed before use; this module
 * stays dependency-free rather than importing the model's parser.
 * @param argsRaw - the frozen argument JSON.
 * @returns the parsed object, or undefined.
 */
function parseObject(argsRaw: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(argsRaw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

/** One second in milliseconds. */
const SECOND = 1000
/** One minute in milliseconds. */
const MINUTE = 60 * SECOND
/** One hour in milliseconds. */
const HOUR = 60 * MINUTE

/**
 * Format a duration for display. Sub-minute durations read in whole seconds (the
 * tick's own resolution); a minute or more reads as `Nm Ns`, and an hour or more
 * as `Nh Nm`. Note that the seconds component is truncated while the minutes
 * component derives from the same whole-second total, so the final seconds of a
 * minute read `1m 0s` rather than `0m 59s`. A duration that is not finite or is
 * negative reads as zero, so a clock skew between the Host's stamp and this
 * browser cannot render a negative age.
 * @param durationMs - the duration in milliseconds.
 * @returns the compact duration label.
 */
export function formatElapsed(durationMs: number): string {
  const total = Number.isFinite(durationMs) && durationMs > 0 ? Math.floor(durationMs / SECOND) : 0
  if (total < 60) return `${total}s`
  if (total < 3600) return `${Math.floor(total / 60)}m ${total % 60}s`
  return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`
}

/**
 * Milliseconds between a call's start stamp and now.
 * @param startedAt - the call's `time`, or undefined when the block carries none.
 * @param now - the current epoch milliseconds.
 * @returns the elapsed duration, never negative.
 */
export function elapsedSince(startedAt: number | undefined, now: number): number {
  if (startedAt === undefined) return 0
  return Math.max(0, now - startedAt)
}

/**
 * The effective timeout label for a shell call, or null when the call does not
 * state one.
 *
 * Only an EXPLICIT `timeoutMs` is reported. Reading the executor's own default
 * would mean guessing: the deadline is resolved below this layer from the
 * executor's config, clamped by that executor's `maxTimeoutMs`, and the
 * persistent providers default elsewhere again. A value the command did not
 * state would therefore be an invented one, so an absent argument shows nothing
 * and the row falls back to the elapsed readout alone.
 * @param argsRaw - the call's argument JSON, or null before dispatch.
 * @returns the formatted timeout, or null when the call states none.
 */
export function timeoutLabel(argsRaw: string | null): string | null {
  if (argsRaw === null || argsRaw === '') return null
  const args = parseObject(argsRaw)
  const requested = args?.['timeoutMs']
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) return null
  return formatElapsed(requested)
}
