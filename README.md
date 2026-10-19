# dsh-shell-expand

> 中文版：[README.zh.md](./README.zh.md)

A DeepSeek Harness client plugin that opens a **shell tool row** (`bash` and
`pwsh`) as soon as it has something to expand, so reading the command a call ran
never costs a click — while you are watching that call.

It draws nothing itself. The shipped rows already wrap a long command instead of
ellipsizing it and already report the exit status as a capsule beside the title;
this plugin only supplies the first expansion.

## What it does

| | Shipped rows | This plugin |
|---|---|---|
| A call that is running, or finished while you watched | collapsed | **expanded** |
| A replayed or reloaded session's finished calls | collapsed | collapsed — history is left to Chat's collapse-timing setting |
| A row inside an already-folded Turn | collapsed | collapsed — never reopened |
| A card you had open when the Turn folded | collapsed | collapsed again: the framework's own reset does it and the plugin does not fight it |
| A row the user collapses by hand | collapsed | stays collapsed |
| Everything inside the card | — | unchanged: command wrapping, terminal output with ANSI colors, copy control, exit-status capsule, height caps |

Only `bash` and `pwsh` rows are touched; every other tool row is left alone.

**History stays collapsed on purpose.** The harness folds a finished Turn with
CSS, so its rows stay mounted: expanding them again would keep every finished
command's output rendered in a long conversation. That is also this plugin's whole
performance posture — it adds DOM only for the call you are watching, and the
collapse follows whatever your Chat setting says (fold after the answer completes,
or on the next message).

## Why it exists

dsh 0.2.1-rc.2's shipped rows render the command inside the terminal card's
banner and wrap it there, but a running or settled shell call still starts
collapsed — the command is hidden behind a click every single time. That click is
the whole defect this plugin removes.

## How it works

The client half registers no slot, exports no component, and ships no stylesheet.
It reads the DOM the shipped rows already publish:

- **Which rows are shell rows.** The shipped `bash` row's own header
  (`data-sample="bash"`, which is also its disclosure target) and the generic
  Tool row's `data-variant` / `data-tool` markers, which is what `pwsh` gets.
- **What expands a row.** The `aria-expanded` + `data-expandable` pair every
  disclosure row carries. An element with both is the row's body toggle; clicking
  it is the published interaction, so the plugin presses it once.
- **What counts as live work.** `data-state="running"` on the row. A row inserted
  in any other state is history and is never touched; a row that gains its body
  while the observer is watching (a preparing call that dispatches) is opened
  through that transition instead.

Only two events can open a row: a running row entering the DOM, and a row gaining
its expandable body. A `MutationObserver` watches inserted nodes and those two
attributes, so a streaming transcript never wakes it. Each call is decided at most
once — keyed by `data-chat-call-id`, so a re-render that replaces the elements
does not decide again — and a row inside `[data-turn-process-hidden]` is left
alone even when its disclosure resets: reopening it would undo the collapse you
configured. Teardown disconnects the observer.

If a future release renames those markers, a row simply stays collapsed: the
plugin fails soft and never breaks the transcript.

## Checks

| Command | What it runs |
|---|---|
| `pnpm run typecheck` | both compiler faces (`tsc -p tsconfig.json`, `tsc -p tsconfig.client.json`) |
| `pnpm run test` | `tests/auto-expand.spec.ts` under vitest (jsdom) |
| `pnpm run build` | `lib/index.js` + `lib/client.js` through tsdown |
| `pnpm run check:bundle` | loads the built `lib/client.js` through the shell's `__ModuleLoader__` facade inside jsdom, then checks identity, that it requests no platform module, and the auto-expand behavior on the artifact |
| `pnpm run check:portable` | typecheck → build → bundle checks |

**Run `check:portable` when `pnpm run test` cannot start.** Under a restricted
Windows filesystem sandbox, vite probes mapped network drives with a piped child
process during startup, which the sandbox denies (`spawn EPERM` from
`optimizeSafeRealPathSync`); vitest then fails before loading a single spec.
`check:portable` covers the same ground without a bundler in the loop, and
`check:bundle` inspects the shipped artifact rather than the sources.

## Install

The plugin is a normal dsh bundle, so it installs into a profile like any other.

### From GitHub

