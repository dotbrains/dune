import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONFIG_FILE } from '../src/core/config';
import { fixture, launch, press, runCommand } from './helpers';

const project = (settings: Record<string, unknown> | string) =>
	fixture({
		'a.ts': 'const a = 1\n',
		'.dune/settings.json': typeof settings === 'string' ? settings : JSON.stringify(settings),
	});

const localSettings = (dir: string) =>
	JSON.parse(readFileSync(join(dir, '.dune', 'settings.json'), 'utf8'));

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

	const frame = t.captureCharFrame();
	expect(frame).toContain('Vim mode');
	expect(frame).toContain('Vim mode');
	const row = frame.split('\n').find((line) => line.includes('Tab size'))!;
	expect(row).toContain('8');

	const broken = await launch(project('{ nope'), { showDotfiles: false });
	expect(broken.captureCharFrame()).not.toContain('.dune');
});

test('the project settings command writes only project overrides', async () => {
	const dir = project({});
	const t = await launch(dir);
	await runCommand(t, 'Settings: this project');
	await press(t, (input) => input.pressArrow('down'));
	await press(t, (input) => input.pressArrow('down'));
	await press(t, (input) => input.pressArrow('down'));
	await press(t, (input) => input.pressEnter());

	expect(localSettings(dir)).toEqual({ vim: true });
	expect(existsSync(CONFIG_FILE)).toBe(false);
});
