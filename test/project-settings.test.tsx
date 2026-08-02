import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONFIG_FILE, loadProjectConfig } from '../src/core/config';
import { fixture, launch, press, pressEscape, runCommand } from './helpers';
import type { Harness } from './helpers';

const project = (settings: Record<string, unknown> | string) =>
	fixture({
		'a.ts': 'const a = 1\n',
		'.dune/settings.json': typeof settings === 'string' ? settings : JSON.stringify(settings),
	});

const localSettings = (dir: string) =>
	JSON.parse(readFileSync(join(dir, '.dune', 'settings.json'), 'utf8'));

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

test('project settings override user settings at launch', async () => {
	const hidden = await launch(project({ showDotfiles: false }), { showDotfiles: true });
	expect(hidden.captureCharFrame()).toContain('a.ts');
	expect(hidden.captureCharFrame()).not.toContain('.dune');

	const shown = await launch(project({}), { showDotfiles: true });
	expect(shown.captureCharFrame()).toContain('.dune');

	const vim = await launch(project({ vim: true }), { vim: false });
	await press(vim, (input) => input.pressArrow('down'));
	await press(vim, (input) => input.pressArrow('down'));
	await press(vim, (input) => input.pressEnter());
	expect(vim.captureCharFrame()).toContain('NORMAL');
});

test('invalid project settings are ignored', async () => {
	const t = await launch(project({ tabSize: 'huge', vim: true }), { tabSize: 8 });
	await runCommand(t, 'Settings: this project');

	expect(t.captureCharFrame()).toContain('Vim mode');
	await press(t, (input) => void input.typeText('/'));
	await press(t, (input) => void input.typeText('tab'));
	const frame = t.captureCharFrame();
	const row = frame.split('\n').find((line) => line.includes('Tab size'))!;
	expect(row).toContain('8');

	const broken = await launch(project('{ nope'), { showDotfiles: false });
	expect(broken.captureCharFrame()).not.toContain('.dune');
});

test('project settings can override the appearance plugin registry', async () => {
	const dir = project({ pluginRegistry: 'https://example.test/plugins' });
	expect(loadProjectConfig(dir)).toEqual({
		pluginRegistry: 'https://example.test/plugins',
	});
});

test('the project settings command writes only project overrides', async () => {
	const dir = project({});
	const t = await launch(dir);
	await runCommand(t, 'Settings: this project');
	await gotoRow(t, 'Vim mode');
	await press(t, (input) => input.pressEnter());

	expect(localSettings(dir)).toEqual({ vim: true });
	expect(existsSync(CONFIG_FILE)).toBe(false);
});

test('settings rows can be filtered before changing one', async () => {
	const dir = project({});
	const t = await launch(dir);
	await runCommand(t, 'Settings: this project');

	await press(t, (input) => void input.typeText('/'));
	await press(t, (input) => void input.typeText('vim'));
	let frame = t.captureCharFrame();
	expect(frame).toContain('vim');
	expect(frame).toContain('Type to filter');
	expect(frame).toContain('Vim mode');
	expect(frame).not.toContain('Tab size');

	await press(t, (input) => input.pressEnter());
	expect(localSettings(dir)).toEqual({ vim: true });

	await press(t, (input) => void input.typeText('/zzzz'));
	frame = t.captureCharFrame();
	expect(frame).toContain('No matching settings');
	await pressEscape(t);
	expect(t.captureCharFrame()).toContain('Vim mode');
	await pressEscape(t);
	expect(t.captureCharFrame()).not.toContain('Filter settings');
});
