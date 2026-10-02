// @vitest-environment jsdom
// Shell row: the pure argument/state derivation (including the partial JSON a
// streaming call hands the row) and the rendered chrome — open by default, the
// command only in the card below, and the header limited to title + summary.

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { useCallback, useState } from 'react'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { zh as conversationZh } from '@deepseek-ai/dsh-client-ui-conversation/src/client/locales.ts'
import type { StartedToolCall, ToolResultNode, UseDisclosure } from '@deepseek-ai/dsh-client-ui-chat/client'
import { apply } from '../src/client/index.tsx'
import {
  hasSpillNotice, partialString, parseObject, shellRowModel, shellState, toolTitleKey,
} from '../src/client/model.ts'
import { PreparingShellRow, ShellRow } from '../src/client/shell-row.tsx'
import type { ShellRowProps } from '../src/client/shell-row.tsx'

afterEach(cleanup)

/** The framework disclosure seat: independent open state per invocation. */
const useDisclosure: UseDisclosure = () => {
  const [open, setOpen] = useState(false)
  return {
    expanded: open,
    setExpanded: useCallback((next: boolean) => { setOpen(next) }, []),
    toggle: useCallback(() => { setOpen(previous => !previous) }, []),
  }
}

/** The conversation `t` seat: the namespace dictionary, then the shared common
 *  vocabulary, with `{name}` interpolation — the locale service's own order. */
const t = ((key: string, params?: Record<string, unknown>): string => {
  const template = (conversationZh as Record<string, string>)[key]
    ?? (commonZh as Record<string, string>)[key]
    ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match)
}) as ShellRowProps['t']

/** A dispatched `bash` call. */
function started(args: Record<string, unknown>, name = 'bash'): StartedToolCall {
  return {
    phase: 'start', name, callId: 'call-1', argsRaw: JSON.stringify(args), time: Date.now() - 5000,
  } as unknown as StartedToolCall
}

/** A settled `bash` result whose single text block is the shell renderer's output. */
function settled(args: Record<string, unknown>, text: string, extra: Partial<ToolResultNode> = {}): ToolResultNode {
  return {
    kind: 'tool-result',
    callId: 'call-1',
    call: { name: 'bash', argsRaw: JSON.stringify(args) },
    content: [{ type: 'text', text }],
    isError: false,
    ...extra,
  } as unknown as ToolResultNode
}

/** The facts of a dispatched call, for the pure header derivation. */
const running = { settled: false, argsRaw: '{}', preparing: false, isError: false, errorCode: undefined } as const

/**
 * Props for the registered row. The framework supplies these seats; the spec
 * provides the few the row reads, so the row's OWN phase handling is exercised
 * rather than a helper's re-derivation of it.
 * @param block - the phase-specific tool block.
 * @param extra - overrides for the owner seats.
 * @returns the props object.
 */
function rowProps(
  block: StartedToolCall | ToolResultNode,
  extra: Record<string, unknown> = {},
): ShellRowProps {
  return {
    toolName: 'bash',
    callId: 'call-1',
    useDisclosure,
    t,
    openFile: () => {},
    loadImage: async () => '',
    useToolCallArgumentsPartial: () => '',
    phase: 'kind' in block ? 'result' : 'start',
    block,
    ...extra,
  } as unknown as ShellRowProps
}

/** Render the registered row for one tool block. */
function renderRow(block: StartedToolCall | ToolResultNode, extra: Record<string, unknown> = {}): void {
  render(<ShellRow {...rowProps(block, extra)} />)
}

describe('partialString', () => {
  it('reads a member out of a payload whose object has not closed', () => {
    expect(partialString('{"command": "npm run build", "desc', 'command')).toBe('npm run build')
  })

  it('decodes a complete streamed value', () => {
    expect(partialString('{"command": "echo \\"hi\\""}', 'command')).toBe('echo "hi"')
  })

  it('refuses an open string, whose escapes are still JSON-encoded', () => {
    expect(partialString('{"command": "npm run build', 'command')).toBeUndefined()
  })

  it('refuses a value whose closing quote has not arrived', () => {
    // The raw prefix is still JSON-escaped; returning it would show backslashes.
    expect(partialString('{"command": "echo \\"hi', 'command')).toBeUndefined()
  })

  it('ignores a member that only shares the key as a prefix', () => {
    expect(partialString('{"commandline": "nope", "command": "yes"}', 'command')).toBe('yes')
  })

  it('returns undefined for a member that has not started', () => {
    expect(partialString('{"desc', 'description')).toBeUndefined()
  })
})

