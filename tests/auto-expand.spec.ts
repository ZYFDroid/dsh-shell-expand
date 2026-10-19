// @vitest-environment jsdom
/**
 * The client half's whole contract: shell rows the user is watching open
 * themselves once they have a body, and nothing about history is touched.
 *
 * The fixtures reproduce the two published row surfaces — the shipped bash row,
 * whose header IS the row element, and the generic Tool row, which nests a
 * disclosure row — and make their headers behave like the React disclosure:
 * a press flips `aria-expanded` and grows or drops the body. Each fixture also
 * carries the `data-state` the shipped rows publish, which is how this plugin
 * tells live work from history, and may be wrapped in the markers a Tool call
 * and a folded Turn publish.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import type { ClientContext } from '../src/client/index.ts'

/** One fixture row and the press count its disclosure recorded. */
interface FixtureRow {
  root: HTMLElement
  header: HTMLElement
  clicks: () => number
}

/** The applied fiber's disposer. */
let dispose: () => void

beforeEach(() => {
  document.body.innerHTML = ''
  dispose = () => {}
})

afterEach(() => {
  dispose()
  document.body.innerHTML = ''
})

/**
 * Install the plugin the way the client fiber does.
 * @returns the effect disposer the fiber would run on unload.
 */
function install(): () => void {
  let captured: () => void = () => {}
  const ctx: ClientContext = {
    effect(effect) {
      const cleanup = effect()
      captured = () => { cleanup?.() }
      return captured
    },
  }
  apply(ctx)
  return captured
}

/**
 * Set a fixed set of data attributes on one element.
 * @param element - the target element.
 * @param attributes - attribute name/value pairs to set.
 */
function mark(element: HTMLElement, attributes: Record<string, string>): void {
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
}

/**
 * Make one element the row's disclosure target, behaving like React's: a press
 * flips `aria-expanded` and grows or drops the body.
 * @param root - the row element the body belongs to.
 * @param toggle - the element that carries the expandable marker and state.
 * @returns the fixture row.
 */
function wireDisclosure(root: HTMLElement, toggle: HTMLElement): FixtureRow {
  let clicks = 0
  toggle.setAttribute('data-expandable', '')
  toggle.setAttribute('aria-expanded', 'false')
  toggle.addEventListener('click', () => {
    clicks += 1
    const open = toggle.getAttribute('aria-expanded') === 'true'
    toggle.setAttribute('aria-expanded', open ? 'false' : 'true')
    const body = root.querySelector('[data-fixture-body]')
    if (open) {
      body?.remove()
      return
    }
    const next = document.createElement('div')
    next.setAttribute('data-fixture-body', '')
    next.textContent = 'command output'
    root.append(next)
  })
  return { root, header: toggle, clicks: () => clicks }
}

/**
 * A row whose header IS the row element: the shipped bash row's shape.
 * @param attributes - the row's published markers.
 * @returns the fixture row.
 */
function headerRow(attributes: Record<string, string>): FixtureRow {
  const root = document.createElement('div')
  mark(root, attributes)
  return wireDisclosure(root, root)
}

/**
 * A row that nests its disclosure row: the generic Tool row's shape.
 * @param attributes - the row's published markers.
 * @returns the fixture row.
 */
function nestedRow(attributes: Record<string, string>): FixtureRow {
  const root = document.createElement('div')
  mark(root, attributes)
  const header = document.createElement('div')
  header.setAttribute('data-disclosure-header', '')
  const disclosure = document.createElement('div')
  disclosure.setAttribute('data-disclosure-row', '')
  header.append(disclosure)
  root.append(header)
  return wireDisclosure(root, disclosure)
}

/**
 * Wrap a row the way the transcript does: in its Tool call's identity, and
 * optionally inside a folded Turn.
 * @param row - the fixture row's root.
 * @param callId - the call identity the wrapper publishes.
 * @param folded - whether the enclosing Turn is folded.
 * @returns the wrapper element to insert.
 */
function wrap(row: HTMLElement, callId: string, folded = false): HTMLElement {
  const inner = document.createElement('div')
  inner.setAttribute('data-chat-call-id', callId)
  inner.append(row)
  if (!folded) return inner
  const turn = document.createElement('div')
  turn.setAttribute('data-turn-process-hidden', '')
  turn.append(inner)
  return turn
}

/** Let the MutationObserver deliver its queued records. */
const settle = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0) })

