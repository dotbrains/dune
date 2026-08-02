import { describe, expect, test } from 'bun:test';

import { press, settle } from '../helpers';
import { save, type, vimEditor } from './helpers';

describe('normal-mode edits', () => {
	test('x deletes the character under the cursor', async () => {
		const { t, file } = await vimEditor();
		await type(t, 'x');
		expect(await save(t, file)).toBe('ne\ntwo\nthree\n');
	});

	test('3x deletes three', async () => {
		const { t, file } = await vimEditor('abcdef\n');
		await type(t, '3x');
		expect(await save(t, file)).toBe('def\n');
	});

	test('D deletes to the line end', async () => {
		const { t, file } = await vimEditor();
		await type(t, 'lD');
		expect(await save(t, file)).toBe('o\ntwo\nthree\n');
	});

	test('C deletes to the line end and inserts', async () => {
		const { t, file } = await vimEditor();
		await type(t, 'lC');
		await type(t, 'X');
		expect(await save(t, file)).toBe('oX\ntwo\nthree\n');
	});

	test('dw deletes a word', async () => {
		const { t, file } = await vimEditor('alpha beta\n');
		await type(t, 'dw');
		expect(await save(t, file)).toBe('beta\n');
	});

	test('cw changes a word', async () => {
		const { t, file } = await vimEditor('alpha beta\n');
		await type(t, 'cw');
		await type(t, 'X');
		expect(await save(t, file)).toBe('Xbeta\n');
	});

	test('d$ deletes to the end', async () => {
		const { t, file } = await vimEditor('alpha beta\n');
		await type(t, 'wd$');
		expect(await save(t, file)).toBe('alpha \n');
	});

	test('cc clears the line and inserts', async () => {
		const { t, file } = await vimEditor();
		await type(t, 'jcc');
		await type(t, 'X');
		expect(await save(t, file)).toBe('one\nX\nthree\n');
	});

	test('yy then p puts the copy below', async () => {
		const { t, file } = await vimEditor();
		await type(t, 'yyp');
		expect(await save(t, file)).toBe('one\none\ntwo\nthree\n');
	});

	test('yy then P puts it above', async () => {
		const { t, file } = await vimEditor();
		await type(t, 'jyyP');
		expect(await save(t, file)).toBe('one\ntwo\ntwo\nthree\n');
	});

	test('u undoes the last edit', async () => {
		const { t, file } = await vimEditor();
		await type(t, 'dd');
		await type(t, 'u');
		expect(await save(t, file)).toBe('one\ntwo\nthree\n');
	});

	test('Ctrl+R redoes it', async () => {
		const { t, file } = await vimEditor();
		await type(t, 'dd');
		await type(t, 'u');
		await press(t, (i) => i.pressKey('r', { ctrl: true }));
		await settle(t);
		expect(await save(t, file)).toBe('two\nthree\n');
	});
});
