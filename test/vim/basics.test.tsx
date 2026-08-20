import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { press, pressEscape } from '../helpers';
import { at, type, vimEditor } from './helpers';

describe('vim mode basics', () => {
	test('starts in normal mode and says so', async () => {
		const { t } = await vimEditor();
		expect(t.captureCharFrame()).toContain('NORMAL');
	});

	test('i enters insert mode and Esc leaves it, with the sidebar showing', async () => {
		// Esc is also "leave the editor for the tree". App's handler runs first and
		// focus moves synchronously, so without a vim guard the mode never changes
		// and the next key is a tree command — `d` would offer to delete the file.
		const { t } = await vimEditor();
		await press(t, (i) => i.pressKey('i'));
		expect(t.captureCharFrame()).toContain('INSERT');

		await pressEscape(t);
		expect(t.captureCharFrame()).toContain('NORMAL');
		expect(t.captureCharFrame()).not.toContain('Delete');
	});

	test('normal mode swallows unknown keys instead of typing them', async () => {
		const { t, file } = await vimEditor();
		await press(t, (i) => void i.typeText('qqq')); // no such command — must not reach the buffer
		await press(t, (i) => i.pressKey('i'));
		await press(t, (i) => void i.typeText('X'));
		await press(t, (i) => i.pressKey('s', { ctrl: true }));

		expect(readFileSync(file, 'utf8')).toBe('Xone\ntwo\nthree\n');
	});

	test('dd deletes a line and p puts it back', async () => {
		const { t, file } = await vimEditor();
		await press(t, (i) => void i.typeText('dd'));
		await press(t, (i) => i.pressKey('s', { ctrl: true }));
		expect(readFileSync(file, 'utf8')).toBe('two\nthree\n');

		await press(t, (i) => void i.typeText('p'));
		await press(t, (i) => i.pressKey('s', { ctrl: true }));
		expect(readFileSync(file, 'utf8')).toBe('two\none\nthree\n');
	});

	test('a count applies to the operator that follows it', async () => {
		const { t, file } = await vimEditor('a\nb\nc\nd\n');
		await press(t, (i) => void i.typeText('2dd'));
		await press(t, (i) => i.pressKey('s', { ctrl: true }));
		expect(readFileSync(file, 'utf8')).toBe('c\nd\n');
	});

	test('a count is not carried into the next command', async () => {
		const { t, file } = await vimEditor('a\nb\nc\nd\n');
		await press(t, (i) => void i.typeText('2j')); // move, consuming the 2
		await press(t, (i) => void i.typeText('dd')); // deletes one line, not two
		await press(t, (i) => i.pressKey('s', { ctrl: true }));
		expect(readFileSync(file, 'utf8')).toBe('a\nb\nd\n');
	});
});

describe('motions', () => {
	test('l moves right, h back', async () => {
		const { t } = await vimEditor();
		await type(t, 'll');
		expect(at(t)).toBe('Ln 1, Col 3');
		await type(t, 'h');
		expect(at(t)).toBe('Ln 1, Col 2');
	});

	test('j / k move by line', async () => {
		const { t } = await vimEditor();
		await type(t, 'jj');
		expect(at(t)).toBe('Ln 3, Col 1');
		await type(t, 'k');
		expect(at(t)).toBe('Ln 2, Col 1');
	});

	test('counted motion: 2j', async () => {
		const { t } = await vimEditor('a\nb\nc\nd\ne\n');
		await type(t, '2j');
		expect(at(t)).toBe('Ln 3, Col 1');
	});

	test('$ goes to line end, 0 to the start', async () => {
		const { t } = await vimEditor();
		await type(t, '$');
		// On the last character, as vim leaves it — not past it.
		expect(at(t)).toBe('Ln 1, Col 3');
		await type(t, '0');
		expect(at(t)).toBe('Ln 1, Col 1');
	});

	test('G goes to the last line, gg back to the first', async () => {
		const { t } = await vimEditor('a\nb\nc\nd\n');
		await type(t, 'G');
		expect(at(t)).toContain('Ln 5');
		await type(t, 'gg');
		expect(at(t)).toBe('Ln 1, Col 1');
	});

	test('w / b step by word', async () => {
		const { t } = await vimEditor('alpha beta gamma\n');
		await type(t, 'w');
		expect(at(t)).toBe('Ln 1, Col 7');
		await type(t, 'w');
		expect(at(t)).toBe('Ln 1, Col 12');
		await type(t, 'b');
		expect(at(t)).toBe('Ln 1, Col 7');
	});

	test('5G jumps to line 5', async () => {
		const { t } = await vimEditor('a\nb\nc\nd\ne\nf\n');
		await type(t, '5G');
		expect(at(t)).toBe('Ln 5, Col 1');
	});
});
