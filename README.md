# omdsh-plugins/registry

English | [中文](README.zh.md)

The curated catalog every [`@omdsh-plugins/omdsh-plughub`][hub] installation
reads by default. One file, one request, and the account's chance to say what it
actually recommends.

```
https://raw.githubusercontent.com/omdsh-plugins/registry/HEAD/registry.json
```

The hub derives that URL from its `upstream` setting, which defaults to
`omdsh-plugins`. So a fresh install reads this file without being configured,
and **Settings → Plugins → OMDSH Plugins** lists the collection immediately.

## Why it exists when enumeration already works

The hub has a second remote source that needs no file at all: it asks GitHub
what the account owns and reads each repository's `package.json`. That source
never goes stale, and it stays — anything pushed to the account appears in the
catalog whether or not it is listed here.

What it cannot do is any of the following, which is what this file is for:

- **One request instead of one per repository.** Enumeration is rate-limited to
  60 requests an hour unauthenticated, and the collection alone costs a dozen.
- **Say what is recommended.** Enumeration reports what EXISTS. A scratch
  repository and a released plugin look identical to it.
- **Pin a version.** The hub decides whether to offer an Update by comparing the
  version a source advertises against the one on disk. Enumeration reads the
  default branch, so it advertises whatever is on `HEAD`; a row here advertises
  a release.

The sources are merged on the package name, and this one outranks enumeration —
so a plugin listed here is described by this file, and a plugin that is not is
still installable from the account. This is not the top of the order, though:
the hub also offers directories of local checkouts, when somebody has configured
`localSources`, and those outrank both remote sources. The full precedence is
`local` over `registry` over `github`, so a developer working on a plugin sees
their own working copy rather than the row here.

## The file

```json
{
  "plugins": [
    {
      "name": "@omdsh-plugins/omdsh-shortcuts",
      "repo": "omdsh-plugins/omdsh-shortcuts",
      "version": "0.1.0",
      "description": "Bind a chord to anything the harness can do…",
      "plughub": {
        "displayName": { "": "Shortcuts", "zh": "快捷键" },
        "summary": { "": "One chord per command…", "zh": "为每个命令绑定一个快捷键…" },
        "category": "input",
        "settings": ["omdsh-shortcuts"],
        "docs": "https://github.com/omdsh-plugins/omdsh-shortcuts#readme",
        "order": 10
      }
    }
  ]
}
```

A bare array works too. `name` and an installable source are the only required
fields; everything else is decoration the card renders.

| Field | What it is |
|---|---|
| `name` | The package name. The identity every source is merged on |
| `repo` | `owner/repo`. The card's link, and the install specifier when `spec` is omitted |
| `spec` | The `pnpm add` argument. Omitted, it is `github:<repo>` |
| `version` | What the row advertises. An Update is offered when it is newer than what is installed |
| `description` | Fallback summary, when `plughub.summary` is absent |
| `plughub` | The same section the package's own `package.json` carries |

Rows are written in the order the hub sorts cards: `plughub.order` ascending,
ties broken by package name. Moving a plugin up the panel is therefore a matter
of changing `order` in its own `package.json` and regenerating, never of moving
a line in this file.

One malformed row costs itself and nothing else — the hub drops it and keeps the
rest of the manifest. A name that appears twice costs the later row: the first
one wins, so that a duplicate does not leave the catalog depending on where in
the file the mistake happens to sit.

### What a row may not do

`spec` is an argument to `pnpm`, and this file is remote content as far as any
installation is concerned. The hub therefore validates every specifier against
an allowlist before it will run one: a registry specifier, `github:owner/repo`,
or an `https` git or tarball URL. A leading `-`, whitespace, and **any
filesystem path** are refused — a path from a remote manifest would install
whatever the reader's machine happens to have at it.

## It is generated, not written

`build.mjs` reads the plugin checkouts sitting beside this directory in a
checkout of the collection and writes the manifest from their `package.json`
files. Every field above already lives there, and a hand-kept copy would drift
the first time somebody edited a summary.

