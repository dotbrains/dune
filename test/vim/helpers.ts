import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEFAULTS } from '../../src/core/config';
import { fixture, launch, press, settle } from '../helpers';
import type { Harness } from '../helpers';

export async function vimEditor(content = 'one\ntwo\nthree\n') {
	const dir = fixture({ 'a.ts': content });
	const t = await launch(dir, { ...DEFAULTS, vim: true });
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	return { t, dir, file: join(dir, 'a.ts') };
}

export const type = async (t: Harness, text: string) => {
	await press(t, (i) => void i.typeText(text));
	await settle(t);
};

export async function save(t: Harness, file: string) {
	await press(t, (i) => i.pressKey('s', { ctrl: true }));
	await settle(t);
	return readFileSync(file, 'utf8');
}

/** "Ln 2, Col 3" from the status bar. */
export const at = (t: Harness) => /Ln (\d+), Col (\d+)/.exec(t.captureCharFrame())?.[0] ?? '?';
