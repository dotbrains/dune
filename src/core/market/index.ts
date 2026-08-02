import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { loadIconThemes } from '../iconThemes';
import { loadLocalThemes, USER_THEME_PLUGIN_DIR } from '../localThemes';
import { loadLocalLspServers } from '../plugins/localLspServers';
import { isNewer } from '../update';
import { isThemeName } from '../../themes';
import type { Config } from '../config';

export const MARKET_URL = 'https://dune.dotbrains.dev/plugins/';
export const CATALOG_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const TIMEOUT_MS = 2500;
const MAX_MANIFEST_BYTES = 512 * 1024;
const CACHE_FILE = join(
	process.env.XDG_CACHE_HOME ?? join(process.env.HOME ?? tmpdir(), '.cache'),
	'dune',
	'market.json',
);

export interface MarketEntry {
	id: string;
	name: string;
	version: string;
	description: string;
	provides: {
		themes: string[];
		icons: string[];
		languageServers: string[];
		filetypes: string[];
	};
}

export interface CachedCatalog {
	at: number;
	plugins: MarketEntry[];
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export type FetchedPlugin =
	| { ok: true; id: string; version: string; body: string }
	| { ok: false; error: string };

const isRecord = (raw: unknown): raw is Record<string, unknown> =>
	typeof raw === 'object' && raw !== null && !Array.isArray(raw);

const ids = (raw: unknown): string[] =>
	Array.isArray(raw) ? raw.filter((entry) => typeof entry === 'string' && entry) : [];

function parseEntry(raw: unknown): MarketEntry | null {
	if (!isRecord(raw)) return null;
	const { id, name, version, description } = raw;
	if (typeof id !== 'string' || !/^[\w.-]+$/.test(id)) return null;
	if (typeof version !== 'string' || !version) return null;
	const provides = isRecord(raw.provides) ? raw.provides : {};
	return {
		id,
		name: typeof name === 'string' && name ? name : id,
		version,
		description: typeof description === 'string' ? description : '',
		provides: {
			themes: ids(provides.themes),
			icons: ids(provides.icons),
			languageServers: ids(provides.languageServers),
			filetypes: ids(provides.filetypes),
		},
	};
}

export function parseCatalog(raw: unknown): MarketEntry[] {
	const list = isRecord(raw) && Array.isArray(raw.plugins) ? raw.plugins : [];
	return list.map(parseEntry).filter((entry) => entry !== null);
}

const dir = (registry: string): string => (registry.endsWith('/') ? registry : `${registry}/`);

async function get(url: string, fetcher: Fetcher): Promise<string | null> {
	try {
		const res = await fetcher(url, {
			signal: AbortSignal.timeout(TIMEOUT_MS),
			headers: { accept: 'application/json' },
		});
		if (!res.ok) return null;
		const text = await res.text();
		return text.length > MAX_MANIFEST_BYTES ? null : text;
	} catch {
		return null;
	}
}

export async function fetchCatalog(
	registry = MARKET_URL,
	fetcher: Fetcher = fetch,
): Promise<MarketEntry[] | null> {
	const body = await get(`${dir(registry)}index.json`, fetcher);
	if (body === null) return null;
	try {
		return parseCatalog(JSON.parse(body));
	} catch {
		return null;
	}
}

export function readCachedCatalog(file = CACHE_FILE): CachedCatalog | null {
	try {
		const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
		if (!isRecord(raw) || typeof raw.at !== 'number') return null;
		return { at: raw.at, plugins: parseCatalog(raw) };
	} catch {
		return null;
	}
}

export function writeCachedCatalog(plugins: MarketEntry[], at: number, file = CACHE_FILE): void {
	try {
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, JSON.stringify({ at, plugins }));
	} catch {}
}

export const isStale = (cached: CachedCatalog | null, now: number): boolean =>
	!cached || now - cached.at > CATALOG_MAX_AGE_MS;

