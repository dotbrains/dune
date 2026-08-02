import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

import { parseFormatterEdit } from '../src/core/format';
import { CONFIG_FILE } from '../src/core/config';
import { fixture, launch, press, runCommand } from './helpers';
import type { Harness } from './helpers';

const saved = () => JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));

async function gotoRow(t: Harness, label: string) {
	for (let step = 0; step < 30; step++) {
		const row = t
			.captureCharFrame()
			.split('\n')
			.find((line) => line.includes(label));
		if (row?.includes('▌')) return;
		await press(t, (input) => input.pressArrow('down'));
	}
	throw new Error(`row not reached: ${label}`);
}

test('formatter setting input parses add, remove and invalid forms', () => {
	expect(parseFormatterEdit('ts,tsx = prettier --write')).toEqual({
		ok: true,
		key: 'ts,tsx',
		command: ['prettier', '--write'],
	});
	expect(parseFormatterEdit('ts =')).toEqual({ ok: true, key: 'ts', command: null });
	expect(parseFormatterEdit('.JS, .jsx = oxfmt')).toEqual({
		ok: true,
		key: 'js,jsx',
		command: ['oxfmt'],
	});
	expect(parseFormatterEdit('prettier --write')).toEqual({
		ok: false,
		error: 'Formatter syntax: extensions = command',
	});
	expect(parseFormatterEdit('ts = {}')).toEqual({
		ok: false,
		error: 'Formatter needs a program',
	});
});

test('settings can add a formatter command', async () => {
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }));
	await runCommand(t, 'Settings');
	await gotoRow(t, 'Add/update formatter');
	await press(t, (input) => input.pressEnter());
	await press(t, (input) => void input.typeText('ts,tsx = prettier --write'));
	await press(t, (input) => input.pressEnter());

	expect(saved().formatters).toEqual({ 'ts,tsx': ['prettier', '--write'] });
	expect(t.captureCharFrame()).toContain('1 configured');
});

test('settings stores formatter extensions without dots', async () => {
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }));
	await runCommand(t, 'Settings');
	await gotoRow(t, 'Add/update formatter');
	await press(t, (input) => input.pressEnter());
	await press(t, (input) => void input.typeText('.JS, .jsx = oxfmt'));
	await press(t, (input) => input.pressEnter());

	expect(saved().formatters).toEqual({ 'js,jsx': ['oxfmt'] });
});

test('settings can remove a formatter command', async () => {
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {
		formatters: { ts: ['prettier', '--write'] },
	});
	await runCommand(t, 'Settings');
	await gotoRow(t, 'Add/update formatter');
	await press(t, (input) => input.pressEnter());
	await press(t, (input) => void input.typeText('ts ='));
	await press(t, (input) => input.pressEnter());

	expect(saved().formatters).toEqual({});
	expect(t.captureCharFrame()).toContain('0 configured');
});

test('bad formatter syntax warns and changes nothing', async () => {
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }));
	await runCommand(t, 'Settings');
	await gotoRow(t, 'Add/update formatter');
	await press(t, (input) => input.pressEnter());
	await press(t, (input) => void input.typeText('prettier --write'));
	await press(t, (input) => input.pressEnter());

	const formatters = existsSync(CONFIG_FILE) ? (saved().formatters ?? {}) : {};
	expect(formatters).not.toHaveProperty('prettier --write');
	expect(t.captureCharFrame()).toContain('0 configured');
});

test('settings can edit the TypeScript SDK path', async () => {
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }));
	await runCommand(t, 'Settings');
	await gotoRow(t, 'TypeScript SDK');
	await press(t, (input) => input.pressEnter());
	await press(t, (input) => void input.typeText('/workspace/typescript/lib'));
	await press(t, (input) => input.pressEnter());

	expect(saved().typescriptTsdk).toBe('/workspace/typescript/lib');
	expect(t.captureCharFrame()).toContain('/workspace/typescript/lib');
});

test('settings can add, disable and remove an LSP override', async () => {
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }));
	await runCommand(t, 'Settings');
	await gotoRow(t, 'Add/update language server');
	await press(t, (input) => input.pressEnter());
	await press(t, (input) => void input.typeText('typescript = deno lsp'));
	await press(t, (input) => input.pressEnter());

	expect(saved().lspServers).toEqual({ typescript: ['deno', 'lsp'] });
	expect(t.captureCharFrame()).toContain('1 overridden');

	await gotoRow(t, 'Add/update language server');
	await press(t, (input) => input.pressEnter());
	await press(t, (input) => void input.typeText('typescript = none'));
	await press(t, (input) => input.pressEnter());

	expect(saved().lspServers).toEqual({ typescript: [] });

	await gotoRow(t, 'Add/update language server');
	await press(t, (input) => input.pressEnter());
	await press(t, (input) => void input.typeText('typescript ='));
	await press(t, (input) => input.pressEnter());

	expect(saved().lspServers).toEqual({});
	expect(t.captureCharFrame()).toContain('0 overridden');
});
