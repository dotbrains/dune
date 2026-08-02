import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { USER_THEME_PLUGIN_DIR } from '../../src/core/localThemes';
import { writePlugin } from '../../src/core/market';
import { MARKET_URL } from '../../src/core/market';
import { fixture, launch, press, pressEscape, runCommand, until } from '../helpers';

const testConfigFile = () => join(process.env.XDG_CONFIG_HOME!, 'dune', 'config.json');
const OLD_REGISTRY = 'https://old.example.test/market';

test('the appearance plugins page lists and toggles installed plugins', async () => {
	const manifest = {
		id: 'mono',
		name: 'Mono',
		version: '1.0.0',
		icons: [{ id: 'mono-icons', name: 'Mono Icons', file: 'f', folder: 'd', folderOpen: 'o' }],
	};
	expect(
		writePlugin('mono', {
			ok: true,
			id: 'mono',
			version: '1.0.0',
			body: JSON.stringify(manifest),
		}),
	).toBeNull();

	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }));
	await runCommand(t, 'Plugin manager');
	await until(t, () => {
		const frame = t.captureCharFrame();
		return (
			frame.includes('Appearance plugins') &&
			frame.includes('Disable mono 1.0.0') &&
			frame.includes('icons: mono-icons')
		);
	});
	await press(t, (input) => input.pressEnter());
	await until(t, () => t.captureCharFrame().includes('Appearance plugin mono disabled'));

	await runCommand(t, 'Plugin manager');
	await until(t, () => t.captureCharFrame().includes('Enable mono 1.0.0'));
});

test('the appearance plugins page removes installed plugins with Backspace', async () => {
	const manifest = {
		id: 'mono',
		name: 'Mono',
		version: '1.0.0',
		icons: [{ id: 'mono-icons', name: 'Mono Icons', file: 'f', folder: 'd', folderOpen: 'o' }],
	};
	expect(
		writePlugin('mono', {
			ok: true,
			id: 'mono',
			version: '1.0.0',
			body: JSON.stringify(manifest),
		}),
	).toBeNull();

	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }));
	await runCommand(t, 'Plugin manager');
	await until(t, () => t.captureCharFrame().includes('Disable mono 1.0.0'));
	await press(t, (input) => input.pressBackspace());
	await until(t, () => t.captureCharFrame().includes('Removed appearance plugin mono'));

	expect(existsSync(join(USER_THEME_PLUGIN_DIR, 'mono'))).toBe(false);
});

test('the appearance plugins page reloads plugins from disk', async () => {
	const manifest = {
		id: 'mono',
		name: 'Mono',
		version: '1.0.0',
		icons: [{ id: 'mono-icons', name: 'Mono Icons', file: 'f', folder: 'd', folderOpen: 'o' }],
	};

	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }));
	await runCommand(t, 'Plugin manager');
	await until(t, () => t.captureCharFrame().includes('Reload from disk'));
	expect(t.captureCharFrame()).not.toContain('Update all appearance plugins');
	expect(t.captureCharFrame()).toContain('Reload from disk - ');
	expect(t.captureCharFrame()).toContain('dune/plugins');

	expect(
		writePlugin('mono', {
			ok: true,
			id: 'mono',
			version: '1.0.0',
			body: JSON.stringify(manifest),
		}),
	).toBeNull();

	await press(t, (input) => void input.typeText('Reload'));
	await press(t, (input) => input.pressEnter());
	await until(t, () => t.captureCharFrame().includes('Disable mono 1.0.0'));
});

