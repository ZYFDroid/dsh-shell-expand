/**
 * Host loader entry for the dsh-shell-expand plugin.
 *
 * The whole plugin lives in the browser half (`src/client/`): it takes over the
 * `bash` / `pwsh` rows in the keyed `tool.call.toolview` slot and changes only
 * how a shell call is PRESENTED. The host registers both tools as usual, the
 * session log is untouched, and no host service is read — so this entry exists
 * to satisfy the plugin protocol (a Loader entry needs a runtime module) and
 * contributes nothing else.
 */

/** Host entry: no host-side contribution; the client half owns the whole plugin. */
export function apply(): void {}
