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
	problems: LocalLspServerProblem[];
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
	return install ? { id: raw.id, command, filetypes, install } : { id: raw.id, command, filetypes };
}

export function loadLocalLspServers(
	rootDir: string,
	userDir = USER_THEME_PLUGIN_DIR,
): LocalLspServerLoad {
	const problems: LocalLspServerProblem[] = [];
	const servers = new Map<string, ServerSpec>();
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
		const entries = isRecord(raw) && Array.isArray(raw.languageServers) ? raw.languageServers : [];
		for (const entry of entries) {
			const server = parseServer(entry);
			if (!server) {
				problems.push({ source, reason: 'invalid language server' });
				continue;
			}
			servers.set(server.id, server);
		}
	}

	return { servers: [...servers.values()], problems };
}
