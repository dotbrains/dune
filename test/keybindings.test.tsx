import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONFIG_FILE } from '../src/core/config';
import {
	bindingProblem,
	formatChord,
	matchesChord,
	parseChord,
	parseKeybindingEdit,
} from '../src/core/keybindings';
import { ALT } from '../src/ui/keys';
import { fixture, launch, press, runCommand } from './helpers';
import type { Harness } from './helpers';

const F2 = '\u001BOQ';
const saved = () => JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));

async function gotoRow(t: Harness, label: string) {
	for (let step = 0; step < 40; step++) {
		const row = t
			.captureCharFrame()
			.split('\n')
			.find((line) => line.includes(label));
		if (row?.includes('▌')) return;
		await press(t, (input) => input.pressArrow('down'));
	}
	throw new Error(`row not reached: ${label}`);
}

test('custom shortcut parsing accepts terminal-friendly spellings', () => {
	expect(parseChord('Ctrl+Alt+O')).toEqual({ ctrl: true, alt: true, key: 'o' });
	expect(parseChord('F2')).toEqual({ ctrl: false, alt: false, key: 'f2' });
	expect(parseChord('Ctrl+Opt+PgDn')).toEqual({ ctrl: true, alt: true, key: 'pagedown' });
	expect(parseChord('Ctrl+Nope')).toBeNull();
	expect(formatChord(parseChord('Ctrl+Alt+PgDn')!, ALT)).toBe(`Ctrl+${ALT}+PgDn`);
	expect(parseKeybindingEdit('open = Ctrl+Alt+O')).toEqual({
		ok: true,
		command: 'open',
		shortcut: 'Ctrl+Alt+O',
	});
	expect(parseKeybindingEdit('open =')).toEqual({ ok: true, command: 'open', shortcut: null });
	expect(parseKeybindingEdit('open Ctrl+Alt+O')).toEqual({
		ok: false,
		error: 'Shortcut syntax: command = key',
	});
});

test('custom shortcut validation rejects text input and reserved control bytes', () => {
	expect(bindingProblem(parseChord('O')!)).toBe('A shortcut needs Ctrl or a function key');
	expect(bindingProblem(parseChord('Ctrl+C')!)).toBe('Reserved terminal chord');
	expect(bindingProblem(parseChord('Ctrl+Alt+O')!)).toBeNull();
});

test('custom shortcut matching treats terminal secondary modifiers alike', () => {
	const chord = parseChord('Ctrl+Alt+O')!;
	expect(matchesChord(chord, { name: 'o', ctrl: true, meta: true } as never)).toBe(true);
	expect(matchesChord(chord, { name: 'o', ctrl: true, option: true } as never)).toBe(true);
	expect(matchesChord(chord, { name: 'o', ctrl: true } as never)).toBe(false);
});

test('a configured shortcut opens the file picker', async () => {
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {
		keybindings: { open: 'Ctrl+Alt+O' },
	});

	await press(t, (input) => input.pressKey('o', { ctrl: true, meta: true }));

	expect(t.captureCharFrame()).toContain('Open file');
});

test('a configured save shortcut writes the active file', async () => {
	const dir = fixture({ 'a.ts': 'const a = 1\n' });
	const t = await launch(dir, { keybindings: { save: 'F2' } });
	await press(t, (input) => input.pressArrow('down'));
	await press(t, (input) => input.pressEnter());
	await press(t, (input) => void input.typeText('// custom\n'));
	await press(t, (input) => void input.pressKeys([F2]));

	expect(await Bun.file(join(dir, 'a.ts')).text()).toContain('// custom');
});

test('settings can add and remove a shortcut', async () => {
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }));
	await runCommand(t, 'Settings');
	await gotoRow(t, 'Add/update shortcut');
	await press(t, (input) => input.pressEnter());
	await press(t, (input) => void input.typeText('open = Ctrl+Alt+O'));
	await press(t, (input) => input.pressEnter());

	expect(saved().keybindings).toEqual({ open: `Ctrl+${ALT}+O` });
	expect(t.captureCharFrame()).toContain('1 custom');

	await gotoRow(t, 'Add/update shortcut');
	await press(t, (input) => input.pressEnter());
	await press(t, (input) => void input.typeText('open ='));
	await press(t, (input) => input.pressEnter());

	expect(saved().keybindings).toEqual({});
	expect(t.captureCharFrame()).toContain('0 custom');
});

test('settings rejects an invalid shortcut edit', async () => {
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }));
	await runCommand(t, 'Settings');
	await gotoRow(t, 'Add/update shortcut');
	await press(t, (input) => input.pressEnter());
	await press(t, (input) => void input.typeText('save = Ctrl+C'));
	await press(t, (input) => input.pressEnter());

	const keybindings = existsSync(CONFIG_FILE) ? (saved().keybindings ?? {}) : {};
	expect(keybindings).toEqual({});
	expect(t.captureCharFrame()).toContain('0 custom');
});
