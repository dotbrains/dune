import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defaultBranch } from '../src/core/git';
import { git as runGit } from './git-fixture';

function repo(initial = 'trunk') {
	const dir = mkdtempSync(join(tmpdir(), 'dune-default-branch-'));
	const git = (...args: string[]) => runGit(dir, ...args);
	git('init', '-q', '-b', initial);
	git('config', 'user.email', 'test@example.com');
	git('config', 'user.name', 'Test');
	writeFileSync(join(dir, 'seed.txt'), 'seed\n');
	git('add', '.');
	git('commit', '-q', '-m', 'seed');
	return { dir, git };
}

test('default branch follows configured remote HEAD', () => {
	const { dir, git } = repo('trunk');
	git('remote', 'add', 'origin', dir);
	git('fetch', '-q', 'origin');
	git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');

	expect(defaultBranch(dir)).toBe('origin/trunk');
});

test('init.defaultBranch is the local fallback when it exists', () => {
	const { dir, git } = repo('trunk');
	git('config', 'init.defaultBranch', 'trunk');

	expect(defaultBranch(dir)).toBe('trunk');
});

test('default branch is unknown without repository evidence', () => {
	const { dir } = repo('topic');

	expect(defaultBranch(dir)).toBeNull();
});
