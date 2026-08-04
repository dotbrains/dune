import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { lineRangeAt, wordRangeAt } from '../src/editor/words';
import { fixture, launch, press, settle } from './helpers';
import type { Harness } from './helpers';

interface SelectionHost {
	renderer?: { getSelection: () => { getSelectedText: () => string } | null };
}

const selected = (t: Harness) =>
	(t as unknown as SelectionHost).renderer?.getSelection()?.getSelectedText() ?? null;

async function withOpenFile(content = 'const alpha = 1\nconst beta = 2\n') {
	const dir = fixture({ 'a.ts': content });
	const t = await launch(dir);
	await press(t, (input) => input.pressKey('o', { ctrl: true }));
	await press(t, (input) => void input.typeText('a.ts'));
	await press(t, (input) => input.pressEnter());
	return { t, dir };
}

function colOf(t: Harness, text: string) {
	return t.captureCharFrame().split('\n')[1]!.indexOf(text);
}

const save = (t: Harness) => press(t, (input) => input.pressKey('s', { ctrl: true }));

describe('wordRangeAt', () => {
	test('selects an identifier under the caret', () => {
		const text = 'const data = []\n';
		const at = text.indexOf('data');
		expect(wordRangeAt(text, at)).toEqual({ start: at, end: at + 4 });
		expect(wordRangeAt(text, at + 2)).toEqual({ start: at, end: at + 4 });
	});

	test('treats _ and $ as part of the word', () => {
		const text = 'const _foo$ = 1\n';
		const at = text.indexOf('_foo$');
		expect(wordRangeAt(text, at + 1)).toEqual({ start: at, end: at + 5 });
	});

	test('selects spaces and punctuation without crossing newlines', () => {
		expect(wordRangeAt('a  \nb\n', 1)).toEqual({ start: 1, end: 3 });
		const text = 'foo();\nnext\n';
		const at = text.indexOf('(');
		expect(wordRangeAt(text, at)).toEqual({ start: at, end: at + 3 });
	});

	test('selects only the word inside a quoted string', () => {
		const text = 'const s = "hello world"\n';
		const at = text.indexOf('hello');
		expect(wordRangeAt(text, at)).toEqual({ start: at, end: at + 5 });
	});

	test('a caret on a line terminator selects nothing', () => {
		const text = 'const a = 1\nconst b = 2\n';
		const at = text.indexOf('\n');
		expect(wordRangeAt(text, at)).toEqual({ start: at, end: at });
	});

	test('a blank line does not select the blank lines around it', () => {
		expect(wordRangeAt('a\n\n\n\nb\n', 2)).toEqual({ start: 2, end: 2 });
	});

	test('an empty buffer is a zero range', () => {
		expect(wordRangeAt('', 0)).toEqual({ start: 0, end: 0 });
	});
});

describe('lineRangeAt', () => {
	test('covers the whole line including its newline', () => {
		const text = 'const data = []\nnext\n';
		expect(lineRangeAt(text, text.indexOf('data'))).toEqual({ start: 0, end: 16 });
	});

	test('the last line without a trailing newline goes to the end', () => {
		expect(lineRangeAt('only', 2)).toEqual({ start: 0, end: 4 });
	});

	test('an empty buffer is a zero range', () => {
		expect(lineRangeAt('', 0)).toEqual({ start: 0, end: 0 });
	});
});

describe('mouse selection', () => {
	test('dragging in the editor still selects, so Ctrl+C has something to copy', async () => {
		const { t } = await withOpenFile();
		// Found from the frame rather than hard-coded: the editor's first column moves
		// whenever the sidebar is resized or the divider changes width.
		const from = colOf(t, 'alpha');
		await t.mockMouse.drag(from, 1, from + 5, 1);
		await settle(t);
		expect(selected(t)).toContain('alpha');
	});

	test('dragging over the file tree selects nothing', async () => {
		const { t } = await withOpenFile();
		await t.mockMouse.drag(2, 3, 10, 3);
		await settle(t);
		expect(selected(t)).toBeNull();
	});

	test('dragging over the tab bar selects nothing', async () => {
		const { t } = await withOpenFile();
		await t.mockMouse.drag(2, 0, 10, 0);
		await settle(t);
		expect(selected(t)).toBeNull();
	});

	test('double-click selects the word under the cursor', async () => {
		const { t, dir } = await withOpenFile('const data = []\nconst beta = 2\n');
		await t.mockMouse.doubleClick(colOf(t, 'data'), 1);
		await settle(t);
		await press(t, (input) => void input.typeText('X'));
		await save(t);
		expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('const X = []\nconst beta = 2\n');
	});

	test('triple-click selects the whole line', async () => {
		const { t, dir } = await withOpenFile('const data = []\nconst beta = 2\n');
		const at = colOf(t, 'data');
		await t.mockMouse.click(at, 1);
		await t.mockMouse.click(at, 1);
		await t.mockMouse.click(at, 1);
		await settle(t);
		await press(t, (input) => void input.typeText('X'));
		await save(t);
		expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('Xconst beta = 2\n');
	});

	test('a single click does not select the word', async () => {
		const { t, dir } = await withOpenFile('const data = []\nconst beta = 2\n');
		await t.mockMouse.click(colOf(t, 'data'), 1);
		await settle(t);
		await press(t, (input) => void input.typeText('X'));
		await save(t);
		const saved = readFileSync(join(dir, 'a.ts'), 'utf8');
		expect(saved).toContain('data');
		expect(saved).toContain('X');
	});

	test('double-click inside a string selects only that word', async () => {
		const { t, dir } = await withOpenFile('const s = "hello world"\n');
		await t.mockMouse.doubleClick(colOf(t, 'hello'), 1);
		await settle(t);
		await press(t, (input) => void input.typeText('X'));
		await save(t);
		expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('const s = "X world"\n');
	});

	test('double-clicking past the end of a line keeps the line break', async () => {
		const { t, dir } = await withOpenFile();
		await t.mockMouse.doubleClick(colOf(t, 'const alpha = 1') + 'const alpha = 1'.length + 3, 1);
		await settle(t);
		await press(t, (input) => void input.typeText('X'));
		await save(t);
		expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('const alpha = 1X\nconst beta = 2\n');
	});

	test('double-clicking a blank line does not eat the blank lines around it', async () => {
		const { t, dir } = await withOpenFile('const alpha = 1\n\n\n\nconst beta = 2\n');
		await t.mockMouse.doubleClick(colOf(t, 'const alpha = 1'), 2);
		await settle(t);
		await press(t, (input) => void input.typeText('X'));
		await save(t);
		expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe(
			'const alpha = 1\nX\n\n\nconst beta = 2\n',
		);
	});
});
