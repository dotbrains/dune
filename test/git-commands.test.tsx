import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { fixture, launch, press, runCommand, settle } from './helpers';
import { git as runGit } from './git-fixture';
import type { Harness } from './helpers';

function repo(committed: string) {
	const dir = mkdtempSync(join(tmpdir(), 'dune-git-commands-'));
	const git = (...args: string[]) => runGit(dir, ...args);
	git('init', '-q', '-b', 'main');
	git('config', 'user.email', 'test@example.com');
	git('config', 'user.name', 'Test');
	writeFileSync(join(dir, 'a.ts'), committed);
	git('add', '.');
	git('commit', '-q', '-m', 'init');
	return dir;
}

const subject = (dir: string) =>
	execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir }).toString().trim();
const porcelain = (dir: string) =>
	execFileSync('git', ['status', '--porcelain'], { cwd: dir }).toString();

async function until(t: Harness, cond: () => boolean, ms = 5000) {
	const start = Date.now();
	while (Date.now() - start < ms) {
		try {
			if (cond()) break;
		} catch {
			// Git stash can briefly remove and rewrite a path while the UI is settling.
		}
		await settle(t, 25);
	}
	expect(cond()).toBe(true);
}

test('commit picker commits selected changes', async () => {
	const dir = repo('one\n');
	writeFileSync(join(dir, 'a.ts'), 'two\n');
	writeFileSync(join(dir, 'b.ts'), 'new\n');

	const t = await launch(dir);
	await runCommand(t, 'Commit');
	const picker = t.captureCharFrame();
	expect(picker).toContain('2 of 2 files selected');
	expect(picker).toContain('[x] M a.ts');
	expect(picker).toContain('[x] U b.ts');

	await press(t, (input) => input.pressEnter());
	expect(t.captureCharFrame()).toContain('Commit message');
	await press(t, (input) => void input.typeText('add things'));
	await press(t, (input) => input.pressEnter());

	await until(t, () => subject(dir) === 'add things');
	expect(porcelain(dir)).toBe('');
});

test('staged paths prefill the commit picker', async () => {
	const dir = repo('one\n');
	writeFileSync(join(dir, 'a.ts'), 'two\n');
	execFileSync('git', ['add', 'a.ts'], { cwd: dir });
	writeFileSync(join(dir, 'b.ts'), 'new\n');

	const t = await launch(dir);
	await runCommand(t, 'Commit');
	const picker = t.captureCharFrame();
	expect(picker).toContain('1 of 2 files selected');
	expect(picker).toContain('[x] M a.ts');
	expect(picker).toContain('[ ] U b.ts');

	await press(t, (input) => input.pressEnter());
	await press(t, (input) => void input.typeText('staged only'));
	await press(t, (input) => input.pressEnter());

	await until(t, () => subject(dir) === 'staged only');
	expect(porcelain(dir)).toContain('?? b.ts');
	expect(porcelain(dir)).not.toContain('a.ts');
});

test('stash reverts the working tree and pop brings it back', async () => {
	const dir = repo('one\ntwo\n');
	writeFileSync(join(dir, 'a.ts'), 'CHANGED\ntwo\n');

	const t = await launch(dir);
	await runCommand(t, 'Stash changes');
	await until(t, () => readFileSync(join(dir, 'a.ts'), 'utf8') === 'one\ntwo\n');

	await runCommand(t, 'Stash pop');
	await until(t, () => readFileSync(join(dir, 'a.ts'), 'utf8') === 'CHANGED\ntwo\n');
});

test('branch switch picker checks out the selected branch', async () => {
	const dir = repo('main\n');
	const git = (...args: string[]) => runGit(dir, ...args);
	git('switch', '-q', '-c', 'feature');
	writeFileSync(join(dir, 'a.ts'), 'feature\n');
	git('commit', '-qam', 'feature');
	git('switch', '-q', 'main');

	const t = await launch(dir);
	await runCommand(t, 'Switch branch');
	expect(t.captureCharFrame()).toContain('Switch to branch');
	await press(t, (input) => input.pressEnter());

	await until(
		t,
		() =>
			execFileSync('git', ['branch', '--show-current'], { cwd: dir }).toString().trim() ===
			'feature',
	);
	expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('feature\n');
});

test('branch pickers filter choices as they are typed', async () => {
	const dir = repo('main\n');
	const git = (...args: string[]) => runGit(dir, ...args);
	git('switch', '-q', '-c', 'alpha');
	git('switch', '-q', 'main');
	git('switch', '-q', '-c', 'zebra');
	git('switch', '-q', 'main');

	const t = await launch(dir);
	await runCommand(t, 'Switch branch');
	expect(t.captureCharFrame()).toContain('alpha');
	expect(t.captureCharFrame()).toContain('zebra');

	await press(t, (input) => void input.typeText('ze'));
	const filtered = t.captureCharFrame();
	expect(filtered).toContain('filter: ze');
	expect(filtered).toContain('zebra');
	expect(filtered).not.toContain('alpha');
	await press(t, (input) => input.pressEnter());

	await until(
		t,
		() =>
			execFileSync('git', ['branch', '--show-current'], { cwd: dir }).toString().trim() === 'zebra',
	);
});

