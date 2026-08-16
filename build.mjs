#!/usr/bin/env node
/**
 * Regenerate `registry.json` from the plugin checkouts beside this directory.
 *
 * The manifest is DERIVED rather than written, and that is the whole point: a
 * row's display name, summary, category, settings namespaces, and docs link all
 * live in the plugin's own `package.json` under `dsh.plughub`, and a hand-kept
 * copy of them would drift the day somebody edits one. This script reads the
 * source of truth and prints it in the shape `omdsh-plughub` consumes.
 *
 * Run it from a checkout of the collection, where the plugin repositories are
 * siblings of this one:
 *
 *   node registry/build.mjs            # write registry.json
 *   node registry/build.mjs --check    # fail if it would differ (for CI)
 *
 * From a lone clone of the registry repository there are no siblings to read,
 * and the script says so instead of emitting an empty manifest.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** This directory, and the collection root it sits in. */
const HERE = dirname(fileURLToPath(import.meta.url))
const COLLECTION = resolve(HERE, '..')

/**
 * The packages that exist on npm, and therefore install from it.
 *
 * Per package rather than one switch for the collection, because the two are
 * not released together: a name listed here emits `spec: "<name>"` and installs
 * from the registry, and every other row omits `spec` and is installed as
 * `github:<repo>` — a clone that builds itself in `prepare`. Both work; the
 * registry install is simply faster and needs no toolchain on the machine
 * doing it.
 *
 * A single flag here would have been wrong in one specific way: it would have
 * emitted npm specifiers for the nine packages that are NOT published, and a
 * row naming a package the registry does not have is a row whose Install button
 * fails. The cost is that this list is hand-kept — add a name the moment
 * `npm publish` succeeds for it, and re-run.
 * @type {ReadonlySet<string>}
 */
const ON_NPM = new Set([
  '@omdsh-plugins/omdsh-base',
  '@omdsh-plugins/omdsh-plughub',
])

/** The GitHub account the collection is published under. */
const UPSTREAM = 'omdsh-plugins'

/**
 * Read one JSON file, or undefined when it is not there or not JSON.
 * @param {string} path - the file.
 * @returns {unknown} the parsed document, or undefined.
 */
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * `owner/repo` for one package, from what it declares about itself.
 *
 * Read off `repository.url` rather than assembled from the directory name: the
 * directory is what somebody happened to clone into, and the manifest is what
 * the package says. The account is still checked, because a row pointing at
 * somebody else's account is not this upstream's to recommend.
 * @param {Record<string, unknown>} manifest - the package.json.
 * @param {string} directory - the checkout directory name, as the fallback.
 * @returns {string | undefined} the repository, or undefined when it is not ours.
 */
function repoOf(manifest, directory) {
  const declared = manifest.repository
  const url = typeof declared === 'string' ? declared : declared?.url
  const match = typeof url === 'string' ? /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url) : undefined
  const [owner, repo] = match === null || match === undefined ? [UPSTREAM, directory] : [match[1], match[2]]
  return owner === UPSTREAM ? `${owner}/${repo}` : undefined
}

/**
 * Every installable bundle in the collection, in the order the hub sorts them.
 * @returns {Array<Record<string, unknown>>} the registry rows.
 */
function collect() {
  const rows = []
  for (const directory of readdirSync(COLLECTION, { withFileTypes: true })) {
    if (!directory.isDirectory() || directory.name.startsWith('.') || directory.name === 'node_modules') continue
    const manifest = readJson(join(COLLECTION, directory.name, 'package.json'))
    if (typeof manifest !== 'object' || manifest === null) continue
    // Two conditions, and both are load-bearing.
    //
    // The scan reaches REPOSITORY ROOTS only — one directory down, which is how
    // this collection is laid out. That is what leaves the two application
    // workspaces out: `omdsh-desktop` and `omdsh-tui` declare no bundle at their
    // roots, and the packages nested inside them are never visited.
    //
    // The second is a good thing rather than an accident to tidy up later.
    // `omdsh-tui/packages/tui-app` DOES declare a bundle patch, but it is a
    // SURFACE bundle: it collides with `@deepseek-ai/dsh-web-app` on seven
    // loader ids, and a profile composes exactly one surface. The hub's Install
    // button adds to the profile the person is looking at — `web`, for anyone
    // who can see the hub — so a row for it would offer to break the running
    // application. Nothing in a manifest distinguishes a surface from a feature
    // plugin, so if this scan ever learns to descend, it needs a rule for them
    // before it does.
    //
    // Past those, the condition is the one the hub itself reads: a package is
    // installable into a profile exactly when it declares a bundle patch.
    const patch = manifest.dsh?.bundle?.patch
    if (typeof patch !== 'string' || patch === '') continue
    const repo = repoOf(manifest, directory.name)
    if (repo === undefined) {
      console.warn(`skipping ${directory.name}: its repository is not under ${UPSTREAM}`)
      continue
    }
    rows.push({
      name: manifest.name,
      repo,
      // Omitted for an unpublished package, where the hub derives
      // `github:<repo>` from the row's own `repo` field.
      ...ON_NPM.has(manifest.name) ? { spec: manifest.name } : {},
      // What an update is judged against. A plugin whose version moves without
      // its row moving with it simply stops offering updates, which is why this
      // file is generated rather than kept by hand.
      version: manifest.version,
      ...typeof manifest.description === 'string' ? { description: manifest.description } : {},
      // Verbatim, so the catalog card reads exactly as it would had the hub
      // enumerated the repository instead.
      ...manifest.dsh?.plughub === undefined ? {} : { plughub: manifest.dsh.plughub },
    })
  }
  return rows.sort((a, b) => (a.plughub?.order ?? 0) - (b.plughub?.order ?? 0) || a.name.localeCompare(b.name))
}

const plugins = collect()
if (plugins.length === 0) {
  console.error(`no plugin checkouts found beside ${HERE} — run this from a checkout of the collection`)
  process.exit(1)
}

const rendered = `${JSON.stringify({ plugins }, undefined, 2)}\n`
const target = join(HERE, 'registry.json')

if (process.argv.includes('--check')) {
  const held = (() => {
    try {
      return readFileSync(target, 'utf8')
    } catch {
      return ''
    }
  })()
  if (held !== rendered) {
    console.error('registry.json is stale — run `node registry/build.mjs`')
    process.exit(1)
  }
  console.log(`registry.json is current (${String(plugins.length)} plugins)`)
} else {
  writeFileSync(target, rendered)
  // Both counts, because "which rows install from npm" is the one thing about
  // this file that changes without any package.json changing, and a run that
  // did not pick up a publish should be visible here rather than in a card
  // somebody clicks a week later.
  const fromNpm = plugins.filter(row => row.spec !== undefined)
  console.log(`wrote registry.json (${String(plugins.length)} plugins, ${String(fromNpm.length)} from npm)`)
  for (const row of fromNpm) console.log(`  npm    ${row.name}`)
  for (const row of plugins.filter(candidate => candidate.spec === undefined)) {
    console.log(`  github ${row.name}`)
  }
}
