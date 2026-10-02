/**
 * The shell row's derivations.
 *
 * Two independent things live here:
 *
 * * {@link shellRowModel} reads what THIS plugin's header renders — the
 *   lifecycle state, the Tool-authored `description`, and the command text —
 *   from whatever argument material the call's phase has, including the
 *   incomplete JSON prefix a running call streams.
 * * {@link terminalCardModel} derives the terminal card's props from the same
 *   frozen call slice. It is a deliberate copy of the shipped derivation
 *   (`ui-tool`'s `terminal-card-model`): the row must decide whether a call has
 *   a terminal card at all before it can decide whether the card is open, and
 *   the only shipped entry point for that is another package's `src/`
 *   subpath — which a plugin's `exports`-driven type resolution does not reach.
 *   Keeping the copy here also keeps this bundle free of a second package's
 *   private module graph. The rules it encodes are the published ones: which
 *   tools are shells, which arguments make a call malformed, and how a settled
 *   result's status marker is read.
 */
import type { ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { TerminalBlockLabels, TerminalBlockProps } from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleKeysOf, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: merges the shared `common` vocabulary into LocaleNamespaceMap, so
// `LocaleKeysOf<'conversation'>` accepts the cross-feature keys (copy, copied,
// collapse) that the terminal primitive's labels resolve through the lookup
// chain after the namespace misses.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { hasSpillNotice } from './spill-notice'

export { hasSpillNotice } from './spill-notice'

/** Shell call lifecycle as the row styles it. */
export type ShellRowState = 'preparing' | 'running' | 'ok' | 'error' | 'stopped'

/** The header facts of one shell call. */
export interface ShellRowModel {
  state: ShellRowState
  /** The Tool-authored `description`; absent for persistent-shell providers. */
  description: string | undefined
  /** The command source, verbatim and possibly incomplete mid-stream. */
  command: string | undefined
}

/** The subset of a tool block the header derivation reads. */
export interface ShellBlockFacts {
  /** A settled result carries `kind`; a dispatched or preparing call does not. */
  settled: boolean
  /** The dispatched call's argument payload, or null before dispatch. */
  argsRaw: string | null
  /** Preparing-phase marker. */
  preparing: boolean
  /** The settled result failed. */
  isError: boolean
  /** The settled result's error code, which names an interruption. */
  errorCode: string | undefined
}

/**
 * Derive the lifecycle state of one shell call.
 * @param facts - the phase and settlement facts of the call.
 * @returns the row state.
 */
export function shellState(facts: ShellBlockFacts): ShellRowState {
  if (!facts.settled) return facts.preparing ? 'preparing' : 'running'
  if (facts.errorCode === 'interrupted') return 'stopped'
  return facts.isError ? 'error' : 'ok'
}

/**
 * Derive the header model for one shell call.
 * @param facts - the phase, argument, and settlement facts of the call.
 * @param streamed - the streamed argument prefix (empty outside the preparing phase).
 * @returns the header model.
 */
export function shellRowModel(facts: ShellBlockFacts, streamed: string): ShellRowModel {
  const partial = facts.argsRaw === null ? streamed : ''
  return {
    state: shellState(facts),
    description: readArgument(facts.argsRaw, partial, 'description'),
    command: readArgument(facts.argsRaw, partial, 'command'),
  }
}

/**
 * Read one string argument from the current argument material: the frozen
 * `argsRaw` when the call has dispatched arguments, otherwise the streamed
 * prefix. A blank or absent value reads as undefined.
 * @param argsRaw - frozen arguments, or null before dispatch.
 * @param partial - the streamed argument prefix.
 * @param key - the argument name.
 * @returns the argument text.
 */
function readArgument(argsRaw: string | null, partial: string, key: string): string | undefined {
  const value = argsRaw === null
    ? partialString(partial, key)
    : stringMember(parseObject(argsRaw), key)
  return value === undefined || value.trim() === '' ? undefined : value
}

/**
 * Parse one string member of a partially streamed JSON object. A prefix such as
 * `{"command": "git status", "desc` has no usable `JSON.parse`, yet the members
 * it has already completed are exactly what a running row has to show. A member
 * whose own closing quote has not arrived reads as absent, so the row never
 * shows a half-written escape sequence as literal text.
 * @param partial - the raw argument prefix.
 * @param key - the JSON member name.
 * @returns the member's decoded text, or undefined while it has not arrived.
 */
export function partialString(partial: string, key: string): string | undefined {
  const marker = `"${key}"`
  let index = partial.indexOf(marker)
  if (index === -1) return undefined
  index += marker.length
  while (index < partial.length && isSpace(partial[index])) index += 1
  if (partial[index] !== ':') return undefined
  index += 1
  while (index < partial.length && isSpace(partial[index])) index += 1
  if (partial[index] !== '"') return undefined
  index += 1
  let raw = ''
  while (index < partial.length) {
    const char = partial[index]
    if (char === '\\') {
      const escaped = partial[index + 1]
      // The escape sequence has not fully streamed; decoding it now would show
      // a trailing backslash the value does not have.
      if (escaped === undefined) return undefined
      raw += char + escaped
      index += 2
      continue
    }
    if (char === '"') break
    raw += char
    index += 1
  }
  // The closing quote is the only proof the value is complete. Without it the
  // raw prefix is still JSON-escaped, and decoding it would resurrect escape
  // sequences as literal text.
  if (partial[index] !== '"') return undefined
  try {
    return JSON.parse(`"${raw}"`) as string
  } catch {
    // `raw` only ever contains the member's own characters plus complete
    // backslash pairs, so a failure here means the author wrote an escape this
    // reader cannot represent; the undecoded text is still what they typed.
    return raw
  }
}

/** Character test for the streamed-prefix scanner. */
function isSpace(char: string | undefined): boolean {
  return char !== undefined && /\s/.test(char)
}

/**
 * Parse a frozen argument payload, or undefined when it is not a JSON object.
 * @param argsRaw - the call's `argsRaw`.
 * @returns the parsed object.
 */
export function parseObject(argsRaw: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(argsRaw) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

/** One string member of a parsed argument object. */
function stringMember(args: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = args?.[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/* ------------------------------------------------------------------ *
 * Terminal card derivation (the shipped rules, copied — see the header)
 * ------------------------------------------------------------------ */

/** The terminal card's locale-neutral props. */
export interface TerminalCardModel {
  /** The props {@link TerminalCardModel} hands the terminal primitive except `command`. */
  card: Pick<TerminalBlockProps, 'cwd' | 'output' | 'exitCode' | 'signal' | 'running'>
  /** Verbatim Tool data, or semantic `terminal_send` data, before localization. */
  copy:
    | { readonly kind: 'shell'; readonly command: string; readonly description: string | undefined }
    | { readonly kind: 'terminal-send'; readonly text: string; readonly sessionId: string }
}

/**
 * Build the terminal primitive's display copy from the conversation locale seat.
 * @param t - the render site's conversation locale seat.
 * @returns the full label set for {@link TerminalBlockProps}'s `labels`.
 */
export function terminalBlockLabels(t: TranslateNS<'conversation'>): TerminalBlockLabels {
  return {
    signal: signal => t('terminal.signal', { signal }),
    exitCode: code => t('terminal.exitCode', { code }),
    noExitCode: t('terminal.noExitCode'),
    running: t('terminal.running'),
    failed: t('terminal.failed'),
    done: t('terminal.done'),
    copy: t('copy'),
    copied: t('copied'),
    noOutput: t('terminal.noOutput'),
    collapseAria: t('terminal.collapseAria'),
    collapse: t('collapse'),
    expandAria: hidden => t('terminal.expandAria', { n: hidden }),
    expand: hidden => t('terminal.expandRest', { n: hidden }),
  }
}

/**
 * True when a settled terminal card reports a failing exit — a non-zero code or
 * a terminating signal. The shell tool settles a failing command as a completed
 * call (`isError` stays false: the exit status is result data), so this is the
 * row's only failure signal for that case.
 * @param model - a derived terminal card.
 * @returns whether the card's exit status is a failure.
 */
export function terminalFailed(model: TerminalCardModel): boolean {
  const { exitCode, signal, running } = model.card
  return running !== true && ((exitCode !== undefined && exitCode !== 0) || signal !== undefined)
}

interface ShellCall {
  kind: 'shell'
  command: string
  description: string | undefined
  workdir: string | undefined
  persistent: boolean
  background: boolean
}

/**
 * Validate a shell tool's arguments. A missing `description` is the
 * persistent-shell provider's schema, not a malformed call.
 * @param name - the wire Tool name.
 * @param args - the parsed arguments.
 * @returns the shell call, or null for another tool or malformed input.
 */
function shellCall(name: string, args: Record<string, unknown>): ShellCall | null {
  if (name !== 'bash' && name !== 'pwsh') return null
  const { command, description, timeoutMs, workdir, run_in_background: background } = args
  if (typeof command !== 'string' || command.trim() === '') return null
  if (timeoutMs !== undefined && (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0)) return null
  if (workdir !== undefined && typeof workdir !== 'string') return null
  if (background !== undefined && typeof background !== 'boolean') return null
  if (!validEscalationFields(args)) return null
  if (description === undefined) {
    return { kind: 'shell', command, description: undefined, workdir: undefined, persistent: true, background: false }
  }
  if (typeof description !== 'string' || description.trim() === '') return null
  return { kind: 'shell', command, description, workdir, persistent: false, background: background === true }
}

/**
 * Validate the optional escalation pair the shell tools share.
 * @param args - the parsed arguments.
 * @returns whether the declared escalation fields form a valid pair.
 */
function validEscalationFields(args: Record<string, unknown>): boolean {
  const permission = args['sandbox_permissions']
  const justification = args['justification']
  if (permission === undefined && justification === undefined) return true
  if (permission !== 'workspace-write' && permission !== 'danger-full-access') return false
  return typeof justification === 'string' && justification.trim() !== ''
}

interface TerminalSendCall {
  kind: 'terminal-send'
  text: string
  sessionId: string
  background: boolean
}

/**
 * Validate a persistent-terminal `terminal_send` call.
 * @param name - the wire Tool name.
 * @param args - the parsed arguments.
 * @returns the call, or null for another tool or malformed input.
 */
function terminalSendCall(name: string, args: Record<string, unknown>): TerminalSendCall | null {
  if (name !== 'terminal_send') return null
  const { sessionId, text, submit, run_in_background: background } = args
  if (typeof sessionId !== 'string' || sessionId === '' || typeof text !== 'string') return null
  if (submit !== undefined && typeof submit !== 'boolean') return null
  if (background !== undefined && typeof background !== 'boolean') return null
  return { kind: 'terminal-send', text, sessionId, background: background === true }
}

/** A tool call's name and parsed arguments, or null while unusable. */
interface ParsedCall {
  name: string
  args: Record<string, unknown>
}

/**
 * Parse the call head paired with one tool block.
 * @param block - preparing, dispatched, or settled tool block.
 * @returns the name and object arguments, or null during preparation or for a windowless call.
 */
export function parsedToolCall(block: ToolCallHeadLike): ParsedCall | null {
  const head = block.argsRaw === undefined
    ? block.call
    : block.name === undefined ? null : { name: block.name, argsRaw: block.argsRaw }
  if (head === null || head === undefined) return null
  const args = parseObject(head.argsRaw)
  return args === undefined ? null : { name: head.name, args }
}

/** The call-head fields {@link parsedToolCall} reads from either block phase. */
export interface ToolCallHeadLike {
  /**
   * Wire Tool name. Present on a dispatched call (where the arguments sit beside
   * it) and absent on a settled result (where they sit on {@link call} instead),
   * so a caller constructing a running call must supply it.
   */
  name?: string | undefined
  /** Frozen arguments; present on a dispatched call. */
  argsRaw?: string
  /** The backfilled call head on a settled result, null when the window cut it. */
  call?: { name: string; argsRaw: string } | null
}

/**
 * The exact single text block the first-party card derivations consume.
 * @param block - a settled tool result.
 * @returns its text, or undefined for any other content layout.
 */
function singleResultText(block: { content: ToolResultNode['content'] }): string | undefined {
  if (block.content.length !== 1) return undefined
  const only = block.content[0]
  return only?.type === 'text' ? only.text : undefined
}

/**
 * Flatten a settled result's content blocks to display text (the shipped
 * `resultText`): text blocks verbatim, other block shapes as pretty JSON, with
 * the structured error's `name: code` line standing in for empty content.
 * @param node - the settled result node.
 * @returns the flattened result text (may be empty).
 */
export function resultText(node: ToolResultNode): string {
  const parts: string[] = []
  for (const block of node.content) {
    if (block.type === 'text') parts.push(block.text)
    else parts.push(JSON.stringify(block, null, 2))
  }
  if (parts.length === 0 && node.error !== undefined) parts.push(`${node.error.name}: ${node.error.code}`)
  return parts.join('\n')
}

/**
 * Parse the shell renderer's trailing status marker.
 * @param text - the rendered shell result text.
 * @returns the output with its exit code or signal extracted.
 */
function parseExitStatus(text: string): { output: string; exitCode?: number; signal?: string } {
  const signal = /\n\[killed by signal: ([^\]\n]+)\]$/.exec(text)
  if (signal?.[1] !== undefined) return { output: text.slice(0, signal.index), signal: signal[1] }
  const exit = /\n\[exit code: (\d+)\]$/.exec(text)
  if (exit?.[1] !== undefined) return { output: text.slice(0, exit.index), exitCode: Number(exit[1]) }
  return { output: text, exitCode: 0 }
}

/**
 * Derive the terminal card for a shell or terminal-send call.
 * @param block - running or settled tool block.
 * @param sessionCwd - session workspace root used to resolve a relative workdir.
 * @returns locale-neutral terminal-card data, or null when the generic path owns the call.
 */
export function terminalCardModel(
  block: TerminalBlockSource,
  sessionCwd?: string,
): TerminalCardModel | null {
  const parsed = parsedToolCall(block)
  if (parsed === null) return null
  const call = shellCall(parsed.name, parsed.args) ?? terminalSendCall(parsed.name, parsed.args)
  if (call === null || call.background) return null
  const copy: TerminalCardModel['copy'] = call.kind === 'shell'
    ? { kind: 'shell', command: call.command, description: call.description }
    : { kind: 'terminal-send', text: call.text, sessionId: call.sessionId }
  const cwd = resolveTerminalCwd(call.kind === 'shell' ? call.workdir : undefined, sessionCwd)
  if (block.kind === undefined) {
    return { copy, card: { cwd, output: undefined, exitCode: undefined, signal: undefined, running: true } }
  }
  if (block.isError === true || (call.kind === 'shell' && call.persistent)) return null
  if (isSpilledShellCall(parsed.name, block)) return null
  if (block.content === undefined) return null
  const output = singleResultText({ content: block.content })
  if (output === undefined) return null
  const status = call.kind === 'terminal-send' ? { output } : parseExitStatus(output)
  return {
    copy,
    card: { cwd, output: status.output, exitCode: status.exitCode, signal: status.signal, running: false },
  }
}

/** The block fields the terminal card's derivation reads. */
export interface TerminalBlockSource extends ToolCallHeadLike {
  /** Settlement discriminant: a result carries `kind`, a running call omits it. */
  kind?: string | undefined
  /** The settled result failed. */
  isError?: boolean | undefined
  /** The settled result's content blocks. */
  content?: ToolResultNode['content'] | undefined
}

/**
 * A running call as {@link terminalCardModel} reads it: the dispatched arguments
 * beside the call's wire name, with no settlement discriminant — which is exactly
 * the "still running" marker the derivation keys on. Without this the row has no
 * card while a command runs, and therefore no command banner, leaving the
 * bare-argument fallback as the only thing on screen.
 * The name is always `bash`: both shell tools share one row and one argument
 * schema, and the derivation accepts either wire name.
 * @param argsRaw - the dispatched call's argument JSON, or null before dispatch.
 * @returns the running block, or null when no arguments have arrived.
 */
export function runningCallBlock(argsRaw: string | null): TerminalBlockSource | null {
  return argsRaw === null || argsRaw === '' ? null : { name: 'bash', argsRaw }
}

/**
 * Format a shell call's argument payload for the IN/OUT fallback card. The
 * payload is reproduced WHOLE, `command` included: this card is reached only
 * when the terminal card refused the call (a persistent shell's call, a spill
 * preview, a cancellation), and then nothing else on the row says what the
 * command was. When a terminal card does exist, the command renders in that
 * card's banner and this body is not used at all.
 * @param argsRaw - the frozen argument JSON.
 * @returns the pretty-printed arguments, or the raw text when they do not parse.
 */
export function formatArguments(argsRaw: string): string {
  const args = parseObject(argsRaw)
  return args === undefined ? argsRaw : JSON.stringify(args, null, 2)
}

/**
 * Whether a settled result carries a spill-policy footer, which puts the call
 * on the generic path: the footer can hide the exit marker the terminal card
 * reads its status from.
 * @param name - the wire Tool name.
 * @param block - the settled result.
 * @returns whether the shell output must stay generic.
 */
export function isSpilledShellCall(name: string, block: TerminalBlockSource): boolean {
  const parsed = parsedToolCall(block)
  if (parsed === null) return false
  const call = shellCall(name, parsed.args)
  if (call === null || call.background) return false
  if (block.content === undefined) return false
  const output = singleResultText({ content: block.content })
  return output !== undefined && hasSpillNotice(output)
}

/**
 * Whether a settled root call comes from a persistent shell, whose result can
 * report resets and partial output without one process exit status and
 * therefore stays on the generic path.
 * @param block - the settled tool result.
 * @returns whether it is a persistent-shell call.
 */
export function isSettledPersistentShellCall(block: ToolResultNode): boolean {
  if (block.parentCallId !== undefined) return false
  const parsed = parsedToolCall(block)
  if (parsed === null) return false
  return shellCall(parsed.name, parsed.args)?.persistent === true
}

/**
 * Resolve a shell call's workdir for display: an absolute path as-is, a
 * relative one joined under the session workspace, and an omitted one as the
 * session workspace itself.
 * @param workdir - the raw call's workdir, if any.
 * @param sessionCwd - the session workspace root, if known.
 * @returns the working directory for the prompt label.
 */
function resolveTerminalCwd(workdir: string | undefined, sessionCwd: string | undefined): string | undefined {
  if (workdir === undefined || workdir === '') return sessionCwd
  if (sessionCwd === undefined || sessionCwd === '') return normalizeSegments(workdir)
  return normalizeSegments(resolveWorkspacePath(sessionCwd, workdir))
}

/**
 * Collapse `.` and `..` segments so the prompt label names the directory the
 * command actually ran in. Separators stay as authored; a `..` that would climb
 * past a root is dropped, which is what a filesystem does with it.
 * @param path - a joined or absolute path, possibly carrying `.`/`..` segments.
 * @returns the same path with those segments resolved.
 */
function normalizeSegments(path: string): string {
  if (!/(?:^|[/\\])\.\.?(?:[/\\]|$)/.test(path)) return path
  const unc = /^[/\\]{2}([^/\\]+)[/\\]+([^/\\]+)/.exec(path)
  if (unc !== null) {
    const [matched, server, share] = unc
    const root = `\\\\${String(server)}\\${String(share)}`
    const rest = collapse(path.slice(matched.length), true)
    return rest === '' ? root : `${root}\\${rest}`
  }
  const backslashed = path.includes('\\') && !path.includes('/')
  const separator = backslashed ? '\\' : '/'
  const rooted = /^[/\\]/.test(path)
  const drive = /^[A-Za-z]:/.exec(path)?.[0] ?? ''
  const body = collapse(path.slice(drive.length), rooted || drive !== '', separator)
  const leading = rooted ? separator : ''
  return drive === '' ? `${leading}${body}` : `${drive}${rooted ? leading : separator}${body}`
}

/**
 * Collapse the `.`/`..` segments of a path body against a known root state.
 * @param body - the path after any drive letter or UNC root.
 * @param rooted - whether a `..` at the body's top is dropped.
 * @param separator - separator to rejoin with.
 * @returns the collapsed body.
 */
function collapse(body: string, rooted: boolean, separator = '/'): string {
  const kept: string[] = []
  for (const segment of body.split(/[/\\]/)) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (kept.length > 0 && kept[kept.length - 1] !== '..') kept.pop()
      else if (!rooted) kept.push(segment)
      continue
    }
    kept.push(segment)
  }
  return kept.join(separator)
}

/* ------------------------------------------------------------------ *
 * Row summary and title
 * ------------------------------------------------------------------ */

/** Row variants selected by wire Tool name. */
export type ToolRowVariant = 'search' | 'read' | 'bash' | 'write' | 'edit' | 'code' | 'others'

/** Known tool name -> variant. */
const TOOL_VARIANTS: Record<string, ToolRowVariant> = {
  bash: 'bash',
  pwsh: 'bash',
  read: 'read',
  read_image: 'read',
  web_fetch: 'read',
  web_search: 'search',
  grep: 'search',
  glob: 'search',
  write: 'write',
  edit: 'edit',
  run_code: 'code',
}

/** Locale key per generic row variant. */
const VARIANT_TITLE_KEYS = {
  search: 'tool.title.search', read: 'tool.title.read', bash: 'tool.title.bash',
  write: 'tool.title.write', edit: 'tool.title.edit', code: 'tool.title.code',
  others: 'tool.title.generic',
} as const

/** Tool-owned titles that refine a generic row variant without replacing it. */
const TOOL_TITLE_KEYS: Record<string, LocaleKeysOf<'conversation'>> = {
  pwsh: 'tool.title.pwsh',
  read_image: 'tool.title.readImage',
}

/**
 * Classify a tool name into its row variant.
 * @param toolName - wire tool name.
 * @returns the matching variant, `others` when unknown.
 */
export function classifyTool(toolName: string): ToolRowVariant {
  return TOOL_VARIANTS[toolName] ?? 'others'
}

/**
 * Select a tool-owned or generic title key without reading arguments.
 * @param toolName - wire tool name.
 * @returns the locale key for the row title.
 */
export function toolTitleKey(toolName: string): LocaleKeysOf<'conversation'> {
  return TOOL_TITLE_KEYS[toolName] ?? VARIANT_TITLE_KEYS[classifyTool(toolName)]
}

/** Summary key preference per variant. */
const SUMMARY_KEYS: Record<ToolRowVariant, readonly string[]> = {
  bash: ['description', 'command'],
  read: ['path', 'file_path', 'url'],
  search: ['query', 'pattern', 'url'],
  write: ['path', 'file_path'],
  edit: ['path', 'file_path'],
  code: ['description'],
  others: [],
}

/** The first line of a possibly multi-line value. */
function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

/** The first non-empty string argument among `keys`. */
function pickString(args: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return undefined
}

/**
 * Derive a row's one-line summary from its argument payload (the shipped rule:
 * the variant's preferred keys first, then any string the call carries).
 * @param variant - the row variant.
 * @param argsRaw - the frozen argument JSON.
 * @returns the summary text.
 */
export function deriveSummary(variant: ToolRowVariant, argsRaw: string): string {
  const args = parseObject(argsRaw)
  if (args === undefined) return firstLine(argsRaw)
  if (variant === 'search' && Array.isArray(args['queries'])) {
    const queries = args['queries'].filter((query): query is string => typeof query === 'string' && query !== '')
    if (queries.length > 0) return queries.map(firstLine).join(', ')
  }
  const picked = pickString(args, SUMMARY_KEYS[variant])
  if (picked !== undefined) return firstLine(picked)
  for (const value of Object.values(args)) {
    if (typeof value === 'string' && value !== '') return firstLine(value)
  }
  return firstLine(argsRaw)
}

/**
 * Derive a row's display summary, relative to the session workspace and with a
 * POSIX home root abbreviated to `~`.
 * @param variant - the row variant.
 * @param argsRaw - the frozen argument JSON.
 * @param cwd - session workspace root.
 * @param home - host account home.
 * @returns the display summary.
 */
export function rowSummary(variant: ToolRowVariant, argsRaw: string, cwd?: string, home?: string): string {
  return abbreviateHomePath(relativizeToCwd(deriveSummary(variant, argsRaw), cwd), home)
}

/* ------------------------------------------------------------------ *
 * Path display helpers (copied from `dsh-util-workspace-path`, kept
 * local so this bundle carries no second package's module graph)
 * ------------------------------------------------------------------ */

/** Whether a path uses a Windows drive or UNC prefix. */
function isWindowsStylePath(value: string): boolean {
  return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith('\\\\')
}

/**
 * Strip the workspace root from a workspace-rooted absolute path (display only).
 * @param text - the path to shorten.
 * @param cwd - session workspace root; absent or empty leaves the path unchanged.
 * @returns the path relative to the workspace root, or unchanged when it is not rooted there.
 */
function relativizeToCwd(text: string, cwd: string | undefined): string {
  if (cwd === undefined || cwd === '') return text
  const root = cwd.replace(/[/\\]+$/, '')
  if (text.startsWith(`${root}/`) || text.startsWith(`${root}\\`)) return text.slice(root.length + 1)
  return text
}

/**
 * Abbreviate a POSIX home directory for display.
 * @param path - absolute or already-short display path.
 * @param home - host account home; absent skips abbreviation.
 * @returns `~` or `~/…` for the POSIX home and its descendants, otherwise `path`.
 */
function abbreviateHomePath(path: string, home?: string): string {
  if (home === undefined || home === '') return path
  if (isWindowsStylePath(path) || isWindowsStylePath(home)) return path
  const root = home.replace(/\/+$/, '')
  if (root === '' || root === '/') return path
  if (path.replace(/\/+$/, '') === root) return '~'
  if (path.startsWith(`${root}/`)) return `~${path.slice(root.length)}`
  return path
}

/**
 * Resolve a workspace-relative path into the spelling the Host uses.
 * @param cwd - session workspace root, when known.
 * @param path - absolute or workspace-relative path.
 * @returns an absolute path when a workspace root is available, otherwise the original path.
 */
function resolveWorkspacePath(cwd: string | undefined, path: string): string {
  if (path.startsWith('/') || isWindowsStylePath(path)) return path
  if (cwd === undefined || cwd === '') return path
  const separator = isWindowsStylePath(cwd) && cwd.includes('\\') ? '\\' : '/'
  const base = cwd.replace(/[/\\]+$/, '')
  const relative = path.replace(/^[/\\]+/, '')
  return `${base}${separator}${relative}`
}
