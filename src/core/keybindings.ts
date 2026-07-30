import type { KeyEvent } from '@opentui/core';

export interface Chord {
	ctrl: boolean;
	alt: boolean;
	key: string;
}

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

const secondary = (key: KeyEvent) => Boolean(key.option || key.meta || key.shift);

export function matchesChord(chord: Chord, key: KeyEvent): boolean {
	const name = key.name === 'enter' ? 'return' : key.name;
	return name === chord.key && Boolean(key.ctrl) === chord.ctrl && secondary(key) === chord.alt;
}
