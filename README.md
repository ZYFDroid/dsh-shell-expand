# dsh-shell-expand

> 中文版：[README.zh.md](./README.zh.md)

A DeepSeek Harness client plugin that takes over the **shell tool rows**
(`bash` and `pwsh`) in the conversation transcript and changes two things about
how they render:

1. **Every shell card is expanded by default.** No click needed — the command
   and its output are visible as soon as the call appears, including when a
   historical session is replayed.
2. **The command wraps inside the card instead of being compressed into one
   ellipsized line.** The terminal card's command banner flows onto as many lines
   as it needs, and the header no longer repeats the command — so a long command
   appears exactly once.

Everything else stays the way the shipped row draws it: the same geometry and
`--dsw-*` design tokens, the same leading icon that swaps to a state dot on
failure, the same hover-chevron affordance, the same `TerminalBlock` output
surface (ANSI colors, copy control, exit-status pill, height cap), and the same
IN/OUT fallback for shell calls that carry no terminal card (a persistent shell,
a spill preview, a cancellation).

## How it differs from the shipped row

| | Shipped `bash` row | This plugin |
|---|---|---|
| Default state | collapsed | **expanded** |
| Header's second line | the call's `description`, one ellipsized line | the same `description`; the shipped argument summary when the call carries none |
| **While the command runs** | the terminal card's running state, command banner left at `pre` | the same running card, with the banner rebound to `pre-wrap` so it wraps, **plus an elapsed-time readout** |
| Elapsed time | none | one readout at the end of the header — the row's only one — visible collapsed or open; it vanishes when the call settles |
| Readout format | — | `19s / 30s` (elapsed / timeout) when the call states `timeoutMs`; `19s` when it does not |
| Where the command shows | only the card's banner | only the card's banner; a call the terminal card refuses (backgrounded, persistent) gets a running-style command line instead |
| Times the command text appears | once, in the card | **once** — the header never repeats it |

### The elapsed clock

The start instant is the call block's own `time` — the epoch milliseconds the
framework stamps on every dispatch stage — so it is a real value this row can
read. The readout refreshes once a second and the interval is torn down the
moment the call settles.

Because it is recomputed from that stamp on every render (`now - block.time`)
rather than accumulated locally, a refresh or a session switch remounts the row
and the readout resumes at the correct age: it neither restarts at zero nor adds
the previous instance's time. Each instance's interval is cleared on unmount, so
two timers never run at once.

The readout has exactly ONE home (the end of the header). It briefly rendered
above the card as well, which read as "one time became two" after a remount —
one fact does not get two places.

The timeout side shows only what the call itself states: `19s / 30s` when the
arguments carry `timeoutMs`, and `19s` alone when they do not. Substituting a
default would be inventing a number — see below.

**The timeout side is reported only when the call states one.** The effective
deadline is decided below this layer: it defaults from the executor's own config
(`120_000` for `bash-local` / `pwsh-local`), is clamped by that executor's
`maxTimeoutMs`, and differs again for the persistent providers (`300_000`). A
number read off the arguments is the *requested* timeout — absent when the model
omitted it — so filling in a guessed default would present an invented value as
the real one. Stated is real; unstated shows nothing.

Four defects found while building this, now pinned by the code and the checks:

- **The command no longer renders in the header.** An earlier version put it
  there too, so a long command filled *both* the summary line and the banner.
- **Settlement comes from `phase`, never from the block's discriminant.** The
  shipped rows infer it with `'kind' in block`, which this row copied. That is a
  proxy: a start-phase block that carries a `kind` was read as settled, so the
  arguments came from the absent result call head — an empty payload, no terminal
  card, and the bare-arguments fallback where the command belonged. The row now
  reads `settled = phase === 'result'`, the framework's own statement of the
  stage.
