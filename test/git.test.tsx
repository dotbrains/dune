import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	branchDiffFiles,
	currentBranch,
	defaultBranch,
	diffFiles,
	diffLines,
	ignoredAmong,
	statusMap,
} from '../src/core/git';
import { git as runGit } from './git-fixture';
import { launch, press, pressEscape, runCommand, settle } from './helpers';
import type { Harness } from './helpers';

const ESC = String.fromCharCode(27);

interface Frame {
	lines: { spans: { text: string; fg?: { buffer: Uint8Array } }[] }[];
}

/** A real repository with one committed file. */
function repo(committed: string) {
	const dir = mkdtempSync(join(tmpdir(), 'dune-git-'));
	const git = (...args: string[]) => runGit(dir, ...args);
	git('init', '-q', '-b', 'main');
	git('config', 'user.email', 'test@example.com');
	git('config', 'user.name', 'Test');
	writeFileSync(join(dir, 'a.ts'), committed);
	git('add', '.');
	git('commit', '-q', '-m', 'init');
	return dir;
}

test('marks modified and added lines', () => {
	const dir = repo('one\ntwo\nthree\n');
	writeFileSync(join(dir, 'a.ts'), 'one\nCHANGED\nthree\nfour\n');

	const marks = diffLines(join(dir, 'a.ts'));
	expect(marks.get(1)).toBe('modified'); // "two" -> "CHANGED"
	expect(marks.get(3)).toBe('added'); // new final line
	expect(marks.get(0)).toBeUndefined(); // untouched
});

test('a hunk that grows marks rewrites and additions separately', () => {
	const dir = repo('one\ntwo\n');
	writeFileSync(join(dir, 'a.ts'), 'one\nCHANGED\nEXTRA\n');

	const marks = diffLines(join(dir, 'a.ts'));
	expect(marks.get(1)).toBe('modified');
	expect(marks.get(2)).toBe('added');
});

test('is empty outside a repository', () => {
	const dir = mkdtempSync(join(tmpdir(), 'dune-'));
	writeFileSync(join(dir, 'a.ts'), 'x\n');
	expect(diffLines(join(dir, 'a.ts')).size).toBe(0);
	expect(currentBranch(dir)).toBeNull();
});

// A repo with no remote at all, which the gitremote footer tests cannot cover.
test('a branch with no upstream shows without ahead/behind arrows', async () => {
	const t = await launch(repo('one\n'));
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());

	const footer = t.captureCharFrame().split('\n').at(-2)!;
	expect(footer).toContain('⎇ main');
	expect(footer).not.toMatch(/↑\d/);
	expect(footer).not.toMatch(/↓\d/);
});

test('status marks reach the file tree', async () => {
	const dir = repo('one\n');
	writeFileSync(join(dir, 'a.ts'), 'changed\n'); // modified
	writeFileSync(join(dir, 'fresh.ts'), 'new\n'); // untracked

	const t = await launch(dir);
	const frame = t.captureCharFrame();
	const row = (name: string) => frame.split('\n').find((line) => line.includes(name)) ?? '';

	expect(row('a.ts')).toContain('M');
	expect(row('fresh.ts')).toContain('U');
});

test('diffFiles returns text snapshots for changed files', () => {
	const dir = repo('one\ntwo\n');
	writeFileSync(join(dir, 'a.ts'), 'one\nTWO\nthree\n');
	writeFileSync(join(dir, 'fresh.ts'), 'new\n');

	const files = diffFiles(dir);
	expect(files.map((file) => file.rel)).toEqual(['a.ts', 'fresh.ts']);
	expect(files[0]).toMatchObject({ oldText: 'one\ntwo\n', newText: 'one\nTWO\nthree\n' });
	expect(files[1]).toMatchObject({ oldText: '', newText: 'new\n', status: 'untracked' });
});

test('branchDiffFiles returns snapshots introduced since the base branch', () => {
	const dir = repo('one\n');
	const git = (...args: string[]) => runGit(dir, ...args);
	git('switch', '-q', '-c', 'feature');
	writeFileSync(join(dir, 'a.ts'), 'two\n');
	writeFileSync(join(dir, 'fresh.ts'), 'new\n');
	git('add', '.');
	git('commit', '-q', '-m', 'feature work');

	expect(defaultBranch(dir)).toBe('main');
	const files = branchDiffFiles(dir, 'main');
	expect(files.map((file) => file.rel)).toEqual(['a.ts', 'fresh.ts']);
	expect(files[0]).toMatchObject({ oldText: 'one\n', newText: 'two\n', status: 'modified' });
	expect(files[1]).toMatchObject({ oldText: '', newText: 'new\n', status: 'added' });
});

