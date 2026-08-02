import { expect, test } from 'bun:test';
import type { KeyEvent } from '@opentui/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { latinKey, matchesChord, parseChord } from '../src/core/keybindings';
import { fixture, launch, openFile, press, settle } from './helpers';

const key = (event: Partial<KeyEvent>): KeyEvent =>
	({
		name: '',
		ctrl: false,
		meta: false,
		shift: false,
		option: false,
		sequence: '',
		number: false,
		raw: '',
		eventType: 'press',
		source: 'kitty',
		preventDefault: () => {},
		stopPropagation: () => {},
		defaultPrevented: false,
		propagationStopped: false,
		...event,
	}) as KeyEvent;

test('Kitty base codes name the physical Latin key', () => {
	expect(latinKey(key({ name: 'ф', baseCode: 83 }))).toBe('s');
	expect(latinKey(key({ name: 'α', baseCode: 65 }))).toBe('a');
	expect(latinKey(key({ name: 'a' }))).toBe('a');
	expect(latinKey(key({ name: 'A' }))).toBe('a');
});

test('known Cyrillic layout keys match their Latin shortcuts', () => {
	expect(latinKey(key({ name: 'ф' }))).toBe('a');
	expect(latinKey(key({ name: 'і' }))).toBe('s');
	expect(latinKey(key({ name: 'ы' }))).toBe('s');
	expect(latinKey(key({ name: 'Ф' }))).toBe('a');
});

test('custom shortcuts use the normalized key name', () => {
	const chord = parseChord('Ctrl+S');
	expect(chord).not.toBeNull();
	expect(matchesChord(chord!, key({ name: 'і', ctrl: true }))).toBe(true);
	expect(matchesChord(chord!, key({ name: 'α', ctrl: true, baseCode: 83 }))).toBe(true);
});

test('built-in shortcuts use non-Latin physical keys', async () => {
	const dir = fixture({ 'a.ts': 'const a = 1\n' });
	const t = await launch(dir, {}, {}, { kittyKeyboard: true });
	await openFile(t, 'a.ts');
	await press(t, (input) => input.pressKey('x'));
	await press(t, (input) => input.pressKey('і', { ctrl: true }));
	await settle(t, 100);
	expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toContain('x');
});

test('plain non-Latin keys still type their character', async () => {
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {}, {}, { kittyKeyboard: true });
	await openFile(t, 'a.ts');
	await press(t, (input) => input.pressKey('ф'));
	expect(t.captureCharFrame()).toContain('ф');
});