describe('shell row auto-expand', () => {
  it('requires no cordis service', () => {
    expect(inject).toEqual([])
  })

  it('opens a running row that was already rendered when the plugin loaded', async () => {
    const row = headerRow({ 'data-sample': 'bash', 'data-variant': 'bash', 'data-state': 'running' })
    document.body.append(row.root)
    dispose = install()
    await settle()
    expect(row.clicks()).toBe(1)
    expect(row.header.getAttribute('aria-expanded')).toBe('true')
    expect(row.root.getAttribute('data-shell-expand')).toBe('opened')
    expect(row.root.querySelector('[data-fixture-body]')).not.toBeNull()
  })

  it('leaves history alone: a settled row present at load stays collapsed', async () => {
    // A replayed session renders every finished call as a settled row. Opening
    // them all is what kept a long transcript's outputs rendered.
    const row = headerRow({ 'data-sample': 'bash', 'data-variant': 'bash', 'data-state': 'ok' })
    document.body.append(row.root)
    dispose = install()
    await settle()
    expect(row.clicks()).toBe(0)
    expect(row.root.hasAttribute('data-shell-expand')).toBe(false)
  })

  it('opens a running shell row inserted after the plugin loaded', async () => {
    dispose = install()
    const row = nestedRow({ 'data-tool': 'pwsh', 'data-variant': 'pwsh', 'data-state': 'running' })
    document.body.append(wrap(row.root, 'call-1'))
    await settle()
    expect(row.clicks()).toBe(1)
    expect(row.root.querySelector('[data-fixture-body]')).not.toBeNull()
  })

  it('leaves a settled row inserted later alone (an older page)', async () => {
    dispose = install()
    const row = nestedRow({ 'data-tool': 'bash', 'data-variant': 'bash', 'data-state': 'ok' })
    document.body.append(wrap(row.root, 'call-2'))
    await settle()
    expect(row.clicks()).toBe(0)
  })

  it('leaves every other tool row alone', async () => {
    dispose = install()
    const row = nestedRow({ 'data-tool': 'edit', 'data-variant': 'edit', 'data-state': 'running' })
    document.body.append(wrap(row.root, 'call-3'))
    await settle()
    expect(row.clicks()).toBe(0)
    expect(row.header.getAttribute('aria-expanded')).toBe('false')
  })

  it('waits for a row that has nothing to expand yet, then opens it', async () => {
    // A call that has been dispatched but has no arguments yet: the header
    // carries neither marker, so there is nothing to expand.
    dispose = install()
    const row = nestedRow({ 'data-tool': 'pwsh', 'data-variant': 'pwsh', 'data-state': 'preparing' })
    row.header.removeAttribute('data-expandable')
    row.header.removeAttribute('aria-expanded')
    document.body.append(wrap(row.root, 'call-4'))
    await settle()
    expect(row.clicks()).toBe(0)

    // The call dispatches: the same element gains the disclosure pair.
    row.header.setAttribute('data-expandable', '')
    row.header.setAttribute('aria-expanded', 'false')
    await settle()
    expect(row.clicks()).toBe(1)
  })

  it('respects a collapse the user performed after the automatic expansion', async () => {
    const row = headerRow({ 'data-sample': 'bash', 'data-variant': 'bash', 'data-state': 'running' })
    document.body.append(wrap(row.root, 'call-5'))
    dispose = install()
    await settle()
    expect(row.clicks()).toBe(1)

    // The user presses the row: it closes. A later render must not reopen it.
    row.header.setAttribute('aria-expanded', 'false')
    row.root.querySelector('[data-fixture-body]')?.remove()
    await settle()
    expect(row.clicks()).toBe(1)
  })

  it('does not reopen a row React remounted with the same call identity', async () => {
    dispose = install()
    const first = nestedRow({ 'data-tool': 'pwsh', 'data-variant': 'pwsh', 'data-state': 'running' })
    const host = wrap(first.root, 'call-6')
    document.body.append(host)
    await settle()
    expect(first.clicks()).toBe(1)

    // A re-render above the row replaces the elements but not the call.
    const second = nestedRow({ 'data-tool': 'pwsh', 'data-variant': 'pwsh', 'data-state': 'ok' })
    host.replaceChildren(wrap(second.root, 'call-6'))
    await settle()
    expect(second.clicks()).toBe(0)
  })

  it('never opens a row inside a folded Turn', async () => {
    // A folded Turn hides its rows with CSS; they stay mounted. Reopening one
    // would undo the user's collapse-timing setting.
    dispose = install()
    const row = nestedRow({ 'data-tool': 'pwsh', 'data-variant': 'pwsh', 'data-state': 'running' })
    document.body.append(wrap(row.root, 'call-7', true))
    await settle()
    expect(row.clicks()).toBe(0)
    expect(row.root.hasAttribute('data-shell-expand')).toBe(false)
  })

  it('stops observing when the fiber unloads', async () => {
    const first = headerRow({ 'data-sample': 'bash', 'data-state': 'running' })
    document.body.append(wrap(first.root, 'call-8'))
    dispose = install()
    await settle()
    expect(first.clicks()).toBe(1)

    dispose()
    const second = headerRow({ 'data-sample': 'bash', 'data-state': 'running' })
    document.body.append(wrap(second.root, 'call-9'))
    await settle()
    expect(second.clicks()).toBe(0)
  })
})
