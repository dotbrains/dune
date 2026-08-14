import { describe, expect, test } from 'bun:test';
import type { KeyEvent } from '@opentui/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { capsChar, latinKey, matchesChord, parseChord } from '../src/core/keybindings';
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

/**
 * A caps-locked key as the kitty protocol reports it without the associated-text
 * flag: the key's own codepoint, and the lock as a modifier bit (64, sent one-based
 * alongside Shift's 1). The mock input has no Caps Lock of its own, so the raw
 * sequence goes in as bytes, the same way it would arrive from a real terminal.
 */
function capsKey(char: string, shift = false): string {
	const mods = 1 + 64 + (shift ? 1 : 0);
	return `[${char.codePointAt(0)};${mods}u`;
}

describe('Caps Lock', () => {
	test('locks a letter and is reversed by Shift', () => {
		expect(capsChar('a', false)).toBe('A');
		expect(capsChar('a', true)).toBe('a');
		// Already uppercase: a terminal that did report the text changes nothing here.
		expect(capsChar('A', false)).toBe('A');
		expect(capsChar('ф', false)).toBe('Ф');
	});

	test('leaves everything that is not a letter alone', () => {
		expect(capsChar('1', false)).toBe('1');
		expect(capsChar('!', true)).toBe('!');
		expect(capsChar('', false)).toBe('');
	});

	test('typing with the lock on types uppercase', async () => {
		const t = await launch(fixture({ 'a.ts': 'x\n' }), {}, {}, { kittyKeyboard: true });
		await openFile(t, 'a.ts');
		await press(t, (input) => void input.pressKeys([capsKey('a')]));
		await press(t, (input) => void input.pressKeys([capsKey('b', true)]));
		expect(t.captureCharFrame()).toContain('Ab');
	});

	test("a tree command's bare letter still runs, lock or not", async () => {
		const t = await launch(fixture({ 'a.ts': 'x\n' }));
		await press(t, (input) => input.pressArrow('down'));
		await press(t, (input) => void input.pressKeys([capsKey('r')]));
		await settle(t);
		expect(t.captureCharFrame()).toContain('Rename to');
	});
});
