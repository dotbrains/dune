import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'bun:test';

import { launch, press, runCommand, settle } from './helpers';
import { git as runGit } from './git-fixture';
import type { Harness } from './helpers';

function repo(committed: string) {
	const dir = mkdtempSync(join(tmpdir(), 'dune-git-history-'));
	const git = (...args: string[]) => runGit(dir, ...args);
	git('init', '-q', '-b', 'main');
	git('config', 'user.email', 'test@example.com');
	git('config', 'user.name', 'Test');
	writeFileSync(join(dir, 'a.ts'), committed);
	git('add', '.');
	git('commit', '-q', '-m', 'init');
	return dir;
}

async function until(t: Harness, cond: () => boolean, ms = 5000) {
	const start = Date.now();
	while (Date.now() - start < ms) {
		if (cond()) break;
		await settle(t, 25);
	}
	if (!cond()) throw new Error('condition not met');
}

test('commit message prompt walks recent subjects', async () => {
	const dir = repo('one\n');
	runGit(dir, 'commit', '--allow-empty', '-q', '-m', 'second thoughts');
	writeFileSync(join(dir, 'a.ts'), 'two\n');

	const t = await launch(dir);
	await runCommand(t, 'Commit');
	await press(t, (input) => input.pressEnter());
	await until(t, () => t.captureCharFrame().includes('↑↓ history'));

	await press(t, (input) => void input.typeText('half a thought'));
	await press(t, (input) => input.pressArrow('up'));
	await until(t, () => t.captureCharFrame().includes('second thoughts'));
	await press(t, (input) => input.pressArrow('up'));
	await until(t, () => t.captureCharFrame().includes('init'));
	await press(t, (input) => input.pressArrow('down'));
	await until(t, () => t.captureCharFrame().includes('second thoughts'));
	await press(t, (input) => input.pressArrow('down'));
	await until(t, () => t.captureCharFrame().includes('half a thought'));
});
