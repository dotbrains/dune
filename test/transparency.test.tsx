import { afterEach, expect, test } from 'bun:test';

import { fixture, launch, press, runCommand } from './helpers';
import type { Harness } from './helpers';
import { setTheme, setTransparency, THEMES, ui } from '../src/themes';

afterEach(() => {
	setTransparency(false);
	setTheme('dark');
});

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

test('transparent background clears the app chrome without changing the palette', () => {
	setTheme('light');
	expect(ui.bg).toBe(THEMES.light.ui.bg);

	setTransparency(true);
	expect(ui.bg).toBe('transparent');
	expect(ui.barBg).toBe('transparent');
	expect(THEMES.light.ui.bg).not.toBe('transparent');

	setTheme('dark');
	expect(ui.bg).toBe('transparent');
});

test('the settings page toggles transparent background', async () => {
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }));
	await runCommand(t, 'Settings');
	await gotoRow(t, 'Transparent background');
	await press(t, (input) => input.pressEnter());

	expect(ui.bg).toBe('transparent');
});
