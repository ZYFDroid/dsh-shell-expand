/**
 * The taken-over shell row (one implementation for `bash` and `pwsh`).
 *
 * It reproduces the shipped bash toolview's chrome — the same `ToolRow`-family
 * geometry and `--dsw-*` tokens, the same leading icon that yields to a state
 * dot, the same hover-chevron disclosure, the same `TerminalBlock` for output
 * (ANSI colors, copy control, exit-status pill, height cap), and the same IN/OUT
 * fallback for shell calls that carry no terminal-card material — and changes
 * exactly two behaviors:
 *
 * 1. **Open by default.** The row expands itself on mount, including for a
 *    replayed historical session, and again whenever the enclosing Turn resets
 *    the disclosure seat. A collapse the user performed holds until then.
 * 2. **The command wraps.** The shipped row's collapsed content is the call's
 *    `description` in a single non-wrapping ellipsized line, and the command
 *    lives in the terminal card's banner, which wraps only when a caller
 *    rebinds its CSS variable. This row renders the command in the header where
 *    it wraps onto as many lines as it needs, and rebinds that variable so the
 *    banner wraps too.
 */
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import clsx from 'clsx'
import {
  DisclosureRow, IconApiOutlineRegular, IconInspectOutlineRegular, StateDot, TerminalBlock,
  type TerminalBlockProps,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { PropsLocale, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import {
  classifyTool, formatArguments, isSettledPersistentShellCall, isSpilledShellCall, resultText, rowSummary,
  runningCallBlock, shellRowModel, terminalBlockLabels, terminalCardModel, terminalFailed, toolTitleKey,
  type ShellBlockFacts, type ShellRowModel, type ShellRowState,
} from './model'
import { ELAPSED_TICK_MS, elapsedSince, formatElapsed, timeoutLabel } from './running-time'
import css from './shell-row.module.css'

/** Full props of the registered shell row. */
export type ShellRowProps = ToolCallViewProps & PropsLocale<'conversation'>

/** The conversation translate seat this row's copy goes through. */
type Translate = TranslateNS<'conversation'>

/** The row's business glyph, shared by every phase. */
const SHELL_ICON = <IconApiOutlineRegular size={14} />

/** The dispatched and settled prop sets (`preparing` carries no dispatched arguments). */
type StartedShellProps = Exclude<ShellRowProps, { phase: 'preparing' }>

/** A preparing call's facts: no argument payload has arrived yet. */
const PREPARING_FACTS: ShellBlockFacts = {
  settled: false, argsRaw: null, preparing: true, isError: false, errorCode: undefined,
}

/**
 * Visually hidden lifecycle label for the state that color alone would carry.
 * @param state - the row's lifecycle state.
 * @param t - the conversation locale seat.
 * @returns the label, or null for the states that need none.
 */
function stateStatus(state: ShellRowState, t: Translate): string | null {
  switch (state) {
    case 'preparing': return t('row.preparing')
    case 'running': return t('bash.running')
    case 'error': return t('bash.failed')
    case 'stopped': return t('bash.stopped')
    default: return null
  }
}

/**
 * Leading-slot substitution for the state a shell call reports through its
 * result rather than its settlement: an error dot replaces the business glyph,
 * a warning dot marks an interruption.
 * @param state - the row's lifecycle state.
 * @returns the leading node.
 */
function leadingFor(state: ShellRowState) {
  switch (state) {
    case 'error': return <StateDot state="error" />
    case 'stopped': return <StateDot state="warning" />
    default: return SHELL_ICON
  }
}

/** The terminal card facts this row renders, after localization. */
type LocalizedTerminal = Pick<TerminalBlockProps, 'cwd' | 'output' | 'exitCode' | 'signal' | 'running'> & {
  command: string
  description: string | undefined
}

/**
 * Tick once a second while a command is running, and hand back the current
 * epoch milliseconds so the elapsed label re-renders.
 *
 * Called unconditionally — the Hook order must not depend on the phase — with
 * `running` as the plain value that decides whether the interval is armed. A
 * settled call leaves the interval torn down and the last tick's stamp in place,
 * which nothing reads.
 * @param running - whether the call is still executing.
 * @returns the latest tick's epoch milliseconds.
 */
function useRunningTick(running: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return () => {}
    // Stamp immediately so the first frame shows the real age rather than the
    // mount-time value carried over from a previous run of this row.
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, ELAPSED_TICK_MS)
    return () => { clearInterval(timer) }
  }, [running])
  return now
}

