import type { KeyEvent } from '@opentui/core';

export interface Chord {
	ctrl: boolean;
	alt: boolean;
	key: string;
}

export type KeybindingEdit =
	| { ok: true; command: string; shortcut: string | null }
	| { ok: false; error: string };

const MODIFIERS: Record<string, 'ctrl' | 'alt'> = {
	ctrl: 'ctrl',
	control: 'ctrl',
	alt: 'alt',
	opt: 'alt',
	option: 'alt',
	meta: 'alt',
	cmd: 'alt',
	command: 'alt',
	shift: 'alt',
};

const ALIASES: Record<string, string> = {
	'←': 'left',
	'→': 'right',
	'↑': 'up',
	'↓': 'down',
	arrowleft: 'left',
	arrowright: 'right',
	arrowup: 'up',
	arrowdown: 'down',
	esc: 'escape',
	enter: 'return',
	ret: 'return',
	pgup: 'pageup',
	pgdn: 'pagedown',
	pgdown: 'pagedown',
	del: 'delete',
	bksp: 'backspace',
	backsp: 'backspace',
	spc: 'space',
};

const FUNCTION_KEY = /^f([1-9]|1[0-2])$/;
const DISPLAY: Record<string, string> = {
	left: '←',
	right: '→',
	up: '↑',
	down: '↓',
	pageup: 'PgUp',
	pagedown: 'PgDn',
	home: 'Home',
	end: 'End',
	tab: 'Tab',
	space: 'Space',
	return: 'Enter',
	escape: 'Esc',
	backspace: 'Bksp',
	delete: 'Del',
	insert: 'Ins',
};
const NAMED = new Set([
	'left',
	'right',
	'up',
	'down',
	'pageup',
	'pagedown',
	'home',
	'end',
	'tab',
	'space',
	'return',
	'escape',
	'backspace',
	'delete',
	'insert',
]);

const RESERVED_CTRL = new Set(['c', 'i', 'm', 'j', 'h', '[']);

const keyName = (key: string) =>
	NAMED.has(key) || FUNCTION_KEY.test(key) || (key.length === 1 && key >= '!' && key <= '~');

export function parseChord(spelling: string): Chord | null {
	const parts = spelling
		.split('+')
		.map((part) => part.trim())
		.filter(Boolean);
	if (parts.length === 0) return null;
	const chord: Chord = { ctrl: false, alt: false, key: '' };
	for (const [index, part] of parts.entries()) {
		const lower = part.toLowerCase();
		const last = index === parts.length - 1;
		const modifier = MODIFIERS[lower];
		if (modifier && !last) {
			chord[modifier] = true;
			continue;
		}
		if (!last) return null;
		const key = ALIASES[lower] ?? lower;
		if (!keyName(key)) return null;
		chord.key = key;
	}
	return chord.key ? chord : null;
}

export function bindingProblem(chord: Chord): string | null {
	if (!chord.ctrl && !FUNCTION_KEY.test(chord.key))
		return 'A shortcut needs Ctrl or a function key';
	if (chord.ctrl && !chord.alt && RESERVED_CTRL.has(chord.key)) return 'Reserved terminal chord';
	return null;
}

export function isDisabledShortcut(spelling: string): boolean {
	return spelling.trim().toLowerCase() === 'none';
}

export function formatChord(chord: Chord, altLabel: string): string {
	const key =
		DISPLAY[chord.key] ?? (FUNCTION_KEY.test(chord.key) ? chord.key.toUpperCase() : chord.key);
	return [
		...(chord.ctrl ? ['Ctrl'] : []),
		...(chord.alt ? [altLabel] : []),
		key.length === 1 ? key.toUpperCase() : key,
	].join('+');
}

export function chordId(chord: Chord): string {
	return `${chord.ctrl ? 'c' : ''}${chord.alt ? 'a' : ''}:${chord.key}`;
}

export function parseKeybindingEdit(input: string): KeybindingEdit {
	const at = input.indexOf('=');
	if (at < 0) return { ok: false, error: 'Shortcut syntax: command = key' };
	const command = input.slice(0, at).trim();
	if (!command) return { ok: false, error: 'Shortcut needs a command' };
	const shortcut = input.slice(at + 1).trim();
	return { ok: true, command, shortcut: shortcut || null };
}

const secondary = (key: KeyEvent) => Boolean(key.option || key.meta || key.shift);

export function matchesChord(chord: Chord, key: KeyEvent): boolean {
	const name = key.name === 'enter' ? 'return' : key.name;
	return name === chord.key && Boolean(key.ctrl) === chord.ctrl && secondary(key) === chord.alt;
}
