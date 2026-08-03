import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { diffFiles, statusMap } from '../../src/core/git';
import { git as runGit } from '../git-fixture';

function initRepo(dir: string, file: string, content: string): void {
	const git = (...args: string[]) => runGit(dir, ...args);
	git('init', '-q', '-b', 'main');
	git('config', 'user.email', 'test@example.com');
	git('config', 'user.name', 'Test');
	writeFileSync(join(dir, file), content);
	git('add', '.');
	git('commit', '-q', '-m', 'init');
}

test('status and diffs are collected from repositories below an opened folder', () => {
	const dir = mkdtempSync(join(tmpdir(), 'dune-git-parent-'));
	mkdirSync(join(dir, 'alpha'), { recursive: true });
	mkdirSync(join(dir, 'nested', 'beta'), { recursive: true });
	initRepo(join(dir, 'alpha'), 'a.ts', 'alpha\n');
	initRepo(join(dir, 'nested', 'beta'), 'b.ts', 'beta\n');
	writeFileSync(join(dir, 'alpha', 'a.ts'), 'alpha changed\n');
	writeFileSync(join(dir, 'nested', 'beta', 'b.ts'), 'beta changed\n');

	const statuses = statusMap(dir);
	const files = diffFiles(dir).map((file) => file.path);

	expect(statuses.get(join(dir, 'alpha', 'a.ts'))).toBe('modified');
	expect(statuses.get(join(dir, 'nested', 'beta', 'b.ts'))).toBe('modified');
	expect(files).toEqual([join(dir, 'alpha', 'a.ts'), join(dir, 'nested', 'beta', 'b.ts')]);
});
