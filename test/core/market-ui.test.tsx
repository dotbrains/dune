import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { writePlugin } from '../../src/core/market';
import { USER_THEME_PLUGIN_DIR } from '../../src/core/localThemes';
import { fixture, launch, press, runCommand, settle, until } from '../helpers';

test('the palette can check the appearance plugin market', async () => {
	const realFetch = globalThis.fetch;
	const requested: string[] = [];
	globalThis.fetch = ((url: string) => {
		requested.push(String(url));
		return Promise.resolve(
			new Response(
				JSON.stringify({
					plugins: [
						{ id: 'mono', version: '1.0.0' },
						{ id: 'contrast', version: '2.0.0' },
					],
				}),
			),
		);
	}) as typeof fetch;
	try {
		const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {
			pluginRegistry: 'https://example.test/market',
		});
		await runCommand(t, 'Check appearance plugin market');
		await until(t, () => t.captureCharFrame().includes('Appearance plugin market: 2 plugins'));

		expect(requested).toEqual(['https://example.test/market/index.json']);
	} finally {
		globalThis.fetch = realFetch;
	}
});

test('the palette can install an appearance plugin by id', async () => {
	const realFetch = globalThis.fetch;
	const manifest = {
		id: 'mono',
		name: 'Mono',
		version: '1.0.0',
		icons: [{ id: 'mono-icons', name: 'Mono Icons', file: 'f', folder: 'd', folderOpen: 'o' }],
	};
	globalThis.fetch = ((url: string) =>
		Promise.resolve(
			String(url).endsWith('/mono/plugin.json')
				? new Response(JSON.stringify(manifest))
				: new Response('missing', { status: 404 }),
		)) as typeof fetch;
	try {
		const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {
			pluginRegistry: 'https://example.test/market',
		});
		await runCommand(t, 'Install appearance plugin');
		await press(t, (input) => void input.typeText('mono'));
		await press(t, (input) => input.pressEnter());
		await until(t, () => t.captureCharFrame().includes('Installed appearance plugin mono 1.0.0'));

		expect(
			JSON.parse(readFileSync(join(USER_THEME_PLUGIN_DIR, 'mono/plugin.json'), 'utf8')),
		).toEqual(manifest);
	} finally {
		globalThis.fetch = realFetch;
	}
});