test('diff commands show current file and all changed files', async () => {
	const dir = repo('one\ntwo\n');
	writeFileSync(join(dir, 'a.ts'), 'one\nTWO\nthree\n');
	writeFileSync(join(dir, 'fresh.ts'), 'new\n');

	const t = await launch(dir);
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	await runCommand(t, 'Diff current file');
	expect(t.captureCharFrame()).toContain('+ THREE'.replace('THREE', 'three'));
	expect(t.captureCharFrame()).toContain('- two');

	await pressEscape(t);
	await runCommand(t, 'Diff all changes');
	expect(t.captureCharFrame()).toContain('file 1/2');
	await press(t, (i) => void i.typeText('f'));
	expect(t.captureCharFrame()).toContain('Changed files');
	expect(t.captureCharFrame()).toContain('fresh.ts +1 -0');
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	expect(t.captureCharFrame()).toContain('fresh.ts');
	expect(t.captureCharFrame()).toContain('file 2/2');
	await press(t, (i) => void i.typeText('f'));
	await pressEscape(t);
	expect(t.captureCharFrame()).toContain('file 2/2');
	expect(t.captureCharFrame()).not.toContain('Changed files');
	await press(t, (i) => i.pressArrow('right'));
	expect(t.captureCharFrame()).toContain('a.ts');
});

test('the branch comparison command opens a diff from the default branch', async () => {
	const dir = repo('one\n');
	const git = (...args: string[]) => runGit(dir, ...args);
	git('switch', '-q', '-c', 'feature');
	writeFileSync(join(dir, 'a.ts'), 'two\n');
	writeFileSync(join(dir, 'fresh.ts'), 'new\n');
	git('add', '.');
	git('commit', '-q', '-m', 'feature work');

	const t = await launch(dir);
	await runCommand(t, 'Compare branches');

	const frame = t.captureCharFrame();
	expect(frame).toContain('file 1/2');
	expect(frame).toContain('- one');
	expect(frame).toContain('+ two');
	await press(t, (input) => void input.typeText('f'));
	expect(t.captureCharFrame()).toContain('fresh.ts +1 -0');
});

test('diff commands can render split layout', async () => {
	const dir = repo('one\ntwo\n');
	writeFileSync(join(dir, 'a.ts'), 'one\nTWO\nthree\n');

	const t = await launch(dir, { diffView: 'split' });
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	await runCommand(t, 'Diff current file');

	const frame = t.captureCharFrame();
	expect(frame).toContain('split');
	expect(frame).toContain('│');
	expect(frame).toContain('- two');
	expect(frame).toContain('+ TWO');
});

test('source control panel lists changes from Ctrl+Opt+G', async () => {
	const dir = repo('one\n');
	writeFileSync(join(dir, 'a.ts'), 'changed\n');
	writeFileSync(join(dir, 'fresh.ts'), 'new\n');

	const t = await launch(dir);
	await press(t, (input) => void input.pressKeys([`${ESC}${String.fromCharCode(7)}`]));

	const frame = t.captureCharFrame();
	expect(frame).toContain('source control');
	expect(frame).toContain('a.ts');
	expect(frame).toContain('fresh.ts');

	await press(t, (input) => input.pressEnter());
	expect(t.captureCharFrame()).toContain('+ changed');
	await pressEscape(t);
	await press(t, (input) => void input.typeText('c'));
	expect(t.captureCharFrame()).toContain('Commit');
});

test('a folder inherits the status of its contents', async () => {
	const dir = repo('one\n');
	mkdirSync(join(dir, 'sub'));
	writeFileSync(join(dir, 'sub/deep.ts'), 'new\n');

	// Rendered, not just statusMap()'d: the inheritance lives in FileTree.statusOf,
	// and git reports `?? sub/` on its own, so the map alone proves nothing.
	const t = await launch(dir);
	const row = t
		.captureCharFrame()
		.split('\n')
		.find((line) => line.includes('sub'))!;
	expect(row).toContain('U');
});

