/**
 * Stage and pack the plugin as a profile-installable tarball.
 *
 * `dsh plugin add <local directory>` has a Windows `link:` junction bug (pnpm
 * mints a wrong target), so a local tarball is the working offline route.
 * `npm pack` cannot produce it: the `link:` devDependencies make npm walk the
 * whole harness checkout and exhaust the heap. This stages the `files` payload
 * itself, drops `devDependencies` (their targets do not exist in a user's
 * profile), and tars the `package/` root the installer expects.
 *
 * Output: dist/<manifest name>.tgz (a scope folds into the filename)
 * Usage:  node tools/pack.mjs
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const STAGE = join(DIST, 'stage')
const PACKAGE = join(STAGE, 'package')

/** The published payload: exactly the `files` list plus the manifest. */
const PAYLOAD_DIRS = ['lib', 'src', 'tools']
const PAYLOAD_FILES = ['cordis.patch.yml', 'dsh.plugin.json', 'README.md', 'README.zh.md']

rmSync(DIST, { recursive: true, force: true })
mkdirSync(PACKAGE, { recursive: true })

for (const dir of PAYLOAD_DIRS) cpSync(join(ROOT, dir), join(PACKAGE, dir), { recursive: true })
for (const file of PAYLOAD_FILES) cpSync(join(ROOT, file), join(PACKAGE, file))

const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
delete manifest.devDependencies
delete manifest.scripts
writeFileSync(join(PACKAGE, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)

// npm's own tarball naming: strip the scope marker, fold the scope separator.
const tarball = join(DIST, `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}.tgz`)
const tar = spawnSync('tar', ['-czf', tarball, '-C', STAGE, 'package'], { stdio: 'inherit' })
rmSync(STAGE, { recursive: true, force: true })

if ((tar.status ?? 1) !== 0) {
  console.error('pack failed')
  process.exitCode = 1
} else {
  console.log(`packed ${tarball}`)
  console.log('install with: dsh plugin --profile web add "<absolute path>"')
}
