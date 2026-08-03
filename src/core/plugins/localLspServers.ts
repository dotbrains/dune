import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ServerInstall, ServerSpec } from '../../lsp/servers';
import { PROJECT_CONFIG_DIR } from '../config';
import { USER_THEME_PLUGIN_DIR } from '../localThemes';

export interface LocalLspServerProblem {
	source: string;
	reason: string;
}

export interface LocalLspServerLoad {
	servers: ServerSpec[];
	plugins: LocalLspServerPlugin[];
	problems: LocalLspServerProblem[];
}

export interface LocalLspServerPlugin {
	id: string;
	name: string;
	version: string;
	detail: string;
	source: string;
}

const MANIFEST = 'plugin.json';
const ID = /^[\w.-]+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

function manifestsIn(dir: string): string[] {
	let entries: { name: string; isDir: boolean }[];
	try {
		entries = readdirSync(dir, { withFileTypes: true }).map((entry) => ({
			name: entry.name,
			isDir: entry.isDirectory(),
		}));
	} catch {
		return [];
	}
	return entries
		.filter((entry) =>
			entry.isDir ? true : entry.name.endsWith('.json') && entry.name !== 'index.json',
		)
		.map((entry) => (entry.isDir ? join(dir, entry.name, MANIFEST) : join(dir, entry.name)))
		.toSorted();
}

function strings(raw: unknown): string[] | null {
	if (!Array.isArray(raw)) return null;
	const values = raw.filter((entry) => typeof entry === 'string' && entry.length > 0);
	return values.length === raw.length && values.length > 0 ? values : null;
}

function parseInstall(raw: unknown): ServerInstall | null | undefined {
	if (raw === undefined) return undefined;
	if (!isRecord(raw) || typeof raw.kind !== 'string') return null;
	if (raw.kind === 'npm') {
		const packages = strings(raw.packages);
		return packages ? { kind: 'npm', packages } : null;
	}
	if (raw.kind === 'download') {
		if (typeof raw.url === 'string' && raw.url.length > 0) {
			return { kind: 'download', url: raw.url };
		}
		if (isRecord(raw.urls)) {
			const url = raw.urls[`${process.platform}-${process.arch}`];
			if (typeof url === 'string' && url.length > 0) return { kind: 'download', url };
		}
		if (typeof raw.command === 'string' && raw.command.length > 0) {
			return { kind: 'manual', command: raw.command };
		}
		return null;
	}
	if (raw.kind === 'manual' && typeof raw.command === 'string' && raw.command.length > 0) {
		return { kind: 'manual', command: raw.command };
	}
	return null;
}

function parseServer(raw: unknown): ServerSpec | null {
	if (!isRecord(raw) || typeof raw.id !== 'string' || !ID.test(raw.id)) return null;
	const command = strings(raw.command);
	const filetypes = strings(raw.filetypes);
	const install = parseInstall(raw.install);
	if (!command || !filetypes || install === null) return null;
	const server: ServerSpec = { id: raw.id, command, filetypes };
	if (install) server.install = install;
	if (raw.settings !== undefined) server.settings = raw.settings;
	return server;
}

export function loadLocalLspServers(
	rootDir: string,
	userDir = USER_THEME_PLUGIN_DIR,
): LocalLspServerLoad {
	const problems: LocalLspServerProblem[] = [];
	const servers = new Map<string, ServerSpec>();
	const plugins = new Map<string, LocalLspServerPlugin>();
	const sources = [
		...manifestsIn(userDir),
		...manifestsIn(join(rootDir, PROJECT_CONFIG_DIR, 'plugins')),
	];

	for (const source of sources) {
		if (!existsSync(source)) continue;
		let raw: unknown;
		try {
			raw = JSON.parse(readFileSync(source, 'utf8'));
		} catch (error) {
			problems.push({ source, reason: error instanceof Error ? error.message : String(error) });
			continue;
		}
		if (!isRecord(raw)) continue;
		const entries = Array.isArray(raw.languageServers) ? raw.languageServers : [];
		const pluginServers: string[] = [];
		for (const entry of entries) {
			const server = parseServer(entry);
			if (!server) {
				problems.push({ source, reason: 'invalid language server' });
				continue;
			}
			servers.set(server.id, server);
			pluginServers.push(server.id);
		}
		if (
			pluginServers.length > 0 &&
			typeof raw.id === 'string' &&
			ID.test(raw.id) &&
			typeof raw.version === 'string' &&
			raw.version.length > 0
		) {
			plugins.set(raw.id, {
				id: raw.id,
				name: typeof raw.name === 'string' && raw.name ? raw.name : raw.id,
				version: raw.version,
				detail: `language servers: ${pluginServers.join(', ')}`,
				source,
			});
		}
	}

	return { servers: [...servers.values()], plugins: [...plugins.values()], problems };
}
