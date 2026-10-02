/**
 * Register the TypeScript-extension resolver hook before a check script runs.
 * Invoked through Node's `--import` flag; see `tools/ts-resolve-hook.mjs`.
 */
import { register } from 'node:module'

register('./ts-resolve-hook.mjs', import.meta.url)
