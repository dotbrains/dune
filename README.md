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

Or install the npm shim once releases are configured:

```bash
npm install -g dune
bun add -g dune
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

`npx dune` and `bunx dune` work once the package is published.

## Shortcuts

| Key                 | Action                |
| ------------------- | --------------------- |
| `Ctrl+P`            | Command palette       |
| `Ctrl+K`            | Peek active shortcuts |
| `Ctrl+O`            | Open a file           |
| `Ctrl+T`            | Switch tabs           |
| `Ctrl+S`            | Save                  |
| `Ctrl+F`            | Find in file          |
| `Ctrl+R`            | Search project        |
| `Ctrl+G`            | Go to line            |
| `Ctrl+N`            | New file              |
| `Ctrl+W`            | Close tab             |
| `Ctrl+B`            | Toggle sidebar        |
| `Ctrl+Q`            | Quit                  |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo           |

The file tree supports keyboard and mouse navigation, preview tabs, bulk moves and
copies, and guarded deletes. `Ctrl+C` copies when text is selected and quits when it is
not, so unsaved work is not thrown away.

The command palette includes Git actions for committing selected files, undoing the
last commit, stashing, popping a stash, fetching, and pushing. If files are already
staged, the commit picker starts from the index selection; otherwise it selects all
changed files.

## Project Map

| Path             | Purpose                                                             |
| ---------------- | ------------------------------------------------------------------- |
| `src/app/`       | Application state, command dispatch, and root TUI composition       |
| `src/ui/`        | Reusable terminal UI components                                     |
| `src/editor/`    | Text buffer, edits, history, selection, windowing, and vim logic    |
| `src/core/`      | CLI parsing, filesystem, config, git, updates, sessions, and search |
| `src/languages/` | Tree-sitter grammar registry, queries, and highlighting             |
| `src/themes/`    | Theme builders, palette files, registry, and runtime theme state    |
| `bin/`           | npm launcher, install-time binary fetcher, and platform detection   |
| `scripts/`       | Release archive and Homebrew formula generation                     |
| `test/`          | Bun unit and off-screen TUI tests                                   |

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