describe('parseObject', () => {
  it('parses an object payload', () => {
    expect(parseObject('{"a":1}')).toEqual({ a: 1 })
  })

  it('rejects a truncated payload', () => {
    expect(parseObject('{"a":1')).toBeUndefined()
  })

  it('rejects an array payload', () => {
    expect(parseObject('[1,2]')).toBeUndefined()
  })
})

describe('shellState', () => {
  it('is preparing before any argument material exists', () => {
    expect(shellState({ ...running, preparing: true })).toBe('preparing')
  })

  it('is running once dispatched', () => {
    expect(shellState(running)).toBe('running')
  })

  it('is stopped for an interrupted result', () => {
    expect(shellState({ ...running, settled: true, errorCode: 'interrupted' })).toBe('stopped')
  })

  it('is error for a failed result', () => {
    expect(shellState({ ...running, settled: true, isError: true })).toBe('error')
  })

  it('is ok for a clean result', () => {
    expect(shellState({ ...running, settled: true })).toBe('ok')
  })
})

describe('shellRowModel', () => {
  it('carries the frozen command and description', () => {
    const model = shellRowModel({ ...running, argsRaw: JSON.stringify({ command: 'ls', description: 'list' }) }, '')
    expect(model).toMatchObject({ command: 'ls', description: 'list', state: 'running' })
  })

  it('carries the streamed command once its value closes', () => {
    const model = shellRowModel({ ...running, argsRaw: null, preparing: true }, '{"command": "git st", "descriptio')
    expect(model.command).toBe('git st')
  })

  it('treats a blank command as absent', () => {
    expect(shellRowModel({ ...running, argsRaw: JSON.stringify({ command: '   ' }) }, '').command).toBeUndefined()
  })
})

describe('toolTitleKey', () => {
  it('titles both shell tools', () => {
    expect(toolTitleKey('bash')).toBe('tool.title.bash')
    expect(toolTitleKey('pwsh')).toBe('tool.title.pwsh')
  })
})

describe('hasSpillNotice', () => {
  const notice = '(Omitted 1048576 bytes. Full formatted result stored at: '
    + '/w/spill.txt. Read the spill file for the rest)'

  it('recognizes the persisted footer', () => {
    expect(hasSpillNotice(`preview\n\n${notice}`)).toBe(true)
  })

  it('rejects ordinary output', () => {
    expect(hasSpillNotice('preview\n[exit code: 0]')).toBe(false)
  })
})

