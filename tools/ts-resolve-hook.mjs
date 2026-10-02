/**
 * Node ESM resolver hook for the source-level checks.
 *
 * The plugin's sources import their local modules without a file extension —
 * that is what the bundler and `moduleResolution: bundler` expect — while Node's
 * own ESM resolver requires one. This hook resolves normally first and retries
 * with the TypeScript extensions, so `tools/run-model-checks.mjs` can import
 * `src/client/model.ts` directly instead of needing a bundler (and with it, the
 * vite startup that a restricted Windows sandbox denies).
 *
 * Registered by `tools/run-model-checks.mjs`; not part of the plugin.
 */

/** Extensions appended when the plain specifier does not resolve. */
const FALLBACKS = ['.ts', '.tsx', '/index.ts']

/**
 * Resolve a specifier with the TypeScript-extension fallback.
 * @param {string} specifier - the requested module specifier.
 * @param {object} context - the resolver context Node supplies.
 * @param {Function} nextResolve - the default resolver.
 * @returns {Promise<object>} the resolved module.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (specifier.startsWith('node:') || specifier.startsWith('data:')) throw error
    for (const extension of FALLBACKS) {
      try {
        return await nextResolve(specifier + extension, context)
      } catch {
        // Try the next extension.
      }
    }
    throw error
  }
}
