import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROWS } from '../src/ui/keys';
import { F1, fixture, launch, press, pressEscape, settle } from './helpers';
import type { Harness } from './helpers';

const ESC = String.fromCharCode(27);
const PROJECT = { 'a.ts': 'alpha beta\n', 'b.ts': 'const b = 2\n' };

async function tree() {
	return launch(fixture(PROJECT));
}
async function opened() {
	const t = await tree();
	await press(t, (i) => i.pressKey('o', { ctrl: true }));
	await press(t, (i) => void i.typeText('a.ts'));
	await press(t, (i) => i.pressEnter());
	return t;
}
const frame = (t: Harness) => t.captureCharFrame();

describe('advertised hotkeys', () => {
	const cases: { name: string; run: () => Promise<void> }[] = [
		{
			name: 'Ctrl+P palette',
			run: async () => {
				const t = await tree();
				await press(t, (i) => i.pressKey('p', { ctrl: true }));
				expect(frame(t)).toContain('Commands');
			},
		},
		{
			name: 'F1 palette',
			run: async () => {
				const t = await tree();
				await press(t, (i) => void i.pressKeys([F1]));
				expect(frame(t)).toContain('Commands');
			},
		},
		{
			name: 'Ctrl+Opt+P palette',
			run: async () => {
				const t = await tree();
				await press(t, (i) => void i.pressKeys([`${ESC}${String.fromCharCode(16)}`]));
				expect(frame(t)).toContain('Commands');
			},
		},
		{
			name: 'Ctrl+O file picker',
			run: async () => {
				const t = await tree();
				await press(t, (i) => i.pressKey('o', { ctrl: true }));
				expect(frame(t)).toContain('Open file');
			},
		},
		{
			name: 'Ctrl+G go to line',
			run: async () => {
				const t = await tree();
				await press(t, (i) => i.pressKey('g', { ctrl: true }));
				expect(frame(t)).toContain('Go to line');
			},
		},
		{
			name: 'Ctrl+F find in file',
			run: async () => {
				const t = await opened();
				await press(t, (i) => i.pressKey('f', { ctrl: true }));
				expect(frame(t)).toContain('Search in file');
			},
		},
		{
			name: 'Ctrl+R find in project',
			run: async () => {
				const t = await opened();
				await press(t, (i) => i.pressKey('r', { ctrl: true }));
				expect(frame(t)).toContain('Search in project');
			},
		},
		{
			name: 'Ctrl+N new file',
			run: async () => {
				const t = await tree();
				await press(t, (i) => i.pressKey('n', { ctrl: true }));
				expect(frame(t)).toContain('New file name');
			},
		},
		{
			name: 'Ctrl+Opt+N new folder',
			run: async () => {
				const t = await tree();
				await press(t, (i) => void i.pressKeys([`${ESC}${String.fromCharCode(14)}`]));
				expect(frame(t)).toContain('New folder name');
			},
		},
		{
			name: 'Ctrl+T switch tab',
			run: async () => {
				const t = await opened();
				await press(t, (i) => i.pressKey('t', { ctrl: true }));
				expect(frame(t)).toContain('Switch tab');
			},
		},
		{
			name: 'Ctrl+B sidebar',
			run: async () => {
				const t = await tree();
				await press(t, (i) => i.pressKey('b', { ctrl: true }));
				expect(frame(t)).not.toContain('explorer');
			},
		},
		{
			name: 'Ctrl+W close tab',
			run: async () => {
				const t = await opened();
				await press(t, (i) => i.pressKey('w', { ctrl: true }));
				expect(frame(t)).toContain('no open files');
			},
		},
		{
			name: 'arrow down moves in tree',
			run: async () => {
				const t = await tree();
				await press(t, (i) => i.pressArrow('down'));
				expect(frame(t)).toContain('a.ts');
			},
		},
		{
			name: 'Enter opens file',
			run: async () => {
				const t = await tree();
				await press(t, (i) => i.pressArrow('down'));
				await press(t, (i) => i.pressEnter());
				expect(frame(t)).toContain('alpha beta');
			},
		},
		{
			name: 'a new file in tree',
			run: async () => {
				const t = await tree();
				await press(t, (i) => i.pressArrow('down'));
				await press(t, (i) => void i.typeText('a'));
				expect(frame(t)).toContain('New file name');
			},
		},
		{
			name: 'A new folder in tree',
			run: async () => {
				const t = await tree();
				await press(t, (i) => i.pressArrow('down'));
				await press(t, (i) => void i.typeText('A'));
				expect(frame(t)).toContain('New folder name');
			},
		},
		{
			name: 'r rename in tree',
			run: async () => {
				const t = await tree();
				await press(t, (i) => i.pressArrow('down'));
				await press(t, (i) => void i.typeText('r'));
				expect(frame(t)).toContain('Rename to');
			},
		},
		{
			name: 'd delete in tree',
			run: async () => {
				const t = await tree();
				await press(t, (i) => i.pressArrow('down'));
				await press(t, (i) => void i.typeText('d'));
				expect(frame(t)).toContain('Delete');
			},
		},
		{
			name: 'Esc moves editor focus to tree',
			run: async () => {
				const t = await opened();
				await pressEscape(t);
				await press(t, (i) => i.pressArrow('down'));
				expect(frame(t)).toContain('explorer');
			},
		},
	];

	for (const entry of cases) test(entry.name, entry.run);

	test('Ctrl+X cuts and Ctrl+V pastes when the system clipboard is available', async () => {
		if (process.env.DUNE_TEST_SYSTEM_CLIPBOARD !== '1') return;
		const clipboard = ['pbcopy', 'wl-copy', 'xclip', 'xsel'].some((tool) => Bun.which(tool));
		if (!clipboard) return;

		const dirCut = fixture(PROJECT);
		const t = await launch(dirCut);
		await press(t, (i) => i.pressKey('o', { ctrl: true }));
		await press(t, (i) => void i.typeText('a.ts'));
		await press(t, (i) => i.pressEnter());
		await settle(t);
		const alphaAt = frame(t).split('\n')[1]!.indexOf('alpha');
		await t.mockMouse.drag(alphaAt, 1, alphaAt + 5, 1);
		await t.mockMouse.release(alphaAt + 5, 1);
		await settle(t);
		await press(t, (i) => i.pressKey('x', { ctrl: true }));
		await press(t, (i) => i.pressKey('s', { ctrl: true }));
		const afterCut = readFileSync(join(dirCut, 'a.ts'), 'utf8');
		expect(afterCut.startsWith('alpha')).toBe(false);

		await press(t, (i) => i.pressKey('v', { ctrl: true }));
		await press(t, (i) => i.pressKey('s', { ctrl: true }));
		const afterPaste = readFileSync(join(dirCut, 'a.ts'), 'utf8');
		expect(afterPaste).toContain('alpha');
	});
});

test('the help table does not list one key twice with different meanings', () => {
	const keys = ROWS.map(([key]) => key);
	expect(new Set(keys).size).toBe(keys.length);

	// Ctrl+C both copies and quits; the row has to say so, or it reads as a bug
	// when the editor exits. This is the row that misled once already.
	const copyRow = ROWS.find(([key]) => key.includes('Ctrl+C'))!;
	expect(copyRow[1].toLowerCase()).toContain('quit');
});