- **The phases are separate components.** A keyed row's component instance
  survives the `preparing → start → result` transitions, and
  `useToolCallArgumentsPartial` is only valid while preparing. Keeping both
  phases in one component made the Hook count shrink on the transition, which
  React rejects with **#300 ("Rendered fewer hooks than expected")** — seen as a
  blank new command plus `slot entry crashed in 'tool.call.toolview'` in the
  console. `ShellRow` now only dispatches; preparing and started are their own
  components, so changing the element type unmounts the old one and each Hook
  list stays fixed.
- **A running call shows the command it is running.** The terminal card used to
  be derived from the *result* block alone, so a command that had not finished
  had no card at all and the row fell back to a bare-arguments card — from which
  `command` had been stripped on purpose, leaving `{description, timeoutMs}`.
  Running calls now go through the same card derivation
  (`runningCallBlock`), so the banner appears and wraps; calls the terminal card
  genuinely refuses get an equivalent wrapping command line, and the fallback
  JSON keeps `command` in it.

## Why it exists

The shipped `bash` toolview collapses to the call's `description` — a single
non-wrapping line with `text-overflow: ellipsis` — and puts the command inside
the terminal card's banner, whose wrapping is opt-in through a CSS variable the
shipped renderer leaves at `pre`. A long command is therefore unreadable until
the row is expanded, and even then the banner can only be read one scroll at a
time.

This plugin keeps the collapsed one-line preview for a row the user closes, but
opens the row by default; the command's full reach is the card banner's job,
which wraps. The header never shows the command, so the same command cannot fill
two places at once.

## Checks

| Command | What it runs |
|---|---|
| `pnpm run typecheck` | both compiler faces (`tsc -p tsconfig.json`, `tsc -p tsconfig.client.json`) |
| `pnpm run test` | `tests/shell-row.spec.tsx` under vitest |
| `pnpm run check:model` | the pure derivations on the sources, via Node's own type stripping (no bundler) |
| `pnpm run build` | `lib/index.js` + `lib/client.js` through tsdown |
| `pnpm run check:bundle` | loads the built `lib/client.js` through the shell's `__ModuleLoader__` facade and checks the registration and stylesheet contracts |
| `pnpm run check:portable` | typecheck → model checks → build → bundle checks |

**Run `check:portable` when `pnpm run test` cannot start.** Under a restricted
Windows filesystem sandbox, vite probes mapped network drives with a piped child
process during startup, which the sandbox denies (`spawn EPERM` from
`optimizeSafeRealPathSync`); vitest then fails before loading a single spec. The
`check:portable` chain covers the same ground without a bundler in the loop, and
`check:bundle` inspects the shipped artifact rather than the sources.

## Install

The plugin is a normal dsh bundle, so it installs into a profile like any other.

```powershell
# 1. Build: lib/index.js (node half) + lib/client.js (browser half).
pnpm install --node-linker=hoisted --ignore-scripts --store-dir ..\.pnpm-store
pnpm run build

# 2. Pack a profile-installable tarball (writes dist\dsh-external-dsh-shell-expand.tgz).
pnpm run pack

# 3. Remove BEFORE adding. This step writes ~/.dsh, so run it with whatever host
#    access your DSH file policy requires. pnpm caches a tarball by path, so
#    skipping the remove can install the previous build's contents.
dsh plugin --profile web remove @dsh-external/dsh-shell-expand
dsh plugin --profile web add "C:\Users\ZYFDroid\Documents\DSHStudy\dsh-shell-expand\dist\dsh-external-dsh-shell-expand.tgz"
```

> Upgrading to 0.1.8: **remove first, then add.** Otherwise the tarball path
> cache can leave the previous build installed.

Then restart `dsh web`. The client half takes effect for the transcript as soon
as the page reloads; **no new session is required**, because the row is a pure
rendering change over the session log the server already streams.

Prefer the tarball over `dsh plugin --profile web add <this directory>`: on
Windows, a local-directory install mints a wrong `link:` junction target. The
tarball also has its `devDependencies` stripped, which matter only for
development and point at a harness checkout that does not exist in a user's
profile.