test('the palette can install an appearance plugin from the market list', async () => {
	const realFetch = globalThis.fetch;
	const manifest = {
		id: 'mono',
		name: 'Mono',
		version: '1.0.0',
		icons: [{ id: 'mono-icons', name: 'Mono Icons', file: 'f', folder: 'd', folderOpen: 'o' }],
	};
	globalThis.fetch = ((url: string) =>
		Promise.resolve(
			String(url).endsWith('/mono/plugin.json')
				? new Response(JSON.stringify(manifest))
				: new Response(
						JSON.stringify({
							plugins: [
								{
									id: 'mono',
									name: 'Mono',
									version: '1.0.0',
									description: 'quiet monochrome icons',
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
		await runCommand(t, 'Install Mono 1.0.0 - quiet monochrome icons');
		await until(t, () => t.captureCharFrame().includes('Installed appearance plugin mono 1.0.0'));

		expect(
			JSON.parse(readFileSync(join(USER_THEME_PLUGIN_DIR, 'mono/plugin.json'), 'utf8')),
		).toEqual(manifest);
	} finally {
		globalThis.fetch = realFetch;
	}
});

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
		return frame.includes('Appearance plugins') && frame.includes('Disable mono 1.0.0');
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
			return frame.includes('Appearance plugins') && frame.includes('Install Contrast 2.0.0');
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

test('the market list labels installed plugin updates', async () => {
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
	const newManifest = { ...manifest, version: '1.1.0' };
	globalThis.fetch = ((url: string) =>
		Promise.resolve(
			String(url).endsWith('/mono/plugin.json')
				? new Response(JSON.stringify(newManifest))
				: new Response(
						JSON.stringify({
							plugins: [{ id: 'mono', name: 'Mono', version: '1.1.0' }],
						}),
					),
		)) as typeof fetch;
	try {
		const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {
			pluginRegistry: 'https://example.test/market',
		});
		await runCommand(t, 'Check appearance plugin market');
		await until(t, () => t.captureCharFrame().includes('Appearance plugin market: 1 plugin'));
		await runCommand(t, 'Update Mono 1.1.0');
		await until(t, () => t.captureCharFrame().includes('Installed appearance plugin mono 1.1.0'));

		expect(
			JSON.parse(readFileSync(join(USER_THEME_PLUGIN_DIR, 'mono/plugin.json'), 'utf8')),
		).toEqual(newManifest);
	} finally {
		globalThis.fetch = realFetch;
	}
});

test('startup reports available appearance plugin updates', async () => {
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
	globalThis.fetch = ((url: string) =>
		Promise.resolve(
			String(url).includes('registry.npmjs.org')
				? new Response(JSON.stringify({ version: '0.0.0' }))
				: new Response(
						JSON.stringify({
							plugins: [{ id: 'mono', name: 'Mono', version: '1.1.0' }],
						}),
					),
		)) as typeof fetch;
	try {
		const t = await launch(
			fixture({ 'a.ts': 'const a = 1\n' }),
			{ pluginRegistry: 'https://example.test/market' },
			{},
			{ checkUpdates: true },
		);
		await until(t, () => t.captureCharFrame().includes('Mono 1.1.0 is available'));
	} finally {
		globalThis.fetch = realFetch;
	}
});

test('startup skips appearance plugin updates when disabled', async () => {
	const realFetch = globalThis.fetch;
	const requested: string[] = [];
	globalThis.fetch = ((url: string) => {
		requested.push(String(url));
		return Promise.resolve(new Response(JSON.stringify({ version: '0.0.0' })));
	}) as typeof fetch;
	try {
		const t = await launch(
			fixture({ 'a.ts': 'const a = 1\n' }),
			{ pluginRegistry: 'https://example.test/market', pluginUpdates: false },
			{},
			{ checkUpdates: true },
		);
		await settle(t, 20);

		expect(requested).toEqual(['https://registry.npmjs.org/dune/latest']);
	} finally {
		globalThis.fetch = realFetch;
	}
});

test('the palette can remove an appearance plugin by id', async () => {
	const manifest = {
		id: 'mono',
		name: 'Mono',
		version: '1.0.0',
		icons: [{ id: 'mono-icons', name: 'Mono Icons', file: 'f', folder: 'd', folderOpen: 'o' }],
	};
	const error = writePlugin('mono', {
		ok: true,
		id: 'mono',
		version: '1.0.0',
		body: JSON.stringify(manifest),
	});
	expect(error).toBeNull();

	const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }));
	await runCommand(t, 'Remove appearance plugin');
	await press(t, (input) => void input.typeText('mono'));
	await press(t, (input) => input.pressEnter());
	await until(t, () => t.captureCharFrame().includes('Removed appearance plugin mono'));

	expect(existsSync(join(USER_THEME_PLUGIN_DIR, 'mono'))).toBe(false);
});

test('the palette can check appearance plugin updates', async () => {
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
	globalThis.fetch = (() =>
		Promise.resolve(
			new Response(
				JSON.stringify({
					plugins: [{ id: 'mono', version: '1.1.0' }],
				}),
			),
		)) as unknown as typeof fetch;
	try {
		const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {
			pluginRegistry: 'https://example.test/market',
		});
		await runCommand(t, 'Check appearance plugin updates');
		await until(t, () => t.captureCharFrame().includes('Appearance plugin updates: mono'));
	} finally {
		globalThis.fetch = realFetch;
	}
});

test('the palette can update appearance plugins', async () => {
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
				: new Response(JSON.stringify({ plugins: [{ id: 'mono', version: '1.1.0' }] })),
		)) as typeof fetch;
	try {
		const t = await launch(fixture({ 'a.ts': 'const a = 1\n' }), {
			pluginRegistry: 'https://example.test/market',
		});
		await runCommand(t, 'Update appearance plugins');
		await until(t, () => t.captureCharFrame().includes('Updated 1 appearance plugin'));

		expect(
			JSON.parse(readFileSync(join(USER_THEME_PLUGIN_DIR, 'mono/plugin.json'), 'utf8')),
		).toEqual(newManifest);
	} finally {
		globalThis.fetch = realFetch;
	}
});
