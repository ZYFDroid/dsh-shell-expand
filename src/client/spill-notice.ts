/**
 * Recognition of the spill-policy footer a retained preview carries.
 *
 * The marker is a text convention the Host's spill policy writes, not a wire
 * field: a notice is a parenthesized final paragraph naming the omitted bytes,
 * the stored location, and the retrieval guidance. This is a copy of
 * `dsh-spill-policy`'s recognizer, kept local so the shell row's bundle carries
 * no second package's module graph; the convention it matches is the persisted
 * one, and a notice it fails to recognize leaves the call on the generic path
 * rather than mis-reporting an exit status.
 */

const OPEN = '('
const CLOSE = ')'
const LOCATION = ' Full formatted result stored at: '
const GUIDANCE_SEPARATOR = '. '
const SEPARATOR = '\n\n'
/** `Omitted <count> bytes.` — the standardized omission clause for an exact count. */
const OMISSION = /^Omitted (\d+) bytes\.(?: Omitted ([1-9]\d*) images\.)?$/

/**
 * Recognize a final spill-policy notice in persisted text.
 * @param text - the complete recorded result text.
 * @returns whether a complete notice occupies the end of the result.
 */
export function hasSpillNotice(text: string): boolean {
  if (!text.endsWith(CLOSE)) return false
  let start = 0
  while (true) {
    const next = text.indexOf(`${SEPARATOR}${OPEN}`, start)
    const candidate = text.slice(start, next < 0 ? -CLOSE.length : next)
    const location = candidate.indexOf(LOCATION, OPEN.length)
    if (candidate.startsWith(OPEN) && location >= 0
      && isOmission(candidate.slice(OPEN.length, location))) {
      return text.indexOf(GUIDANCE_SEPARATOR, start + location + LOCATION.length) >= 0
    }
    if (next < 0) return false
    start = next + SEPARATOR.length
  }
}

/**
 * Whether a notice's leading clause is the standardized omission wording with a
 * count the formatter can produce.
 * @param text - the clause, before the stored location.
 * @returns whether it is a well-formed omission clause.
 */
function isOmission(text: string): boolean {
  const match = OMISSION.exec(text)
  if (match === null) return false
  const bytes = Number(match[1])
  return Number.isSafeInteger(bytes) && bytes >= 0
}
