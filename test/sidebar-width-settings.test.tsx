import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

import { CONFIG_FILE } from '../src/core/config';
import { fixture, launch, press, runCommand } from './helpers';
import type { Harness } from './helpers';

const saved = () => (existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) : {});

async function gotoRow(t: Harness, label: string) {
	for (let step = 0; step < 30; step++) {
		const row = t
			.captureCharFrame()
			.split('\n')
			.find((line) => line.includes(label));
		if (row?.includes('▌')) return;
		await press(t, (input) => input.pressArrow('down'));
	}
	throw new Error(`row not reached: ${label}`);
}

test('settings can pin and restore sidebar width', async () => {
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }));
	await runCommand(t, 'Settings');
	await gotoRow(t, 'Sidebar width');
	await press(t, (input) => input.pressEnter());
	await press(t, (input) => void input.typeText('40'));
	await press(t, (input) => input.pressEnter());

	expect(saved().sidebarWidth).toBe(40);
	expect(t.captureCharFrame()).toContain('40');

	await gotoRow(t, 'Sidebar width');
	await press(t, (input) => input.pressEnter());
	await press(t, (input) => void input.typeText('auto'));
	await press(t, (input) => input.pressEnter());

	expect(saved().sidebarWidth).toBe('auto');
	expect(t.captureCharFrame()).toContain('auto');
});

test('settings rejects sidebar widths outside the usable range', async () => {
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }));
	await runCommand(t, 'Settings');
	await gotoRow(t, 'Sidebar width');
	await press(t, (input) => input.pressEnter());
	await press(t, (input) => void input.typeText('200'));
	await press(t, (input) => input.pressEnter());

	expect(saved().sidebarWidth).not.toBe(200);
	expect(t.captureCharFrame()).toContain('auto');
});