```powershell
# Remove BEFORE adding: pnpm caches a git source by commit, so adding again
# without a remove can leave the previous commit's build installed.
dsh plugin --profile web remove dsh-shell-expand
dsh plugin --profile web add "github:ZYFDroid/dsh-shell-expand"
```

The package name sits in three places at once, and all three are deliberately
**unscoped**: pnpm records it as the profile dependency key, the bundle patch
inserts it as the layer `name`, and the plugin list prints that `name` verbatim.
A scope would therefore surface in the list as `@scope/name`. `pnpm run
check:bundle` pins the display form so a rename cannot pass silently.

### From a local tarball (offline)

```powershell
# 1. Build: lib/index.js (node half) + lib/client.js (browser half).
pnpm install --node-linker=hoisted --ignore-scripts --store-dir ..\.pnpm-store
pnpm run build

# 2. Pack a profile-installable tarball (writes dist\dsh-shell-expand.tgz).
pnpm run pack

# 3. Remove BEFORE adding. This step writes ~/.dsh, so run it with whatever host
#    access your DSH file policy requires. pnpm caches a tarball by path, so
#    skipping the remove can install the previous build's contents.
dsh plugin --profile web remove dsh-shell-expand
dsh plugin --profile web add "C:\Users\ZYFDroid\Documents\DSHStudy\dsh-shell-expand\dist\dsh-shell-expand.tgz"
```

> 0.2.0 rewrote the client half: it no longer takes over the toolview slot, so
> a profile still carrying `0.1.x` keeps its old rows until the remove + add
> above replaces the installed build. Upgrades within one name always need
> **remove first, then add**, because both the tarball path and a git ref are
> cached.

Then restart `dsh web`. The client half takes effect for the transcript as soon
as the page reloads; **no new session is required**, because the row is a pure
rendering change over the session log the server already streams.

Prefer either route over `dsh plugin --profile web add <this directory>`: on
Windows, a local-directory install mints a wrong `link:` junction target. The
tarball additionally strips `devDependencies`, which matter only for development
and point at a harness checkout that does not exist in a user's profile.

Uninstall with:

```powershell
dsh plugin --profile web remove dsh-shell-expand
```

## Model Experience

The plugin is **client-only**. It changes how an already-recorded Tool call is
displayed:

- no host half, no tool, and no service is added;
- no session event is emitted or consumed differently;
- nothing about what the model sees — tool schemas, arguments, results, or
  prompts — changes;
- the session log is untouched, so a session recorded with this plugin installed
  replays identically without it.

## Confirming it is live

After reloading the page, inspect any shell row in the transcript:

- the row element carries **`data-shell-expand="opened"`** — the shipped rows
  never set that attribute, so its presence is the one-glance proof the plugin
  acted on this row;
- the card under the header is open without a click, and it is open again after
  reloading a historical session;
- collapse it by hand and it stays collapsed — the plugin expanded that row once
  and will not reopen it;
- a call that has not produced a result yet also opens by itself: the decision
  waits until the row actually has a body;
- switching back to the shipped behavior is just uninstalling the plugin — the
  rows come back collapsed.

## Requirements

| | |
|---|---|
| dsh | `>= 0.2.0-rc.2` |
| Row markers | shipped `bash` header (`data-sample="bash"`), generic Tool row `data-variant` / `data-tool`, disclosure `aria-expanded` + `data-expandable` |
| Client module table | none — the bundle imports nothing |

## Known Limitations and Deferred Work

- **The plugin depends on the shipped rows' published DOM markers.** That is the
  price of not maintaining a card copy: a renamed marker makes a row stay
  collapsed (fail-soft) rather than break. A dsh release that renames them needs
  one line in `src/client/index.ts`, not a row rewrite.
- **No elapsed-time readout.** That needs the row's own header, which only a
  takeover can draw. The shipped row reports no elapsed time; this plugin no
  longer adds one.
- **A row hidden and re-shown by its enclosing Turn starts collapsed**, exactly
  as a stock row does. Reopening it would also undo a collapse the user
  performed, which is the worse trade.
- **Everything inside the card is the shipped behavior**, including the terminal
  output's height cap and the command banner's own cap. A very long command
  scrolls or wraps inside the card; lengthening it would mean owning the card.