test('a path git has to quote still gets its mark', () => {
	const dir = repo('one\n');
	writeFileSync(join(dir, 'ümlaut.ts'), 'new\n');
	writeFileSync(join(dir, 'two words.ts'), 'new\n');

	// `git status --porcelain` C-quotes and octal-escapes both of these names; the
	// keys have to come back as real paths or the tree shows no mark for them.
	const statuses = statusMap(dir);
	expect(statuses.get(join(dir, 'ümlaut.ts'))).toBe('untracked');
	expect(statuses.get(join(dir, 'two words.ts'))).toBe('untracked');
});

test('a rename is keyed by the path that exists on disk', () => {
	const dir = repo('one\n');
	execFileSync('git', ['mv', 'a.ts', 'renamed.ts'], { cwd: dir });

	// `-z` emits `R  new\0old\0`, so the second field must be skipped rather than
	// read as its own entry — otherwise the mark lands on the path that is gone.
	const statuses = statusMap(dir);
	expect(statuses.get(join(dir, 'renamed.ts'))).toBe('modified');
	expect(statuses.has(join(dir, 'a.ts'))).toBe(false);
});

test('ignoredAmong reports only the gitignored paths asked about', () => {
	const dir = repo('one\n');
	writeFileSync(join(dir, '.gitignore'), 'dist\n*.log\n');
	mkdirSync(join(dir, 'dist'));
	writeFileSync(join(dir, 'dist/out.js'), 'bundle\n');
	writeFileSync(join(dir, 'debug.log'), 'noise\n');

	const paths = [
		join(dir, 'dist'),
		join(dir, 'dist/out.js'),
		join(dir, 'debug.log'),
		join(dir, '.gitignore'),
		join(dir, 'a.ts'),
	];
	const ignored = ignoredAmong(dir, paths);

	expect(ignored.has(join(dir, 'dist'))).toBe(true);
	expect(ignored.has(join(dir, 'dist/out.js'))).toBe(true);
	expect(ignored.has(join(dir, 'debug.log'))).toBe(true);
	expect(ignored.has(join(dir, '.gitignore'))).toBe(false);
	expect(ignored.has(join(dir, 'a.ts'))).toBe(false);
});

test('ignoredAmong is empty outside a repository', () => {
	const dir = mkdtempSync(join(tmpdir(), 'dune-ignore-'));
	writeFileSync(join(dir, 'debug.log'), 'noise\n');

	expect(ignoredAmong(dir, [join(dir, 'debug.log')]).size).toBe(0);
});

test('every file inside a brand-new directory is marked, not just the directory', async () => {
	// `git status --porcelain` collapses an untracked directory to one `?? dir/`
	// entry, which left every file inside it with no mark at all.
	const dir = repo('one\n');
	mkdirSync(join(dir, 'newdir', 'sub'), { recursive: true });
	writeFileSync(join(dir, 'newdir', 'a.ts'), 'const a = 1\n');
	writeFileSync(join(dir, 'newdir', 'sub', 'b.ts'), 'const b = 2\n');

	const statuses = statusMap(dir);
	expect(statuses.get(join(dir, 'newdir', 'a.ts'))).toBe('untracked');
	expect(statuses.get(join(dir, 'newdir', 'sub', 'b.ts'))).toBe('untracked');

	// And the tree shows the mark on the files, with the folders inheriting it.
	const t = await launch(dir);
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	const frame = t.captureCharFrame();
	expect(frame).toContain('newdir');
	expect(frame).toContain('a.ts');
	expect(frame.split('\n').find((row) => row.includes('a.ts'))).toContain('U');
});

function foregroundOf(t: Harness, name: string): string | null {
	for (const line of (t.captureSpans() as unknown as Frame).lines) {
		for (const span of line.spans) {
			if (!span.fg || !span.text.endsWith(name)) continue;
			const b = span.fg.buffer;
			return `${b['0']},${b['1']},${b['2']}`;
		}
	}
	return null;
}

test('a gitignored entry is dimmed without inventing a status mark', async () => {
	const dir = repo('one\n');
	writeFileSync(join(dir, '.gitignore'), 'dist\n');
	mkdirSync(join(dir, 'dist'));
	writeFileSync(join(dir, 'dist/out.js'), 'bundle\n');

	const t = await launch(dir);
	await settle(t);
	await settle(t);
	const frame = t.captureCharFrame();

	expect(frame).toContain('dist');
	expect(frame.split('\n').find((row) => /\bdist\b/.test(row))!).not.toMatch(/[UMAD]/);
	expect(foregroundOf(t, 'dist')).not.toBe(foregroundOf(t, 'a.ts'));
});