describe('ShellRowChrome', () => {
  it('treats a start-phase block as running even when it carries a kind', () => {
    // The regression this pins: settlement was inferred from the block's own
    // discriminant (`'kind' in block`). A start-phase block that happens to carry
    // a `kind` was read as settled, so the arguments came from the absent result
    // call head — an empty payload, no terminal card, and the bare-arguments
    // fallback where the command should be. `phase` is the framework's own
    // statement of the stage and is what the row reads now.
    const block = {
      phase: 'start',
      name: 'bash',
      callId: 'call-1',
      argsRaw: JSON.stringify({ command: 'npm run build', description: 'build the client' }),
      time: Date.now() - 3000,
      kind: 'tool-result',
    } as unknown as StartedToolCall
    renderRow(block)
    expect(document.querySelector('[data-shell-stage]')?.getAttribute('data-shell-stage')).toBe('running')
    expect(document.querySelector('[data-shell-branch]')?.getAttribute('data-shell-branch')).not.toBe('arguments')
    expect(document.querySelector('[data-shell-running-body]')?.textContent).toContain('npm run build')
  })

  it('shows elapsed alone when the call states no timeout', () => {
    renderRow(started({ command: 'npm run build', description: 'build' }))
    const readouts = document.querySelectorAll('[class*="elapsed"]')
    expect(readouts.length).toBe(1)
    expect(readouts[0]?.textContent).toMatch(/^\d+s$/)
  })

  it('shows elapsed over timeout when the call states one', () => {
    renderRow(started({ command: 'npm run build', description: 'build', timeoutMs: 30_000 }))
    const readouts = document.querySelectorAll('[class*="elapsed"]')
    expect(readouts.length).toBe(1)
    expect(readouts[0]?.textContent).toMatch(/^\d+s \/ 30s$/)
  })

  it('spells a round minute deadline in minutes', () => {
    renderRow(started({ command: 'npm run build', description: 'build', timeoutMs: 60_000 }))
    expect(document.querySelector('[class*="elapsed"]')?.textContent).toMatch(/^\d+s \/ 1m 0s$/)
  })

  it('drops the whole readout once the call settles', () => {
    renderRow(settled({ command: 'npm run build', description: 'build', timeoutMs: 30_000 }, 'done\n[exit code: 0]'))
    expect(document.querySelectorAll('[class*="elapsed"]').length).toBe(0)
  })

  it('shows the command while a running call has no result yet', () => {
    // The reported defect: a running shell fell back to a bare-arguments card
    // that showed the description and timeout but NOT the command, because the
    // terminal card was derived only from the (absent) result block.
    const command = 'npm run build --workspace packages/client --if-present'
    renderRow(started({ command, description: 'build the client', timeoutMs: 120000 }))
    const body = document.querySelector('[data-shell-running-body]')
    expect(body).not.toBeNull()
    expect(body?.textContent).toContain(command)
    expect(document.querySelector('[class*="ioCard"]')).toBeNull()
  })

  it('keeps the command in the fallback body once the call has settled', () => {
    // A settled call the terminal card refuses (a persistent shell) shows the
    // full argument payload, command included.
    renderRow(settled({ command: 'tail -f log', workdir: '/w' }, 'line\n[exit code: 2]'))
    const ioText = document.querySelector('[class*="ioText"]')
    expect(ioText?.textContent).toContain('tail -f log')
  })

  it('wraps a running command rather than ellipsizing it', () => {
    const command = `demo ${Array.from({ length: 24 }, (_, index) => `--flag-${index}-with-a-long-name`).join(' ')}`
    renderRow(started({ command, description: 'long' }))
    expect(document.querySelector('[data-shell-running-body]')?.textContent).toContain('--flag-23-with-a-long-name')
  })

  it('renders an expanded call with the terminal card', () => {
    renderRow(started({ command: 'git log --oneline --graph', description: 'history' }))
    expect(document.querySelector('[data-terminal]')).not.toBeNull()
    expect(document.querySelector('[data-shell-row]')?.hasAttribute('data-wraps')).toBe(true)
  })

  it('never puts the command in the header', () => {
    const command = 'demo --target Release --flag-1 --flag-2 --flag-3'
    renderRow(started({ command, description: 'a short description' }))
    // The header carries the description only; the command appears exactly once,
    // in the terminal banner.
    expect(document.querySelector('[class*="summary"]')?.textContent).toBe('a short description')
    const banners = [...document.querySelectorAll('[class*="command"]')]
    expect(banners.map(node => node.textContent)).toEqual([command])
  })

  it('keeps a long command out of the summary while expanded', () => {
    const command = `cmd ${Array.from({ length: 24 }, (_, index) => `--flag-${index}`).join(' ')}`
    renderRow(started({ command, description: 'd' }))
    const summary = document.querySelector('[class*="summary"]')
    expect(summary?.textContent).toBe('d')
    expect(summary?.textContent).not.toContain('--flag-23')
  })

  it('hides the card when the row is closed', () => {
    renderRow(started({ command: 'ls -la', description: 'list' }), { expanded: false })
    expect(document.querySelector('[data-shell-body]')).toBeNull()
    expect(document.querySelector('[data-shell-running-body]')).toBeNull()
  })

  it('falls back to the shipped argument summary when the call has no description', () => {
    // A persistent-shell call: no description, so the shipped summary rule
    // supplies the row's second line.
    renderRow(settled({ workdir: '/w', timeoutMs: 1000 }, 'partial output'))
    expect(document.querySelector('[class*="summary"]')?.textContent).toBe('/w')
  })

  it('renders the terminal output without repeating the exit marker', () => {
    renderRow(settled({ command: 'ls', description: 'list' }, 'a\nb\n[exit code: 0]'))
    const terminal = document.querySelector('[data-terminal]')
    expect(terminal?.textContent).toContain('a')
    expect(terminal?.textContent).not.toContain('[exit code: 0]')
  })

  it('surfaces a failing exit status as the row error state', () => {
    renderRow(settled({ command: 'ls', description: 'list' }, 'boom\n[exit code: 1]'))
    expect(document.querySelector('[data-shell-row]')?.getAttribute('data-state')).toBe('error')
  })

  it('marks an interrupted call as stopped', () => {
    renderRow(
      settled({ command: 'ls', description: 'list' }, 'partial', {
        isError: true,
        error: { name: 'Interrupted', code: 'interrupted' },
      }),
    )
    expect(document.querySelector('[data-shell-row]')?.getAttribute('data-state')).toBe('stopped')
  })

  it('renders the generic IN/OUT fallback for a spilled preview', () => {
    const notice = '(Omitted 1048576 bytes. Full formatted result stored at: '
      + '/w/spill.txt. Read the spill file for the rest)'
    renderRow(settled({ command: 'yes', description: 'spam' }, `head\n\n${notice}`))
    expect(document.querySelector('[data-terminal]')).toBeNull()
    expect(document.querySelectorAll('[class*="ioSection"]').length).toBe(2)
  })

  it('renders the generic fallback for a failed persistent shell', () => {
    renderRow(settled({ command: 'tail -f log', workdir: '/w' }, 'line\n[exit code: 2]'))
    expect(document.querySelector('[data-terminal]')).toBeNull()
    expect(document.querySelector('[class*="ioCard"]')).not.toBeNull()
  })

  it('does not throw on malformed arguments', () => {
    const block = { phase: 'start', name: 'bash', callId: 'c', argsRaw: '{"command": "oops' } as unknown as StartedToolCall
    expect(() => renderRow(block)).not.toThrow()
  })

  it('shows the inspect affordance only when the owner supplies one', () => {
    renderRow(started({ command: 'ls', description: 'list' }), { inspect: () => {} })
    expect(document.querySelector('[class*="inspectButton"]')).not.toBeNull()
  })
})