/** The dispatched and settled inputs the chrome reads. */
export interface ShellRowChromeProps {
  toolName: string
  /** The header facts, already derived for this call's phase. */
  model: ShellRowModel
  t: Translate
  expanded: boolean
  toggle: () => void
  /** The dispatched call's argument JSON, or null before dispatch. */
  argsRaw: string | null
  /** The settled result, when the call has settled. */
  settledBlock: ToolResultNode | undefined
  /**
   * Whether the call is still running. The terminal card derives from the
   * RUNNING block in that state — the card's banner is where the command is
   * shown, so a running call must reach this component's card model rather than
   * being left to the generic fallback.
   */
  running: boolean
  /**
   * The call's start stamp in epoch milliseconds, or undefined when the block
   * carries none. Drives the elapsed-time label while `running`.
   */
  startedAt: number | undefined
  /** Session workspace root, for a relative summary or workdir. */
  sessionCwd: string | undefined
  /** Host account home, so a POSIX home path displays as `~`. */
  home: string | undefined
  /** Inspect this call in the trajectory view, when the owner offers it. */
  inspect: (() => void) | undefined
}

/**
 * The registered shell toolview: one explicit phase per dispatch, exactly like
 * the shipped bash row.
 *
 * Dispatching to a per-phase component is not a style choice — it is what keeps
 * the Hook order stable. A keyed row's component instance survives the
 * `preparing → start → result` transitions, and the preparing phase is the only
 * one that may call `useToolCallArgumentsPartial` (the seat is a no-op outside
 * it). Calling that Hook from a single component that also renders the later
 * phases renders FEWER Hooks on the transition than on the first render, which
 * React rejects with error #300 ("Rendered fewer hooks than expected") and the
 * slot surfaces as `slot entry crashed in 'tool.call.toolview'`. Switching the
 * element TYPE instead unmounts the preparing component, so each component's
 * own Hook list stays fixed for its whole life.
 * @param props - keyed toolview owner currency plus the locale seat.
 * @returns the preparing row, or the dispatched/settled row.
 */
export function ShellRow(props: ShellRowProps) {
  return props.phase === 'preparing'
    ? <PreparingShellRow {...props} />
    : <StartedShellRow {...props} />
}

/**
 * The preparing prefix: a named call whose arguments have not arrived. It shows
 * the call's title and lifecycle state and nothing else — there is no command
 * to show yet, and no body to expand.
 * @param props - preparing-phase row inputs.
 * @returns the non-expandable preparing row.
 */
export function PreparingShellRow({ toolName, useDisclosure, useToolCallArgumentsPartial, t }: Extract<ShellRowProps, { phase: 'preparing' }>) {
  const streamed = useToolCallArgumentsPartial()
  const { expanded, toggle } = useDisclosure()
  const model = shellRowModel(PREPARING_FACTS, streamed)
  return (
    <ShellRowChrome
      toolName={toolName}
      model={model}
      t={t}
      expanded={expanded}
      toggle={toggle}
      argsRaw={null}
      settledBlock={undefined}
      running={false}
      startedAt={undefined}
      sessionCwd={undefined}
      home={undefined}
      inspect={undefined}
    />
  )
}

/**
 * The dispatched and settled row.
 * @param props - start- or result-phase row inputs.
 * @returns the disclosure row.
 */
export function StartedShellRow({ phase, toolName, block, cwd, home, inspect, useDisclosure, t }: StartedShellProps) {
  const { expanded, setExpanded, toggle } = useDisclosure()
  // Open by default. `setExpanded` is the disclosure seat's own generation-bound
  // callback: it changes identity exactly when the enclosing Turn resets the
  // seat, so this effect fires on mount, on a replay, and after a Turn reset —
  // and never when the user collapses the row themselves.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the seat identity IS the reset signal.
  useEffect(() => { setExpanded(true) }, [setExpanded])
  // `phase` is the framework's own statement of which stage this is, and it is
  // the ONLY signal used here. The shipped rows infer settlement from the block's
  // discriminant (`'kind' in block`), which is a proxy: a stage whose block
  // happens to carry a `kind` would be read as settled, and a running call would
  // then take its arguments from the absent result call head — yielding an empty
  // payload, no terminal card, and the bare-arguments fallback in place of the
  // command.
  const settled = phase === 'result'
  // A dispatched call carries the arguments directly; a settled result carries
  // them on the call head it backfilled (empty when a window cut removed it).
  const argsRaw = settled ? block.call?.argsRaw ?? '' : block.argsRaw
  const model = shellRowModel(
    settled
      ? { settled: true, argsRaw, preparing: false, isError: block.isError, errorCode: block.error?.code }
      : { settled: false, argsRaw, preparing: false, isError: false, errorCode: undefined },
    '',
  )
  return (
    <ShellRowChrome
      toolName={toolName}
      model={model}
      t={t}
      expanded={expanded}
      toggle={toggle}
      argsRaw={argsRaw}
      settledBlock={settled ? block : undefined}
      running={!settled}
      startedAt={block.time}      sessionCwd={cwd}
      home={home}
      inspect={inspect}
    />
  )
}