async function validateManifest(id: string, body: string): Promise<FetchedPlugin> {
	let raw: unknown;
	try {
		raw = JSON.parse(body);
	} catch (error) {
		return { ok: false, error: `${id} is not valid JSON: ${String(error)}` };
	}
	if (!isRecord(raw) || raw.id !== id) return { ok: false, error: `${id} manifest id mismatch` };
	if (typeof raw.version !== 'string' || !raw.version) {
		return { ok: false, error: `${id} manifest has no version` };
	}
	const root = await mkdtemp(join(tmpdir(), 'dune-plugin-'));
	try {
		const plugin = join(root, id);
		mkdirSync(plugin, { recursive: true });
		writeFileSync(join(plugin, 'plugin.json'), body);
		const color = loadLocalThemes(root, root);
		const icon = loadIconThemes(root, root);
		const lsp = loadLocalLspServers(root, root);
		const problem =
			color.problems[0]?.reason ?? icon.problems[0]?.reason ?? lsp.problems[0]?.reason;
		if (problem) return { ok: false, error: problem };
		if (color.themes.length + icon.themes.length + lsp.servers.length === 0) {
			return { ok: false, error: `${id} does not provide a plugin contribution` };
		}
		return { ok: true, id, version: raw.version, body };
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

export async function fetchPlugin(
	id: string,
	options: { registry?: string; fetcher?: Fetcher } = {},
): Promise<FetchedPlugin> {
	if (!/^[\w.-]+$/.test(id)) return { ok: false, error: `${id} is not a plugin id` };
	const registry = options.registry ?? MARKET_URL;
	const source = `${dir(registry)}${id}/plugin.json`;
	const body = await get(source, options.fetcher ?? fetch);
	return body === null
		? { ok: false, error: `could not fetch ${source}` }
		: validateManifest(id, body);
}

export function pluginDir(id: string, root = USER_THEME_PLUGIN_DIR): string {
	return join(root, id);
}

export function writePlugin(
	id: string,
	fetched: FetchedPlugin,
	root = USER_THEME_PLUGIN_DIR,
): string | null {
	if (!fetched.ok) return fetched.error;
	if (fetched.id !== id) return `${id} manifest id mismatch`;
	const target = pluginDir(id, root);
	try {
		mkdirSync(target, { recursive: true });
		writeFileSync(join(target, 'plugin.json'), fetched.body);
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

export function removeFromDisk(id: string, root = USER_THEME_PLUGIN_DIR): string | null {
	if (!/^[\w.-]+$/.test(id)) return `${id} is not a plugin id`;
	try {
		rmSync(pluginDir(id, root), { recursive: true, force: true });
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

export function updatesFor(
	installed: readonly { id: string; version: string }[],
	catalog: readonly MarketEntry[],
	newer: (latest: string, current: string) => boolean = isNewer,
): MarketEntry[] {
	const versions = new Map(installed.map((plugin) => [plugin.id, plugin.version]));
	return catalog.filter((entry) => {
		const current = versions.get(entry.id);
		return current ? newer(entry.version, current) : false;
	});
}

export function missingConfiguredAppearancePlugins(
	config: Pick<Config, 'theme' | 'themeLight' | 'themeDark' | 'iconTheme'>,
	iconThemes: readonly { id: string }[],
	catalog: readonly MarketEntry[],
): MarketEntry[] {
	const wantedThemes = new Set<string>(
		[config.theme, config.themeLight, config.themeDark].filter((id) => !isThemeName(id)),
	);
	const hasIconTheme =
		config.iconTheme === 'none' ||
		config.iconTheme === 'unicode' ||
		iconThemes.some((theme) => theme.id === config.iconTheme);
	const wantedIcon = hasIconTheme ? null : config.iconTheme;
	const byId = new Map<string, MarketEntry>();
	for (const entry of catalog) {
		if (
			entry.provides.themes.some((id) => wantedThemes.has(id)) ||
			(wantedIcon !== null && entry.provides.icons.includes(wantedIcon))
		) {
			byId.set(entry.id, entry);
		}
	}
	return [...byId.values()];
}
