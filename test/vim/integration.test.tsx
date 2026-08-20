import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEFAULTS } from '../../src/core/config';
import { fixture, launch, press, pressEscape, settle } from '../helpers';
import type { Harness } from '../helpers';
import { at, save, type, vimEditor } from './helpers';

const visibleLines = (t: Harness) =>
	t
		.captureCharFrame()
		.split('\n')
		.flatMap((row) => row.match(/line \d+/) ?? []);

describe('living with the rest of the editor', () => {
	test('Ctrl+D and Ctrl+U move a screenful', async () => {
		const long = `${Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n')}\n`;
		const { t } = await vimEditor(long);
		await press(t, (i) => i.pressKey('d', { ctrl: true }));
		await settle(t);
		expect(at(t)).toBe('Ln 11, Col 1');
		await press(t, (i) => i.pressKey('u', { ctrl: true }));
		await settle(t);
		expect(at(t)).toBe('Ln 1, Col 1');
	});

	test('u undoes a whole insert burst, not one character', async () => {
		const { t, file } = await vimEditor();
		await type(t, 'i');
		await type(t, 'XYZ');
		await pressEscape(t);
		expect(await save(t, file)).toBe('XYZone\ntwo\nthree\n');
		await type(t, 'u');
		expect(await save(t, file)).toBe('one\ntwo\nthree\n');
	});

	test('Ctrl+C, Ctrl+X and Ctrl+V still work in normal mode', async () => {
		const { t, file } = await vimEditor('abcdef\n');
		await type(t, 'vll');
		await press(t, (i) => i.pressKey('c', { ctrl: true }));
		await pressEscape(t);
		await type(t, '$');
		await type(t, 'i');
		await press(t, (i) => i.pressKey('v', { ctrl: true }));
		await settle(t);
		expect(await save(t, file)).toBe('abcdeabcf\n');
	});

	test('Esc in normal mode hands the keyboard to the tree', async () => {
		const { t } = await vimEditor();
		await pressEscape(t);
		// `d` in the tree is delete, which asks first — that is how we know focus moved.
		await type(t, 'd');
		expect(t.captureCharFrame()).toContain('Delete');
	});

	test('switching files starts the new one in normal mode', async () => {
		const dir = fixture({ 'a.ts': 'aaa\n', 'b.ts': 'bbb\n' });
		const t = await launch(dir, { ...DEFAULTS, vim: true });
		await press(t, (i) => i.pressArrow('down'));
		await press(t, (i) => i.pressEnter());
		await type(t, 'i');
		expect(t.captureCharFrame()).toContain('INSERT');

		await press(t, (i) => i.pressKey('o', { ctrl: true }));
		await press(t, (i) => void i.typeText('b.ts'));
		await press(t, (i) => i.pressEnter());
		await settle(t);
		expect(t.captureCharFrame()).toContain('NORMAL');

		// …and the keys are commands again, not text: x deleted a character.
		await type(t, 'x');
		expect(t.captureCharFrame()).not.toContain('bbb');
	});

	test('with vim off the same keys type', async () => {
		const dir = fixture({ 'a.ts': 'one\n' });
		const t = await launch(dir, { ...DEFAULTS, vim: false });
		await press(t, (i) => i.pressArrow('down'));
		await press(t, (i) => i.pressEnter());
		await type(t, 'dd');
		await press(t, (i) => i.pressKey('s', { ctrl: true }));
		await settle(t);
		expect(readFileSync(join(dir, 'a.ts'), 'utf8')).toBe('ddone\n');
	});

	test('zz puts the cursor line in the middle of the window', async () => {
		const long = `${Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n')}\n`;
		const { t } = await vimEditor(long);
		await type(t, '100G');
		expect(at(t)).toBe('Ln 100, Col 1');
		const before = visibleLines(t);
		expect(before).toContain('line 99');
		expect(before[0]).not.toBe('line 90');

		await type(t, 'zz');
		expect(at(t)).toBe('Ln 100, Col 1');
		const after = visibleLines(t);
		expect(after[0]).toBe('line 90');
		const middle = after.indexOf('line 99');
		expect(Math.abs(middle - Math.floor(after.length / 2))).toBeLessThanOrEqual(1);
	});

	test('a count with zz jumps to that line and centers it', async () => {
		const long = `${Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n')}\n`;
		const { t } = await vimEditor(long);
		await type(t, '50zz');
		expect(at(t)).toBe('Ln 50, Col 1');
		const lines = visibleLines(t);
		expect(lines[0]).toBe('line 40');
		expect(lines).toContain('line 49');
	});

	test('zz recenters with a selection live and keeps the selection', async () => {
		const long = `${Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n')}\n`;
		const { t, file } = await vimEditor(long);
		await type(t, '100G');
		await type(t, 'vjj');
		await type(t, 'zz');
		expect(visibleLines(t)[0]).toBe('line 92');
		await type(t, 'd');
		expect(await save(t, file)).toContain('line 98\nine 101\n');
	});

	test('zz near the top of the file scrolls nothing and moves no caret', async () => {
		const long = `${Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n')}\n`;
		const { t } = await vimEditor(long);
		await type(t, 'gg');
		const before = visibleLines(t);
		await type(t, 'zz');
		expect(at(t)).toBe('Ln 1, Col 1');
		expect(visibleLines(t)).toEqual(before);
	});
});
