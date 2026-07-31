import { expect, test } from 'bun:test';

import { fixture, launch, openFile, press, runCommand } from '../helpers';
import type { Harness } from '../helpers';

const ESC = String.fromCharCode(27);
const BACK = `${ESC}${String.fromCharCode(26)}`;
const FORWARD = `${ESC}${String.fromCharCode(25)}`;

const PROJECT = {
	'a.ts': 'const one = 1\nconst two = 2\nconst three = 3\nconst four = 4\n',
	'b.ts': 'const b = 2\n',
};

const bar = (t: Harness) => t.captureCharFrame().split('\n').at(-2) ?? '';

test('back and forward walk files the editor has visited', async () => {
	const t = await launch(fixture(PROJECT));
	await openFile(t, 'a.ts');
	await openFile(t, 'b.ts');
	expect(t.captureCharFrame()).toContain('const b = 2');

	await press(t, (input) => void input.pressKeys([BACK]));
	expect(t.captureCharFrame()).toContain('const one = 1');

	await press(t, (input) => void input.pressKeys([FORWARD]));
	expect(t.captureCharFrame()).toContain('const b = 2');
});

test('going back lands on the line the file was left at', async () => {
	const t = await launch(fixture(PROJECT));
	await openFile(t, 'a.ts');
	for (let n = 0; n < 3; n++) await press(t, (input) => input.pressArrow('down'));
	expect(bar(t)).toContain('Ln 4');

	await openFile(t, 'b.ts');
	await press(t, (input) => void input.pressKeys([BACK]));

	expect(t.captureCharFrame()).toContain('const one = 1');
	expect(bar(t)).toContain('Ln 4');
});

test('go to line creates a same-file navigation stop', async () => {
	const t = await launch(fixture(PROJECT));
	await openFile(t, 'a.ts');
	await runCommand(t, 'Go to line');
	await press(t, (input) => void input.typeText('4'));
	await press(t, (input) => input.pressEnter());
	expect(bar(t)).toContain('Ln 4');

	await press(t, (input) => void input.pressKeys([BACK]));
	expect(bar(t)).toContain('Ln 1');
});

test('the tab strip arrows use the same navigation history', async () => {
	const t = await launch(fixture(PROJECT));
	await openFile(t, 'a.ts');
	await openFile(t, 'b.ts');

	const back = t.captureCharFrame().split('\n')[0]!.lastIndexOf('‹');
	expect(back).toBeGreaterThan(-1);
	await t.mockMouse.click(back, 0);
	await t.flush();
	expect(t.captureCharFrame()).toContain('const one = 1');

	const forward = t.captureCharFrame().split('\n')[0]!.lastIndexOf('›');
	expect(forward).toBeGreaterThan(-1);
	await t.mockMouse.click(forward, 0);
	await t.flush();
	expect(t.captureCharFrame()).toContain('const b = 2');
});

test('with nowhere to go the keys say so', async () => {
	const t = await launch(fixture(PROJECT));
	await openFile(t, 'a.ts');

	await press(t, (input) => void input.pressKeys([BACK]));
	expect(bar(t)).toContain('Nothing to go back to');

	await press(t, (input) => void input.pressKeys([FORWARD]));
	expect(bar(t)).toContain('Nothing to go forward to');
});
