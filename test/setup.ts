import { afterAll, beforeEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { invalidateSyntaxStyle } from '../src/languages/highlight';
import { registerLocalThemes, setTheme, setTransparency } from '../src/themes';

/**
 * Give every test process its own config home, before anything reads it.
 *
 * Two reasons, and the second is what makes `--parallel` safe. `src/core/config.ts`
 * resolves `CONFIG_FILE` from this at module load, and `sessions.json` is a single
 * file rewritten whole on every tab change — so without this the suite wrote to the
 * developer's real `~/.config/dune`, and parallel workers would clobber each other's
 * sessions mid-write.
 *
 * A preload, not a `beforeAll`: the path is captured when the module is first
 * imported, which happens before any hook runs.
 */
const configHome = mkdtempSync(join(tmpdir(), 'dune-test-config-'));
process.env.HOME = configHome;
process.env.XDG_CONFIG_HOME = configHome;
const dataHome = mkdtempSync(join(tmpdir(), 'dune-test-data-'));
const cacheHome = mkdtempSync(join(tmpdir(), 'dune-test-cache-'));
process.env.XDG_DATA_HOME = dataHome;
process.env.XDG_CACHE_HOME = cacheHome;

// Tests create disposable repositories; inheriting a developer's signed-commit
// config makes those fixtures depend on local keychain/agent state.
process.env.GIT_CONFIG_COUNT = '2';
process.env.GIT_CONFIG_KEY_0 = 'commit.gpgsign';
process.env.GIT_CONFIG_VALUE_0 = 'false';
process.env.GIT_CONFIG_KEY_1 = 'tag.gpgsign';
process.env.GIT_CONFIG_VALUE_1 = 'false';
process.env.GIT_CONFIG_GLOBAL = '/dev/null';
process.env.GIT_CONFIG_NOSYSTEM = '1';

beforeEach(() => {
	rmSync(join(configHome, 'dune'), { recursive: true, force: true });
	rmSync(join(dataHome, 'dune'), { recursive: true, force: true });
	rmSync(join(cacheHome, 'dune'), { recursive: true, force: true });
	registerLocalThemes([]);
	setTransparency(false);
	setTheme('dark');
	invalidateSyntaxStyle();
});

afterAll(async () => {
	const { fixtures } = await import('./cleanup');
	for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
	fixtures.clear();
});