Uninstall with:

```powershell
dsh plugin --profile web remove @dsh-external/dsh-shell-expand
```

## How the takeover works

The plugin registers into the ui-tool keyed atomic Tool view slot
(`tool.call.toolview`) under the `bash` and `pwsh` keys:

```ts
ctx.slots.inject('tool.call.toolview', function* () {
  for (const key of ['bash', 'pwsh']) {
    yield ctx.slots.register({
      name: 'tool.call.toolview', key, locale: 'conversation', priority: -1,
    }, ShellRow)
  }
})
```

A keyed slot renders the **lowest** priority registered for a key, so `-1`
shadows the shipped `bash` row while this plugin is mounted and the shipped row
returns unchanged when the plugin unloads. `pwsh` has no shipped toolview — it
falls through to the generic row upstream — so this registration supplies one
rather than replacing anything.

The row derives its model locally (`src/client/model.ts`) rather than importing
the shipped derivations: they live behind another package's `src/` subpath,
which a plugin's `exports`-driven type resolution cannot reach, and copying them
keeps this bundle from carrying a second package's private module graph.

## Model Experience

The plugin is **client-only**. It reads the Tool call and result events the
client already has and renders them differently:

- no host half, no tool, and no service is added;
- no session event is emitted or consumed differently;
- nothing about what the model sees — tool schemas, arguments, results, or
  prompts — changes;
- the session log is untouched, so a session recorded with this plugin installed
  replays identically without it.

## Confirming it is live

After reloading the page, inspect any shell row in the transcript:

- the row carries `data-shell-row`, `data-tool="bash"` (or `"pwsh"`), and
  **`data-wraps`** — the shipped row has no `data-wraps`, so its presence is the
  one-glance proof the takeover is mounted;
- the card under the header is open without a click, and it stays open across a
  reload of a historical session;
- the header's second line carries only the `description`; the command appears
  once, in the card's banner, and that banner wraps onto further lines instead of
  being ellipsized;
- **a command that has not produced a result yet still shows the command.** The
  running card carries a prompt line with it, not just `{description, timeoutMs}`;
- **a running command shows a running-time readout** that ticks once a second in
  the header — one readout, not two — formatted `19s` or `19s / 30s` when the call
  states a timeout, and gone once the call settles; after a refresh or a session
  switch it resumes at the correct age;
- **a newly issued command is not blank.** A blank row was React #300 in 0.1.0;
  if it comes back, look for `slot entry crashed in 'tool.call.toolview'` in the
  console;
- switching back to the shipped behavior is just uninstalling the plugin — the
  shipped `bash` row returns at priority `0`.

## Requirements

| | |
|---|---|
| dsh | `>= 0.2.0-rc.2` |
| Slot contract | `tool.call.toolview` (keyed, session scope) |
| Client module table | `react`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives` |

## Known Limitations and Deferred Work

- **The takeover is visual only, so it cannot add information the wire does not
  carry.** A shell call whose arguments never arrived (a window cut between the
  call and its result) renders the generic fallback, not a command.
- **`priority: -1` is currently unused by the shipped rows**, so this plugin wins
  the key. A future composition that registers the same key below `-1` would win
  instead; the slot rejects two registrations at the *same* priority rather than
  silently picking one, so the conflict surfaces at load.
- **Multi-line commands wrap with `pre-wrap`.** A here-doc's indentation is
  preserved verbatim, which means a deeply indented command still produces wide
  lines that wrap where its own leading whitespace pushes them; reflowing that
  would mean rewriting the command text the row is required to show verbatim.
- **The command banner keeps its own 150px height cap** (the primitive's). An
  extreme command — dozens of lines — scrolls inside the banner; this plugin only
  turns its wrapping on and does not raise that cap.
- **The output region keeps the shipped 224px height cap.** Deep output scrolls
  inside the card rather than lengthening the transcript.
