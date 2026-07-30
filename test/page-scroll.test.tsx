import { describe, expect, test } from 'bun:test';

import { fixture, launch, press, settle } from './helpers';
import type { Harness } from './helpers';

const PAGE_UP = '\u001B[5~';
const PAGE_DOWN = '\u001B[6~';

const long = `${Array.from({ length: 200 }, (_, index) => `line ${index}`).join('\n')}\n`;

function shown(t: Harness): string[] {
	return t
		.captureCharFrame()
		.split('\n')
		.flatMap((row) => row.match(/line \d+/) ?? []);
}

const first = (t: Harness) => shown(t)[0]!;

async function openLongFile() {
	const t = await launch(fixture({ 'big.ts': long }));
	await press(t, (input) => input.pressKey('o', { ctrl: true }));
	await press(t, (input) => void input.typeText('big.ts'));
	await press(t, (input) => input.pressEnter());
	await settle(t);
	return t;
}

describe('page keys scroll the editor', () => {
	test('PageDown and PageUp walk a viewport at a time', async () => {
		const t = await openLongFile();
		expect(first(t)).toBe('line 0');

		await press(t, (input) => void input.pressKeys([PAGE_DOWN]));
		const top = first(t);
		expect(Number(top.slice(5))).toBeGreaterThan(10);

		await press(t, (input) => void input.pressKeys([PAGE_DOWN]));
		expect(Number(first(t).slice(5))).toBeGreaterThan(Number(top.slice(5)));

		await press(t, (input) => void input.pressKeys([PAGE_UP]));
		expect(first(t)).toBe(top);
		await press(t, (input) => void input.pressKeys([PAGE_UP]));
		expect(first(t)).toBe('line 0');
	});

	test('Ctrl+D and Ctrl+U page the editor without editing', async () => {
		const t = await openLongFile();

		await press(t, (input) => input.pressKey('d', { ctrl: true }));
		expect(first(t)).not.toBe('line 0');

		await press(t, (input) => input.pressKey('u', { ctrl: true }));
		expect(first(t)).toBe('line 0');
		expect(t.captureCharFrame()).not.toContain('●');
	});

	test('paging stops at the end of the file', async () => {
		const t = await openLongFile();

		await press(t, (input) => void input.pressKeys(Array.from({ length: 40 }, () => PAGE_DOWN)));

		expect(shown(t)).toContain('line 199');
	});
});
