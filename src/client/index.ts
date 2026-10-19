/**
 * dsh-shell-expand — client half: every shell call row opens itself.
 *
 * The shipped rows render a shell call COLLAPSED, so reading the command a call
 * ran always costs one click. dsh 0.2.1-rc.2's own row already wraps a long
 * command instead of ellipsizing it and already reports the exit status as a
 * capsule beside the title, so the ONLY behavior left to add is that first
 * expansion — and that needs no card of its own.
 *
 * This half therefore contributes no slot registration and renders nothing: it
 * makes the shipped rows open themselves through the DOM they already publish.
 * Two published markers identify a shell row, whichever surface rendered it —
 * the shipped bash row's own header (`data-sample="bash"`, the element that is
 * its disclosure target) and the generic Tool row's `data-variant` / `data-tool`
 * attributes (which is what `pwsh` gets today). The disclosure itself is found
 * by the `aria-expanded` + `data-expandable` pair every disclosure row carries,
 * so a change to the shipped markup fails soft: the row simply stays collapsed
 * instead of breaking the transcript.
 *
 * Each row is expanded at most once, and only while it is part of the work the
 * user is watching. A row's element survives the `preparing → start → result`
 * transitions, so the expansion happens as soon as the row has something to
 * expand (a preparing row has no body yet). A settled row entering the DOM is
 * history — a replayed session, or an older page loaded by scrolling — and it
 * stays collapsed: the harness already folds a finished Turn, and Chat's
 * collapse-timing setting decides when that happens. Expanding history is what
 * kept every finished command's output rendered in a long conversation, so the
 * two rules together are also the plugin's whole performance posture: it adds
 * DOM only for calls the user is currently watching.
 *
 * A collapse the user performs afterwards is respected (the row is decided and
 * never reopened), and a row inside an already-folded Turn is left alone even
 * when its disclosure resets.
 */

/**
 * The slice of the client root context this fiber touches. Declared structurally
 * on purpose: the client half is bundled standalone and the module loader
 * provides nothing to it, so it imports no package at runtime or for types.
 */
export interface ClientContext {
  /**
   * Register a scoped effect; the returned disposer runs on fiber unload.
   * @param effect - effect body, optionally returning its own disposer.
   * @param label - human-readable effect name used by diagnostics.
   */
  effect(effect: () => void | (() => void), label?: string): void
}

/** No cordis services needed by this fiber. */
export const inject: string[] = []

/**
 * One selector per surface that renders a shell row: the shipped bash row's
 * header and the generic Tool row's variant/name markers. `querySelectorAll`
 * returns each element once however many alternatives match it.
 */
const SHELL_ROW = [
  '[data-sample="bash"]',
  '[data-variant="bash"]',
  '[data-tool="bash"]',
  '[data-variant="pwsh"]',
  '[data-tool="pwsh"]',
].join(', ')

/**
 * A disclosure target: the element that carries both the expandable marker and
 * the expanded state. `querySelector` returns the first in document order, and
 * a row's own header always precedes anything inside its body — so an inner
 * control that happens to be expandable is never mistaken for the row's.
 */
const EXPANDABLE_DISCLOSURE = '[aria-expanded][data-expandable]'

/**
 * The node wrapper that carries one Tool call's identity. A row and its
 * sub-calls each sit in their own wrapper, so `closest` from a row names that
 * row's call and never its parent's.
 */
const CALL_HOST = '[data-chat-call-id]'

/**
 * A folded Turn's node wrapper. The harness hides a folded Turn's rows with CSS
 * instead of unmounting them, so their DOM — and any expanded card's body —
 * stays mounted. Its own disclosure reset collapses them; reopening one here
 * would undo the user's collapse-timing setting and keep that body rendered
 * behind a hidden dialogue row.
 */
const FOLDED_TURN = '[data-turn-process-hidden]'

/** Attribute recording what this plugin did to a row, for inspection. */
const MARKER = 'data-shell-expand'

/**
 * The element that toggles this row's body, or null when the row has none yet.
 * The shipped bash row IS its own header; every other surface nests a
 * disclosure row inside the row element.
 * @param row - one element matching {@link SHELL_ROW}.
 * @returns the disclosure target, or null while the row has nothing to expand.
 */
