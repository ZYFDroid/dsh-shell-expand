//#region src/index.ts
/**
* Host loader entry for the dsh-shell-expand plugin.
*
* The whole plugin lives in the browser half (`src/client/`): it opens each
* shipped shell row the first time that row has a body to expand. Nothing about
* a shell call's presentation, model, or session log changes, and no host
* service is read — so this entry exists to satisfy the plugin protocol (a
* Loader entry needs a runtime module) and contributes nothing else.
*/
/** Host entry: no host-side contribution; the client half owns the whole plugin. */
function apply() {}
//#endregion
export { apply };
