import { describe, expect, test } from 'bun:test';

import { pressEscape } from '../helpers';
import { at, save, type, vimEditor } from './helpers';

describe('entering insert mode', () => {
	test('i inserts before the cursor', async () => {
		const { t, file } = await vimEditor();
		await type(t, 'i');
		await type(t, 'X');
		expect(await save(t, file)).toBe('Xone\ntwo\nthree\n');
	});

	test('a inserts after it', async () => {
		const { t, file } = await vimEditor();
		await type(t, 'a');
		await type(t, 'X');
		expect(await save(t, file)).toBe('oXne\ntwo\nthree\n');
	});

	test('A appends at the line end', async () => {
		const { t, file } = await vimEditor();
		await type(t, 'A');
		await type(t, 'X');
		expect(await save(t, file)).toBe('oneX\ntwo\nthree\n');
	});

	test('I inserts at the line start', async () => {
		const { t, file } = await vimEditor();
		await type(t, '$I');
		await type(t, 'X');
		expect(await save(t, file)).toBe('Xone\ntwo\nthree\n');
	});

	test('o opens a line below, O above', async () => {
		const { t, file } = await vimEditor();
		await type(t, 'o');
		await type(t, 'X');
		expect(await save(t, file)).toBe('one\nX\ntwo\nthree\n');

		await pressEscape(t);
		await type(t, 'O');
		await type(t, 'Y');
		expect(await save(t, file)).toBe('one\nY\nX\ntwo\nthree\n');
	});

	test('Esc leaves insert mode and steps left', async () => {
		const { t } = await vimEditor();
		await type(t, 'A');
		await type(t, 'XY');
		await pressEscape(t);
		expect(t.captureCharFrame()).toContain('NORMAL');
		expect(at(t)).toBe('Ln 1, Col 5');
	});
});
