import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { APPEARANCE_ENV, detectAppearance, watchAppearance } from '../src/core/appearance';
import { CONFIG_FILE, DEFAULTS, resolvedTheme } from '../src/core/config';
import { fixture, launch, press, runCommand, settle, until } from './helpers';

afterEach(() => {
	delete process.env[APPEARANCE_ENV];
});

test('theme sync defaults to the GitHub light and dark pair', () => {
	expect(DEFAULTS.themeSync).toBe(true);
	expect(DEFAULTS.themeLight).toBe('light');
	expect(DEFAULTS.themeDark).toBe('dark');
	expect(resolvedTheme({ ...DEFAULTS, theme: 'nord' }, 'dark')).toBe('dark');
	expect(resolvedTheme({ ...DEFAULTS, theme: 'nord' }, 'light')).toBe('light');
	expect(resolvedTheme({ ...DEFAULTS, themeSync: false, theme: 'nord' }, 'light')).toBe('nord');
});

test('the env override decides the appearance', () => {
	process.env[APPEARANCE_ENV] = 'light';
	expect(detectAppearance()).toBe('light');
	process.env[APPEARANCE_ENV] = 'Dark';
	expect(detectAppearance()).toBe('dark');
	process.env[APPEARANCE_ENV] = 'nope';
	expect(detectAppearance()).not.toBe('nope');
});

test('the watcher reports appearance changes', async () => {
	process.env[APPEARANCE_ENV] = 'light';
	const seen: string[] = [];
	const stop = watchAppearance((appearance) => seen.push(appearance), 5);
	expect(seen).toEqual(['light']);

	process.env[APPEARANCE_ENV] = 'dark';
	for (let i = 0; seen.length < 2 && i < 50; i++) {
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
	stop();
	expect(seen).toEqual(['light', 'dark']);
});

test('sync follows the configured OS slot', async () => {
	process.env[APPEARANCE_ENV] = 'dark';
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {
		themeSync: true,
		theme: 'nord',
		themeDark: 'tokyo-night',
		themeLight: 'light',
	});
	await runCommand(t, 'Settings');
	expect(t.captureCharFrame()).toContain('Tokyo Night');

	process.env[APPEARANCE_ENV] = 'light';
	await until(t, () => t.captureCharFrame().includes('GitHub Light'), 100);
});

test('picking a theme by hand turns sync off', async () => {
	process.env[APPEARANCE_ENV] = 'dark';
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {
		themeSync: true,
		themeDark: 'tokyo-night',
	});

	await runCommand(t, 'Dracula');
	await settle(t, 20);

	expect(t.captureCharFrame()).toContain('Dracula');
	expect(t.captureCharFrame()).not.toContain('Following OS appearance');
	expect(JSON.parse(readFileSync(CONFIG_FILE, 'utf8')).themeSync).toBe(false);

	await runCommand(t, 'Settings');
	const row = t
		.captureCharFrame()
		.split('\n')
		.find((line) => line.includes('Follow OS appearance'))!;
	expect(row).toContain('off');
});

test('the settings page turns sync on and applies the matching slot', async () => {
	process.env[APPEARANCE_ENV] = 'light';
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {
		themeSync: false,
		theme: 'nord',
		themeLight: 'solarized-light',
	});
	await runCommand(t, 'Settings');
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());

	expect(t.captureCharFrame()).toContain('Solarized Light');
	const row = t
		.captureCharFrame()
		.split('\n')
		.find((line) => line.includes('Follow OS appearance'))!;
	expect(row).toContain('on');
});

test('the settings page edits the light and dark theme slots', async () => {
	process.env[APPEARANCE_ENV] = 'dark';
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {
		themeSync: true,
		themeDark: 'dark',
		themeLight: 'light',
	});
	await runCommand(t, 'Settings');

	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	expect(t.captureCharFrame()).toContain('0x96f');

	await press(t, (i) => i.pressArrow('down'));
	await press(t, (i) => i.pressEnter());
	expect(t.captureCharFrame()).toContain('GitHub Light');

	const saved = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
	expect(saved.themeLight).toBe('0x96f');
	expect(saved.themeDark).toBe('light');
});
