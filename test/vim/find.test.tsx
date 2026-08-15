import { describe, expect, test } from 'bun:test';

import { at, save, type, vimEditor } from './helpers';

const LINE = 'const a = fn(one, two);\nsecond line\n';

describe('vim character search', () => {
	test('f lands on the character, t stops against it', async () => {
		const { t } = await vimEditor(LINE);
		await type(t, 'f(');
		expect(at(t)).toBe('Ln 1, Col 13');

		await type(t, '0t)');
		expect(at(t)).toBe('Ln 1, Col 21');
	});

	test('a count picks the nth match', async () => {
		const { t } = await vimEditor(LINE);
		await type(t, '2fo');
		expect(at(t)).toBe('Ln 1, Col 14');
	});

	test('F and T search backward on the current line', async () => {
		const { t } = await vimEditor(LINE);
		await type(t, '$F(');
		expect(at(t)).toBe('Ln 1, Col 13');

		await type(t, '$T(');
		expect(at(t)).toBe('Ln 1, Col 14');
	});

	test('; repeats and , reverses the previous character search', async () => {
		const { t } = await vimEditor(LINE);
		await type(t, 'fo');
		expect(at(t)).toBe('Ln 1, Col 2');
		await type(t, ';');
		expect(at(t)).toBe('Ln 1, Col 14');
		await type(t, ';');
		expect(at(t)).toBe('Ln 1, Col 21');
		await type(t, ',');
		expect(at(t)).toBe('Ln 1, Col 14');
	});

	test('find motions do not cross lines or move on misses', async () => {
		const { t } = await vimEditor(LINE);
		await type(t, 'fd');
		expect(at(t)).toBe('Ln 1, Col 1');
		await type(t, 'fz');
		expect(at(t)).toBe('Ln 1, Col 1');
	});

	test('df takes the character and dt stops before it', async () => {
		const { t, file } = await vimEditor(LINE);
		await type(t, 'df,');
		expect(await save(t, file)).toBe(' two);\nsecond line\n');
	});

	test('dt leaves the character it stopped against', async () => {
		const { t, file } = await vimEditor(LINE);
		await type(t, 'dt,');
		expect(await save(t, file)).toBe(', two);\nsecond line\n');
	});

	test('backward find operators keep the character under the cursor', async () => {
		const { t, file } = await vimEditor(LINE);
		await type(t, '$dF(');
		expect(await save(t, file)).toBe('const a = fn;\nsecond line\n');
	});

	test('change through a find opens insert mode at the deletion start', async () => {
		const { t, file } = await vimEditor(LINE);
		await type(t, 'cf(');
		expect(t.captureCharFrame()).toContain('INSERT');
		await type(t, 'let b = g');
		expect(await save(t, file)).toBe('let b = gone, two);\nsecond line\n');
	});

	test('visual find extends the selection', async () => {
		const { t, file } = await vimEditor(LINE);
		await type(t, 'vf,d');
		expect(await save(t, file)).toBe(' two);\nsecond line\n');
	});

	test('the searched character uses the printed text, not the command key layout', async () => {
		const { t } = await vimEditor('let a = ф\n');
		await type(t, 'fф');
		expect(at(t)).toBe('Ln 1, Col 9');
	});
});