describe('PreparingShellRow', () => {
  it('keeps a stable Hook order across the preparing-to-started transition', () => {
    // The regression this pins: a single component that called
    // `useToolCallArgumentsPartial` only while preparing rendered FEWER Hooks on
    // the transition, which React rejects with error #300 ("Rendered fewer hooks
    // than expected") and the slot surfaces as a crashed toolview. The phases are
    // separate components now, so preparing then started must not throw.
    const preparing = {
      phase: 'preparing',
      name: 'bash',
      callId: 'call-1',
      toolName: 'bash',
      useDisclosure: () => ({ expanded: false, setExpanded: () => {}, toggle: () => {} }),
      useToolCallArgumentsPartial: () => '{"command": "git st',
      t,
    } as unknown as Parameters<typeof PreparingShellRow>[0]
    expect(() => {
      const view = render(<PreparingShellRow {...preparing} />)
      view.rerender(<PreparingShellRow {...preparing} />)
      view.unmount()
      renderRow(started({ command: 'git status', description: 'status' }))
    }).not.toThrow()
    expect(document.querySelector('[data-shell-row]')).not.toBeNull()
  })
})

describe('apply', () => {
  it('registers both shell keys at the shadowing priority', () => {
    const registrations: Array<{ key?: string, priority?: number, locale?: string }> = []
    const ctx = {
      slots: {
        inject: (_name: string, run: () => Generator<unknown>) => { for (const _ of run()) { /* drain */ } },
        register: (options: { key?: string, priority?: number, locale?: string }) => {
          registrations.push(options)
          return () => {}
        },
      },
    } as unknown as Parameters<typeof apply>[0]
    apply(ctx)
    expect(registrations.map(entry => entry.key)).toEqual(['bash', 'pwsh'])
    expect(registrations.every(entry => entry.priority === -1)).toBe(true)
    expect(registrations.every(entry => entry.locale === 'conversation')).toBe(true)
  })
})
