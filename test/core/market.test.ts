import { expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	fetchCatalog,
	fetchPlugin,
	isStale,
	MARKET_URL,
	parseCatalog,
	readCachedCatalog,
	removeFromDisk,
	updatesFor,
	writeCachedCatalog,
	writePlugin,
} from '../../src/core/market';
import type { Fetcher, MarketEntry } from '../../src/core/market';
import { loadIconThemes } from '../../src/core/iconThemes';
import { loadLocalThemes } from '../../src/core/localThemes';

const REGISTRY = 'https://example.test/plugins/';
const MANIFEST = {
	id: 'mono',
	name: 'Mono',
	version: '1.2.0',
	themes: [
		{
			id: 'mono-dark',
			name: 'Mono Dark',
			ui: {
				bg: '#101010',
				panelBg: '#161616',
				barBg: '#0d0d0d',
				statusBg: '#222222',
				statusFg: '#ffffff',
				text: '#dddddd',
				dim: '#888888',
				faint: '#666666',
				accent: '#79b8ff',
				activeTabFg: '#ffffff',
				inactiveTabFg: '#999999',
				treeSelectedBg: '#244f7a',
				treeFocusBg: '#1d2833',
				dirty: '#f2cc60',
				error: '#ff7b72',
				folder: '#79b8ff',
				cursor: '#ffffff',
				scrollbar: '#333333',
				gutter: '#777777',
				currentLine: '#151515',
				indentGuide: '#262626',
				gitAdded: '#7ee787',
				gitModified: '#f2cc60',
				gitDeleted: '#ff7b72',
			},
			syntax: { comment: { fg: '#888888', italic: true } },
		},
	],
	icons: [{ id: 'mono-icons', name: 'Mono Icons', file: 'f', folder: 'd', folderOpen: 'o' }],
};
const INDEX = {
	plugins: [
		{
			id: 'mono',
			name: 'Mono',
			version: '1.2.0',
			description: 'quiet appearance',
			provides: { themes: ['mono-dark'], icons: ['mono-icons'] },
		},
	],
};

const serving = (bodies: Record<string, unknown>, seen: string[] = []): Fetcher =>
	((url) => {
		seen.push(url);
		const body = bodies[url];
		return Promise.resolve(
			body === undefined
				? new Response('missing', { status: 404 })
				: new Response(typeof body === 'string' ? body : JSON.stringify(body)),
		);
	}) as Fetcher;

const temp = (name: string) => mkdtempSync(join(tmpdir(), `dune-${name}-`));

test('a malformed catalog row is dropped, not fatal', () => {
	const parsed = parseCatalog({
		plugins: [
			{ id: 'ok', version: '1.0.0' },
			{ id: 'no version' },
			{ id: 'sp ace', version: '1.0.0' },
			'not an object',
		],
	});

	expect(parsed).toEqual([
		{
			id: 'ok',
			name: 'ok',
			version: '1.0.0',
			description: '',
			provides: { themes: [], icons: [] },
		},
	]);
});

test('the catalog is read from the registry directory', async () => {
	const seen: string[] = [];
	const catalog = await fetchCatalog(REGISTRY, serving({ [`${REGISTRY}index.json`]: INDEX }, seen));

	expect(seen).toEqual([`${REGISTRY}index.json`]);
	expect(catalog?.map((entry) => entry.id)).toEqual(['mono']);
});

test('a registry that answers with nothing usable leaves no catalog', async () => {
	expect(await fetchCatalog(REGISTRY, serving({}))).toBeNull();
	expect(await fetchCatalog(REGISTRY, serving({ [`${REGISTRY}index.json`]: '{ nope' }))).toBeNull();
});

test('the default registry is an https directory', () => {
	expect(MARKET_URL.startsWith('https://')).toBe(true);
	expect(MARKET_URL.endsWith('/')).toBe(true);
});

test('a manifest is fetched from the plugin directory and validated', async () => {
	const seen: string[] = [];
	const result = await fetchPlugin('mono', {
		registry: REGISTRY,
		fetcher: serving({ [`${REGISTRY}mono/plugin.json`]: MANIFEST }, seen),
	});

	expect(seen).toEqual([`${REGISTRY}mono/plugin.json`]);
	expect(result.ok && result.version).toBe('1.2.0');
});

test('a manifest Dune would reject is refused before install', async () => {
	const results = await Promise.all(
		[
			{ id: 'mono', version: '1.0.0' },
			{ id: 'other', version: '1.0.0', themes: MANIFEST.themes },
			'not json at all',
		].map((body) =>
			fetchPlugin('mono', {
				registry: REGISTRY,
				fetcher: serving({ [`${REGISTRY}mono/plugin.json`]: body }),
			}),
		),
	);
	expect(results.every((result) => !result.ok)).toBe(true);
});

test('a fetched manifest is written where appearance plugin loading finds it', async () => {
	const root = temp('plugins');
	const project = temp('project');
	const fetched = await fetchPlugin('mono', {
		registry: REGISTRY,
		fetcher: serving({ [`${REGISTRY}mono/plugin.json`]: MANIFEST }),
	});

	expect(writePlugin('mono', fetched, root)).toBeNull();
	expect(JSON.parse(readFileSync(join(root, 'mono', 'plugin.json'), 'utf8'))).toEqual(MANIFEST);

	const themes = loadLocalThemes(project, root);
	const icons = loadIconThemes(project, root);
	expect(themes.problems).toEqual([]);
	expect(icons.problems).toEqual([]);
	expect(themes.themes.map((entry) => entry.id)).toEqual(['mono-dark']);
	expect(icons.themes.map((entry) => entry.id)).toEqual(['mono-icons']);

	expect(writePlugin('other', fetched, root)).toBe('other manifest id mismatch');
	expect(removeFromDisk('../outside', root)).toContain('not a plugin id');
	expect(removeFromDisk('mono', root)).toBeNull();
	expect(existsSync(join(root, 'mono'))).toBe(false);
	expect(removeFromDisk('mono', root)).toBeNull();
});

test('the cache survives a round trip and knows when it is old', () => {
	const file = join(temp('cache'), 'market.json');
	expect(readCachedCatalog(file)).toBeNull();
	expect(isStale(null, 1000)).toBe(true);

	writeCachedCatalog(INDEX.plugins as MarketEntry[], 1000, file);
	const cached = readCachedCatalog(file);
	expect(cached?.plugins.map((entry) => entry.id)).toEqual(['mono']);
	expect(isStale(cached, 1000 + 60_000)).toBe(false);
	expect(isStale(cached, 1000 + 7 * 60 * 60 * 1000)).toBe(true);
});

test('only an installed plugin with a lower version is an update', () => {
	const catalog = INDEX.plugins as MarketEntry[];
	expect(updatesFor([{ id: 'mono', version: '1.1.0' }], catalog)).toHaveLength(1);
	expect(updatesFor([{ id: 'mono', version: '1.2.0' }], catalog)).toEqual([]);
	expect(updatesFor([{ id: 'mono', version: '2.0.0' }], catalog)).toEqual([]);
	expect(updatesFor([], catalog)).toEqual([]);
});