/**
 * The shell row's chrome, split from the disclosure seat so it takes only the
 * inputs it reads.
 * @param props - the narrowed row inputs.
 * @returns the disclosure row and its expanded body.
 */
export function ShellRowChrome({
  toolName, model, t, expanded, toggle, argsRaw, settledBlock, running, startedAt, sessionCwd, home, inspect,
}: ShellRowChromeProps) {
  // One tick for the whole row, read by the header's clock. It is the ONLY place
  // the running time renders: showing the same readout above the card as well
  // duplicated one fact into two places, which is what "one time became two"
  // looked like after a remount.
  const now = useRunningTick(running)
  const elapsed = running ? formatElapsed(elapsedSince(startedAt, now)) : null
  // Only a timeout the command itself states is reported, so the pair reads
  // `19s / 30s` when the call set one and `19s` when it did not.
  const timeout = timeoutLabel(argsRaw)
  const clock = elapsed === null ? null : timeout === null ? elapsed : `${elapsed} / ${timeout}`
  // The terminal card's source: the RESULTS block once the call has settled, and
  // the RUNNING call before that. Passing only the settled block is what left a
  // running shell with no card at all (and therefore no command banner, and a
  // bare-arguments fallback in its place) — the card the shell row shows while a
  // command runs comes from this same derivation.
  const cardSource = useMemo(
    () => settledBlock ?? runningCallBlock(argsRaw),
    [settledBlock, argsRaw],
  )
  const card = useMemo(
    () => cardSource === null ? null : terminalCardModel(cardSource, sessionCwd),
    [cardSource, sessionCwd],
  )
  // A failing exit status is the terminal card's own error signal — the call
  // itself settles `isError: false` — so it is this row's error state too.
  const state: ShellRowState = model.state === 'ok' && card !== null && terminalFailed(card)
    ? 'error'
    : model.state
  const output = useMemo(() => settledBlock === undefined ? null : resultText(settledBlock) || null, [settledBlock])
  const body = useMemo(
    () => argsRaw === null || argsRaw === '' ? null : formatArguments(argsRaw),
    [argsRaw],
  )
  // The terminal card refuses some shell calls outright — a backgrounded one, a
  // persistent provider's, a spilled preview — and while a call is RUNNING there
  // is no result to build a card from either. Those calls must still show the
  // command they are about to run, so this flag adds the same prompt line the
  // card's banner would have drawn. It only ever applies to a running call: once
  // the call settles, an errored or spilled one falls back to the full
  // argument/output body, and a successful one has a real card.
  const synthetic = running && card === null && body !== null && model.command !== undefined
  const labels = useMemo(() => terminalBlockLabels(t), [t])
  const terminal: LocalizedTerminal | null = useMemo(() => {
    if (card === null) return null
    const copy = card.copy.kind === 'shell'
      ? { command: card.copy.command, description: card.copy.description }
      : {
        command: card.copy.text === '' ? t('terminal.sendInput') : card.copy.text,
        description: t('terminal.session', { sessionId: card.copy.sessionId }),
      }
    return { ...copy, ...card.card }
  }, [card, t])
  // The header's second line: the call's Tool-authored description. The command
  // renders in the card below, so the header never repeats it — a long command
  // would otherwise occupy the summary row as well as the banner. A call with no
  // description (a persistent-shell provider omits it) falls back to the shipped
  // one-line summary, which is the act the call performs rather than the command.
  const summary = useMemo(
    () => model.description ?? (argsRaw === null || argsRaw === '' ? '' : rowSummary(classifyTool(toolName), argsRaw, sessionCwd, home)),
    [model.description, argsRaw, toolName, sessionCwd, home],
  )
  const spilled = settledBlock !== undefined && isSpilledShellCall(toolName, settledBlock)
  const persistent = settledBlock !== undefined && isSettledPersistentShellCall(settledBlock)
  // The generic path covers the shell calls the terminal card refuses (a
  // persistent shell, a spill preview, a cancellation) plus the running calls
  // whose card only exists once they settle.
  const hasGeneric = synthetic || (body !== null || output !== null)
  const expandable = terminal !== null || hasGeneric
  const open = expanded && expandable
  const status = stateStatus(state, t)
  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (!expandable || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    toggle()
  }, [expandable, toggle])
  const shimmering = state === 'running' || state === 'preparing'
  // The line the header falls back to when the call carries neither a
  // description nor any argument text: the failure it settled with, or the
  // running state.
  const fallback = output === null ? t('bash.running') : (output.split('\n')[0] ?? '')
  // Which of the three body branches this render took, and the facts that decide
  // it. The element inspector reports them directly, which is the only way to
  // tell "the command banner is missing" apart from "the card model refused this
  // call" without a browser to drive — the two look identical in a screenshot.
  const branch = terminal !== null ? 'terminal' : synthetic ? 'running' : hasGeneric ? 'arguments' : 'empty'
  return (
    <div
      className={css.card}
      // `data-wraps` marks the row as this plugin's: the shipped bash row has no
      // such attribute, so it is the one-glance way to confirm the takeover is
      // live from the browser's element inspector.
      data-shell-row=""
      data-wraps=""
      data-tool={toolName}
      data-state={state}
      data-shell-branch={branch}
      data-shell-stage={running ? 'running' : settledBlock === undefined ? 'preparing' : 'settled'}
      data-shell-args={argsRaw === null || argsRaw === '' ? 'empty' : 'present'}
      data-shell-card={card === null ? 'none' : card.copy.kind}
    >
      {status !== null && <span className={css.visuallyHidden}>{status}</span>}
      <DisclosureRow
        rowClassName={css.root}
        leadingClassName={css.leading}
        contentClassName={css.content}
        contentLayoutClassName={css.contentLayout}
        chevronClassName={css.chevron}
        titleClassName={css.title}
        icon={leadingFor(state)}
        title={t(toolTitleKey(toolName))}
        running={shimmering}
        open={open}
        expandable={expandable}
        expandOnRowClick
        keepContentWhenOpen
        onToggle={toggle}
        collapsedContent={(
          <>
            <span className={css.sep} aria-hidden />
            <span className={clsx(css.summary, state === 'error' && css.errorSummary)}>
              {summary !== '' ? summary : fallback}
            </span>
            {clock !== null && <span className={css.elapsed}>{clock}</span>}
          </>
        )}
      >
        <div className={css.bodyWrap} data-shell-body="" onKeyDown={onKeyDown}>
          {terminal !== null ? (
            <TerminalBlock
              command={terminal.command}
              cwd={terminal.cwd}
              home={home}
              output={terminal.output}
              exitCode={terminal.exitCode}
              signal={terminal.signal}
              running={terminal.running}
              maxLines={Infinity}
              labels={labels}
              className={css.terminal}
            />
          ) : synthetic && model.command !== undefined ? (
            // A running call the terminal card would not draw: show the command
            // it is running, wrapped, with the same prompt line a real card
            // draws. There is no output yet by definition, so this block is
            // banner-only.
            <div className={css.syntheticBody} data-shell-running-body="">
              <TerminalBlock
                command={model.command}
                cwd={sessionCwd}
                home={home}
                running
                runStateDot={false}
                maxLines={Infinity}
                labels={labels}
                className={css.terminal}
              />
            </div>
          ) : (
            (body !== null || output !== null) && (
              <div className={css.ioCard}>
                {body !== null && (
                  <div className={css.ioSection}>
                    <span className={css.ioLabel}>{t('row.input')}</span>
                    <span className={css.ioText}>{body}</span>
                  </div>
                )}
                {body !== null && output !== null && <span className={css.ioDivider} aria-hidden />}
                {output !== null && (
                  <div className={css.ioSection}>
                    <span className={css.ioLabel}>{t('row.output')}</span>
                    <span className={css.ioText} data-error={state === 'error' || undefined}>{output}</span>
                  </div>
                )}
              </div>
            )
          )}
          {inspect !== undefined && (
            <button type="button" className={css.inspectButton} onClick={inspect}>
              <IconInspectOutlineRegular />
              {t('row.inspect')}
            </button>
          )}
        </div>
      </DisclosureRow>
    </div>
  )
}
