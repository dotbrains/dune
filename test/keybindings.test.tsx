import { expect, test } from 'bun:test';
import { join } from 'node:path';

import { bindingProblem, matchesChord, parseChord } from '../src/core/keybindings';
import { fixture, launch, press } from './helpers';

const F2 = '\u001BOQ';

test('custom shortcut parsing accepts terminal-friendly spellings', () => {
	expect(parseChord('Ctrl+Alt+O')).toEqual({ ctrl: true, alt: true, key: 'o' });
	expect(parseChord('F2')).toEqual({ ctrl: false, alt: false, key: 'f2' });
	expect(parseChord('Ctrl+Opt+PgDn')).toEqual({ ctrl: true, alt: true, key: 'pagedown' });
	expect(parseChord('Ctrl+Nope')).toBeNull();
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
