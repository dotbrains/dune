import { describe, expect, test } from 'bun:test';

import { press, pressEscape, settle } from '../helpers';
import { save, type, vimEditor } from './helpers';

describe('visual mode', () => {
	test('v selects and d deletes the selection', async () => {
		const { t, file } = await vimEditor('abcdef\n');
		await type(t, 'vll');
		expect(t.captureCharFrame()).toContain('VISUAL');
		await type(t, 'd');
		expect(t.captureCharFrame()).toContain('NORMAL');
		expect(await save(t, file)).toBe('def\n');
	});

	test('v then y yanks, p puts it back', async () => {
		const { t, file } = await vimEditor('abcdef\n');
		await type(t, 'vly');
		await type(t, '$p');
		expect(await save(t, file)).toBe('abcdefab\n');
	});

	test('v$ stops on the last character, so d keeps the line break', async () => {
		const { t, file } = await vimEditor('const beta = 2\nnext\n');
		await type(t, 'wv$d');
		expect(await save(t, file)).toBe('const \nnext\n');
	});

	test('Esc leaves visual mode', async () => {
		const { t } = await vimEditor();
		await type(t, 'v');
		await pressEscape(t);
		expect(t.captureCharFrame()).toContain('NORMAL');
	});

	test('c on a selection deletes it and inserts', async () => {
		const { t, file } = await vimEditor('abcdef\n');
		await type(t, 'vlc');
		await type(t, 'X');
		expect(await save(t, file)).toBe('Xcdef\n');
	});
});

describe('edges', () => {
	test('x at the end of a line takes the last character, not the newline', async () => {
		const { t, file } = await vimEditor();
		await type(t, '$x');
		expect(await save(t, file)).toBe('on\ntwo\nthree\n');
	});

	test('x on an empty line does nothing', async () => {
		const { t, file } = await vimEditor('a\n\nb\n');
		await type(t, 'jx');
		expect(await save(t, file)).toBe('a\n\nb\n');
	});

	test('dd on the last line', async () => {
		const { t, file } = await vimEditor('a\nb\n');
		await type(t, 'jdd');
		expect(await save(t, file)).toBe('a\n');
	});

	test('3dd takes three lines', async () => {
		const { t, file } = await vimEditor('a\nb\nc\nd\n');
		await type(t, '3dd');
		expect(await save(t, file)).toBe('d\n');
	});

	test('d2w deletes two words', async () => {
		const { t, file } = await vimEditor('alpha beta gamma\n');
		await type(t, 'd2w');
		expect(await save(t, file)).toBe('gamma\n');
	});

	test('2dw is the same as d2w', async () => {
		const { t, file } = await vimEditor('alpha beta gamma\n');
		await type(t, '2dw');
		expect(await save(t, file)).toBe('gamma\n');
	});

	test('visual selection can run backwards', async () => {
		const { t, file } = await vimEditor('abcdef\n');
		await type(t, '$hvhhd');
		// Anchored on `e`, two steps back to `c`: the anchor end is inside the selection.
		expect(await save(t, file)).toBe('abf\n');
	});

	test('visual across lines deletes both halves', async () => {
		const { t, file } = await vimEditor('abc\ndef\n');
		await type(t, 'lvjd');
		// b, c, the newline and d, e are all inside the selection.
		expect(await save(t, file)).toBe('af\n');
	});

	test('Esc in visual clears the selection, so the next edit is not it', async () => {
		const { t, file } = await vimEditor('abcdef\n');
		await type(t, 'vll');
		await pressEscape(t);
		await type(t, 'x');
		expect(await save(t, file)).toBe('abdef\n');
	});

	test('u steps back through several bursts', async () => {
		const { t, file } = await vimEditor('a\nb\nc\n');
		await type(t, 'dd');
		await settle(t, 450);
		await type(t, 'dd');
		await settle(t, 450);
		expect(await save(t, file)).toBe('c\n');
		await type(t, 'u');
		expect(await save(t, file)).toBe('b\nc\n');
		await type(t, 'u');
		expect(await save(t, file)).toBe('a\nb\nc\n');
	}, 60_000);

	test('the mode shows in the status bar', async () => {
		const { t } = await vimEditor();
		await type(t, 'v');
		expect(t.captureCharFrame()).toContain('VISUAL');
		await pressEscape(t);
		expect(t.captureCharFrame()).toContain('NORMAL');
		await type(t, 'i');
		expect(t.captureCharFrame()).toContain('INSERT');
	});

	test('insert mode types normally, arrows included', async () => {
		const { t, file } = await vimEditor();
		await type(t, 'i');
		await type(t, 'XY');
		await press(t, (i) => i.pressArrow('down'));
		await type(t, 'Z');
		expect(await save(t, file)).toBe('XYone\ntwZo\nthree\n');
	});

	test('o on the last line opens below it', async () => {
		const { t, file } = await vimEditor('a\nb\n');
		await type(t, 'Go');
		await type(t, 'X');
		expect(await save(t, file)).toBe('a\nb\n\nX');
	});
});