test('the appearance plugins page installs cached market plugins', async () => {
	const realFetch = globalThis.fetch;
	const manifest = {
		id: 'contrast',
		name: 'Contrast',
		version: '2.0.0',
		icons: [
			{ id: 'contrast-icons', name: 'Contrast Icons', file: 'f', folder: 'd', folderOpen: 'o' },
		],
	};
	globalThis.fetch = ((url: string) =>
		Promise.resolve(
			String(url).endsWith('/contrast/plugin.json')
				? new Response(JSON.stringify(manifest))
				: new Response(
						JSON.stringify({
							plugins: [
								{
									id: 'contrast',
									name: 'Contrast',
									version: '2.0.0',
									description: 'high contrast icons',
								},
							],
						}),
					),
		)) as typeof fetch;
	try {
		const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {
			pluginRegistry: 'https://example.test/market',
		});
		await runCommand(t, 'Check appearance plugin market');
		await until(t, () => t.captureCharFrame().includes('Appearance plugin market: 1 plugin'));
		await runCommand(t, 'Plugin manager');
		await until(t, () => {
			const frame = t.captureCharFrame();
			return (
				frame.includes('Appearance plugins') &&
				frame.includes('Install Contrast 2.0.0') &&
				frame.includes('high contrast icons')
			);
		});
		await press(t, (input) => input.pressEnter());
		await until(
			t,
			() => t.captureCharFrame().includes('Installed appearance plugin contrast 2.0.0'),
			80,
		);
		await until(t, () => existsSync(join(USER_THEME_PLUGIN_DIR, 'contrast/plugin.json')), 80);

		expect(
			JSON.parse(readFileSync(join(USER_THEME_PLUGIN_DIR, 'contrast/plugin.json'), 'utf8')),
		).toEqual(manifest);
	} finally {
		globalThis.fetch = realFetch;
	}
});

test('the appearance plugins page can refresh the market', async () => {
	const realFetch = globalThis.fetch;
	const requested: string[] = [];
	globalThis.fetch = ((url: string) => {
		requested.push(String(url));
		return Promise.resolve(
			new Response(
				JSON.stringify({
					plugins: [{ id: 'contrast', name: 'Contrast', version: '2.0.0' }],
				}),
			),
		);
	}) as typeof fetch;
	try {
		const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {
			pluginRegistry: 'https://example.test/market',
		});
		await runCommand(t, 'Plugin manager');
		await press(t, (input) => input.pressArrow('down'));
		await press(t, (input) => input.pressEnter());
		await until(t, () => {
			const frame = t.captureCharFrame();
			return (
				frame.includes('Appearance plugin market: 1 plugin') &&
				frame.includes('Install Contrast 2.0.0')
			);
		});

		expect(requested).toEqual(['https://example.test/market/index.json']);
	} finally {
		globalThis.fetch = realFetch;
	}
});

test('the appearance plugins page can update every installed plugin', async () => {
	const realFetch = globalThis.fetch;
	const oldManifest = {
		id: 'mono',
		name: 'Mono',
		version: '1.0.0',
		icons: [{ id: 'mono-icons', name: 'Mono Icons', file: 'f', folder: 'd', folderOpen: 'o' }],
	};
	const newManifest = { ...oldManifest, version: '1.1.0' };
	expect(
		writePlugin('mono', {
			ok: true,
			id: 'mono',
			version: '1.0.0',
			body: JSON.stringify(oldManifest),
		}),
	).toBeNull();
	globalThis.fetch = ((url: string) =>
		Promise.resolve(
			String(url).endsWith('/mono/plugin.json')
				? new Response(JSON.stringify(newManifest))
				: new Response(
						JSON.stringify({ plugins: [{ id: 'mono', name: 'Mono', version: '1.1.0' }] }),
					),
		)) as typeof fetch;
	try {
		const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {
			pluginRegistry: 'https://example.test/market',
		});
		await runCommand(t, 'Check appearance plugin market');
		await until(t, () => t.captureCharFrame().includes('Appearance plugin market: 1 plugin'));
		await runCommand(t, 'Plugin manager');
		await until(t, () => t.captureCharFrame().includes('Update all appearance plugins - Mono'));
		await pressEscape(t);
		await runCommand(t, 'Plugin manager');
		await press(t, (input) => void input.typeText('Update all'));
		await press(t, (input) => input.pressEnter());
		await until(t, () => t.captureCharFrame().includes('Updated 1 appearance plugin'));

		expect(
			JSON.parse(readFileSync(join(USER_THEME_PLUGIN_DIR, 'mono/plugin.json'), 'utf8')),
		).toEqual(newManifest);
	} finally {
		globalThis.fetch = realFetch;
	}
});

