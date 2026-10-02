/**
 * Registers this plugin's shell row into the ui-tool keyed atomic Tool view
 * slot (`tool.call.toolview`) under the `bash` and `pwsh` keys.
 *
 * The keyed slot ranks registrations by priority and renders the LOWEST, so a
 * registration at `-1` shadows the shipped `bash` row while this plugin is
 * mounted and the shipped row returns unchanged when it unloads. `pwsh` has no
 * shipped toolview — it falls through to the generic row today — so this
 * registration supplies one rather than replacing anything.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the SlotRegistry Context merge (ctx.slots) together with the
// current `tool.call.toolview` SlotMap declaration (owner phase props and the
// slot-level inject hooks). The slots service lives in ui-renderer; the Tool
// slot contract lives in ui-tool.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { ShellRow } from './shell-row'

/** Required service: the slot registry. */
export const inject = ['slots']

/** The wire tools rendered as shell calls (both share one command row). */
const SHELL_TOOLS = ['bash', 'pwsh'] as const

/**
 * Dictionary namespace this row's copy is translated through. The shipped bash
 * row registers under the same one, so titles, states, and the IN/OUT/inspect
 * chrome follow the active locale exactly as the row it replaces does.
 */
const NS = 'conversation'

/**
 * Mount the shell rows into the keyed atomic Tool view slot at a priority that
 * shadows the shipped `bash` row.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('tool.call.toolview', function* () {
    for (const key of SHELL_TOOLS) {
      yield ctx.slots.register({
        name: 'tool.call.toolview',
        key,
        locale: NS,
        priority: -1,
      }, ShellRow)
    }
  })
}
