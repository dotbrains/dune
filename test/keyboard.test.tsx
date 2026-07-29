import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { F1, fixture, launch, press, pressEscape } from './helpers';
import type { Harness } from './helpers';

type Input = Harness['mockInput'];

const PROJECT = { 'a.ts': 'const a = 1\n' };
const TREE_PROJECT = {
	'dir/inside.ts': 'const inside = 1\n',
	'a.ts': 'const a = 1\n',
	'b.ts': 'const b = 2\n',
};

async function openedFile(dir: string) {
	const t = await launch(dir);
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	return t;
}

describe('focus after an overlay closes', () => {
	/** Every overlay mounts its own focused input, which takes focus off the textarea. */
	const reopensTyping = (open: (input: Input) => void) => async () => {
		const dir = fixture(PROJECT);
		const t = await openedFile(dir);

		await press(t, open);
		await pressEscape(t);
		await press(t, (i) => void i.typeText('X'));
		await press(t, (i) => i.pressKey('s', { ctrl: true }));

		expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('Xconst a = 1\n');
	};

	test(
		'after the command palette',
		reopensTyping((i) => i.pressKey('p', { ctrl: true })),
	);
	test(
		'after the command palette opened with F1',
		reopensTyping((i) => void i.pressKeys([F1])),
	);
	test(
		'after find in file',
		reopensTyping((i) => i.pressKey('f', { ctrl: true })),
	);
	test(
		'after the file picker',
		reopensTyping((i) => i.pressKey('o', { ctrl: true })),
	);
	test(
		'after go to line',
		reopensTyping((i) => i.pressKey('g', { ctrl: true })),
	);
});

describe('chords while the tree has focus', () => {
	// The tree switches on the bare key name, so a Ctrl chord that reached it used
	// to fire the plain-letter case: Ctrl+D opened Delete, Ctrl+R Rename, Ctrl+A New.
	const leavesTreeAlone = (letter: string) => async () => {
		const t = await launch(fixture(PROJECT));
		await press(t, (i) => i.pressArrow('down')); // select a.ts, focus stays on the tree

		await press(t, (i) => i.pressKey(letter, { ctrl: true }));
		const frame = t.captureCharFrame();
		expect(frame).not.toContain('Delete');
		expect(frame).not.toContain('Rename to');
		expect(frame).not.toContain('New file name');
	};

	test('Ctrl+D does not offer to delete the selected file', leavesTreeAlone('d'));
	test('Ctrl+R does not open rename', leavesTreeAlone('r'));
	test('Ctrl+A does not open new file', leavesTreeAlone('a'));
});

describe('vim keys while the tree has focus', () => {
	test('j/k move and h/l collapse or expand only when vim is enabled', async () => {
		const t = await launch(fixture(TREE_PROJECT), { vim: true });
		await press(t, (i) => i.pressArrow('down'));
		await press(t, (i) => i.pressArrow('up'));

		await press(t, (i) => i.pressKey('l'));
		expect(t.captureCharFrame()).toContain('inside.ts');

		await press(t, (i) => i.pressKey('h'));
		expect(t.captureCharFrame()).not.toContain('inside.ts');

		await press(t, (i) => i.pressKey('j'));
		await press(t, (i) => i.pressEnter());
		expect(t.captureCharFrame()).toContain('const a = 1');
	});

	test('plain j does not move the tree selection without vim', async () => {
		const t = await launch(fixture(TREE_PROJECT));
		await press(t, (i) => i.pressArrow('down'));
		await press(t, (i) => i.pressArrow('up'));

		await press(t, (i) => i.pressKey('j'));
		await press(t, (i) => i.pressEnter());
		expect(t.captureCharFrame()).not.toContain('const a = 1');
	});
});

describe('closing a tab with unsaved edits', () => {
	test('Ctrl+W asks instead of throwing the edits away', async () => {
		const dir = fixture(PROJECT);
		const t = await openedFile(dir);
		await press(t, (i) => void i.typeText('QQQ'));

		await press(t, (i) => i.pressKey('w', { ctrl: true }));
		expect(t.captureCharFrame()).toContain('Unsaved changes');
		expect(t.captureCharFrame()).toContain('a.ts');

		// Cancelling keeps the tab and the edits.
		await pressEscape(t);
		expect(t.captureCharFrame()).toContain('QQQconst a = 1');
	});

	test('confirming closes it and the file on disk is untouched', async () => {
		const dir = fixture(PROJECT);
		const t = await openedFile(dir);
		await press(t, (i) => void i.typeText('QQQ'));

		await press(t, (i) => i.pressKey('w', { ctrl: true }));
		await press(t, (i) => i.pressEnter());

		expect(t.captureCharFrame()).toContain('no open files');
		expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('const a = 1\n');
	});

	test('a saved tab closes without asking', async () => {
		const dir = fixture(PROJECT);
		const t = await openedFile(dir);
		await press(t, (i) => void i.typeText('X'));
		await press(t, (i) => i.pressKey('s', { ctrl: true }));

		await press(t, (i) => i.pressKey('w', { ctrl: true }));
		expect(t.captureCharFrame()).not.toContain('Unsaved changes');
		expect(t.captureCharFrame()).toContain('no open files');
	});

	test('Quit asks too, naming the files', async () => {
		const t = await openedFile(fixture(PROJECT));
		await press(t, (i) => void i.typeText('QQQ'));

		await press(t, (i) => i.pressKey('q', { ctrl: true }));
		const frame = t.captureCharFrame();
		expect(frame).toContain('Unsaved changes');
		expect(frame).toContain('a.ts');
		expect(frame).toContain('quit without saving');
	});
});

test('go to line rejects something that is not a line number', async () => {
	const t = await openedFile(fixture({ 'a.ts': 'one\ntwo\n' }));
	await press(t, (i) => i.pressKey('g', { ctrl: true }));
	await press(t, (i) => void i.typeText('nonsense'));
	await press(t, (i) => i.pressEnter());

	expect(t.captureCharFrame()).toContain('Not a line number');
});

test('the palette keeps its input and footer on screen when a filter matches everything', async () => {
	const t = await launch(fixture(PROJECT));
	await press(t, (i) => i.pressKey('p', { ctrl: true }));
	await press(t, (i) => void i.typeText('e')); // matches most of the 50-odd leaves

	const frame = t.captureCharFrame();
	expect(frame).toContain('Esc close'); // the footer survived
	expect(frame.split('\n').length).toBeLessThanOrEqual(21); // 20 rows plus the trailing newline
});