Which packages appear is decided by the packages themselves: a sibling directory
is included exactly when it declares `dsh.bundle.patch`, which is the same fact
the hub reads to decide something is installable at all. That is why the two
application workspaces in the collection — `omdsh-desktop` and `omdsh-tui` — are
absent: neither is a profile layer.

The scan is one directory deep, over the siblings of this one and nothing
underneath them. That is what actually leaves out
`@omdsh-plugins/omdsh-tui-app`, the surface bundle nested at
`omdsh-tui/packages/tui-app`: it declares a bundle patch and would qualify under
the rule above, but the generator never descends far enough to read it. It ought
to be absent either way — a profile composes exactly one surface, and that
bundle collides with the web app on the ids it registers, so it is installed by
building a TUI profile rather than by adding a plugin to a running web one. The
scan depth is the mechanism; the surface rule is the reason.

## Bumping a release

1. Release the plugin — bump its `version` and push the repository.
2. Re-run the generator from the collection and push this repository.

Until step 2, the hub shows the plugin as current: it compares against what this
file advertises, and a row that never moves never offers an update. That is the
cost of a curated catalog, and it is the reason the generator exists.

## Where a row installs from

Two answers, decided on purpose rather than by whether the package happens to
exist on npm.

| | `spec` | What an install does |
|---|---|---|
| The hub | `"@omdsh-plugins/omdsh-plughub"` | Fetches the release. No build, no toolchain needed |
| The mode system | `"@omdsh-plugins/omdsh-basemode"` | Same: the release, because chatmode and codemode install it by name |
| Everything else | omitted → `github:<repo>` | Clones the repository, which builds itself in `prepare` |

Which is which is the `ON_NPM` set at the top of `build.mjs`. **It holds the
hub and the mode system.** The hub is the bootstrap — it has to install from
npm so a machine can get the installer without cloning anything. The mode
system is published too, and the two mode plugins install it by name, so a
git install would run `prepare` for a package that already ships `lib/`.
Every other plugin installs from GitHub, even one that also exists on npm.
Adding a name here the moment `npm publish` succeeds would make the Install
button fetch the registry copy, which is not how this collection installs it.

Today `@omdsh-plugins/omdsh-plughub` and `@omdsh-plugins/omdsh-basemode`
install from npm. `node registry/build.mjs` prints the split, so a run that
moved another name onto the npm side is visible immediately rather than in a
card somebody clicks a week later.

## Commands

From a checkout of the collection, where the plugin repositories are siblings of
this directory:

```sh
pnpm run registry:build     # rewrite registry.json
pnpm run check:registry     # print the count, or fail when it is stale
```

Both are defined at the collection root. The generator takes the same two forms
directly, which is what the scripts wrap and what CI can call without a
workspace install:

```sh
node registry/build.mjs
node registry/build.mjs --check
```

`--check` writes nothing: it renders the manifest, compares it against the file
on disk, and either prints how many plugins are current or exits non-zero saying
the file is stale. The bare form is the one that rewrites `registry.json`.

## Known limitations

- **A row needs a usable source or it disappears entirely.** `repo` must match
  `owner/repo`; when it does not and the row names no `spec` of its own, there
  is nothing to derive a specifier from, so the hub drops the whole row rather
  than listing it without an install button.
- **The generator only recognizes its own account.** A package whose
  `repository.url` names an owner other than `omdsh-plugins` is warned about and
  skipped, because a row pointing at somebody else's account is not this
  upstream's to recommend. A fork that has not rewritten its `repository` fields
  therefore regenerates a short manifest, quietly, one warning per package.
- **The scan is one directory deep.** A plugin that ever lives in a nested
  workspace is not picked up, whatever its manifest declares — see the note on
  `omdsh-tui-app` above.

[hub]: https://github.com/omdsh-plugins/omdsh-plughub#readme