test('new branch prompt creates and checks out a branch', async () => {
	const dir = repo('main\n');

	const t = await launch(dir);
	await runCommand(t, 'New branch');
	expect(t.captureCharFrame()).toContain('New branch name');
	await press(t, (input) => void input.typeText('work'));
	await press(t, (input) => input.pressEnter());

	await until(
		t,
		() =>
			execFileSync('git', ['branch', '--show-current'], { cwd: dir }).toString().trim() === 'work',
	);
});

test('merge branch command merges the selected branch after confirmation', async () => {
	const dir = repo('main\n');
	const git = (...args: string[]) => runGit(dir, ...args);
	git('switch', '-q', '-c', 'feature');
	writeFileSync(join(dir, 'feature.ts'), 'feature\n');
	git('add', '.');
	git('commit', '-q', '-m', 'feature');
	git('switch', '-q', 'main');

	const t = await launch(dir);
	await runCommand(t, 'Merge branch');
	expect(t.captureCharFrame()).toContain('Merge into current branch');
	await press(t, (input) => input.pressEnter());
	expect(t.captureCharFrame()).toContain('Merge branch');
	await press(t, (input) => input.pressEnter());

	await until(
		t,
		() =>
			execFileSync('git', ['log', '-1', '--format=%s'], { cwd: dir }).toString().trim() ===
			'feature',
	);
	expect(readFileSync(join(dir, 'feature.ts'), 'utf8')).toBe('feature\n');
});

test('branch commit comparison opens a selected commit diff', async () => {
	const dir = repo('one\n');
	const git = (...args: string[]) => runGit(dir, ...args);
	git('switch', '-q', '-c', 'feature');
	writeFileSync(join(dir, 'a.ts'), 'two\n');
	git('commit', '-qam', 'change a');

	const t = await launch(dir);
	await runCommand(t, 'Compare branch commits');
	expect(t.captureCharFrame()).toContain('Compare commits against branch');
	await press(t, (input) => input.pressEnter());
	expect(t.captureCharFrame()).toContain('change a');
	await press(t, (input) => input.pressEnter());

	const frame = t.captureCharFrame();
	expect(frame).toContain('- one');
	expect(frame).toContain('+ two');
});

test('rename branch command renames the selected local branch', async () => {
	const dir = repo('main\n');
	const git = (...args: string[]) => runGit(dir, ...args);
	git('switch', '-q', '-c', 'work');
	git('switch', '-q', 'main');

	const t = await launch(dir);
	await runCommand(t, 'Rename branch');
	expect(t.captureCharFrame()).toContain('Rename branch');
	await press(t, (input) => void input.typeText('work'));
	await press(t, (input) => input.pressEnter());
	expect(t.captureCharFrame()).toContain('Rename branch to');
	await press(t, (input) => {
		input.pressBackspace();
		input.pressBackspace();
		input.pressBackspace();
		input.pressBackspace();
		input.typeText('done');
	});
	await press(t, (input) => input.pressEnter());

	await until(
		t,
		() =>
			execFileSync('git', ['rev-parse', '--verify', '--quiet', 'refs/heads/done'], { cwd: dir })
				.toString()
				.trim() !== '',
	);
});

test('delete branch command deletes the selected local branch after confirmation', async () => {
	const dir = repo('main\n');
	const git = (...args: string[]) => runGit(dir, ...args);
	git('switch', '-q', '-c', 'work');
	git('switch', '-q', 'main');

	const t = await launch(dir);
	await runCommand(t, 'Delete branch');
	expect(t.captureCharFrame()).toContain('Delete branch');
	await press(t, (input) => void input.typeText('work'));
	await press(t, (input) => input.pressEnter());
	expect(t.captureCharFrame()).toContain('Delete branch');
	await press(t, (input) => input.pressEnter());

	await until(
		t,
		() => execFileSync('git', ['branch', '--list', 'work'], { cwd: dir }).toString().trim() === '',
	);
});

test('force delete branch command deletes an unmerged branch after confirmation', async () => {
	const dir = repo('main\n');
	const git = (...args: string[]) => runGit(dir, ...args);
	git('switch', '-q', '-c', 'work');
	writeFileSync(join(dir, 'work.ts'), 'work\n');
	git('add', '.');
	git('commit', '-q', '-m', 'work');
	git('switch', '-q', 'main');

	const t = await launch(dir);
	await runCommand(t, 'Delete branch (force)');
	expect(t.captureCharFrame()).toContain('Delete branch (force)');
	await press(t, (input) => void input.typeText('work'));
	await press(t, (input) => input.pressEnter());
	expect(t.captureCharFrame()).toContain('Delete branch (force)');
	await press(t, (input) => input.pressEnter());

	await until(
		t,
		() => execFileSync('git', ['branch', '--list', 'work'], { cwd: dir }).toString().trim() === '',
	);
});

test('outside a repository git commands warn instead of mutating', async () => {
	const t = await launch(fixture({ 'a.ts': 'x\n' }));
	await runCommand(t, 'Commit');
	await until(t, () => t.captureCharFrame().includes('Not a git repository'));
});
