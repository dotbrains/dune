import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEFAULTS } from '../src/core/config';
import { fixture, launch, press, pressEscape, settle } from './helpers';
import type { Harness } from './helpers';

async function vimEditor(content = 'one\ntwo\nthree\n') {
	const dir = fixture({ 'a.ts': content });
	const t = await launch(dir, { ...DEFAULTS, vim: true });
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	return { t, file: join(dir, 'a.ts') };
}

const type = async (t: Harness, text: string) => {
	await press(t, (i) => void i.typeText(text));
	await settle(t);
};

async function save(t: Harness, file: string) {
	await press(t, (i) => i.pressKey('s', { ctrl: true }));
	await settle(t);
	return readFileSync(file, 'utf8');
}

const at = (t: Harness) => /Ln (\d+), Col (\d+)/.exec(t.captureCharFrame())?.[0] ?? '?';

describe('vim paragraph motions', () => {
	test('} and { move between blank lines', async () => {
		const { t } = await vimEditor('one\ntwo\n\nthree\nfour\n');
		await type(t, '}');
		expect(at(t)).toContain('Ln 3');
		await type(t, '{');
		expect(at(t)).toContain('Ln 1');
	});

	test('counts apply to paragraph motions', async () => {
		const { t } = await vimEditor('a\n\nb\n\nc\n');
		await type(t, '2}');
		expect(at(t)).toContain('Ln 4');
	});

	test('} can land on the trailing blank line', async () => {
		const { t } = await vimEditor('a\nb\n');
		await type(t, 'G}');
		expect(at(t)).toContain('Ln 3');
	});
});

describe('vim linewise visual mode', () => {
	test('V enters visual mode and Esc leaves it', async () => {
		const { t } = await vimEditor();
		await type(t, 'V');
		expect(t.captureCharFrame()).toContain('VISUAL');
		await pressEscape(t);
		expect(t.captureCharFrame()).toContain('NORMAL');
	});

	test('Vd deletes the current line', async () => {
		const { t, file } = await vimEditor();
		await type(t, 'Vd');
		expect(await save(t, file)).toBe('two\nthree\n');
	});

	test('Vjd deletes two complete lines', async () => {
		const { t, file } = await vimEditor();
		await type(t, 'Vjd');
		expect(await save(t, file)).toBe('three\n');
	});

	test('Vy yanks linewise and P puts above', async () => {
		const { t, file } = await vimEditor();
		await type(t, 'jVyP');
		expect(await save(t, file)).toBe('one\ntwo\ntwo\nthree\n');
	});

	test('Vc changes the selected line and enters insert mode', async () => {
		const { t, file } = await vimEditor();
		await type(t, 'VcX');
		expect(await save(t, file)).toBe('Xtwo\nthree\n');
	});
});

describe('vim bracket text objects', () => {
	test('inner and around braces work with delete and change operators', async () => {
		const { t, file } = await vimEditor('const x = { hello }\n');
		await type(t, '012ldi{');
		expect(await save(t, file)).toBe('const x = {}\n');
		await type(t, 'u012lca{X');
		expect(await save(t, file)).toBe('const x = X\n');
	});

	test('text objects work for parens and brackets, including close delimiters', async () => {
		const paren = await vimEditor('const x = ( hello )\n');
		await type(paren.t, '018ldi)');
		expect(await save(paren.t, paren.file)).toBe('const x = ()\n');

		const bracket = await vimEditor('const x = [ hello ]\n');
		await type(bracket.t, '012lyi[$p');
		expect(await save(bracket.t, bracket.file)).toBe('const x = [ hello ] hello \n');
	});

	test('nested pairs choose the innermost enclosing pair', async () => {
		const { t, file } = await vimEditor('outer { inner { core } more }\n');
		await type(t, '016ldi{');
		expect(await save(t, file)).toBe('outer { inner {} more }\n');
	});

	test('missing and empty inner pairs are no-ops', async () => {
		const missing = await vimEditor('hello world\n');
		await type(missing.t, '012ldi{');
		expect(await save(missing.t, missing.file)).toBe('hello world\n');

		const empty = await vimEditor('const x = {}\n');
		await type(empty.t, '012ldi{');
		expect(await save(empty.t, empty.file)).toBe('const x = {}\n');
	});

	test('visual text objects can drive normal visual commands', async () => {
		const { t, file } = await vimEditor('const x = { hello }\n');
		await type(t, '012lvi{');
		expect(t.captureCharFrame()).toContain('VISUAL');
		await type(t, 'cX');
		expect(await save(t, file)).toBe('const x = {X}\n');
	});
});