function toggleOf(row: Element): Element | null {
  if (row.hasAttribute('data-expandable')) return row
  return row.querySelector(EXPANDABLE_DISCLOSURE)
}

/**
 * True while the row's call is still executing. A settled row that arrives in
 * the DOM is history — a replayed session, or an older page loaded by scrolling
 * — and history belongs to the collapse-timing setting, not to this plugin.
 * @param row - one element matching {@link SHELL_ROW}.
 * @returns whether the row reports a running state.
 */
function isRunning(row: Element): boolean {
  return row.getAttribute('data-state') === 'running'
}

/**
 * The state this observer remembers for one row: rows are decided once, keyed by
 * their call when the wrapper publishes one. A row that React remounts (a
 * re-render above it, a page reinserted from history) must not decide twice.
 */
interface Decisions {
  /** Call ids already decided. */
  readonly calls: Set<string>
  /** Rows without a call id, decided by element identity. */
  readonly rows: WeakSet<Element>
}

/**
 * Open one shell row, at most once per call.
 *
 * A row that already has an expandable body counts as decided whatever its
 * state, so the collapse gesture belongs to the user from then on. Clicking is
 * the published interaction: the disclosure row's own `onClick` toggles it, and
 * a synthetic click on a React-managed element is an ordinary user gesture.
 * @param row - one element matching {@link SHELL_ROW}.
 * @param decisions - rows and calls this observer has already decided about.
 */
function openOnce(row: Element, decisions: Decisions): void {
  const toggle = toggleOf(row)
  // Nothing to expand yet: a preparing call has no body, and this row must be
  // reconsidered once one arrives (an attribute mutation brings us back).
  if (toggle === null) return
  const callId = row.closest(CALL_HOST)?.getAttribute('data-chat-call-id') ?? null
  if (callId === null) {
    if (decisions.rows.has(row)) return
    decisions.rows.add(row)
  } else {
    if (decisions.calls.has(callId)) return
    decisions.calls.add(callId)
  }
  if (row.closest(FOLDED_TURN) !== null) return
  if (toggle.getAttribute('aria-expanded') !== 'false') return
  row.setAttribute(MARKER, 'opened')
  ;(toggle as HTMLElement).click()
}

/**
 * Watch the transcript for shell rows the user is actually watching, and open
 * each one the first time it has something to expand.
 *
 * Only two things trigger an expansion: a running row entering the DOM, and a
 * row gaining its expandable body while the observer is watching (a preparing
 * call that dispatches). Everything already present at load, and everything
 * inserted as an already-settled row, is history.
 * @returns the disposer that detaches the observer.
 */
function watchShellRows(): () => void {
  const root = document.body
  if (root === null) return () => {}
  const decisions: Decisions = { calls: new Set<string>(), rows: new WeakSet<Element>() }

  const consider = (node: Element): void => {
    if (node.matches(SHELL_ROW) && isRunning(node)) openOnce(node, decisions)
    for (const row of node.querySelectorAll(SHELL_ROW)) {
      if (isRunning(row)) openOnce(row, decisions)
    }
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        const target = record.target
        if (!(target instanceof Element)) continue
        // The changed attribute belongs to a disclosure target; its row is the
        // enclosing shell row, if any. This is the dispatch transition, where a
        // row that had nothing to expand gains its body.
        const row = target.closest(SHELL_ROW)
        if (row !== null) openOnce(row, decisions)
        continue
      }
      for (const added of record.addedNodes) {
        if (added instanceof Element) consider(added)
      }
    }
  })
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    // Only the two attributes that can make a row expandable, so a streaming
    // transcript (text nodes, class churn) never wakes this observer.
    attributeFilter: ['aria-expanded', 'data-expandable'],
  })
  // A page reload during a running call: that row is the one thing already in
  // the DOM that is not history. Settled rows are left to their own collapse
  // state, which is what keeps a long replayed session cheap to render.
  for (const row of root.querySelectorAll(SHELL_ROW)) {
    if (isRunning(row)) openOnce(row, decisions)
  }
  return () => { observer.disconnect() }
}

/**
 * Apply the shell-expand behavior.
 * @param ctx - client root context (used for effect-scoped teardown).
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => watchShellRows(), 'dsh-shell-expand: open shell rows')
}