test('the appearance plugins page toggles startup update checks', async () => {
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), { pluginUpdates: true });
	await runCommand(t, 'Plugin manager');
	await press(t, (input) => void input.typeText('startup'));
	await until(t, () => t.captureCharFrame().includes('Disable startup update checks'));
	await press(t, (input) => input.pressEnter());
	await until(t, () => t.captureCharFrame().includes('Startup update checks disabled'));

	await press(t, (input) => input.pressKey('p', { ctrl: true }));
	await press(t, (input) => void input.typeText('Plugin manager'));
	await press(t, (input) => input.pressEnter());
	await until(t, () => t.captureCharFrame().includes('Enable startup update checks'));
});

test('the appearance plugins page edits the market registry', async () => {
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {
		pluginRegistry: OLD_REGISTRY,
	});
	await runCommand(t, 'Plugin manager');
	await press(t, (input) => void input.typeText('Edit market registry'));
	await press(t, (input) => input.pressEnter());
	await until(t, () => t.captureCharFrame().includes('Appearance plugin registry URL'));

	await press(t, (input) => {
		input.typeText('https://new.example.test/plugins');
	});
	await press(t, (input) => input.pressEnter());
	await until(t, () =>
		t.captureCharFrame().includes('Appearance plugin registry: https://new.example.test/plugins'),
	);

	expect(JSON.parse(readFileSync(testConfigFile(), 'utf8')).pluginRegistry).toBe(
		'https://new.example.test/plugins',
	);
});

test('the appearance plugins page resets an empty market registry to the default', async () => {
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {
		pluginRegistry: OLD_REGISTRY,
	});
	await runCommand(t, 'Plugin manager');
	await press(t, (input) => void input.typeText('Edit market registry'));
	await press(t, (input) => input.pressEnter());
	await until(t, () => t.captureCharFrame().includes('Appearance plugin registry URL'));
	await press(t, (input) => input.pressEnter());
	await until(t, () => t.captureCharFrame().includes(`Appearance plugin registry: ${MARKET_URL}`));
	expect(JSON.parse(readFileSync(testConfigFile(), 'utf8')).pluginRegistry).toBe(MARKET_URL);
});

test('the appearance plugins page rejects non-https market registries', async () => {
	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {
		pluginRegistry: OLD_REGISTRY,
	});
	await runCommand(t, 'Plugin manager');
	await press(t, (input) => void input.typeText('Edit market registry'));
	await press(t, (input) => input.pressEnter());
	await until(t, () => t.captureCharFrame().includes('Appearance plugin registry URL'));
	await press(t, (input) => {
		input.typeText('http://plain.example.test/plugins');
	});
	await press(t, (input) => input.pressEnter());
	await until(t, () =>
		t.captureCharFrame().includes('Appearance plugin registry must be an https URL'),
	);
	expect(existsSync(testConfigFile())).toBe(false);
});

test('the appearance plugins page hides current installed market plugins', async () => {
	const realFetch = globalThis.fetch;
	const manifest = {
		id: 'mono',
		name: 'Mono',
		version: '1.0.0',
		icons: [{ id: 'mono-icons', name: 'Mono Icons', file: 'f', folder: 'd', folderOpen: 'o' }],
	};
	expect(
		writePlugin('mono', {
			ok: true,
			id: 'mono',
			version: '1.0.0',
			body: JSON.stringify(manifest),
		}),
	).toBeNull();
	globalThis.fetch = ((_url: string) =>
		Promise.resolve(
			new Response(
				JSON.stringify({
					plugins: [{ id: 'mono', name: 'Mono', version: '1.0.0', description: 'already present' }],
				}),
			),
		)) as typeof fetch;
	try {
		const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {
			pluginRegistry: 'https://example.test/market',
		});
		await runCommand(t, 'Check appearance plugin market');
		await until(t, () => t.captureCharFrame().includes('Appearance plugin market: 1 plugin'));
		await runCommand(t, 'Plugin manager');
		await until(t, () => t.captureCharFrame().includes('Disable mono 1.0.0'));

		expect(t.captureCharFrame()).not.toContain('Installed Mono 1.0.0');
	} finally {
		globalThis.fetch = realFetch;
	}
});
