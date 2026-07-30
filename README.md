# dune

[![CI](https://github.com/dotbrains/dune/actions/workflows/ci.yml/badge.svg)](https://github.com/dotbrains/dune/actions/workflows/ci.yml)
[![License: PolyForm Shield 1.0.0](https://img.shields.io/badge/license-PolyForm%20Shield%201.0.0-blue.svg)](LICENSE)
[![Platform: macOS + Linux + Windows](https://img.shields.io/badge/platform-macOS%20%2B%20Linux%20%2B%20Windows-lightgrey.svg)](docs/releasing.md)
[![TypeScript: strict](https://img.shields.io/badge/typescript-strict-3178c6.svg)](tsconfig.json)
[![pre-commit](https://img.shields.io/badge/pre--commit-enabled-brightgreen?logo=pre-commit&logoColor=white)](.pre-commit-config.yaml)
[![Dev env: Flox](https://img.shields.io/badge/dev%20env-flox-7c3aed.svg)](https://flox.dev)

A terminal code editor with a file tree, tabs, search, git marks, themes, vim mode, and
tree-sitter highlighting for 30+ languages. `dune` is meant to feel like a small,
fast project workspace rather than a shell command that happens to open one file.

When it starts, the first screen is the editor itself: a tree on the left, tabs across
the top, a status bar along the bottom, and the active buffer taking the rest of the
terminal. The tree supports preview tabs, pinned tabs, range selection, copy and move
operations, guarded deletes, and mouse resizing. The editor keeps line numbers,
indent guides, syntax colour, git change markers, a change track, and scrollbars in
the terminal grid without requiring a GUI.

## Status

`dune` is a Bun and TypeScript TUI built on OpenTUI. The app runs from source with Bun
and ships as a self-contained executable for macOS, Linux, and Windows.

## Quick Start

```bash
bun install
bun run start .
```

Build a local binary:

```bash
bun run build
./dist/*/dune .
```

Run the full local gate:

```bash
bun run check
```

## Installation

Install from a release script:

```bash
curl -fsSL https://raw.githubusercontent.com/dotbrains/dune/main/install | bash
```

Or install the GitHub Packages shim after configuring npm for the GitHub registry:

```bash
npm config set @dotbrains:registry https://npm.pkg.github.com
npm install -g @dotbrains/dune
bun add -g @dotbrains/dune
```

The shim downloads the matching binary from the GitHub release. Set `DUNE_DOWNLOAD_BASE`
to use a mirror.

## Usage

```bash
dune                  # current directory
dune ./my-app         # directory
dune src/main.ts      # single file
dune src/main.ts:42   # open at line 42
dune update           # upgrade this installation
```

`npx @dotbrains/dune` and `bunx @dotbrains/dune` work once the package is published.

## Shortcuts

| Key                            | Action                 |
| ------------------------------ | ---------------------- |
| `F1` / `Ctrl+P` / `Ctrl+Opt+P` | Command palette        |
| `Ctrl+K`                       | Peek active shortcuts  |
| `Ctrl+O`                       | Open a file            |
| `Ctrl+T`                       | Switch tabs            |
| `Ctrl+S`                       | Save                   |
| `Ctrl+F`                       | Find in file           |
| `Ctrl+R`                       | Search project         |
| `Ctrl+G`                       | Go to line             |
| `Ctrl+Opt+G`                   | Source control panel   |
| `Ctrl+Opt+M`                   | Markdown render/source |
| `Ctrl+N`                       | New file               |
| `Ctrl+W`                       | Close tab              |
| `Ctrl+B`                       | Toggle sidebar         |
| `Ctrl+Q`                       | Quit                   |
| `Ctrl+Z` / `Ctrl+Y`            | Undo / redo            |

The file tree supports keyboard and mouse navigation, preview tabs, bulk moves and
copies, guarded deletes, git status marks, and dimming for gitignored paths. `Ctrl+C`
copies when text is selected and quits when it is not, so unsaved work is not thrown
away. By default the tree lists dotfiles and gitignored files; use the View commands
`Show dotfiles` and `Hide gitignored files` to change that per user config.
Use `Settings: this project` to save overrides in `.dune/settings.json`; project values
take precedence over `~/.config/dune/config.json` when that workspace opens.
Auto-save on blur and tab switch is on by default and can be disabled from Settings.
The `Transparent background` setting leaves the editor and tab strip unpainted for
translucent terminal themes.

PNG and JPEG files open as read-only image tabs. They are rendered in the editor slot,
restore with the rest of the session, and are never treated as editable buffers.

Markdown files can be read as rendered documents with `Ctrl+Opt+M` or
`Markdown: rendered / source` from the command palette. The same tab toggles between the
rendered page and editable source, and unsaved edits are reflected in the rendered view.

The command palette includes Git actions for viewing diffs, committing selected files,
undoing the last commit, stashing, popping a stash, fetching, and pushing. If files
are already staged, the commit picker starts from the index selection; otherwise it
selects all changed files. Diff overlays can be shown inline or split from Settings.

`Ctrl+Opt+G` swaps the sidebar to a compact source-control panel with changed files
and status marks. Click a changed file there to open its diff.

## Project Map

| Path             | Purpose                                                               |
| ---------------- | --------------------------------------------------------------------- |
| `src/app/`       | Application state, command dispatch, and root TUI composition         |
| `src/ui/`        | Reusable terminal UI components                                       |
| `src/editor/`    | Text buffer, edits, history, selection, windowing, and vim logic      |
| `src/core/`      | CLI parsing, filesystem, config, git, updates, sessions, and search   |
| `src/languages/` | Tree-sitter grammar registry, queries, and highlighting               |
| `src/themes/`    | Theme builders, palette files, registry, and runtime theme state      |
| `bin/`           | Package launcher, install-time binary fetcher, and platform detection |
| `scripts/`       | Release archive and Homebrew formula generation                       |
| `test/`          | Bun unit and off-screen TUI tests                                     |

## Development

Use Bun for all installs and scripts:

```bash
bun install
bun run check-types
bun run lint
bun run format:check
bun run test
```

Optional reproducible shell:

```bash
flox activate
```

Optional commit hooks:

```bash
pre-commit install
pre-commit run --all-files
```

More detail lives in:

- [Architecture](ARCHITECTURE.md)
- [Development](docs/development.md)
- [Testing](docs/testing.md)
- [CI](docs/ci.md)
- [Releasing](docs/releasing.md)

## License

This repository uses the PolyForm Shield License 1.0.0. See [LICENSE](LICENSE).
